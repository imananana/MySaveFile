/**
 * SPIKE 4: value-hunt the rare branch/activity levels to find where they live.
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeCareerProbe.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const PROBES: [string, string, string, number][] = [
  ['Branch', 'champion', 'Diamond Agent', 8],
  ['Branch', 'gilliam', 'Villain', 11],
  ['Pretty Teen Girls', 'fontaine', 'Scout', 5],
  ['Pretty Teen Girls', 'hilton', 'Drama Club', 4],
  ['Pretty Teen Girls', 'mars', 'Computer Team', 3],
];

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
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
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

function hunt(start: number, end: number, target: number) {
  const hits: { path: string; uids: string[]; smalls: number[] }[] = [];
  function walk(s: number, e: number, path: string) {
    let p = s; const bigs: string[] = []; const smalls: number[] = []; const kids: [number, number, string][] = [];
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= 0x10000n) bigs.push('0x' + v.toString(16)); else smalls.push(Number(v)); p = n; }
      else if (wt === 1) { bigs.push('0x' + f64(buf, p).toString(16)); p += 8; }
      else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; kids.push([n, ce, `${path}.f${fn}`]); p = ce; }
      else break;
    }
    if (smalls.includes(target)) hits.push({ path, uids: bigs, smalls });
    for (const [cs, ce, kp] of kids) walk(cs, ce, kp);
  }
  walk(start, end, '');
  return hits;
}

for (const [hhName, sub, label, target] of PROBES) {
  const hh = data.households.find((h) => h.name?.toLowerCase() === hhName.toLowerCase());
  const members = hh ? data.sims.filter((s) => hh.simIds.some((id) => id === s.id)) : [];
  const sim = members.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
  if (!sim) { console.log(`✗ ${sub}`); continue; }
  const e = ext.get(sim.id)!;
  const hits = hunt(e[0], e[1], target).filter((h) => h.uids.some((u) => u.length > 6));
  console.log(`\n● ${sim.firstName} ${sim.lastName} = ${label} (lvl ${target}) — ${hits.length} msgs with a "${target}" + a tuning uid:`);
  for (const h of hits.slice(0, 8)) console.log(`    ${h.path || '(root)'}  smalls[${h.smalls.join(',')}]  uids[${h.uids.filter((u) => u.length > 6).slice(0, 4).join(', ')}]`);
}
