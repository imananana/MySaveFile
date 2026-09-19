/**
 * Every apartment/penthouse unit record a save actually contains, per building.
 * The seed table in worlds.ts has to list exactly these — a unit the game has
 * and the table doesn't leaves that unit no row to land on, and the matcher
 * parks it on a sibling's row instead (which is how "1311 21 Chic Street" came
 * to show "Originally 1310 21 Chic Street").
 *
 *   npx tsx scripts/diagnostics/diagApartmentUnits.ts <path-to-save>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanLots } from '../../src/lib/parser/lots.js';

const BUILDINGS = /chic|culpepper|jasmine|medina|hakim|zen\s*view|alto|landgraab|spire|torendi|fountain|rue chic|dupiment/i;

const save = process.argv[2];
if (!save) { console.error('usage: diagApartmentUnits.ts <path-to-save>'); process.exit(1); }

const b = readFileSync(save);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let bl: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const lots = scanLots(bl!);
const hits = [...lots.values()].filter((l) => BUILDINGS.test(l.name));

console.log(`${save.split('/').pop()} — ${lots.size} lot records, ${hits.length} matched`);
const byField5 = new Map<string, typeof hits>();
for (const l of hits) {
  const k = String(l.field5 ?? 'null');
  const arr = byField5.get(k); if (arr) arr.push(l); else byField5.set(k, [l]);
}
for (const [f5, group] of byField5) {
  group.sort((a, b) => (a.id < b.id ? -1 : 1));
  console.log(`\n  field5=${f5}  (${group.length} unit${group.length === 1 ? '' : 's'})`);
  for (const l of group) console.log(`      "${l.name}"   zone=0x${l.id.toString(16)}`);
}
