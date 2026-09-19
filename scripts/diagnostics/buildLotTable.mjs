/**
 * buildLotTable.mjs
 *
 * Scans the reference save (imanistan / Slot_1031202f.save) and extracts
 * every lot record's field1, field5, and name. Then matches each to
 * WORLDS_DATA to produce a field5 → plannerLotKey mapping table.
 *
 * Usage:
 *   node scripts/buildLotTable.mjs [path-to-save]
 *
 * Output: prints the TypeScript table to stdout, ready to paste into
 *   src/data/lotField5Map.ts
 */

import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load worlds data from the compiled JS (or read the TS source and strip types)
// We'll read the TS source directly and extract the data with a simple parse
import { readFileSync as rf } from 'fs';

const HOME = process.env.HOME;
const savePath = process.argv[2] ||
  `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_1031202f.save`;

// ─── Read WORLDS_DATA from src/data/worlds.ts ─────────────────────────────────
// Build the lot name index: normalised name → "World::LotName" key
// (same logic as GameImport.tsx)

const worldsSrc = readFileSync(
  new URL('../src/data/worlds.ts', import.meta.url).pathname.replace(/%20/g, ' '), 'utf8'
);

// Extract world/lot pairs via simple regex
// Matches: name: 'Some Lot Name' or name: "Some Lot Name"
const worldBlocks = [...worldsSrc.matchAll(/(\w+):\s*\{[^}]*lots:\s*\[([^\]]*)\]/gs)];

const LOT_NAME_INDEX = new Map(); // normalised name → plannerKey
const ALL_PLANNER_KEYS = new Map(); // plannerKey → canonical name

// Parse worlds.ts: strip the export wrapper and JSON.parse the object literal
const worldsJson = worldsSrc
  .replace(/^export const WORLDS_DATA\s*=\s*/, '')
  .replace(/\s*(?:as|satisfies)\s+[\s\S]*$/, '')  // strip trailing type assertion
  .replace(/;?\s*$/, '');                            // strip trailing semicolon

let WORLDS_DATA;
try {
  WORLDS_DATA = JSON.parse(worldsJson);
} catch (e) {
  // If it's not pure JSON (e.g. has trailing commas), fall back to regex extraction
  WORLDS_DATA = null;
}

if (WORLDS_DATA) {
  for (const [worldKey, worldVal] of Object.entries(WORLDS_DATA)) {
    const lots = worldVal.lots ?? [];
    for (const lot of lots) {
      const lotName = lot.name;
      const plannerKey = `${worldKey}::${lotName}`;
      ALL_PLANNER_KEYS.set(plannerKey, lotName);
      const full    = normalizeName(lotName);
      const noNum   = full.replace(/^\d+\s+/, '');
      const norm    = full.replace(/\s+/g, '');
      const normNum = noNum.replace(/\s+/g, '');
      for (const k of [full, noNum, norm, normNum]) {
        if (!LOT_NAME_INDEX.has(k)) LOT_NAME_INDEX.set(k, plannerKey);
      }
    }
  }
} else {
  // Fallback regex extraction for non-JSON TS files
  let currentWorld = null;
  for (const line of worldsSrc.split('\n')) {
    const wq = line.match(/^\s{2}"([^"]+)":\s*\{/);
    if (wq) { currentWorld = wq[1]; continue; }
    const wb = line.match(/^\s{2}(\w+):\s*\{/);
    if (wb) { currentWorld = wb[1]; continue; }
    if (!currentWorld) continue;
    const lotMatch = line.match(/"name":\s*"([^"]+)"/);
    if (lotMatch) {
      const lotName = lotMatch[1];
      const plannerKey = `${currentWorld}::${lotName}`;
      ALL_PLANNER_KEYS.set(plannerKey, lotName);
      const full    = normalizeName(lotName);
      const noNum   = full.replace(/^\d+\s+/, '');
      const norm    = full.replace(/\s+/g, '');
      const normNum = noNum.replace(/\s+/g, '');
      for (const k of [full, noNum, norm, normNum]) {
        if (!LOT_NAME_INDEX.has(k)) LOT_NAME_INDEX.set(k, plannerKey);
      }
    }
  }
}

function normalizeName(s) {
  return s
    .toLowerCase().trim()
    .replace(/[‘’ʼ]/g, "'")  // smart apostrophes → straight
    .replace(/[“”]/g, '"')          // curly double quotes → straight
    .replace(/<[^>]+>/g, '');                 // strip HTML tags (e.g. StrangerVille lab)
}

function matchLotName(gameLotName) {
  const lower   = normalizeName(gameLotName);
  const noNum   = lower.replace(/^\d+\s+/, '');
  const norm    = lower.replace(/\s+/g, '');
  const normNum = noNum.replace(/\s+/g, '');
  for (const k of [lower, noNum, norm, normNum]) {
    if (LOT_NAME_INDEX.has(k)) return LOT_NAME_INDEX.get(k);
  }
  // Prefix match (truncated names like "IX Landgraab" → "IX Landgraab Apartments")
  for (const [key, value] of LOT_NAME_INDEX) {
    if (key.startsWith(noNum + ' ') || key.startsWith(lower + ' ')) return value;
  }
  return null;
}

// ─── DBPF index parsing ────────────────────────────────────────────────────────

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

// ─── Protobuf helpers ──────────────────────────────────────────────────────────

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

function readFixed64LE(buf, pos) {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}

function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end];
}

function skipVarint(buf, pos) {
  while (pos < buf.length && (buf[pos] & 0x80) !== 0) pos++;
  return pos + 1;
}

// ─── Lot scanner — scans 0x3a (field 7) records which contain ALL lot types ────
// Structure: tag 0x09 (fixed64 id), tag 0x12 (string name), ... tag 0x28 (varint field5)
// Also scans legacy 0x2a (field 5) residential records for any extras.

function scanLotsWithField5(buf) {
  const lots = [];
  const seen = new Set(); // dedup by id

  // Primary: scan 0x3a records (all lot types — residential + venues)
  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x3a) continue;

    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    if (msgLen < 12n || msgLen > 50000n) continue;
    const msgEnd = msgStart + Number(msgLen);
    if (msgEnd > buf.length) continue;
    pos = msgStart;

    // field 1: tag 0x09 (fixed64)
    if (buf[pos] !== 0x09) continue; pos++;
    if (pos + 8 > msgEnd) continue;
    const id = readFixed64LE(buf, pos); pos += 8;

    // field 2: tag 0x12 (string = name)
    if (pos >= msgEnd || buf[pos] !== 0x12) continue; pos++;
    const [lotName, afterName] = readString(buf, pos); pos = afterName;
    if (!lotName || lotName.length < 3) continue;
    if (/^[a-z][a-z0-9_:]+$/.test(lotName)) continue;

    // Walk forward to find field5 (tag 0x28, varint)
    let p = pos;
    let field5 = null;
    while (p < msgEnd) {
      const tag = buf[p];
      const wireType = tag & 0x07;
      const fieldNum = tag >> 3;
      p++;
      if (fieldNum === 0) break;
      if (tag === 0x28) {
        const [val, next] = readVarint(buf, p);
        field5 = val; p = next; break;
      }
      if (wireType === 0) { const [, next] = readVarint(buf, p); p = next; }
      else if (wireType === 1) { p += 8; }
      else if (wireType === 2) { const [len, next] = readVarint(buf, p); p = next + Number(len); }
      else if (wireType === 5) { p += 4; }
      else break;
    }

    const key = id.toString(16);
    if (!seen.has(key)) {
      seen.add(key);
      lots.push({ field1: 0, lotId: id, name: lotName, field5 });
    }
    i = msgEnd - 1;
  }

  return lots;
}

// ─── Main scan ─────────────────────────────────────────────────────────────────

const allLots = [];
const seenIds = new Set();

let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
  const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
  const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
  const instLo  = view.getUint32(off, true); off += 4;
  const offset  = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;

  if (type !== 0x0d && type !== 0x06) continue;
  if (type === 0x06 && compType !== 0xffff) continue;

  let data = buf.slice(offset, offset + sizeComp);
  if (compType === 0xffff) {
    try {
      const patched = Buffer.from(data);
      if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
      data = decompress(patched);
    } catch { continue; }
  }

  for (const lot of scanLotsWithField5(data)) {
    if (!seenIds.has(lot.lotId)) {
      seenIds.add(lot.lotId);
      allLots.push(lot);
    }
  }
}

// ─── Match against WORLDS_DATA and report ──────────────────────────────────────

const matched = [];
const unmatched = [];
const field5Collisions = new Map(); // field5 → [plannerKeys]

for (const lot of allLots) {
  const plannerKey = matchLotName(lot.name);
  if (plannerKey) {
    matched.push({ ...lot, plannerKey });
    if (lot.field5 !== null) {
      const f5str = lot.field5.toString();
      if (!field5Collisions.has(f5str)) field5Collisions.set(f5str, []);
      field5Collisions.get(f5str).push(plannerKey);
    }
  } else {
    unmatched.push(lot);
  }
}

// Check for field5 collisions
const collisions = [...field5Collisions.entries()].filter(([, keys]) => keys.length > 1);

console.error(`\nSave: ${savePath}`);
console.error(`Total lots found: ${allLots.length}`);
console.error(`Matched to WORLDS_DATA: ${matched.length}`);
console.error(`Unmatched (no name match): ${unmatched.length}`);
console.error(`Lots with no field5: ${allLots.filter(l => l.field5 === null).length}`);
console.error(`Field5 collisions (same field5, different lots): ${collisions.length}`);

if (collisions.length > 0) {
  console.error('\nCOLLISIONS:');
  for (const [f5, keys] of collisions) {
    console.error(`  field5=${f5}: ${keys.join(', ')}`);
  }
}

if (unmatched.length > 0) {
  console.error('\nUnmatched lot names (could be gallery replacements or unknown lots):');
  for (const l of unmatched) {
    console.error(`  f1=${l.field1}  f5=${l.field5}  "${l.name}"`);
  }
}

// Output the matched lots sorted by plannerKey for readability
console.error('\nMatched lots with field5 values:');
for (const l of matched.sort((a, b) => a.plannerKey.localeCompare(b.plannerKey))) {
  console.error(`  ${l.field5?.toString().padStart(12)}  ${l.plannerKey}  "${l.name}"`);
}

// ─── Emit TypeScript table ─────────────────────────────────────────────────────

const lines = [
  '// Auto-generated from imanistan reference save (Slot_1031202f.save)',
  '// field5 (tag 0x28 varint) is stable across saves for the same physical lot.',
  '// Maps field5 value → planner lot key ("World::LotName").',
  '// Used as primary lot-matching method during game save import.',
  '',
  'export const LOT_FIELD5_MAP: Record<string, string> = {',
];

// Deduplicate by field5 — when multiple lots share a field5 (apartment units),
// keep the one with the lowest-numbered unit name (or first alphabetically)
const byField5Dedup = new Map();
for (const l of matched.filter(l => l.field5 !== null)) {
  const f5 = l.field5.toString();
  if (!byField5Dedup.has(f5)) byField5Dedup.set(f5, l);
  // prefer the entry whose plannerKey sorts earlier (lower unit number)
  else if (l.plannerKey < byField5Dedup.get(f5).plannerKey) byField5Dedup.set(f5, l);
}

const byKey = [...byField5Dedup.values()].sort((a, b) => a.plannerKey.localeCompare(b.plannerKey));

for (const l of byKey) {
  const v = l.plannerKey;
  let key;
  if (!v.includes("'")) key = `'${v}'`;
  else if (!v.includes('"')) key = `"${v}"`;
  else key = `\`${v.replace(/`/g, '\\`')}\``;
  lines.push(`  '${l.field5}': ${key},  // "${l.name}"`);
}

lines.push('};');

console.log(lines.join('\n'));
