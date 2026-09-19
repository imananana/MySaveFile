import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
for (const t of [8500]) {
  const f32 = Buffer.alloc(4); f32.writeFloatLE(t);
  const f64 = Buffer.alloc(8); f64.writeDoubleLE(t);
  const at32: number[] = [], at64: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i++) { if (buf[i]===f32[0]&&buf[i+1]===f32[1]&&buf[i+2]===f32[2]&&buf[i+3]===f32[3]) at32.push(i); }
  for (let i = 0; i + 8 <= buf.length; i++) { if (buf[i]===f64[0]&&buf[i+1]===f64[1]&&buf[i+2]===f64[2]&&buf[i+3]===f64[3]&&buf[i+4]===f64[4]&&buf[i+5]===f64[5]&&buf[i+6]===f64[6]&&buf[i+7]===f64[7]) at64.push(i); }
  console.log(`${t}: float32 x${at32.length} (offsets ${at32.join(',')}) | float64 x${at64.length} (offsets ${at64.join(',')})`);
  // varint 8500 = 0xB4 0x42 (8500 = 0x2134 -> varint: 8500 % 128=52|0x80=0xB4, 8500>>7=66=0x42)
  const vbytes=[0xb4,0x42]; const atv:number[]=[];
  for (let i=0;i+2<=buf.length;i++){ if(buf[i]===vbytes[0]&&buf[i+1]===vbytes[1]) atv.push(i); }
  console.log(`8500 varint(0xB4 0x42): x${atv.length} (first ${atv.slice(0,10).join(',')})`);
}
