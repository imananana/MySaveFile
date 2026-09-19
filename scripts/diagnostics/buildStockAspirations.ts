/**
 * Build the STOCK_ASPIRATIONS tuning-ID → display-name map from an S4 Studio
 * aspiration dump.
 *
 * Usage:
 *   EXPORT="$HOME/Documents/Aspirations" npx tsx scripts/diagnostics/buildStockAspirations.ts
 *
 * Walks every *.AspirationTrackTuning.xml file (the top-level "pick one"
 * aspirations like Party Animal / Soulmate / Nerd Brain — what SimData
 * primary_aspiration stores). Skips tutorial / challenge / generic categories
 * that aren't normal CAS picks.
 *
 * Lifestage gating comes from each track's <T n="category"> ref:
 *   - Asp_Cat_*       → teen, youngAdult, adult, elder
 *   - Asp_Teen        → teen
 *   - Asp_Chld_*      → child
 *   - everything else → skipped
 *
 * Filename pattern from S4S:
 *   C020FCAD!<group>!<instance_hex>.<track_name>.AspirationTrackTuning.xml
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const EXPORT_DIR = process.env.EXPORT || `${HOME}/Documents/Aspirations`;
const OUTPUT = process.env.OUTPUT || `${process.cwd()}/src/data/stockAspirations.ts`;

const allFiles = readdirSync(EXPORT_DIR);
const files = allFiles.filter((f) => f.endsWith('.AspirationTrackTuning.xml'));

// Pair each Track tuning with its SimData sibling by instance hex so we can
// pull the icon ResourceKey out of the SimData. Same approach as the trait
// builder — icons live in SimData, not in the tuning logic XML.
const simDataByInstance = new Map<string, string>();
for (const f of allFiles) {
  const m = f.match(/^545AC67A!([^!]+)!([0-9A-F]+)\.(.+)\.SimData\.xml$/i);
  if (m) simDataByInstance.set(m[2].toUpperCase(), f);
}

console.log(`Scanning ${files.length} AspirationTrackTuning files in ${EXPORT_DIR} (paired with ${simDataByInstance.size} SimData files)…\n`);

// Category-name → eligible lifestages. Anything not in this map is treated as
// "not a normal CAS pick" and dropped.
const CATEGORY_AGES: Record<string, string[]> = {
  Asp_Cat_Nature:      ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Knowledge:   ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Popularity:  ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Deviance:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Creativity:  ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Food:        ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Werewolf:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Location:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Love:        ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Family:      ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Fortune:     ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_StarWars:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Fairy:       ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Wellness:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Athletic:    ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Cat_Animal:      ['teen', 'youngAdult', 'adult', 'elder'],
  Asp_Teen:            ['teen'],
  Asp_Chld_cat_multiskill: ['child'],
  Asp_Chld_Cat_Social:     ['child'],
  Asp_Chld_Cat_Mental:     ['child'],
  Asp_Chld_Cat_Creativity: ['child'],
  Asp_Chld_Cat_Motor:      ['child'],
};

// Categories that exist but are not CAS-pickable aspirations.
const SKIP_CATEGORIES = new Set([
  'FTUECategory',          // first-time-user-experience tutorial intro
  'ChallengeCategory',     // challenge-mode tracks
  'challengeCategory_child',
  'General',
]);

interface Entry {
  instance: bigint;
  rawName: string;     // e.g. Track_Popularity_C
  displayName: string; // e.g. Party Animal
  description: string; // e.g. "This Sim wants to throw and attend amazing parties!"
  category: string;    // raw category slug (Asp_Cat_Popularity etc.)
  ages: string[];
  iconInstance: string | null; // lowercase hex of the icon texture's resource instance
}

const tracks: Entry[] = [];
const skipped: Array<{ rawName: string; reason: string }> = [];
const categoryCounts = new Map<string, number>();

for (const filename of files) {
  // Filename: C020FCAD!<group>!<instance_hex>.<track_name>.AspirationTrackTuning.xml
  const m = filename.match(/^C020FCAD!([^!]+)!([0-9A-F]+)\.(.+)\.AspirationTrackTuning\.xml$/i);
  if (!m) { skipped.push({ rawName: filename, reason: 'bad filename' }); continue; }
  const [, , instanceHex, rawName] = m;
  const instance = BigInt('0x' + instanceHex);

  const contents = readFileSync(join(EXPORT_DIR, filename), 'utf8');

  // category — EA stores it as <T n="category">N<!--Asp_Cat_X--></T>.
  const catMatch = contents.match(/<T n="category">[^<]*<!--([^>]*?)--><\/T>/);
  const category = catMatch ? catMatch[1].trim() : '(none)';
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

  if (SKIP_CATEGORIES.has(category)) {
    skipped.push({ rawName, reason: `skipped category: ${category}` });
    continue;
  }

  // is_hidden_unlockable=True means the aspiration is locked in CAS until the
  // player completes some gameplay prerequisite. Covers:
  //   - Grilled Cheese (eat enough grilled cheese)
  //   - Soul's Journey (post-death — Life & Death pack)
  //   - Discordant/Harmonious Fairy (after Fairy Stories Initiation)
  //   - Lone Wolf / Emissary / Wildfang / Cure Seeker (after Werewolf Initiation)
  //   - Paragon of Hope / Enforcer of Order (Star Wars faction unlocks)
  // Vampire/Spellcaster aspirations DON'T have this flag — they're immediately
  // CAS-pickable once the sim is the right occult, no further unlock needed.
  if (/<T n="is_hidden_unlockable">True<\/T>/.test(contents)) {
    skipped.push({ rawName, reason: 'is_hidden_unlockable (post-gameplay unlock)' });
    continue;
  }

  const ages = CATEGORY_AGES[category];
  if (!ages) {
    skipped.push({ rawName, reason: `unknown category: ${category}` });
    continue;
  }

  // display_text → in-game aspiration name.
  let displayName = '';
  const dtMatch = contents.match(/<T n="display_text">[^<]*<!--([^>]*?)--><\/T>/);
  if (dtMatch) displayName = dtMatch[1].trim();
  if (!displayName) {
    // Fallback: convert rawName Track_X_Y → "X Y"
    displayName = rawName.replace(/^Track_/, '').replace(/_/g, ' ');
  }

  // description_text → flavor text under the aspiration in CAS.
  let description = '';
  const descMatch = contents.match(/<T n="description_text">[^<]*<!--([^>]*?)--><\/T>/);
  if (descMatch) description = descMatch[1].trim();

  // Pull the icon's resource instance out of the paired SimData. Same hex
  // S4S shows in its icon viewer; becomes the filename users save the PNG as.
  let iconInstance: string | null = null;
  const simDataFile = simDataByInstance.get(instanceHex.toUpperCase());
  if (simDataFile) {
    const simData = readFileSync(join(EXPORT_DIR, simDataFile), 'utf8');
    const iconMatch = simData.match(/<T name="icon">([0-9A-Fa-f]+)-([0-9A-Fa-f]+)-([0-9A-Fa-f]+)<\/T>/);
    if (iconMatch) {
      const inst = iconMatch[3];
      if (!/^0+$/.test(inst)) iconInstance = inst.toLowerCase();
    }
  }

  tracks.push({ instance, rawName, displayName, description, category, ages, iconInstance });
}

tracks.sort((a, b) => a.displayName.localeCompare(b.displayName));

console.log('Category distribution (raw):');
for (const [k, v] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(28)} ${v}`);
}

console.log(`\n${tracks.length} aspiration tracks kept (${skipped.length} skipped)\n`);
for (const e of tracks) {
  console.log(`  0x${e.instance.toString(16).padStart(6, '0')} → ${e.displayName.padEnd(28)} [${e.ages.join(',')}]`);
}

const byAge = new Map<string, number>();
for (const e of tracks) {
  for (const a of e.ages) byAge.set(a, (byAge.get(a) ?? 0) + 1);
}
console.log(`\nAspiration count by lifestage:`);
for (const a of ['child', 'teen', 'youngAdult', 'adult', 'elder']) {
  console.log(`  ${a.padEnd(11)} ${byAge.get(a) ?? 0}`);
}

if (skipped.length) {
  console.log(`\nSkipped (${skipped.length}):`);
  for (const s of skipped.slice(0, 10)) console.log(`  ${s.rawName.padEnd(48)} — ${s.reason}`);
  if (skipped.length > 10) console.log(`  … and ${skipped.length - 10} more`);
}

// Emit the TS module
const lines: string[] = [
  '/**',
  ' * CAS-pickable aspiration catalog: tuning ID → display name + the',
  ' * lifestages eligible to CAS-pick it.',
  ' *',
  ' * Generated from an S4 Studio AspirationTrackTuning dump. Lifestage gating',
  " * comes from each track's <T n=\"category\"> ref (Asp_Cat_* → teen+adult,",
  ' * Asp_Teen → teen-only, Asp_Chld_* → child-only). Tutorial and challenge',
  ` * categories are filtered out. ${tracks.length} entries.`,
  ' *',
  ' * Re-run scripts/diagnostics/buildStockAspirations.ts after a new game/',
  ' * pack release to refresh this catalog.',
  ' */',
  "import type { ParsedLifestage } from '../lib/parser/types';",
  '',
  'export interface StockAspiration {',
  '  name: string;',
  '  description: string;',
  '  ages: ParsedLifestage[];',
  '  iconInstance: string | null; // resource instance hex of the icon texture, used as the filename in /aspiration-icons/<hex>.png',
  '}',
  '',
  'export const STOCK_ASPIRATIONS: Record<string, StockAspiration> = {',
];
for (const e of tracks) {
  const key = '0x' + e.instance.toString(16);
  const agesArr = '[' + e.ages.map((a) => `'${a}'`).join(', ') + ']';
  const iconField = e.iconInstance ? `'${e.iconInstance}'` : 'null';
  lines.push(`  '${key}': { name: ${JSON.stringify(e.displayName)}, description: ${JSON.stringify(e.description)}, ages: ${agesArr}, iconInstance: ${iconField} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Look up an aspiration by its raw bigint tuning ID. Returns null if not in the catalog. */');
lines.push('export function lookupAspiration(id: bigint): StockAspiration | null {');
lines.push("  return STOCK_ASPIRATIONS['0x' + id.toString(16)] ?? null;");
lines.push('}');
lines.push('');
lines.push('/** Convenience: just the display name. */');
lines.push('export function lookupAspirationName(id: bigint): string | null {');
lines.push('  return lookupAspiration(id)?.name ?? null;');
lines.push('}');
lines.push('');
lines.push('/** Every CAS aspiration that can be picked at the given lifestage. */');
lines.push('export function aspirationsForLifestage(lifestage: ParsedLifestage): Array<{ id: string; name: string }> {');
lines.push('  const out: Array<{ id: string; name: string }> = [];');
lines.push('  for (const [id, t] of Object.entries(STOCK_ASPIRATIONS)) {');
lines.push('    if (t.ages.includes(lifestage)) out.push({ id, name: t.name });');
lines.push('  }');
lines.push('  return out.sort((a, b) => a.name.localeCompare(b.name));');
lines.push('}');
lines.push('');
lines.push('/** /aspiration-icons/<idHex>.png for an aspiration tuning id, or null if the');
lines.push(' *  catalog has no icon. Files are named by id (matching skills/careers); the');
lines.push(' *  iconInstance field is the has-icon flag + exact ResourceKey provenance. */');
lines.push('export function aspirationIconUrlById(id: string | null | undefined): string | null {');
lines.push('  if (!id) return null;');
lines.push('  return STOCK_ASPIRATIONS[id.toLowerCase()]?.iconInstance ? `/aspiration-icons/${id.replace(/^0x/, \'\').toLowerCase()}.png` : null;');
lines.push('}');
lines.push('');

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`\nWrote ${OUTPUT}`);
