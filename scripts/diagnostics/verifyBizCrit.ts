import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanSmallBusinesses } from '../../src/lib/parser/smallBusinesses.js';
import { customerCriterionTypeLabel, customerCriterionValueText } from '../../src/data/venueLabels.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
for (const biz of scanSmallBusinesses(bl!)) {
  if (biz.name !== 'Tester Business') continue;
  console.log(`"${biz.name}" — ${biz.customerCriteria.length} customer criteria:`);
  for (const c of biz.customerCriteria) {
    console.log(`  • ${customerCriterionTypeLabel(c)}: ${customerCriterionValueText(c)}  [required=${c.required}, caregiverStays=${c.caregiverStays}]`);
  }
}
