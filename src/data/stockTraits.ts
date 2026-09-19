/**
 * CAS-pickable personality trait catalog: tuning ID → display name + the
 * lifestages eligible to CAS-pick it.
 *
 * Generated from an S4 Studio trait dump filtered to
 * <E n="trait_type">PERSONALITY</E>. 97 entries.
 *
 * Lifestage gating comes from each trait XML's <L n="ages"> block —
 * infants and toddlers have their own picks, children share some with
 * teens/adults, elders inherit adult traits + Wise, etc. Re-run
 * scripts/diagnostics/buildStockTraits.ts after a new game/pack release
 * to refresh this catalog.
 */
import type { ParsedLifestage } from '../lib/parser/types';

export interface StockTrait {
  name: string;
  ages: ParsedLifestage[]; // empty array means all lifestages (legacy fallback)
  iconInstance: string | null; // resource instance hex of the icon texture, used as the filename in /trait-icons/<hex>.png
}

export const STOCK_TRAITS: Record<string, StockTrait> = {
  '0x6b1b': { name: "Active", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '072332b836adf10a' },
  '0x7071e': { name: "Active Imagination", ages: ['child'], iconInstance: '2fcac0e2bd4e3ae2' },
  '0x3d8b5': { name: "Adventurous", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'f76adc2d4530cf20' },
  '0x41b7': { name: "Ambitious", ages: ['adult', 'elder', 'youngAdult'], iconInstance: 'e9210ace5b40e587' },
  '0x225c4': { name: "Angelic", ages: ['toddler'], iconInstance: '8b607ca3892ac6a2' },
  '0x3ed55': { name: "Animal Enthusiast", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '5e38e1d4cc1b384f' },
  '0x6d0e': { name: "Art Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '8a56c7f9ebe8db4b' },
  '0x6d0c': { name: "Bookworm", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'cfd751132b7f4196' },
  '0x41ba': { name: "Bro", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '9229515cd5c4a9d3' },
  '0x42d5b': { name: "Calm", ages: ['infant'], iconInstance: 'f8bef770a6e29bc7' },
  '0x2691a': { name: "Cat Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '15d6a48ff9bafe98' },
  '0x42d5c': { name: "Cautious", ages: ['infant'], iconInstance: '8ae20e9a5c6b8281' },
  '0x225c6': { name: "Charmer", ages: ['toddler'], iconInstance: '398594a96471f33d' },
  '0x5dcb6': { name: "Chased by Death", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '47c8f276fa36fc38' },
  '0x246a': { name: "Cheerful", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '09481da496b04a84' },
  '0x31ecc': { name: "Child of the Islands", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'e3530b4429967495' },
  '0x31ecd': { name: "Child of the Ocean", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '24cf8ef520a615e4' },
  '0x53779': { name: "Child of the Village", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '4dce48b2f0701a01' },
  '0x41be': { name: "Childish", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '4ab232629d5e7db6' },
  '0x225c8': { name: "Clingy", ages: ['toddler'], iconInstance: '9174f52527d3790f' },
  '0x41c0': { name: "Clumsy", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '7f63b3f2735de877' },
  '0x6c356': { name: "Competitive", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'a1b1dccc75961412' },
  '0x41d2': { name: "Creative", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'c8b3377565ce04eb' },
  '0x534a1': { name: "Cringe", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '1a64da4a40f3b063' },
  '0x1ec88': { name: "Dance Machine", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '2b1d206a4bfd8f2c' },
  '0x69bfb': { name: "Disruptive", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '8c1fe2e0cd652185' },
  '0x2691b': { name: "Dog Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '7a49d224c850438e' },
  '0x41d0': { name: "Erratic", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '9b193440febf400e' },
  '0x41c4': { name: "Evil", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '82bf68d5ee82ceba' },
  '0x41c6': { name: "Family Oriented", ages: ['adult', 'elder', 'youngAdult'], iconInstance: '2595025ece510ab8' },
  '0x6a28': { name: "Foodie", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '819dd321c403d952' },
  '0x393ae': { name: "Freegan", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '356d64a18923e423' },
  '0x225c3': { name: "Fussy", ages: ['toddler'], iconInstance: 'a7c466b212b99567' },
  '0x41c9': { name: "Geek", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'cbbc4fd78a5f1f44' },
  '0x534a0': { name: "Generous", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: 'b7842facf4c42b0b' },
  '0x6d0d': { name: "Genius", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'abb7098a3ecce973' },
  '0x2474': { name: "Gloomy", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '8b841c91497034a5' },
  '0x41cb': { name: "Glutton", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'b2cd732013bab94d' },
  '0x6d0b': { name: "Good", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '0187382390322d43' },
  '0x2479': { name: "Goofball", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'cbd1907eff85095e' },
  '0x38913': { name: "Green Fiend", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'f2dcb0e1a0f4e79b' },
  '0x684df': { name: "Grouch", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '135cc4cb2c1271f0' },
  '0x41cc': { name: "Hates Children", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: 'ddc123abb83228aa' },
  '0x7a769': { name: "Heart on Your Sleeve", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '5e588e50eadde9e9' },
  '0x427d0': { name: "High Maintenance", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '6fd7020a04e1486b' },
  '0x4e5c5': { name: "Horse Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '34a7cc8e8bd2436f' },
  '0x41cd': { name: "Hot-Headed", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'c4ec3e0a68620978' },
  '0x67a57': { name: "Idealist", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '51dda170312242e6' },
  '0x225ca': { name: "Independent", ages: ['toddler'], iconInstance: 'e692e17863c1cbf3' },
  '0x225c9': { name: "Inquisitive", ages: ['toddler'], iconInstance: 'a6327bb8a730348f' },
  '0x1e9fd': { name: "Insider", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '68a9e44cbda95f97' },
  '0x42d5d': { name: "Intense", ages: ['infant'], iconInstance: '8e86f97509c61a4c' },
  '0x1e7cf': { name: "Jealous", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '8a1e08a029947a27' },
  '0x202c7': { name: "Kleptomaniac", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '49bb424587b38a57' },
  '0x3ed57': { name: "Lactose Intolerant", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '21c06831f0fef59e' },
  '0x257f': { name: "Lazy", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'e522161c9ae24cce' },
  '0x2582': { name: "Loner", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '6191703e01cfd0a6' },
  '0x5866a': { name: "Lovebug", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '1162ef7bf50030be' },
  '0x6d0a': { name: "Loves Outdoors", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'c237863f2f0e61ff' },
  '0x4bfe3': { name: "Loyal", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: 'fdfb89112dc269b9' },
  '0x5caf3': { name: "Macabre", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '178ea788cccac349' },
  '0x38559': { name: "Maker", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '4fef0318357ca706' },
  '0x6d09': { name: "Materialistic", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '47ffeedf30c4b115' },
  '0x41d9': { name: "Mean", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '24132068c93561df' },
  '0x2584': { name: "Music Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '551ab738daff3f65' },
  '0x69d85': { name: "Mystical", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: 'e303fcdb95221d92' },
  '0x41da': { name: "Neat", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'd1819477f4137c2c' },
  '0x41c1': { name: "Noncommittal", ages: ['adult', 'elder', 'youngAdult'], iconInstance: '27229779548db0d5' },
  '0x5349e': { name: "Nosy", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '8e3b16da70b2bbb4' },
  '0x7383': { name: "Outgoing", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'e6b9a15e2d2e7ebd' },
  '0x455d1': { name: "Overachiever", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '82f95b30b2646893' },
  '0x31b16': { name: "Paranoid", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '197914e9e39704be' },
  '0x455d0': { name: "Party Animal", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '0f53b2a9a4b1d630' },
  '0x2591': { name: "Perfectionist", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '93012c7cddd2e971' },
  '0x6ebaf': { name: "Plant Lover", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '95e7653725422b1d' },
  '0x5a068': { name: "Practice Makes Perfect", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'de2d9fdcbaf53289' },
  '0x3d842': { name: "Proper", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'fc6df624c6be5f5c' },
  '0x4e5dc': { name: "Rancher", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '253c73e11078a5ec' },
  '0x38cf4': { name: "Recycle Disciple", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: '0b36da98026abd70' },
  '0x6b3e': { name: "Romantic", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '63acaac810315841' },
  '0x5845c': { name: "Romantically Reserved", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '16a82c91c8cc62a5' },
  '0x30b89': { name: "Self-Absorbed", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: 'e33842a8723af16e' },
  '0x41b8': { name: "Self-Assured", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'a4832ee07d368dc7' },
  '0x42d5e': { name: "Sensitive", ages: ['infant'], iconInstance: 'd2fdc3c980e7c7a6' },
  '0x60b20': { name: "Shady", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '32fe9ff397ddcf09' },
  '0x225c7': { name: "Silly", ages: ['toddler'], iconInstance: '38c0a703ddfea044' },
  '0x5d8e3': { name: "Skeptical", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'c86f1d9f8f5af50e' },
  '0x41dc': { name: "Slob", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'af5db10d90d9a2aa' },
  '0x2594': { name: "Snob", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '292bcad7db5961ac' },
  '0x428f5': { name: "Socially Awkward", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '64f6638948be6c91' },
  '0x18fc0': { name: "Squeamish", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'ca7e9f800e014016' },
  '0x42d5f': { name: "Sunny", ages: ['infant'], iconInstance: '4c2c04f3a5e61aab' },
  '0x205ed': { name: "Unflirty", ages: ['teen', 'adult', 'elder', 'youngAdult'], iconInstance: '42e4e5e4fd94f29d' },
  '0x20613': { name: "Vegetarian", ages: ['teen', 'adult', 'child', 'elder', 'youngAdult'], iconInstance: 'a1fd7c13f795524a' },
  '0x42d60': { name: "Wiggly", ages: ['infant'], iconInstance: '3b41659b495f9f39' },
  '0x225c5': { name: "Wild", ages: ['toddler'], iconInstance: '19a303c94fbb11af' },
  '0x5349f': { name: "Wise", ages: ['elder'], iconInstance: 'cbed2dda93f16edd' },
};

/** Look up a trait by its raw bigint tuning ID. Returns null if not in the CAS personality catalog. */
export function lookupTrait(id: bigint): StockTrait | null {
  return STOCK_TRAITS['0x' + id.toString(16)] ?? null;
}

/** Convenience: just the display name. */
export function lookupTraitName(id: bigint): string | null {
  return lookupTrait(id)?.name ?? null;
}

/** Every CAS personality trait that can be picked at the given lifestage. */
export function traitsForLifestage(lifestage: ParsedLifestage): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const [id, t] of Object.entries(STOCK_TRAITS)) {
    if (t.ages.includes(lifestage)) out.push({ id, name: t.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** /trait-icons/<idHex>.png for a CAS trait tuning id, or null if the catalog
 *  has no icon for it. Files are named by id (matching skills/careers); the
 *  iconInstance field is the has-icon flag + exact ResourceKey provenance. */
export function traitIconUrlById(id: string | null | undefined): string | null {
  if (!id) return null;
  return STOCK_TRAITS[id.toLowerCase()]?.iconInstance ? `/trait-icons/${id.replace(/^0x/, '').toLowerCase()}.png` : null;
}
