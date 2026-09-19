/**
 * diagSearchLotId.mjs
 *
 * Search the FULL decompressed 0x0d resource for ALL occurrences of a given
 * 64-bit lot ID. For each occurrence, dump the surrounding bytes + their
 * decoded fields, to identify all records that reference this lot.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const TARGET_HEX = process.argv[3] || '0b37157135752616'; // Mirage Brew & Pottery
const targetBytes = Buffer.from(TARGET_HEX.match(/../g).reverse().join(''), 'hex'); // little-endian

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst = (flags & 0x01) !== 0, groupConst = (flags & 0x02) !== 0, instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0;
if (typeConst) { constType = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst) headerPos += 4;
if (instHiConst) headerPos += 4;
const entrySize = 32 - (typeConst?4:0) - (groupConst?4:0) - (instHiConst?4:0);

let data = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4; off += instHiConst ? 0 : 4; off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  if (type !== 0x0d) continue;
  let raw = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) { try { const p2 = Buffer.from(raw); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; raw = decompress(p2); } catch { continue; } }
  data = raw; break;
}

console.log(`Searching for lot ID 0x${TARGET_HEX} in ${data.length} bytes of decompressed 0x0d data`);
console.log(`Target byte sequence (little-endian): ${targetBytes.toString('hex')}\n`);

// Find all occurrences
const occurrences = [];
for (let i = 0; i <= data.length - 8; i++) {
  let match = true;
  for (let j = 0; j < 8; j++) {
    if (data[i + j] !== targetBytes[j]) { match = false; break; }
  }
  if (match) occurrences.push(i);
}

console.log(`Found ${occurrences.length} occurrences of the lot ID.\n`);

// For each occurrence, show 64 bytes before and 64 bytes after
for (let n = 0; n < Math.min(20, occurrences.length); n++) {
  const off = occurrences[n];
  const start = Math.max(0, off - 32);
  const end = Math.min(data.length, off + 8 + 64);
  console.log(`\n=== Occurrence ${n + 1} at offset 0x${off.toString(16)} (${off}) ===`);
  // tag byte right before? Show in highlight
  const before = data[off - 1];
  console.log(`  Byte before ID (likely tag): 0x${before.toString(16).padStart(2, '0')}  ` +
              `(field ${before >> 3}, wire ${before & 0x07})`);
  console.log(`  hex: ${Buffer.from(data.slice(start, end)).toString('hex')}`);
}
