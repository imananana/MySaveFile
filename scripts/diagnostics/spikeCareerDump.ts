/**
 * SPIKE 2: locate the career level by its VALUE. For each G1 member, walk the
 * record and print every protobuf message that contains a varint equal to the
 * sim's known rank (the high ranks 5-8 are rare → unambiguous), with the field
 * PATH and any sibling uids. The path that recurs across the high-rank sims is
 * the career tracker; the sibling uid is the career tuning.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerDump.ts [save] [household]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const HOUSEHOLD = process.argv[3] || 'G1';

const FIXTURE = [
  { name: 'spence', career: 'Actress', rank: 1 },
  { name: 'altman', career: 'Detective', rank: 2 },
  { name: 'dobbs', career: 'Doctor', rank: 3 },
  { name: 'hamilton', career: 'Interior Decorator', rank: 4 },
  { name: 'lujan', career: 'Naturopath', rank: 5 },
  { name: 'richter', career: 'Noble', rank: 6 },
  { name: 'mcelroy', career: 'Reaper', rank: 7 },
  { name: 'owens', career: 'Scientist', rank: 8 },
];

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const hh = data.households.find((h) => h.name.toLowerCase() === HOUSEHOLD.toLowerCase()) ?? data.households.find((h) => h.name.toLowerCase().includes(HOUSEHOLD.toLowerCase()));
if (!hh) { console.log('household not found'); process.exit(0); }
const memberIds = new Set(hh.simIds.map((x) => x.toString()));
const members = data.sims.filter((s) => memberIds.has(s.id.toString()));
const findMember = (sub: string) => members.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

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

// Walk a message; for each sub-message collect its own scalar fields. Whenever a
// scalar varint equals `target`, report the path + sibling big values (uids).
function hunt(start: number, end: number, target: number) {
  const hits: { path: string; uids: string[]; smalls: number[] }[] = [];
  function walk(s: number, e: number, path: string) {
    let p = s; const bigs: string[] = []; const smalls: number[] = []; const kids: [number, number, string][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= 0x10000n) bigs.push('0x' + v.toString(16)); else smalls.push(Number(v)); p = n; }
      else if (wt === 1) { const v = f64(buf, p); bigs.push('0x' + v.toString(16)); p += 8; }
      else if (wt === 5) { p += 4; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; kids.push([n, ce, `${path}.f${fn}`]); p = ce; }
      else break;
    }
    if (smalls.includes(target)) hits.push({ path, uids: bigs, smalls });
    for (const [cs, ce, kp] of kids) walk(cs, ce, kp);
  }
  walk(start, end, '');
  return hits;
}

for (const fx of FIXTURE) {
  const sim = findMember(fx.name); if (!sim) { console.log(`✗ ${fx.name}`); continue; }
  const ext = extById.get(sim.id); if (!ext) continue;
  const hits = hunt(ext[0], ext[1], fx.rank);
  console.log(`\n● ${sim.firstName} ${sim.lastName} = ${fx.career} (rank ${fx.rank}) — ${hits.length} messages contain a "${fx.rank}":`);
  for (const h of hits) {
    const uids = h.uids.filter((u) => u.length > 6); // drop tiny ids, keep tuning-sized
    console.log(`    ${h.path || '(root)'}  smalls[${h.smalls.join(',')}]  uids[${uids.slice(0, 4).join(', ')}${uids.length > 4 ? ' …' : ''}]`);
  }
}
