import { readFileSync } from 'fs';
import { parseSaveData } from '../src/lib/saveParser.js';
import { parseDbpf } from '../src/lib/dbpf.js';

const HOME = process.env.HOME;
const SAVE_NAME = process.env.SAVE || 'Slot_10312032.save';
const SAVE = SAVE_NAME.startsWith('/') ? SAVE_NAME : `${HOME}/Documents/Electronic Arts/The Sims 4/saves/${SAVE_NAME}`;
const buf = readFileSync(SAVE);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const data = parseSaveData(parseDbpf(ab));
console.log(`Clubs: ${data.clubs.length}`);
const withDesc = data.clubs.filter((c) => c.description.length > 0);
console.log(`Clubs with non-empty description: ${withDesc.length}\n`);
for (const c of withDesc) {
  console.log(`  "${c.name ?? '(unnamed)'}" (id=${c.id.toString(16)}): "${c.description}"`);
}
