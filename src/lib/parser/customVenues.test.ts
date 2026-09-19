import { describe, it, expect } from 'vitest';
import { parseVenue, scanCustomVenues } from './customVenues';

// ─── tiny protobuf encoder (test-only) ────────────────────────────────────────
function vint(n: number): number[] {
  const o: number[] = []; let v = n;
  do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; o.push(b); } while (v);
  return o;
}
// The number version can't encode a modded id, so there's a bigint twin.
function vintBig(n: bigint): number[] {
  const o: number[] = []; let v = n;
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v);
  return o;
}
const tag = (fn: number, wire: number) => vint((fn << 3) | wire);
const vfieldBig = (fn: number, val: bigint) => [...tag(fn, 0), ...vintBig(val)];
const vfield = (fn: number, val: number) => [...tag(fn, 0), ...vint(val)];
const ld = (fn: number, bytes: number[]) => [...tag(fn, 2), ...vint(bytes.length), ...bytes];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

const BE_FLIRTY = 462656, BE_FRIENDLY = 122422, BAKING_STAT = 104198;
// Activity ids come back as EXACT decimal strings — a modded id outruns what a
// JS number holds, so the parser never narrows one to a number.
const FLIRTY = String(BE_FLIRTY), FRIENDLY = String(BE_FRIENDLY);

// criterion: age (type 5) = Young Adult (16), required
const ageCrit = [...vfield(1, 5), ...ld(2, vfield(4, 16)), ...vfield(5, 1)];
// criterion: skill (type 0) = Baking stat, required (skill id nested in detail.f3.f3)
const skillCrit = [...vfield(1, 0), ...ld(2, ld(3, vfield(3, BAKING_STAT))), ...vfield(5, 1)];
// role "Cook": count 2, age+skill criteria, one default activity, Everyday outfit, index 0
const role = [
  ...ld(1, str('Cook')),
  ...vfield(2, 2),
  ...ld(3, ageCrit),
  ...ld(3, skillCrit),
  ...ld(4, vfield(3, BE_FRIENDLY)),
  ...ld(5, [...vfield(1, 1), ...vfield(4, 0)]), // outfit: category mode, Everyday(0)
  ...vfield(9, 0),
];
// slot @6: main Be Flirty, assignment role#0 overrides to TWO activities
// (Be Friendly + Be Flirty) — exercises reading the FULL repeated f4 list.
const slot = [
  ...vfield(1, 6),
  ...ld(2, vfield(3, BE_FLIRTY)),
  ...ld(3, [...vfield(1, 0), ...ld(2, [...ld(1, str('Cook')), ...ld(4, vfield(3, BE_FRIENDLY)), ...ld(4, vfield(3, BE_FLIRTY))])]),
];
const venueBody = [...ld(1, str('Test Venue')), ...ld(2, role), ...ld(3, slot)];

describe('parseVenue', () => {
  const v = parseVenue(Uint8Array.from(venueBody));

  it('reads the venue name, roles and slots', () => {
    expect(v.name).toBe('Test Venue');
    expect(v.roles).toHaveLength(1);
    expect(v.slots).toHaveLength(1);
  });

  it('decodes the role', () => {
    const r = v.roles[0];
    expect(r.name).toBe('Cook');
    expect(r.simCount).toBe(2);
    expect(r.index).toBe(0);
    expect(r.activities).toEqual([FRIENDLY]);
    expect(r.outfit).toEqual({ mode: 'category', category: 0 });
  });

  it('decodes criteria (type, value, required) incl. nested skill id', () => {
    const [age, skill] = v.roles[0].criteria;
    expect(age).toMatchObject({ type: 'age', values: [16], required: true });
    expect(skill).toMatchObject({ type: 'skill', values: [BAKING_STAT], required: true });
  });

  it('decodes the slot, main activity and the full per-slot override list', () => {
    const s = v.slots[0];
    expect(s.hour).toBe(6);
    expect(s.mainActivity).toBe(FLIRTY);
    expect(s.assignments).toEqual([
      { roleIndex: 0, activityOverrides: [FRIENDLY, FLIRTY], outfitOverride: null },
    ]);
  });
});

describe('scanCustomVenues', () => {
  it('finds field-24 (c2 01) venues and ignores unwrapped preset copies', () => {
    const wrapped = [...tag(24, 2), ...vint(venueBody.length), ...venueBody];
    // noise + a wrapped venue + the same bytes UNwrapped (a library preset) that must be ignored
    const buf = Uint8Array.from([0x00, 0x00, ...wrapped, 0x55, 0x55, ...venueBody]);
    const found = scanCustomVenues(buf);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('Test Venue');
  });
});

describe('parseVenue — modded activity ids', () => {
  // A real id off a modded activity in the dev save. It is larger than
  // Number.MAX_SAFE_INTEGER, so reading it as a number rounds it and the last
  // few digits — the only handle we have on that activity — are gone.
  const MODDED = 13574404042592145123n;

  it('keeps a 64-bit id exactly, where a number would round it', () => {
    const role = [...ld(1, str('Vendor')), ...vfield(2, 1), ...ld(4, vfieldBig(3, MODDED)), ...vfield(9, 0)];
    const venue = [...ld(1, str('Modded')), ...ld(2, role)];
    const v = parseVenue(new Uint8Array(venue));
    expect(v.roles[0].activities).toEqual([MODDED.toString()]);
    // The bug this guards: Number(13574404042592145123n) !== 13574404042592145123
    expect(String(Number(MODDED))).not.toBe(MODDED.toString());
  });

  it('keeps two ids that a number would collapse into one distinct', () => {
    const a = 13574404042592145121n, b = 13574404042592145122n;
    expect(Number(a)).toBe(Number(b));                       // both round to the same number
    const role = [...ld(1, str('Vendor')), ...vfield(2, 1),
      ...ld(4, vfieldBig(3, a)), ...ld(4, vfieldBig(3, b)), ...vfield(9, 0)];
    const v = parseVenue(new Uint8Array([...ld(1, str('Modded')), ...ld(2, role)]));
    expect(v.roles[0].activities).toEqual([a.toString(), b.toString()]);
  });
});
