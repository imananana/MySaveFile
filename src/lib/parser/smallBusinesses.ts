/**
 * Small business parser.
 *
 * Lives at GameplaySaveSlotData → field 10 (BusinessServiceData). Each record
 * is a player-owned business (Get to Work retail, Dine Out, Spa Day spas, the
 * newer Businesses & Hobbies small businesses). We filter to type=5 (small
 * business / modern owned-business) and skip type=4 (Get to Work retail).
 *
 * Record layout was reverse-engineered against Slot_0000000c "Sunny Babies"
 * (venue placement) and Slot_10312032 "Test123 Shop" (residential overlay):
 *
 *   record.f1     fixed64 business_id
 *   record.f2     fixed64 type (5 = owned biz, 4 = retail)
 *   record.f3 OR record.f8    ldelim wrapper — different parent field number
 *                              for residential overlay vs venue placement,
 *                              identical interior shape:
 *     wrapper.f2  ldelim SmallBusinessData (the meat)
 *     wrapper.f4  fixed64 owner_sim_id
 *   SmallBusinessData:
 *     f5          string name
 *     f6          string description
 *     f7          ldelim icon ResourceKey { f1: type, f2: group, f3: instance }
 *     f14         ldelim packed fixed64 array of lot zone ids (a business can
 *                 span multiple lots — one 8-byte id each)
 *     f21.f4.f2[*]ldelim icon variant list — each has f1 sim_id, f2 icon
 *                 ResourceKey, f4 variant_index (0/1/2 = small/med/large icons)
 */
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields, decodeText } from './protobuf';
import { extractResourceKeyInstance } from './resourceKey';
import { resolveClubActivity } from '../../data/stockClubActivities';
import type { ParsedSmallBusiness, SmallBusinessCustomerCriterion, VenueCriterion } from './types';

// Target-customer criterion category (f21.f4.f1) → criterion type. Same Sim-filter
// categories as clubs (see clubs.ts CLUB_CRITERION_TYPE), plus the small-biz-only
// 8 = Supervised Customer. Confirmed via Slot_00000007 fixtures.
const CUSTOMER_CRITERION_TYPE: Record<number, SmallBusinessCustomerCriterion['category']> = {
  0: 'skill', 1: 'trait', 2: 'marital', 3: 'career', 4: 'funds', 5: 'age', 7: 'fame',
  8: 'supervised', 9: 'occult', 10: 'gender', 11: 'region', 12: 'orientation', 13: 'relationship',
};

// Flat field map of a protobuf message: fn → list of { v (varint/fixed as bigint),
// bytes (length-delimited) }. Mirrors clubs.ts mapFields.
function mapFields(buf: Uint8Array): Map<number, { v: bigint; bytes: Uint8Array | null }[]> {
  const out = new Map<number, { v: bigint; bytes: Uint8Array | null }[]>();
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, afterTag: number;
    try { [fn, wire, afterTag] = readTag(buf, p); } catch { break; }
    if (fn === 0) break;
    p = afterTag;
    const push = (f: { v: bigint; bytes: Uint8Array | null }) => { (out.get(fn) ?? out.set(fn, []).get(fn)!).push(f); };
    if (wire === 0) { const [v, n] = readVarint(buf, p); push({ v, bytes: null }); p = n; }
    else if (wire === 1) { push({ v: readFixed64LE(buf, p), bytes: null }); p += 8; }
    else if (wire === 5) { push({ v: 0n, bytes: buf.slice(p, p + 4) }); p += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); push({ v: 0n, bytes: buf.slice(n, end) }); p = end; }
    else break;
  }
  return out;
}

// Game-managed ticket-kiosk behavior the game appends to f21.f3 once per fee
// reconfigure (EA-named "**DEBUG**"). Not a user-offered activity — filtered out.
const TICKET_KIOSK_BEHAVIOR = 0x5f108n;

// Business perk-points statistic key inside the f21.f2 stats table.
const PERK_POINTS_STAT = 0x1f001n;

// trait_SmallBusiness_Rank_N instance → star level (0–5). The business OWNER
// carries the trait for the current rank (Businesses & Hobbies tuning). Resolve a
// business's renown by joining its ownerSimId to the owner's traitIds. Confirmed
// via Slot_00000007 (Messiah Kitchen = Rank_5 after a 5★ cheat).
const RANK_TRAIT_LEVEL = new Map<bigint, number>([
  [0x5fc53n, 0], [0x5b5een, 1], [0x5b5efn, 2], [0x5b5f0n, 3], [0x5b5f1n, 4], [0x5b5edn, 5],
]);

/** Business renown rank (0–5) from an owner sim's traits, or null if none. */
export function renownRankFromTraits(traitIds: bigint[]): number | null {
  for (const id of traitIds) {
    const lvl = RANK_TRAIT_LEVEL.get(id);
    if (lvl != null) return lvl;
  }
  return null;
}

// trait_SmallBusiness_Reputation_N instance → alignment level (1–7). The OWNER
// carries the trait for the current alignment (B&H tuning). In-game level names:
// 1 Nefarious, 2 Underground, 3 Illicit, 4 Neutral, 5 Lawful, 6 Scrupulous,
// 7 Virtuous. Confirmed via Slot_00000007 (Messiah Kitchen = level 1 at -999).
const ALIGNMENT_TRAIT_LEVEL = new Map<bigint, number>([
  [0x5be12n, 1], [0x5be13n, 2], [0x5be14n, 3], [0x5be15n, 4], [0x5be16n, 5], [0x5be17n, 6], [0x5be11n, 7],
]);

/** Business alignment level (1–7) from an owner sim's traits, or null if none. */
export function alignmentFromTraits(traitIds: bigint[]): number | null {
  for (const id of traitIds) {
    const lvl = ALIGNMENT_TRAIT_LEVEL.get(id);
    if (lvl != null) return lvl;
  }
  return null;
}

// Entrance/hourly fee mode (SmallBusinessData.f21.f1.f3). Confirmed Slot_00000007.
const FEE_MODE: Record<number, ParsedSmallBusiness['feeMode']> = {
  0: 'disabled', 1: 'hourly', 2: 'one-time',
};

// Read a fixed32 (wire 5) field off a message as a little-endian float.
function readFix32Float(buf: Uint8Array, fieldNum: number): number | null {
  const bytes = mapFields(buf).get(fieldNum)?.[0]?.bytes;
  if (!bytes || bytes.length !== 4) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
}

// One target-customer criterion (SmallBusinessData.f21.f4). f1 = category, f2[] =
// selected value terms (each carries the 796721156 filter base; the value is a
// nested ref's f3 for skill/trait/career/occult/region, or an inline f4 for
// age/supervised/etc.), f5 = "Make Selected Criteria Required", f6 = "Caregiver
// Stays at Business". Returns null if no values resolve.
function parseCustomerCriterion(buf: Uint8Array): SmallBusinessCustomerCriterion | null {
  const m = mapFields(buf);
  const rawCategory = Number(m.get(1)?.[0]?.v ?? -1);
  const category: SmallBusinessCustomerCriterion['category'] =
    CUSTOMER_CRITERION_TYPE[rawCategory] ?? 'unknown' as VenueCriterion['type'];
  const values: number[] = [];
  for (const entry of m.get(2) ?? []) {
    if (!entry.bytes) continue;
    const em = mapFields(entry.bytes);
    const ref = em.get(3)?.[0]?.bytes;          // nested ref → instance in its f3 (skill/trait/career/…)
    if (ref) { const v = mapFields(ref).get(3)?.[0]?.v; if (v != null) values.push(Number(v)); }
    else { const inline = em.get(4)?.[0]?.v; if (inline != null) values.push(Number(inline)); } // age/supervised/inline enum
  }
  if (values.length === 0) return null;
  return {
    category,
    rawCategory,
    values,
    required: Number(m.get(5)?.[0]?.v ?? 0) === 1,
    caregiverStays: Number(m.get(6)?.[0]?.v ?? 0) === 1,
  };
}

// One offered-activity entry (SmallBusinessData.f21.f3): { f1: flag, f2: { …f3:
// interaction-group activity id } } — same shape as a club rule. Returns the id.
function activityIdFromEntry(entry: Uint8Array): bigint | null {
  const f2 = findLDField(entry, 2);
  if (!f2) return null;
  let p = 0;
  while (p < f2.length) {
    const [fn, wire, after] = readTag(f2, p);
    p = after;
    if (fn === 0) break;
    if (wire === 0) { const [v, n] = readVarint(f2, p); if (fn === 3) return v; p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(f2, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else break;
  }
  return null;
}

// A staff-roster entry (SmallBusinessData.f21.f8): f1 = fixed64 sim id. Returns it.
function readStaffSimId(entry: Uint8Array): bigint | null {
  let p = 0;
  while (p < entry.length) {
    const [fn, wire, after] = readTag(entry, p);
    p = after;
    if (fn === 0) break;
    if (wire === 0) { const [, n] = readVarint(entry, p); p = n; }
    else if (wire === 1) { if (fn === 1) return readFixed64LE(entry, p); p += 8; }
    else if (wire === 2) { const [l, n] = readVarint(entry, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else break;
  }
  return null;
}

function parseSmallBusinessData(buf: Uint8Array): {
  name: string;
  description: string;
  iconInstance: string | null;
  lotIds: bigint[];
  activities: { id: string; name: string }[];
  customerCriteria: SmallBusinessCustomerCriterion[];
  staffSimIds: bigint[];   // full f21.f8 roster (owner + employees); owner stripped by caller
  feeMode: ParsedSmallBusiness['feeMode'];
  priceModifierPct: number;
  perkPoints: number;
} {
  // Price modifier is a multiplier at the OUTER SmallBusinessData.f3 (1.0=+0%,
  // 2.0=+100%); convert to the UI percentage. Defaults to +0% when unset.
  const priceMult = readFix32Float(buf, 3) ?? 1;
  const priceModifierPct = Math.round((priceMult - 1) * 100);

  // The user-facing fields (name, description, picked icon, lot) all live one
  // level deeper at SmallBusinessData.f21 — the outer SmallBusinessData has a
  // bunch of state varints; the named "inner" block at f21 holds the metadata.
  const inner = findLDField(buf, 21);
  if (!inner) {
    return { name: '', description: '', iconInstance: null, lotIds: [], activities: [], customerCriteria: [], staffSimIds: [], feeMode: 'unknown', priceModifierPct, perkPoints: 0 };
  }

  // Perk points: the f21.f2 stats table entry keyed by 0x1F001 (value in its f2).
  let perkPoints = 0;
  for (const e of iterLDFields(inner, 2)) {
    const m = mapFields(e);
    if (m.get(1)?.[0]?.v === PERK_POINTS_STAT) { perkPoints = Number(m.get(2)?.[0]?.v ?? 0n); break; }
  }

  // Fee mode lives at f21.f1.f3 (a varint inside the f21.f1 wrapper).
  const f21f1 = findLDField(inner, 1);
  const feeRaw = f21f1 ? mapFields(f21f1).get(3)?.[0]?.v : undefined;
  const feeMode: ParsedSmallBusiness['feeMode'] = feeRaw != null ? (FEE_MODE[Number(feeRaw)] ?? 'unknown') : 'unknown';

  let name = '';
  let description = '';
  let iconInstance: string | null = null;
  const lotIds: bigint[] = [];
  const activities: { id: string; name: string }[] = [];
  const customerCriteria: SmallBusinessCustomerCriterion[] = [];
  const staffSimIds: bigint[] = [];

  let p = 0;
  while (p < inner.length) {
    const [fn, wire, afterTag] = readTag(inner, p);
    p = afterTag;
    if (wire === 0) {
      const [, n] = readVarint(inner, p);
      p = n;
    } else if (wire === 1) {
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(inner, p);
      const ln = Number(l);
      const sub = inner.slice(n, n + ln);
      p = n + ln;
      if (fn === 3) {
        // Offered activity (repeated). Same shape as a club rule. Skip the
        // game-managed ticket-kiosk behavior and dedupe (the game can append it
        // many times); what remains are the user's actual picks.
        const aid = activityIdFromEntry(sub);
        const id = aid != null ? '0x' + aid.toString(16) : null;
        if (aid != null && aid !== TICKET_KIOSK_BEHAVIOR && id != null && !activities.some((a) => a.id === id)) {
          activities.push({ id, name: resolveClubActivity(aid) ?? `Activity ${id}` });
        }
      } else if (fn === 4) {
        // Target customer criterion (repeated): age / Supervised Customer / etc.
        const c = parseCustomerCriterion(sub);
        if (c) customerCriteria.push(c);
      } else if (fn === 5) {
        name = decodeText(sub);
      } else if (fn === 6) {
        description = decodeText(sub);
      } else if (fn === 7) {
        // The picked icon's ResourceKey. The save's f7 value matches the
        // hex of one of the 30 picker icons in the in-game UI; we read its
        // `instance` and use it as the filename in /small-business-icons/.
        // (f7 is the user's pick, not a category marker — a Bar can have a
        // Coffee Cup icon.)
        iconInstance = extractResourceKeyInstance(sub);
      } else if (fn === 8) {
        // Staff roster entry (repeated): f1 = a staff sim id (owner + employees).
        const f1 = readStaffSimId(sub);
        if (f1 != null) staffSimIds.push(f1);
      } else if (fn === 14) {
        // Lot(s) the business operates on — a packed fixed64 array (8 bytes each).
        // A business can span multiple lots, so read every entry, not just one.
        for (let q = 0; q + 8 <= sub.length; q += 8) lotIds.push(readFixed64LE(sub, q));
      }
    } else if (wire === 5) {
      p += 4;
    } else {
      break;
    }
  }
  return { name, description, iconInstance, lotIds, activities, customerCriteria, staffSimIds, feeMode, priceModifierPct, perkPoints };
}

// Parse ONE business placement wrapper (f3 residential overlay / f8 venue
// placement): f2 = SmallBusinessData, f4 = owner_sim_id. Returns null if the
// wrapper carries no SmallBusinessData. `recId` is the record's f1, used only as
// a fallback id for the rare ownerless business.
function parseBusinessWrapper(wrapper: Uint8Array, recId: bigint): ParsedSmallBusiness | null {
  let ownerSimId: bigint | null = null;
  let sbData: Uint8Array | null = null;
  let q = 0;
  while (q < wrapper.length) {
    const [fn, wire, afterTag] = readTag(wrapper, q);
    q = afterTag;
    if (wire === 0) { const [, n] = readVarint(wrapper, q); q = n; }
    else if (wire === 1) {
      if (fn === 4) ownerSimId = readFixed64LE(wrapper, q);
      q += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(wrapper, q);
      const ln = Number(l);
      if (fn === 2 && !sbData) sbData = wrapper.slice(n, n + ln);
      q = n + ln;
    } else if (wire === 5) q += 4;
    else break;
  }
  if (!sbData) return null;

  const inner = parseSmallBusinessData(sbData);
  // Employees = the f21.f8 staff roster minus the owner. (A parallel single-slot
  // record at sbData.f4 carries only household-member employees — those who also
  // live in the owner's household and so get household/zone access — so it is NOT
  // the full roster and we don't use it here.)
  const employeeSimIds = inner.staffSimIds.filter((sid) => ownerSimId == null || sid !== ownerSimId);
  // The wrapper carries NO business id of its own — only the owner sim id. Since a
  // sim owns at most one business (confirmed invariant), the owner is each
  // business's stable unique key. This is what lets several businesses share one
  // record (household members each running their own) without colliding on id.
  // The record id is a fallback only for the degenerate ownerless case.
  const id = ownerSimId ?? recId;
  return {
    id,
    name: inner.name,
    description: inner.description,
    iconInstance: inner.iconInstance,
    ownerSimId,
    employeeSimIds,
    lotIds: inner.lotIds,
    activities: inner.activities,
    customerCriteria: inner.customerCriteria,
    feeMode: inner.feeMode,
    priceModifierPct: inner.priceModifierPct,
    perkPoints: inner.perkPoints,
    renownRank: null,   // filled at SaveData assembly via the owner's rank trait
    alignment: null,    // filled at SaveData assembly via the owner's alignment trait
  };
}

// One service record can hold SEVERAL businesses: when household members each run
// their own, the game appends one placement wrapper (repeated f3/f8) per business
// under a single record. Parse every wrapper, not just the first.
function parseBusinessRecord(buf: Uint8Array): ParsedSmallBusiness[] {
  let recId = 0n;
  let type = 0n;
  const wrappers: Uint8Array[] = [];

  let p = 0;
  while (p < buf.length) {
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wire === 1) {
      if (fn === 1) recId = readFixed64LE(buf, p);
      else if (fn === 2) type = readFixed64LE(buf, p);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      const ln = Number(l);
      // Residential overlay uses wrapper at f3; venue placement uses f8. Both are
      // repeated — collect every entry (a record can host multiple businesses).
      if (fn === 3 || fn === 8) wrappers.push(buf.slice(n, n + ln));
      p = n + ln;
    } else if (wire === 5) p += 4;
    else return [];
  }

  if (type !== 5n) return [];       // skip Get to Work retail (type=4) and others
  if (recId === 0n || wrappers.length === 0) return [];

  return wrappers
    .map((w) => parseBusinessWrapper(w, recId))
    .filter((b): b is ParsedSmallBusiness => b !== null);
}

export function scanSmallBusinesses(buf: Uint8Array): ParsedSmallBusiness[] {
  const saveSlot = findLDField(buf, 2);
  if (!saveSlot) return [];
  const gameSlot = findLDField(saveSlot, 8);
  if (!gameSlot) return [];
  const bizSvc = findLDField(gameSlot, 10);
  if (!bizSvc) return [];

  const out: ParsedSmallBusiness[] = [];
  for (const rec of iterLDFields(bizSvc, 1)) {
    out.push(...parseBusinessRecord(rec));
  }
  return out;
}
