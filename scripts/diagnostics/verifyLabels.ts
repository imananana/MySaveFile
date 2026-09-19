import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { smallBusinessRankLabel, smallBusinessAlignmentLabel } from '../../src/data/stockBusinessPerks.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const save = parseSaveData(parseDbpf(ab));
for (const biz of save.smallBusinesses) console.log(`"${biz.name}": ${smallBusinessRankLabel(biz.renownRank)} / ${smallBusinessAlignmentLabel(biz.alignment) ?? 'no alignment'}`);
