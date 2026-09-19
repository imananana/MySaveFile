import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);
const f32 = Buffer.alloc(4); f32.writeFloatLE(8500);
const i32 = Buffer.alloc(4); i32.writeInt32LE(8500);
let ri = 0;
for (const r of res) {
  let d: Uint8Array; try { d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; } catch { ri++; continue; }
  let c32f=0,c32i=0;
  for (let i=0;i+4<=d.length;i++){ if(d[i]===f32[0]&&d[i+1]===f32[1]&&d[i+2]===f32[2]&&d[i+3]===f32[3])c32f++; if(d[i]===i32[0]&&d[i+1]===i32[1]&&d[i+2]===i32[2]&&d[i+3]===i32[3])c32i++; }
  if (c32f||c32i) console.log(`resource #${ri} type=0x${r.type.toString(16)} len=${d.length}: 8500 float32 x${c32f}, int32 x${c32i}`);
  ri++;
}
console.log(`(scanned ${ri} resources, ${res.filter(r=>r.type===0x0d).length} are 0x0d)`);
