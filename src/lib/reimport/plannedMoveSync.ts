/**
 * Planned-move sync — the silent, ingest-time reconciliation between a sim's
 * planner-authored "Planned move → X" sticker (`plannedMoveHouseholdId`) and
 * what actually happened in the game save on re-sync.
 *
 * There is NO loose-ends tray. Everything here is silent at ingest.
 *
 * Pass 1 (this file, for now) — clear stickers on ANY in-game move:
 *   A sticker is a *plan*. The moment its sim actually moves households in the
 *   game — match or not — the plan is spent. Moving is effortful and
 *   intentional, so the game's move overwrites the plan regardless of whether
 *   the destination matched. A stale sticker after a real move is noise, not a
 *   plan; the user re-authors if they still want a further move.
 *
 * Pass 2 (realization auto-adopt) lives in householdRealization.ts and is wired
 * separately — this module is only the sticker-clearing rule.
 */

export interface StickerClearInput {
  /** Planner sim id. */
  simId: string;
  /**
   * The sim's planned-move sticker, if any. Planner-authored, only ever set on
   * real (source-backed) sims. Null/undefined means no sticker → nothing to do.
   */
  plannedMoveHouseholdId: string | null | undefined;
  /**
   * Game household the sim belonged to at the LAST sync (hex source id), read
   * from the sim's stored `last_imported_state`. Undefined on the first sync
   * (no baseline) — we then have no evidence of a move, so we never clear.
   */
  prevHouseholdSourceId: string | null | undefined;
  /**
   * Game household the sim belongs to in the INCOMING save (hex source id),
   * from the fresh snapshot. Undefined when the sim is absent from the new save
   * (removed/merged) — that's handled elsewhere; Pass 1 leaves such stickers be.
   */
  nextHouseholdSourceId: string | null | undefined;
}

/**
 * Pass 1 — return the ids of sims whose `plannedMoveHouseholdId` should be
 * cleared because the sim moved households in-game since the last sync.
 *
 * Rule (locked):
 *   clear ⟺ has a sticker AND we have a prior baseline AND the sim is still
 *           present AND its game household id changed.
 *
 * Deliberately match-agnostic: it does NOT matter whether the sim landed in the
 * household the plan pointed at. Any real move spends the plan. (Realization —
 * adopting a planned household when the plan came true — is Pass 2's job, not
 * this one; the two run independently.)
 */
export function stickersToClearOnMove(sims: StickerClearInput[]): string[] {
  const out: string[] = [];
  for (const s of sims) {
    if (!s.plannedMoveHouseholdId) continue;          // no sticker → nothing to clear
    if (!s.prevHouseholdSourceId) continue;           // no prior baseline (first sync) → no evidence of a move
    if (!s.nextHouseholdSourceId) continue;           // sim gone from the save → not a move; leave it
    if (s.prevHouseholdSourceId === s.nextHouseholdSourceId) continue; // stayed put → keep the plan
    out.push(s.simId);                                // moved households → spend the plan, match or not
  }
  return out;
}
