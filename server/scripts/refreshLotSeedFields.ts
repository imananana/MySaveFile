/**
 * Re-point every existing lot row's `location` (the neighbourhood) at the
 * current seed data in src/data/worlds.ts.
 *
 * Why this exists: `location` is copied into the `lots` table once, when a save
 * is created, and nothing ever refreshes it. It is pure mirrored game truth —
 * no screen writes to it, and there is no authored counterpart the way
 * custom_name shadows lot_name. So when worlds.ts is corrected, every save made
 * before the correction keeps the wrong neighbourhood forever. This is the
 * catch-up pass for that. Run it after any neighbourhood fix.
 *
 * Dry run (prints what would change, touches nothing):
 *   cd server && node_modules/.bin/tsx scripts/refreshLotSeedFields.ts
 *
 * Apply:
 *   cd server && node_modules/.bin/tsx scripts/refreshLotSeedFields.ts --apply
 *
 * SAFETY: refuses a non-localhost DATABASE_URL unless --allow-remote is also
 * passed, so pointing it at production has to be deliberate.
 *
 * It also reports — without touching — drift in `size` and `default_type`.
 * Those are left alone on purpose: `custom_type` is seeded from `default_type`
 * at creation, so rewriting it could desync a lot a player has since re-typed.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { Pool } from 'pg';
import { getSeedLots } from '../src/db/seedLots';

const apply = process.argv.includes('--apply');
const allowRemote = process.argv.includes('--allow-remote');

const url = process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('ABORT: DATABASE_URL is not set.');
  process.exit(1);
}
const isLocal = /@localhost[:/]|@127\.0\.0\.1[:/]/.test(url);
if (!isLocal && !allowRemote) {
  console.error('ABORT: DATABASE_URL is not localhost. Re-run with --allow-remote to mean it.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log(`Target: ${isLocal ? 'LOCAL dev' : '*** REMOTE ***'}   Mode: ${apply ? 'APPLY' : 'dry run'}\n`);

  const seed = getSeedLots();
  const byKey = new Map(seed.map((r) => [r.lotKey, r]));

  const { rows } = await pool.query(
    `SELECT lot_key, location, size, default_type, COUNT(*)::int AS n
       FROM lots GROUP BY lot_key, location, size, default_type`,
  );

  const locFixes: { lotKey: string; from: string; to: string; n: number }[] = [];
  const otherDrift: string[] = [];
  let unknownKeys = 0;

  for (const row of rows) {
    const s = byKey.get(row.lot_key);
    if (!s) { unknownKeys += row.n; continue; }
    if (row.location !== s.location) {
      locFixes.push({ lotKey: row.lot_key, from: row.location, to: s.location, n: row.n });
    }
    if (row.size !== s.size) otherDrift.push(`size  ${row.lot_key}: "${row.size}" -> "${s.size}" (${row.n})`);
    if (row.default_type !== s.defaultType) otherDrift.push(`type  ${row.lot_key}: "${row.default_type}" -> "${s.defaultType}" (${row.n})`);
  }

  if (unknownKeys) console.log(`${unknownKeys} lot rows have a lot_key not in the seed data (player-added or renamed worlds) — skipped.\n`);

  if (!locFixes.length) {
    console.log('No neighbourhood drift. Nothing to do.');
  } else {
    console.log('Neighbourhood corrections:');
    for (const f of locFixes) console.log(`  ${f.lotKey}: "${f.from}" -> "${f.to}"  (${f.n} rows)`);
    const total = locFixes.reduce((a, f) => a + f.n, 0);
    console.log(`  ${total} rows across ${locFixes.length} lot(s).\n`);

    if (apply) {
      let updated = 0;
      for (const f of locFixes) {
        const r = await pool.query(
          `UPDATE lots SET location = $1 WHERE lot_key = $2 AND location = $3`,
          [f.to, f.lotKey, f.from],
        );
        updated += r.rowCount ?? 0;
      }
      console.log(`Applied. ${updated} rows updated.`);
    } else {
      console.log('Dry run — nothing written. Re-run with --apply.');
    }
  }

  if (otherDrift.length) {
    console.log(`\nReported only, NOT changed (${otherDrift.length}):`);
    for (const d of otherDrift) console.log(`  ${d}`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
