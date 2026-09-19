import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const SEEDS: Record<string, bigint> = { CafeBookshop:0x6A91Bn, PotteryShop:0x6A91Cn, TatooShop:0x6A91Dn, NewGym:0x6A91En, NewLibrary:0x6A91Fn, NewArtsCenter:0x6A920n, NewBar:0x6A921n, NewBusiness:0x6A922n, NewPark:0x6A923n, NewLounge:0x6AFE2n, NewMuseum:0x6AFE3n, NewNightclub:0x6AFE4n, NewPool:0x6AFE5n, NewRelaxationCenter:0x6AFE6n, NewCafe:0x6AFE7n, NewKaraokeBar:0x6AFE8n, NewUniversityCommons:0x6AFE9n, NewCommunityGarden:0x6AFEAn, NewMakerspace:0x6AFEBn, NewRecreationCenter:0x6AFECn, NewRetail:0x6AFEDn, NewBubbleTeaCafe:0x6AFEEn, NewOnsen:0x6B0F9n };
const byVal = new Map<bigint,string>(Object.entries(SEEDS).map(([k,v])=>[v,k]));
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
function walk(buf: Uint8Array, path: string) {
  let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; if (byVal.has(v)) console.log(`  ${path}.f${fn} (varint) = ${byVal.get(v)}`); }
    else if (wire === 1) { const v=readFixed64LE(buf,q); if (byVal.has(v)) console.log(`  ${path}.f${fn} (fix64) = ${byVal.get(v)}`); q += 8; }
    else if (wire === 5) q += 4;
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l); if (Number(l)>0 && Number(l)<5000) walk(sub, `${path}.f${fn}`); }
    else break; }
}
for (const rec of iterLDFields(svc, 1)) {
  let id=0n,pp=0;
  while(pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n)continue;
  console.log('Tester Business — seed/preset references:');
  walk(rec, 'rec');
  console.log('(done)');
}
