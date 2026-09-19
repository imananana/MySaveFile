import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanLots } from '../../src/lib/parser/lots.js';

const save = process.argv[2] ?? 'Slot_00000007.save';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const lots = scanLots(bl!);
console.log(`total lots: ${lots.size}`);
let n = 0;
for (const [, l] of lots) {
  if (/cabin|iman|test|fever/i.test(l.name)) { console.log(`  MATCH: "${l.name}" id=0x${l.id.toString(16)}`); n++; }
}
if (!n) console.log('  (no lot name matches cabin/iman/test/fever)');
