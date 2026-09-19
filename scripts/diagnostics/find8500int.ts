import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
// int32 LE 8500
const i32 = Buffer.alloc(4); i32.writeInt32LE(8500);
const a32:number[]=[]; for(let i=0;i+4<=buf.length;i++){if(buf[i]===i32[0]&&buf[i+1]===i32[1]&&buf[i+2]===i32[2]&&buf[i+3]===i32[3])a32.push(i);}
console.log(`8500 int32 LE: x${a32.length} (offsets ${a32.slice(0,20).join(',')})`);
// fixed64 LE 8500 (could be stored as i64 ranked stat)
const i64 = Buffer.alloc(8); i64.writeBigInt64LE(8500n);
const a64:number[]=[]; for(let i=0;i+8<=buf.length;i++){let ok=true;for(let j=0;j<8;j++)if(buf[i+j]!==i64[j]){ok=false;break;}if(ok)a64.push(i);}
console.log(`8500 int64 LE: x${a64.length} (offsets ${a64.slice(0,20).join(',')})`);
