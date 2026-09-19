import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanCustomVenues } from '../../src/lib/parser/customVenues.js';
import { STOCK_ACTIVITIES } from '../../src/data/stockActivities.js';

const SAVE = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const b = readFileSync(SAVE);
const r = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).find(x => x.type === 0x0d)!;
const blob = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;

const act = (id: number | null) => id ? (STOCK_ACTIVITIES[String(id)]?.name ?? `?${id}`) : '—';
const venues = scanCustomVenues(blob);
console.log(`found ${venues.length} custom venue(s)\n`);
for (const v of venues) {
  console.log(`■ "${v.name}"  (${v.roles.length} roles, ${v.slots.length} slots)`);
  for (const role of v.roles) {
    const crit = role.criteria.map(c => `${c.type}=${c.value}${c.required ? '*' : ''}`).join(', ') || 'none';
    const acts = role.activities.map(act).join(', ') || 'none';
    console.log(`   • ${role.name} [#${role.index}] x${role.simCount}  outfit:${role.outfit.mode}  criteria:{${crit}}  activities:[${acts}]`);
  }
  for (const s of v.slots) {
    console.log(`   ⏰ ${String(s.hour).padStart(2,'0')}:00  main:${act(s.mainActivity)}  assigns:[${s.assignments.map(a => `role#${a.roleIndex}${a.activityOverride ? `→${act(a.activityOverride)}` : ''}${a.outfitOverride ? `+outfit(${a.outfitOverride.mode})` : ''}`).join(', ')}]`);
  }
  console.log();
}
