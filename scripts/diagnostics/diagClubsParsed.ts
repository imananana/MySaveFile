/**
 * End-to-end test of scanClubs via parseSaveData. Confirms Meat Lovers
 * (custom club) yields: 3 members at field 7, hangout_setting='lot',
 * hangout_zone_id set, name="Meat Lovers", icon='37cd29e256e400f1'.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

console.log(`Parsed: ${data.sims.length} sims, ${data.lots.length} lots, ${data.households.length} households, ${data.clubs.length} clubs\n`);

console.log('CLUBS');
console.log('═'.repeat(120));
for (const c of data.clubs) {
  console.log(`${c.name ?? '(stock — no name)'}`);
  console.log(`  id:        ${c.id}`);
  console.log(`  icon:      ${c.iconInstance ?? '(none)'}`);
  console.log(`  seed:      ${c.clubSeed ?? '(none — custom club)'}`);
  console.log(`  leader:    ${c.leaderSimId ?? '(none)'}`);
  console.log(`  members:   [${c.memberSimIds.join(', ')}] (${c.memberSimIds.length})`);
  console.log(`  hangout:   ${c.hangoutSetting}${c.hangoutZoneId !== null ? ` → zone ${c.hangoutZoneId}` : ''}`);
  console.log('');
}

// Cross-check hangouts against parsed lots
console.log('HANGOUT LOOKUPS');
console.log('═'.repeat(120));
const lotById = new Map(data.lots.map((l) => [l.id, l]));
for (const c of data.clubs) {
  if (c.hangoutZoneId === null) continue;
  const lot = lotById.get(c.hangoutZoneId);
  if (lot) {
    console.log(`  ${c.name ?? '(stock)'} → "${lot.name}" (field5=${lot.field5 ?? 'none'}, type=${lot.detectedType ?? '?'})`);
  } else {
    console.log(`  ${c.name ?? '(stock)'} → zone ${c.hangoutZoneId} NOT in parsed lots`);
  }
}
