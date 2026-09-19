import { describe, it, expect } from 'vitest';
import { DEATH_CAUSE_TRAITS, deathCauseFromTraits } from './deathCauses';
import { STOCK_TRAITS } from './stockTraits';

describe('death-cause trait catalog', () => {
  it('covers all 31 causes + Old Age', () => {
    expect(Object.keys(DEATH_CAUSE_TRAITS)).toHaveLength(32);
  });

  // The defining invariant: a death trait is a HIDDEN trait, never a named CAS
  // personality trait. This is exactly how the cause is identified during
  // parsing — so any overlap would break that rule (and re-introduce the
  // "Squeamish = Meteorite" class of bug).
  it('shares no trait id with the personality catalog', () => {
    const collisions = Object.keys(DEATH_CAUSE_TRAITS).filter((id) => id in STOCK_TRAITS);
    expect(collisions).toEqual([]);
  });

  it('resolves a deceased sim to its cause from trait ids', () => {
    // Cowplant ghost carrying assorted CAS traits + the hidden death trait.
    expect(deathCauseFromTraits([0x6b1bn, 0x18d48n, 0x41b7n])).toBe('Cowplant');
    expect(deathCauseFromTraits([0x18d31n])).toBe('Electrocution');
    expect(deathCauseFromTraits([0x18d35n])).toBe('Old Age');
  });

  it('returns null when no death trait is present', () => {
    // A living sim with only personality traits (High Maintenance = 0x427d0).
    expect(deathCauseFromTraits([0x427d0n, 0x6b1bn])).toBeNull();
    expect(deathCauseFromTraits([])).toBeNull();
  });
});
