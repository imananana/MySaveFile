/**
 * Find where Brylee Kendrick's full sim record lives (with lifestage data).
 * Method:
 *   1. Search 0x0d for all occurrences of her sim ID as fixed64 little-endian.
 *   2. For each hit, walk backward to find an enclosing message tag + length.
 *   3. Print the longest candidate's first ~30 fields.
 * Also: list all distinct DBPF resource types to see if humans have their own
 * per-sim 0x06-style chunks like lots do.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const TARGET_ID = 0x0cab161e00d9137dn; // Brylee Kendrick

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

const entries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
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

// (1) Resource type distribution
const typeMap = new Map();
for (const e of entries) typeMap.set(e.type, (typeMap.get(e.type) || 0) + 1);
console.log('=== DBPF resource types ===');
for (const [t, c] of [...typeMap.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  type 0x${t.toString(16).padStart(4, '0')}: ${c} entries`);
}

// (2) Look for Brylee's instLo (sim ID low 32 bits) in DBPF index
const targetInstLo = Number(TARGET_ID & 0xffffffffn);
console.log(`\nBrylee instLo: 0x${targetInstLo.toString(16)} (0x${TARGET_ID.toString(16)} & 0xffffffff)`);
const bryleeEntries = entries.filter(e => e.instLo === targetInstLo);
console.log(`DBPF entries with this instLo: ${bryleeEntries.length}`);
for (const e of bryleeEntries) console.log(`  type=0x${e.type.toString(16)}, offset=${e.offset}, size=${e.sizeComp}, comp=0x${e.compType.toString(16)}`);

// (3) Decompress 0x0d
const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

function readV(b, p) { let r=0n,sh=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readF(b, p) { let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(b[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(b[p+4+i])<<BigInt(i*8); return lo|(hi<<32n); }

// (4) Search for Brylee's ID in the 0x0d buffer as fixed64 LE
const idBytes = Buffer.alloc(8);
for (let i = 0; i < 8; i++) idBytes[i] = Number((TARGET_ID >> BigInt(i * 8)) & 0xffn);
const hits = [];
for (let i = 0; i + 8 <= data.length; i++) {
  let ok = true;
  for (let j = 0; j < 8; j++) if (data[i + j] !== idBytes[j]) { ok = false; break; }
  if (ok) hits.push(i);
}
console.log(`\n=== 0x0d hits for Brylee's ID (${idBytes.toString('hex')}) ===`);
console.log(`Found ${hits.length} occurrences`);

// For each hit, look at the byte before. It should be a protobuf tag.
const tagCounts = new Map();
for (const h of hits) {
  const tag = data[h - 1];
  tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
}
console.log(`Preceding tag distribution:`);
for (const [t, c] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  tag 0x${t.toString(16)} (field ${t >> 3}, wt ${t & 7}): ${c}`);
}

// (5) Look for the "longest enclosing message" by trying each hit's preceding 0x09 + walking back
console.log(`\n=== Longest enclosing records for each hit type ===`);
const recordCandidates = [];
for (const h of hits) {
  if (data[h - 1] !== 0x09) continue;
  // Walk backward: find any byte that, when interpreted as a tag, followed by a varint length, ends at h-1
  for (let tagBack = 1; tagBack <= 6; tagBack++) {
    const tagPos = h - 1 - tagBack;
    if (tagPos < 0) continue;
    const [lv, le] = readV(data, tagPos + 1);
    if (le === h - 1 && lv > 30n && lv < 100_000n) {
      const tag = data[tagPos];
      // Sanity: this tag should be a wireType 2 (length-delimited) — i.e. tag & 7 === 2
      if ((tag & 7) !== 2) continue;
      recordCandidates.push({ tagPos, tag, lenBytes: tagBack, len: lv, bodyStart: h - 1, bodyEnd: h - 1 + Number(lv), idAt: h });
    }
  }
}
// Show top 5 longest
recordCandidates.sort((a, b) => Number(b.len - a.len));
console.log(`Found ${recordCandidates.length} plausible enclosing records`);
for (let k = 0; k < Math.min(5, recordCandidates.length); k++) {
  const r = recordCandidates[k];
  console.log(`\n--- Candidate ${k + 1}: outer tag @${r.tagPos} = 0x${r.tag.toString(16)} (field ${r.tag >> 3}, wt 2), len=${r.len}, body @${r.bodyStart}..${r.bodyEnd} ---`);
  // Decode first 30 fields
  let p = r.bodyStart;
  let i = 0;
  while (p < r.bodyEnd && i < 30) {
    const tagOff = p;
    const t = data[p++]; if (t === 0) break;
    const wt = t & 7, fn = t >> 3;
    if (wt === 0) { const [v, n] = readV(data, p); console.log(`  @${tagOff} tag=0x${t.toString(16)} f${fn} varint=${v} (0x${v.toString(16)})`); p = n; }
    else if (wt === 1) { const v = readF(data, p); console.log(`  @${tagOff} tag=0x${t.toString(16)} f${fn} fixed64=0x${v.toString(16)}`); p += 8; }
    else if (wt === 2) {
      const [l, n] = readV(data, p);
      const e = n + Number(l);
      if (e > r.bodyEnd) { console.log(`  @${tagOff} overrun`); break; }
      const sub = data.slice(n, e);
      const isStr = Number(l) > 0 && Number(l) < 200 && sub.every(b => b >= 0x20 && b < 0x7f);
      const hex = Buffer.from(sub).toString('hex').slice(0, 48);
      console.log(`  @${tagOff} tag=0x${t.toString(16)} f${fn} len=${l} ${isStr ? `text="${sub.toString()}"` : `hex=${hex}${Number(l) > 24 ? '…' : ''}`}`);
      p = e;
    } else if (wt === 5) {
      const v32 = data[p] | (data[p+1] << 8) | (data[p+2] << 16) | (data[p+3] << 24);
      console.log(`  @${tagOff} tag=0x${t.toString(16)} f${fn} fixed32=0x${(v32>>>0).toString(16).padStart(8, '0')}`);
      p += 4;
    } else if (wt === 3) {
      const closeTag = (fn << 3) | 4;
      const sgStart = p;
      let depth = 1;
      while (p < r.bodyEnd && depth > 0) {
        if (data[p] === closeTag) { depth--; p++; if (depth === 0) break; }
        else if ((data[p] & 7) === 3 && (data[p] >> 3) === fn) { depth++; p++; }
        else p++;
      }
      console.log(`  @${tagOff} tag=0x${t.toString(16)} f${fn} SGROUP→EGROUP (${p - sgStart} bytes)`);
    } else { console.log(`  @${tagOff} UNKNOWN wt=${wt}`); break; }
    i++;
  }
}
