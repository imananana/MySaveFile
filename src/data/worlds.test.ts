import { describe, it, expect } from 'vitest';
import {
  canConvertToSmallBusinessVenue, isClubHangoutEligible, isSmallBusinessEligible, isHomeBusinessLot,
  WORLD_LOT_COUNTS, WORLD_NAMES, WORLDS_DATA, isLotVisible,
} from './worlds';

const lot = (customType: string, defaultType: string, householdIds: string[] = []) => ({
  customType,
  defaultType,
  householdIds,
});

describe('WORLD_LOT_COUNTS', () => {
  // The sidebar advertises this number; the world page counts the lots it
  // renders. They disagreed on seven worlds because the sidebar counted the
  // game's non-plannable hidden lots too.
  it('matches what the world page shows, for every world', () => {
    for (const w of WORLD_NAMES) {
      const shown = WORLDS_DATA[w].lots.filter((l) => isLotVisible(l.type)).length;
      expect(WORLD_LOT_COUNTS[w], w).toBe(shown);
    }
  });

  it('drops the non-plannable hidden lots but keeps the editable specials', () => {
    // Willow Creek: 22 seeded, Sylvan Glade (a Secret Lot) isn't shown.
    expect(WORLD_LOT_COUNTS['Willow Creek']).toBe(21);
    // Magnolia Promenade: 8 seeded — Sixam and FutureSim Labs drop out, but the
    // Police Station and Willow Creek Hospital stay (both are on the map).
    expect(WORLD_LOT_COUNTS['Magnolia Promenade']).toBe(6);
    // A world with nothing hidden is unaffected.
    expect(WORLD_LOT_COUNTS['Newcrest']).toBe(WORLDS_DATA['Newcrest'].lots.length);
  });
});

describe('canConvertToSmallBusinessVenue', () => {
  it('allows an empty regular lot (residential, retail, park, empty SB venue)', () => {
    expect(canConvertToSmallBusinessVenue(lot('Residential', 'Residential'))).toBe(true);
    expect(canConvertToSmallBusinessVenue(lot('Retail', 'Retail'))).toBe(true);
    expect(canConvertToSmallBusinessVenue(lot('Park', 'Park'))).toBe(true);
    expect(canConvertToSmallBusinessVenue(lot('Small Business Venue', 'Residential'))).toBe(true);
  });

  it('allows an EMPTY residential rental (converting evicts nobody)', () => {
    expect(canConvertToSmallBusinessVenue(lot('Residential Rental', 'Residential Rental'))).toBe(true);
  });

  it('rejects any occupied lot (would evict its household)', () => {
    expect(canConvertToSmallBusinessVenue(lot('Residential', 'Residential', ['hh1']))).toBe(false);
    expect(canConvertToSmallBusinessVenue(lot('Residential Rental', 'Residential Rental', ['hh1']))).toBe(false);
  });

  it('rejects apartment units and student housing regardless of occupancy', () => {
    expect(canConvertToSmallBusinessVenue(lot('Apartment', 'Apartment'))).toBe(false);
    expect(canConvertToSmallBusinessVenue(lot('University Housing', 'University Housing'))).toBe(false);
  });

  it('rejects hidden special lots (e.g. Hospital)', () => {
    expect(canConvertToSmallBusinessVenue(lot('Hospital', 'Hospital'))).toBe(false);
  });
});

describe('centralized eligibility helpers', () => {
  it('isSmallBusinessEligible: a lot you own and live on, or a business venue', () => {
    expect(isSmallBusinessEligible('Residential')).toBe(true);
    expect(isSmallBusinessEligible('Tiny Home Residential')).toBe(true);
    expect(isSmallBusinessEligible('Small Business Venue')).toBe(true);
    // You can run a business from the apartment (or penthouse, or haunted
    // house) you live in — even though none of those can be BOUGHT and
    // converted into a venue. Excluding them stripped the location on sync.
    expect(isSmallBusinessEligible('Apartment')).toBe(true);
    expect(isSmallBusinessEligible('Penthouse')).toBe(true);
    expect(isSmallBusinessEligible('Haunted House')).toBe(true);
    // A tenant doesn't own the lot, so a For Rent unit can't host one.
    expect(isSmallBusinessEligible('Residential Rental')).toBe(false);
    expect(isSmallBusinessEligible('Retail')).toBe(false);
  });

  it('isHomeBusinessLot: every home type except the one you only rent', () => {
    expect(isHomeBusinessLot('Apartment')).toBe(true);
    expect(isHomeBusinessLot('Residential Rental')).toBe(false);
    // A venue is a bought business lot, not somebody's home.
    expect(isHomeBusinessLot('Small Business Venue')).toBe(false);
  });

  it('isClubHangoutEligible: rentals + university housing excluded, apartments allowed', () => {
    expect(isClubHangoutEligible('Apartment')).toBe(true);
    expect(isClubHangoutEligible('Residential Rental')).toBe(true);
    expect(isClubHangoutEligible('Rental')).toBe(false);
    expect(isClubHangoutEligible('Vacation Rental')).toBe(false);
    expect(isClubHangoutEligible('University Housing')).toBe(false);
  });
});
