// Venue-type icon files in /public/lot-icons/ are named by the venue tuning id
// (hex, no 0x), joined EXACTLY on each VenueTuning's <T n="venue_icon"> ResourceKey
// (see scripts/diagnostics/buildVenueIcons.ts). The id is what saves store (a lot's
// venue tuning + a club hangout's f8.f3), so resolution == extraction key. Resolve
// venue-type icons by ID, never by name/slug. Venue types without a venue_icon in
// tuning (or whose texture isn't in the dump) have no file here.
export const VENUE_ICON_IDS = new Set<string>([
  '17f54', '17f55', '18201', '194fb', '19ac5', '19c77', '1a3bd', '1a3df',
  '1acce', '1aff0', '1b3fb', '1cd77', '1dd87', '1e0fc', '1e392', '1e88f',
  '1e927', '1fe99', '21a74', '21c8c', '2334e', '243f', '247f7', '26c7f',
  '2a709', '2ac13', '2e66a', '31513', '32146', '32d36', '33fa0', '356e9',
  '356ea', '36ac8', '36ac9', '36aca', '377e8', '37f83', '38829', '38a1c',
  '38a1d', '38fe9', '3a762', '3c54e', '3c6b1', '3d9dc', '41e5', '41e6',
  '41e9', '41ea', '41eb', '41ec', '42a78', '43f21', '441d5', '449ea',
  '449ec', '449ed', '47833', '4cb15', '53533', '59509', '5c2d3', '5d75a',
  '6069f', '64f7', '6f417', '6fc6', '72790', '7335a', '73e13',
]);

/** /lot-icons/<venueIdHex>.png for a venue tuning id, or null if we have no art. */
export function lotIconUrlById(venueId: string | null | undefined): string | null {
  if (!venueId) return null;
  const k = venueId.replace(/^0x/, '').toLowerCase();
  return VENUE_ICON_IDS.has(k) ? `/lot-icons/${k}.png` : null;
}
