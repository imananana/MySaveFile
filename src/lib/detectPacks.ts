/**
 * Auto-detect which Sims 4 packs a save file uses. Called by the import flow
 * after parseSaveData() returns; output is unioned into the pack ownership
 * store. Detection is deterministic — every signal is a fact (hex match,
 * world reference, feature presence), no heuristics or thresholds.
 *
 * Signal sources, in rough order of strength:
 *   - Trait tuning hexes per sim     → TRAIT_TO_PACK
 *   - Aspiration tuning hex per sim  → ASPIRATION_TO_PACK
 *   - Career tuning hex per sim      → CAREER_TO_PACK
 *   - Occult state per sim           → static occult → pack map
 *   - Pet subtype per sim            → cat/dog → EP04, horse → EP14
 *   - Lot's world (via field5)       → release → RELEASE_TO_PACK
 *   - Lot's TYPE                     → getLotTypePacks, when only one pack adds it
 *   - Feature presence               → clubs → EP02, holidays → EP05, etc.
 *
 * ★ The lot-type signal is WEAK, and knowing why matters more than having it.
 * A pack that ships a world is already proved by that world, and its lot types
 * arrive pre-placed inside it — so there the type adds nothing. On a pack with
 * no world of its own (Tiny Living, Spa Day, Dine Out…) a lot of its type only
 * exists because somebody chose to build one, which most players never do. So
 * this closes no gap: it is one more way a pack CAN show up, never a reason to
 * expect that it will. Those packs still rest on a trait, and failing all of
 * that, on the manual switch in Pack Settings.
 *
 * 'base' is always included — base game content is always available.
 */
import type { SaveData } from './saveParser';
import { TRAIT_TO_PACK, ASPIRATION_TO_PACK, CAREER_TO_PACK, OCCULT_TO_PACK } from '../data/packAssignments';
import { RELEASE_TO_PACK } from '../data/packs';
import { getLotTypePacks } from '../data/lotTypePacks';
import { LOT_FIELD5_MAP } from '../data/lotField5Map';
import { WORLDS_DATA } from '../data/worlds';

const PET_SUBTYPE_TO_PACK: Record<string, string> = {
  cat:   'EP04',
  dog:   'EP04',
  horse: 'EP14',
};

const bigintToHex = (b: bigint): string => '0x' + b.toString(16);

export function detectPacksFromSave(save: SaveData): Set<string> {
  const owned = new Set<string>(['base']);

  // 1. Sims: traits, aspirations, careers, occult, species
  for (const sim of save.sims) {
    for (const traitId of sim.traitIds) {
      const packId = TRAIT_TO_PACK[bigintToHex(traitId)];
      if (packId) owned.add(packId);
    }
    if (sim.aspirationId !== null) {
      const packId = ASPIRATION_TO_PACK[bigintToHex(sim.aspirationId)];
      if (packId) owned.add(packId);
    }
    // The sim's ACTIVE career only — the parser already drops the stale
    // history, so this can't credit a pack for a job they quit years ago.
    if (sim.career) {
      const packId = CAREER_TO_PACK[sim.career.uid];
      if (packId) owned.add(packId);
    }
    const occultPack = OCCULT_TO_PACK[sim.occult];
    if (occultPack) owned.add(occultPack);
    const petPack = PET_SUBTYPE_TO_PACK[sim.petSubtype];
    if (petPack) owned.add(petPack);
  }

  // 2. Lots: trace each to its world (via field5 → "World::Name") and tag the
  // world's pack. Custom lots without a field5 match are silently skipped —
  // they don't carry world identity reliably. Separately, tag the pack that
  // adds the lot's TYPE — a lot needs no world to be a spa.
  for (const lot of save.lots) {
    if (lot.detectedType) {
      const typePacks = getLotTypePacks(lot.detectedType);
      // Exactly one pack, or nothing. "Rental" comes from both Outdoor Retreat
      // and Jungle Adventure, and a lot that could be either is evidence for
      // neither — crediting both would hand someone a pack they don't own.
      if (typePacks.length === 1) owned.add(typePacks[0]);
    }
    if (lot.field5 === null) continue;
    const key = LOT_FIELD5_MAP[lot.field5.toString()];
    if (!key) continue;
    const worldName = key.split('::')[0];
    const world = (WORLDS_DATA as Record<string, { release: number }>)[worldName];
    if (!world) continue;
    const packId = RELEASE_TO_PACK[world.release];
    if (packId) owned.add(packId);
  }

  // 3. Feature presence — system-level signals each tied to a single pack.
  if (save.clubs.length > 0)          owned.add('EP02'); // Get Together
  if (save.holidays.length > 0)       owned.add('EP05'); // Seasons
  if (save.smallBusinesses.length > 0) owned.add('EP18'); // Businesses & Hobbies

  return owned;
}
