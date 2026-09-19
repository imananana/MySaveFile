// Dump Slot_00000006 clubs: name, description, and raw f9 criteria (category f1,
// flag f3, values) + parsed label, to verify unverified criterion types + the
// f9.f3 flag (via "Not Married").
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanClubs } from '../../src/lib/parser/clubs.js';
import { criterionLabel } from '../../src/data/venueLabels.js';

const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000006.save`;
const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
type F = { v: bigint; bytes: Uint8Array | null };
function mapFields(buf: Uint8Array): Map<number, F[]> { const o = new Map<number, F[]>(); let p = 0; while (p < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, p); } catch { break; } if (fn === 0) break; p = at; const push = (f: F) => { (o.get(fn) ?? o.set(fn, []).get(fn)!).push(f); }; if (wire === 0) { const [v, n] = readVarint(buf, p); push({ v, bytes: null }); p = n; } else if (wire === 1) { push({ v: readFixed64LE(buf, p), bytes: null }); p += 8; } else if (wire === 5) { push({ v: 0n, bytes: buf.slice(p, p + 4) }); p += 4; } else if (wire === 2) { const [l, n] = readVarint(buf, p); push({ v: 0n, bytes: buf.slice(n, n + Number(l)) }); p = n + Number(l); } else break; } return o; }

const parsed = new Map(scanClubs(bl!).map((c) => [c.id, c]));
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const cs = findLDField(gs, 7)!;
for (const cb of iterLDFields(cs, 3)) {
  const m = mapFields(cb); const id = m.get(1)?.[0]?.v;
  const name = m.get(2)?.[0]?.bytes ? new TextDecoder().decode(m.get(2)![0].bytes!) : '';
  if (!name) continue;
  const desc = m.get(4)?.[0]?.bytes ? new TextDecoder().decode(m.get(4)![0].bytes!) : '';
  console.log(`\n#### "${name}"  — "${desc}"`);
  for (const f9 of m.get(9) ?? []) {
    if (!f9.bytes) continue;
    const fm = mapFields(f9.bytes);
    const cat = Number(fm.get(1)?.[0]?.v ?? -1);
    const flag = fm.get(3)?.[0]?.v;
    // raw value entries
    const vals = (fm.get(2) ?? []).map((e) => { if (!e.bytes) return '?'; const em = mapFields(e.bytes); const ref = em.get(3)?.[0]?.bytes; if (ref) return '0x' + (mapFields(ref).get(3)?.[0]?.v ?? 0n).toString(16); const inl = em.get(4)?.[0]?.v; return inl != null ? String(inl) : '?'; });
    console.log(`   f9: category=${cat}  f3flag=${flag}  values=[${vals.join(', ')}]`);
  }
  const pc = parsed.get(id!);
  if (pc) for (const c of pc.criteria) console.log(`      parsed: ${criterionLabel(c)}`);
}
