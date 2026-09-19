/**
 * Run the real resolver over a save's 21 Chic Street records and print which
 * seed row each zone id landed on — the check that a renamed unit still maps to
 * ITS OWN row and not a sibling's.
 *
 *   npx tsx scripts/diagnostics/diagResolveChicStreet.ts <path-to-save>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanLots } from '../../src/lib/parser/lots.js';
import { resolveSaveLots } from '../../src/components/gameImport/lotMatching.js';

const save = process.argv[2]!;
const b = readFileSync(save);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let bl: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const all = [...scanLots(bl!).values()];
const records = all.map((l) => ({ id: l.id, field5: l.field5 ?? null, name: l.name, detectedType: null }));

const zoneAssignments = new Map<string, string>();
const resolved = resolveSaveLots(records, { zoneAssignments });

console.log(`${save.split('/').pop()}\n`);
console.log('Zone -> seed row (from zoneAssignments):');
for (const l of all.filter((l) => l.field5 === 1504706562n).sort((a, b) => (a.id < b.id ? -1 : 1))) {
  const key = zoneAssignments.get(l.id.toString(16)) ?? '(unassigned)';
  console.log(`  ${l.id.toString(16).slice(-3)}  save name "${l.name}"  ->  ${key}`);
}
console.log('\nWhat the planner will store for those rows:');
for (const k of [...resolved.keys()].filter((k) => k.includes('21 Chic Street')).sort()) {
  console.log(`  ${k}  ->  customName "${resolved.get(k)!.customName}"`);
}
