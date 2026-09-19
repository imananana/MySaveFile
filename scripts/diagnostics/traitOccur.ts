// READ-ONLY: for given trait ids (hex), count living vs deceased carriers across
// both saves. A real death-cause trait appears ONLY on deceased sims.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const SAVES = [
  `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`,
  `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`,
];
const targets = process.argv.slice(2).map((h) => h.replace(/^0x/, '').toLowerCase());
for (const save of SAVES) {
  const file = readFileSync(save);
  const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const data = parseSaveData(resources);
  console.log(`\n=== ${save.split('/').pop()} ===`);
  for (const t of targets) {
    const carriers = data.sims.filter((s) => ((s as any).traitIds as bigint[] ?? []).some((x) => x.toString(16) === t));
    const living = carriers.filter((s) => !(s as any).isGhost);
    const dead = carriers.filter((s) => (s as any).isGhost);
    console.log(`  0x${t.padEnd(8)} carriers=${carriers.length}  living=${living.length}  deceased=${dead.length}` +
      (dead.length ? `  → ${dead.map((s) => s.firstName + ' ' + s.lastName).slice(0,6).join(', ')}` : '') +
      (living.length ? `  ⚠living: ${living.map((s) => s.firstName + ' ' + s.lastName).slice(0,4).join(', ')}` : ''));
  }
}
