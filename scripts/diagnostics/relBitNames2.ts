// READ-ONLY: find tuning names by searching COMBINED TUNING resources
// (type 0x62E94D38) in the game's simulation packages for s="<decimal id>"
// attributes, then read back the n="..." name on the same XML element.
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { inflateSync, inflateRawSync } from 'zlib';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const ids = process.argv.slice(2).map((h) => BigInt('0x' + h.replace(/^0x/, '')));
const needles = ids.map((v) => ({ id: '0x' + v.toString(16), pat: `s="${v.toString()}"` }));
const pkgs: string[] = [];
const SIM_DIR = '/Applications/EA Games/The Sims 4.app/Contents/Data/Simulation';
for (const f of readdirSync(SIM_DIR)) if (f.endsWith('.package')) pkgs.push(join(SIM_DIR, f));
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';
if (existsSync(PACKS_ROOT)) for (const pack of readdirSync(PACKS_ROOT)) {
  const sim = join(PACKS_ROOT, pack, 'SimulationFullBuild0.package');
  if (existsSync(sim)) pkgs.push(sim);
}
const DELTA = '/Applications/EA Games/The Sims 4.app/Contents/Delta';
if (existsSync(DELTA)) for (const d of readdirSync(DELTA)) {
  const p = join(DELTA, d, 'SimulationDeltaBuild0.package');
  if (existsSync(p)) pkgs.push(p);
}

const found = new Map<string, string>();
function tryDecompress(r: { compType: number; data: Uint8Array }): Uint8Array | null {
  try {
    if (r.compType === 0xffff) return decompressRefpack(r.data);
    if (r.compType === 0x5a42) { try { return inflateSync(r.data); } catch { return inflateRawSync(r.data); } }
    if (r.compType === 0x0000) return r.data;
    try { return inflateSync(r.data); } catch { return null; }
  } catch { return null; }
}
outer:
for (const p of pkgs) {
  let resources;
  try { const f = readFileSync(p); resources = parseDbpf(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength)); } catch { continue; }
  const combined = resources.filter((r) => (r.type >>> 0) === 0x62e94d38);
  for (const r of combined) {
    const d = tryDecompress(r); if (!d) continue;
    const txt = Buffer.from(d).toString('latin1');
    for (const n of needles) {
      if (found.has(n.id)) continue;
      let idx = txt.indexOf(n.pat);
      while (idx !== -1) {
        const elStart = txt.lastIndexOf('<I ', idx);
        const ctx = elStart !== -1 ? txt.slice(elStart, idx + n.pat.length) : txt.slice(Math.max(0, idx - 300), idx + n.pat.length);
        const nm = ctx.match(/n="([^"]+)"/); const cls = ctx.match(/c="([^"]+)"/);
        if (nm && elStart !== -1) { found.set(n.id, `${nm[1]}  (class ${cls ? cls[1] : '?'})  [${p.split('/').slice(-2).join('/')}]`); break; }
        idx = txt.indexOf(n.pat, idx + 1);
      }
    }
    if (found.size === needles.length) break outer;
  }
}
for (const n of needles) console.log(`  ${n.id.padEnd(9)} →  ${found.get(n.id) ?? 'NOT FOUND'}`);
