/**
 * SPIKE: decode the per-edge relationship-bit tuning IDs so we can label each
 * f30 family edge (parent / child / sibling / grandparent…). For every sim in a
 * filter, walk its record, find each smallest sub-message that holds exactly one
 * foreign sim id (= one relationship), and collect the OTHER scalar values in
 * that sub-message (the "bits"). Then tally which bit values co-occur with which
 * ground-truth relation so we can build the bit->relation map.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeRelationBits.ts [save] [filter]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312029.save`;
const filter = (process.argv[3] || 'goth').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}`.trim() : `?${id.toString(16)}`; };
const ls = (id: bigint) => simById.get(id)?.lifestage ?? '?';

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
const extById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extById.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

interface Edge { target: bigint; topField: number; bits: bigint[]; }
function extractEdges(start: number, end: number, selfId: bigint): Edge[] {
  const edges: Edge[] = [];
  function walk(s: number, e: number, depth: number, topField: number) {
    let p = s; const foreign: bigint[] = []; const big: bigint[] = []; const kids: [number, number, number][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at; const tf = depth === 0 ? fn : topField;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v !== selfId && knownIds.has(v)) foreign.push(v); else if (v >= 0x100000000n && !knownIds.has(v)) big.push(v); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v !== selfId && knownIds.has(v)) foreign.push(v); else if (v >= 0x100000000n && !knownIds.has(v)) big.push(v); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l); if (ce > e) break; kids.push([cs, ce, tf]); p = ce; }
      else if (wt === 5) p += 4; else break;
    }
    if (foreign.length === 1) edges.push({ target: foreign[0], topField, bits: big });
    if (depth < 9) for (const [cs, ce, tf] of kids) walk(cs, ce, depth + 1, depth === 0 ? tf : topField);
  }
  walk(start, end, 0, 0);
  return edges;
}

const targets = data.sims.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().match(filter));
// Bits shared across MANY edges (family/clan id, generic social bits) aren't
// discriminative — tally global frequency so we can spot the relation-specific ones.
const globalFreq = new Map<string, number>();
const printed: { from: string; edge: Edge }[] = [];

console.log(`Save: ${savePath.split('/').pop()} — filter "${filter}"\n`);
for (const s of targets) {
  const ext = extById.get(s.id); if (!ext) continue;
  const edges = extractEdges(ext[0], ext[1], s.id);
  const byTgt = new Map<string, Edge>();
  for (const e of edges) { if (e.topField !== 30) continue; const k = String(e.target); const prev = byTgt.get(k); if (!prev || e.bits.length > prev.bits.length) byTgt.set(k, e); }
  console.log(`══ ${nm(s.id)} (${s.lifestage}) [${hhBySim.get(s.id) ?? '?'}]`);
  for (const e of byTgt.values()) {
    for (const b of new Set(e.bits.map((x) => x.toString(16)))) globalFreq.set(b, (globalFreq.get(b) ?? 0) + 1);
    printed.push({ from: nm(s.id), edge: e });
    console.log(`   → ${nm(e.target)} (${ls(e.target)}): ${e.bits.map((b) => '0x' + b.toString(16)).join(' ') || '(no bits)'}`);
  }
  console.log();
}

// Bits that appear on most edges are generic (family id / social); the ones on a
// FEW edges are candidate relation-type discriminators.
const total = printed.length;
console.log(`\n=== bit frequency across ${total} edges (low count = relation-specific) ===`);
[...globalFreq.entries()].sort((a, b) => a[1] - b[1]).forEach(([b, c]) => {
  if (c < total) console.log(`   0x${b}  on ${c}/${total} edges`);
});
console.log(`   (omitted bits present on all ${total} edges = generic/family-id)`);
