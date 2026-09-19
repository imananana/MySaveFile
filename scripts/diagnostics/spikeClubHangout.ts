/* Club hangout "general venue type" spike. Dump every raw field of the Testy
 * Club record across save 0000007's .ver ladder, to locate where the venue-type
 * id lives when hangout = General Venue (f22=1). Seeded sequence (user):
 *   Streamlet Single (specific lot) -> Any Arts Center -> Any Custom Venue -> None
 * Run: npx tsx scripts/diagnostics/spikeClubHangout.ts */
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields } from '../../src/lib/parser/protobuf.js';

const SDIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const FILES = readdirSync(SDIR)
  .filter((f) => /^Slot_00000007\.save(\..*)?$/.test(f))
  .sort();

function blobOf(p: string): Uint8Array | null {
  try {
    const b = readFileSync(p);
    const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    let bl: Uint8Array | null = null;
    for (const r of res.filter((r) => r.type === 0x0d)) {
      const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
      if (!bl || d.length > bl.length) bl = d;
    }
    return bl;
  } catch { return null; }
}

// Dump top-level fields of a club record as fn(wire)=value.
function dumpFields(buf: Uint8Array): string[] {
  const out: string[] = [];
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, at: number;
    try { [fn, wire, at] = readTag(buf, p); } catch { break; }
    if (fn === 0) break;
    p = at;
    if (wire === 0) { const [v, n] = readVarint(buf, p); p = n; out.push(`f${fn}=varint ${v} (0x${v.toString(16)})`); }
    else if (wire === 1) { const v = readFixed64LE(buf, p); p += 8; out.push(`f${fn}=fixed64 ${v} (0x${v.toString(16)})`); }
    else if (wire === 5) { p += 4; out.push(`f${fn}=fixed32`); }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); const sub = buf.slice(n, end); p = end; out.push(`f${fn}=bytes[${sub.length}]${sub.length <= 24 ? ' ' + Buffer.from(sub).toString('hex') : ''}`); }
    else break;
  }
  return out;
}

function clubName(buf: Uint8Array): string | null {
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, at: number;
    try { [fn, wire, at] = readTag(buf, p); } catch { break; }
    if (fn === 0) break; p = at;
    if (wire === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); if (fn === 2) return new TextDecoder().decode(buf.slice(n, end)); p = end; }
    else break;
  }
  return null;
}

for (const f of FILES) {
  const blob = blobOf(`${SDIR}/${f}`);
  if (!blob) { console.log(`\n## ${f}: (no blob)`); continue; }
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7);
  if (!cs) { console.log(`\n## ${f}: (no club service)`); continue; }
  let found = false;
  for (const cb of iterLDFields(cs, 3)) {
    if (clubName(cb) !== 'Testy Club') continue;
    found = true;
    console.log(`\n## ${f}  (Testy Club, ${cb.length} bytes)`);
    for (const line of dumpFields(cb)) {
      if (/^f(22|23|24|25|26|20|21)=/.test(line)) console.log('  >> ' + line);  // hangout-region fields
      else console.log('     ' + line);
    }
  }
  if (!found) console.log(`\n## ${f}: Testy Club not found`);
}
