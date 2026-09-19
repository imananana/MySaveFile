/**
 * Spot-check the Akins household record bytes around the failure point.
 * Looking for the alternative payload format that breaks our forward walker.
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
if (typeConst) headerPos += 4;
if (groupConst) headerPos += 4;
if (instHiConst) headerPos += 4;
const entrySize = 32 - (typeConst?4:0) - (groupConst?4:0) - (instHiConst?4:0);
const entries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type = typeConst ? view.getUint32(indexOffset + 4, true) : view.getUint32(off, true); off += typeConst ? 0 : 4;
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
const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

// Dump 200 bytes from Akins anchor (649519)
const start = 649519;
const end = 649519 + 256;
console.log('Bytes from Akins anchor (offset 649519):');
let s = '';
for (let i = start; i < end; i++) s += data[i].toString(16).padStart(2, '0') + ' ';
console.log(s);
console.log();
console.log('Decoded:');
let p = start;
const stop = start + 256;
// Walk fields starting from anchor
function readV(p) { let r=0n,sh=0n; while(p<data.length){const x=data[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readF(p) { let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(data[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(data[p+4+i])<<BigInt(i*8); return lo|(hi<<32n); }

// Anchor: 09 [8] 11 [8] 1a [len][name] 21 [8]
if (data[p] !== 0x09) { console.log('no 0x09 at start'); process.exit(); }
console.log(`@${p} 0x09 token=${readF(p+1).toString(16)}`); p += 9;
console.log(`@${p} 0x11 hhId=${readF(p+1).toString(16)}`); p += 9;
console.log(`@${p} 0x1a name=`); p++;
const [nlen, na] = readV(p); p = na;
const name = Buffer.from(data.slice(p, p + Number(nlen))).toString('utf8'); p += Number(nlen);
console.log(`  "${name}"`);
console.log(`@${p} 0x21 lotId=${readF(p+1).toString(16)}`); p += 9;

// Now walk fields manually with no length guards
while (p < stop) {
  const tagOff = p;
  const t = data[p++];
  if (t === 0) { console.log(`@${tagOff} TAG=0`); break; }
  const wt = t & 0x07, fn = t >> 3;
  if (wt === 0) {
    const [v, n] = readV(p);
    console.log(`@${tagOff} tag=0x${t.toString(16)} f${fn} varint=${v}`);
    p = n;
  } else if (wt === 1) {
    const v = readF(p);
    console.log(`@${tagOff} tag=0x${t.toString(16)} f${fn} fixed64=0x${v.toString(16)}`);
    p += 8;
  } else if (wt === 2) {
    const [l, n] = readV(p);
    const e = n + Number(l);
    const hex = Buffer.from(data.slice(n, Math.min(e, n + 32))).toString('hex');
    console.log(`@${tagOff} tag=0x${t.toString(16)} f${fn} len=${l} hex=${hex}${e - n > 32 ? '…' : ''}`);
    if (l > 100000n) { console.log('  → length suspiciously large, stop here'); break; }
    p = e;
  } else if (wt === 5) {
    p += 4;
    console.log(`@${tagOff} tag=0x${t.toString(16)} f${fn} fixed32`);
  } else {
    console.log(`@${tagOff} tag=0x${t.toString(16)} UNKNOWN_WT=${wt}`);
    break;
  }
}
