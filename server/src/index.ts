// Sentry init must come BEFORE any other imports so http/express auto-instrument.
import './instrument';
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express, { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import fs from 'fs';
import path from 'path';
import { pool } from './db/client';

import authRouter from './routes/auth';
import saveFilesRouter from './routes/saveFiles';
import lotsRouter from './routes/lots';
import householdsRouter from './routes/households';
import simsRouter from './routes/sims';
import relationshipsRouter from './routes/relationships';
import clubsRouter from './routes/clubs';
import smallBusinessesRouter from './routes/smallBusinesses';
import holidaysRouter from './routes/holidays';
import dynastiesRouter from './routes/dynasties';
import customVenuesRouter from './routes/customVenues';
import customVenuePresetsRouter from './routes/customVenuePresets';
import modsRouter from './routes/mods';
import photosRouter from './routes/photos';
import publicRouter from './routes/public';
import adminRouter from './routes/admin';
import importEventsRouter from './routes/importEvents';
import featureEventsRouter from './routes/featureEvents';
import { startTrashCleanup } from './lib/trashCleanup';
import { warmAllLiveShowcasesSoon } from './lib/photoWarm';
import { rateLimit } from './middleware/rateLimit';
import { stripNullBytesBody } from './middleware/stripNullBytes';
import { ogSubjectForSlug, getOrRenderOgImage, OG_CONTENT_TYPE } from './lib/ogCover';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

// Trust the first proxy hop (Railway / any reverse proxy in front) so req.ip
// reflects the real client from X-Forwarded-For. Without this, per-IP rate
// limiting would bucket every user under the proxy's IP.
app.set('trust proxy', 1);

// Gzip everything text-shaped on the way out. Nothing was compressed before
// this: the main JS bundle left the server at its full 1,040KB, where gzip puts
// it at 294KB — a 72% cut on the largest thing any visitor downloads, and the
// same again on JSON responses like the photo list.
//
// First, so it wraps every route below it, including express.static. Images,
// video and anything already compressed are skipped by the default filter —
// re-compressing a JPEG costs CPU and grows the file.
app.use(compression());

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
// Postgres rejects NUL in text ("invalid byte sequence for encoding UTF8:
// 0x00"), and non-English saves can carry NULs in parsed strings — which
// silently dropped sims or killed imports midway (first hit: a Russian save).
// Scrub every incoming string once, here, instead of in every route.
app.use(stripNullBytesBody);
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 5 * 60 * 1000 },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRouter);
app.use('/api/save-files', saveFilesRouter);
app.use('/api/save-files/:id/lots', lotsRouter);
app.use('/api/save-files/:id/households', householdsRouter);
app.use('/api/save-files/:id/sims', simsRouter);
app.use('/api/save-files/:id/relationships', relationshipsRouter);
app.use('/api/save-files/:id/clubs', clubsRouter);
app.use('/api/save-files/:id/small-businesses', smallBusinessesRouter);
app.use('/api/save-files/:id/holidays', holidaysRouter);
app.use('/api/save-files/:id/dynasties', dynastiesRouter);
app.use('/api/save-files/:id/custom-venues', customVenuesRouter);
app.use('/api/save-files/:id/custom-venue-presets', customVenuePresetsRouter);
app.use('/api/mods', modsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/public', publicRouter);
// Owner-only. Gated inside the router; non-admins get a plain 404 from it.
app.use('/api/admin', adminRouter);
// Written by the browser at the end of every import/re-sync attempt.
app.use('/api/import-events', importEventsRouter);
// Daily tally for the few actions the database can't infer on its own.
app.use('/api/feature-events', featureEventsRouter);

// GET /og/s/<slug>.jpg — the social card for a showcase: its chosen cover,
// rendered at the 1200×630 every platform unfurls. Served here rather than
// straight off R2 so the FIRST person to paste a brand-new link still gets a
// real card (it renders on demand) instead of a 404 that Discord would then
// cache. Anything that can't be rendered falls back to the branded default,
// so a link always unfurls as something.
//
// The ?v= the page's meta tag carries is the cover's fingerprint. When it
// matches what we'd render now, the image at this URL can never change, so it
// is safe to cache hard — the URL itself moves when the cover does.
app.get('/og/s/:file', rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }), async (req: Request, res: Response) => {
  const slug = String(req.params.file).replace(/\.jpe?g$/i, '');
  const fallback = () => {
    res.set('Cache-Control', 'public, max-age=300');
    res.redirect(302, '/og-card-v2.png');
  };
  try {
    const subject = await ogSubjectForSlug(slug);
    if (!subject) { fallback(); return; }
    const image = await getOrRenderOgImage(subject);
    if (!image) { fallback(); return; }
    res.set('Content-Type', OG_CONTENT_TYPE);
    res.set('Cache-Control', req.query.v === subject.fingerprint
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=600');
    res.send(image);
  } catch (err) {
    console.error('og cover request failed:', err);
    fallback();
  }
});

// Sentry's Express error handler must come AFTER all routes and BEFORE our own
// error handler — it sees the unhandled error, reports it to Sentry, then
// passes it through to the response handler below.
Sentry.setupExpressErrorHandler(app);

// Global error handler — catches anything forwarded via next(err)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode
    ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../dist');

  // index:false so the prerendered landing (not the empty SPA shell) wins for
  // `/`. redirect:false so static doesn't 301 `/guides` → `/guides/` (the
  // dist/guides directory) before our explicit route runs. Static assets,
  // sitemap.xml and robots.txt still serve.
  app.use(express.static(distPath, { index: false, redirect: false }));

  // Prerendered, crawlable public pages (built by scripts/prerender.mjs). These
  // must come BEFORE the SPA catch-all. App pages still carry the JS bundle, so
  // the live SPA boots over them; guide pages are standalone static HTML.
  const sendFile = (file: string) => (_req: Request, res: Response) =>
    res.sendFile(path.join(distPath, file));
  app.get('/', sendFile('p/landing.html'));
  app.get('/about', sendFile('p/about.html'));
  app.get('/privacy', sendFile('p/privacy.html'));
  app.get('/terms', sendFile('p/terms.html'));
  app.get('/guides', sendFile('guides/index.html'));
  app.get('/guides/:slug', (req: Request, res: Response, next: NextFunction) => {
    const { slug } = req.params;
    if (!/^[a-z0-9-]+$/i.test(slug)) return next(); // drafts / unknown → SPA
    const file = path.join(distPath, 'guides', `${slug}.html`);
    fs.access(file, fs.constants.R_OK, (err) => (err ? next() : res.sendFile(file)));
  });

  // Showcase links: the SPA shell with og tags baked in, so Discord/Tumblr/
  // iMessage (which run no JS) unfurl the save. Locked copy: og:description
  // is "A Sims 4 save file by <creator>." and nothing else — counts live on
  // the cover image, not in text. theme-color paints Discord's card stripe.
  // Old slugs 301 to the current one; not-live and never-existed fall through
  // to the plain shell IDENTICALLY (the SPA renders "No showcase here!").
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  app.get('/s/:slug', async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const subject = await ogSubjectForSlug(slug);
      if (!subject) {
        const old = (await pool.query(
          `SELECT sf.showcase_slug FROM showcase_slugs ss
           JOIN save_files sf ON sf.id = ss.save_file_id
           WHERE ss.slug = $1 AND sf.deleted_at IS NULL AND sf.showcase_live = TRUE`,
          [slug],
        )).rows[0];
        if (old?.showcase_slug) { res.redirect(301, `/s/${old.showcase_slug}`); return; }
        res.send(indexHtml);
        return;
      }
      const title = escapeHtml(subject.name);
      const desc = `A Sims 4 save file by ${escapeHtml(subject.creatorName || 'a MySaveFile creator')}.`;
      const slugPath = encodeURIComponent(subject.slug);
      const url = `https://mysavefile.com/s/${slugPath}`;
      // The card is the creator's chosen cover, drawn at 1200×630. ?v= is the
      // cover's fingerprint: it moves whenever the art does, which is the only
      // thing that makes Discord and iMessage refetch a card they've cached.
      const image = `https://mysavefile.com/og/s/${slugPath}.jpg?v=${subject.fingerprint}`;
      const tags = [
        `<title>${title} — MySaveFile</title>`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${desc}">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:image" content="${image}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="theme-color" content="#16a34a">`,
      ].join('\n    ');
      // Replace the shell's own <title> so the two never both render.
      res.send(indexHtml.replace(/<title>.*?<\/title>/s, tags));
    } catch (err) {
      console.error('showcase og injection failed:', err);
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });

  // Everything else → the SPA shell.
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

async function start() {
  const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema ready');

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Retention sweep for soft-deleted saves (auto-backups 7d, deleted 30d).
  startTrashCleanup();

  // Pre-warm the photo CDN for every live showcase — a deploy restarts the
  // server, and a deploy is exactly when the requested photo sizes can
  // change, which would otherwise make the next visitor wait on resizes.
  warmAllLiveShowcasesSoon();
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
