import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const buf = readFileSync(process.env.HOME + '/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save');
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

// Vlad's sim id is 0x023516 90BBB36871 from my trace
const VLAD_ID = 0x02351690BBB36871n;
console.log(`Looking for Vlad simId 0x${VLAD_ID.toString(16)}…`);

const vlad = data.sims.find(s => s.id === VLAD_ID);
if (vlad) {
  console.log('FOUND VLAD:', vlad);
} else {
  console.log('VLAD NOT FOUND in parser output');
  // List all sims with first name "Vladislaus"
  const byName = data.sims.filter(s => s.firstName === 'Vladislaus');
  console.log(`Sims with firstName=Vladislaus: ${byName.length}`);
  for (const s of byName) console.log(' ', s);
}

// Also look at sims with IDs near Vlad's
console.log('\nSims with IDs close to Vlad:');
const sorted = data.sims
  .map(s => ({ ...s, diff: Number(s.id < VLAD_ID ? VLAD_ID - s.id : s.id - VLAD_ID) }))
  .sort((a, b) => a.diff - b.diff)
  .slice(0, 5);
for (const s of sorted) console.log(`  ${s.firstName} ${s.lastName} (id=0x${s.id.toString(16)}, diff=${s.diff})`);
