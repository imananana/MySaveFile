/**
 * The two questions the family-tree landing asks of a save: which families are
 * there (familyComponents), and who should each one open on (pickFamilyAnchor).
 * Layout invariants live in hourglass.test.ts, next to the engine that draws.
 */
import { describe, it, expect } from 'vitest';
import { familyComponents, pickFamilyAnchor } from './layout';
import type { Sim, SimRelationship, SimRelType } from '../../types';

let edgeId = 0;
const E = (a: string, b: string, relType: SimRelType): SimRelationship =>
  ({ id: `e${edgeId++}`, simAId: a, simBId: b, relType, source: 'import' });

describe('pickFamilyAnchor', () => {
  it('anchors on the youngest heir (deepest ancestor chain)', () => {
    // grandpa → mom → kid; kid is the youngest (2 generations of ancestry).
    // dad is kid's other parent but a leaf with no ancestry of his own.
    const rels = [
      E('grandpa', 'mom', 'parent'),
      E('mom', 'kid', 'parent'), E('dad', 'kid', 'parent'),
      E('mom', 'dad', 'spouse'),
    ];
    const ids = new Set(['grandpa', 'mom', 'dad', 'kid']);
    expect(pickFamilyAnchor(ids, rels)).toBe('kid');
  });

  it('picks the deepest descendant over the founder and the middle', () => {
    // founder → mid → kid → grandkid. grandkid has the deepest pedigree (3) →
    // the current heir, never the founder or a middle generation.
    const rels = [
      E('founder', 'mid', 'parent'),
      E('mid', 'kid', 'parent'),
      E('kid', 'grandkid', 'parent'),
    ];
    const ids = new Set(['founder', 'mid', 'kid', 'grandkid']);
    expect(pickFamilyAnchor(ids, rels)).toBe('grandkid');
  });

  it('tie-breaks two same-gen heirs toward the richer line, then connectivity', () => {
    // both heirs sit 2 gens deep; heirA descends from a couple (2 ancestors per
    // gen → richer pedigree), heirB from a single line. heirA should win.
    const rels = [
      E('ga', 'pa', 'parent'), E('gb', 'pa', 'parent'),     // pa has two parents
      E('pa', 'heirA', 'parent'),
      E('gc', 'pb', 'parent'),                               // pb has one parent
      E('pb', 'heirB', 'parent'),
    ];
    const ids = new Set(['ga', 'gb', 'gc', 'pa', 'pb', 'heirA', 'heirB']);
    expect(pickFamilyAnchor(ids, rels)).toBe('heirA');
  });

  it('falls back to most-connected when there is no ancestry at all', () => {
    // a childless trio of couples — no parent edges at all
    const rels = [E('a', 'b', 'spouse'), E('b', 'c', 'partner')];
    const ids = new Set(['a', 'b', 'c']);
    expect(pickFamilyAnchor(ids, rels)).toBe('b'); // degree 2 vs 1
  });

  it('ignores edges that leave the component', () => {
    const rels = [E('mom', 'kid', 'parent'), E('grandpa', 'mom', 'parent'), E('mom', 'outsider', 'spouse')];
    const ids = new Set(['grandpa', 'mom', 'kid']);
    expect(pickFamilyAnchor(ids, rels)).toBe('kid');
  });
});

describe('familyComponents', () => {
  const sim = (id: string, lastName: string): Sim => ({
    id, householdId: null, firstName: id, lastName, gender: 'female', lifestage: 'adult',
    species: 'human', petSubtype: 'pet', petBreed: null, occult: 'none', isGhost: false,
    notes: '', sourceId: null, traitIds: [], aspirationId: null,
    recordStatus: 'active', deathCause: null, culledAt: null,
  });

  it('splits disconnected families, sorts by size, labels by surname', () => {
    const sims = Object.fromEntries([
      sim('g1', 'Goth'), sim('g2', 'Goth'), sim('g3', 'Goth'),
      sim('p1', 'Pancakes'), sim('p2', 'Pancakes'),
    ].map((s) => [s.id, s]));
    const comps = familyComponents(sims, [
      E('g1', 'g2', 'spouse'), E('g1', 'g3', 'parent'),
      E('p1', 'p2', 'spouse'),
    ]);
    expect(comps).toHaveLength(2);
    expect(comps[0].simIds.size).toBe(3);
    expect(comps[0].label).toBe('Goth');
    expect(comps[1].label).toBe('Pancakes');
  });

  it('ignores edges pointing at sims that no longer exist', () => {
    const sims = Object.fromEntries([sim('a', 'A'), sim('b', 'B')].map((s) => [s.id, s]));
    const comps = familyComponents(sims, [E('a', 'b', 'spouse'), E('a', 'ghost-row', 'parent')]);
    expect(comps).toHaveLength(1);
    expect(comps[0].simIds.size).toBe(2);
  });
});
