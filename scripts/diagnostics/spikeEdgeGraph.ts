/**
 * Build the full sim→sim reference graph for a save and query both directions
 * for a named sim. Catches one-directional relationships (where only the other
 * party stores the link) and fixed64-vs-varint encodings.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeEdgeGraph.ts <savePath> <name>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000092.save`;
const needle = (process.argv[3] || 'talbert').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const knownIds = new Set(data.sims.map((s) => s.id));
const hhBySim = new Map<bigint, string>();
for (const h of data.households) for (const id of h.simIds) hhBySim.set(id, h.name);
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}`.trim() : `?${id.toString(16)}`; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };

const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9;
  if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++;
  const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9;
  if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1);
  if (!knownIds.has(id)) continue;
  anchors.push({ id, start: i });
  i = pos;
}
anchors.sort((a, b) => a.start - b.start);

interface Edge { src: bigint; tgt: bigint; field: number; enc: 'v' | 'f'; }
const edges: Edge[] = [];
anchors.forEach((anc, idx) => {
  const end = idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, anc.start + 300_000);
  const seen = new Set<string>();
  function walk(s: number, e: number, depth: number, topField: number) {
    let p = s;
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) return; p = at;
      const tf = depth === 0 ? fn : topField;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v !== anc.id && knownIds.has(v)) { const k = `${tf}:${v}`; if (!seen.has(k)) { seen.add(k); edges.push({ src: anc.id, tgt: v, field: tf, enc: 'v' }); } } p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v !== anc.id && knownIds.has(v)) { const k = `${tf}:${v}`; if (!seen.has(k)) { seen.add(k); edges.push({ src: anc.id, tgt: v, field: tf, enc: 'f' }); } } p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l); if (ce > e) return; if (depth < 9) walk(cs, ce, depth + 1, tf); p = ce; }
      else if (wt === 5) p += 4; else return;
    }
  }
  walk(anc.start, end, 0, 0);
});

if (needle === '--list') {
  for (const h of [...data.households].sort((a, b) => b.simIds.length - a.simIds.length)) {
    const hum = h.simIds.map((id) => simById.get(id)).filter((s) => s && s.species === 'human');
    if (hum.length < 2) continue;
    console.log(`"${h.name}": ${hum.map((s) => `${s!.firstName} ${s!.lastName} (${s!.gender[0]},${s!.lifestage})`).join(', ')}`);
  }
  process.exit(0);
}

const matches = data.sims.filter((s) =>
  `${s.firstName} ${s.lastName}`.toLowerCase().includes(needle)
  || (hhBySim.get(s.id) ?? '').toLowerCase().includes(needle));
console.log(`Save ${savePath.split('/').pop()} — ${data.sims.length} sims, ${edges.length} edges total`);
for (const s of matches) {
  const myHh = hhBySim.get(s.id) ?? '?';
  console.log(`\n══ ${nm(s.id)} (${s.gender}, ${s.lifestage}) — household "${myHh}"`);
  const out = edges.filter((e) => e.src === s.id);
  const inc = edges.filter((e) => e.tgt === s.id);
  const fmt = (e: Edge, who: bigint) => {
    const t = simById.get(who);
    const cross = (hhBySim.get(who) ?? '?') !== myHh ? ' ⟂CROSS' : '';
    return `${nm(who)} (${t?.gender ?? '?'},${t?.lifestage ?? '?'}) [f${e.field}/${e.enc}]${cross}`;
  };
  console.log(`   OUT (${out.length}): ${out.map((e) => fmt(e, e.tgt)).join(', ') || '(none)'}`);
  console.log(`   IN  (${inc.length}): ${inc.map((e) => fmt(e, e.src)).join(', ') || '(none)'}`);

  // RAW: dump ALL sim-id-shaped values (≥2^48) in this sim's record, regardless
  // of whether the target was parsed — reveals partners pointing to missed sims.
  const idx = anchors.findIndex((a) => a.id === s.id);
  if (idx < 0) continue;
  const end = idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, anchors[idx].start + 300_000);
  const raw: { field: number; val: bigint; enc: string }[] = [];
  (function walk(st: number, e: number, depth: number, tfTop: number) {
    let p = st;
    while (p < e) {
      const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7;
      if (fn === 0 || at <= p) return; p = at; const tf = depth === 0 ? fn : tfTop;
      if (wt === 0) { const [v, n] = rv(buf, p); if (v >= (1n << 48n) && v !== s.id) raw.push({ field: tf, val: v, enc: 'v' }); p = n; }
      else if (wt === 1) { const v = f64(buf, p); if (v >= (1n << 48n) && v !== s.id) raw.push({ field: tf, val: v, enc: 'f' }); p += 8; }
      else if (wt === 2) { const [l, n] = rv(buf, p); const cs = n, ce = n + Number(l); if (ce > e) return; if (depth < 9) walk(cs, ce, depth + 1, tf); p = ce; }
      else if (wt === 5) p += 4; else return;
    }
  })(anchors[idx].start, end, 0, 0);
  const relFields = raw.filter((r) => [15, 30, 47].includes(r.field));
  console.log(`   RAW large vals in f15/f30/f47 (${relFields.length}): ${relFields.slice(0, 14).map((r) => `0x${r.val.toString(16)}[f${r.field}/${r.enc}]${knownIds.has(r.val) ? '=' + nm(r.val) : '=UNPARSED?'}`).join(', ') || '(none)'}`);

  // For f15/f47 fixed64 partner-shaped values that we didn't parse, check whether
  // a real sim record anchor (09 <id> 11) exists for them in the blob.
  const partnerCands = relFields.filter((r) => (r.field === 15 || r.field === 47) && r.enc === 'f' && !knownIds.has(r.val));
  for (const pc of partnerCands) {
    const need = new Uint8Array(8); let v = pc.val; for (let k = 0; k < 8; k++) { need[k] = Number(v & 0xffn); v >>= 8n; }
    let anchorHit = -1, refCount = 0;
    for (let i = 0; i < buf.length - 10; i++) {
      let ok = true; for (let k = 0; k < 8; k++) if (buf[i + k] !== need[k]) { ok = false; break; }
      if (!ok) continue;
      refCount++;
      if (buf[i - 1] === 0x09 && buf[i + 8] === 0x11) anchorHit = i - 1;
    }
    console.log(`   ↳ partner f${pc.field}=0x${pc.val.toString(16)}: appears ${refCount}× in blob; sim-record anchor ${anchorHit >= 0 ? `FOUND @${anchorHit} (real sim our parser MISSED)` : 'not found'}`);
  }
}
