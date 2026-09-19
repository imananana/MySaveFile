// READ-ONLY: parse the relationship SERVICE records (pre-sims section of the
// 0x0d blob): f1=simA(varint) f2=simB(varint) f3{ f1=packed relbit tuning ids,
// f2=timed bits {id,timeout}, f3=tracks {id,float score} }.
// This is the canonical pair store — true RelationshipBit ids + raw scores.
//   relService.ts <save> [householdNameFilter ...]
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint } from '../../src/lib/parser/protobuf.js';

const BIT: Record<string, string> = {
  '15811': 'romantic-Broken_Up', '15812': 'romantic-Broken_Up_Engaged', '15814': 'romantic-Despised_Ex',
  '15815': 'romantic-Divorced', '15816': 'romantic-Engaged', '15817': 'romantic-Frustrated_Ex',
  '15818': 'romantic-GettingMarried', '15821': 'romantic-LeftAtTheAltar', '15822': 'romantic-Married',
  '15825': 'romantic-Significant_Other', '99429': 'romantic-Promised', '97332': 'ShortTerm_JustBrokeUpOrDivorced',
  '98756': 'HaveBeenRomantic', '34619': 'HaveDoneWooHoo', '97154': 'HaveDoneWooHoo_Recently',
  '24490': 'family_husband_wife', '8802': 'family_brother_sister', '8805': 'family_son_daughter',
  '8807': 'family_grandchild', '8808': 'family_grandparent', '8809': 'family_parent',
  '8824': 'family_stepsibling', '8826': 'family_cousin', '8829': 'family_aunt_uncle', '9989': 'family_niece_nephew',
  '15794': 'friendship-bff', '15799': 'friendship-good_friends',
};
const bn = (v: bigint) => BIT[v.toString()] ?? '0x' + v.toString(16);

const savePath = process.argv[2];
const hhFilter = process.argv.slice(3).map((s) => s.toLowerCase());
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : '?'; };
const wanted = new Set<string>();
if (hhFilter.length) for (const h of data.households) if (hhFilter.some((f) => h.name.toLowerCase().includes(f))) for (const id of h.simIds) wanted.add(id.toString(16));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

let found = 0;
for (let i = 0; i < buf.length - 24; i++) {
  if (buf[i] !== 0x0a) continue;
  const [len, n] = readVarint(buf, i + 1);
  if (Number(len) < 12 || Number(len) > 4096 || n + Number(len) > buf.length) continue;
  let p = n; const end = n + Number(len);
  if (buf[p] !== 0x08) continue;
  const [idA, n2] = readVarint(buf, p + 1); if (!simIds.has(idA)) continue;
  p = n2; if (buf[p] !== 0x10) continue;
  const [idB, n3] = readVarint(buf, p + 1); if (!simIds.has(idB)) continue;
  p = n3;
  found++;
  const show = !hhFilter.length || wanted.has(idA.toString(16)) || wanted.has(idB.toString(16));
  if (!show) { i = end - 1; continue; }
  const bits: bigint[] = []; const timed: { id: bigint; v: number }[] = []; const tracks: { id: bigint; v: number }[] = [];
  // walk remaining fields of the record; f3 = the bit/track container
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [, nn] = readVarint(buf, p); p = nn; }
    else if (wt === 1) p += 8; else if (wt === 5) p += 4;
    else if (wt === 2) {
      const [l2, m2] = readVarint(buf, p); const e2 = m2 + Number(l2);
      if (fn === 3) {
        let q = m2;
        while (q < e2) {
          const [tb2, at2] = readVarint(buf, q); const fn2 = Number(tb2) >> 3, wt2 = Number(tb2) & 7;
          if (fn2 === 0 || at2 <= q) break; q = at2;
          if (wt2 === 2 && fn2 === 1) { const [l3, m3] = readVarint(buf, q); const e3 = m3 + Number(l3); let r = m3; while (r < e3) { const [v, rr] = readVarint(buf, r); bits.push(v); r = rr; } q = e3; }
          else if (wt2 === 2 && (fn2 === 2 || fn2 === 3)) {
            const [l3, m3] = readVarint(buf, q); const e3 = m3 + Number(l3);
            let r = m3; let id = 0n; let fl = 0;
            while (r < e3) {
              const [tb3, at3] = readVarint(buf, r); const fn3 = Number(tb3) >> 3, wt3 = Number(tb3) & 7;
              if (fn3 === 0 || at3 <= r) break; r = at3;
              if (wt3 === 0) { const [v, rr] = readVarint(buf, r); if (fn3 === 1) id = v; r = rr; }
              else if (wt3 === 5) { if (fn3 === 2) { fl = new DataView(buf.buffer, buf.byteOffset + r, 4).getFloat32(0, true); } r += 4; }
              else if (wt3 === 1) r += 8;
              else if (wt3 === 2) { const [l4, m4] = readVarint(buf, r); r = m4 + Number(l4); }
              else break;
            }
            (fn2 === 2 ? timed : tracks).push({ id, v: fl });
            q = e3;
          }
          else if (wt2 === 0) { const [, qq] = readVarint(buf, q); q = qq; }
          else if (wt2 === 1) q += 8; else if (wt2 === 5) q += 4;
          else if (wt2 === 2) { const [l3, m3] = readVarint(buf, q); q = m3 + Number(l3); }
          else break;
        }
      }
      p = e2;
    } else break;
  }
  console.log(`\n● ${nm(idA)} ↔ ${nm(idB)}`);
  if (bits.length) console.log(`   bits:   ${bits.map(bn).join(', ')}`);
  for (const t of timed) console.log(`   timed:  ${bn(t.id)}  (${t.v.toFixed(1)})`);
  for (const t of tracks) console.log(`   track:  ${t.id === 16650n ? 'FRIENDSHIP' : t.id === 16651n ? 'ROMANCE' : bn(t.id)} = ${t.v.toFixed(1)}`);
  i = end - 1;
}
console.log(`\n(${found} service records total)`);
