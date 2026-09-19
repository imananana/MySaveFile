/**
 * Find ALL resources (any type) at a specific instance hex within a pack.
 * Used to locate the XML tuning that pairs with a known SimData.
 */
import { readFileSync, existsSync } from 'fs';
import { inflateSync } from 'zlib';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const APP_ROOT = '/Applications/EA Games/The Sims 4.app/Contents';
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';

const pack = process.env.PACK || 'EP15';
const instHex = process.env.INST || '0x534a1';
const instLo = parseInt(instHex, 16);

const paths = [
  `${PACKS_ROOT}/${pack}/ClientFullBuild0.package`,
  `${PACKS_ROOT}/${pack}/ClientFullBuild1.package`,
  `${PACKS_ROOT}/${pack}/SimulationFullBuild0.package`,
  `${PACKS_ROOT}/${pack}/SimulationFullBuild1.package`,
  `${APP_ROOT}/Delta/${pack}/ClientDeltaBuild0.package`,
  `${APP_ROOT}/Delta/${pack}/SimulationDeltaBuild0.package`,
];

for (const path of paths) {
  if (!existsSync(path)) continue;
  console.log(`\n${path}:`);
  const buf = readFileSync(path);
  const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const r of resources) {
    if (r.instHi !== 0 || r.instLo !== instLo) continue;
    const typeHex = '0x' + r.type.toString(16).toUpperCase().padStart(8, '0');
    const groupHex = '0x' + r.group.toString(16).toUpperCase().padStart(8, '0');
    console.log(`  type=${typeHex} group=${groupHex} compType=0x${r.compType.toString(16)} size=${r.data.length}`);

    // Try to decompress and read header
    let data: Uint8Array;
    try {
      const isZlib = r.data[0] === 0x78 && (r.data[1] === 0xda || r.data[1] === 0x9c || r.data[1] === 0x01);
      if (r.compType === 0xffff) data = new Uint8Array(decompressRefpack(r.data));
      else if (isZlib || r.compType === 0x5a42) data = new Uint8Array(inflateSync(Buffer.from(r.data)));
      else data = r.data;
    } catch { continue; }

    const head = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 400));
    const nameMatch = head.match(/n="([^"]+)"/);
    if (nameMatch) {
      console.log(`    n="${nameMatch[1]}"`);
    } else {
      console.log(`    head: ${head.slice(0, 120).replace(/[\x00-\x1f]/g, '.')}`);
    }
  }
}
