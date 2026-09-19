/**
 * diagSeedTypeAudit.ts
 *
 * Parses a base-game save and reports every lot whose detected type
 * disagrees with our seed defaults in worlds.ts. The output is the
 * bug list we'll use to correct the seed so future imports only flag
 * REAL player edits, not seed-vs-EA drift.
 *
 * Run:
 *   node_modules/.bin/tsx scripts/diagSeedTypeAudit.ts <savePath>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';
import { LOT_FIELD5_MAP } from '../src/data/lotField5Map.js';
import { WORLDS_DATA } from '../src/data/worlds.js';
import { decompressRefpack } from '../src/lib/refpack.js';

// Re-implement the LDNB scan + tuning-ID extraction locally so we can
// split "no LDNB at all" from "LDNB found but tuning ID not in map".
function readVarintLocal(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}
function readFixed64LELocal(buf: Uint8Array, pos: number): bigint {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}
function detectTuningId(ldnb: Uint8Array): bigint | null {
  outer: for (let i = ldnb.length - 12; i >= 31; i--) {
    if (ldnb[i] !== 0x06) continue;
    if (ldnb[i + 1] !== 0x00 || ldnb[i + 2] !== 0x00 || ldnb[i + 3] !== 0x00) continue;
    for (let j = i - 28; j < i; j++) if (ldnb[j] !== 0x00) continue outer;
    if (i + 12 > ldnb.length) continue;
    return readFixed64LELocal(ldnb, i + 4);
  }
  return null;
}
function extractLdnb(raw: Uint8Array): Uint8Array | null {
  let p = 0;
  while (p < raw.length) {
    const tag = raw[p++];
    if (tag === 0) return null;
    const wt = tag & 0x07;
    if (wt === 0) { const [, n] = readVarintLocal(raw, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) {
      const [len, next] = readVarintLocal(raw, p);
      const end = next + Number(len);
      if (tag === 0x12) return raw.slice(next, end);
      p = end;
    }
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

const savePath = process.argv[2];
if (!savePath) {
  console.error('Usage: tsx scripts/diagSeedTypeAudit.ts <savePath>');
  process.exit(1);
}

console.log(`Loading ${savePath}…`);
const buf = readFileSync(savePath);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);
console.log(`Parsed ${data.lots.length} lots (${data.lots.filter(l => l.detectedType).length} with detected type)\n`);

// Build raw tuning-ID map per lot id (low32) so we can distinguish missing-LDNB
// from unmapped-tuning-ID for the "undetected" lots.
const rawTuningByLotIdLo = new Map<number, bigint | 'no-ldnb'>();
for (const r of resources.filter((r) => r.type === 0x06 && r.compType === 0xffff)) {
  try {
    const raw = decompressRefpack(r.data);
    let lotId: bigint | null = null;
    let p = 0;
    while (p < raw.length) {
      const tag = raw[p++];
      if (tag === 0) break;
      const wt = tag & 0x07;
      if (wt === 0) { const [, n] = readVarintLocal(raw, p); p = n; }
      else if (wt === 1) { if (tag === 0x09) lotId = readFixed64LELocal(raw, p); p += 8; }
      else if (wt === 2) { const [len, n] = readVarintLocal(raw, p); p = n + Number(len); }
      else if (wt === 5) p += 4;
      else break;
      if (lotId !== null) break;
    }
    if (lotId === null) continue;
    const ldnb = extractLdnb(raw);
    const lo = Number(lotId & 0xffffffffn);
    if (!ldnb) { rawTuningByLotIdLo.set(lo, 'no-ldnb'); continue; }
    const tid = detectTuningId(ldnb);
    rawTuningByLotIdLo.set(lo, tid ?? 'no-ldnb');
  } catch { /* skip */ }
}

type Row = {
  world: string;
  lotName: string;
  seedType: string;
  detectedType: string;
  field5: string;
};

// Mirror the GameImport.tsx rename/match logic so the audit reflects what the
// user actually sees in the import review modal.
function normalizeLotName(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/<[^>]+>/g, '');
}
function isLotNameUnchanged(saveName: string, seedName: string): boolean {
  const stripSpaces = (s: string) => s.replace(/\s+/g, '');
  const normSave = normalizeLotName(saveName);
  const normSeed = normalizeLotName(seedName);
  const a0 = stripSpaces(normSave);
  const b = stripSpaces(normSeed);
  if (a0 === b) return true;
  const aNoNum = stripSpaces(normSave.replace(/^\d+[a-z]?\s+/, ''));
  if (aNoNum === b) return true;
  if (aNoNum.length > 0 && (aNoNum.startsWith(b) || b.startsWith(aNoNum))) return true;
  if (a0.length > 0 && (a0.startsWith(b) || b.startsWith(a0))) return true;
  return false;
}
function buildNameIndex() {
  const m = new Map<string, string>();
  for (const [world, wd] of Object.entries(WORLDS_DATA)) {
    for (const lot of (wd as any).lots as Array<{ name: string }>) {
      const key = `${world}::${lot.name}`;
      const full = normalizeLotName(lot.name);
      const noNum = full.replace(/^\d+\s+/, '');
      const norm = full.replace(/\s+/g, '');
      const normNum = noNum.replace(/\s+/g, '');
      m.set(full, key);
      if (!m.has(noNum)) m.set(noNum, key);
      if (!m.has(norm)) m.set(norm, key);
      if (!m.has(normNum)) m.set(normNum, key);
    }
  }
  return m;
}
const NAME_INDEX = buildNameIndex();
function matchByName(gameLotName: string): string | null {
  const lower = normalizeLotName(gameLotName);
  const noNum = lower.replace(/^\d+\s+/, '');
  const norm = lower.replace(/\s+/g, '');
  const normNum = noNum.replace(/\s+/g, '');
  for (const k of [lower, norm, noNum, normNum]) if (NAME_INDEX.has(k)) return NAME_INDEX.get(k)!;
  for (const [k, v] of NAME_INDEX) if (k.startsWith(noNum + ' ') || k.startsWith(lower + ' ')) return v;
  return null;
}
function matchLot(field5: bigint | null, gameLotName: string): string | null {
  const byField5 = field5 !== null ? LOT_FIELD5_MAP[field5.toString()] ?? null : null;
  const byName = matchByName(gameLotName);
  if (byField5 && byName && byField5 !== byName) {
    const [wa] = byField5.split('::');
    const [wb] = byName.split('::');
    if (wa === wb) return byName;
  }
  return byField5 ?? byName;
}

const mismatches: Row[] = [];
const noField5: string[] = [];
const field5NotMapped: string[] = [];
const mappedButNotInSeed: string[] = [];
const noDetectedType: string[] = [];

const renameRows: { plannerKey: string; saveName: string; seedName: string }[] = [];
for (const lot of data.lots) {
  if (lot.field5 === null) {
    if (lot.detectedType) noField5.push(`(no field5)  detected=${lot.detectedType}  name="${lot.name}"`);
    continue;
  }
  const plannerKey = matchLot(lot.field5, lot.name);
  if (!plannerKey) {
    field5NotMapped.push(`field5=${lot.field5}  detected=${lot.detectedType ?? '?'}  name="${lot.name}"`);
    continue;
  }
  const [world, lotName] = plannerKey.split('::');
  const worldData = (WORLDS_DATA as any)[world];
  if (!worldData) {
    mappedButNotInSeed.push(`${plannerKey} (world missing from seed)`);
    continue;
  }
  const seedLot = worldData.lots.find((l: any) => l.name === lotName);
  if (!seedLot) {
    mappedButNotInSeed.push(`${plannerKey} (lot missing from seed)`);
    continue;
  }
  if (!lot.detectedType) {
    const lo = Number(lot.id & 0xffffffffn);
    const raw = rawTuningByLotIdLo.get(lo);
    if (raw === 'no-ldnb' || raw === undefined) {
      noDetectedType.push(`NO-LDNB     ${plannerKey}  seed=${seedLot.type}`);
    } else {
      noDetectedType.push(`UNMAPPED    ${plannerKey}  seed=${seedLot.type}  tuningId=0x${raw.toString(16)}`);
    }
    continue;
  }
  if (seedLot.type !== lot.detectedType) {
    mismatches.push({
      world,
      lotName,
      seedType: seedLot.type,
      detectedType: lot.detectedType,
      field5: lot.field5.toString(),
    });
  }
  if (lot.name && !isLotNameUnchanged(lot.name, lotName)) {
    renameRows.push({ plannerKey, saveName: lot.name, seedName: lotName });
  }
}

mismatches.sort((a, b) => a.world.localeCompare(b.world) || a.lotName.localeCompare(b.lotName));

console.log('═══════════════════════════════════════════════════════════════');
console.log(`  SEED ≠ SAVE — ${mismatches.length} mismatches`);
console.log('═══════════════════════════════════════════════════════════════');
console.log('These are lots where the seed default in worlds.ts disagrees with');
console.log('what the base-game save actually says. Each one is either:');
console.log('  (a) a seed bug (most cases — fix worlds.ts to match "save"), or');
console.log('  (b) a parser misdetection (rare, investigate the tuning ID).\n');

let curWorld = '';
for (const m of mismatches) {
  if (m.world !== curWorld) {
    curWorld = m.world;
    console.log(`\n── ${curWorld} ──`);
  }
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  console.log(`  ${pad(m.lotName, 38)}  seed=${pad(m.seedType, 24)}  save=${m.detectedType}`);
}

if (noDetectedType.length) {
  console.log(`\n\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Parser could not detect type — ${noDetectedType.length} lots`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('(Likely venue tuning IDs missing from VENUE_TUNING_MAP — Phase 1.5 territory.)\n');
  for (const s of noDetectedType.slice(0, 40)) console.log(`  ${s}`);
  if (noDetectedType.length > 40) console.log(`  …and ${noDetectedType.length - 40} more`);
}

if (field5NotMapped.length) {
  console.log(`\n\n═══════════════════════════════════════════════════════════════`);
  console.log(`  field5 not in LOT_FIELD5_MAP — ${field5NotMapped.length} lots`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('(New lots from packs released after the field5 map was built.)\n');
  for (const s of field5NotMapped.slice(0, 20)) console.log(`  ${s}`);
  if (field5NotMapped.length > 20) console.log(`  …and ${field5NotMapped.length - 20} more`);
}

if (mappedButNotInSeed.length) {
  console.log(`\n\n══ Mapped to a key not present in worlds.ts (${mappedButNotInSeed.length}) ══`);
  for (const s of mappedButNotInSeed.slice(0, 20)) console.log(`  ${s}`);
}

console.log(`\n\n═══════════════════════════════════════════════════════════════`);
console.log(`  Name changes still reported as renames — ${renameRows.length}`);
console.log('═══════════════════════════════════════════════════════════════');
for (const r of renameRows) {
  console.log(`  ${r.plannerKey}`);
  console.log(`     seed: "${r.seedName}"`);
  console.log(`     save: "${r.saveName}"`);
}

console.log(`\n\nSummary: ${mismatches.length} type mismatches • ${renameRows.length} renames • ${noDetectedType.length} undetected • ${field5NotMapped.length} unmapped`);
