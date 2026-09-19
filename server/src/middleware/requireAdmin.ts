import { Response, NextFunction } from 'express';
import { query } from '../db/client';
import { verifyToken } from '../lib/jwt';
import type { AuthRequest } from './auth';

/**
 * Owner-only gate for /api/admin.
 *
 * ADMIN_EMAILS is a comma-separated allowlist, compared lower-cased against
 * `users.email` (addresses are stored lower-case — see the normalising UPDATE
 * in schema.sql). Unset or empty means nobody is an admin, which is the right
 * default for any environment that forgot to set it.
 *
 * ★ This deliberately does NOT sit behind requireAuth. Every failure mode —
 * no cookie, bad token, unknown user, non-admin address — answers with the
 * same plain 404 an unmounted route would give. A 401 would tell an anonymous
 * prober that /api/admin exists and only the key is missing; a 403 would tell
 * a signed-in user the same thing. The one response says nothing.
 */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export interface AdminRequest extends AuthRequest {
  adminEmail?: string;
}

export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
  const notFound = () => { res.status(404).json({ error: 'Not found' }); };

  const allowed = adminEmails();
  if (allowed.size === 0) { notFound(); return; }

  const token = req.cookies?.token as string | undefined;
  if (!token) { notFound(); return; }

  let userId: string;
  try {
    userId = verifyToken(token).userId;
  } catch {
    notFound();
    return;
  }

  try {
    const row = (await query('SELECT email FROM users WHERE id = $1', [userId])).rows[0] as
      | { email: string | null }
      | undefined;
    const email = row?.email?.toLowerCase();
    if (!email || !allowed.has(email)) { notFound(); return; }
    req.userId = userId;
    req.adminEmail = email;
    next();
  } catch (err) {
    next(err);
  }
}
