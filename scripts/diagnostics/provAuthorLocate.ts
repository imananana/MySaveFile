import { readFileSync } from 'fs';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const save = process.argv[2] ?? 'Slot_12345678.save';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
function dc(r: any): Buffer { try { return Buffer.from(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch { return Buffer.alloc(0); } }

// 1) count all creator-name strings across whole save
const main = dc(res.filter(r => r.type === 0xd).sort((a, b) => b.sizeDecomp - a.sizeDecomp)[0]);
const s = main.toString('latin1');
const NAMES = (process.argv[3] ?? 'RosannaMeeder,Rosannajosephina,imanistan,StefMaasDus,mc_population').split(',');
const FOCUS = process.argv[4] ?? 'RosannaMeeder';
for (const n of NAMES) {
  let f = 0, i: number, c = 0; while ((i = s.indexOf(n, f)) >= 0) { c++; f = i + 1; }
  console.log(`name "${n}" in 0xd: ${c}`);
}

// 2) context of first few RosannaMeeder + first imanistan — show preceding bytes to ID the field tag
console.log('\nRosannaMeeder contexts (12 bytes before):');
let f = 0, i: number, shown = 0;
while ((i = s.indexOf(FOCUS, f)) >= 0 && shown < 6) {
  f = i + 1; shown++;
  const ctx = [...main.subarray(i - 12, i + FOCUS.length + 12)].map(c => (c >= 0x20 && c <= 0x7e) ? String.fromCharCode(c) : `·${c.toString(16).padStart(2, '0')}·`).join('');
  console.log(`   @${i}: …${ctx}…`);
}
const im = s.indexOf('imanistan');
if (im >= 0) { const ctx = [...main.subarray(im - 12, im + 9)].map(c => (c >= 0x20 && c <= 0x7e) ? String.fromCharCode(c) : `·${c.toString(16).padStart(2, '0')}·`).join(''); console.log(`\nimanistan @${im}: …${ctx}…`); }

// 3) dump the singleton 0x14 resource (likely save metadata) — its printable strings
const meta = res.filter(r => r.type === 0x14);
console.log(`\n0x14 resources: ${meta.length}`);
for (const m of meta) {
  const d = dc(m);
  console.log(`   inst=${instanceIdHex(m)} size=${d.length} comp=${m.compType === 0xffff ? 'refpack' : 'raw'}`);
  const strs = d.toString('latin1').match(/[\x20-\x7e]{4,}/g) ?? [];
  for (const st of strs.slice(0, 40)) console.log(`      "${st}"`);
}
