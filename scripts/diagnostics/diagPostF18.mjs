/**
 * For each known sim, locate the f18 field (tag bytes 0x92 0x01 + len + content)
 * and dump the byte immediately after it. Hypothesis: humans have 0x0d here,
 * pets have anything else.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

const SAMPLES = [
  { name: 'Oreo',     kind: 'pet',   first: 'Oreo',     last: '' },
  { name: 'Cheyenne', kind: 'pet',   first: 'Cheyenne', last: '' },
  { name: 'Sheba',    kind: 'pet',   first: 'Sheba',    last: '' },
  { name: 'Buddy(W)', kind: 'pet',   first: 'Buddy',    last: '' },
  { name: 'Monka',    kind: 'pet',   first: 'Monka',    last: '' },
  { name: 'Harry',    kind: 'pet',   first: 'Harry',    last: 'Waddell' },
  { name: 'Brylee',   kind: 'human', first: 'Brylee',   last: 'Kendrick' },
  { name: 'Maggie',   kind: 'human', first: 'Maggie',   last: 'Harrington' },
  { name: 'Sienna',   kind: 'human', first: 'Sienna',   last: 'Davis' },
  { name: 'Molly',    kind: 'human', first: 'Molly',    last: 'Prescott' },
  { name: 'Ava',      kind: 'human', first: 'Ava',      last: 'Thomas' },
  { name: 'Luna',     kind: 'human', first: 'Luna',     last: 'Warner' },
  { name: 'Justin',   kind: 'human', first: 'Justin',   last: 'Baron' },
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

// Walk fields starting from sim record body. Return position of byte right
// after f18's content (i.e. the next tag), and the byte itself.
function postF18(bodyStart) {
  let p = bodyStart;
  while (p < bodyStart + 500 && p < data.length) {
    const t = data[p++];
    if (t === 0) return null;
    const wt = t & 7;
    // Check 2-byte tag for f18 (0x92 0x01)
    if (t === 0x92 && data[p] === 0x01) {
      p++; // consume second tag byte
      const [, contentStart] = readV(data, p);
      const [len, ] = readV(data, p);
      const contentEnd = contentStart + Number(len);
      return { pos: contentEnd, byte: data[contentEnd], hex: data[contentEnd].toString(16).padStart(2,'0') };
    }
    if (wt === 0) { const [, n] = readV(data, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readV(data, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

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
    if (last === '') { if (Number(llen) !== 0) continue; }
    else {
      const lb = Buffer.from(last, 'utf8');
      if (Number(llen) < lb.length) continue;
      let m2 = true;
      for (let j = 0; j < lb.length; j++) if (data[lstart + j] !== lb[j]) { m2 = false; break; }
      if (!m2) continue;
    }
    // walk backward to find 0x09 + 8 + 0x11 + 8 + 0x18 + ts + 0x21 + 8 + 0x2a + first...
    for (let back = 4; back < 80; back++) {
      const c = i - 2 - back;
      if (c < 0) break;
      if (data[c] !== 0x09) continue;
      if (data[c + 9] !== 0x11) continue;
      if (data[c + 18] !== 0x18) continue;
      const [, afterTs] = readV(data, c + 19);
      if (data[afterTs] !== 0x21) continue;
      if (data[afterTs + 9] !== 0x2a) continue;
      return c;
    }
  }
  return null;
}

for (const s of SAMPLES) {
  const b = findBody(s.first, s.last);
  if (b === null) { console.log(`${s.kind === 'pet' ? 'P' : 'H'} ${s.name.padEnd(10)}: NOT FOUND`); continue; }
  const r = postF18(b);
  if (!r) { console.log(`${s.kind === 'pet' ? 'P' : 'H'} ${s.name.padEnd(10)}: no f18 found`); continue; }
  // Also peek at next 4 bytes for context
  const next4 = Array.from(data.slice(r.pos, r.pos + 4)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`${s.kind === 'pet' ? 'P' : 'H'} ${s.name.padEnd(10)}: byte after f18 = 0x${r.hex}  (next 4: ${next4})`);
}
