/**
 * For each known occult sim in Slot_1031202f.save, locate their 0x32 record
 * and dump fields f1..f30 + scan further for occult-discriminator candidates.
 *
 * Hypothesis: occult type is a single varint field somewhere in the early
 * portion of the record (likely f15-f30 since f1-f12 are already explained).
 * Ghost may be in a different field (cause-of-death).
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

const SAMPLES = [
  { name: 'Vladislaus', kind: 'vampire',     first: 'Vladislaus', last: 'Straud' },
  { name: 'Kristina',   kind: 'alien',       first: 'Kristina',   last: 'Sexton' },
  { name: 'Latasha',    kind: 'spellcaster', first: 'Latasha',    last: 'Rea' },
  { name: 'Nalani',     kind: 'mermaid',     first: 'Nalani',     last: 'Mahi' }, // Mahi'ai — handle apostrophe later
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
if (!dataEntry) { console.error('No 0x0d resource found'); process.exit(1); }
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}
console.log(`Decompressed 0x0d: ${data.length} bytes\n`);

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
    if (last === '') { if (Number(llen) !== 0) continue; }
    else {
      const lb = Buffer.from(last, 'utf8');
      if (Number(llen) < lb.length) continue;
      let m2 = true;
      for (let j = 0; j < lb.length; j++) if (data[lstart + j] !== lb[j]) { m2 = false; break; }
      if (!m2) continue;
    }
    // Walk back to find anchor
    for (let back = 4; back < 100; back++) {
      const c = i - 2 - back;
      if (c < 0) break;
      if (data[c] !== 0x09) continue;
      if (data[c + 9] !== 0x11) continue;
      if (data[c + 18] !== 0x18) continue;
      const [, afterTs] = readV(data, c + 19);
      if (data[afterTs] !== 0x21) continue;
      if (data[afterTs + 9] !== 0x2a) continue;
      return c;
    }
  }
  return null;
}

// Decode all top-level fields up to f31, recording field number → value summary
function decodeTopLevel(bodyStart) {
  const out = {};
  let p = bodyStart;
  let i = 0;
  while (p < bodyStart + 4000 && i < 120) {
    const tagOff = p;
    // Handle 2-byte tags (varint encoded)
    let tag, fn, wt;
    const b0 = data[p];
    if ((b0 & 0x80) === 0) {
      tag = b0; p++;
    } else {
      // Multi-byte varint tag
      const [tv, np] = readV(data, p);
      tag = Number(tv);
      p = np;
    }
    if (tag === 0) break;
    fn = tag >> 3;
    wt = tag & 7;
    let v;
    if (wt === 0) {
      const [val, n] = readV(data, p);
      v = val;
      p = n;
    } else if (wt === 1) {
      v = readF(data, p);
      p += 8;
    } else if (wt === 2) {
      const [l, n] = readV(data, p);
      const e = n + Number(l);
      if (e > bodyStart + 2_000_000 || e > data.length) break;
      const sub = data.slice(n, e);
      const isStr = Number(l) > 0 && Number(l) < 80 && sub.every(x => x >= 0x20 && x < 0x7f);
      v = { len: Number(l), text: isStr ? sub.toString() : null, hex: Buffer.from(sub).toString('hex').slice(0, 40) };
      p = e;
    } else if (wt === 5) {
      const v32 = data[p] | (data[p+1]<<8) | (data[p+2]<<16) | (data[p+3]<<24);
      v = (v32 >>> 0).toString(16).padStart(8, '0');
      p += 4;
    } else if (wt === 3) {
      // SGROUP — skip to matching EGROUP
      const closeTag = (fn << 3) | 4;
      while (p < bodyStart + 2_000_000 && p < data.length && data[p] !== closeTag) p++;
      p++;
      v = 'SGROUP';
    } else { v = `UNKNOWN_WT_${wt}`; break; }
    if (out[`f${fn}_wt${wt}`] === undefined) out[`f${fn}_wt${wt}`] = v;
    i++;
  }
  return out;
}

const fingerprints = [];
for (const s of SAMPLES) {
  const b = findBody(s.first, s.last);
  if (b === null) { console.log(`SKIP ${s.kind}: ${s.first} ${s.last} not found`); continue; }
  const fields = decodeTopLevel(b);
  fingerprints.push({ ...s, bodyStart: b, fields });
}

if (fingerprints.length === 0) { console.error('No samples found.'); process.exit(1); }

// Print all field values across all samples
const allKeys = new Set();
for (const fp of fingerprints) for (const k of Object.keys(fp.fields)) allKeys.add(k);
const keys = [...allKeys].sort((a, b) => {
  const fa = parseInt(a.replace(/^f(\d+).*/, '$1'));
  const fb = parseInt(b.replace(/^f(\d+).*/, '$1'));
  return fa - fb;
});

function fmt(v) {
  if (v === undefined) return '-';
  if (typeof v === 'bigint') {
    const s = v.toString();
    if (s.length > 18) return '0x' + v.toString(16).slice(0, 14);
    return s;
  }
  if (typeof v === 'object' && v !== null) {
    if (v.text) return `"${v.text}"`;
    if (v.hex) return `${v.len}b:${v.hex.slice(0,16)}`;
    return `len=${v.len}`;
  }
  return String(v);
}

// Print one field per row, one column per occult
const COL_WIDTH = 22;
const headers = ['Field'.padEnd(8)].concat(fingerprints.map(fp => fp.kind.padEnd(COL_WIDTH)));
console.log(headers.join(''));
console.log('─'.repeat(headers.join('').length));
for (const k of keys) {
  const cells = [k.padEnd(8)];
  for (const fp of fingerprints) {
    cells.push(fmt(fp.fields[k]).padEnd(COL_WIDTH).slice(0, COL_WIDTH));
  }
  console.log(cells.join(''));
}
