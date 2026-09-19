/* Parse ANY save file path and print career/degree for named sims.
 * Run: npx tsx scripts/diagnostics/dumpAnySave.ts <path> [needle...] */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const PATH = process.argv[2];
const NEEDLES = (process.argv.slice(3).length ? process.argv.slice(3) : ['pancake', 'lothario', 'caliente']).map(s => s.toLowerCase());

const b = readFileSync(PATH);
const { sims } = parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
console.log(`# ${PATH.split('/').pop()}`);
for (const s of sims) {
  const full = `${s.firstName} ${s.lastName}`.trim();
  if (!NEEDLES.some(n => full.toLowerCase().includes(n))) continue;
  console.log(
    `${full.padEnd(22)} ${s.lifestage.padEnd(11)} career=${s.career ? `${s.career.name} L${s.career.level} (uid ${s.career.uid})` : '—'}`,
  );
}
