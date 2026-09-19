// Renders a showcase's cover to the 1200×630 image social platforms unfurl.
//
// It screenshots the app's OWN /s/<slug>/og page in a headless browser rather
// than redrawing the covers in an image library. That costs a browser, and it
// buys the only thing that matters here: the card a stranger sees on Discord
// is the same cover, from the same code, as the page the link opens. A second
// implementation would have been two designs to keep in step — and the one
// nobody looks at is the one that rots.
//
// Everything here degrades to null rather than throwing. A browser that can't
// launch (a host missing Chromium's system libraries is the classic one) must
// cost the save its custom card, never its page: the caller falls back to the
// site-wide og-default.png.

import type { Browser } from 'puppeteer';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Flat colour and big type both survive q90 at this size, and every platform
// takes JPEG. One format keeps the stored key, the URL and the content type
// telling the same story.
const JPEG_QUALITY = 90;

const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 20_000;
// Chromium idling costs ~100MB. Renders come in bursts (a creator shares a
// link, a few scrapers follow within seconds), so keep it warm briefly and
// then give the memory back.
const IDLE_SHUTDOWN_MS = 5 * 60_000;
// Renders are serialized; past this many waiting, callers get the default card
// instead of queueing behind a stampede.
const MAX_QUEUE_DEPTH = 4;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let queueTail: Promise<unknown> = Promise.resolve();
let waiting = 0;

/** Where the headless browser fetches the frame from. */
function ogOrigin(): string {
  if (process.env.OG_ORIGIN) return process.env.OG_ORIGIN;
  // In production this server serves the SPA itself, so loopback skips DNS,
  // TLS and the CDN in front of us. In dev the SPA lives on the Vite port.
  return process.env.NODE_ENV === 'production'
    ? `http://127.0.0.1:${process.env.PORT ?? 3001}`
    : (process.env.CLIENT_URL ?? 'http://localhost:5173');
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Imported lazily so a host without puppeteer installed still boots and
      // serves every other route.
      const { default: puppeteer } = await import('puppeteer');
      return puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // /dev/shm is tiny in most containers; without this Chromium
          // crashes partway through a render instead of failing to launch.
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--hide-scrollbars',
        ],
      });
    })().catch((err) => {
      browserPromise = null; // let the next request try again
      throw err;
    });
  }
  return browserPromise;
}

function touchIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { void closeBrowser(); }, IDLE_SHUTDOWN_MS);
  idleTimer.unref?.();
}

export async function closeBrowser(): Promise<void> {
  const p = browserPromise;
  browserPromise = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!p) return;
  try { await (await p).close(); } catch { /* already gone */ }
}

/** One render at a time — Chromium's memory is the scarce resource here. */
function enqueue<T>(job: () => Promise<T>): Promise<T | null> {
  if (waiting >= MAX_QUEUE_DEPTH) return Promise.resolve(null);
  waiting++;
  const run = queueTail.then(job, job).finally(() => { waiting--; });
  queueTail = run.catch(() => {}); // a failed render must not poison the chain
  return run;
}

/**
 * Screenshot `/s/<slug>/og` at 1200×630. Returns null when the cover can't be
 * produced for any reason — an unreachable frame, a save that isn't live, a
 * browser that won't start.
 */
export async function renderShowcaseOg(slug: string): Promise<Buffer | null> {
  return enqueue(async () => {
    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch (err) {
      console.error('og render: browser failed to launch', err);
      return null;
    }
    touchIdleTimer();

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: OG_WIDTH, height: OG_HEIGHT, deviceScaleFactor: 1 });
      await page.goto(`${ogOrigin()}/s/${encodeURIComponent(slug)}/og`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });

      // The frame itself says when the webfonts and every crest have painted
      // and the cover's title has finished auto-fitting. Waiting on a network
      // idle instead would shutter mid-fit on a long save name.
      await page.waitForFunction(
        () => {
          const d = document.documentElement.dataset;
          return d.ogReady === '1' || d.ogError === '1';
        },
        { timeout: READY_TIMEOUT_MS },
      );
      const errored = await page.evaluate(() => document.documentElement.dataset.ogError === '1');
      if (errored) return null;

      const frame = await page.$('.sc-ogFrame');
      if (!frame) return null;
      const shot = (await frame.screenshot({ type: 'jpeg', quality: JPEG_QUALITY })) as Buffer;
      return Buffer.from(shot);
    } catch (err) {
      console.error(`og render failed for /s/${slug}`, err);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  });
}
