// Validate household f9 (wt1 fixed64) as a PLAYER-AUTHORED marker.
// For every household: detect f9 presence + value, f21 stamp state, premade-by-name,
// then cross-tab f9-presence against {gallery-stamped, premade, native}.
// If f9 = "a human authored this", expect: stamped=high, premade=~0, native=split.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const TPL_DIR = `${process.env.HOME}/Documents/Sim Template`;
const save = process.argv[2] ?? 'Slot_10312029.save';

// premade surname catalog (display strings)
const premadeSurnames = new Set<string>(['pancakes', 'caliente', 'lothario']);
for (const f of readdirSync(TPL_DIR)) { if (!/premadeSimTemplate/i.test(f)) continue; const m = readFileSync(`${TPL_DIR}/${f}`, 'utf8').match(/<T n="specify_last_name">0x[0-9A-Fa-f]+<!--([^>]*)--><\/T>/); if (m) premadeSurnames.add(m[1].trim().toLowerCase()); }

const b = readFileSync(`${SAVES}/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let B: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!B || d.length > B.length) B = d; }
const buf = B!;

// sim id -> last name (for premade detection of members)
const simLast = new Map<bigint, string>();
{ const seen = new Set<bigint>();
  for (let i = 0; i + 40 < buf.length; i++) {
    if (buf[i] !== 0x09) continue; const id = readFixed64LE(buf, i + 1); let p = i + 9;
    if (buf[p] !== 0x11) continue; p += 9; if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
    if (buf[p] !== 0x21) continue; p += 9; if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
    if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue; if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
    if (buf[p] !== 0x38) continue; if (id === 0n || seen.has(id)) continue; seen.add(id); simLast.set(id, last); } }

// household anchors
const anchors: { i: number; name: string; body: number }[] = []; const seenH = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue; const id = readFixed64LE(buf, i + 10); let p = i + 18;
  if (buf[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(buf, p); } catch { continue; }
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  p = after; if (buf[p] !== 0x21) continue; p += 9; if (seenH.has(id)) continue; seenH.add(id); anchors.push({ i, name, body: p });
}

type Cat = 'stamped' | 'premade' | 'native';
const tab: Record<Cat, { f9: number; total: number }> = { stamped: { f9: 0, total: 0 }, premade: { f9: 0, total: 0 }, native: { f9: 0, total: 0 } };
const f9vals: string[] = []; const nativeWithF9: string[] = []; const nativeNoF9: string[] = [];
let f9sharedCheck = new Set<string>();

for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai]; const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(buf.length, a.body + 2_000_000);
  // walk body fields: capture f9 (wt1), f21 stamp, f11 simIds
  let p = a.body; let f9: bigint | null = null; let f21named = false; const simIds: bigint[] = [];
  while (p < end) { if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn; const fn = Number(t >> 3n), wt = Number(t & 7n);
    if (wt === 0) { const [, x] = readVarint(buf, p); p = x; }
    else if (wt === 1) { if (fn === 9) f9 = readFixed64LE(buf, p); p += 8; }
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); const ve = x + len; if (len < 0 || ve > end) break; if (fn === 21 && len > 0) f21named = true; if (fn === 11) { let q = x; while (q < ve) { const st = buf[q++]; if (st === 0) break; const sw = st & 7; if (sw === 2) { const [sl, ss] = readVarint(buf, q); const se = ss + Number(sl); if (st === 0x0a) for (let o = ss; o + 8 <= se; o += 8) simIds.push(readFixed64LE(buf, o)); q = se; } else if (sw === 0) { const [, m] = readVarint(buf, q); q = m; } else if (sw === 1) q += 8; else if (sw === 5) q += 4; else break; } } p = ve; }
    else if (wt === 5) p += 4; else break; }

  const hasPremadeMember = simIds.some(id => { const ln = simLast.get(id); return ln && premadeSurnames.has(ln.toLowerCase()); }) || premadeSurnames.has(a.name.toLowerCase());
  const cat: Cat = f21named ? 'stamped' : hasPremadeMember ? 'premade' : 'native';
  tab[cat].total++; if (f9 != null) { tab[cat].f9++; if (f9vals.length < 6) f9vals.push('0x' + f9.toString(16)); f9sharedCheck.add('0x' + f9.toString(16)); }
  if (cat === 'native') { if (f9 != null) nativeWithF9.push(a.name); else nativeNoF9.push(a.name); }
}

console.log(`${save}: ${anchors.length} households\n`);
console.log(`f9 presence by category:`);
for (const c of ['stamped', 'premade', 'native'] as Cat[]) { const t = tab[c]; console.log(`  ${c.padEnd(8)}: ${t.f9}/${t.total} have f9  (${(t.f9 / (t.total || 1) * 100).toFixed(0)}%)`); }
console.log(`\nf9 values distinct across ${f9sharedCheck.size} of all f9-bearing households → ${f9sharedCheck.size > 5 ? 'per-household unique (an ID)' : 'shared (a flag/ref)'}; sample: ${f9vals.join(', ')}`);
console.log(`\nNATIVE split by f9:`);
console.log(`  f9 PRESENT (${nativeWithF9.length}): ${nativeWithF9.slice(0, 30).join(', ')}`);
console.log(`  f9 ABSENT  (${nativeNoF9.length}): ${nativeNoF9.slice(0, 30).join(', ')}`);
