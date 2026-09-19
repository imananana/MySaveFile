/**
 * Find the 'Power House' club inside the 0x0d resource and dump surrounding
 * bytes. Goal: confirm the protobuf structure of the Club record so we know
 * the exact byte layout (especially the ResourceKey for the icon).
 *
 * Expected: club name shows up after a 0x12 tag + length varint. Before
 * that, field 1 (0x08 varint = club_id). After name, field 3 (0x1a = icon
 * ResourceKey ldelim) which should contain the bytes fb c3 b4 dd 67 67 c0 f0
 * (the icon instance the user told us).
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;
const NEEDLE = process.env.NEEDLE || 'Power House';

console.log(`Loading save: ${SAVE}`);
console.log(`Searching for needle: ${NEEDLE}\n`);

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const r0d = resources.find((r) => r.type === 0x0d);
if (!r0d) { console.error('No 0x0d resource'); process.exit(1); }

const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;
console.log(`0x0d decompressed: ${raw.length} bytes\n`);

const needleBytes = Buffer.from(NEEDLE, 'utf-8');
const hits: number[] = [];
for (let i = 0; i < raw.length - needleBytes.length; i++) {
  let m = true;
  for (let j = 0; j < needleBytes.length; j++) {
    if (raw[i + j] !== needleBytes[j]) { m = false; break; }
  }
  if (m) hits.push(i);
}

console.log(`Found ${hits.length} occurrence(s) of "${NEEDLE}"\n`);

function hexdump(start: number, length: number) {
  const end = Math.min(start + length, raw.length);
  for (let row = start; row < end; row += 16) {
    const slice = raw.slice(row, Math.min(row + 16, end));
    const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(48);
    const ascii = Array.from(slice).map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    const offset = row.toString(16).padStart(8, '0');
    console.log(`${offset}  ${hex}  ${ascii}`);
  }
}

for (const hit of hits) {
  console.log(`\n═══ Hit at offset 0x${hit.toString(16)} (${hit}) ═══`);
  // Walk backward up to ~16 bytes to find the protobuf length prefix + tag
  const ctxBefore = Math.max(0, hit - 32);
  // And forward enough to see the icon ResourceKey + a few more fields
  hexdump(ctxBefore, 256);
}

// Also: confirm the icon hex appears somewhere nearby (as raw bytes)
// User said icon = fbc3b4dd6767c0f0 (instance ID for Power House)
const iconHex = process.env.ICON_HEX || 'fbc3b4dd6767c0f0';
const iconBytes = Buffer.from(iconHex, 'hex');
console.log(`\nSearching for icon instance bytes: ${iconHex}`);
const iconHits: number[] = [];
for (let i = 0; i < raw.length - iconBytes.length; i++) {
  let m = true;
  for (let j = 0; j < iconBytes.length; j++) {
    // Try both byte orders (protobuf fixed64 is little-endian)
    if (raw[i + j] !== iconBytes[j]) { m = false; break; }
  }
  if (m) iconHits.push(i);
}
// Also try little-endian (reversed)
const iconBytesLE = Buffer.from(iconBytes).reverse();
const iconHitsLE: number[] = [];
for (let i = 0; i < raw.length - iconBytesLE.length; i++) {
  let m = true;
  for (let j = 0; j < iconBytesLE.length; j++) {
    if (raw[i + j] !== iconBytesLE[j]) { m = false; break; }
  }
  if (m) iconHitsLE.push(i);
}
console.log(`  Big-endian hits:    ${iconHits.length}${iconHits.length ? ' at ' + iconHits.map((x) => '0x' + x.toString(16)).join(', ') : ''}`);
console.log(`  Little-endian hits: ${iconHitsLE.length}${iconHitsLE.length ? ' at ' + iconHitsLE.map((x) => '0x' + x.toString(16)).join(', ') : ''}`);

// Cross-reference: is the icon close to the name? (within 200 bytes)
if (hits.length && (iconHits.length || iconHitsLE.length)) {
  for (const nh of hits) {
    for (const ih of [...iconHits, ...iconHitsLE]) {
      const dist = Math.abs(ih - nh);
      if (dist < 200) {
        console.log(`  → icon @ 0x${ih.toString(16)} is ${ih - nh} bytes from name @ 0x${nh.toString(16)}`);
      }
    }
  }
}
