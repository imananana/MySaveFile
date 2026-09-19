// Run the holiday parser across all saves; show holidays + their tradition IDs.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHolidays } from '../../src/lib/parser/holidays.js';
import { resolveStockHoliday } from '../../src/data/stockHolidays.js';

const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const SAVES = readdirSync(DIR).filter((f) => f.endsWith('.save'));
const allTraditions = new Set<string>();

for (const f of SAVES) {
  const b = readFileSync(`${DIR}/${f}`);
  let blob: Uint8Array | null = null;
  try {
    const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
  } catch { continue; }
  if (!blob) continue;
  const hols = scanHolidays(blob);
  if (!hols.length) continue;
  const customized = hols.filter((h) => h.name || h.traditions.length);
  console.log(`\n## ${f} — ${hols.length} holidays, ${customized.length} customized`);
  for (const h of hols) {
    const nm = h.name ?? resolveStockHoliday(h.holidayType)?.name ?? `?type ${h.holidayType.toString(16)}`;
    const trad = h.traditions.map((t) => '0x' + t.toString(16));
    h.traditions.forEach((t) => allTraditions.add('0x' + t.toString(16)));
    console.log(`  ${nm.padEnd(20)} ${h.season} d${h.day}${trad.length ? '  traditions=[' + trad.join(', ') + ']' : ''}`);
  }
}
console.log(`\n=== ${allTraditions.size} distinct tradition IDs across all saves ===`);
console.log([...allTraditions].sort().join('\n'));
