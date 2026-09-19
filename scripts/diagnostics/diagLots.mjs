import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;
const TARGET_LOT_ID = 0x02351690bbb25395n; // Feng's lot ID from diagHouseholds

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

function readFixed64LE(buf, pos) {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}

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

function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end];
}

// Mirror of scanLots from saveParser.ts
function scanLots(buf) {
  const lots = [];
  const seen = new Set();
  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x2a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 12n || msgEnd > buf.length) continue;
    pos = msgStart;
    if (buf[pos] !== 0x08) continue;
    pos++;
    const [, afterField1] = readVarint(buf, pos);
    pos = afterField1;
    if (pos + 9 > msgEnd) continue;
    if (buf[pos] !== 0x11) continue;
    pos++;
    if (pos + 8 > buf.length) continue;
    const lotId = readFixed64LE(buf, pos);
    pos += 8;
    if (pos >= msgEnd) continue;
    if (buf[pos] !== 0x1a) continue;
    pos++;
    const [lotName, afterName] = readString(buf, pos);
    if (!lotName || lotName.length === 0) continue;
    if (/^[a-z][a-z0-9_]+$/.test(lotName)) continue;
    const key = lotId.toString(16).padStart(16, '0');
    if (!seen.has(key)) {
      seen.add(key);
      lots.push({ lotId, lotIdHex: key, name: lotName });
    }
  }
  return lots;
}

// Collect all lots from 0x0d and 0x06 chunks
const allLots = [];
const seenIds = new Set();

let pos = headerPos;
let chunk06count = 0;

for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type   = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group  = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;

  const isTarget = type === 0x0d || (type === 0x06 && compType === 0xffff && chunk06count < 100);
  if (!isTarget) continue;
  if (type === 0x06) chunk06count++;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  try {
    for (const lot of scanLots(data)) {
      if (!seenIds.has(lot.lotIdHex)) {
        seenIds.add(lot.lotIdHex);
        allLots.push(lot);
      }
    }
  } catch { continue; }
}

console.log(`\nTotal lots found: ${allLots.length}`);

// Check if Feng's lot is found
const fengLot = allLots.find(l => l.lotId === TARGET_LOT_ID);
console.log(`\nFeng lot (${TARGET_LOT_ID.toString(16)}): ${fengLot ? `FOUND → "${fengLot.name}"` : 'NOT FOUND'}`);

// Show all lots containing "Landgraab" or "Hakim" or "Culpepper" (San Myshuno apartments)
console.log('\nSan Myshuno-style apartment lots found:');
allLots.filter(l => /landgraab|hakim|culpepper|medina|zen|chic|jasmine|alto|torendi|myshuno/i.test(l.name))
  .forEach(l => console.log(`  ${l.lotIdHex}  "${l.name}"`));

// Show all lots with names containing spaces (real lot names, not IDs)
console.log('\nAll named lots (first 40):');
allLots.slice(0, 40).forEach(l => console.log(`  ${l.lotIdHex}  "${l.name}"`));
