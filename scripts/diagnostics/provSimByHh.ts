// Resolve member sim ids from named households, then dump each member sim's full
// top-level field inventory — to find what marks an EA "signature" NPC (Father Winter)
// vs a premade (Goth) vs a floating pool townie. Usage: provSimByHh <save> "Hh1;Hh2"
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';
import { scanHouseholdRecords } from '../../src/lib/parser/households.js';

const save = process.argv[2] ?? 'Slot_1239123c.save';
const wantHh = (process.argv[3] ?? 'Father Winter;Goth;Cho').split(';').map(s => s.trim().toLowerCase());
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;

const hhs = scanHouseholdRecords(buf);
const wantSimIds = new Map<bigint, string>(); // simId -> household label
for (const h of hhs) if (wantHh.some(w => h.name.toLowerCase().includes(w))) for (const sid of h.simIds) wantSimIds.set(sid, h.name);

// index all sim anchors by simId
type A = { start: number; simId: bigint; hhId: bigint; first: string; last: string; bodyStart: number };
const anchors: A[] = []; const seen = new Set<bigint>();
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  const simId = readFixed64LE(buf, i + 1); let p = i + 9;
  if (buf[p] !== 0x11) continue; p++; p += 8;
  if (buf[p] !== 0x18) continue; p++; let ts, n; try { [ts, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p++; const hhId = readFixed64LE(buf, p); p += 8;
  if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
  if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
  if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
  if (buf[p] !== 0x38) continue;
  if (simId === 0n || seen.has(simId)) continue; seen.add(simId);
  anchors.push({ start: i, simId, hhId, first, last, bodyStart: p });
}

function dump(a: A, label: string, end: number) {
  console.log(`=== [${label}] ${a.first} ${a.last}  simId=0x${a.simId.toString(16)} ===`);
  let p = a.bodyStart, count = 0;
  while (p < end && count < 70) {
    if (buf[p] === 0) break;
    let tag: bigint, nn: number; try { [tag, nn] = readVarint(buf, p); } catch { break; }
    p = nn; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
    if (wt === 0) { const [v, x] = readVarint(buf, p); p = x; console.log(`   f${fn}/v0 = ${v}${v > 0xffffn ? ' (0x' + v.toString(16) + ')' : ''}`); }
    else if (wt === 1) { const v = readFixed64LE(buf, p); p += 8; console.log(`   f${fn}/f64 = 0x${v.toString(16)}`); }
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); const s = buf.slice(x, x + len); const txt = len > 0 && len < 60 && [...s].every(c => c >= 0x20 && c <= 0x7e); console.log(`   f${fn}/len${len}${txt ? ' "' + new TextDecoder().decode(s) + '"' : ''}`); p = x + len; }
    else if (wt === 5) { p += 4; console.log(`   f${fn}/f32`); } else break;
    count++;
  }
  console.log('');
}

const targets = anchors.filter(a => wantSimIds.has(a.simId));
console.log(`Resolved ${targets.length} member sims from households: ${[...new Set([...wantSimIds.values()])].join(', ')}\n`);
for (const a of targets.slice(0, 8)) {
  const idx = anchors.indexOf(a);
  const end = idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, a.bodyStart + 80000);
  dump(a, wantSimIds.get(a.simId)!, end);
}
