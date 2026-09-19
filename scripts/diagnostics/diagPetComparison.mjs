/**
 * Locate Oreo, Harry, Cheyenne, Buddy and decode the first ~16 fields of each.
 * Compare f7 (suspected gender) and f8 (suspected species/lifestage).
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const PETS = [
  { name: 'Oreo',     species: 'dog',   stage: 'adult', sex: 'M', hh: 'Dog Daycare Owner' },
  { name: 'Harry',    species: 'cat',   stage: 'adult', sex: 'M', hh: 'Cafe Owner' },
  { name: 'Cheyenne', species: 'horse', stage: 'adult', sex: 'F', hh: 'Wealthy Outside' },
  { name: 'Buddy',    species: 'dog (GS)',   stage: 'puppy', sex: 'M', hh: 'Wallace' },
  { name: 'Sheba',    species: 'dog (GS)',   stage: 'adult', sex: 'F', hh: 'Wallace' },
  { name: 'Monka',    species: 'dog (GS)',   stage: 'puppy', sex: 'F', hh: 'Wallace' },
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

// For each pet name, find all candidates and decode the first ~16 fields
for (const pet of PETS) {
  const nm = Buffer.from(pet.name, 'utf8');
  const candidates = [];
  for (let i = 1; i + nm.length <= data.length; i++) {
    // Look for pattern [0x2a][len][name]
    let ok = true;
    for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
    if (!ok) continue;
    if (data[i - 1] !== nm.length) continue;
    if (data[i - 2] !== 0x2a) continue;
    candidates.push(i);
  }
  console.log(`\n══════════════════ ${pet.name} (${pet.species}, ${pet.stage}, ${pet.sex}) — ${candidates.length} candidates ══════════════════`);

  // For each candidate, walk backward to find the outer tag (largest length match)
  for (const nameOff of candidates) {
    // Walk back to find the [0x09][8 sim id] header
    let outerTag = -1, outerLen = 0n, bodyStart = -1, simId = 0n;
    for (let back = 4; back < 80; back++) {
      const candStart = nameOff - 2 - back;
      if (candStart < 0) break;
      if (data[candStart] !== 0x09) continue;
      // Try this as start of body
      // Find outer tag: try tagBack 1-6 and pick largest length
      let bestLen = 0n, bestTag = -1, bestStart = -1;
      for (let tagBack = 6; tagBack >= 1; tagBack--) {
        const tagPos = candStart - tagBack;
        if (tagPos < 0) continue;
        const [lv, le] = readV(tagPos + 1);
        if (le === candStart && lv > bestLen && lv < 1_000_000n) {
          bestLen = lv; bestTag = tagPos; bestStart = candStart;
        }
      }
      if (bestStart >= 0) {
        // Extract sim id at candStart+1
        let v = 0n;
        for (let k = 0; k < 8; k++) v |= BigInt(data[candStart + 1 + k]) << BigInt(k * 8);
        outerTag = bestTag; outerLen = bestLen; bodyStart = bestStart; simId = v;
        break;
      }
    }
    if (outerTag < 0) {
      console.log(`  name@${nameOff}: could not locate outer tag`);
      continue;
    }
    const bodyEnd = bodyStart + Number(outerLen);
    console.log(`  name@${nameOff}, outerTag@${outerTag}=0x${data[outerTag].toString(16)} (field ${data[outerTag] >> 3}, wt ${data[outerTag] & 7}), len=${outerLen}, simId=0x${simId.toString(16)}`);

    // Decode first 40 fields
    let p = bodyStart;
    let i = 0;
    while (p < bodyEnd && i < 40) {
      const tagOff = p;
      const t = data[p++]; if (t === 0) break;
      const wt = t & 7, fn = t >> 3;
      if (wt === 0) { const [v, n] = readV(p); console.log(`    @${tagOff} tag=0x${t.toString(16)} f${fn} varint=${v} (0x${v.toString(16)})`); p = n; }
      else if (wt === 1) { const v = readF(p); console.log(`    @${tagOff} tag=0x${t.toString(16)} f${fn} fixed64=0x${v.toString(16)}`); p += 8; }
      else if (wt === 2) {
        const [l, n] = readV(p);
        const e = n + Number(l);
        if (e > bodyEnd) { console.log(`    overrun`); break; }
        const sub = data.slice(n, e);
        const isStr = Number(l) > 0 && Number(l) < 200 && sub.every(b => b >= 0x20 && b < 0x7f);
        const hex = Buffer.from(sub).toString('hex').slice(0, 48);
        console.log(`    @${tagOff} tag=0x${t.toString(16)} f${fn} len=${l} ${isStr ? `text="${sub.toString()}"` : `hex=${hex}${Number(l) > 24 ? '…' : ''}`}`);
        p = e;
      } else if (wt === 5) {
        const v32 = data[p] | (data[p+1] << 8) | (data[p+2] << 16) | (data[p+3] << 24);
        console.log(`    @${tagOff} tag=0x${t.toString(16)} f${fn} fixed32=0x${(v32>>>0).toString(16).padStart(8, '0')}`);
        p += 4;
      } else if (wt === 3) {
        const closeTag = (fn << 3) | 4;
        const sgStart = p;
        let depth = 1;
        while (p < bodyEnd && depth > 0) {
          if (data[p] === closeTag) { depth--; p++; if (depth === 0) break; }
          else if ((data[p] & 7) === 3 && (data[p] >> 3) === fn) { depth++; p++; }
          else p++;
        }
        console.log(`    @${tagOff} tag=0x${t.toString(16)} f${fn} SGROUP→EGROUP (${p - sgStart} bytes)`);
      } else { console.log(`    @${tagOff} UNKNOWN wt=${wt}`); break; }
      i++;
    }
  }
}
