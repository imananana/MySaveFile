/* Print the in-game save name for each .save path given, so a planner save can
 * be matched back to the file it came from.
 * Run: npx tsx scripts/diagnostics/saveNames.ts <path...> */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

for (const p of process.argv.slice(2)) {
  try {
    const b = readFileSync(p);
    const d = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    console.log(`${p.split('/').pop()!.padEnd(24)} "${d.saveName}"  sims=${d.sims.length} households=${d.households.length}`);
  } catch (e) {
    console.log(`${p.split('/').pop()!.padEnd(24)} — ${(e as Error).message.slice(0, 60)}`);
  }
}
