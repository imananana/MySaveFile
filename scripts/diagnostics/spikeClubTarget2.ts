// Dump targeted club rules (f10 with f3) fully, with club + activity names, to
// decode the To-Whom target encoding.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { resolveClubActivity } from '../../src/data/stockClubActivities.js';

const SDIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
function blobOf(p: string): Uint8Array | null { try { const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; } return bl; } catch { return null; } }
function dump(buf: Uint8Array, pad: string): string { let q = 0, s = ''; while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at; if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; s += `${pad}f${fn}=${v}\n`; } else if (wire === 1) { s += `${pad}f${fn}=x${readFixed64LE(buf, q).toString(16)}\n`; q += 8; } else if (wire === 5) q += 4; else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l); s += `${pad}f${fn}{\n${dump(sub, pad + '  ')}${pad}}\n`; } else break; } return s; }
type F = { v?: bigint; sub?: Uint8Array };
function rm(buf: Uint8Array): Map<number, F[]> { const o = new Map<number, F[]>(); let q = 0; while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at; const push = (x: F) => { (o.get(fn) ?? o.set(fn, []).get(fn)!).push(x); }; if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; push({ v }); } else if (wire === 1) { push({ v: readFixed64LE(buf, q) }); q += 8; } else if (wire === 5) q += 4; else if (wire === 2) { const [l, n] = readVarint(buf, q); const ssub = buf.slice(n, n + Number(l)); q = n + Number(l); push({ sub: ssub }); } else break; } return o; }
let shown = 0;
for (const f of readdirSync(SDIR).filter((x) => x.endsWith('.save'))) {
  if (shown >= 8) break;
  const blob = blobOf(`${SDIR}/${f}`); if (!blob) continue;
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7); if (!cs) continue;
  for (const cb of iterLDFields(cs, 3)) {
    const club = rm(cb); let name = ''; for (const x of club.get(2) ?? []) if (x.sub) name = new TextDecoder().decode(x.sub);
    for (const r of club.get(10) ?? []) {
      if (!r.sub) continue; const m = rm(r.sub); const f3 = m.get(3)?.[0]?.sub; if (!f3) continue;
      const inst = m.get(2)?.[0]?.sub && rm(m.get(2)![0].sub!).get(3)?.[0]?.v;
      const act = inst != null ? resolveClubActivity(inst) : '?';
      const flag = Number(m.get(1)?.[0]?.v);
      console.log(`\n[${f}] "${name}" — ${flag === 1 ? 'ENC' : 'DIS'} "${act}"  TARGET f3:`);
      console.log(dump(f3, '   '));
      if (++shown >= 8) break;
    }
    if (shown >= 8) break;
  }
}
