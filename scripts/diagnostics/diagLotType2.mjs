/**
 * diagLotType2.mjs
 *
 * Dumps full field layout of 0x2a lot records (modified/active lots).
 * Also dumps field 11 binary content from 0x3a records as hex — it may be a type hash list.
 * Uses the NEWEST save so we see player-modified lot types.
 *
 * Usage:
 *   node scripts/diagLotType2.mjs [path-to-save]
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
// Default to the reference save; pass a different one on the command line
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
      console.log(`${indent}field ${fieldNum} (varint) = ${val}  (0x${val.toString(16)})`);
    } else if (wireType === 1) {
      if (p + 8 > buf.length) break;
      const val = readFixed64LE(buf, p); p += 8;
      console.log(`${indent}field ${fieldNum} (fixed64) = 0x${val.toString(16).padStart(16,'0')}`);
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
        console.log(`${indent}field ${fieldNum} (bytes, len=${len}) = "${str}"`);
      } else {
        console.log(`${indent}field ${fieldNum} (bytes, len=${len}) = hex: ${hex.substring(0, 80)}${hex.length > 80 ? '…' : ''}`);
        // Try to parse as sub-message
        if (Number(len) >= 2 && Number(len) <= 200) {
          try {
            console.log(`${indent}  [sub-message attempt:]`);
            dumpFields(raw, 0, raw.length, indent + '    ');
          } catch {}
        }
      }
      p = msgEnd;
    } else if (wireType === 5) {
      if (p + 4 > buf.length) break;
      const val = view.getUint32(buf.byteOffset + p, true); p += 4;
      console.log(`${indent}field ${fieldNum} (fixed32) = 0x${val.toString(16).padStart(8,'0')}`);
    } else {
      console.log(`${indent}[unknown wireType=${wireType} at offset ${p}]`);
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

// ─── 1. Dump 0x2a records (old residential scanner) ──────────────────────────

console.log('═══ 0x2a RECORDS (full dump incl. sub-messages) ═══\n');
let count = 0;
for (let i = 0; i < data.length - 12 && count < 30; i++) {
  if (data[i] !== 0x2a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 12n || msgLen > 100000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;
  p = msgStart;

  if (data[p] !== 0x08) continue; p++;
  const [, afterF1] = readVarint(data, p); p = afterF1;
  if (p + 9 > msgEnd) continue;
  if (data[p] !== 0x11) continue; p++;
  if (p + 8 > data.length) continue;
  const lotId = readFixed64LE(data, p); p += 8;
  if (p >= msgEnd) continue;
  if (data[p] !== 0x1a) continue; p++;
  const [lotName, afterName] = readString(data, p);
  if (!lotName || /^[a-z][a-z0-9_]+$/.test(lotName)) continue;
  p = afterName;

  console.log(`── 0x2a Lot: "${lotName}"  id=0x${lotId.toString(16)}`);
  dumpFields(data, p, msgEnd, '  ');
  console.log('');
  count++;
  i = msgEnd - 1;
}
console.log(`(${count} 0x2a records shown)\n`);
