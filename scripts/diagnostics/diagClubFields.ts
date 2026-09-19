/**
 * Dump every top-level field of the "Meat Lovers" club to figure out
 * which field carries members and which carries hangout_zone_id (since
 * the 3-year-old schema's field numbers don't match the live game).
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;
const TARGET_NAME = process.env.TARGET || 'Meat Lovers';

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;

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

function findFieldLD(b: Uint8Array, fieldNum: number): Uint8Array | null {
  const targetTag = (fieldNum << 3) | 2;
  let p = 0;
  while (p < b.length) {
    const tagByte = b[p++];
    if (tagByte === 0) return null;
    if (tagByte === targetTag) {
      const [len, after] = readVarint(b, p);
      return b.slice(after, after + Number(len));
    }
    const wire = tagByte & 7;
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}
function* iterFieldLD(b: Uint8Array, fieldNum: number): Generator<Uint8Array> {
  const targetTag = (fieldNum << 3) | 2;
  let p = 0;
  while (p < b.length) {
    const tagByte = b[p++];
    if (tagByte === 0) return;
    if (tagByte === targetTag) {
      const [len, after] = readVarint(b, p);
      const ln = Number(len);
      yield b.slice(after, after + ln);
      p = after + ln;
    } else {
      const wire = tagByte & 7;
      if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
      else if (wire === 1) p += 8;
      else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
      else if (wire === 5) p += 4;
      else return;
    }
  }
}

const slot = findFieldLD(raw, 2)!;
const gameSlot = findFieldLD(slot, 8)!;
const clubSvc = findFieldLD(gameSlot, 7)!;

let target: Uint8Array | null = null;
for (const club of iterFieldLD(clubSvc, 3)) {
  const nameBytes = findFieldLD(club, 2);
  if (nameBytes && Buffer.from(nameBytes).toString('utf-8') === TARGET_NAME) {
    target = club;
    break;
  }
}
if (!target) { console.error(`Club "${TARGET_NAME}" not found`); process.exit(1); }

console.log(`Found "${TARGET_NAME}" club: ${target.length} bytes\n`);
console.log('FIELD#  WIRE  TAG    OFFSET    LENGTH   PREVIEW');
console.log('─'.repeat(100));

let p = 0;
while (p < target.length) {
  const startOff = p;
  // Protobuf tags are varints — must read as varint, not single byte (breaks for fields ≥ 16)
  const [tagVal, afterTag] = readVarint(target, p);
  if (tagVal === 0n) break;
  p = afterTag;
  const fieldNum = Number(tagVal >> 3n);
  const wire = Number(tagVal & 7n);

  let preview = '';
  let len = 0;
  if (wire === 0) {
    const [v, n] = readVarint(target, p);
    preview = `varint=${v}`;
    len = n - startOff;
    p = n;
  } else if (wire === 1) {
    const val = readU64LE(target, p);
    preview = `fixed64=0x${val.toString(16)} (${val})`;
    len = 9;
    p += 8;
  } else if (wire === 2) {
    const [l, after] = readVarint(target, p);
    const ln = Number(l);
    const sub = target.slice(after, after + ln);
    // Try to render as ASCII or hex
    const printable = ln > 0 && Array.from(sub.slice(0, Math.min(40, ln))).every((b) => b >= 0x20 && b < 0x7f);
    if (printable && ln < 50) {
      preview = `string="${Buffer.from(sub).toString('utf-8')}"`;
    } else {
      const hex = Array.from(sub.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      preview = `ldelim (${ln} bytes) [${hex}${ln > 24 ? '…' : ''}]`;
    }
    len = (after - startOff) + ln;
    p = after + ln;
  } else if (wire === 5) {
    const val = target[p] | (target[p+1] << 8) | (target[p+2] << 16) | (target[p+3] << 24);
    preview = `fixed32=0x${val.toString(16)}`;
    len = 5;
    p += 4;
  } else {
    preview = `UNKNOWN wire=${wire}`;
    break;
  }

  console.log(
    String(fieldNum).padStart(6),
    `  ${wire}`,
    `  tag=${Number(tagVal)}`.padEnd(10),
    `0x${startOff.toString(16).padStart(7, '0')}`,
    `  ${String(len).padStart(6)}   ${preview}`,
  );
}
