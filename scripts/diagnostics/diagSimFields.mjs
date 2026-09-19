/**
 * diagSimFields.mjs
 *
 * 1. Dumps the full protobuf field layout for a sample household record —
 *    to find where sim member IDs live after the lot ID (field 4).
 * 2. Dumps fields 4–10 of a sample sim record to locate gender + life stage.
 *
 * Usage:
 *   node scripts/diagSimFields.mjs [path-to-save]
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

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// Dump all fields of a protobuf message (non-recursive for sub-messages)
function dumpFields(buf, start, end, indent = '') {
  let p = start;
  while (p < end) {
    const tagByte = buf[p]; p++;
    const wireType = tagByte & 0x07;
    const fieldNum = tagByte >> 3;
    if (fieldNum === 0) { console.log(`${indent}[fieldNum=0, breaking]`); break; }
    if (wireType === 0) {
      const [val, next] = readVarint(buf, p); p = next;
      console.log(`${indent}field ${fieldNum} (varint): ${val}`);
    } else if (wireType === 1) {
      const val = readFixed64LE(buf, p); p += 8;
      console.log(`${indent}field ${fieldNum} (fixed64): 0x${val.toString(16).padStart(16,'0')}`);
    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, p);
      const msgEnd = next + Number(len);
      p = msgEnd;
      const raw = buf.slice(next, msgEnd);
      let str = '';
      try { str = Buffer.from(raw).toString('utf8'); } catch {}
      const isPrintable = /^[\x20-\x7e]*$/.test(str) && str.length > 0;
      console.log(`${indent}field ${fieldNum} (len-delim, ${len} bytes)${isPrintable ? `: "${str}"` : ''}`);
    } else if (wireType === 5) {
      const val = view.getUint32(buf.byteOffset + p, true); p += 4;
      console.log(`${indent}field ${fieldNum} (fixed32): 0x${val.toString(16).padStart(8,'0')}`);
    } else {
      console.log(`${indent}[unknown wireType ${wireType} at pos ${p}, stopping]`);
      break;
    }
  }
}

// ─── Scan the 0x0d resource ────────────────────────────────────────────────────

let targetBuf = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  off += groupConst  ? 0 : 4;
  off += instHiConst ? 0 : 4;
  off += 4; // instLo
  const offset   = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4; // sizeDecomp
  const compType = view.getUint16(off, true);
  pos += entrySize;

  if (type !== 0x0d) continue;
  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const p2 = Buffer.from(data);
      if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
      data = decompress(p2);
    } catch { continue; }
  }
  targetBuf = data;
  break;
}

if (!targetBuf) { console.error('No 0x0d resource found'); process.exit(1); }

// ─── 1. Find 3 household records and dump their full field layout ──────────────

console.log('═══ HOUSEHOLD RECORDS (full field dump) ═══\n');
let hhFound = 0;
for (let i = 0; i < targetBuf.length - 40 && hhFound < 3; i++) {
  if (targetBuf[i] !== 0x09) continue;
  if (i + 9 >= targetBuf.length || targetBuf[i + 9] !== 0x11) continue;

  let p = i + 10;
  if (p + 8 > targetBuf.length) continue;
  const hhId = readFixed64LE(targetBuf, p); p += 8;
  if (p >= targetBuf.length || targetBuf[p] !== 0x1a) continue;
  p++;
  const [hhName, afterName] = readString(targetBuf, p);
  if (!hhName || hhName.length < 2 || hhName.length > 60) continue;
  if (!/^[\x20-\x7e]+$/.test(hhName)) continue;
  if (hhName.includes('_')) continue;
  p = afterName;
  if (p >= targetBuf.length || targetBuf[p] !== 0x21) continue;
  p++;
  if (p + 8 > targetBuf.length) continue;
  const lotId = readFixed64LE(targetBuf, p); p += 8;

  // Find the end of this record by scanning forward for the next 0x09...0x11 anchor
  // or cap at 200 bytes
  const recEnd = Math.min(p + 200, targetBuf.length);

  console.log(`Household: "${hhName}"  id=0x${hhId.toString(16)}  lot=0x${lotId.toString(16)}`);
  console.log('Fields after lot ID:');
  dumpFields(targetBuf, p, recEnd, '  ');
  console.log('');
  hhFound++;
}

// ─── 2. Find 5 sim records and dump fields 4–10 ───────────────────────────────

console.log('\n═══ SIM RECORDS (fields after lastName, first 150 bytes) ═══\n');

const ASCII_NAME = /^[A-Z][A-Za-z'\-. ]{0,28}$/;
const LAST_NAME_OK = /^[A-Za-z'\-. ]{0,28}$/;

let simFound = 0;
for (let i = 0; i < targetBuf.length - 6 && simFound < 5; i++) {
  if (targetBuf[i] !== 0x0a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(targetBuf, p);
  const msgEnd = msgStart + Number(msgLen);
  if (msgLen < 4n || msgLen > 200n || msgEnd > targetBuf.length) continue;
  p = msgStart;
  if (targetBuf[p] !== 0x08) continue; p++;
  const [simId, afterId] = readVarint(targetBuf, p);
  if (simId === 0n || simId < 0x10000n) continue;
  p = afterId;
  if (p >= msgEnd || targetBuf[p] !== 0x12) continue; p++;
  const [firstName, afterFirst] = readString(targetBuf, p);
  if (!firstName || firstName.length < 1 || firstName.length > 30) continue;
  p = afterFirst;
  if (p >= msgEnd || targetBuf[p] !== 0x1a) continue; p++;
  const [lastName, afterLast] = readString(targetBuf, p);
  if (lastName.length > 30) continue;
  p = afterLast;
  if (!ASCII_NAME.test(firstName)) continue;
  if (lastName && !LAST_NAME_OK.test(lastName)) continue;
  if (firstName.includes('_') || lastName.includes('_')) continue;

  console.log(`Sim: "${firstName} ${lastName}"  id=0x${simId.toString(16)}`);
  console.log('Fields after lastName:');
  dumpFields(targetBuf, p, msgEnd, '  ');
  console.log('');
  simFound++;
  i = msgEnd - 1;
}
