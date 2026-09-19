/**
 * Ingest the FULL family_Target_* RelationshipBit tuning vocabulary (from
 * ~/Documents/family) and parse it against a save's relationship records — so we
 * use the explicit kinship types the game gives us instead of reconstructing
 * them. Reports, per family bit, how many pairs carry it across the whole save,
 * and dumps every family tie for a chosen household.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/familyBitsScan.ts [save] [household]
 */
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanPairRelationships } from '../../src/lib/parser/family.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
const hhArg = (process.argv[3] || 'Tompkins').toLowerCase();
const FAMILY_DIR = `${process.env.HOME}/Documents/family`;

// ── 1. Ingest every family_Target_* RelationshipBitTuning → id (decimal) + meta.
interface BitDef { id: bigint; name: string; dir: string; incest: boolean; }
const bitById = new Map<bigint, BitDef>();
for (const f of readdirSync(FAMILY_DIR)) {
  if (!/family_Target_.*\.RelationshipBitTuning\.xml$/.test(f)) continue;
  const xml = readFileSync(`${FAMILY_DIR}/${f}`, 'utf8');
  const name = /n="(family_Target_[A-Za-z]+)"/.exec(xml)?.[1] ?? f;
  const s = /s="(\d+)"/.exec(xml)?.[1];
  if (!s) continue;
  const dir = /<E n="directionality">([A-Z]+)/.exec(xml)?.[1] ?? '?';
  const incest = /<T n="counts_as_incest">True/.test(xml);
  bitById.set(BigInt(s), { id: BigInt(s), name: name.replace('family_Target_', ''), dir, incest });
}
console.log(`Ingested ${bitById.size} family_Target relationship-bit tunings.\n`);

// ── 2. Parse the save + scan relationship records.
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName} (${s.lifestage})` : `«no record» 0x${id.toString(16)}`; };
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const humanIds = new Set(data.sims.filter((s) => s.species === 'human').map((s) => s.id));
const pairs = scanPairRelationships(blob!, humanIds);
console.log(`Relationship pair records: ${pairs.length}  (over ${humanIds.size} human sims)\n`);

// ── 3. Tally family bits across the whole save.
const tally = new Map<bigint, number>();
for (const p of pairs) for (const b of p.bits) if (bitById.has(b)) tally.set(b, (tally.get(b) ?? 0) + 1);
console.log('── Family bits present in this save (count = # of pair records carrying it) ──');
for (const [id, def] of [...bitById].sort((a, b) => (tally.get(b[0]) ?? 0) - (tally.get(a[0]) ?? 0))) {
  const c = tally.get(id) ?? 0;
  console.log(`  ${c === 0 ? '·' : c.toString().padStart(5)}  ${def.name.padEnd(22)} ${id} (0x${id.toString(16)}) ${def.dir}`);
}

// ── 4. Dump every family tie for the chosen household's members.
const hh = data.households.find((h) => h.name.toLowerCase().includes(hhArg));
if (hh) {
  const memberIds = new Set(hh.simIds);
  console.log(`\n── Family ties touching household "${hh.name}" ──`);
  let found = 0;
  for (const p of pairs) {
    const famBits = p.bits.filter((b) => bitById.has(b));
    if (famBits.length === 0) continue;
    if (!memberIds.has(p.simA) && !memberIds.has(p.simB)) continue;
    found++;
    console.log(`  ${nm(p.simA)}  ⇄  ${nm(p.simB)}`);
    for (const b of famBits) console.log(`        • ${bitById.get(b)!.name}  (${b})`);
  }
  if (found === 0) console.log('  (no relationship-bit records touch this household)');
}
