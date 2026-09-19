/**
 * Walk every lot in a .save and print the venue tuning ID we detect for it,
 * along with whether that ID is already mapped in VENUE_TUNING_MAP.
 *
 * Usage:
 *   SAVE=/path/to/Slot_XXXXX.save npx tsx scripts/diagVenueTunings.ts
 * or just:
 *   npx tsx scripts/diagVenueTunings.ts                  # uses default save
 *
 * Output: one line per lot, sorted with UNKNOWN entries first so the user
 * can identify them in-game and report back. Each line shows lot name,
 * field5, the detected tuning ID (hex), and the matched planner type
 * or [UNKNOWN].
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';
import { parseSaveData, parseLotChunk, detectLotTypeFromLDNB, VENUE_TUNING_MAP, HIDDEN_VENUE_TUNINGS } from '../src/lib/saveParser.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;

console.log(`Loading save: ${SAVE}\n`);
const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const save = parseSaveData(resources);
const lotsById = new Map(save.lots.map((l) => [l.id, l]));
const lotsByInstLo = new Map<number, typeof save.lots>();
for (const l of save.lots) {
  const lo = Number(l.id & 0xffffffffn);
  if (!lotsByInstLo.has(lo)) lotsByInstLo.set(lo, []);
  lotsByInstLo.get(lo)!.push(l);
}

interface Row {
  name: string;
  field5: string;
  tuningHex: string;
  matched: string | null;
}
const rows: Row[] = [];
const noTuning: string[] = [];

for (const r of resources.filter((x) => x.type === 0x06 && x.compType === 0xffff)) {
  const targets = lotsByInstLo.get(r.instLo);
  if (!targets) continue;
  try {
    const raw = decompressRefpack(r.data);
    const parsed = parseLotChunk(raw);
    if (!parsed) continue;
    const lot = lotsById.get(parsed.lotId);
    if (!lot) continue;
    const tuning = detectLotTypeFromLDNB(parsed.ldnb);
    if (tuning === null) {
      noTuning.push(`${lot.name} (field5=${lot.field5 ?? 'none'})`);
      continue;
    }
    const hex = '0x' + tuning.toString(16);
    const matched = HIDDEN_VENUE_TUNINGS.has(hex)
      ? '[hidden in-game lot]'
      : (VENUE_TUNING_MAP[hex] ?? null);
    rows.push({
      name: lot.name,
      field5: lot.field5?.toString() ?? '—',
      tuningHex: hex,
      matched,
    });
  } catch (e) {
    console.error(`Failed to parse lot chunk for instLo=${r.instLo}:`, (e as Error).message);
  }
}

// Sort: unknowns first, then by tuning ID (so same-type lots group)
rows.sort((a, b) => {
  if (!a.matched && b.matched) return -1;
  if (a.matched && !b.matched) return 1;
  if (a.tuningHex !== b.tuningHex) return a.tuningHex.localeCompare(b.tuningHex);
  return a.name.localeCompare(b.name);
});

// Tally
const tally = new Map<string, { type: string | null; count: number; samples: string[] }>();
for (const r of rows) {
  const e = tally.get(r.tuningHex) ?? { type: r.matched, count: 0, samples: [] };
  e.count++;
  if (e.samples.length < 3) e.samples.push(r.name);
  tally.set(r.tuningHex, e);
}

console.log('═══ Per-lot detection ═══');
console.log('NAME'.padEnd(38), 'FIELD5'.padEnd(13), 'TUNING'.padEnd(12), 'MATCHED');
console.log('─'.repeat(90));
for (const r of rows) {
  console.log(
    r.name.slice(0, 36).padEnd(38),
    r.field5.padEnd(13),
    r.tuningHex.padEnd(12),
    r.matched ?? '[UNKNOWN]',
  );
}

if (noTuning.length) {
  console.log(`\n═══ Lots with no detectable tuning ID (${noTuning.length}) ═══`);
  for (const n of noTuning) console.log('  ' + n);
}

console.log('\n═══ Tuning ID tally ═══');
const sortedTally = [...tally.entries()].sort((a, b) => {
  if (!a[1].type && b[1].type) return -1;
  if (a[1].type && !b[1].type) return 1;
  return b[1].count - a[1].count;
});
for (const [hex, info] of sortedTally) {
  const label = info.type ?? '[UNKNOWN]';
  console.log(`  ${hex.padEnd(12)} ×${String(info.count).padStart(3)}  ${label.padEnd(28)}  e.g. ${info.samples.join(', ')}`);
}

const unknowns = sortedTally.filter(([, info]) => !info.type);
console.log(`\n${unknowns.length} unknown tuning ID${unknowns.length === 1 ? '' : 's'}. Tell me what each is in-game and I'll add to the map.`);
