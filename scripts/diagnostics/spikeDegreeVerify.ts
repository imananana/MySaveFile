/**
 * Verify earned-degree parsing: Deddens (truly graduated via mod) vs Noonan
 * (degree trait added via cheat). Checks (a) the degree trait shows in the
 * parser's traitIds, and (b) what graduation does to f30.f30 enrollment.
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeDegreeVerify.ts
 */
import { readdirSync, readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const DEGREE_DIR = `${process.env.HOME}/Documents/Degrees`;

// uid('0x..') → degree trait name, from the S4S export filenames.
const degreeTraits = new Map<string, string>();
for (const f of readdirSync(DEGREE_DIR)) {
  const m = f.match(/^545AC67A!005FDD0C!0*([0-9A-Fa-f]+)\.(.+)\.SimData\.xml$/);
  if (m) degreeTraits.set('0x' + m[1].toLowerCase(), m[2]);
}
console.log(`Loaded ${degreeTraits.size} degree traits from export.\n`);

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
function fieldsOf(s: number, e: number): F[] { const out: F[] = []; let p = s; while (p < e) { const [tb, at] = rv(buf, p); if (at <= p) break; const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0) break; p = at; if (wt === 0) { const [v, n] = rv(buf, p); out.push({ fn, wt, v }); p = n; } else if (wt === 1) { out.push({ fn, wt, v: f64(buf, p) }); p += 8; } else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; out.push({ fn, wt, cs: n, ce }); p = ce; } else if (wt === 5) p += 4; else break; } return out; }

for (const sub of ['deddens', 'noonan']) {
  const sim = data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
  if (!sim) { console.log(`✗ ${sub}`); continue; }
  console.log(`● ${sim.firstName} ${sim.lastName}`);
  // (a) degree traits in parsed traitIds
  const degs = sim.traitIds.map((id) => '0x' + id.toString(16)).filter((h) => degreeTraits.has(h));
  console.log(`   parsed traitIds: ${sim.traitIds.length} total; degree traits: ${degs.length ? degs.map((h) => `${h} (${degreeTraits.get(h)})`).join(', ') : 'NONE'}`);
  // (b) f30.f30 enrollment
  const [rs, re] = ext.get(sim.id)!;
  const f30f30: string[] = [];
  for (const f30 of fieldsOf(rs, re)) { if (f30.fn !== 30 || f30.wt !== 2) continue; for (const s30 of fieldsOf(f30.cs!, f30.ce!)) { if (s30.fn === 30 && s30.wt === 2) { const ff = fieldsOf(s30.cs!, s30.ce!); const f1 = ff.find((x) => x.fn === 1), f2 = ff.find((x) => x.fn === 2); f30f30.push(`degree=${f1 ? '0x' + f1.v!.toString(16) : '—'} university=${f2 ? '0x' + f2.v!.toString(16) : '—'}`); } } }
  console.log(`   f30.f30 enrollment: ${f30f30.length ? f30f30.join(' | ') : 'NONE (no active enrollment record)'}\n`);
}
