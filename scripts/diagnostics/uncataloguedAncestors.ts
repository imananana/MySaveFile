/* Any ancestor node in these saves whose template is NOT in the catalog?
 * Those render as a nameless "Unknown". Run: npx tsx …/uncataloguedAncestors.ts <save...> */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanGenealogy } from '../../src/lib/parser/genealogy.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { PREMADE_ANCESTORS } from '../../src/data/premadeAncestors.js';

for (const p of process.argv.slice(2)) {
  const b = readFileSync(p);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const res = parseDbpf(buf);
  const d = parseSaveData(res);
  // the 0x0d master blob, same one saveParser scans
  const bufs: Uint8Array[] = [];
  for (const r of res.filter((r) => r.type === 0x0d)) {
    try { bufs.push(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch { /* skip */ }
  }
  const master = bufs.sort((a, b2) => b2.length - a.length)[0];
  if (!master) { console.log(`${p.split('/').pop()}: no master blob`); continue; }
  const gen = scanGenealogy(master, new Set(d.sims.map((s) => s.id)));
  const missing = new Map<number, number>();
  for (const [, tpl] of gen.ancestorTemplate) {
    if (!PREMADE_ANCESTORS['0x' + tpl.toString(16)]) missing.set(tpl, (missing.get(tpl) ?? 0) + 1);
  }
  console.log(`${d.saveName.padEnd(34)} genealogy records=${String(gen.records.size).padStart(4)}  ancestor nodes=${gen.ancestorTemplate.size}  uncatalogued templates=${missing.size}` +
    (missing.size ? `  → ${[...missing.keys()].map((t) => '0x' + t.toString(16)).join(', ')}` : ''));
}
