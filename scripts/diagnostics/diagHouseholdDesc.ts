/**
 * Find the protobuf field number that stores a household's description.
 *
 * Usage: SAVE=Slot_10312032.save NEEDLE=DESC-HH-12345 npx tsx scripts/diagHouseholdDesc.ts
 *
 * Strategy: locate the anchor for the "DescTest" household (the existing
 * household scanner finds it by name), then walk forward through the bytes
 * looking for the needle. Print the field tag that immediately precedes
 * the length-prefixed string.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE_NAME = process.env.SAVE || 'Slot_10312032.save';
const SAVE = SAVE_NAME.startsWith('/')
  ? SAVE_NAME
  : `${HOME}/Documents/Electronic Arts/The Sims 4/saves/${SAVE_NAME}`;
const NEEDLE = process.env.NEEDLE || 'DESC-HH-12345';
const HH_NAME = process.env.HH_NAME || 'DescTest';

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const data = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;

console.log(`Save: ${SAVE}`);
console.log(`Decompressed 0x0d: ${data.length} bytes`);
console.log(`Looking for needle: "${NEEDLE}"`);
console.log(`Household name: "${HH_NAME}"`);

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

const needleHits = findAll(data, needleBytes);
console.log(`\nNeedle "${NEEDLE}" found at ${needleHits.length} offset(s):`);
for (const off of needleHits) {
  console.log(`  0x${off.toString(16)}`);
}

const hhNameBytes = Buffer.from(HH_NAME, 'utf8');
const hhHits = findAll(data, hhNameBytes);
console.log(`\nHH name "${HH_NAME}" found at ${hhHits.length} offset(s):`);
for (const off of hhHits) {
  console.log(`  0x${off.toString(16)}`);
}

if (needleHits.length === 0) {
  console.log('\nNeedle not found. Description likely not in 0x0d, or encoded differently.');
  process.exit(0);
}

// For each needle hit, look back to find the preceding length-prefix varint
// (which equals needle.length), then look back further to find the field tag.
function readVarintBack(buf: Uint8Array, end: number): { value: bigint; start: number } | null {
  // A varint is a sequence of bytes where the last byte has bit 7 cleared.
  // Walking backwards: the byte at end-1 is the last byte (high bit clear).
  // Earlier bytes have high bit set.
  let p = end - 1;
  if (p < 0) return null;
  if ((buf[p] & 0x80) !== 0) return null; // last byte must have high bit clear
  while (p > 0 && (buf[p - 1] & 0x80) !== 0) p--;
  // Now p is the first byte of the varint.
  let value = 0n;
  let shift = 0n;
  for (let i = p; i < end; i++) {
    value |= BigInt(buf[i] & 0x7f) << shift;
    shift += 7n;
  }
  return { value, start: p };
}

for (const off of needleHits) {
  console.log(`\n--- Needle at 0x${off.toString(16)} ---`);
  // The length varint encodes NEEDLE.length (13 bytes). Try to find it
  // right before `off`.
  const lenVI = readVarintBack(data, off);
  if (lenVI && Number(lenVI.value) === needleBytes.length) {
    console.log(`  length-varint = ${lenVI.value} (matches needle length) at 0x${lenVI.start.toString(16)}`);
    // Now find the tag varint right before the length-varint.
    const tagVI = readVarintBack(data, lenVI.start);
    if (tagVI) {
      const fn = Number(tagVI.value >> 3n);
      const wire = Number(tagVI.value & 7n);
      console.log(`  tag = 0x${tagVI.value.toString(16)} → field ${fn}, wire ${wire} at 0x${tagVI.start.toString(16)}`);
      console.log(`  preceding 16 bytes: ${Array.from(data.slice(Math.max(0, tagVI.start - 16), tagVI.start))
        .map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
  } else {
    console.log(`  no clean length-varint match before needle (got ${lenVI ? lenVI.value : 'null'})`);
  }

  // Also: which HH name hit precedes this needle hit?
  const precedingHHHit = [...hhHits].reverse().find((h) => h < off);
  if (precedingHHHit !== undefined) {
    const dist = off - precedingHHHit;
    console.log(`  preceded by "${HH_NAME}" at 0x${precedingHHHit.toString(16)} (distance ${dist} bytes)`);
  }
}
