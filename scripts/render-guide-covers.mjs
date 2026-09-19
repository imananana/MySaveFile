/**
 * One-off: render social/OG cover images from the HTML templates in this folder.
 *
 *   node scripts/render-guide-covers.mjs
 *
 * Two jobs:
 *   1) Per-guide covers (guide-cover-template.html) -> public/guides/<slug>.jpg
 *      For each PUBLISHED guide that has a screenshot in scripts/guide-cover-shots/<slug>.*,
 *      swap in the title, the audience pill, and the screenshot, then capture the
 *      .cover element to a JPEG (photographic -> JPEG keeps it well under ~1MB).
 *      Also writes cover_image + cover_image_alt back into the guide's frontmatter.
 *   2) Site-wide default OG card (default-og-cover.html) -> public/og-default.png
 *      Flat brand graphic -> PNG (crisp text, compresses small). This is the
 *      DEFAULT_OG_IMAGE fallback, so no published page is ever "coverless".
 *
 * Drop a screenshot per guide (named by slug, e.g. how-to-share-sims-4-save-file.png)
 * into scripts/guide-cover-shots/, then run this script. Requires puppeteer
 * (devDependency) — it bundles its own Chromium on `npm install`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GUIDES_DIR = path.join(ROOT, 'content', 'guides');
const SHOTS_DIR = path.join(__dirname, 'guide-cover-shots');
const OUT_GUIDES = path.join(ROOT, 'public', 'guides');
const OUT_DEFAULT = path.join(ROOT, 'public', 'og-default.png');

const COVER_W = 1200;
const COVER_H = 630;
const JPEG_QUALITY = 82;
const SHOT_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const fileToDataUri = (file) => {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};

// Map frontmatter `audience` to the pill label.
const audienceToPill = (a) => {
  const v = String(a || '').toLowerCase();
  if (v.includes('build')) return 'For Builders';
  if (v.includes('player')) return 'For Players';
  return 'Guide';
};

// Find scripts/guide-cover-shots/<slug>.(png|jpg|jpeg|webp), if any.
const findShot = (slug) => {
  for (const ext of SHOT_EXTS) {
    const p = path.join(SHOTS_DIR, slug + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// Pull the authored alt from frontmatter — supports an active `cover_image_alt:`
// or a commented `# cover_image_alt:` line in the publishing notes. Falls back to
// the title (never the slug/filename) so alt is always meaningful.
const altFromFrontmatter = (raw, data, title) => {
  if (data.cover_image_alt) return String(data.cover_image_alt);
  const m = raw.match(/^#?\s*cover_image_alt:\s*(.+?)\s*$/m);
  if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  return title;
};

// Surgically set cover_image + cover_image_alt in a guide's frontmatter without
// disturbing the rest (gray-matter's stringify would drop comments / reorder keys).
const writeCoverFrontmatter = (file, raw, coverPath, alt) => {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) throw new Error(`No frontmatter block in ${file}`);
  const lines = fm[1].split(/\r?\n/)
    .filter((l) => !/^#?\s*cover_image(_alt)?\s*:/.test(l)); // drop existing/commented
  lines.push(`cover_image: ${coverPath}`);
  lines.push(`cover_image_alt: ${JSON.stringify(alt)}`);
  const rebuilt = `---\n${lines.join('\n')}\n---`;
  fs.writeFileSync(file, raw.replace(fm[0], rebuilt));
};

async function main() {
  const plumbobDataUri = fileToDataUri(path.join(ROOT, 'public', '3d-clay-plumbob.svg'));
  const guideTpl = fs.readFileSync(path.join(__dirname, 'guide-cover-template.html'), 'utf8')
    .replaceAll('PLUMBOB_DATA_URI', plumbobDataUri);
  const defaultTpl = fs.readFileSync(path.join(__dirname, 'default-og-cover.html'), 'utf8')
    .replaceAll('PLUMBOB_DATA_URI', plumbobDataUri);

  fs.mkdirSync(OUT_GUIDES, { recursive: true });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: COVER_W, height: COVER_H, deviceScaleFactor: 1 });

  // Capture the .cover element of the currently-loaded HTML.
  const captureCover = async (out, opts) => {
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('.cover');
    await el.screenshot({ path: out, ...opts });
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`  -> ${path.relative(ROOT, out)} (${kb} KB)`);
    if (kb > 1024) console.warn(`     WARNING: ${path.basename(out)} is over 1 MB`);
  };

  // ---- Job 2 first: the site-wide default OG card (always produced) ----
  console.log('Default OG card:');
  await page.setContent(defaultTpl, { waitUntil: 'load' });
  await captureCover(OUT_DEFAULT, { type: 'png' });

  // ---- Job 1: per-guide covers ----
  const files = fs.existsSync(GUIDES_DIR)
    ? fs.readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'))
    : [];
  let rendered = 0;
  let skipped = [];

  console.log('\nGuide covers:');
  for (const f of files) {
    const file = path.join(GUIDES_DIR, f);
    const raw = fs.readFileSync(file, 'utf8');
    const { data } = matter(raw);
    if (String(data.status).toLowerCase() !== 'published') continue;

    const slug = data.slug || f.replace(/\.md$/, '');
    const shot = findShot(slug);
    if (!shot) {
      skipped.push(slug);
      continue; // coverless guides fall back to the branded default OG card
    }

    const title = String(data.title || slug);
    const pill = audienceToPill(data.audience);
    const alt = altFromFrontmatter(raw, data, title);
    const shotUri = fileToDataUri(shot);

    const html = guideTpl
      .replace(/<h1 class="title">[\s\S]*?<\/h1>/, `<h1 class="title">${escapeHtml(title)}</h1>`)
      .replace(/<div class="pill">[\s\S]*?<\/div>/, `<div class="pill"><span class="dot"></span>${escapeHtml(pill)}</div>`)
      .replace(/<div class="shot-placeholder">[\s\S]*?<\/div>/, `<img class="shot-img" src="${shotUri}" alt="">`);

    await page.setContent(html, { waitUntil: 'load' });
    const out = path.join(OUT_GUIDES, `${slug}.jpg`);
    console.log(`${slug} (${pill}, shot: ${path.basename(shot)})`);
    await captureCover(out, { type: 'jpeg', quality: JPEG_QUALITY });

    writeCoverFrontmatter(file, raw, `/guides/${slug}.jpg`, alt);
    console.log(`  -> set cover_image + cover_image_alt: ${JSON.stringify(alt)}`);
    rendered++;
  }

  await browser.close();

  console.log(`\nDone. ${rendered} guide cover(s) rendered; default OG card written.`);
  if (skipped.length) {
    console.log(`No screenshot (using default OG card): ${skipped.join(', ')}`);
    console.log(`  Drop scripts/guide-cover-shots/<slug>.png and re-run to give them a custom cover.`);
  }
}

// Minimal HTML escaping for text injected into the template.
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

main().catch((err) => { console.error(err); process.exit(1); });
