/**
 * Realization detection — the lot-anchored half of the full-ingest cleanup
 * model. A "realization" is when something you planned in the planner shows up
 * for real in the save: you hand-created a household (plan-only, no sourceId),
 * assigned it to a lot, then actually built/moved a household onto that same lot
 * in-game. After re-sync ingests the real household, BOTH sit on the lot.
 *
 * The LOT is the anchor (single-occupancy is an authoring invariant, so a clash
 * can only arise via re-sync). Each detected realization becomes a Loose-ends
 * item in Beat 3 with a Merge (same thing — fold the plan into the real one) /
 * Keep separate (different thing) fork. This module is the pure derivation; the
 * tray UI and the resolve actions are Beat 3.
 */
import type { Household } from '../types';

export interface Realization {
  /** The shared lot that anchors the clash. */
  lotKey: string;
  /** Your hand-created household occupying the lot in the plan (sourceId null). */
  planOnlyHouseholdId: string;
  /** The freshly-ingested save household now on the same lot (sourceId set). */
  importedHouseholdId: string;
}

/**
 * Find every plan-only ⇄ imported household pair that now shares a lot. Returns
 * empty when there are no clashes (the common case). Two imported households on
 * one lot is NOT a realization (that's a real multi-household lot, handled
 * elsewhere); only a plan-only meeting a real one is.
 */
export function detectRealizations(households: Record<string, Household>): Realization[] {
  const byLot = new Map<string, { planOnly: string[]; imported: string[] }>();
  for (const h of Object.values(households)) {
    if (!h.assignedLotKey) continue;
    let group = byLot.get(h.assignedLotKey);
    if (!group) byLot.set(h.assignedLotKey, (group = { planOnly: [], imported: [] }));
    if (h.sourceId === null) group.planOnly.push(h.id);
    else group.imported.push(h.id);
  }

  const out: Realization[] = [];
  for (const [lotKey, group] of byLot) {
    if (!group.planOnly.length || !group.imported.length) continue;
    for (const planOnlyHouseholdId of group.planOnly) {
      for (const importedHouseholdId of group.imported) {
        out.push({ lotKey, planOnlyHouseholdId, importedHouseholdId });
      }
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * Pass 2 — realization auto-adopt (Track B).
 *
 * When a re-sync ingests brand-new real households, some of them are the
 * real-world arrival of something you planned: a move you set up (real movers
 * pointed at a plan-only shell) or an invented household you assigned to a lot.
 * detectAdoptions matches each such shell to the one new real household that
 * realizes it, so the apply step can fold the shell into the real record
 * (adopt its source id + mirror name/members/money/lot) instead of creating a
 * duplicate. Silent — there is NO loose-ends tray.
 *
 * Two join paths, movers first (the stronger signal):
 *   • movers — the shell's planned movers (real sim source ids) landed together
 *     in a brand-new real household. Member-agnostic: adopt a household that
 *     contains ≥1 mover regardless of who else is in it.
 *   • lot    — a shell assigned to a (building-level) lot; a brand-new real
 *     household appeared on that same lot. Used for invented (CAS) shells whose
 *     members have no real ids, and as a fallback for move-shells whose movers
 *     didn't surface directly but whose lot realized.
 *
 * `incoming` MUST contain only brand-new real households (this sync's adds).
 * Movers joining a PRE-EXISTING household never trigger an adopt — that
 * household already owns its identity; the shell orphans and is cleaned up
 * separately.
 * ──────────────────────────────────────────────────────────────────────── */

export type AdoptionVia = 'movers' | 'lot';

export interface Adoption {
  /** Plan-only shell (planner household id) that adopts a real household. */
  shellId: string;
  /** Source id (hex) of the freshly-ingested real household it adopts. */
  realSourceId: string;
  /** Which signal made the match. */
  via: AdoptionVia;
}

export interface ShellInput {
  /** Plan-only household planner id. */
  shellId: string;
  /**
   * Tiebreak seniority — lower = older. On a two-shells-one-household contest
   * the older shell wins. Caller supplies a stable ordinal (e.g. creation order
   * or a monotonic index over the shells).
   */
  order: number;
  /** Source ids (hex) of real sims whose plannedMoveHouseholdId points here. */
  moverSourceIds: string[];
  /** Building-level lot key the shell is assigned to, if any (lot path). */
  assignedLotKey: string | null;
}

export interface IncomingRealHousehold {
  /** Source id (hex) of the new real household this sync surfaced. */
  sourceId: string;
  /** Source ids (hex) of its members. */
  memberSourceIds: string[];
  /** Building-level lot key it occupies, if any. */
  assignedLotKey: string | null;
}

/**
 * Match plan-only shells to the brand-new real households that realize them.
 * Each shell adopts at most one household and each household is adopted by at
 * most one shell. Deterministic — no reliance on Map/Set iteration for the
 * outcome (results are sorted by shellId).
 */
export function detectAdoptions(
  shells: ShellInput[],
  incoming: IncomingRealHousehold[],
): Adoption[] {
  const claimedReal = new Set<string>();   // real sourceIds already adopted
  const assignedShell = new Set<string>(); // shellIds already matched
  const adoptions: Adoption[] = [];

  // ── Movers path ────────────────────────────────────────────────────────
  // Build every (shell, real, overlap) candidate, then greedily assign in
  // priority order: most shared movers first, then oldest shell, then a stable
  // sourceId tiebreak. Greedy over that order realizes "most movers wins, ties
  // → oldest shell" for the two-shells-one-household contest, and picks the
  // household holding the most of a shell's movers when its movers split.
  interface Cand { shellId: string; order: number; realSourceId: string; overlap: number }
  const cands: Cand[] = [];
  for (const shell of shells) {
    if (!shell.moverSourceIds.length) continue;
    const moverSet = new Set(shell.moverSourceIds);
    for (const real of incoming) {
      let overlap = 0;
      for (const m of real.memberSourceIds) if (moverSet.has(m)) overlap++;
      if (overlap > 0) cands.push({ shellId: shell.shellId, order: shell.order, realSourceId: real.sourceId, overlap });
    }
  }
  cands.sort((a, b) =>
    b.overlap - a.overlap ||
    a.order - b.order ||
    (a.realSourceId < b.realSourceId ? -1 : a.realSourceId > b.realSourceId ? 1 : 0) ||
    (a.shellId < b.shellId ? -1 : a.shellId > b.shellId ? 1 : 0),
  );
  for (const c of cands) {
    if (assignedShell.has(c.shellId) || claimedReal.has(c.realSourceId)) continue;
    adoptions.push({ shellId: c.shellId, realSourceId: c.realSourceId, via: 'movers' });
    assignedShell.add(c.shellId);
    claimedReal.add(c.realSourceId);
  }

  // ── Lot path ───────────────────────────────────────────────────────────
  // Any still-unmatched shell with a lot adopts a still-unclaimed new real
  // household on that same (building-level) lot. Deterministic: process shells
  // oldest-first, and within a lot pick the lowest real sourceId.
  const incomingByLot = new Map<string, string[]>();
  for (const real of incoming) {
    if (!real.assignedLotKey) continue;
    const arr = incomingByLot.get(real.assignedLotKey) ?? [];
    arr.push(real.sourceId);
    incomingByLot.set(real.assignedLotKey, arr);
  }
  for (const [, arr] of incomingByLot) arr.sort();
  const shellsByAge = shells.slice().sort((a, b) => a.order - b.order);
  for (const shell of shellsByAge) {
    if (assignedShell.has(shell.shellId) || !shell.assignedLotKey) continue;
    const pool = incomingByLot.get(shell.assignedLotKey);
    if (!pool) continue;
    const realSourceId = pool.find((sid) => !claimedReal.has(sid));
    if (!realSourceId) continue;
    adoptions.push({ shellId: shell.shellId, realSourceId, via: 'lot' });
    assignedShell.add(shell.shellId);
    claimedReal.add(realSourceId);
  }

  adoptions.sort((a, b) => (a.shellId < b.shellId ? -1 : a.shellId > b.shellId ? 1 : 0));
  return adoptions;
}
