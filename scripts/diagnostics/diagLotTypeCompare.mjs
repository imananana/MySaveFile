/**
 * diagLotTypeCompare.mjs
 *
 * Finds specific named lots in 0x3a records and dumps their FULL binary hex + field layout.
 * Compare a known residential lot vs known venue lots side-by-side to find the lot type field.
 *
 * Usage:
 *   node scripts/diagLotTypeCompare.mjs [path-to-save]
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
const savePath = process.argv[2] ||
  `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst   = (flags & 0x01) !== 0;
const groupConst  = (flags & 0x02) !== 0;
const instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0, constGroup = 0, constInstHi = 0;
if (typeConst)   { constType   = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst)  { constGroup  = view.getUint32(headerPos, true); headerPos += 4; }
if (instHiConst) { constInstHi = view.getUint32(headerPos, true); headerPos += 4; }
const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

function readVarint(buf, pos) {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}
function readFixed64LE(buf, pos) {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}
function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end];
}

function dumpAllFields(buf, start, end, indent = '') {
  let p = start;
  while (p < end) {
    if (p >= buf.length) break;
    const tagByte = buf[p]; p++;
    const wireType = tagByte & 0x07;
    const fieldNum = tagByte >> 3;
    if (fieldNum === 0) break;
    if (wireType === 0) {
      const [val, next] = readVarint(buf, p); p = next;
      console.log(`${indent}field ${fieldNum} tag=0x${tagByte.toString(16).padStart(2,'0')} (varint) = ${val}  [0x${val.toString(16)}]`);
    } else if (wireType === 1) {
      if (p + 8 > buf.length) break;
      const val = readFixed64LE(buf, p); p += 8;
      console.log(`${indent}field ${fieldNum} tag=0x${tagByte.toString(16).padStart(2,'0')} (fixed64) = 0x${val.toString(16).padStart(16,'0')}`);
    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, p);
      const msgEnd = next + Number(len);
      if (msgEnd > buf.length) break;
      const raw = buf.slice(next, msgEnd);
      const hex = Buffer.from(raw).toString('hex');
      let str = '';
      try { str = Buffer.from(raw).toString('utf8'); } catch {}
      const isPrintable = str.length > 0 && /^[\x20-\x7e\n\r]*$/.test(str);
      if (isPrintable) {
        console.log(`${indent}field ${fieldNum} tag=0x${tagByte.toString(16).padStart(2,'0')} (string, len=${len}) = "${str}"`);
      } else {
        console.log(`${indent}field ${fieldNum} tag=0x${tagByte.toString(16).padStart(2,'0')} (bytes, len=${len}) hex=${hex}`);
        if (Number(len) >= 2 && Number(len) <= 100) {
          try { dumpAllFields(raw, 0, raw.length, indent + '  '); } catch {}
        }
      }
      p = msgEnd;
    } else if (wireType === 5) {
      if (p + 4 > buf.length) break;
      const val = view.getUint32(buf.byteOffset + p, true); p += 4;
      console.log(`${indent}field ${fieldNum} tag=0x${tagByte.toString(16).padStart(2,'0')} (fixed32) = 0x${val.toString(16).padStart(8,'0')}`);
    } else {
      console.log(`${indent}[unknown wireType=${wireType} field=${fieldNum} at offset ${p}, stopping]`);
      break;
    }
  }
}

// Load 0x0d resource
let data = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4; off += instHiConst ? 0 : 4; off += 4;
  const offset   = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  if (type !== 0x0d) continue;
  let raw = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try { const p2 = Buffer.from(raw); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; raw = decompress(p2); } catch { continue; }
  }
  data = raw;
  break;
}
if (!data) { console.error('No 0x0d resource'); process.exit(1); }

// Target lot names to search for — mix of residential and venues
const TARGETS = [
  'Oakenstead',           // residential (Willow Creek)
  'Rattlesnake Juice Bar',// bar (Willow Creek)
  'Movers & Shakers',     // gym (Willow Creek)
  'Willow Creek Archive', // library (Willow Creek)
  'Municipal Muses',      // museum (Willow Creek)
  'The Blue Velvet',      // night club (Willow Creek)
  'Magnolia Park',        // park (Willow Creek)
  'Old Penelope',         // spa (Oasis Springs) -- if present
  'Desert Bloom Park',    // park (Oasis Springs)
  'The Solar Flare',      // bar (Oasis Springs)
  'Hakim House',          // residential (Willow Creek)
  'Cypress Terrace',      // residential (Willow Creek)
];

// Scan all 0x3a records, match by name, dump full fields
const found = new Map();
for (let i = 0; i < data.length - 12; i++) {
  if (data[i] !== 0x3a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 12n || msgLen > 50000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x09) continue; p++;
  if (p + 8 > msgEnd) continue;
  const lotId = readFixed64LE(data, p); p += 8;
  if (data[p] !== 0x12) continue; p++;
  const [lotName, afterName] = readString(data, p); p = afterName;
  if (!lotName || lotName.length < 3) continue;
  if (/^[a-z][a-z0-9_:]+$/.test(lotName)) continue;

  const targetMatch = TARGETS.find(t => lotName === t || lotName.includes(t) || t.includes(lotName));
  if (targetMatch && !found.has(lotName)) {
    found.set(lotName, { id: lotId, msgStart, msgEnd, afterName: p });
    i = msgEnd - 1;
  } else {
    i = msgEnd - 1;
  }
}

console.log(`Save: ${savePath}`);
console.log(`Found ${found.size} target lots\n`);

for (const [name, { id, msgStart, msgEnd, afterName }] of found) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Lot: "${name}"  id=0x${id.toString(16)}`);
  console.log(`Full raw hex of record body after name:`);
  const bodyHex = Buffer.from(data.slice(afterName, msgEnd)).toString('hex');
  console.log(`  ${bodyHex}`);
  console.log(`Decoded fields after name:`);
  dumpAllFields(data, afterName, msgEnd, '  ');
}
