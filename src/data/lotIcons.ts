import { VENUE_TUNING_MAP } from '../lib/parser/lots';
import { lotIconUrlById } from './venueTypeIcons';

// Lots are stored by their venue-type LABEL (e.g. "Bar", "Residential Rental"),
// not the venue tuning id. To use the exact, id-named venue icons (extracted from
// each VenueTuning's <T n="venue_icon"> — see buildVenueIcons.ts) we reverse the
// VENUE_TUNING_MAP: label → the venue id whose icon we have. First id with art
// wins (a few labels map from several ids, e.g. the three Rental venues).
const LABEL_TO_VENUE_ID: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [id, label] of Object.entries(VENUE_TUNING_MAP)) {
    if (!m[label] && lotIconUrlById(id)) m[label] = id;
  }
  return m;
})();

// Build-data labels that aren't their own venue type → the venue id whose icon
// the game actually uses, so they still resolve to an EXACT icon (verified in
// tuning, not guessed): Apartment/Penthouse share venue_residential's icon
// (Venue_Penthouse's venue_icon is icon_residential, confirmed identical);
// Vacation Rental → the vacation-rental venue; Mount Komorebi Summit has no venue
// tuning of its own and shows the park mark in-game.
const LABEL_ALIAS_VENUE_ID: Record<string, string> = {
  'Apartment':             '0x6fc6',   // venue_residential
  'Penthouse':             '0x6fc6',   // Venue_Penthouse → icon_residential (same pixels)
  'Vacation Rental':       '0x3a762',  // venue_rentable_vacation_generic
  'Mount Komorebi Summit': '0x64f7',   // park mark (no dedicated summit venue tuning)
};

// Last-resort hand-picked slug — only for labels with no venue tuning at all.
// Today that's just Hospital (a Get to Work active-career venue, not a
// VenueTuning resource). Everything else resolves to an exact id-named icon.
const SLUG_FALLBACK: Record<string, string> = {
  'Hospital': 'hospital-lot',
};

export function getLotIconSrc(lotType: string): string {
  if (!lotType) return '';
  // Prefer the exact, id-named venue icon (direct label, then known alias).
  const id = LABEL_TO_VENUE_ID[lotType] ?? LABEL_ALIAS_VENUE_ID[lotType];
  const exact = id ? lotIconUrlById(id) : null;
  if (exact) return exact;
  // Fallback: hand-picked slug for the lone no-venue-tuning label, else a
  // best-effort slug (degrades to nothing via <img onError> if absent).
  const slug = SLUG_FALLBACK[lotType] ?? lotType.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-') + '-lot';
  return `/lot-icons/${slug}.png`;
}
