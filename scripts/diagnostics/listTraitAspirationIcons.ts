/**
 * Print every trait + aspiration as a checklist with the icon's resource
 * instance hex — exactly what S4S shows in its icon viewer, and the
 * filename the app expects.
 *
 * Filenames the app expects:
 *   public/trait-icons/<iconInstance>.png
 *   public/aspiration-icons/<iconInstance>.png
 *
 * Usage:
 *   npx tsx scripts/diagnostics/listTraitAspirationIcons.ts > docs/icon-checklist.md
 */
import { STOCK_TRAITS } from '../../src/data/stockTraits.js';
import { STOCK_ASPIRATIONS } from '../../src/data/stockAspirations.js';

// Collapse EA's gendered template syntax (e.g. "{F0.Lady}{M0.Lord} of the Knits")
// into "Lady/Lord of the Knits" so the checklist reads cleanly. The runtime
// resolver in src/lib/genderedText.ts picks one variant per sim at display
// time; here we just need a human-friendly label.
function cleanGendered(text: string): string {
  return text.replace(/\{F\d+\.([^}]+)\}\{M\d+\.([^}]+)\}/g, '$1/$2');
}

const traits = Object.entries(STOCK_TRAITS)
  .map(([id, t]) => ({ id, name: cleanGendered(t.name), ages: t.ages, iconInstance: t.iconInstance }))
  .sort((a, b) => a.name.localeCompare(b.name));

// STOCK_ASPIRATIONS may not have iconInstance yet (waiting on the aspiration
// re-dump). Read it defensively so this script works in both states.
const aspirations = Object.entries(STOCK_ASPIRATIONS)
  .map(([id, a]) => ({
    id,
    name: cleanGendered(a.name),
    ages: a.ages,
    iconInstance: a.iconInstance ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const traitsWithIcon = traits.filter((t) => t.iconInstance).length;
const aspirationsWithIcon = aspirations.filter((a) => a.iconInstance).length;

console.log(`# Icon checklist`);
console.log();
console.log(`The **Filename** column shows the icon's resource instance hex — this is the same hex S4S displays when you open a trait or aspiration in its icon viewer. Save each PNG with that exact filename.`);
console.log();
console.log(`Drop PNGs into \`public/trait-icons/<filename>\` and \`public/aspiration-icons/<filename>\`. The app picks them up automatically and falls back to text chips for any that are missing or for entries where iconInstance is null (no in-game icon assigned).`);
console.log();
console.log(`Counts: ${traits.length} traits (${traitsWithIcon} with icon refs), ${aspirations.length} aspirations (${aspirationsWithIcon} with icon refs).`);
console.log();
console.log(`## Traits (${traits.length})`);
console.log();
console.log(`| Filename | Name | Eligible lifestages |`);
console.log(`|---|---|---|`);
for (const t of traits) {
  const fn = t.iconInstance ? `\`${t.iconInstance}.png\`` : '_(no icon)_';
  console.log(`| ${fn} | ${t.name} | ${t.ages.join(', ')} |`);
}
console.log();
console.log(`## Aspirations (${aspirations.length})`);
console.log();
console.log(`| Filename | Name | Eligible lifestages |`);
console.log(`|---|---|---|`);
for (const a of aspirations) {
  const fn = a.iconInstance ? `\`${a.iconInstance}.png\`` : '_(no icon)_';
  console.log(`| ${fn} | ${a.name} | ${a.ages.join(', ')} |`);
}
