/**
 * Which packs can auto-detection ever reach?
 *
 * detectPacks.ts infers ownership from six signal classes. A pack that no
 * signal class can produce is undetectable by construction — owning it and
 * syncing every save you have will never light it up, so the only way to get
 * it is the manual On switch on Pack Settings. That's a fact the product sheet
 * has to state, and it's exactly the kind of count that goes wrong by hand.
 *
 * Run:  npx tsx scripts/diagnostics/packDetectability.ts
 */
import { PACKS, RELEASE_TO_PACK } from '../../src/data/packs';
import { TRAIT_TO_PACK, ASPIRATION_TO_PACK, CAREER_TO_PACK, OCCULT_TO_PACK } from '../../src/data/packAssignments';
import { VENUE_TUNING_MAP } from '../../src/lib/parser/lots';
import { getLotTypePacks } from '../../src/data/lotTypePacks';

// Mirrors of the two signal sets detectPacks.ts holds inline.
const PET_SUBTYPE_PACKS = ['EP04', 'EP14'];
const FEATURE_PACKS = ['EP02', 'EP05', 'EP18']; // clubs · holidays · small businesses

const signals = new Map<string, string[]>();
const add = (pack: string, signal: string) => {
  const list = signals.get(pack) ?? [];
  if (!list.includes(signal)) list.push(signal);
  signals.set(pack, list);
};

for (const p of Object.values(TRAIT_TO_PACK)) add(p, 'trait');
for (const p of Object.values(ASPIRATION_TO_PACK)) add(p, 'aspiration');
for (const p of Object.values(CAREER_TO_PACK)) add(p, 'career');
for (const p of Object.values(OCCULT_TO_PACK)) add(p, 'occult');
for (const p of PET_SUBTYPE_PACKS) add(p, 'pet');
for (const p of Object.values(RELEASE_TO_PACK)) add(p, 'world');
for (const p of FEATURE_PACKS) add(p, 'feature');
// Lot type, on the same rule the detector uses: a label two packs both add is
// evidence for neither, so it counts for neither.
for (const label of new Set(Object.values(VENUE_TUNING_MAP))) {
  const packs = getLotTypePacks(label);
  if (packs.length === 1) add(packs[0], 'lot type');
}

const reachable: string[] = [];
const unreachable: string[] = [];
for (const pack of PACKS) {
  if (pack.id === 'base') continue;
  (signals.has(pack.id) ? reachable : unreachable).push(`${pack.id} ${pack.name}`);
}

console.log(`${PACKS.length} packs in the catalog (incl. base).`);
console.log(`\nDETECTABLE (${reachable.length}):`);
for (const r of reachable) console.log(`  ${r.padEnd(32)} ${signals.get(r.split(' ')[0])!.join(', ')}`);
console.log(`\nUNDETECTABLE — manual switch only (${unreachable.length}):`);
for (const u of unreachable) console.log(`  ${u}`);
