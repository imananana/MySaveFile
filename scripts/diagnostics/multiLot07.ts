import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanLots } from '../../src/lib/parser/lots.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const lots = [...scanLots(bl!).values()];
const lotName = (id: bigint) => { const l = lots.find(x => x.id === id || x.field5 === id); return l ? l.name : `x${id.toString(16)} (unknown lot)`; };
const crick = lots.find(l => /Crick Cabana/i.test(l.name));
console.log('Crick Cabana lot id:', crick ? 'x'+crick.id.toString(16) : 'NOT FOUND', crick?.field5!=null?'(f5 x'+crick.field5.toString(16)+')':'');

// walk Tester Business record, print every fixed64 and 8-byte LD that resolves to a known lot
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
const lotIds = new Set(lots.flatMap(l => [l.id, l.field5].filter(x=>x!=null) as bigint[]));
function walk(buf: Uint8Array, path: string) {
  let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; if (lotIds.has(v)) console.log(`  LOT@ ${path}.f${fn} (varint) = ${lotName(v)}`); }
    else if (wire === 1) { const v = readFixed64LE(buf, q); if (lotIds.has(v)) console.log(`  LOT@ ${path}.f${fn} (fix64) = ${lotName(v)}`); q += 8; }
    else if (wire === 5) q += 4;
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l);
      if (Number(l) === 8) { const v = readFixed64LE(sub, 0); if (lotIds.has(v)) console.log(`  LOT@ ${path}.f${fn} (8-byte LD) = ${lotName(v)}`); }
      if (Number(l) % 8 === 0 && Number(l) > 8) { for (let i=0;i+8<=sub.length;i+=8){const v=readFixed64LE(sub,i); if(lotIds.has(v)) console.log(`  LOT@ ${path}.f${fn}[${i/8}] (packed) = ${lotName(v)}`);} }
      if (Number(l) > 0 && Number(l) < 5000) walk(sub, `${path}.f${fn}`);
    } else break; }
}
for (const rec of iterLDFields(svc, 1)) {
  let id=0n,type=0n,pp=0;
  while(pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);else if(fn===2)type=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n)continue;
  console.log(`record x${id.toString(16)} type=${type} — lot references:`);
  walk(rec, 'rec');
}
