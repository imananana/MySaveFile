/**
 * diagVenueIds.mjs
 *
 * Take a list of lots (by field5) we BELIEVE are the same venue type.
 * Load each one's 0x06 chunk's LDNB. Find 64-bit values that are:
 *   (a) shared across all the LDNBs (intersection)
 *   (b) have the form of a tuning ID: high 32 bits = 0, low value is 0x1000-0xfffff
 *
 * Those candidate values are likely the venue tuning ID.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2];
const field5Args = process.argv.slice(3); // remaining args are field5 values

if (!savePath || field5Args.length === 0) {
  console.error('Usage: node diagVenueIds.mjs <savePath> <field5_1> <field5_2> ...');
  process.exit(1);
}

const targetField5s = new Set(field5Args.map(s => BigInt(s)));

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

// Find lot IDs for each target field5
const lotMap = new Map(); // field5 -> { lotId, lotName }
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
  if (field5 && targetField5s.has(field5)) {
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

// Extract every 64-bit value at any byte offset where:
//   high 32 bits == 0
//   low 32 bits is between 0x1000 (4096) and 0xfffff (1048575)
function extractCandidateTuningIds(ldnb) {
  const set = new Set();
  if (!ldnb) return set;
  for (let i = 0; i <= ldnb.length - 8; i++) {
    // Check high bytes are zero (bytes 4-7)
    if (ldnb[i+4] !== 0 || ldnb[i+5] !== 0 || ldnb[i+6] !== 0 || ldnb[i+7] !== 0) continue;
    // Read low 32 bits
    const lo = ldnb[i] | (ldnb[i+1] << 8) | (ldnb[i+2] << 16) | (ldnb[i+3] << 24);
    if (lo < 0x1000 || lo > 0xfffff) continue;
    set.add('0x' + lo.toString(16).padStart(8, '0'));
  }
  return set;
}

console.log(`Save: ${savePath}`);
console.log(`Looking up lots for ${field5Args.length} field5 values...\n`);

const ldnbValues = [];
for (const fs of field5Args) {
  const info = lotMap.get(fs);
  if (!info) { console.log(`  field5=${fs}: NOT FOUND`); continue; }
  const ldnb = loadLdnb(info.instLo);
  if (!ldnb) { console.log(`  "${info.lotName}" field5=${fs}: no LDNB chunk`); continue; }
  const candidates = extractCandidateTuningIds(ldnb);
  console.log(`  "${info.lotName}" field5=${fs} (LDNB ${ldnb.length}b): ${candidates.size} candidate tuning IDs`);
  ldnbValues.push({ name: info.lotName, candidates });
}

if (ldnbValues.length < 2) {
  console.log('\nNeed at least 2 lots to intersect.');
  process.exit(0);
}

let intersection = ldnbValues[0].candidates;
for (let i = 1; i < ldnbValues.length; i++) {
  intersection = new Set([...intersection].filter(v => ldnbValues[i].candidates.has(v)));
}

console.log(`\nIntersection (values present in ALL ${ldnbValues.length} LDNBs):  ${intersection.size}`);
const sorted = [...intersection].sort();
for (const v of sorted.slice(0, 50)) console.log(`  ${v}`);
if (sorted.length > 50) console.log(`  ... and ${sorted.length - 50} more`);
