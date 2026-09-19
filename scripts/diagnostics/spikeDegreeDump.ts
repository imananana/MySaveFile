/**
 * SPIKE: dump f30.f30 (the degree/university tracker) for enrolled sims so we
 * can read degree uid + university + distinguished side by side.
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeDegreeDump.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const SIMS: [string, string, string][] = [
  ['D1','jarek','Biology'], ['D1','payne','Computer Science'], ['D1','lawrence','Economics'], ['D1','scott','Physics'], ['D1','vakarian','Psychology'], ['D1','shepard','Villainy'],
  ['D2','pence','Art History'], ['D2','west','Communications'], ['D2','birch','Culinary Arts'], ['D2','newby','Drama'], ['D2','ennis','Fine Art'], ['D2','valenzuela','History'], ['D2','deddens','Language & Literature'], ['D2','noonan','Economics(DIST)'],
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

type F = { fn: number; wt: number; v?: bigint; cs?: number; ce?: number };
function fieldsOf(s: number, e: number): F[] {
  const out: F[] = []; let p = s;
  while (p < e) {
    const [tb, at] = rv(buf, p); if (at <= p) break; const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0) break; p = at;
    if (wt === 0) { const [v, n] = rv(buf, p); out.push({ fn, wt, v }); p = n; }
    else if (wt === 1) { out.push({ fn, wt, v: f64(buf, p) }); p += 8; }
    else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; out.push({ fn, wt, cs: n, ce }); p = ce; }
    else if (wt === 5) { let v = 0n; for (let k = 0; k < 4; k++) v |= BigInt(buf[p + k]) << BigInt(8 * k); out.push({ fn, wt, v }); p += 4; }
    else break;
  }
  return out;
}
const hex = (v: bigint) => v >= 0x10000n ? '0x' + v.toString(16) : v.toString();
// one-line dump of a message's scalar fields + recurse one level into sub-msgs
function dump(s: number, e: number, depth = 0): string {
  return fieldsOf(s, e).map((f) => {
    if (f.wt === 2) { return depth < 2 ? `f${f.fn}{${dump(f.cs!, f.ce!, depth + 1)}}` : `f${f.fn}{…}`; }
    return `f${f.fn}=${hex(f.v!)}`;
  }).join(' ');
}

for (const [grp, sub, label] of SIMS) {
  const h = data.households.find((x) => x.name?.toLowerCase() === grp.toLowerCase())!;
  const sim = data.sims.filter((s) => h.simIds.some((i) => i === s.id)).find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
  if (!sim) { console.log(`✗ ${sub}`); continue; }
  const [rs, re] = ext.get(sim.id)!;
  console.log(`\n● ${sim.firstName} ${sim.lastName} — ${label}`);
  for (const f30 of fieldsOf(rs, re)) {
    if (f30.fn !== 30 || f30.wt !== 2) continue;
    for (const sub30 of fieldsOf(f30.cs!, f30.ce!)) {
      if (sub30.fn === 30 && sub30.wt === 2) console.log(`    f30.f30: ${dump(sub30.cs!, sub30.ce!)}`);
    }
  }
}
