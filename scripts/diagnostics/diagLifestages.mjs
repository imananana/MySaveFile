/**
 * For each sample sim (one per known lifestage), find the full record
 * (outer tag 0x32, body > 1000 bytes) and decode the first 20 fields.
 * Look for the varint/fixed32 that varies cleanly with lifestage.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const SAMPLES = [
  { first: 'Maggie',   last: 'Harrington',   stage: 'elder' },
  { first: 'Brylee',   last: 'Kendrick',     stage: 'adult-or-ya' }, // already known: f8=16
  { first: 'Mei',      last: 'von',          stage: 'adult', surnameHint: 'von Richthofen' },
  { first: 'Sienna',   last: 'Davis',        stage: 'youngAdult' },
  { first: 'Molly',    last: 'Prescott',     stage: 'teen' },
  { first: 'Ava',      last: 'Thomas',       stage: 'child' },
  { first: 'Luna',     last: 'Warner',       stage: 'toddler' },
  { first: 'Justin',   last: 'Baron',        stage: 'infant' },
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

function readV(b, p) { let r=0n,sh=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readF(b, p) { let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(b[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(b[p+4+i])<<BigInt(i*8); return lo|(hi<<32n); }

function findFullRecord(first, last) {
  // Pattern: [0x2a][len][first] [0x32][len][last]
  const firstBytes = Buffer.from(first, 'utf8');
  for (let i = 1; i + firstBytes.length <= data.length; i++) {
    if (data[i - 1] !== firstBytes.length) continue;
    if (data[i - 2] !== 0x2a) continue;
    let ok = true;
    for (let j = 0; j < firstBytes.length; j++) if (data[i + j] !== firstBytes[j]) { ok = false; break; }
    if (!ok) continue;
    // Check the bytes immediately after "first" match the lastname tag+length+content
    let after = i + firstBytes.length;
    if (data[after] !== 0x32) continue;
    const [llen, lstart] = readV(data, after + 1);
    if (Number(llen) === 0) {
      // empty last name — could still be a match if last is empty too
      if (last !== '') continue;
    } else {
      const lastBytes = Buffer.from(last, 'utf8');
      if (Number(llen) < lastBytes.length) continue;
      let match2 = true;
      for (let j = 0; j < lastBytes.length; j++) if (data[lstart + j] !== lastBytes[j]) { match2 = false; break; }
      if (!match2) continue;
    }
    // Found a name pair. Walk backward to find the outer 0x32 tag + multi-byte length.
    // Backward: find a 0x09 sim id tag, then check tag positions for outer wrapper.
    for (let back = 4; back < 100; back++) {
      const candStart = i - 2 - back;
      if (candStart < 0) break;
      if (data[candStart] !== 0x09) continue;
      // Try outer-tag positions, find the LARGEST valid length that's > 1000
      let bestLen = 0n, bestTagPos = -1;
      for (let tagBack = 6; tagBack >= 1; tagBack--) {
        const tagPos = candStart - tagBack;
        if (tagPos < 0) continue;
        const tag = data[tagPos];
        if ((tag & 7) !== 2) continue; // must be wireType 2
        const [lv, le] = readV(data, tagPos + 1);
        if (le === candStart && lv > 1000n && lv < 200_000n && lv > bestLen) {
          bestLen = lv; bestTagPos = tagPos;
        }
      }
      if (bestTagPos >= 0) {
        // Extract sim ID
        let simId = 0n;
        for (let k = 0; k < 8; k++) simId |= BigInt(data[candStart + 1 + k]) << BigInt(k * 8);
        return { tagPos: bestTagPos, tag: data[bestTagPos], len: bestLen, bodyStart: candStart, bodyEnd: candStart + Number(bestLen), simId };
      }
    }
  }
  return null;
}

function decodeFields(r, max = 22) {
  let p = r.bodyStart, i = 0;
  const out = [];
  while (p < r.bodyEnd && i < max) {
    const tagOff = p;
    const t = data[p++]; if (t === 0) break;
    const wt = t & 7, fn = t >> 3;
    let entry = { off: tagOff, tag: t, fn, wt };
    if (wt === 0) { const [v, n] = readV(data, p); entry.val = v; p = n; }
    else if (wt === 1) { entry.val = readF(data, p); p += 8; }
    else if (wt === 2) {
      const [l, n] = readV(data, p); const e = n + Number(l);
      if (e > r.bodyEnd) { entry.error = 'overrun'; out.push(entry); break; }
      const sub = data.slice(n, e);
      const isStr = Number(l) > 0 && Number(l) < 200 && sub.every(b => b >= 0x20 && b < 0x7f);
      entry.len = Number(l);
      if (isStr) entry.text = sub.toString();
      else entry.hex = Buffer.from(sub).toString('hex').slice(0, 48);
      p = e;
    } else if (wt === 5) {
      entry.val = data[p] | (data[p+1] << 8) | (data[p+2] << 16) | (data[p+3] << 24);
      p += 4;
    } else if (wt === 3) {
      const closeTag = (fn << 3) | 4;
      let depth = 1;
      while (p < r.bodyEnd && depth > 0) {
        if (data[p] === closeTag) { depth--; p++; if (depth === 0) break; }
        else if ((data[p] & 7) === 3 && (data[p] >> 3) === fn) { depth++; p++; }
        else p++;
      }
      entry.sgroup = true;
    } else { entry.error = `unknown-wt-${wt}`; out.push(entry); break; }
    out.push(entry);
    i++;
  }
  return out;
}

for (const s of SAMPLES) {
  const r = findFullRecord(s.first, s.last);
  console.log(`\n══════════ ${s.first} ${s.last} (${s.stage}) ══════════`);
  if (!r) { console.log(`  NOT FOUND`); continue; }
  console.log(`  outerTag@${r.tagPos}=0x${r.tag.toString(16)} (f${r.tag >> 3} wt2), len=${r.len}, simId=0x${r.simId.toString(16)}`);
  const fields = decodeFields(r, 20);
  for (const f of fields) {
    if (f.error) { console.log(`    @${f.off} ERROR ${f.error}`); continue; }
    if (f.sgroup) { console.log(`    @${f.off} tag=0x${f.tag.toString(16)} f${f.fn} SGROUP`); continue; }
    let v = '';
    if (f.wt === 0) v = `varint=${f.val} (0x${f.val.toString(16)})`;
    else if (f.wt === 1) v = `fixed64=0x${f.val.toString(16)}`;
    else if (f.wt === 2) v = `len=${f.len}${f.text !== undefined ? ` text="${f.text}"` : ` hex=${f.hex}`}`;
    else if (f.wt === 5) v = `fixed32=0x${(f.val>>>0).toString(16).padStart(8, '0')}`;
    console.log(`    @${f.off} tag=0x${f.tag.toString(16)} f${f.fn} ${v}`);
  }
}

console.log('\n══════════ Summary: f7 (gender) + f8 across all samples ══════════');
for (const s of SAMPLES) {
  const r = findFullRecord(s.first, s.last);
  if (!r) { console.log(`  ${s.first} ${s.last}: NOT FOUND`); continue; }
  const fields = decodeFields(r, 20);
  const f7 = fields.find(f => f.tag === 0x38)?.val;
  const f8 = fields.find(f => f.tag === 0x40)?.val;
  const f9 = fields.find(f => f.tag === 0x4d)?.val;
  const f10 = fields.find(f => f.tag === 0x50)?.val;
  console.log(`  ${s.first} ${s.last} (${s.stage}): f7=${f7} f8=${f8} f9=${f9?.toString(16)?.padStart(8,'0')} f10=${f10}`);
}
