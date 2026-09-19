import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { query } from '../db/client';
import { hashPassword, comparePassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { sendEmail, passwordResetEmail, verificationEmail } from '../lib/email';
import { sanitizeUserUrl } from '../lib/safeUrl';
import { warmPhotoFile } from '../lib/photoWarm';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY!;
const R2_SECRET_KEY  = process.env.R2_SECRET_KEY!;
const R2_BUCKET      = process.env.R2_BUCKET!;
const PHOTO_BASE_URL = process.env.VITE_PHOTO_BASE_URL ?? `https://${process.env.R2_PUBLIC_DOMAIN}`;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setAuthCookie(res: Response, userId: string) {
  res.cookie('token', signToken({ userId }), COOKIE_OPTS);
}

// Throttle the credential endpoints per IP (G4). Login blunts password
// brute-forcing; register blunts mass automated signups. These are deliberately
// lenient enough that a normal human — even a forgetful one — won't hit them.
const loginLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }); // 15 attempts / 15 min
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }); // 10 new accounts / hr

/**
 * Addresses are matched and stored lower-case. Postgres compares TEXT exactly,
 * so without this `Iman@x.com` and `iman@x.com` are two accounts — and the one
 * you didn't type can't be signed into or password-reset, because every lookup
 * misses it. Phones capitalise the first letter by default, so this is the
 * likeliest way for someone to be locked out of an account they really have.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// POST /api/auth/register
router.post('/register', registerLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email: rawEmail, password, displayName } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  if (!rawEmail || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const email = normalizeEmail(rawEmail);

  const existing = (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
  if (existing) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);
  await query(
    'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
    [id, email, passwordHash, displayName ?? email.split('@')[0]],
  );

  setAuthCookie(res, id);
  // Fire off a verification email — best-effort, never block signup on it.
  issueEmailVerification(id, email).catch((e) => console.warn('[auth] verification email failed:', e));
  res.status(201).json({ id, email, displayName: displayName ?? email.split('@')[0] });
}));

// POST /api/auth/login
router.post('/login', loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email: rawEmail, password } = req.body as { email?: string; password?: string };
  if (!rawEmail || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = (await query(
    'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
    [normalizeEmail(rawEmail)],
  )).rows[0] as { id: string; email: string; password_hash: string; display_name: string } | undefined;

  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  setAuthCookie(res, user.id);
  res.json({ id: user.id, email: user.email, displayName: user.display_name });
}));

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

// Recovery is throttled in two separate budgets, because the two halves are not
// the same risk and sharing one budget punished the wrong person: asking for a
// reset link twice used up the allowance for OPENING a verification link, and
// the refusal reached the screen looking like an expired link.
//
//   sendLimiter    — anything that puts mail in someone's inbox. Tight: this is
//                    what stops email bombing and enumeration probing.
//   consumeLimiter — opening a link you were sent. Generous: the tokens are 32
//                    random bytes, so this is a backstop, not the defence.
const sendLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const consumeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Issue a fresh email-verification token and send the verify email. Replaces
// any outstanding token for the user. Throws if the send fails.
async function issueEmailVerification(userId: string, email: string): Promise<void> {
  await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await query(
    'INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [nanoid(), userId, sha256(rawToken), expiresAt],
  );
  const verifyUrl = `${CLIENT_URL}/verify-email?token=${rawToken}`;
  const { subject, html, text } = verificationEmail(verifyUrl);
  await sendEmail({ to: email, subject, html, text });
}

// POST /api/auth/forgot — request a password reset link.
// Always responds 200 with the same body regardless of whether the email
// exists, to avoid leaking which addresses have accounts.
router.post('/forgot', sendLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  const genericResponse = { ok: true };

  if (!email || typeof email !== 'string') {
    res.json(genericResponse);
    return;
  }

  // Normalized the same way /login and /register normalize, so this finds the
  // same row they do — whatever case it was typed in.
  const user = (await query(
    'SELECT id, email FROM users WHERE email = $1',
    [normalizeEmail(email)],
  )).rows[0] as { id: string; email: string } | undefined;

  if (user) {
    // Invalidate any outstanding tokens for this user before issuing a new one.
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await query(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [nanoid(), user.id, sha256(rawToken), expiresAt],
    );

    const resetUrl = `${CLIENT_URL}/reset-password?token=${rawToken}`;
    const { subject, html, text } = passwordResetEmail(resetUrl);
    try {
      await sendEmail({ to: user.email, subject, html, text });
    } catch {
      // Swallow send errors so we still return the generic response (no enum),
      // but the error is already logged inside sendEmail.
    }
  }

  res.json(genericResponse);
}));

// GET /api/auth/reset/:token — is this reset token still usable? Lets the reset
// page show an expired state on load instead of after a failed submit. Returns
// only a boolean (never which account it belongs to).
router.get('/reset/:token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const row = (await query(
    `SELECT id FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(token)],
  )).rows[0];
  res.json({ valid: Boolean(row) });
}));

// POST /api/auth/reset — consume a reset token and set a new password.
router.post('/reset', consumeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || !password) {
    res.status(400).json({ error: 'Token and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const row = (await query(
    `SELECT id, user_id FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(token)],
  )).rows[0] as { id: string; user_id: string } | undefined;

  if (!row) {
    res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    return;
  }

  const newHash = await hashPassword(password);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, row.user_id]);
  // Single-use: mark this token used and clear any siblings.
  await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);

  res.json({ ok: true });
}));

// POST /api/auth/verify-email — consume an email-verification token.
router.post('/verify-email', consumeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: 'Token is required' }); return; }

  const row = (await query(
    `SELECT id, user_id FROM email_verification_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [sha256(token)],
  )).rows[0] as { id: string; user_id: string } | undefined;

  if (!row) {
    res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one from your account.' });
    return;
  }

  await query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [row.user_id]);
  await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [row.id]);
  await query('DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);

  res.json({ ok: true });
}));

// POST /api/auth/resend-verification — re-send the verify email to the signed-in
// user, if they're not already verified. Always 200.
router.post('/resend-verification', requireAuth, sendLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = (await query('SELECT email, email_verified FROM users WHERE id = $1', [req.userId])).rows[0] as
    { email: string | null; email_verified: boolean } | undefined;
  if (user?.email && !user.email_verified) {
    try {
      await issueEmailVerification(req.userId!, user.email);
    } catch (e) {
      console.error('[auth] resend verification failed:', e);
    }
  }
  res.json({ ok: true });
}));

// GET /api/auth/me
router.get('/me', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = (await query(
    'SELECT id, email, display_name, creator_name, social_links, profile_photo_url, email_verified FROM users WHERE id = $1',
    [req.userId],
  )).rows[0] as {
    id: string; email: string; display_name: string; creator_name: string | null;
    social_links: Record<string, string>; profile_photo_url: string | null; email_verified: boolean;
  } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const rawFilename = user.profile_photo_url;
  const profilePhotoFilename = rawFilename && !rawFilename.startsWith('http') ? rawFilename : null;
  res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: user.email_verified,
    creatorName: user.creator_name ?? null,
    socialLinks: user.social_links ?? {},
    profilePhotoUrl: rawFilename
      ? (rawFilename.startsWith('http') ? rawFilename : `${PHOTO_BASE_URL}/${rawFilename}`)
      : null,
    profilePhotoFilename,
  });
}));

// PATCH /api/auth/profile
router.patch('/profile', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { displayName, creatorName, socialLinks } = req.body as {
    displayName?: string;
    creatorName?: string | null;
    socialLinks?: Record<string, string>;
  };
  // Social links are rendered as hrefs on the public showcase, so sanitize to
  // http(s) only and drop anything unsafe/empty.
  const cleanLinks: Record<string, string> = {};
  for (const [k, v] of Object.entries(socialLinks ?? {})) {
    const safe = sanitizeUserUrl(v);
    if (safe) cleanLinks[k] = safe;
  }
  await query(
    `UPDATE users SET
      display_name = COALESCE($1, display_name),
      creator_name = $2,
      social_links = $3::jsonb,
      updated_at = NOW()
     WHERE id = $4`,
    [
      displayName?.trim() || null,
      creatorName?.trim() ?? null,
      JSON.stringify(cleanLinks),
      req.userId,
    ],
  );
  res.json({ ok: true });
}));

// GET /api/auth/pack-ownership — returns the user's saved pack ownership
// state. Defaults to the empty-shape blob if the column has never been
// written, so the client always gets a usable object.
router.get('/pack-ownership', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const row = (await query(
    'SELECT pack_ownership FROM users WHERE id = $1',
    [req.userId],
  )).rows[0] as { pack_ownership: unknown } | undefined;
  res.json(row?.pack_ownership ?? { manualOverrides: {}, autoDetected: [], lastDetectedAt: null });
}));

// PUT /api/auth/pack-ownership — replaces the user's pack ownership blob.
// Body should match the partialize shape from usePackOwnership.ts:
//   { manualOverrides: {...}, autoDetected: [...], lastDetectedAt: "..." }
router.put('/pack-ownership', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    manualOverrides?: Record<string, 'on' | 'off'>;
    autoDetected?: string[];
    lastDetectedAt?: string | null;
  };
  const sanitized = {
    manualOverrides: body.manualOverrides && typeof body.manualOverrides === 'object' ? body.manualOverrides : {},
    autoDetected: Array.isArray(body.autoDetected) ? body.autoDetected.filter((s) => typeof s === 'string') : [],
    lastDetectedAt: typeof body.lastDetectedAt === 'string' ? body.lastDetectedAt : null,
  };
  await query(
    'UPDATE users SET pack_ownership = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(sanitized), req.userId],
  );
  res.json({ ok: true });
}));

// POST /api/auth/password
router.post('/password', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const user = (await query('SELECT password_hash FROM users WHERE id = $1', [req.userId])).rows[0] as
    { password_hash: string | null } | undefined;

  if (!user?.password_hash) {
    res.status(400).json({ error: 'No password set on this account (Google login)' });
    return;
  }

  const valid = await comparePassword(currentPassword, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.userId]);
  res.json({ ok: true });
}));

// POST /api/auth/profile-photo
router.post(
  '/profile-photo',
  requireAuth,
  avatarUpload.single('photo'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const ext = req.file.originalname.split('.').pop() ?? 'jpg';
    const filename = `avatars/${nanoid()}.${ext}`;

    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: filename,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Delete old avatar from R2 if there was one
    const old = (await query('SELECT profile_photo_url FROM users WHERE id = $1', [req.userId])).rows[0] as
      { profile_photo_url: string | null } | undefined;
    if (old?.profile_photo_url) {
      // stored value may be a filename or a legacy full URL
      const oldKey = old.profile_photo_url.startsWith('http')
        ? old.profile_photo_url.split('/').slice(-2).join('/')
        : old.profile_photo_url;
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: oldKey })).catch(() => {});
    }

    // Store filename only; URL is reconstructed at response time
    await query('UPDATE users SET profile_photo_url = $1, updated_at = NOW() WHERE id = $2', [filename, req.userId]);
    // The avatar renders large on showcases — make the CDN's sized copies now.
    warmPhotoFile(filename);
    res.json({ profilePhotoUrl: `${PHOTO_BASE_URL}/${filename}`, profilePhotoFilename: filename });
  }),
);

// Google OAuth
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile: Profile, done) => {
        try {
          const googleId = profile.id;
          const rawEmail = profile.emails?.[0]?.value;
          // Same normalization as the password paths, so signing in with Google
          // joins the account you already have instead of making a second one.
          const email = rawEmail ? normalizeEmail(rawEmail) : null;
          const displayName = profile.displayName ?? email ?? 'Google User';

          let user = (await query('SELECT id FROM users WHERE google_id = $1', [googleId])).rows[0] as { id: string } | undefined;

          if (!user && email) {
            user = (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0] as { id: string } | undefined;
            if (user) {
              await query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
            }
          }

          if (!user) {
            const id = nanoid();
            await query(
              'INSERT INTO users (id, email, google_id, display_name, email_verified) VALUES ($1, $2, $3, $4, TRUE)',
              [id, email, googleId, displayName],
            );
            user = { id };
          }

          done(null, { id: user.id });
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));

  router.get('/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

  router.get(
    '/google/callback',
    passport.authenticate('google', { session: true, failureRedirect: '/login?error=google' }),
    (req: Request, res: Response) => {
      const user = req.user as { id: string };
      setAuthCookie(res, user.id);
      res.redirect(process.env.CLIENT_URL ?? 'http://localhost:5173');
    },
  );
}

export default router;
