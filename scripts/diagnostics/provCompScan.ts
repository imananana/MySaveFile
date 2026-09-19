// Re-search for lot creator across ALL resources, decompressing EVERY compression
// type (refpack 0xffff, zlib 0x5a42, raw 0x0000, + try-both fallback). Also report
// compType distribution and any resources that fail to decode (potential blind spots).
import { readFileSync } from 'fs';
import { inflateSync, unzipSync } from 'zlib';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const save = process.argv[2] ?? 'Slot_12345678.save';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

const NEEDLES = ['josephinanne', 'Cabin Fever', 'imanistan', 'Iman Test'];

// compType distribution
const ct = new Map<number, number>();
for (const r of res) ct.set(r.compType, (ct.get(r.compType) ?? 0) + 1);
console.log(`${save}: ${res.length} resources. compType distribution:`);
for (const [k, c] of [...ct].sort((a, b) => b[1] - a[1])) console.log(`   0x${k.toString(16)}: ${c}`);

function tryDecode(r: { compType: number; data: Uint8Array }): { buf: Uint8Array | null; how: string } {
  const d = r.data;
  if (r.compType === 0x0000) return { buf: d, how: 'raw' };
  if (r.compType === 0xffff) { try { return { buf: decompressRefpack(d), how: 'refpack' }; } catch { /* */ } }
  if (r.compType === 0x5a42) { try { return { buf: inflateSync(d), how: 'zlib' }; } catch { /* */ } }
  // fallbacks: try everything
  try { return { buf: decompressRefpack(d), how: 'refpack?' }; } catch { /* */ }
  try { return { buf: inflateSync(d), how: 'zlib?' }; } catch { /* */ }
  try { return { buf: unzipSync(d), how: 'unzip?' }; } catch { /* */ }
  return { buf: d, how: 'raw-fallback' };
}

let failed = 0;
const hitTypes = new Map<string, Set<string>>();
for (const n of NEEDLES) hitTypes.set(n, new Set());

for (const r of res) {
  const { buf, how } = tryDecode(r);
  if (!buf) { failed++; continue; }
  if (how.endsWith('-fallback') && r.compType !== 0x0000) failed++; // couldn't really decode a compressed one
  const s = Buffer.from(buf).toString('latin1');
  for (const n of NEEDLES) {
    if (s.includes(n)) {
      hitTypes.get(n)!.add(`resType=0x${r.type.toString(16)} inst=${instanceIdHex(r)} via=${how} comp=0x${r.compType.toString(16)}`);
    }
  }
}

console.log(`\nResources that could NOT be decoded (blind spots): ${failed}`);
console.log('\nHits:');
for (const [n, locs] of hitTypes) {
  console.log(`   "${n}": ${locs.size ? [...locs].join(' | ') : '<none>'}`);
}
