// READ-ONLY: dump a given top-level field's raw bytes from named sims' records.
//   dumpField.ts <save> <fieldNum> "Name|idHex" ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const FIELD = Number(process.argv[3]);
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : '‹' + id.toString(16) + '›'; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = readFixed64LE(buf, i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

for (const spec of process.argv.slice(4)) {
  const id = BigInt('0x' + spec.split('|').pop()!.replace(/^0x/, ''));
  const e = ext.get(id);
  if (!e) { console.log(`${spec}: no extent`); continue; }
  let p = e[0]; let shown = false;
  while (p < e[1]) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) { if (fn === FIELD) { console.log(`${nm(id)}  f${FIELD} (fixed64) = ${nm(readFixed64LE(buf, p))}`); shown = true; } p += 8; }
    else if (wt === 5) p += 4;
    else if (wt === 2) {
      const [l, n] = readVarint(buf, p); const end2 = n + Number(l);
      if (fn === FIELD) {
        shown = true;
        const hex = [...buf.slice(n, end2)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`${nm(id)}  f${FIELD} (msg ${Number(l)}b): ${hex}`);
        // try: submessage fields incl any fixed64 sim id
        let q = n;
        while (q < end2) {
          const [tb2, at2] = readVarint(buf, q); const fn2 = Number(tb2) >> 3, wt2 = Number(tb2) & 7;
          if (fn2 === 0 || at2 <= q) break; q = at2;
          if (wt2 === 0) { const [v, nn] = readVarint(buf, q); console.log(`     .f${fn2} varint = ${v}${simIds.has(v) ? '  ← SIM: ' + nm(v) : ''}`); q = nn; }
          else if (wt2 === 1) { const v = readFixed64LE(buf, q); console.log(`     .f${fn2} fixed64 = 0x${v.toString(16)}${simIds.has(v) ? '  ← SIM: ' + nm(v) : ''}`); q += 8; }
          else if (wt2 === 5) q += 4;
          else if (wt2 === 2) { const [l2, n2] = readVarint(buf, q); console.log(`     .f${fn2} msg ${Number(l2)}b`); q = n2 + Number(l2); }
          else break;
        }
      }
      p = end2;
    } else break;
  }
  if (!shown) console.log(`${nm(id)}  f${FIELD}: absent`);
}
