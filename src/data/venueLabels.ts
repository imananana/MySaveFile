/**
 * Human-readable labels for parsed custom-venue criteria & outfits.
 *
 * Confirmed mappings (factual game enums / reseed-verified) vs gaps:
 *  - age bitmask, gender flag, fame rank ...... confirmed
 *  - outfit category ......................... OutfitCategory enum − 1
 *                                               (Everyday=0, Swimwear=9 verified; rest inferred)
 *  - skill criterion name .................... GAP: no skill-statistic catalog yet → raw id
 *  - outfit dress code / color ............... GAP: non-sequential ids, need more seeds → raw
 */
import type { VenueCriterion, VenueRoleOutfit, SmallBusinessCustomerCriterion } from '../lib/parser/types';
import { STOCK_TRAITS } from './stockTraits';
import { STOCK_VENUE_TRAITS } from './stockVenueTraits';
import { STOCK_CAREERS } from './stockCareers';
import { STOCK_SKILLS } from './stockSkills';
import { STOCK_OCCULTS } from './stockOccults';
import { STOCK_REGIONS } from './stockRegions';

// Sims age bitflags — same enum the sim parser's HUMAN_LIFESTAGE_MAP uses
// (confirmed app-wide). A criterion value can OR several together.
const AGE_FLAGS: Array<[number, string]> = [
  [1, 'Newborn'], [2, 'Toddler'], [4, 'Child'], [8, 'Teen'],
  [16, 'Young Adult'], [32, 'Adult'], [64, 'Elder'], [128, 'Infant'],
];
export function ageLabel(bitmask: number): string {
  const hits = AGE_FLAGS.filter(([f]) => (bitmask & f) !== 0).map(([, n]) => n);
  return hits.length ? hits.join(', ') : `Age (${bitmask})`;
}

// Developmental order (Infant's flag is 128 but it sits between Newborn and
// Toddler in real life) — used to render an age criterion as a compact range.
const AGE_ORDER: Array<[number, string]> = [
  [1, 'Newborn'], [128, 'Infant'], [2, 'Toddler'], [4, 'Child'], [8, 'Teen'],
  [16, 'Young Adult'], [32, 'Adult'], [64, 'Elder'],
];
/** "Teen–Elder" for a contiguous span, single name for one, comma list otherwise. */
export function ageRangeLabel(bitmask: number): string {
  const hits = AGE_ORDER.filter(([f]) => (bitmask & f) !== 0).map(([, n]) => n);
  if (!hits.length) return `Age (${bitmask})`;
  if (hits.length === 1) return hits[0];
  const idxs = AGE_ORDER.map(([f], i) => ((bitmask & f) !== 0 ? i : -1)).filter((i) => i >= 0);
  const contiguous = idxs[idxs.length - 1] - idxs[0] === idxs.length - 1;
  return contiguous ? `${hits[0]}–${hits[hits.length - 1]}` : hits.join(', ');
}

const GENDER_LABEL: Record<number, string> = { 4096: 'Male', 8192: 'Female' };

// Only seed-CONFIRMED outfit categories are named (Everyday=0, Swimwear=9). The
// rest are NOT verified, so per the no-guesses rule they render as raw "Category N"
// rather than a guessed name.
const OUTFIT_CATEGORY: Record<number, string> = {
  0: 'Everyday',
  9: 'Swimwear',
};

export const CRITERION_TYPE_LABEL: Record<VenueCriterion['type'], string> = {
  skill: 'Skill', trait: 'Trait', career: 'Career', age: 'Age', fame: 'Celebrity',
  occult: 'Occult', gender: 'Gender', region: 'Region', orientation: 'Orientation',
  relationship: 'Relationship', marital: 'Marital', funds: 'Financial Status', unknown: 'Filter',
};

// Relationship-status enum — all 3 options seed-confirmed.
const REL_STATUS: Record<number, string> = { 0: 'Single', 1: 'In a Relationship', 2: 'Married' };
// Club marital-status enum — confirmed in-game (Power Moms=Married=0, "Not Married Club"=1).
const MARITAL_STATUS: Record<number, string> = { 0: 'Married', 1: 'Not Married' };
// Club financial-status tier — all seed-confirmed: 0=Poor (<$10k),
// 1=Moderate ($10k-$500k), 2=Wealthy (>$500k).
const FUNDS_STATUS: Record<number, string> = { 0: 'Poor', 1: 'Moderate', 2: 'Wealthy' };

// Romantic orientation — seed-confirmed values (gender flags: Males 4096, Females
// 8192, both = 12288, plus a dedicated "none" flag 16384).
const ORIENTATION: Record<number, string> = {
  4096:  'Attracted to Males',
  8192:  'Attracted to Females',
  12288: 'Attracted to Anyone',
  16384: 'Attracted to no one',
};
const orientationLabel = (value: number): string => ORIENTATION[value] ?? `Orientation #${value}`;

// Small-business "Supervised Customer" detail enum — a 0-indexed list in the
// in-game menu order. ALL six values seed-confirmed individually (Slot_00000007).
// This is its own value space (mixes ages + pets), NOT the age bitmask.
const SUPERVISED_CUSTOMER: Record<number, string> = {
  0: 'Infant', 1: 'Toddler', 2: 'Child', 3: 'Cats', 4: 'Dogs', 5: 'Horses',
};
export function supervisedCustomerLabel(v: number): string {
  return SUPERVISED_CUSTOMER[v] ?? `Value ${v}`;
}

const hex = (v: number) => '0x' + v.toString(16);

/** Resolve a single criterion value to its display name (raw id when uncatalogued). */
function valueName(type: VenueCriterion['type'], v: number): string {
  switch (type) {
    case 'gender':      return GENDER_LABEL[v] ?? String(v);
    case 'fame':        return `Rank ${v}`;
    case 'orientation': return orientationLabel(v);
    case 'relationship': return REL_STATUS[v] ?? `#${v}`;
    case 'marital':     return MARITAL_STATUS[v] ?? `#${v}`;
    case 'funds':       return FUNDS_STATUS[v] ?? `Tier ${v}`;
    case 'career':      return STOCK_CAREERS[hex(v)]?.name ?? `#${v}`;
    case 'trait':       return STOCK_TRAITS[hex(v)]?.name ?? STOCK_VENUE_TRAITS[hex(v)]?.name ?? `#${v}`;
    case 'skill':       return STOCK_SKILLS[hex(v)] ?? `#${v}`;
    case 'occult':      return STOCK_OCCULTS[hex(v)] ?? `#${v}`;
    case 'region':      return STOCK_REGIONS[hex(v)] ?? `#${v}`;
    case 'age':         return ageLabel(v);
    default:            return String(v);
  }
}

/** The criterion's TYPE label (e.g. "Occult", "Age"), for a small heading chip. */
export function criterionTypeLabel(c: VenueCriterion): string {
  return CRITERION_TYPE_LABEL[c.type];
}

/** The criterion's VALUES as friendly text. Multiple values are an "any of" set,
 *  so they read with "or" ("Vampire, Fairy or Ghost"). Age renders as a compact
 *  range ("Teen–Elder"). Uncatalogued ids fall back to raw, never guessed. */
export function criterionValueText(c: VenueCriterion): string {
  if (c.type === 'age') return c.values.map(ageRangeLabel).join(', ');
  const names = c.values.map((v) => valueName(c.type, v));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** One-line label for a role criterion ("Occult: Vampire / Fairy"). Kept for the
 *  re-sync diff display; the venue UI uses criterionTypeLabel + criterionValueText. */
export function criterionLabel(c: VenueCriterion): string {
  if (c.type === 'orientation') return c.values.map(orientationLabel).join(' / ');
  return `${CRITERION_TYPE_LABEL[c.type]}: ${c.values.map((v) => valueName(c.type, v)).join(' / ')}`;
}

/** Type label for a small-business target-customer criterion (e.g. "Supervised
 *  Customer", "Age"). */
export function customerCriterionTypeLabel(c: SmallBusinessCustomerCriterion): string {
  if (c.category === 'supervised') return 'Supervised Customer';
  if (c.category === 'unknown') return 'Filter';
  return CRITERION_TYPE_LABEL[c.category as VenueCriterion['type']];
}

/** Friendly value text for a small-business target-customer criterion. Supervised
 *  Customer uses its own enum; everything else reuses the venue value labels. */
export function customerCriterionValueText(c: SmallBusinessCustomerCriterion): string {
  const names = c.category === 'supervised'
    ? c.values.map(supervisedCustomerLabel)
    : c.category === 'age'
      ? c.values.map(ageRangeLabel)
      : c.values.map((v) => valueName(c.category as VenueCriterion['type'], v));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** Does this role have a set outfit at all? (We don't surface the specific
 *  category/dress-code — those numbers are meaningless to a player.) */
export function hasOutfit(o: VenueRoleOutfit): boolean {
  return o.mode !== 'none' && o.mode !== 'unknown';
}

/**
 * One-line label for a role/slot outfit. We can always state whether an outfit
 * is set and what KIND it is (category / style w/ dress code & or color / custom)
 * — but not the specific dress code or color (those are unmapped hashed ids).
 */
export function outfitLabel(o: VenueRoleOutfit): string {
  switch (o.mode) {
    case 'none':     return 'No uniform';
    case 'category': return OUTFIT_CATEGORY[o.category ?? -1] ?? `Category ${o.category}`;
    case 'style': {
      const parts: string[] = [];
      if (o.hasDressCode) parts.push('dress code');
      if (o.hasColor) parts.push('color');
      return parts.length ? `Style — ${parts.join(' + ')}` : 'Style';
    }
    case 'custom':   return 'Custom outfit';
    default:         return 'Outfit';
  }
}
