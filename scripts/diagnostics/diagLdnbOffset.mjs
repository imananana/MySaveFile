/**
 * diagLdnbOffset.mjs
 *
 * For a given group of lots all sharing the same field7 (lot type tuning ID),
 * find every byte offset in each lot's LDNB where that tuning ID appears
 * as a little-endian 8-byte sequence. Report whether the offsets cluster.
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
  entries.push({ index: i, type, instLo, offset, sizeComp, compType });
}

const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

const byField7 = new Map();
for (let i = 0; i < data.length - 12; i++) {
  if (data[i] !== 0x2a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  if (msgLen < 12n || msgLen > 100000n) continue;
  const msgEnd = msgStart + Number(msgLen);
  if (msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x08) continue; p++;
  const [, afterF1] = readVarint(data, p); p = afterF1;
  if (p + 9 > msgEnd) continue;
  if (data[p] !== 0x11) continue; p++;
  if (p + 8 > data.length) continue;
  const lotId = readFixed64LE(data, p); p += 8;
  if (p >= msgEnd) continue;
  if (data[p] !== 0x1a) continue; p++;
  const [lotName, afterName] = readString(data, p);
  if (!lotName || /^[a-z][a-z0-9_]+$/.test(lotName)) { i = msgEnd - 1; continue; }
  p = afterName;
  let field7 = null;
  while (p < msgEnd) {
    const tag = data[p]; p++;
    const wt = tag & 0x07, fn = tag >> 3;
    if (fn === 0) break;
    if (tag === 0x39) { if (p + 8 > msgEnd) break; field7 = readFixed64LE(data, p); p += 8; break; }
    if (wt === 0) { const [, n] = readVarint(data, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(data, p); p = n + Number(l); }
    else if (wt === 5) p += 4; else break;
  }
  if (!field7) { i = msgEnd - 1; continue; }
  const key = field7.toString();
  if (!byField7.has(key)) byField7.set(key, []);
  byField7.get(key).push({ lotId, lotName, instLo: Number(lotId & 0xffffffffn) });
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

// For each group, find all offsets where field7 bytes appear in each lot's LDNB
for (const [field7str, lots] of byField7) {
  const field7 = BigInt(field7str);
  // Build 8-byte little-endian sequence
  const target = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) target[i] = Number((field7 >> BigInt(i * 8)) & 0xffn);

  console.log(`\n=== field7 = 0x${field7.toString(16).padStart(16,'0')}  (${lots.length} lots) ===`);
  console.log(`  Target bytes: ${target.toString('hex')}`);

  let firstFiveSamples = lots.slice(0, 5);
  for (const l of firstFiveSamples) {
    const ldnb = loadLdnb(l.instLo);
    if (!ldnb) { console.log(`  "${l.lotName}": no LDNB`); continue; }
    const offsets = [];
    for (let i = 0; i <= ldnb.length - 8; i++) {
      let match = true;
      for (let j = 0; j < 8; j++) {
        if (ldnb[i + j] !== target[j]) { match = false; break; }
      }
      if (match) offsets.push(i);
    }
    console.log(`  "${l.lotName}" (LDNB ${ldnb.length}b): found at offsets [${offsets.join(', ')}]`);
  }
}
