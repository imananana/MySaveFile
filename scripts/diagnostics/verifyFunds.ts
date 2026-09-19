import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const save = parseSaveData(parseDbpf(ab));
console.log(`${save.households.length} households; money parsed on ${save.households.filter(h=>h.money!=null).length}:`);
for (const h of save.households.slice(0, 8)) console.log(`  "${h.name}" §${h.money ?? '—'} (${h.simIds.length} sims)`);
