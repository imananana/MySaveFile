/**
 * For each occult sim, decode their FULL record (all top-level fields,
 * properly tracking SGROUP nesting) and look for a field whose value differs
 * across the 7 occult types.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const SAMPLES = [
  { kind: 'vampire',     first: 'Vladislaus', last: 'Straud' },
  { kind: 'alien',       first: 'Kristina',   last: 'Sexton' },
  { kind: 'spellcaster', first: 'Latasha',    last: 'Rea' },
  { kind: 'mermaid',     first: 'Nalani',     last: 'Mahi' },
  { kind: 'werewolf',    first: 'Braxton',    last: 'Otto' },
  { kind: 'fairy',       first: 'Titania',    last: 'Summerdream' },
  { kind: 'ghost',       first: 'Esther',     last: 'Gomes' },
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

// Walk top-level fields properly handling SGROUP. Return a map field# → list of values.
function decodeAllFields(start, end) {
  const fields = new Map();
  function add(fn, wt, val) {
    const k = `f${fn}_wt${wt}`;
    if (!fields.has(k)) fields.set(k, []);
    fields.get(k).push(val);
  }
  let p = start;
  while (p < end) {
    let tag;
    const b0 = data[p];
    if (b0 === 0) break;
    if ((b0 & 0x80) === 0) { tag = b0; p++; }
    else { const [tv, np] = readV(data, p); tag = Number(tv); p = np; }
    const fn = tag >> 3;
    const wt = tag & 7;
    if (wt === 0) {
      const [val, n] = readV(data, p);
      add(fn, wt, val);
      p = n;
    } else if (wt === 1) {
      add(fn, wt, readF(data, p));
      p += 8;
    } else if (wt === 2) {
      const [l, n] = readV(data, p);
      const e = n + Number(l);
      if (e > end) break;
      add(fn, wt, { len: Number(l), offset: n });
      p = e;
    } else if (wt === 5) {
      const v32 = data[p] | (data[p+1]<<8) | (data[p+2]<<16) | (data[p+3]<<24);
      add(fn, wt, (v32 >>> 0));
      p += 4;
    } else if (wt === 3) {
      const closeTag = (fn << 3) | 4;
      let depth = 1;
      while (p < end && depth > 0) {
        const tb = data[p++];
        if (tb === closeTag) depth--;
        else if ((tb & 7) === 3 && (tb >> 3) === fn) depth++;
      }
      add(fn, wt, 'SGROUP');
    } else break;
  }
  return fields;
}

const records = [];
for (const s of SAMPLES) {
  const r = findBodyAndLen(s.first, s.last);
  if (!r) { console.log(`SKIP: ${s.kind}`); continue; }
  const fields = decodeAllFields(r.bodyStart, r.bodyEnd);
  records.push({ ...s, ...r, fields });
}

// Now find fields whose value DIFFERS across all occult types (perfect discriminator).
// And fields whose presence/absence patterns correlate.
const allKeys = new Set();
for (const r of records) for (const k of r.fields.keys()) allKeys.add(k);

console.log('\n=== Fields with all-different values across the 7 occults (potential discriminator) ===');
for (const k of [...allKeys].sort()) {
  // Only look at varint and fixed64 fields with single-occurrence
  if (!k.endsWith('_wt0') && !k.endsWith('_wt1') && !k.endsWith('_wt5')) continue;
  const values = records.map(r => {
    const arr = r.fields.get(k);
    if (!arr || arr.length !== 1) return null;
    return typeof arr[0] === 'bigint' ? arr[0].toString() : arr[0]?.toString?.() ?? null;
  });
  if (values.some(v => v === null)) continue;
  const uniq = new Set(values);
  if (uniq.size === records.length) {
    console.log(`  ${k}:`);
    for (let i = 0; i < records.length; i++) {
      console.log(`    ${records[i].kind.padEnd(13)} = ${values[i]}`);
    }
  }
}

console.log('\n=== Fields present in SOME occults but not others (likely occult-specific) ===');
for (const k of [...allKeys].sort()) {
  const presence = records.map(r => r.fields.has(k));
  const presentCount = presence.filter(Boolean).length;
  if (presentCount > 0 && presentCount < records.length) {
    const labels = records.map((r, i) => `${r.kind}${presence[i] ? '✓' : '·'}`).join(' ');
    console.log(`  ${k.padEnd(12)} (${presentCount}/${records.length}): ${labels}`);
  }
}

console.log('\n=== All small varint values per occult (looking for occult-type enum) ===');
for (const rec of records) {
  console.log(`\n${rec.kind}:`);
  const smallVarints = [];
  for (const [k, vals] of rec.fields) {
    if (!k.endsWith('_wt0')) continue;
    for (const v of vals) {
      if (typeof v === 'bigint' && v > 0n && v < 1000n) {
        smallVarints.push(`${k}=${v}`);
      }
    }
  }
  console.log('  ' + smallVarints.join('  '));
}
