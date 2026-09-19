/**
 * Seed-data consistency guard.
 *
 * The lot catalog (worlds.ts), the field5 import map (lotField5Map.ts), and the
 * map pins (lotPins.ts) are three hand-/tool-maintained files keyed by the same
 * lot names. Nothing structurally forces them to agree, and a single typo in a
 * pin key silently hides that lot's pin on the world map (this test was added
 * after 38 pins had drifted that way). These assertions fail loudly the moment
 * the three sources disagree again.
 *
 * ★ They are also the guard on RENAMING a seeded lot, which reaches further than
 * the map: a lot's name is part of the key photos are filed under, so renaming
 * one in the catalog leaves every photo filed to it pointing at a key nothing
 * answers to — off its world's board, still in the pool, with no repair. Every
 * lot carries a pin, so a rename orphans that pin and fails the second test
 * below. Read the message there before "fixing" the pin.
 */
import { describe, it, expect } from 'vitest';
import { WORLDS_DATA, getBuildingName } from './worlds';
import { LOT_FIELD5_MAP } from './lotField5Map';
import { LOT_PINS } from './lotPins';

// Every valid lot key, and — per world — the set of valid PIN keys (apartments
// collapse to their building name, since the map shows one pin per building).
const validLotKeys = new Set<string>();
const validPinKeysByWorld: Record<string, Set<string>> = {};
for (const [world, { lots }] of Object.entries(WORLDS_DATA)) {
  validPinKeysByWorld[world] = new Set();
  for (const lot of lots as unknown as Array<{ name: string; type: string }>) {
    validLotKeys.add(`${world}::${lot.name}`);
    validPinKeysByWorld[world].add(
      lot.type === 'Apartment' ? getBuildingName(lot.name) : lot.name,
    );
  }
}

describe('seed-data consistency', () => {
  it('every field5 map entry points at a real catalog lot', () => {
    const orphans = Object.entries(LOT_FIELD5_MAP)
      .filter(([, key]) => !validLotKeys.has(key))
      .map(([f5, key]) => `${f5} → ${key}`);
    expect(orphans, `field5 entries with no matching catalog lot:\n${orphans.join('\n')}`).toEqual([]);
  });

  it('every map pin matches a catalog lot name or apartment building name', () => {
    const orphans: string[] = [];
    for (const [world, pins] of Object.entries(LOT_PINS ?? {})) {
      for (const pinName of Object.keys(pins ?? {})) {
        if (!validPinKeysByWorld[world]?.has(pinName)) orphans.push(`${world}::${pinName}`);
      }
    }
    expect(
      orphans,
      `pins that resolve to no lot (won't render):\n${orphans.join('\n')}\n\n`
      + 'If this is because you RENAMED a seeded lot, the pin is the small half of '
      + 'the problem: photos are filed under a key built from the lot name, so every '
      + 'photo already filed to that lot is now orphaned — off its world board, only '
      + 'reachable in the pool, and nothing repairs it. Rename it back, or write a '
      + 'migration that rewrites photo_assignments.target_key first.',
    ).toEqual([]);
  });

  it('pins reference only worlds that exist in the catalog', () => {
    const badWorlds = Object.keys(LOT_PINS ?? {}).filter((w) => !(w in WORLDS_DATA));
    expect(badWorlds, `pin worlds not in catalog: ${badWorlds.join(', ')}`).toEqual([]);
  });
});
