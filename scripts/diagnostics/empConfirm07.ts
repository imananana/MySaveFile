import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanSmallBusinesses } from '../../src/lib/parser/smallBusinesses.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const sims = scanFullSimAnchors(bl!, scanHumanSimStubs(bl!));
const name = (id: bigint) => { const s = sims.find(x => x.id === id); return s ? `${s.firstName} ${s.lastName}` : `x${id.toString(16)} (no sim)`; };

const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
for (const rec of iterLDFields(svc, 1)) {
  let id=0n,type=0n,wrapper:Uint8Array|null=null,pp=0;
  while (pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;
    if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);else if(fn===2)type=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);if((fn===3||fn===8)&&!wrapper)wrapper=rec.slice(n,n+Number(l));pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n||!wrapper)continue;
  let sb:Uint8Array|null=null,qq=0;
  while(qq<wrapper.length){let fn,wire,at;try{[fn,wire,at]=readTag(wrapper,qq);}catch{break;}if(fn===0)break;qq=at;if(wire===0){const[,n]=readVarint(wrapper,qq);qq=n;}else if(wire===1)qq+=8;else if(wire===5)qq+=4;else if(wire===2){const[l,n]=readVarint(wrapper,qq);if(fn===2&&!sb)sb=wrapper.slice(n,n+Number(l));qq=n+Number(l);}else break;}
  if(!sb)continue;
  // f21.f8 roster
  const f21=findLDField(sb,21)!;
  console.log('=== f21.f8 roster (repeated) ===');
  for(const e of iterLDFields(f21,8)){const fid=findLDField(e,1)?null:null; let r=0,sid:bigint|null=null;while(r<e.length){let fn,wire,at;try{[fn,wire,at]=readTag(e,r);}catch{break;}if(fn===0)break;r=at;if(wire===1){if(fn===1)sid=readFixed64LE(e,r);r+=8;}else if(wire===0){const[,n]=readVarint(e,r);r=n;}else if(wire===5)r+=4;else if(wire===2){const[l,n]=readVarint(e,r);r=n+Number(l);}else break;}if(sid!=null)console.log('  f8.f1 =',name(sid));}
  // top-level sbData.f4 (repeated?) — role code + sim
  console.log('=== sbData.f4 (repeated?) ===');
  for(const e of iterLDFields(sb,4)){const f1=findLDField(e,1);if(!f1){console.log('  (f4 with no f1)');continue;}let r=0,role:bigint|null=null,sid:bigint|null=null;while(r<f1.length){let fn,wire,at;try{[fn,wire,at]=readTag(f1,r);}catch{break;}if(fn===0)break;r=at;if(wire===1){if(fn===1)role=readFixed64LE(f1,r);else if(fn===2)sid=readFixed64LE(f1,r);r+=8;}else if(wire===0){const[v,n]=readVarint(f1,r);if(fn===1)role=v;else if(fn===2)sid=v;r=n;}else if(wire===5)r+=4;else if(wire===2){const[l,n]=readVarint(f1,r);r=n+Number(l);}else break;}console.log(`  f4.f1 = role:${role} sim:${sid!=null?name(sid):'?'}`);}
}
