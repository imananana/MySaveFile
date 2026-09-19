// READ-ONLY: definitive death-cause TRAIT table. Rule (per user insight): the
// cause trait is a HIDDEN death trait — i.e. a trait on the ghost that is NOT
// in our personality catalog STOCK_TRAITS and not on any living sim. Personality
// traits like "High Maintenance" (0x427d0) are excluded by the catalog, which is
// robust regardless of which sims populate a given save.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { STOCK_TRAITS } from '../../src/data/stockTraits.js';

const SAVE = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const CAUSE: Record<string, string> = {
  Spence: 'Consumed by the Mother', Altman: 'Anger', Dobbs: 'Beetles', Hamilton: 'Murphy Bed',
  Lujan: 'Flies', Richter: 'Broken Heart', McElroy: 'Cowplant', Owens: 'Cuckoo Malfunction',
  Kumar: 'Drowning', Kaur: 'Electrocution', Hale: 'Embarrassment', Ricks: 'Falling',
  Lyon: 'Fire', Curry: 'Freezing', Gruber: 'Hunger', Sawyer: 'Killer Chicken',
  Larue: 'Killer Rabbit', Willis: 'Laughter', Olivas: 'Lightning', Miotke: 'Meteorite',
  Bolton: 'Mold', Osborn: 'Murder of Crows', John: 'Overexertion', Acosta: 'Overheating',
  Kellogg: 'Poison', Chen: 'Pufferfish', Covington: 'Rabid Rodent Fever', McConnell: 'Steam',
  Liu: 'Stink Capsule', Whitten: 'Urban Myth', McGhee: 'Vending Machine',
  Denney: 'Poison', Bragg: 'Meteorite', Lentz: 'Electrocution',
};
const file = readFileSync(SAVE);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const tr = (s: any): string[] => ((s.traitIds as bigint[]) ?? []).map((x) => '0x' + x.toString(16));
const isPersonality = (t: string) => t in STOCK_TRAITS;

const livingTraits = new Set<string>();
for (const s of data.sims) if (!(s as any).isGhost) for (const t of tr(s)) livingTraits.add(t);
const ghosts = data.sims.filter((s) => (s as any).isGhost && CAUSE[s.lastName]);
const byCause = new Map<string, any[]>();
for (const g of ghosts) (byCause.get(CAUSE[g.lastName]) ?? byCause.set(CAUSE[g.lastName], []).get(CAUSE[g.lastName])!).push(g);

console.log(`${ghosts.length} ghosts / ${byCause.size} causes. Rule: trait NOT in STOCK_TRAITS and not on any living sim.\n`);
const rows: {cause:string;n:number;trait:string;note:string}[] = [];
for (const [cause, gs] of byCause) {
  // hidden (non-personality) traits common to all ghosts of this cause
  let common = new Set(tr(gs[0]).filter((t) => !isPersonality(t)));
  for (const g of gs.slice(1)) common = new Set([...common].filter((t) => tr(g).includes(t)));
  const cands = [...common].filter((t) => !livingTraits.has(t));
  rows.push({ cause, n: gs.length, trait: cands.length === 1 ? cands[0] : (cands.length === 0 ? '???' : cands.join(' / ')), note: cands.length === 1 ? '' : `${cands.length} cands` });
}
rows.sort((a,b)=>a.cause.localeCompare(b.cause));
for (const r of rows) console.log(`  ${r.cause.padEnd(22)} ${r.trait.padEnd(10)} ${r.n>1?`[${r.n} ghosts]`:''} ${r.note}`);
const bad = rows.filter((r) => r.trait.includes('/') || r.trait === '???');
console.log(`\n${rows.length - bad.length}/${rows.length} resolve to exactly one hidden trait` + (bad.length ? ` | UNRESOLVED: ${bad.map(b=>b.cause).join(', ')}` : '  ✓'));
// sanity: confirm none of the chosen death traits are personality traits
const chosen = rows.map(r=>r.trait).filter(t=>!t.includes('/')&&t!=='???');
console.log(`personality-trait collisions among chosen: ${chosen.filter(isPersonality).length} (must be 0)`);
