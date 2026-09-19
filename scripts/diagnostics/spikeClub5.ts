// Dump every named club in Slot_00000005 with its rules: flag, activity, and the
// full f10.f3 target (or "Anyone" if absent).
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { resolveClubActivity } from '../../src/data/stockClubActivities.js';

const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000005.save`;
const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
function dump(buf: Uint8Array, pad: string): string { let q = 0, s = ''; while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at; if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; s += `${pad}f${fn}=${v}\n`; } else if (wire === 1) { s += `${pad}f${fn}=x${readFixed64LE(buf, q).toString(16)}\n`; q += 8; } else if (wire === 5) q += 4; else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l); s += `${pad}f${fn}{\n${dump(sub, pad + '  ')}${pad}}\n`; } else break; } return s; }
type F = { v?: bigint; sub?: Uint8Array };
function rm(buf: Uint8Array): Map<number, F[]> { const o = new Map<number, F[]>(); let q = 0; while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at; const push = (x: F) => { (o.get(fn) ?? o.set(fn, []).get(fn)!).push(x); }; if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; push({ v }); } else if (wire === 1) { push({ v: readFixed64LE(buf, q) }); q += 8; } else if (wire === 5) q += 4; else if (wire === 2) { const [l, n] = readVarint(buf, q); push({ sub: buf.slice(n, n + Number(l)) }); q = n + Number(l); } else break; } return o; }
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const cs = findLDField(gs, 7)!;
for (const cb of iterLDFields(cs, 3)) {
  const club = rm(cb); let name = ''; for (const x of club.get(2) ?? []) if (x.sub) name = new TextDecoder().decode(x.sub);
  if (!name) continue;
  const rules = club.get(10) ?? [];
  console.log(`\n#### "${name}" — ${rules.length} rules`);
  for (const r of rules) {
    if (!r.sub) continue; const m = rm(r.sub);
    const inst = m.get(2)?.[0]?.sub && rm(m.get(2)![0].sub!).get(3)?.[0]?.v;
    const act = inst != null ? resolveClubActivity(inst) : '?';
    const flag = Number(m.get(1)?.[0]?.v) === 1 ? 'ENC' : 'DIS';
    const f3 = m.get(3)?.[0]?.sub;
    console.log(`  ${flag} "${act}" -> ${f3 ? 'TARGET:' : 'Anyone'}`);
    if (f3) console.log(dump(f3, '       '));
  }
}
