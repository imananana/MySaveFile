// Across ALL lots: dump f6/f7/f13 (candidate build/creator ids) to see if any vary
// per-build (provenance) or are constant. Also list every distinct printable
// "username-like" string in the whole save to see if build-creator names exist at all.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2] ?? 'Slot_12345678.save';
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

function fieldsOf(start: number, end: number) {
  const m = new Map<number, string>();
  let p = start;
  while (p < end) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; if (!m.has(fn)) m.set(fn, v.toString()); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; if (!m.has(fn)) m.set(fn, '0x' + v.toString(16)); }
    else if (wt === 2) { const [l, nn] = readVarint(buf, p); p = nn + Number(l); }
    else if (wt === 5) p += 4; else break;
  }
  return m;
}

const lots: { name: string; f6?: string; f7?: string; f13?: string }[] = [];
for (let i = 0; i < buf.length - 12; i++) {
  if (buf[i] !== 0x3a) continue;
  let pos = i + 1; let msgLen: bigint, msgStart: number;
  try { [msgLen, msgStart] = readVarint(buf, pos); } catch { continue; }
  if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
  const msgEnd = msgStart + Number(msgLen); pos = msgStart;
  if (buf[pos] !== 0x09) continue; pos++; if (pos + 8 > msgEnd) continue; pos += 8;
  if (pos >= msgEnd || buf[pos] !== 0x12) continue; pos++;
  let lotName: string, afterName: number;
  try { [lotName, afterName] = readString(buf, pos); } catch { continue; }
  if (!lotName || lotName.length < 3 || /^[a-z][a-z0-9_:]+$/.test(lotName)) continue;
  const f = fieldsOf(afterName, msgEnd);
  lots.push({ name: lotName, f6: f.get(6), f7: f.get(7), f13: f.get(13) });
  i = msgEnd - 1;
}

console.log(`${lots.length} lots. f7 distribution (candidate creator/account id):`);
const f7d = new Map<string, number>();
for (const l of lots) f7d.set(l.f7 ?? '∅', (f7d.get(l.f7 ?? '∅') ?? 0) + 1);
for (const [k, c] of [...f7d].sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${c}`);
console.log('\nSample lots (name | f6 | f7 | f13):');
for (const l of lots.slice(0, 18)) console.log(`   ${l.name.padEnd(24)} | ${l.f6} | ${l.f7} | ${l.f13}`);
