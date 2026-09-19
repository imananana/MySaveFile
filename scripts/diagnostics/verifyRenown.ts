import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const save = parseSaveData(parseDbpf(ab));
for (const biz of save.smallBusinesses) {
  const owner = save.sims.find(s => s.id === biz.ownerSimId);
  console.log(`"${biz.name}" — owner ${owner?owner.firstName+' '+owner.lastName:'?'} | renownRank=${biz.renownRank} (stars) | perkPoints=${biz.perkPoints} | fee=${biz.feeMode} | priceMod=${biz.priceModifierPct}%`);
}
