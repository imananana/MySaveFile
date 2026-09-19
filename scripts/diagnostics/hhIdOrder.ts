import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`;
const b = readFileSync(p);
const save = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
// sort households by numeric id, show id + name + sim count
const rows = save.households
  .map(h => ({ id: h.id, name: h.name, sims: h.simIds.length }))
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
console.log(`${rows.length} households, sorted by id (ascending):`);
for (const r of rows.slice(0, 25)) console.log(`  x${r.id.toString(16)}  ${r.name}  (${r.sims} sims)`);
// check: do they share a high-bits prefix (counter-like)?
const top = rows.map(r => r.id >> 40n);
console.log('distinct high-24-bit prefixes:', new Set(top.map(String)).size, 'of', rows.length);
