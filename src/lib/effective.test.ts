import { describe, it, expect } from 'vitest';
import { effectiveCareer, isEmployed, effectiveSkillIds, effectiveHouseholdId, effectiveFunds, compositionFromSims, effectiveComposition } from './effective';
import { EMPTY_COMPOSITION, getCompositionTotal } from '../types';
import type { Sim, Household } from '../types';

const sim = (over: Partial<Sim> = {}): Sim => ({
  id: 's1', householdId: 'hh1', firstName: 'Bella', lastName: 'Goth',
  gender: 'female', lifestage: 'adult', species: 'human', petSubtype: 'pet',
  petBreed: null, occult: 'none', isGhost: false, notes: '', sourceId: 'abc',
  traitIds: [], aspirationId: null, recordStatus: 'active', deathCause: null,
  ...over,
} as Sim);

// A real catalog pair so the test isn't asserting against a fixture: Actor is
// fulltime, and the Barista NPC job is what "employed" has to reject.
const ACTOR = '0x2e2cf';

describe('effectiveCareer', () => {
  it('takes the save career when nothing is planned', () => {
    const c = effectiveCareer(sim({ career: { uid: ACTOR, name: 'Actor', kind: 'fulltime', level: 6 } }));
    expect(c).toMatchObject({ uid: ACTOR, level: 6 });
  });

  it('replaces the save career with the planned one, and drops the level', () => {
    const c = effectiveCareer(sim({
      career: { uid: '0x19fda', name: 'Athlete', kind: 'fulltime', level: 8 },
      plannedCareerUid: ACTOR,
    }));
    // One career, not two — the whole point.
    expect(c?.uid).toBe(ACTOR);
    expect(c?.name).toBe('Actor');
    expect(c?.level).toBeNull();
  });

  it("treats the 'none' sentinel as genuinely unemployed", () => {
    const c = effectiveCareer(sim({
      career: { uid: ACTOR, name: 'Actor', kind: 'fulltime', level: 6 },
      plannedCareerUid: 'none',
    }));
    expect(c).toBeNull();
    expect(isEmployed(c)).toBe(false);
  });

  it('keeps an unknown planned uid rather than dropping the job', () => {
    const c = effectiveCareer(sim({ plannedCareerUid: '0xdeadbeef' }));
    expect(c?.uid).toBe('0xdeadbeef');
    expect(c?.level).toBeNull();
  });

  it('is null for a sim with no career either side', () => {
    expect(effectiveCareer(sim())).toBeNull();
  });
});

describe('isEmployed', () => {
  it('rejects NPC and club jobs', () => {
    expect(isEmployed({ uid: '0x1', name: 'Barista', kind: 'npc', level: 1 })).toBe(false);
    expect(isEmployed({ uid: '0x2', name: 'Club', kind: 'club', level: 1 })).toBe(false);
    expect(isEmployed({ uid: ACTOR, name: 'Actor', kind: 'fulltime', level: null })).toBe(true);
  });
});

describe('effectiveSkillIds', () => {
  it('adds planned skills to observed ones rather than replacing them', () => {
    const ids = effectiveSkillIds(sim({
      skills: [{ skillId: '0xaaa', level: 7, points: 0 }],
      plannedSkillIds: ['0xbbb'],
    }));
    expect([...ids].sort()).toEqual(['0xaaa', '0xbbb']);
  });

  it('does not double-count a skill both observed and planned', () => {
    const ids = effectiveSkillIds(sim({
      skills: [{ skillId: '0xaaa', level: 7, points: 0 }],
      plannedSkillIds: ['0xaaa'],
    }));
    expect(ids.size).toBe(1);
  });
});

describe('effectiveHouseholdId', () => {
  it('sends the sim to their planned destination', () => {
    expect(effectiveHouseholdId(sim({ householdId: 'hh1', plannedMoveHouseholdId: 'hh2' }))).toBe('hh2');
  });
  it('leaves them where they are without a planned move', () => {
    expect(effectiveHouseholdId(sim({ householdId: 'hh1' }))).toBe('hh1');
  });
  it('is null for a sim in no household at all', () => {
    expect(effectiveHouseholdId(sim({ householdId: null }))).toBeNull();
  });
});

describe('compositionFromSims', () => {
  it('buckets humans by lifestage and gender', () => {
    const c = compositionFromSims([
      sim({ lifestage: 'adult', gender: 'female' }),
      sim({ lifestage: 'adult', gender: 'male' }),
      sim({ lifestage: 'child', gender: 'male' }),
    ]);
    expect(c.adult).toEqual({ male: 1, female: 1 });
    expect(c.child).toEqual({ male: 1, female: 0 });
    expect(getCompositionTotal(c)).toBe(3);
  });

  it('counts pets in their own fields, by subtype', () => {
    const c = compositionFromSims([
      sim({ species: 'pet', petSubtype: 'cat', lifestage: 'pet' }),
      sim({ species: 'pet', petSubtype: 'horse', lifestage: 'pet' }),
      sim({ lifestage: 'adult' }),
    ]);
    expect(c.cat).toBe(1);
    expect(c.horse).toBe(1);
    expect(c.dog).toBe(0);
    // Pets count toward the household's size — this is the pair that read as
    // "2 named vs 1" until pets were counted.
    expect(getCompositionTotal(c)).toBe(3);
  });

  it('counts a subtype-less pet so the pet total still holds', () => {
    const c = compositionFromSims([sim({ species: 'pet', petSubtype: 'pet', lifestage: 'pet' })]);
    expect(c.dog + c.cat + c.horse).toBe(1);
  });
});

describe('effectiveComposition', () => {
  const hh = (over: Partial<Household>): Household => ({ id: 'hh1', composition: EMPTY_COMPOSITION, ...over } as Household);

  it('derives from members, so a household built here is no longer shapeless', () => {
    // Every hand-made household is created with an empty composition and nothing
    // ever backfills it — which classified all of them as "Other".
    const c = effectiveComposition(hh({}), [sim({ lifestage: 'adult' })]);
    expect(getCompositionTotal(c)).toBe(1);
  });

  it('falls back to the stored composition when nobody is named', () => {
    const stored = { ...EMPTY_COMPOSITION, adult: { male: 1, female: 1 } };
    expect(effectiveComposition(hh({ composition: stored }), [])).toBe(stored);
  });
});

describe('effectiveFunds', () => {
  const hh = (over: Partial<Household>): Household => ({ id: 'hh1', money: null, plannedMoney: null, ...over } as Household);

  it('takes the goal when one is set', () => {
    expect(effectiveFunds(hh({ money: 20_000, plannedMoney: 50_000 }))).toBe(50_000);
  });

  it('ignores a goal the household has already passed — a target is spent once reached', () => {
    expect(effectiveFunds(hh({ money: 90_000, plannedMoney: 50_000 }))).toBe(90_000);
  });

  it('ignores a goal BELOW the balance — there is no such thing as a spend-down goal', () => {
    expect(effectiveFunds(hh({ money: 90_000, plannedMoney: 5_000 }))).toBe(90_000);
  });

  it('falls back to the save balance', () => {
    expect(effectiveFunds(hh({ money: 20_000 }))).toBe(20_000);
  });

  it('counts a goal on a household whose balance is unknown', () => {
    expect(effectiveFunds(hh({ money: null, plannedMoney: 50_000 }))).toBe(50_000);
  });
});
