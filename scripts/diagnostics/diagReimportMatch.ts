/**
 * For every household with a lot assignment in the save, print:
 *   - Household name + game source_id
 *   - The lot record's id, field5, name
 *   - What `matchLot` resolves to (the planner lot_key, or null if no match)
 *
 * Goal: confirm whether the re-import sync bug (households getting booted
 * from their lot on routine updates) is caused by matchLot returning null,
 * or by something downstream.
 *
 * Usage:
 *   SAVE=/path/to/Slot_xxxxxxxx.save tsx scripts/diagnostics/diagReimportMatch.ts
 * Defaults to ~/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { matchLot } from '../../src/components/gameImport/lotMatching.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const saveData = parseSaveData(resources);

console.log(`Save: ${SAVE}`);
console.log(`Save name: ${saveData.saveName ?? '(none)'}`);
console.log(`Households: ${saveData.households.length}`);
console.log(`Lots: ${saveData.lots.length}`);
console.log('');

// Build lot lookups
const lotById = new Map<bigint, typeof saveData.lots[number]>();
for (const l of saveData.lots) lotById.set(l.id, l);

// Walk households
const rows: Array<{
  hhName: string;
  hhSourceId: string;
  hasLot: boolean;
  lotIdHex: string;
  field5: string;
  lotName: string;
  matched: string | null;
}> = [];

let lotsAssigned = 0;
let matched = 0;
let unmatched = 0;

for (const hh of saveData.households) {
  if (hh.lotId === null) {
    rows.push({
      hhName: hh.name || '(unnamed)',
      hhSourceId: hh.id.toString(16),
      hasLot: false,
      lotIdHex: '—',
      field5: '—',
      lotName: '—',
      matched: null,
    });
    continue;
  }
  lotsAssigned++;
  const lot = lotById.get(hh.lotId);
  if (!lot) {
    rows.push({
      hhName: hh.name || '(unnamed)',
      hhSourceId: hh.id.toString(16),
      hasLot: true,
      lotIdHex: hh.lotId.toString(16),
      field5: '(no lot record!)',
      lotName: '(no lot record!)',
      matched: null,
    });
    unmatched++;
    continue;
  }
  const resolved = matchLot(lot.field5, lot.name);
  if (resolved) matched++; else unmatched++;
  rows.push({
    hhName: hh.name || '(unnamed)',
    hhSourceId: hh.id.toString(16),
    hasLot: true,
    lotIdHex: hh.lotId.toString(16),
    field5: lot.field5 !== null ? lot.field5.toString() : '(null)',
    lotName: lot.name || '(empty)',
    matched: resolved,
  });
}

// Print
const COL = { hh: 28, src: 14, lotId: 12, f5: 14, lotName: 30, matched: 40 };
function pad(s: string, n: number) { return s.length >= n ? s.slice(0, n - 1) + '…' : s + ' '.repeat(n - s.length); }

console.log(pad('Household', COL.hh) + pad('source_id', COL.src) + pad('lot_id', COL.lotId) + pad('field5', COL.f5) + pad('lot name', COL.lotName) + 'matchLot →');
console.log('-'.repeat(COL.hh + COL.src + COL.lotId + COL.f5 + COL.lotName + COL.matched));

for (const r of rows) {
  const status = r.hasLot ? (r.matched ? `${r.matched}` : '✗ NO MATCH') : '— (no lot)';
  console.log(
    pad(r.hhName, COL.hh)
    + pad(r.hhSourceId, COL.src)
    + pad(r.lotIdHex, COL.lotId)
    + pad(r.field5, COL.f5)
    + pad(r.lotName, COL.lotName)
    + status,
  );
}

console.log('');
console.log(`Summary: ${lotsAssigned} households with a lot · ${matched} matched · ${unmatched} unmatched`);
if (unmatched > 0) {
  console.log('');
  console.log('Unmatched lot records (field5 to add to lotField5Map.ts if you want them mapped):');
  for (const r of rows) {
    if (r.hasLot && !r.matched) console.log(`  ${r.field5} → ${r.lotName}  (household: ${r.hhName})`);
  }
}
