/**
 * Family-tree shared foundations. Pure module — no React, no store.
 *
 * The one layout engine is `buildHourglassLayout` in ./hourglass.ts; this file
 * holds what it is built out of — the v5 card geometry, the edge index
 * (parents / children / strongest couple bond / explicit siblings), the placed
 * shapes it emits, and the component + anchor helpers the landing grid uses to
 * ask "which families are there, and who should each one open on?".
 */
import type { Sim, SimRelationship, SimRelType } from '../../types';

// v5 geometry: 168×156 cards; a couple's cards sit 102px apart (34px gap,
// 34px union-glyph slot, 34px gap) with the ring glyph centered between them.
export const CARD_W = 168;
export const CARD_H = 156;
export const COUPLE_GAP = 102;  // space between a couple's cards; the union glyph lives here
export const RING_R = 14;       // union-ring radius — connector lines stop here

export const GAPX = 34;        // gap between adjacent slots in a band
export const GROUP_GAP = 64;   // breathing room between blocks/groups in a band
export const LANE = 104;       // vertical lane between bands (drop lines live here)
export const PAD = 48;

/** Lower = stronger bond. */
const BOND_PRIORITY: Record<string, number> = {
  spouse: 0, engaged: 1, partner: 2, ex_spouse: 3, ex_fiance: 4, ex_partner: 5, coparent: 6,
};

export const COUPLE_TYPES = new Set(['spouse', 'engaged', 'partner', 'ex_spouse', 'ex_fiance', 'ex_partner']);

/** How a card relates to the focused sim (focus lens only; gendered at display time). */
export type FocusRelation =
  | 'parent' | 'step-parent' | 'parents-partner' | 'parents-ex' | 'siblings-parent'
  | 'sibling' | 'half-sibling'
  | 'spouse' | 'engaged' | 'partner' | 'ex_spouse' | 'ex_fiance' | 'ex_partner'
  | 'child' | 'step-child'
  // hourglass-only (deeper generations)
  | 'grandparent' | 'great-grandparent' | 'aunt-uncle' | 'grand-aunt-uncle'
  | 'grandchild' | 'great-grandchild' | 'child-in-law';

export interface PlacedCard {
  simId: string;
  x: number;                     // top-left corner
  y: number;
  relation?: FocusRelation;      // set by buildFocusLayout; absent on the focus card + graph lens
  /** Breadth fallback: this slot is an overflow chip standing in for many
   *  collapsed leaf sims (a 100-baby legacy). simId is a synthetic key. */
  chip?: { ids: string[]; kind: 'children' | 'siblings' };
}
export interface PlacedUnion {
  aId: string; bId: string;
  relType: SimRelType | 'coparent';
  x: number; y: number;        // glyph center
  /** false = the pair sits adjacent; true = drawn point-to-point (graph lens only) */
  loose: boolean;
}
export interface PlacedEdge {
  childId: string;
  /** Polyline from the drop source (union ring or parent card) to the child card top. */
  points: Array<{ x: number; y: number }>;
}

export interface FamilyLayout {
  cards: PlacedCard[];
  unions: PlacedUnion[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  /** Top-of-tree sims with NO parent in the data — render a faint "+ add
   *  parent" affordance above each so a line can be extended upward. */
  addParentIds?: Set<string>;
}

// ─── Shared edge indexing ─────────────────────────────────────────────────────

/** A sibling known only from an explicit relbit edge (no shared parent in the
 *  graph to derive it from). 'full' = bit 8802, 'half' = bit 468542. */
export type ExplicitSibling = { id: string; type: 'full' | 'half' };

export interface RelIndex {
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  /** a → b → strongest couple bond between them */
  bonds: Map<string, Map<string, SimRelType>>;
  /** sim → siblings asserted directly by a relbit edge (parentless pairs only;
   *  pairs that share a parent are derived from parentsOf instead). */
  siblingsOf: Map<string, ExplicitSibling[]>;
}

export const SIBLING_TYPES = new Set<SimRelType>(['sibling', 'half_sibling']);

export function indexRelationships(relationships: SimRelationship[]): RelIndex {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const bonds = new Map<string, Map<string, SimRelType>>();
  const siblingsOf = new Map<string, ExplicitSibling[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const arr = m.get(k);
    if (arr) { if (!arr.includes(v)) arr.push(v); } else m.set(k, [v]);
  };
  const note = (a: string, b: string, t: SimRelType) => {
    let m = bonds.get(a);
    if (!m) { m = new Map(); bonds.set(a, m); }
    const cur = m.get(b);
    if (!cur || (BOND_PRIORITY[t] ?? 9) < (BOND_PRIORITY[cur] ?? 9)) m.set(b, t);
  };
  const noteSib = (a: string, b: string, type: 'full' | 'half') => {
    const arr = siblingsOf.get(a);
    // full wins over half if both ever appear for the same pair
    if (arr) {
      const ex = arr.find((s) => s.id === b);
      if (ex) { if (type === 'full') ex.type = 'full'; } else arr.push({ id: b, type });
    } else siblingsOf.set(a, [{ id: b, type }]);
  };
  for (const r of relationships) {
    if (r.simAId === r.simBId) continue;
    if (r.relType === 'parent') {
      push(parentsOf, r.simBId, r.simAId);
      push(childrenOf, r.simAId, r.simBId);
    } else if (COUPLE_TYPES.has(r.relType)) {
      note(r.simAId, r.simBId, r.relType);
      note(r.simBId, r.simAId, r.relType);
    } else if (SIBLING_TYPES.has(r.relType)) {
      const type = r.relType === 'sibling' ? 'full' : 'half';
      noteSib(r.simAId, r.simBId, type);
      noteSib(r.simBId, r.simAId, type);
    }
  }
  return { parentsOf, childrenOf, bonds, siblingsOf };
}

// ─── Connected components (which sims form one tree) ─────────────────────────

export interface FamilyComponent {
  simIds: Set<string>;
  /** Up to three most common surnames, for the picker label. */
  label: string;
}

/**
 * Pick the sim a family card should open on. Prefer someone who BRIDGES
 * generations (has both a parent and a child in view, so the hourglass fills
 * up and down); among those, prefer the one with the most TOTAL lineage around
 * them (ancestors + descendants) so you land on a central figure — a
 * middle-generation matriarch/patriarch — rather than the founder (lots of
 * descendants, no ancestors) or a small offshoot. Ties break by connection
 * count; falls back to most-connected when nobody bridges.
 */
export function pickFamilyAnchor(simIds: Set<string>, relationships: SimRelationship[]): string | null {
  const degree = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  const hasChild = new Set<string>();
  for (const r of relationships) {
    if (!simIds.has(r.simAId) || !simIds.has(r.simBId)) continue;
    degree.set(r.simAId, (degree.get(r.simAId) ?? 0) + 1);
    degree.set(r.simBId, (degree.get(r.simBId) ?? 0) + 1);
    if (r.relType === 'parent') {
      hasChild.add(r.simAId); hasParent.add(r.simBId);
      (childrenOf.get(r.simAId) ?? childrenOf.set(r.simAId, []).get(r.simAId)!).push(r.simBId);
      (parentsOf.get(r.simBId) ?? parentsOf.set(r.simBId, []).get(r.simBId)!).push(r.simAId);
    }
  }
  const countMemo = (rel: Map<string, string[]>) => {
    const memo = new Map<string, number>();
    const walk = (id: string, seen: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      let n = 0;
      for (const c of rel.get(id) ?? []) n += 1 + walk(c, seen);
      seen.delete(id);
      memo.set(id, n);
      return n;
    };
    return walk;
  };
  // longest chain (generations), not total count
  const depthMemo = (rel: Map<string, string[]>) => {
    const memo = new Map<string, number>();
    const walk = (id: string, seen: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      let d = 0;
      for (const c of rel.get(id) ?? []) d = Math.max(d, 1 + walk(c, seen));
      seen.delete(id);
      memo.set(id, d);
      return d;
    };
    return walk;
  };
  const ancestors = countMemo(parentsOf);
  const ancDepth = depthMemo(parentsOf);

  // Anchor on the youngest-gen heir: the sim with the deepest ancestor chain.
  // That's always a childless leaf (any child would have a deeper chain), so
  // the hourglass opens as a clean upward pedigree from "where you're playing
  // now". Tie-break toward the richest line (most ancestors), then connectivity.
  void hasParent; void hasChild;
  let best: string | null = null;
  let bestScore = -1;
  for (const id of simIds) {
    const score = ancDepth(id, new Set()) * 1e9 + ancestors(id, new Set()) * 1000 + (degree.get(id) ?? 0);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

/** Group sims into connected components over ALL family edges (parent + couple). */
export function familyComponents(sims: Record<string, Sim>, relationships: SimRelationship[]): FamilyComponent[] {
  const adj = new Map<string, string[]>();
  const touch = (a: string, b: string) => {
    if (!sims[a] || !sims[b]) return;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const r of relationships) touch(r.simAId, r.simBId);

  const seen = new Set<string>();
  const components: FamilyComponent[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ids = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const id = queue.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      seen.add(id);
      for (const n of adj.get(id) ?? []) if (!ids.has(n)) queue.push(n);
    }
    const surnameCounts = new Map<string, number>();
    for (const id of ids) {
      const last = sims[id]?.lastName?.trim();
      if (!last) continue;
      surnameCounts.set(last, (surnameCounts.get(last) ?? 0) + 1);
    }
    const top = [...surnameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    components.push({ simIds: ids, label: top.length ? top.join(' · ') : '(unnamed)' });
  }
  return components.sort((a, b) => b.simIds.size - a.simIds.size);
}
