#!/usr/bin/env node
/**
 * Headless driver for the running dev app.
 *
 * Boots puppeteer against http://localhost:5173 with a hand-minted JWT so the
 * app is already signed in, then runs whatever you hand it. Use it to SEE what
 * you built and to prove behaviour before showing the user.
 *
 *   node scripts/selftest/drive.mjs shot /photos pool
 *   node scripts/selftest/drive.mjs shot "/world/Newcrest/inspo" wi --h 1000
 *   node scripts/selftest/drive.mjs repl ./my-script.mjs
 *
 * `repl` loads an ES module that default-exports `async ({ page, api, ui, shot,
 * wait, SAVE }) => {...}` — that's the escape hatch for anything bespoke.
 *
 * ── DATA SAFETY ────────────────────────────────────────────────────────────
 * The local dev DB is DISPOSABLE test data — drive mutating flows freely. Just
 * SAY what you changed, and ask first before anything bulk or destructive.
 *
 * (This note used to claim the dev DB held the user's real save, which sent
 * sessions into snapshot-and-restore ceremony around every click. It doesn't;
 * CLAUDE.md has always said so. `api.snapshot` is still here and still the
 * right tool when you actually want to PROVE a flow left no trace.)
 *
 * Production is a different matter entirely.
 */
import puppeteer from 'puppeteer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── config ───────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const OUT = process.env.SELFTEST_OUT ?? path.join(ROOT, '.selftest');
const BASE = process.env.SELFTEST_BASE ?? 'http://localhost:5173';
export const USER = process.env.SELFTEST_USER ?? '3m9rK3fYlEgKkOVBIK-th';
/**
 * Named saves to test against. Override with SELFTEST_SAVE=<id or key>.
 *
 *   populated — the everyday one. Fully planned, photos, tags, custom venues.
 *   fresh     — one sim (Claude Claudino) on one lot. Use for EMPTY STATES,
 *               first-run paths, and anything an arriving user would see; the
 *               populated save can't show you any of that.
 *   big       — a large community save, for layout under real volume.
 */
export const SAVES = {
  populated: 'a5ORYDy2RKr5SqLh4yV6C',   // "Sync Test Save"
  fresh:     'b8U3rcUNUEsYem-5BQBM3',   // "Claude Fresh Save"
  big:       'gsGQswk7QWKzLz0hu8T5E',   // "beyond bloom | aneleya"
};
const requested = process.env.SELFTEST_SAVE ?? 'populated';
export const SAVE = SAVES[requested] ?? requested;

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const env = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8');
  const m = env.match(/^JWT_SECRET=(.+)$/m);
  if (!m) throw new Error('JWT_SECRET not found in server/.env');
  return m[1].trim();
}

function mintToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ userId: USER, iat: now, exp: now + 86400 });
  const sig = crypto.createHmac('sha256', jwtSecret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── boot ─────────────────────────────────────────────────────────────────────
export async function open({ w = 1440, h = 900, scale = 2 } = {}) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  await page.setCookie({ name: 'token', value: mintToken(), domain: 'localhost', path: '/' });
  fs.mkdirSync(OUT, { recursive: true });

  // Surface page-side failures instead of swallowing them — a React error
  // boundary renders a blank card and the screenshot looks merely "empty".
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });

  /** Go to an app route. Pass the path AFTER /saves/:id — e.g. '/photos'. */
  const go = async (route) => {
    const url = route.startsWith('http') ? route : `${BASE}/saves/${SAVE}${route}`;
    await page.goto(url, { waitUntil: 'networkidle2' });
    await wait(2200);            // the app hydrates + fetches after networkidle
  };

  const shot = async (name, clip) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
    console.log('  shot →', file);
    return file;
  };

  // ── UI helpers. Every one is SCOPED — an unscoped text match will happily
  //    click something in the sidebar or a tile behind an open modal. ────────
  const ui = {
    /** Click the first button whose visible text matches. `within` = CSS scope. */
    click: (text, within) => page.evaluate((text, within) => {
      const root = within ? document.querySelector(within) : document;
      if (!root) throw new Error(`scope not found: ${within}`);
      const re = new RegExp(text, 'i');
      const b = [...root.querySelectorAll('button, a, [role="button"]')].find((x) => re.test(x.textContent.trim()));
      if (!b) throw new Error(`no clickable matching /${text}/i${within ? ` in ${within}` : ''}`);
      b.click();
      return b.textContent.trim().slice(0, 60);
    }, text, within ?? null),

    /** Click by className fragment — for icon-only buttons with no text. */
    clickClass: (frag, nth = 0) => page.evaluate((frag, nth) => {
      const els = [...document.querySelectorAll('button')].filter((b) => b.className.includes(frag));
      if (!els[nth]) throw new Error(`no button #${nth} with class containing "${frag}" (found ${els.length})`);
      els[nth].click();
      return els.length;
    }, frag, nth),

    /** Photo tiles: masonry (`break-inside-avoid`) or square (`aspect-square`). */
    clickTile: (nth = 0, variant = 'break-inside-avoid') => page.evaluate((nth, variant) => {
      const t = [...document.querySelectorAll('button')].filter((b) => b.querySelector('img') && b.className.includes(variant) && !b.disabled);
      if (!t[nth]) throw new Error(`no tile #${nth} (found ${t.length} of variant ${variant})`);
      t[nth].click();
      return t.length;
    }, nth, variant),

    /** Read back the items of an open pop-out menu. */
    menuItems: (within = 'div[class*="absolute"]') => page.evaluate((within) =>
      [...document.querySelectorAll(within)].flatMap((d) => [...d.querySelectorAll('button')]).map((b) => b.textContent.trim()), within),

    /** Close the top pop-out via its click-away scrim (Escape often closes the whole modal). */
    dismiss: () => page.evaluate(() => document.querySelector('div.fixed.inset-0.z-10')?.click()),

    text: () => page.evaluate(() => document.body.innerText),
  };

  /** Same-origin fetch against the API, with the session cookie attached. */
  const api = {
    get: (p) => page.evaluate(async (p) => (await fetch(p, { credentials: 'include' })).json(), p),
    call: (p, method, body) => page.evaluate(async (p, method, body) => {
      const r = await fetch(p, {
        method, credentials: 'include',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      return r.status;
    }, p, method, body ?? null),

    /**
     * Stable fingerprint of whatever you're about to touch. Snapshot BEFORE,
     * snapshot AFTER the restore, assert the two strings are equal. Anything
     * less is not proof you put the data back.
     */
    snapshot: async (endpoint, pick) => {
      const rows = await api.get(endpoint);
      return JSON.stringify(rows.map(pick).sort());
    },
  };

  return { browser, page, go, shot, ui, api, wait, SAVE, close: () => browser.close() };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const [, , cmd, ...rest] = process.argv;
if (cmd) {
  const ctx = await open({
    w: +(rest.find((a, i) => rest[i - 1] === '--w') ?? 1440),
    h: +(rest.find((a, i) => rest[i - 1] === '--h') ?? 900),
  });
  try {
    if (cmd === 'shot') {
      const [route, name = 'shot'] = rest;
      await ctx.go(route);
      await ctx.shot(name);
    } else if (cmd === 'repl') {
      const mod = await import(pathToFileURL(path.resolve(rest[0])).href);
      await mod.default(ctx);
    } else {
      console.error(`unknown command "${cmd}" — use: shot | repl`);
    }
  } finally {
    await ctx.close();
  }
}
