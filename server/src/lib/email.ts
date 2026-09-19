/**
 * Transactional email via Resend. Gated on RESEND_API_KEY: when it's unset
 * (local dev), we log the email to the console instead of sending — so the
 * reset flow is fully testable without an account or network.
 *
 * Env:
 *   RESEND_API_KEY   — enables real sending
 *   EMAIL_FROM       — verified sender, e.g. "MySaveFile <noreply@yourdomain>"
 *   CLIENT_URL       — used by callers to build links
 *
 * ★ The product is MySaveFile. The pre-rebrand name survived in here long
 * after every screen had moved on, because nothing in the app renders these
 * templates — the only way to see one is to receive it, so a stale name sat
 * in front of every new user and nobody's eye ever passed over it. If you add
 * an email, the name is MySaveFile; "The Sims 4 Save Planner" is the tagline
 * and only ever appears after it.
 */
import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? 'MySaveFile <onboarding@resend.dev>';

const resend = API_KEY ? new Resend(API_KEY) : null;

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  if (!resend) {
    // Dev fallback: no provider configured. Log enough to follow the flow.
    console.log(`\n[email:dev] would send to ${to}\n  subject: ${subject}\n  text:\n${text}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
  if (error) {
    // Don't leak provider internals to the caller; log and rethrow a generic error.
    console.error('[email] send failed:', error);
    throw new Error('Email send failed');
  }
}

/** Branded email-verification message. `verifyUrl` carries the raw token. */
export function verificationEmail(verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Verify your MySaveFile email';
  const text =
    `Welcome to MySaveFile! Please confirm this email address.\n\n` +
    `Verify here (link expires in 24 hours):\n${verifyUrl}\n\n` +
    `If you didn't create a MySaveFile account, you can ignore this email.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2c2640;">
    <h1 style="font-size:20px;margin:0 0 16px;">Verify your email</h1>
    <p style="font-size:14px;line-height:1.6;color:#5a5470;">
      Welcome to MySaveFile! Please confirm this is your email address.
    </p>
    <p style="margin:24px 0;">
      <a href="${verifyUrl}"
         style="background:#7c5cbf;color:#fff;text-decoration:none;font-weight:600;
                padding:11px 20px;border-radius:10px;display:inline-block;font-size:14px;">
        Verify email
      </a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#8a849c;">
      This link expires in 24 hours. If you didn't create a MySaveFile account,
      you can safely ignore this email.
    </p>
    <p style="font-size:12px;color:#8a849c;word-break:break-all;">
      Or paste this link: ${verifyUrl}
    </p>
  </div>`;
  return { subject, html, text };
}

/** Branded password-reset email. `resetUrl` carries the raw single-use token. */
export function passwordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Reset your MySaveFile password';
  const text =
    `Someone (hopefully you) asked to reset your MySaveFile password.\n\n` +
    `Reset it here (link expires in 1 hour):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2c2640;">
    <h1 style="font-size:20px;margin:0 0 16px;">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#5a5470;">
      Someone (hopefully you) asked to reset your MySaveFile password.
    </p>
    <p style="margin:24px 0;">
      <a href="${resetUrl}"
         style="background:#7c5cbf;color:#fff;text-decoration:none;font-weight:600;
                padding:11px 20px;border-radius:10px;display:inline-block;font-size:14px;">
        Reset password
      </a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#8a849c;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore
      this email — your password won't change.
    </p>
    <p style="font-size:12px;color:#8a849c;word-break:break-all;">
      Or paste this link: ${resetUrl}
    </p>
  </div>`;
  return { subject, html, text };
}
