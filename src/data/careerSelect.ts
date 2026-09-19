/**
 * Active-career selection — picks a sim's *current* job from the raw active-
 * career entries (attributes.f12.f1; see readCareerEntries in sims.ts for why
 * f1, not the f2 history). Hand-written (the catalog stockCareers.ts is
 * generated, so logic lives here).
 *
 * Reverse-engineered in scripts/diagnostics/spikeCareerActive.ts + dumpCareerStruct.ts:
 *  - The f1 set holds one entry per *current* track: their job, the teen
 *    'High School' tracker, an after-school activity, the freelancer trade, and
 *    (for uni students) course trackers whose uids aren't real careers.
 *  - Freelancers' f1 is already the SPECIFIC trade (e.g. Freelance Programmer);
 *    the generic base (0x327c7) lives only in the f2 history, so the collapse
 *    below is now a belt-and-suspenders guard.
 *
 * Rule: resolve each entry via the catalog; drop 'school' + unknown (uni course)
 * uids; collapse the freelancer base when a specific trade exists; then pick by
 * kind priority. NPC jobs are lowest priority, so a townie whose only job is NPC
 * still surfaces it (the makeover-finder use case).
 */
import { STOCK_CAREERS, type CareerKind } from './stockCareers';

export interface SimCareer {
  uid: string;        // '0x..' career tuning id
  name: string;       // display name from the catalog
  kind: CareerKind;   // fulltime|parttime|teen|club|freelance|npc
  level: number;      // f4 (rank within the track/branch)
}

/** One raw career-tracker entry as read from the save. */
export interface RawCareerEntry { uid: string; level: number }

/** Re-resolve a stored career's name + kind from the live catalog by uid (the
 *  uid is the stable key; name/kind are presentational). Lets catalog renames
 *  show immediately without re-parsing. Falls back to the stored values. */
export function resolveCareer(c: SimCareer): SimCareer {
  const cat = STOCK_CAREERS[c.uid.toLowerCase()];
  return cat ? { ...c, name: cat.name, kind: cat.kind } : c;
}

const PRIORITY: Record<CareerKind, number> = {
  fulltime: 6, freelance: 5, parttime: 4, teen: 3, club: 2, npc: 1, school: 0,
};
const FREELANCER_BASE = '0x327c7';

const norm = (uid: string) => uid.toLowerCase();

/** Pick the sim's primary current career from their tracker entries, or null. */
export function pickCareer(entries: RawCareerEntry[]): SimCareer | null {
  const resolved = entries
    .map((e) => ({ uid: norm(e.uid), level: e.level, c: STOCK_CAREERS[norm(e.uid)] }))
    .filter((r): r is typeof r & { c: NonNullable<typeof r.c> } => !!r.c && r.c.kind !== 'school');
  if (resolved.length === 0) return null;

  // Collapse freelancer: drop the generic base if a specific trade entry exists.
  const hasSpecificFreelance = resolved.some((r) => r.c.kind === 'freelance' && r.uid !== FREELANCER_BASE);
  const cand = hasSpecificFreelance ? resolved.filter((r) => r.uid !== FREELANCER_BASE) : resolved;

  cand.sort((a, b) => PRIORITY[b.c.kind] - PRIORITY[a.c.kind] || b.level - a.level);
  const top = cand[0];

  // Freelancer level lives on the base entry; if the specific trade entry reads
  // level 0, take the max level across the sim's freelance entries.
  let level = top.level;
  if (top.c.kind === 'freelance' && !level) {
    level = Math.max(0, ...resolved.filter((r) => r.c.kind === 'freelance').map((r) => r.level));
  }

  return { uid: top.uid, name: top.c.name, kind: top.c.kind, level };
}
