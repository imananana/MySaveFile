import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const FAT = 0x23516bbe2e90334n;
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
// walk a message, printing path for fields; recurse into LD; flag when a fixed64 == FAT
function walk(buf: Uint8Array, path: string) {
  let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; }
    else if (wire === 1) { const v = readFixed64LE(buf, q); if (v === FAT) console.log(`FATIMA at ${path}.f${fn} (fixed64)`); q += 8; }
    else if (wire === 5) q += 4;
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l);
      // packed fixed64 scan
      if (Number(l) % 8 === 0 && Number(l) >= 8) { for (let i = 0; i + 8 <= sub.length; i += 8) if (readFixed64LE(sub, i) === FAT) console.log(`FATIMA in packed ${path}.f${fn}[${i/8}]`); }
      if (Number(l) > 0 && Number(l) < 5000) walk(sub, `${path}.f${fn}`);
    } else break; }
}
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
for (const rec of iterLDFields(svc, 1)) {
  let id = 0n, type = 0n, pp = 0;
  while (pp < rec.length) { let fn, wire, at; try { [fn, wire, at] = readTag(rec, pp); } catch { break; } if (fn === 0) break; pp = at;
    if (wire === 0) { const [, n] = readVarint(rec, pp); pp = n; } else if (wire === 1) { if (fn===1) id=readFixed64LE(rec,pp); else if(fn===2) type=readFixed64LE(rec,pp); pp += 8; } else if (wire === 5) pp += 4; else if (wire === 2) { const [l, n] = readVarint(rec, pp); pp = n + Number(l); } else break; }
  if (id !== 0x23516bbe2dd0329n) continue;
  console.log(`record x${id.toString(16)} type=${type}:`);
  walk(rec, 'rec');
}
