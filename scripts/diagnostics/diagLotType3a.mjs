/**
 * diagLotType3a.mjs
 *
 * Scans all 0x3a records, walks field 11 → field 3 → field 1 (the first
 * lot-zone entry), reads its sub-field 2 (fixed64), and groups all lots by
 * the HIGH 32 BITS of that value. Hypothesis: high bits = venue type ID.
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst = (flags & 0x01) !== 0;
const groupConst = (flags & 0x02) !== 0;
const instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0;
if (typeConst)   { constType = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst)  headerPos += 4;
if (instHiConst) headerPos += 4;
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

// Load 0x0d resource
let data = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4;
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

// Helper: read a specific path from a protobuf message. Returns the inner buffer at that path.
function getSubMessage(buf, start, end, fieldNum) {
  let p = start;
  while (p < end) {
    if (p >= buf.length) return null;
    const tag = buf[p]; p++;
    const wt = tag & 0x07;
    const fn = tag >> 3;
    if (fn === 0) return null;
    if (wt === 2) {
      const [len, next] = readVarint(buf, p);
      const subEnd = next + Number(len);
      if (subEnd > buf.length) return null;
      if (fn === fieldNum) return { start: next, end: subEnd };
      p = subEnd;
    } else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

// Helper: read a specific fixed64 field from a message
function getFixed64Field(buf, start, end, fieldNum) {
  let p = start;
  while (p < end) {
    if (p >= buf.length) return null;
    const tag = buf[p]; p++;
    const wt = tag & 0x07;
    const fn = tag >> 3;
    if (fn === 0) return null;
    if (wt === 1) {
      if (p + 8 > buf.length) return null;
      const v = readFixed64LE(buf, p);
      if (fn === fieldNum) return v;
      p += 8;
    } else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

// ─── Scan 0x3a records ────────────────────────────────────────────────────────

const lots = [];
for (let i = 0; i < data.length - 12; i++) {
  if (data[i] !== 0x3a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 12n || msgLen > 200000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x09) continue; p++;
  if (p + 8 > msgEnd) continue;
  const lotId = readFixed64LE(data, p); p += 8;
  if (data[p] !== 0x12) continue; p++;
  const [lotName, afterName] = readString(data, p);
  if (!lotName || lotName.length < 3) { i = msgEnd - 1; continue; }
  if (/^[a-z][a-z0-9_:]+$/.test(lotName)) { i = msgEnd - 1; continue; }

  // Find field5
  let field5 = null;
  let q = afterName;
  while (q < msgEnd) {
    const t = data[q]; q++;
    const wt = t & 0x07;
    const fn = t >> 3;
    if (fn === 0) break;
    if (t === 0x28) { const [v, n] = readVarint(data, q); field5 = v; q = n; break; }
    if (wt === 0) { const [, n] = readVarint(data, q); q = n; }
    else if (wt === 1) q += 8;
    else if (wt === 2) { const [l, n] = readVarint(data, q); q = n + Number(l); }
    else if (wt === 5) q += 4;
    else break;
  }

  // Walk to field 11 → field 3 → field 1 → sub-field 2 (fixed64)
  const f11 = getSubMessage(data, afterName, msgEnd, 11);
  let typeId = null;
  if (f11) {
    const f11_3 = getSubMessage(data, f11.start, f11.end, 3);
    if (f11_3) {
      const f11_3_1 = getSubMessage(data, f11_3.start, f11_3.end, 1);
      if (f11_3_1) {
        typeId = getFixed64Field(data, f11_3_1.start, f11_3_1.end, 2);
      }
    }
  }

  lots.push({ lotId, lotName, field5, typeId });
  i = msgEnd - 1;
}

// Group by HIGH 32 BITS of typeId
const byHigh = new Map();
for (const l of lots) {
  let k;
  if (l.typeId === null) k = '<none>';
  else {
    const high = (l.typeId >> 32n) & 0xffffffffn;
    k = '0x' + high.toString(16).padStart(8, '0');
  }
  if (!byHigh.has(k)) byHigh.set(k, []);
  byHigh.get(k).push(l);
}

console.log(`Save: ${savePath}`);
console.log(`Total 0x3a records: ${lots.length}\n`);
console.log(`Lots grouped by HIGH 32 BITS of field 11.3.1.2:\n`);

const sorted = [...byHigh.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, group] of sorted) {
  console.log(`\n=== ${k}  (${group.length} lots) ===`);
  const sample = group.slice(0, 8);
  for (const l of sample) {
    console.log(`  "${l.lotName}"  field5=${l.field5}  fullTypeId=0x${l.typeId?.toString(16).padStart(16,'0') ?? 'null'}`);
  }
  if (group.length > 8) console.log(`  ...and ${group.length - 8} more`);
}
