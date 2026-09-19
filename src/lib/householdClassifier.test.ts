import { describe, it, expect } from 'vitest';
import { inferHouseholdType } from './householdClassifier';
import { buildKinIndex } from './kin';
import { EMPTY_COMPOSITION } from '../types';
import type { Sim, SimRelationship, HouseholdComposition } from '../types';

const s = (id: string, lifestage: Sim['lifestage'], lastName = 'Smith'): Pick<Sim, 'id' | 'lastName' | 'lifestage' | 'gender'> =>
  ({ id, lastName, lifestage, gender: 'female' });

const comp = (over: Partial<HouseholdComposition>): HouseholdComposition => ({ ...EMPTY_COMPOSITION, ...over });
const edge = (a: string, b: string, relType: SimRelationship['relType']): SimRelationship =>
  ({ id: `${a}${b}`, simAId: a, simBId: b, relType, source: 'import' });

const TWO_ADULTS = comp({ youngAdult: { male: 1, female: 1 } });

describe('inferHouseholdType — two adults, the ambiguous case', () => {
  const sims = [s('a', 'youngAdult', 'Clarke'), s('b', 'youngAdult', 'Wright')];

  it('guesses Couple with no family data at all', () => {
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS }, sims })).toBe('couple');
  });

  it('is certain about a Couple when a partner edge exists', () => {
    const kin = buildKinIndex([edge('a', 'b', 'spouse')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: 'x' }, sims, kin })).toBe('couple');
  });

  it('calls them Siblings on a shared parent, even with different surnames', () => {
    const kin = buildKinIndex([edge('mum', 'a', 'parent'), edge('mum', 'b', 'parent')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: 'x' }, sims, kin })).toBe('sibling_household');
  });

  it('calls an IMPORTED household Roommates when the save knows them and links them to nobody', () => {
    // "Best of Friends": two young adults, different surnames, no relationship
    // anywhere in the game's data.
    const kin = buildKinIndex([edge('a', 'someone', 'parent'), edge('b', 'other', 'parent')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: 'x' }, sims, kin })).toBe('roommates');
  });

  it('★ never demotes a PLANNER-built household, whose silence means nothing', () => {
    // Nothing in the planner authors relationships, so a hand-built couple has
    // no edges by construction. Demoting them to Roommates would mislabel every
    // family anyone builds by hand.
    const kin = buildKinIndex([edge('unrelated1', 'unrelated2', 'spouse')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: null }, sims, kin })).toBe('couple');
  });

  it('keeps the shape guess for an imported pair the save has never heard of', () => {
    const kin = buildKinIndex([edge('x', 'y', 'spouse')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: 'x' }, sims, kin })).toBe('couple');
  });

  it('never demotes a same-surnamed pair to Roommates — the surname rule reads them as Siblings', () => {
    // Two young adults sharing a surname and no recorded link: the Crumplebottom
    // shape. Whatever they are, "sharing a house with a stranger" isn't it.
    const same = [s('a', 'youngAdult', 'Crumplebottom'), s('b', 'youngAdult', 'Crumplebottom')];
    const kin = buildKinIndex([edge('a', 'p', 'parent'), edge('b', 'q', 'parent')]);
    expect(inferHouseholdType({ household: { composition: TWO_ADULTS, sourceId: 'x' }, sims: same, kin })).toBe('sibling_household');
  });
});

describe('inferHouseholdType — elder plus adult', () => {
  const comp1 = comp({ elder: { male: 0, female: 1 }, adult: { male: 1, female: 0 } });
  const sims = [s('e', 'elder'), s('a', 'adult')];

  it('guesses Adult child + parents without family data', () => {
    expect(inferHouseholdType({ household: { composition: comp1 }, sims })).toBe('adult_child_with_parent');
  });

  it('fixes the age-gap couple the old rule got wrong', () => {
    const kin = buildKinIndex([edge('e', 'a', 'spouse')]);
    expect(inferHouseholdType({ household: { composition: comp1, sourceId: 'x' }, sims, kin })).toBe('couple');
  });

  it('confirms Adult child + parents on a parent edge', () => {
    const kin = buildKinIndex([edge('e', 'a', 'parent')]);
    expect(inferHouseholdType({ household: { composition: comp1, sourceId: 'x' }, sims, kin })).toBe('adult_child_with_parent');
  });
});

describe('inferHouseholdType — unambiguous shapes are untouched by kin data', () => {
  it('a household with children is never demoted to Roommates', () => {
    const c = comp({ adult: { male: 1, female: 1 }, child: { male: 0, female: 1 } });
    const sims = [s('a', 'adult', 'One'), s('b', 'adult', 'Two'), s('c', 'child', 'Three')];
    const kin = buildKinIndex([edge('a', 'far', 'parent')]);
    expect(inferHouseholdType({ household: { composition: c, sourceId: 'x' }, sims, kin })).toBe('nuclear_family');
  });

  it('a lone sim is still Solo', () => {
    const c = comp({ adult: { male: 0, female: 1 } });
    expect(inferHouseholdType({ household: { composition: c }, sims: [s('a', 'adult')] })).toBe('solo_adult');
  });
});
