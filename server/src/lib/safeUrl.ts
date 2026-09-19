/**
 * Normalize + validate a user-supplied URL before storing it. Returns a safe
 * http(s) URL string, or null when empty/invalid. Mirrors the client-side
 * safeHref() so the database never holds a javascript:/data: URL that could
 * become an href XSS if it ever bypassed client-side rendering. Scheme-less
 * input ("patreon.com/x") is normalized to https.
 */
export function sanitizeUserUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return candidate;
  } catch {
    return null;
  }
}
