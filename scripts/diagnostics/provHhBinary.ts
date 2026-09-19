// Find the household holding a target sim, extract the embedded household binary
// (f25), check whether it's separately compressed, and search inside it for the
// .siminfo appearance anchor. Also dump the target sim record's big wt=2 blobs.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readString } from '../../src/lib/parser/protobuf.js';
import { inflateSync } from 'zlib';

const save = process.argv[2] ?? 'Slot_1239123c.save';
const FIRST = process.argv[3] ?? 'Bella';
const LAST = process.argv[4] ?? 'Goth';
const SIMINFO = `${process.env.HOME}/Documents/Premade SimInfo/${process.argv[5] ?? 'premadeSimTemplate_BellaGoth.siminfo'}`;

function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
const ANCHOR = Uint8Array.from([0x00, 0x07, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);

const si = readFileSync(SIMINFO);
const siPayload = indexOfBytes(si, ANCHOR);

const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
console.log(`${save}: 0x0d ${buf.length}B. .siminfo anchor present in raw 0x0d? ${indexOfBytes(buf, ANCHOR) >= 0 ? 'YES @' + indexOfBytes(buf, ANCHOR) : 'NO'}`);

// dump the target sim record's big wt=2 blobs (walk a generous window from anchor)
let simAt = -1;
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  let p = i + 9; if (buf[p] !== 0x11) continue; p += 9;
  if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p += 9;
  if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
  if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
  if (first === FIRST && last === LAST) { simAt = i; break; }
}
console.log(`\n${FIRST} ${LAST} sim record @${simAt}. Big wt=2 blobs in next ~12KB:`);
if (simAt >= 0) {
  let p = simAt, c = 0;
  while (p < buf.length && p < simAt + 12000 && c < 400) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number; try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [, x] = readVarint(buf, p); p = x; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); if (len >= 24) { const head = [...buf.subarray(x, x + 12)].map(z => z.toString(16).padStart(2, '0')).join(' '); const hasAnchor = indexOfBytes(buf.subarray(x, x + len), ANCHOR) >= 0; console.log(`   f${fn}/len${len}  head=[${head}]${hasAnchor ? '  <-- contains slider anchor!' : ''}`); } p = x + len; }
    else if (wt === 5) p += 4; else break;
    c++;
  }
}

// locate household-binary-looking blobs anywhere: zlib (78 9c / 78 da) or refpack runs in 0x0d
console.log(`\nScanning 0x0d for embedded compressed sub-blobs (zlib magic):`);
let zfound = 0;
for (let i = 0; i + 2 < buf.length && zfound < 12; i++) {
  if (buf[i] === 0x78 && (buf[i + 1] === 0x9c || buf[i + 1] === 0xda || buf[i + 1] === 0x01)) {
    try {
      const out = inflateSync(Buffer.from(buf.subarray(i)));
      if (out.length > 200) {
        const anchorIn = indexOfBytes(out, ANCHOR);
        console.log(`   @${i}: zlib → ${out.length}B decompressed.${anchorIn >= 0 ? `  SLIDER ANCHOR @${anchorIn} inside!` : ''}`);
        zfound++;
      }
    } catch { /* not a valid stream start */ }
  }
}
if (!zfound) console.log('   <none found>');
console.log(`\n.siminfo payload@0x${siPayload.toString(16)}, ${si.length - siPayload}B. For reference, first 24 payload bytes:`);
console.log('   [' + [...si.subarray(siPayload, siPayload + 24)].map(z => z.toString(16).padStart(2, '0')).join(' ') + ']');
