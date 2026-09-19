// READ-ONLY: tabulate the playable-ghost vs truly-dead discriminator across ALL
// f54-marked sims in a save. Prints, per deceased sim: household resolves?,
// inRoster?, and candidate flag fields f7/f8/f29/f61. Then summarizes f61 and
// household-resolution split among the deceased.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const filterSub = process.argv[3]; // optional lastName substring filter
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const hhById = new Map(data.households.map((h) => [h.id, h.name]));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);

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
const DEC = 0xD3582E8CD8AFF609n;
const rows: {name:string; resolves:boolean; roster:string|undefined; f61:bigint|undefined; f29:bigint|undefined; f7:bigint|undefined; f8:bigint|undefined}[] = [];
for (const s of data.sims) {
  if (filterSub && !s.lastName.toLowerCase().includes(filterSub.toLowerCase())) continue;
  const e = ext.get(s.id); if (!e) continue;
  const f = fields(e[0], e[1]);
  if ((f.get(54) ?? 0n) !== DEC) continue; // deceased only
  const hhId = f.get(4) ?? 0n;
  rows.push({ name: `${s.firstName} ${s.lastName}`, resolves: hhById.has(hhId), roster: hhBySim.get(s.id), f61: f.get(61), f29: f.get(29), f7: f.get(7), f8: f.get(8) });
}
console.log(`Save: ${savePath.split('/').pop()} — ${rows.length} deceased sims${filterSub?` (lastName~"${filterSub}")`:''}\n`);
for (const r of rows.slice(0, 40)) console.log(`  ${r.name.padEnd(26)} resolves=${r.resolves?'YES':'no '} roster=${(r.roster??'—').padEnd(14)} f61=${r.f61} f29=${r.f29} f7=${r.f7} f8=${r.f8}`);
const byResolve = (b:boolean)=>rows.filter(r=>r.resolves===b).length;
const f61counts = new Map<string,number>();
for (const r of rows) { const k=String(r.f61); f61counts.set(k,(f61counts.get(k)??0)+1); }
console.log(`\n── summary ──`);
console.log(`  household resolves: YES=${byResolve(true)}  no=${byResolve(false)}`);
console.log(`  f61 distribution: ${[...f61counts.entries()].map(([k,v])=>`${k}×${v}`).join('  ')}`);
