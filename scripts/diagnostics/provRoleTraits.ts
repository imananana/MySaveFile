// Do PERSISTENT household sims carry NPC role traits (isGrimReaper/isMaid/isButler…),
// or are the unstamped ones essentially trait-blank townies/player-families?
// Builds the is<Role> trait-GUID set from templates, then per sim intersects the
// varints in its record body with that set.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const TPL_DIR = `${process.env.HOME}/Documents/Sim Template`;
const save = process.argv[2] ?? 'Slot_10312029.save';

// role-trait GUID -> name
const role = new Map<number, string>();
for (const f of readdirSync(TPL_DIR)) {
  if (!f.endsWith('.xml')) continue;
  const xml = readFileSync(`${TPL_DIR}/${f}`, 'utf8');
  for (const m of xml.matchAll(/<T>(\d+)<!--(trait_is[A-Za-z]+)-->/g)) role.set(Number(m[1]), m[2]);
}
console.log(`role-trait catalog: ${role.size} is<Role> GUIDs\n`);

const b = readFileSync(`${SAVES}/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let buf: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!buf || d.length > buf.length) buf = d; }
const B = buf!;

// collect sim anchors
const anchors: { i: number; first: string; last: string; bodyStart: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i + 40 < B.length; i++) {
  if (B[i] !== 0x09) continue;
  const id = readFixed64LE(B, i + 1); let p = i + 9;
  if (B[p] !== 0x11) continue; p += 9;
  if (B[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(B, p); } catch { continue; } p = n;
  if (B[p] !== 0x21) continue; p += 9;
  if (B[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(B, p); } catch { continue; }
  if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
  if (B[p] === 0x32) { p++; try { [last, p] = readString(B, p); } catch { last = ''; } }
  if (B[p] !== 0x38) continue;
  if (id === 0n || seen.has(id)) continue; seen.add(id);
  anchors.push({ i, first, last, bodyStart: p });
}

const hitCounts = new Map<string, number>(); let simsWithRole = 0; const examples: string[] = [];
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai];
  const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(B.length, a.bodyStart + 30000);
  let p = a.bodyStart; const found = new Set<string>();
  while (p < end) {
    if (B[p] === 0) break; let t, nn; try { [t, nn] = readVarint(B, p); } catch { break; } p = nn;
    const wt = Number(t & 7n);
    if (wt === 0) { const [v, x] = readVarint(B, p); p = x; const r = role.get(Number(v)); if (r) found.add(r); }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, x] = readVarint(B, p); const len = Number(l); // also scan packed varint arrays
      for (let q = x; q < x + len; ) { let v, m; try { [v, m] = readVarint(B, q); } catch { break; } q = m; const r = role.get(Number(v)); if (r) found.add(r); }
      p = x + len; }
    else if (wt === 5) p += 4; else break;
  }
  if (found.size) { simsWithRole++; for (const r of found) hitCounts.set(r, (hitCounts.get(r) ?? 0) + 1); if (examples.length < 18) examples.push(`${a.first} ${a.last} → ${[...found].join(', ')}`); }
}

console.log(`${save}: ${anchors.length} persistent sims; ${simsWithRole} carry ≥1 role trait (${(simsWithRole / anchors.length * 100).toFixed(1)}%)\n`);
console.log('role traits present (count of sims):');
for (const [r, c] of [...hitCounts].sort((a, b) => b[1] - a[1])) console.log(`   ${r}: ${c}`);
console.log('\nexamples:'); for (const e of examples) console.log('   ' + e);
