/**
 * Helpers that turn parsed-save entities (ParsedX) into the snapshot shape
 * stored in `last_imported_state`, and helpers that turn current planner
 * entities into the same shape for diffing.
 *
 * Both sides of a re-import diff need to compare snapshots:
 *   - "next" snapshot: what the new save would store if imported now
 *   - "current" snapshot: what the planner state would store if frozen now
 *   - "last" snapshot: what was actually stored at the previous import
 *
 * Keeping these conversions in one file means a missed game-truth field gets
 * caught on both sides of the comparison, not just one.
 */
import { buildComposition } from '../../components/gameImport/buildComposition';
import { STOCK_TRAITS } from '../../data/stockTraits';
import { isDegreeTrait, resolveEnrolledDegree } from '../../data/stockDegrees';
import { resolveCareer } from '../../data/careerSelect';
import { STOCK_ASPIRATIONS } from '../../data/stockAspirations';
import type {
  ParsedHousehold, ParsedSim, ParsedClub, ParsedHoliday, ParsedSmallBusiness, ParsedLot, ParsedDynasty,
} from '../saveParser';
import type { ParsedCustomVenue, ParsedVenueRole, ParsedVenueSlot, VenueCriterion } from '../parser/types';
import type { Household, Sim, Club, SmallBusiness, Holiday, Dynasty, PlannedLot, CustomVenue } from '../../types';
import type {
  LotSnapshot, HouseholdSnapshot, SimSnapshot, ClubSnapshot,
  SmallBusinessSnapshot, HolidaySnapshot, DynastySnapshot, CustomVenueSnapshot,
} from '../parser/snapshot';

// Canonicalize a dynasty's list fields so re-ordering by the game (the save
// reshuffles ideal/skill + member order between writes) never reads as a change.
// Members are sorted by sourceId; the succession `order` is preserved as data.
function canonMembers(m: { sourceId: string; order: number; role: string | null }[]): { sourceId: string; order: number; role: string | null }[] {
  return [...m].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
const sortStr = (a: string[]) => [...a].sort();
const sortNum = (a: number[]) => [...a].sort((x, y) => x - y);

// Canonicalize a custom venue's roles/slots. The game reshuffles role order,
// criterion order, and slot/assignment order between writes (see the
// project_custom_venue_spike note), so without a stable sort every re-sync would
// show phantom changes. Both the parsed side and the planner side run through
// this, so identical content compares equal. Returns sorted COPIES (no mutation).
function canonCriteria(cs: VenueCriterion[]): VenueCriterion[] {
  return cs
    .map((c) => ({ ...c, values: [...c.values].sort((a, b) => a - b) }))
    .sort((a, b) =>
      a.rawType - b.rawType ||
      (a.required === b.required ? 0 : a.required ? -1 : 1) ||
      a.values.join(',').localeCompare(b.values.join(',')));
}
// Activity ids are canonicalised to STRINGS here as well as sorted, so a
// baseline written when they were numbers still compares equal to one written
// now — otherwise the change of type alone would read as every venue changing.
function canonActivities(a: (string | number)[]): string[] {
  return a.map(String).sort();
}
function canonRole(r: ParsedVenueRole): ParsedVenueRole {
  return { ...r, criteria: canonCriteria(r.criteria), activities: canonActivities(r.activities) };
}
function canonSlot(s: ParsedVenueSlot): ParsedVenueSlot {
  return {
    ...s,
    // Same string-canonicalisation as the activity lists, for the same reason.
    mainActivity: s.mainActivity == null ? null : String(s.mainActivity),
    assignments: [...s.assignments]
      // The per-slot override list can reorder between saves like role
      // activities do — sort it (preserving null = inherit) to avoid phantom diffs.
      .map((a) => ({ ...a, activityOverrides: a.activityOverrides ? canonActivities(a.activityOverrides) : null }))
      .sort((a, b) => a.roleIndex - b.roleIndex),
  };
}
function canonVenue(roles: ParsedVenueRole[], slots: ParsedVenueSlot[]): { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] } {
  return {
    roles: roles.map(canonRole).sort((a, b) => a.index - b.index || a.name.localeCompare(b.name)),
    slots: slots.map(canonSlot).sort((a, b) => a.hour - b.hour),
  };
}

// ─── Parsed → Snapshot (used at re-import to compute the "next" baseline) ────

export function parsedLotToSnapshot(p: ParsedLot, defaultType: string): LotSnapshot {
  return {
    customName: p.name,
    customType: p.detectedType ?? defaultType,
  };
}

export function parsedHouseholdToSnapshot(
  p: ParsedHousehold,
  householdSims: ParsedSim[],
  lotKeyByLotId: Map<bigint, string>,
): HouseholdSnapshot {
  return {
    name: p.name,
    composition: buildComposition(householdSims),
    description: p.description,
    assignedLotKey: p.lotId !== null ? (lotKeyByLotId.get(p.lotId) ?? null) : null,
  };
}

export function parsedSimToSnapshot(p: ParsedSim, householdSourceId: string): SimSnapshot {
  // Filter trait IDs to CAS personality only (saves include earned /
  // emotional / lifestyle / mod traits too); convert bigints to '0x<hex>'
  // catalog keys. Aspiration similarly filtered against the catalog.
  const traitKeys = p.traitIds
    .map((id) => '0x' + id.toString(16))
    .filter((key) => key in STOCK_TRAITS || isDegreeTrait(key));
  const aspirationKey = p.aspirationId !== null
    ? '0x' + p.aspirationId.toString(16)
    : null;
  const cleanedAspiration = aspirationKey && aspirationKey in STOCK_ASPIRATIONS
    ? aspirationKey
    : null;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    lifestage: p.lifestage,
    species: p.species,
    petSubtype: p.petSubtype,
    petBreed: p.petBreed,
    occult: p.occult,
    isGhost: p.isGhost,
    householdSourceId,
    traitIds: traitKeys,
    aspirationId: cleanedAspiration,
    deathCause: p.deathCause,
    enrolledDegree: p.enrolledDegree ? resolveEnrolledDegree(p.enrolledDegree) : null,
    // Canonicalize name/kind from the catalog so a catalog rename (e.g. NPC
    // career renames) doesn't read as a phantom "career changed" in the diff —
    // both sides compare on the same resolved name. uid+level are the real signal.
    career: p.career ? resolveCareer(p.career) : null,
  };
}

export function parsedClubToSnapshot(
  p: ParsedClub,
  resolvedName: string,
  resolvedIcon: string,
  lotKeyByLotId: Map<bigint, string>,
): ClubSnapshot {
  return {
    name: resolvedName,
    icon: resolvedIcon,
    description: p.description,
    assignedLotKey: p.hangoutZoneId !== null ? (lotKeyByLotId.get(p.hangoutZoneId) ?? null) : null,
    memberSimSourceIds: p.memberSimIds.map((b) => b.toString(16)),
  };
}

export function parsedSmallBusinessToSnapshot(
  p: ParsedSmallBusiness,
  resolvedIcon: string,
  lotKeyByLotId: Map<bigint, string>,
): SmallBusinessSnapshot {
  return {
    name: p.name,
    icon: resolvedIcon,
    description: p.description,
    ownerSimSourceId: p.ownerSimId !== null ? p.ownerSimId.toString(16) : null,
    // Full game lot set (sorted for stable comparison), the baseline for
    // plan-vs-save lot reconciliation.
    assignedLotKeys: sortStr(
      p.lotIds
        .map((id) => lotKeyByLotId.get(id))
        .filter((k): k is string => !!k),
    ),
  };
}

export function parsedHolidayToSnapshot(
  p: ParsedHoliday,
  resolvedName: string,
  resolvedIcon: string,
): HolidaySnapshot {
  return {
    name: resolvedName,
    icon: resolvedIcon,
    scaledDates: p.scaledDates,
  };
}

export function parsedDynastyToSnapshot(p: ParsedDynasty): DynastySnapshot {
  return {
    name: p.name,
    description: p.description,
    headSimSourceId: p.headSimId !== null ? p.headSimId.toString(16) : null,
    members: canonMembers(p.members.map((m) => ({ sourceId: m.simId.toString(16), order: m.order, role: m.role }))),
    valueIds: sortStr(p.valueIds),
    crestBgHash: p.crestBgHash,
    crestFgHash: p.crestFgHash,
    prestige: p.prestige,
    unity: p.unity,
    perkIds: sortNum(p.perkIds),
  };
}

export function parsedCustomVenueToSnapshot(p: ParsedCustomVenue): CustomVenueSnapshot {
  const { roles, slots } = canonVenue(p.roles, p.slots);
  return { name: p.name, roles, slots };
}

// ─── Planner → Snapshot (used to derive "current" shape for the diff) ───────

export function lotToCurrentSnapshot(l: PlannedLot): LotSnapshot {
  return {
    customName: l.customName,
    customType: l.customType,
  };
}

export function householdToCurrentSnapshot(
  h: Household,
  householdSims: Sim[],
  lotKey: string | null,
): HouseholdSnapshot {
  // The planner's composition lives directly on the household record. Sims may
  // diverge from it (see project_sims_planner note: counts are independent of
  // named sims). For the re-import diff we compare against composition since
  // that's what the snapshot would have stored.
  // householdSims unused here but kept in signature so callers can swap in a
  // sim-derived composition later if we change the snapshot contract.
  void householdSims;
  return {
    name: h.name,
    composition: h.composition,
    description: h.description, // public Description field (I1); notes stays private
    assignedLotKey: lotKey,
  };
}

export function simToCurrentSnapshot(s: Sim, householdSourceId: string): SimSnapshot {
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    lifestage: s.lifestage,
    species: s.species,
    petSubtype: s.petSubtype,
    petBreed: s.petBreed,
    occult: s.occult,
    isGhost: s.isGhost,
    householdSourceId,
    traitIds: s.traitIds ?? [],
    aspirationId: s.aspirationId ?? null,
    deathCause: s.deathCause ?? null,
    enrolledDegree: s.enrolledDegree ? resolveEnrolledDegree(s.enrolledDegree) : null,
    career: s.career ? resolveCareer(s.career) : null,  // canonicalize name (see parsedSimToSnapshot)
  };
}

export function clubToCurrentSnapshot(
  c: Club,
  memberSimSourceIds: string[],
): ClubSnapshot {
  return {
    name: c.name,
    icon: c.icon,
    description: c.description,
    assignedLotKey: c.assignedLotKey,
    memberSimSourceIds,
  };
}

export function smallBusinessToCurrentSnapshot(
  sb: SmallBusiness,
  ownerSimSourceId: string | null,
): SmallBusinessSnapshot {
  return {
    name: sb.name,
    icon: sb.icon,
    description: sb.description,
    ownerSimSourceId,
    // Planner's full lot set (sorted for stable comparison). Excluded from the
    // field diff; reconciled via reconcileBusinessLots.
    assignedLotKeys: sortStr(sb.assignedLotKeys),
  };
}

export function customVenueToCurrentSnapshot(cv: CustomVenue): CustomVenueSnapshot {
  const { roles, slots } = canonVenue(cv.roles, cv.slots);
  return { name: cv.name, roles, slots };
}

export function holidayToCurrentSnapshot(h: Holiday): HolidaySnapshot {
  return {
    name: h.name,
    icon: h.icon,
    scaledDates: h.scaledDates ?? {},
  };
}

// The caller maps the planner head + member sim ids → source ids (hex) so both
// sides of the diff compare on source ids, which survive id reassignment.
export function dynastyToCurrentSnapshot(
  d: Dynasty,
  headSimSourceId: string | null,
  members: { sourceId: string; order: number; role: string | null }[],
): DynastySnapshot {
  return {
    name: d.name,
    description: d.description,
    headSimSourceId,
    members: canonMembers(members),
    valueIds: sortStr(d.valueIds),
    crestBgHash: d.crestBgHash,
    crestFgHash: d.crestFgHash,
    prestige: d.prestige,
    unity: d.unity,
    perkIds: sortNum(d.perkIds),
  };
}
