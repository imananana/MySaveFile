// Hunt provenance on LOT records. Lot msg: 0x3a [len] 0x09 [8 lotId] 0x12 [name] ...
// Dumps full field inventory for a named lot; checks string/fixed fields for a creator stamp.
// Usage: npx tsx scripts/diagnostics/provLotFields.ts <saveName> <lotNameSubstr>
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2] ?? 'Slot_12345678.save';
const want = (process.argv[3] ?? 'Raffia Quinta').toLowerCase();
const path = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`;
const b = readFileSync(path);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

function dumpFields(start: number, end: number) {
  let p = start;
  while (p < end) {
    if (buf[p] === 0) { console.log(`   @${p} <00>`); break; }
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; console.log(`   f${fn}/v0 = ${v} (0x${v.toString(16)})`); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; console.log(`   f${fn}/f64 = 0x${v.toString(16)}`); }
    else if (wt === 2) {
      const [l, nn] = readVarint(buf, p); const len = Number(l); const vEnd = nn + len; if (l < 0n || vEnd > end) { console.log('   <len overflow>'); break; }
      const s = buf.slice(nn, vEnd);
      const printable = len > 0 && [...s].filter(c => c >= 0x20 && c <= 0x7e).length / len > 0.85;
      console.log(`   f${fn}/len${len} = ${printable ? '"' + new TextDecoder().decode(s).slice(0, 50) + '"' : '[' + Buffer.from(s.slice(0, 12)).toString('hex') + (len > 12 ? '…' : '') + ']'}`);
      p = vEnd;
    } else if (wt === 5) { p += 4; console.log(`   f${fn}/f32`); }
    else break;
  }
}

let found = 0;
for (let i = 0; i < buf.length - 12; i++) {
  if (buf[i] !== 0x3a) continue;
  let pos = i + 1;
  let msgLen: bigint, msgStart: number;
  try { [msgLen, msgStart] = readVarint(buf, pos); } catch { continue; }
  if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
  const msgEnd = msgStart + Number(msgLen);
  pos = msgStart;
  if (buf[pos] !== 0x09) continue; pos++;
  if (pos + 8 > msgEnd) continue;
  const lotId = readFixed64LE(buf, pos); pos += 8;
  if (pos >= msgEnd || buf[pos] !== 0x12) continue; pos++;
  let lotName: string, afterName: number;
  try { [lotName, afterName] = readString(buf, pos); } catch { continue; }
  if (!lotName || !lotName.toLowerCase().includes(want)) continue;
  console.log(`=== LOT "${lotName}"  id=0x${lotId.toString(16)}  msgLen=${msgLen} ===`);
  dumpFields(afterName, msgEnd);
  console.log('');
  i = msgEnd - 1;
  if (++found > 4) break;
}
if (!found) console.log(`No lot matching "${want}" found.`);
