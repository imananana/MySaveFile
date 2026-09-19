import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);

const flags = view.getUint32(indexOffset, true);
const typeConst   = (flags & 0x01) !== 0;
const groupConst  = (flags & 0x02) !== 0;
const instHiConst = (flags & 0x04) !== 0;

let headerPos = indexOffset + 4;
let constType = 0, constGroup = 0, constInstHi = 0;
if (typeConst)   { constType   = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst)  { constGroup  = view.getUint32(headerPos, true); headerPos += 4; }
if (instHiConst) { constInstHi = view.getUint32(headerPos, true); headerPos += 4; }

const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

// Hex dump helper: shows raw bytes + printable chars
function hexDump(data, start, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const row = [];
    const chars = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      const b = data[start + i + j];
      row.push(b.toString(16).padStart(2, '0'));
      chars.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    lines.push(`  +${(i).toString().padStart(4, '0')}  ${row.join(' ').padEnd(47)}  ${chars.join('')}`);
  }
  return lines.join('\n');
}

let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;

  let off = pos;
  const type   = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group  = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp   = view.getUint32(off, true) & 0x7fffffff; off += 4;
  const compType   = view.getUint16(off + 4, true);

  pos += entrySize;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  const text = data.toString('latin1');
  let idx = text.indexOf('Feng');
  while (idx !== -1) {
    const ctxStart = Math.max(0, idx - 40);
    const ctxEnd   = Math.min(data.length, idx + 60);

    // Print human-readable context
    const readable = [...text.slice(ctxStart, ctxEnd)].map(c => {
      const code = c.charCodeAt(0);
      return code >= 0x20 && code < 0x7f ? c : `\\x${code.toString(16).padStart(2, '0')}`;
    }).join('');
    console.log(`\n[type=0x${type.toString(16).padStart(8,'0')} chunk=${i}] "Feng" at byte ${idx}:`);
    console.log(`  readable: ...${readable}...`);

    // Hex dump of 80 bytes starting 20 bytes before the match
    const dumpStart = Math.max(0, idx - 20);
    console.log(`  hex dump from +${dumpStart}:`);
    console.log(hexDump(data, dumpStart, Math.min(80, data.length - dumpStart)));

    idx = text.indexOf('Feng', idx + 1);
  }
}
