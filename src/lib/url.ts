// User-pasted URLs often arrive without a scheme ("patreon.com/foo"); browsers
// then treat them as relative paths and the link breaks. Normalize before
// rendering an anchor.
export function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Validate a user-supplied URL for use in an href. Returns a normalized
 * http(s) URL, or `undefined` for anything unsafe (javascript:, data:, etc.)
 * so the caller renders a non-navigable link instead of an XSS vector.
 * Scheme-less input ("patreon.com/x") is treated as https.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) return undefined;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reduce whatever someone pasted into a Gallery field down to the bare username.
 *
 * A Sims Gallery name is NOT a web address — EA publishes no creator profile
 * page, so the name is only useful typed into the game's own search. The field
 * used to be rendered as a link anyway, which made pasting a URL the apparent
 * "correct" input and left real profiles storing things like
 * "https://@imanistan". Accepting every shape someone might reasonably paste
 * and keeping one canonical @handle fixes that, and heals values already saved.
 */
export function normalizeGalleryId(input: string | null | undefined): string {
  let s = (input ?? '').trim();
  if (!s) return '';
  // A pasted Gallery link carries the username in a query parameter.
  const fromUrl = s.match(/[?&]profile_id=([^&#]+)/i);
  if (fromUrl) {
    try { s = decodeURIComponent(fromUrl[1]); } catch { s = fromUrl[1]; }
  }
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/^@+/, '');
  s = s.split(/[/?#]/)[0];              // drop any path or query that's left
  return s.trim();
}

