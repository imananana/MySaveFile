/**
 * diagGamePackages.mjs
 *
 * Scans game package files to find which resource type contains lot definitions.
 * Strategy: look for our known field5 values as resource instance IDs.
 * If found, that tells us the resource type for all lot catalog entries.
 *
 * Usage:
 *   node scripts/diagGamePackages.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { decompress } from 'qfs-compression';

// Known field5 → lot name pairs from our reference saves
const KNOWN_FIELD5 = new Map([
  [2030771488n, 'Willow Creek::Cypress Terrace'],
  [3419959424n, 'Willow Creek::Ophelia Villa'],
  [1046187072n, 'Willow Creek::Pique Hearth'],
  [3031105549n, 'Newcrest::Asphalt Abodes'],
  [2038824967n, 'San Myshuno::121 Hakim House'],
  [2463039573n, 'San Myshuno::20 Culpepper House'],
  [2542534709n, 'San Myshuno::IX Landgraab Apartments'],
]);

const GAME_BASE = '/Applications/EA Games';

// Collect all package files
function findPackages(dir, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) findPackages(full, results);
        else if (entry.endsWith('.package') && !entry.startsWith('Strings_') && !entry.startsWith('magalog')) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

// Parse DBPF index
function parseDbpfIndex(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 96) return [];
  const magic = buf.slice(0, 4).toString('ascii');
  if (magic !== 'DBPF') return [];

  const indexCount = view.getUint32(36, true);
  const indexOffset = view.getUint32(64, true);
  if (indexOffset === 0 || indexOffset >= buf.length) return [];

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
    entries.push({ type, group, instHi, instLo, instFull, offset, sizeComp, sizeDecomp, compType });
  }
  return entries;
}

const packages = findPackages(GAME_BASE);
console.error(`Found ${packages.length} package files to scan`);

// Phase 1: look for known field5 values as instance IDs
const hits = [];
for (const pkgPath of packages) {
  try {
    const buf = readFileSync(pkgPath);
    const entries = parseDbpfIndex(buf);
    for (const e of entries) {
      // Check instLo (lower 32 bits) against known field5 values
      const instLo32 = BigInt(e.instLo);
      for (const [f5, name] of KNOWN_FIELD5) {
        if (instLo32 === (f5 & 0xFFFFFFFFn)) {
          hits.push({ pkg: pkgPath.replace(GAME_BASE + '/', ''), type: e.type, instFull: e.instFull, instLo: e.instLo, name });
        }
      }
    }
  } catch { continue; }
}

if (hits.length === 0) {
  console.log('No instance ID matches found. field5 may not be an instance ID.');

  // Phase 2: list unique resource types across all packages to guide further search
  const typeCounts = new Map();
  for (const pkgPath of packages.slice(0, 20)) {
    try {
      const buf = readFileSync(pkgPath);
      const entries = parseDbpfIndex(buf);
      for (const e of entries) {
        const t = '0x' + e.type.toString(16).padStart(8, '0');
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }
    } catch { continue; }
  }
  console.log('\nResource types found in first 20 packages:');
  [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([t, c]) => console.log(`  ${t}  count=${c}`));
} else {
  console.log(`\nFound ${hits.length} instance ID matches:`);
  // Group by resource type
  const byType = new Map();
  for (const h of hits) {
    const t = '0x' + h.type.toString(16).padStart(8, '0');
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(h);
  }
  for (const [type, hs] of byType) {
    console.log(`\nResource type ${type}:`);
    for (const h of hs) {
      console.log(`  inst=0x${h.instFull.toString(16).padStart(16,'0')}  ${h.name}  (${h.pkg})`);
    }
  }
}
