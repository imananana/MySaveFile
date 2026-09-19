// READ-ONLY: prove the family tree should be built by genealogy EDGES, not by
// surname. Seeds from a household roster, walks parents (f14)/children, and
// reports: who is reachable, where the chain hits "unknown" (f14 ref with no
// sim record = culled ancestor), and which same-surname records are NOT
// reachable (orphan phantom records the game hides).
//   genealogyReach.ts <save> <householdNameSubstr> [surnameToAudit]
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily, buildFamilyGraph } from '../../src/lib/parser/family.js';

const savePath = process.argv[2];
const hhSub = (process.argv[3] ?? '').toLowerCase();
const surname = (process.argv[4] ?? '').toLowerCase();
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const byId = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : `‹culled ${id.toString(16)}›`; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const raw = scanFamily(blob!, simIds);
const g = buildFamilyGraph(raw);

const hh = data.households.find((h) => h.name.toLowerCase().includes(hhSub));
if (!hh) { console.log(`no household matching "${hhSub}"`); process.exit(0); }
console.log(`Household "${hh.name}" roster: ${hh.simIds.map(nm).join(', ')}\n`);

// BFS over genealogy edges (parents + children), tracking culled-ref boundaries.
const seen = new Set<bigint>();
const unknownRefs = new Set<bigint>(); // f14 ids with no record
const queue = [...hh.simIds];
while (queue.length) {
  const id = queue.shift()!;
  if (seen.has(id)) continue;
  seen.add(id);
  const fam = raw.get(id);
  if (fam) for (const a of fam.ancestors) { if (simIds.has(a.id)) { if (!seen.has(a.id)) queue.push(a.id); } else unknownRefs.add(a.id); }
  for (const c of g.childrenOf.get(id) ?? []) if (!seen.has(c)) queue.push(c);
}
const reached = [...seen].map(nm).sort();
console.log(`Reachable via genealogy edges (${seen.size} sims):`);
console.log('  ' + reached.join('\n  '));
console.log(`\n"unknown" boundary nodes (f14 refs to culled sims, no record): ${unknownRefs.size}`);

if (surname) {
  const sameSurname = data.sims.filter((s) => s.lastName.toLowerCase() === surname);
  const orphans = sameSurname.filter((s) => !seen.has(s.id));
  console.log(`\n── "${surname}"-surname audit ──`);
  console.log(`  total "${surname}" records: ${sameSurname.length}   reachable: ${sameSurname.length - orphans.length}   ORPHAN (hidden by game): ${orphans.length}`);
  console.log('  orphans: ' + (orphans.map((s) => `${s.firstName} ${s.lastName}`).join(', ') || 'none'));
}
