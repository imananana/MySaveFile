import { describe, it, expect } from 'vitest';
import { scanHolidays } from './holidays';

// ─── tiny protobuf encoder (test-only) ────────────────────────────────────────
function vint(n: number): number[] {
  const o: number[] = []; let v = n;
  do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; o.push(b); } while (v);
  return o;
}
const tag = (fn: number, wire: number) => vint((fn << 3) | wire);
const vfield = (fn: number, val: number) => [...tag(fn, 0), ...vint(val)];
const ld = (fn: number, bytes: number[]) => [...tag(fn, 2), ...vint(bytes.length), ...bytes];

// HolidayTimeData: f1 holiday_id, f2 day (0-indexed in the save), f3 season enum
// (0=Summer 1=Fall 2=Winter 3=Spring).
const timeData = (id: number, day: number, season: number) =>
  ld(2, [...vfield(1, id), ...vfield(2, day), ...vfield(3, season)]);

// A HolidayCalendar: f1 = season_length option (0=short/7d), f2* = entries.
const calendar = (seasonLength: number, entries: number[][]) =>
  ld(2, [...vfield(1, seasonLength), ...entries.flat()]);

// holidaySvc(f19) inside gameSlot(f8) inside saveSlot(f2). No GameplayOptions
// season_length present ⇒ scanSeasonLengthOption falls back to 0 ⇒ the short
// (seasonLength=0) calendar is chosen.
function buildSave(calendars: number[]): Uint8Array {
  const holidaySvc = calendars;
  const gameSlot = ld(19, holidaySvc);
  const saveSlot = ld(8, gameSlot);
  return new Uint8Array(ld(2, saveSlot));
}

describe('scanHolidays — day indexing', () => {
  it('converts the game 0-indexed calendar day to a 1-indexed planner day', () => {
    // day 0 (first day of Summer) must surface as planner day 1 — otherwise it
    // falls off the 1-indexed calendar grid and fails server validation (min 1).
    const buf = buildSave(calendar(0, [timeData(0xABC, 0, 0)]));
    const out = scanHolidays(buf);
    expect(out).toHaveLength(1);
    expect(out[0].season).toBe('Summer');
    expect(out[0].day).toBe(1);
  });

  it("keeps a season's last day within range (New Year's Eve, day length-1)", () => {
    // New Year's Eve is the final day of Winter → stored as 6 in a 7-day season.
    // +1 must yield exactly 7 (the last grid tile), never 8.
    const buf = buildSave(calendar(0, [timeData(0x2c77d, 6, 2)]));
    const out = scanHolidays(buf);
    expect(out[0].season).toBe('Winter');
    expect(out[0].day).toBe(7);
  });

  it('folds all three length calendars into scaledDates (1-indexed, per-weeks keys)', () => {
    // Same holiday placed in the 7/14/28-day calendars (season_length 0/1/2) at
    // 0-indexed days 6/13/27 → New Year's Eve, always the last day of Winter.
    const buf = buildSave([
      ...calendar(0, [timeData(0x2c77d, 6, 2)]),
      ...calendar(1, [timeData(0x2c77d, 13, 2)]),
      ...calendar(2, [timeData(0x2c77d, 27, 2)]),
    ]);
    const out = scanHolidays(buf);          // active length falls back to short (0)
    expect(out).toHaveLength(1);
    expect(out[0].day).toBe(7);             // active (7-day) display day
    expect(out[0].scaledDates).toEqual({
      '1': { day: 7, season: 'Winter' },    // 7-day  → last day 7
      '2': { day: 14, season: 'Winter' },   // 14-day → last day 14
      '4': { day: 28, season: 'Winter' },   // 28-day → last day 28
    });
  });
});
