/**
 * diagLotFull.mjs
 *
 * For a handful of known lots, dumps the COMPLETE lot record structure —
 * including full recursive descent into the field4 sub-message (tag 0x22)
 * and any nested sub-messages inside that.
 *
 * Goal: find which field(s) contain world/region/location data so we can
 * match lots reliably without relying on names.
 *
 * Usage:
 *   node scripts/diagLotFull.mjs [path-to-save]
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const TARGETS = [
  'Hakim House',        // Willow Creek — apartment building
  '121 Hakim House',
  'Culpepper House',    // San Myshuno — apartment building
  'Rindle Rose',        // Willow Creek — regular lot
  'Ophelia Villa',      // Willow Creek — regular lot
  'Asphalt Abodes',     // Newcrest — might be gallery-replaced in some saves
  'Civic Cliffs',       // Newcrest
  'IX Landgraab',       // San Myshuno apartments (truncated)
];

const HOME = process.env.HOME;
const savePath = process.argv[2] ||
  `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

// ─── DBPF index parsing ────────────────────────────────────────────────────────

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst   = (flags & 0x01) !== 0;
const groupConst  = (flags & 0x02) !== 0;
const instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0, constGroup = 0, constInstHi = 0;
if (typeConst)   { constType   = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst)  { constGroup  = view.getUint32(headerPos, true); headerPos += 4; }
if (instHiConst) { constInstHi = view.getUint32(headerPos, true); headerPos += 4; }
const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

// ─── Protobuf helpers ──────────────────────────────────────────────────────────

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
  return (buf[pos] | (buf[pos+1] << 8) | (buf[pos+2] << 16) | (buf[pos+3] << 24)) >>> 0;
}

function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end, Number(len)];
}

// Check if a byte slice looks like a nested protobuf (has valid tag+wire structure)
function looksLikeProto(buf, start, len) {
  if (len < 2) return false;
  let pos = start;
  let fieldsSeen = 0;
  while (pos < start + len && fieldsSeen < 10) {
    if (buf[pos] === 0) return false; // tag 0 is invalid
    const tag = buf[pos];
    const wireType = tag & 0x07;
    if (wireType > 5) return false;
    pos++;
    fieldsSeen++;
    if (wireType === 0) { // varint
      let steps = 0;
      while (pos < start + len && (buf[pos] & 0x80) !== 0) { pos++; if (++steps > 10) return false; }
      pos++; // final byte
    } else if (wireType === 1) { pos += 8; }
    else if (wireType === 2) {
      const [len2, next2] = readVarint(buf, pos);
      pos = next2 + Number(len2);
    } else if (wireType === 5) { pos += 4; }
    else return false;
    if (pos > start + len) return false;
  }
  return fieldsSeen > 0 && pos <= start + len;
}

// Recursively walk a protobuf message and print all fields
function walkProto(buf, start, end, indent = '') {
  let pos = start;
  while (pos < end) {
    if (buf[pos] === 0) { pos++; continue; }
    const tagByte = buf[pos];
    const fieldNum = tagByte >> 3;
    const wireType = tagByte & 0x07;
    pos++;

    if (wireType === 0) {
      const [val, next] = readVarint(buf, pos);
      pos = next;
      // Show as both decimal and hex for large values
      const hex = val > 0xfffn ? `  (0x${val.toString(16)})` : '';
      console.log(`${indent}field ${fieldNum} [varint] = ${val}${hex}`);

    } else if (wireType === 1) {
      if (pos + 8 > end) { console.log(`${indent}field ${fieldNum} [fixed64] = <truncated>`); break; }
      const val = readFixed64LE(buf, pos);
      pos += 8;
      console.log(`${indent}field ${fieldNum} [fixed64] = 0x${val.toString(16).padStart(16,'0')}  (${val})`);

    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, pos);
      const subStart = next;
      const subEnd = subStart + Number(len);
      pos = subEnd;

      if (subEnd > end) {
        console.log(`${indent}field ${fieldNum} [len-delim] len=${len} <overruns message>`);
        break;
      }

      // Try to decode as UTF-8 string first
      const bytes = buf.slice(subStart, subEnd);
      const asStr = Buffer.from(bytes).toString('utf8');
      const isPrintable = /^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(asStr) && asStr.length > 0;

      if (isPrintable && asStr.length <= 80) {
        // Also check if it could be proto
        if (looksLikeProto(buf, subStart, Number(len))) {
          console.log(`${indent}field ${fieldNum} [len-delim] len=${len} → could be string OR proto`);
          console.log(`${indent}  as string: "${asStr}"`);
          console.log(`${indent}  as proto:`);
          walkProto(buf, subStart, subEnd, indent + '    ');
        } else {
          console.log(`${indent}field ${fieldNum} [string] = "${asStr}"`);
        }
      } else if (looksLikeProto(buf, subStart, Number(len))) {
        console.log(`${indent}field ${fieldNum} [sub-message] len=${len}:`);
        walkProto(buf, subStart, subEnd, indent + '  ');
      } else {
        // Raw bytes — show hex
        const hexStr = Array.from(bytes.slice(0, Math.min(32, bytes.length)))
          .map(b => b.toString(16).padStart(2,'0')).join(' ');
        const ellipsis = bytes.length > 32 ? ' ...' : '';
        console.log(`${indent}field ${fieldNum} [bytes] len=${len}: ${hexStr}${ellipsis}`);
      }

    } else if (wireType === 5) {
      if (pos + 4 > end) { console.log(`${indent}field ${fieldNum} [fixed32] = <truncated>`); break; }
      const val = readFixed32LE(buf, pos);
      pos += 4;
      console.log(`${indent}field ${fieldNum} [fixed32] = 0x${val.toString(16).padStart(8,'0')}  (${val})`);

    } else {
      console.log(`${indent}field ${fieldNum} [unknown wire=${wireType}] — stopping`);
      break;
    }

    if (pos > end) break;
  }
}

// ─── Lot scanner ───────────────────────────────────────────────────────────────

function scanTargetLots(data, targets) {
  const found = [];
  for (let i = 0; i < data.length - 12; i++) {
    if (data[i] !== 0x2a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(data, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 12n || msgEnd > data.length) continue;
    pos = msgStart;

    if (data[pos] !== 0x08) continue; pos++;
    const [field1, afterF1] = readVarint(data, pos); pos = afterF1;
    if (pos + 9 > msgEnd) continue;

    if (data[pos] !== 0x11) continue; pos++;
    if (pos + 8 > data.length) continue;
    const lotId = readFixed64LE(data, pos); pos += 8;
    if (pos >= msgEnd) continue;

    if (data[pos] !== 0x1a) continue; pos++;
    const [lotName, afterName] = readString(data, pos);
    if (!lotName) continue;

    for (const t of targets) {
      if (lotName.toLowerCase().includes(t.toLowerCase())) {
        found.push({ name: lotName, field1: Number(field1), lotId, msgStart, msgEnd, data });
        i = msgEnd - 1;
        break;
      }
    }
  }
  return found;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const results = [];
let pos = headerPos;

for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo  = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;

  if (type !== 0x0d && type !== 0x06) continue;
  if (type === 0x06 && compType !== 0xffff) continue;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  for (const r of scanTargetLots(data, TARGETS)) {
    results.push(r);
  }
}

// Deduplicate by name (first occurrence per name)
const seen = new Set();
for (const r of results) {
  if (seen.has(r.name)) continue;
  seen.add(r.name);

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`LOT: "${r.name}"`);
  console.log(`  field1 = ${r.field1}   lotId = 0x${r.lotId.toString(16)}`);
  console.log(`  Full lot record (all fields after field1/lotId/name):`);
  console.log('');

  // Walk from immediately after the name field through end of message
  // We already have msgStart/msgEnd, but we need to re-find afterName
  // Re-parse quickly
  let p = r.msgStart;
  p++; // skip 0x08 tag
  const [, afterF1b] = readVarint(r.data, p); p = afterF1b;
  p++; // skip 0x11 tag
  p += 8; // skip fixed64 lotId
  p++; // skip 0x1a tag
  const [slen, snext] = readVarint(r.data, p); p = snext + Number(slen); // skip name

  // Now walk the REST of the message — all remaining fields
  walkProto(r.data, p, r.msgEnd, '  ');
}

if (seen.size === 0) {
  console.log('No target lots found in this save.');
}
