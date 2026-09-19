/**
 * Canonical pack catalog. Used for ownership tracking + filtering UI content
 * to only what the user's installed packs added.
 *
 * Pack IDs match EA's install folder naming (EP01, GP04, SP17, ...) so they
 * round-trip cleanly with the diagnostic scanner in
 * scripts/diagnostics/scanInstalledPacks.ts. The runtime planner never reads
 * the install folder — auto-detection on save import infers ownership from
 * which trait / aspiration / venue / world hexes the save references, then
 * maps those to pack IDs via packAssignments.ts.
 *
 * Only packs that affect filterable surface area are included:
 *   - All 21 EPs (every EP adds worlds + traits + venues)
 *   - All 12 GPs (every GP adds aspirations / venues / occult systems)
 *   - The 15 SPs that add traits / aspirations / venues per the install scan
 * SPs that only add CC (objects, hairs, clothing) are intentionally excluded
 * — they don't gate any planner UI today, so tracking ownership would be
 * noise. They can be added later if a feature needs to gate on them.
 */

export type PackType = 'base' | 'EP' | 'GP' | 'SP';

export interface Pack {
  id: string;
  name: string;
  type: PackType;
  /** Chronological release order for cross-referencing worlds.ts `release` numbers. Undefined for packs without world or where unknown. */
  release?: number;
}

export const PACKS: Pack[] = [
  { id: 'base', name: 'Base Game', type: 'base', release: 0 },

  // Expansion Packs (21)
  { id: 'EP01', name: 'Get to Work',           type: 'EP', release: 2 },
  { id: 'EP02', name: 'Get Together',          type: 'EP', release: 3 },
  { id: 'EP03', name: 'City Living',           type: 'EP', release: 4 },
  { id: 'EP04', name: 'Cats & Dogs',           type: 'EP', release: 6 },
  { id: 'EP05', name: 'Seasons',               type: 'EP' },
  { id: 'EP06', name: 'Get Famous',            type: 'EP', release: 8 },
  { id: 'EP07', name: 'Island Living',         type: 'EP', release: 10 },
  { id: 'EP08', name: 'Discover University',   type: 'EP', release: 12 },
  { id: 'EP09', name: 'Eco Lifestyle',         type: 'EP', release: 13 },
  { id: 'EP10', name: 'Snowy Escape',          type: 'EP', release: 15 },
  { id: 'EP11', name: 'Cottage Living',        type: 'EP', release: 16 },
  { id: 'EP12', name: 'High School Years',     type: 'EP', release: 19 },
  { id: 'EP13', name: 'Growing Together',      type: 'EP', release: 20 },
  { id: 'EP14', name: 'Horse Ranch',           type: 'EP', release: 21 },
  { id: 'EP15', name: 'For Rent',              type: 'EP', release: 22 },
  { id: 'EP16', name: 'Lovestruck',            type: 'EP', release: 23 },
  { id: 'EP17', name: 'Life & Death',          type: 'EP', release: 24 },
  { id: 'EP18', name: 'Businesses & Hobbies',  type: 'EP', release: 25 },
  { id: 'EP19', name: 'Enchanted by Nature',   type: 'EP', release: 26 },
  { id: 'EP20', name: 'Adventure Awaits',      type: 'EP', release: 27 },
  { id: 'EP21', name: 'Royalty & Legacy',      type: 'EP', release: 28 },

  // Game Packs (12)
  { id: 'GP01', name: 'Outdoor Retreat',                type: 'GP', release: 1 },
  { id: 'GP02', name: 'Spa Day',                        type: 'GP' },
  { id: 'GP03', name: 'Dine Out',                       type: 'GP' },
  { id: 'GP04', name: 'Vampires',                       type: 'GP', release: 5 },
  { id: 'GP05', name: 'Parenthood',                     type: 'GP' },
  { id: 'GP06', name: 'Jungle Adventure',               type: 'GP', release: 7 },
  { id: 'GP07', name: 'StrangerVille',                  type: 'GP', release: 9 },
  { id: 'GP08', name: 'Realm of Magic',                 type: 'GP', release: 11 },
  { id: 'GP09', name: 'Star Wars: Journey to Batuu',    type: 'GP' },  // destination world, not in worlds.ts
  { id: 'GP10', name: 'Dream Home Decorator',           type: 'GP' },
  { id: 'GP11', name: 'My Wedding Stories',             type: 'GP', release: 17 },
  { id: 'GP12', name: 'Werewolves',                     type: 'GP', release: 18 },

  // Stuff Packs / Kits that add filterable content (traits / aspirations / venues)
  { id: 'SP02', name: 'Perfect Patio',     type: 'SP' },
  { id: 'SP05', name: 'Movie Hangout',     type: 'SP' },
  { id: 'SP06', name: 'Romantic Garden',   type: 'SP' },
  { id: 'SP07', name: 'Kids Room',         type: 'SP' },
  { id: 'SP09', name: 'Vintage Glamour',   type: 'SP' },
  { id: 'SP10', name: 'Bowling Night',     type: 'SP' },
  { id: 'SP11', name: 'Fitness',           type: 'SP' },
  { id: 'SP13', name: 'Laundry Day',       type: 'SP' },
  { id: 'SP14', name: 'My First Pet',      type: 'SP' },
  { id: 'SP15', name: 'Moschino',          type: 'SP' },
  { id: 'SP16', name: 'Tiny Living',       type: 'SP' },
  { id: 'SP17', name: 'Nifty Knitting',    type: 'SP' },
  { id: 'SP18', name: 'Paranormal',        type: 'SP' },
  { id: 'SP46', name: 'Home Chef Hustle',  type: 'SP' },
  { id: 'SP49', name: 'Crystal Creations', type: 'SP' },
];

export const PACKS_BY_ID: Record<string, Pack> = Object.fromEntries(PACKS.map((p) => [p.id, p]));

/** Map worlds.ts `release` number → pack ID. Built once from PACKS at module load. */
export const RELEASE_TO_PACK: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const p of PACKS) {
    if (p.release !== undefined) m[p.release] = p.id;
  }
  return m;
})();
