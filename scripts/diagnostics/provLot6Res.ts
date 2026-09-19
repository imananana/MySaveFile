// For each ground-truth lot, find its resType=0x6 resource (instance == lot id) and
// report whether it embeds a tray-instance reference (0x02.... gallery id distinct
// from the lot id). Gallery-placed should have one; self-built should not.
import { readFileSync, existsSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const SIMS = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4`;
const b = readFileSync(`${SIMS}/saves/Slot_12345678.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

const LOTS: Record<string, string> = {
  'Cabin Fever (gallery, josephinanne)': '330c4fa04da938',
  'Iman Test House (self-built)':        '330c4fa04d9de5',
  'Raffia Quinta (unknown origin)':      '330c4fa04d9f8e',
};

function instMatches(r: { instHi: number; instLo: number }, lotHex: string): boolean {
  const full = (BigInt(r.instHi) << 32n) | BigInt(r.instLo >>> 0);
  return full === BigInt('0x' + lotHex);
}

for (const [label, lotHex] of Object.entries(LOTS)) {
  const r6 = res.find(r => r.type === 0x6 && instMatches(r, lotHex));
  if (!r6) { console.log(`${label}: no 0x6 resource`); continue; }
  let d: Buffer;
  try { d = Buffer.from(r6.compType === 0xffff ? decompressRefpack(r6.data) : r6.data); } catch { console.log(`${label}: 0x6 decode fail`); continue; }
  // collect distinct 8-byte LE ids, then keep ONLY those that have a real .trayitem on disk
  const seen = new Set<string>();
  const matchedTray: string[] = [];
  for (let i = 0; i + 8 <= d.length; i++) {
    const v = d.readBigUInt64LE(i);
    if (v < 0x1000000000000n) continue;
    const hx = v.toString(16);
    if (seen.has(hx)) continue; seen.add(hx);
    const fn = `${SIMS}/Tray/0x00000002!0x0${hx}.trayitem`;
    if (existsSync(fn)) matchedTray.push('0x0' + hx);
  }
  console.log(`${label}`);
  console.log(`   0x6 res size=${d.length}  distinct ids=${seen.size}  → ids with a real .trayitem on disk: ${matchedTray.length ? matchedTray.join(', ') : 'NONE'}`);
}
