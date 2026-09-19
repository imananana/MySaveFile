// Decode the structure around the dense 'imanistan' cluster to learn what record
// carries the player's creator stamp (is it per-sim? a registry? a join table?).
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

// Walk fields starting a bit before the first cluster occurrence to see the repeated record shape.
function walk(start: number, count: number) {
  let p = start, shown = 0;
  while (p < buf.length && shown < count) {
    if (buf[p] === 0) { console.log(`   @${p}: <00 terminator>`); p++; continue; }
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { console.log('   <varint err>'); break; }
    const fn = Number(tag >> 3n), wt = Number(tag & 7n); const at = p; p = n;
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; console.log(`   @${at} f${fn}/v0 = ${v} (0x${v.toString(16)})`); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; console.log(`   @${at} f${fn}/f64 = 0x${v.toString(16)}`); }
    else if (wt === 2) { const [l, nn] = readVarint(buf, p); const len = Number(l); const s = buf.slice(nn, nn + len); const printable = [...s].every(c => c >= 0x20 && c <= 0x7e); console.log(`   @${at} f${fn}/len${len} = ${printable && len > 0 ? '"' + new TextDecoder().decode(s) + '"' : '[' + Buffer.from(s.slice(0, 16)).toString('hex') + (len > 16 ? '…' : '') + ']'}`); p = nn + len; }
    else if (wt === 5) { p += 4; console.log(`   @${at} f${fn}/f32`); }
    else { console.log(`   @${at} bad wt ${wt}`); break; }
    shown++;
  }
}

console.log('=== region around first imanistan cluster (from @260680) ===');
walk(260680, 30);
console.log('\n=== region around a mid cluster (from @272150) ===');
walk(272150, 24);
console.log('\n=== region around denlon2 (from @437840) ===');
walk(437840, 24);
