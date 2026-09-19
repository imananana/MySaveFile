/**
 * Verify suspected field mappings for Sunny Babies by cross-referencing
 * against known sim and lot IDs from parseSaveData.
 *
 * Hypotheses we're testing:
 *   - field 14 (8 raw bytes inside ldelim) = owner sim_id → should match Eleanor Sullivan
 *   - field 17 (varint = 34380432) = lot/zone reference → should match San Sequoia Daycare
 *   - field 7 (ResourceKey instance 0x2a4d0321668345f5) = venue tuning (Daycare)
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const HOME = process.env.HOME;
const SAVE = `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

console.log('Checking sims for Eleanor Sullivan…');
const eleanor = data.sims.find((s) => s.firstName === 'Eleanor' && s.lastName === 'Sullivan');
if (eleanor) {
  console.log(`  Eleanor Sullivan sim_id = ${eleanor.id} (hex 0x${eleanor.id.toString(16)})`);
} else {
  console.log('  NOT FOUND in parsed sims (might be unnamed/pet/parser-missed)');
  // Print sims with first name "Eleanor"
  const matches = data.sims.filter((s) => s.firstName === 'Eleanor');
  console.log(`  Sims named Eleanor: ${matches.map((s) => `${s.firstName} ${s.lastName} (${s.id})`).join(', ')}`);
  // and any "Sullivan"
  const sullivans = data.sims.filter((s) => s.lastName === 'Sullivan');
  console.log(`  Sims with surname Sullivan: ${sullivans.map((s) => `${s.firstName} ${s.lastName} (${s.id})`).join(', ')}`);
}

console.log(`\nSuspected owner sim_id from f14 = 633622525552677062 (hex 0x8cb14547540e8c6)`);
console.log(`  matches Eleanor? ${eleanor?.id === 633622525552677062n}`);

console.log('\nChecking lots for San Sequoia Daycare…');
const lot = data.lots.find((l) => l.name === 'San Sequoia Daycare');
if (lot) {
  console.log(`  lot id = ${lot.id} (hex 0x${lot.id.toString(16)})`);
  console.log(`  field5 = ${lot.field5}`);
  console.log(`  low 32 bits = ${Number(lot.id & 0xffffffffn)} (hex 0x${(lot.id & 0xffffffffn).toString(16)})`);
} else {
  console.log('  NOT FOUND — listing all lots whose name contains "Daycare":');
  for (const l of data.lots) if (l.name.toLowerCase().includes('daycare')) console.log(`  ${l.name} (id=${l.id})`);
}
console.log(`\nSuspected lot ref from f17 = 34380432 (hex 0x20c7dd0)`);
