import { describe, it, expect } from 'vitest';
import { businessLotsToYield, businessLotsOnIncompatibleType, venueLotsToRevert, clubsToYield, venueLotsToRelease } from './coherence';

describe('businessLotsToYield (B2 reality-collision)', () => {
  const residents = (m: Record<string, string[]>) =>
    new Map(Object.entries(m).map(([lot, sims]) => [lot, new Set(sims)]));

  it('yields a lot a foreign household moved onto (Mike/Bob)', () => {
    // Mike (owner "mike") planned a business onto House B; Bob's household lives there now.
    const out = businessLotsToYield(true, 'mike', ['houseB'], residents({ houseB: ['bob'] }));
    expect(out).toEqual(['houseB']);
  });

  it('keeps a home business — owner IS a resident', () => {
    // Bob+Mike both live on House A; Mike owns a business there.
    const out = businessLotsToYield(true, 'mike', ['houseA'], residents({ houseA: ['bob', 'mike'] }));
    expect(out).toEqual([]);
  });

  it('leaves an empty / plan-only lot alone (no game household)', () => {
    // The business is on a lot no game household occupies — authoring concern, not a collision.
    const out = businessLotsToYield(true, 'mike', ['emptyLot'], residents({}));
    expect(out).toEqual([]);
  });

  it('yields only the colliding lot when a business spans several', () => {
    const out = businessLotsToYield(
      true,
      'mike',
      ['houseA', 'houseB', 'venueLot'],
      residents({ houseA: ['mike'], houseB: ['bob'] }), // venueLot has no household
    );
    expect(out).toEqual(['houseB']); // home lot kept, venue kept, foreign-occupied dropped
  });

  it('yields when a real household moves onto a PLANNER-ONLY business lot (Johnny/Burr)', () => {
    // "Mikes" is planner-only (no game business), owner Johnny is a real sim.
    // Burr's household moves onto the planned lot → the plan can't survive.
    const out = businessLotsToYield(true, 'johnny', ['springscape'], residents({ springscape: ['burr'] }));
    expect(out).toEqual(['springscape']);
  });

  it('yields when the owner is a planner-only sim (no source) and a game household is there', () => {
    // hasOwner but ownerSourceId null → owner is never a save resident → yields.
    const out = businessLotsToYield(true, null, ['houseB'], residents({ houseB: ['bob'] }));
    expect(out).toEqual(['houseB']);
  });

  it('does not yield when the business has no owner (B6 handled elsewhere)', () => {
    const out = businessLotsToYield(false, null, ['houseB'], residents({ houseB: ['bob'] }));
    expect(out).toEqual([]);
  });
});

describe('businessLotsOnIncompatibleType (lot rezoned away from a business type)', () => {
  const types = (m: Record<string, string>) => new Map(Object.entries(m));
  // A stand-in predicate, not the real list — the rule under test is "yield what
  // the predicate rejects", so it stays honest while SB_ELIGIBLE_LOT_TYPES moves.
  const eligible = (t: string) => new Set(['Residential', 'Tiny Home Residential', 'Small Business Venue']).has(t);

  it('yields a lot the player rezoned to a Cafe', () => {
    const out = businessLotsOnIncompatibleType(['springscape'], types({ springscape: 'Cafe' }), eligible);
    expect(out).toEqual(['springscape']);
  });

  it('keeps a lot that is still a Small Business Venue', () => {
    const out = businessLotsOnIncompatibleType(['venue'], types({ venue: 'Small Business Venue' }), eligible);
    expect(out).toEqual([]);
  });

  it('keeps a residential lot (business type is fine; residency is judged elsewhere)', () => {
    const out = businessLotsOnIncompatibleType(['home'], types({ home: 'Residential' }), eligible);
    expect(out).toEqual([]);
  });

  it('leaves a lot the save does not know alone', () => {
    const out = businessLotsOnIncompatibleType(['ghost'], types({}), eligible);
    expect(out).toEqual([]);
  });

  it('yields only the incompatible lots when a business spans several', () => {
    const out = businessLotsOnIncompatibleType(
      ['home', 'cafe', 'retail'],
      types({ home: 'Residential', cafe: 'Cafe', retail: 'Retail' }),
      eligible,
    );
    expect(out).toEqual(['cafe', 'retail']);
  });
});

describe('clubsToYield (hangout lot turned ineligible)', () => {
  const types = (m: Record<string, string>) => new Map(Object.entries(m));
  const clubLots = (m: Record<string, string | null>) => new Map(Object.entries(m));
  // Mirror of CLUB_INELIGIBLE_LOT_TYPES so this test doesn't depend on worlds.ts.
  const eligible = (t: string) => !new Set(['Rental', 'Vacation Rental', 'University Housing']).has(t);

  it('yields a club whose hangout the game turned into a Vacation Rental', () => {
    const out = clubsToYield(clubLots({ c1: 'lotA' }), types({ lotA: 'Vacation Rental' }), eligible);
    expect(out).toEqual([{ clubId: 'c1', lotKey: 'lotA' }]);
  });

  it('keeps a club on an eligible hangout (Residential home / venue)', () => {
    const out = clubsToYield(clubLots({ c1: 'home' }), types({ home: 'Residential' }), eligible);
    expect(out).toEqual([]);
  });

  it('skips a general-venue hangout (no specific lot)', () => {
    const out = clubsToYield(clubLots({ c1: null }), types({}), eligible);
    expect(out).toEqual([]);
  });

  it('leaves a lot the save does not know alone', () => {
    const out = clubsToYield(clubLots({ c1: 'ghost' }), types({}), eligible);
    expect(out).toEqual([]);
  });

  it('yields only the clubs on ineligible lots', () => {
    const out = clubsToYield(
      clubLots({ a: 'home', b: 'uni', c: 'rental' }),
      types({ home: 'Residential', uni: 'University Housing', rental: 'Rental' }),
      eligible,
    );
    expect(out).toEqual([
      { clubId: 'b', lotKey: 'uni' },
      { clubId: 'c', lotKey: 'rental' },
    ]);
  });
});

describe('venueLotsToRevert (occupied venue → real type)', () => {
  const residents = (m: Record<string, string[]>) =>
    new Map(Object.entries(m).map(([lot, sims]) => [lot, new Set(sims)]));
  const types = (m: Record<string, string>) => new Map(Object.entries(m));

  it('reverts a venue lot a household moved onto (business already gone)', () => {
    // springscape is still typed Small Business Venue in the planner, Burr lives
    // there now, and no business need be attached — the type alone is impossible.
    const out = venueLotsToRevert(['springscape'], residents({ springscape: ['burr'] }), types({ springscape: 'Residential' }));
    expect(out).toEqual([{ lotKey: 'springscape', gameType: 'Residential' }]);
  });

  it('leaves an empty venue lot alone (no residents)', () => {
    const out = venueLotsToRevert(['venueLot'], residents({}), types({ venueLot: 'Residential' }));
    expect(out).toEqual([]);
  });

  it('does not revert when the save still reports the lot as a venue', () => {
    const out = venueLotsToRevert(['venueLot'], residents({ venueLot: ['x'] }), types({ venueLot: 'Small Business Venue' }));
    expect(out).toEqual([]);
  });

  it('skips a lot whose game type is unknown', () => {
    const out = venueLotsToRevert(['venueLot'], residents({ venueLot: ['x'] }), types({}));
    expect(out).toEqual([]);
  });

  it('reverts only the occupied venues among several', () => {
    const out = venueLotsToRevert(
      ['a', 'b', 'c'],
      residents({ a: ['x'], c: ['y'] }), // b is empty
      types({ a: 'Residential', b: 'Residential', c: 'Residential' }),
    );
    expect(out).toEqual([
      { lotKey: 'a', gameType: 'Residential' },
      { lotKey: 'c', gameType: 'Residential' },
    ]);
  });
});

describe('venueLotsToRelease (a venue you built lets go of a lot)', () => {
  const planned = [{ venueId: 'v1', lotKey: 'oak' }];

  it('releases the lot when the save now has a real venue there', () => {
    // You planned "Cozy Camp" onto Oak, then actually built a venue on Oak
    // in-game. The real one takes the address; your design survives, lot-less.
    const out = venueLotsToRelease(planned, new Set(['oak']), new Map([['oak', 'Custom Venue']]));
    expect(out).toEqual([{ venueId: 'v1', lotKey: 'oak', reason: 'taken' }]);
  });

  it('releases the lot when the game rezoned it away from Custom Venue', () => {
    const out = venueLotsToRelease(planned, new Set(), new Map([['oak', 'Cafe']]));
    expect(out).toEqual([{ venueId: 'v1', lotKey: 'oak', reason: 'retyped' }]);
  });

  it('KEEPS a lot the planner itself converted', () => {
    // The save still calls Oak residential, but the lot merge keeps the
    // planner's Custom Venue — judging on the save's raw type instead of the
    // resolved one would strip the lot off every planned venue on first sync.
    const out = venueLotsToRelease(planned, new Set(), new Map([['oak', 'Custom Venue']]));
    expect(out).toEqual([]);
  });

  it('says nothing about a lot the save has never heard of', () => {
    expect(venueLotsToRelease(planned, new Set(), new Map())).toEqual([]);
  });

  it('prefers "taken" when both reasons apply', () => {
    const out = venueLotsToRelease(planned, new Set(['oak']), new Map([['oak', 'Cafe']]));
    expect(out).toEqual([{ venueId: 'v1', lotKey: 'oak', reason: 'taken' }]);
  });
});
