// READ-ONLY: hunt the save for occurrences of TRUE RelationshipBit tuning ids
// (varint and fixed64 encodings) and report where they cluster — nearest
// sim-record owner and distance to the nearest occurrence of a given pair's
// sim ids. Anchored on seeded ground-truth pairs.
//   relbitHunt.ts <save> "A|B" <tuningDec> [...]
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const [aName, bName] = process.argv[3].split('|');
const tunings = process.argv.slice(4).map(Number);
const NAMES: Record<number, string> = { 15811: 'Broken_Up', 15812: 'Broken_Up_Engaged', 15815: 'Divorced', 15816: 'Engaged', 15822: 'Married', 15825: 'Significant_Other', 24490: 'family_husband_wife', 8805: 'family_son_daughter', 8809: 'family_parent' };

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())!;
const A = find(aName), B = find(bName);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// pair-id offsets (fixed64 LE)
const offsetsOf = (id: bigint): number[] => {
  const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn);
  const out: number[] = [];
  outer: for (let i = 0; i <= buf.length - 8; i++) { if (buf[i] !== b[0]) continue; for (let j = 1; j < 8; j++) if (buf[i + j] !== b[j]) continue outer; out.push(i); }
  return out;
};
const varintOf = (v: bigint): number[] => { const out: number[] = []; while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; } out.push(Number(v)); return out; };
const offsetsOfBytes = (pat: number[]): number[] => { const out: number[] = []; outer: for (let i = 0; i <= buf.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (buf[i + j] !== pat[j]) continue outer; out.push(i); } return out; };
const pairOffs = [...offsetsOf(A.id), ...offsetsOf(B.id), ...offsetsOfBytes(varintOf(A.id)), ...offsetsOfBytes(varintOf(B.id))].sort((x, y) => x - y);
const nearestPair = (off: number): number => {
  let lo = 0, hi = pairOffs.length - 1, best = Infinity;
  while (lo <= hi) { const m = (lo + hi) >> 1; best = Math.min(best, Math.abs(pairOffs[m] - off)); if (pairOffs[m] < off) lo = m + 1; else hi = m - 1; }
  return best;
};

// sim anchors for ownership
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

const varintBytes = (v: number): number[] => { const out: number[] = []; while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v); return out; };

console.log(`pair: ${A.firstName} ${A.lastName} / ${B.firstName} ${B.lastName}  (pair-id occurrences: ${pairOffs.length})\n`);
for (const t of tunings) {
  const vb = varintBytes(t);
  const hits: number[] = [];
  for (let i = 0; i <= buf.length - vb.length; i++) {
    let ok = true; for (let j = 0; j < vb.length; j++) if (buf[i + j] !== vb[j]) { ok = false; break; }
    if (ok) hits.push(i);
  }
  // also fixed64
  const fxHits = offsetsOf(BigInt(t));
  const close = hits.filter((h) => nearestPair(h) < 600);
  const closeFx = fxHits.filter((h) => nearestPair(h) < 600);
  console.log(`${(NAMES[t] ?? '?').padEnd(20)} ${t}: varint×${hits.length} (≤600b of pair: ${close.length})  fixed64×${fxHits.length} (close: ${closeFx.length})`);
  for (const h of hits.slice(0, 10)) console.log(`    @${h} Δpair=${nearestPair(h)}  in ${ownerOf(h)}`);
}
