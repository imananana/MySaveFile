/**
 * diagLdnbScan.mjs
 *
 * Smart venue-type-in-LDNB discovery:
 * 1. Scan all 0x2a records and group lots by their "lot type tuning ID" (field 7)
 * 2. For each group, load the corresponding 0x06 chunk's LDNB
 * 3. Find 64-bit values that appear in MULTIPLE LDNBs within the same group AND
 *    NOT in lots of other groups → those are the venue type tuning IDs in LDNB.
 *
 * This uses 0x2a's known type IDs as ground truth to locate the encoding in LDNB.
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

// Build index of all entries
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

// Load the 0x0d data
const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

// Scan 0x2a records, group lots by field 7
const byField7 = new Map(); // field7 -> [{lotId, lotName, ...}]
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

// For each group, load all LDNB blobs, find common 64-bit values
function loadLdnb(instLo) {
  const e = entries.find(en => en.type === 0x06 && en.instLo === instLo);
  if (!e) return null;
  let raw = buf.slice(e.offset, e.offset + e.sizeComp);
  if (e.compType === 0xffff) {
    try { const p2 = Buffer.from(raw); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; raw = decompress(p2); } catch { return null; }
  }
  // Parse outer protobuf and extract field 2 (LDNB bytes)
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

// Extract every 8-byte value from an LDNB (at every byte offset, not just aligned)
// Return a Set of unique uint64 hex values
function extractUint64s(ldnb) {
  const set = new Set();
  if (!ldnb) return set;
  for (let i = 0; i <= ldnb.length - 8; i++) {
    let v = 0n;
    for (let j = 0; j < 8; j++) v |= BigInt(ldnb[i + j]) << BigInt(j * 8);
    // Skip super common values (0, all-ones, low small numbers — too noisy)
    if (v === 0n) continue;
    if (v === 0xffffffffffffffffn) continue;
    if (v < 0x10000n) continue; // skip small object counts
    set.add(v.toString(16));
  }
  return set;
}

console.log(`Save: ${savePath}`);
console.log(`0x2a groups found: ${byField7.size}\n`);

// Sort groups by size descending
const groups = [...byField7.entries()].sort((a, b) => b[1].length - a[1].length);

// Pre-compute intersection per group (values shared across all sampled lots of this group)
const groupIntersections = new Map();
for (const [field7, lots] of groups) {
  if (lots.length < 2) continue;
  const samples = lots.slice(0, 5);
  let intersection = null;
  for (const l of samples) {
    const ldnb = loadLdnb(l.instLo);
    const vals = extractUint64s(ldnb);
    if (intersection === null) intersection = vals;
    else intersection = new Set([...intersection].filter(v => vals.has(v)));
  }
  groupIntersections.set(field7, { lots, intersection, samples });
}

// For each group, find values UNIQUE to that group (not in any other group's intersection)
for (const [field7, { lots, intersection, samples }] of groupIntersections) {
  let unique = new Set(intersection);
  for (const [otherKey, { intersection: otherInter }] of groupIntersections) {
    if (otherKey === field7) continue;
    for (const v of otherInter) unique.delete(v);
  }
  console.log(`field7 = 0x${BigInt(field7).toString(16).padStart(16,'0')} (${lots.length} lots)`);
  console.log(`  Sample: ${samples.map(l => `"${l.lotName}"`).join(', ')}`);
  console.log(`  Common ∩ group: ${intersection.size}  |  Unique to group: ${unique.size}`);
  if (unique.size > 0 && unique.size < 100) {
    const sorted = [...unique].sort();
    console.log(`  Unique values (candidates for venue tuning ID):`);
    for (const v of sorted.slice(0, 30)) console.log(`    0x${v.padStart(16, '0')}`);
  }
  console.log('');
}
