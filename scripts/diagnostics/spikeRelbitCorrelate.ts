/**
 * SPIKE: crack the Partner + Ex-spouse relationship-bit tuning IDs by
 * correlation on the seeded ground truth. Parses each relationship sub-object in
 * a sim's f47 blob (correct protobuf walk: only recurse into a length field if it
 * cleanly re-parses as a message), gathers the tuning-bit values attached to each
 * target sim, then:
 *   PARTNER = bits common to Penny↔Akira AND Penny↔Faiz, minus Penny↔Rico (acq).
 *   EX      = bits common across the two divorces, minus a married + a partner pair.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeRelbitCorrelate.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byName = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(n.toLowerCase()));
const knownIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

// anchors → extents
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const extById = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => extById.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// Does [s,e) parse cleanly as a protobuf message? (used to decide recurse vs bytes)
function isMessage(s: number, e: number): boolean {
  let p = s; let fields = 0;
  while (p < e) {
    const [tb, at] = rv(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || fn > 60000 || at <= p) return false; p = at;
    if (wt === 0) { const [, n] = rv(buf, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) return false; p = ce; }
    else if (wt === 5) p += 4; else return false;
    fields++;
  }
  return p === e && fields > 0;
}

// Walk a message; for every sub-message that contains exactly ONE known-sim id,
// record (target → set of tuning-ish values within that submessage + descendants).
function relationBits(start: number, end: number, selfId: bigint): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  function collectScalars(s: number, e: number, acc: bigint[], sims: bigint[]) {
    let p = s;
    while (p < e) {
      const [tb, at] = rv(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
      if (fn === 0 || at <= p) return; p = at;
      if (wt === 0) { const [v, n] = rv(buf, p); if (knownIds.has(v) && v !== selfId) sims.push(v); else if (v >= 0x10000n) acc.push(v); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (knownIds.has(v) && v !== selfId) sims.push(v); else if (v >= 0x10000n) acc.push(v); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce > e) return; if (isMessage(n, ce)) collectScalars(n, ce, acc, sims); p = ce; }
      else if (wt === 5) p += 4; else return;
    }
  }
  function walk(s: number, e: number, depth: number) {
    let p = s;
    while (p < e) {
      const [tb, at] = rv(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
      if (fn === 0 || at <= p) return; p = at;
      if (wt === 0) { const [, n] = rv(buf, p); p = n; }
      else if (wt === 1) p += 8;
      else if (wt === 2) {
        const [l, n] = rv(buf, p); const ce = n + Number(l);
        if (ce <= e && isMessage(n, ce)) {
          const acc: bigint[] = []; const sims: bigint[] = [];
          collectScalars(n, ce, acc, sims);
          if (sims.length === 1) {
            const k = sims[0].toString();
            if (!out.has(k)) out.set(k, new Set());
            for (const b of acc) out.get(k)!.add('0x' + b.toString(16));
          } else if (depth < 12) walk(n, ce, depth + 1);
          p = ce;
        } else p = ce;
      }
      else if (wt === 5) p += 4; else return;
    }
  }
  walk(start, end, 0);
  return out;
}

function bitsFor(simName: string, targetName: string): Set<string> {
  const s = byName(simName); const t = byName(targetName);
  if (!s || !t) { console.log(`  ! missing ${simName}/${targetName}`); return new Set(); }
  const ext = extById.get(s.id); if (!ext) return new Set();
  const rels = relationBits(ext[0], ext[1], s.id);
  return rels.get(t.id.toString()) ?? new Set();
}
const inter = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));
const minus = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => !b.has(x)));

console.log(`Save: ${savePath.split('/').pop()}\n`);

// ---- PARTNER ----
const pAkira = bitsFor('Penny Pizzazz', 'Akira Kibo');
const pFaiz = bitsFor('Penny Pizzazz', 'Faiz Jaleel');
const pRico = bitsFor('Penny Pizzazz', 'Rico Riggs');
console.log(`Penny→Akira bits: ${pAkira.size}, Penny→Faiz: ${pFaiz.size}, Penny→Rico: ${pRico.size}`);
const partnerCand = minus(inter(pAkira, pFaiz), pRico);
console.log(`PARTNER candidate(s) [in Akira ∩ Faiz, not Rico]: ${[...partnerCand].join(', ') || '(none — bits not co-located with target?)'}\n`);

// ---- EX-SPOUSE ----
const exPairs = [['Eric Lewis', 'Alice Spencer-Kim'], ['Alice Spencer-Kim', 'Eric Lewis'], ['Bob Pancakes', 'Eliza Pancakes'], ['Eliza Pancakes', 'Bob Pancakes']];
const exSets = exPairs.map(([a, b]) => bitsFor(a, b));
exSets.forEach((s, i) => console.log(`${exPairs[i][0]}→${exPairs[i][1]} bits: ${s.size}`));
let exCand = exSets[0];
for (const s of exSets.slice(1)) exCand = inter(exCand, s);
// subtract a current-partner and a married pair (shouldn't carry the "ex" bit)
exCand = minus(exCand, pAkira);
console.log(`EX candidate(s) [common to all divorces, not the partner pair]: ${[...exCand].join(', ') || '(none — bits not co-located with target?)'}`);
