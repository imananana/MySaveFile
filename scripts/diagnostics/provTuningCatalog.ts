// COMPREHENSIVE read of EVERY ~/Documents/Sim Template/*.SimTemplateTuning.xml file.
// Survey-first (no laziness): report every template CLASS (root c=) and every name
// MECHANISM (last_name variant types + first_name + household name), then build the
// full sim + household premade roster. Goal: authoritative catalog from the only
// unedited source of truth (the tunings), covering ALL types not one prefix/field.
import { readFileSync, readdirSync } from 'fs';

const DIR = `${process.env.HOME}/Documents/Sim Template`;
const files = readdirSync(DIR).filter(f => f.endsWith('.SimTemplateTuning.xml'));
console.log(`Reading ${files.length} SimTemplateTuning files...\n`);

const classHist = new Map<string, number>();
const lastNameMech = new Map<string, number>();   // the t="..." on <V n="last_name">
const otherNameTags = new Map<string, number>();   // any n=... that looks name-ish
const surnames = new Set<string>();                // every resolvable surname label
const firstNames = new Set<string>();
const simRoster: { file: string; first: string; last: string; mech: string }[] = [];
const householdRoster: { name: string; members: number }[] = [];
let simTemplates = 0, householdTemplates = 0, noLastName = 0;

for (const f of files) {
  const xml = readFileSync(`${DIR}/${f}`, 'utf8');
  const cls = xml.match(/<I\b[^>]*\bc="([^"]+)"/)?.[1] ?? '(none)';
  classHist.set(cls, (classHist.get(cls) ?? 0) + 1);

  // household template?
  if (/PremadeHouseholdTemplate|premade_household_template/.test(xml) || /HouseholdTemplate|HH_Template/i.test(f)) {
    householdTemplates++;
    const name = xml.match(/<I\b[^>]*\bn="([^"]+)"/)?.[1] ?? f;
    const members = (xml.match(/n="sim_template"/g) ?? []).length;
    householdRoster.push({ name, members });
    continue;
  }

  // sim template: collect name fields
  const first = xml.match(/<T n="first_name">0x[0-9A-Fa-f]+<!--([^>]*)-->/)?.[1]?.trim();
  // last_name is a variant <V n="last_name" t="MECH"> ... </V>
  const vMatch = xml.match(/<V n="last_name" t="([^"]+)"/);
  const mech = vMatch?.[1] ?? (/<[TV] n="last_name"/.test(xml) ? '(other)' : '(none)');
  if (vMatch) lastNameMech.set(mech, (lastNameMech.get(mech) ?? 0) + 1);
  // specify_last_name label (fixed surname)
  const specify = xml.match(/<T n="specify_last_name">0x[0-9A-Fa-f]+<!--([^>]*)-->/)?.[1]?.trim();
  // random_last_name: a list of options (these are GENERIC townies, not fixed premades)
  if (/<T n="first_name"/.test(xml) || specify) simTemplates++;
  if (first) firstNames.add(first);
  if (specify) { surnames.add(specify); simRoster.push({ file: f, first: first ?? '', last: specify, mech }); }
  else if (mech !== '(none)') { noLastName++; }

  // any other name-ish n= attributes we might be missing
  for (const m of xml.matchAll(/n="([a-z_]*name[a-z_]*)"/gi)) otherNameTags.set(m[1], (otherNameTags.get(m[1]) ?? 0) + 1);
}

console.log('=== template CLASSES (root c=) ===');
for (const [c, n] of [...classHist].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
console.log('\n=== last_name MECHANISMS (t= on <V n="last_name">) ===');
for (const [m, n] of [...lastNameMech].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${m}`);
console.log('\n=== all name-ish field tags seen ===');
for (const [t, n] of [...otherNameTags].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${t}`);
console.log(`\n=== ROSTER ===`);
console.log(`  sim templates with a name: ${simTemplates}   household templates: ${householdTemplates}`);
console.log(`  FIXED surnames (specify_last_name): ${surnames.size}   first names: ${firstNames.size}`);
console.log(`  sim templates w/ last_name mech but NO fixed surname (random/generic townie): ${noLastName}`);
console.log(`\n  Pancakes/Caliente/Lothario/Goth present in fixed-surname set?`);
for (const s of ['Pancakes', 'Caliente', 'Lothario', 'Goth', 'Vatore', 'Bjergsen']) console.log(`    ${s}: ${surnames.has(s) ? 'YES' : 'NO'}`);
console.log(`\n  household roster sample (${householdRoster.length} total):`);
for (const h of householdRoster.slice(0, 20)) console.log(`    ${h.name}  (${h.members} members)`);
