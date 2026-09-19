// Small business icons. Each filename in /public/small-business-icons/ is the
// lowercase hex of the icon's venue tuning ResourceKey instance — every small
// business "category" (Daycare, Shop, Café, Spa, etc.) has a stable hex that
// identifies it across saves. The save stores this value at
// SmallBusinessData.f7, so the import path uses it directly with no lookup
// table.
//
// To add a new icon: drop the file in public/small-business-icons/ named
// <instance>.png, then append the instance hex below.
export const SMALL_BUSINESS_ICONS: readonly string[] = [
  '065c0432d2aa3714',
  '1bb4daa220077253',
  '289d1d82a7051e0b',
  '2a4d0321668345f5',  // Daycare (Sunny Babies, Henford Petting Zoo)
  '2be378adf28f3991',
  '34a7d65e6a0298a8',
  '453576db94038374',
  '46e368baa27ac114',
  '4c49e8f3a8cd4790',
  '55a01677efa85086',
  '602524d944ad924e',
  '7e76ca755f5ca7a6',  // Shop (Test123 Shop)
  '83b7f51264bfbdbc',
  '9070387569ba085f',
  '9500a695b4375054',
  '9aa4dcb82cfa0ada',
  'a4c5f04c3fa40658',
  'b6438f31396493f0',
  'c16a3baf492237e8',
  'c5b9e49b8d1cafe0',
  'c9a4430ca0e3fc07',
  'c9b5370ca0f25b29',
  'd21a2506bb2b2567',
  'ea3d21750b214762',
  'ea5f26750b3e359a',
  'ecd2ba94c93f72a7',
  'f3d5f9f49c490b12',
  'f46bc06c99b7a14d',
  'f4b53b98b58e19c5',
  'ff2ffdb4fa9ce45a',
];

// Fallback slug used when a save's venue tuning ResourceKey instance isn't in
// our library (mods, unreleased pack venues, custom business types).
// The unknown.png file stays out of SMALL_BUSINESS_ICONS so the picker doesn't
// surface it as a selectable option.
export const UNKNOWN_SMALL_BUSINESS_ICON = 'unknown';
