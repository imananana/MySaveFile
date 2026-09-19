import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let buf: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!buf || d.length > buf.length) buf = d; }
const bl = buf!;
function readStr(p: number): [string, number] { const [l, n] = readVarint(bl, p); return [new TextDecoder().decode(bl.slice(n, n + Number(l))), n + Number(l)]; }
const anchors: { start: number; name: string; bodyStart: number }[] = []; const seen = new Set<bigint>();
for (let i = 0; i < bl.length - 40; i++) {
  if (bl[i] !== 0x09 || bl[i + 9] !== 0x11) continue;
  let pos = i + 10; if (pos + 8 > bl.length) continue;
  const id = readFixed64LE(bl, pos); pos += 8;
  if (bl[pos] !== 0x1a) continue; pos++;
  const [name, an] = readStr(pos);
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  pos = an; if (bl[pos] !== 0x21) continue; pos++; pos += 8;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ start: i, name, bodyStart: pos });
}
const played: string[] = [];
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai]; const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(bl.length, a.bodyStart + 200000);
  let p = a.bodyStart; let f31 = 0n;
  while (p < end) { if (bl[p] === 0) break; let tag, n; try { [tag, n] = readVarint(bl, p); } catch { break; } p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(bl, p); p = nn; if (fn === 31) f31 = v; } else if (wt === 1) p += 8; else if (wt === 2) { const [l, nn] = readVarint(bl, p); p = nn + Number(l); } else if (wt === 5) p += 4; else break; }
  if (f31 === 1n) played.push(a.name);
}
console.log('households with f31=1:', played.join(', '));
