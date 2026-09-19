// READ-ONLY: hex dump a region of the 0x0d master blob with protobuf-ish annotation.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
const file = readFileSync(process.argv[2]);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
const at = Number(process.argv[3]), before = Number(process.argv[4] ?? 64), after = Number(process.argv[5] ?? 160);
const st = Math.max(0, at - before);
for (let row = st; row < at + after; row += 16) {
  const bytes = [...buf.slice(row, row + 16)].map((b, k) => (row + k === at ? '[' : ' ') + b.toString(16).padStart(2, '0') + (row + k === at ? ']' : '')).join('');
  console.log(`${String(row).padStart(8)}  ${bytes}`);
}
