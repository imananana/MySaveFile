import { describe, it, expect } from 'vitest';
import { stickersToClearOnMove, type StickerClearInput } from './plannedMoveSync';

/** Convenience builder — a sim that has a sticker and a prior baseline by default. */
function sim(over: Partial<StickerClearInput> & { simId: string }): StickerClearInput {
  return {
    plannedMoveHouseholdId: 'plan-target',
    prevHouseholdSourceId: 'hhA',
    nextHouseholdSourceId: 'hhA',
    ...over,
  };
}

describe('stickersToClearOnMove (Pass 1)', () => {
  it('clears a sticker when the sim moved to a different game household', () => {
    const out = stickersToClearOnMove([sim({ simId: 's1', nextHouseholdSourceId: 'hhB' })]);
    expect(out).toEqual(['s1']);
  });

  it('clears match-agnostically — even when the sim landed exactly where the plan pointed', () => {
    // Sticker points at plan-target; the game move happens to be to that same
    // household. Pass 1 still clears (realization/adopt is Pass 2's concern).
    const out = stickersToClearOnMove([
      sim({ simId: 's1', plannedMoveHouseholdId: 'plan-target', nextHouseholdSourceId: 'plan-target' }),
    ]);
    expect(out).toEqual(['s1']);
  });

  it('keeps the sticker when the sim stayed in the same household', () => {
    const out = stickersToClearOnMove([sim({ simId: 's1', nextHouseholdSourceId: 'hhA' })]);
    expect(out).toEqual([]);
  });

  it('ignores sims with no sticker even if they moved', () => {
    const out = stickersToClearOnMove([
      sim({ simId: 's1', plannedMoveHouseholdId: null, nextHouseholdSourceId: 'hhB' }),
      sim({ simId: 's2', plannedMoveHouseholdId: undefined, nextHouseholdSourceId: 'hhB' }),
    ]);
    expect(out).toEqual([]);
  });

  it('does not clear on the first sync (no prior baseline to prove a move)', () => {
    const out = stickersToClearOnMove([
      sim({ simId: 's1', prevHouseholdSourceId: null, nextHouseholdSourceId: 'hhB' }),
      sim({ simId: 's2', prevHouseholdSourceId: undefined, nextHouseholdSourceId: 'hhB' }),
    ]);
    expect(out).toEqual([]);
  });

  it('leaves the sticker alone when the sim is absent from the new save (no next household)', () => {
    const out = stickersToClearOnMove([
      sim({ simId: 's1', nextHouseholdSourceId: null }),
      sim({ simId: 's2', nextHouseholdSourceId: undefined }),
    ]);
    expect(out).toEqual([]);
  });

  it('clears each mover independently (case 2: multiple movers split apart)', () => {
    // Two sims left the same household in different directions — each sticker
    // clears on its own, no coupling.
    const out = stickersToClearOnMove([
      sim({ simId: 's1', prevHouseholdSourceId: 'home', nextHouseholdSourceId: 'hhX' }),
      sim({ simId: 's2', prevHouseholdSourceId: 'home', nextHouseholdSourceId: 'hhY' }),
      sim({ simId: 's3', prevHouseholdSourceId: 'home', nextHouseholdSourceId: 'home' }), // stayed
    ]);
    expect(out).toEqual(['s1', 's2']);
  });

  it('returns an empty list for an empty input', () => {
    expect(stickersToClearOnMove([])).toEqual([]);
  });

  it('handles a mixed batch, returning only the true movers with stickers', () => {
    const out = stickersToClearOnMove([
      sim({ simId: 'moved-with-sticker', nextHouseholdSourceId: 'hhB' }),
      sim({ simId: 'stayed', nextHouseholdSourceId: 'hhA' }),
      sim({ simId: 'moved-no-sticker', plannedMoveHouseholdId: null, nextHouseholdSourceId: 'hhB' }),
      sim({ simId: 'first-sync', prevHouseholdSourceId: null, nextHouseholdSourceId: 'hhB' }),
      sim({ simId: 'removed', nextHouseholdSourceId: null }),
    ]);
    expect(out).toEqual(['moved-with-sticker']);
  });
});
