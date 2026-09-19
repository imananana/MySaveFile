/**
 * READ-ONLY: differentiate PLAYABLE GHOST (deceased but still a household
 * member, renders in color) from TRULY DEAD (deceased, greyed out, genealogy
 * only). Both share f54 = the deceased constant. Hypothesis: a playable ghost
 * belongs to a REAL household; a truly-dead ancestor does not. Print per sim:
 * deceased?, householdId, whether it resolves to a real household, + a few
 * candidate top-level fields (f7/f8/f29) in case there's a dedicated flag.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/ghostVsDead.ts <save> "Name" ...
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const names = process.argv.slice(3);
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const hhById = new Map(data.households.map((h) => [h.id, h.name]));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const findSim = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())
  || data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(n.toLowerCase()));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const f64 = (p: number) => readFixed64LE(buf, p);
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

function fields(start: number, end: number): Map<number, bigint> {
  const m = new Map<number, bigint>(); let p = start;
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = readVarint(buf, p); if (!m.has(fn)) m.set(fn, v); p = n; }
    else if (wt === 1) { if (!m.has(fn)) m.set(fn, f64(p)); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) p += 4; else break;
  }
  return m;
}

console.log(`Save: ${savePath.split('/').pop()}\n`);
for (const name of names) {
  const s = findSim(name);
  if (!s) { console.log(`${name}: NOT FOUND`); continue; }
  const e = ext.get(s.id)!;
  const f = fields(e[0], e[1]);
  const hhId = f.get(4) ?? 0n;          // f4 (0x21) = household id
  const f54 = f.get(54) ?? 0n;
  const deceased = f54 === 0xD3582E8CD8AFF609n;
  const resolves = hhById.has(hhId);
  const roster = hhBySim.get(s.id);
  console.log(`${s.firstName} ${s.lastName} (${s.lifestage})`);
  console.log(`   deceased(f54)=${deceased}   householdId=0x${hhId.toString(16)}`);
  console.log(`   household resolves? ${resolves ? `YES → "${hhById.get(hhId)}"` : 'NO (culled/hidden)'}   inRoster=${roster ?? '—'}`);
  console.log(`   f7=${f.get(7)} f8=${f.get(8)} f29=${f.get(29)} f61=${f.get(61)}`);
}
