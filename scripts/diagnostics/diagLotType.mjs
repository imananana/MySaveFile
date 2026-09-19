/**
 * diagLotType.mjs
 *
 * Dumps the full protobuf field layout of 0x3a lot records so we can identify
 * which field holds the lot type (residential, bar, gym, etc.).
 *
 * Usage:
 *   node scripts/diagLotType.mjs [path-to-save]
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

function dumpFields(buf, start, end, indent = '') {
  let p = start;
  while (p < end) {
    if (p >= buf.length) break;
    const tagByte = buf[p]; p++;
    const wireType = tagByte & 0x07;
    const fieldNum = tagByte >> 3;
    if (fieldNum === 0) break;
    if (wireType === 0) {
      const [val, next] = readVarint(buf, p); p = next;
      console.log(`${indent}field ${fieldNum} (varint) = ${val}`);
    } else if (wireType === 1) {
      if (p + 8 > buf.length) break;
      const val = readFixed64LE(buf, p); p += 8;
      console.log(`${indent}field ${fieldNum} (fixed64) = 0x${val.toString(16).padStart(16,'0')}`);
    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, p);
      const msgEnd = next + Number(len);
      if (msgEnd > buf.length) break;
      const raw = buf.slice(next, msgEnd);
      let str = '';
      try { str = Buffer.from(raw).toString('utf8'); } catch {}
      const isPrintable = str.length > 0 && /^[\x20-\x7e\n\r]*$/.test(str);
      console.log(`${indent}field ${fieldNum} (bytes, len=${len})${isPrintable ? ` = "${str}"` : ' = <binary>'}`);
      p = msgEnd;
    } else if (wireType === 5) {
      if (p + 4 > buf.length) break;
      const val = view.getUint32(buf.byteOffset + p, true); p += 4;
      console.log(`${indent}field ${fieldNum} (fixed32) = 0x${val.toString(16).padStart(8,'0')}`);
    } else {
      console.log(`${indent}[unknown wireType=${wireType} at offset ${p}, aborting]`);
      break;
    }
  }
}

// ─── Load 0x0d resource ───────────────────────────────────────────────────────

let data = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  off += groupConst  ? 0 : 4;
  off += instHiConst ? 0 : 4;
  off += 4;
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

// ─── Scan 0x3a records and dump all fields ───────────────────────────────────

// We'll print the first 20 records so we can see the pattern.
// Lot types we want to see: residential (home lots), and at least one venue.

let count = 0;
for (let i = 0; i < data.length - 12 && count < 25; i++) {
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

  console.log(`\n── Lot: "${lotName}"  id=0x${lotId.toString(16)}`);
  dumpFields(data, p, msgEnd, '  ');
  count++;
  i = msgEnd - 1;
}

console.log(`\nTotal 0x3a records shown: ${count}`);
