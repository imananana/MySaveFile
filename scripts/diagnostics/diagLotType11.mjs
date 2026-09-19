/**
 * diagLotType11.mjs
 *
 * Group all 0x3a records by field 11.1 (the leading varint in the lot state).
 * If venues of the same type share this value, it's the venue tuning ID.
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
  data = raw;
  break;
}

function getSubMessage(buf, start, end, fieldNum) {
  let p = start;
  while (p < end) {
    if (p >= buf.length) return null;
    const tag = buf[p]; p++;
    const wt = tag & 0x07; const fn = tag >> 3;
    if (fn === 0) return null;
    if (wt === 2) {
      const [len, next] = readVarint(buf, p);
      const subEnd = next + Number(len);
      if (subEnd > buf.length) return null;
      if (fn === fieldNum) return { start: next, end: subEnd };
      p = subEnd;
    } else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

function getVarintField(buf, start, end, fieldNum) {
  let p = start;
  while (p < end) {
    if (p >= buf.length) return null;
    const tag = buf[p]; p++;
    const wt = tag & 0x07; const fn = tag >> 3;
    if (fn === 0) return null;
    if (wt === 0) {
      const [val, next] = readVarint(buf, p);
      if (fn === fieldNum) return val;
      p = next;
    } else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

const lots = [];
for (let i = 0; i < data.length - 12; i++) {
  if (data[i] !== 0x3a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 12n || msgLen > 200000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x09) continue; p++;
  if (p + 8 > msgEnd) continue;
  const lotId = readFixed64LE(data, p); p += 8;
  if (data[p] !== 0x12) continue; p++;
  const [lotName, afterName] = readString(data, p);
  if (!lotName || lotName.length < 3) { i = msgEnd - 1; continue; }
  if (/^[a-z][a-z0-9_:]+$/.test(lotName)) { i = msgEnd - 1; continue; }

  let field5 = null;
  let q = afterName;
  while (q < msgEnd) {
    const t = data[q]; q++;
    const wt = t & 0x07, fn = t >> 3;
    if (fn === 0) break;
    if (t === 0x28) { const [v, n] = readVarint(data, q); field5 = v; q = n; break; }
    if (wt === 0) { const [, n] = readVarint(data, q); q = n; }
    else if (wt === 1) q += 8;
    else if (wt === 2) { const [l, n] = readVarint(data, q); q = n + Number(l); }
    else if (wt === 5) q += 4; else break;
  }

  const f11 = getSubMessage(data, afterName, msgEnd, 11);
  let f11_1 = null;
  if (f11) f11_1 = getVarintField(data, f11.start, f11.end, 1);

  lots.push({ lotName, field5, f11_1 });
  i = msgEnd - 1;
}

// Group by f11_1
const byF11_1 = new Map();
for (const l of lots) {
  const k = l.f11_1 === null ? '<none>' : l.f11_1.toString();
  if (!byF11_1.has(k)) byF11_1.set(k, []);
  byF11_1.get(k).push(l);
}

console.log(`Save: ${savePath}\nTotal lots: ${lots.length}\n`);
console.log(`Lots grouped by field 11.1 (varint):\n`);
const sorted = [...byF11_1.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, g] of sorted.slice(0, 30)) {
  console.log(`\n=== ${k} (${g.length} lots) ===`);
  for (const l of g.slice(0, 5)) console.log(`  "${l.lotName}"  field5=${l.field5}`);
  if (g.length > 5) console.log(`  ...and ${g.length - 5} more`);
}
console.log(`\n${sorted.length} unique values total`);
