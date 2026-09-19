// Locate the tray instance id 0x023516bfd45d2234 inside the save: which resource,
// what field context, and how close to the "Cabin Fever" lot record.
import { readFileSync } from 'fs';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const SIMS = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4`;
const b = readFileSync(`${SIMS}/saves/Slot_12345678.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

const needle = Buffer.alloc(8); needle.writeBigUInt64LE(BigInt('0x023516bfd45d2234'));

for (const r of res) {
  let d: Buffer;
  try { d = Buffer.from(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch { continue; }
  let from = 0, idx: number;
  while ((idx = d.indexOf(needle, from)) >= 0) {
    from = idx + 1;
    const ctxStart = Math.max(0, idx - 16);
    const ctx = [...d.subarray(ctxStart, idx + 24)]
      .map(c => (c >= 0x20 && c <= 0x7e) ? String.fromCharCode(c) : `·${c.toString(16).padStart(2, '0')}·`).join('');
    // nearest "Cabin Fever" in same resource
    const cf = d.indexOf('Cabin Fever');
    const dist = cf >= 0 ? idx - cf : null;
    console.log(`resType=0x${r.type.toString(16)} inst=${instanceIdHex(r)} @${idx}  (Cabin Fever ${cf >= 0 ? 'in same res, Δ=' + dist + ' bytes' : 'not in this res'})`);
    console.log(`   ctx: …${ctx}…`);
  }
}
