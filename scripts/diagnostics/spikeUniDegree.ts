/**
 * SPIKE: locate university + degree on currently-enrolled sims (households D1
 * Britechester, D2 Foxbury). Method:
 *  - UNIVERSITY: a uid shared by ALL D1 sims but no D2 sim (and vice-versa) —
 *    isolated by (∩D1)∖(∩D2) and (∩D2)∖(∩D1).
 *  - DEGREE: Lawrence (D1, Economics) ∩ Noonan (D2, Economics) minus the
 *    all-sims-common base → the Economics degree tuning (they share nothing
 *    else university-wise since they're at different schools).
 *  Reports the field PATH of each isolated uid so we know where it lives.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeUniDegree.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const D1: [string, string][] = [['jarek','Biology'],['payne','Computer Science'],['lawrence','Economics'],['scott','Physics'],['vakarian','Psychology'],['shepard','Villainy']];
const D2: [string, string][] = [['pence','Art History'],['west','Communications'],['birch','Culinary Arts'],['newby','Drama'],['ennis','Fine Art'],['valenzuela','History'],['deddens','Language & Literature'],['noonan','Economics (dist)']];

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

// All tuning-sized uids in a record → first field path each was seen at.
function uidPaths(recS: number, recE: number): Map<string, string> {
  const out = new Map<string, string>();
  const add = (v: bigint, path: string) => { const k = '0x' + v.toString(16); if (!out.has(k)) out.set(k, path); };
  function walk(s: number, e: number, path: string) {
    let p = s;
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= 0x10000n && v < 0xffffffffffff0000n) add(v, `${path}.f${fn}`); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v >= 0x10000n && v < 0xffffffffffff0000n) add(v, `${path}.f${fn}`); p += 8; }
      else if (wt === 5) p += 4;
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) break; walk(n, ce, `${path}.f${fn}`); p = ce; }
      else break;
    }
  }
  walk(recS, recE, '');
  return out;
}

const simOf = (sub: string, hh: string) => {
  const h = data.households.find((x) => x.name?.toLowerCase() === hh.toLowerCase())!;
  return data.sims.filter((s) => h.simIds.some((i) => i === s.id)).find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(sub));
};

const paths = new Map<string, Map<string, string>>();   // sub → uid→path
const labelOf = new Map<string, string>();
for (const [grp, list] of [['D1', D1], ['D2', D2]] as const) {
  for (const [sub, deg] of list) {
    const sim = simOf(sub, grp); if (!sim) { console.log(`✗ ${grp}/${sub}`); continue; }
    paths.set(sub, uidPaths(...ext.get(sim.id)!));
    labelOf.set(sub, `${grp} ${sim.firstName} ${sim.lastName} — ${deg}`);
  }
}
const setOf = (sub: string) => new Set(paths.get(sub)?.keys() ?? []);
const inter = (subs: string[]) => subs.map(setOf).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
const d1subs = D1.map((x) => x[0]).filter((s) => paths.has(s));
const d2subs = D2.map((x) => x[0]).filter((s) => paths.has(s));

const d1c = inter(d1subs), d2c = inter(d2subs);
const britechester = [...d1c].filter((u) => !d2c.has(u));
const foxbury = [...d2c].filter((u) => !d1c.has(u));
const allCommon = inter([...d1subs, ...d2subs]);
const econ = [...setOf('lawrence')].filter((u) => setOf('noonan').has(u) && !allCommon.has(u));

const showPath = (uid: string, sub: string) => paths.get(sub)?.get(uid) ?? '?';
console.log(`\n══ UNIVERSITY (shared within a household, differs across) ══`);
console.log(`Britechester (∩D1∖∩D2): ${britechester.map((u) => `${u}@${showPath(u, 'jarek')}`).join('  ') || '(none)'}`);
console.log(`Foxbury      (∩D2∖∩D1): ${foxbury.map((u) => `${u}@${showPath(u, 'pence')}`).join('  ') || '(none)'}`);
console.log(`\n══ DEGREE (Lawrence∩Noonan, both Economics, minus base) ══`);
console.log(`Economics: ${econ.map((u) => `${u}@${showPath(u, 'lawrence')}`).join('  ') || '(none)'}`);
