// Count + locate creator strings across the WHOLE decompressed save (largest 0x0d),
// to see if provenance also appears at sim level (not just household record).
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const s = Buffer.from(bl!).toString('latin1');
for (const k of ['denlon2', 'imanistan']) {
  const idxs: number[] = [];
  let i = -1;
  while ((i = s.indexOf(k, i + 1)) >= 0) idxs.push(i);
  console.log(`"${k}": ${idxs.length} occurrences at offsets ${idxs.slice(0, 10).join(', ')}`);
  for (const off of idxs.slice(0, 4)) {
    const ctx = [...Buffer.from(bl!.slice(off - 6, off + k.length + 4))].map(c => (c >= 0x20 && c <= 0x7e) ? String.fromCharCode(c) : `·${c.toString(16)}·`).join('');
    console.log(`     @${off}: …${ctx}…`);
  }
}
