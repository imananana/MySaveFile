import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;
const SAMPLES = [
  { kind: 'ghost?', first: 'Kyle',   last: 'Kyleson' },
  { kind: 'ghost!', first: 'Esther', last: 'Gomes' },
  { kind: 'human',  first: 'Eliza',  last: 'Pancakes' },
  { kind: 'ghost!', first: 'Ignacio', last: 'Robles' },
  { kind: 'ghost!', first: 'Vanesha', last: 'Cahyaputri' },
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

function findBody(first, last) {
  const nm = Buffer.from(first, 'utf8');
  for (let i = 1; i + nm.length <= data.length; i++) {
    if (data[i - 1] !== nm.length) continue;
    if (data[i - 2] !== 0x2a) continue;
    let ok = true;
    for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
    if (!ok) continue;
    let after = i + nm.length;
    if (data[after] !== 0x32) continue;
    const [llen, lstart] = readV(data, after + 1);
    const lb = Buffer.from(last, 'utf8');
    if (Number(llen) < lb.length) continue;
    let m2 = true;
    for (let j = 0; j < lb.length; j++) if (data[lstart + j] !== lb[j]) { m2 = false; break; }
    if (!m2) continue;
    for (let back = 4; back < 100; back++) {
      const c = i - 2 - back;
      if (c < 0) break;
      if (data[c] !== 0x09) continue;
      if (data[c + 9] !== 0x11) continue;
      if (data[c + 18] !== 0x18) continue;
      const [, afterTs] = readV(data, c + 19);
      if (data[afterTs] !== 0x21) continue;
      if (data[afterTs + 9] !== 0x2a) continue;
      let bestStart = -1, bestLen = 0n;
      for (let tagBack = 6; tagBack >= 1; tagBack--) {
        const tagPos = c - tagBack;
        if (tagPos < 0) continue;
        const [lv, le] = readV(data, tagPos + 1);
        if (le === c && lv > 1000n && lv < 1_000_000n && lv > bestLen) {
          bestLen = lv;
          bestStart = c;
        }
      }
      if (bestStart >= 0) return { bodyStart: bestStart, bodyEnd: bestStart + Number(bestLen) };
    }
  }
  return null;
}

function findField(start, end, targetFn, targetWt) {
  const targetTag = (targetFn << 3) | targetWt;
  let p = start;
  while (p < end) {
    let tag;
    const b0 = data[p];
    if (b0 === 0) return null;
    if ((b0 & 0x80) === 0) { tag = b0; p++; }
    else { const [tv, np] = readV(data, p); tag = Number(tv); p = np; }
    if (tag === targetTag) return p;
    const fn = tag >> 3;
    const wt = tag & 7;
    if (wt === 0) { const [, n] = readV(data, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readV(data, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else if (wt === 3) {
      const closeTag = (fn << 3) | 4;
      while (p < end && data[p] !== closeTag) p++;
      p++;
    } else return null;
  }
  return null;
}

for (const s of SAMPLES) {
  const r = findBody(s.first, s.last);
  if (!r) { console.log(`SKIP: ${s.first} ${s.last}`); continue; }
  const f30Pos = findField(r.bodyStart, r.bodyEnd, 30, 2);
  if (f30Pos === null) { console.log(`${s.first}: no f30`); continue; }
  const [f30Len, f30Start] = readV(data, f30Pos);
  const f30End = f30Start + Number(f30Len);

  const f32Pos = findField(f30Start, f30End, 32, 2);
  if (f32Pos === null) {
    console.log(`${s.kind.padEnd(8)} ${s.first.padEnd(10)} ${s.last.padEnd(12)} f30=${f30Len}b  f32=absent`);
    continue;
  }
  const [f32Len, f32Start] = readV(data, f32Pos);
  const f32End = f32Start + Number(f32Len);
  const hex = Array.from(data.slice(f32Start, Math.min(f32End, f32Start + 40)))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`${s.kind.padEnd(8)} ${s.first.padEnd(10)} ${s.last.padEnd(12)} f30=${f30Len}b  f32=${f32Len}b  content: ${hex}`);
}
