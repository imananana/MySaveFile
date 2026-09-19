/**
 * One-off + audit: photo rows whose save no longer exists.
 *
 * `photos.save_file_id` has no foreign key, so every permanent delete before
 * 2026-08-12 (the trash's daily sweep, and Delete forever) removed the save row
 * and left its built photos behind — owned by nothing, unreachable from any
 * screen, still counted in storage. Both paths clean up after themselves now;
 * this clears what they left behind, and doubles as the check that they do.
 *
 *   cd server && node_modules/.bin/tsx scripts/purgeOrphanPhotos.ts
 *   cd server && node_modules/.bin/tsx scripts/purgeOrphanPhotos.ts --apply
 *
 * DRY RUN BY DEFAULT. Localhost-only unless you pass --allow-remote.
 *
 * An R2 object is deleted only once no photo row anywhere references its
 * filename — duplicates and backups deliberately share one object per image.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { Pool } from 'pg';
// r2.ts reads its env at module scope, and imports are evaluated before the
// config() above — so it loads inside main(), never at the top.
type R2 = typeof import('../src/lib/r2');

const apply = process.argv.includes('--apply');
const allowRemote = process.argv.includes('--allow-remote');

const url = process.env.DATABASE_URL ?? '';
if (!/@localhost[:/]/.test(url) && !allowRemote) {
  console.error('ABORT: DATABASE_URL is not localhost. Re-run with --allow-remote if that is deliberate.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  const { deleteFromR2 }: R2 = await import('../src/lib/r2');

  const { rows } = await pool.query(
    `SELECT p.id, p.filename, p.type, p.target_type, p.save_file_id
       FROM photos p
      WHERE p.save_file_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM save_files sf WHERE sf.id = p.save_file_id)`,
  );
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} orphaned photo row(s)\n`);
  if (!rows.length) { await pool.end(); return; }

  const bySave = new Map<string, number>();
  for (const r of rows) bySave.set(r.save_file_id, (bySave.get(r.save_file_id) ?? 0) + 1);
  for (const [saveId, n] of [...bySave].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${saveId}  ${n} row(s)`);
  }

  if (!apply) {
    console.log('\nNothing written. Re-run with --apply to delete these rows (and any image nothing else uses).');
    await pool.end();
    return;
  }

  const ids = rows.map((r) => r.id);
  await pool.query('DELETE FROM photos WHERE id = ANY($1::text[])', [ids]);

  let objects = 0;
  for (const filename of new Set(rows.map((r) => r.filename as string))) {
    const stillUsed = (await pool.query('SELECT 1 FROM photos WHERE filename = $1 LIMIT 1', [filename])).rows[0];
    if (stillUsed) continue;
    try { await deleteFromR2(filename); objects++; } catch (e) {
      console.warn(`  image left behind: ${filename} — ${(e as Error).message}`);
    }
  }
  console.log(`\nDeleted ${ids.length} row(s) and ${objects} image(s).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
