/**
 * Synthetic families for eyeballing the tree at scales that are impractical to
 * seed in-game (a 100-baby legacy, a 15-kid sibling row). Loaded client-side via
 * the Family page's ?demo=<kind> param — purely a dev/visual harness, never
 * touches the API or store. Lets us iterate on breadth fallbacks against the
 * real layout + card components.
 */
import type { Sim, SimGender, SimRelationship } from '../../types';

export type DemoKind = 'wide-children' | 'mega-mom' | 'wide-siblings';

export interface DemoFamily {
  sims: Record<string, Sim>;
  edges: SimRelationship[];
  focusId: string;
}

const FIRSTS = ['Ada', 'Bo', 'Cleo', 'Dex', 'Eve', 'Fox', 'Gwen', 'Hal', 'Ivy', 'Jax', 'Kit', 'Lux', 'Mira', 'Nico', 'Opal', 'Pax', 'Quinn', 'Rue', 'Sol', 'Tess', 'Uma', 'Vance', 'Wren', 'Xander', 'Yael', 'Zara'];

function mkSim(id: string, first: string, last: string, gender: SimGender, patch: Partial<Sim> = {}): Sim {
  return {
    id, householdId: null, firstName: first, lastName: last, gender,
    lifestage: 'adult', species: 'human', petSubtype: 'pet', petBreed: null,
    occult: 'none', isGhost: false, notes: '', sourceId: null,
    traitIds: [], aspirationId: null, recordStatus: 'active', deathCause: null,
    culledAt: null, ...patch,
  };
}

let _eid = 0;
const edge = (a: string, b: string, relType: SimRelationship['relType']): SimRelationship =>
  ({ id: `de${_eid++}`, simAId: a, simBId: b, relType, source: 'import' });

const childName = (i: number) => `${FIRSTS[i % FIRSTS.length]}${i >= FIRSTS.length ? Math.floor(i / FIRSTS.length) + 1 : ''}`;

/** Founder couple with `n` children; `branching` of them get a spouse + 2 kids. */
function wideChildren(n: number, branching: number): DemoFamily {
  _eid = 0;
  const sims: Record<string, Sim> = {};
  const edges: SimRelationship[] = [];
  const dad = mkSim('founderM', 'Magnus', 'Prolific', 'male');
  const mom = mkSim('founderF', 'Brood', 'Prolific', 'female');
  sims[dad.id] = dad; sims[mom.id] = mom;
  edges.push(edge(dad.id, mom.id, 'spouse'));
  for (let i = 0; i < n; i++) {
    const id = `c${i}`;
    const g: SimGender = i % 2 === 0 ? 'female' : 'male';
    sims[id] = mkSim(id, childName(i), 'Prolific', g, i % 7 === 0 ? { isGhost: true } : {});
    edges.push(edge(dad.id, id, 'parent'), edge(mom.id, id, 'parent'));
    if (i < branching) {
      const sp = `c${i}s`, k1 = `c${i}k1`, k2 = `c${i}k2`;
      sims[sp] = mkSim(sp, FIRSTS[(i + 5) % FIRSTS.length], 'Inlaw', g === 'male' ? 'female' : 'male');
      sims[k1] = mkSim(k1, childName(i + 30), 'Prolific', 'female');
      sims[k2] = mkSim(k2, childName(i + 31), 'Prolific', 'male');
      edges.push(edge(id, sp, 'spouse'), edge(id, k1, 'parent'), edge(sp, k1, 'parent'), edge(id, k2, 'parent'), edge(sp, k2, 'parent'));
    }
  }
  return { sims, edges, focusId: dad.id };
}

/** Focus with `n` siblings (all leaves) under shared parents. */
function wideSiblings(n: number): DemoFamily {
  _eid = 0;
  const sims: Record<string, Sim> = {};
  const edges: SimRelationship[] = [];
  const dad = mkSim('p_dad', 'Pa', 'Many', 'male');
  const mom = mkSim('p_mom', 'Ma', 'Many', 'female');
  sims[dad.id] = dad; sims[mom.id] = mom;
  edges.push(edge(dad.id, mom.id, 'spouse'));
  const focus = mkSim('focus', 'Ego', 'Many', 'female');
  sims[focus.id] = focus;
  edges.push(edge(dad.id, focus.id, 'parent'), edge(mom.id, focus.id, 'parent'));
  for (let i = 0; i < n; i++) {
    const id = `s${i}`;
    sims[id] = mkSim(id, childName(i), 'Many', i % 2 ? 'male' : 'female');
    edges.push(edge(dad.id, id, 'parent'), edge(mom.id, id, 'parent'));
  }
  return { sims, edges, focusId: focus.id };
}

export function makeDemoFamily(kind: string): DemoFamily | null {
  switch (kind) {
    case 'wide-children': return wideChildren(28, 3);
    case 'mega-mom': return wideChildren(100, 2);
    case 'wide-siblings': return wideSiblings(15);
    default: return null;
  }
}
