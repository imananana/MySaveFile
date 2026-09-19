/**
 * Effective values — the plan resolved to ONE value per field.
 *
 * Most sim fields are single-valued: the planner stores the save's value and
 * overwrites it when you edit (traits, aspiration, gender, lifestage …). Four
 * fields can't work that way, because the save's version carries progress you
 * can't author — a career has a LEVEL, a skill has a LEVEL, a move has a
 * departure, funds have a balance. Those are stored as two columns so the
 * editor can offer a revert.
 *
 * That is a STORAGE shape, not a display one. Everywhere the app reports,
 * filters, sorts or counts, there is only one true answer: the one you
 * authored, or the save's when you authored nothing. A sim planned into
 * Culinary is a chef — not a spy AND a chef, which would count them twice in
 * any distribution and make every percentage on the Diversity page wrong.
 *
 * Three places deliberately do NOT use these:
 *  - the per-sim editor and the household workspace, which must show both sides
 *    (that is what the revert affordance reverts TO);
 *  - import / re-sync / snapshots, which compare the SAVE's value against the
 *    SAVE's baseline. Feeding an effective value there would read a plan as a
 *    game change and let the next sync overwrite it;
 *  - `.s4plan` export, a faithful copy that has to restore both sides.
 *
 * A level is the one thing that never resolves: you can plan that a sim becomes
 * a Chef, not that they are a level 6 Chef. Planned careers and planned skills
 * carry no level, and anything keyed on one (mastery, "level 10") stays
 * observed-only by necessity.
 */
import type { Sim, Household, HouseholdComposition } from '../types';
import { EMPTY_COMPOSITION } from '../types';
import { resolveCareer, type SimCareer } from '../data/careerSelect';
import { STOCK_CAREERS } from '../data/stockCareers';

/** A career with the level made optional — a planned one has no level. */
export type EffectiveCareer = Omit<SimCareer, 'level'> & { level: number | null };

/**
 * The career a sim holds in the plan.
 *  - planned track  → that career, no level (a level can't be authored)
 *  - planned 'none' → null (planned unemployed overrides a save-mirrored job)
 *  - otherwise      → the save's career, level and all
 */
export function effectiveCareer(sim: Sim): EffectiveCareer | null {
  const planned = sim.plannedCareerUid ?? null;
  if (planned === 'none') return null;
  if (planned) {
    const cat = STOCK_CAREERS[planned.toLowerCase()];
    // An unknown uid (a catalog the user's packs no longer cover) still counts
    // as a planned job — fall back to the uid so it can't silently vanish.
    return { uid: planned, name: cat?.name ?? planned, kind: cat?.kind ?? 'fulltime', level: null };
  }
  return sim.career ? resolveCareer(sim.career) : null;
}

/** True when the sim holds a real job — NPC and club jobs aren't employment. */
export function isEmployed(career: EffectiveCareer | null): boolean {
  return !!career && career.kind !== 'npc' && career.kind !== 'club';
}

/**
 * Every skill the sim has in the plan. Unlike a career, a planned skill ADDS to
 * what they've built rather than replacing it — you don't unlearn Cooking by
 * planning Guitar. Presence only; planned entries have no level.
 */
export function effectiveSkillIds(sim: Sim): Set<string> {
  const out = new Set<string>();
  for (const s of sim.skills ?? []) out.add(s.skillId);
  for (const id of sim.plannedSkillIds ?? []) out.add(id);
  return out;
}

/** The household the sim lives in under the plan — their planned destination
 *  when they have one, else where they live now. */
export function effectiveHouseholdId(sim: Sim): string | null {
  return sim.plannedMoveHouseholdId ?? sim.householdId ?? null;
}

/**
 * A funds target is a THRESHOLD to reach, and it is spent once reached — a
 * household that has already made its §50,000 is worth what it actually has,
 * not what you once aimed at. There is no such thing as a spend-down goal;
 * a target below the current balance is not a plan, it's a stale number.
 */
export function isFundsGoalActive(hh: Household): boolean {
  return hh.plannedMoney != null && (hh.money == null || hh.money < hh.plannedMoney);
}

/** A household's funds under the plan — the target while it's still a target,
 *  the save's balance once it's been reached (or was never set). */
export function effectiveFunds(hh: Household): number | null {
  return isFundsGoalActive(hh) ? hh.plannedMoney! : (hh.money ?? null);
}

/**
 * A household's shape built from the sims actually in it.
 *
 * `household.composition` is written by import and re-sync and by nothing else,
 * so it is only ever the SAVE's count. A household you made here keeps the empty
 * composition it was created with no matter how many sims you add, and a sim you
 * plan to move never appears in either household's. Deriving the shape from the
 * members is what makes "what kinds of households do I have" answer for the
 * town you're planning rather than the one you imported.
 *
 * Pets ride in their own three fields, which is where the classifier looks for
 * them. A pet whose subtype is just 'pet' is counted under `dog` — only the pet
 * TOTAL is ever read, and this value is classifier input, never persisted.
 */
export function compositionFromSims(sims: Sim[]): HouseholdComposition {
  const c: HouseholdComposition = {
    ...EMPTY_COMPOSITION,
    elder: { male: 0, female: 0 }, adult: { male: 0, female: 0 },
    youngAdult: { male: 0, female: 0 }, teen: { male: 0, female: 0 },
    child: { male: 0, female: 0 }, toddler: { male: 0, female: 0 },
    infant: { male: 0, female: 0 }, newborn: { male: 0, female: 0 },
    dog: 0, cat: 0, horse: 0,
  };
  for (const s of sims) {
    if (s.species === 'pet') {
      if (s.petSubtype === 'cat') c.cat += 1;
      else if (s.petSubtype === 'horse') c.horse += 1;
      else c.dog += 1;
      continue;
    }
    const bucket = c[s.lifestage as Exclude<Sim['lifestage'], 'pet'>];
    if (bucket) bucket[s.gender] += 1;
  }
  return c;
}

/**
 * The composition to classify a household by: its members when it has any, the
 * stored save composition when it has none (a household ingested without its
 * sims still has a shape worth reporting).
 */
export function effectiveComposition(hh: Household, members: Sim[]): HouseholdComposition {
  return members.length > 0 ? compositionFromSims(members) : hh.composition;
}
