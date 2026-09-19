import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';
const buf = readFileSync(process.env.HOME + '/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const ic = view.getUint32(36, true), io = view.getUint32(64, true);
const fl = view.getUint32(io, true);
const tc = (fl & 1) !== 0, gc = (fl & 2) !== 0, ihc = (fl & 4) !== 0;
let hp = io + 4, ct = 0;
if (tc) { ct = view.getUint32(hp, true); hp += 4; }
if (gc) hp += 4;
if (ihc) hp += 4;
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

const nm = Buffer.from('Vladislaus', 'utf8');
const hits = [];
for (let i = 1; i + nm.length <= data.length; i++) {
  if (data[i - 1] !== nm.length) continue;
  if (data[i - 2] !== 0x2a) continue;
  let ok = true;
  for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
  if (ok) hits.push(i);
}
console.log(`'Vladislaus' name occurrences (preceded by 0x2a + len=10): ${hits.length} at`, hits);

// Also look without strict 0x2a prefix
const strHits = [];
for (let i = 0; i + nm.length <= data.length; i++) {
  let ok = true;
  for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
  if (ok) strHits.push(i);
}
console.log(`Total 'Vladislaus' string occurrences: ${strHits.length}`);
for (const h of strHits.slice(0, 5)) {
  const before = Array.from(data.slice(h - 4, h)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`  @${h}: bytes before = ${before}`);
}
