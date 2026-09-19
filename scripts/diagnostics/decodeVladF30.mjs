import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';
const buf = readFileSync(process.env.HOME + '/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const ic = view.getUint32(36, true), io = view.getUint32(64, true);
const fl = view.getUint32(io, true);
const tc = (fl & 1) !== 0, gc = (fl & 2) !== 0, ihc = (fl & 4) !== 0;
let hp = io + 4, ct = 0;
if (tc) { ct = view.getUint32(hp, true); hp += 4; }
if (gc) hp += 4; if (ihc) hp += 4;
const es = 32 - (tc?4:0) - (gc?4:0) - (ihc?4:0);
const entries = [];
let pos = hp;
for (let i = 0; i < ic; i++) {
  if (pos + es > buf.length) break;
  let off = pos;
  const t = tc ? ct : view.getUint32(off, true); off += tc ? 0 : 4;
  off += gc ? 0 : 4; off += ihc ? 0 : 4;
  const il = view.getUint32(off, true); off += 4;
  const o = view.getUint32(off, true); off += 4;
  const sc = view.getUint32(off, true) & 0x7fffffff; off += 4; off += 4;
  const cp = view.getUint16(off, true);
  pos += es;
  entries.push({ type: t, instLo: il, offset: o, sizeComp: sc, compType: cp });
}
const de = entries.find(e => e.type === 0x0d);
let data = buf.slice(de.offset, de.offset + de.sizeComp);
if (de.compType === 0xffff) { const p2 = Buffer.from(data); if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10; data = decompress(p2); }
function readV(b, p) { let r=0n,s=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<s; s+=7n; if((x&0x80)===0)break;} return [r,p]; }

// f30 tag at 884336 in Vlad's record
const f30TagOff = 884336;
const [f30Len, f30Start] = readV(data, f30TagOff + 2);
const f30End = f30Start + Number(f30Len);
console.log(`Vlad's f30 @${f30TagOff}: body @${f30Start}..${f30End} (${f30Len} bytes)`);

// Walk INSIDE f30 looking for f17 (0x8a 0x01)
let inner = f30Start;
let stepNum = 0;
while (inner < f30End - 1 && stepNum < 50) {
  stepNum++;
  // Check if f17 tag
  if (data[inner] === 0x8a && data[inner + 1] === 0x01) {
    console.log(`  STEP ${stepNum} @${inner}: FOUND f17 tag`);
    const [f17Len, f17Start] = readV(data, inner + 2);
    console.log(`    f17 length=${f17Len}, content @${f17Start}, first byte = 0x${data[f17Start].toString(16)}`);
    if (data[f17Start] === 0x08) {
      const [val] = readV(data, f17Start + 1);
      console.log(`    f17.f1 = ${val} (occult enum)`);
    }
    break;
  }
  // Parse next field
  const t = data[inner];
  if (t === 0) { console.log(`  STEP ${stepNum} @${inner}: TAG=0, STOP`); break; }
  let tag, afterTag;
  if ((t & 0x80) === 0) { tag = t; afterTag = inner + 1; }
  else {
    const [tv, np] = readV(data, inner); tag = Number(tv); afterTag = np;
  }
  const fn = tag >> 3, wt = tag & 7;
  let newInner;
  if (wt === 0) { const [, n] = readV(data, afterTag); newInner = n; }
  else if (wt === 1) newInner = afterTag + 8;
  else if (wt === 2) { const [l, n] = readV(data, afterTag); newInner = n + Number(l); }
  else if (wt === 5) newInner = afterTag + 4;
  else { console.log(`  STEP ${stepNum} @${inner}: unknown wt=${wt} (tag=0x${t.toString(16).padStart(2,'0')}), STOP`); break; }
  console.log(`  STEP ${stepNum} @${inner}: field f${fn} wt${wt}, advance to @${newInner}`);
  inner = newInner;
  if (inner >= f30End) { console.log(`  reached f30End`); break; }
}
