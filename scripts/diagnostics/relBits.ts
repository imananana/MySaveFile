// READ-ONLY: decode the pairwise relationship-tracker records (the `0a 10
// [idA][idB]` pair-key section before the sim records) and extract each pair's
// relationship-BIT tuning ids (f3{f1:...} entries in the f16 payload).
// Compares known-divorced pairs against married pairs (from f15) and other
// controls to isolate the ex-spouse bit.
//   relBits.ts <save> "A1|B1" "A2|B2" ...   (named pairs; or pass none to use f15 married pairs)
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily } from '../../src/lib/parser/family.js';
import { readVarint } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : id.toString(16); };
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())!;

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const le = (id: bigint) => { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn); return b; };
const matchAt = (off: number, b: Uint8Array) => { for (let j = 0; j < 8; j++) if (buf[off + j] !== b[j]) return false; return true; };

// find the pair record `0a 10 [X][Y]` for (A,B) in either order; decode bits from the f16 payload that follows
function pairBits(Aid: bigint, Bid: bigint): { found: boolean; bits: string[] } {
  const a = le(Aid), b = le(Bid);
  for (let i = 0; i < buf.length - 20; i++) {
    if (buf[i] !== 0x0a || buf[i + 1] !== 0x10) continue;
    const first = matchAt(i + 2, a) ? a : matchAt(i + 2, b) ? b : null;
    if (!first) continue;
    const second = first === a ? b : a;
    if (!matchAt(i + 10, second)) continue;
    // walk forward (max 600b) to the f16 (0x82 0x01) payload of this record
    let p = i + 18;
    const bits: string[] = [];
    for (let guard = 0; guard < 40 && p < buf.length - 4; guard++) {
      const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
      if (at <= p || fn === 0) break;
      if (fn === 1 && wt === 2) break; // next pair record started
      p = at;
      if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 5) p += 4;
      else if (wt === 2) {
        const [len, n] = readVarint(buf, p); const end = n + Number(len);
        if (fn === 16) {
          // payload: collect every f3{f1:bit} at its top level
          let q = n;
          while (q < end) {
            const [tb2, at2] = readVarint(buf, q); const fn2 = Number(tb2) >> 3, wt2 = Number(tb2) & 7;
            if (at2 <= q || fn2 === 0) break; q = at2;
            if (wt2 === 0) { const [, nn] = readVarint(buf, q); q = nn; }
            else if (wt2 === 1) q += 8;
            else if (wt2 === 5) q += 4;
            else if (wt2 === 2) {
              const [l2, n2] = readVarint(buf, q); const e2 = n2 + Number(l2);
              if (fn2 === 3) { // bit entry
                let r = n2;
                while (r < e2) {
                  const [tb3, at3] = readVarint(buf, r); const fn3 = Number(tb3) >> 3, wt3 = Number(tb3) & 7;
                  if (at3 <= r || fn3 === 0) break; r = at3;
                  if (wt3 === 0) { const [v, nn] = readVarint(buf, r); if (fn3 === 1) bits.push('0x' + v.toString(16)); r = nn; }
                  else if (wt3 === 1) r += 8; else if (wt3 === 5) r += 4;
                  else if (wt3 === 2) { const [l3, n3] = readVarint(buf, r); r = n3 + Number(l3); }
                  else break;
                }
              }
              q = e2;
            } else break;
          }
          return { found: true, bits };
        }
        p = end;
      } else break;
    }
    return { found: true, bits };
  }
  return { found: false, bits: [] };
}

// pairs to test: CLI pairs + first few f15 married pairs as controls
const cli = process.argv.slice(3).map((s) => s.split('|'));
const simIds = new Set(data.sims.map((s) => s.id));
const fam = scanFamily(buf, simIds);
const married: [bigint, bigint][] = [];
const seen = new Set<string>();
for (const [id, f] of fam) {
  if (f.spouseId && !seen.has(f.spouseId.toString(16) + id.toString(16))) {
    seen.add(id.toString(16) + f.spouseId.toString(16)); married.push([id, f.spouseId]);
  }
  if (married.length >= 4) break;
}
const tests: { label: string; a: bigint; b: bigint }[] = [];
for (const [a, b] of cli) tests.push({ label: 'CLI', a: find(a).id, b: find(b).id });
for (const [a, b] of married) tests.push({ label: 'MARRIED(f15)', a, b });

for (const t of tests) {
  const r = pairBits(t.a, t.b);
  console.log(`${t.label.padEnd(13)} ${nm(t.a)} ↔ ${nm(t.b)}\n    ${r.found ? (r.bits.length ? 'bits: ' + r.bits.join('  ') : '(pair record found, no f3 bits parsed)') : 'NO pair record found'}`);
}
