// List households (name, id-hex, lotId, sim count) for a given save.
// Usage: npx tsx scripts/diagnostics/provHhList.ts <saveFileName>
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHouseholdRecords } from '../../src/lib/parser/households.js';

const name = process.argv[2] ?? 'Slot_00000006.save';
const path = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${name}`;
const b = readFileSync(path);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let buf: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!buf || d.length > buf.length) buf = d;
}
const hhs = scanHouseholdRecords(buf!);
console.log(`${name}: ${hhs.length} households`);
for (const h of hhs) {
  console.log(`  ${h.name.padEnd(28)} id=0x${h.id.toString(16).padStart(16, '0')} lot=${h.lotId ? '0x'+h.lotId.toString(16) : '—'} sims=${h.simIds.length} played=${h.isPlayed ? 'Y' : '·'}`);
}
