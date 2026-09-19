/**
 * Find Mayor Whiskers (known pet) and Baby Ariel + Kylo Ren (known humans) in
 * the French save. Decode their full first-30 fields and look for the species
 * discriminator that distinguishes pet from human when both have no last name.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000002.save`;

const SAMPLES = [
  { name: 'MayorWhiskers',  kind: 'pet (cat)', first: 'Mayor Whiskers' },
  { name: 'BabyAriel',      kind: 'human',     first: 'Baby Ariel' },
  { name: 'KyloRen',        kind: 'human',     first: 'Kylo Ren' },
  { name: 'Rey',            kind: 'human',     first: 'Rey' },
  { name: 'ViMoradi',       kind: 'human',     first: 'Vi Moradi' },
  { name: 'HondoOhnaka',    kind: 'human',     first: 'Hondo Ohnaka' },
  { name: 'LtAgnon',        kind: 'human',     first: 'Lt. Agnon' },
  { name: 'Greg',           kind: 'human',     first: 'Greg' },
  { name: 'Doc',            kind: 'pet',       first: 'Doc' },
  { name: 'Cleo',           kind: 'pet',       first: 'Cleo' },
  { name: 'Blue',           kind: 'pet',       first: 'Blue' },
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

function findBody(first) {
  const nm = Buffer.from(first, 'utf8');
  // Find anchored body via pattern: ...0x09[8] 0x11[8] 0x18[varint] 0x21[8] 0x2a[len][name]
  for (let i = 1; i + nm.length <= data.length; i++) {
    if (data[i - 1] !== nm.length) continue;
    if (data[i - 2] !== 0x2a) continue;
    let ok = true;
    for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
    if (!ok) continue;
    // Walk back to find anchor
    for (let back = 4; back < 100; back++) {
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

// Dump key fields F1-F18 + figure out f10 value + first 4 bytes of f18 content
function fingerprint(bodyStart) {
  let p = bodyStart;
  const out = {};
  while (p < bodyStart + 500) {
    if (data[p] === 0x92 && data[p + 1] === 0x01) {
      // f18 found
      out.f18Off = p;
      p += 2;
      const [len, contentStart] = readV(data, p);
      out.f18Len = Number(len);
      // First 8 bytes of f18 content
      out.f18Head = Array.from(data.slice(contentStart, contentStart + 8))
        .map(b => b.toString(16).padStart(2, '0')).join(' ');
      return out;
    }
    const t = data[p++];
    if (t === 0) return out;
    const wt = t & 7;
    const fn = t >> 3;
    if (wt === 0) {
      const [v, n] = readV(data, p);
      if (fn === 7) out.f7 = v;       // gender
      if (fn === 8) out.f8 = v;       // lifestage
      if (fn === 10) out.f10 = v;
      if (fn === 11) out.f11 = v;
      p = n;
    } else if (wt === 1) p += 8;
    else if (wt === 2) {
      const [l, n] = readV(data, p);
      if (fn === 5) out.first = Buffer.from(data.slice(n, n + Number(l))).toString('utf8');
      if (fn === 6) out.last = Buffer.from(data.slice(n, n + Number(l))).toString('utf8');
      if (fn === 12) out.sliders = Buffer.from(data.slice(n, n + Number(l))).toString('utf8');
      p = n + Number(l);
    } else if (wt === 5) {
      if (fn === 9) {
        const v32 = data[p] | (data[p+1] << 8) | (data[p+2] << 16) | (data[p+3] << 24);
        out.f9 = (v32 >>> 0).toString(16).padStart(8, '0');
      }
      p += 4;
    } else if (wt === 3) {
      const closeTag = (fn << 3) | 4;
      while (p < bodyStart + 500 && data[p] !== closeTag) p++;
      p++;
    } else break;
  }
  return out;
}

console.log('kind        name              f7    f8   f9         f10       f11        f18Len  f18Head             last        sliders[0..20]');
console.log('─'.repeat(150));
for (const s of SAMPLES) {
  const b = findBody(s.first);
  if (b === null) { console.log(`${s.kind.padEnd(11)} ${s.name.padEnd(17)} NOT FOUND`); continue; }
  const fp = fingerprint(b);
  const f7  = (fp.f7 ?? '?').toString();
  const f8  = (fp.f8 ?? '?').toString();
  const f9  = fp.f9 ?? '?';
  const f10 = (fp.f10 ?? '?').toString();
  const f11 = (fp.f11 ?? '?').toString(16);
  const f18Len = (fp.f18Len ?? '?').toString();
  const f18Head = fp.f18Head ?? '?';
  const last = fp.last ?? '?';
  const sliders = (fp.sliders ?? '').slice(0, 18);
  console.log(`${s.kind.padEnd(11)} ${s.name.padEnd(17)} ${f7.padEnd(5)} ${f8.padEnd(4)} ${f9.padEnd(10)} ${f10.padEnd(9)} ${f11.padEnd(10)} ${f18Len.padEnd(7)} ${f18Head.padEnd(20)} ${last.padEnd(10)} ${sliders}`);
}
