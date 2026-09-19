// READ-ONLY: search EVERY resource in the save package (all types, not just
// the master 0x0d blob) for a sim pair's ids (fixed64 LE + varint encodings).
// Reports each resource holding either id, with co-occurrence proximity.
//   fullSaveScan.ts <save> "Name A" "Name B"
import { readFileSync } from 'fs';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2];
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())!;
const A = find(process.argv[3]), B = find(process.argv[4]);
console.log(`A=${A.firstName} ${A.lastName}  B=${B.firstName} ${B.lastName}  — scanning ${resources.length} resources\n`);

const fx = (id: bigint) => { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn); return b; };
const vr = (id: bigint) => { const out: number[] = []; let v = id; while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; } out.push(Number(v)); return Uint8Array.from(out); };
const pats = { Afx: fx(A.id), Bfx: fx(B.id), Avr: vr(A.id), Bvr: vr(B.id) };
function findAll(hay: Uint8Array, pat: Uint8Array): number[] {
  const out: number[] = [];
  outer: for (let i = 0; i <= hay.length - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (hay[i + j] !== pat[j]) continue outer; out.push(i); }
  return out;
}
for (const r of resources) {
  let d: Uint8Array;
  try { d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; } catch { continue; }
  if (d.length < 16) continue;
  const hitsA = [...findAll(d, pats.Afx), ...findAll(d, pats.Avr)];
  const hitsB = [...findAll(d, pats.Bfx), ...findAll(d, pats.Bvr)];
  if (!hitsA.length && !hitsB.length) continue;
  let minD = Infinity;
  for (const a of hitsA) for (const b of hitsB) minD = Math.min(minD, Math.abs(a - b));
  console.log(`type 0x${(r.type >>> 0).toString(16).padStart(8, '0')}  inst ${instanceIdHex(r)}  size ${d.length}  A×${hitsA.length} B×${hitsB.length}  minΔ=${minD === Infinity ? '—' : minD}`);
}
