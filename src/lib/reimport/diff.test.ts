/**
 * Tests for the re-import diff library. The diff is the *only* layer that
 * decides "is this a conflict or routine update", so its corner cases need to
 * be locked down before any UI sits on top.
 *
 * Snapshots are plain JSON here — we don't go through the actual game-side
 * builders since those have their own coverage via saveParser.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { diffEntities, diffLots, reconcileBusinessLots, type EntityDiff } from './diff';
import type { HouseholdSnapshot, LotSnapshot } from '../parser/snapshot';

// ─── helpers ──────────────────────────────────────────────────────────────────

const baseHousehold: HouseholdSnapshot = {
  name: 'Goth',
  composition: {
    elder: { male: 0, female: 0 },
    adult: { male: 1, female: 1 },
    youngAdult: { male: 0, female: 0 },
    teen: { male: 0, female: 1 },
    child: { male: 1, female: 0 },
    toddler: { male: 0, female: 0 },
    infant: { male: 0, female: 0 },
    dog: 0, cat: 0, horse: 0,
  },
  description: 'A dark and mysterious family.',
  assignedLotKey: 'Willow Creek::165 Sam Street',
};

function householdsDiff(
  next: Array<[string, HouseholdSnapshot]>,
  planner: Array<[string, { plannerId: string; current: HouseholdSnapshot; last: HouseholdSnapshot | null }]>,
): EntityDiff<HouseholdSnapshot> {
  return diffEntities(new Map(next), new Map(planner));
}

// ─── the per-field merge actually reaching the apply ──────────────────────────
//
// REGRESSION GUARD. `diffField` correctly skips a field you edited that the game
// didn't touch — but that verdict only protects your edit if the apply writes
// the MERGE. It used to write `nextSnapshot` (the raw save record) instead, so
// any edit to a record the game had also changed in some other field was
// silently reverted. Driven against a real save: of 25 renamed households, the
// 5 the game had also touched lost their names; the other 20 kept them.
//
// `resolved` is that merge. `nextSnapshot` is the raw save value and must stay
// raw — it becomes the next sync's baseline, and a merged baseline would make
// the following sync think the save had said something it never said.

describe('diffEntities — resolved vs nextSnapshot', () => {
  it('keeps YOUR edit on a field the game did not touch, on a record it did', () => {
    // You renamed the household. The game moved them to a different lot and
    // didn't touch the name.
    const last = baseHousehold;
    const current = { ...baseHousehold, name: 'The Goths' };            // your rename
    const next = { ...baseHousehold, assignedLotKey: 'Oasis Springs::Skyward Palms' };

    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current, last }]],
    );

    expect(d.updates).toHaveLength(1);
    const u = d.updates[0];
    // Only the lot is reported as a change — the name was correctly skipped.
    expect(u.changes.map((c) => c.field)).toEqual(['assignedLotKey']);
    // The merge: your name, the game's lot.
    expect(u.resolved.name).toBe('The Goths');
    expect(u.resolved.assignedLotKey).toBe('Oasis Springs::Skyward Palms');
    // The baseline stays exactly what the save said, name included.
    expect(u.nextSnapshot).toEqual(next);
    expect(u.nextSnapshot.name).toBe('Goth');
  });

  it('lets the game win on a field you both moved', () => {
    const last = baseHousehold;
    const current = { ...baseHousehold, name: 'The Goths' };
    const next = { ...baseHousehold, name: 'Goth-Bjergsen' };           // game renamed too

    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current, last }]],
    );

    expect(d.updates[0].kind).toBe('conflict');
    expect(d.updates[0].resolved.name).toBe('Goth-Bjergsen');
  });

  it('resolves to the save wholesale when you edited nothing', () => {
    const next = { ...baseHousehold, name: 'Goth-Bjergsen', description: 'Now with in-laws.' };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.updates[0].resolved).toEqual(next);
    expect(d.updates[0].resolved).toEqual(d.updates[0].nextSnapshot);
  });
});

// ─── unchanged ────────────────────────────────────────────────────────────────

describe('diffEntities — unchanged', () => {
  it('emits nothing when current/last/next all match', () => {
    const d = householdsDiff(
      [['hh1', baseHousehold]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.updates).toEqual([]);
    expect(d.adds).toEqual([]);
    expect(d.removes).toEqual([]);
  });
});

// ─── routine update ───────────────────────────────────────────────────────────

describe('diffEntities — routine update', () => {
  it('detects game-side rename when planner matches last snapshot', () => {
    const next = { ...baseHousehold, name: 'Goth-Bjergsen' };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].kind).toBe('routine');
    expect(d.updates[0].changes).toEqual([
      { field: 'name', current: 'Goth', last: 'Goth', next: 'Goth-Bjergsen', kind: 'routine' },
    ]);
  });

  it('treats missing last snapshot as routine (any change auto-applies)', () => {
    const next = { ...baseHousehold, name: 'Goth-Bjergsen' };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: null }]],
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].kind).toBe('routine');
  });
});

// ─── conflict ─────────────────────────────────────────────────────────────────

describe('diffEntities — conflict', () => {
  it('flags conflict when both planner and game diverged from last', () => {
    const last = baseHousehold;
    const current = { ...baseHousehold, description: 'I rewrote the description.' };
    const next = { ...baseHousehold, description: 'Game also changed it differently.' };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current, last }]],
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].kind).toBe('conflict');
    expect(d.updates[0].changes[0].kind).toBe('conflict');
  });

  it('a single conflicting field promotes the whole record to conflict', () => {
    const last = baseHousehold;
    const current = { ...baseHousehold, description: 'planner edit' };
    const next = { ...baseHousehold, description: 'different game edit', name: 'Goth-Bjergsen' };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current, last }]],
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].kind).toBe('conflict');
    // The name change is routine (planner matched last for name); description is conflict
    const byField = Object.fromEntries(d.updates[0].changes.map((c) => [c.field, c.kind]));
    expect(byField.name).toBe('routine');
    expect(byField.description).toBe('conflict');
  });
});

// ─── planner edit, no game change → skip ──────────────────────────────────────

describe('diffEntities — planner-only edit', () => {
  it('skips fields where game matches last but planner diverged (avoids undoing user edit)', () => {
    const last = baseHousehold;
    const current = { ...baseHousehold, description: 'user edited description' };
    const next = baseHousehold; // game unchanged
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current, last }]],
    );
    // Description differs but game didn't change → not a game-side update
    expect(d.updates).toEqual([]);
  });
});

// ─── adds ─────────────────────────────────────────────────────────────────────

describe('diffEntities — adds', () => {
  it('puts new save entities not in planner into adds', () => {
    const d = householdsDiff(
      [['hh1', baseHousehold]],
      [],
    );
    expect(d.adds).toEqual([{ sourceId: 'hh1', nextSnapshot: baseHousehold }]);
    expect(d.updates).toEqual([]);
    expect(d.removes).toEqual([]);
  });
});

// ─── removes ──────────────────────────────────────────────────────────────────

describe('diffEntities — removes', () => {
  it('puts planner entities missing from save into removes', () => {
    const d = householdsDiff(
      [],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.removes).toEqual([{ plannerId: 'p1', sourceId: 'hh1' }]);
    expect(d.updates).toEqual([]);
    expect(d.adds).toEqual([]);
  });
});

// ─── hand-created planner records are excluded by caller (source_id null) ────

describe('diffEntities — hand-created records', () => {
  it('records with no source_id are caller-excluded; diff never sees them', () => {
    // The caller is expected to exclude planner records with source_id === null
    // from the plannerBySourceId map. Verify: when only hand-created records
    // exist (caller passes empty map), nothing surfaces.
    const d = householdsDiff([], []);
    expect(d.updates).toEqual([]);
    expect(d.adds).toEqual([]);
    expect(d.removes).toEqual([]);
  });
});

// ─── composition (nested object) ──────────────────────────────────────────────

describe('diffEntities — nested fields', () => {
  it('detects composition changes via deep equality', () => {
    const next = {
      ...baseHousehold,
      composition: {
        ...baseHousehold.composition,
        adult: { male: 2, female: 1 }, // dad married a second wife (mock)
      },
    };
    const d = householdsDiff(
      [['hh1', next]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].kind).toBe('routine');
    const change = d.updates[0].changes.find((c) => c.field === 'composition');
    expect(change).toBeTruthy();
  });

  it('ignores composition when shape is identical', () => {
    const compositionCopy = JSON.parse(JSON.stringify(baseHousehold.composition));
    const d = householdsDiff(
      [['hh1', { ...baseHousehold, composition: compositionCopy }]],
      [['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }]],
    );
    expect(d.updates).toEqual([]);
  });
});

// ─── multiple entities in one diff ────────────────────────────────────────────

describe('diffEntities — multiple records', () => {
  it('mixes updates, adds, and removes correctly', () => {
    const hh2: HouseholdSnapshot = { ...baseHousehold, name: 'Spencer-Kim-Lewis', assignedLotKey: null };
    const hh3New: HouseholdSnapshot = { ...baseHousehold, name: 'Brand New In Save' };

    const d = householdsDiff(
      // New save has hh1 (renamed) + hh3 (new)
      [
        ['hh1', { ...baseHousehold, name: 'Goth-Bjergsen' }],
        ['hh3', hh3New],
      ],
      // Planner has hh1 (matches last) + hh2 (no longer in save)
      [
        ['hh1', { plannerId: 'p1', current: baseHousehold, last: baseHousehold }],
        ['hh2', { plannerId: 'p2', current: hh2, last: hh2 }],
      ],
    );

    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].plannerId).toBe('p1');
    expect(d.adds).toHaveLength(1);
    expect(d.adds[0].sourceId).toBe('hh3');
    expect(d.removes).toHaveLength(1);
    expect(d.removes[0].plannerId).toBe('p2');
  });
});

// ─── lots: keyed by lot_key, no adds/removes ──────────────────────────────────

describe('diffLots (3-way plan-vs-save-vs-baseline rule)', () => {
  // Seed default for the lot under test — also the baseline an unrecorded lot
  // falls back to (the call site resolves `lastSaved ?? seedDefault`).
  const seed: LotSnapshot = { customName: 'Sandy Run', customType: 'Residential' };

  // ── Degenerate-to-stateless cases (baseline == seed default) ──────────────

  it('REGRESSION (0a29786): unrecorded lot, planner edit, save still seed → keeps the edit', () => {
    // The original silent-revert bug: a lot with no baseline (→ seed) that the
    // player edited in the planner while the game stayed at the seed value.
    const current = { customName: 'My House', customType: 'Residential' }; // planner renamed
    const next = { customName: 'Sandy Run', customType: 'Residential' };   // save = seed
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline: seed }]]),
    );
    expect(d.updates).toHaveLength(0); // planner edit protected, nothing applied
  });

  it('takes the save value when the planner is unedited (normal mirror)', () => {
    const current = { customName: 'Sandy Run', customType: 'Residential' }; // unedited = baseline
    const next = { customName: 'Sandy Run', customType: 'Cafe' };
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline: seed }]]),
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].resolved.customType).toBe('Cafe');
  });

  // ── The Route 3 fix (baseline is a custom, non-seed save value) ───────────

  it('keeps a planner edit on a CUSTOM-typed lot when the save has not changed', () => {
    // The save reports this lot as a Restaurant (baseline). The planner projects
    // a Small Business Venue. The save is unchanged → keep the planner edit.
    // (The old seed-anchored rule reverted this to Restaurant — the bug we fix.)
    const baseline: LotSnapshot = { customName: 'Sandy Run', customType: 'Restaurant' };
    const current = { customName: 'Sandy Run', customType: 'Small Business Venue' };
    const next = { customName: 'Sandy Run', customType: 'Restaurant' }; // save unchanged
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline }]]),
    );
    expect(d.updates).toHaveLength(0); // projection survives
  });

  it('takes the save value when the save genuinely changed from the baseline', () => {
    // Baseline Restaurant, planner projected a venue, but the game rezoned it to
    // a Cafe. The save moved off the baseline → reality wins.
    const baseline: LotSnapshot = { customName: 'Sandy Run', customType: 'Restaurant' };
    const current = { customName: 'Sandy Run', customType: 'Small Business Venue' };
    const next = { customName: 'Sandy Run', customType: 'Cafe' };
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline }]]),
    );
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0].resolved.customType).toBe('Cafe'); // reality wins
  });

  // ── Per-field + no-op ─────────────────────────────────────────────────────

  it('resolves per-field: keeps a planner name while adopting a new game type', () => {
    const current = { customName: 'My House', customType: 'Residential' }; // name edited, type baseline
    const next = { customName: 'Sandy Run', customType: 'Cafe' };          // save: baseline name, custom type
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline: seed }]]),
    );
    expect(d.updates).toHaveLength(1);
    // `resolved` is what the apply writes — the merge.
    expect(d.updates[0].resolved).toEqual({ customName: 'My House', customType: 'Cafe' });
    // `nextSnapshot` is the raw save value — the new baseline, never the record.
    expect(d.updates[0].nextSnapshot).toEqual({ customName: 'Sandy Run', customType: 'Cafe' });
    expect(d.updates[0].changes.map((c) => c.field)).toEqual(['customType']); // only type changed
  });

  it('no update when the planner already matches the save', () => {
    const current = { customName: 'Sandy Run', customType: 'Cafe' };
    const next = { customName: 'Sandy Run', customType: 'Cafe' };
    const d = diffLots(
      new Map([['lot1', next]]),
      new Map([['lot1', { current, baseline: seed }]]),
    );
    expect(d.updates).toHaveLength(0);
  });

  it('returns empty buckets for adds + removes (lots are seeded)', () => {
    const d = diffLots(new Map(), new Map());
    expect(d.adds).toEqual([]);
    expect(d.removes).toEqual([]);
  });
});

describe('reconcileBusinessLots (plan-vs-save lot set)', () => {
  it('keeps a lot you planned that the game never had', () => {
    // Planner has the game lot A plus a planned lot Z the game doesn't know.
    const r = reconcileBusinessLots(['A', 'Z'], ['A'], ['A']);
    expect(r.result.sort()).toEqual(['A', 'Z']);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });

  it('follows a game relocation (X -> Y), preserving a separate plan', () => {
    // Game moved the business X -> Y; planner had X plus a planned lot Z.
    const r = reconcileBusinessLots(['X', 'Z'], ['Y'], ['X']);
    expect(r.result.sort()).toEqual(['Y', 'Z']);
    expect(r.added).toEqual(['Y']);
    expect(r.removed).toEqual(['X']);
  });

  it('adopts a lot the game newly added', () => {
    const r = reconcileBusinessLots(['A'], ['A', 'B'], ['A']);
    expect(r.result.sort()).toEqual(['A', 'B']);
    expect(r.added).toEqual(['B']);
    expect(r.removed).toEqual([]);
  });

  it('drops a lot the game removed', () => {
    const r = reconcileBusinessLots(['A', 'B'], ['A'], ['A', 'B']);
    expect(r.result).toEqual(['A']);
    expect(r.removed).toEqual(['B']);
    expect(r.added).toEqual([]);
  });

  it('first sync (no baseline): adopts game lots without dropping a plan', () => {
    const r = reconcileBusinessLots(['P'], ['A'], []);
    expect(r.result.sort()).toEqual(['A', 'P']); // plan P kept, game lot A adopted
    expect(r.added).toEqual(['A']);
    expect(r.removed).toEqual([]);
  });

  it('no change when planner already matches an unchanged game set', () => {
    const r = reconcileBusinessLots(['A'], ['A'], ['A']);
    expect(r.result).toEqual(['A']);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });
});
