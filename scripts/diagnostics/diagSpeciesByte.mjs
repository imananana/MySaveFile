/**
 * Side-by-side raw byte dump of confirmed humans vs pets, to find a clean
 * species discriminator that doesn't depend on lastName/lifestage/stub-presence.
 *
 * Method: find each known sim's 0x32 record start, then dump bytes 0..160 in
 * hex. Look for byte positions where pets consistently differ from humans.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

// Known samples
const SAMPLES = [
  // PETS
  { name: 'Oreo',     kind: 'pet',   first: 'Oreo',     last: '' },
  { name: 'Cheyenne', kind: 'pet',   first: 'Cheyenne', last: '' },
  { name: 'Sheba',    kind: 'pet',   first: 'Sheba',    last: '' },
  { name: 'Buddy(W)', kind: 'pet',   first: 'Buddy',    last: '',  hh: 'Wallace' }, // empty last
  { name: 'Monka',    kind: 'pet',   first: 'Monka',    last: '' },
  { name: 'Harry',    kind: 'pet',   first: 'Harry',    last: 'Waddell' }, // edge case: has last name
  // HUMANS — varied lifestages
  { name: 'Brylee',   kind: 'human', first: 'Brylee',   last: 'Kendrick' },  // YA
  { name: 'Maggie',   kind: 'human', first: 'Maggie',   last: 'Harrington'}, // elder
  { name: 'Sienna',   kind: 'human', first: 'Sienna',   last: 'Davis' },     // YA
  { name: 'Molly',    kind: 'human', first: 'Molly',    last: 'Prescott' },  // teen
  { name: 'Ava',      kind: 'human', first: 'Ava',      last: 'Thomas' },    // child
  { name: 'Luna',     kind: 'human', first: 'Luna',     last: 'Warner' },    // toddler
  { name: 'Justin',   kind: 'human', first: 'Justin',   last: 'Baron' },     // infant
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

// For each sample, find the start of its 0x32 record body
function findRecord(first, last, kind, hhFilter) {
  const nm = Buffer.from(first, 'utf8');
  for (let i = 1; i + nm.length <= data.length; i++) {
    // Match [0x2a][len=first.length][first_bytes]
    if (data[i - 1] !== nm.length) continue;
    if (data[i - 2] !== 0x2a) continue;
    let ok = true;
    for (let j = 0; j < nm.length; j++) if (data[i + j] !== nm[j]) { ok = false; break; }
    if (!ok) continue;
    // Check following last name match
    let after = i + nm.length;
    if (data[after] !== 0x32) continue;
    const [llen, lstart] = readV(data, after + 1);
    if (last === '') {
      if (Number(llen) !== 0) continue;
    } else {
      const lb = Buffer.from(last, 'utf8');
      if (Number(llen) < lb.length) continue;
      let m2 = true;
      for (let j = 0; j < lb.length; j++) if (data[lstart + j] !== lb[j]) { m2 = false; break; }
      if (!m2) continue;
    }
    // Walk back to find body start (= 0x09 + 8-byte sim id)
    // The body starts well before, with: 0x09 [8 simId] 0x11 [8 lotId] 0x18 [varint] 0x21 [8 hhId] 0x2a [4]first
    // Walk backward to find 0x21 (need to find a 0x21 followed by 8 bytes then 0x2a)
    for (let back = 4; back < 80; back++) {
      const candStart = i - 2 - back;
      if (candStart < 0) break;
      if (data[candStart] !== 0x09) continue;
      // confirm structural pattern
      const p_simId = candStart + 1;
      const p_lotTag = p_simId + 8;
      if (data[p_lotTag] !== 0x11) continue;
      const p_tsTag = p_lotTag + 9;
      if (data[p_tsTag] !== 0x18) continue;
      // skip ts varint
      const [, afterTs] = readV(data, p_tsTag + 1);
      if (data[afterTs] !== 0x21) continue;
      // hh id at afterTs+1, length 8
      const p_nameTag = afterTs + 9;
      if (data[p_nameTag] !== 0x2a) continue;
      // OK we found body start at candStart
      return { bodyStart: candStart };
    }
  }
  return null;
}

const records = [];
for (const s of SAMPLES) {
  const r = findRecord(s.first, s.last, s.kind, s.hh);
  if (!r) { console.log(`SKIP: ${s.name} (not found)`); continue; }
  records.push({ ...s, bodyStart: r.bodyStart });
}

// Print bytes at each position 0..160 for each record, ALIGNED.
// First print byte positions:
const N = 160;
const header = '       ' + Array.from({ length: N }, (_, i) => i.toString().padStart(3)).join(' ');
console.log(header.slice(0, 320));
for (const r of records) {
  const slice = data.slice(r.bodyStart, r.bodyStart + N);
  const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join('  ');
  console.log(`${r.kind === 'pet' ? 'P' : 'H'} ${r.name.padEnd(9)} ${hex.slice(0, 300)}`);
}

// Now show positions where pets DIFFER consistently from humans.
// For each byte position, gather the set of bytes across pets vs across humans.
// Highlight positions where pet-set is disjoint from human-set.
console.log('\n=== Positions where pet bytes ≠ any human bytes ===');
const petRecs = records.filter(r => r.kind === 'pet');
const humRecs = records.filter(r => r.kind === 'human');
for (let off = 0; off < N; off++) {
  const petBytes = new Set();
  const humBytes = new Set();
  for (const r of petRecs) petBytes.add(data[r.bodyStart + off]);
  for (const r of humRecs) humBytes.add(data[r.bodyStart + off]);
  const overlap = [...petBytes].some(b => humBytes.has(b));
  if (!overlap) {
    const petList = [...petBytes].map(b => b.toString(16).padStart(2,'0')).join(',');
    const humList = [...humBytes].map(b => b.toString(16).padStart(2,'0')).join(',');
    console.log(`  byte @+${off}: pets={${petList}}  humans={${humList}}`);
  }
}
