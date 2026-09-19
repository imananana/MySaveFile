/**
 * READ-ONLY: list every sim our parser flags isGhost, so we can sanity-check
 * the ghost detection (marker 0xD3582E8CD8AFF609 at f54 in sims.ts). If obvious
 * living premades show up here, the detection is over-matching.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/ghostList.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);

const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);

const ghosts = data.sims.filter((s) => s.isGhost);
console.log(`Save: ${savePath.split('/').pop()} — ${data.sims.length} sims, ${ghosts.length} flagged isGhost\n`);
for (const s of ghosts) {
  console.log(`  ${s.firstName} ${s.lastName}  (${s.gender[0]}, ${s.lifestage}, ${s.species}, occult=${s.occult})  hh=${hhBySim.get(s.id) ?? '—'}`);
}
