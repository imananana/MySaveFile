import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanSmallBusinesses } from '../../src/lib/parser/smallBusinesses.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
for (const biz of scanSmallBusinesses(bl!)) {
  if (biz.name !== 'Tester Business') continue;
  console.log('feeMode        :', biz.feeMode);
  console.log('priceModifierPct:', biz.priceModifierPct);
  console.log('activities     :', biz.activities.map(a => a.name).join(', ') || '(none)');
}
