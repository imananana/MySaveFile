/**
 * Find named small-businesses inside the 0x0d resource and figure out
 * which top-level field (of GameplaySaveSlotData) contains them. Once
 * we know the field number we can walk the structure cleanly.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;
const NEEDLES = (process.env.NEEDLES ?? 'Cook A Little,Sunny Babies,Sequoia Bowl,Lucy Copur,Eleanor Sullivan,Bowling Alley')
  .split(',')
  .map((s) => s.trim());

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;
console.log(`0x0d decompressed: ${raw.length} bytes\n`);

function readVarint(b: Uint8Array, p: number): [bigint, number] {
  let v = 0n, shift = 0n, i = p;
  while (i < b.length) {
    const byte = BigInt(b[i++]);
    v |= (byte & 0x7fn) << shift;
    if ((byte & 0x80n) === 0n) return [v, i];
    shift += 7n;
    if (shift > 63n) throw new Error('varint too long');
  }
  throw new Error('varint truncated');
}
function readTag(b: Uint8Array, p: number): [number, number, number] {
  const [tv, after] = readVarint(b, p);
  return [Number(tv >> 3n), Number(tv & 7n), after];
}

// Build a map: offset → which field in GameplaySaveSlotData contains this offset.
// (Cheap because we just walk once.)
function buildFieldMap(): { ranges: Array<{ field: number; start: number; end: number }> } {
  const ranges: Array<{ field: number; start: number; end: number }> = [];
  // Walk SaveGameData (0x0d) → field 2 (SaveSlotData) → field 8 (GameplaySaveSlotData)
  // Track absolute offsets in `raw`.
  let p = 0;
  const slotInfo = findChildAbs(raw, p, raw.length, 2);
  if (!slotInfo) return { ranges };
  const gameSlotInfo = findChildAbs(raw, slotInfo.start, slotInfo.end, 8);
  if (!gameSlotInfo) return { ranges };
  // Now walk every top-level field of GameplaySaveSlotData with absolute offsets.
  p = gameSlotInfo.start;
  while (p < gameSlotInfo.end) {
    const startOff = p;
    const [fn, wire, afterTag] = readTag(raw, p);
    p = afterTag;
    if (wire === 0) { const [, n] = readVarint(raw, p); p = n; ranges.push({ field: fn, start: startOff, end: p }); }
    else if (wire === 1) { p += 8; ranges.push({ field: fn, start: startOff, end: p }); }
    else if (wire === 2) {
      const [l, n] = readVarint(raw, p);
      const ln = Number(l);
      ranges.push({ field: fn, start: n, end: n + ln });
      p = n + ln;
    } else if (wire === 5) { p += 4; ranges.push({ field: fn, start: startOff, end: p }); }
    else break;
  }
  return { ranges };
}

function findChildAbs(b: Uint8Array, start: number, end: number, fieldNum: number): { start: number; end: number } | null {
  let p = start;
  while (p < end) {
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(b, p);
      const ln = Number(len);
      return { start: afterLen, end: afterLen + ln };
    }
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}

const { ranges } = buildFieldMap();
console.log(`GameplaySaveSlotData has ${ranges.length} top-level fields\n`);

function fieldAt(offset: number): number | null {
  for (const r of ranges) {
    if (offset >= r.start && offset < r.end) return r.field;
  }
  return null;
}

for (const needle of NEEDLES) {
  const nb = Buffer.from(needle, 'utf-8');
  const hits: number[] = [];
  for (let i = 0; i <= raw.length - nb.length; i++) {
    let m = true;
    for (let j = 0; j < nb.length; j++) {
      if (raw[i + j] !== nb[j]) { m = false; break; }
    }
    if (m) hits.push(i);
  }
  console.log(`"${needle}" → ${hits.length} hits`);
  for (const h of hits) {
    const f = fieldAt(h);
    console.log(`  @ 0x${h.toString(16)} (field ${f ?? '?'})`);
  }
}
