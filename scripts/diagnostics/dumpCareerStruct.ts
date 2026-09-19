/* Dump the FULL f30.f12 career structure (both f1 and f2 sub-messages, all
 * fields) for named sims, to characterize f1 vs f2.
 * Run: npx tsx scripts/diagnostics/dumpCareerStruct.ts <savePath> <needle...> */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { STOCK_CAREERS } from '../../src/data/stockCareers.js';

const savePath = process.argv[2];
const NEEDLES = process.argv.slice(3).map((s) => s.toLowerCase());

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;

function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };
const hx = (v: bigint | number) => '0x' + BigInt(v).toString(16);

const known = new Set(data.sims.map((s) => s.id));
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue; let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!known.has(id)) continue; anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// flat field dump of one message {fieldNum -> printed values}; nested -> recurse one level
function fields(s: number, e: number): string {
  const parts: string[] = []; let q = s;
  while (q < e) {
    const [tb, at] = rv(buf, q); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= q) break; q = at;
    if (wt === 0) { const [v, n] = rv(buf, q); parts.push(`f${fn}=${STOCK_CAREERS[hx(v)] ? `${hx(v)}<${STOCK_CAREERS[hx(v)].name}>` : v}`); q = n; }
    else if (wt === 1) { parts.push(`f${fn}=${hx(f64(buf, q))}`); q += 8; }
    else if (wt === 5) { parts.push(`f${fn}=fix32`); q += 4; }
    else if (wt === 2) { const [l, n] = rv(buf, q); parts.push(`f${fn}={${fields(n, n + Number(l))}}`); q = n + Number(l); }
    else break;
  }
  return parts.join(' ');
}

// walk to each .f30.f12 entry and dump its inner f1 and f2
function dumpF12(recS: number, recE: number) {
  function walk(s: number, e: number, path: string) {
    if (path === '.f30.f12') { console.log(`   f12 entry: ${fields(s, e)}`); return; }
    let p = s;
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [, n] = rv(buf, p); p = n; } else if (wt === 1) p += 8; else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce <= e) walk(n, ce, `${path}.f${fn}`); p = ce; } else break;
    }
  }
  walk(recS, recE, '');
}

console.log(`# ${savePath.split('/').pop()}`);
for (const sim of data.sims) {
  const full = `${sim.firstName} ${sim.lastName}`.trim();
  if (!NEEDLES.some((n) => full.toLowerCase().includes(n))) continue;
  console.log(`\n${full} [${sim.lifestage}]  parser=${sim.career ? `${sim.career.name} L${sim.career.level}` : '—'}`);
  dumpF12(...ext.get(sim.id)!);
}
