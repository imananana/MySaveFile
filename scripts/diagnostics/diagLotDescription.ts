/**
 * Dump EVERY protobuf field of a lot's 0x3a record, with wire-type-2 fields
 * rendered as text when they look like text. scanLots stops at field5, so
 * anything past it — a description among them — has never been read.
 *
 *   npx tsx scripts/diagnostics/diagLotDescription.ts <save> [name-substring]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const save = process.argv[2]!;
const want = (process.argv[3] ?? '').toLowerCase();

const b = readFileSync(save);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let bl: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}
const buf = bl!;
let shown = 0;

for (let i = 0; i < buf.length - 12 && shown < 6; i++) {
  if (buf[i] !== 0x3a) continue;
  let pos = i + 1;
  const [msgLen, msgStart] = readVarint(buf, pos);
  if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
  const msgEnd = msgStart + Number(msgLen);
  pos = msgStart;
  if (buf[pos] !== 0x09) continue;
  pos++;
  if (pos + 8 > msgEnd) continue;
  const lotId = readFixed64LE(buf, pos); pos += 8;
  if (pos >= msgEnd || buf[pos] !== 0x12) continue;
  pos++;
  const [lotName, afterName] = readString(buf, pos);
  if (!lotName || lotName.length < 3) continue;
  if (/^[a-z][a-z0-9_:]+$/.test(lotName)) continue;
  if (want && !lotName.toLowerCase().includes(want)) { i = msgEnd - 1; continue; }

  console.log(`\n=== "${lotName}"  zone=0x${lotId.toString(16)}  (record ${msgLen} bytes) ===`);
  let p = afterName;
  while (p < msgEnd) {
    const tag = buf[p]; const wire = tag & 0x07; const num = tag >> 3;
    p++;
    if (num === 0) break;
    if (wire === 0) { const [v, n] = readVarint(buf, p); console.log(`  f${num} varint = ${v}`); p = n; }
    else if (wire === 1) { console.log(`  f${num} fixed64 = ${readFixed64LE(buf, p)}`); p += 8; }
    else if (wire === 2) {
      const [len, n] = readVarint(buf, p);
      const bytes = buf.subarray(n, n + Number(len));
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const printable = /^[\x20-\x7e -￿\n\r\t]*$/.test(text) && text.trim().length > 0;
      console.log(`  f${num} len=${len} ${printable ? `TEXT "${text.slice(0, 300)}${text.length > 300 ? '…' : ''}"` : '(binary)'}`);
      p = n + Number(len);
    }
    else if (wire === 5) { p += 4; }
    else break;
  }
  shown++;
  i = msgEnd - 1;
}
