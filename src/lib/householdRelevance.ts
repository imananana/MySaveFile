/**
 * Household relevance — the foreground/background split for the household
 * Manager. A pure derivation over store state (no persistence): provenance
 * (from import classification), household membership, and the family-edge graph.
 *
 * A household is FOREGROUND ("on the canvas") if either:
 *   1. provenance === 'yours' — you created / CAS-edited / moved into / played it
 *      (the validated f9 signal), OR
 *   2. it's family-connected to a Yours household — a member has a living
 *      first-degree tie (parent/child/spouse/partner/sibling) to a member of
 *      some Yours household. ONE hop only: this surfaces the families that
 *      married or branched into yours (e.g. your heir marries Bella → the Goth
 *      household appears) WITHOUT the deceased-ancestor web dragging the whole
 *      town in.
 *
 * Everything else is BACKGROUND ("Rest of Town"), collapsed by default. The
 * result is foreground-only — absence from the map means background.
 *
 * NOTE: this is auto-relevance. The user's sticky Pin / Send-to-Town override
 * (Beat 1 #4) sits ON TOP of this and wins where set.
 */
import type { Household, Sim, SimRelationship, SimRelType } from '../types';

/** Why a household is foreground. 'yours' wins over 'kin' when both apply. */
export type RelevanceReason = 'yours' | 'kin';

/** First-degree CURRENT ties that count as "family-connected". Exes are
 *  historical and deliberately excluded so a divorce doesn't promote a whole
 *  household. Parent edges are directional (A=parent, B=child) — checking both
 *  endpoints covers both parent and child. */
const FIRST_DEGREE: ReadonlySet<SimRelType> = new Set<SimRelType>([
  'parent', 'spouse', 'engaged', 'partner', 'sibling', 'half_sibling',
]);

export function computeHouseholdRelevance(
  households: Record<string, Household>,
  sims: Record<string, Sim>,
  relationships: Record<string, SimRelationship> | SimRelationship[],
): Map<string, RelevanceReason> {
  const edges = Array.isArray(relationships) ? relationships : Object.values(relationships);
  const simList = Object.values(sims);

  // 1. Yours households, and the sim ids who live in one.
  const yoursHouseholds = new Set<string>();
  for (const h of Object.values(households)) if (h.provenance === 'yours') yoursHouseholds.add(h.id);
  const yoursMemberSimIds = new Set<string>();
  for (const s of simList) if (s.householdId && yoursHouseholds.has(s.householdId)) yoursMemberSimIds.add(s.id);

  // 2. Sims one first-degree hop from a Yours-household member.
  const kinOfYours = new Set<string>();
  for (const e of edges) {
    if (!FIRST_DEGREE.has(e.relType)) continue;
    if (yoursMemberSimIds.has(e.simAId)) kinOfYours.add(e.simBId);
    if (yoursMemberSimIds.has(e.simBId)) kinOfYours.add(e.simAId);
  }

  // 3. Foreground = Yours households + any household holding a kin-of-yours sim.
  const result = new Map<string, RelevanceReason>();
  for (const id of yoursHouseholds) result.set(id, 'yours');
  for (const s of simList) {
    if (s.householdId && kinOfYours.has(s.id) && !result.has(s.householdId)) {
      result.set(s.householdId, 'kin');
    }
  }
  return result;
}

/** Convenience: is this household foreground under auto-relevance? */
export function isForeground(
  relevance: Map<string, RelevanceReason>,
  householdId: string,
): boolean {
  return relevance.has(householdId);
}

/**
 * EFFECTIVE foreground/background, after applying the user's sticky visibility
 * override on top of auto-relevance. Pin forces foreground, Send-to-Town forces
 * background, 'auto' defers to the computed relevance. This is what the Manager
 * actually renders against.
 */
export function isForegroundEffective(
  household: Pick<Household, 'id' | 'visibility'>,
  relevance: Map<string, RelevanceReason>,
): boolean {
  if (household.visibility === 'pinned') return true;
  if (household.visibility === 'sent_to_town') return false;
  return relevance.has(household.id);
}
