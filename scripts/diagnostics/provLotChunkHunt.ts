// Ground-truth lot provenance hunt. Slot_00000007:
//   "Iman Test House"  = built by user (imanistan)
//   "Cabin Fever"      = downloaded gallery lot by "josephinanne"
// Search EVERY DBPF resource (decompressed) for these strings + creator names,
// and report which resource (type/instance) carries them, with byte context.
import { readFileSync } from 'fs';
import { parseDbpf, instanceIdHex } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const save = process.argv[2] ?? 'Slot_00000007.save';
const path = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`;
const b = readFileSync(path);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

const NEEDLES = ['josephinanne', 'Iman Test House', 'Cabin Fever', 'imanistan'];

console.log(`${save}: ${res.length} DBPF resources. Searching for: ${NEEDLES.join(', ')}\n`);

// resource type histogram for context
const typeCount = new Map<number, number>();
for (const r of res) typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);

const hits = new Map<string, Map<number, number>>(); // needle -> (resourceType -> count)
for (const n of NEEDLES) hits.set(n, new Map());

for (const r of res) {
  let d: Uint8Array;
  try { d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; } catch { continue; }
  const s = Buffer.from(d).toString('latin1');
  for (const n of NEEDLES) {
    let i = -1, c = 0;
    while ((i = s.indexOf(n, i + 1)) >= 0) c++;
    if (c > 0) {
      const m = hits.get(n)!;
      m.set(r.type, (m.get(r.type) ?? 0) + c);
      // show context for the first hit per resource
      const off = s.indexOf(n);
      const ctx = [...Buffer.from(d.slice(Math.max(0, off - 8), off + n.length + 6))]
        .map(ch => (ch >= 0x20 && ch <= 0x7e) ? String.fromCharCode(ch) : `·${ch.toString(16).padStart(2, '0')}·`).join('');
      console.log(`HIT "${n}" ×${c} in resType=0x${r.type.toString(16)} inst=${instanceIdHex(r)} comp=${r.compType === 0xffff ? 'refpack' : 'raw'}`);
      console.log(`     ctx: …${ctx}…`);
    }
  }
}

console.log('\nSummary (needle → resourceType×count):');
for (const [n, m] of hits) {
  const parts = [...m].map(([t, c]) => `0x${t.toString(16)}×${c}`).join(', ') || '<none>';
  console.log(`   ${n}: ${parts}`);
}
