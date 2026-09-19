// READ-ONLY: look up the internal tuning NAMES for relationship-bit instance
// ids straight from the installed game's simulation packages. Tuning XML
// headers carry n="<internal name>" — settles what each bit actually is.
//   relBitNames.ts <instanceHex> [...]
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const want = new Set(process.argv.slice(2).map((h) => BigInt('0x' + h.replace(/^0x/, ''))));
const SIM_DIR = '/Applications/EA Games/The Sims 4.app/Contents/Data/Simulation';
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';
const pkgs: string[] = [];
for (const f of readdirSync(SIM_DIR)) if (f.endsWith('.package')) pkgs.push(join(SIM_DIR, f));
if (existsSync(PACKS_ROOT)) {
  for (const pack of readdirSync(PACKS_ROOT)) {
    const sim = join(PACKS_ROOT, pack, 'SimulationFullBuild0.package');
    if (existsSync(sim)) pkgs.push(sim);
  }
}
console.log(`searching ${pkgs.length} simulation packages for ${want.size} instance ids…`);
const found = new Map<string, string>();
for (const p of pkgs) {
  let resources;
  try {
    const file = readFileSync(p);
    resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  } catch { continue; }
  for (const r of resources) {
    const inst = (BigInt(r.instHi >>> 0) << 32n) | BigInt(r.instLo >>> 0);
    if (!want.has(inst)) continue;
    let d: Uint8Array;
    try { d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; } catch { continue; }
    const head = Buffer.from(d.slice(0, 400)).toString('utf8');
    const m = head.match(/n="([^"]+)"/);
    const cls = head.match(/c="([^"]+)"/);
    if (m) {
      const key = '0x' + inst.toString(16);
      if (!found.has(key)) {
        found.set(key, m[1]);
        console.log(`  ${key}  →  ${m[1]}  (class ${cls ? cls[1] : '?'})  [${p.split('/').slice(-3).join('/')}]`);
      }
    }
  }
}
for (const w of want) { const k = '0x' + w.toString(16); if (!found.has(k)) console.log(`  ${k}  →  NOT FOUND`); }
