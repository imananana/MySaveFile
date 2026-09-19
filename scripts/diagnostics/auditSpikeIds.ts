// Cross-check every hardcoded id in spike_mod.py against the VERIFIED catalogs.
import { STOCK_CAREERS } from '../../src/data/stockCareers.js';
import { STOCK_SKILLS } from '../../src/data/stockSkills.js';
import { earnedDegreeFromTrait } from '../../src/data/stockDegrees.js';

const c = (h: string) => STOCK_CAREERS[h]?.name ?? '❌ NOT IN CATALOG';
const s = (h: string) => STOCK_SKILLS[h] ?? '❌ NOT IN CATALOG';
const d = (h: string) => { const e = earnedDegreeFromTrait(h); return e ? `${e.subject} (${e.school}${e.honors ? ', Honors' : ''})` : '❌ NOT IN CATALOG'; };

const rows: [string, string, string][] = [
  ['CAREER 0x240f', c('0x240f'), 'Culinary'],
  ['CAREER 0x6d1a', c('0x6d1a'), 'Painter'],
  ['CAREER 0x6d1d', c('0x6d1d'), 'Writer'],
  ['SKILL  0x4141', s('0x4141'), 'Cooking'],
  ['SKILL  0x4142', s('0x4142'), 'Logic'],
  ['SKILL  0x4113', s('0x4113'), 'Fitness'],
  ['TRAIT  0x35435', d('0x35435'), 'Culinary Arts'],
];
let ok = true;
for (const [id, got, expect] of rows) {
  const pass = got.toLowerCase().includes(expect.toLowerCase());
  if (!pass) ok = false;
  console.log(`${pass ? '✅' : '❌'} ${id} -> ${got}   (expect ${expect})`);
}
console.log(ok ? '\nALL IDS VERIFIED AGAINST CATALOGS' : '\n⚠️ MISMATCH FOUND');
