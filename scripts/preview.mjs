/**
 * Local review server for the prerendered public site. Zero dependencies (uses
 * only Node built-ins) and no database — it mirrors the production static-
 * serving routes from server/src/index.ts against the dist/ output.
 *
 *   npm run prerender   # build dist/ first
 *   node scripts/preview.mjs
 *   → http://localhost:4599
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 4599;

if (!fs.existsSync(path.join(DIST, 'p', 'landing.html'))) {
  console.error('dist/ not prerendered yet — run `npm run prerender` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const send = (res, file) => {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
};
const safe = (file) => file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile();

const ROUTES = {
  '/': 'p/landing.html', '/about': 'p/about.html', '/privacy': 'p/privacy.html',
  '/terms': 'p/terms.html', '/guides': 'guides/index.html',
};

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname).replace(/\/$/, '') || '/';

  // Explicit prerendered public pages
  if (ROUTES[pathname]) return send(res, path.join(DIST, ROUTES[pathname]));

  // Individual guides
  const guide = pathname.match(/^\/guides\/([a-z0-9-]+)$/i);
  if (guide) {
    const file = path.join(DIST, 'guides', `${guide[1]}.html`);
    if (safe(file)) return send(res, file);
  }

  // Static asset (JS/CSS/images, robots.txt, sitemap.xml)
  const asset = path.join(DIST, pathname);
  if (safe(asset)) return send(res, asset);

  // Everything else → the SPA shell (this is the empty #root app shell)
  send(res, path.join(DIST, 'index.html'));
}).listen(PORT, () => {
  console.log(`Preview running → http://localhost:${PORT}`);
  console.log('  /                                      (prerendered landing)');
  console.log('  /guides                                (guides index)');
  console.log('  /guides/how-to-share-sims-4-save-file  (the guide)');
  console.log('  /about  /privacy  /terms               (prerendered app pages)');
  console.log('Ctrl-C to stop.');
});
