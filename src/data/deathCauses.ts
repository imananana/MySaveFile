/**
 * Cause-of-death trait catalog: tuning ID → cause name.
 *
 * A deceased sim (isGhost, i.e. carrying the f54 death marker) also carries a
 * hidden "death type" trait identifying how they died. Unlike personality
 * traits, these are NOT in STOCK_TRAITS — that's exactly how we tell them
 * apart: a death trait is the one trait a ghost has that isn't a named CAS
 * personality trait (see scripts/diagnostics/deathCauseMap.ts).
 *
 * Derived from a seeded save (Slot_00000003: 31 ghosts, one death cause per
 * surname) and cross-validated three ways — personality-catalog exclusion,
 * same-cause pair intersection (G5/G6), and natural deaths in an independent
 * save (Slot_12345673). All 31 causes + Old Age resolve to exactly one trait.
 * Re-run scripts/diagnostics/deathCauseMap.ts after a new game/pack release to
 * catch any added death types.
 */
export const DEATH_CAUSE_TRAITS: Record<string, string> = {
  '0x18d2c': 'Fire',
  '0x18d2f': 'Anger',
  '0x18d30': 'Overexertion',
  '0x18d31': 'Electrocution',
  '0x18d32': 'Embarrassment',
  '0x18d33': 'Hunger',
  '0x18d34': 'Laughter',
  '0x18d35': 'Old Age',
  '0x18d48': 'Cowplant',
  '0x1d48f': 'Steam',
  '0x194af': 'Drowning',
  '0x218f5': 'Pufferfish',
  '0x2b088': 'Poison',
  '0x2c69e': 'Rabid Rodent Fever',
  '0x2c7a9': 'Freezing',
  '0x2d277': 'Overheating',
  '0x2d7db': 'Lightning',
  '0x31d7d': 'Consumed by the Mother',
  '0x37bef': 'Murphy Bed',
  '0x39560': 'Flies',
  '0x399db': 'Beetles',
  '0x3cf93': 'Vending Machine',
  '0x3d170': 'Falling',
  '0x3f078': 'Killer Rabbit',
  '0x416d8': 'Killer Chicken',
  '0x456cc': 'Stink Capsule',
  '0x45cd1': 'Urban Myth',
  '0x47d94': 'Meteorite',
  '0x53f3d': 'Mold',
  '0x5ba9c': 'Murder of Crows',
  '0x5c8ba': 'Broken Heart',
  '0x7415d': 'Cuckoo Malfunction',
};

/** The cause of death for a deceased sim, or null if alive / cause unmapped. */
export function deathCauseFromTraits(traitIds: bigint[]): string | null {
  for (const t of traitIds) {
    const name = DEATH_CAUSE_TRAITS['0x' + t.toString(16)];
    if (name) return name;
  }
  return null;
}
