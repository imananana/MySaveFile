/**
 * diagType10.mjs
 *
 * Dumps the first few 0x10 resources from the save to see what they contain.
 * Hypothesis: per-lot venue/zone state with lot type info.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
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
function readString(b,p){const[l,n]=readVarint(b,p);const e=n+Number(l);return[Buffer.from(b.slice(n,e)).toString('utf8'),e];}

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
  entries.push({ type, instLo, offset, sizeComp, compType });
}

const TARGET_TYPE = parseInt(process.argv[3] || '0x10', 16);
const type10 = entries.filter(e => e.type === TARGET_TYPE);
console.log(`Type 0x${TARGET_TYPE.toString(16)} resource count: ${type10.length}\n`);

function dumpFields(buf, start, end, indent = '', maxDepth = 3, depth = 0) {
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
      if (isPrintable) {
        console.log(`${indent}field ${fn} (string, ${raw.length}b) = "${str}"`);
      } else {
        console.log(`${indent}field ${fn} (bytes, ${raw.length}b) = ${Buffer.from(raw.slice(0, 64)).toString('hex')}${raw.length > 64 ? '…' : ''}`);
        if (raw.length >= 2 && raw.length < 5000 && depth < maxDepth - 1) {
          try { dumpFields(raw, 0, raw.length, indent + '  ', maxDepth, depth + 1); } catch {}
        }
      }
      p = msgEnd;
    } else if (wt === 5) {
      if (p + 4 > buf.length) break;
      p += 4;
    } else break;
  }
}

// Dump the first 3 resources of type 0x10
for (let i = 0; i < Math.min(3, type10.length); i++) {
  const e = type10[i];
  let raw = buf.slice(e.offset, e.offset + e.sizeComp);
  if (e.compType === 0xffff) {
    try {
      const p2 = Buffer.from(raw);
      if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
      raw = decompress(p2);
    } catch (err) { console.log(`Skip ${i}: decompression failed`); continue; }
  }
  console.log(`\n=== 0x10 resource #${i}  instLo=0x${e.instLo.toString(16)}  size=${raw.length}b ===`);
  console.log(`First 100 bytes hex: ${Buffer.from(raw.slice(0, 100)).toString('hex')}`);
  console.log(`First 60 bytes as ascii: ${Buffer.from(raw.slice(0, 60)).toString('utf8').replace(/[^\x20-\x7e]/g, '.')}`);
  console.log('Decoded as protobuf:');
  dumpFields(raw, 0, raw.length, '  ', 3);
}
