/**
 * Verify the household description extraction by running the full parseSaveData
 * pipeline against the test save and printing any household with a non-empty
 * description.
 */
import { readFileSync } from 'fs';
import { parseSaveData } from '../src/lib/saveParser.js';
import { parseDbpf } from '../src/lib/dbpf.js';

const HOME = process.env.HOME;
const SAVE_NAME = process.env.SAVE || 'Slot_10312032.save';
const SAVE = SAVE_NAME.startsWith('/')
  ? SAVE_NAME
  : `${HOME}/Documents/Electronic Arts/The Sims 4/saves/${SAVE_NAME}`;

const buf = readFileSync(SAVE);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const resources = parseDbpf(ab);
const data = parseSaveData(resources);

console.log(`Households: ${data.households.length}`);
const withDesc = data.households.filter((h) => h.description.length > 0);
console.log(`Households with non-empty description: ${withDesc.length}\n`);
for (const h of withDesc) {
  console.log(`  "${h.name}" (id=${h.id.toString(16)}): "${h.description}"`);
}
