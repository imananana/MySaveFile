// READ-ONLY: parse the per-sim relationship-track container. Records look like:
//   0a [len] { f1: varint  f2: varint  f3 [len] {
//     09 [fx64 TUNING]  11 [fx64 OWNER]  18 bool  29 [fx64]  32 [raw blob — may
//     embed a TARGET sim id raw]  38..  40 varint(score?)  49.. 51.. } }
// For each sim of the named households: list every entry's tuning, flag, any
// embedded sim id in the f6 blob, and the f8 value.
//   relTracks.ts <save> <hhName> ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const hhNames = process.argv.slice(3).map((s) => s.toLowerCase());
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : null; };
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = readFixed64LE(buf, i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));
const le = (id: bigint) => { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn); return b; };

function embeddedSimIds(s: number, e: number): bigint[] {
  const out: bigint[] = [];
  for (let i = s; i <= e - 8; i++) {
    const v = readFixed64LE(buf, i);
    if (v !== 0n && simIds.has(v)) { out.push(v); i += 7; }
  }
  return out;
}

function dumpSim(simId: bigint): void {
  const e = ext.get(simId);
  if (!e) { console.log(`  ${nm(simId)}: no extent`); return; }
  const me = le(simId);
  console.log(`  ── ${nm(simId)} ──`);
  let count = 0;
  // find every `09 [8b] 11 [meId]` inside extent = a track entry owned by me
  for (let i = e[0]; i < e[1] - 18; i++) {
    if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
    let ok = true; for (let j = 0; j < 8; j++) if (buf[i + 10 + j] !== me[j]) { ok = false; break; }
    if (!ok) continue;
    const tuning = readFixed64LE(buf, i + 1);
    // parse following fields loosely up to 0x70 bytes
    let p = i + 18; let f3 = -1; let f8 = -1n; let blobIds: bigint[] = [];
    for (let g = 0; g < 12 && p < e[1]; g++) {
      const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
      if (fn === 0 || at <= p || fn === 1) break; p = at;
      if (wt === 0) { const [v, n] = readVarint(buf, p); if (fn === 3) f3 = Number(v); if (fn === 8) f8 = v; p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = readVarint(buf, p); if (fn === 6) blobIds = embeddedSimIds(n, n + Number(l)); p = n + Number(l); }
      else break;
    }
    count++;
    const tgt = blobIds.length ? blobIds.map((x) => nm(x) ?? x.toString(16)).join(',') : '—';
    console.log(`     0x${tuning.toString(16).padEnd(8)} f3=${f3 === -1 ? '·' : f3}  target=${tgt}  f8=${f8 === -1n ? '·' : f8}`);
    i += 17; // resume right after owner id so adjacent entries are not swallowed
  }
  if (!count) console.log('     (no track entries)');
}

for (const h of data.households) {
  if (!hhNames.some((n) => h.name.toLowerCase().includes(n))) continue;
  console.log(`\n══════ "${h.name}" ══════`);
  for (const id of h.simIds) dumpSim(id);
}
