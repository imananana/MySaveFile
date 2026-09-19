/**
 * Decode Oreo's full pet record starting from its outer tag.
 * Compare key fields against a known human sim record for the same household
 * to identify the species/lifestage/gender differential.
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
const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

function readV(p) { let r=0n,sh=0n; while(p<data.length){const x=data[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readF(p) { let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(data[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(data[p+4+i])<<BigInt(i*8); return lo|(hi<<32n); }

function decodeMessage(start, end, label, depth = 0, maxDepth = 2) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${label}: @${start}..${end} (${end - start} bytes)`);
  let p = start;
  let i = 0;
  while (p < end && i < 200) {
    const tagOff = p;
    const t = data[p++]; if (t === 0) { console.log(`${indent}  @${tagOff} TAG=0`); break; }
    const wt = t & 7, fn = t >> 3;
    if (wt === 0) {
      const [v, n] = readV(p);
      console.log(`${indent}  @${tagOff} tag=0x${t.toString(16)} f${fn} wt0 varint=${v} (0x${v.toString(16)})`);
      p = n;
    } else if (wt === 1) {
      const v = readF(p);
      console.log(`${indent}  @${tagOff} tag=0x${t.toString(16)} f${fn} wt1 fixed64=0x${v.toString(16)}`);
      p += 8;
    } else if (wt === 2) {
      const [l, n] = readV(p);
      const e = n + Number(l);
      if (e > end) { console.log(`${indent}  @${tagOff} OVERRUN`); break; }
      const sub = data.slice(n, e);
      const isStr = Number(l) > 0 && Number(l) < 200 && sub.every(b => b >= 0x20 && b < 0x7f);
      if (isStr) {
        console.log(`${indent}  @${tagOff} tag=0x${t.toString(16)} f${fn} wt2 len=${l} text="${sub.toString()}"`);
      } else {
        const hex = Buffer.from(sub).toString('hex').slice(0, 64);
        console.log(`${indent}  @${tagOff} tag=0x${t.toString(16)} f${fn} wt2 len=${l} hex=${hex}${Number(l) > 32 ? '…' : ''}`);
        if (depth < maxDepth && Number(l) > 0 && Number(l) < 500) {
          // Try recursion: only if it parses as protobuf cleanly
          decodeMessage(n, e, `(nested f${fn})`, depth + 1, maxDepth);
        }
      }
      p = e;
    } else if (wt === 5) {
      console.log(`${indent}  @${tagOff} tag=0x${t.toString(16)} f${fn} wt5 fixed32=0x${data[p].toString(16).padStart(2,'0')}${data[p+1].toString(16).padStart(2,'0')}${data[p+2].toString(16).padStart(2,'0')}${data[p+3].toString(16).padStart(2,'0')}`);
      p += 4;
    } else { console.log(`${indent}  @${tagOff} UNKNOWN WT=${wt}`); break; }
    i++;
  }
  if (i >= 200) console.log(`${indent}  ...truncated at 200 fields`);
}

// Locate Oreo: find "Oreo" string preceded by [0x2a][0x04] (field 5 wt2 length 4)
let oreoOuter = -1;
let oreoBodyEndForce = -1;
for (let i = 0; i + 6 <= data.length; i++) {
  if (data[i] !== 0x4f) continue;
  if (data[i+1] !== 0x72 || data[i+2] !== 0x65 || data[i+3] !== 0x6f) continue;
  if (data[i-1] !== 0x04 || data[i-2] !== 0x2a) continue;
  // Walk backward to find field 1 (0x09 + 8 bytes) = sim id 0x0cab161e093f13c9
  // Then outer tag is just before that.
  // Pattern: [outerTag][lenVarint][0x09][8 sim id][0x11][8 something][0x18][varint][0x21][8 hh id][0x2a][0x04]"Oreo"
  // Walk backward 50 bytes to find 0x09 followed by 8 bytes whose LE = 0x0cab161e093f13c9
  for (let back = 4; back < 80; back++) {
    const candStart = i - 2 - back;
    if (candStart < 0) break;
    if (data[candStart] === 0x09) {
      // Read 8 bytes
      let v = 0n;
      for (let k = 0; k < 8; k++) v |= BigInt(data[candStart + 1 + k]) << BigInt(k * 8);
      if (v === 0x0cab161e093f13c9n) {
        // Outer tag is at some position before candStart, with a varint length that lands at candStart
        // Try larger tagBacks first — pet records have multi-byte varint lengths
        let bestLen = 0n;
        for (let tagBack = 6; tagBack >= 1; tagBack--) {
          const tagPos = candStart - tagBack;
          if (tagPos < 0) continue;
          const [lv, le] = readV(tagPos + 1);
          if (le === candStart && lv > bestLen && lv < 1_000_000n) {
            bestLen = lv;
            oreoOuter = tagPos;
            oreoBodyEndForce = candStart + Number(lv);
          }
        }
        if (oreoOuter >= 0) break;
      }
    }
  }
  if (oreoOuter >= 0) break;
}
console.log(`Oreo outer tag located at: @${oreoOuter}`);
const tag = data[oreoOuter];
console.log(`Outer tag at @${oreoOuter}: 0x${tag.toString(16)} (field ${tag >> 3}, wt ${tag & 7})`);
const [oreoLen, oreoBodyStart] = readV(oreoOuter + 1);
const oreoBodyEnd = oreoBodyStart + Number(oreoLen);
console.log(`Outer message length: ${oreoLen}, body @${oreoBodyStart}..${oreoBodyEnd}\n`);

// Decode all top-level fields (no nested recursion)
decodeMessage(oreoBodyStart, oreoBodyEnd, "OREO (pet)", 0, 0);

// For comparison, also decode the human sim "Brylee Kendrick"
// Brylee's id is 0xcab161e00d9137d. Find her name "Brylee" in data.
console.log('\n──────────────────────────────────────────────');
const targetName = Buffer.from('Brylee', 'utf8');
let brylee = -1;
for (let i = 0; i + 6 <= data.length; i++) {
  let ok = true;
  for (let j = 0; j < 6; j++) if (data[i + j] !== targetName[j]) { ok = false; break; }
  if (ok) { brylee = i; break; }
}
if (brylee >= 0) {
  // Walk backward: 0x12 [len] "Brylee" → name in field 2. Then the outer tag should be at some earlier point.
  // Pattern: [outerTag][outerLen][0x08 [varint sim id]][0x12 [6] "Brylee"]
  // Find the 0x08 just before 0x12: scan backward for 0x08 followed by a varint that lands at brylee - 2
  for (let back = 1; back < 60; back++) {
    const candStart = brylee - 2 - back;
    if (data[candStart] === 0x08) {
      const [id, after] = readV(candStart + 1);
      if (after === brylee - 2 && id === 0xcab161e00d9137dn) {
        // Found body start at candStart. Find outer tag: 1 byte tag + varint length
        // Try each possible position for the outer tag
        for (let tagBack = 1; tagBack <= 5; tagBack++) {
          const tagPos = candStart - tagBack;
          if (tagPos < 0) continue;
          const [lv, le] = readV(tagPos + 1);
          if (le === candStart) {
            console.log(`Brylee outer tag at @${tagPos}: 0x${data[tagPos].toString(16)} (field ${data[tagPos] >> 3}, wt ${data[tagPos] & 7}), len=${lv}`);
            decodeMessage(candStart, candStart + Number(lv), "BRYLEE (human)", 0, 1);
            process.exit(0);
          }
        }
      }
    }
  }
}
