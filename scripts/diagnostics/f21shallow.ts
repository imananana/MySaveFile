import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
for (const rec of iterLDFields(svc, 1)) {
  let id=0n,wrapper:Uint8Array|null=null,pp=0;
  while(pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);if((fn===3||fn===8)&&!wrapper)wrapper=rec.slice(n,n+Number(l));pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n||!wrapper)continue;
  let sb:Uint8Array|null=null,qq=0;
  while(qq<wrapper.length){let fn,wire,at;try{[fn,wire,at]=readTag(wrapper,qq);}catch{break;}if(fn===0)break;qq=at;if(wire===0){const[,n]=readVarint(wrapper,qq);qq=n;}else if(wire===1)qq+=8;else if(wire===5)qq+=4;else if(wire===2){const[l,n]=readVarint(wrapper,qq);if(fn===2&&!sb)sb=wrapper.slice(n,n+Number(l));qq=n+Number(l);}else break;}
  if(!sb)continue;
  const f21=findLDField(sb,21)!;
  console.log('=== f21 DIRECT children ===');
  let p=0;
  while(p<f21.length){let fn,wire,at;try{[fn,wire,at]=readTag(f21,p);}catch{break;}if(fn===0)break;p=at;
    if(wire===0){const[v,n]=readVarint(f21,p);p=n;console.log(`f${fn} varint = ${v}`);}
    else if(wire===1){const dv=new DataView(f21.buffer,f21.byteOffset+p,8);console.log(`f${fn} fixed64 = x${readFixed64LE(f21,p).toString(16)} | f64=${dv.getFloat64(0,true)}`);p+=8;}
    else if(wire===5){const dv=new DataView(f21.buffer,f21.byteOffset+p,4);console.log(`f${fn} fix32 = int:${dv.getInt32(0,true)} float:${dv.getFloat32(0,true)}`);p+=4;}
    else if(wire===2){const[l,n]=readVarint(f21,p);p=n+Number(l);console.log(`f${fn} ld(${l})`);}
    else break;}
}
