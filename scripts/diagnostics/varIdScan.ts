// READ-ONLY: find every LEB128(varint) occurrence of the named sims' ids in
// the 0x0d blob, with sim-record owner attribution — catches pointers that
// fixed64 scans miss.   varIdScan.ts <save> "Name" ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const names = process.argv.slice(3);
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())!;

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
const ownerOf = (off: number): string => {
  let lo = 0, hi = anchors.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (anchors[m].start <= off) { best = m; lo = m + 1; } else hi = m - 1; }
  if (best < 0) return 'pre-sims';
  const s = byId.get(anchors[best].id)!;
  return `${s.firstName} ${s.lastName}+${off - anchors[best].start}`;
};
for (const name of names) {
  const sim = find(name);
  let v = sim.id; const pat: number[] = [];
  while (v >= 0x80n) { pat.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  pat.push(Number(v));
  const hits: number[] = [];
  outer: for (let i = 0; i <= buf.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (buf[i + j] !== pat[j]) continue outer; hits.push(i); }
  console.log(`\n${name} (${sim.id.toString(16)}) — varint ×${hits.length}`);
  for (const h of hits.slice(0, 12)) {
    const tag = buf[h - 1];
    console.log(`   @${h}  prevTagByte=0x${tag.toString(16)}  in ${ownerOf(h)}`);
  }
}
