/**
 * Snapshot shapes for the `last_imported_state` JSONB column on each importable
 * entity. Stored at import time as a frozen copy of the game-truth fields, so a
 * later re-import can diff (current planner state vs. snapshot) and (new save vs.
 * snapshot) to tell apart "user edited this in the planner" from "game changed
 * this since last import".
 *
 * Snapshots reference other entities by their game `source_id` (hex), not by
 * planner UUID — planner UUIDs get reassigned on each re-import; source_ids
 * survive.
 */
import type { HouseholdComposition, SimGender, SimLifestage, SimSpecies, SimPetSubtype, SimOccult, Season, SimEnrolledDegree, SimCareer } from '../../types';
import type { ParsedVenueRole, ParsedVenueSlot } from './types';

export interface LotSnapshot {
  customName: string;  // game-stored name at last import (may equal seed default)
  customType: string;  // game-stored lot type at last import (or detected default)
}

// Lots reconcile with a 3-way merge against a per-lot baseline stored in
// `lots.last_imported_state`. The column predates the stateless era and once
// held bare LotSnapshots that are now stale; we tag every baseline we write with
// a version marker and IGNORE anything lacking the current marker on read, so
// pre-versioned rows fall back to the seed default and behave exactly like the
// old stateless rule (no silent reverts). Bump the version to invalidate all
// stored baselines at once.
export const LOT_BASELINE_VERSION = 1;

/**
 * Read a stored lot baseline, trusting it only when it carries the current
 * version marker. Returns null for missing, malformed, or pre-versioned data so
 * callers fall back to the seed default.
 */
export function readLotBaseline(stored: unknown): LotSnapshot | null {
  if (!stored || typeof stored !== 'object') return null;
  const s = stored as Record<string, unknown>;
  if (s.v !== LOT_BASELINE_VERSION) return null;
  if (typeof s.customName !== 'string' || typeof s.customType !== 'string') return null;
  return { customName: s.customName, customType: s.customType };
}

/** Build the versioned baseline value to persist for a lot (the RAW save snapshot). */
export function makeLotBaseline(snap: LotSnapshot): LotSnapshot & { v: number } {
  return { customName: snap.customName, customType: snap.customType, v: LOT_BASELINE_VERSION };
}

export interface HouseholdSnapshot {
  name: string;
  composition: HouseholdComposition;
  description: string;          // game-stored household description, '' if none
  assignedLotKey: string | null; // planner lot_key (stable; derived from worldName::lotName)
}

export interface SimSnapshot {
  firstName: string;
  lastName: string;
  gender: SimGender;
  lifestage: SimLifestage;
  species: SimSpecies;
  petSubtype: SimPetSubtype;
  petBreed: string | null;
  occult: SimOccult;
  isGhost: boolean;
  householdSourceId: string;    // hex of the parent household's game ID
  // CAS personality data, filtered against STOCK_TRAITS / STOCK_ASPIRATIONS
  // before storage. Optional for backwards compatibility with snapshots
  // taken before this field landed (older saved imports treat as []).
  traitIds?: string[];
  aspirationId?: string | null;
  // Newer game-truth fields. Optional for backwards compatibility with snapshots
  // taken before they landed (older saved imports diff as "routine" backfill).
  deathCause?: string | null;
  enrolledDegree?: SimEnrolledDegree | null;
  career?: SimCareer | null;
}

export interface ClubSnapshot {
  name: string;
  icon: string;
  description: string;
  assignedLotKey: string | null;
  memberSimSourceIds: string[];   // hex sim source_ids of members
}

export interface SmallBusinessSnapshot {
  name: string;
  icon: string;
  description: string;
  ownerSimSourceId: string | null; // hex sim source_id of owner, or null
  // Full game lot set (planner lot_keys) at snapshot time — businesses can span
  // multiple lots. This is the BASELINE for plan-vs-save lot reconciliation
  // (see reconcileBusinessLots) and is deliberately EXCLUDED from the field-level
  // diff. Optional for back-compat with older snapshots that stored only the
  // single primary lot in `assignedLotKey`.
  assignedLotKeys?: string[];
  /** @deprecated superseded by `assignedLotKeys`; kept optional so pre-existing
   *  baselines still parse. Read both via `lotSetFromSnapshot`. */
  assignedLotKey?: string | null;
}

/** A business's game lot set from a stored snapshot, tolerant of the old
 *  single-lot shape (`assignedLotKey`) written before multi-lot baselines. */
export function lotSetFromSnapshot(snap: SmallBusinessSnapshot | null | undefined): string[] {
  if (!snap) return [];
  if (snap.assignedLotKeys) return snap.assignedLotKeys;
  return snap.assignedLotKey ? [snap.assignedLotKey] : [];
}

// Custom venue (EP20). Identified by planner lot_key, not a game source_id.
// roles/slots are the parser's structures, CANONICALLY SORTED before storage
// (the game reshuffles role/criterion/slot order between writes — sorting keeps
// the re-import diff from showing phantom changes). `notes` is private (planner-
// only) and intentionally excluded — re-sync never touches it.
export interface CustomVenueSnapshot {
  name: string;
  roles: ParsedVenueRole[];
  slots: ParsedVenueSlot[];
}

export interface HolidaySnapshot {
  name: string;
  icon: string;
  // The holiday's per-length placement ('1'|'2'|'4' → {day,season}). Compared
  // instead of a single day so the diff is plan-length-independent — a plan that
  // renders at a different length than the save no longer phantom-diffs. Empty
  // for hand-made holidays (never matched in the diff, which keys on source_id).
  scaledDates: Record<string, { day: number; season: Season }>;
}

export interface DynastySnapshot {
  name: string;
  description: string;
  headSimSourceId: string | null;                       // hex sim source_id of head, or null
  members: { sourceId: string; order: number; role: string | null }[];  // hex sim source_ids + order + role
  valueIds: string[];                                   // ideal + skill tuning ids (hex)
  crestBgHash: string | null;
  crestFgHash: string | null;
  prestige: number | null;
  unity: number | null;
  perkIds: number[];
}
