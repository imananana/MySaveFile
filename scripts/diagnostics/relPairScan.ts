// READ-ONLY: locate the pairwise relationship container. Scans the whole 0x0d
// blob for offsets where BOTH ids of a sim pair occur (as fixed64 LE) within
// WINDOW bytes of each other — pairwise relationship records must hold both.
// Reports each co-occurrence with which sim-record extent it falls in (or
// "outside sim records" = a separate tracker section).
//   relPairScan.ts <save> "Name A" "Name B"
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())!;
const A = find(process.argv[3]), B = find(process.argv[4]);
console.log(`A=${A.firstName} ${A.lastName} (${A.id.toString(16)})  B=${B.firstName} ${B.lastName} (${B.id.toString(16)})`);

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// all offsets of a fixed64 LE id
function offsetsOf(id: bigint): number[] {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bytes[i] = Number((id >> BigInt(8 * i)) & 0xffn);
  const out: number[] = [];
  outer: for (let i = 0; i <= buf.length - 8; i++) {
    if (buf[i] !== bytes[0]) continue;
    for (let j = 1; j < 8; j++) if (buf[i + j] !== bytes[j]) continue outer;
    out.push(i);
  }
  return out;
}

// sim-record extents (same anchor walk as other diagnostics)
const simIds = new Set(data.sims.map((s) => s.id));
const byId = new Map(data.sims.map((s) => [s.id, s]));
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
  if (best < 0) return 'BEFORE sim records';
  const a = anchors[best]; const next = anchors[best + 1];
  if (next && off >= next.start) return 'after last';
  const s = byId.get(a.id)!;
  return `in ${s.firstName} ${s.lastName}'s record (+${off - a.start}b)`;
};

const WINDOW = 300;
const offA = offsetsOf(A.id), offB = offsetsOf(B.id);
console.log(`occurrences: A×${offA.length}  B×${offB.length}  (sim records span ${anchors[0].start}..${anchors[anchors.length-1].start})`);
let hits = 0;
for (const oa of offA) for (const ob of offB) {
  if (Math.abs(oa - ob) <= WINDOW) {
    hits++;
    console.log(`\n  A@${oa} + B@${ob} (Δ${ob - oa})  →  ${ownerOf(Math.min(oa, ob))}`);
    // dump 48 bytes around the earlier offset as hex for structure eyeballing
    const st = Math.max(0, Math.min(oa, ob) - 16);
    const hex = [...buf.slice(st, st + 80)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  bytes@${st}: ${hex}`);
  }
}
if (!hits) console.log('\n  NO co-occurrence within ' + WINDOW + 'b — pair records may not exist (relationship culled on divorce?)');
