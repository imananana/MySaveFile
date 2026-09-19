import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
function walk(buf: Uint8Array, path: string) { let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; if (v===10n||v===23n) console.log(`  ${path}.f${fn} = ${v} (varint)`); }
    else if (wire === 1) { const dv=new DataView(buf.buffer,buf.byteOffset+q,8); const fv=dv.getFloat64(0,true); if([10,23].includes(fv)) console.log(`  ${path}.f${fn} = ${fv} (f64)`); q += 8; }
    else if (wire === 5) { const dv=new DataView(buf.buffer,buf.byteOffset+q,4); const i=dv.getInt32(0,true),f=dv.getFloat32(0,true); if([10,23].includes(i)||[10,23].includes(f)) console.log(`  ${path}.f${fn} = ${[10,23].includes(f)?f+' float':i+' int'} (fix32)`); q += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l); if (Number(l)>0 && Number(l)<5000) walk(sub, `${path}.f${fn}`); }
    else break; } }
for (const rec of iterLDFields(svc, 1)) { let id=0n,pp=0;
  while(pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n)continue;
  console.log('Searching for fee amount 10 or 23:'); walk(rec, 'rec'); console.log('(done)'); }
