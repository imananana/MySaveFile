// READ-ONLY: dump all top-level protobuf fields for a set of sim ids (hex),
// side by side, to find which field distinguishes them. Usage:
//   cmpFields.ts <save> <idHex> <idHex> ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const wantIds = process.argv.slice(3).map((h) => BigInt('0x' + h.replace(/^0x/, '')));
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const byId = new Map(data.sims.map((s) => [s.id, s]));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const f64 = (p: number) => readFixed64LE(buf, p);
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// Returns scalar fields (varint/fixed) as decimal; marks presence of message (wt2) fields.
function fields(start: number, end: number): Map<number, string> {
  const m = new Map<number, string>(); let p = start;
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = readVarint(buf, p); if (!m.has(fn)) m.set(fn, v.toString()); p = n; }
    else if (wt === 1) { if (!m.has(fn)) m.set(fn, '0x' + f64(p).toString(16)); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); if (!m.has(fn)) m.set(fn, `‹msg ${Number(l)}b›`); p = n + Number(l); }
    else if (wt === 5) { const v = (buf[p]|buf[p+1]<<8|buf[p+2]<<16|buf[p+3]<<24)>>>0; if (!m.has(fn)) m.set(fn, `f32:${v}`); p += 4; }
    else break;
  }
  return m;
}

const cols = wantIds.map((id) => {
  const s = byId.get(id); const e = ext.get(id);
  return { id, name: s ? `${s.firstName} ${s.lastName}` : '?', map: e ? fields(e[0], e[1]) : new Map<number,string>() };
});
const allFns = [...new Set(cols.flatMap((c) => [...c.map.keys()]))].sort((a, b) => a - b);
const W = 18;
console.log('field '.padEnd(7) + cols.map((c) => `f${''}`).join(''));
console.log(''.padEnd(7) + cols.map((c) => c.name.slice(0, W - 1).padEnd(W)).join(''));
console.log(''.padEnd(7) + cols.map((c) => (c.id.toString(16).slice(-8)).padEnd(W)).join(''));
console.log('─'.repeat(7 + cols.length * W));
for (const fn of allFns) {
  const vals = cols.map((c) => c.map.get(fn) ?? '·');
  const diff = new Set(vals).size > 1 ? '◆' : ' ';
  console.log(`${diff}f${String(fn).padEnd(4)} ` + vals.map((v) => v.padEnd(W)).join(''));
}
console.log('\n◆ = differs across the listed sims');
