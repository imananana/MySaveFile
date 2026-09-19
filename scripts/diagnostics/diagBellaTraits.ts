/**
 * Verify STOCK_TRAITS against Bella Goth's known CAS picks.
 * Filters her 33 raw trait IDs through the map and prints only the
 * CAS-personality-typed ones.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { lookupTraitName } from '../../src/data/stockTraits.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000004.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

const bella = data.sims.find((s) => s.firstName === 'Bella' && s.lastName === 'Goth');
if (!bella) {
  console.log('Bella not found.');
  process.exit(1);
}

console.log(`Bella has ${bella.traitIds.length} raw trait IDs.`);
console.log(`Filtered to CAS personality (whitelist match):\n`);
const matched: string[] = [];
for (const id of bella.traitIds) {
  const name = lookupTraitName(id);
  if (name) {
    console.log(`  0x${id.toString(16).padStart(6, '0')} → ${name}`);
    matched.push(name);
  }
}
console.log(`\n${matched.length} CAS personality picks: ${matched.join(', ')}`);
console.log(`${bella.traitIds.length - matched.length} non-personality traits filtered out (hidden, lifestyle, mod, etc.)`);
