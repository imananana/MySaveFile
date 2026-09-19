/**
 * Icon URL resolvers for custom-venue activities + role criteria.
 *
 * Asset sources (all under /public, keyed as noted):
 *   - activities ... /activity-icons/<instance>.png   (extracted from icons.html;
 *                    instance = last segment of STOCK_ACTIVITIES iconKey)
 *   - traits ....... /trait-icons/<traitIdHex>.png      (CAS + getaway-NPC venue
 *                    traits, named by tuning id; iconInstance = has-icon flag)
 *   - skills ....... /skill-icons/<slug>.png           (slug = lowercased name)
 *   - careers ...... /career-icons/<careerIdHex>.png    (via careerIconUrlById)
 *   - age .......... /lifestage-icons/<stage>-sim.png
 *
 * Every consumer renders these in an <img onError> that hides on miss, so a
 * gap in the asset set degrades to text rather than a broken image.
 */
import { STOCK_ACTIVITIES } from './stockActivities';
import { STOCK_TRAITS } from './stockTraits';
import { STOCK_VENUE_TRAITS } from './stockVenueTraits';
import { careerIconUrlById } from './careerIcons';
import { skillIconUrlById } from './skillIcons';
import { REGION_ICONS } from './worldIcons';
import type { VenueCriterion } from '../lib/parser/types';

const hex = (v: number) => '0x' + v.toString(16);

/** Activity tuning id (decimal string) → /activity-icons/<instance>.png, or null.
 *  Tolerates a number from a row stored before ids became exact strings. */
export function activityIconUrl(id: string | number): string | null {
  const inst = STOCK_ACTIVITIES[String(id)]?.iconKey?.split(':').pop();
  return inst ? `/activity-icons/${inst}.png` : null;
}

// Age bitflag → lifestage-icons filename stem.
const AGE_ICON: Array<[number, string]> = [
  [1, 'newborn'], [2, 'toddler'], [4, 'child'], [8, 'teen'],
  [16, 'young-adult'], [32, 'adult'], [64, 'elder'], [128, 'infant'],
];

// Club requirement value icons → /criteria-icons/<instance>.png. Each ResourceKey
// is exact (confirmed by icon name in the dump + seed-confirmed criterion enums);
// see scripts/diagnostics/buildClubIconAssets.ts. No fuzzy matching.
const OCCULT_ICON: Record<string, string> = {
  '0x2590b': 'bfa6b19a7785731b', // Vampire
  '0x34045': '65da5160ac2e4d3b', // Spellcaster
  '0x30983': 'c0dee0f81b204bb1', // Mermaid
  '0x46bf4': 'a9f1ceb800807805', // Werewolf (powers icon — only occult art in the set)
  '0x19181': '26853c08f0141423', // Alien (powers)
  '0x5d1da': '3dae421c56005e4f', // Ghost (mastery)
  '0x69c87': '6acbdfcb06bd2418', // Fairy (ability)
  '0x25a4f': '12345b6955d90455', // Non-Occult (reuses the hug icon — no dedicated art)
};
const MARITAL_ICON: Record<number, string> = { 0: '2df34abdc4b8f36c', 1: 'b2687c7c97eb6ec3' };
const FUNDS_ICON: Record<number, string> = { 0: '6a40c064622c4dbe', 1: '537500dc3a45c6fb', 2: '5829726457b62650' };
// Celebrity level (fame) 1–5 → famelevel01–05.
const FAME_ICON: Record<number, string> = {
  1: 'b3c5fe01fcc5cfdf', 2: 'b3c5fe01fcc5cfdc', 3: 'b3c5fe01fcc5cfdd', 4: 'b3c5fe01fcc5cfda', 5: 'b3c5fe01fcc5cfdb',
};
// Gender / orientation / relationship — the role-criteria filter art (club_rules_*),
// each ResourceKey confirmed by exact icon name in the dump.
const GENDER_ICON: Record<number, string> = { 4096: 'b371bd292c5be57b', 8192: 'd0d5d1e82454cf7c' };
const ORIENTATION_ICON: Record<number, string> = { 4096: '1dbe52d0c48592f9', 8192: 'c9a07d0949fbcd3b', 12288: '4a0d98cb96aeabea', 16384: '9e940fbd26dbf4d1' };
const RELATIONSHIP_ICON: Record<number, string> = { 0: '067742fdfb81093c', 1: '6ba2cc352a95d018', 2: 'b6058dc517816904' };

/** Icons for one criterion value (age bitmasks can yield several). */
export function criterionValueIcons(type: VenueCriterion['type'], value: number): string[] {
  switch (type) {
    case 'trait': {
      // Resolve by trait tuning id — files are named by id (CAS + venue traits
      // both live in /trait-icons/<idHex>.png). The iconInstance/icon fields are
      // the has-icon flags; the path is built from the id, not the instance.
      const hasIcon = STOCK_TRAITS[hex(value)]?.iconInstance || STOCK_VENUE_TRAITS[hex(value)]?.icon;
      return hasIcon ? [`/trait-icons/${value.toString(16)}.png`] : [];
    }
    case 'skill': {
      // Resolve by skill tuning id (exact — files are named by id from each
      // StatisticTuning's <T n="icon"> ResourceKey), NOT by name-slug.
      const url = skillIconUrlById(value.toString(16));
      return url ? [url] : [];
    }
    case 'career': {
      // Resolve by career tuning id (exact — files are named by id via the
      // career->start_track->icon chain), NOT by name.
      const url = careerIconUrlById(value.toString(16));
      return url ? [url] : [];
    }
    case 'age':
      return AGE_ICON.filter(([f]) => (value & f) !== 0).map(([, s]) => `/lifestage-icons/${s}-sim.png`);
    case 'occult': {
      const inst = OCCULT_ICON[hex(value)];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'marital': {
      const inst = MARITAL_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'funds': {
      const inst = FUNDS_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'fame': {
      const inst = FAME_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'gender': {
      const inst = GENDER_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'orientation': {
      const inst = ORIENTATION_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'relationship': {
      const inst = RELATIONSHIP_ICON[value];
      return inst ? [`/criteria-icons/${inst}.png`] : [];
    }
    case 'region': {
      // World-bubble art, keyed by region id (REGION_ICONS values are full paths).
      const url = REGION_ICONS[value.toString(16)];
      return url ? [url] : [];
    }
    default:
      return [];
  }
}

/** All icons for a criterion, across its values (deduped). */
export function criterionIcons(c: VenueCriterion): string[] {
  const seen = new Set<string>();
  for (const v of c.values) for (const u of criterionValueIcons(c.type, v)) seen.add(u);
  return [...seen];
}

// Fixed kind icons (there's no per-venue icon picker). Extracted from icons.html
// by scripts/diagnostics/buildVenueKindIcons.ts; named by ResourceKey instance.
// Alternate candidates live in /public/venue-kind-icons/ if we want to swap.
export const VENUE_KIND_ICON = {
  venue:   '/venue-kind-icons/08b923f3f7cf42c6.png', // reception desk
  getaway: '/venue-kind-icons/548a7b163fd57272.png', // hikers + signpost
  preset:  '/venue-kind-icons/a6821caf34cb7de8.png', // clipboard (future preset UI)
} as const;
