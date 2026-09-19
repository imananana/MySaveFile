/**
 * Family-import planning: given the parsed family facts and the set of sims
 * the user actually imported (via household selection), compute
 *
 *   1. which extra sims must be created as `tree_only` rows — sims with full
 *      records in the save that are genealogy-reachable from the imported
 *      sims but live outside the imported households (deceased ancestors in
 *      hidden households like Victor/Milton, relatives in unselected
 *      households, …),
 *   2. which dangling ancestor ids need `stub` rows (referenced by a child's
 *      f14 but record-less — the in-game "Unknown" silhouettes), and
 *   3. the full relationship edge set over source ids.
 *
 * Reachability (user-approved rule): walk parents + children + couple edges
 * (spouse/engaged/partner/exes) transitively from the imported sims. Records
 * nothing reaches — the orphan phantoms the game itself hides — never enter
 * the planner. Humans only.
 */
import type { ParsedFamilyFacts, ParsedSim } from '../parser/types';
import type { SimRelType } from '../../types';

export interface FamilyImportPlan {
  /** Source ids (hex) needing full tree_only sim rows. */
  treeOnly: string[];
  /** Source ids (hex) needing stub rows (no record in the save). */
  stubs: string[];
  /** All edges over source ids; endpoints are guaranteed ∈ imported ∪ treeOnly ∪ stubs. */
  edges: Array<{ a: string; b: string; relType: SimRelType }>;
}

export function planFamilyImport(
  facts: ParsedFamilyFacts,
  sims: ParsedSim[],
  importedSourceIds: Iterable<string>,
): FamilyImportPlan {
  const recordIds = new Set(sims.filter((s) => s.species === 'human').map((s) => '0x' + s.id.toString(16)));
  // a stub is an id with NO record at all — a non-human record is just ignored
  const anyRecordIds = new Set(sims.map((s) => '0x' + s.id.toString(16)));

  // children index (only over ids that have facts)
  const childrenOf = new Map<string, string[]>();
  for (const [child, f] of Object.entries(facts.bySim)) {
    for (const p of f.parents) {
      const arr = childrenOf.get(p);
      if (arr) arr.push(child); else childrenOf.set(p, [child]);
    }
  }
  const pairsOf = new Map<string, string[]>();
  for (const e of facts.pairEdges) {
    (pairsOf.get(e.a) ?? pairsOf.set(e.a, []).get(e.a)!).push(e.b);
    (pairsOf.get(e.b) ?? pairsOf.set(e.b, []).get(e.b)!).push(e.a);
  }

  // BFS closure from the imported sims.
  const imported = new Set(importedSourceIds);
  const reached = new Set<string>();
  const stubs = new Set<string>();
  const queue: string[] = [...imported];
  while (queue.length) {
    const id = queue.shift()!;
    if (reached.has(id) || stubs.has(id)) continue;
    if (!recordIds.has(id)) {
      // record-less → an "Unknown" ancestor stub; a non-human record → ignored
      if (!imported.has(id) && !anyRecordIds.has(id)) {
        stubs.add(id);
        // Bridge UP through the stub: a record-less middle still links to its
        // own parents (e.g. a present grandparent), so keep walking — that's
        // how Conor → Unknown → Vanessa stays connected.
        const sf = facts.bySim[id];
        if (sf) for (const p of sf.parents) if (!reached.has(p) && !stubs.has(p)) queue.push(p);
      }
      continue;
    }
    reached.add(id);
    const f = facts.bySim[id];
    const neighbors: string[] = [];
    if (f) {
      neighbors.push(...f.parents);
      if (f.spouse) neighbors.push(f.spouse);
      if (f.engaged) neighbors.push(f.engaged);
      if (f.partner) neighbors.push(f.partner);
    }
    neighbors.push(...(childrenOf.get(id) ?? []));
    neighbors.push(...(pairsOf.get(id) ?? []));
    for (const n of neighbors) if (!reached.has(n) && !stubs.has(n)) queue.push(n);
  }

  const inPlan = (id: string) => reached.has(id) || stubs.has(id);
  const treeOnly = [...reached].filter((id) => !imported.has(id));

  // Edge set over everything in the plan, deduped (couple edges canonical a<b).
  const edges: FamilyImportPlan['edges'] = [];
  const seen = new Set<string>();
  const addEdge = (a: string, b: string, relType: SimRelType, directional: boolean) => {
    if (!inPlan(a) || !inPlan(b) || a === b) return;
    const [x, y] = directional || a < b ? [a, b] : [b, a];
    const key = `${x}|${y}|${relType}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a: x, b: y, relType });
  };
  for (const id of reached) {
    const f = facts.bySim[id];
    if (!f) continue;
    for (const p of f.parents) addEdge(p, id, 'parent', true); // a = parent, b = child
    if (f.spouse) addEdge(id, f.spouse, 'spouse', false);
    if (f.engaged) addEdge(id, f.engaged, 'engaged', false);
    if (f.partner) addEdge(id, f.partner, 'partner', false);
  }
  // Stubs (record-less "Unknown" middles) carry pedigree parent links too, so a
  // present grandparent connects down through them to the grandchild.
  for (const id of stubs) {
    const f = facts.bySim[id];
    if (!f) continue;
    for (const p of f.parents) addEdge(p, id, 'parent', true);
  }
  for (const e of facts.pairEdges) addEdge(e.a, e.b, e.relType, false);

  return { treeOnly, stubs: [...stubs], edges };
}
