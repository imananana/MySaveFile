import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const SAVE = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const b = readFileSync(SAVE);
const { sims } = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
const adults = sims.filter(s => ['youngAdult','adult','elder'].includes(s.lifestage as string) && s.deathCause === null);
console.log(`adults/elders alive: ${adults.length}`);
for (const s of adults.slice(0, 30)) {
  console.log(`${`${s.firstName} ${s.lastName}`.trim().padEnd(26)} ${s.id.toString().padEnd(20)} ${s.lifestage.padEnd(11)} career=${s.career?`${s.career.name} L${s.career.level}`:'—'}`);
}
