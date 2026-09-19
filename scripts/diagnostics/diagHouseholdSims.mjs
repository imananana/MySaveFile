/**
 * diagHouseholdSims.mjs
 *
 * Phase 1.2: Find where sim member IDs live inside a household record.
 *
 * Method:
 *   1. Parse all sim records (id + firstName + lastName) for cross-reference.
 *   2. Find every household anchor using the known prefix:
 *        0x09 [8] 0x11 [8 hhId] 0x1a [len][name] 0x21 [8 lotId]
 *   3. Also detect the OUTER wrapper tag preceding the anchor (some length-delim
 *      tag with a known wire-type-2 marker). We sniff a small window backward.
 *   4. From the byte just after lotId, walk forward reading protobuf fields.
 *      For each fixed64 / varint / length-delim value, check if it matches a
 *      known sim ID. Print field number + tag + value + which sim matched.
 *   5. Render a side-by-side: household → [matched sim names] so we can verify
 *      Spencer-Kim-Lewis (mixed-surname) gets all members linked.
 *
 * Usage:
 *   node scripts/diagHouseholdSims.mjs [savePath] [householdNameFilter]
 *
 * Example:
 *   node scripts/diagHouseholdSims.mjs ~/Documents/.../Slot_02220000.save Spencer
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const filter = (process.argv[3] || '').toLowerCase();

// ─── DBPF + 0x0d extraction ──────────────────────────────────────────────────
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

function readVarint(b, p) { let r=0n,s=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<s; s+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readFixed64LE(b,p){let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(b[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(b[p+4+i])<<BigInt(i*8); return lo|(hi<<32n);}
function readString(b,p){const[l,n]=readVarint(b,p);const e=n+Number(l);return[Buffer.from(b.slice(n,e)).toString('utf8'),e];}

const entries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4;
  off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  entries.push({ index: i, type, instLo, offset, sizeComp, compType });
}

const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

console.log(`Decompressed 0x0d: ${data.length} bytes`);

// ─── Scan sims (id + firstName + lastName) ──────────────────────────────────
const ASCII_NAME = /^[A-Z][A-Za-z'\-. ]{0,28}$/;
const LAST_OK    = /^[A-Za-z'\-. ]{0,28}$/;

const simById = new Map();   // bigint → { firstName, lastName }
const simIdsAsBig = new Set();

for (let i = 0; i < data.length - 6; i++) {
  if (data[i] !== 0x0a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readVarint(data, p);
  const msgEnd = msgStart + Number(msgLen);
  if (msgLen < 4n || msgLen > 200n || msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x08) continue; p++;
  const [simId, afterId] = readVarint(data, p);
  if (simId === 0n || simId < 0x10000n) continue;
  p = afterId;
  if (p >= msgEnd || data[p] !== 0x12) continue; p++;
  const [first, afterFirst] = readString(data, p);
  if (!first || first.length < 1 || first.length > 30) continue;
  p = afterFirst;
  if (p >= msgEnd || data[p] !== 0x1a) continue; p++;
  const [last, afterLast] = readString(data, p);
  if (last.length > 30) continue;
  if (!ASCII_NAME.test(first)) continue;
  if (last.length > 0 && !LAST_OK.test(last)) continue;
  if (first.includes('_') || last.includes('_')) continue;
  if (!simById.has(simId)) {
    simById.set(simId, { firstName: first, lastName: last });
    simIdsAsBig.add(simId);
  }
  i = msgEnd - 1;
}

console.log(`Sims parsed: ${simById.size}`);

// ─── Find household anchors ─────────────────────────────────────────────────
// Pattern: 0x09 [8 token] 0x11 [8 hhId] 0x1a [len][name] 0x21 [8 lotId]
const households = [];

for (let i = 0; i < data.length - 40; i++) {
  if (data[i] !== 0x09) continue;
  if (data[i + 9] !== 0x11) continue;
  let p = i + 10;
  if (p + 8 > data.length) continue;
  const hhId = readFixed64LE(data, p); p += 8;
  if (data[p] !== 0x1a) continue; p++;
  const [hhName, afterName] = readString(data, p);
  if (!hhName || hhName.length < 2 || hhName.length > 60) continue;
  if (!/^[\x20-\x7e]+$/.test(hhName)) continue;
  if (hhName.includes('_')) continue;
  p = afterName;
  if (data[p] !== 0x21) continue; p++;
  if (p + 8 > data.length) continue;
  const lotId = readFixed64LE(data, p); p += 8;

  households.push({
    anchorStart: i,         // 0x09 byte
    bodyStart: p,           // first byte after lotId
    hhId,
    hhName,
    lotId,
  });
}

console.log(`Household anchors found: ${households.length}\n`);

// ─── For each household, walk forward and dump all parseable fields ─────────
// We don't know where the record ends. Heuristic: stop on any of:
//   - hitting the next household anchor (next 0x09 ... 0x11 sequence)
//   - hitting an obvious next-record tag we don't recognize twice
//   - exceeding 2 KB
//
// For each field we read, check if its value matches a known sim ID.

const SCAN_LIMIT = 2_000_000;

function scanBodyForSims(start, nextAnchor) {
  const end = Math.min(data.length, nextAnchor, start + SCAN_LIMIT);
  let p = start;
  const fields = []; // { fieldNum, wireType, value, simMatch?, offset }

  while (p < end) {
    const tagOffset = p;
    const tag = data[p]; p++;
    if (tag === 0) { fields.push({ stop: 'tag0', offset: tagOffset }); break; }
    const wireType = tag & 0x07;
    const fieldNum = tag >> 3;

    if (wireType === 0) {
      // varint
      const [val, next] = readVarint(data, p);
      const simMatch = simIdsAsBig.has(val) ? simById.get(val) : null;
      fields.push({ offset: tagOffset, tag, fieldNum, wireType, value: val, simMatch });
      p = next;
    } else if (wireType === 1) {
      // fixed64
      if (p + 8 > end) { fields.push({ stop: 'truncFixed64', offset: tagOffset }); break; }
      const v = readFixed64LE(data, p);
      const simMatch = simIdsAsBig.has(v) ? simById.get(v) : null;
      fields.push({ offset: tagOffset, tag, fieldNum, wireType, value: v, simMatch });
      p += 8;
    } else if (wireType === 2) {
      // length-delimited — could be string OR a nested message containing sim IDs
      const [len, lenEnd] = readVarint(data, p);
      const valEnd = lenEnd + Number(len);
      if (len < 0n || len > 1_000_000n || valEnd > end) { fields.push({ stop: 'truncLen', offset: tagOffset, len: Number(len) }); break; }
      const subBytes = data.slice(lenEnd, valEnd);
      // Recursively look for sim ID matches in this submessage.
      const innerSimMatches = [];
      function recurse(bytes, depth, pathPrefix) {
        if (depth > 4) return;
        // (a) packed-fixed64 scan: any 8-byte window that lands on a sim ID
        if (bytes.length >= 8 && bytes.length % 8 === 0) {
          for (let off = 0; off + 8 <= bytes.length; off += 8) {
            const v = readFixed64LE(bytes, off);
            if (simIdsAsBig.has(v)) innerSimMatches.push({ kind: 'packed-fix64', val: v, sim: simById.get(v), path: `${pathPrefix}[${off}]` });
          }
        }
        // (b) protobuf walk
        let pp = 0;
        while (pp < bytes.length) {
          const t = bytes[pp]; pp++;
          if (t === 0) break;
          const wt = t & 0x07;
          const fn = t >> 3;
          if (wt === 0) {
            const [v, n] = readVarint(bytes, pp);
            if (simIdsAsBig.has(v)) innerSimMatches.push({ kind: 'varint', val: v, sim: simById.get(v), path: `${pathPrefix}.f${fn}` });
            pp = n;
          } else if (wt === 1) {
            if (pp + 8 > bytes.length) break;
            const v = readFixed64LE(bytes, pp);
            if (simIdsAsBig.has(v)) innerSimMatches.push({ kind: 'fixed64', val: v, sim: simById.get(v), path: `${pathPrefix}.f${fn}` });
            pp += 8;
          } else if (wt === 2) {
            const [l, n] = readVarint(bytes, pp);
            const e = n + Number(l);
            if (e > bytes.length) break;
            recurse(bytes.slice(n, e), depth + 1, `${pathPrefix}.f${fn}`);
            pp = e;
          } else if (wt === 5) pp += 4;
          else break;
        }
      }
      recurse(subBytes, 0, `f${fieldNum}`);
      // Try utf8 preview
      let textPreview = null;
      if (len > 0n && len < 60n) {
        const s = Buffer.from(subBytes).toString('utf8');
        if (/^[\x20-\x7e]+$/.test(s)) textPreview = s;
      }
      fields.push({ offset: tagOffset, tag, fieldNum, wireType, len: Number(len), textPreview, innerSimMatches, rawHex: Buffer.from(subBytes).toString('hex').slice(0, 64) });
      p = valEnd;
    } else if (wireType === 5) {
      if (p + 4 > end) { fields.push({ stop: 'truncFixed32', offset: tagOffset }); break; }
      p += 4;
      fields.push({ offset: tagOffset, tag, fieldNum, wireType });
    } else {
      fields.push({ stop: 'unknownWT', offset: tagOffset, tag });
      break;
    }
  }
  return fields;
}

// Determine each household's body window: up to the NEXT household anchor.
for (let h = 0; h < households.length; h++) {
  const hh = households[h];
  if (filter && !hh.hhName.toLowerCase().includes(filter)) continue;
  const next = households[h + 1] ? households[h + 1].anchorStart : data.length;
  const fields = scanBodyForSims(hh.bodyStart, next);

  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`HH "${hh.hhName}"  id=0x${hh.hhId.toString(16)}  lotId=0x${hh.lotId.toString(16)}`);
  console.log(`  anchor=${hh.anchorStart}  bodyStart=${hh.bodyStart}  next=${next}  window=${next - hh.bodyStart}`);
  // collect all sim matches across fields
  const collected = [];
  for (const f of fields) {
    if (f.simMatch) collected.push({ where: `field ${f.fieldNum} (tag 0x${f.tag.toString(16)})`, sim: f.simMatch });
    if (f.innerSimMatches) {
      const seenIds = new Set();
      for (const m of f.innerSimMatches) {
        if (seenIds.has(m.val)) continue;
        seenIds.add(m.val);
        collected.push({ where: `${m.path} (${m.kind})`, sim: m.sim });
      }
    }
  }
  if (collected.length > 0) {
    console.log(`  Matched sims (${collected.length}):`);
    for (const c of collected) console.log(`    ${c.where}  →  ${c.sim.firstName} ${c.sim.lastName}`);
  } else {
    console.log(`  Matched sims: NONE`);
  }
  // Also print the first ~30 fields for structural insight
  console.log(`  Fields:`);
  for (let k = 0; k < Math.min(fields.length, 30); k++) {
    const f = fields[k];
    if (f.stop) { console.log(`    [stop=${f.stop} at offset ${f.offset}]`); break; }
    let v = '';
    if (f.wireType === 0) v = `varint=${f.value} (0x${f.value.toString(16)})`;
    else if (f.wireType === 1) v = `fixed64=0x${f.value.toString(16)}${f.simMatch ? ' ★' : ''}`;
    else if (f.wireType === 2) {
      v = `len=${f.len}`;
      if (f.textPreview) v += ` text="${f.textPreview}"`;
      else v += ` hex=${f.rawHex}`;
      if (f.innerSimMatches && f.innerSimMatches.length > 0) v += ` ★sim×${f.innerSimMatches.length}`;
    } else if (f.wireType === 5) v = `fixed32`;
    console.log(`    @${f.offset} tag=0x${f.tag.toString(16)} f${f.fieldNum} wt${f.wireType} ${v}`);
  }
}
