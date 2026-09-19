/**
 * Run the production family parser (src/lib/parser/family.ts) on a save and
 * print each household's derived family structure — so we can eyeball how real
 * households look before building the tree UI.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/familyReport.ts [save] [household|--random N]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { scanFamily, scanPairRelationships, buildFamilyGraph, relationsFor } from '../../src/lib/parser/family.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const arg = process.argv[3] || '';

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const graph = buildFamilyGraph(scanFamily(blob!, simIds), scanPairRelationships(blob!, simIds));

const meHh = (selfId: bigint) => hhBySim.get(selfId) ?? '?';
const nm = (id: bigint, selfHh: string) => {
  const s = simById.get(id);
  if (!s) return `?${id.toString(16)} (not in save)`;
  const hh = hhBySim.get(id) ?? '?';
  return `${s.firstName} ${s.lastName} (${s.lifestage})${hh !== selfHh ? ` ⟂${hh}` : ''}`;
};
const list = (ids: bigint[], hh: string) => ids.map((i) => nm(i, hh)).join(', ') || '—';

// pick households to show
let households = data.households;
if (arg.startsWith('--random')) {
  const n = Number(process.argv[4] || 3);
  const eligible = data.households.filter((h) => h.simIds.filter((id) => simById.get(id)?.species === 'human').length >= 2);
  households = [...eligible].sort(() => Math.random() - 0.5).slice(0, n);
} else if (arg) {
  households = data.households.filter((h) => h.name.toLowerCase().includes(arg.toLowerCase()));
}

console.log(`Save: ${savePath.split('/').pop()} — ${data.sims.length} sims, ${data.households.length} households\n`);
for (const h of households) {
  const members = h.simIds.map((id) => simById.get(id)).filter((s): s is NonNullable<typeof s> => !!s && s.species === 'human');
  if (members.length === 0) continue;
  console.log(`\n┏━━ ${h.name} ━━ (${members.length})`);
  for (const s of members) {
    const hh = meHh(s.id);
    const r = relationsFor(graph, s.id);
    const couple = r.spouseId ? `💍 spouse: ${nm(r.spouseId, hh)}`
      : r.engagedId ? `💞 engaged: ${nm(r.engagedId, hh)}`
      : r.partners.length ? `💑 partner: ${list(r.partners, hh)}`
      : r.coParents.length ? `⚯ co-parent (separated): ${list(r.coParents, hh)}`
      : null;
    console.log(`┃ ${s.firstName} ${s.lastName} (${s.gender[0]}, ${s.lifestage})`);
    if (couple) console.log(`┃     ${couple}`);
    if (r.parents.length) console.log(`┃     parents: ${list(r.parents, hh)}`);
    if (r.children.length) console.log(`┃     children: ${list(r.children, hh)}`);
    if (r.siblings.length) console.log(`┃     siblings: ${r.siblings.map((sib) => `${nm(sib.id, hh)} [${sib.type}]`).join(', ')}`);
    if (r.exSpouses.length) console.log(`┃     💔 ex-spouse (divorced): ${list(r.exSpouses, hh)}`);
    if (r.exPartners.length) console.log(`┃     💔 ex-partner (broke up): ${list(r.exPartners, hh)}`);
    if (r.exFiances.length) console.log(`┃     💔 ex-fiancé (split): ${list(r.exFiances, hh)}`);
    if (r.stepParents.length) console.log(`┃     step-parents: ${list(r.stepParents, hh)}`);
    if (r.grandparents.length) console.log(`┃     grandparents: ${list(r.grandparents, hh)}`);
    if (r.grandchildren.length) console.log(`┃     grandchildren: ${list(r.grandchildren, hh)}`);
    const bare = !couple && !r.parents.length && !r.children.length && !r.siblings.length && !r.exSpouses.length && !r.exPartners.length && !r.exFiances.length;
    if (bare) console.log(`┃     (no lineage — roommate / unrelated)`);
  }
}
