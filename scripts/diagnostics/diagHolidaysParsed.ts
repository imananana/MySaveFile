/**
 * End-to-end smoke-test of scanHolidays via parseSaveData. Confirms each save's
 * holidays merge calendar placements with stored customization records.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';
import { resolveStockHoliday } from '../src/data/stockHolidays.js';

const HOME = process.env.HOME;
const SAVES = (process.env.SAVES ?? 'Slot_10312032.save,Slot_02220000.save,Slot_0000000c.save').split(',');

for (const slot of SAVES) {
  const path = `${HOME}/Documents/Electronic Arts/The Sims 4/saves/${slot}`;
  console.log(`\n═══ ${slot} ═══`);
  try {
    const buf = readFileSync(path);
    const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const data = parseSaveData(resources);
    console.log(`  ${data.holidays.length} holidays`);
    for (const h of data.holidays) {
      const stock = resolveStockHoliday(h.holidayType);
      const resolvedName = h.name ?? stock?.name ?? '(unknown stock holiday)';
      const isCustomized = h.name !== null;
      console.log(
        `  ${resolvedName.padEnd(20)} ` +
        `type=0x${h.holidayType.toString(16).padEnd(8)} ` +
        `${h.season} day ${h.day} ` +
        `${isCustomized ? '[customized]' : '[stock]'} ` +
        (h.iconInstance ? `icon=${h.iconInstance.slice(0, 16)}` : '') +
        (h.traditions.length ? ` traditions=${h.traditions.length}` : ''),
      );
    }
  } catch (e) {
    console.error(`  FAILED: ${(e as Error).message}`);
  }
}
