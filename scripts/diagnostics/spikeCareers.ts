/**
 * SPIKE: are sim CAREERS parseable? Walks each employable sim's record looking
 * for (career-uid, level)-shaped entries, then tallies which uids are SHARED
 * across sims — a uid held by many sims at various levels is a real career
 * (the same signal we used to validate traits/aspirations).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareers.ts [savePath]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00001706.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}`.trim() : '?'; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

// anchors + extents
const anchors: { id: bigint; start: number }[] = [];
const known = new Set(data.sims.map((s) => s.id));
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

// Find f30 (attributes) in a record, then collect leaf sub-messages that hold
// exactly one "uid-shaped" value (≥2^16) plus a small varint (≤20) — the shape
// of a career/skill tracker entry: { uid, level, ... }.
function careerCandidates(start: number, end: number): { uid: bigint; level: number; topField: number }[] {
  const out: { uid: bigint; level: number; topField: number }[] = [];
  function walk(s: number, e: number, depth: number, topField: number) {
    let p = s; const bigs: bigint[] = []; const smalls: number[] = []; const kids: [number, number, number][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at; const tf = depth === 0 ? fn : topField;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= 0x10000n) bigs.push(v); else if (v <= 20n) smalls.push(Number(v)); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v >= 0x10000n) bigs.push(v); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l); if (ce > e) break; kids.push([cs, ce, tf]); p = ce; }
      else if (wt === 5) p += 4; else break;
    }
    if (bigs.length === 1 && smalls.length >= 1) out.push({ uid: bigs[0], level: Math.max(...smalls), topField });
    if (depth < 9) for (const [cs, ce, tf] of kids) walk(cs, ce, depth + 1, depth === 0 ? tf : topField);
  }
  walk(start, end, 0, 0);
  return out;
}

const employable = data.sims.filter((s) => s.species === 'human' && ['teen', 'youngAdult', 'adult', 'elder'].includes(s.lifestage));
// Keep only uid+level entries with a MEANINGFUL level (≥4) — filters out the
// initialized-at-0 trackers everyone has, leaving real careers/skills.
const uidSims = new Map<string, { sim: string; level: number; field: number }[]>();
for (const s of employable) {
  const ext = extById.get(s.id); if (!ext) continue;
  const seen = new Set<string>();
  for (const c of careerCandidates(ext[0], ext[1])) {
    if (c.level < 4) continue;
    const k = '0x' + c.uid.toString(16);
    if (seen.has(k)) continue; seen.add(k);
    if (!uidSims.has(k)) uidSims.set(k, []);
    uidSims.get(k)!.push({ sim: nm(s.id), level: c.level, field: c.topField });
  }
}
const ranked = [...uidSims.entries()].filter(([, a]) => a.length >= 2).sort((a, b) => b[1].length - a[1].length);
console.log(`${savePath.split('/').pop()} — ${employable.length} employable sims`);
console.log(`uids held at level ≥4 by ≥2 sims (career/skill tracks):\n`);
for (const [uid, arr] of ranked.slice(0, 30)) {
  const fields = [...new Set(arr.map((x) => x.field))].join(',');
  const levels = arr.map((x) => x.level);
  console.log(`  ${uid}  (${arr.length} sims, f${fields}, lvls ${Math.min(...levels)}-${Math.max(...levels)}):  ${arr.slice(0, 5).map((x) => `${x.sim}@${x.level}`).join(', ')}${arr.length > 5 ? ` …+${arr.length - 5}` : ''}`);
}
