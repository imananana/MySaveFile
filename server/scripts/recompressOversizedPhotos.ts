/**
 * One-off: re-compress photos stored above the current size limit.
 *
 * Uploads are downscaled to a 2560px long edge and re-encoded as JPEG, but that
 * step arrived after some photos had already been stored. In the dev library six
 * photos sit at 5712×4284, ~9MB each — about 60% of that library's bytes in 3% of
 * its photos. This puts them through the same pipeline every upload goes through.
 *
 *   cd server && node_modules/.bin/tsx scripts/recompressOversizedPhotos.ts
 *   cd server && node_modules/.bin/tsx scripts/recompressOversizedPhotos.ts --apply
 *
 * DRY RUN BY DEFAULT — it lists what it would do and touches nothing. Pass
 * --apply to write. Localhost-only unless you also pass --allow-remote, which is
 * how you'd run it against production once you've read the dry run.
 *
 * Safe to re-run: the query only matches photos that are still oversized, so a
 * second pass finds nothing. Each image is re-encoded from the stored file, so
 * running it twice on the same photo can't compound quality loss — but there is
 * no way back to the original either, which is why the dry run is the default.
 *
 * Every row sharing a filename is repointed together (duplicates and backups
 * share one object per image), and the old object is deleted only once nothing
 * references it.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { Pool } from 'pg';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
// ★ r2.ts reads R2_BUCKET et al. at module scope, and ES imports are evaluated
// BEFORE the config() call above runs — a static import here silently gets an
// undefined bucket and every fetch fails as "not in storage". Imported inside
// main() instead, after the env is loaded.
type R2 = typeof import('../src/lib/r2');

const MAX_EDGE = 2560;      // must match photos.ts
const JPEG_QUALITY = 82;    // must match photos.ts

const apply = process.argv.includes('--apply');
const allowRemote = process.argv.includes('--allow-remote');

const url = process.env.DATABASE_URL ?? '';
if (!/@localhost[:/]/.test(url) && !allowRemote) {
  console.error('ABORT: DATABASE_URL is not localhost. Re-run with --allow-remote if that is deliberate.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const kb = (n: number) => `${Math.round(n / 1024)}KB`;

async function main() {
  const { fetchFromR2, uploadToR2, deleteFromR2 }: R2 = await import('../src/lib/r2');

  const { rows } = await pool.query(
    `SELECT id, filename, width, height, type FROM photos
      WHERE width > $1 OR height > $1
      ORDER BY width * height DESC NULLS LAST`,
    [MAX_EDGE],
  );
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} photo(s) above ${MAX_EDGE}px\n`);
  if (!rows.length) { await pool.end(); return; }

  let before = 0;
  let after = 0;
  let done = 0;

  // One filename may back several rows; process each distinct image once.
  const byFilename = new Map<string, Array<{ id: string; width: number; height: number; type: string }>>();
  for (const r of rows) {
    const list = byFilename.get(r.filename) ?? [];
    list.push({ id: r.id, width: r.width, height: r.height, type: r.type });
    byFilename.set(r.filename, list);
  }

  for (const [filename, group] of byFilename) {
    const { width, height, type } = group[0];
    let original: Buffer;
    try {
      original = await fetchFromR2(filename);
    } catch (e) {
      console.log(`  SKIP  ${filename} — not in storage (${(e as Error).message})`);
      continue;
    }

    const { data, info } = await sharp(original, { failOn: 'none' })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    before += original.length;
    after += data.length;
    const saved = Math.round((1 - data.length / original.length) * 100);
    console.log(
      `  ${apply ? 'REDO' : 'WOULD'}  ${filename} (${type}, ×${group.length})  `
      + `${width}×${height} ${kb(original.length)} → ${info.width}×${info.height} ${kb(data.length)}  −${saved}%`,
    );
    if (!apply) continue;

    // New key rather than overwriting: the extension follows the real format,
    // and a half-finished write can never leave a row pointing at a broken file.
    const newFilename = `${nanoid()}.jpg`;
    await uploadToR2(data, newFilename, 'image/jpeg');
    await pool.query(
      'UPDATE photos SET filename = $1, width = $2, height = $3 WHERE filename = $4',
      [newFilename, info.width ?? null, info.height ?? null, filename],
    );
    const stillUsed = (await pool.query('SELECT 1 FROM photos WHERE filename = $1 LIMIT 1', [filename])).rows[0];
    if (!stillUsed) await deleteFromR2(filename).catch((e) => console.warn(`    old object left behind: ${(e as Error).message}`));
    done++;
  }

  console.log(
    `\n${apply ? `Re-compressed ${done} image(s).` : 'Nothing written.'} `
    + `${kb(before)} → ${kb(after)} (−${Math.round((1 - after / (before || 1)) * 100)}%)`,
  );
  if (!apply) console.log('Re-run with --apply to write.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
