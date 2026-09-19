/**
 * Search decompressed 0x0d in multiple saves for a string needle.
 * Prints which save(s) contain it + offsets.
 */
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVES_DIR = `${HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const NEEDLE = process.env.NEEDLE || 'CustomVenuePresetTest';

const needleBytes = Buffer.from(NEEDLE, 'utf8');

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

const files = readdirSync(SAVES_DIR).filter((f) => /^Slot_[0-9a-f]+\.save$/i.test(f));
console.log(`Searching ${files.length} saves for "${NEEDLE}"…\n`);

for (const f of files) {
  try {
    const buf = readFileSync(`${SAVES_DIR}/${f}`);
    const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const r0d = resources.find((r) => r.type === 0x0d);
    if (!r0d) continue;
    const data = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;
    const hits = findAll(data, needleBytes);
    if (hits.length) {
      console.log(`  ${f}: ${hits.length} hit(s) at ${hits.map((h) => '0x' + h.toString(16)).join(', ')}`);
    }
  } catch (e) {
    // skip
  }
}
