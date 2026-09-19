/**
 * diagPetSubtype.ts
 *
 * For every confirmed pet in Slot_1031202f, dump the protobuf fields that come
 * AFTER f10 (the pet discriminator) inside the sim record. We're looking for
 * a varint field that:
 *   - takes value X for cats   (Harry)
 *   - takes value Y for horses (Cheyenne)
 *   - takes value Z for dogs   (Buddy, Sheba, Monka, Oreo) — all 4 share Z
 *
 * If we see exactly that pattern in one column, that's our subtype field.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';
import { parseSaveData } from '../src/lib/saveParser.js';

// Multi-save mode. Pet labels here are all BREED-CONFIRMED (so we trust species).
// Slot_10312032 picked up many EA pre-mades when the household was added — we
// use those for a clean dataset of cat/dog/horse with known species.
const HOME = process.env.HOME!;
const ALL_SAVES = [
  { path: `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`,
    pets: {
      Kitty: 'cat', Doc: 'cat', Josie: 'cat', Cleo: 'cat', 'Mayor Whiskers': 'cat',
      Doggy: 'dog', Blue: 'dog', Rosie: 'dog', 'Captain Whitaker': 'dog',
      Horsey: 'horse', 'Duke Gooseman': 'horse', Starbrite: 'horse', Flapjack: 'horse',
    } },
  { path: `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`,
    pets: { Cheyenne: 'horse', Sheba: 'dog', Oreo: 'dog' } },
];
const SAVE = ALL_SAVES[0].path;
const KNOWN_PETS: Record<string, string> = { ...ALL_SAVES[0].pets, ...ALL_SAVES[1].pets };

function readVarint(b: Uint8Array, p: number): [bigint, number] {
  let v = 0n, s = 0n;
  while (p < b.length) {
    const x = b[p++];
    v |= BigInt(x & 0x7f) << s;
    s += 7n;
    if ((x & 0x80) === 0) break;
  }
  return [v, p];
}
function readFixed64LE(b: Uint8Array, p: number): bigint {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(b[p + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(b[p + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}
function readFixed32LE(b: Uint8Array, p: number): number {
  return (b[p] | (b[p+1]<<8) | (b[p+2]<<16) | (b[p+3]<<24)) >>> 0;
}

// Recursively walk a protobuf-encoded buffer span. Returns leaf entries with
// dotted-path keys like "f30.f17.f1".
type Leaf = { path: string; wt: number; value: string };
function walkRecurse(buf: Uint8Array, start: number, end: number, prefix: string, depth: number, out: Leaf[]) {
  if (depth > 8) return;
  let p = start;
  while (p < end) {
    const b0 = buf[p];
    if (b0 === 0) return;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else {
      if (p + 1 >= end) return;
      const b1 = buf[p + 1];
      if ((b1 & 0x80) !== 0) return;
      tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
      afterTag = p + 2;
    }
    const fieldNum = tag >> 3;
    const wt = tag & 7;
    if (fieldNum > 200 || fieldNum === 0) return;
    p = afterTag;
    const path = prefix ? `${prefix}.f${fieldNum}` : `f${fieldNum}`;
    if (wt === 0) {
      const [v, n] = readVarint(buf, p); p = n;
      out.push({ path, wt, value: v.toString() });
    } else if (wt === 1) {
      if (p + 8 > end) return;
      const v = readFixed64LE(buf, p); p += 8;
      out.push({ path, wt, value: `0x${v.toString(16)}` });
    } else if (wt === 2) {
      const [len, n] = readVarint(buf, p);
      const ln = Number(len);
      const subEnd = n + ln;
      if (subEnd > end) return;
      const slice = buf.slice(n, n + Math.min(ln, 24));
      const utf = new TextDecoder('utf-8', { fatal: false }).decode(slice).replace(/[^\x20-\x7e]/g, '·');
      out.push({ path, wt, value: `<${ln}b>${utf.length > 0 ? ` "${utf}"` : ''}` });
      if (ln >= 2 && ln < 4000) walkRecurse(buf, n, subEnd, path, depth + 1, out);
      p = subEnd;
    } else if (wt === 5) {
      if (p + 4 > end) return;
      const v = readFixed32LE(buf, p); p += 4;
      out.push({ path, wt, value: `0x${v.toString(16)}` });
    } else return;
  }
}

// Top-level walker — caller supplies a precise record end (boundary derived from
// the next sim record's start offset).
function walkFields(buf: Uint8Array, start: number, end: number, maxFields = 2000): Leaf[] {
  const out: Leaf[] = [];
  walkRecurse(buf, start, end, '', 0, out);
  return out.slice(0, maxFields);
}

// Locate a sim record by its sim ID (the 0x09 tag + 8-byte fixed64 anchor)
// and return the buffer offset where the post-f10 fields begin.
function findPostF10BySimId(buf: Uint8Array, simId: bigint): number | null {
  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
    // Read the next 8 bytes as fixed64 and check against simId
    const id = readFixed64LE(buf, i + 1);
    if (id !== simId) continue;
    let pos = i + 9;
    if (buf[pos] !== 0x11) continue; pos += 9;
    if (buf[pos] !== 0x18) continue; pos++;
    const [, afterTs] = readVarint(buf, pos); pos = afterTs;
    if (buf[pos] !== 0x21) continue; pos += 9;
    if (buf[pos] !== 0x2a) continue; pos++;
    const [firstLen, firstStart] = readVarint(buf, pos);
    pos = firstStart + Number(firstLen);
    if (buf[pos] !== 0x32) continue; pos++;
    const [lastLen, lastStart] = readVarint(buf, pos);
    pos = lastStart + Number(lastLen);
    if (buf[pos] !== 0x38) continue; pos++;
    const [, afterG] = readVarint(buf, pos); pos = afterG;
    if (buf[pos] !== 0x40) continue; pos++;
    const [, afterL] = readVarint(buf, pos); pos = afterL;
    if (buf[pos] !== 0x4d) continue; pos += 5;
    if (buf[pos] !== 0x50) continue; pos++;
    const [, afterF10] = readVarint(buf, pos); pos = afterF10;
    return pos;
  }
  return null;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

// Multi-save load
type LoadedSave = { path: string; buffers: Uint8Array[]; data: ReturnType<typeof parseSaveData> };
const loaded: LoadedSave[] = [];
for (const { path } of ALL_SAVES) {
  console.log(`Loading ${path.split('/').pop()}…`);
  const file = readFileSync(path);
  const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const buffers: Uint8Array[] = [];
  for (const r of resources.filter((r) => r.type === 0x0d)) {
    try { buffers.push(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch {}
  }
  loaded.push({ path, buffers, data: parseSaveData(resources) });
}

// Build anchor list per save's buffers
function buildAnchorsPerSave(buffers: Uint8Array[]) {
  type Anchor = { offset: number; postF10: number; simId: bigint; bufIdx: number };
  const anchors: Anchor[] = [];
  for (let bi = 0; bi < buffers.length; bi++) {
    const buf = buffers[bi];
    for (let i = 0; i < buf.length - 60; i++) {
      if (buf[i] !== 0x09) continue;
      const id = readFixed64LE(buf, i + 1);
      if (id === 0n || id < 0x10000n) continue;
      let pos = i + 9;
      if (buf[pos] !== 0x11) continue; pos += 9;
      if (buf[pos] !== 0x18) continue; pos++;
      const [, afterTs] = readVarint(buf, pos); pos = afterTs;
      if (buf[pos] !== 0x21) continue; pos += 9;
      if (buf[pos] !== 0x2a) continue; pos++;
      const [firstLen, firstStart] = readVarint(buf, pos);
      pos = firstStart + Number(firstLen);
      if (buf[pos] !== 0x32) continue; pos++;
      const [lastLen, lastStart] = readVarint(buf, pos);
      pos = lastStart + Number(lastLen);
      if (buf[pos] !== 0x38) continue; pos++;
      const [, afterG] = readVarint(buf, pos); pos = afterG;
      if (buf[pos] !== 0x40) continue; pos++;
      const [, afterL] = readVarint(buf, pos); pos = afterL;
      if (buf[pos] !== 0x4d) continue; pos += 5;
      if (buf[pos] !== 0x50) continue; pos++;
      const [, afterF10] = readVarint(buf, pos); pos = afterF10;
      anchors.push({ offset: i, postF10: pos, simId: id, bufIdx: bi });
      i = pos - 1;
    }
  }
  anchors.sort((a, b) => a.bufIdx - b.bufIdx || a.offset - b.offset);
  return anchors;
}

const dumps: Record<string, Leaf[]> = {};
for (const { pets, buffers } of loaded.map((l, i) => ({ pets: ALL_SAVES[i].pets, buffers: l.buffers, data: l.data }))) {
  const anchors = buildAnchorsPerSave(buffers);
  const data = loaded.find((l) => l.buffers === buffers)!.data;
  for (const [name, kind] of Object.entries(pets)) {
    const sim = data.sims.find((s) => s.firstName === name);
    if (!sim) { console.log(`!! ${name} (${kind}) — not found by parser`); continue; }
    const idx = anchors.findIndex((a) => a.simId === sim.id);
    if (idx < 0) { console.log(`!! ${name} (${kind}) — anchor not located`); continue; }
    const anc = anchors[idx];
    const next = anchors.slice(idx + 1).find((a) => a.bufIdx === anc.bufIdx);
    const end = next ? next.offset : buffers[anc.bufIdx].length;
    const leaves = walkFields(buffers[anc.bufIdx], anc.postF10, end);
    dumps[`${name} (${kind})`] = leaves;
    console.log(`  ${name} (${kind}): id=0x${sim.id.toString(16)}  span=${anc.postF10}..${end} (${end - anc.postF10}b)  leaves=${leaves.length}`);
  }
}

// Side-by-side dump of ALL paths and values.
const labels0 = Object.keys(dumps);
const allPaths0 = new Set<string>();
for (const d of Object.values(dumps)) for (const e of d) allPaths0.add(e.path);
const sortedPaths = [...allPaths0].sort();
console.log('\n── Side-by-side dump ──');
console.log('path'.padEnd(20) + labels0.map(l => l.padEnd(22)).join(''));
for (const path of sortedPaths) {
  const cells = labels0.map(l => {
    const entries = dumps[l].filter(e => e.path === path);
    if (entries.length === 0) return '-'.padEnd(22);
    const v = entries[0].value;
    return v.length > 20 ? v.slice(0, 19) + '…' : v.padEnd(22);
  });
  // Skip if all cells are identical (boring)
  const uniq = new Set(cells.map(c => c.trim()));
  if (uniq.size <= 1) continue;
  console.log(path.padEnd(20) + cells.join(''));
}

// Group leaves by path and find paths that split cleanly by species.
const labels = Object.keys(dumps);
const allPaths = new Set<string>();
for (const d of Object.values(dumps)) for (const e of d) allPaths.add(e.path);

console.log(`\nTotal distinct paths: ${allPaths.size}`);

// For each path, check species split — across all wire types.
type Candidate = { path: string; wt: number; byKind: Record<string, Set<string>> };
const cands: Candidate[] = [];
for (const path of allPaths) {
  const values: Record<string, string> = {};
  const wts: number[] = [];
  let presentInAll = true;
  for (const label of labels) {
    const entries = dumps[label].filter((e) => e.path === path);
    if (entries.length === 0) { presentInAll = false; break; }
    values[label] = entries[0].value;
    wts.push(entries[0].wt);
  }
  if (!presentInAll) continue;
  const wt = wts[0];
  if (!wts.every((w) => w === wt)) continue;
  const byKind: Record<string, Set<string>> = {};
  for (const label of labels) {
    const kind = label.match(/\((\w+)\)/)?.[1] ?? '?';
    (byKind[kind] ??= new Set()).add(values[label]);
  }
  const kinds = Object.keys(byKind);
  if (!kinds.every((k) => byKind[k].size === 1)) continue;
  if (new Set(kinds.map((k) => [...byKind[k]][0])).size !== kinds.length) continue;
  cands.push({ path, wt, byKind });
}

console.log(`\n── Paths that split cleanly by species (${cands.length}) ──`);
for (const c of cands.slice(0, 100)) {
  console.log(`  ★ ${c.path} (wt${c.wt})`);
  for (const k of Object.keys(c.byKind)) console.log(`     ${k.padEnd(8)} → ${[...c.byKind[k]][0]}`);
}
if (cands.length > 100) console.log(`  …and ${cands.length - 100} more`);

// PRESENCE-based check: a path that appears in all pets of one species but NOT in any of the other species.
console.log('\n── Paths present in ALL pets of one species but NONE of the others ──');
let presOk = 0;
for (const path of allPaths) {
  const present: Record<string, { in: number; total: number }> = { cat: { in: 0, total: 0 }, dog: { in: 0, total: 0 }, horse: { in: 0, total: 0 } };
  for (const label of labels) {
    const kind = label.match(/\((\w+)\)/)?.[1] ?? '?';
    if (!present[kind]) continue;
    present[kind].total++;
    if (dumps[label].some((e) => e.path === path)) present[kind].in++;
  }
  for (const k of ['cat', 'dog', 'horse']) {
    if (present[k].in === present[k].total && present[k].in > 0) {
      const others = ['cat','dog','horse'].filter(x => x !== k);
      if (others.every(o => present[o].in === 0)) {
        console.log(`  ★ ${path}  ALL ${present[k].total} ${k}s have it, no others`);
        presOk++;
        break;
      }
    }
  }
  if (presOk >= 40) break;
}

// Also: paths where ALL DOGS share the same value AND the cat AND horse differ from dogs.
// (Looser — allows the discriminator to encode breed within dogs.)
console.log(`\n── Paths where 'all dogs same' AND cat≠dog AND horse≠dog ──`);
let loose = 0;
for (const path of allPaths) {
  const values: Record<string, string[]> = { cat: [], dog: [], horse: [] };
  let presentInAll = true;
  for (const label of labels) {
    const entries = dumps[label].filter((e) => e.path === path);
    if (entries.length === 0) { presentInAll = false; break; }
    const kind = label.match(/\((\w+)\)/)?.[1] ?? '?';
    if (kind === 'cat' || kind === 'dog' || kind === 'horse') values[kind].push(entries[0].value);
  }
  if (!presentInAll) continue;
  if (values.dog.length === 0) continue;
  const dogVals = new Set(values.dog);
  if (dogVals.size !== 1) continue;
  const dogVal = [...dogVals][0];
  if (values.cat.length > 0 && values.cat[0] === dogVal) continue;
  if (values.horse.length > 0 && values.horse[0] === dogVal) continue;
  console.log(`  ★ ${path}`);
  console.log(`     cat → ${values.cat[0]}`);
  console.log(`     dog → ${dogVal} (n=${values.dog.length})`);
  console.log(`     horse → ${values.horse[0]}`);
  loose++;
  if (loose >= 30) { console.log(`  …(stopping at 30)`); break; }
}
