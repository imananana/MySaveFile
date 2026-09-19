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

// Find type 0x0d resource
let pos2 = headerPos;
let data0d = null;
for (let i = 0; i < indexCount; i++) {
  if (pos2 + entrySize > buf.length) break;
  let off = pos2;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  off += groupConst ? 0 : 4;
  off += instHiConst ? 0 : 4;
  off += 4; // instLo
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos2 += entrySize;

  if (type !== 0x0d) continue;

  let raw = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    const p = Buffer.from(raw);
    if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
    raw = decompress(p);
  }
  data0d = raw;
  break;
}

if (!data0d) { console.log('No 0x0d resource found'); process.exit(1); }

console.log(`0x0d resource size: ${data0d.length} bytes`);

// Count occurrences of all outer tags (length-delimited, wire type 2)
// A tag byte with wire type 2 = (field_number << 3) | 2
// So tag byte 0x2a = field 5, 0x32 = field 6, 0x0a = field 1, 0x12 = field 2, etc.
const tagCounts = new Map();
for (let i = 0; i < data0d.length - 4; i++) {
  const b = data0d[i];
  if ((b & 0x07) !== 2) continue; // only length-delimited
  const fieldNum = b >> 3;
  if (fieldNum === 0 || fieldNum > 30) continue; // reasonable range

  // Try to read the varint length
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data0d, p);
  if (msgLen < 8n || msgLen > 100000n) continue; // reasonable size
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data0d.length) continue;

  // Check if it starts with 0x08 (field 1 varint) — common for lot records
  if (data0d[msgStart] === 0x08) {
    const key = `0x${b.toString(16).padStart(2,'0')} (field ${fieldNum})`;
    tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
  }
}

console.log('\nOuter tags (wire type 2, sub-message starts with field1 varint):');
for (const [tag, count] of [...tagCounts.entries()].sort((a,b) => b[1]-a[1])) {
  console.log(`  ${tag}  count=${count}`);
}

// Also: scan for "Archive" string anywhere in 0x0d
const needle = Buffer.from('Archive', 'utf8');
let searchPos = 0;
while (searchPos < data0d.length) {
  const found = data0d.indexOf(needle, searchPos);
  if (found === -1) break;
  console.log(`\n"Archive" found at offset ${found}`);
  // show surrounding bytes
  const start = Math.max(0, found - 32);
  const end = Math.min(data0d.length, found + 64);
  const slice = data0d.slice(start, end);
  const hex = [...slice].map(b => b.toString(16).padStart(2,'0')).join(' ');
  const chars = [...slice].map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
  console.log(`  hex: ${hex}`);
  console.log(`  asc: ${chars}`);
  searchPos = found + 1;
}
