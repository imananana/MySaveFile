/**
 * One building's unit names, per save, oldest first — the shape that tells a
 * player rename apart from an EA renumbering. Zone ids are stable across saves,
 * so the same zone carrying a different name in a later save is a rename; a
 * name that differs in EVERY save including the oldest is what the game ships.
 *
 *   npx tsx scripts/diagnostics/diagChicStreetAcrossSaves.ts [field5]
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanLots } from '../../src/lib/parser/lots.js';

const TARGET = BigInt(process.argv[2] ?? '1504706562');
const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;

const files = readdirSync(DIR).filter((f) => f.endsWith('.save'))
  .map((f) => ({ f, m: statSync(`${DIR}/${f}`).mtimeMs }))
  .sort((a, b) => a.m - b.m);

for (const { f, m } of files) {
  let bl: Uint8Array | null = null;
  try {
    const b = readFileSync(`${DIR}/${f}`);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
      const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
      if (!bl || d.length > bl.length) bl = d;
    }
    if (!bl) continue;
    const units = [...scanLots(bl).values()].filter((l) => l.field5 === TARGET)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!units.length) continue;
    const date = new Date(m).toISOString().slice(0, 10);
    const names = units.map((u) => `${u.id.toString(16).slice(-3)}:"${u.name}"`).join('  ');
    console.log(`${date}  ${f.replace('.save', '').padEnd(26)} ${names}`);
  } catch { /* unreadable/partial save — skip */ }
}
