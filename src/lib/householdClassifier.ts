/**
 * Classify a household into one of ~15 buckets based on composition counts
 * + (where available) named-sim surname signals. Used by the /sims Diversity
 * tab to surface "what kinds of households am I building?" insights.
 *
 * Pure function. No side effects.
 *
 * Classification is best-effort — composition alone is sometimes ambiguous
 * (e.g. 2 adults with different surnames could be a couple OR roommates).
 * The fuzzy cases pick the more common interpretation:
 *   - 2 adults, no kids → Couple (per locked design)
 *   - 2 YAs with shared surname, no kids → Sibling household (special case)
 *   - 1 elder + 1 adult, no kids → Adult child + parent (could be age-gap
 *     couple but generational living is the more common storytelling pattern)
 */
import type { Household, Sim } from '../types';
import { groupKin, type KinIndex } from './kin';

export type HouseholdType =
  | 'solo_adult'
  | 'solo_teen'
  | 'solo_child'
  | 'solo_pet'
  | 'couple'
  | 'sibling_household'
  | 'nuclear_family'
  | 'single_parent'
  | 'teen_parent'
  | 'multi_gen'
  | 'adult_child_with_parent'
  | 'foster_home'
  | 'roommates'
  | 'empty_nesters'
  | 'other';

export const HOUSEHOLD_TYPE_LABEL: Record<HouseholdType, string> = {
  solo_adult:               'Solo',
  solo_teen:                'Solo teen',
  solo_child:               'Solo child',
  solo_pet:                 'Solo pet',
  couple:                   'Couple',
  sibling_household:        'Siblings',
  nuclear_family:           'Nuclear family',
  single_parent:            'Single parent',
  teen_parent:              'Teen parent',
  multi_gen:                'Multi-gen',
  adult_child_with_parent:  'Adult child + parents',
  foster_home:              'Foster home',
  roommates:                'Roommates',
  empty_nesters:            'Empty nesters',
  other:                    'Other',
};

// Display order on the Diversity tab — frequency-ish, family shapes first.
export const HOUSEHOLD_TYPES_ORDERED: HouseholdType[] = [
  'nuclear_family',
  'couple',
  'single_parent',
  'multi_gen',
  'empty_nesters',
  'roommates',
  'sibling_household',
  'solo_adult',
  'adult_child_with_parent',
  'foster_home',
  'teen_parent',
  'solo_teen',
  'solo_child',
  'solo_pet',
  'other',
];

export interface ClassifyInput {
  /** `sourceId` decides whether a MISSING relationship means anything — see below. */
  household: Pick<Household, 'composition'> & Partial<Pick<Household, 'sourceId'>>;
  sims: Pick<Sim, 'id' | 'lastName' | 'lifestage' | 'gender'>[];
  /** Family edges, when the caller has them. Absent = classify on shape alone. */
  kin?: KinIndex;
}

export function inferHouseholdType({ household, sims, kin }: ClassifyInput): HouseholdType {
  const c = household.composition;

  const counts = {
    elder:      c.elder.male      + c.elder.female,
    adult:      c.adult.male      + c.adult.female,
    youngAdult: c.youngAdult.male + c.youngAdult.female,
    teen:       c.teen.male       + c.teen.female,
    child:      c.child.male      + c.child.female,
    toddler:    c.toddler.male    + c.toddler.female,
    // pre-newborn compositions lack the key — default 0
    infant:     c.infant.male     + c.infant.female + (c.newborn?.male ?? 0) + (c.newborn?.female ?? 0),
  };

  const mids = counts.youngAdult + counts.adult; // middle generation
  const elders = counts.elder;
  const teens = counts.teen;
  const youngKids = counts.child + counts.toddler + counts.infant;
  const kidsOrTeens = youngKids + teens;
  const adults = mids + elders;
  const total = adults + kidsOrTeens;
  const pets = c.dog + c.cat + c.horse;

  // No humans, just pets — Solo pet
  if (total === 0 && pets > 0) return 'solo_pet';
  if (total === 0) return 'other';

  // Solo households (exactly 1 human)
  if (total === 1) {
    if (mids === 1 || elders === 1) return 'solo_adult';
    if (teens === 1) return 'solo_teen';
    if (counts.child === 1) return 'solo_child';
    // Solo infant/toddler is gameplay-invalid — call it Other
    return 'other';
  }

  // Empty nesters: only elders (1-2 of them by convention, but classify any
  // elder-only household here regardless of count)
  if (elders > 0 && mids === 0 && kidsOrTeens === 0) return 'empty_nesters';

  // Multi-gen households: elders + kids/teens, with OR without a middle
  // generation. The former "skip-gen" case (no middle gen) now rolls up here,
  // matching the randomizer (which dropped its skip-gen preset into multi-gen).
  if (elders > 0 && kidsOrTeens > 0) return 'multi_gen';

  // Adult child + parent(s): elders + middle gen, no kids/teens. Ambiguous on
  // shape alone — an age-gap couple looks identical — so the family tree
  // settles it when it has an opinion.
  if (elders > 0 && mids > 0 && kidsOrTeens === 0) {
    const link = kin ? groupKin(sims.map((s) => s.id), kin).link : null;
    if (link === 'partner') return 'couple';
    if (link === 'sibling') return 'sibling_household';
    return 'adult_child_with_parent';
  }

  // Teen parent: at least one teen + kids, no full adults
  if (mids === 0 && elders === 0 && teens >= 1 && youngKids >= 1) return 'teen_parent';

  // Single parent: 1 middle-gen adult + kids/teens
  if (mids === 1 && elders === 0 && kidsOrTeens >= 1) return 'single_parent';

  // Nuclear family vs Foster home: 2+ middle-gen adults + kids/teens
  if (mids >= 2 && elders === 0 && kidsOrTeens >= 1) {
    // Foster signal: at least 2 named kids/teens whose surnames don't match
    // any adult's surname. Requires named sims with non-empty surnames.
    const adultSurnames = new Set(
      sims
        .filter((s) => s.lifestage === 'youngAdult' || s.lifestage === 'adult' || s.lifestage === 'elder')
        .map((s) => (s.lastName ?? '').toLowerCase().trim())
        .filter(Boolean),
    );
    const kidSurnames = sims
      .filter((s) => s.lifestage === 'child' || s.lifestage === 'toddler' || s.lifestage === 'infant' || s.lifestage === 'newborn' || s.lifestage === 'teen')
      .map((s) => (s.lastName ?? '').toLowerCase().trim())
      .filter(Boolean);
    if (adultSurnames.size > 0 && kidSurnames.length >= 2) {
      const allKidsOutsideAdultNames = kidSurnames.every((k) => !adultSurnames.has(k));
      if (allKidsOutsideAdultNames) return 'foster_home';
    }
    return 'nuclear_family';
  }

  // Adults-only households (no kids, no teens)
  if (kidsOrTeens === 0 && adults >= 2) {
    // The family tree first, when it has an opinion. A partner edge makes a
    // couple certain; a sibling edge beats the surname heuristic outright,
    // catching siblings who share a parent living somewhere else and siblings
    // who don't share a surname.
    const { link, known } = kin
      ? groupKin(sims.map((s) => s.id), kin)
      : { link: null, known: false };
    if (link === 'partner') return 'couple';
    if (link === 'sibling') return 'sibling_household';
    if (link === 'parent') return 'adult_child_with_parent';

    // Sibling household: 2-3 YAs (only middle-gen youth), all sharing a surname
    if (counts.youngAdult >= 2 && counts.youngAdult <= 3 && counts.adult === 0 && elders === 0) {
      const yaSurnames = sims
        .filter((s) => s.lifestage === 'youngAdult')
        .map((s) => (s.lastName ?? '').toLowerCase().trim())
        .filter(Boolean);
      if (yaSurnames.length >= 2 && yaSurnames.every((n) => n === yaSurnames[0])) {
        return 'sibling_household';
      }
    }

    // No relationship anywhere in the graph. That only counts as evidence for a
    // household that CAME FROM THE SAVE, where the game records relationships:
    // there, adults with no link and no shared surname really are sharing a
    // house rather than a family. A household built in the planner has no edges
    // by construction — nothing here authors them — so its silence says nothing
    // and it keeps the shape-based reading. Otherwise the first hand-built
    // couple in anyone's town would be labelled Roommates.
    const imported = !!household.sourceId;
    if (imported && known && link === null && adults === 2) {
      const surnames = new Set(sims.map((s) => (s.lastName ?? '').toLowerCase().trim()).filter(Boolean));
      if (surnames.size > 1) return 'roommates';
    }

    // 2 adults → Couple (locked design)
    if (adults === 2) return 'couple';
    // 3+ adults → Roommates
    return 'roommates';
  }

  return 'other';
}
