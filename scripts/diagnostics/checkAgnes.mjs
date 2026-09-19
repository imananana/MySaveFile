import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';
const buf = readFileSync(process.env.HOME + '/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const tc = (flags & 1) !== 0, gc = (flags & 2) !== 0, ic = (flags & 4) !== 0;
let hp = indexOffset + 4, ct = 0;
if (tc) { ct = view.getUint32(hp, true); hp += 4; }
if (gc) hp += 4;
if (ic) hp += 4;
const es = 32 - (tc?4:0) - (gc?4:0) - (ic?4:0);
const entries = [];
let pos = hp;
for (let i = 0; i < indexCount; i++) {
  if (pos + es > buf.length) break;
  let off = pos;
  const t = tc ? ct : view.getUint32(off, true); off += tc ? 0 : 4;
  off += gc ? 0 : 4;
  off += ic ? 0 : 4;
  const il = view.getUint32(off, true); off += 4;
  const o = view.getUint32(off, true); off += 4;
  const sc = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const cp = view.getUint16(off, true);
  pos += es;
  entries.push({ type: t, instLo: il, offset: o, sizeComp: sc, compType: cp });
}
const de = entries.find(e => e.type === 0x0d);
let data = buf.slice(de.offset, de.offset + de.sizeComp);
if (de.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}
function readV(b, p) { let r=0n,s=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<s; s+=7n; if((x&0x80)===0)break;} return [r,p]; }

const TARGETS = ['Agnes', 'Don', 'Waylon', 'Felix', 'Consort', 'Esther', 'Kyle', 'Eliza', 'Bob', 'Bella', 'Zuleika', 'Kai', 'Alice', 'Edith', 'Lady'];
for (const targetName of TARGETS) {
const nm = Buffer.from(targetName, 'utf8');
const hits = [];
for (let i = 1; i + nm.length <= data.length; i++) {
  if (data[i - 1] !== nm.length) continue;
  if (data[i - 2] !== 0x2a) continue;
  let ok = true;
  for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
  if (ok) hits.push(i);
}

for (const h of hits) {
  // Walk back to body start
  for (let back = 4; back < 80; back++) {
    const c = h - 2 - back;
    if (c < 0) break;
    if (data[c] !== 0x09) continue;
    if (data[c + 9] !== 0x11) continue;
    if (data[c + 18] !== 0x18) continue;
    const [, at] = readV(data, c + 19);
    if (data[at] !== 0x21) continue;
    if (data[at + 9] !== 0x2a) continue;
    // Found body start at c. Read last name
    const [llen, ls] = readV(data, at + 9 + 1 + Number(readV(data, at + 9 + 1)[0]));
    // Search for f54 tag (0xb0 0x03) bounded by next sim anchor or 50K
    let p = c;
    let f54val = null;
    while (p < data.length - 2 && p < c + 50000) {
      if (p > c + 30 && data[p] === 0x09 && data[p + 9] === 0x11 && data[p + 18] === 0x18) {
        // possibly next sim anchor
        let q = p + 19;
        while (q < data.length && (data[q++] & 0x80) !== 0) {}
        if (data[q] === 0x21 && data[q + 9] === 0x2a) break;
      }
      if (data[p] === 0xb0 && data[p + 1] === 0x03) {
        const [v] = readV(data, p + 2);
        f54val = v;
        break;
      }
      p++;
    }
    // Read last name for context
    const nameEnd = h + nm.length;
    const lastTagOff = nameEnd;
    if (data[lastTagOff] === 0x32) {
      const [lnLen, lnStart] = readV(data, lastTagOff + 1);
      const lastName = Buffer.from(data.slice(lnStart, lnStart + Number(lnLen))).toString('utf8');
      console.log(`${targetName.padEnd(8)} ${lastName.padEnd(14)} @${h}: f54 = ${f54val}`);
    } else {
      console.log(`${targetName.padEnd(8)} (no last)     @${h}: f54 = ${f54val}`);
    }
    break;
  }
}
}
