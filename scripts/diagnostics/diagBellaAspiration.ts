/**
 * Verify STOCK_ASPIRATIONS by resolving Bella Goth's primary_aspiration.
 * If she has Party Animal in-game, her 0x62bd ID should resolve to "Party Animal".
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { lookupAspiration } from '../../src/data/stockAspirations.js';

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

console.log(`Bella's aspirationId: ${bella.aspirationId !== null ? '0x' + bella.aspirationId.toString(16) : '(none)'}`);
if (bella.aspirationId !== null) {
  const asp = lookupAspiration(bella.aspirationId);
  if (asp) {
    console.log(`Resolved to: ${asp.name}`);
    console.log(`Description: ${asp.description}`);
    console.log(`Eligible at: ${asp.ages.join(', ')}`);
  } else {
    console.log('Not in STOCK_ASPIRATIONS catalog.');
  }
}
