/**
 * SPIKE: is in-game Dynasty/Legacy data present & parseable in a save?
 * Scans the 0x0d blob for dynasty-related ASCII strings and reports the byte
 * context, so we can find the enclosing structure.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeDynasty.ts [savePath]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00001706.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
console.log(`0x0d blob: ${buf.length} bytes — ${savePath.split('/').pop()}`);

// All printable ASCII runs (len>=4) with offsets
interface Run { s: string; off: number; }
const runs: Run[] = [];
let cur = ''; let start = 0;
for (let i = 0; i < buf.length; i++) {
  const b = buf[i];
  if (b >= 0x20 && b <= 0x7e) { if (cur === '') start = i; cur += String.fromCharCode(b); }
  else { if (cur.length >= 4) runs.push({ s: cur, off: start }); cur = ''; }
}
if (cur.length >= 4) runs.push({ s: cur, off: start });

const KW = /dynast|legacy|founder|heir|lineage|bloodline|ancestor|descend/i;
const hits = runs.filter((r) => KW.test(r.s));
console.log(`\nASCII runs matching dynasty keywords: ${hits.length}`);
for (const h of hits.slice(0, 60)) console.log(`  @${h.off}  "${h.s}"`);

// Frequency of distinct matched tokens
const freq = new Map<string, number>();
for (const h of hits) freq.set(h.s, (freq.get(h.s) ?? 0) + 1);
console.log(`\nDistinct matched strings (×count):`);
for (const [s, c] of [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${c}×  "${s}"`);
