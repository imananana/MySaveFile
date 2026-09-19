/**
 * Smoke-test the randomizer: roll every preset, print sims, sanity-check counts.
 */
import {
  rollHousehold,
  rerollSim,
  rerollTraits,
  rerollSingleTrait,
  rerollAspiration,
  type PresetKey,
} from '../../src/lib/randomizer.js';
import { STOCK_TRAITS } from '../../src/data/stockTraits.js';
import { STOCK_ASPIRATIONS } from '../../src/data/stockAspirations.js';

const presets: PresetKey[] = [
  'solo',
  'couple',
  'sibling',
  'nuclear',
  'singleParent',
  'multiGen',
  'roommates',
  'emptyNesters',
];

function fmtTraits(ids: string[]): string {
  return ids.map((id) => STOCK_TRAITS[id]?.name ?? `?${id}`).join(', ');
}
function fmtAspiration(id: string | null): string {
  if (!id) return '—';
  return STOCK_ASPIRATIONS[id]?.name ?? `?${id}`;
}

for (const preset of presets) {
  const hh = rollHousehold({ preset, coupleType: 'random' });
  console.log(`\n=== ${preset} → ${hh.name} (resolved: ${hh.resolvedPreset}) ===`);
  for (const sim of hh.sims) {
    console.log(
      `  ${sim.firstName} ${sim.lastName} (${sim.gender}, ${sim.lifestage}) ` +
        `— traits: [${fmtTraits(sim.traitIds)}] | asp: ${fmtAspiration(sim.aspirationId)}`,
    );
  }
}

console.log('\n=== custom: 1 adult + 2 children, share surname ===');
const custom = rollHousehold({
  preset: 'custom',
  custom: { composition: { adult: 1, child: 2 }, shareSurname: true },
});
console.log(custom.name);
for (const sim of custom.sims) {
  console.log(`  ${sim.firstName} ${sim.lastName} (${sim.gender}, ${sim.lifestage})`);
}

console.log('\n=== surpriseMe x 5 ===');
for (let i = 0; i < 5; i++) {
  const s = rollHousehold({ preset: 'surpriseMe' });
  console.log(`  ${s.resolvedPreset.padEnd(14)} → ${s.name} (${s.sims.length} sims)`);
}

console.log('\n=== reroll tests on a nuclear family ===');
const hh = rollHousehold({ preset: 'nuclear', coupleType: 'mixed' });
const target = hh.sims[0];
console.log(
  `Original: ${target.firstName} ${target.lastName} — ${fmtTraits(target.traitIds)} | ${fmtAspiration(target.aspirationId)}`,
);
const r1 = rerollSim(target);
console.log(
  `rerollSim:        ${r1.firstName} ${r1.lastName} — ${fmtTraits(r1.traitIds)} | ${fmtAspiration(r1.aspirationId)}`,
);
const r2 = rerollTraits(target);
console.log(`rerollTraits:     ${fmtTraits(r2.traitIds)}`);
const r3 = rerollSingleTrait(target, 0);
console.log(`rerollSingleTrait[0]: ${fmtTraits(r3.traitIds)}`);
const r4 = rerollAspiration(target);
console.log(`rerollAspiration: ${fmtAspiration(r4.aspirationId)}`);

console.log('\n=== YA-only family kid lifestage cap (should be no teens across 50 rolls) ===');
const ages = new Set<string>();
for (let i = 0; i < 50; i++) {
  const fam = rollHousehold({ preset: 'nuclear' });
  // Force inspect: if both parents happen to be YA, kid ages should not include teen.
  const adults = fam.sims.filter((s) => s.lifestage === 'youngAdult' || s.lifestage === 'adult');
  const allYa = adults.length > 0 && adults.every((s) => s.lifestage === 'youngAdult');
  if (allYa) {
    for (const k of fam.sims.filter((s) => !['youngAdult', 'adult', 'elder'].includes(s.lifestage))) {
      ages.add(k.lifestage);
    }
  }
}
console.log(`  Kid ages observed in YA-only families: ${[...ages].sort().join(', ') || '(none observed)'}`);
console.log(`  ${ages.has('teen') ? 'FAIL — teen present' : 'PASS — no teens'}`);
