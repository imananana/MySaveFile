// Where does a premade EDIT physically live? Diff a named sim's CAS appearance
// blobs (sim-record f18/f21/f28/f30 + f6 float array) between two saves.
//   identical bytes = untouched;  differ = CAS-edited.
// Usage: npx tsx provSimCasDiff.ts "First Last" <editedSave> <pristineSave>
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const [full, saveA, saveB] = [process.argv[2] ?? 'Bob Pancakes', process.argv[3] ?? 'Slot_10312029.save', process.argv[4] ?? 'Slot_1239123c.save'];
const [FIRST, ...rest] = full.split(' '); const LAST = rest.join(' ');

function main0d(file: string): Uint8Array {
  const b = readFileSync(`${SAVES}/${file}`);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  let buf: Uint8Array | null = null;
  for (const r of parseDbpf(ab).filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!buf || d.length > buf.length) buf = d; }
  return buf!;
}
// return the CAS appearance fields {fn: bytes} for the first sim matching FIRST/LAST
function casBlobs(buf: Uint8Array): Record<number, Uint8Array> | null {
  for (let i = 0; i + 40 < buf.length; i++) {
    if (buf[i] !== 0x09) continue;
    let p = i + 9; if (buf[p] !== 0x11) continue; p += 9;
    if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
    if (buf[p] !== 0x21) continue; p += 9;
    if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
    if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
    if (buf[p] !== 0x38) continue;
    if (first !== FIRST || last !== LAST) continue;
    // walk body, grab wt2 fields 6/18/21/28/30
    const out: Record<number, Uint8Array> = {}; let q = p, c = 0;
    while (q < buf.length && q < p + 16000 && c++ < 500) {
      if (buf[q] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, q); } catch { break; } q = nn;
      const fn = Number(t >> 3n), wt = Number(t & 7n);
      if (wt === 0) { const [, x] = readVarint(buf, q); q = x; }
      else if (wt === 1) q += 8;
      else if (wt === 2) { const [l, x] = readVarint(buf, q); const len = Number(l); if ([6, 18, 21, 28, 30].includes(fn) && len >= 8) out[fn] = buf.subarray(x, x + len); q = x + len; }
      else if (wt === 5) q += 4; else break;
    }
    return out;
  }
  return null;
}
const eq = (a?: Uint8Array, b?: Uint8Array) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

const A = casBlobs(main0d(saveA)), B = casBlobs(main0d(saveB));
console.log(`\n${FIRST} ${LAST}:  A=${saveA}  vs  B=${saveB}\n`);
if (!A || !B) { console.log(`  sim not found in ${!A ? saveA : saveB}`); process.exit(0); }
let anyDiff = false;
for (const fn of [6, 18, 21, 28, 30]) {
  const a = A[fn], b = B[fn];
  const same = eq(a, b);
  if (!same) anyDiff = true;
  console.log(`  f${fn}: A=${a ? a.length + 'B' : '—'}  B=${b ? b.length + 'B' : '—'}  → ${same ? 'identical' : 'DIFFERS'}`);
}
console.log(`\n  VERDICT: ${anyDiff ? 'CAS blobs DIFFER → this sim was edited (your changes live here, sim-level)' : 'identical → untouched appearance'}`);
