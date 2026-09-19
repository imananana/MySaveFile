/**
 * Maps every pack-added trait / aspiration / venue tuning hex to its origin
 * pack ID. Generated from the install scan
 * (scripts/diagnostics/packAssignments.scan.json) which walks every installed
 * pack's DBPF and subtracts the base-game set. Zero collisions across the
 * 85 packs scanned — every hex belongs to at most one pack.
 *
 * Lookup helpers default to 'base' when a hex isn't in any pack's list —
 * base-game content is always considered owned, so consumers can pass any
 * hex from the data and get a usable pack ID back.
 *
 * Re-generate via:
 *   npx tsx scripts/diagnostics/scanInstalledPacks.ts
 *   (then re-export the JSON contents into the arrays below)
 */
import scanData from '../../scripts/diagnostics/packAssignments.scan.json';

interface ScanPackEntry {
  pack: string;
  type: string;
  traits: string[];
  aspirations: string[];
  venues: string[];
  careers?: string[];
  skills?: string[];
}

const packs = (scanData as { packs: ScanPackEntry[] }).packs;

function buildLookup(field: 'traits' | 'aspirations' | 'venues' | 'careers' | 'skills'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of packs) {
    for (const hex of p[field] ?? []) {
      out[hex] = p.pack;
    }
  }
  return out;
}

export const TRAIT_TO_PACK: Record<string, string> = buildLookup('traits');
export const ASPIRATION_TO_PACK: Record<string, string> = buildLookup('aspirations');
export const VENUE_TO_PACK: Record<string, string> = buildLookup('venues');
export const CAREER_TO_PACK: Record<string, string> = buildLookup('careers');
export const SKILL_TO_PACK: Record<string, string> = buildLookup('skills');

/** Pack ID a trait belongs to (defaults to 'base' for unrecognized hexes). */
export const getTraitPack = (hex: string): string => TRAIT_TO_PACK[hex] ?? 'base';
/** Pack ID an aspiration belongs to (defaults to 'base'). */
export const getAspirationPack = (hex: string): string => ASPIRATION_TO_PACK[hex] ?? 'base';
/** Pack ID a venue tuning belongs to (defaults to 'base'). */
export const getVenuePack = (hex: string): string => VENUE_TO_PACK[hex] ?? 'base';
/** Pack ID a career tuning belongs to (defaults to 'base'). Career uid is the
 *  `f30.f12.f2.f1` hex from the save (see scripts/diagnostics/spikeCareerFinal.ts). */
export const getCareerPack = (hex: string): string => CAREER_TO_PACK[hex] ?? 'base';
/**
 * Each occult state was added by one specific pack. Ghost is deliberately
 * absent — base-game ghosts exist whatever you own — and so is 'none'.
 *
 * Not a scan output: occult is a parsed state on the sim, not a tuning hex, so
 * there's nothing for the DBPF walk to find. It's the pack each life state
 * shipped with.
 */
export const OCCULT_TO_PACK: Record<string, string> = {
  vampire:     'GP04',
  spellcaster: 'GP08',
  werewolf:    'GP12',
  fairy:       'EP19',
  alien:       'EP01',
  mermaid:     'EP07',
};

/** Pack ID an occult state came from. 'none' and 'ghost' are base game. */
export const getOccultPack = (occult: string): string => OCCULT_TO_PACK[occult] ?? 'base';

/** Pack ID a skill (statistic) tuning belongs to (defaults to 'base'). Skill id
 *  is the '0x..' hex into STOCK_SKILLS. */
export const getSkillPack = (hex: string): string => SKILL_PACK_OVERRIDES[hex] ?? SKILL_TO_PACK[hex] ?? 'base';

/**
 * Skills the scan cannot possibly get right, and why.
 *
 * EA authored these in the BASE-GAME tuning group even though nobody can learn
 * them without the pack — the skill's definition ships in the base client while
 * the object that teaches it (an archery target, a knitting basket) ships in the
 * pack. Two independent checks both report them as base game: the DBPF scan
 * above, and the tuning group code in the Skill dump, which is otherwise a
 * flawless pack fingerprint (25 groups, 25 packs, zero collisions, and it agrees
 * with the scan on all 45 skills that map). Nothing in the skill tuning records
 * the pack, so re-running the scan will never fix this.
 *
 * Hand-authored from the game itself. Add to it only on that basis.
 */
const SKILL_PACK_OVERRIDES: Record<string, string> = {
  '0x6e5e3': 'EP20', // Archery — Adventure Awaits
  '0x6eeb8': 'EP20', // Diving Board — Adventure Awaits
  '0x6dea6': 'EP20', // Papercraft — Adventure Awaits
  '0x2d94f': 'EP05', // Flower Arranging — Seasons
  '0x3a7a1': 'SP17', // Knitting — Nifty Knitting
  '0x19d2e': 'SP15', // Photography — Moschino
};
