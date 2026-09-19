/**
 * For each business record, find which (if any) library icon hex appears
 * inside it and where (which field tag immediately precedes the varint).
 * That's the field that stores the picked icon.
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
function encodeVarint(value: bigint): Uint8Array {
  const out: number[] = [];
  while (value > 0x7fn) {
    out.push(Number((value & 0x7fn) | 0x80n));
    value >>= 7n;
  }
  out.push(Number(value));
  return new Uint8Array(out);
}

const slot = findLD(raw, 2)!;
const gameSlot = findLD(slot, 8)!;
const biz = findLD(gameSlot, 10)!;

const iconBytesById = new Map<string, Uint8Array>();
for (const h of SMALL_BUSINESS_ICONS) iconBytesById.set(h, encodeVarint(BigInt('0x' + h)));

// Walk each top-level record (f1) inside BusinessServiceData
let p = 0;
let idx = 0;
while (p < biz.length) {
  const [fn, wire, afterTag] = readTag(biz, p);
  p = afterTag;
  if (wire === 2 && fn === 1) {
    const [l, n] = readVarint(biz, p);
    const ln = Number(l);
    const rec = biz.slice(n, n + ln);
    idx++;

    // Find name first
    let name = '?';
    {
      // wrapper at record.f3 or record.f8
      const w3 = findLD(rec, 3);
      const w8 = findLD(rec, 8);
      const wrapper = w3 || w8;
      if (wrapper) {
        const sb = findLD(wrapper, 2);
        if (sb) {
          const inner = findLD(sb, 21);
          if (inner) {
            const nameBytes = findLD(inner, 5);
            if (nameBytes) name = new TextDecoder().decode(nameBytes);
          }
        }
      }
    }

    // For each library hex, search within rec
    const matches: string[] = [];
    for (const [hex, bytes] of iconBytesById) {
      let i = 0;
      let found = -1;
      for (; i <= rec.length - bytes.length; i++) {
        let m = true;
        for (let j = 0; j < bytes.length; j++) {
          if (rec[i + j] !== bytes[j]) { m = false; break; }
        }
        if (m) { found = i; break; }
      }
      if (found >= 0) {
        // Look at the preceding bytes to identify the tag/wrapper
        const beforeHex = Array.from(rec.slice(Math.max(0, found - 6), found))
          .map((b) => b.toString(16).padStart(2, '0')).join(' ');
        matches.push(`${hex} @ 0x${found.toString(16)} preceded by [${beforeHex}]`);
      }
    }
    console.log(`Record #${idx} "${name}" (${ln} bytes): ${matches.length} library hex hits`);
    for (const m of matches) console.log(`  ${m}`);

    p = n + ln;
  } else if (wire === 0) { const [, n] = readVarint(biz, p); p = n; }
  else if (wire === 1) p += 8;
  else if (wire === 2) { const [l, n] = readVarint(biz, p); p = n + Number(l); }
  else if (wire === 5) p += 4;
  else break;
}
