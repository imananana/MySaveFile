/**
 * diagSaveCoverage.mjs
 *
 * Investigates why all saves return ~102 lots.
 * - Lists all resource types and counts
 * - Scans ALL type 0x06 chunks (no limit) vs just the first 100
 * - Checks for lot-name strings in types we haven't tried yet
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
const savePath = process.argv[2] || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02192026.save`;

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

// Collect all entries
const allEntries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo  = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  const sizeDecomp = view.getUint32(off, true); off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  allEntries.push({ type, group, instHi, instLo, offset, sizeComp, sizeDecomp, compType });
}

// Resource type summary
const typeCounts = new Map();
for (const e of allEntries) {
  const k = e.type;
  if (!typeCounts.has(k)) typeCounts.set(k, { count: 0, compressed: 0, uncompressed: 0 });
  const rec = typeCounts.get(k);
  rec.count++;
  if (e.compType === 0xffff) rec.compressed++;
  else rec.uncompressed++;
}

console.log(`Save: ${savePath}`);
console.log(`Total resources: ${allEntries.length}\n`);
console.log('Resource type breakdown (sorted by count):');
for (const [type, rec] of [...typeCounts.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  0x${type.toString(16).padStart(8,'0')}  count=${rec.count}  (refpack=${rec.compressed} raw=${rec.uncompressed})`);
}

// ─── Lot scanner ──────────────────────────────────────────────────────────────
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

function scanLots(data) {
  const lots = [];
  const seen = new Set();
  for (let i = 0; i < data.length - 12; i++) {
    if (data[i] !== 0x2a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(data, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 12n || msgEnd > data.length) continue;
    pos = msgStart;
    if (data[pos] !== 0x08) continue; pos++;
    const [, afterF1] = readVarint(data, pos); pos = afterF1;
    if (pos + 9 > msgEnd) continue;
    if (data[pos] !== 0x11) continue; pos++;
    if (pos + 8 > data.length) continue;
    const lotId = readFixed64LE(data, pos); pos += 8;
    if (pos >= msgEnd) continue;
    if (data[pos] !== 0x1a) continue; pos++;
    const [lotName, afterName] = readString(data, pos);
    if (!lotName || /^[a-z][a-z0-9_]+$/.test(lotName)) continue;
    const key = lotId.toString(16).padStart(16, '0');
    if (!seen.has(key)) { seen.add(key); lots.push({ id: key, name: lotName }); }
    i = msgEnd - 1;
  }
  return lots;
}

// Scan by type — try every unique type, not just 0x0d and 0x06
console.log('\n\n─── Lot counts by resource type (all compressed types) ───');
const lotsByType = new Map();
const seenGlobal = new Set();

for (const [type] of typeCounts) {
  const typeEntries = allEntries.filter(e => e.type === type && e.compType === 0xffff);
  if (typeEntries.length === 0) continue;

  const typeLots = new Set();
  for (const entry of typeEntries) {
    const raw = buf.slice(entry.offset, entry.offset + entry.sizeComp);
    try {
      const p = Buffer.from(raw);
      if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
      const data = decompress(p);
      for (const lot of scanLots(data)) typeLots.add(lot.name);
    } catch {}
  }
  if (typeLots.size > 0) {
    lotsByType.set(type, [...typeLots]);
    console.log(`  0x${type.toString(16).padStart(8,'0')}  lots_found=${typeLots.size}`);
  }
}

// Now specifically: how many lots in 0x06 if we scan ALL vs first 100
const entries06 = allEntries.filter(e => e.type === 0x06 && e.compType === 0xffff);
console.log(`\n0x06 compressed chunks total: ${entries06.length}`);

const lotsFirst100 = new Set();
const lotsAll = new Set();
for (let i = 0; i < entries06.length; i++) {
  const entry = entries06[i];
  const raw = buf.slice(entry.offset, entry.offset + entry.sizeComp);
  try {
    const p = Buffer.from(raw);
    if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
    const data = decompress(p);
    for (const lot of scanLots(data)) {
      lotsAll.add(lot.name);
      if (i < 100) lotsFirst100.add(lot.name);
    }
  } catch {}
}
console.log(`Lots in first 100 chunks: ${lotsFirst100.size}`);
console.log(`Lots in ALL chunks:       ${lotsAll.size}`);

// Also try scanning raw uncompressed type 0x06
const entries06raw = allEntries.filter(e => e.type === 0x06 && e.compType !== 0xffff);
console.log(`\n0x06 uncompressed chunks: ${entries06raw.length}`);
const lotsRaw = new Set();
for (const entry of entries06raw) {
  const data = buf.slice(entry.offset, entry.offset + entry.sizeComp);
  for (const lot of scanLots(data)) lotsRaw.add(lot.name);
}
console.log(`Lots in uncompressed 0x06: ${lotsRaw.size}`);
if (lotsRaw.size > 0) [...lotsRaw].forEach(n => console.log('  ', n));
