/**
 * READ-ONLY lineage stress-metrics for the family-tree UI spike. Measures how
 * deep / wide / death-laden a real save's genealogy actually is, so the HTML
 * mockups can be populated with true numbers instead of guesses.
 *
 * Reports:
 *   - max generation depth (longest ancestor chain + longest descendant chain)
 *   - biggest sibling set and biggest children set (the breadth peaks)
 *   - ghost count (isGhost) vs living  [deceased-not-ghost needs the death field
 *       we haven't isolated yet — see lineageDeath.ts follow-up]
 *   - orphan-ancestor rate: f14 refs with NO sim record in the save (culled
 *       ancestors → "unknown ancestor" nodes). How fast the roots fade.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/lineageDepth.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily, buildFamilyGraph } from '../../src/lib/parser/family.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const raw = scanFamily(blob!, simIds);
const graph = buildFamilyGraph(raw);

const nm = (id: bigint) => {
  const s = simById.get(id);
  return s ? `${s.firstName} ${s.lastName}` : `?${id.toString(16)}`;
};

// ─── generation depth (memoised DFS, cycle-guarded) ──────────────────────────
const descMemo = new Map<bigint, number>();
function descDepth(id: bigint, seen: Set<bigint>): number {
  if (descMemo.has(id)) return descMemo.get(id)!;
  if (seen.has(id)) return 0;
  seen.add(id);
  let best = 0;
  for (const c of graph.childrenOf.get(id) ?? []) best = Math.max(best, 1 + descDepth(c, seen));
  seen.delete(id);
  descMemo.set(id, best);
  return best;
}
const ancMemo = new Map<bigint, number>();
function ancDepth(id: bigint, seen: Set<bigint>): number {
  if (ancMemo.has(id)) return ancMemo.get(id)!;
  if (seen.has(id)) return 0;
  seen.add(id);
  let best = 0;
  for (const p of raw.get(id)?.parents ?? []) best = Math.max(best, 1 + ancDepth(p, seen));
  seen.delete(id);
  ancMemo.set(id, best);
  return best;
}

let deepestDesc = { id: 0n, d: -1 };
let deepestAnc = { id: 0n, d: -1 };
for (const id of raw.keys()) {
  const dd = descDepth(id, new Set());
  if (dd > deepestDesc.d) deepestDesc = { id, d: dd };
  const ad = ancDepth(id, new Set());
  if (ad > deepestAnc.d) deepestAnc = { id, d: ad };
}

// ─── breadth peaks ───────────────────────────────────────────────────────────
let biggestKids = { id: 0n, n: -1 };
for (const [pid, kids] of graph.childrenOf) if (kids.length > biggestKids.n) biggestKids = { id: pid, n: kids.length };

// biggest sibling set = biggest set of kids sharing >=1 parent (use children groups)
let biggestSibs = { id: 0n, n: -1 };
for (const [pid, kids] of graph.childrenOf) if (kids.length > biggestSibs.n) biggestSibs = { id: pid, n: kids.length };

// ─── death / ghost split ─────────────────────────────────────────────────────
let ghosts = 0;
for (const s of data.sims) if (s.isGhost) ghosts++;

// ─── orphan-ancestor rate ────────────────────────────────────────────────────
let totalAncRefs = 0;
let orphanAncRefs = 0;
const orphanParents = new Set<bigint>();
for (const [, fam] of raw) {
  for (const a of fam.ancestors) {
    totalAncRefs++;
    if (!simIds.has(a.id)) {
      orphanAncRefs++;
      if (a.index === 0 || a.index === 1) orphanParents.add(a.id);
    }
  }
}

// ─── report ──────────────────────────────────────────────────────────────────
const pct = (n: number, d: number) => (d === 0 ? '0' : ((100 * n) / d).toFixed(1));
console.log(`Save: ${savePath.split('/').pop()}`);
console.log(`Sims in save: ${data.sims.length}  (humans: ${data.sims.filter((s) => s.species === 'human').length})`);
console.log(`Sim records with family data scanned: ${raw.size}\n`);

console.log(`── DEPTH (generations) ──`);
console.log(`  Deepest descendant chain: ${deepestDesc.d} generations  (from ${nm(deepestDesc.id)})`);
console.log(`  Deepest ancestor chain:   ${deepestAnc.d} generations  (up from ${nm(deepestAnc.id)})\n`);

console.log(`── BREADTH (the stress peaks) ──`);
console.log(`  Most children on one sim: ${biggestKids.n}  (${nm(biggestKids.id)})`);
console.log(`  Biggest sibling set:      ${biggestSibs.n}  (kids of ${nm(biggestSibs.id)})\n`);

console.log(`── LIFE STATE ──`);
console.log(`  Ghosts (isGhost):         ${ghosts}`);
console.log(`  Note: deceased-not-ghost not yet detectable (death field not isolated).\n`);

console.log(`── ROOT FADE (culled ancestors) ──`);
console.log(`  Total f14 ancestor refs:  ${totalAncRefs}`);
console.log(`  Orphan refs (no record):  ${orphanAncRefs}  (${pct(orphanAncRefs, totalAncRefs)}%)`);
console.log(`  Orphan PARENT slots:      ${orphanParents.size}  (a known sim whose own parent is culled → "unknown ancestor" node)`);
