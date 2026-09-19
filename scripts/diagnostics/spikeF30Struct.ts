/**
 * SPIKE: dump the protobuf STRUCTURE of field 30 (family/relationship list) for
 * one sim, so we can see how relationship-bit values are arranged relative to
 * each target sim id (are they nested per-relationship, or a parallel array?).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeF30Struct.ts [save] [name]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312029.save`;
const needle = (process.argv[3] || 'cassandra').toLowerCase();
const TOPFIELD = Number(process.argv[4] || 30);

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName} (${s.lifestage})` : null; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);

const sim = data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle));
if (!sim) { console.log('not found'); process.exit(0); }
const ai = anchors.findIndex((a) => a.id === sim.id);
const start = anchors[ai].start;
const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, start + 300_000);
console.log(`${sim.firstName} ${sim.lastName} (${sim.lifestage}) — record @${start}..${end}\n`);

const label = (v: bigint) => {
  const n = nm(v);
  if (n) return `  «SIM: ${n}»`;
  if (v === sim.id) return '  «SELF»';
  if (v >= 0x100000000n) return `  «tuning/bit?»`;
  return '';
};

// Recursive protobuf pretty-printer, but only descend into field 30 at top level.
function dump(s: number, e: number, depth: number, onlyField?: number) {
  let p = s;
  const pad = '  '.repeat(depth);
  while (p < e) {
    const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
    if (fn === 0 || at <= p) return; p = at;
    if (onlyField !== undefined && depth === 0 && fn !== onlyField) {
      // skip non-target top-level fields (just advance past their payload)
      if (wt === 0) { const [, n] = rv(buf, p); p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 2) { const [l, n] = rv(buf, p); p = n + Number(l); }
      else if (wt === 5) p += 4; else return;
      continue;
    }
    if (wt === 0) { const [v, n] = rv(buf, p); console.log(`${pad}f${fn} varint = ${v} (0x${v.toString(16)})${label(v)}`); p = n; }
    else if (wt === 1) { const v = f64(buf, p); console.log(`${pad}f${fn} fixed64 = 0x${v.toString(16)}${label(v)}`); p += 8; }
    else if (wt === 2) {
      const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l);
      if (ce > e) { console.log(`${pad}f${fn} len=${l} (overflows)`); return; }
      // heuristic: does payload look like a nested message? try; else show as bytes
      console.log(`${pad}f${fn} message len=${l} {`);
      dump(cs, ce, depth + 1);
      console.log(`${pad}}`);
      p = ce;
    }
    else if (wt === 5) { p += 4; }
    else return;
  }
}

console.log(`(showing top-level field ${TOPFIELD})\n`);
dump(start, end, 0, TOPFIELD);
