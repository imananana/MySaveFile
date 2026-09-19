/**
 * Verify the f30.f17.f1 discriminator:
 * 1. A non-occult human should have NO f30 OR f30 with no f17 OR f17.f1 = 0
 * 2. Vladislaus Straud (aged vampire from base save) should have f30.f17.f1 = 4
 *    (cross-check: aged sims preserve the same occult marker)
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const VERIFY_SAMPLES = [
  // From Slot_02220000, normal humans (we'll need to switch save for this test)
  // For now, use Slot_1031202f known sims:
  { kind: 'aged-vampire',     first: 'Vladislaus', last: 'Straud' }, // original Vladislaus
  { kind: 'aged-mermaid',     first: 'Nalani',     last: 'Mahi' },
  { kind: 'aged-fairy',       first: 'Titania',    last: 'Summerdream' },
  { kind: 'aged-ghost',       first: 'Esther',     last: 'Gomes' },
  // And the fresh CAS sims for direct comparison
  { kind: 'fresh-vampire',    first: 'Andretha',   last: 'NewVamp' },
  { kind: 'fresh-mermaid',    first: 'Felicia',    last: 'NewMerm' },
  { kind: 'fresh-fairy',      first: 'Darien',     last: 'NewFae' },
  { kind: 'fresh-ghost',      first: 'Casper',     last: 'NewGhost' },
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

function getF30F17F1(bodyStart, bodyEnd) {
  const f30Pos = findField(bodyStart, bodyEnd, 30, 2);
  if (f30Pos === null) return { f30: 'absent' };
  const [f30Len, f30Start] = readV(data, f30Pos);
  const f30End = f30Start + Number(f30Len);

  const f17Pos = findField(f30Start, f30End, 17, 2);
  if (f17Pos === null) return { f30: `present(${f30Len}b)`, f17: 'absent' };
  const [f17Len, f17Start] = readV(data, f17Pos);
  const f17End = f17Start + Number(f17Len);

  const f1Pos = findField(f17Start, f17End, 1, 0);
  if (f1Pos === null) return { f30: `present(${f30Len}b)`, f17: `present(${f17Len}b)`, f1: 'absent' };
  const [f1Val] = readV(data, f1Pos);
  return { f30: `present(${f30Len}b)`, f17: `present(${f17Len}b)`, f1: f1Val.toString() };
}

console.log('Sample              f30                  f17                  f30.f17.f1');
console.log('─'.repeat(90));
for (const s of VERIFY_SAMPLES) {
  const r = findBody(s.first, s.last);
  if (!r) { console.log(`${s.kind.padEnd(20)} NOT FOUND`); continue; }
  const result = getF30F17F1(r.bodyStart, r.bodyEnd);
  console.log(`${s.kind.padEnd(20)} ${(result.f30 ?? '').padEnd(20)} ${(result.f17 ?? '').padEnd(20)} ${result.f1 ?? '-'}`);
}

// Now try to find an obvious non-occult human in this save
console.log('\n=== Quick check on a few common-name humans for f30 presence ===');
const COMMON_HUMAN_NAMES = [
  // common surnames likely to be non-occult in the imanistan base save
  { first: 'Eliza',   last: 'Pancakes' },
  { first: 'Bob',     last: 'Pancakes' },
  { first: 'Bella',   last: 'Goth' },
  { first: 'Cassandra', last: 'Goth' },
];
for (const s of COMMON_HUMAN_NAMES) {
  const r = findBody(s.first, s.last);
  if (!r) { console.log(`  ${s.first} ${s.last}: not found`); continue; }
  const result = getF30F17F1(r.bodyStart, r.bodyEnd);
  console.log(`  ${s.first.padEnd(10)} ${s.last.padEnd(12)} ${(result.f30 ?? '').padEnd(20)} ${(result.f17 ?? '').padEnd(20)} ${result.f1 ?? '-'}`);
}
