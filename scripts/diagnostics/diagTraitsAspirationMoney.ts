/**
 * Validate the new traits + aspiration + money extraction on a real save.
 *
 * Usage:
 *   SAVE=Slot_10312032.save npx tsx scripts/diagnostics/diagTraitsAspirationMoney.ts
 *
 *   # Filter to a single sim (substring, case-insensitive) for in-game spot-check:
 *   SAVE=Slot_00000004.save SIM="Bella" npx tsx scripts/diagnostics/diagTraitsAspirationMoney.ts
 *
 * Outputs every human sim with their extracted fields. Look for:
 *   - traitIds: should have 3-5+ tuning IDs per adult human; 0 for pets is ok
 *   - aspirationId: should be present for most named humans (some NPCs have null)
 *   - money: should be plausible (typically thousands to millions of simoleons)
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;
const SIM_FILTER = (process.env.SIM ?? '').toLowerCase().trim();

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const saveData = parseSaveData(resources);

console.log(`\n=== ${SAVE} ===`);
console.log(`Total sims parsed: ${saveData.sims.length}\n`);

const humans = saveData.sims.filter((s) => s.species === 'human');
const pets = saveData.sims.filter((s) => s.species === 'pet');

if (SIM_FILTER) {
  const matches = humans.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(SIM_FILTER));
  console.log(`--- SIM filter: "${SIM_FILTER}" → ${matches.length} match${matches.length === 1 ? '' : 'es'} ---\n`);
  if (matches.length === 0) {
    console.log('No matches. Try a different substring (case-insensitive). Available names:');
    for (const s of humans.slice(0, 30)) {
      console.log(`  ${s.firstName} ${s.lastName}`);
    }
    if (humans.length > 30) console.log(`  … and ${humans.length - 30} more`);
  } else {
    for (const s of matches) {
      const hh = saveData.households.find((h) => h.id === s.householdId);
      console.log(`Sim:        ${s.firstName} ${s.lastName} (sim_id 0x${s.id.toString(16)})`);
      console.log(`Lifestage:  ${s.lifestage}`);
      console.log(`Gender:     ${s.gender}`);
      console.log(`Household:  ${hh ? `${hh.name} (funds §${hh.money?.toString() ?? '—'})` : '(unmatched)'}`);
      console.log(`Aspiration: ${s.aspirationId !== null ? '0x' + s.aspirationId.toString(16) : '(none)'}`);
      console.log(`Traits (${s.traitIds.length}):`);
      for (const t of s.traitIds) {
        console.log(`  0x${t.toString(16)}`);
      }
      console.log('');
    }
    console.log(`How to identify:`);
    console.log(`  1. Open The Sims 4 → load this save → go to manage households.`);
    console.log(`  2. Look up the sim's CAS-picked traits + aspiration in the game UI.`);
    console.log(`  3. For each hex above, search the EA tuning files:`);
    console.log(`     https://github.com/jolieschae/Phase-3-Sims-4-Game-Mod/tree/main/game/traits`);
    console.log(`     https://github.com/jolieschae/Phase-3-Sims-4-Game-Mod/tree/main/game/aspirations`);
    console.log(`     Each .xml file's filename is the trait/aspiration name; the "n" attribute`);
    console.log(`     at the top is the tuning instance ID in decimal — convert to hex to match.`);
  }
} else {
  console.log(`--- Humans (${humans.length}) ---`);
  for (const s of humans) {
    const name = `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`.padEnd(28);
    const traits = s.traitIds.length
      ? s.traitIds.slice(0, 5).map((t) => '0x' + t.toString(16)).join(' ') + (s.traitIds.length > 5 ? ' …' : '')
      : '(none)';
    const aspiration = s.aspirationId !== null ? '0x' + s.aspirationId.toString(16) : '(none)';
    console.log(`  ${name} | ${s.lifestage.padEnd(11)} | asp ${aspiration.padEnd(20)} | traits[${s.traitIds.length}]: ${traits}`);
  }
}

if (!SIM_FILTER) {
  console.log(`\n--- Pets (${pets.length}, sanity check — should have no aspiration/traits) ---`);
  for (const s of pets) {
    const name = `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`.padEnd(28);
    const status = `traits=${s.traitIds.length} asp=${s.aspirationId !== null ? 'YES' : 'no'}`;
    console.log(`  ${name} | ${s.petSubtype.padEnd(6)} | ${status}`);
  }

  console.log(`\n--- Household funds (top 10 by Simoleons) ---`);
  const richest = [...saveData.households].sort((a, b) => Number((b.money ?? 0n) - (a.money ?? 0n))).slice(0, 10);
  for (const h of richest) {
    const name = h.name.padEnd(36);
    const m = h.money !== null ? `§${h.money.toString()}` : '(none)';
    console.log(`  ${name} | ${m}`);
  }
  const withFunds = saveData.households.filter((h) => h.money !== null && h.money > 0n).length;
  console.log(`(${withFunds} / ${saveData.households.length} households have funds set)`);

  const traitCounts = new Map<string, number>();
  for (const s of saveData.sims) {
    for (const t of s.traitIds) {
      const k = '0x' + t.toString(16);
      traitCounts.set(k, (traitCounts.get(k) ?? 0) + 1);
    }
  }
  const sortedTraits = [...traitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n--- Trait ID frequency (top 30) ---`);
  for (const [hex, count] of sortedTraits.slice(0, 30)) {
    console.log(`  ${hex.padEnd(22)} × ${count}`);
  }
  console.log(`(${traitCounts.size} distinct trait IDs total)`);
}
