/**
 * diagLotStrings.mjs
 *
 * Searches game package files for lot names with zlib decompression support.
 * Also checks Strings_ENG_US packages for string table entries.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { decompress } from 'qfs-compression';
import { inflateSync, unzipSync } from 'zlib';

const TARGETS = ['Cypress Terrace', 'Ophelia Villa', 'Asphalt Abodes', 'IX Landgraab', '20 Culpepper House', 'Pique Hearth'];
const KNOWN_F5 = {
  'Cypress Terrace': 2030771488,
  'Ophelia Villa': 3419959424,
  'Asphalt Abodes': 3031105549,
  'IX Landgraab': 2542534709,
  '20 Culpepper House': 2463039573,
  'Pique Hearth': 1046187072,
};

const GAME_BASE = '/Applications/EA Games';

function findStringPackages(dir, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (entry === 'Strings_ENG_US.package') results.push(full);
        else if (!entry.includes('.') || entry.endsWith('/')) findStringPackages(full, results);
      } catch {}
    }
  } catch {}
  return results;
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
    entries.push({ type, group, instFull, instLo, offset, sizeComp, sizeDecomp, compType });
  }
  return entries;
}

function decompressEntry(buf, entry) {
  const raw = buf.slice(entry.offset, entry.offset + entry.sizeComp);
  if (entry.compType === 0x0000) return raw;
  if (entry.compType === 0xffff) {
    try {
      const p = Buffer.from(raw);
      if (p[1] === 0xfb && p[0] !== 0x10) p[0] = 0x10;
      return decompress(p);
    } catch { return null; }
  }
  if (entry.compType === 0x5a42) {
    // EA zlib: 9-byte header then raw deflate data
    // Header: 4 bytes unknown, 4 bytes decompressed size, 1 byte flags
    // Actual data starts at offset 9 and is raw deflate (no zlib header)
    try { return inflateSync(raw.slice(9)); } catch {}
    try { return unzipSync(raw.slice(9)); } catch {}
    // Try without header skip
    try { return inflateSync(raw); } catch {}
    try { return unzipSync(raw); } catch {}
    return null;
  }
  return null;
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

// First check the raw bytes of a 0x5a42 resource to understand the header
const clientPkg = readFileSync('/Applications/EA Games/The Sims 4.app/Contents/Data/Client/ClientFullBuild0.package');
const clientEntries = parseDbpfIndex(clientPkg);
const firstZlib = clientEntries.find(e => e.compType === 0x5a42);
if (firstZlib) {
  const raw = clientPkg.slice(firstZlib.offset, firstZlib.offset + Math.min(32, firstZlib.sizeComp));
  console.log('First 0x5a42 resource header bytes:', raw.toString('hex'));
  console.log('sizeDecomp from index:', firstZlib.sizeDecomp);
}

// Check all string packages
console.log('\n--- Searching Strings_ENG_US packages ---');
const strPkgs = findStringPackages(GAME_BASE);
console.log(`Found ${strPkgs.length} string packages`);

for (const pkgPath of strPkgs) {
  let buf;
  try { buf = readFileSync(pkgPath); } catch { continue; }
  const entries = parseDbpfIndex(buf);
  let found = false;
  for (const entry of entries) {
    const data = decompressEntry(buf, entry);
    if (!data) continue;
    for (const target of TARGETS) {
      const needle = Buffer.from(target, 'utf8');
      const idx = data.indexOf(needle);
      if (idx !== -1) {
        if (!found) {
          console.log(`\n${pkgPath.split('/').slice(-4).join('/')}`);
          found = true;
        }
        const start = Math.max(0, idx - 48);
        const len = Math.min(data.length - start, target.length + 96);
        const f5 = KNOWN_F5[target];
        const f5LE = Buffer.allocUnsafe(4); f5LE.writeUInt32LE(f5, 0);
        const nearby = data.slice(Math.max(0, idx - 128), Math.min(data.length, idx + 128));
        const f5Found = nearby.indexOf(f5LE) !== -1;
        console.log(`  "${target}" at ${idx}  type=0x${entry.type.toString(16).padStart(8,'0')}  inst=0x${entry.instFull.toString(16).padStart(16,'0')}  f5_nearby=${f5Found}`);
        console.log(hexDump(data, start, len));
        break; // one hit per resource
      }
    }
  }
}
