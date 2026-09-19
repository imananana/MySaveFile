import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;
const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Parse DBPF index (with flags support)
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

// ── Protobuf helpers (mirrors saveParser.ts) ──────────────────────────────────

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

// ── Household scanner (exact replica of saveParser.ts logic) ──────────────────

function scanHouseholdRecords(buf, chunkLabel) {
  const results = [];
  for (let i = 0; i < buf.length - 40; i++) {
    if (buf[i] !== 0x09) continue;
    if (i + 9 >= buf.length || buf[i + 9] !== 0x11) continue;

    let pos = i + 10;
    if (pos + 8 > buf.length) continue;
    const hhId = readFixed64LE(buf, pos);
    pos += 8;

    if (pos >= buf.length || buf[pos] !== 0x1a) continue;
    pos++;

    const [hhName, afterName] = readString(buf, pos);
    if (!hhName || hhName.length < 2 || hhName.length > 60) continue;
    if (!/^[\x20-\x7e]+$/.test(hhName)) continue;
    if (!/[A-Z]/.test(hhName)) continue;
    pos = afterName;

    if (pos >= buf.length || buf[pos] !== 0x21) continue;
    pos++;
    if (pos + 8 > buf.length) continue;
    const lotId = readFixed64LE(buf, pos);

    results.push({
      chunkLabel,
      byteOffset: i,
      hhId: hhId.toString(16).padStart(16, '0'),
      name: hhName,
      lotId: lotId.toString(16).padStart(16, '0'),
      hasLot: lotId !== 0n,
    });
  }
  return results;
}

// ── Collect buffers from 0x0d chunks ─────────────────────────────────────────

const allResults = [];
let pos = headerPos;
let chunkIdx = 0;

for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type   = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group  = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4; // sizeDecomp
  const compType = view.getUint16(off, true);
  pos += entrySize;

  if (type !== 0x0d) continue;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  const label = `0x0d chunk #${chunkIdx++} (entry ${i}, compType=0x${compType.toString(16)})`;
  try {
    const found = scanHouseholdRecords(data, label);
    allResults.push(...found);
  } catch (e) {
    console.error(`Error scanning ${label}: ${e.message}`);
  }
}

// ── Print results ─────────────────────────────────────────────────────────────

console.log(`\nTotal households found: ${allResults.length}\n`);
console.log('Households WITH lot assignment (hasLot=true):');
allResults.filter(r => r.hasLot).forEach(r =>
  console.log(`  [${r.chunkLabel} +${r.byteOffset}] "${r.name}"  hhId=${r.hhId}  lotId=${r.lotId}`)
);
console.log('\nHouseholds WITHOUT lot (lotId=0):');
allResults.filter(r => !r.hasLot).forEach(r =>
  console.log(`  [${r.chunkLabel} +${r.byteOffset}] "${r.name}"  hhId=${r.hhId}`)
);
