/**
 * Prerender the public surface into static, crawlable HTML.
 *
 * Runs after `vite build` (client) and `vite build --ssr` (entry-server):
 *   - App routes (/, /about, /privacy, /terms): the real React component is
 *     rendered into a copy of dist/index.html WITH the JS bundle, so the live
 *     SPA boots over it.
 *   - Guides (/guides, /guides/<slug>): standalone static HTML, NO bundle.
 *   - sitemap.xml + robots.txt.
 *
 * Reads guide content from content/guides/*.md (frontmatter + markdown body).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import {
  SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, escapeHtml, absUrl, renderHead, renderSocialTitle,
} from './seo-head.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SSR = path.join(ROOT, 'dist-ssr', 'entry-server.js');
const GUIDES_SRC = path.join(ROOT, 'content', 'guides');

const LANDING_DESC =
  'The Sims 4 Planner that reads your save so you’re never out of date.';

function fail(msg) { console.error(`[prerender] ${msg}`); process.exit(1); }

if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html missing — run `vite build` first.');
if (!fs.existsSync(SSR)) fail('dist-ssr/entry-server.js missing — run `vite build --ssr src/entry-server.tsx --outDir dist-ssr` first.');

const ssr = await import(SSR);
const shell = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

// ── Shared head for standalone guide pages: the app shell's head minus the
// <title> and minus anything that would boot the SPA (module scripts/preloads).
const headInner = shell.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const guideSharedHead = headInner
  .replace(/<title>[\s\S]*?<\/title>/i, '')
  .replace(/<script\b[^>]*\btype=["']module["'][^>]*><\/script>/gi, '')
  .replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, '')
  .trim();

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (p, c) => { mkdir(path.dirname(p)); fs.writeFileSync(p, c); console.log(`[prerender] wrote ${path.relative(ROOT, p)}`); };

// ── App pages: reuse the full shell (keeps bundle → SPA hydrates over it) ──
// socialTitle: what the link-preview card prints under the image. It can be
// shorter than the <title> — the card's image already carries the branding,
// while the <title> keeps its search keywords for Google and the browser tab.
function emitAppPage({ page, file, path: routePath, title, socialTitle, description, jsonLd }) {
  const markup = ssr.renderAppPage(page);
  const headExtras = `${renderSocialTitle(socialTitle ?? title, description)}\n    ${renderHead({ description, path: routePath, jsonLd })}`;
  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>\n    ${headExtras}`)
    .replace(/<div id="root">\s*<\/div>/i, `<div id="root">${markup}</div>`);
  write(path.join(DIST, file), html);
}

const softwareLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'WebApplication',
  operatingSystem: 'Web',
  description: LANDING_DESC,
  url: SITE_URL,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};
const websiteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL };

emitAppPage({ page: 'landing', file: 'p/landing.html', path: '/', title: 'MySaveFile · The Sims 4 Save Planner', socialTitle: 'MySaveFile', description: LANDING_DESC, jsonLd: [websiteLd, softwareLd] });
emitAppPage({ page: 'about', file: 'p/about.html', path: '/about', title: 'About · MySaveFile', description: 'MySaveFile is a free, non-commercial planning companion for The Sims 4 — built by a fan, with an honest note on how it’s made.' });
emitAppPage({ page: 'privacy', file: 'p/privacy.html', path: '/privacy', title: 'Privacy Policy · MySaveFile', description: 'How MySaveFile handles your data. We collect as little as possible; your raw .save file is read in your browser and never uploaded.' });
emitAppPage({ page: 'terms', file: 'p/terms.html', path: '/terms', title: 'Terms of Service · MySaveFile', description: 'The terms for using MySaveFile, a free non-commercial fan project for planning Sims 4 saves.' });

// ── Guides ────────────────────────────────────────────────────────────────
function guidePageHtml({ title, description, headExtra, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${escapeHtml(title)}</title>
    ${renderSocialTitle(title, description)}
    ${headExtra}
    ${guideSharedHead}
  </head>
  <body>${body}</body>
</html>`;
}

function readGuides() {
  if (!fs.existsSync(GUIDES_SRC)) return [];
  return fs.readdirSync(GUIDES_SRC)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(GUIDES_SRC, f), 'utf8');
      const { data, content } = matter(raw);
      const slug = data.slug || f.replace(/\.md$/, '');
      return { file: f, slug, data, content };
    });
}

// Render a guide's markdown body to HTML: strip internal notes, expand :::cta.
function renderBody(content) {
  // Drop everything from the internal "Publishing & SEO notes" heading onward.
  const cut = content.search(/^##\s+Publishing\s*&\s*SEO\s*notes/im);
  let md = cut >= 0 ? content.slice(0, cut) : content;

  // The page renders the <h1> from frontmatter `title`, so strip a leading H1
  // in the body to avoid a duplicate top-level heading. Then trim a trailing
  // horizontal rule left behind when we cut the internal notes.
  md = md.replace(/^\s*#\s+.*(\r?\n)+/, '');
  md = md.replace(/\n-{3,}\s*$/, '').trim();

  // Replace inline `:::cta` markers with placeholders, render, then swap in CTA.
  const ctas = [];
  md = md.replace(/^:::cta\s*$/gim, () => {
    ctas.push(ssr.renderGuideCTA());
    return `\n\n__CTA${ctas.length - 1}__\n\n`;
  });

  let html = marked.parse(md);
  html = html
    .replace(/<p>\s*__CTA(\d+)__\s*<\/p>/g, (_, i) => ctas[Number(i)] ?? '')
    .replace(/__CTA(\d+)__/g, (_, i) => ctas[Number(i)] ?? '');
  return html;
}

// YAML auto-parses `2026-06-03` into a Date (UTC midnight). Normalize any date
// value to a stable YYYY-MM-DD string so output never depends on the build box's
// timezone or locale.
function isoDate(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function toMeta(data, slug) {
  const published = isoDate(data.date_published);
  const updated = isoDate(data.date_updated);
  return {
    title: data.title ?? slug,
    slug,
    metaDescription: data.meta_description ?? '',
    audience: data.audience ?? '',
    datePublished: published,
    dateUpdated: updated || undefined,
    coverImage: data.cover_image ?? undefined,
    coverImageAlt: data.cover_image_alt ?? undefined,
  };
}

const all = readGuides();
const published = all
  .filter((g) => (g.data.status ?? 'draft') === 'published')
  .sort((a, b) => String(b.data.date_published ?? '').localeCompare(String(a.data.date_published ?? '')));

if (all.length - published.length > 0) {
  console.log(`[prerender] skipped ${all.length - published.length} draft guide(s)`);
}

// Individual guide pages
for (const g of published) {
  const meta = toMeta(g.data, g.slug);
  const body = renderBody(g.content);
  const articleMarkup = ssr.renderGuideArticle(meta, body);
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    description: meta.metaDescription,
    image: absUrl(meta.coverImage || DEFAULT_OG_IMAGE),
    datePublished: meta.datePublished,
    dateModified: meta.dateUpdated || meta.datePublished,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: absUrl('/3d-clay-plumbob.svg') },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absUrl(`/guides/${meta.slug}`) },
  };
  const headExtra = renderHead({
    description: meta.metaDescription,
    path: `/guides/${meta.slug}`,
    ogType: 'article',
    image: meta.coverImage,
    imageAlt: meta.coverImageAlt,
    publishedTime: meta.datePublished,
    modifiedTime: meta.dateUpdated || meta.datePublished,
    jsonLd: blogLd,
  });
  write(
    path.join(DIST, 'guides', `${meta.slug}.html`),
    guidePageHtml({ title: `${meta.title} · MySaveFile`, description: meta.metaDescription, headExtra, body: articleMarkup }),
  );
}

// Guides index
{
  const metas = published.map((g) => toMeta(g.data, g.slug));
  const indexMarkup = ssr.renderGuideIndex(metas);
  const title = 'Sims 4 planning guides · MySaveFile';
  const description = 'How-tos and ideas for planning, organizing, and showing off your Sims 4 save.';
  const headExtra = renderHead({ description, path: '/guides' });
  write(path.join(DIST, 'guides', 'index.html'), guidePageHtml({ title, description, headExtra, body: indexMarkup }));
}

// ── sitemap.xml + robots.txt ────────────────────────────────────────────────
const staticUrls = ['/', '/about', '/privacy', '/terms', '/guides'];
const urls = [
  ...staticUrls.map((u) => ({ loc: absUrl(u) })),
  ...published.map((g) => ({
    loc: absUrl(`/guides/${g.slug}`),
    lastmod: (isoDate(g.data.date_updated) || isoDate(g.data.date_published)) || undefined,
  })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
write(path.join(DIST, 'sitemap.xml'), sitemap);
write(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`[prerender] done — ${published.length} guide(s), ${staticUrls.length} app page(s).`);
