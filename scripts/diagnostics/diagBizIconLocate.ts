/**
 * For each business record in the save, search the WHOLE record bytes
 * for any of the renamed library icon hexes (both as raw bytes LE/BE and
 * as varint-encoded values). If any appear, print where — that's the
 * field our parser should be reading.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';
import { SMALL_BUSINESS_ICONS } from '../src/data/smallBusinessIcons.js';

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

// Encode a uint64 hex string as a varint byte sequence (what protobuf would write).
function encodeVarint(value: bigint): Uint8Array {
  const out: number[] = [];
  while (value > 0x7fn) {
    out.push(Number((value & 0x7fn) | 0x80n));
    value >>= 7n;
  }
  out.push(Number(value));
  return new Uint8Array(out);
}
function encodeFixed64LE(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  return out;
}

function findAll(haystack: Uint8Array, needle: Uint8Array): number[] {
  const hits: number[] = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let m = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { m = false; break; }
    }
    if (m) hits.push(i);
  }
  return hits;
}

const slot = findLD(raw, 2)!;
const gameSlot = findLD(slot, 8)!;
const biz = findLD(gameSlot, 10)!;

console.log(`Searching ${SMALL_BUSINESS_ICONS.length} library icon hexes in BusinessServiceData (${biz.length} bytes)…\n`);

let found = 0;
for (const hexStr of SMALL_BUSINESS_ICONS) {
  const v = BigInt('0x' + hexStr);
  const varintBytes = encodeVarint(v);
  const fixed64Bytes = encodeFixed64LE(v);

  const varintHits = findAll(biz, varintBytes);
  const fixed64Hits = findAll(biz, fixed64Bytes);

  if (varintHits.length || fixed64Hits.length) {
    found++;
    console.log(`${hexStr}:`);
    if (varintHits.length) console.log(`  varint @ ${varintHits.map((o) => '0x' + o.toString(16)).join(', ')}`);
    if (fixed64Hits.length) console.log(`  fixed64 @ ${fixed64Hits.map((o) => '0x' + o.toString(16)).join(', ')}`);
  }
}
console.log(`\n${found} of ${SMALL_BUSINESS_ICONS.length} library hexes appear inside business records.`);
