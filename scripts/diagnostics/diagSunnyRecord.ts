/**
 * Find the BusinessServiceData record that contains "Sunny Babies" and
 * recursively walk every field, printing strings, ResourceKey instances,
 * and varint/fixed64 values so we can identify name / owner / lot / icon /
 * venue-type field positions.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;
const NEEDLE = process.env.NEEDLE || 'Sunny Babies';

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
function readTag(b: Uint8Array, p: number): [number, number, number] {
  const [tv, after] = readVarint(b, p);
  return [Number(tv >> 3n), Number(tv & 7n), after];
}
function findLD(b: Uint8Array, fieldNum: number) {
  let p = 0;
  while (p < b.length) {
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
const biz = findLD(gameSlot, 10)!;

// Find which top-level record (f1, repeated) of biz contains the needle.
const nb = Buffer.from(NEEDLE, 'utf-8');
let targetRecord: Uint8Array | null = null;
let recordIdx = 0;
{
  let p = 0;
  while (p < biz.length) {
    const [fn, wire, afterTag] = readTag(biz, p);
    p = afterTag;
    if (wire === 2 && fn === 1) {
      const [l, n] = readVarint(biz, p);
      const ln = Number(l);
      const sub = biz.slice(n, n + ln);
      recordIdx++;
      let found = false;
      for (let i = 0; i <= sub.length - nb.length; i++) {
        let m = true;
        for (let j = 0; j < nb.length; j++) {
          if (sub[i + j] !== nb[j]) { m = false; break; }
        }
        if (m) { found = true; break; }
      }
      if (found) { targetRecord = sub; break; }
      p = n + ln;
    } else if (wire === 0) { const [, n] = readVarint(biz, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(biz, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else break;
  }
}
if (!targetRecord) { console.error(`No record containing "${NEEDLE}"`); process.exit(1); }
console.log(`Found "${NEEDLE}" in BusinessServiceData record #${recordIdx} (${targetRecord.length} bytes)\n`);

// Heuristic to detect a ResourceKey sub-msg: { f1 varint (type), f2 varint (group=0 usually), f3 varint (instance uint64) }.
function tryDecodeResourceKey(sub: Uint8Array): string | null {
  let p = 0;
  let type = 0n, group = 0n, instance = 0n;
  let sawF1 = false, sawF3 = false;
  while (p < sub.length) {
    if (p >= sub.length) break;
    const [fn, wire, afterTag] = readTag(sub, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(sub, p);
      p = n;
      if (fn === 1) { type = v; sawF1 = true; }
      else if (fn === 2) group = v;
      else if (fn === 3) { instance = v; sawF3 = true; }
      else return null;
    } else if (wire === 1) {
      if (fn === 3) { instance = readU64LE(sub, p); sawF3 = true; }
      p += 8;
    } else return null;
  }
  if (!sawF1 || !sawF3) return null;
  return `RK{type=0x${type.toString(16)} group=${group} instance=0x${instance.toString(16)}}`;
}

function walk(b: Uint8Array, indent: string, depth: number) {
  if (depth > 6) {
    console.log(`${indent}…(depth limit)`);
    return;
  }
  let p = 0;
  while (p < b.length) {
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(b, p);
      p = n;
      console.log(`${indent}f${fn} varint = ${v}`);
    } else if (wire === 1) {
      const val = readU64LE(b, p);
      console.log(`${indent}f${fn} fixed64 = 0x${val.toString(16)} (${val})`);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(b, p);
      const ln = Number(l);
      const sub = b.slice(n, n + ln);
      const printable = ln > 0 && ln < 200 && Array.from(sub).every((b) => b >= 0x20 && b < 0x7f);
      if (printable) {
        console.log(`${indent}f${fn} string = "${Buffer.from(sub).toString('utf-8').slice(0, 80)}"`);
      } else {
        const rk = tryDecodeResourceKey(sub);
        if (rk) {
          console.log(`${indent}f${fn} ${rk}`);
        } else if (ln <= 12) {
          const hex = Array.from(sub).map((b) => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`${indent}f${fn} ldelim ${ln} bytes [${hex}]`);
        } else {
          console.log(`${indent}f${fn} ldelim ${ln} bytes:`);
          walk(sub, indent + '  ', depth + 1);
        }
      }
      p = n + ln;
    } else if (wire === 5) p += 4;
    else break;
  }
}

walk(targetRecord, '', 0);
