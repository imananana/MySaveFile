// Full per-household field inventory hunt for a PROVENANCE marker.
// Walks every top-level field of each HouseholdData record (not just money/sims/desc/played),
// summarises each field type, prints detail for named ground-truth households, and a
// cross-household variance table so we can spot a field that partitions by origin.
// Usage: npx tsx scripts/diagnostics/provHhFields.ts [saveName]
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const name = process.argv[2] ?? 'Slot_00000007.save';
const GROUND_TRUTH = new Set((process.argv[3] ?? 'Kitchen,Base Sim').split(',').map(s => s.trim())); // detailed dump for these
const path = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${name}`;
const b = readFileSync(path);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

// anchors (same heuristic as households.ts)
const anchors: { start: number; id: bigint; name: string; bodyStart: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  let pos = i + 10; if (pos + 8 > buf.length) continue;
  const id = readFixed64LE(buf, pos); pos += 8;
  if (buf[pos] !== 0x1a) continue; pos++;
  const [nm, an] = readString(buf, pos);
  if (!nm || nm.length < 2 || nm.length > 60 || !/^[\x20-\x7e]+$/.test(nm) || nm.includes('_')) continue;
  pos = an; if (buf[pos] !== 0x21) continue; pos++; pos += 8;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ start: i, id, name: nm, bodyStart: pos });
}

type FieldSummary = { fn: number; wt: number; detail: string; rawVal?: string };
function walkFields(start: number, end: number): FieldSummary[] {
  const out: FieldSummary[] = [];
  let p = start;
  while (p < end) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) {
      const [v, nn] = readVarint(buf, p); p = nn;
      out.push({ fn, wt, detail: `varint ${v}`, rawVal: v.toString() });
    } else if (wt === 1) {
      const v = readFixed64LE(buf, p); p += 8;
      out.push({ fn, wt, detail: `fx64 0x${v.toString(16)}`, rawVal: '0x' + v.toString(16) });
    } else if (wt === 2) {
      const [l, nn] = readVarint(buf, p); const len = Number(l); const vEnd = nn + len;
      if (l < 0n || vEnd > end) break;
      const slice = buf.slice(nn, vEnd);
      // ascii preview
      const printable = [...slice].filter(c => c >= 0x20 && c <= 0x7e).length;
      const isText = len > 0 && printable / len > 0.85;
      // nested field numbers (best-effort submessage peek)
      let nested = '';
      if (!isText && len > 1 && len < 4000) {
        const fns: number[] = [];
        let q = nn;
        while (q < vEnd && fns.length < 12) {
          let t: bigint, qn: number;
          try { [t, qn] = readVarint(buf, q); } catch { break; }
          const f = Number(t >> 3n), w = Number(t & 7n); q = qn;
          if (f === 0 || f > 200) break;
          fns.push(f);
          if (w === 0) { try { [, q] = readVarint(buf, q); } catch { break; } }
          else if (w === 1) q += 8;
          else if (w === 2) { let il: bigint, iqn: number; try { [il, iqn] = readVarint(buf, q); } catch { break; } q = iqn + Number(il); }
          else if (w === 5) q += 4; else break;
        }
        nested = `msg{${[...new Set(fns)].join(',')}} len=${len}`;
      }
      const detail = isText ? `str "${new TextDecoder().decode(slice).slice(0, 40)}"` : (nested || `bytes len=${len}`);
      out.push({ fn, wt, detail });
      p = vEnd;
    } else if (wt === 5) { p += 4; out.push({ fn, wt, detail: 'fx32' }); }
    else break;
  }
  return out;
}

const perHh: { name: string; id: bigint; fields: FieldSummary[] }[] = [];
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai];
  const end = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, a.bodyStart + 300000);
  perHh.push({ name: a.name, id: a.id, fields: walkFields(a.bodyStart, end) });
}

console.log(`${name}: ${perHh.length} households\n`);

// 1) Detailed dump of ground-truth households
for (const h of perHh.filter(h => GROUND_TRUTH.has(h.name))) {
  console.log(`=== ${h.name}  (id=0x${h.id.toString(16)}) ===`);
  for (const f of h.fields) console.log(`   f${f.fn}/wt${f.wt}: ${f.detail}`);
  console.log('');
}

// 2) Field presence across ALL households: which field numbers appear, in how many
const presence = new Map<string, number>(); // "fn/wt" -> count
for (const h of perHh) {
  const distinct = new Set(h.fields.map(f => `${f.fn}/${f.wt}`));
  for (const k of distinct) presence.set(k, (presence.get(k) ?? 0) + 1);
}
console.log(`Field presence across ${perHh.length} households (fn/wt → #households that have it):`);
for (const [k, c] of [...presence].sort((a, b) => a[1] - b[1])) {
  const flag = c < perHh.length ? '  <-- NOT universal' : '';
  console.log(`   ${k}: ${c}${flag}`);
}
