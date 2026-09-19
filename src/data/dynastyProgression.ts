/**
 * Dynasty progression derivations (EP21). Prestige and unity are stored as raw
 * point totals on the dynasty head's ranked statistics; the displayed level/stars
 * and unity rank are DERIVED from those totals via these in-game thresholds
 * (sourced from the rankedStatistic tunings / confirmed cheat table). Keep raw
 * values in the parser and derive here so re-sync never diffs a computed value.
 */

/** Prestige point thresholds for levels 0..10 (index = level). */
export const PRESTIGE_LEVEL_THRESHOLDS = [0, 100, 450, 1350, 3300, 6700, 11100, 16100, 21100, 26100, 31100];
export const MAX_PRESTIGE_LEVEL = PRESTIGE_LEVEL_THRESHOLDS.length - 1;

/** Whole prestige level (0..10) for a raw prestige total. */
export function prestigeLevel(prestige: number | null): number {
  if (prestige == null) return 0;
  let lvl = 0;
  for (let i = 0; i < PRESTIGE_LEVEL_THRESHOLDS.length; i++) {
    if (prestige >= PRESTIGE_LEVEL_THRESHOLDS[i]) lvl = i;
    else break;
  }
  return lvl;
}

/**
 * Fractional level (e.g. 9.4) for a progress bar: whole level + fraction toward
 * the next threshold. Caps at MAX_PRESTIGE_LEVEL.
 */
export function prestigeProgress(prestige: number | null): number {
  if (prestige == null) return 0;
  const lvl = prestigeLevel(prestige);
  if (lvl >= MAX_PRESTIGE_LEVEL) return MAX_PRESTIGE_LEVEL;
  const lo = PRESTIGE_LEVEL_THRESHOLDS[lvl];
  const hi = PRESTIGE_LEVEL_THRESHOLDS[lvl + 1];
  return lvl + (prestige - lo) / (hi - lo);
}

export type UnityRank = 'Crisis' | 'Neutral' | 'Stability';

/** Unity rank band for a raw unity total: 0–44 Crisis, 45–84 Neutral, 85+ Stability. */
export function unityRank(unity: number | null): UnityRank {
  if (unity == null || unity < 45) return 'Crisis';
  if (unity < 85) return 'Neutral';
  return 'Stability';
}
