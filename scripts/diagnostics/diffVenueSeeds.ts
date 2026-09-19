/**
 * Custom-venue reseed spike — batch 3.
 * Dumps every "Emotion Camp" occurrence (live venue + saved preset) across the
 * incremental .ver chain, and analyzes the new "Cozy Corner House" venue that had
 * the premade "Cooking Competition" preset applied (#13): looks for an inline copy
 * vs a reference to the stock preset tuning id 455989 (0x6F335 = varint b5 ea 1b).
 *
 * Run: npx tsx scripts/diagnostics/diffVenueSeeds.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const CHAIN: Array<[string, string]> = [
  ['Slot_00000003.save.ver4', 'REF = end of batch 2 (#8)'],
  ['Slot_00000003.save.ver3', '#9 Sad Man role activities: Clean + Bake'],
  ['Slot_00000003.save.ver2', '#10 Sad Man criterion gender=Male (UN-required)'],
  ['Slot_00000003.save.ver1', '#11 Sad Man outfit Style: Outdoorsy + Blue'],
  ['Slot_00000003.save.ver0', '#12 Sad Man per-slot outfit: Swimwear @ 6AM'],
  ['Slot_00000003.save',      '#13 Cozy Corner House = custom venue w/ Cooking Competition premade'],
];

function blobOf(path: string): Uint8Array {
  const buf = readFileSync(path);
  const res = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const r = res.find((x) => x.type === 0x0d)!;
  return r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
}
function findAll(hay: Uint8Array, needle: Uint8Array): number[] {
  const hits: number[] = [];
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let m = true; for (let j = 0; j < needle.length; j++) if (hay[i+j] !== needle[j]) { m = false; break; }
    if (m) hits.push(i);
  }
  return hits;
}
const findStr = (h: Uint8Array, s: string) => findAll(h, Buffer.from(s, 'utf8'));
function varint(b: Uint8Array, off: number): [number, number] {
  let r = 0, s = 0, i = off;
  for (;;) { const x = b[i++]; r += (x & 0x7f) * 2 ** s; if (!(x & 0x80)) break; s += 7; }
  return [r, i];
}
function dump(data: Uint8Array, start: number, end: number) {
  for (let i = start; i < end; i += 16) {
    const sl = data.slice(i, Math.min(i+16, end));
    const hex = Array.from(sl).map(b=>b.toString(16).padStart(2,'0')).join(' ');
    const asc = Array.from(sl).map(b=>(b>=0x20&&b<0x7f)?String.fromCharCode(b):'.').join('');
    console.log(`    ${hex.padEnd(48)}  ${asc}`);
  }
}
// dump the field24 venue record starting at a name offset (back up to c2 01)
function dumpVenueAt(data: Uint8Array, nameAt: number) {
  let recStart = nameAt - 2, recLen = 0, hasWrap = false;
  for (let i = nameAt - 12; i < nameAt; i++) {
    if (data[i] === 0xc2 && data[i+1] === 0x01) { const [len, after] = varint(data, i + 2); recStart = after; recLen = len; hasWrap = true; break; }
  }
  console.log(`    @0x${recStart.toString(16)} ${hasWrap ? `field24 len ${recLen}` : '(no c2 01 wrapper — preset-library copy)'}`);
  dump(data, recStart, recStart + (recLen || 190));
}

for (const [file, label] of CHAIN) {
  const data = blobOf(`${DIR}/${file}`);
  console.log(`\n================ ${file}  —  ${label}`);
  const ec = findStr(data, 'Emotion Camp');
  console.log(`  "Emotion Camp" x${ec.length} @ ${ec.map(h=>'0x'+h.toString(16)).join(', ')}`);
  ec.forEach((off, k) => { console.log(`  -- occurrence #${k}:`); dumpVenueAt(data, off); });
}

// #13 analysis on the final save
console.log('\n\n############### #13 ANALYSIS (final save) ###############');
const data = blobOf(`${DIR}/Slot_00000003.save`);
for (const s of ['Cozy Corner', 'Cooking Competition', 'Contestant', 'Chef']) {
  console.log(`  "${s}" @ ${findStr(data, s).map(h=>'0x'+h.toString(16)).join(', ') || '(none)'}`);
}
const refBytes = Uint8Array.from([0xb5, 0xea, 0x1b]); // varint 455989 = Cooking Competition tuning id
console.log(`  premade tuning id 455989 (b5 ea 1b) @ ${findAll(data, refBytes).map(h=>'0x'+h.toString(16)).join(', ') || '(none)'}`);
const cz = findStr(data, 'Cozy Corner');
if (cz.length) { console.log(`\n  -- Cozy Corner region (64 before / 320 after first hit):`); dump(data, Math.max(0, cz[0]-64), cz[0] + 320); }
