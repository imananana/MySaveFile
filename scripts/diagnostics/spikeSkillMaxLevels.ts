// Group every skill in the StatisticTuning dump by its max level (= # of
// level_data keys), so we know how many distinct points->level curves exist.
import { readFileSync, readdirSync } from 'fs';
const DIR = `${process.env.HOME}/Documents/Skill`;
const files = readdirSync(DIR).filter((f) => f.endsWith('.xml'));
type Row = { id: string; name: string; max: number; ages: string };
const rows: Row[] = [];
for (const f of files) {
  const xml = readFileSync(`${DIR}/${f}`, 'utf8');
  // skill instance id from filename: ...!<16hex>.<name>.StatisticTuning.xml
  const m = f.match(/!0*([0-9A-Fa-f]+)\.([^.]+)\.StatisticTuning/);
  if (!m) continue;
  const id = '0x' + m[1].toLowerCase();
  const name = m[2];
  // only real skills: have <L n="level_data">
  if (!xml.includes('n="level_data"')) continue;
  const keys = [...xml.matchAll(/<T n="key">(\d+)<\/T>/g)].map((x) => Number(x[1]));
  const max = keys.length ? Math.max(...keys) : 0;
  const ages = (xml.match(/<L n="ages">([\s\S]*?)<\/L>/)?.[1].match(/<E>(\w+)<\/E>/g) || []).map((e) => e.replace(/<\/?E>/g, '')).join('/');
  rows.push({ id, name, max, ages });
}
// group by max level
const byMax = new Map<number, Row[]>();
for (const r of rows) (byMax.get(r.max) ?? byMax.set(r.max, []).get(r.max)!).push(r);
console.log(`${rows.length} skills with level_data\n`);
for (const max of [...byMax.keys()].sort((a, b) => b - a)) {
  const g = byMax.get(max)!;
  console.log(`=== max level ${max}  (${g.length} skills) ===`);
  for (const r of g.slice(0, 12)) console.log(`  ${r.id.padEnd(9)} ${r.name.padEnd(45)} [${r.ages}]`);
  if (g.length > 12) console.log(`  ... +${g.length - 12} more`);
  console.log();
}
