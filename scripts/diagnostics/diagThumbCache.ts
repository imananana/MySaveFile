/**
 * Inspect localthumbcache.package: list its resource type distribution, then
 * cross-reference the instance IDs against household/sim/lot IDs from a save
 * to see how cleanly the cache maps back to save records.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const HOME   = process.env.HOME;
const CACHE  = `${HOME}/Documents/Electronic Arts/The Sims 4/localthumbcache.package`;
const SCACHE = `${HOME}/Documents/Electronic Arts/The Sims 4/localsimtexturecache.package`;
const ONLINE = `${HOME}/Documents/Electronic Arts/The Sims 4/onlinethumbnailcache`;
const SAVE   = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;

console.log(`Loading cache: ${CACHE}…`);
const cacheBuf = readFileSync(CACHE);
const cacheRes = parseDbpf(cacheBuf.buffer.slice(cacheBuf.byteOffset, cacheBuf.byteOffset + cacheBuf.byteLength));
console.log(`  ${cacheRes.length} resources`);

// Resource type distribution
const byType = new Map<number, { count: number; bytes: number }>();
for (const r of cacheRes) {
  const e = byType.get(r.type) ?? { count: 0, bytes: 0 };
  e.count++;
  e.bytes += r.data.length;
  byType.set(r.type, e);
}
console.log(`\nResource types in cache:`);
for (const [t, e] of [...byType.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  type=0x${t.toString(16).padStart(8, '0')}  count=${e.count.toString().padStart(6)}  totalBytes=${(e.bytes / 1024 / 1024).toFixed(2)} MB`);
}

// Show a few example resources of each type — first 2 bytes, group, instance
console.log(`\nFirst 2 resources per type (group/instance/first bytes):`);
const seenTypes = new Set<number>();
for (const r of cacheRes) {
  if (seenTypes.has(r.type)) continue;
  seenTypes.add(r.type);
  const examples = cacheRes.filter((x) => x.type === r.type).slice(0, 2);
  for (const ex of examples) {
    const hex = Array.from(ex.data.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const instId = (BigInt(ex.instHi ?? 0) << 32n) | BigInt(ex.instLo ?? 0);
    console.log(`  type=0x${ex.type.toString(16).padStart(8, '0')}  group=0x${(ex.group ?? 0).toString(16).padStart(8, '0')}  inst=0x${instId.toString(16).padStart(16, '0')}  compType=0x${ex.compType.toString(16)}  ${ex.data.length}b  bytes:${hex}`);
  }
}

// Now: take IDs from the save and look them up in the cache
console.log(`\n\nLoading save: ${SAVE}…`);
const saveBuf = readFileSync(SAVE);
const saveRes = parseDbpf(saveBuf.buffer.slice(saveBuf.byteOffset, saveBuf.byteOffset + saveBuf.byteLength));
const saveData = parseSaveData(saveRes);
console.log(`  ${saveData.sims.length} sims, ${saveData.households.length} households, ${saveData.lots.length} lots`);

// Build cache index: for each instance id (full 64-bit), list which types have it
const cacheByInst = new Map<bigint, number[]>();
for (const r of cacheRes) {
  const id = (BigInt(r.instHi ?? 0) << 32n) | BigInt(r.instLo ?? 0);
  if (!cacheByInst.has(id)) cacheByInst.set(id, []);
  cacheByInst.get(id)!.push(r.type);
}

console.log(`\nCache has ${cacheByInst.size} unique instance IDs across all types\n`);

function check(label: string, ids: bigint[]) {
  let hits = 0;
  const exampleHits: { id: bigint; types: string[] }[] = [];
  const exampleMisses: bigint[] = [];
  for (const id of ids) {
    const types = cacheByInst.get(id);
    if (types) {
      hits++;
      if (exampleHits.length < 3) {
        exampleHits.push({ id, types: [...new Set(types)].map((t) => '0x' + t.toString(16)) });
      }
    } else {
      if (exampleMisses.length < 3) exampleMisses.push(id);
    }
  }
  console.log(`${label}: ${hits}/${ids.length} found in cache`);
  for (const h of exampleHits) console.log(`  ✓ 0x${h.id.toString(16)}  types=[${h.types.join(', ')}]`);
  for (const m of exampleMisses) console.log(`  ✗ 0x${m.toString(16)}  (not in cache)`);
}

check('Households', saveData.households.map((h) => h.id));

// Full list of households NOT in the cache
const missing = saveData.households.filter((h) => !cacheByInst.has(h.id));
if (missing.length > 0) {
  console.log(`\nHouseholds NOT in cache (${missing.length}):`);
  for (const h of missing) {
    const numSims = h.simIds.length;
    const lotInfo = h.lotId !== null ? `lot=0x${h.lotId.toString(16)}` : '(no lot)';
    console.log(`  "${h.name}"  id=0x${h.id.toString(16)}  ${numSims} sim${numSims !== 1 ? 's' : ''}  ${lotInfo}`);
  }
}
check('Sims',       saveData.sims.map((s) => s.id));
check('Lots',       saveData.lots.map((l) => l.id));

// Also: lot field5 (the stable cross-save ID) might be what the cache uses for lots
console.log('');
const lotsByField5 = saveData.lots.filter((l) => l.field5 !== null);
check('Lots by field5', lotsByField5.map((l) => l.field5!));

// Low-32 of IDs sometimes used as well (as we saw with 0x06 resources)
console.log('');
const lotIdLo = saveData.lots.map((l) => l.id & 0xffffffffn);
check('Lots low-32', lotIdLo);
const simIdLo = saveData.sims.map((s) => s.id & 0xffffffffn);
check('Sims low-32', simIdLo);
const hhIdLo = saveData.households.map((h) => h.id & 0xffffffffn);
check('Households low-32', hhIdLo);

// ─── Also check localsimtexturecache.package ──────────────────────────────────
console.log(`\n\n── localsimtexturecache.package ──`);
try {
  const scBuf = readFileSync(SCACHE);
  const scRes = parseDbpf(scBuf.buffer.slice(scBuf.byteOffset, scBuf.byteOffset + scBuf.byteLength));
  console.log(`  ${scRes.length} resources`);
  const scByType = new Map<number, number>();
  for (const r of scRes) scByType.set(r.type, (scByType.get(r.type) ?? 0) + 1);
  for (const [t, c] of [...scByType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    type=0x${t.toString(16).padStart(8, '0')}  count=${c}`);
  }
  // Example resources of the dominant type
  const top = [...scByType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top !== undefined) {
    const examples = scRes.filter((r) => r.type === top).slice(0, 3);
    for (const ex of examples) {
      const id = (BigInt(ex.instHi) << 32n) | BigInt(ex.instLo);
      const hex = Array.from(ex.data.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`    type=0x${top.toString(16)}  group=0x${ex.group.toString(16)}  inst=0x${id.toString(16)}  ${ex.data.length}b  ${hex}`);
    }
  }
  // Build index and re-check
  const scByInst = new Map<bigint, number[]>();
  for (const r of scRes) {
    const id = (BigInt(r.instHi) << 32n) | BigInt(r.instLo);
    if (!scByInst.has(id)) scByInst.set(id, []);
    scByInst.get(id)!.push(r.type);
  }
  function check2(label: string, ids: bigint[]) {
    let hits = 0;
    for (const id of ids) if (scByInst.has(id)) hits++;
    console.log(`    ${label}: ${hits}/${ids.length} found`);
  }
  check2('Sims by full ID',  saveData.sims.map((s) => s.id));
  check2('Households by ID', saveData.households.map((h) => h.id));
  check2('Lots by ID',       saveData.lots.map((l) => l.id));
  check2('Sims low-32',      saveData.sims.map((s) => s.id & 0xffffffffn));
  check2('Lots field5',      saveData.lots.filter((l) => l.field5 !== null).map((l) => l.field5!));
} catch (e) {
  console.log(`  (failed to read: ${e})`);
}

// ─── Online thumbnail cache: 64-bit decimal-named JPG/PNG files ───────────────
console.log(`\n\n── onlinethumbnailcache/ ──`);
try {
  const fs = await import('fs');
  const files = fs.readdirSync(ONLINE);
  console.log(`  ${files.length} files`);
  const idSet = new Set<bigint>();
  for (const f of files) {
    const m = f.match(/^(\d+)\.(jpg|png)$/i);
    if (m) idSet.add(BigInt(m[1]));
  }
  console.log(`  ${idSet.size} parseable as <bigint>.(jpg|png)`);
  function check3(label: string, ids: bigint[]) {
    let hits = 0;
    for (const id of ids) if (idSet.has(id)) hits++;
    console.log(`    ${label}: ${hits}/${ids.length} found`);
  }
  check3('Sims', saveData.sims.map((s) => s.id));
  check3('Households', saveData.households.map((h) => h.id));
  check3('Lots', saveData.lots.map((l) => l.id));
  check3('Sims low-32', saveData.sims.map((s) => s.id & 0xffffffffn));
} catch (e) {
  console.log(`  (failed: ${e})`);
}
