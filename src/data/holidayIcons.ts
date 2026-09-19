// Stock + extra holiday icons. Each filename in /public/holiday-icons/ is the
// lowercase hex of the icon's ResourceKey instance, so a save's stored
// Holiday.icon ResourceKey instance maps directly with no lookup table.
//
// To add a new icon: drop the file in public/holiday-icons/ named <instance>.png,
// then append the instance hex below.

// Fallback slug for save-stored icons we don't have in the library (mods,
// unreleased packs). The file at /holiday-icons/unknown.png stays out of
// HOLIDAY_ICONS so the picker doesn't surface it as a selectable option.
export const UNKNOWN_HOLIDAY_ICON = 'unknown';
export const HOLIDAY_ICONS: readonly string[] = [
  '05bfb75687a3f992',
  '0e5eb5d4132839d1',
  '0e9d1ecfaa889895',  // Love Day (stock)
  '0fdddb9c9633e51d',
  '104dc31347cff44a',
  '143351daa5d223fe',
  '14ed6bfdc9e9bc46',  // New Year's Eve (stock)
  '25bcf0727668600f',
  '3c94555a48d3a3af',
  '4b4331d0effc9185',
  '4ca1eb882d1701d0',
  '4f75ce0f984f9c96',
  '573597ddcdbad0ea',  // Harvestfest (stock)
  '5fdbcbae767e3274',  // Winterfest (stock)
  '74b25fa92b40c8fa',
  '760f343332177b83',
  '7e333e56f81bdbc7',
  '88999eefed6c77c3',
  '8dcffd18fd210c9a',
  '9b5dcbc90ecaf8f5',
  '9fd0fdbbfd974270',
  'a047e82c0a2fee31',
  'a0eb8d1de46726f5',
  'a59d99cf580ec687',
  'bb3827a0a274c16b',
  'c37f73b03e56739e',
  'cc54676df4bde6b9',
  'ce459c7dd879460d',
  'effe9bb8aa71a25e',
  'f6afd792402f9a4f',
];
