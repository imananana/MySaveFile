/**
 * Lot type label → set of pack IDs that add that label. Built once at module
 * load by reversing VENUE_TUNING_MAP (tuning hex → label) and looking each
 * hex up in VENUE_TO_PACK (tuning hex → pack ID).
 *
 * Labels not present here (base-game types like "Residential" / "Bar" /
 * "Park") return an empty set, which isLotTypeOwned() treats as "always
 * available" — base game content is always owned. Labels added by multiple
 * packs (e.g. Penthouse from City Living + Lovestruck) are considered owned
 * if ANY of the contributing packs is owned.
 */
import { VENUE_TUNING_MAP } from '../lib/parser/lots';
import { VENUE_TO_PACK } from './packAssignments';

const LABEL_TO_PACKS: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const [hex, label] of Object.entries(VENUE_TUNING_MAP)) {
    const pack = VENUE_TO_PACK[hex];
    if (!pack) continue;
    let set = m.get(label);
    if (!set) {
      set = new Set();
      m.set(label, set);
    }
    set.add(pack);
  }
  return m;
})();

/** Pack IDs that contribute the given lot type label. Empty array = base game. */
export function getLotTypePacks(label: string): string[] {
  const set = LABEL_TO_PACKS.get(label);
  return set ? Array.from(set) : [];
}

/** True if at least one contributing pack is owned, or if the label is base game. */
export function isLotTypeOwned(label: string, isOwned: (packId: string) => boolean): boolean {
  const set = LABEL_TO_PACKS.get(label);
  if (!set || set.size === 0) return true; // base / unmapped → always available
  for (const p of set) {
    if (isOwned(p)) return true;
  }
  return false;
}
