/**
 * Locate Orea (pet sim ID 0x0cab161e093f13c9) inside the decompressed 0x0d.
 * Find where her record lives, what its outer tag is (differs from human 0x0a?),
 * and dump the surrounding bytes to figure out species + lifestage encoding.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const TARGET_ID = 0x0cab161e093f13c9n;
const TARGET_NAME = 'Oreo';

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst = (flags & 0x01) !== 0, groupConst = (flags & 0x02) !== 0, instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
if (typeConst) headerPos += 4;
if (groupConst) headerPos += 4;
if (instHiConst) headerPos += 4;
const entrySize = 32 - (typeConst?4:0) - (groupConst?4:0) - (instHiConst?4:0);
let constType = 0;
if (typeConst) constType = view.getUint32(indexOffset + 4, true);
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

console.log(`Decompressed 0x0d: ${data.length} bytes`);

// 1) Search for the literal sim ID as a fixed64 little-endian
const idBytes = Buffer.alloc(8);
for (let i = 0; i < 8; i++) idBytes[i] = Number((TARGET_ID >> BigInt(i * 8)) & 0xffn);
console.log(`Searching for ID bytes ${idBytes.toString('hex')} (LE of 0x${TARGET_ID.toString(16)})`);
const hits = [];
for (let i = 0; i + 8 <= data.length; i++) {
  let ok = true;
  for (let j = 0; j < 8; j++) if (data[i + j] !== idBytes[j]) { ok = false; break; }
  if (ok) hits.push(i);
}
console.log(`Found ${hits.length} occurrences`);

// 2) Search for the literal string "Orea"
const nameBytes = Buffer.from(TARGET_NAME, 'utf8');
const nameHits = [];
for (let i = 0; i + nameBytes.length <= data.length; i++) {
  let ok = true;
  for (let j = 0; j < nameBytes.length; j++) if (data[i + j] !== nameBytes[j]) { ok = false; break; }
  if (ok) nameHits.push(i);
}
console.log(`String "Orea" found at ${nameHits.length} offsets: ${nameHits.slice(0, 10).join(', ')}${nameHits.length > 10 ? '…' : ''}`);

// 3) For the first string hit that looks like a length-prefixed name (preceded by 0x04 → length=4)
function readV(p) { let r=0n,sh=0n; while(p<data.length){const x=data[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readF(p) { let lo=0n,hi=0n; for(let i=0;i<4;i++)lo|=BigInt(data[p+i])<<BigInt(i*8); for(let i=0;i<4;i++)hi|=BigInt(data[p+4+i])<<BigInt(i*8); return lo|(hi<<32n); }

console.log(`\nLength-prefixed "${TARGET_NAME}" candidates (byte before should be 0x${TARGET_NAME.length.toString(16)}):`);
for (const off of nameHits) {
  if (off > 0 && data[off - 1] === TARGET_NAME.length) {
    // Try walking backward to find the outer message tag
    console.log(`  @${off}: prev byte=0x${data[off - 1].toString(16)} (len=4) — likely a name field`);
    // Dump 64 bytes before and 96 after
    const start = Math.max(0, off - 64);
    const end = Math.min(data.length, off + 96);
    let s = '';
    for (let k = start; k < end; k++) {
      const b = data[k].toString(16).padStart(2, '0');
      const c = (data[k] >= 0x20 && data[k] < 0x7f) ? String.fromCharCode(data[k]) : '.';
      s += `${b}${k === off ? '[' : ''}${k === off + 3 ? ']' : ''} `;
    }
    console.log(`    hex: ${s}`);
  }
}

// 4) Walk fields starting from a few bytes before the first hit, decoded
console.log(`\nDecoded record around first ${TARGET_NAME} hit:`);
const hit = nameHits.find(o => data[o - 1] === TARGET_NAME.length && data[o - 2] === 0x12);
if (hit !== undefined) {
  console.log(`  Found name as field 2 (0x12) at offset ${hit - 2}`);
  // Try to find the outer message tag: walk backward looking for [tag][varint length][08 [varint id]]
  // The pattern for a sim is: [outerTag] [msgLen] 08 [varint id] 12 [4] "Orea" 1a [len][last] ...
  // Find the [08 [varint]] just before 0x12
  let p = hit - 3; // position of byte before 0x12
  // Backtrack to find 0x08 followed by varint that ends at p
  // Simpler: walk backward, looking for [outerTag] s.t. the message starting after parses correctly
  for (let back = 1; back < 40; back++) {
    const candidateMsgStart = hit - 2 - back; // after the outer tag's length
    // Try: byte at candidateMsgStart should be 0x08 (field 1 varint = id)
    if (data[candidateMsgStart] === 0x08) {
      // Read varint id
      let [id, after] = readV(candidateMsgStart + 1);
      if (after === hit - 2 && id === TARGET_ID) {
        // Found! Now find the outer tag — must be before candidateMsgStart with a varint length
        // Walk backward through the varint length
        let q = candidateMsgStart - 1;
        // Multi-byte varint may extend backwards, but length is forward-encoded.
        // Try various tag candidates 1 byte before
        for (let tagBytes = 1; tagBytes <= 4; tagBytes++) {
          const lenStart = candidateMsgStart - tagBytes - 1; // tag = data[lenStart]? no
          // Actually: [tag][lenVarint][message bytes]. message starts at candidateMsgStart.
          // We need to find tag byte + length-varint that together yield message bodies starting at candidateMsgStart.
          // Walk forward from candidate tag pos:
          const tagPos = candidateMsgStart - tagBytes - 1;
          if (tagPos < 0) continue;
          // attempt: tag at tagPos, length varint at tagPos+1 of (tagBytes) bytes
          const [lenVal, lenEnd] = readV(tagPos + 1);
          if (lenEnd === candidateMsgStart) {
            console.log(`  Outer tag at @${tagPos}: 0x${data[tagPos].toString(16)} (wireType=${data[tagPos] & 7}, fieldNum=${data[tagPos] >> 3})`);
            console.log(`  Message length: ${lenVal}, body @${candidateMsgStart} → @${candidateMsgStart + Number(lenVal)}`);
            // Now walk the full message
            const msgEnd = candidateMsgStart + Number(lenVal);
            let pp = candidateMsgStart;
            const fields = [];
            while (pp < msgEnd) {
              const t = data[pp++]; if (t === 0) break;
              const wt = t & 7, fn = t >> 3;
              if (wt === 0) { const [v, n] = readV(pp); fields.push({ off: pp - 1, tag: t, fn, wt, val: v }); pp = n; }
              else if (wt === 1) { const v = readF(pp); fields.push({ off: pp - 1, tag: t, fn, wt, val: v, hex: true }); pp += 8; }
              else if (wt === 2) {
                const [l, n] = readV(pp);
                const e = n + Number(l);
                if (e > msgEnd) { fields.push({ off: pp - 1, tag: t, fn, wt, error: 'overrun' }); break; }
                const sub = data.slice(n, e);
                const isStr = Number(l) > 0 && Number(l) < 30 && sub.every(b => b >= 0x20 && b < 0x7f);
                fields.push({ off: pp - 1, tag: t, fn, wt, len: Number(l), text: isStr ? sub.toString() : null, hex: Buffer.from(sub).toString('hex').slice(0, 64) });
                pp = e;
              } else if (wt === 5) { pp += 4; fields.push({ off: pp - 5, tag: t, fn, wt }); }
              else { fields.push({ off: pp - 1, tag: t, fn, wt, error: 'unknown-wt' }); break; }
            }
            console.log(`  Decoded fields (${fields.length}):`);
            for (const f of fields) {
              let v = '';
              if (f.wt === 0) v = `varint=${f.val} (0x${f.val.toString(16)})`;
              else if (f.wt === 1) v = `fixed64=0x${f.val.toString(16)}`;
              else if (f.wt === 2) v = `len=${f.len}${f.text !== null ? ` text="${f.text}"` : ` hex=${f.hex}`}`;
              else if (f.wt === 5) v = 'fixed32';
              console.log(`    @${f.off} tag=0x${f.tag.toString(16)} f${f.fn} wt${f.wt} ${v}${f.error ? ` ERROR:${f.error}` : ''}`);
            }
            process.exit(0);
          }
        }
      }
    }
  }
}
