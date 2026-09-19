/**
 * Build the STOCK_NAMES catalog from EA's SimSpawner Tuning XML.
 *
 * The Sims 4's sim_spawner.Tuning.xml ships one name pool per supported game
 * language. The ENGLISH pool is the curated *diverse-global* pool that the
 * English-locale game actually pulls from when generating townies — it
 * contains Anglo, Indian, Japanese, Slavic, Hispanic, etc. names by design.
 * (Other language blocks are native to their locale; we ignore them.)
 *
 * Usage:
 *   EXPORT="$HOME/Documents/Sim Names" npx tsx scripts/diagnostics/buildStockNames.ts
 *
 * Walks the ENGLISH <U> block inside <L n="RANDOM_NAME_TUNING">, pulls
 * female_first_names / male_first_names / last_names, and writes them to
 * src/data/stockNames.ts.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const EXPORT_DIR = process.env.EXPORT || `${HOME}/Documents/Sim Names`;
const OUTPUT = process.env.OUTPUT || `${process.cwd()}/src/data/stockNames.ts`;

const tuningFile = readdirSync(EXPORT_DIR).find(
  (f) => f.endsWith('.Tuning.xml') && f.includes('sim_spawner'),
);
if (!tuningFile) {
  console.error(`No sim_spawner Tuning.xml in ${EXPORT_DIR}`);
  process.exit(1);
}
console.log(`Reading ${tuningFile}…`);

const text = readFileSync(join(EXPORT_DIR, tuningFile), 'utf8');

// Find the start of the ENGLISH block inside RANDOM_NAME_TUNING. The block
// starts at <E n="language">ENGLISH</E> (8 spaces of indentation — the deeper
// matches at 12 spaces are inside the locale-mapping list, which we don't want)
// and ends at the next sibling <U> opener or the closing </L> of
// RANDOM_NAME_TUNING.
const lines = text.split('\n');

// First find the RANDOM_NAME_TUNING list opener — there's an earlier ENGLISH
// match inside LOCALE_MAPPING that we need to skip past.
let randomTuningStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<L n="RANDOM_NAME_TUNING">')) {
    randomTuningStart = i;
    break;
  }
}
if (randomTuningStart === -1) {
  console.error('Could not locate <L n="RANDOM_NAME_TUNING">.');
  process.exit(1);
}

let englishStart = -1;
for (let i = randomTuningStart; i < lines.length; i++) {
  if (lines[i].includes('<E n="language">ENGLISH</E>')) {
    englishStart = i;
    break;
  }
}
if (englishStart === -1) {
  console.error('Could not locate ENGLISH block in RANDOM_NAME_TUNING.');
  process.exit(1);
}

// Find the end of this language's block — the next top-level <U> sibling.
// Each language block is wrapped in <U> ... </U> at 6-space indentation.
let englishEnd = lines.length;
for (let i = englishStart + 1; i < lines.length; i++) {
  if (lines[i] === '      </U>') {
    englishEnd = i;
    break;
  }
}

const block = lines.slice(englishStart, englishEnd).join('\n');
console.log(
  `ENGLISH block spans lines ${englishStart + 1}–${englishEnd + 1} (${
    englishEnd - englishStart
  } lines).`,
);

function extractList(label: string): string[] {
  const open = `<L n="${label}">`;
  const close = '</L>';
  const start = block.indexOf(open);
  if (start === -1) return [];
  const end = block.indexOf(close, start);
  const slice = block.slice(start + open.length, end);
  const names: string[] = [];
  const re = /<T>([^<]+)<\/T>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const name = m[1].trim();
    if (name) names.push(name);
  }
  return names;
}

const femaleFirst = extractList('female_first_names');
const maleFirst = extractList('male_first_names');
const last = extractList('last_names');

console.log(`Female first names: ${femaleFirst.length}`);
console.log(`Male first names:   ${maleFirst.length}`);
console.log(`Last names:         ${last.length}`);

// De-duplicate (EA's data does have a few dupes) and sort for deterministic
// output across re-runs.
function clean(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

const female = clean(femaleFirst);
const male = clean(maleFirst);
const surnames = clean(last);

console.log(`\nAfter dedupe:`);
console.log(`  female: ${female.length}`);
console.log(`  male:   ${male.length}`);
console.log(`  last:   ${surnames.length}`);

// Sample a few from each so we can eyeball that diversity looks right.
console.log(`\nSample female firsts: ${female.slice(0, 8).join(', ')}…`);
console.log(`Sample male firsts:   ${male.slice(0, 8).join(', ')}…`);
console.log(`Sample last names:    ${surnames.slice(0, 8).join(', ')}…`);

function emitArray(name: string, values: string[]): string {
  const lines = [`export const ${name}: readonly string[] = [`];
  for (const v of values) lines.push(`  ${JSON.stringify(v)},`);
  lines.push('];');
  return lines.join('\n');
}

const out = [
  '/**',
  ' * Stock English name pool harvested from The Sims 4 SimSpawner tuning.',
  ' *',
  ' * The ENGLISH pool is EA\'s curated diverse-global name list — it intentionally',
  ' * mixes Anglo, South Asian, East Asian, Slavic, Hispanic, Arabic, etc. names',
  ' * so an English-locale game generates a varied townie population. We use this',
  ' * pool verbatim for the household randomizer.',
  ' *',
  ` * Generated by scripts/diagnostics/buildStockNames.ts.`,
  ` * Counts: ${female.length} female firsts / ${male.length} male firsts / ${surnames.length} last names.`,
  ' */',
  '',
  emitArray('FEMALE_FIRST_NAMES', female),
  '',
  emitArray('MALE_FIRST_NAMES', male),
  '',
  emitArray('LAST_NAMES', surnames),
  '',
].join('\n');

writeFileSync(OUTPUT, out);
console.log(`\nWrote ${OUTPUT}`);
