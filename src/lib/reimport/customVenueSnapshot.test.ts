import { describe, it, expect } from 'vitest';
import { parsedCustomVenueToSnapshot, customVenueToCurrentSnapshot } from './snapshotBuilders';
import { diffEntities } from './diff';
import type { CustomVenueSnapshot } from '../parser/snapshot';
import type { ParsedCustomVenue, ParsedVenueRole, ParsedVenueSlot } from '../parser/types';
import type { CustomVenue } from '../../types';

const role = (name: string, index: number, opts: Partial<ParsedVenueRole> = {}): ParsedVenueRole => ({
  name, index, simCount: 1, criteria: [], activities: [], outfit: { mode: 'none' }, ...opts,
});
const slot = (hour: number, opts: Partial<ParsedVenueSlot> = {}): ParsedVenueSlot => ({
  hour, mainActivity: null, assignments: [], ...opts,
});

// Two venues with IDENTICAL content but everything serialized in a different
// order — the exact non-determinism the game introduces between saves.
const venueA: ParsedCustomVenue = {
  name: 'Emotion Camp', lotId: null,
  roles: [
    role('Happy Woman', 1, {
      criteria: [
        { type: 'occult', required: false, values: [0x2590b, 0x69c87], rawType: 9 },
        { type: 'age', required: true, values: [16], rawType: 5 },
      ],
      activities: ['122483', '126320'],
    }),
    role('Sad Man', 0, { criteria: [{ type: 'gender', required: true, values: [4096], rawType: 10 }] }),
  ],
  slots: [
    slot(12, { mainActivity: '462656', assignments: [{ roleIndex: 1, activityOverrides: null, outfitOverride: null }, { roleIndex: 0, activityOverrides: ['122422'], outfitOverride: null }] }),
    slot(6),
  ],
};

const venueB: ParsedCustomVenue = {
  name: 'Emotion Camp', lotId: null,
  roles: [
    role('Sad Man', 0, { criteria: [{ type: 'gender', required: true, values: [4096], rawType: 10 }] }),
    role('Happy Woman', 1, {
      criteria: [
        { type: 'age', required: true, values: [16], rawType: 5 },          // criteria reordered
        { type: 'occult', required: false, values: [0x69c87, 0x2590b], rawType: 9 }, // values reordered
      ],
      activities: ['126320', '122483'],                                          // activities reordered
    }),
  ],
  slots: [
    slot(6),                                                                 // slots reordered
    slot(12, { mainActivity: '462656', assignments: [{ roleIndex: 0, activityOverrides: ['122422'], outfitOverride: null }, { roleIndex: 1, activityOverrides: null, outfitOverride: null }] }), // assignments reordered
  ],
};

describe('custom venue snapshot canonicalization', () => {
  it('produces identical snapshots for reordered-but-equal venues (no phantom diff)', () => {
    const a = parsedCustomVenueToSnapshot(venueA);
    const b = parsedCustomVenueToSnapshot(venueB);
    expect(b).toEqual(a);
  });

  it('a planner venue round-trips to the same snapshot as its parsed source', () => {
    const fromParsed = parsedCustomVenueToSnapshot(venueA);
    const planner: CustomVenue = {
      id: 'cv1', lotKey: 'Henford-on-Bagley::Red Roan Field',
      name: venueB.name, venueSchedule: '', notes: 'private', roles: venueB.roles, slots: venueB.slots,
      source: 'planner', isGetaway: false, hostHouseholdId: null, sourcePresetId: null,
    };
    expect(customVenueToCurrentSnapshot(planner)).toEqual(fromParsed);
  });

  it('diffEntities reports NO update when only serialization order changed', () => {
    const lotKey = 'Henford-on-Bagley::Red Roan Field';
    const next = new Map<string, CustomVenueSnapshot>([[lotKey, parsedCustomVenueToSnapshot(venueB)]]);
    const last = parsedCustomVenueToSnapshot(venueA);
    const planner = new Map([[lotKey, { plannerId: 'cv1', current: last, last }]]);
    const diff = diffEntities(next, planner);
    expect(diff.updates).toHaveLength(0);
    expect(diff.adds).toHaveLength(0);
    expect(diff.removes).toHaveLength(0);
  });

  it('detects a real change (added role) and an add/remove by lot_key', () => {
    const lotKey = 'Henford-on-Bagley::Red Roan Field';
    const changed: ParsedCustomVenue = { ...venueA, roles: [...venueA.roles, role('Camp Leader', 2)] };
    const last = parsedCustomVenueToSnapshot(venueA);
    const next = new Map<string, CustomVenueSnapshot>([[lotKey, parsedCustomVenueToSnapshot(changed)]]);
    const planner = new Map([[lotKey, { plannerId: 'cv1', current: last, last }]]);
    const diff = diffEntities(next, planner);
    expect(diff.updates).toHaveLength(1);
    expect(diff.updates[0].changes.some((c) => c.field === 'roles')).toBe(true);

    // Venue on a different lot, none on the old one → remove + add (the "moved venue" case).
    const moved = new Map<string, CustomVenueSnapshot>([['World::Lot B', parsedCustomVenueToSnapshot(venueA)]]);
    const movedDiff = diffEntities(moved, planner);
    expect(movedDiff.adds).toHaveLength(1);
    expect(movedDiff.removes).toHaveLength(1);
  });
});
