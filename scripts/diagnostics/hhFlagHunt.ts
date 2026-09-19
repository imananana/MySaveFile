// Dump per-household top-level varint fields (beyond money/sims/desc) and find
// fields that VARY across households — candidate played/NPC flags.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let buf: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!buf || d.length > buf.length) buf = d; }
const bl = buf!;
function readStr(p: number): [string, number] { const [l, n] = readVarint(bl, p); const s = new TextDecoder().decode(bl.slice(n, n + Number(l))); return [s, n + Number(l)]; }
// find anchors (same heuristic as households.ts)
const anchors: { start: number; id: bigint; name: string; bodyStart: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < bl.length - 40; i++) {
  if (bl[i] !== 0x09 || bl[i + 9] !== 0x11) continue;
  let pos = i + 10; if (pos + 8 > bl.length) continue;
  const id = readFixed64LE(bl, pos); pos += 8;
  if (bl[pos] !== 0x1a) continue; pos++;
  const [name, an] = readStr(pos);
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  pos = an; if (bl[pos] !== 0x21) continue; pos++; pos += 8;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ start: i, id, name, bodyStart: pos });
}
// per household, collect wiretype-0 fields
const fieldVals = new Map<number, Map<string, number>>(); // fn -> value -> count
const perHh: { name: string; fields: Map<number, bigint> }[] = [];
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai];
  const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(bl.length, a.bodyStart + 200000);
  let p = a.bodyStart; const fields = new Map<number, bigint>();
  while (p < end) {
    if (bl[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(bl, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(bl, p); p = nn; if (![5].includes(fn)) { fields.set(fn, v); const m = fieldVals.get(fn) ?? new Map(); m.set(v.toString(), (m.get(v.toString()) ?? 0) + 1); fieldVals.set(fn, m); } }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, nn] = readVarint(bl, p); p = nn + Number(l); }
    else if (wt === 5) p += 4; else break;
  }
  perHh.push({ name: a.name, fields });
}
console.log(`${anchors.length} households. Top-level varint fields (excl. money f5) that VARY:`);
for (const [fn, m] of [...fieldVals].sort((a,b)=>a[0]-b[0])) {
  if (m.size > 1 && m.size <= 6) {
    const dist = [...m].map(([v,c])=>`${v}×${c}`).join(', ');
    console.log(`  f${fn}: ${m.size} distinct → ${dist}`);
  }
}
console.log('\nFirst 12 households — their varint fields:');
for (const h of perHh.slice(0, 12)) console.log(`  ${h.name}: ${[...h.fields].map(([f,v])=>`f${f}=${v}`).join(' ')}`);
