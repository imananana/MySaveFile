/**
 * Find the protobuf field number that stores a club's description.
 * Same approach as diagHouseholdDesc.ts: grep the decompressed 0x0d
 * for the needle, then walk backwards to find the preceding tag.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE_NAME = process.env.SAVE || 'Slot_10312032.save';
const SAVE = SAVE_NAME.startsWith('/')
  ? SAVE_NAME
  : `${HOME}/Documents/Electronic Arts/The Sims 4/saves/${SAVE_NAME}`;
const NEEDLE = process.env.NEEDLE || 'DESC-CLUB-12345';
const CLUB_NAME = process.env.CLUB_NAME || 'Test Club Desc';

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const data = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;

const needleBytes = Buffer.from(NEEDLE, 'utf8');
const clubBytes = Buffer.from(CLUB_NAME, 'utf8');

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

function readVarintBack(buf: Uint8Array, end: number): { value: bigint; start: number } | null {
  let p = end - 1;
  if (p < 0) return null;
  if ((buf[p] & 0x80) !== 0) return null;
  while (p > 0 && (buf[p - 1] & 0x80) !== 0) p--;
  let value = 0n;
  let shift = 0n;
  for (let i = p; i < end; i++) {
    value |= BigInt(buf[i] & 0x7f) << shift;
    shift += 7n;
  }
  return { value, start: p };
}

const needleHits = findAll(data, needleBytes);
console.log(`\nNeedle "${NEEDLE}" found at ${needleHits.length} offset(s):`);
for (const off of needleHits) console.log(`  0x${off.toString(16)}`);

const clubHits = findAll(data, clubBytes);
console.log(`\nClub name "${CLUB_NAME}" found at ${clubHits.length} offset(s):`);
for (const off of clubHits) console.log(`  0x${off.toString(16)}`);

for (const off of needleHits) {
  console.log(`\n--- Needle at 0x${off.toString(16)} ---`);
  const lenVI = readVarintBack(data, off);
  if (lenVI && Number(lenVI.value) === needleBytes.length) {
    console.log(`  length-varint = ${lenVI.value} at 0x${lenVI.start.toString(16)}`);
    const tagVI = readVarintBack(data, lenVI.start);
    if (tagVI) {
      const fn = Number(tagVI.value >> 3n);
      const wire = Number(tagVI.value & 7n);
      console.log(`  tag = 0x${tagVI.value.toString(16)} → field ${fn}, wire ${wire}`);
    }
  }
  const precedingClubHit = [...clubHits].reverse().find((h) => h < off);
  if (precedingClubHit !== undefined) {
    console.log(`  preceded by club name "${CLUB_NAME}" at 0x${precedingClubHit.toString(16)} (distance ${off - precedingClubHit} bytes)`);
  }
}
