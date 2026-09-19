/**
 * Compare TOP-LEVEL fields of confirmed ghost sim records vs confirmed humans.
 * The death/ghost field is probably at the sim record's top level, not nested
 * in f30 (which is the occult tracker for non-death occults).
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const GHOSTS = [
  ['Esther', 'Gomes'],
  ['Consort', 'Capp'],
  ['Felix', 'Psyded'],
];
const HUMANS = [
  ['Kyle', 'Kyleson'],
  ['Eliza', 'Pancakes'],
  ['Bob', 'Pancakes'],
  ['Bella', 'Goth'],
  ['Cassandra', 'Goth'],
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

function listTopLevelFields(start, end) {
  const fields = new Map();
  let p = start;
  while (p < end) {
    let tag;
    const b0 = data[p];
    if (b0 === 0) break;
    if ((b0 & 0x80) === 0) { tag = b0; p++; }
    else { const [tv, np] = readV(data, p); tag = Number(tv); p = np; }
    const fn = tag >> 3;
    const wt = tag & 7;
    const k = `f${fn}_wt${wt}`;
    if (wt === 0) {
      const [val, n] = readV(data, p);
      if (!fields.has(k)) fields.set(k, val.toString());
      p = n;
    } else if (wt === 1) {
      if (!fields.has(k)) fields.set(k, 'fixed64');
      p += 8;
    } else if (wt === 2) {
      const [l, n] = readV(data, p);
      if (!fields.has(k)) fields.set(k, `${l}b`);
      p = n + Number(l);
    } else if (wt === 5) {
      if (!fields.has(k)) fields.set(k, 'fixed32');
      p += 4;
    } else if (wt === 3) {
      if (!fields.has(k)) fields.set(k, 'SGROUP');
      const closeTag = (fn << 3) | 4;
      while (p < end && data[p] !== closeTag) p++;
      p++;
    } else break;
  }
  return fields;
}

const samples = [
  ...GHOSTS.map(([f, l]) => ({ kind: 'G', first: f, last: l })),
  ...HUMANS.map(([f, l]) => ({ kind: 'H', first: f, last: l })),
];
const results = [];
const allKeys = new Set();
for (const s of samples) {
  const r = findBody(s.first, s.last);
  if (!r) continue;
  const fields = listTopLevelFields(r.bodyStart, r.bodyEnd);
  results.push({ ...s, fields });
  for (const k of fields.keys()) allKeys.add(k);
}

const keys = [...allKeys].sort((a, b) => {
  const fa = parseInt(a.replace(/^f(\d+).*/, '$1'));
  const fb = parseInt(b.replace(/^f(\d+).*/, '$1'));
  return fa - fb;
});

console.log('             ', results.map(r => `${r.kind}:${r.first.slice(0,8)}`.padEnd(13)).join(''));
console.log('─'.repeat(13 + 13 * results.length));
for (const k of keys) {
  const row = [k.padEnd(13)];
  let allGhostsPresent = true, allHumansAbsent = true;
  for (const r of results) {
    const v = r.fields.get(k);
    row.push((v ?? '·').padEnd(13).slice(0, 13));
    if (r.kind === 'G' && v === undefined) allGhostsPresent = false;
    if (r.kind === 'H' && v !== undefined) allHumansAbsent = false;
  }
  const marker = (allGhostsPresent && allHumansAbsent) ? ' ← GHOST MARKER!' : '';
  console.log(row.join('') + marker);
}

console.log('\n=== Fields present in ALL ghosts but NOT in ALL humans (could be ghost marker) ===');
for (const k of keys) {
  const ghosts = results.filter(r => r.kind === 'G');
  const humans = results.filter(r => r.kind === 'H');
  const allGhosts = ghosts.every(r => r.fields.has(k));
  const someHumansAbsent = humans.some(r => !r.fields.has(k));
  if (allGhosts && someHumansAbsent) {
    const gVals = ghosts.map(r => `${r.first}=${r.fields.get(k)}`).join('  ');
    const hPresent = humans.filter(r => r.fields.has(k)).map(r => r.first).join(',');
    const hAbsent = humans.filter(r => !r.fields.has(k)).map(r => r.first).join(',');
    console.log(`  ${k}:`);
    console.log(`    Ghosts: ${gVals}`);
    console.log(`    Humans present: ${hPresent || 'none'}`);
    console.log(`    Humans absent: ${hAbsent || 'none'}`);
  }
}
