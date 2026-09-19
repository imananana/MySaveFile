/**
 * DB-row → planner-type mappers.
 *
 * The backend returns rows with snake_case columns; the frontend store + UI
 * use camelCase shapes from `src/types`. These pure functions are the bridge.
 * Extracted from useSaveFile.ts so the store file can focus on state + actions.
 */
import { WORLDS_DATA, WORLD_NAMES, HIDDEN_LOT_TYPES } from '../data/worlds';
import type { PlannedLot, Household, Club, SmallBusiness, Holiday, Dynasty, DynastyMember, Mod, CustomVenue, CustomVenuePreset } from '../types';
import { EMPTY_COMPOSITION } from '../types';
import { readLotBaseline } from '../lib/parser/snapshot';

// Initial seed (lot metadata not in DB — these are the static defaults from worlds.ts)
export function seedLots(): Record<string, PlannedLot> {
  const lots: Record<string, PlannedLot> = {};
  for (const worldName of WORLD_NAMES) {
    const world = WORLDS_DATA[worldName];
    for (const seedLot of world.lots) {
      const lotKey = `${worldName}::${seedLot.name}`;
      lots[lotKey] = {
        lotKey,
        worldName,
        name: seedLot.name,
        customName: seedLot.name,
        location: seedLot.location,
        defaultType: seedLot.type,
        customType: seedLot.type,
        size: seedLot.size,
        status: 'unplanned',
        householdIds: [],
        notes: '',
        description: '',
        hasSmallBusiness: false,
        smallBusinessName: '',
        smallBusinessNotes: '',
        smallBusinessIcon: '',
        clubIds: [],
        sourceId: null,
        lastSaved: null,
      };
    }
  }
  return lots;
}

export function rowToLot(row: Record<string, unknown>): PlannedLot {
  return {
    lotKey: row.lot_key as string,
    worldName: row.world_name as string,
    name: row.lot_name as string,
    customName: row.custom_name as string,
    location: row.location as string,
    defaultType: row.default_type as string,
    customType: HIDDEN_LOT_TYPES.has(row.default_type as string)
      ? (row.default_type as string)
      : (row.custom_type as string),
    size: row.size as string,
    status: row.status as PlannedLot['status'],
    householdIds: row.household_ids as string[],
    notes: row.notes as string,
    description: (row.description as string) ?? '',
    hasSmallBusiness: !!(row.has_small_business as number),
    smallBusinessName: (row.small_business_name as string) ?? '',
    smallBusinessNotes: (row.small_business_notes as string) ?? '',
    smallBusinessIcon: (row.small_business_icon as string) ?? '',
    clubIds: (row.club_ids as string[]) ?? [],
    sourceId: (row.source_id as string | null) ?? null,
    lastSaved: readLotBaseline(row.last_imported_state),
  };
}

export function rowToDynasty(row: Record<string, unknown>): Dynasty {
  // saveFiles.ts (rowToDynastyDTO) already hands back camelCase + parsed arrays.
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : typeof v === 'string' ? JSON.parse(v || '[]') : [];
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    notes: (row.notes as string) ?? '',
    headSimId: (row.headSimId as string | null) ?? null,
    members: arr<DynastyMember>(row.members),
    valueIds: arr<string>(row.valueIds),
    crestBgHash: (row.crestBgHash as string | null) ?? null,
    crestFgHash: (row.crestFgHash as string | null) ?? null,
    prestige: row.prestige == null ? null : Number(row.prestige),
    unity: row.unity == null ? null : Number(row.unity),
    perkIds: arr<number>(row.perkIds),
    allianceSourceIds: arr<string>(row.allianceSourceIds),
    rivalrySourceIds: arr<string>(row.rivalrySourceIds),
    sourceId: (row.sourceId as string | null) ?? null,
  };
}

export function rowToClub(row: Record<string, unknown>): Club {
  // saveFiles.ts pre-parses member_sim_ids into an array; the POST /clubs response
  // hands back camelCase. Accept both key styles + raw jsonb strings.
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : typeof v === 'string' ? JSON.parse(v || '[]') : [];
  const rawMembers = row.member_sim_ids ?? row.memberSimIds;
  const memberSimIds = arr<string>(rawMembers);
  return {
    id: row.id as string,
    name: row.name as string,
    icon: (row.icon as string) ?? '',
    assignedLotKey: (row.assigned_lot_key as string | null) ?? null,
    notes: (row.notes as string) ?? '',
    description: (row.description as string) ?? '',
    memberSimIds,
    leaderSimId: (row.leader_sim_id ?? row.leaderSimId ?? null) as string | null,
    criteria: arr(row.criteria),
    rules: arr(row.rules),
    inviteOnly: !!(row.invite_only ?? row.inviteOnly),
    hangoutVenueTypeId: (row.hangout_venue_type_id ?? row.hangoutVenueTypeId ?? null) as string | null,
    sourceId: (row.source_id as string | null) ?? (row.sourceId as string | null) ?? null,
  };
}

export function rowToSmallBusiness(row: Record<string, unknown>): SmallBusiness {
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : typeof v === 'string' ? JSON.parse(v || '[]') : [];
  return {
    id: row.id as string,
    name: row.name as string,
    icon: (row.icon as string) ?? '',
    notes: row.notes as string,
    description: (row.description as string) ?? '',
    assignedLotKeys: arr<string>(row.assigned_lot_keys ?? row.assignedLotKeys),
    ownerSimId: (row.owner_sim_id ?? row.ownerSimId ?? null) as string | null,
    employeeSimIds: arr<string>(row.employee_sim_ids ?? row.employeeSimIds),
    customerCriteria: arr(row.customer_criteria ?? row.customerCriteria),
    activities: arr(row.activities),
    feeMode: (row.fee_mode ?? row.feeMode ?? 'unknown') as SmallBusiness['feeMode'],
    priceModifierPct: Number(row.price_modifier_pct ?? row.priceModifierPct ?? 0),
    renownRank: (row.renown_rank ?? row.renownRank ?? null) as number | null,
    alignment: (row.alignment ?? null) as number | null,
    perkPoints: Number(row.perk_points ?? row.perkPoints ?? 0),
    sourceId: (row.source_id as string | null) ?? null,
  };
}

export function rowToHoliday(row: Record<string, unknown>): Holiday {
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : typeof v === 'string' ? JSON.parse(v || '[]') : [];
  return {
    id: row.id as string,
    name: row.name as string,
    icon: (row.icon as string) ?? '',
    season: row.season as Holiday['season'],
    day: row.day as number,
    notes: (row.notes as string) ?? '',
    traditions: arr<string>(row.traditions),
    unassigned: !!row.unassigned,
    timeOff: !!row.time_off,
    decorationPreset: (row.decoration_preset as string | null) ?? null,
    sourceId: (row.source_id as string | null) ?? null,
    scaledDates: parseScaledDates(row.scaled_dates),
  };
}

// scaled_dates is JSONB (node-pg returns it pre-parsed) but tolerate a string too.
function parseScaledDates(v: unknown): Holiday['scaledDates'] {
  if (v == null) return null;
  const obj = typeof v === 'string' ? JSON.parse(v || 'null') : v;
  return obj && typeof obj === 'object' ? (obj as Holiday['scaledDates']) : null;
}

export function rowToMod(row: Record<string, unknown>): Mod {
  return {
    id: row.id as string,
    name: row.name as string,
    url: (row.url as string) ?? '',
    type: (row.type as Mod['type']) ?? 'Mod',
    importance: (row.importance as Mod['importance']) ?? 'recommended',
    notes: (row.notes as string) ?? '',
    excluded: !!(row.excluded as number | boolean),
  };
}

export function rowToHousehold(row: Record<string, unknown>): Household {
  return {
    id: row.id as string,
    name: row.name as string,
    composition: { ...EMPTY_COMPOSITION, ...(row.composition as Household['composition']) },
    assignedLotKey: (row.assigned_lot_key as string | null) ?? null,
    notes: row.notes as string,
    description: (row.description as string) ?? '',
    thumbnailFilename: (row.thumbnail_filename as string | null) ?? null,
    sourceId: (row.source_id as string | null) ?? null,
    // pg returns BIGINT as a string; funds fit a JS number (≤ INT32_MAX).
    money: row.money != null ? Number(row.money) : null,
    plannedMoney: row.planned_money != null ? Number(row.planned_money) : null,
    provenance: (row.provenance as Household['provenance']) ?? null,
    provenanceSub: (row.provenance_sub as string | null) ?? null,
    creatorName: (row.creator_name as string | null) ?? null,
    visibility: (row.visibility as Household['visibility']) ?? 'auto',
    lastImportedState: (row.last_imported_state as Household['lastImportedState']) ?? null,
  };
}

/**
 * Activity ids are decimal STRINGS everywhere in the app, because a modded
 * activity's id runs past what a JS number holds exactly. Rows written before
 * that hold numbers, so every custom venue is normalised on the way in — one
 * boundary, rather than a String() at each of the places that compare or look
 * one up. Cheap: a venue is a handful of roles and at most eight slots.
 */
const actIds = (a: unknown): string[] => (Array.isArray(a) ? a.map(String) : []);

export function normalizeVenueParts<T extends { roles?: unknown; slots?: unknown }>(v: T): T {
  const roles = Array.isArray(v.roles)
    ? (v.roles as Record<string, unknown>[]).map((r) => ({ ...r, activities: actIds(r.activities) }))
    : v.roles;
  const slots = Array.isArray(v.slots)
    ? (v.slots as Record<string, unknown>[]).map((s) => ({
        ...s,
        mainActivity: s.mainActivity == null ? null : String(s.mainActivity),
        assignments: Array.isArray(s.assignments)
          ? (s.assignments as Record<string, unknown>[]).map((a) => ({
              ...a,
              activityOverrides: a.activityOverrides == null ? null : actIds(a.activityOverrides),
            }))
          : s.assignments,
      }))
    : v.slots;
  return { ...v, roles, slots };
}

export function rowToCustomVenue(row: CustomVenue): CustomVenue {
  return normalizeVenueParts(row);
}

/** A preset holds either a whole venue ({roles,slots}) or a single role. */
export function rowToCustomVenuePreset(p: CustomVenuePreset): CustomVenuePreset {
  const d = p.data as Record<string, unknown>;
  const data = (d && 'roles' in d)
    ? normalizeVenueParts(d as { roles?: unknown; slots?: unknown })
    : { ...d, activities: actIds(d?.activities) };
  return { ...p, data: data as CustomVenuePreset['data'] };
}
