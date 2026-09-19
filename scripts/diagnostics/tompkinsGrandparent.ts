/**
 * Diagnostic for the "deleted middle generation / grandparent on sync" question.
 * Prints, for a chosen household, each member's FULL f14 ahnentafel (every
 * index, not just immediate parents) and then runs the real import planner to
 * show which edges actually survive import.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/tompkinsGrandparent.ts [save] [household]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily } from '../../src/lib/parser/family.js';
import { planFamilyImport } from '../../src/lib/gameImport/familyImport.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
const hhArg = (process.argv[3] || 'Tompkins').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);

const simById = new Map(data.sims.map((s) => [s.id, s]));
const hx = (id: bigint) => '0x' + id.toString(16);
const nm = (id: bigint) => {
  const s = simById.get(id);
  return s ? `${s.firstName} ${s.lastName} (${s.lifestage})` : `«no record» ${hx(id)}`;
};

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const humanIds = new Set(data.sims.filter((s) => s.species === 'human').map((s) => s.id));
const raw = scanFamily(blob!, humanIds);

const hh = data.households.find((h) => h.name.toLowerCase().includes(hhArg));
if (!hh) { console.log(`No household matching "${hhArg}"`); process.exit(0); }

const members = hh.simIds.map((id) => simById.get(id)).filter((s): s is NonNullable<typeof s> => !!s && s.species === 'human');
console.log(`\nSave: ${savePath.split('/').pop()}`);
console.log(`Household: ${hh.name} — ${members.length} member(s)\n`);

for (const s of members) {
  console.log(`● ${s.firstName} ${s.lastName} (${s.lifestage})  ${hx(s.id)}`);
  const fam = raw.get(s.id);
  if (!fam || fam.ancestors.length === 0) { console.log('    ahnentafel: (none)'); }
  else {
    for (const a of [...fam.ancestors].sort((x, y) => x.index - y.index)) {
      const gen = a.index <= 1 ? 'parent' : a.index <= 3 ? 'GRANDPARENT' : a.index <= 7 ? 'great-grandparent' : `gen+${a.index}`;
      const hasRec = simById.has(a.id) ? '' : '  ⟵ NO RECORD (stub)';
      console.log(`    idx ${a.index} [${gen}] → ${nm(a.id)}${hasRec}`);
    }
  }
  // what familyFacts kept (index 0/1 only)
  console.log(`    → familyFacts.parents kept: ${(data.familyFacts.bySim[hx(s.id)]?.parents ?? []).map((p) => nm(BigInt(p))).join(', ') || '—'}`);
  console.log('');
}

// Run the real import planner as if you imported exactly this household.
const importedIds = members.map((s) => hx(s.id));
const plan = planFamilyImport(data.familyFacts, data.sims, importedIds);
console.log('── What import would persist for this household ──');
console.log(`stubs (Unknown ancestors): ${plan.stubs.map((s) => s).join(', ') || '—'}`);
console.log(`tree_only extra sims: ${plan.treeOnly.map((id) => nm(BigInt(id))).join(', ') || '—'}`);
console.log('edges:');
for (const e of plan.edges) console.log(`   ${e.relType}: ${nm(BigInt(e.a))}  →  ${nm(BigInt(e.b))}`);
if (plan.edges.length === 0) console.log('   (none)');
