/* Does the gender skew among tree-only ancestors come from the SAVE or from the
 * import? Parses a save, runs the real planFamilyImport over it exactly as the
 * app does, and reports the male share of the sims it would create as
 * tree_only against the sims that are in households.
 * Run: npx tsx scripts/diagnostics/treeOnlyGender.ts <path> [needle...] */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { planFamilyImport } from '../../src/lib/gameImport/familyImport.js';

const PATH = process.argv[2];
const NEEDLES = process.argv.slice(3).map((s) => s.toLowerCase());

const b = readFileSync(PATH);
const save = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
const byHex = new Map(save.sims.map((s) => ['0x' + s.id.toString(16), s] as const));

// Full ingest: every household comes in, so every household sim is "imported".
const inHousehold = new Set<string>();
for (const hh of save.households) for (const id of hh.simIds) inHousehold.add('0x' + id.toString(16));

const plan = planFamilyImport(save.familyFacts, save.sims, inHousehold);

const share = (hexes: Iterable<string>) => {
  let m = 0, f = 0, missing = 0;
  for (const h of hexes) {
    const s = byHex.get(h);
    if (!s) { missing++; continue; }
    if (s.species !== 'human') continue;
    if (s.gender === 'male') m++; else f++;
  }
  return { m, f, missing, pct: m + f ? Math.round((100 * m) / (m + f)) : null };
};

const roster = share(inHousehold);
const tree = share(plan.treeOnly);

console.log(`save: "${save.saveName}"  (${save.sims.length} sim records, ${save.households.length} households)\n`);
console.log(`in a household : ${roster.m} male / ${roster.f} female  → ${roster.pct}% male`);
console.log(`tree_only      : ${tree.m} male / ${tree.f} female  → ${tree.pct}% male   (plan says ${plan.treeOnly.length} rows, ${plan.stubs.length} stubs)`);

console.log('\nevery tree_only sim, as the PARSER reads it:');
for (const hex of plan.treeOnly) {
  const s = byHex.get(hex);
  if (!s) { console.log(`  ${hex}  <no record>`); continue; }
  console.log(
    `  ${`${s.firstName} ${s.lastName}`.trim().padEnd(26)} ${s.gender.padEnd(6)} ${s.lifestage.padEnd(11)}` +
    ` ghost=${String(s.isGhost).padEnd(5)} ${s.species}  ${hex}`,
  );
}

if (NEEDLES.length) {
  console.log('\nnamed sims, wherever they live:');
  for (const s of save.sims) {
    const full = `${s.firstName} ${s.lastName}`.trim();
    if (!NEEDLES.some((n) => full.toLowerCase().includes(n))) continue;
    const hex = '0x' + s.id.toString(16);
    const where = inHousehold.has(hex) ? 'household' : plan.treeOnly.includes(hex) ? 'tree_only' : 'neither';
    console.log(`  ${full.padEnd(26)} ${s.gender.padEnd(6)} ${s.lifestage.padEnd(11)} ghost=${String(s.isGhost).padEnd(5)} ${where.padEnd(9)} ${hex}`);
  }
}
