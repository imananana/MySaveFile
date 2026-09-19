// For every named club in given saves, print just f9 (criteria) and f10 (rules)
// raw, to correlate structure with club names whose rules we can guess/confirm.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const saves = process.argv.slice(2);
function blobOf(path: string): Uint8Array | null {
  try { const b = readFileSync(path); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); let blob: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; } return blob; } catch { return null; }
}
function compact(buf: Uint8Array): string {
  // one-line field summary, recursing
  let p = 0; const parts: string[] = [];
  while (p < buf.length) {
    let fn, wire, at; try { [fn, wire, at] = readTag(buf, p); } catch { break; } if (fn === 0) break; p = at;
    if (wire === 0) { const [v, n] = readVarint(buf, p); p = n; parts.push(`${fn}:${v}`); }
    else if (wire === 1) { parts.push(`${fn}:x${readFixed64LE(buf, p).toString(16)}`); p += 8; }
    else if (wire === 5) { p += 4; parts.push(`${fn}:f32`); }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const s = buf.slice(n, n + Number(l)); p = n + Number(l); parts.push(`${fn}{${compact(s)}}`); }
    else break;
  }
  return parts.join(' ');
}
for (const path of saves) {
  const blob = blobOf(path); if (!blob) continue;
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7); if (!cs) continue;
  console.log(`\n######## ${path.split('/').pop()}`);
  for (const cb of iterLDFields(cs, 3)) {
    // name + f9 + all f10
    let name = ''; const f9: Uint8Array[] = []; const f10: Uint8Array[] = [];
    let p = 0;
    while (p < cb.length) { let fn, wire, at; try { [fn, wire, at] = readTag(cb, p); } catch { break; } if (fn === 0) break; p = at;
      if (wire === 0) { const [, n] = readVarint(cb, p); p = n; }
      else if (wire === 1) p += 8; else if (wire === 5) p += 4;
      else if (wire === 2) { const [l, n] = readVarint(cb, p); const s = cb.slice(n, n + Number(l)); p = n + Number(l); if (fn === 2) name = new TextDecoder().decode(s); else if (fn === 9) f9.push(s); else if (fn === 10) f10.push(s); }
      else break; }
    if (!name) continue;
    console.log(`\n• ${name}`);
    for (const x of f9) console.log(`   f9(criteria): ${compact(x)}`);
    for (const x of f10) console.log(`   f10(rule):     ${compact(x)}`);
    if (!f9.length && !f10.length) console.log('   (no f9/f10)');
  }
}
