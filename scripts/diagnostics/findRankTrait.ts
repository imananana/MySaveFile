import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
const traits: Record<string, number> = { Rank_0:0x5FC53, Rank_1:0x5B5EE, Rank_2:0x5B5EF, Rank_3:0x5B5F0, Rank_4:0x5B5F1, Rank_5:0x5B5ED };
function countVarint(val: number): number { // encode as varint bytes
  const bytes:number[]=[]; let v=val; while(v>0x7f){bytes.push((v&0x7f)|0x80);v>>>=7;} bytes.push(v);
  let c=0; for(let i=0;i+bytes.length<=buf.length;i++){let ok=true;for(let j=0;j<bytes.length;j++)if(buf[i+j]!==bytes[j]){ok=false;break;}if(ok)c++;} return c;
}
console.log('=== rank trait instance occurrences (as varint) in save ===');
for (const [name, id] of Object.entries(traits)) console.log(`  ${name} (0x${id.toString(16)}): x${countVarint(id)}`);
// clamped stat value 4600 as float32
const f = Buffer.alloc(4); f.writeFloatLE(4600); let cf=0; const at:number[]=[];
for(let i=0;i+4<=buf.length;i++){if(buf[i]===f[0]&&buf[i+1]===f[1]&&buf[i+2]===f[2]&&buf[i+3]===f[3]){cf++;if(at.length<8)at.push(i);}}
console.log(`=== 4600 float32 (clamped rank stat): x${cf} (offsets ${at.join(',')}) ===`);
// rank stat id 0x5B5A3 as varint
console.log(`rank stat id 0x5b5a3: x${countVarint(0x5B5A3)}`);
