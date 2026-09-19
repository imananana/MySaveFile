// Where does the ORIGINAL author (Rosanna) persist in a save she made but imanistan
// re-saved? Search all resources for her account id 0xea6e62c2fb + name strings, tally
// by resource type, and dump non-household contexts (looking for a save-level author field).
import { readFileSync } from 'fs';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const save = process.argv[2] ?? 'Slot_12345678.save';
const ACCT = process.argv[3] ?? '0xea6e62c2fb';
const NAMES = (process.argv[4] ?? 'Rosannajosephina,RosannaMeeder').split(',');
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

const acct = Buffer.alloc(8); acct.writeBigUInt64LE(BigInt(ACCT));
const acctTrim = acct.subarray(0, 5); // 0xea6e62c2fb is 5 bytes; search the 5-byte LE run

// resource type histogram
const typeHist = new Map<number, number>();
for (const r of res) typeHist.set(r.type, (typeHist.get(r.type) ?? 0) + 1);
console.log(`${save}: ${res.length} resources. Types: ${[...typeHist].map(([t, c]) => `0x${t.toString(16)}×${c}`).join(', ')}\n`);

const acctByType = new Map<number, number>();
const nameByType = new Map<string, Map<number, number>>();
for (const n of NAMES) nameByType.set(n, new Map());
const acctContexts: string[] = [];

for (const r of res) {
  let d: Buffer;
  try { d = Buffer.from(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch { continue; }
  // account id (8-byte LE) occurrences
  let from = 0, idx: number, cnt = 0;
  while ((idx = d.indexOf(acct, from)) >= 0) { cnt++; from = idx + 1; if (acctContexts.length < 8 && r.type !== 0xd) acctContexts.push(`resType=0x${r.type.toString(16)} inst=${instanceIdHex(r)} @${idx}`); }
  if (cnt) acctByType.set(r.type, (acctByType.get(r.type) ?? 0) + cnt);
  // name strings
  const s = d.toString('latin1');
  for (const n of NAMES) { let f = 0, i: number, c = 0; while ((i = s.indexOf(n, f)) >= 0) { c++; f = i + 1; } if (c) { const m = nameByType.get(n)!; m.set(r.type, (m.get(r.type) ?? 0) + c); } }
}

console.log(`Account id ${ACCT} (8-byte LE) by resource type:`);
for (const [t, c] of [...acctByType].sort((a, b) => b[1] - a[1])) console.log(`   resType 0x${t.toString(16)}: ${c}`);
if (!acctByType.size) console.log('   <none>');
console.log('\nNon-household (resType≠0xd) account-id contexts:');
for (const c of acctContexts) console.log(`   ${c}`);
if (!acctContexts.length) console.log('   <none — account id only appears in household records>');

console.log('\nName strings by resource type:');
for (const [n, m] of nameByType) console.log(`   "${n}": ${m.size ? [...m].map(([t, c]) => `0x${t.toString(16)}×${c}`).join(', ') : '<none>'}`);
