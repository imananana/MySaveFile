/* Are two save files the same world? Compares sim + household ids.
 * Run: npx tsx scripts/diagnostics/sameWorld.ts <saveA> <saveB> */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
const load = (p: string) => {
  const b = readFileSync(p);
  return parseSaveData(parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
};
const [pa, pb] = process.argv.slice(2);
const A = load(pa), B = load(pb);
const idsA = new Set(A.sims.map((s) => s.id.toString(16)));
const idsB = new Set(B.sims.map((s) => s.id.toString(16)));
const shared = [...idsA].filter((x) => idsB.has(x)).length;
const hhA = new Set(A.households.map((h) => h.id.toString(16)));
const hhB = new Set(B.households.map((h) => h.id.toString(16)));
const sharedHh = [...hhA].filter((x) => hhB.has(x)).length;
console.log(`"${A.saveName}" vs "${B.saveName}"`);
console.log(`  sims shared      : ${shared} of ${idsA.size}/${idsB.size}  (${Math.round(100 * shared / Math.min(idsA.size, idsB.size))}%)`);
console.log(`  households shared: ${sharedHh} of ${hhA.size}/${hhB.size}`);
