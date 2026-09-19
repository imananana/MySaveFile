/**
 * SPIKE (robust, no structural parsing): for one sim, scan their record bytes
 * for EVERY known sim id — as fixed64-LE and as varint — and report who appears
 * + how many times + which encoding. Sidesteps the fragile protobuf walker so we
 * can trust "who does this sim reference".
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeWhoKnows.ts [save] [name]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const needle = (process.argv[3] || 'penny pizzazz').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = [...new Set(data.sims.map((s) => s.id))];
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}` : `?${id.toString(16)}`; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

// record extents
const known = new Set(knownIds);
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

const sim = data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle));
if (!sim) { console.log('not found'); process.exit(0); }
const ai = anchors.findIndex((a) => a.id === sim.id);
const start = anchors[ai].start;
const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, start + 300_000);
console.log(`${nm(sim.id)} — record @${start}..${end} (${end - start} bytes)\n`);

// Precompute LE-8 + varint byte patterns for each known sim (skip self).
function leBytes(v: bigint): Uint8Array { const o = new Uint8Array(8); let x = v; for (let k = 0; k < 8; k++) { o[k] = Number(x & 0xffn); x >>= 8n; } return o; }
function varintBytes(v: bigint): Uint8Array { const o: number[] = []; let x = v; while (true) { const b = Number(x & 0x7fn); x >>= 7n; if (x) o.push(b | 0x80); else { o.push(b); break; } } return new Uint8Array(o); }
function count(pat: Uint8Array): number { let c = 0; for (let i = start; i <= end - pat.length; i++) { let ok = true; for (let k = 0; k < pat.length; k++) if (buf[i + k] !== pat[k]) { ok = false; break; } if (ok) c++; } return c; }

const hits: { id: bigint; le: number; vi: number }[] = [];
for (const id of knownIds) {
  if (id === sim.id) continue;
  const le = count(leBytes(id));
  const vi = count(varintBytes(id));
  if (le + vi > 0) hits.push({ id, le, vi });
}
hits.sort((a, b) => (b.le + b.vi) - (a.le + a.vi));
console.log(`Known sims referenced in this record (${hits.length}):`);
for (const h of hits) {
  console.log(`   ${nm(h.id)} [${hhBySim.get(h.id) ?? '?'}]  —  fixed64×${h.le}  varint×${h.vi}`);
}
