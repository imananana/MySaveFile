/**
 * diagLotChunk.mjs
 *
 * Find and dump the 0x06 chunk for a given lot (by instLo = lot ID low 32 bits).
 *
 * Usage: node scripts/diagLotChunk.mjs <savePath> <instLoHex>
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const INST_LO = parseInt(process.argv[3] || '0x35752616', 16);

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

let target = null;
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4; off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  if (type === 0x06 && instLo === INST_LO) {
    target = { type, instLo, offset, sizeComp, compType };
    break;
  }
}

if (!target) { console.error(`No 0x06 resource with instLo=0x${INST_LO.toString(16)}`); process.exit(1); }

let raw = buf.slice(target.offset, target.offset + target.sizeComp);
if (target.compType === 0xffff) {
  try {
    const p2 = Buffer.from(raw);
    if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
    raw = decompress(p2);
  } catch (e) { console.error('Decompression failed:', e); process.exit(1); }
}

console.log(`Found 0x06 chunk with instLo=0x${INST_LO.toString(16)}`);
console.log(`Decompressed size: ${raw.length}b\n`);
console.log(`First 256 bytes hex:\n${Buffer.from(raw.slice(0, 256)).toString('hex')}\n`);
console.log(`First 200 bytes ASCII:\n${Buffer.from(raw.slice(0, 200)).toString('utf8').replace(/[^\x20-\x7e]/g, '.')}\n`);

// Also dump the LAST 512 bytes of the LDNB (field 2 data) - this is where the section offsets point
// First find field 2 offset and size
let p = 0;
let f2start = -1, f2end = -1;
while (p < raw.length) {
  const tag = raw[p]; p++;
  if (tag === 0) break;
  const wt = tag & 0x07;
  if (wt === 0) { let s=0n; while(p<raw.length){const x=raw[p++]; s|=BigInt(x&0x7f); if((x&0x80)===0)break;} }
  else if (wt === 1) p += 8;
  else if (wt === 2) {
    let len = 0n, shift = 0n;
    while (p < raw.length) { const x = raw[p++]; len |= BigInt(x & 0x7f) << shift; shift += 7n; if ((x & 0x80) === 0) break; }
    const end = p + Number(len);
    if (tag === 0x12) { f2start = p; f2end = end; break; }
    p = end;
  }
  else if (wt === 5) p += 4;
  else break;
}

if (f2start > 0) {
  console.log(`\nField 2 (LDNB) range: ${f2start}..${f2end} (${f2end - f2start} bytes)`);
  console.log(`LAST 512 bytes of LDNB hex:\n${Buffer.from(raw.slice(f2end - 512, f2end)).toString('hex')}\n`);
}

// Try to decode as protobuf
function dumpFields(buf, start, end, indent = '', maxDepth = 4, depth = 0) {
  if (depth >= maxDepth) return;
  let p = start;
  let count = 0;
  while (p < end && count < 50) {
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
      const r = buf.slice(next, msgEnd);
      let str = '';
      try { str = Buffer.from(r).toString('utf8'); } catch {}
      const isPrintable = str.length > 0 && /^[\x20-\x7e\n\r\t]*$/.test(str);
      if (isPrintable && r.length < 200) {
        console.log(`${indent}field ${fn} (string, ${r.length}b) = "${str}"`);
      } else {
        console.log(`${indent}field ${fn} (bytes, ${r.length}b) = ${Buffer.from(r.slice(0, 64)).toString('hex')}${r.length > 64 ? '…' : ''}`);
        if (r.length >= 2 && r.length < 5000 && depth < maxDepth - 1) {
          try { dumpFields(r, 0, r.length, indent + '  ', maxDepth, depth + 1); } catch {}
        }
      }
      p = msgEnd;
    } else if (wt === 5) {
      if (p + 4 > buf.length) break;
      const val = (buf[p] | (buf[p+1]<<8) | (buf[p+2]<<16) | (buf[p+3]<<24)) >>> 0;
      p += 4;
      console.log(`${indent}field ${fn} (fixed32) = 0x${val.toString(16).padStart(8,'0')}`);
    } else break;
    count++;
  }
  if (count >= 50) console.log(`${indent}<truncated at 50 fields>`);
}

console.log(`Decoded as protobuf (top level, max 50 fields):`);
dumpFields(raw, 0, raw.length, '  ', 3);
