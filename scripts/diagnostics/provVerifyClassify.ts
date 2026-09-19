// Verify the PRODUCTION classifier (parseSaveData + classifyHousehold) reproduces the
// provClassify ground-truth buckets, driven through the real parser pipeline end-to-end.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { classifyHousehold } from '../../src/lib/parser/provenance.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const saves = process.argv.slice(2);
if (!saves.length) saves.push('Slot_10312029.save', 'Slot_00001705.save', 'Slot_1239123c.save', 'Slot_00000009.save');

for (const save of saves) {
  const b = readFileSync(`${SAVES}/${save}`);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const data = parseSaveData(parseDbpf(ab) as any);
  const simsById = new Map(data.sims.map((s) => [s.id, s]));
  const buckets = new Map<string, number>(); const subs = new Map<string, number>();
  for (const hh of data.households) {
    const o = classifyHousehold(hh, simsById, data.ownerAccountId);
    buckets.set(o.bucket, (buckets.get(o.bucket) ?? 0) + 1);
    subs.set(`${o.bucket}/${o.sub}`, (subs.get(`${o.bucket}/${o.sub}`) ?? 0) + 1);
  }
  console.log(`\n${save}  "${data.saveName}"  — ${data.households.length} hh, owner 0x${data.ownerAccountId?.toString(16) ?? '?'}`);
  console.log(`  buckets: ${[...buckets].map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`  subs:    ${[...subs].sort().map(([k, v]) => `${k}:${v}`).join('  ')}`);
}
