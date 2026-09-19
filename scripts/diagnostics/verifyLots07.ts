import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanSmallBusinesses } from '../../src/lib/parser/smallBusinesses.js';
import { scanLots } from '../../src/lib/parser/lots.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const lots = [...scanLots(bl!).values()];
const lotName = (id: bigint) => { const l = lots.find(x => x.id === id || x.field5 === id); return l ? l.name : `x${id.toString(16)}`; };
for (const biz of scanSmallBusinesses(bl!)) {
  if (biz.name !== 'Tester Business') continue;
  console.log('lots:', biz.lotIds.map(lotName).join(', ') || '(none)');
}
