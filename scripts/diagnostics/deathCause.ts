/**
 * READ-ONLY: isolate the CAUSE-OF-DEATH field. User seeded 31 ghosts in
 * Slot_00000003, each surname = a distinct death cause. We recursively collect
 * every scalar field (by path, e.g. "30.5.2") for each labeled ghost + a few
 * living controls, then find the path that (a) is ~0/absent for the living and
 * (b) takes a distinct value per cause for the dead. That path is the cause
 * field; we print its value→cause mapping (the tuning IDs).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/deathCause.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));

// surname → cause label (user-seeded G1–G4)
const LABELS: [string, string][] = [
  ['Spence','Consumed by the Mother'],['Altman','Anger'],['Dobbs','Beetles'],['Hamilton','Murphy Bed'],
  ['Lujan','Flies'],['Richter','Broken Heart'],['McElroy','Cowplant'],['Owens','Cuckoo Malfunction'],
  ['Kumar','Drowning'],['Kaur','Electrocution'],['Hale','Embarrassment'],['Ricks','Falling'],
  ['Lyon','Fire'],['Curry','Freezing'],['Gruber','Hunger'],['Sawyer','Killer Chicken'],
  ['Larue','Killer Rabbit'],['Willis','Laughter'],['Olivas','Lightning'],['Miotke','Meteorite'],
  ['Bolton','Mold'],['Osborn','Murder of Crows'],['John','Overexertion'],['Acosta','Overheating'],
  ['Kellogg','Poison'],['Chen','Pufferfish'],['Covington','Rabid Rodent Fever'],['McConnell','Steam'],
  ['Liu','Stink Capsule'],['Whitten','Urban Myth'],['McGhee','Vending Machine'],
];
const findByLast = (last: string) => data.sims.find((s) => s.lastName.toLowerCase() === last.toLowerCase());

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

// safe message check: does [s,e) parse cleanly as protobuf?
function isMessage(s: number, e: number): boolean {
  let p = s, fields = 0;
  while (p < e) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || fn > 50000 || at <= p) return false; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l); if (ce > e) return false; p = ce; }
    else if (wt === 5) p += 4; else return false;
    fields++;
  }
  return p === e && fields > 0;
}

// recursively collect scalar leaves: path → value
function collect(s: number, e: number, prefix: string, out: Map<string, bigint>, depth: number): void {
  let p = s;
  while (p < e) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || at <= p) return; p = at;
    const path = prefix ? `${prefix}.${fn}` : `${fn}`;
    if (wt === 0) { const [v, n] = readVarint(buf, p); if (!out.has(path)) out.set(path, v); p = n; }
    else if (wt === 1) { if (!out.has(path)) out.set(path, f64(p)); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l);
      if (ce <= e && depth < 8 && l > 0 && isMessage(n, ce)) collect(n, ce, path, out, depth + 1);
      p = ce; }
    else if (wt === 5) { if (!out.has(path)) out.set(path, BigInt((buf[p]|(buf[p+1]<<8)|(buf[p+2]<<16)|(buf[p+3]<<24))>>>0)); p += 4; }
    else return;
  }
}

// gather labeled ghosts
const ghosts: { last: string; cause: string; fields: Map<string, bigint> }[] = [];
for (const [last, cause] of LABELS) {
  const s = findByLast(last);
  if (!s) { console.log(`  ! missing surname ${last}`); continue; }
  const e = ext.get(s.id); if (!e) continue;
  const m = new Map<string, bigint>(); collect(e[0], e[1], '', m, 0);
  ghosts.push({ last, cause, fields: m });
}
// living controls
const living = data.sims.filter((s) => !s.isGhost).slice(0, 8);
const livingFields = living.map((s) => { const e = ext.get(s.id); const m = new Map<string, bigint>(); if (e) collect(e[0], e[1], '', m, 0); return m; });

// score every path seen in ghosts
const allPaths = new Set<string>();
ghosts.forEach((g) => g.fields.forEach((_, k) => allPaths.add(k)));

type Cand = { path: string; distinct: number; coverage: number; livingZero: number };
const cands: Cand[] = [];
for (const path of allPaths) {
  const vals = ghosts.map((g) => g.fields.get(path)).filter((v) => v !== undefined) as bigint[];
  if (vals.length < ghosts.length * 0.8) continue; // must cover most ghosts
  const distinct = new Set(vals.map(String)).size;
  const livingZero = livingFields.filter((m) => !m.has(path) || m.get(path) === 0n).length;
  cands.push({ path, distinct, coverage: vals.length, livingZero });
}
// cause field: high distinct (≈ #causes), present on ghosts, 0/absent on living
cands.sort((a, b) => (b.distinct - a.distinct) || (b.livingZero - a.livingZero));

console.log(`Save: ${savePath.split('/').pop()} — ${ghosts.length} labeled ghosts, ${living.length} living controls\n`);
console.log(`Top candidate paths (distinct values across causes | ghost coverage | living-zero):`);
for (const c of cands.slice(0, 12)) {
  console.log(`  ${c.path.padEnd(14)} distinct=${String(c.distinct).padStart(3)}  cover=${c.coverage}/${ghosts.length}  livingZero=${c.livingZero}/${living.length}`);
}

// ── cross-save cowplant test: load Samuel Goth (Cowplant) from the other save ──
const OTHER = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
let samuelFields: Map<string, bigint> | null = null;
try {
  const of = readFileSync(OTHER);
  const ores = parseDbpf(of.buffer.slice(of.byteOffset, of.byteOffset + of.byteLength));
  const odata = parseSaveData(ores);
  const osimIds = new Set(odata.sims.map((s) => s.id));
  let ob: Uint8Array | null = null;
  for (const r of ores.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!ob || d.length > ob.length) ob = d; }
  const samuel = odata.sims.find((s) => s.firstName === 'Samuel' && s.lastName === 'Goth');
  if (samuel && ob) {
    const obuf = ob; const of64 = (p: number) => readFixed64LE(obuf, p);
    // re-anchor in other buf
    const oanch: { id: bigint; start: number }[] = [];
    for (let i = 0; i < obuf.length - 60; i++) {
      if (obuf[i] !== 0x09) continue; let pos = i + 9; if (obuf[pos] !== 0x11) continue; pos += 9;
      if (obuf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(obuf, pos); pos = a;
      if (obuf[pos] !== 0x21) continue; pos += 9; if (obuf[pos] !== 0x2a) continue;
      const id = of64(i + 1); if (!osimIds.has(id)) continue; oanch.push({ id, start: i }); i = pos;
    }
    oanch.sort((x, y) => x.start - y.start);
    const idx = oanch.findIndex((a) => a.id === samuel.id);
    if (idx >= 0) {
      const e0 = oanch[idx].start, e1 = idx + 1 < oanch.length ? oanch[idx + 1].start : Math.min(obuf.length, e0 + 300_000);
      // collect against the OTHER buffer — temporarily swap globals via a local collector
      const m = new Map<string, bigint>();
      (function ocollect(s: number, e: number, prefix: string, depth: number) {
        let p = s;
        const oisMessage = (s2: number, e2: number) => { let q = s2, fl = 0; while (q < e2) { const [tb, at] = readVarint(obuf, q); const fn = Number(tb >> 3n), wt = Number(tb & 7n); if (fn === 0 || fn > 50000 || at <= q) return false; q = at; if (wt === 0) { const [, n] = readVarint(obuf, q); q = n; } else if (wt === 1) q += 8; else if (wt === 2) { const [l, n] = readVarint(obuf, q); const ce = n + Number(l); if (ce > e2) return false; q = ce; } else if (wt === 5) q += 4; else return false; fl++; } return q === e2 && fl > 0; };
        while (p < e) { const [tb, at] = readVarint(obuf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n); if (fn === 0 || at <= p) return; p = at; const path = prefix ? `${prefix}.${fn}` : `${fn}`;
          if (wt === 0) { const [v, n] = readVarint(obuf, p); if (!m.has(path)) m.set(path, v); p = n; }
          else if (wt === 1) { if (!m.has(path)) m.set(path, of64(p)); p += 8; }
          else if (wt === 2) { const [l, n] = readVarint(obuf, p); const ce = n + Number(l); if (ce <= e && depth < 8 && l > 0 && oisMessage(n, ce)) ocollect(n, ce, path, depth + 1); p = ce; }
          else if (wt === 5) { if (!m.has(path)) m.set(path, BigInt((obuf[p]|(obuf[p+1]<<8)|(obuf[p+2]<<16)|(obuf[p+3]<<24))>>>0)); p += 4; } else return; }
      })(e0, e1, '', 0);
      samuelFields = m;
    }
  }
} catch (err) { console.log(`  (other-save cowplant check skipped: ${(err as Error).message})`); }

// the cause field: McElroy (cowplant here) value EQUALS Samuel Goth (cowplant other save)
const mcelroy = ghosts.find((g) => g.last === 'McElroy');
console.log(`\n── cross-save Cowplant test (McElroy here  vs  Samuel Goth other save) ──`);
const matches: string[] = [];
if (mcelroy && samuelFields) {
  for (const c of cands) {
    const a = mcelroy.fields.get(c.path), b = samuelFields.get(c.path);
    if (a !== undefined && b !== undefined && a === b && c.distinct >= 15) matches.push(c.path);
  }
  console.log(`  paths where Cowplant matches across saves AND vary by cause (distinct≥15): ${matches.join(', ') || '(none)'}`);
}

// print per-cause mapping for the best matched path (or fall back to 28.6.1.1 / top death-ish)
const chosen = matches[0] || '28.6.1.1';
console.log(`\n★ Cause field = path ${chosen}  (value → cause):\n`);
const seen = new Map<string, string[]>();
for (const g of ghosts) {
  const v = g.fields.get(chosen);
  const key = v !== undefined ? '0x' + v.toString(16) : '(absent)';
  console.log(`  ${g.cause.padEnd(24)} ${key}`);
  if (!seen.has(key)) seen.set(key, []); seen.get(key)!.push(g.cause);
}
const collisions = [...seen].filter(([, cs]) => cs.length > 1);
if (collisions.length) console.log(`\n  ⚠ value collisions: ${collisions.map(([k, cs]) => `${k}→{${cs.join(', ')}}`).join(' ; ')}`);
console.log(`  (Cowplant value here: ${mcelroy?.fields.get(chosen)?.toString(16)}  | Samuel Goth other save: ${samuelFields?.get(chosen)?.toString(16)})`);
