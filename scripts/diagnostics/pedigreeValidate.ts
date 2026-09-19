/**
 * Validates the full-pedigree ahnentafel reconstruction in saveParser against
 * the trusted relationsFor() derivation across an ENTIRE save. For every sim it
 * compares grandparents computed two ways:
 *   A) relationsFor(graph).grandparents  — existing, trusted (parent-of-parent + idx≥2 known)
 *   B) parents-of-parents over the NEW reconstructed familyFacts edges
 * Any mismatch (over a known-record grandparent) means the index arithmetic is
 * wrong. Also reports stub/edge volume so we can see the change didn't explode.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/pedigreeValidate.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily, scanPairRelationships, buildFamilyGraph, relationsFor } from '../../src/lib/parser/family.js';
import { planFamilyImport } from '../../src/lib/gameImport/familyImport.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const hx = (id: bigint) => '0x' + id.toString(16);

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const humanIds = new Set(data.sims.filter((s) => s.species === 'human').map((s) => s.id));
const graph = buildFamilyGraph(scanFamily(blob!, humanIds), scanPairRelationships(blob!, humanIds));

// Reconstructed edges (the NEW path): parents-of-parents over familyFacts.
const facts = data.familyFacts;
const parentsOf = (h: string) => facts.bySim[h]?.parents ?? [];
let checked = 0, mismatch = 0;
const examples: string[] = [];
for (const s of data.sims) {
  if (s.species !== 'human') continue;
  const truth = new Set(relationsFor(graph, s.id).grandparents.map(hx)); // trusted, known-record gps
  const mine = new Set<string>();
  for (const p of parentsOf(hx(s.id))) for (const gp of parentsOf(p)) mine.add(gp);
  // only compare grandparents that ARE known records (relationsFor only lists those)
  const mineKnown = new Set([...mine].filter((g) => { try { return simById.has(BigInt(g)); } catch { return false; } }));
  checked++;
  // truth ⊆ mineKnown? (we should recover at least everything relationsFor finds)
  const missing = [...truth].filter((g) => !mineKnown.has(g));
  const extra = [...mineKnown].filter((g) => !truth.has(g));
  if (missing.length || extra.length) {
    mismatch++;
    if (examples.length < 12) examples.push(`${s.firstName} ${s.lastName} ${hx(s.id)} — missing:[${missing.join(',')}] extra:[${extra.join(',')}]`);
  }
}
console.log(`Save: ${savePath.split('/').pop()}`);
console.log(`Grandparent cross-check over ${checked} human sims: ${mismatch} mismatch(es).`);
for (const e of examples) console.log('  ⚠ ' + e);

// Volume check: whole-save import plan.
const allImported = data.sims.filter((s) => s.species === 'human').map((s) => hx(s.id));
const plan = planFamilyImport(facts, data.sims, allImported);
const byType = new Map<string, number>();
for (const e of plan.edges) byType.set(e.relType, (byType.get(e.relType) ?? 0) + 1);
console.log(`\nWhole-save import plan: ${plan.edges.length} edges, ${plan.stubs.length} stubs, ${plan.treeOnly.length} tree_only`);
for (const [t, c] of [...byType].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${c}`);
