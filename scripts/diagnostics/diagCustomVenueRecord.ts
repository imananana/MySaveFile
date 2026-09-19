/**
 * Locate the custom venue record around the "CustomVenuePresetTest" lot.
 * Dump a window of bytes around the name to figure out the enclosing field
 * and what other fields live alongside it.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;
const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const data = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;

const NEEDLE = 'CustomVenuePresetTest';
const needleBytes = Buffer.from(NEEDLE, 'utf8');

function findAll(haystack: Uint8Array, needle: Uint8Array): number[] {
  const hits: number[] = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let m = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { m = false; break; }
    }
    if (m) hits.push(i);
  }
  return hits;
}

const hits = findAll(data, needleBytes);
console.log(`"${NEEDLE}" at ${hits.map((h) => '0x' + h.toString(16)).join(', ')}\n`);

for (const off of hits) {
  console.log(`--- Around 0x${off.toString(16)} (lot name) ---`);

  // Dump 64 bytes before (with tag/length analysis) and 256 after.
  const start = Math.max(0, off - 64);
  const end = Math.min(data.length, off + 256 + NEEDLE.length);

  // The byte right before the name is the length varint (single byte = 21 for our needle).
  // The bytes before that should be the field tag.
  const lenByte = data[off - 1];
  console.log(`  byte right before name: 0x${lenByte.toString(16)} (length = ${lenByte}, expected ${NEEDLE.length})`);
  console.log(`  bytes 8 before name: ${Array.from(data.slice(off - 8, off)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  bytes 256 after name:`);
  for (let i = off + NEEDLE.length; i < end; i += 16) {
    const chunk = Array.from(data.slice(i, Math.min(i + 16, end)))
      .map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(data.slice(i, Math.min(i + 16, end)))
      .map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    console.log(`    0x${i.toString(16).padStart(6, '0')}  ${chunk.padEnd(48)}  ${ascii}`);
  }

  console.log(`\n  bytes 64 before name:`);
  for (let i = start; i < off; i += 16) {
    const chunk = Array.from(data.slice(i, Math.min(i + 16, off)))
      .map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(data.slice(i, Math.min(i + 16, off)))
      .map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    console.log(`    0x${i.toString(16).padStart(6, '0')}  ${chunk.padEnd(48)}  ${ascii}`);
  }
}
