// Stock club icons ripped from The Sims 4. Each filename is the lowercase
// hex instance ID from the icon's ResourceKey (type 0x2f7d0004), so when we
// import clubs from a save we can use the ResourceKey directly as the lookup.
//
// To add a new icon: drop the file in public/club-icons/ named <instance>.png,
// then append the instance hex below.

// Fallback slug used when a save references an icon we don't have in the
// library (mods, unreleased packs, the real Renegades icon we can't locate, etc.).
// The file at /club-icons/unknown.png stays out of CLUB_ICONS so the picker
// doesn't surface it as a selectable option.
export const UNKNOWN_CLUB_ICON = 'unknown';
export const CLUB_ICONS: readonly string[] = [
  '0ff5bb78c1f6bf0d',
  '15c82093e1629afc',
  '16cc76e244a9bdb3',
  '16cc77e244a9bfe1',
  '16e093e244ba9843',
  '1ba9766e0614ab00',
  '1e76bce248b8a218',
  '37cd29e256e400f1',
  '37ef17e25700c838',
  '42aeb4d3ebe4aea7',
  '50d00e0aea68967e',  // Renegades — placeholder image (real icon not findable in S4S)
  '53f5664aeb2d11ff',
  '64a6c8656f7952d7',
  '690490a6b793e98a',
  '69623181f4cb976b',
  '81acebfe10b02003',
  '892939a4ed29664c',
  '90c1b94a76916b0c',
  '92f96b7ac5611ba4',
  'ada2e9658334f2ed',
  'afb71a92c83ab7a5',
  'c20ef004e275fe71',
  'c3d1606936a3b290',
  'c3ec7d6936baab9b',
  'f672f8522fdb35fc',
  'fbc3b4dd6767c0f0',
];
