/**
 * Search EVERY DBPF resource (decompressed) for the icon instance bytes
 * + the club name, to figure out which resource type the clubs blob lives in.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;
const NEEDLE = process.env.NEEDLE || 'Power House';
const ICON_HEX = process.env.ICON_HEX || 'fbc3b4dd6767c0f0';

console.log(`Loading: ${SAVE}\nNeedle: "${NEEDLE}"\nIcon hex: ${ICON_HEX}\n`);

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const needleBytes = Buffer.from(NEEDLE, 'utf-8');
const iconBE = Buffer.from(ICON_HEX, 'hex');
const iconLE = Buffer.from(iconBE).reverse();

function findInBuf(haystack: Uint8Array, needle: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let m = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { m = false; break; }
    }
    if (m) out.push(i);
  }
  return out;
}

const hits = new Map<number, { needle: number; iconBE: number; iconLE: number; samples: { resIdx: number; offsets: number[] }[] }>();

for (let idx = 0; idx < resources.length; idx++) {
  const r = resources[idx];
  let data = r.data;
  if (r.compType === 0xffff) {
    try { data = decompressRefpack(r.data); } catch { /* skip */ }
  }
  const nHits = findInBuf(data, needleBytes);
  const beHits = findInBuf(data, iconBE);
  const leHits = findInBuf(data, iconLE);
  if (!nHits.length && !beHits.length && !leHits.length) continue;

  const e = hits.get(r.type) ?? { needle: 0, iconBE: 0, iconLE: 0, samples: [] };
  e.needle += nHits.length;
  e.iconBE += beHits.length;
  e.iconLE += leHits.length;
  if (e.samples.length < 3) {
    e.samples.push({ resIdx: idx, offsets: [...nHits.slice(0, 2), ...beHits.slice(0, 2), ...leHits.slice(0, 2)] });
  }
  hits.set(r.type, e);
}

console.log('TYPE         NAME HITS  ICON_BE  ICON_LE  SAMPLES');
console.log('─'.repeat(80));
for (const [type, e] of hits) {
  const typeHex = '0x' + type.toString(16).padStart(8, '0');
  const samples = e.samples.map((s) => `res#${s.resIdx} @ ${s.offsets.map((o) => '0x' + o.toString(16)).join(',')}`).join(' | ');
  console.log(`${typeHex}  ${String(e.needle).padStart(9)}  ${String(e.iconBE).padStart(7)}  ${String(e.iconLE).padStart(7)}  ${samples}`);
}

if (hits.size === 0) {
  console.log('NO MATCHES anywhere. Trying without decompression…');
}
