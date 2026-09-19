/**
 * Custom venue / getaway schedule parser (EP20 Adventure Awaits).
 *
 * Reverse-engineered via controlled single-variable reseeding (see the
 * project_custom_venue_spike notes + scripts/diagnostics/diffVenueSeeds.ts).
 *
 * An on-lot custom venue is stored as a length-delimited FIELD 24 (tag c2 01)
 * inside its lot/property record. Saved schedule presets live separately in a
 * preset-library region (not handled here yet). A premade applied to a venue is
 * materialized INLINE — there is no stock-preset reference to resolve, so we only
 * ever read the inline schedule.
 *
 * Venue layout:
 *   f1  name
 *   f2[] roles      { f1 name, f2 sim_count, f3[] criteria, f4[] activities,
 *                     f5 outfit, f7 active, f9 index }
 *   f3[] timeslots  { f1 hour, f2 main-activity{f3 id},
 *                     f3[] assignments{ f1 role_index, f2 embedded-role-copy
 *                                       carrying per-slot activity/outfit overrides } }
 *
 * Activity ids resolve via STOCK_ACTIVITIES; criteria targets via known enums
 * (age bitmask, gender flag, fame rank, skill statistic id).
 */
import { readVarint, readFixed64LE, decodeText } from './protobuf';
import type {
  ParsedCustomVenue, ParsedVenueRole, ParsedVenueSlot, ParsedVenueSlotAssignment,
  VenueCriterion, VenueRoleOutfit,
} from './types';

// ─── generic protobuf message → field map ─────────────────────────────────────

interface PField { wire: number; num: bigint; bytes: Uint8Array | null }

function parseMsg(buf: Uint8Array): Map<number, PField[]> {
  const out = new Map<number, PField[]>();
  let p = 0;
  while (p < buf.length) {
    const [tag, afterTag] = readVarint(buf, p);
    const fn = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (fn === 0) break;
    p = afterTag;
    let field: PField | null = null;
    if (wire === 0) { const [v, n] = readVarint(buf, p); field = { wire, num: v, bytes: null }; p = n; }
    else if (wire === 1) { if (p + 8 > buf.length) break; field = { wire, num: readFixed64LE(buf, p), bytes: buf.slice(p, p + 8) }; p += 8; }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); if (end > buf.length) break; field = { wire, num: 0n, bytes: buf.slice(n, end) }; p = end; }
    else if (wire === 5) { if (p + 4 > buf.length) break; field = { wire, num: 0n, bytes: buf.slice(p, p + 4) }; p += 4; }
    else break;
    if (!out.has(fn)) out.set(fn, []);
    out.get(fn)!.push(field);
  }
  return out;
}

const num = (m: Map<number, PField[]>, fn: number, dflt = 0): number => {
  const f = m.get(fn)?.[0];
  return f && f.wire === 0 ? Number(f.num) : dflt;
};
/** A varint field as an EXACT decimal string. Activity tuning ids from a mod run
 *  past what a JS number holds exactly, and the varint is read as a bigint, so
 *  rounding it to a number here would throw away the only handle we have on that
 *  activity — two different modded activities could even land on one value. */
const numStr = (m: Map<number, PField[]>, fn: number): string => {
  const f = m.get(fn)?.[0];
  return f && f.wire === 0 ? f.num.toString() : '';
};
const str = (m: Map<number, PField[]>, fn: number): string => {
  const f = m.get(fn)?.[0];
  return f?.bytes ? decodeText(f.bytes) : '';
};
const sub = (m: Map<number, PField[]>, fn: number): Map<number, PField[]> | null => {
  const f = m.get(fn)?.[0];
  return f?.bytes ? parseMsg(f.bytes) : null;
};
const subs = (m: Map<number, PField[]>, fn: number): Map<number, PField[]>[] =>
  (m.get(fn) ?? []).filter((f) => f.bytes).map((f) => parseMsg(f.bytes!));

// ─── field decoders ───────────────────────────────────────────────────────────

// All codes confirmed by single-criterion seed roles (one criterion per role):
// skill=0, trait=1, career=3, age=5, fame=7, occult=9, gender=10, region=11,
// orientation=12, relationship=13.
const CRITERION_TYPE: Record<number, VenueCriterion['type']> = {
  0: 'skill', 1: 'trait', 3: 'career', 5: 'age', 7: 'fame',
  9: 'occult', 10: 'gender', 11: 'region', 12: 'orientation', 13: 'relationship',
};
// These store their id NESTED in detail.f3.f3 (skill/trait/career/occult/region);
// the rest put the value directly in detail.f4 (age/fame/gender/orientation/relationship).
const NESTED_VALUE_TYPES = new Set<VenueCriterion['type']>(['skill', 'trait', 'career', 'occult', 'region']);

function parseCriterion(m: Map<number, PField[]>): VenueCriterion {
  const typeCode = num(m, 1);
  const type = CRITERION_TYPE[typeCode] ?? 'unknown';
  const required = num(m, 5) === 1;
  const nested = NESTED_VALUE_TYPES.has(type);
  // A criterion can hold several values (repeated f2 detail) — e.g. a role that
  // accepts Vampire OR Fairy. Read each detail's value (nested f3.f3 or direct f4).
  const values: number[] = [];
  for (const f of m.get(2) ?? []) {
    if (!f.bytes) continue;
    const detail = parseMsg(f.bytes);
    values.push(nested ? num(sub(detail, 3) ?? new Map(), 3) : num(detail, 4));
  }
  return { type, required, values, rawType: typeCode };
}

const OUTFIT_MODE: Record<number, VenueRoleOutfit['mode']> = {
  0: 'none', 1: 'category', 2: 'style', 3: 'custom',
};

function parseOutfit(m: Map<number, PField[]>): VenueRoleOutfit {
  const mode = OUTFIT_MODE[num(m, 1)] ?? 'unknown';
  const o: VenueRoleOutfit = { mode };
  if (mode === 'category') o.category = num(m, 4);
  if (mode === 'style') {
    // f9/f10 are the "enabled" checkboxes; the dress-code/color VALUES persist
    // in f2/f3 even when unchecked, so the flags (not value != 0) are authoritative.
    o.dressCode = num(m, 2);
    o.color = num(m, 3);
    o.hasDressCode = num(m, 9) === 1;
    o.hasColor = num(m, 10) === 1;
  }
  return o;
}

/** An activity entry is a sub-message whose f3 holds the tuning id. */
const activityId = (f: PField): string => (f.bytes ? numStr(parseMsg(f.bytes), 3) : '');

function parseRole(m: Map<number, PField[]>): ParsedVenueRole {
  return {
    name: str(m, 1),
    simCount: num(m, 2, 1),
    criteria: subs(m, 3).map(parseCriterion),
    activities: (m.get(4) ?? []).map(activityId).filter(Boolean),
    outfit: sub(m, 5) ? parseOutfit(sub(m, 5)!) : { mode: 'none' },
    index: num(m, 9),
  };
}

function parseAssignment(m: Map<number, PField[]>): ParsedVenueSlotAssignment {
  const roleCopy = sub(m, 2);
  // The embedded role copy's f4 is the SAME repeated activities field a role
  // uses — a per-slot override carries the full (1–5) list, so read every entry.
  // No f4 present ⇒ no override (inherit the role's defaults).
  const f4 = roleCopy?.get(4);
  return {
    roleIndex: num(m, 1),
    activityOverrides: f4 && f4.length ? f4.map(activityId).filter(Boolean) : null,
    outfitOverride: roleCopy && sub(roleCopy, 5) ? parseOutfit(sub(roleCopy, 5)!) : null,
  };
}

function parseSlot(m: Map<number, PField[]>): ParsedVenueSlot {
  const main = sub(m, 2);
  return {
    hour: num(m, 1),
    mainActivity: main ? (numStr(main, 3) || null) : null,
    assignments: subs(m, 3).map(parseAssignment),
  };
}

export function parseVenue(body: Uint8Array): ParsedCustomVenue {
  const m = parseMsg(body);
  return {
    name: str(m, 1),
    lotId: null,
    roles: subs(m, 2).map(parseRole),
    slots: subs(m, 3).map(parseSlot),
  };
}

// ─── scanner ──────────────────────────────────────────────────────────────────

const printableName = (s: string): boolean =>
  s.length >= 1 && s.length <= 63 && /^[\x20-\x7e]+$/.test(s) && !/^[a-z][a-z0-9_:]+$/.test(s);

/**
 * Offsets of lot descriptors (field 7 / tag 0x3a: `3a <len> 09 <lotId fixed64>
 * 12 <name>`). A custom venue and its lot live in the same parent record, and the
 * lot (field 7) serializes BEFORE the venue (field 24), so the venue's lot is the
 * nearest descriptor *preceding* it. (A trailing descriptor belongs to the next
 * parent — e.g. Emotion Camp's lot is the preceding "Red Roan Field", not the
 * following "Sweet Nectar Glade".)
 */
function scanLotOffsets(buf: Uint8Array): Array<{ off: number; id: bigint }> {
  const lots: Array<{ off: number; id: bigint }> = [];
  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x3a) continue;
    const [msgLen, msgStart] = readVarint(buf, i + 1);
    if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
    let p = msgStart;
    if (buf[p] !== 0x09) continue;
    p++;
    const id = readFixed64LE(buf, p);
    p += 8;
    if (buf[p] !== 0x12) continue; // a name string must follow
    lots.push({ off: i, id });
    i = msgStart + Number(msgLen) - 1;
  }
  return lots;
}

/** The lot whose descriptor most closely precedes the venue (same parent record). */
function precedingLotId(lots: Array<{ off: number; id: bigint }>, off: number): bigint | null {
  let best: bigint | null = null, bestOff = -1;
  for (const l of lots) {
    if (l.off < off && l.off > bestOff) { bestOff = l.off; best = l.id; }
  }
  return best;
}

/**
 * Scan the master 0x0d buffer for on-lot custom venue records (field 24, tag
 * c2 01) and parse each. Saved presets (library region, no c2 01 wrapper) are
 * intentionally skipped — they are not on-lot venues.
 */
export function scanCustomVenues(buf: Uint8Array): ParsedCustomVenue[] {
  const lots = scanLotOffsets(buf);
  const out: ParsedCustomVenue[] = [];
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0xc2 || buf[i + 1] !== 0x01) continue;
    const [len, after] = readVarint(buf, i + 2);
    const ln = Number(len);
    if (ln < 4 || ln > 200000 || after + ln > buf.length) continue;
    // must start with f1 string (0a <namelen> <printable>)
    if (buf[after] !== 0x0a) continue;
    const nameLen = buf[after + 1];
    if (nameLen < 1 || nameLen > 63 || after + 2 + nameLen > buf.length) continue;
    const name = decodeText(buf.slice(after + 2, after + 2 + nameLen));
    if (!printableName(name)) continue;
    const venue = parseVenue(buf.slice(after, after + ln));
    if (!venue.name) continue;
    venue.lotId = precedingLotId(lots, i);
    out.push(venue);
    i = after + ln - 1;
  }
  return out;
}

export interface SavedPresets {
  schedules: ParsedCustomVenue[];  // saved getaway/schedule templates (field 58 f1)
  roles: ParsedVenueRole[];        // saved standalone role templates (field 58 f2[])
}

/**
 * Saved presets from the custom-schedule service blob (field 58, tag d2 03):
 *   f1     = a saved SCHEDULE preset (same venue shape: name/roles/slots → parseVenue)
 *   f2[]   = saved ROLE presets (standalone roles the player saved; f7=0)
 * The leading f1 name acts as the validation gate against stray d2 03 bytes.
 */
export function scanSavedPresets(buf: Uint8Array): SavedPresets {
  const schedules: ParsedCustomVenue[] = [];
  const roles: ParsedVenueRole[] = [];
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0xd2 || buf[i + 1] !== 0x03) continue;
    const [len, after] = readVarint(buf, i + 2);
    const ln = Number(len);
    if (ln < 6 || ln > 200000 || after + ln > buf.length) continue;
    if (buf[after] !== 0x0a) continue;                 // f1 = schedule (gate)
    const body = buf.slice(after, after + ln);
    const m = parseMsg(body);
    const f1 = m.get(1)?.[0];
    if (!f1?.bytes || str(parseMsg(f1.bytes), 1) === '' || !printableName(str(parseMsg(f1.bytes), 1))) continue;
    const sched = parseVenue(f1.bytes);
    if (sched.name) schedules.push(sched);
    for (const f2 of m.get(2) ?? []) {
      if (!f2.bytes) continue;
      const role = parseRole(parseMsg(f2.bytes));
      if (printableName(role.name)) roles.push(role);
    }
    i = after + ln - 1;
  }
  return { schedules, roles };
}
