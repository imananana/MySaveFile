/**
 * Build the STOCK_TRAITS tuning-ID → display-name map from an S4 Studio
 * trait export dump.
 *
 * Usage:
 *   EXPORT="$HOME/Documents/Trait Export" npx tsx scripts/diagnostics/buildStockTraits.ts
 *
 * Filters to <E n="trait_type">PERSONALITY</E> only — that's the universe of
 * CAS-pickable personality traits across base game + every pack.
 *
 * Filename pattern from S4S: `CB5FDDC7!<group>!<instance_hex>.<trait_name>.TraitTuning.xml`
 * The instance hex is the 64-bit tuning ID; trait_name is e.g. trait_Cheerful.
 *
 * Output is a TypeScript file under src/data/stockTraits.ts ready to import.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const EXPORT_DIR = process.env.EXPORT || `${HOME}/Documents/Traits`;
const OUTPUT = process.env.OUTPUT || `${process.cwd()}/src/data/stockTraits.ts`;

const allFiles = readdirSync(EXPORT_DIR);
const files = allFiles.filter((f) => f.endsWith('.TraitTuning.xml'));

// Index the SimData siblings by tuning instance so we can pair each trait's
// gameplay tuning (CB5FDDC7) with its metadata SimData (545AC67A) and read
// the icon ResourceKey from the SimData side. The two files share the same
// instance hex in their filename.
const simDataByInstance = new Map<string, string>();
for (const f of allFiles) {
  const m = f.match(/^545AC67A!([^!]+)!([0-9A-F]+)\.(.+)\.SimData\.xml$/i);
  if (m) simDataByInstance.set(m[2].toUpperCase(), f);
}

console.log(`Scanning ${files.length} TraitTuning files in ${EXPORT_DIR} (paired with ${simDataByInstance.size} SimData files)…\n`);

// EA's <E> values in <L n="ages"> map 1:1 to ParsedLifestage. Keep this list
// in sync with the union in src/lib/parser/types.ts.
const AGE_VALUES = ['INFANT', 'TODDLER', 'CHILD', 'TEEN', 'YOUNGADULT', 'ADULT', 'ELDER'] as const;
type AgeValue = typeof AGE_VALUES[number];
const AGE_TO_LIFESTAGE: Record<AgeValue, string> = {
  INFANT: 'infant',
  TODDLER: 'toddler',
  CHILD: 'child',
  TEEN: 'teen',
  YOUNGADULT: 'youngAdult',
  ADULT: 'adult',
  ELDER: 'elder',
};

interface Entry {
  instance: bigint;
  rawName: string;     // e.g. trait_Cheerful
  displayName: string; // e.g. Cheerful
  ages: string[];      // ParsedLifestage values eligible to CAS-pick this trait
  iconInstance: string | null; // lowercase hex of the icon texture's resource instance, or null if the trait has no icon
}

const personality: Entry[] = [];
const byType = new Map<string, number>();
const skipped: string[] = [];

for (const filename of files) {
  // Filename: CB5FDDC7!<group>!<instance_hex>.<trait_name>.TraitTuning.xml
  const match = filename.match(/^CB5FDDC7!([^!]+)!([0-9A-F]+)\.(.+)\.TraitTuning\.xml$/i);
  if (!match) { skipped.push(`bad filename: ${filename}`); continue; }
  const [, , instanceHex, rawName] = match;
  const instance = BigInt('0x' + instanceHex);

  // Read the XML. Filter to PERSONALITY type; extract EA's localized display
  // name from the XML comment in <T n="display_name">0xHASH<!--Real Name--></T>.
  // S4S embeds the actual in-game string for every loc-hash, which is what we
  // want over a regex-mangled tuning name.
  const contents = readFileSync(join(EXPORT_DIR, filename), 'utf8');
  const typeMatch = contents.match(/<E n="trait_type">([^<]+)<\/E>/);
  const traitType = typeMatch ? typeMatch[1].trim() : '(none)';
  byType.set(traitType, (byType.get(traitType) ?? 0) + 1);
  if (traitType !== 'PERSONALITY') continue;

  // Skip pet-species default traits. EA labels these as PERSONALITY but they
  // are always-on hidden defaults applied to all pets of a species (foxes,
  // raccoons, etc.) — not CAS-pickable on humans. Pattern: `*_Default` in the
  // tuning name, and/or <ages> covers every lifestage including infant+toddler
  // which no human personality trait does. We filter by name pattern since
  // it's the safer of the two heuristics.
  if (/_Default$/i.test(rawName)) {
    skipped.push(`pet-species default: ${rawName}`);
    continue;
  }

  // Pick the gender-neutral display name when present (EA started splitting
  // these out for gender-inclusive traits in recent packs); otherwise fall
  // back to plain display_name.
  let display: string | null = null;
  const neutralMatch = contents.match(/<T n="display_name_gender_neutral">[^<]*<!--([^>]*?)--><\/T>/);
  if (neutralMatch) display = neutralMatch[1].trim();
  if (!display) {
    const nameMatch = contents.match(/<T n="display_name">[^<]*<!--([^>]*?)--><\/T>/);
    if (nameMatch) display = nameMatch[1].trim();
  }
  // Last-ditch: regex-mangle the filename. Shouldn't trigger for any current
  // pack but keeps the script robust against future XML schema changes.
  if (!display) {
    display = rawName.replace(/^[Tt]rait_/, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .trim();
  }

  // Extract <L n="ages"> block — every <E>VALUE</E> child is one eligible
  // lifestage. Absent block means all-ages (treat as adult-ish default).
  const ages: string[] = [];
  const agesBlock = contents.match(/<L n="ages">([\s\S]*?)<\/L>/);
  if (agesBlock) {
    for (const m of agesBlock[1].matchAll(/<E>([A-Z_]+)<\/E>/g)) {
      const v = m[1] as AgeValue;
      const ls = AGE_TO_LIFESTAGE[v];
      if (ls) ages.push(ls);
    }
  }
  if (ages.length === 0) {
    ages.push('youngAdult', 'adult', 'elder');
  }

  // Locate the matching SimData and pull the icon ResourceKey out. The icon
  // field is stored as "TYPE-GROUP-INSTANCE" in S4S SimData XML; the instance
  // is what we want — that's the hex S4S also shows in its icon viewer and
  // the filename users will export icons to.
  let iconInstance: string | null = null;
  const simDataFile = simDataByInstance.get(instanceHex.toUpperCase());
  if (simDataFile) {
    const simData = readFileSync(join(EXPORT_DIR, simDataFile), 'utf8');
    const iconMatch = simData.match(/<T name="icon">([0-9A-Fa-f]+)-([0-9A-Fa-f]+)-([0-9A-Fa-f]+)<\/T>/);
    if (iconMatch) {
      const inst = iconMatch[3];
      // EA writes 0000…0000 when there's no icon assigned. Treat that as null.
      if (!/^0+$/.test(inst)) iconInstance = inst.toLowerCase();
    }
  }

  personality.push({ instance, rawName, displayName: display, ages, iconInstance });
}

personality.sort((a, b) => a.displayName.localeCompare(b.displayName));

console.log('trait_type distribution:');
for (const [k, v] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(24)} ${v}`);
}
console.log(`\n${personality.length} PERSONALITY traits → STOCK_TRAITS map\n`);
for (const e of personality) {
  console.log(`  0x${e.instance.toString(16).padStart(6, '0')} → ${e.displayName.padEnd(28)} [${e.ages.join(',')}]`);
}

const byAge = new Map<string, number>();
for (const e of personality) {
  for (const a of e.ages) byAge.set(a, (byAge.get(a) ?? 0) + 1);
}
console.log(`\nTrait count by lifestage:`);
for (const a of ['infant', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder']) {
  console.log(`  ${a.padEnd(11)} ${byAge.get(a) ?? 0}`);
}

// Emit the TS module
const lines: string[] = [
  '/**',
  ' * CAS-pickable personality trait catalog: tuning ID → display name + the',
  ' * lifestages eligible to CAS-pick it.',
  ' *',
  ' * Generated from an S4 Studio trait dump filtered to',
  ` * <E n="trait_type">PERSONALITY</E>. ${personality.length} entries.`,
  ' *',
  ' * Lifestage gating comes from each trait XML\'s <L n="ages"> block —',
  ' * infants and toddlers have their own picks, children share some with',
  ' * teens/adults, elders inherit adult traits + Wise, etc. Re-run',
  ' * scripts/diagnostics/buildStockTraits.ts after a new game/pack release',
  ' * to refresh this catalog.',
  ' */',
  "import type { ParsedLifestage } from '../lib/parser/types';",
  '',
  'export interface StockTrait {',
  '  name: string;',
  '  ages: ParsedLifestage[]; // empty array means all lifestages (legacy fallback)',
  '  iconInstance: string | null; // resource instance hex of the icon texture, used as the filename in /trait-icons/<hex>.png',
  '}',
  '',
  'export const STOCK_TRAITS: Record<string, StockTrait> = {',
];
for (const e of personality) {
  const key = '0x' + e.instance.toString(16);
  const agesArr = '[' + e.ages.map((a) => `'${a}'`).join(', ') + ']';
  const iconField = e.iconInstance ? `'${e.iconInstance}'` : 'null';
  lines.push(`  '${key}': { name: ${JSON.stringify(e.displayName)}, ages: ${agesArr}, iconInstance: ${iconField} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Look up a trait by its raw bigint tuning ID. Returns null if not in the CAS personality catalog. */');
lines.push('export function lookupTrait(id: bigint): StockTrait | null {');
lines.push("  return STOCK_TRAITS['0x' + id.toString(16)] ?? null;");
lines.push('}');
lines.push('');
lines.push('/** Convenience: just the display name. */');
lines.push('export function lookupTraitName(id: bigint): string | null {');
lines.push('  return lookupTrait(id)?.name ?? null;');
lines.push('}');
lines.push('');
lines.push('/** Every CAS personality trait that can be picked at the given lifestage. */');
lines.push('export function traitsForLifestage(lifestage: ParsedLifestage): Array<{ id: string; name: string }> {');
lines.push('  const out: Array<{ id: string; name: string }> = [];');
lines.push('  for (const [id, t] of Object.entries(STOCK_TRAITS)) {');
lines.push('    if (t.ages.includes(lifestage)) out.push({ id, name: t.name });');
lines.push('  }');
lines.push('  return out.sort((a, b) => a.name.localeCompare(b.name));');
lines.push('}');
lines.push('');
lines.push('/** /trait-icons/<idHex>.png for a CAS trait tuning id, or null if the catalog');
lines.push(' *  has no icon for it. Files are named by id (matching skills/careers); the');
lines.push(' *  iconInstance field is the has-icon flag + exact ResourceKey provenance. */');
lines.push('export function traitIconUrlById(id: string | null | undefined): string | null {');
lines.push('  if (!id) return null;');
lines.push('  return STOCK_TRAITS[id.toLowerCase()]?.iconInstance ? `/trait-icons/${id.replace(/^0x/, \'\').toLowerCase()}.png` : null;');
lines.push('}');
lines.push('');

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`\nWrote ${OUTPUT}`);
