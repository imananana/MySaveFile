/**
 * Club parser.
 *
 * Clubs live at SaveGameData → field 2 (SaveSlotData wrapper) → field 8
 * (GameplaySaveSlotData) → field 7 (PersistableClubService) → field 3
 * (repeated Club).
 *
 * Field numbers ≥ 16 use multi-byte varint tags, so we read tags as varints.
 *
 * Club fields confirmed against the live game format (3-year-old schema is out
 * of date for some numbers — verified empirically against Slot_10312032's
 * "Meat Lovers" custom club):
 *   1 (varint)     club_id
 *   2 (string)     name — absent for stock Get Together clubs
 *   3 (sub-msg)    icon ResourceKey { 1: type, 2: group, 3: instance }
 *   4 (string)     description (user-set)
 *   5 (varint)     invite setting — 0=Open Invitation, 1=Invite Only
 *                  (seed-confirmed via Slot_7 "Testy Club" .ver diff, 2026-06-23)
 *   6 (fixed64)    leader sim_id
 *   7 (packed f64) members
 *   12 (sub-msg)   club_seed ResourceKey — present only for stock clubs
 *   8 (sub-msg)    hangout general-venue payload — present only when setting=1
 *                  (General Venue). A ResourceKey to the venue tuning:
 *                  { f1: 0xe6bbd7de = VenueTuning resource type (hence invariant —
 *                  it's the type tag, confirmed = the E6BBD7DE export prefix),
 *                  f2: group (0), f3: venue tuning instance id }. f3 resolves via
 *                  VENUE_TUNING_MAP (same map as lot types): e.g. 0x2334e=Arts
 *                  Center, 0x6f417=Custom Venue. Seed-confirmed via Slot_7 "Testy
 *                  Club" .ver diff + 30-club cross-save scan (all f3 mapped, f1
 *                  constant = the type tag), 2026-06-23.
 *   22 (varint)    hangout_setting (0=none, 1=venue/general type, 2=lot/specific)
 *   23 (fixed64)   hangout_zone_id — present only when setting=2 (Specific Location)
 */
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields, decodeText } from './protobuf';
import { extractResourceKeyInstance } from './resourceKey';
import { resolveClubActivity } from '../../data/stockClubActivities';
import type { ParsedClub, ClubHangoutSetting, VenueCriterion, ParsedClubRule, ParsedClubTarget } from './types';

// Club membership-criterion category (f9.f1) → VenueCriterion type. Same Sim-
// filter system as custom-venue role criteria (reuse the venue type enum), with
// the club-only 2 = marital. Confirmed via catalog cross-check + in-game fixtures
// (see project_parser_completeness). Gender requirements come through as 'trait'
// (a gender trait), so 10 is rarely seen on clubs.
const CLUB_CRITERION_TYPE: Record<number, VenueCriterion['type']> = {
  0: 'skill', 1: 'trait', 2: 'marital', 3: 'career', 4: 'funds', 5: 'age', 7: 'fame',
  9: 'occult', 10: 'gender', 11: 'region', 12: 'orientation', 13: 'relationship',
};

interface PField { v: bigint; bytes: Uint8Array | null }
// Flat field map of a protobuf message: fn → list of values (varint/fixed as
// bigint in .v, length-delimited bytes in .bytes).
function mapFields(buf: Uint8Array): Map<number, PField[]> {
  const out = new Map<number, PField[]>();
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, afterTag: number;
    try { [fn, wire, afterTag] = readTag(buf, p); } catch { break; }
    if (fn === 0) break;
    p = afterTag;
    const push = (f: PField) => { (out.get(fn) ?? out.set(fn, []).get(fn)!).push(f); };
    if (wire === 0) { const [v, n] = readVarint(buf, p); push({ v, bytes: null }); p = n; }
    else if (wire === 1) { push({ v: readFixed64LE(buf, p), bytes: null }); p += 8; }
    else if (wire === 5) { push({ v: 0n, bytes: buf.slice(p, p + 4) }); p += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); push({ v: 0n, bytes: buf.slice(n, end) }); p = end; }
    else break;
  }
  return out;
}

// One membership criterion (club record f9). f1 = category (type), f2[] = the
// accepted values (an "any of" set), f3 = flag. Each value entry carries either a
// nested ref {…f3: tuning instance} (skill/trait/career/occult/region) or an
// inline enum f4 (age bitmask / gender / fame / marital).
function parseClubCriterion(f9: Uint8Array): VenueCriterion | null {
  const m = mapFields(f9);
  const rawType = Number(m.get(1)?.[0]?.v ?? -1);
  const type = CLUB_CRITERION_TYPE[rawType] ?? 'unknown';
  const values: number[] = [];
  for (const entry of m.get(2) ?? []) {
    if (!entry.bytes) continue;
    const em = mapFields(entry.bytes);
    const ref = em.get(3)?.[0]?.bytes;           // nested ref → instance in its f3
    if (ref) { const v = mapFields(ref).get(3)?.[0]?.v; if (v != null) values.push(Number(v)); }
    else { const inline = em.get(4)?.[0]?.v; if (inline != null) values.push(Number(inline)); }
  }
  if (values.length === 0) return null;
  return { type, required: true, values, rawType };
}

// "To Whom" target of a club rule (f10.f3). Absent ⇒ anyone. f3.f1 = filter
// category: 5 = age (values in f3.f2[].f4), 6 = club (target club id in f3.f2.f5).
function parseClubTarget(f3: Uint8Array | undefined): ParsedClubTarget {
  if (!f3) return { kind: 'anyone' };
  const m = mapFields(f3);
  const cat = Number(m.get(1)?.[0]?.v ?? -1);
  if (cat === 5) {
    const ages: number[] = [];
    for (const e of m.get(2) ?? []) { if (e.bytes) { const v = mapFields(e.bytes).get(4)?.[0]?.v; if (v != null) ages.push(Number(v)); } }
    return { kind: 'age', ages };
  }
  if (cat === 6) {
    const inner = m.get(2)?.[0]?.bytes;
    const clubId = inner ? mapFields(inner).get(5)?.[0]?.v : undefined;
    if (clubId != null) return { kind: 'club', clubId: clubId.toString(16) };
  }
  return { kind: 'other', rawCategory: cat };
}

// One club rule (f10). f1 = 0 discouraged / 1 encouraged, f2.f3 = activity
// interaction-group instance, f3 (optional) = the To-Whom target.
function parseClubRule(f10: Uint8Array): ParsedClubRule | null {
  const m = mapFields(f10);
  const f2 = m.get(2)?.[0]?.bytes;
  const inst = f2 ? mapFields(f2).get(3)?.[0]?.v : undefined;
  if (inst == null) return null;
  const activityId = '0x' + inst.toString(16);
  return {
    encouraged: Number(m.get(1)?.[0]?.v ?? 1) === 1,
    activityId,
    activity: resolveClubActivity(inst) ?? `Activity ${activityId}`,
    target: parseClubTarget(m.get(3)?.[0]?.bytes ?? undefined),
  };
}

export function parseClub(buf: Uint8Array): ParsedClub | null {
  let id = 0n;
  let name: string | null = null;
  let description = '';
  let iconInstance: string | null = null;
  let clubSeed: string | null = null;
  let leaderSimId: bigint | null = null;
  const memberSimIds: bigint[] = [];
  let inviteOnly = false;
  let hangoutSettingRaw = 0;
  let hangoutZoneId: bigint | null = null;
  let hangoutVenueTypeId: string | null = null;
  const criteria: VenueCriterion[] = [];
  const rules: ParsedClubRule[] = [];

  let p = 0;
  while (p < buf.length) {
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;

    if (wire === 0) {
      const [v, n] = readVarint(buf, p);
      p = n;
      if (fn === 1) id = v;
      else if (fn === 5) inviteOnly = Number(v) === 1;
      else if (fn === 22) hangoutSettingRaw = Number(v);
    } else if (wire === 1) {
      if (fn === 6) leaderSimId = readFixed64LE(buf, p);
      else if (fn === 23) hangoutZoneId = readFixed64LE(buf, p);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      const ln = Number(l);
      const sub = buf.slice(n, n + ln);
      p = n + ln;

      if (fn === 2) {
        name = decodeText(sub);
      } else if (fn === 4) {
        description = decodeText(sub);
      } else if (fn === 3) {
        iconInstance = extractResourceKeyInstance(sub);
      } else if (fn === 8) {
        // General-venue hangout payload: f3 = venue tuning id (the chosen type).
        const v = mapFields(sub).get(3)?.[0]?.v;
        if (v != null) hangoutVenueTypeId = '0x' + v.toString(16);
      } else if (fn === 12) {
        clubSeed = extractResourceKeyInstance(sub);
      } else if (fn === 7) {
        // Members: packed fixed64 (8 bytes each)
        for (let q = 0; q + 8 <= sub.length; q += 8) {
          memberSimIds.push(readFixed64LE(sub, q));
        }
      } else if (fn === 9) {
        const c = parseClubCriterion(sub);
        if (c) criteria.push(c);
      } else if (fn === 10) {
        const r = parseClubRule(sub);
        if (r) rules.push(r);
      }
    } else if (wire === 5) {
      p += 4;
    } else {
      return null;
    }
  }

  if (id === 0n) return null;

  const hangoutSetting: ClubHangoutSetting =
    hangoutSettingRaw === 1 ? 'venue'
    : hangoutSettingRaw === 2 ? 'lot'
    : 'none';

  return {
    id, name, description, iconInstance, clubSeed, leaderSimId, memberSimIds, inviteOnly,
    hangoutSetting,
    hangoutZoneId: hangoutSetting === 'lot' ? hangoutZoneId : null,
    hangoutVenueTypeId: hangoutSetting === 'venue' ? hangoutVenueTypeId : null,
    criteria, rules,
  };
}

export function scanClubs(buf: Uint8Array): ParsedClub[] {
  const saveSlot = findLDField(buf, 2);
  if (!saveSlot) return [];
  const gameSlot = findLDField(saveSlot, 8);
  if (!gameSlot) return [];
  const clubSvc = findLDField(gameSlot, 7);
  if (!clubSvc) return [];

  const out: ParsedClub[] = [];
  for (const clubBytes of iterLDFields(clubSvc, 3)) {
    const club = parseClub(clubBytes);
    if (club) out.push(club);
  }
  return out;
}
