import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const save = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
const byStage: Record<string, {sims:number; withSkills:number}> = {};
for (const s of save.sims) {
  const k = s.lifestage; byStage[k] ??= {sims:0, withSkills:0};
  byStage[k].sims++; if (s.skills.length) byStage[k].withSkills++;
}
for (const [k,v] of Object.entries(byStage)) console.log(`${k}: ${v.sims} sims, ${v.withSkills} with ≥1 skill`);
