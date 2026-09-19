// Dump full top-level field inventory of SIM records by name, to find what marks a
// "signature" EA NPC (Father Winter) vs a generic resident townie vs a player-made sim.
// Sim anchor: 0x09 [8 simId] 0x11 [8 lotId] 0x18 [varint ts] 0x21 [8 hhId] 0x2a first 0x32 last 0x38 gender ...
// Usage: npx tsx scripts/diagnostics/provSimFields.ts <save> "First Last;First Last;..."
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2] ?? 'Slot_1239123c.save';
const wants = (process.argv[3] ?? 'Father Winter').split(';').map(s => s.trim().toLowerCase());
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;

type Anchor = { start: number; simId: bigint; lotId: bigint; ts: bigint; hhId: bigint; first: string; last: string; bodyStart: number };
const anchors: Anchor[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  let p = i + 10; if (p + 8 > buf.length) continue;
  const simId = readFixed64LE(buf, p); p += 8;
  if (buf[p] !== 0x11) continue; // already checked but keep p aligned
  // we consumed 0x11 marker as buf[i+9]; lotId follows
  // NOTE: buf[i+9]===0x11 is the lotId tag; read lotId now
  // Actually p currently points right after simId at the 0x11 byte. Re-handle:
  // (simpler: re-derive)
  p = i + 10; const lotTag = buf[p + 8];
  // read lotId
  const simId2 = readFixed64LE(buf, i + 1); // tag 0x09 then 8 bytes simId at i+1
  void simId2;
  break;
}

// The inline anchor reading above is fiddly; do it cleanly:
anchors.length = 0; seen.clear();
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  const simId = readFixed64LE(buf, i + 1);
  let p = i + 9;
  if (buf[p] !== 0x11) continue; p++;
  const lotId = readFixed64LE(buf, p); p += 8;
  if (buf[p] !== 0x18) continue; p++;
  let ts: bigint, n: number; try { [ts, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p++;
  const hhId = readFixed64LE(buf, p); p += 8;
  if (buf[p] !== 0x2a) continue; p++;
  let first: string, last = '';
  try { [first, p] = readString(buf, p); } catch { continue; }
  if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
  if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
  if (buf[p] !== 0x38) continue; // gender tag — validates this is a real sim record
  if (simId === 0n || seen.has(simId)) continue; seen.add(simId);
  anchors.push({ start: i, simId, lotId, ts, hhId, first, last, bodyStart: p });
}

console.log(`${save}: ${anchors.length} sim records\n`);

function dump(a: Anchor, end: number) {
  console.log(`=== ${a.first} ${a.last}  simId=0x${a.simId.toString(16)}  hhId=0x${a.hhId.toString(16)}  ts=${a.ts}  lot=${a.lotId ? '0x'+a.lotId.toString(16) : '—'} ===`);
  let p = a.bodyStart, count = 0;
  while (p < end && count < 60) {
    if (buf[p] === 0) break;
    let tag: bigint, n: number;
    try { [tag, n] = readVarint(buf, p); } catch { break; }
    p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, nn] = readVarint(buf, p); p = nn; console.log(`   f${fn}/v0 = ${v}${v > 0xffffn ? ' (0x'+v.toString(16)+')' : ''}`); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; console.log(`   f${fn}/f64 = 0x${v.toString(16)}`); }
    else if (wt === 2) { const [l, nn] = readVarint(buf, p); const len = Number(l); const s = buf.slice(nn, nn + len); const txt = len > 0 && len < 60 && [...s].every(c => c >= 0x20 && c <= 0x7e); console.log(`   f${fn}/len${len}${txt ? ' "' + new TextDecoder().decode(s) + '"' : ''}`); p = nn + len; }
    else if (wt === 5) { p += 4; console.log(`   f${fn}/f32`); }
    else break;
    count++;
  }
  console.log('');
}

for (const w of wants) {
  const matches = anchors.filter(a => `${a.first} ${a.last}`.trim().toLowerCase().includes(w));
  if (!matches.length) { console.log(`(no sim matching "${w}")\n`); continue; }
  for (const a of matches.slice(0, 2)) {
    const idx = anchors.indexOf(a);
    const end = idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, a.bodyStart + 80000);
    dump(a, end);
  }
}
