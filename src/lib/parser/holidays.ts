/**
 * Holiday parser.
 *
 * Lives at SaveSlotData → GameplaySaveSlotData → field 19
 * (PersistableHolidayService). Two parallel arrays:
 *   field 1: repeated Holiday — only present for holidays the user customized
 *            (renamed, retraditioned, etc.) OR truly custom user-created
 *            holidays. Stock holidays the player hasn't touched do NOT appear.
 *   field 2: repeated HolidayCalendar — one per season-length setting
 *            (0=short, 1=medium, 2=long). Each contains HolidayTimeData
 *            entries { holiday_id, day, season } listing where each holiday
 *            falls.
 *
 * Holiday fields confirmed against Slot_02220000:
 *   1 (fixed64) holiday_type — the EA tuning ID
 *   2 (string)  name
 *   3 (sub-msg) icon ResourceKey { 1: type, 2: group, 3: instance }
 *   4 (varint)  time_off_for_work
 *   5 (varint)  time_off_for_school
 *   6 (sub-msg or packed) traditions
 *
 * HolidayTimeData (inside Calendar):
 *   1 (varint) holiday_id
 *   2 (varint) day
 *   3 (varint) season (Game's SeasonType enum: 0=Summer 1=Fall 2=Winter 3=Spring)
 */
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields, decodeText } from './protobuf';
import { extractResourceKeyInstance } from './resourceKey';
import { resolveTradition } from '../../data/stockTraditions';
import { STOCK_HOLIDAY_TRADITIONS } from '../../data/stockHolidayTraditions';
import { STOCK_HOLIDAY_TIME_OFF, STOCK_HOLIDAY_DECORATION } from '../../data/stockHolidayDefaults';
import type { ParsedHoliday, ParsedSeason } from './types';

function decodeSeason(v: number): ParsedSeason {
  switch (v) {
    case 0: return 'Summer';
    case 1: return 'Fall';
    case 2: return 'Winter';
    case 3: return 'Spring';
    default: return 'Spring';
  }
}

interface HolidayRecord {
  holidayType: bigint;
  name: string | null;
  iconInstance: string | null;
  traditions: bigint[];
  timeOffWork: boolean;          // f4 — confirmed via Hot Dog Day diff (in-game "Day off Work/School" sets f4+f5 together)
  timeOffSchool: boolean;        // f5
  decorationPreset: string | null; // f7 (i64) decoration-preset id as decimal string; null when "None"
}

function parseHolidayRecord(buf: Uint8Array): HolidayRecord | null {
  let holidayType = 0n;
  let name: string | null = null;
  let iconInstance: string | null = null;
  const traditions: bigint[] = [];
  let timeOffWork = false;
  let timeOffSchool = false;
  let decorationPreset: string | null = null;

  let p = 0;
  while (p < buf.length) {
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(buf, p);
      p = n;
      if (fn === 1) holidayType = v;
      else if (fn === 4) timeOffWork = v === 1n;
      else if (fn === 5) timeOffSchool = v === 1n;
    } else if (wire === 1) {
      if (fn === 1) holidayType = readFixed64LE(buf, p);
      else if (fn === 7) decorationPreset = readFixed64LE(buf, p).toString(); // decoration-preset id (decimal)
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      const ln = Number(l);
      const sub = buf.slice(n, n + ln);
      p = n + ln;
      if (fn === 2) {
        name = decodeText(sub);
      } else if (fn === 3) {
        iconInstance = extractResourceKeyInstance(sub);
      } else if (fn === 6) {
        // traditions: packed fixed64 (8 bytes each)
        for (let q = 0; q + 8 <= sub.length; q += 8) {
          traditions.push(readFixed64LE(sub, q));
        }
      }
    } else if (wire === 5) {
      p += 4;
    } else {
      return null;
    }
  }

  if (holidayType === 0n) return null;
  return { holidayType, name, iconInstance, traditions, timeOffWork, timeOffSchool, decorationPreset };
}

interface CalendarEntry {
  holidayType: bigint;
  day: number;
  season: ParsedSeason;
}

function parseCalendar(buf: Uint8Array): { seasonLength: number; entries: CalendarEntry[] } {
  let seasonLength = 0;
  const entries: CalendarEntry[] = [];
  let p = 0;
  while (p < buf.length) {
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(buf, p);
      p = n;
      if (fn === 1) seasonLength = Number(v);
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      const ln = Number(l);
      const sub = buf.slice(n, n + ln);
      p = n + ln;
      if (fn === 2) {
        // HolidayTimeData
        let q = 0;
        let holidayType = 0n;
        let day = 0;
        let season: ParsedSeason = 'Spring';
        while (q < sub.length) {
          const [fn2, wire2, afterTag2] = readTag(sub, q);
          q = afterTag2;
          if (wire2 === 0) {
            const [v2, n2] = readVarint(sub, q);
            q = n2;
            if (fn2 === 1) holidayType = v2;
            else if (fn2 === 2) day = Number(v2);
            else if (fn2 === 3) season = decodeSeason(Number(v2));
          } else if (wire2 === 1) {
            if (fn2 === 1) holidayType = readFixed64LE(sub, q);
            q += 8;
          } else if (wire2 === 2) {
            const [l2, n2] = readVarint(sub, q);
            q = n2 + Number(l2);
          } else if (wire2 === 5) q += 4;
          else break;
        }
        if (holidayType !== 0n) entries.push({ holidayType, day, season });
      }
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
  }
  return { seasonLength, entries };
}

/**
 * Active season-length OPTION = GameplayOptions.season_length (enum), read from
 * the save at SaveGameData → f3 → f14 → gameplay_options(f2) → season_length(f12):
 *   0 = NORMAL_SEASON (7 days), 1 = LONG (14), 2 = VERY_LONG (28). Absent ⇒ 0.
 * Confirmed against EP05's GameplaySaveData_pb2 + a 14d→28d save diff; validated
 * 16/16 saves. (The 3 HolidayCalendars coexist regardless — this option is the
 * only thing that says which one is live.) See reference_season_length_parse.
 */
export function scanSeasonLengthOption(buf: Uint8Array): 0 | 1 | 2 {
  const f3 = findLDField(buf, 3);
  const f14 = f3 && findLDField(f3, 14);
  const opts = f14 && findLDField(f14, 2);
  if (!opts) return 0;
  let p = 0;
  while (p < opts.length) {
    const [fn, wire, after] = readTag(opts, p);
    p = after;
    if (wire === 0) { const [v, n] = readVarint(opts, p); p = n; if (fn === 12) { const o = Number(v); return o === 1 || o === 2 ? o : 0; } }
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else if (wire === 2) { const [l, n] = readVarint(opts, p); p = n + Number(l); }
    else break;
  }
  return 0;
}

export function scanHolidays(buf: Uint8Array): ParsedHoliday[] {
  const saveSlot = findLDField(buf, 2);
  if (!saveSlot) return [];
  const gameSlot = findLDField(saveSlot, 8);
  if (!gameSlot) return [];
  const holidaySvc = findLDField(gameSlot, 19);
  if (!holidaySvc) return [];

  // Collect Holiday records keyed by holidayType (these are customizations).
  const recordsByType = new Map<bigint, HolidayRecord>();
  for (const recBytes of iterLDFields(holidaySvc, 1)) {
    const rec = parseHolidayRecord(recBytes);
    if (rec) recordsByType.set(rec.holidayType, rec);
  }

  // The save stores a HolidayCalendar for EVERY length (season_length tag 0/1/2),
  // each pre-scaled. Pick the one matching the active GameplayOptions setting so
  // holiday days are correct; fall back to short (0) then first.
  const activeLength = scanSeasonLengthOption(buf);
  const calendars = [...iterLDFields(holidaySvc, 2)].map(parseCalendar);
  if (calendars.length === 0) return [];
  const preferred = calendars.find((c) => c.seasonLength === activeLength)
    ?? calendars.find((c) => c.seasonLength === 0)
    ?? calendars[0];

  // Fold ALL length calendars into a per-holiday map keyed by plan weeks
  // ('1'|'2'|'4' for the season_length tags 0/1/2). This lets the planner
  // re-scale an imported holiday to its exact in-game day at any plan length,
  // not just the one active at import. Days are +1 (0-indexed → 1-indexed).
  const OPTION_TO_WEEKS: Record<number, string> = { 0: '1', 1: '2', 2: '4' };
  const scaledByType = new Map<string, Record<string, { day: number; season: ParsedSeason }>>();
  for (const cal of calendars) {
    const weeks = OPTION_TO_WEEKS[cal.seasonLength];
    if (!weeks) continue;
    for (const entry of cal.entries) {
      const hex = entry.holidayType.toString(16);
      const rec = scaledByType.get(hex) ?? {};
      rec[weeks] = { day: entry.day + 1, season: entry.season };
      scaledByType.set(hex, rec);
    }
  }

  // Each calendar entry becomes a planner Holiday. Merge in the customization
  // record (name/icon/traditions) if one exists for this holiday_type.
  const out: ParsedHoliday[] = [];
  for (const entry of preferred.entries) {
    const rec = recordsByType.get(entry.holidayType);
    // Effective traditions: a customization record holds the holiday's full
    // current list (use it verbatim — even if empty, the player cleared them);
    // a pure-stock holiday (no record) falls back to its tuning defaults.
    const typeHex = entry.holidayType.toString(16);
    const stockDefaults = STOCK_HOLIDAY_TRADITIONS[typeHex];
    const traditions = rec ? rec.traditions : (stockDefaults?.map((h) => BigInt('0x' + h)) ?? []);
    // Time off + decoration: from the record when customized, else the stock
    // tuning default (same record-vs-default rule as traditions).
    const timeOff = rec ? (rec.timeOffWork || rec.timeOffSchool) : !!STOCK_HOLIDAY_TIME_OFF[typeHex]?.work;
    const decorationPreset = rec ? rec.decorationPreset : (STOCK_HOLIDAY_DECORATION[typeHex] ?? null);
    out.push({
      holidayType: entry.holidayType,
      name: rec?.name ?? null,
      iconInstance: rec?.iconInstance ?? null,
      // The game stores calendar days 0-indexed (0 = first day of the season;
      // New Year's Eve, the last day, is length-1 — e.g. 6 at 7-day, 27 at
      // 28-day). The planner is 1-indexed everywhere (grid tiles 1..N, server
      // validates day 1..28), so convert here at the game→planner boundary.
      // Without this every holiday lands a day early and a day-0 holiday (one
      // on the first day of its season) falls off the grid / fails validation.
      day: entry.day + 1,
      season: entry.season,
      scaledDates: scaledByType.get(typeHex) ?? { [OPTION_TO_WEEKS[preferred.seasonLength] ?? '1']: { day: entry.day + 1, season: entry.season } },
      traditions,
      traditionNames: traditions.map((t) => resolveTradition(t) ?? `Tradition 0x${t.toString(16)}`),
      timeOff,
      decorationPreset,
    });
  }
  return out;
}
