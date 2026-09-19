/**
 * Skill points → level conversion curves for The Sims 4.
 *
 * Skills are stored in the save (sim record → f30 attributes → f13 skill
 * tracker → repeated f1 = { f1: skill statistic id, f2: float32 cumulative
 * POINTS }). The save holds POINTS, not level; level is derived from these
 * per-category threshold curves.
 *
 * DERIVED EMPIRICALLY 2026-06-20 (scripts/mod-spike `spike.skillcurve`: set each
 * level via the live API, read the raw point value back). These are confirmed
 * game values, not estimates — see project_parser_completeness memory.
 *
 * Each array = cumulative points required to REACH that level; index 0 = level 1.
 * A 5-level adult skill uses the adult curve too (it just caps at L5 — its points
 * never exceed the L5 threshold), so no per-skill max-level is needed here.
 */

/** Adult/teen/YA/elder skills (10-level majors AND 5-level minors share this). */
export const ADULT_SKILL_CURVE = [100, 1540, 3700, 7300, 12580, 19780, 29920, 43360, 60460, 81580];

/** Child skills: Creativity, Mental, Motor, Social (all share this 10-level curve). */
export const CHILD_SKILL_CURVE = [100, 1100, 2780, 5130, 7749, 10899, 14309, 17999, 21969, 26199];

/** Toddler skills: Movement, Communication, Thinking, Imagination (5-level). */
export const TODDLER_SKILL_CURVE = [119, 299, 579, 939, 1439];

/** Toddler Potty only — distinct 3-level curve. */
export const TODDLER_POTTY_CURVE = [119, 399, 759];

const CHILD_SKILL_IDS = new Set(['0x414e', '0x414f', '0x4150', '0x4151']);
const TODDLER_SKILL_IDS = new Set(['0x213cc', '0x2238a', '0x224d8', '0x225a2']);
const TODDLER_POTTY_ID = '0x23611';

/** Pick the threshold curve for a skill statistic id (default = adult). */
export function curveForSkill(skillId: string): number[] {
  const id = skillId.toLowerCase();
  if (id === TODDLER_POTTY_ID) return TODDLER_POTTY_CURVE;
  if (TODDLER_SKILL_IDS.has(id)) return TODDLER_SKILL_CURVE;
  if (CHILD_SKILL_IDS.has(id)) return CHILD_SKILL_CURVE;
  return ADULT_SKILL_CURVE;
}

/** Age tier a skill belongs to (which lifestages can build it). Toddler skills
 *  (incl. Potty) → 'toddler'; the four child skills → 'child'; everything else
 *  (teen/YA/adult/elder majors + minors) → 'adult'. */
export type SkillAgeTier = 'toddler' | 'child' | 'adult';
export function skillAgeTier(skillId: string): SkillAgeTier {
  const id = skillId.toLowerCase();
  if (id === TODDLER_POTTY_ID || TODDLER_SKILL_IDS.has(id)) return 'toddler';
  if (CHILD_SKILL_IDS.has(id)) return 'child';
  return 'adult';
}

/**
 * Convert stored skill points → integer level (1..maxLevel) for a skill id.
 * Returns 0 for an unstarted skill (points below the level-1 threshold).
 * Hidden/occult skills (e.g. Vampire Lore) are treated as adult here; their
 * exact curves are intentionally not derived — show raw progress if it matters.
 */
export function skillLevelFromPoints(skillId: string, points: number): number {
  const curve = curveForSkill(skillId);
  let level = 0;
  for (let i = 0; i < curve.length; i++) {
    if (points >= curve[i]) level = i + 1;
    else break;
  }
  return level;
}
