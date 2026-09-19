/* Pull sim_id + current career/degree for the mod-spike target sims out of a
 * specific save. Run: npx tsx scripts/diagnostics/dumpSpikeTargets.ts [needle...] */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const SLOT = process.env.SLOT || '00000003';
const SAVE = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_${SLOT}.save`;
const NEEDLES = (process.argv.slice(2).length ? process.argv.slice(2) : ['alfaro', 'pancake']).map(s => s.toLowerCase());

const b = readFileSync(SAVE);
const resources = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const { sims } = parseSaveData(resources);

const hex = (n: bigint) => '0x' + n.toString(16);
for (const s of sims) {
  const full = `${s.firstName} ${s.lastName}`.trim();
  if (!NEEDLES.some(n => full.toLowerCase().includes(n))) continue;
  console.log(
    `${full.padEnd(24)} sim_id=${s.id.toString().padEnd(22)} ${hex(s.id).padEnd(20)}` +
    ` | lifestage=${(s.lifestage ?? '?').padEnd(11)} deceased=${s.deathCause !== null ? 'Y' : 'n'}` +
    ` | career=${s.career ? `${s.career.name} L${s.career.level}` : '—'}` +
    ` | enrolledDegree=${(s as any).enrolledDegreeId ?? (s as any).enrolledDegree ?? '—'}`,
  );
}
