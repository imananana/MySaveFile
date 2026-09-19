import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanHumanSimStubs, scanFullSimAnchors } from "../../src/lib/parser/sims.js";

const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }

// Find Fatima's sim id via the full parser
const stubs = scanHumanSimStubs(bl!); const sims = scanFullSimAnchors(bl!, stubs);
const fatima = sims.find(s => /Fatima/i.test(s.firstName) && /Clevenger/i.test(s.lastName));
console.log('Fatima sim id:', fatima ? 'x' + fatima.id.toString(16) : 'NOT FOUND');
const fid = fatima?.id ?? null;

// Walk the Tester Business record's wrapper + sbData, looking for Fatima's id as a fixed64 anywhere
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
for (const rec of iterLDFields(svc, 1)) {
  let id = 0n, type = 0n, wrapper: Uint8Array | null = null, pp = 0;
  while (pp < rec.length) { let fn, wire, at; try { [fn, wire, at] = readTag(rec, pp); } catch { break; } if (fn === 0) break; pp = at;
    if (wire === 0) { const [, n] = readVarint(rec, pp); pp = n; }
    else if (wire === 1) { if (fn === 1) id = readFixed64LE(rec, pp); else if (fn === 2) type = readFixed64LE(rec, pp); pp += 8; }
    else if (wire === 5) pp += 4;
    else if (wire === 2) { const [l, n] = readVarint(rec, pp); if ((fn === 3 || fn === 8) && !wrapper) wrapper = rec.slice(n, n + Number(l)); pp = n + Number(l); } else break; }
  if (type !== 5n || !wrapper) continue;
  // search the whole record for Fatima's id as raw LE bytes
  if (fid != null) {
    const buf = Buffer.alloc(8); buf.writeBigUInt64LE(fid);
    let hits: number[] = [];
    for (let i = 0; i + 8 <= rec.length; i++) { let ok = true; for (let j = 0; j < 8; j++) if (rec[i + j] !== buf[j]) { ok = false; break; } if (ok) hits.push(i); }
    console.log(`record id=x${id.toString(16)}: Fatima id raw-byte hits in full record = ${hits.length} at offsets ${hits.join(',')}`);
  }
}
