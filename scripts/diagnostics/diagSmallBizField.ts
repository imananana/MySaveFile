/**
 * Dump every top-level field of GameplaySaveSlotData with length > 50 bytes
 * and field number >= 39 (i.e. services added since the 3-year-old protobuf
 * cutoff). Small business is likely one of these. Also tries to decode each
 * candidate as a "PersistableXxxService" — usually starts with a varint/bool
 * header then a repeated entity list.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;

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
function readTag(b: Uint8Array, p: number): [number, number, number] {
  const [tv, after] = readVarint(b, p);
  return [Number(tv >> 3n), Number(tv & 7n), after];
}
function findLD(b: Uint8Array, fieldNum: number) {
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

const slot = findLD(raw, 2)!;
const gameSlot = findLD(slot, 8)!;
console.log(`GameplaySaveSlotData: ${gameSlot.length} bytes\n`);

let p = 0;
console.log('FIELD#  WIRE  LENGTH    FIRST BYTES');
console.log('─'.repeat(80));
while (p < gameSlot.length) {
  const [fn, wire, afterTag] = readTag(gameSlot, p);
  p = afterTag;
  if (wire === 0) { const [, n] = readVarint(gameSlot, p); p = n; }
  else if (wire === 1) p += 8;
  else if (wire === 2) {
    const [l, n] = readVarint(gameSlot, p);
    const ln = Number(l);
    if (fn >= 39 && ln > 50) {
      const hex = Array.from(gameSlot.slice(n, n + Math.min(48, ln))).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`  f${String(fn).padEnd(4)} ${wire}     ${String(ln).padStart(6)}    ${hex}${ln > 48 ? '…' : ''}`);
    }
    p = n + ln;
  } else if (wire === 5) p += 4;
  else break;
}
