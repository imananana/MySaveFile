/**
 * READ-ONLY: isolate the CAUSE-OF-DEATH as a death-specific ghost TRAIT, using
 * the parser's already-extracted traitIds. Each of the 31 labeled ghosts has a
 * distinct cause → each should carry a unique death trait that (a) no living sim
 * has and (b) no other-cause ghost has. Cross-confirm with the Cowplant pair:
 * McElroy (this save) ∩ Samuel Goth (other save) should leave exactly the
 * Cowplant death trait.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/deathTrait.ts
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const SAVE = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const OTHER = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
const load = (p: string) => parseSaveData(parseDbpf((() => { const f = readFileSync(p); return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength); })()));

const data = load(SAVE);
const LABELS: [string, string][] = [
  ['Spence','Consumed by the Mother'],['Altman','Anger'],['Dobbs','Beetles'],['Hamilton','Murphy Bed'],
  ['Lujan','Flies'],['Richter','Broken Heart'],['McElroy','Cowplant'],['Owens','Cuckoo Malfunction'],
  ['Kumar','Drowning'],['Kaur','Electrocution'],['Hale','Embarrassment'],['Ricks','Falling'],
  ['Lyon','Fire'],['Curry','Freezing'],['Gruber','Hunger'],['Sawyer','Killer Chicken'],
  ['Larue','Killer Rabbit'],['Willis','Laughter'],['Olivas','Lightning'],['Miotke','Meteorite'],
  ['Bolton','Mold'],['Osborn','Murder of Crows'],['John','Overexertion'],['Acosta','Overheating'],
  ['Kellogg','Poison'],['Chen','Pufferfish'],['Covington','Rabid Rodent Fever'],['McConnell','Steam'],
  ['Liu','Stink Capsule'],['Whitten','Urban Myth'],['McGhee','Vending Machine'],
];

const ghosts = LABELS.map(([last, cause]) => {
  const s = data.sims.find((x) => x.lastName.toLowerCase() === last.toLowerCase());
  return { last, cause, traits: new Set((s?.traitIds ?? []).map(String)), found: !!s };
});
ghosts.filter((g) => !g.found).forEach((g) => console.log(`  ! missing surname ${g.last}`));

// living controls: union of traits across many living sims (background/CAS traits to subtract)
const livingUnion = new Set<string>();
for (const s of data.sims.filter((x) => !x.isGhost).slice(0, 40)) for (const t of s.traitIds) livingUnion.add(String(t));

// how many ghosts carry each trait
const ghostTraitCount = new Map<string, number>();
for (const g of ghosts) for (const t of g.traits) ghostTraitCount.set(t, (ghostTraitCount.get(t) ?? 0) + 1);

// candidate death trait per cause: in this ghost, NOT in any living sim, and in few ghosts (ideally 1)
console.log(`\n── per-cause unique trait candidates (not in living, rare among ghosts) ──`);
const causeTrait = new Map<string, string>();
for (const g of ghosts) {
  const cands = [...g.traits].filter((t) => !livingUnion.has(t) && (ghostTraitCount.get(t) ?? 0) <= 2);
  // prefer the rarest
  cands.sort((a, b) => (ghostTraitCount.get(a)! - ghostTraitCount.get(b)!));
  const best = cands[0];
  if (best) causeTrait.set(g.cause, best);
  console.log(`  ${g.cause.padEnd(24)} ${cands.length ? cands.map((c) => `0x${BigInt(c).toString(16)}(${ghostTraitCount.get(c)})`).join(' ') : '(none)'}`);
}

// ── cross-save Cowplant confirmation ──
try {
  const odata = load(OTHER);
  const samuel = odata.sims.find((s) => s.firstName === 'Samuel' && s.lastName === 'Goth');
  const samuelTraits = new Set((samuel?.traitIds ?? []).map(String));
  const mcelroy = ghosts.find((g) => g.last === 'McElroy')!;
  const inter = [...mcelroy.traits].filter((t) => samuelTraits.has(t) && !livingUnion.has(t));
  console.log(`\n── Cowplant cross-save test (McElroy ∩ Samuel Goth, minus living) ──`);
  console.log(`  shared death-ish traits: ${inter.map((t) => `0x${BigInt(t).toString(16)}`).join(', ') || '(none — trait may not carry across saves / not in traitIds)'}`);
  console.log(`  McElroy chosen cowplant trait: ${causeTrait.get('Cowplant') ? '0x' + BigInt(causeTrait.get('Cowplant')!).toString(16) : '(none)'}`);
} catch (e) { console.log(`  (cowplant cross-check skipped: ${(e as Error).message})`); }

// collisions check
const inv = new Map<string, string[]>();
for (const [cause, t] of causeTrait) { if (!inv.has(t)) inv.set(t, []); inv.get(t)!.push(cause); }
const coll = [...inv].filter(([, cs]) => cs.length > 1);
console.log(`\n  distinct death traits: ${inv.size}/${causeTrait.size} causes` + (coll.length ? `  ⚠ collisions: ${coll.map(([t, cs]) => `0x${BigInt(t).toString(16)}→{${cs.join(',')}}`).join(' ; ')}` : '  ✓ all unique'));
