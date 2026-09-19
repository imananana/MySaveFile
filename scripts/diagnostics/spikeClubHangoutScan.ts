/* Scan ALL saves for clubs with a General-Venue hangout (f22=1) and decode the
 * f8 payload { f1, f2, f3 }. Validates f8.f3 = venue type id (vs VENUE_TUNING_MAP)
 * and shows whether f8.f1 varies (region/world?) or is a global constant.
 * Run: npx tsx scripts/diagnostics/spikeClubHangoutScan.ts */
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields } from '../../src/lib/parser/protobuf.js';
import { VENUE_TUNING_MAP } from '../../src/lib/parser/lots.js';

const SDIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;

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

// Flat top-level field reader → fn → {v, bytes}[]
function mapFields(buf: Uint8Array): Map<number, { v: bigint; bytes: Uint8Array | null }[]> {
  const out = new Map<number, { v: bigint; bytes: Uint8Array | null }[]>();
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, at: number;
    try { [fn, wire, at] = readTag(buf, p); } catch { break; }
    if (fn === 0) break; p = at;
    const push = (f: { v: bigint; bytes: Uint8Array | null }) => { (out.get(fn) ?? out.set(fn, []).get(fn)!).push(f); };
    if (wire === 0) { const [v, n] = readVarint(buf, p); push({ v, bytes: null }); p = n; }
    else if (wire === 1) { push({ v: readFixed64LE(buf, p), bytes: null }); p += 8; }
    else if (wire === 5) { push({ v: 0n, bytes: buf.slice(p, p + 4) }); p += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); push({ v: 0n, bytes: buf.slice(n, end) }); p = end; }
    else break;
  }
  return out;
}

const f1Values = new Map<string, number>(); // f8.f1 hex -> count
let total = 0, lot = 0, none = 0;

for (const f of readdirSync(SDIR).filter((x) => /\.save$/.test(x))) {
  const blob = blobOf(`${SDIR}/${f}`); if (!blob) continue;
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7); if (!cs) continue;
  for (const cb of iterLDFields(cs, 3)) {
    const m = mapFields(cb);
    const setting = Number(m.get(22)?.[0]?.v ?? 0);
    const name = m.get(2)?.[0]?.bytes ? new TextDecoder().decode(m.get(2)![0].bytes!) : '(stock)';
    if (setting === 2) { lot++; continue; }
    if (setting !== 1) { none++; continue; }
    total++;
    const f8 = m.get(8)?.[0]?.bytes;
    if (!f8) { console.log(`  ${f} "${name}": f22=1 but NO f8!`); continue; }
    const fm = mapFields(f8);
    const f1 = fm.get(1)?.[0]?.v ?? -1n;
    const f2 = fm.get(2)?.[0]?.v ?? -1n;
    const f3 = fm.get(3)?.[0]?.v ?? -1n;
    const venue = VENUE_TUNING_MAP['0x' + f3.toString(16)] ?? '❓UNMAPPED';
    f1Values.set('0x' + f1.toString(16), (f1Values.get('0x' + f1.toString(16)) ?? 0) + 1);
    console.log(`  ${f.padEnd(28)} "${name}"  f8={f1:0x${f1.toString(16)}, f2:${f2}, f3:0x${f3.toString(16)} → ${venue}}`);
  }
}

console.log(`\nvenue-hangout clubs: ${total}; lot: ${lot}; none/other: ${none}`);
console.log(`distinct f8.f1 values:`);
for (const [k, c] of [...f1Values].sort((a, b) => b[1] - a[1])) console.log(`  ${k}  ×${c}`);
