/**
 * The game-truth fields a re-sync refreshes WITHOUT diffing them.
 *
 * A club's rules, a business's takings, a holiday's traditions, a dynasty's
 * alliances: none of these ride in the entity's snapshot, so the field-level
 * diff can't see them. The apply step refreshes them unconditionally instead.
 *
 * That left the sync screen understating itself — a session where you only
 * rewrote a club's rules reported "No new households, sims or lots" and then
 * quietly applied the rewrite. So the same comparisons now run at ANALYZE time
 * too, to decide whether the thing changed at all.
 *
 * Both callers share these functions on purpose. Two copies of "did this club
 * change?" would drift, and the count would start lying in the other direction.
 * Each returns the resolved values alongside the verdict, so the apply step
 * doesn't recompute them.
 */
import type { Club, Dynasty, Holiday, SmallBusiness, Season } from '../../types';
import type { ParsedClub, ParsedDynasty, ParsedHoliday, ParsedSmallBusiness } from '../saveParser';
import { reconcileBusinessLots } from './diff';

/** Order-insensitive equality for two string-id lists. */
export function sameStrSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Deep-equal two holiday scaledDates maps ('1'|'2'|'4' → {day,season}). */
export function eqScaled(
  a: Record<string, { day: number; season: Season }> | null | undefined,
  b: Record<string, { day: number; season: Season }> | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => b[k] && a[k].day === b[k].day && a[k].season === b[k].season);
}

/** A holiday's day+season for a given plan length; falls back to any recorded one. */
export function scaledFor(
  sd: Record<string, { day: number; season: Season }> | null | undefined,
  planLength: number,
): { day: number; season: Season } | null {
  return sd ? (sd[String(planLength)] ?? Object.values(sd)[0] ?? null) : null;
}

// ─── Clubs: leader · requirements · activities · invite · general venue ───────

export interface ClubRefresh {
  changed: boolean;
  /** Which of the five moved — for the apply-time log, since none of this is
   *  recoverable afterwards (the new values simply overwrite the old). */
  fields: string[];
  leaderSimId: string | null;
}

export function clubRefresh(
  club: Club,
  parsed: ParsedClub,
  plannerSimIdBySource: Map<string, string>,
): ClubRefresh {
  const leaderSimId = parsed.leaderSimId !== null
    ? (plannerSimIdBySource.get(parsed.leaderSimId.toString(16)) ?? null)
    : null;
  const fields: string[] = [];
  if (JSON.stringify(club.criteria) !== JSON.stringify(parsed.criteria)) fields.push('requirements');
  if (JSON.stringify(club.rules) !== JSON.stringify(parsed.rules)) fields.push('activities');
  if (club.inviteOnly !== parsed.inviteOnly) fields.push('inviteOnly');
  if (club.leaderSimId !== leaderSimId) fields.push('leader');
  if (club.hangoutVenueTypeId !== parsed.hangoutVenueTypeId) fields.push('generalVenue');
  return { changed: fields.length > 0, fields, leaderSimId };
}

// ─── Dynasties: alliances + rivalries ────────────────────────────────────────

export interface DynastyRefresh {
  changed: boolean;
  fields: string[];
  allianceSourceIds: string[];
  rivalrySourceIds: string[];
  /** The save's name, when the planner row is still carrying a different one.
   *  Null when they already agree. */
  name: string | null;
}

export function dynastyRefresh(dynasty: Dynasty, parsed: ParsedDynasty): DynastyRefresh {
  const allianceSourceIds = parsed.allianceDynastyIds.map((id) => id.toString(16));
  const rivalrySourceIds = parsed.rivalryDynastyIds.map((id) => id.toString(16));
  const fields: string[] = [];
  // The NAME is reconciled here rather than through the field diff, and the
  // comparison is against the planner row itself — never against the stored
  // baseline. A rename used to be detected by the diff and then dropped on the
  // way to the database while the baseline adopted it anyway, which left the row
  // stranded on the old name AND stopped the diff ever mentioning it again
  // (baseline == save, so there was nothing left to report). Comparing the row
  // to the save has no such blind spot: a name that never landed is still wrong
  // on the next sync, so it heals itself. An empty name in the save is not a
  // rename — it's a dynasty the parser couldn't name, and it must not erase one.
  const name = parsed.name && dynasty.name !== parsed.name ? parsed.name : null;
  if (name !== null) fields.push('name');
  if (!sameStrSet(dynasty.allianceSourceIds, allianceSourceIds)) fields.push('alliances');
  if (!sameStrSet(dynasty.rivalrySourceIds, rivalrySourceIds)) fields.push('rivalries');
  return { changed: fields.length > 0, fields, allianceSourceIds, rivalrySourceIds, name };
}

// ─── Small businesses: staff, criteria, offers, pricing, standing, lots ──────

export interface SmallBusinessRefresh {
  /** A detail field moved (everything except the lot set). */
  detailsChanged: boolean;
  /** The game added or dropped a lot since the last sync. */
  lotsChanged: boolean;
  changed: boolean;
  fields: string[];
  employeeSimIds: string[];
  lotsAdded: string[];
  lotsRemoved: string[];
  /**
   * The business's lot set AFTER reconciliation — what it should end up with.
   * The apply writes this in the same request as the baseline, so a half-landed
   * sync can't leave the lots on the old set while the baseline claims the save
   * already agreed (a drift no later sync would re-examine).
   */
  lotsResult: string[];
}

export function smallBusinessRefresh(
  sb: SmallBusiness,
  parsed: ParsedSmallBusiness,
  plannerSimIdBySource: Map<string, string>,
  lotKeyByZoneId: Map<bigint, string>,
  lotBaseline: string[],
): SmallBusinessRefresh {
  const employeeSimIds = parsed.employeeSimIds
    .map((eid) => plannerSimIdBySource.get(eid.toString(16)))
    .filter((x): x is string => !!x);
  const fields: string[] = [];
  if (JSON.stringify(sb.employeeSimIds) !== JSON.stringify(employeeSimIds)) fields.push('employees');
  if (JSON.stringify(sb.customerCriteria) !== JSON.stringify(parsed.customerCriteria)) fields.push('customerCriteria');
  if (JSON.stringify(sb.activities) !== JSON.stringify(parsed.activities)) fields.push('offers');
  if (sb.feeMode !== parsed.feeMode) fields.push('feeMode');
  if (sb.priceModifierPct !== parsed.priceModifierPct) fields.push('priceModifier');
  if (sb.renownRank !== parsed.renownRank) fields.push('renown');
  if (sb.alignment !== parsed.alignment) fields.push('alignment');
  if (sb.perkPoints !== parsed.perkPoints) fields.push('perkPoints');
  const detailsChanged = fields.length > 0;
  // The lot SET is excluded from the field diff (it's reconciled plan-vs-save),
  // so a business the game moved would otherwise register as no change at all.
  const gameNext = parsed.lotIds.map((z) => lotKeyByZoneId.get(z)).filter((k): k is string => !!k);
  const { result, added, removed } = reconcileBusinessLots(sb.assignedLotKeys, gameNext, lotBaseline);
  const lotsChanged = added.length > 0 || removed.length > 0;
  return {
    detailsChanged,
    lotsChanged,
    changed: detailsChanged || lotsChanged,
    fields: lotsChanged ? [...fields, 'lots'] : fields,
    employeeSimIds,
    lotsAdded: added,
    lotsRemoved: removed,
    lotsResult: result,
  };
}

// ─── Holidays: traditions · day off · decorations · placement ────────────────

export interface HolidayPatch {
  traditions?: string[];
  timeOff?: boolean;
  decorationPreset?: string | null;
  day?: number;
  season?: Season;
  scaledDates?: Record<string, { day: number; season: Season }>;
  unassigned?: boolean;
}

/**
 * The fields to PATCH on an imported holiday, given the length the plan will
 * end up at. Empty object = nothing to do, which is also how analyze reads
 * "this holiday didn't change".
 */
export function holidayRefreshPatch(
  holiday: Holiday,
  parsed: ParsedHoliday,
  finalPlanLength: number,
): HolidayPatch {
  const traditions = parsed.traditions.map((t) => t.toString(16));
  const sd = scaledFor(parsed.scaledDates, finalPlanLength);
  const patch: HolidayPatch = {};
  // The save owns an imported holiday's date, so it is never off the calendar.
  // Parking one strands it: there is no day editor on a holiday from your save,
  // so nothing in the app can put it back. Un-park on sight.
  if (holiday.unassigned) patch.unassigned = false;
  if (!sameStrSet(holiday.traditions, traditions)) patch.traditions = traditions;
  if (holiday.timeOff !== parsed.timeOff) patch.timeOff = parsed.timeOff;
  if ((holiday.decorationPreset ?? null) !== (parsed.decorationPreset ?? null)) patch.decorationPreset = parsed.decorationPreset;
  if (sd && (holiday.day !== sd.day || holiday.season !== sd.season)) { patch.day = sd.day; patch.season = sd.season; }
  if (!eqScaled(holiday.scaledDates, parsed.scaledDates)) patch.scaledDates = parsed.scaledDates;
  return patch;
}
