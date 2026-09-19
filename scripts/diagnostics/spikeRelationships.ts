/**
 * FEASIBILITY SPIKE (not shipping): can we extract sim-to-sim relationships
 * (and thus family trees) from a .save?
 *
 * Approach: parse sims + household rosters with the existing parser, then
 * recursively walk a sim's protobuf record and flag any varint/fixed64 value
 * that equals ANOTHER known sim ID — those are relationship targets. Report
 * which top-level field carries them (the relationship list), and dump the
 * tuning-ID-looking values inside each entry (candidate "relationship bits"
 * that encode father/mother/spouse/sibling).
 *
 *   node_modules/.bin/tsx scripts/diagnostics/spikeRelationships.ts [savePath]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2]
  || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00001706.save`;

console.log(`Loading ${savePath}…`);
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const name = (id: bigint) => {
  const s = simById.get(id);
  return s ? `${s.firstName} ${s.lastName}`.trim() : `?${id.toString(16)}`;
};
console.log(`Parsed ${data.sims.length} sims, ${data.households.length} households.`);

// Largest decompressed 0x0d blob — the master state.
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
if (!blob) throw new Error('no 0x0d resource');
const buf = blob;

// ── minimal protobuf readers ────────────────────────────────────────────────
function rv(b: Uint8Array, p: number): [bigint, number] {
  let res = 0n, shift = 0n, i = p;
  while (i < b.length) {
    const byte = b[i]; i++;
    res |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7n;
    if (shift > 70n) break;
  }
  return [res, i];
}
function f64(b: Uint8Array, p: number): bigint {
  let v = 0n;
  for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k);
  return v;
}

// ── locate sim record start offsets (mirror scanFullSimAnchors' anchor) ───────
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9;
  if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++;
  const [, afterTs] = rv(buf, pos); pos = afterTs;
  if (buf[pos] !== 0x21) continue; pos += 9;
  if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1);
  if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i });
  i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const extentEnd = (idx: number) => (idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, anchors[idx].start + 300_000));
console.log(`Located ${anchors.length} sim-record anchors.\n`);

// ── recursive walk: collect scalars that match a foreign sim ID ───────────────
interface Hit { topField: number; path: string; value: bigint; }
function collect(start: number, end: number, selfId: bigint): { hits: Hit[]; bigVals: Map<string, bigint[]> } {
  const hits: Hit[] = [];
  // for the relationship top-field, gather large (tuning-ID-like) values grouped by top-field
  const bigVals = new Map<string, bigint[]>();
  function walk(s: number, e: number, depth: number, topField: number, path: string) {
    let p = s;
    while (p < e) {
      const [tagBig, afterTag] = rv(buf, p);
      const tag = Number(tagBig);
      const fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || afterTag <= p) return;
      p = afterTag;
      const tf = depth === 0 ? fn : topField;
      const childPath = `${path}.${fn}`;
      if (wt === 0) {
        const [v, n] = rv(buf, p);
        if (v !== selfId && knownIds.has(v)) hits.push({ topField: tf, path: childPath, value: v });
        else if (v >= 0x100000000n && !knownIds.has(v)) { const k = String(tf); (bigVals.get(k) ?? bigVals.set(k, []).get(k)!).push(v); }
        p = n;
      } else if (wt === 1) {
        const v = f64(buf, p);
        if (v !== selfId && knownIds.has(v)) hits.push({ topField: tf, path: childPath, value: v });
        else if (v >= 0x100000000n && !knownIds.has(v)) { const k = String(tf); (bigVals.get(k) ?? bigVals.set(k, []).get(k)!).push(v); }
        p += 8;
      } else if (wt === 2) {
        const [l, n] = rv(buf, p);
        const cs = n, ce = n + Number(l);
        if (ce > e) return;
        if (depth < 7) walk(cs, ce, depth + 1, tf, childPath);
        p = ce;
      } else if (wt === 5) {
        p += 4;
      } else return;
    }
  }
  walk(start, end, 0, 0, 'r');
  return { hits, bigVals };
}

// ── pick rich targets: humans in the largest multi-human households ───────────
const humanHouseholds = data.households
  .map((h) => ({ h, members: h.simIds.filter((id) => simById.get(id)?.species === 'human') }))
  .filter((x) => x.members.length >= 2)
  .sort((a, b) => b.members.length - a.members.length)
  .slice(0, 3);

for (const { h, members } of humanHouseholds) {
  console.log(`\n══ Household "${h.name}" — ${members.length} humans ══`);
  for (const m of members) console.log(`   • ${name(m)} (${simById.get(m)?.lifestage})`);
  console.log(`\n   ▸ Relationship edges (every member, → who they reference + field):`);
  for (const m of members) {
    const idx = anchors.findIndex((a) => a.id === m);
    if (idx < 0) { console.log(`     ${name(m)}: no record`); continue; }
    const { hits, bigVals } = collect(anchors[idx].start, extentEnd(idx), m);
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const hit of hits) {
      const key = `${hit.topField}:${hit.value}`;
      if (seen.has(key)) continue; seen.add(key);
      parts.push(`${name(hit.value)}[f${hit.topField}]`);
    }
    console.log(`     ${name(m)} (${simById.get(m)?.lifestage}) → ${parts.length ? parts.join(', ') : '(none)'}`);
    // distinct big/tuning IDs seen in the relationship fields (candidate family bits)
    const bits = new Set<string>();
    for (const k of ['15', '30']) for (const v of (bigVals.get(k) ?? [])) bits.add('0x' + v.toString(16));
    if (bits.size) console.log(`        bits: ${[...bits].slice(0, 8).join(', ')}`);
  }
}

// ── raw adjacency probe: within the top household, does each member's record
//    contain each other member's 8-byte LE sim ID? (catches refs regardless of
//    protobuf nesting depth — proves the family graph is physically present.) ──
function leBytes(id: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = id;
  for (let k = 0; k < 8; k++) { out[k] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
function countOccurrences(start: number, end: number, needle: Uint8Array): number {
  let c = 0;
  for (let i = start; i <= end - 8; i++) {
    let ok = true;
    for (let k = 0; k < 8; k++) if (buf[i + k] !== needle[k]) { ok = false; break; }
    if (ok) c++;
  }
  return c;
}
const extentById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extentById.set(a.id, [a.start, extentEnd(i)]));

if (humanHouseholds.length) {
  const { h, members } = humanHouseholds[0];
  console.log(`\n══ Raw adjacency matrix — "${h.name}" (count of B's id inside A's record) ══`);
  const hdr = members.map((m) => name(m).split(' ')[0].slice(0, 6).padStart(6)).join(' ');
  console.log(`            ${hdr}`);
  for (const a of members) {
    const ext = extentById.get(a);
    const row = members.map((b) => {
      if (a === b || !ext) return '     ·';
      return String(countOccurrences(ext[0], ext[1], leBytes(b))).padStart(6);
    }).join(' ');
    console.log(`   ${name(a).split(' ')[0].slice(0, 8).padEnd(8)} ${row}`);
  }
  // total cross-save reference count for the first member (how connected overall)
  const target = members[0];
  const total = countOccurrences(0, buf.length, leBytes(target));
  console.log(`\n   ${name(target)} id appears ${total}× across the entire 0x0d blob`);
  console.log(`   (self-record + every other sim/structure that references them)`);
}
