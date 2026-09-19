/**
 * FEASIBILITY SPIKE pt.2 (not shipping): per-EDGE relationship bits, to build
 * the bit→relation decoder. Ties each relationship-"bit" tuning ID to the
 * specific target sim, and flags cross-household family links.
 *
 * Ground-truth target: the Landgraabs + Johnny Zest (estranged son, separate
 * household) — proves family edges span households.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeFamilyBits.ts [savePath] [nameFilter]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2]
  || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00001706.save`;
const filter = (process.argv[3] || 'landgraab|zest').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));

// sim → household name
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const nm = (id: bigint) => {
  const s = simById.get(id);
  return s ? `${s.firstName} ${s.lastName}`.trim() : `?${id.toString(16)}`;
};

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
if (!blob) throw new Error('no 0x0d');
const buf = blob;

function rv(b: Uint8Array, p: number): [bigint, number] {
  let res = 0n, shift = 0n, i = p;
  while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << shift; if (!(x & 0x80)) break; shift += 7n; if (shift > 70n) break; }
  return [res, i];
}
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

// anchors → record extents
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9;
  if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++;
  const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9;
  if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1);
  if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i });
  i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const extById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extById.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// per-edge extractor: a relationship entry = smallest sub-message holding exactly
// one foreign sim id; its direct big (≥2^32) values are the edge's bits.
interface Edge { target: bigint; field: number; bits: bigint[]; }
function extractEdges(start: number, end: number, selfId: bigint): Edge[] {
  const edges: Edge[] = [];
  function walk(s: number, e: number, depth: number, topField: number) {
    let p = s;
    const foreign: bigint[] = [];
    const big: bigint[] = [];
    const kids: [number, number, number][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p);
      const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break;
      p = at;
      const tf = depth === 0 ? fn : topField;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v !== selfId && knownIds.has(v)) foreign.push(v); else if (v >= 0x100000000n && !knownIds.has(v)) big.push(v); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v !== selfId && knownIds.has(v)) foreign.push(v); else if (v >= 0x100000000n && !knownIds.has(v)) big.push(v); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l); if (ce > e) break; kids.push([cs, ce, tf]); p = ce; }
      else if (wt === 5) p += 4;
      else break;
    }
    if (foreign.length === 1) edges.push({ target: foreign[0], field: topField, bits: big });
    if (depth < 9) for (const [cs, ce, tf] of kids) walk(cs, ce, depth + 1, depth === 0 ? tf : topField);
  }
  walk(start, end, 0, 0);
  return edges;
}

const targets = data.sims.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().match(filter));
console.log(`Save: ${savePath.split('/').pop()} — ${data.sims.length} sims`);
console.log(`Matched "${filter}": ${targets.map((s) => `${s.firstName} ${s.lastName} [${hhBySim.get(s.id) ?? '?'}]`).join(', ')}\n`);

for (const s of targets) {
  const ext = extById.get(s.id);
  if (!ext) { console.log(`${s.firstName} ${s.lastName}: no record\n`); continue; }
  const edges = extractEdges(ext[0], ext[1], s.id);
  // dedupe by target+field, prefer the entry with most bits
  const byTgt = new Map<string, Edge>();
  for (const e of edges) {
    const k = `${e.field}:${e.target}`;
    const prev = byTgt.get(k);
    if (!prev || e.bits.length > prev.bits.length) byTgt.set(k, e);
  }
  const myHh = hhBySim.get(s.id) ?? '?';
  console.log(`══ ${s.firstName} ${s.lastName} (${s.gender}, ${s.lifestage}) — household "${myHh}"`);
  // byte offset of a target's 8-byte LE id within the record
  const leOff = (target: bigint): number => {
    const need = new Uint8Array(8);
    let v = target; for (let k = 0; k < 8; k++) { need[k] = Number(v & 0xffn); v >>= 8n; }
    for (let i = ext[0]; i <= ext[1] - 8; i++) {
      let ok = true; for (let k = 0; k < 8; k++) if (buf[i + k] !== need[k]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  };
  const hex = (a: number, b: number) => Array.from(buf.slice(a, b)).map((x) => x.toString(16).padStart(2, '0')).join(' ');

  for (const e of [...byTgt.values()]) {
    const tHh = hhBySim.get(e.target) ?? '?';
    const cross = tHh !== myHh ? '  ⟂ CROSS-HOUSEHOLD' : '';
    const t = simById.get(e.target);
    console.log(`   → ${nm(e.target)} (${t?.gender ?? '?'}, ${t?.lifestage ?? '?'}) [f${e.field}]${cross}`);
    const off = leOff(e.target);
    if (off >= 0) {
      // tag byte right before the id reveals the field# the id is stored under
      console.log(`        @${off}  pre-tag=0x${buf[off - 1].toString(16)}  window:`);
      console.log(`        ${hex(off - 16, off)} | [ID] | ${hex(off + 8, off + 72)}`);
    }
  }
  console.log();
}
