// READ-ONLY: dump the parser-extracted traitIds (hex) for named sims, to check
// death-cause traits. Usage: simTraits.ts <save> "First Last" ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const savePath = process.argv[2];
const names = process.argv.slice(3);
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const find = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase());
for (const n of names) {
  const s = find(n);
  if (!s) { console.log(`${n}: NOT FOUND`); continue; }
  const traits = (s as any).traitIds as bigint[] | undefined;
  const hex = (traits ?? []).map((t) => '0x' + t.toString(16));
  console.log(`${n} (${s.lifestage}, ghost=${(s as any).isGhost}) — ${hex.length} traits`);
  console.log('   ' + hex.join('  '));
  // flag the known death-trait block + cowplant
  const deathish = hex.filter((h) => /^0x18d[0-9a-f]{2}$/.test(h) || h === '0x18d48' || h === '0x18fc0');
  if (deathish.length) console.log('   ↳ death-block candidates: ' + deathish.join(' '));
}
