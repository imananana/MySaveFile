// READ-ONLY: dump relationship-tracker records for the seeded relbit households.
// For each owner: the f11 sim-id list (resolved to names) and every f3 bit
// entry in the f16 payload as {bit, flags, f11 target-index → resolved name}.
//   relSeedDump.ts <save> <householdName> ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const hhNames = process.argv.slice(3).map((s) => s.toLowerCase());
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : '‹' + id.toString(16).slice(-6) + '›'; };

const targets: { hh: string; simId: bigint }[] = [];
for (const h of data.households) {
  if (hhNames.some((n) => h.name.toLowerCase().includes(n))) {
    for (const id of h.simIds) targets.push({ hh: h.name, simId: id });
  }
}
if (!targets.length) { console.log('no matching households. All household names:'); for (const h of data.households) console.log('  ' + h.name); process.exit(0); }

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const le = (id: bigint) => { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn); return b; };

// find the tracker record for an owner: `49 [owner 8b]` followed within 64b by `5a` (the id list)
function dumpOwner(simId: bigint): void {
  const pat = le(simId);
  for (let i = 0; i < buf.length - 9; i++) {
    if (buf[i] !== 0x49) continue;
    let ok = true; for (let j = 0; j < 8; j++) if (buf[i + 1 + j] !== pat[j]) { ok = false; break; }
    if (!ok) continue;
    // expect 5a soon after
    let p = i + 9;
    if (buf[p] !== 0x5a) continue;
    // parse f11 list
    const [l11, n11] = readVarint(buf, p + 1); let q = n11; const list: bigint[] = [];
    const e11 = n11 + Number(l11);
    if (buf[q] === 0x0a) { const [li, ni] = readVarint(buf, q + 1); q = ni; const ei = ni + Number(li); while (q + 8 <= ei) { list.push(readFixed64LE(buf, q)); q += 8; } }
    p = e11;
    // walk fields to f16
    const bits: { bit: string; idx: number | null; flags: string }[] = [];
    for (let guard = 0; guard < 30 && p < buf.length; guard++) {
      const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
      if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
      else if (wt === 1) p += 8; else if (wt === 5) p += 4;
      else if (wt === 2) {
        const [len, n] = readVarint(buf, p); const end = n + Number(len);
        if (fn === 16) {
          let q2 = n;
          while (q2 < end) {
            const [tb2, at2] = readVarint(buf, q2); const fn2 = Number(tb2) >> 3, wt2 = Number(tb2) & 7;
            if (fn2 === 0 || at2 <= q2) break; q2 = at2;
            if (wt2 === 0) { const [, nn] = readVarint(buf, q2); q2 = nn; }
            else if (wt2 === 1) q2 += 8; else if (wt2 === 5) q2 += 4;
            else if (wt2 === 2) {
              const [l2, n2] = readVarint(buf, q2); const e2 = n2 + Number(l2);
              if (fn2 === 3) {
                let r = n2; let bit = ''; let idx: number | null = null; const fl: string[] = [];
                while (r < e2) {
                  const [tb3, at3] = readVarint(buf, r); const fn3 = Number(tb3) >> 3, wt3 = Number(tb3) & 7;
                  if (fn3 === 0 || at3 <= r) break; r = at3;
                  if (wt3 === 0) { const [v, nn] = readVarint(buf, r); if (fn3 === 1) bit = '0x' + v.toString(16); else if (fn3 === 11) idx = Number(v); else fl.push(`f${fn3}=${v}`); r = nn; }
                  else if (wt3 === 1) { fl.push(`f${fn3}=fx64`); r += 8; } else if (wt3 === 5) r += 4;
                  else if (wt3 === 2) { const [l3, n3] = readVarint(buf, r); fl.push(`f${fn3}‹${Number(l3)}b›`); r = n3 + Number(l3); }
                  else break;
                }
                if (bit) bits.push({ bit, idx, flags: fl.join(',') });
              }
              q2 = e2;
            } else break;
          }
          break;
        }
        p = end;
      } else break;
    }
    console.log(`\n■ ${nm(simId)}  — list: [${list.map((x, k) => `${k}:${nm(x)}`).join(', ')}]`);
    if (!bits.length) console.log('   (no f3 bit entries)');
    for (const b of bits) console.log(`   bit ${b.bit.padEnd(9)} → idx ${b.idx === null ? '—' : b.idx} ${b.idx !== null && list[b.idx] !== undefined ? '(' + nm(list[b.idx]) + ')' : ''}  ${b.flags}`);
    return;
  }
  console.log(`\n■ ${nm(simId)} — NO tracker record found`);
}

let curHH = '';
for (const t of targets) {
  if (t.hh !== curHH) { curHH = t.hh; console.log(`\n══════ household "${t.hh}" ══════`); }
  dumpOwner(t.simId);
}
