import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!;
const targets = [200, 600, 2000, 4000, 8500];
for (const t of targets) {
  // float32 LE pattern
  const f32 = Buffer.alloc(4); f32.writeFloatLE(t);
  const f64 = Buffer.alloc(8); f64.writeDoubleLE(t);
  let c32 = 0, c64 = 0; const at32: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i++) { if (buf[i]===f32[0]&&buf[i+1]===f32[1]&&buf[i+2]===f32[2]&&buf[i+3]===f32[3]) { c32++; if(at32.length<6) at32.push(i); } }
  for (let i = 0; i + 8 <= buf.length; i++) { if (buf[i]===f64[0]&&buf[i+1]===f64[1]&&buf[i+2]===f64[2]&&buf[i+3]===f64[3]&&buf[i+4]===f64[4]&&buf[i+5]===f64[5]&&buf[i+6]===f64[6]&&buf[i+7]===f64[7]) c64++; }
  console.log(`${t}: float32 x${c32} (offsets ${at32.join(',')}) | float64 x${c64}`);
}
