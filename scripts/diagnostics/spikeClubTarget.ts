// Find the "To Whom" target field in club rules (f10). Tally f10 field-sets and
// f2 sub-fields across all saves; surface any rule that isn't the plain Anyone shape.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const SDIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
function blobOf(p: string): Uint8Array | null {
  try { const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; } return bl; } catch { return null; }
}
type F = { v?: bigint; sub?: Uint8Array };
function rm(buf: Uint8Array): Map<number, F[]> {
  const o = new Map<number, F[]>(); let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    const push = (x: F) => { (o.get(fn) ?? o.set(fn, []).get(fn)!).push(x); };
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; push({ v }); }
    else if (wire === 1) { push({ v: readFixed64LE(buf, q) }); q += 8; }
    else if (wire === 5) { q += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const s = buf.slice(n, n + Number(l)); q = n + Number(l); push({ sub: s }); }
    else break; }
  return o;
}
const topShapes = new Map<string, number>();
const f2shapes = new Map<string, number>();
const extras: string[] = [];
for (const f of readdirSync(SDIR).filter((x) => x.endsWith('.save'))) {
  const blob = blobOf(`${SDIR}/${f}`); if (!blob) continue;
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7); if (!cs) continue;
  for (const cb of iterLDFields(cs, 3)) {
    for (const r of rm(cb).get(10) ?? []) {
      if (!r.sub) continue;
      const m = rm(r.sub);
      const keys = [...m.keys()].sort((a, b) => a - b).join(',');
      topShapes.set(keys, (topShapes.get(keys) ?? 0) + 1);
      const f2 = m.get(2)?.[0]?.sub;
      if (f2) { const fk = [...rm(f2).keys()].sort((a, b) => a - b).join(','); f2shapes.set(fk, (f2shapes.get(fk) ?? 0) + 1); }
      if (keys !== '1,2' && extras.length < 12) {
        const desc = [...m.entries()].map(([k, vs]) => `f${k}=${vs.map((v) => v.v ?? '{' + [...rm(v.sub!).entries()].map(([kk, ss2]) => `f${kk}:${ss2.map((x) => x.v ?? 'msg').join('/')}`).join(' ') + '}').join(',')}`).join('  ');
        extras.push(`[${f}] ${desc}`);
      }
    }
  }
}
console.log('f10 top-level field-sets:', Object.fromEntries(topShapes));
console.log('f10.f2 sub field-sets   :', Object.fromEntries(f2shapes));
console.log(`\nnon-plain (target!=Anyone?) samples:`);
for (const e of extras) console.log('  ' + e);
