/**
 * diagLotInPackages.mjs
 *
 * Searches game package files for known lot name strings, then dumps
 * surrounding bytes to understand the lot definition format.
 * Once we find the format, we can extract field5 for all lots.
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const TARGETS = ['Cypress Terrace', 'Ophelia Villa', 'Asphalt Abodes', 'IX Landgraab', '20 Culpepper House'];
// Known field5 values for these lots (to verify if we find them nearby)
const KNOWN_F5 = {
  'Cypress Terrace': 2030771488,
  'Ophelia Villa': 3419959424,
  'Asphalt Abodes': 3031105549,
  'IX Landgraab': 2542534709,
  '20 Culpepper House': 2463039573,
};

// Only scan the big simulation/client packages — they're most likely to have lot data
const PACKAGES = [
  '/Applications/EA Games/The Sims 4.app/Contents/Data/Simulation/SimulationFullBuild0.package',
  '/Applications/EA Games/The Sims 4.app/Contents/Data/Client/ClientFullBuild3.package',
  '/Applications/EA Games/The Sims 4.app/Contents/Data/Client/ClientFullBuild0.package',
  '/Applications/EA Games/The Sims 4 Packs/EP01/ClientFullBuild0.package',  // Get Together (Windenburg)
  '/Applications/EA Games/The Sims 4 Packs/EP05/ClientFullBuild0.package',  // City Living (San Myshuno)
];

function readVarint(buf, pos) {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}

function parseDbpfIndex(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 96) return [];
  if (buf.slice(0, 4).toString('ascii') !== 'DBPF') return [];
  const indexCount = view.getUint32(36, true);
  const indexOffset = view.getUint32(64, true);
  if (!indexOffset || indexOffset >= buf.length) return [];
  const flags = view.getUint32(indexOffset, true);
  const typeConst   = (flags & 0x01) !== 0;
  const groupConst  = (flags & 0x02) !== 0;
  const instHiConst = (flags & 0x04) !== 0;
  let pos = indexOffset + 4;
  let constType = 0, constGroup = 0, constInstHi = 0;
  if (typeConst)   { constType   = view.getUint32(pos, true); pos += 4; }
  if (groupConst)  { constGroup  = view.getUint32(pos, true); pos += 4; }
  if (instHiConst) { constInstHi = view.getUint32(pos, true); pos += 4; }
  const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);
  const entries = [];
  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > buf.length) break;
    let off = pos;
    const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
    const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
    const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
    const instLo  = view.getUint32(off, true); off += 4;
    const offset  = view.getUint32(off, true); off += 4;
    const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
    const sizeDecomp = view.getUint32(off, true); off += 4;
    const compType = view.getUint16(off, true);
    pos += entrySize;
    const instFull = (BigInt(instHi) << 32n) | BigInt(instLo);
    entries.push({ type, group, instFull, instLo, offset, sizeComp, compType });
  }
  return entries;
}

function decomp(buf, entry) {
  const raw = buf.slice(entry.offset, entry.offset + entry.sizeComp);
  if (entry.compType === 0xffff) {
    try {
      const p = Buffer.from(raw);
      if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
      return decompress(p);
    } catch { return null; }
  }
  if (entry.compType === 0x5a42 || entry.compType === 0x5a4c) {
    return raw; // skip zlib for now
  }
  return raw;
}

function hexDump(data, start, len) {
  const rows = [];
  for (let i = 0; i < len; i += 16) {
    const row = [], chars = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      const b = data[start + i + j] ?? 0;
      row.push(b.toString(16).padStart(2,'0'));
      chars.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    rows.push(`  ${row.join(' ').padEnd(47)}  ${chars.join('')}`);
  }
  return rows.join('\n');
}

for (const pkgPath of PACKAGES) {
  let buf;
  try { buf = readFileSync(pkgPath); } catch { continue; }

  const shortPkg = pkgPath.split('/').slice(-3).join('/');
  const entries = parseDbpfIndex(buf);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Package: ${shortPkg}  (${entries.length} entries)`);

  let foundInPkg = false;

  for (const entry of entries) {
    const raw = buf.slice(entry.offset, entry.offset + entry.sizeComp);
    let data;
    if (entry.compType === 0xffff) {
      try {
        const p = Buffer.from(raw);
        if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
        data = decompress(p);
      } catch { continue; }
    } else {
      data = raw;
    }

    // Search for target strings
    for (const target of TARGETS) {
      const needle = Buffer.from(target, 'utf8');
      let searchPos = 0;
      while (searchPos < data.length - needle.length) {
        const found = data.indexOf(needle, searchPos);
        if (found === -1) break;
        searchPos = found + 1;

        // Show context: 32 bytes before, 64 bytes after
        const contextStart = Math.max(0, found - 32);
        const contextEnd = Math.min(data.length, found + needle.length + 64);
        const contextLen = contextEnd - contextStart;

        // Check if any known field5 values appear nearby (within ±128 bytes)
        const nearby = data.slice(Math.max(0, found - 128), Math.min(data.length, found + 128));
        const f5 = KNOWN_F5[target];
        const f5Buf = Buffer.allocUnsafe(4);
        f5Buf.writeUInt32LE(f5, 0);
        const f5Found = nearby.indexOf(f5Buf) !== -1;
        // Also check big-endian
        const f5BufBE = Buffer.allocUnsafe(4);
        f5BufBE.writeUInt32BE(f5, 0);
        const f5FoundBE = nearby.indexOf(f5BufBE) !== -1;

        if (!foundInPkg) {
          foundInPkg = true;
        }

        console.log(`\n  FOUND "${target}" at offset ${found}`);
        console.log(`  Resource: type=0x${entry.type.toString(16).padStart(8,'0')}  inst=0x${entry.instFull.toString(16).padStart(16,'0')}`);
        console.log(`  field5=${f5}  found_LE=${f5Found}  found_BE=${f5FoundBE}`);
        console.log(`  Context (${contextLen} bytes from offset ${contextStart}):`);
        console.log(hexDump(data, contextStart, contextLen));
      }
    }
  }

  if (!foundInPkg) {
    console.log('  (no target lot names found)');
  }
}
