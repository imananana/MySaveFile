/**
 * diagLotTypeDiff.mjs
 *
 * Finds the same lot (by stable field5 value) in TWO save files and dumps the
 * full structural protobuf tree for each 0x3a record, walking field 11 (lot
 * state) recursively to depth 4.
 *
 * Usage:
 *   node scripts/diagLotTypeDiff.mjs <field5> <saveA> <saveB>
 *
 * Example:
 *   node scripts/diagLotTypeDiff.mjs 1340871824 \
 *     ~/Documents/Electronic\ Arts/The\ Sims\ 4/saves/Slot_1031202f.save \
 *     ~/Documents/Electronic\ Arts/The\ Sims\ 4/saves/Slot_02220000.save
 *
 * Field 5 = 1340871824 is Rattlesnake Juice (Bar in reference, Cafe in 02220000).
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node diagLotTypeDiff.mjs <field5A> <field5B> <saveA> [saveB]');
  console.error('  If only saveA given, both lots looked up in same save.');
  process.exit(1);
}
const TARGET_FIELD5_A = BigInt(args[0]);
const TARGET_FIELD5_B = BigInt(args[1]);
const SAVE_A = args[2];
const SAVE_B = args[3] ?? args[2];

function load0x0d(savePath) {
  const buf = readFileSync(savePath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const indexCount = view.getUint32(36, true);
  const indexOffset = view.getUint32(64, true);
  const flags = view.getUint32(indexOffset, true);
  const typeConst   = (flags & 0x01) !== 0;
  const groupConst  = (flags & 0x02) !== 0;
  const instHiConst = (flags & 0x04) !== 0;
  let headerPos = indexOffset + 4;
  let constType = 0;
  if (typeConst)   { constType = view.getUint32(headerPos, true); headerPos += 4; }
  if (groupConst)  { headerPos += 4; }
  if (instHiConst) { headerPos += 4; }
  const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

  let pos = headerPos;
  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > buf.length) break;
    let off = pos;
    const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
    off += groupConst ? 0 : 4;
    off += instHiConst ? 0 : 4;
    off += 4;
    const offset   = view.getUint32(off, true); off += 4;
    const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
    off += 4;
    const compType = view.getUint16(off, true);
    pos += entrySize;
    if (type !== 0x0d) continue;
    let raw = buf.slice(offset, offset + sizeComp);
    if (compType === 0xffff) {
      try {
        const p = Buffer.from(raw);
        if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
        raw = decompress(p);
      } catch { continue; }
    }
    return raw;
  }
  throw new Error(`No 0x0d resource in ${savePath}`);
}

function readVarint(buf, pos) {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}
function readFixed64LE(buf, pos) {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}
function readFixed32LE(buf, pos) {
  return (buf[pos] | (buf[pos+1]<<8) | (buf[pos+2]<<16) | (buf[pos+3]<<24)) >>> 0;
}
function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end];
}

// Recursively walk a protobuf message and emit a structured tree.
// Returns an array of { path, type, value, valueHex? } entries.
function walkMessage(buf, start, end, prefix = '', maxDepth = 4, depth = 0) {
  const out = [];
  if (depth >= maxDepth) {
    out.push({ path: prefix + '<truncated>', type: 'depth', value: `${end - start} bytes` });
    return out;
  }
  let p = start;
  // Track repeated field counts so output paths can be unique-ish
  const fieldSeen = new Map();
  while (p < end) {
    if (p >= buf.length) break;
    const tagByte = buf[p]; p++;
    const wireType = tagByte & 0x07;
    const fieldNum = tagByte >> 3;
    if (fieldNum === 0) break;
    const seenIdx = fieldSeen.get(fieldNum) ?? 0;
    fieldSeen.set(fieldNum, seenIdx + 1);
    const pathSeg = seenIdx === 0 ? `${fieldNum}` : `${fieldNum}[${seenIdx}]`;
    const path = prefix ? `${prefix}.${pathSeg}` : pathSeg;

    if (wireType === 0) {
      const [val, next] = readVarint(buf, p); p = next;
      out.push({ path, type: 'varint', value: val.toString(), valueHex: '0x' + val.toString(16) });
    } else if (wireType === 1) {
      if (p + 8 > buf.length) break;
      const val = readFixed64LE(buf, p); p += 8;
      out.push({ path, type: 'fixed64', value: '0x' + val.toString(16).padStart(16,'0') });
    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, p);
      const msgEnd = next + Number(len);
      if (msgEnd > buf.length) break;
      const raw = buf.slice(next, msgEnd);
      // try string
      let str = '';
      try { str = Buffer.from(raw).toString('utf8'); } catch {}
      const isPrintable = str.length > 0 && /^[\x20-\x7e\n\r\t]*$/.test(str);
      if (isPrintable && raw.length >= 1 && raw.length < 200) {
        out.push({ path, type: 'string', value: `"${str}"`, len: raw.length });
      } else {
        out.push({ path, type: 'bytes', len: raw.length, value: `<${raw.length}b>`, valueHex: Buffer.from(raw.slice(0, 32)).toString('hex') + (raw.length > 32 ? '…' : '') });
        // Recurse into it as a sub-message if it might be one
        if (raw.length >= 2 && raw.length < 50000) {
          // try walking - if it produces nothing or breaks, that's fine
          try {
            const sub = walkMessage(raw, 0, raw.length, path, maxDepth, depth + 1);
            for (const s of sub) out.push(s);
          } catch {}
        }
      }
      p = msgEnd;
    } else if (wireType === 5) {
      if (p + 4 > buf.length) break;
      const val = readFixed32LE(buf, p); p += 4;
      out.push({ path, type: 'fixed32', value: '0x' + val.toString(16).padStart(8,'0') });
    } else {
      out.push({ path, type: 'unknown', value: `wireType=${wireType} aborted` });
      break;
    }
  }
  return out;
}

function findLotRecord(data, targetField5) {
  for (let i = 0; i < data.length - 12; i++) {
    if (data[i] !== 0x3a) continue;
    let p = i + 1;
    const [msgLen, msgStart] = readVarint(data, p);
    if (msgLen < 12n || msgLen > 200000n) continue;
    const msgEnd = msgStart + Number(msgLen);
    if (msgEnd > data.length) continue;
    p = msgStart;
    if (data[p] !== 0x09) continue; p++;
    if (p + 8 > msgEnd) continue;
    const lotId = readFixed64LE(data, p); p += 8;
    if (data[p] !== 0x12) continue; p++;
    const [lotName, afterName] = readString(data, p);
    if (!lotName || lotName.length < 3) { i = msgEnd - 1; continue; }
    if (/^[a-z][a-z0-9_:]+$/.test(lotName)) { i = msgEnd - 1; continue; }
    // Walk to find field5 (tag 0x28)
    let q = afterName;
    let f5 = null;
    while (q < msgEnd) {
      const t = data[q]; q++;
      const wt = t & 0x07;
      const fn = t >> 3;
      if (fn === 0) break;
      if (t === 0x28) {
        const [v, next] = readVarint(data, q);
        f5 = v; q = next; break;
      }
      if (wt === 0) { const [, n] = readVarint(data, q); q = n; }
      else if (wt === 1) q += 8;
      else if (wt === 2) { const [l, n] = readVarint(data, q); q = n + Number(l); }
      else if (wt === 5) q += 4;
      else break;
    }
    if (f5 === targetField5) {
      return { lotId, lotName, msgStart, msgEnd, afterName };
    }
    i = msgEnd - 1;
  }
  return null;
}

// ─── Run ───────────────────────────────────────────────────────────────────────

console.log(`\nLot A field5: ${TARGET_FIELD5_A} (0x${TARGET_FIELD5_A.toString(16)})`);
console.log(`Lot B field5: ${TARGET_FIELD5_B} (0x${TARGET_FIELD5_B.toString(16)})`);

const dataA = load0x0d(SAVE_A);
const dataB = SAVE_A === SAVE_B ? dataA : load0x0d(SAVE_B);

const recA = findLotRecord(dataA, TARGET_FIELD5_A);
const recB = findLotRecord(dataB, TARGET_FIELD5_B);

if (!recA) { console.error(`Lot field5=${TARGET_FIELD5_A} NOT FOUND in ${SAVE_A}`); process.exit(1); }
if (!recB) { console.error(`Lot field5=${TARGET_FIELD5_B} NOT FOUND in ${SAVE_B}`); process.exit(1); }

console.log(`\n=== SAVE A: ${SAVE_A} ===`);
console.log(`Lot name: "${recA.lotName}"  id=0x${recA.lotId.toString(16)}  rec length=${recA.msgEnd - recA.msgStart}`);
console.log(`\n=== SAVE B: ${SAVE_B} ===`);
console.log(`Lot name: "${recB.lotName}"  id=0x${recB.lotId.toString(16)}  rec length=${recB.msgEnd - recB.msgStart}`);

// Deep walk for finding nested venue/lot type IDs
const treeA = walkMessage(dataA, recA.afterName, recA.msgEnd, '', 5);
const treeB = walkMessage(dataB, recB.afterName, recB.msgEnd, '', 5);

// Index by path for comparison
const mapA = new Map();
const mapB = new Map();
for (const e of treeA) mapA.set(e.path, e);
for (const e of treeB) mapB.set(e.path, e);

// Show only fixed64/fixed32 differences at depth >= 2 — those are tuning ID candidates
// Also show short paths (≤ 4 segments) for outer structural comparison
function isInteresting(e) {
  if (e.type === 'fixed64' || e.type === 'fixed32') return true;
  if (e.type === 'varint' && e.path.split('.').length <= 3) return true;
  return false;
}

console.log('\n\n=== INTERESTING FIELDS A (fixed64/fixed32 + outer varints) ===');
for (const e of treeA) if (isInteresting(e)) console.log(`  ${e.path}  ${e.type}  ${e.value ?? ''} ${e.valueHex ?? ''}`);
console.log('\n=== INTERESTING FIELDS B ===');
for (const e of treeB) if (isInteresting(e)) console.log(`  ${e.path}  ${e.type}  ${e.value ?? ''} ${e.valueHex ?? ''}`);

console.log('\n\n=== STRUCTURAL DIFF ===');
console.log('(showing fields where A and B differ, or that appear in only one)\n');

const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);
const sortedPaths = [...allPaths].sort();

let diffCount = 0;
for (const path of sortedPaths) {
  const a = mapA.get(path);
  const b = mapB.get(path);
  if (!a) {
    console.log(`+ B only: ${path}  type=${b.type}  value=${b.value ?? ''}  ${b.valueHex ?? ''}`);
    diffCount++;
  } else if (!b) {
    console.log(`- A only: ${path}  type=${a.type}  value=${a.value ?? ''}  ${a.valueHex ?? ''}`);
    diffCount++;
  } else {
    // Both present
    const aVal = a.value ?? '';
    const bVal = b.value ?? '';
    if (aVal !== bVal) {
      // Also check lengths for bytes fields
      console.log(`~ DIFF:   ${path}  type=${a.type}`);
      console.log(`           A: ${aVal} ${a.valueHex ?? ''} ${a.len ? `(len=${a.len})` : ''}`);
      console.log(`           B: ${bVal} ${b.valueHex ?? ''} ${b.len ? `(len=${b.len})` : ''}`);
      diffCount++;
    }
  }
}

console.log(`\nTotal differing/missing paths: ${diffCount}`);
console.log(`\nA tree size: ${treeA.length} fields, B tree size: ${treeB.length} fields`);
