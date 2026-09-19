// READ-ONLY: find every relationship-tracker record containing a given bit
// tuning id (as the f3{f1:varint} pattern `1a .. 08 <varint>`), and attribute
// each hit to the owning record's f9 sim id (nearest preceding `49 [8b sim id]`).
//   relBitCarriers.ts <save> <bitHex>
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const bit = BigInt('0x' + process.argv[3].replace(/^0x/, ''));
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// encode the bit as the bytes protobuf varint produces for `08 <bit>`
const enc: number[] = [0x08]; let v = bit;
while (v >= 0x80n) { enc.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
enc.push(Number(v));

const carriers = new Map<string, number>();
for (let i = 0; i < buf.length - enc.length - 2; i++) {
  if (buf[i] !== 0x1a) continue; // f3, wt2
  const len = buf[i + 1]; if (len < enc.length || len > 0x40) continue;
  let ok = true;
  for (let j = 0; j < enc.length; j++) if (buf[i + 2 + j] !== enc[j]) { ok = false; break; }
  if (!ok) continue;
  // attribute: nearest preceding `49` whose fixed64 is a known sim id (search back 4KB)
  let owner = '(no owner found)';
  for (let k = i; k > Math.max(0, i - 4096); k--) {
    if (buf[k] !== 0x49) continue;
    const id = readFixed64LE(buf, k + 1);
    if (simIds.has(id)) { const s = byId.get(id)!; owner = `${s.firstName} ${s.lastName}`; break; }
  }
  carriers.set(owner, (carriers.get(owner) ?? 0) + 1);
}
console.log(`bit 0x${bit.toString(16)} (${bit}) — carriers:`);
for (const [o, n] of [...carriers].sort()) console.log(`  ${o}  ×${n}`);
console.log(carriers.size === 0 ? '  (none)' : '');
