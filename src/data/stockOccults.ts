/**
 * Occult criterion value (a trait id) → occult type. SEED-CONFIRMED: each value
 * was captured by setting that occult on a venue role and reading the bytes
 * (not derived from filenames — the criterion uses inconsistent trait variants,
 * e.g. Fairy=_AllAges, Spellcaster=Witch_Occult_Manifested, Ghost not in dump).
 * Hand-maintained; add new entries only from a confirmed seed.
 */
export const STOCK_OCCULTS: Record<string, string> = {
  '0x19181': 'Alien',
  '0x2590b': 'Vampire',
  '0x25a4f': 'Non-Occult',   // the "must not be an occult" option (trait_Occult_NoOccult)
  '0x30983': 'Mermaid',
  '0x34045': 'Spellcaster',  // internally "Witch" (trait_Occult_WitchOccult_Manifested)
  '0x46bf4': 'Werewolf',
  '0x5d1da': 'Ghost',
  '0x69c87': 'Fairy',
};
