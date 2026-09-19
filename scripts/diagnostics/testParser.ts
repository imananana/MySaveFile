/**
 * Standalone smoke test for the new saveParser.
 * Run via:  node_modules/.bin/tsx scripts/testParser.ts <savePath>
 *
 * This wires up parseDbpf + parseSaveData with the real save file and prints
 * summary stats so we can verify the parser works end-to-end before the
 * user tries it in the UI.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
console.log(`Loading ${savePath}…`);

const buf = readFileSync(savePath);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(`Resources: ${resources.length}`);

const t0 = Date.now();
const data = parseSaveData(resources);
const dt = Date.now() - t0;
console.log(`Parsed in ${dt}ms`);

console.log(`\n=== Summary ===`);
console.log(`  Sims:       ${data.sims.length}`);
console.log(`  Humans:     ${data.sims.filter(s => s.species === 'human').length}`);
console.log(`  Pets:       ${data.sims.filter(s => s.species === 'pet').length}`);
console.log(`  Lots:       ${data.lots.length}`);
console.log(`  Lots w/type:${data.lots.filter(l => l.detectedType !== null).length}`);
console.log(`  Households: ${data.households.length}`);
const placedHHs = data.households.filter(h => h.lotId !== null);
console.log(`  Placed HHs: ${placedHHs.length}`);

console.log(`\n=== Lifestage distribution (humans) ===`);
const stageCounts: Record<string, number> = {};
for (const s of data.sims.filter(s => s.species === 'human')) {
  stageCounts[s.lifestage] = (stageCounts[s.lifestage] || 0) + 1;
}
for (const [k, v] of Object.entries(stageCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)}: ${v}`);
}

console.log(`\n=== Gender distribution (humans) ===`);
let m = 0, f = 0;
for (const s of data.sims.filter(s => s.species === 'human')) {
  if (s.gender === 'male') m++; else f++;
}
console.log(`  male:   ${m}`);
console.log(`  female: ${f}`);

console.log(`\n=== Spot-check known households ===`);
const spot = ['Maddox', 'Wallace', 'Prescott', 'Dog Daycare', 'Harrington', 'Warner'];
for (const needle of spot) {
  const hhs = data.households.filter(h => h.name.toLowerCase().includes(needle.toLowerCase()));
  for (const hh of hhs) {
    const sims = hh.simIds.map(id => data.sims.find(s => s.id === id)).filter(Boolean);
    const lines = sims.map(s => `${s!.firstName} ${s!.lastName} (${s!.gender[0]}, ${s!.lifestage}${s!.species === 'pet' ? '/pet' : ''})`);
    console.log(`  "${hh.name}"  lotId=${hh.lotId ? '0x' + hh.lotId.toString(16) : 'none'}`);
    for (const l of lines) console.log(`    - ${l}`);
    if (sims.length === 0) console.log(`    (no named sims)`);
  }
}

console.log(`\n=== Occult distribution (humans) ===`);
const occultCounts: Record<string, number> = {};
let ghostCount = 0;
for (const s of data.sims.filter(s => s.species === 'human')) {
  occultCounts[s.occult] = (occultCounts[s.occult] || 0) + 1;
  if (s.isGhost) ghostCount++;
}
for (const [k, v] of Object.entries(occultCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(13)}: ${v}`);
}
console.log(`  ghosts (any) : ${ghostCount}`);

console.log(`\n=== Non-human occults (all) ===`);
for (const s of data.sims.filter(s => s.species === 'human' && (s.occult !== 'none' || s.isGhost))) {
  const hh = data.households.find(h => h.simIds.includes(s.id));
  const tags = [];
  if (s.occult !== 'none') tags.push(s.occult);
  if (s.isGhost) tags.push('ghost');
  console.log(`  ${(s.firstName + ' ' + s.lastName).padEnd(30)} [${tags.join(', ').padEnd(20)}]  hh="${hh?.name ?? '?'}"`);
}

console.log(`\n=== All "pets" detected ===`);
for (const s of data.sims.filter(s => s.species === 'pet')) {
  const hh = data.households.find(h => h.simIds.includes(s.id));
  console.log(`  ${s.firstName.padEnd(15)} ${s.lastName.padEnd(15)} (${s.gender[0]})  hh="${hh?.name ?? '?'}"  id=0x${s.id.toString(16)}`);
}

console.log(`\n=== Sims with empty last name (potential pets) ===`);
const noLast = data.sims.filter(s => s.lastName === '');
console.log(`  Total: ${noLast.length}`);
for (const s of noLast.slice(0, 30)) {
  const hh = data.households.find(h => h.simIds.includes(s.id));
  console.log(`  ${s.firstName.padEnd(15)} (${s.gender[0]}, ${s.lifestage}, ${s.species})  hh="${hh?.name ?? '?'}"`);
}

console.log(`\n=== Lot type changes (first 20) ===`);
let typeChangeCount = 0;
for (const l of data.lots) {
  if (l.detectedType && typeChangeCount < 20) {
    console.log(`  "${l.name}" field5=${l.field5} → ${l.detectedType}`);
    typeChangeCount++;
  }
}
const totalTyped = data.lots.filter(l => l.detectedType !== null).length;
console.log(`  …total lots with detected type: ${totalTyped} / ${data.lots.length}`);
