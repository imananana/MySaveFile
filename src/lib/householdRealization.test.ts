/**
 * Tests for detectRealizations — the lot-anchored plan-only ⇄ imported clash.
 */
import { describe, it, expect } from 'vitest';
import {
  detectRealizations,
  detectAdoptions,
  type ShellInput,
  type IncomingRealHousehold,
} from './householdRealization';
import type { Household } from '../types';

const hh = (id: string, sourceId: string | null, assignedLotKey: string | null): Household =>
  ({ id, sourceId, assignedLotKey } as Household);

const rec = (items: Household[]): Record<string, Household> =>
  Object.fromEntries(items.map((h) => [h.id, h]));

describe('detectRealizations', () => {
  it('flags a plan-only + imported household sharing a lot', () => {
    const r = detectRealizations(rec([
      hh('plan', null, 'lotA'),
      hh('real', '0x123', 'lotA'),
    ]));
    expect(r).toEqual([{ lotKey: 'lotA', planOnlyHouseholdId: 'plan', importedHouseholdId: 'real' }]);
  });

  it('does not flag two imported households on one lot', () => {
    const r = detectRealizations(rec([
      hh('real1', '0x1', 'lotA'),
      hh('real2', '0x2', 'lotA'),
    ]));
    expect(r).toEqual([]);
  });

  it('does not flag a plan-only household alone on a lot', () => {
    expect(detectRealizations(rec([hh('plan', null, 'lotA')]))).toEqual([]);
  });

  it('does not flag plan-only + imported on DIFFERENT lots', () => {
    const r = detectRealizations(rec([
      hh('plan', null, 'lotA'),
      hh('real', '0x123', 'lotB'),
    ]));
    expect(r).toEqual([]);
  });

  it('ignores lot-less households', () => {
    const r = detectRealizations(rec([
      hh('plan', null, null),
      hh('real', '0x123', null),
    ]));
    expect(r).toEqual([]);
  });

  it('emits a pair per plan-only × imported on the same lot', () => {
    const r = detectRealizations(rec([
      hh('plan1', null, 'lotA'),
      hh('plan2', null, 'lotA'),
      hh('real', '0x123', 'lotA'),
    ]));
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.planOnlyHouseholdId).sort()).toEqual(['plan1', 'plan2']);
    expect(r.every((x) => x.importedHouseholdId === 'real' && x.lotKey === 'lotA')).toBe(true);
  });
});

// ── Pass 2 — realization auto-adopt ──────────────────────────────────────
const shell = (over: Partial<ShellInput> & { shellId: string }): ShellInput => ({
  order: 0,
  moverSourceIds: [],
  assignedLotKey: null,
  ...over,
});
const real = (over: Partial<IncomingRealHousehold> & { sourceId: string }): IncomingRealHousehold => ({
  memberSourceIds: [],
  assignedLotKey: null,
  ...over,
});

describe('detectAdoptions — movers path', () => {
  it('adopts a new household containing the shell’s mover', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sA'] })],
      [real({ sourceId: '0xNEW', memberSourceIds: ['sA'] })],
    );
    expect(out).toEqual([{ shellId: 'sh1', realSourceId: '0xNEW', via: 'movers' }]);
  });

  it('is member-agnostic — adopts even when a stranger is also in the household', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sA'] })],
      [real({ sourceId: '0xNEW', memberSourceIds: ['sA', 'stranger', 'baby'] })],
    );
    expect(out).toEqual([{ shellId: 'sh1', realSourceId: '0xNEW', via: 'movers' }]);
  });

  it('does not adopt when none of the shell’s movers are present', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sA'] })],
      [real({ sourceId: '0xNEW', memberSourceIds: ['someoneElse'] })],
    );
    expect(out).toEqual([]);
  });

  it('two shells contest one household → most movers wins', () => {
    const out = detectAdoptions(
      [
        shell({ shellId: 'few', order: 0, moverSourceIds: ['sA'] }),
        shell({ shellId: 'many', order: 1, moverSourceIds: ['sB', 'sC'] }),
      ],
      [real({ sourceId: '0xNEW', memberSourceIds: ['sA', 'sB', 'sC'] })],
    );
    // 'many' overlaps 2, 'few' overlaps 1 → many wins the household, few unmatched.
    expect(out).toEqual([{ shellId: 'many', realSourceId: '0xNEW', via: 'movers' }]);
  });

  it('contest with equal overlap → oldest shell (lower order) wins', () => {
    const out = detectAdoptions(
      [
        shell({ shellId: 'younger', order: 5, moverSourceIds: ['sA'] }),
        shell({ shellId: 'older', order: 1, moverSourceIds: ['sB'] }),
      ],
      [real({ sourceId: '0xNEW', memberSourceIds: ['sA', 'sB'] })],
    );
    expect(out).toEqual([{ shellId: 'older', realSourceId: '0xNEW', via: 'movers' }]);
  });

  it('a shell whose movers split across two new households adopts the one holding more of them', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sA', 'sB', 'sC'] })],
      [
        real({ sourceId: '0xONE', memberSourceIds: ['sA'] }),
        real({ sourceId: '0xTWO', memberSourceIds: ['sB', 'sC'] }),
      ],
    );
    expect(out).toEqual([{ shellId: 'sh1', realSourceId: '0xTWO', via: 'movers' }]);
  });
});

describe('detectAdoptions — lot path', () => {
  it('adopts a new real household on the shell’s assigned lot (CAS realization)', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'cas', assignedLotKey: 'bldgA' })],
      [real({ sourceId: '0xNEW', assignedLotKey: 'bldgA' })],
    );
    expect(out).toEqual([{ shellId: 'cas', realSourceId: '0xNEW', via: 'lot' }]);
  });

  it('does not lot-adopt across different lots', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'cas', assignedLotKey: 'bldgA' })],
      [real({ sourceId: '0xNEW', assignedLotKey: 'bldgB' })],
    );
    expect(out).toEqual([]);
  });

  it('a lotless CAS shell cannot adopt (coexists → manual delete)', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'cas', assignedLotKey: null })],
      [real({ sourceId: '0xNEW', assignedLotKey: 'bldgA' })],
    );
    expect(out).toEqual([]);
  });
});

describe('detectAdoptions — path priority & interaction', () => {
  it('movers wins over lot when both would match different households', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sA'], assignedLotKey: 'bldgA' })],
      [
        real({ sourceId: '0xMOVERS', memberSourceIds: ['sA'], assignedLotKey: 'elsewhere' }),
        real({ sourceId: '0xLOT', memberSourceIds: [], assignedLotKey: 'bldgA' }),
      ],
    );
    // Shell matches its movers household; it's already assigned, so the lot
    // household is left for someone else (here: nobody).
    expect(out).toEqual([{ shellId: 'sh1', realSourceId: '0xMOVERS', via: 'movers' }]);
  });

  it('a move-shell falls back to its lot when the movers did not surface but the lot realized', () => {
    const out = detectAdoptions(
      [shell({ shellId: 'sh1', moverSourceIds: ['sGone'], assignedLotKey: 'bldgA' })],
      [real({ sourceId: '0xNEW', memberSourceIds: ['unrelated'], assignedLotKey: 'bldgA' })],
    );
    expect(out).toEqual([{ shellId: 'sh1', realSourceId: '0xNEW', via: 'lot' }]);
  });

  it('each household is adopted by at most one shell (no double-claim on the lot path)', () => {
    const out = detectAdoptions(
      [
        shell({ shellId: 'a', order: 0, assignedLotKey: 'bldgA' }),
        shell({ shellId: 'b', order: 1, assignedLotKey: 'bldgA' }),
      ],
      [real({ sourceId: '0xNEW', assignedLotKey: 'bldgA' })],
    );
    // Only the older shell (a) adopts; b is left for orphan cleanup.
    expect(out).toEqual([{ shellId: 'a', realSourceId: '0xNEW', via: 'lot' }]);
  });

  it('returns nothing when there is nothing to match', () => {
    expect(detectAdoptions([], [])).toEqual([]);
    expect(detectAdoptions([shell({ shellId: 'x', moverSourceIds: ['sA'] })], [])).toEqual([]);
  });
});
