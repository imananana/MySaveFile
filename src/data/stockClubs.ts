// Default Get Together clubs whose names aren't stored in the save (the game
// pulls them from tuning at runtime). Keyed by club_seed ResourceKey instance
// hex (lowercase). Filled in empirically — add entries as players identify
// each stock club in-game by its icon.
//
// To find missing seeds for a save:
//   npx tsx scripts/diagnostics/diagClubsParsed.ts
// Each "(stock — no name)" entry prints its seed hex + icon.
export const STOCK_CLUB_NAMES: Record<string, string> = {
  '1e3ef': 'Power House',
  '1e3f0': 'Avant Gardes',
  '1e3f1': 'Paragons',
  '1e563': 'Upper Crusts',
  '1ecb9': 'Renegades',              // icon 50d00e0aea68967e not yet in club-icons library
  '1ecba': 'League of Adventurers',
  '1ecbb': 'Garden Gnomes',
  '1ecbc': 'Partihaus',
  '1ecbd': 'Spin Masters',
  '1ecbe': 'The Good Timers',
  '1f605': 'Knights of the Hedge',
};

export function resolveStockClubName(seed: string | null): string | null {
  if (!seed) return null;
  // Parser returns the ResourceKey instance as a zero-padded 16-char hex
  // (e.g. "000000000001ecbb"). Map keys are unpadded for readability — strip
  // leading zeros before lookup. Empty/all-zero seeds fall through to null.
  const normalized = seed.toLowerCase().replace(/^0+/, '');
  if (!normalized) return null;
  return STOCK_CLUB_NAMES[normalized] ?? null;
}
