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

// Vlad's body starts at 883952. Scan from a bit past f10 looking for f30 (0xf2 0x01) AND f54 (0xb0 0x03)
// Also report when we'd hit isNextSimAnchor
const start = 884015 + 4; // after f10's varint (approx)
const end = Math.min(data.length, start + 50000);

function isNextSimAnchor(p) {
  if (p + 30 > data.length) return false;
  if (data[p] !== 0x09) return false;
  if (data[p + 9] !== 0x11) return false;
  if (data[p + 18] !== 0x18) return false;
  let q = p + 19;
  while (q < data.length && q < p + 30 && (data[q++] & 0x80) !== 0) {}
  if (q >= data.length || data[q] !== 0x21) return false;
  if (q + 9 >= data.length || data[q + 9] !== 0x2a) return false;
  return true;
}

let p = start;
let f30Found = -1, f54Found = -1, stopReason = '';
const falseAnchors = [];
while (p < end - 2) {
  if (p > start + 30 && isNextSimAnchor(p)) {
    stopReason = `isNextSimAnchor at @${p}`;
    falseAnchors.push(p);
    break;
  }
  if (data[p] === 0xf2 && data[p + 1] === 0x01) { f30Found = p; break; }
  if (data[p] === 0xb0 && data[p + 1] === 0x03) { f54Found = p; }
  p++;
}
console.log(`Scan from @${start}`);
console.log(`Stop reason: ${stopReason || 'reached f30'}`);
console.log(`f30 found at: ${f30Found}`);
console.log(`f54 found at: ${f54Found}`);

// If isNextSimAnchor fired, dump what's at the false anchor
if (falseAnchors.length > 0) {
  const fa = falseAnchors[0];
  console.log(`\nFalse anchor @${fa} — bytes around:`);
  const hex = Array.from(data.slice(fa - 4, fa + 40)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`  ${hex}`);
  // Read the "name" at the false anchor's 0x2a position
  let q = fa + 19;
  while (q < data.length && q < fa + 30 && (data[q++] & 0x80) !== 0) {}
  // q points just past varint, byte should be 0x21
  if (data[q] === 0x21) {
    const namePos = q + 9 + 1; // after 0x21+8+0x2a+len
    const lenByte = data[q + 9 + 1 - 1];
    if (data[q + 9] === 0x2a) {
      const len = data[q + 9 + 1];
      const name = Buffer.from(data.slice(q + 9 + 2, q + 9 + 2 + len)).toString('utf8');
      console.log(`  "Name" at false anchor: "${name}" (len=${len})`);
    }
  }
}
