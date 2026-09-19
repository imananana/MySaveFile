/**
 * SPIKE: controlled career fixture (Slot_00000003). Eight sims, each seeded with
 * a DISTINCT career at a DISTINCT rank 1-8, so we can locate the career_tracker
 * by correlating each sim's (uid, level) candidates against its known rank.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerFixture.ts [savePath]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;

const FIXTURE = [
  { name: 'spence',   career: 'Actress',            rank: 1 },
  { name: 'altman',   career: 'Detective',          rank: 2 },
  { name: 'dobbs',    career: 'Doctor',             rank: 3 },
  { name: 'hamilton', career: 'Interior Decorator', rank: 4 },
  { name: 'lujan',    career: 'Naturopath',         rank: 5 },
  { name: 'richter',  career: 'Noble',              rank: 6 },
  { name: 'mcelroy',  career: 'Reaper',             rank: 7 },
  { name: 'owens',    career: 'Scientist',          rank: 8 },
];

const HOUSEHOLD = process.argv[3] || 'G1';

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);

// Scope to the seeded household so name-matching can't grab a same-surname sim
// from another household (e.g. "Spence" ≠ "Spencer-Kim").
const hh = data.households.find((h) => h.name.toLowerCase() === HOUSEHOLD.toLowerCase())
        ?? data.households.find((h) => h.name.toLowerCase().includes(HOUSEHOLD.toLowerCase()));
if (!hh) { console.log(`household "${HOUSEHOLD}" not found. Households: ${data.households.map((h) => h.name).filter(Boolean).join(', ')}`); process.exit(0); }
const memberIds = new Set(hh.simIds.map((x) => x.toString()));
const members = data.sims.filter((s) => memberIds.has(s.id.toString()));
console.log(`Household "${hh.name}" — ${members.length} members: ${members.map((s) => `${s.firstName} ${s.lastName}`.trim()).join(', ')}\n`);
const findMember = (sub: string) => members.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

// Record anchors + extents (same signature scan as the other spikes).
const known = new Set(data.sims.map((s) => s.id));
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!known.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const extById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extById.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// Every leaf sub-message holding exactly one uid-shaped value (≥2^16) + small
// varint(s) — the (uid, level) shape. Records top field + all small values so
// we can see which "level" matches the known rank.
function candidates(start: number, end: number) {
  const out: { uid: bigint; smalls: number[]; topField: number; depth: number }[] = [];
  function walk(s: number, e: number, depth: number, topField: number) {
    let p = s; const bigs: bigint[] = []; const smalls: number[] = []; const kids: [number, number, number][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at; const tf = depth === 0 ? fn : topField;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= 0x10000n) bigs.push(v); else smalls.push(Number(v)); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v >= 0x10000n) bigs.push(v); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; kids.push([n, ce, tf]); p = ce; }
      else if (wt === 5) p += 4; else break;
    }
    if (bigs.length === 1 && smalls.length >= 1) out.push({ uid: bigs[0], smalls, topField, depth });
    if (depth < 9) for (const [cs, ce, tf] of kids) walk(cs, ce, depth + 1, tf);
  }
  walk(start, end, 0, 0);
  return out;
}

console.log(`${savePath.split('/').pop()} — ${data.sims.length} sims, ${anchors.length} anchored\n`);

// Tally: for each top field, how many fixture sims have a candidate whose level
// matches rank (or rank-1, for 0-based), with a DISTINCT uid. The career field
// is the one that hits all 8 with unique uids.
const fieldHits = new Map<string, number>();    // `${field}|${offset}` → count
const careerGuess: { sim: string; career: string; rank: number; matches: string[] }[] = [];

for (const fx of FIXTURE) {
  const sim = findMember(fx.name);
  if (!sim) { console.log(`✗ ${fx.name} (${fx.career} ${fx.rank}) — sim NOT FOUND in ${hh.name}`); continue; }
  const ext = extById.get(sim.id);
  if (!ext) { console.log(`✗ ${fx.name} — no record extent`); continue; }
  const cands = candidates(ext[0], ext[1]);
  // candidates whose any small == rank or rank-1
  const matches = cands.filter((c) => c.smalls.includes(fx.rank) || c.smalls.includes(fx.rank - 1));
  const lines = matches.map((c) => `f${c.topField}/d${c.depth} 0x${c.uid.toString(16)} lvls[${c.smalls.join(',')}]`);
  for (const c of matches) {
    const off = c.smalls.includes(fx.rank) ? 0 : -1;
    const key = `f${c.topField}|off${off}`;
    fieldHits.set(key, (fieldHits.get(key) ?? 0) + 1);
  }
  careerGuess.push({ sim: `${sim.firstName} ${sim.lastName}`, career: fx.career, rank: fx.rank, matches: lines });
  console.log(`● ${sim.firstName} ${sim.lastName} = ${fx.career} (rank ${fx.rank}) — ${cands.length} candidates, ${matches.length} level-matched:`);
  for (const l of lines) console.log(`    ${l}`);
}

console.log(`\n── Field/offset tally (which (field,levelOffset) hits the most fixture sims) ──`);
for (const [k, n] of [...fieldHits.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}/8 sims`);
