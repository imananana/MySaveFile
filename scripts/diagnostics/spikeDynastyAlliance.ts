/* Dynasty inter-relations: f8 and f9 on each dynasty record are packed fixed64
 * lists of OTHER dynasty ids (mutual). EP21 dynasties have alliance + rivalry —
 * these are those two lists. Which field is which needs a known fixture.
 * Run: npx tsx scripts/diagnostics/spikeDynastyAlliance.ts [slot] */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanDynasties } from '../../src/lib/parser/dynasties.js';

const slot = process.argv[2] || '00000003';
const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_${slot}.save`;
const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const dyn = scanDynasties(bl!);
const dynIds = new Map(dyn.map((d) => [d.id, d.name]));
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 60)!;
const idsIn = (s: Uint8Array): string[] => { const out: string[] = []; for (let i = 0; i + 8 <= s.length; i += 8) { const v = readFixed64LE(s, i); out.push(dynIds.get(v) ?? '0x' + v.toString(16)); } return out; };

console.log(`Slot ${slot} — dynasty relations (f8 + f9 = packed dynasty-id lists; alliance/rivalry mapping TBD via fixture):`);
for (const rec of iterLDFields(svc, 1)) {
  let name = ''; const extra: Record<number, Uint8Array> = {}; let q = 0;
  while (q < rec.length) { let fn, wire, at; try { [fn, wire, at] = readTag(rec, q); } catch { break; } if (fn === 0) break; q = at;
    if (wire === 2) { const [l, n] = readVarint(rec, q); const sub = rec.slice(n, n + Number(l)); if (fn === 2) name = new TextDecoder().decode(sub); if (fn === 8 || fn === 9) extra[fn] = sub; q = n + Number(l); }
    else if (wire === 0) { const [, n] = readVarint(rec, q); q = n; } else if (wire === 1) q += 8; else if (wire === 5) q += 4; else break; }
  const f8 = extra[8] ? idsIn(extra[8]) : []; const f9 = extra[9] ? idsIn(extra[9]) : [];
  if (f8.length || f9.length) console.log(`  ${name.padEnd(18)} f8=[${f8.join(', ')}]  f9=[${f9.join(', ')}]`);
}
