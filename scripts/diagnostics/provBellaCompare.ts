// EDIT-DETECTION POC: does an UNTOUCHED premade in a fresh save carry the exact
// canonical CAS appearance payload from her .siminfo?
//   The .siminfo is a raw serialized SimData struct (NOT protobuf): ~header then an
//   indexed float-slider run = facial_attributes / genetic_data. The save embeds the
//   same appearance inside the sim record's binary blobs. So: search the save's
//   decompressed 0x0d block for the .siminfo payload windows verbatim.
//     full/large match  = appearance byte-identical → UNTOUCHED.
//     partial/no match  = re-serialized or EDITED.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readString } from '../../src/lib/parser/protobuf.js';

const SIMINFO = `${process.env.HOME}/Documents/Premade SimInfo/${process.argv[5] ?? 'premadeSimTemplate_BellaGoth.siminfo'}`;
const save = process.argv[2] ?? 'Slot_1239123c.save';
const FIRST = process.argv[3] ?? 'Bella';
const LAST = process.argv[4] ?? 'Goth';

function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
// longest verbatim run of `needle` (anchored at needleStart) found anywhere in hay
function longestRunFrom(hay: Uint8Array, needle: Uint8Array, needleStart: number): { at: number; len: number } {
  // find candidate positions matching the first 8 bytes, then extend
  const probe = needle.subarray(needleStart, needleStart + 8);
  let best = { at: -1, len: 0 };
  let pos = 0;
  while (true) {
    const at = indexOfBytes(hay, probe, pos);
    if (at < 0) break;
    let len = 0;
    while (needleStart + len < needle.length && at + len < hay.length && hay[at + len] === needle[needleStart + len]) len++;
    if (len > best.len) best = { at, len };
    pos = at + 1;
    if (best.len > 2000) break;
  }
  return best;
}

// ---- 1. load .siminfo, locate payload start (slider run begins at the `00 07 00 01 02 03` marker) ----
const si = readFileSync(SIMINFO);
let payloadStart = indexOfBytes(si, Uint8Array.from([0x00, 0x07, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
if (payloadStart < 0) payloadStart = 0x5c; // fallback
console.log(`=== ${SIMINFO.split('/').pop()}  (${si.length} bytes, payload@0x${payloadStart.toString(16)}) ===`);
console.log(`  header floats @0x08: ${(si.readFloatLE(8)).toFixed(4)}  appearance payload length ≈ ${si.length - payloadStart}B`);

// ---- 2. decompress the save's 0x0d block & confirm the sim present ----
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
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
console.log(`\n=== ${save}: 0x0d block ${buf.length}B ===`);
console.log(simAt >= 0 ? `Found ${FIRST} ${LAST} sim record @${simAt}` : `!! ${FIRST} ${LAST} NOT found by name`);

// ---- 3. search the save for the appearance payload (longest verbatim run from payloadStart) ----
const total = si.length - payloadStart;
const run = longestRunFrom(buf, si, payloadStart);
console.log(`\n=== appearance-payload match ===`);
if (run.at < 0) {
  console.log(`  NO MATCH — payload anchor (8B @0x${payloadStart.toString(16)}) absent from save.`);
} else {
  const pct = ((run.len / total) * 100).toFixed(1);
  console.log(`  longest verbatim run: ${run.len}/${total}B (${pct}%) at save offset ${run.at}`);
  console.log(`  verdict: ${run.len >= total - 8 ? 'FULL MATCH → appearance UNCHANGED (untouched premade ✓)' : run.len > 256 ? 'PARTIAL — core matches, tail differs (re-serialized or lightly edited)' : 'WEAK — likely EDITED or different container'}`);
  // distance from the sim record anchor → confirms it belongs to this sim
  if (simAt >= 0) console.log(`  (match is ${run.at - simAt} bytes from ${FIRST}'s record anchor)`);
}
