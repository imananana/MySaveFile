/**
 * SPIKE: test the hypothesis that f30.f14 is the exact PARENTS list
 * ({index, simId} entries, index likely mother/father). If so, the whole family
 * tree types exactly with no bit-decoding: parents=f14, children=invert,
 * siblings=shared parent, grandparents=parent's parents, spouse=f15.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeParents.ts [save] [filter]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312029.save`;
const filter = (process.argv[3] || '').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}` : `?${id.toString(16)}`; };
const ls = (id: bigint) => simById.get(id)?.lifestage ?? '?';

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
const extById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extById.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// Walk to a given top-level field's message and return its [start,end).
function fieldRange(recStart: number, recEnd: number, target: number): [number, number] | null {
  let p = recStart;
  while (p < recEnd) {
    const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
    if (fn === 0 || at <= p) return null; p = at;
    if (wt === 0) { const [, n] = rv(buf, p); if (fn === target) return [p, n]; p = n; }
    else if (wt === 1) { if (fn === target) return [p, p + 8]; p += 8; }
    else if (wt === 2) { const [l, n] = rv(buf, p); if (fn === target) return [n, n + Number(l)]; p = n + Number(l); }
    else if (wt === 5) { p += 4; } else return null;
  }
  return null;
}

// Parse f30.f14 = repeated f1 { f1: index, f2: simId } → list of {index, sim}.
function parents(simId: bigint): { index: number; sim: bigint }[] {
  const ext = extById.get(simId); if (!ext) return [];
  const f30 = fieldRange(ext[0], ext[1], 30); if (!f30) return [];
  const f14 = fieldRange(f30[0], f30[1], 14); if (!f14) return [];
  const out: { index: number; sim: bigint }[] = [];
  let p = f14[0];
  while (p < f14[1]) {
    const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 2) {
      const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l);
      if (fn === 1) { // an entry
        let q = cs; let index = -1; let sim = 0n;
        while (q < ce) {
          const [etb, eat] = rv(buf, q); const efn = Number(etb) >> 3, ewt = Number(etb) & 7; if (efn === 0 || eat <= q) break; q = eat;
          if (ewt === 0) { const [v, nn] = rv(buf, q); if (efn === 1) index = Number(v); else if (efn === 2) sim = v; q = nn; }
          else if (ewt === 1) { const v = f64(buf, q); if (efn === 2) sim = v; q += 8; }
          else if (ewt === 2) { const [ll, nn] = rv(buf, q); q = nn + Number(ll); }
          else if (ewt === 5) q += 4; else break;
        }
        if (sim) out.push({ index, sim });
      }
      p = ce;
    } else if (wt === 0) { const [, n] = rv(buf, p); p = n; }
    else if (wt === 1) p += 8; else if (wt === 5) p += 4; else break;
  }
  return out;
}

const targets = data.sims.filter((s) => !filter || `${s.firstName} ${s.lastName}`.toLowerCase().match(filter));
console.log(`Save: ${savePath.split('/').pop()} — ${targets.length} sims shown\n`);
for (const s of targets) {
  const ps = parents(s.id);
  const tag = ps.map((p) => `[${p.index}] ${nm(p.sim)} (${ls(p.sim)})${knownIds.has(p.sim) ? '' : ' ⚠NOT-IN-SAVE'}`).join('  ');
  console.log(`${nm(s.id)} (${s.lifestage}) [${hhBySim.get(s.id) ?? '?'}]  →  parents: ${tag || '(none)'}`);
}
