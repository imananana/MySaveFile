// Pre-warm the photo CDN so a showcase's FIRST visitor never waits on
// resizes. The CDN makes a sized copy of a photo the first time that size is
// requested and reuses it afterwards — so whoever asks first pays for it, and
// for a public showcase "whoever asks first" is the audience. These warms
// make the app itself be first instead: on boot (a deploy restarts the
// server, and a deploy is exactly when the requested sizes can change), when
// a showcase goes live, and when a photo is uploaded.
//
// Warming is always fire-and-forget: it can log, it can be skipped, it must
// never fail a request or block startup.

import { query } from '../db/client';

// The CSS-pixel widths the showcase pages request (the CDN gets 2x for
// retina). Must stay a subset of WIDTH_STEPS in src/lib/api.ts — if the
// ladder there changes, change this list with it, or the warm makes sizes
// nobody asks for and misses the ones they do.
const WARM_WIDTHS = [64, 160, 320, 800, 1440];

const PHOTO_BASE_URL = process.env.VITE_PHOTO_BASE_URL ?? `https://${process.env.R2_PUBLIC_DOMAIN}`;
// Same gate as the client's CAN_RESIZE: only our own zone has the resize
// path. Dev's r2.dev bucket would just 404 every warm request.
const CAN_WARM = /^https:\/\/[a-z0-9.-]*\bmysavefile\.com(\/|$)/i.test(PHOTO_BASE_URL);

// Ask for what a browser asks for, so the copy the CDN makes (avif/webp via
// format=auto) is the copy real visitors will be served.
const ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';

const CONCURRENCY = 6;
// Backstop against warming a pathological save forever; logged when hit so a
// truncated warm never reads as a complete one.
const MAX_REQUESTS = 1500;

async function warmUrls(urls: string[], label: string): Promise<void> {
  const todo = urls.slice(0, MAX_REQUESTS);
  if (urls.length > todo.length) {
    console.log(`[photo-warm] ${label}: capped at ${MAX_REQUESTS} of ${urls.length} requests`);
  }
  let ok = 0, failed = 0;
  const started = Date.now();
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < todo.length) {
      const url = todo[i++];
      try {
        const res = await fetch(url, { headers: { Accept: ACCEPT } });
        // Drain the body — an aborted transfer may not leave a cached copy.
        await res.arrayBuffer();
        if (res.ok) ok++; else failed++;
      } catch {
        failed++;
      }
    }
  }));
  console.log(`[photo-warm] ${label}: ${ok} warmed, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`);
}

function urlsFor(filenames: Iterable<string>): string[] {
  const urls: string[] = [];
  for (const f of new Set(filenames)) {
    if (!f || f.startsWith('http')) continue; // legacy absolute URLs aren't ours to warm
    for (const w of WARM_WIDTHS) {
      urls.push(`${PHOTO_BASE_URL}/cdn-cgi/image/width=${w * 2},quality=80,format=auto/${f}`);
    }
  }
  return urls;
}

/** Every filename the save's showcase can put on screen: its built photos,
    its households' portraits, and the creator's avatar. */
async function collectSaveFilenames(saveFileId: string): Promise<string[]> {
  const [photos, thumbs, owner] = await Promise.all([
    query(
      `SELECT p.filename
       FROM photos p
       LEFT JOIN photo_assignments pa ON pa.photo_id = p.id AND pa.save_file_id = $1
       WHERE p.type = 'built' AND (p.save_file_id = $1 OR pa.save_file_id = $1)`,
      [saveFileId],
    ),
    query(
      `SELECT thumbnail_filename FROM households
       WHERE save_file_id = $1 AND thumbnail_filename IS NOT NULL`,
      [saveFileId],
    ),
    query(
      `SELECT u.profile_photo_url FROM users u
       JOIN save_files sf ON sf.user_id = u.id WHERE sf.id = $1`,
      [saveFileId],
    ),
  ]);
  return [
    ...photos.rows.map((r: { filename: string }) => r.filename),
    ...thumbs.rows.map((r: { thumbnail_filename: string }) => r.thumbnail_filename),
    ...owner.rows.map((r: { profile_photo_url: string | null }) => r.profile_photo_url ?? ''),
  ].filter(Boolean);
}

/** Warm one save's showcase photos. Safe to call anywhere — never throws. */
export function warmSaveFilePhotos(saveFileId: string, label: string): void {
  if (!CAN_WARM) return;
  void (async () => {
    try {
      const files = await collectSaveFilenames(saveFileId);
      await warmUrls(urlsFor(files), `${label} (${files.length} photos)`);
    } catch (err) {
      console.error('[photo-warm] failed:', err);
    }
  })();
}

/** Warm a single just-uploaded file. */
export function warmPhotoFile(filename: string): void {
  if (!CAN_WARM) return;
  void warmUrls(urlsFor([filename]), `upload ${filename}`).catch(() => {});
}

/** Warm every live showcase — run shortly after boot, because a deploy both
    restarts the server and is the moment the requested sizes can change. */
export function warmAllLiveShowcasesSoon(delayMs = 30_000): void {
  if (!CAN_WARM) return;
  setTimeout(() => {
    void (async () => {
      try {
        const live = await query(
          `SELECT id FROM save_files WHERE showcase_live = TRUE AND deleted_at IS NULL`,
        );
        console.log(`[photo-warm] boot: ${live.rows.length} live showcase(s)`);
        for (const row of live.rows as { id: string }[]) {
          const files = await collectSaveFilenames(row.id);
          await warmUrls(urlsFor(files), `boot ${row.id} (${files.length} photos)`);
        }
      } catch (err) {
        console.error('[photo-warm] boot warm failed:', err);
      }
    })();
  }, delayMs);
}
