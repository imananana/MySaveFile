/**
 * diagVerifyId.mjs
 *
 * For each lot (by field5), check whether candidate venue tuning IDs appear
 * in its LDNB, and at what byte offsets.
 *
 * Usage:
 *   node diagVerifyId.mjs <savePath> <field5> [field5 ...]
 *   then it tries each candidate ID against each lot.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2];
const field5Args = process.argv.slice(3);

// Candidate venue IDs we've discovered
const CANDIDATES = [
  { id: 0x41e9, name: 'Gym?' },
  { id: 0x41ea, name: 'Library?' },
  { id: 0x8840, name: 'Cafe?' },
  { id: 0x1dd87, name: 'Cafe?-alt' },
  { id: 0x6fc6, name: 'Residential (0x2a-confirmed)' },
  { id: 0x53533, name: 'Apartment (0x2a-confirmed)' },
];

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
  entries.push({ index: i, type, instLo, offset, sizeComp, compType });
}

const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

const lotMap = new Map();
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
  if (field5) {
    lotMap.set(field5.toString(), { lotId, lotName, instLo: Number(lotId & 0xffffffffn) });
  }
  i = msgEnd - 1;
}

function loadLdnb(instLo) {
  const e = entries.find(en => en.type === 0x06 && en.instLo === instLo);
  if (!e) return null;
  let raw = buf.slice(e.offset, e.offset + e.sizeComp);
  if (e.compType === 0xffff) {
    try { const p2 = Buffer.from(raw); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; raw = decompress(p2); } catch { return null; }
  }
  let p = 0;
  while (p < raw.length) {
    const tag = raw[p]; p++;
    if (tag === 0) return null;
    const wt = tag & 0x07;
    if (wt === 2) {
      let len = 0n, shift = 0n;
      while (p < raw.length) { const x = raw[p++]; len |= BigInt(x & 0x7f) << shift; shift += 7n; if ((x & 0x80) === 0) break; }
      const end = p + Number(len);
      if (tag === 0x12) return raw.slice(p, end);
      p = end;
    } else if (wt === 0) { while (p < raw.length && (raw[p++] & 0x80)) {} }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

function findOffsets(ldnb, id) {
  // Look for 8-byte little-endian: low 32 = id, high 32 = 0
  const target = Buffer.alloc(8);
  target[0] = id & 0xff;
  target[1] = (id >>> 8) & 0xff;
  target[2] = (id >>> 16) & 0xff;
  target[3] = (id >>> 24) & 0xff;
  // bytes 4-7 already 0
  const offsets = [];
  for (let i = 0; i <= ldnb.length - 8; i++) {
    let match = true;
    for (let j = 0; j < 8; j++) {
      if (ldnb[i + j] !== target[j]) { match = false; break; }
    }
    if (match) offsets.push(i);
  }
  return offsets;
}

for (const fs of field5Args) {
  const info = lotMap.get(fs);
  if (!info) { console.log(`field5=${fs}: NOT FOUND in save`); continue; }
  const ldnb = loadLdnb(info.instLo);
  if (!ldnb) { console.log(`"${info.lotName}" field5=${fs}: no LDNB chunk`); continue; }

  console.log(`\n"${info.lotName}" field5=${fs} (LDNB ${ldnb.length}b):`);
  for (const c of CANDIDATES) {
    const offsets = findOffsets(ldnb, c.id);
    if (offsets.length > 0) {
      console.log(`  ✓ ${c.name} (0x${c.id.toString(16)}) found at offsets: [${offsets.slice(0, 10).join(', ')}${offsets.length > 10 ? ', …' : ''}]  (${offsets.length} hits)`);
    } else {
      console.log(`  ✗ ${c.name} (0x${c.id.toString(16)}) NOT found`);
    }
  }
}
