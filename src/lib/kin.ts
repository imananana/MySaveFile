/**
 * Kinship lookup over the stored family edges.
 *
 * Two sims who live together can be related through someone who doesn't — the
 * Caliente sisters share a mother who lives in another house, so a test that
 * only looks for an edge BETWEEN housemates reports them as strangers. This
 * walks a bounded neighbourhood of the graph instead.
 *
 * Bounded deliberately. A save with a full genealogy connects most of the town
 * eventually, so a transitive walk would report everyone as related and mean
 * nothing. We stop at a shared grandparent: enough to catch siblings, half
 * siblings, grandparents and cousins, and no further.
 */
import type { SimRelationship } from '../types';

/** What the graph knows about two sims, strongest first. */
export type KinLink = 'partner' | 'ex-partner' | 'parent' | 'sibling' | 'related';

const PARTNER = new Set(['spouse', 'engaged', 'partner']);
const EX = new Set(['ex_spouse', 'ex_fiance', 'ex_partner']);
const SIBLING = new Set(['sibling', 'half_sibling']);

export interface KinIndex {
  /** The relationship between two sims, or null when the graph knows of none. */
  between(aId: string, bId: string): KinLink | null;
  /** Whether ANY edge touches this sim — distinguishes "unrelated" from "unknown". */
  knows(simId: string): boolean;
}

export function buildKinIndex(edges: SimRelationship[]): KinIndex {
  const partners = new Map<string, Set<string>>();
  const exes = new Map<string, Set<string>>();
  const siblings = new Map<string, Set<string>>();
  const parentsOf = new Map<string, Set<string>>();   // child → parents
  const touched = new Set<string>();

  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    let s = m.get(k);
    if (!s) { s = new Set(); m.set(k, s); }
    s.add(v);
  };

  for (const e of edges) {
    touched.add(e.simAId);
    touched.add(e.simBId);
    if (e.relType === 'parent') { add(parentsOf, e.simBId, e.simAId); continue; }
    const bucket = PARTNER.has(e.relType) ? partners : EX.has(e.relType) ? exes : SIBLING.has(e.relType) ? siblings : null;
    if (!bucket) continue;
    add(bucket, e.simAId, e.simBId);
    add(bucket, e.simBId, e.simAId);
  }

  const grandparentsOf = (id: string): Set<string> => {
    const out = new Set<string>();
    for (const p of parentsOf.get(id) ?? []) for (const gp of parentsOf.get(p) ?? []) out.add(gp);
    return out;
  };
  const intersects = (a: Set<string>, b: Set<string>) => {
    for (const x of a) if (b.has(x)) return true;
    return false;
  };

  return {
    knows: (id) => touched.has(id),
    between(a, b) {
      if (a === b) return null;
      if (partners.get(a)?.has(b)) return 'partner';
      if (exes.get(a)?.has(b)) return 'ex-partner';
      if (parentsOf.get(a)?.has(b) || parentsOf.get(b)?.has(a)) return 'parent';
      if (siblings.get(a)?.has(b)) return 'sibling';

      const pa = parentsOf.get(a) ?? new Set<string>();
      const pb = parentsOf.get(b) ?? new Set<string>();
      if (intersects(pa, pb)) return 'sibling';                 // shared parent

      const ga = grandparentsOf(a);
      const gb = grandparentsOf(b);
      if (ga.has(b) || gb.has(a)) return 'related';             // grandparent
      if (intersects(pa, gb) || intersects(pb, ga)) return 'related'; // aunt/uncle
      if (ga.size > 0 && intersects(ga, gb)) return 'related';  // cousins
      return null;
    },
  };
}

/** The strongest link between any two members of a group, and whether the graph
 *  knows ANY of them at all. `null` link with `known: false` means "no data",
 *  which is a different thing from "not related". */
export function groupKin(ids: string[], kin: KinIndex): { link: KinLink | null; known: boolean } {
  let best: KinLink | null = null;
  const rank: Record<KinLink, number> = { partner: 5, parent: 4, sibling: 3, 'ex-partner': 2, related: 1 };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const l = kin.between(ids[i], ids[j]);
      if (l && (!best || rank[l] > rank[best])) best = l;
    }
  }
  return { link: best, known: ids.some((id) => kin.knows(id)) };
}
