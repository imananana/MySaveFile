// READ-ONLY: explain the trait composition of every labeled ghost. For fresh
// CAS ghosts, each record should = [traits shared by all ghosts] + [the one
// death trait]. Anything else is an "extra" we must explain. Also derives the
// death trait per cause (intersection across same-cause ghosts).
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

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
const tr = (s: any): string[] => ((s.traitIds as bigint[]) ?? []).map((x) => x.toString(16));

const livingCount = new Map<string, number>();
for (const s of data.sims) if (!(s as any).isGhost) for (const t of new Set(tr(s))) livingCount.set(t, (livingCount.get(t) ?? 0) + 1);

const ghosts = data.sims.filter((s) => (s as any).isGhost && CAUSE[s.lastName]);
const N = ghosts.length;
const ghostCount = new Map<string, number>();
for (const g of ghosts) for (const t of new Set(tr(g))) ghostCount.set(t, (ghostCount.get(t) ?? 0) + 1);

const universal = [...ghostCount].filter(([, c]) => c === N).map(([t]) => t);
console.log(`${N} ghosts. Traits on ALL ${N} ghosts (the shared template):`);
for (const t of universal) console.log(`   0x${t}  (also on ${livingCount.get(t) ?? 0} living sims)`);

const byCause = new Map<string, any[]>();
for (const g of ghosts) (byCause.get(CAUSE[g.lastName]) ?? byCause.set(CAUSE[g.lastName], []).get(CAUSE[g.lastName])!).push(g);
const causesPerTrait = new Map<string, Set<string>>();
for (const [c, gs] of byCause) for (const g of gs) for (const t of new Set(tr(g))) (causesPerTrait.get(t) ?? causesPerTrait.set(t, new Set()).get(t)!).add(c);

console.log(`\nPer-ghost: traits NOT on any living sim (death-trait must be here), minus universal:`);
let cleanCt = 0, extraCt = 0;
for (const g of ghosts) {
  const notLiving = [...new Set(tr(g))].filter((t) => !(livingCount.get(t)) && !universal.includes(t));
  const tag = notLiving.length === 1 ? 'clean' : `+${notLiving.length - 1} EXTRA`;
  if (notLiving.length === 1) cleanCt++; else extraCt++;
  if (notLiving.length !== 1) console.log(`   ${(g.firstName+' '+g.lastName).padEnd(20)} [${CAUSE[g.lastName]}]  ${notLiving.map(t=>'0x'+t+`(ghosts:${ghostCount.get(t)})`).join('  ')}   ← ${tag}`);
}
console.log(`   ...and ${cleanCt} ghosts with exactly ONE non-living trait (clean).`);

console.log(`\nDeath trait per cause (shared by all same-cause ghosts, not on living, single-cause):`);
const inBlock = (h: string) => { const n = parseInt(h, 16); return n >= 0x18d2c && n <= 0x18d48; };
const rows: {cause:string;n:number;trait:string;extra:string}[] = [];
for (const [cause, gs] of byCause) {
  let common = new Set(tr(gs[0]));
  for (const g of gs.slice(1)) common = new Set([...common].filter((t) => tr(g).includes(t)));
  const cands = [...common].filter((t) => !livingCount.get(t) && causesPerTrait.get(t)!.size === 1);
  const block = cands.filter(inBlock);
  const trait = cands.length === 1 ? cands[0] : (block.length === 1 ? block[0] : cands.join('/'));
  rows.push({ cause, n: gs.length, trait: '0x'+trait, extra: cands.length>1?`(dropped ${cands.filter(c=>'0x'+c!=='0x'+trait).map(c=>'0x'+c)})`:'' });
}
rows.sort((a,b)=>a.cause.localeCompare(b.cause));
for (const r of rows) console.log(`   ${r.cause.padEnd(22)} ${r.trait.padEnd(10)} [${r.n} ghost${r.n>1?'s':''}] ${r.extra}`);
