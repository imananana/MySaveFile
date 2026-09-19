/**
 * Walk GameplaySaveSlotData.field 10 (BusinessServiceData) and dump every
 * top-level field + every repeated sub-record. Goal: find Sunny Babies and
 * identify how name, owner, and lot are laid out.
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

function dumpFields(label: string, b: Uint8Array, indent = '') {
  console.log(`${indent}═══ ${label} (${b.length} bytes) ═══`);
  let p = 0;
  while (p < b.length) {
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(b, p);
      console.log(`${indent}  f${fn} varint = ${v}`);
      p = n;
    } else if (wire === 1) {
      const val = readU64LE(b, p);
      console.log(`${indent}  f${fn} fixed64 = 0x${val.toString(16)} (${val})`);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(b, p);
      const ln = Number(l);
      const sub = b.slice(n, n + ln);
      const printable = ln > 0 && ln < 80 && Array.from(sub).every((b) => b >= 0x20 && b < 0x7f);
      if (printable) {
        console.log(`${indent}  f${fn} string = "${Buffer.from(sub).toString('utf-8')}"`);
      } else {
        const hex = Array.from(sub.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`${indent}  f${fn} ldelim ${ln} bytes [${hex}${ln > 24 ? '…' : ''}]`);
      }
      p = n + ln;
    } else if (wire === 5) p += 4;
    else break;
  }
}

const slot = findLD(raw, 2)!;
const gameSlot = findLD(slot, 8)!;
const biz = findLD(gameSlot, 10);
if (!biz) { console.error('No field 10 in GameplaySaveSlotData'); process.exit(1); }
console.log(`BusinessServiceData: ${biz.length} bytes\n`);

// Dump top-level. Then for each repeated ldelim sub-record, recurse one level.
let p = 0;
let recordIdx = 0;
while (p < biz.length) {
  const [fn, wire, afterTag] = readTag(biz, p);
  p = afterTag;
  if (wire === 0) { const [, n] = readVarint(biz, p); p = n; }
  else if (wire === 1) p += 8;
  else if (wire === 2) {
    const [l, n] = readVarint(biz, p);
    const ln = Number(l);
    const sub = biz.slice(n, n + ln);
    recordIdx++;
    console.log(`\n─── BusinessServiceData record #${recordIdx} (f${fn}, ${ln} bytes) ───`);
    dumpFields('Record', sub, '  ');

    // For each sub-message inside the record, drill one more level
    let q = 0;
    while (q < sub.length) {
      const [fn2, wire2, afterTag2] = readTag(sub, q);
      q = afterTag2;
      if (wire2 === 2) {
        const [l2, n2] = readVarint(sub, q);
        const ln2 = Number(l2);
        const sub2 = sub.slice(n2, n2 + ln2);
        if (ln2 > 8) {
          // Only recurse into reasonable-size sub-fields
          dumpFields(`Record f${fn} → f${fn2}`, sub2, '    ');
        }
        q = n2 + ln2;
      }
      else if (wire2 === 0) { const [, nn] = readVarint(sub, q); q = nn; }
      else if (wire2 === 1) q += 8;
      else if (wire2 === 5) q += 4;
      else break;
    }
    p = n + ln;
  } else if (wire === 5) p += 4;
  else break;
}
