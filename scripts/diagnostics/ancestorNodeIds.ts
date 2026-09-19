/* Are the premade-ancestor node ids stable across two save FILES of the same
 * world (the in-game "Save As" case)? If they drift, a re-sync onto the new file
 * imports every dead ancestor a second time instead of matching the existing one.
 * Prints template id -> ancestor node id per save, then diffs the two.
 * Run: npx tsx scripts/diagnostics/ancestorNodeIds.ts <saveA> <saveB> */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { PREMADE_ANCESTORS } from '../../src/data/premadeAncestors.js';

function nodesOf(path: string) {
  const b = readFileSync(path);
  const d = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  // saveParser injects ancestors as synthetic sims; recover template->node by
  // matching the synthetic sim's name back to the catalog.
  const byName = new Map<string, string>();
  for (const [tpl, cat] of Object.entries(PREMADE_ANCESTORS)) byName.set(cat.name, tpl);
  const out = new Map<string, bigint>();   // template id -> node id
  for (const s of d.sims) {
    const full = `${s.firstName} ${s.lastName}`.trim();
    const tpl = byName.get(full);
    if (tpl && s.isGhost && !out.has(tpl)) out.set(tpl, s.id);
  }
  return { name: d.saveName, nodes: out };
}

const [pa, pb] = process.argv.slice(2);
const A = nodesOf(pa);
const B = nodesOf(pb);
console.log(`A = "${A.name}"  (${A.nodes.size} ancestors)`);
console.log(`B = "${B.name}"  (${B.nodes.size} ancestors)\n`);

let same = 0, diff = 0, onlyA = 0;
for (const [tpl, idA] of A.nodes) {
  const idB = B.nodes.get(tpl);
  if (idB === undefined) { onlyA++; continue; }
  if (idA === idB) same++;
  else {
    diff++;
    if (diff <= 6) {
      console.log(`  ${(PREMADE_ANCESTORS[tpl]?.name ?? tpl).padEnd(24)} A=0x${idA.toString(16)}  B=0x${idB.toString(16)}`);
    }
  }
}
console.log(`\nsame id: ${same}   different id: ${diff}   only in A: ${onlyA}`);
console.log(diff === 0
  ? 'STABLE — a re-sync onto the other file matches the ancestors already stored.'
  : 'DRIFTS — a re-sync onto the other file would import these ancestors again.');
