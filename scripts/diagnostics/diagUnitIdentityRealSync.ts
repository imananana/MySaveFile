/**
 * End-to-end proof of apartment-unit identity on REAL saves: import an older
 * save, then re-sync a later one where units have been renamed in-game, and
 * check every unit still lands on its own planner lot.
 *
 * Run cold (no remembered ids) alongside it, since that's the only case the
 * save itself cannot resolve — it shows what the remembered ids are buying.
 *
 *   npx tsx scripts/diagnostics/diagUnitIdentityRealSync.ts <before.save> <after.save>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanLots } from '../../src/lib/parser/lots.js';
import { resolveSaveLots, MULTI_UNIT_SIBLINGS } from '../../src/components/gameImport/lotMatching.js';

function records(path: string) {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  let bl: Uint8Array | null = null;
  for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
    const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
    if (!bl || d.length > bl.length) bl = d;
  }
  return [...scanLots(bl!).values()].map((l) => ({ id: l.id, field5: l.field5 ?? null, name: l.name, detectedType: 'Apartment' }));
}

const before = records(process.argv[2]!);
const after = records(process.argv[3]!);

// Sync 1 — the older save. Records each unit's zone id.
const remembered = new Map<string, string>();
resolveSaveLots(before, { zoneAssignments: remembered });
console.log(`Sync 1 (${process.argv[2]!.split('/').pop()}): remembered ${remembered.size} apartment zone ids\n`);

// Sync 2 — the later save, two ways.
const warmOut = new Map<string, string>();
resolveSaveLots(after, { zoneKeyMap: remembered, zoneAssignments: warmOut });
const coldOut = new Map<string, string>();
resolveSaveLots(after, { zoneAssignments: coldOut });

let warmWrong = 0, coldWrong = 0, checked = 0;
const notes: string[] = [];
for (const [zone, truth] of remembered) {
  if (!MULTI_UNIT_SIBLINGS.has(truth)) continue;
  checked++;
  const warm = warmOut.get(zone), cold = coldOut.get(zone);
  if (warm !== truth) { warmWrong++; notes.push(`  WARM MISMATCH zone ${zone.slice(-3)}: ${truth} -> ${warm}`); }
  if (cold !== truth) { coldWrong++; notes.push(`  cold  drift    zone ${zone.slice(-3)}: ${truth} -> ${cold}`); }
}
console.log(`Units checked: ${checked}`);
console.log(`  WITH remembered zone ids : ${checked - warmWrong}/${checked} landed on their own lot`);
console.log(`  WITHOUT (cold import)    : ${checked - coldWrong}/${checked} landed on their own lot`);
if (notes.length) console.log('\n' + notes.join('\n'));
