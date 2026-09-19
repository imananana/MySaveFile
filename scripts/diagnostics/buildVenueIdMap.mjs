/**
 * buildVenueIdMap.mjs
 *
 * For every lot in the save:
 *   1. Find its 0x06 chunk (instLo = lotId low 32 bits)
 *   2. Scan the LDNB for the marker pattern: [28 zero bytes][06 00 00 00][8 bytes]
 *   3. The 8 bytes = venue tuning ID
 * Cross-reference with the lot's DEFAULT type from worlds.ts (matched via field5)
 * to build a "venue tuning ID → lot type string" mapping.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const repoRoot = '/Users/imanakhtar/Documents/Sims Save File Planner';

// Load lotField5Map: field5 → "World::LotName"
const fieldMapSrc = readFileSync(`${repoRoot}/src/data/lotField5Map.ts`, 'utf8');
const field5ToKey = new Map();
for (const line of fieldMapSrc.split('\n')) {
  const m = line.match(/^\s*'(\d+)':\s*['"]([^'"]+)['"]/);
  if (m) field5ToKey.set(m[1], m[2]);
}

// Load worlds.ts to get default lot type for each "World::LotName"
const worldsSrc = readFileSync(`${repoRoot}/src/data/worlds.ts`, 'utf8');
const lotKeyToType = new Map();
{
  // Each world starts with `"WorldName": {` (at indent 2) followed by inline content
  // Match all world blocks
  const worldRe = /^\s{2}"([^"]+)":\s*\{\s*"release":\s*\d+,\s*"lots":\s*\[([^\]]*)\]/gm;
  let m;
  while ((m = worldRe.exec(worldsSrc)) !== null) {
    const world = m[1];
    const lotsBlob = m[2];
    // Match each lot object inside lots: { ... }
    const lotRe = /\{\s*"name":\s*"([^"]+)"[^}]*?"type":\s*"([^"]+)"[^}]*\}/g;
    let lm;
    while ((lm = lotRe.exec(lotsBlob)) !== null) {
      lotKeyToType.set(`${world}::${lm[1]}`, lm[2]);
    }
  }
}
console.error(`Loaded ${lotKeyToType.size} lot keys with default types`);

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

// Build (field5, lotId, lotName) list
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
  lots.push({ lotId, lotName, field5, instLo: Number(lotId & 0xffffffffn) });
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

// Marker: 28 bytes of zero + 06 00 00 00 + venue tuning ID (8 bytes LE)
function extractVenueTuningId(ldnb) {
  if (!ldnb) return null;
  // Search backward from end for the marker
  for (let i = ldnb.length - 40; i >= 0; i--) {
    // Check 28 bytes of zero (i to i+27)
    let zeros = true;
    for (let j = 0; j < 28; j++) {
      if (ldnb[i + j] !== 0) { zeros = false; break; }
    }
    if (!zeros) continue;
    // Check 06 00 00 00 at i+28
    if (ldnb[i + 28] !== 0x06) continue;
    if (ldnb[i + 29] !== 0x00) continue;
    if (ldnb[i + 30] !== 0x00) continue;
    if (ldnb[i + 31] !== 0x00) continue;
    // Read 8 bytes at i+32 as little-endian uint64
    let v = 0n;
    for (let j = 0; j < 8; j++) v |= BigInt(ldnb[i + 32 + j]) << BigInt(j * 8);
    if (v === 0n) continue; // require non-zero
    return v;
  }
  return null;
}

// Build venue tuning ID → set of (default lot type) mappings
const idToTypes = new Map(); // tuningId -> Map<defaultLotType, count>
const lotsWithType = [];

let countNoField5 = 0, countNoKey = 0, countNoType = 0, countNoLdnb = 0, countNoTuning = 0;
const noTuningLots = [];
const noLdnbLots = [];
const noKeyLots = [];
const noTypeLots = [];
for (const lot of lots) {
  if (!lot.field5) { countNoField5++; continue; }
  const plannerKey = field5ToKey.get(lot.field5.toString());
  if (!plannerKey) { countNoKey++; noKeyLots.push({ name: lot.lotName, field5: lot.field5.toString() }); continue; }
  const defaultType = lotKeyToType.get(plannerKey);
  if (!defaultType) { countNoType++; noTypeLots.push({ name: lot.lotName, plannerKey, field5: lot.field5.toString() }); continue; }
  const ldnb = loadLdnb(lot.instLo);
  if (!ldnb) { countNoLdnb++; noLdnbLots.push({ name: lot.lotName, plannerKey, defaultType }); continue; }
  const tuningId = extractVenueTuningId(ldnb);
  if (!tuningId) {
    countNoTuning++;
    noTuningLots.push({ name: lot.lotName, plannerKey, defaultType, ldnbSize: ldnb.length });
    continue;
  }

  const key = '0x' + tuningId.toString(16);
  if (!idToTypes.has(key)) idToTypes.set(key, new Map());
  const counts = idToTypes.get(key);
  counts.set(defaultType, (counts.get(defaultType) ?? 0) + 1);

  lotsWithType.push({ lotName: lot.lotName, plannerKey, defaultType, tuningId: key, currentName: lot.lotName });
}

console.log(`Save: ${savePath}`);
console.log(`Total 0x3a lots scanned: ${lots.length}`);
console.log(`  countNoField5=${countNoField5}, countNoKey=${countNoKey}, countNoType=${countNoType}, countNoLdnb=${countNoLdnb}, countNoTuning=${countNoTuning}`);
console.log(`Lots with default type + venue tuning ID extracted: ${lotsWithType.length}\n`);

console.log(`\n=== Lots with LDNB but NO venue tuning marker (${noTuningLots.length}) ===`);
for (const l of noTuningLots) {
  console.log(`  "${l.name}"  (${l.plannerKey})  default=${l.defaultType}  ldnbSize=${l.ldnbSize}`);
}

console.log(`\n=== Lots with NO 0x06 LDNB chunk in save (${noLdnbLots.length}) ===`);
for (const l of noLdnbLots) {
  console.log(`  "${l.name}"  (${l.plannerKey})  default=${l.defaultType}`);
}

console.log(`\n=== Lots with field5 but NO planner key in lotField5Map.ts (${noKeyLots.length}) ===`);
for (const l of noKeyLots) {
  console.log(`  "${l.name}"  field5=${l.field5}`);
}

console.log(`\n=== Lots with planner key but NO default type in worlds.ts (${noTypeLots.length}) ===`);
for (const l of noTypeLots) {
  console.log(`  "${l.name}"  (${l.plannerKey})  field5=${l.field5}`);
}
console.log('');

// Report tuning ID → most common default type
console.log(`Venue tuning ID → default lot type (sorted by lots count):\n`);
const sortedIds = [...idToTypes.entries()].sort((a, b) => {
  const totalA = [...a[1].values()].reduce((s, v) => s + v, 0);
  const totalB = [...b[1].values()].reduce((s, v) => s + v, 0);
  return totalB - totalA;
});

for (const [id, counts] of sortedIds) {
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  const breakdown = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}=${c}`).join(', ');
  console.log(`  ${id.padStart(14)}  total=${String(total).padStart(3)}  ${breakdown}`);
}

// Find lots whose tuning ID's "majority default type" doesn't match their default — these are likely CHANGED lots
console.log(`\n\nLots whose detected tuning ID disagrees with default type (likely CHANGED in-game):\n`);
const idMajority = new Map();
for (const [id, counts] of idToTypes) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  idMajority.set(id, sorted[0][0]);
}

for (const l of lotsWithType) {
  const detected = idMajority.get(l.tuningId);
  if (detected !== l.defaultType) {
    console.log(`  "${l.lotName}"  (${l.plannerKey})`);
    console.log(`     default=${l.defaultType}  detected=${detected}  (id ${l.tuningId})`);
  }
}
