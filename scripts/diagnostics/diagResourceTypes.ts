/**
 * Lists every DBPF resource type in a save with count + total bytes,
 * plus a hex/ASCII preview of one sample of each. Used to figure out
 * which resource type holds which game data (clubs, holidays, etc.).
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;

console.log(`Loading save: ${SAVE}\n`);
const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

interface Stat {
  count: number;
  totalBytes: number;
  sample: { instLo: number; data: Uint8Array; compType: number };
}
const byType = new Map<number, Stat>();
for (const r of resources) {
  const e = byType.get(r.type) ?? { count: 0, totalBytes: 0, sample: { instLo: r.instLo, data: r.data, compType: r.compType } };
  e.count++;
  e.totalBytes += r.data.length;
  // Keep the smallest sample (more likely to be diagnostic)
  if (r.data.length < e.sample.data.length) {
    e.sample = { instLo: r.instLo, data: r.data, compType: r.compType };
  }
  byType.set(r.type, e);
}

const sorted = [...byType.entries()].sort((a, b) => b[1].count - a[1].count);

console.log('TYPE         COUNT    BYTES    SAMPLE PREVIEW');
console.log('─'.repeat(90));
for (const [type, stat] of sorted) {
  const typeHex = '0x' + type.toString(16).padStart(8, '0');
  let preview = stat.sample.data.slice(0, 32);
  // Try to decompress if RefPack
  if (stat.sample.compType === 0xffff) {
    try {
      const raw = decompressRefpack(stat.sample.data);
      preview = raw.slice(0, 32);
    } catch { /* leave compressed */ }
  }
  const hex = Array.from(preview).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(preview).map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
  console.log(`${typeHex}  ${String(stat.count).padStart(5)}  ${String(stat.totalBytes).padStart(8)}  ${hex.slice(0, 47)}  ${ascii}`);
}
