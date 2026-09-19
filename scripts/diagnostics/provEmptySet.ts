// List households with f21 empty/absent AND f19==0, with diagnostic columns, to
// look for a field that delineates EA-signature NPCs (Father Winter) from generic
// pool townies. Also dumps the DISTINCT field-presence signatures within that set.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2] ?? 'Slot_1239123c.save';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

const anchors: { id: bigint; name: string; lotId: bigint; bodyStart: number; start: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  let pos = i + 10; if (pos + 8 > buf.length) continue;
  const id = readFixed64LE(buf, pos); pos += 8;
  if (buf[pos] !== 0x1a) continue; pos++;
  const [nm, an] = readString(buf, pos);
  if (!nm || nm.length < 2 || nm.length > 60 || !/^[\x20-\x7e]+$/.test(nm) || nm.includes('_')) continue;
  pos = an; if (buf[pos] !== 0x21) continue; pos++; if (pos + 8 > buf.length) continue;
  const lotId = readFixed64LE(buf, pos); pos += 8;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ id, name: nm, lotId, bodyStart: pos, start: i });
}

function parse(start: number, end: number) {
  const f: Record<number, string> = {};
  let f21state = 'absent', f19 = 0n, simCount = 0;
  let p = start;
  while (p < end) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; f[fn] = v.toString(); if (fn === 19) f19 = v; }
    else if (wt === 1) { p += 8; if (!(fn in f)) f[fn] = 'fx64'; }
    else if (wt === 2) {
      const [l, nn] = readVarint(buf, p); const len = Number(l); const vEnd = nn + len; if (l < 0n || vEnd > end) break;
      if (fn === 21) f21state = len === 0 ? 'empty' : new TextDecoder().decode(buf.slice(nn, vEnd));
      if (fn === 11) { for (let q = nn; q < vEnd; q++) { if (buf[q] === 0x0a) { const [sl, ss] = readVarint(buf, q + 1); simCount = Number(sl) / 8; break; } } }
      if (!(fn in f)) f[fn] = `len${len}`;
      p = vEnd;
    } else if (wt === 5) p += 4; else break;
  }
  return { f, f21state, f19, simCount };
}

const rows = anchors.map((a, ai) => {
  const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, a.bodyStart + 300000);
  return { ...a, ...parse(a.bodyStart, end) };
});

const set = rows.filter(r => (r.f21state === 'empty' || r.f21state === 'absent') && r.f19 === 0n);
console.log(`${save}: ${rows.length} households; ${set.length} with f21 empty/absent AND f19=0\n`);
console.log('name | sims | lot? | funds(f5) | desc(f18) | f10 | f14 | f26 | f28 | f35 | other-fields');
const baseKeys = new Set([5, 6, 9, 10, 11, 14, 16, 18, 19, 20, 21, 22, 25, 26, 28, 31, 32, 33, 34, 35]);
for (const r of set) {
  const other = Object.keys(r.f).map(Number).filter(k => !baseKeys.has(k)).map(k => `f${k}`).join(',');
  console.log(`${r.name.padEnd(24)} | ${r.simCount} | ${r.lotId !== 0n ? 'Y' : '·'} | ${r.f[5] ?? '—'} | ${r.f[18]?.startsWith('len0') ? '·' : (r.f[18] ?? '·')} | ${r.f[10] ?? '·'} | ${r.f[14] ?? '·'} | ${r.f[26] ?? '·'} | ${r.f[28] ?? '·'} | ${r.f[35] ?? '·'} | ${other || '—'}`);
}

// distinct field-key signatures within the set
console.log('\nDistinct field-key signatures in this set (which fields present → count):');
const sig = new Map<string, number>();
for (const r of set) { const k = Object.keys(r.f).map(Number).sort((a, b) => a - b).join(','); sig.set(k, (sig.get(k) ?? 0) + 1); }
for (const [k, c] of [...sig].sort((a, b) => b[1] - a[1])) console.log(`   [${c}] ${k}`);
