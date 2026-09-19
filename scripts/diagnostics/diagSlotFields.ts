/**
 * Dump every top-level field in SaveSlotData (0x0d → field 2) with field
 * number, wire type, and byte length. Helps identify where clubs/holidays
 * actually live if the published schema field numbers don't match.
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

function findFieldLD(b: Uint8Array, fieldNum: number) {
  const targetTag = (fieldNum << 3) | 2;
  let p = 0;
  while (p < b.length) {
    const tagByte = b[p++];
    if (tagByte === 0) return null;
    const wire = tagByte & 7;
    if (tagByte === targetTag) {
      const [len, after] = readVarint(b, p);
      const ln = Number(len);
      return b.slice(after, after + ln);
    }
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}

const slot = findFieldLD(raw, 2);
if (!slot) { console.error('no SaveSlotData'); process.exit(1); }
console.log(`SaveSlotData: ${slot.length} bytes\n`);

// Walk every top-level field
interface Field { fieldNum: number; wire: number; offset: number; length: number; preview: string }
const fields: Field[] = [];

let p = 0;
while (p < slot.length) {
  const startOff = p;
  const tagByte = slot[p++];
  if (tagByte === 0) break;
  const fieldNum = tagByte >> 3;
  const wire = tagByte & 7;

  if (wire === 0) {
    const [v, n] = readVarint(slot, p);
    fields.push({ fieldNum, wire, offset: startOff, length: n - startOff, preview: `varint=${v}` });
    p = n;
  } else if (wire === 1) {
    const hex = Array.from(slot.slice(p, p + 8)).map((b) => b.toString(16).padStart(2, '0')).join('');
    fields.push({ fieldNum, wire, offset: startOff, length: 9, preview: `fixed64=0x${hex}` });
    p += 8;
  } else if (wire === 2) {
    const [l, after] = readVarint(slot, p);
    const ln = Number(l);
    const sub = slot.slice(after, after + ln);
    // preview: try ASCII printable run or first 16 hex
    const printable = Array.from(sub.slice(0, 32)).every((b) => b >= 0x20 && b < 0x7f);
    const preview = printable
      ? `string="${Buffer.from(sub.slice(0, 32)).toString('utf-8')}"`
      : `bytes=[${Array.from(sub.slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}…]`;
    fields.push({ fieldNum, wire, offset: startOff, length: (after - startOff) + ln, preview });
    p = after + ln;
  } else if (wire === 5) {
    const hex = Array.from(slot.slice(p, p + 4)).map((b) => b.toString(16).padStart(2, '0')).join('');
    fields.push({ fieldNum, wire, offset: startOff, length: 5, preview: `fixed32=0x${hex}` });
    p += 4;
  } else {
    break;
  }
}

console.log(`Top-level fields in SaveSlotData (${fields.length} total):\n`);
console.log('FIELD#  WIRE  TAG    OFFSET    LENGTH      PREVIEW');
console.log('─'.repeat(100));
for (const f of fields) {
  const tag = (f.fieldNum << 3) | f.wire;
  console.log(
    String(f.fieldNum).padStart(6),
    `  ${f.wire}`,
    `  0x${tag.toString(16).padStart(2, '0')}`,
    `  0x${f.offset.toString(16).padStart(7, '0')}`,
    `  ${String(f.length).padStart(8)}    ${f.preview}`,
  );
}
