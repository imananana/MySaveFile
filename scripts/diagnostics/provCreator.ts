// Dump f21 (creator name) + f18 (desc) + f19/f20 for ALL households to see how
// provenance partitions: user's own name vs gallery creators vs EA/townie.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const name = process.argv[2] ?? 'Slot_00000007.save';
const path = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${name}`;
const b = readFileSync(path);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

const anchors: { id: bigint; name: string; bodyStart: number; start: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  let pos = i + 10; if (pos + 8 > buf.length) continue;
  const id = readFixed64LE(buf, pos); pos += 8;
  if (buf[pos] !== 0x1a) continue; pos++;
  const [nm, an] = readString(buf, pos);
  if (!nm || nm.length < 2 || nm.length > 60 || !/^[\x20-\x7e]+$/.test(nm) || nm.includes('_')) continue;
  pos = an; if (buf[pos] !== 0x21) continue; pos++; pos += 8;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ id, name: nm, bodyStart: pos, start: i });
}

function fields(start: number, end: number) {
  let p = start;
  let f21 = '<absent>', f18 = '', f19: string | null = null, f20: string | null = null;
  while (p < end) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; if (fn === 19) f19 = v.toString(); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; if (fn === 20) f20 = '0x' + v.toString(16); }
    else if (wt === 2) {
      const [l, nn] = readVarint(buf, p); const vEnd = nn + Number(l); if (l < 0n || vEnd > end) break;
      const s = new TextDecoder().decode(buf.slice(nn, vEnd));
      if (fn === 21) f21 = Number(l) === 0 ? '<empty>' : s;
      else if (fn === 18) f18 = Number(l) === 0 ? '' : s;
      p = vEnd;
    } else if (wt === 5) p += 4; else break;
  }
  return { f21, f18, f19, f20 };
}

const rows = anchors.map((a, ai) => {
  const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, a.bodyStart + 300000);
  return { name: a.name, ...fields(a.bodyStart, end) };
});

// distribution of f21 creator
const dist = new Map<string, number>();
for (const r of rows) dist.set(r.f21, (dist.get(r.f21) ?? 0) + 1);
console.log(`f21 (creator) distribution across ${rows.length} households:`);
for (const [k, c] of [...dist].sort((a, b) => b[1] - a[1])) console.log(`   "${k}": ${c}`);

console.log(`\nAll households (name | creator f21 | desc? | f19 | f20):`);
for (const r of rows) {
  console.log(`   ${r.name.padEnd(26)} | ${r.f21.padEnd(18)} | ${r.f18 ? 'desc' : '—'.padEnd(4)} | ${r.f19} | ${r.f20}`);
}
