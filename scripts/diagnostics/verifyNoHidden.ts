import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { STOCK_SKILLS } from '../../src/data/stockSkills.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const save = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
let uncatalogued = 0;
for (const s of save.sims) for (const sk of s.skills) if (!STOCK_SKILLS[sk.uid]) uncatalogued++;
console.log('uncatalogued (hidden) skills still in parser output:', uncatalogued, '(expect 0)');
