/**
 * Decompress one SimData resource and print every readable ASCII run (length≥4)
 * found inside it. Tuning class names and string keys are often embedded as raw
 * ASCII in SimData.
 */
import { readFileSync, existsSync } from 'fs';
import { inflateSync } from 'zlib';
import { parseDbpf } from '../../src/lib/dbpf.js';

const APP_ROOT = '/Applications/EA Games/The Sims 4.app/Contents';
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';

const pack = process.env.PACK || 'EP15';
const instHex = process.env.INST || '0x534a1';
const instLo = parseInt(instHex, 16);

const paths = [
  `${PACKS_ROOT}/${pack}/ClientFullBuild0.package`,
  `${PACKS_ROOT}/${pack}/SimulationFullBuild0.package`,
  `${APP_ROOT}/Delta/${pack}/ClientDeltaBuild0.package`,
];

for (const path of paths) {
  if (!existsSync(path)) continue;
  const buf = readFileSync(path);
  const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const r of resources) {
    if (r.instHi !== 0 || r.instLo !== instLo) continue;
    let data: Uint8Array;
    try {
      const isZlib = r.data[0] === 0x78 && (r.data[1] === 0xda || r.data[1] === 0x9c);
      data = isZlib ? new Uint8Array(inflateSync(Buffer.from(r.data))) : r.data;
    } catch (e) { console.log(`decompress error: ${e}`); continue; }

    console.log(`\n${path.split('/').slice(-2).join('/')}: ${data.length} bytes`);

    // Extract every printable ASCII run of length >= 4
    const runs: string[] = [];
    let cur = '';
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b >= 0x20 && b <= 0x7E) {
        cur += String.fromCharCode(b);
      } else {
        if (cur.length >= 4) runs.push(cur);
        cur = '';
      }
    }
    if (cur.length >= 4) runs.push(cur);

    for (const run of runs) console.log(`  "${run}"`);
    break;
  }
}
