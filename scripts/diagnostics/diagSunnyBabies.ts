/**
 * Find "Sunny Babies" inside BusinessServiceData and dump 256 bytes of
 * surrounding context. The name string is somewhere nested inside a
 * record's f8 sub-message; we want to see the protobuf field number
 * that wraps it.
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

const nb = Buffer.from(NEEDLE, 'utf-8');
const hits: number[] = [];
for (let i = 0; i <= raw.length - nb.length; i++) {
  let m = true;
  for (let j = 0; j < nb.length; j++) {
    if (raw[i + j] !== nb[j]) { m = false; break; }
  }
  if (m) hits.push(i);
}

function hexdump(start: number, length: number) {
  const end = Math.min(start + length, raw.length);
  for (let row = Math.max(0, start - 32); row < end; row += 16) {
    const slice = raw.slice(row, Math.min(row + 16, end));
    const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(48);
    const ascii = Array.from(slice).map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    console.log(`${row.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
  }
}

for (const h of hits) {
  console.log(`\n═══ "${NEEDLE}" @ 0x${h.toString(16)} (length-prefix one byte before is 0x${raw[h-1].toString(16)}, tag two before is 0x${raw[h-2].toString(16)}) ═══`);
  hexdump(h, nb.length + 64);
}
