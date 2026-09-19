/**
 * diagLotBytes.mjs
 *
 * For a handful of known lot names, dumps the raw bytes that follow the lot
 * name field so we can see exactly what field7 (0x39 tag) actually looks like
 * in the binary, and whether our parsing assumptions are correct.
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const TARGETS = [
  'Asphalt Abodes',   // Newcrest — expected to have a stable field7
  'Rindle Rose',      // Willow Creek — showing same f7 as Asphalt Abodes
  'Civic Cliffs',     // Newcrest — different f7 in earlier output
  'Ophelia Villa',    // Willow Creek
  'IX Landgraab',     // San Myshuno (truncated name)
];

const HOME = process.env.HOME;
const savePath = process.argv[2] || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

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

function hexDump(data, start, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const row = [];
    const chars = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      const b = data[start + i + j];
      row.push(b.toString(16).padStart(2, '0'));
      chars.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    lines.push(`  +${String(start + i).padStart(4)}  ${row.join(' ').padEnd(47)}  ${chars.join('')}`);
  }
  return lines.join('\n');
}

function scanTargets(data, targets) {
  const found = [];
  for (let i = 0; i < data.length - 12; i++) {
    if (data[i] !== 0x2a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(data, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 12n || msgEnd > data.length) continue;
    pos = msgStart;

    if (data[pos] !== 0x08) continue;
    pos++;
    const [field1, afterF1] = readVarint(data, pos);
    pos = afterF1;
    if (pos + 9 > msgEnd) continue;

    if (data[pos] !== 0x11) continue;
    pos++;
    if (pos + 8 > data.length) continue;
    const lotId = readFixed64LE(data, pos);
    pos += 8;
    if (pos >= msgEnd) continue;

    if (data[pos] !== 0x1a) continue;
    pos++;
    const [lotName, afterName] = readString(data, pos);
    if (!lotName) continue;

    for (const t of targets) {
      if (lotName.toLowerCase().includes(t.toLowerCase())) {
        found.push({ name: lotName, field1: Number(field1), lotId, afterName, msgEnd, msgStart, outerOffset: i });
      }
    }

    i = msgEnd - 1;
  }
  return found;
}

// Process chunks
const results = [];
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
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;

  if (type !== 0x0d && type !== 0x06) continue;
  if (type === 0x06 && compType !== 0xffff) continue;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  const found = scanTargets(data, TARGETS);
  for (const r of found) {
    results.push({ ...r, data });
  }
}

// Print results — deduplicate by name, show first occurrence
const seen = new Set();
for (const r of results) {
  if (seen.has(r.name)) continue;
  seen.add(r.name);

  const afterNamePos = r.afterName;
  const bytesLeft = Math.min(r.msgEnd - afterNamePos, 80);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`LOT: "${r.name}"   field1=${r.field1}   lotId=0x${r.lotId.toString(16)}`);
  console.log(`Bytes after name (up to 80, within message end):`);
  console.log(hexDump(r.data, afterNamePos, bytesLeft));

  // Annotate: show tag byte interpretations
  let p = afterNamePos;
  const msgEnd = r.msgEnd;
  console.log('\nAnnotated field walk:');
  let fieldCount = 0;
  while (p < msgEnd && fieldCount < 15) {
    fieldCount++;
    const tagByte = r.data[p];
    const fieldNum = tagByte >> 3;
    const wireType = tagByte & 0x07;
    const wireNames = ['varint','64-bit','len-delim','(3)','32-bit','(5)','(6)','(7)'];
    process.stdout.write(`  +${String(p - afterNamePos).padStart(3)} tag=0x${tagByte.toString(16).padStart(2,'0')} field=${fieldNum} wire=${wireType}(${wireNames[wireType]})`);
    p++;
    if (wireType === 0) {
      const [val, next] = readVarint(r.data, p);
      console.log(`  value=${val}`);
      p = next;
    } else if (wireType === 1) {
      if (p + 8 <= msgEnd) {
        const val = readFixed64LE(r.data, p);
        console.log(`  value=0x${val.toString(16)} (${val})`);
      }
      p += 8;
    } else if (wireType === 2) {
      const [len, next] = readVarint(r.data, p);
      console.log(`  len=${len}  [skipping sub-message]`);
      p = next + Number(len);
    } else if (wireType === 5) {
      const val = r.data[p] | (r.data[p+1] << 8) | (r.data[p+2] << 16) | (r.data[p+3] << 24);
      console.log(`  value=0x${(val >>> 0).toString(16)}`);
      p += 4;
    } else {
      console.log(`  [unknown wire type, stopping]`);
      break;
    }
    if (p > msgEnd) break;
  }
}
