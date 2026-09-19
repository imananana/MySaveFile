/**
 * diagSearchAll.mjs
 *
 * Search every resource in the save (including all 0x06 chunks) for the given
 * lot ID byte sequence. Report which resource types contain it.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const TARGET_HEX = process.argv[3] || '0b37157135752616';
const targetBytes = Buffer.from(TARGET_HEX.match(/../g).reverse().join(''), 'hex');

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst = (flags & 0x01) !== 0, groupConst = (flags & 0x02) !== 0, instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0;
if (typeConst) { constType = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst) headerPos += 4;
if (instHiConst) headerPos += 4;
const entrySize = 32 - (typeConst?4:0) - (groupConst?4:0) - (instHiConst?4:0);

const entries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4;
  off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  entries.push({ index: i, type, instLo, offset, sizeComp, compType });
}

console.log(`Searching for lot ID 0x${TARGET_HEX} in ${entries.length} resources`);
console.log(`Target bytes: ${targetBytes.toString('hex')}\n`);

function countOccurrences(data, target) {
  let count = 0;
  for (let i = 0; i <= data.length - target.length; i++) {
    let match = true;
    for (let j = 0; j < target.length; j++) {
      if (data[i + j] !== target[j]) { match = false; break; }
    }
    if (match) count++;
  }
  return count;
}

const hits = [];
for (const e of entries) {
  let raw = buf.slice(e.offset, e.offset + e.sizeComp);
  if (e.compType === 0xffff) {
    try {
      const p2 = Buffer.from(raw);
      if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
      raw = decompress(p2);
    } catch { continue; }
  }
  const c = countOccurrences(raw, targetBytes);
  if (c > 0) hits.push({ ...e, count: c, decompSize: raw.length });
}

console.log(`Resources containing the lot ID:`);
console.log(`  type           count  decompSize  occurrences  instLo`);
for (const h of hits) {
  console.log(`  0x${h.type.toString(16).padStart(8, '0')}  ${String(h.count).padStart(5)}  ${String(h.decompSize).padStart(10)}  ${String(h.count).padStart(11)}  0x${h.instLo.toString(16)}`);
}

console.log(`\nTotal resources hit: ${hits.length}`);
