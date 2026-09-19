/**
 * Scans 0x3a (field 7) sub-messages in the 0x0d resource to find venue lot records.
 * Venue lots have a different structure than residential lots:
 *   - Outer tag: 0x3a (field 7, wire type 2)
 *   - Internal field 1: 0x09 (fixed64, wire type 1) — some ID
 *   - Internal field 2: 0x12 (string) — lot name
 *   - Internal field 5: 0x28 (varint) — field5, stable canonical lot ID
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
const savePath = process.argv[2] || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312030.save`;
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

// Get 0x0d resource
let pos2 = headerPos, data0d = null;
for (let i = 0; i < indexCount; i++) {
  if (pos2 + entrySize > buf.length) break;
  let off = pos2;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  off += groupConst ? 0 : 4;
  off += instHiConst ? 0 : 4;
  off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos2 += entrySize;
  if (type !== 0x0d) continue;
  let raw = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    const p = Buffer.from(raw); if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
    raw = decompress(p);
  }
  data0d = raw; break;
}

// Scan 0x3a sub-messages for venue lot records
const venueLots = [];
const seen = new Set();

for (let i = 0; i < data0d.length - 4; i++) {
  if (data0d[i] !== 0x3a) continue;
  let pos = i + 1;
  const [msgLen, msgStart] = readVarint(data0d, pos);
  if (msgLen < 12n || msgLen > 50000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data0d.length) continue;
  pos = msgStart;

  // Expect field 1 as fixed64 (tag 0x09)
  if (data0d[pos] !== 0x09) continue; pos++;
  if (pos + 8 > msgEnd) continue;
  const id = readFixed64LE(data0d, pos); pos += 8;

  // Expect field 2 as string (tag 0x12)
  if (pos >= msgEnd || data0d[pos] !== 0x12) continue; pos++;
  const [name, afterName] = readString(data0d, pos); pos = afterName;
  if (!name || name.length < 3) continue;
  // Skip internal-looking names
  if (/^[a-z][a-z0-9_:]+$/.test(name)) continue;

  // Walk forward to find field5 (tag 0x28)
  let p = pos;
  let field5 = null;
  while (p < msgEnd) {
    const tag = data0d[p];
    const wireType = tag & 0x07;
    const fieldNum = tag >> 3;
    p++;
    if (fieldNum === 0) break;
    if (tag === 0x28) { // field 5 varint
      const [val, next] = readVarint(data0d, p);
      field5 = val; p = next; break;
    }
    if (wireType === 0) { const [,next] = readVarint(data0d, p); p = next; }
    else if (wireType === 1) { p += 8; }
    else if (wireType === 2) { const [len, next] = readVarint(data0d, p); p = next + Number(len); }
    else if (wireType === 5) { p += 4; }
    else break;
  }

  const key = id.toString(16);
  if (!seen.has(key)) {
    seen.add(key);
    venueLots.push({ id: key, name, field5 });
  }
  i = msgEnd - 1;
}

console.log(`Venue lots found (0x3a outer tag): ${venueLots.length}`);
for (const l of venueLots.sort((a,b) => a.name.localeCompare(b.name))) {
  console.log(`  f5=${l.field5?.toString().padStart(12)}  "${l.name}"`);
}
