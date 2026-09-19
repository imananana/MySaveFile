/**
 * Brute-force search: for each occult sim, find 8-byte sequences in their
 * record that DON'T appear in any other occult's record. These unique
 * signatures are candidate "occult tuning IDs" — the value that names the
 * occult state in Sims 4's tuning DB.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const SAMPLES = [
  { name: 'Vladislaus', kind: 'vampire',     first: 'Vladislaus', last: 'Straud' },
  { name: 'Kristina',   kind: 'alien',       first: 'Kristina',   last: 'Sexton' },
  { name: 'Latasha',    kind: 'spellcaster', first: 'Latasha',    last: 'Rea' },
  { name: 'Nalani',     kind: 'mermaid',     first: 'Nalani',     last: 'Mahi' },
  { name: 'Braxton',    kind: 'werewolf',    first: 'Braxton',    last: 'Otto' },
  { name: 'Titania',    kind: 'fairy',       first: 'Titania',    last: 'Summerdream' },
  { name: 'Esther',     kind: 'ghost',       first: 'Esther',     last: 'Gomes' },
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

function findBodyAndLen(first, last) {
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
    // Find outer body start
    for (let back = 4; back < 100; back++) {
      const c = i - 2 - back;
      if (c < 0) break;
      if (data[c] !== 0x09) continue;
      if (data[c + 9] !== 0x11) continue;
      if (data[c + 18] !== 0x18) continue;
      const [, afterTs] = readV(data, c + 19);
      if (data[afterTs] !== 0x21) continue;
      if (data[afterTs + 9] !== 0x2a) continue;
      // Need to know record length. Walk back to find outer tag.
      // Try tagBack = 2..6 picking the largest plausible length.
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

// Extract all 8-byte aligned values (read as fixed64 LE) from each record
function extractFixed64s(body, end) {
  const set = new Set();
  for (let i = body; i + 8 <= end; i++) {
    set.add(readF(data, i).toString(16));
  }
  return set;
}

const records = [];
for (const s of SAMPLES) {
  const r = findBodyAndLen(s.first, s.last);
  if (!r) { console.log(`SKIP: ${s.kind} ${s.first} ${s.last}`); continue; }
  const sigs = extractFixed64s(r.bodyStart, r.bodyEnd);
  records.push({ ...s, ...r, sigs });
  console.log(`${s.kind.padEnd(13)} ${s.first} ${s.last}: body @${r.bodyStart}..${r.bodyEnd} (${r.bodyEnd - r.bodyStart} bytes, ${sigs.size} unique 8-byte windows)`);
}

console.log('\n=== Per-occult unique 8-byte signatures (small values: likely tuning IDs) ===');
console.log('(Showing values that appear in this occult\'s record but no other occult\'s record)\n');

for (const rec of records) {
  const others = new Set();
  for (const r of records) {
    if (r === rec) continue;
    for (const s of r.sigs) others.add(s);
  }
  const unique = [];
  for (const s of rec.sigs) {
    if (!others.has(s)) {
      const n = BigInt('0x' + s);
      // Filter to plausible tuning IDs: small unsigned values, < 2^48
      if (n > 0n && n < (1n << 48n)) {
        unique.push({ hex: s, decimal: n });
      }
    }
  }
  // Sort by decimal ascending — small values are more likely tuning IDs
  unique.sort((a, b) => Number(a.decimal - b.decimal));
  console.log(`\n${rec.kind.toUpperCase()} (${rec.first} ${rec.last}) — ${unique.length} unique tuning-ID-shaped values:`);
  for (const u of unique.slice(0, 30)) {
    console.log(`  0x${u.hex.padStart(12, '0')}  = ${u.decimal}`);
  }
}
