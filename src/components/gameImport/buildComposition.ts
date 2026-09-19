import type { ParsedSim } from '../../lib/saveParser';
import type { HouseholdComposition, SimLifestage } from '../../types';
import { EMPTY_COMPOSITION } from '../../types';

/**
 * Roll parsed sims up into a household composition (counts by lifestage +
 * gender, plus pet subtype counts). The planner stores BOTH the named sim
 * roster AND these aggregate counts because the two are allowed to diverge
 * after import (counts can include unplanned sims, sims can include people
 * outside the counts).
 */
export function buildComposition(sims: ParsedSim[]): HouseholdComposition {
  const c: HouseholdComposition = JSON.parse(JSON.stringify(EMPTY_COMPOSITION));
  for (const s of sims) {
    if (s.species === 'pet') {
      // Map detected petSubtype to the composition's pet counters.
      if (s.petSubtype === 'cat' || s.petSubtype === 'dog' || s.petSubtype === 'horse') {
        c[s.petSubtype] += 1;
      }
      continue;
    }
    const stage = s.lifestage;
    if (stage === 'pet') continue;
    if (stage in c) {
      const bucket = c[stage as Exclude<SimLifestage, 'pet'>];
      if (bucket) bucket[s.gender] += 1;
    }
  }
  return c;
}
