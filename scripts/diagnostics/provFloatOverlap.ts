// Are the .siminfo and the save's sim-record CAS blobs the SAME appearance values
// in DIFFERENT framing? Extract plausible slider floats (finite, |x|<16, ≠0) from
// each and measure multiset overlap. High overlap ⇒ same data, decodable cross-format.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2] ?? 'Slot_1239123c.save';
const FIRST = process.argv[3] ?? 'Bella';
const LAST = process.argv[4] ?? 'Goth';
const SIMINFO = `${process.env.HOME}/Documents/Premade SimInfo/${process.argv[5] ?? 'premadeSimTemplate_BellaGoth.siminfo'}`;

function floats(buf: Uint8Array, start = 0, end = buf.length): number[] {
  const out: number[] = []; const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = start; i + 4 <= end; i++) {
    const f = dv.getFloat32(i, true);
    if (Number.isFinite(f) && f !== 0 && Math.abs(f) < 16 && Math.abs(f) > 1e-4) out.push(Math.round(f * 1e4) / 1e4);
  }
  return out;
}
const multisetOverlap = (a: number[], b: number[]) => {
  const mb = new Map<number, number>(); for (const x of b) mb.set(x, (mb.get(x) ?? 0) + 1);
  let hit = 0; for (const x of a) { const c = mb.get(x) ?? 0; if (c > 0) { hit++; mb.set(x, c - 1); } }
  return hit;
};

const si = readFileSync(SIMINFO);
const siF = floats(si, 0x5c);

const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
let simAt = -1;
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  let p = i + 9; if (buf[p] !== 0x11) continue; p += 9;
  if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p += 9;
  if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
  if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
  if (first === FIRST && last === LAST) { simAt = i; break; }
}
// collect the sim's big wt=2 blobs (f6/f18/f21/f28/f30) end-to-end as the appearance region
let p = simAt, c = 0, lo = buf.length, hi = 0;
while (p < buf.length && p < simAt + 14000 && c < 500) {
  if (buf[p] === 0) break; let tag: bigint, n: number; try { [tag, n] = readVarint(buf, p); } catch { break; }
  p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
  if (wt === 0) { const [, x] = readVarint(buf, p); p = x; }
  else if (wt === 1) p += 8;
  else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); if (len >= 200 && [6, 18, 21, 28, 30].includes(fn)) { lo = Math.min(lo, x); hi = Math.max(hi, x + len); } p = x + len; }
  else if (wt === 5) p += 4; else break;
  c++;
}
const saveF = floats(buf, lo, hi);
const hit = multisetOverlap(siF, saveF);
console.log(`${FIRST} ${LAST}  —  ${SIMINFO.split('/').pop()} vs ${save}`);
console.log(`  .siminfo slider floats:        ${siF.length}`);
console.log(`  save CAS-blob region floats:   ${saveF.length}  (bytes ${lo}..${hi})`);
console.log(`  .siminfo floats also in save:  ${hit} / ${siF.length}  (${(hit / siF.length * 100).toFixed(1)}%)`);
console.log(`  verdict: ${hit / siF.length > 0.85 ? 'SAME VALUES, different framing → cross-format decode CAN do edit-detection'
  : hit / siF.length > 0.4 ? 'PARTIAL overlap → some shared sliders; framing + value-set differ'
  : 'LOW overlap → .siminfo and save encode appearance differently/independently'}`);
console.log(`\n  sample .siminfo floats: ${siF.slice(0, 12).join(', ')}`);
console.log(`  sample save floats:     ${saveF.slice(0, 12).join(', ')}`);
