import { describe, it, expect } from 'vitest';
import { resolveSaveLots, LOT_DEFAULTS, type SaveLotRecord } from './lotMatching';

/**
 * Multi-unit collapse. A For Rent / apartment building is several lot records in
 * the save — one per unit, sharing the building's field5 — that all resolve to a
 * single planner lot. Both the import review's count and the baseline it writes
 * are per PLANNER lot, so the records have to merge first.
 *
 * Real ids from `lotField5Map.ts`: Midtown Meadows and Fern Park are both seeded
 * in Newcrest as plain Residential.
 */
const MIDTOWN = 3117285398n;
const FERN = 3093364754n;

const unit = (field5: bigint | null, name: string, detectedType: string | null = null): SaveLotRecord =>
  ({ field5, name, detectedType });

describe('resolveSaveLots', () => {
  it('collapses a building\'s unit records into one planner lot', () => {
    const resolved = resolveSaveLots([
      unit(MIDTOWN, '1 Midtown Meadows', 'Residential Rental'),
      unit(MIDTOWN, '2 Midtown Meadows', 'Residential Rental'),
      unit(MIDTOWN, '3 Midtown Meadows', 'Residential Rental'),
      unit(FERN, '1 Fern Park', 'Residential Rental'),
      unit(FERN, '2 Fern Park', 'Residential Rental'),
    ]);

    expect([...resolved.keys()]).toEqual(['Newcrest::Midtown Meadows', 'Newcrest::Fern Park']);
    expect(resolved.get('Newcrest::Midtown Meadows')).toEqual({
      customName: 'Midtown Meadows',
      customType: 'Residential Rental',
    });
  });

  it('keeps the renamed unit\'s name — a stock-named sibling never wins', () => {
    // The bug this exists for: whichever record landed last used to decide, and
    // a stock-named unit landing last wrote the SEED name into the lot's
    // baseline. The next re-sync then read the game's rename as the player's.
    const renamedLast = resolveSaveLots([
      unit(MIDTOWN, '1 Midtown Meadows', 'Residential Rental'),
      unit(MIDTOWN, 'Midtown Suburbs', 'Residential Rental'),
    ]);
    const renamedFirst = resolveSaveLots([
      unit(MIDTOWN, 'Midtown Suburbs', 'Residential Rental'),
      unit(MIDTOWN, '1 Midtown Meadows', 'Residential Rental'),
    ]);

    expect(renamedLast.get('Newcrest::Midtown Meadows')?.customName).toBe('Midtown Suburbs');
    expect(renamedFirst.get('Newcrest::Midtown Meadows')?.customName).toBe('Midtown Suburbs');
  });

  it('normalizes EA\'s unit-numbered name to the seed default', () => {
    const resolved = resolveSaveLots([unit(MIDTOWN, '1 Midtown Meadows')]);
    // No name change and no detected type: the seed's own values, so a caller
    // comparing against LOT_DEFAULTS sees nothing changed.
    const seed = LOT_DEFAULTS.get('Newcrest::Midtown Meadows')!;
    expect(resolved.get('Newcrest::Midtown Meadows')).toEqual({
      customName: seed.name,
      customType: seed.type,
    });
  });

  it('keeps a non-seed type over a sibling reporting the seed type', () => {
    const resolved = resolveSaveLots([
      unit(MIDTOWN, '1 Midtown Meadows', 'Residential'),
      unit(MIDTOWN, '2 Midtown Meadows', 'Residential Rental'),
    ]);
    expect(resolved.get('Newcrest::Midtown Meadows')?.customType).toBe('Residential Rental');
  });

  it('skips records with no planner lot', () => {
    expect(resolveSaveLots([unit(null, 'Some Modded Lot')]).size).toBe(0);
  });
});

/**
 * Apartment-unit identity. Unlike a For Rent building (one planner lot), each
 * City Living apartment unit is its OWN planner lot — yet all units of a
 * building share the building's field5 and are told apart only by name. An
 * in-game unit rename therefore destroys the unit's identity; these tests pin
 * the three defenses: remembered zone ids, single-rename elimination, and the
 * deterministic complete assignment when neither is available.
 *
 * Real id from `lotField5Map.ts`: 21 Chic Street (San Myshuno), whose three
 * units are 1310 / 1312 / 1313 — separate planner lots.
 */
const CHIC = 1504706562n;
const CHIC_1310 = 'San Myshuno::1310 21 Chic Street';
const CHIC_1312 = 'San Myshuno::1312 21 Chic Street';
const CHIC_1313 = 'San Myshuno::1313 21 Chic Street';

const apt = (id: bigint, name: string): SaveLotRecord =>
  ({ id, field5: CHIC, name, detectedType: 'Apartment' });

describe('apartment-unit identity', () => {
  it('a single renamed unit lands on the one unclaimed sibling, not the field5 seed', () => {
    // Pre-fix behavior: "Cozy Nest" landed on 1310 (the field5-mapped unit)
    // and 1312 kept its stock name — the rename appeared on the WRONG unit.
    const resolved = resolveSaveLots([
      apt(201n, '1310 21 Chic Street'),
      apt(202n, 'Cozy Nest'),
      apt(203n, '1313 21 Chic Street'),
    ]);
    expect(resolved.get(CHIC_1310)?.customName).toBe('1310 21 Chic Street');
    expect(resolved.get(CHIC_1312)?.customName).toBe('Cozy Nest');
    expect(resolved.get(CHIC_1313)?.customName).toBe('1313 21 Chic Street');
  });

  it('every unit renamed at once, no ids remembered: complete deterministic assignment', () => {
    // First sync after the fix ships (or a restored backup): no zone ids yet.
    // Every unit must receive A name — none dropped, none left stock — and the
    // assignment must be stable so ids can lock in for the next sync.
    const assignments = new Map<string, string>();
    const resolved = resolveSaveLots([
      apt(101n, 'Cozy Nest'),
      apt(102n, 'Sky Loft'),
      apt(103n, 'The Perch'),
    ], { zoneAssignments: assignments });

    const names = [CHIC_1310, CHIC_1312, CHIC_1313].map((k) => resolved.get(k)?.customName).sort();
    expect(names).toEqual(['Cozy Nest', 'Sky Loft', 'The Perch']);
    expect(assignments.size).toBe(3);
  });

  it('remembered zone ids pin every unit through any rename', () => {
    // Sync 1: stock names — assignments record each unit's zone id.
    const assignments = new Map<string, string>();
    resolveSaveLots([
      apt(11n, '1310 21 Chic Street'),
      apt(12n, '1312 21 Chic Street'),
      apt(13n, '1313 21 Chic Street'),
    ], { zoneAssignments: assignments });
    expect(assignments.get(11n.toString(16))).toBe(CHIC_1310);

    // Sync 2: ALL units renamed at once — the case name-matching can never
    // solve. Identity comes from the remembered ids alone.
    const resolved = resolveSaveLots([
      apt(13n, 'Third'),
      apt(11n, 'First'),
      apt(12n, 'Second'),
    ], { zoneKeyMap: assignments });
    expect(resolved.get(CHIC_1310)?.customName).toBe('First');
    expect(resolved.get(CHIC_1312)?.customName).toBe('Second');
    expect(resolved.get(CHIC_1313)?.customName).toBe('Third');
  });

  it('zone assignments are also recorded for stock-named units', () => {
    // The forward path: a unit's id is stored while it still wears its stock
    // name, so its FIRST rename is already covered.
    const assignments = new Map<string, string>();
    resolveSaveLots([apt(21n, '1312 21 Chic Street')], { zoneAssignments: assignments });
    expect(assignments.get(21n.toString(16))).toBe(CHIC_1312);
  });

  it('a stock name corrects a wrongly-remembered id — the reset gesture', () => {
    // The deterministic assignment (previous test) can pair names across a
    // building's units differently than the game did — nothing in the save
    // can prevent that. The player's remedy is renaming units back to their
    // stock names once: an identifying NAME outranks a remembered id, so the
    // mapping self-corrects and the ids re-lock right.
    const wrongIds = new Map([
      [41n.toString(16), CHIC_1312], // stale/permuted: zone 41 wrongly remembered as 1312
    ]);
    const assignments = new Map<string, string>();
    const resolved = resolveSaveLots([
      apt(41n, '1310 21 Chic Street'), // renamed BACK to stock in-game
    ], { zoneKeyMap: wrongIds, zoneAssignments: assignments });
    expect(resolved.has(CHIC_1310)).toBe(true);
    expect(resolved.has(CHIC_1312)).toBe(false);
    expect(assignments.get(41n.toString(16))).toBe(CHIC_1310); // re-locked right
  });

  it('For Rent unit records still collapse into their single planner lot', () => {
    // Residential Rental buildings are ONE planner lot — the sibling logic
    // must not split them. (Guards the MULTI_UNIT_TYPES = Apartment-only rule.)
    const resolved = resolveSaveLots([
      { id: 31n, field5: MIDTOWN, name: 'Midtown Suburbs', detectedType: 'Residential Rental' },
      { id: 32n, field5: MIDTOWN, name: '2 Midtown Meadows', detectedType: 'Residential Rental' },
    ]);
    expect([...resolved.keys()]).toEqual(['Newcrest::Midtown Meadows']);
    expect(resolved.get('Newcrest::Midtown Meadows')?.customName).toBe('Midtown Suburbs');
  });
});
