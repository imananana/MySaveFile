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

// "Vladislaus" name @ 883987. Walk back to find body start (0x09 anchor)
const nameAt = 883987;
console.log('Bytes around Vladislaus body anchor:');
// Likely body @ around 883950-883960
for (let back = 50; back > 25; back--) {
  const c = nameAt - 2 - back;
  if (data[c] === 0x09 && data[c + 9] === 0x11 && data[c + 18] === 0x18) {
    console.log(`  Body anchor at @${c}`);
    // Dump bytes from c to nameAt
    const bytes = Array.from(data.slice(c, nameAt + 12)).map(b => b.toString(16).padStart(2,'0'));
    console.log('  Hex:', bytes.slice(0, 80).join(' '));
    // Walk fields exactly as the parser does
    let pos = c + 9;  // skip 0x09 + 8 sim id
    console.log(`  After f1 sim id, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x11) { console.log('  FAIL: expected 0x11'); break; }
    pos += 9;
    console.log(`  After f2 lot id, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x18) { console.log('  FAIL: expected 0x18'); break; }
    pos++;
    const [ts, afterTs] = readV(data, pos);
    pos = afterTs;
    console.log(`  After f3 ts varint = ${ts}, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x21) { console.log('  FAIL: expected 0x21'); break; }
    pos += 9;
    console.log(`  After f4 hh id, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x2a) { console.log('  FAIL: expected 0x2a'); break; }
    pos++;
    const [firstLen, firstStart] = readV(data, pos);
    const firstName = Buffer.from(data.slice(firstStart, firstStart + Number(firstLen))).toString('utf8');
    console.log(`  First name: "${firstName}" (len ${firstLen})`);
    pos = firstStart + Number(firstLen);
    if (data[pos] !== 0x32) { console.log('  FAIL: expected 0x32 last-name'); break; }
    pos++;
    const [lastLen, lastStart] = readV(data, pos);
    const lastName = lastLen > 0n ? Buffer.from(data.slice(lastStart, lastStart + Number(lastLen))).toString('utf8') : '';
    console.log(`  Last name: "${lastName}" (len ${lastLen})`);
    pos = lastStart + Number(lastLen);
    console.log(`  After f6 last name, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x38) { console.log('  FAIL: expected 0x38 gender'); break; }
    pos++;
    const [g, ag] = readV(data, pos); pos = ag;
    console.log(`  Gender raw = ${g}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x40) { console.log('  FAIL: expected 0x40 lifestage'); break; }
    pos++;
    const [ls, als] = readV(data, pos); pos = als;
    console.log(`  Lifestage raw = ${ls}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x4d) { console.log('  FAIL: expected 0x4d f9'); break; }
    pos += 5;
    console.log(`  After f9 fixed32, pos=${pos}, byte=0x${data[pos].toString(16)}`);
    if (data[pos] !== 0x50) { console.log('  FAIL: expected 0x50 f10'); break; }
    pos++;
    const [f10, af10] = readV(data, pos);
    console.log(`  f10 = ${f10} (${f10 === 0n ? 'PET' : 'HUMAN'})`);
    // Validate name regex
    const nameOk = /^[\p{L}][\p{L}\p{M}'\-. ]{0,28}$/u.test(firstName);
    const lastOk = lastName.length === 0 || /^[\p{L}\p{M}'\-. ]{0,28}$/u.test(lastName);
    console.log(`  Name validation: first="${firstName}" ok=${nameOk}, last="${lastName}" ok=${lastOk}`);
    break;
  }
}
