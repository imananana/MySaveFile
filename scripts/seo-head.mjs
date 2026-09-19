// Build-time SEO <head> helpers. Plain ESM, imported only by prerender.mjs.

export const SITE_URL = 'https://mysavefile.com';
export const SITE_NAME = 'MySaveFile';
// Branded 1200x630 raster fallback for any page without its own cover_image.
// MUST be a JPG/PNG (not SVG) — social scrapers won't render SVG og:images.
// Hand-designed card (2026-09): corner logo, sync/plan/re-sync headline, app
// collage. Supersedes the generated og-default.png, which stays on disk only
// because platforms cached that URL — bump the filename again to bust caches
// (scrapers never refetch an unchanged URL).
export const DEFAULT_OG_IMAGE = '/og-card-v2.png';

export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Resolve a site-relative path (or pass through an absolute URL) to absolute. */
export function absUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path;
  return SITE_URL + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * Build the per-page head fragment (everything except <title>, which the page
 * template owns). Covers description, canonical, Open Graph, Twitter, optional
 * robots, article timestamps, and JSON-LD.
 */
export function renderHead({
  description,
  path,
  ogType = 'website',
  image,
  imageAlt,
  robots,
  publishedTime,
  modifiedTime,
  jsonLd,
}) {
  const url = absUrl(path);
  const img = absUrl(image || DEFAULT_OG_IMAGE);
  const parts = [];

  if (description) parts.push(`<meta name="description" content="${escapeHtml(description)}" />`);
  parts.push(`<link rel="canonical" href="${escapeHtml(url)}" />`);

  parts.push(`<link rel="icon" href="/favicon-logo/favicon.ico" sizes="any" />`);
  parts.push(`<link rel="icon" href="/favicon-logo/favicon.svg" type="image/svg+xml" />`);
  parts.push(`<link rel="icon" type="image/png" sizes="48x48" href="/favicon-logo/favicon-48x48.png" />`);
  parts.push(`<link rel="icon" type="image/png" sizes="32x32" href="/favicon-logo/favicon-32x32.png" />`);
  parts.push(`<link rel="icon" type="image/png" sizes="16x16" href="/favicon-logo/favicon-16x16.png" />`);
  parts.push(`<link rel="apple-touch-icon" href="/favicon-logo/apple-touch-icon.png" />`);
  parts.push(`<link rel="manifest" href="/favicon-logo/site.webmanifest" />`);
  parts.push(`<meta name="theme-color" content="#16a34a" />`);
  if (robots) parts.push(`<meta name="robots" content="${escapeHtml(robots)}" />`);

  parts.push(`<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`);
  parts.push(`<meta property="og:type" content="${escapeHtml(ogType)}" />`);
  parts.push(`<meta property="og:url" content="${escapeHtml(url)}" />`);
  parts.push(`<meta property="og:image" content="${escapeHtml(img)}" />`);
  if (imageAlt) parts.push(`<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />`);
  if (publishedTime) parts.push(`<meta property="article:published_time" content="${escapeHtml(publishedTime)}" />`);
  if (modifiedTime) parts.push(`<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}" />`);

  parts.push(`<meta name="twitter:card" content="summary_large_image" />`);
  parts.push(`<meta name="twitter:image" content="${escapeHtml(img)}" />`);

  const ld = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  for (const obj of ld) {
    // JSON-LD goes in a script tag; only </script> needs neutralizing.
    const json = JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>');
    parts.push(`<script type="application/ld+json">${json}</script>`);
  }

  return parts.join('\n    ');
}

/** og:title / og:description / twitter:title|description need the title too. */
export function renderSocialTitle(title, description) {
  const out = [
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
  ];
  if (description) {
    out.push(`<meta property="og:description" content="${escapeHtml(description)}" />`);
    out.push(`<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  }
  return out.join('\n    ');
}
