// DIFFERENTIAL FIELD DISCOVERY: given two labeled groups of households (MINE vs SPAWN),
// dump the FULL top-level field inventory of each household record AND every member sim
// record, then report which field numbers systematically differ between the groups.
// Goal: find an unparsed field that encodes creation method.
//
// Usage: npx tsx provFieldDiff.ts <save> "Mine1,Mine2,..." "Spawn1,Spawn2,..."
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const save = process.argv[2] ?? 'Slot_10312029.save';
const MINE = (process.argv[3] ?? 'Copur,Station Entrepreneurs,Trailer Trash,Elias,Summers,Jett,Petersen').split(',').map(s => s.trim().toLowerCase());
const SPAWN = (process.argv[4] ?? "Autry,Takahashi,O'Leary,Ikeda,Ichmawin,Liang,Rheinfrank,Souza").split(',').map(s => s.trim().toLowerCase());

const b = readFileSync(`${SAVES}/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let B: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!B || d.length > B.length) B = d; }
const buf = B!;

// ---- field inventory walker: returns Map<fn, {wt, n, sample}> ----
function inventory(start: number, end: number) {
  const fields = new Map<number, { wt: number; n: number; sample: string }>();
  let p = start, c = 0;
  while (p < end && c++ < 600) {
    if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn;
    const fn = Number(t >> 3n), wt = Number(t & 7n); let sample = '';
    if (fn > 4000 || fn < 1) break;                       // derail guard: absurd field number
    if (wt === 0) { const [v, x] = readVarint(buf, p); p = x; sample = v > 0xffffn ? '0x' + v.toString(16) : '' + v; }
    else if (wt === 1) { sample = '0x' + readFixed64LE(buf, p).toString(16); p += 8; }
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); if (len < 0 || x + len > end) break; sample = `len${len}`; p = x + len; }
    else if (wt === 5) { p += 4; sample = 'f32'; }
    else break;
    const e = fields.get(fn);
    if (e) { e.n++; } else fields.set(fn, { wt, n: 1, sample });
  }
  return fields;
}

// ---- collect sim anchors (id -> body window) ----
type Rec = { id: bigint; bodyStart: number; recEnd: number };
const simAnchors: Rec[] = []; const simIdx: number[] = [];
const seenS = new Set<bigint>();
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  const id = readFixed64LE(buf, i + 1); let p = i + 9;
  if (buf[p] !== 0x11) continue; p += 9; if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p += 9; if (buf[p] !== 0x2a) continue; p++; let first; try { [first, p] = readString(buf, p); } catch { continue; }
  if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
  if (buf[p] === 0x32) { p++; try { [, p] = readString(buf, p); } catch { /* */ } }
  if (buf[p] !== 0x38) continue; if (id === 0n || seenS.has(id)) continue; seenS.add(id);
  simAnchors.push({ id, bodyStart: i, recEnd: 0 }); simIdx.push(i);   // start AT the 0x09 tag
}
for (let k = 0; k < simAnchors.length; k++) simAnchors[k].recEnd = k + 1 < simIdx.length ? simIdx[k + 1] : Math.min(buf.length, simAnchors[k].bodyStart + 60000);
const simById = new Map<bigint, Rec>(); for (const s of simAnchors) simById.set(s.id, s);

// ---- collect household anchors (name -> body window + simIds) ----
type HRec = { name: string; body: number; end: number; simIds: bigint[] };
const hAnchors: { i: number; name: string; body: number }[] = []; const seenH = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  const id = readFixed64LE(buf, i + 10); let p = i + 18;
  if (buf[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(buf, p); } catch { continue; }
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  p = after; if (buf[p] !== 0x21) continue; p += 9;
  if (seenH.has(id)) continue; seenH.add(id);
  hAnchors.push({ i, name, body: p });
}
function simIdsOf(start: number, end: number): bigint[] {
  let p = start; const ids: bigint[] = [];
  while (p < end) { if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn; const fn = Number(t >> 3n), wt = Number(t & 7n);
    if (wt === 0) { const [, x] = readVarint(buf, p); p = x; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); const ve = x + len; if (fn === 11) { let q = x; while (q < ve) { const st = buf[q++]; if (st === 0) break; const sw = st & 7; if (sw === 2) { const [sl, ss] = readVarint(buf, q); const se = ss + Number(sl); if (st === 0x0a) for (let o = ss; o + 8 <= se; o += 8) ids.push(readFixed64LE(buf, o)); q = se; } else if (sw === 0) { const [, m] = readVarint(buf, q); q = m; } else if (sw === 1) q += 8; else if (sw === 5) q += 4; else break; } } p = ve; }
    else if (wt === 5) p += 4; else break; }
  return ids;
}
const hByName = new Map<string, HRec>();
for (let ai = 0; ai < hAnchors.length; ai++) {
  const a = hAnchors[ai]; const end = ai + 1 < hAnchors.length ? hAnchors[ai + 1].i : Math.min(buf.length, a.body + 2_000_000);
  hByName.set(a.name.toLowerCase(), { name: a.name, body: a.body, end, simIds: simIdsOf(a.body, end) });
}

// ---- aggregate field presence across a group (at sim level) ----
function groupSimFields(names: string[]) {
  const present = new Map<number, number>(); let simCount = 0; const wtSample = new Map<number, string>();
  for (const nm of names) {
    const h = hByName.get(nm); if (!h) { console.log(`   (not found: ${nm})`); continue; }
    for (const id of h.simIds) { const s = simById.get(id); if (!s) continue; simCount++;
      const inv = inventory(s.bodyStart, s.recEnd);
      for (const [fn, info] of inv) { present.set(fn, (present.get(fn) ?? 0) + 1); if (!wtSample.has(fn)) wtSample.set(fn, `wt${info.wt}/${info.sample}`); }
    }
  }
  return { present, simCount, wtSample };
}

// ---- aggregate field presence + value samples across a group at HOUSEHOLD level ----
function groupHhFields(names: string[]) {
  const present = new Map<number, number>(); let n = 0; const wtSample = new Map<number, string>(); const vals = new Map<number, Set<string>>();
  for (const nm of names) {
    const h = hByName.get(nm); if (!h) continue; n++;
    const inv = inventory(h.body - 9, h.end);   // include the f1/id region by backing up to anchor
    for (const [fn, info] of inv) { present.set(fn, (present.get(fn) ?? 0) + 1); if (!wtSample.has(fn)) wtSample.set(fn, `wt${info.wt}/${info.sample}`); (vals.get(fn) ?? vals.set(fn, new Set()).get(fn)!).add(info.sample); }
  }
  return { present, n, wtSample, vals };
}
console.log(`${save}\nMINE households: ${MINE.length}   SPAWN households: ${SPAWN.length}\n`);
const mh = groupHhFields(MINE), sh = groupHhFields(SPAWN);
console.log(`HOUSEHOLD-LEVEL field presence:`);
console.log(`  fn   MINE   SPAWN  contrast  (wt/sample)`);
for (const fn of [...new Set([...mh.present.keys(), ...sh.present.keys()])].sort((a, b) => a - b)) {
  const m = (mh.present.get(fn) ?? 0) / (mh.n || 1), s = (sh.present.get(fn) ?? 0) / (sh.n || 1); const c = Math.abs(m - s);
  console.log(`  f${String(fn).padEnd(3)} ${(m * 100).toFixed(0).padStart(4)}% ${(s * 100).toFixed(0).padStart(4)}%   ${(c * 100).toFixed(0).padStart(4)}%${c >= 0.5 ? '  <== SPLITS' : c >= 0.25 ? '  <- partial' : ''}   ${mh.wtSample.get(fn) ?? sh.wtSample.get(fn) ?? ''}`);
}
console.log('');
const mine = groupSimFields(MINE), spawn = groupSimFields(SPAWN);
console.log(`MINE sims=${mine.simCount}  SPAWN sims=${spawn.simCount}\n`);

const allFn = [...new Set([...mine.present.keys(), ...spawn.present.keys()])].sort((a, b) => a - b);
console.log(`SIM-LEVEL field presence (fraction of sims with field):`);
console.log(`  fn   MINE    SPAWN   contrast  (wt/sample)`);
for (const fn of allFn) {
  const m = (mine.present.get(fn) ?? 0) / (mine.simCount || 1);
  const s = (spawn.present.get(fn) ?? 0) / (spawn.simCount || 1);
  const contrast = Math.abs(m - s);
  const flag = contrast >= 0.5 ? '  <== SPLITS' : contrast >= 0.25 ? '  <- partial' : '';
  console.log(`  f${String(fn).padEnd(3)} ${(m * 100).toFixed(0).padStart(4)}%  ${(s * 100).toFixed(0).padStart(4)}%   ${(contrast * 100).toFixed(0).padStart(4)}%${flag}   ${mine.wtSample.get(fn) ?? spawn.wtSample.get(fn) ?? ''}`);
}
