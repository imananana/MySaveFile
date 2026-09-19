/**
 * diagTag.mjs
 *
 * Dumps the first few records with a given outer tag inside the 0x0d resource.
 *
 * Usage: node scripts/diagTag.mjs <savePath> <tagByteHex>
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const TAG = parseInt(process.argv[3] || '0xba', 16);
const COUNT = parseInt(process.argv[4] || '5');

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

function readVarint(b, p) { let r=0n,s=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<s; s+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readFixed64LE(b,p){let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(b[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(b[p+4+i])<<BigInt(i*8); return lo|(hi<<32n);}

let data = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4; off += instHiConst ? 0 : 4; off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  if (type !== 0x0d) continue;
  let raw = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) { try { const p2 = Buffer.from(raw); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; raw = decompress(p2); } catch { continue; } }
  data = raw; break;
}

function dumpFields(buf, start, end, indent = '', maxDepth = 4, depth = 0) {
  if (depth >= maxDepth) return;
  let p = start;
  while (p < end) {
    if (p >= buf.length) break;
    const tag = buf[p]; p++;
    const wt = tag & 0x07; const fn = tag >> 3;
    if (fn === 0) break;
    if (wt === 0) {
      const [val, next] = readVarint(buf, p); p = next;
      console.log(`${indent}field ${fn} (varint) = ${val} (0x${val.toString(16)})`);
    } else if (wt === 1) {
      if (p + 8 > buf.length) break;
      const val = readFixed64LE(buf, p); p += 8;
      console.log(`${indent}field ${fn} (fixed64) = 0x${val.toString(16).padStart(16,'0')}`);
    } else if (wt === 2) {
      const [len, next] = readVarint(buf, p);
      const msgEnd = next + Number(len);
      if (msgEnd > buf.length) break;
      const raw = buf.slice(next, msgEnd);
      let str = '';
      try { str = Buffer.from(raw).toString('utf8'); } catch {}
      const isPrintable = str.length > 0 && /^[\x20-\x7e\n\r\t]*$/.test(str);
      if (isPrintable && raw.length < 200) {
        console.log(`${indent}field ${fn} (string, ${raw.length}b) = "${str}"`);
      } else {
        console.log(`${indent}field ${fn} (bytes, ${raw.length}b) = ${Buffer.from(raw.slice(0, 48)).toString('hex')}${raw.length > 48 ? '…' : ''}`);
        if (raw.length >= 2 && raw.length < 5000 && depth < maxDepth - 1) {
          try { dumpFields(raw, 0, raw.length, indent + '  ', maxDepth, depth + 1); } catch {}
        }
      }
      p = msgEnd;
    } else if (wt === 5) {
      if (p + 4 > buf.length) break;
      const val = (buf[p] | (buf[p+1]<<8) | (buf[p+2]<<16) | (buf[p+3]<<24)) >>> 0;
      p += 4;
      console.log(`${indent}field ${fn} (fixed32) = 0x${val.toString(16).padStart(8,'0')}`);
    } else break;
  }
}

let count = 0;
for (let i = 0; i < data.length - 5 && count < COUNT; i++) {
  if (data[i] !== TAG) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 4n || msgLen > 200000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;

  // Only accept records that start with a valid protobuf tag
  if (data[msgStart] === 0 || (data[msgStart] >> 3) === 0) { continue; }

  console.log(`\n=== 0x${TAG.toString(16)} record #${count}  offset=${i}  length=${msgEnd - msgStart} ===`);
  dumpFields(data, msgStart, msgEnd, '  ', 4);
  count++;
  i = msgEnd - 1;
}

console.log(`\nShown ${count} records.`);
