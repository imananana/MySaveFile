/**
 * SPIKE: list the TOP-LEVEL fields of a sim record (robust field walk, no deep
 * recursion) and resolve any fixed64 that equals a known sim. Answers: are f15
 * (spouse) / f68 (engaged) standalone top-level pointers, or nested inside f47?
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeTopFields.ts [save] [name]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const needle = (process.argv[3] || 'clint').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}` : null; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);

// For a fixed64 or a short message, try to resolve a contained known-sim id.
function simInRange(s: number, e: number): bigint | null {
  for (let i = s; i <= e - 8; i++) { const v = f64(buf, i); if (knownIds.has(v)) return v; }
  return null;
}

for (const sim of data.sims.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle))) {
  const ai = anchors.findIndex((a) => a.id === sim.id);
  if (ai < 0) continue;
  const start = anchors[ai].start;
  const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, start + 300_000);
  console.log(`\n══ ${sim.firstName} ${sim.lastName} — TOP-LEVEL fields:`);
  let p = start;
  while (p < end) {
    const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = rv(buf, p); if (fn >= 14) console.log(`   f${fn} varint=${v}${knownIds.has(v) ? ` «SIM ${nm(v)}»` : ''}`); p = n; }
    else if (wt === 1) { const v = f64(buf, p); console.log(`   f${fn} fixed64=0x${v.toString(16)}${knownIds.has(v) ? ` «SIM ${nm(v)}»` : ''}`); p += 8; }
    else if (wt === 2) { const [l, n] = rv(buf, p); const sid = simInRange(n, n + Number(l)); console.log(`   f${fn} message len=${l}${sid !== null ? `  →contains «SIM ${nm(sid)}»` : ''}`); p = n + Number(l); }
    else if (wt === 5) { p += 4; } else break;
  }
}
