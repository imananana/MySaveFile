// Full flat path=value dump of Tester Business sbData, for clean cross-state diffing.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
const out: string[] = [];
const idx: Record<string, number> = {};
function walk(buf: Uint8Array, path: string) {
  let q = 0;
  while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at;
    const key = `${path}.f${fn}`; const i = (idx[key] = (idx[key] ?? -1) + 1); const pk = `${path}.f${fn}[${i}]`;
    if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; out.push(`${pk} = ${v}`); }
    else if (wire === 1) { const dv=new DataView(buf.buffer,buf.byteOffset+q,8); out.push(`${pk} = fix64 x${readFixed64LE(buf,q).toString(16)} f64=${dv.getFloat64(0,true)}`); q += 8; }
    else if (wire === 5) { const dv=new DataView(buf.buffer,buf.byteOffset+q,4); out.push(`${pk} = fix32 int=${dv.getInt32(0,true)} f32=${dv.getFloat32(0,true)}`); q += 4; }
    else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l);
      const txt = new TextDecoder().decode(sub);
      if (/^[\x20-\x7e]{2,40}$/.test(txt) && /[a-zA-Z]/.test(txt)) out.push(`${pk} = "${txt}"`);
      else if (Number(l) > 0 && Number(l) < 5000) walk(sub, pk);
      else out.push(`${pk} = bytes(${l})`);
    } else break; }
}
for (const rec of iterLDFields(svc, 1)) {
  let id=0n,wrapper:Uint8Array|null=null,pp=0;
  while(pp<rec.length){let fn,wire,at;try{[fn,wire,at]=readTag(rec,pp);}catch{break;}if(fn===0)break;pp=at;if(wire===0){const[,n]=readVarint(rec,pp);pp=n;}else if(wire===1){if(fn===1)id=readFixed64LE(rec,pp);pp+=8;}else if(wire===5)pp+=4;else if(wire===2){const[l,n]=readVarint(rec,pp);if((fn===3||fn===8)&&!wrapper)wrapper=rec.slice(n,n+Number(l));pp=n+Number(l);}else break;}
  if(id!==0x23516bbe2dd0329n||!wrapper)continue;
  let sb:Uint8Array|null=null,qq=0;
  while(qq<wrapper.length){let fn,wire,at;try{[fn,wire,at]=readTag(wrapper,qq);}catch{break;}if(fn===0)break;qq=at;if(wire===0){const[,n]=readVarint(wrapper,qq);qq=n;}else if(wire===1)qq+=8;else if(wire===5)qq+=4;else if(wire===2){const[l,n]=readVarint(wrapper,qq);if(fn===2&&!sb)sb=wrapper.slice(n,n+Number(l));qq=n+Number(l);}else break;}
  if(!sb)continue;
  walk(sb, 'sb');
}
console.log(out.join('\n'));
