/**
 * Apply + verify the new household provenance/visibility columns against the
 * LOCAL dev DB (idempotent — same ALTERs the server runs at boot). Also prints
 * the current provenance distribution so we can confirm an import populated it.
 *
 *   cd server && node_modules/.bin/tsx scripts/migrateHouseholdCols.ts
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost.
 */
import { config } from 'dotenv';
config({ path: '.env' });
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? '';
if (!/@localhost[:/]/.test(url)) {
  console.error('ABORT: DATABASE_URL is not localhost — refusing to touch a non-dev DB.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const ALTERS = [
  `ALTER TABLE households ADD COLUMN IF NOT EXISTS provenance TEXT`,
  `ALTER TABLE households ADD COLUMN IF NOT EXISTS provenance_sub TEXT`,
  `ALTER TABLE households ADD COLUMN IF NOT EXISTS creator_name TEXT`,
  `ALTER TABLE households ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'auto'`,
];

(async () => {
  for (const sql of ALTERS) await pool.query(sql);

  const cols = await pool.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns
     WHERE table_name = 'households'
       AND column_name IN ('provenance','provenance_sub','creator_name','visibility')
     ORDER BY column_name`,
  );
  console.log('Columns present:');
  for (const c of cols.rows) console.log(`  ✓ ${c.column_name} (${c.data_type})${c.column_default ? ` default ${c.column_default}` : ''}`);

  const total = (await pool.query('SELECT count(*)::int AS n FROM households')).rows[0].n;
  console.log(`\nHouseholds in dev DB: ${total}`);
  if (total > 0) {
    const dist = await pool.query(
      `SELECT provenance, provenance_sub, visibility, count(*)::int AS n
       FROM households GROUP BY 1,2,3 ORDER BY n DESC LIMIT 25`,
    );
    console.log('provenance | sub | visibility | count');
    for (const r of dist.rows) console.log(`  ${r.provenance ?? '—'} | ${r.provenance_sub ?? '—'} | ${r.visibility} | ${r.n}`);
  }
  await pool.end();
})();
