// READ-ONLY: list every record of a given surname with id, deceased, household.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const file = readFileSync(process.argv[2]);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const surname = process.argv[3].toLowerCase();
const hhById = new Map(data.households.map((h) => [h.id, h.name]));
const hhBySim = new Map<bigint, bigint>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.id);
const rows = data.sims.filter((s) => s.lastName.toLowerCase() === surname);
console.log(`${rows.length} "${surname}" records:\n`);
for (const s of rows) {
  const hid = hhBySim.get(s.id);
  const ghost = (s as any).isGhost;
  console.log(`  ${(s.firstName+' '+s.lastName).padEnd(20)} id=${s.id.toString(16).padStart(16,'0')} ghost=${ghost?'Y':'.'} hh=${hid?hid.toString(16):'—'} ${hid?`(${hhById.get(hid)})`:'(no household)'}`);
}
const ids = new Set(rows.map((s) => s.id));
console.log(`\n distinct ids: ${ids.size}  |  total records: ${rows.length}  ${ids.size===rows.length?'(no dup IDs — all distinct sims)':'⚠ DUPLICATE IDS (parser double-count)'}`);
