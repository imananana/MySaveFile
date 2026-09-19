/**
 * diagLotTypeGroup.mjs
 *
 * Hypothesis test: 0x2a record field 7 (fixed64) encodes the lot type.
 * Scans all 0x2a records, extracts (lotName, field7), and groups them.
 * If hypothesis is correct, lots sharing field7 should share lot type.
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

// ─── Scan 0x2a records ────────────────────────────────────────────────────────
// Structure: tag 0x2a, varint length, then:
//   0x08 [varint], 0x11 [fixed64 lot ID], 0x1a [string name], (0x22 optional sub), 0x28 [varint field5], 0x39 [fixed64 field7]

const records = [];

for (let i = 0; i < data.length - 12; i++) {
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
  if (!lotName || /^[a-z][a-z0-9_]+$/.test(lotName)) { i = msgEnd - 1; continue; }
  p = afterName;

  // Walk remaining fields, capture field5 (tag 0x28 varint) and field7 (tag 0x39 fixed64)
  let field5 = null;
  let field7 = null;
  let field11 = null;
  while (p < msgEnd) {
    const tag = data[p]; p++;
    const wt = tag & 0x07;
    const fn = tag >> 3;
    if (fn === 0) break;
    if (tag === 0x28) {
      const [val, n] = readVarint(data, p); field5 = val; p = n;
    } else if (tag === 0x39) {
      if (p + 8 > msgEnd) break;
      field7 = readFixed64LE(data, p); p += 8;
    } else if (tag === 0x58) {
      const [val, n] = readVarint(data, p); field11 = val; p = n;
    } else {
      if (wt === 0) { const [, n] = readVarint(data, p); p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 2) { const [l, n] = readVarint(data, p); p = n + Number(l); }
      else if (wt === 5) p += 4;
      else break;
    }
  }

  records.push({ lotId, lotName, field5, field7, field11 });
  i = msgEnd - 1;
}

// Group by field7
const byField7 = new Map();
for (const r of records) {
  const k = r.field7 ? '0x' + r.field7.toString(16).padStart(16,'0') : '<none>';
  if (!byField7.has(k)) byField7.set(k, []);
  byField7.get(k).push(r);
}

console.log(`Save: ${savePath}`);
console.log(`Total 0x2a records: ${records.length}\n`);
console.log(`Lots grouped by field7 (fixed64) value:\n`);

const sortedGroups = [...byField7.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, lots] of sortedGroups) {
  console.log(`\nfield7 = ${k}  (${lots.length} lots):`);
  for (const l of lots) {
    console.log(`  "${l.lotName}"  field5=${l.field5}  field11=${l.field11}`);
  }
}
