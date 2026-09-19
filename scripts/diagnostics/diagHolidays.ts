/**
 * Walk PersistableHolidayService in the save's GameplaySaveSlotData and dump
 * each Holiday record + the calendar's day/season assignments. Tag numbers
 * are confirmed against the 3-year-old GameplaySaveData_pb2 schema; this
 * diagnostic surfaces drift if any field has been renumbered.
 *
 * Path: SaveGameData → field 2 (SaveSlotData) → field 8 (GameplaySaveSlotData)
 *       → field 19 (holiday_service: PersistableHolidayService)
 *       → field 1 (repeated Holiday) + field 2 (repeated HolidayCalendar)
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;
console.log(`0x0d: ${raw.length} bytes\n`);

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
function readU64LE(b: Uint8Array, p: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[p + i]) << BigInt(i * 8);
  return v;
}
function readTag(b: Uint8Array, p: number): [number, number, number] {
  const [tv, after] = readVarint(b, p);
  return [Number(tv >> 3n), Number(tv & 7n), after];
}
function findLD(b: Uint8Array, fieldNum: number): Uint8Array | null {
  let p = 0;
  while (p < b.length) {
    if (p >= b.length) return null;
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(b, p);
      return b.slice(afterLen, afterLen + Number(len));
    }
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}
function* iterLD(b: Uint8Array, fieldNum: number): Generator<Uint8Array> {
  let p = 0;
  while (p < b.length) {
    if (p >= b.length) return;
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(b, p);
      const ln = Number(len);
      yield b.slice(afterLen, afterLen + ln);
      p = afterLen + ln;
    } else if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return;
  }
}

const slot = findLD(raw, 2);
const gameSlot = slot ? findLD(slot, 8) : null;
if (!gameSlot) { console.error('No GameplaySaveSlotData'); process.exit(1); }

const holidaySvc = findLD(gameSlot, 19);
if (!holidaySvc) {
  console.log('No holiday_service at field 19 — scanning candidate top-level fields…');
  // Brute-force: scan every top-level ldelim field in gameSlot, look for one that
  // contains length-delimited sub-messages with the Holiday shape (varint holiday_type
  // followed by optional string name).
  let p = 0;
  const candidates: number[] = [];
  while (p < gameSlot.length) {
    const off = p;
    const [fn, wire, afterTag] = readTag(gameSlot, p);
    p = afterTag;
    if (wire === 2) {
      const [l, n] = readVarint(gameSlot, p);
      const ln = Number(l);
      if (ln > 4 && ln < 100000 && gameSlot[n] === 0x08) {
        candidates.push(fn);
      }
      p = n + ln;
    } else if (wire === 0) { const [, n] = readVarint(gameSlot, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
    void off;
  }
  console.log(`Candidate fields starting with varint: ${candidates.slice(0, 50).join(', ')}`);
  process.exit(0);
}

console.log(`PersistableHolidayService: ${holidaySvc.length} bytes\n`);

// Dump each Holiday (field 1)
let i = 0;
for (const h of iterLD(holidaySvc, 1)) {
  i++;
  console.log(`─── Holiday #${i} (${h.length} bytes) ───`);
  let p = 0;
  while (p < h.length) {
    const startOff = p;
    const [fn, wire, afterTag] = readTag(h, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(h, p); p = n;
      console.log(`  f${fn} varint = ${v}`);
    } else if (wire === 1) {
      console.log(`  f${fn} fixed64 = 0x${readU64LE(h, p).toString(16)}`);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(h, p);
      const ln = Number(l);
      const sub = h.slice(n, n + ln);
      const printable = ln > 0 && ln < 50 && Array.from(sub).every((b) => b >= 0x20 && b < 0x7f);
      if (printable) {
        console.log(`  f${fn} string = "${Buffer.from(sub).toString('utf-8')}"`);
      } else {
        const hex = Array.from(sub.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  f${fn} ldelim ${ln} bytes [${hex}${ln > 24 ? '…' : ''}]`);
      }
      p = n + ln;
    } else if (wire === 5) {
      p += 4;
    } else {
      console.log(`  f${fn} UNKNOWN wire ${wire} @ ${startOff}`);
      break;
    }
  }
}

console.log(`\nTotal Holiday records: ${i}\n`);

// Dump calendars (field 2)
let c = 0;
for (const cal of iterLD(holidaySvc, 2)) {
  c++;
  console.log(`─── Calendar #${c} (${cal.length} bytes) ───`);
  let p = 0;
  while (p < cal.length) {
    const [fn, wire, afterTag] = readTag(cal, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(cal, p); p = n;
      console.log(`  f${fn} varint = ${v}`);
    } else if (wire === 2) {
      const [l, n] = readVarint(cal, p);
      const ln = Number(l);
      const sub = cal.slice(n, n + ln);
      // Try to decode HolidayTimeData { holiday_id, day, season }
      let q = 0;
      const fields: string[] = [];
      while (q < sub.length) {
        const [fn2, w2, at2] = readTag(sub, q);
        q = at2;
        if (w2 === 0) { const [v2, n2] = readVarint(sub, q); q = n2; fields.push(`f${fn2}=${v2}`); }
        else if (w2 === 1) { fields.push(`f${fn2}=0x${readU64LE(sub, q).toString(16)}`); q += 8; }
        else if (w2 === 2) { const [l2, n2] = readVarint(sub, q); q = n2 + Number(l2); fields.push(`f${fn2}=ldelim(${l2})`); }
        else if (w2 === 5) q += 4;
        else break;
      }
      console.log(`  f${fn} ldelim ${ln} bytes: { ${fields.join(', ')} }`);
      p = n + ln;
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
  }
}
console.log(`\nTotal Calendar records: ${c}`);
