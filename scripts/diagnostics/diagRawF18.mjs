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

// Find a known sim body and dump 60 bytes starting at the f18 area.
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
    if (last === '') { if (Number(llen) !== 0) continue; }
    else {
      const lb = Buffer.from(last, 'utf8');
      if (Number(llen) < lb.length) continue;
      let m2 = true;
      for (let j = 0; j < lb.length; j++) if (data[lstart + j] !== lb[j]) { m2 = false; break; }
      if (!m2) continue;
    }
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

// Find each sim's 0x92 byte position, then dump 80 bytes starting there.
const SAMPLES = [
  { name: 'Brylee',   kind: 'H', first: 'Brylee',   last: 'Kendrick' },
  { name: 'Justin',   kind: 'H', first: 'Justin',   last: 'Baron' },
  { name: 'Ava',      kind: 'H', first: 'Ava',      last: 'Thomas' },
  { name: 'Sheba',    kind: 'P', first: 'Sheba',    last: '' },
  { name: 'Harry',    kind: 'P', first: 'Harry',    last: 'Waddell' },
  { name: 'Cheyenne', kind: 'P', first: 'Cheyenne', last: '' },
];

for (const s of SAMPLES) {
  const body = findBody(s.first, s.last);
  if (body === null) { console.log(`${s.name}: not found`); continue; }
  // Walk fields, find 0x92 byte
  let p = body;
  let f18Off = -1;
  while (p < body + 500) {
    if (data[p] === 0x92 && data[p + 1] === 0x01) { f18Off = p; break; }
    const t = data[p++]; if (t === 0) break;
    const wt = t & 7;
    if (wt === 0) { const [, n] = readV(data, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readV(data, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else break;
  }
  if (f18Off < 0) { console.log(`${s.name}: f18 not found`); continue; }
  // Dump from f18 - 4 to f18 + 60
  const start = f18Off - 4;
  const end = f18Off + 60;
  const hex = Array.from(data.slice(start, end)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`${s.kind} ${s.name.padEnd(10)} f18@${f18Off}: ${hex}`);
}
