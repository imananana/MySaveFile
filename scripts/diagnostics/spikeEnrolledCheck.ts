/** Confirm the production parse path populates enrolledDegree + earned degrees.
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeEnrolledCheck.ts */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
import { earnedDegreesFromTraits } from '../../src/data/stockDegrees.js';

const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;
const humanIds = scanHumanSimStubs(buf);
const sims = scanFullSimAnchors(buf, humanIds);
let enrolled = 0, graduated = 0;
for (const s of sims) {
  const earned = earnedDegreesFromTraits(s.traitIds.map((id) => '0x' + id.toString(16)));
  if (s.enrolledDegree) { enrolled++; console.log(`ENROLLED  ${s.firstName} ${s.lastName}: ${s.enrolledDegree.subject} @ ${s.enrolledDegree.school}${s.enrolledDegree.distinguished ? ' (distinguished)' : ''}`); }
  if (earned.length) { graduated++; console.log(`GRADUATED ${s.firstName} ${s.lastName}: ${earned.map((d) => `${d.subject} ${d.school}${d.honors ? ' Honors' : ''}`).join(', ')}`); }
}
console.log(`\nTotal sims: ${sims.length} | enrolled: ${enrolled} | graduated: ${graduated}`);
