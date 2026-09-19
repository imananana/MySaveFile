/**
 * Read f60 (candidate pet-species enum) for every known pet across all saves.
 * If f60 takes one value per species regardless of breed/source (gallery vs CAS),
 * it's our discriminator.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const HOME = process.env.HOME;
const TESTS: { save: string; pets: Record<string, string> }[] = [
  { save: `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`, pets: { Kitty: 'cat', Doggy: 'dog', Horsey: 'horse' } },
  { save: `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`, pets: { Harry: 'cat', Cheyenne: 'horse', Buddy: 'dog', Sheba: 'dog', Monka: 'dog', Oreo: 'dog' } },
];

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

// Build precise sim-record offset list per buffer so we can derive boundaries.
function buildAnchors(buf: Uint8Array): { offset: number; postLast: number; simId: bigint }[] {
  const out: { offset: number; postLast: number; simId: bigint }[] = [];
  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
    const id = readFixed64LE(buf, i + 1);
    if (id < 0x10000n) continue;
    let pos = i + 9;
    if (buf[pos] !== 0x11) continue; pos += 9;
    if (buf[pos] !== 0x18) continue; pos++;
    const [, a1] = readVarint(buf, pos); pos = a1;
    if (buf[pos] !== 0x21) continue; pos += 9;
    if (buf[pos] !== 0x2a) continue; pos++;
    const [fl, fs] = readVarint(buf, pos); pos = fs + Number(fl);
    if (buf[pos] !== 0x32) continue; pos++;
    const [ll, ls] = readVarint(buf, pos); pos = ls + Number(ll);
    out.push({ offset: i, postLast: pos, simId: id });
    i = pos - 1;
  }
  out.sort((a, b) => a.offset - b.offset);
  return out;
}

// Walk all top-level fields of a sim record. Returns map field→value.
function dumpTopLevelFields(buf: Uint8Array, simId: bigint, anchors: { offset: number; postLast: number; simId: bigint }[]): Map<number, string> | null {
  const idx = anchors.findIndex((a) => a.simId === simId);
  if (idx < 0) return null;
  const anc = anchors[idx];
  const end = idx + 1 < anchors.length ? anchors[idx + 1].offset : buf.length;
  let pos = anc.postLast;
  const out = new Map<number, string>();
  {
    let bailReason = '';
    while (pos < end) {
      const b0 = buf[pos];
      if (b0 === 0) { bailReason = `b0=0 at ${pos}`; break; }
      let tag: number, afterTag: number;
      if ((b0 & 0x80) === 0) { tag = b0; afterTag = pos + 1; }
      else {
        const b1 = buf[pos + 1];
        if ((b1 & 0x80) !== 0) {
          // 3+ byte varint tag (fnum >= 16384). Decode it.
          let v = BigInt(b0 & 0x7f), s = 7n;
          let p2 = pos + 1;
          while (p2 < end) {
            const bx = buf[p2++];
            v |= BigInt(bx & 0x7f) << s; s += 7n;
            if ((bx & 0x80) === 0) break;
            if (s > 35n) { bailReason = `tag varint too long at ${pos}`; break; }
          }
          tag = Number(v);
          afterTag = p2;
        } else {
          tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
          afterTag = pos + 2;
        }
      }
      if (bailReason) break;
      const fnum = tag >> 3;
      const wt = tag & 7;
      if (fnum === 0) { bailReason = `fnum=0 (tag=${tag}) at ${pos}`; break; }
      if (fnum > 2000) { bailReason = `fnum=${fnum} too large at ${pos}`; break; }
      pos = afterTag;
      if (wt === 0) {
        const [v, n] = readVarint(buf, pos); pos = n;
        if (!out.has(fnum)) out.set(fnum, `v=${v}`);
      } else if (wt === 1) {
        if (pos + 8 > end) break;
        const v = readFixed64LE(buf, pos); pos += 8;
        if (!out.has(fnum)) out.set(fnum, `f64=0x${v.toString(16)}`);
      } else if (wt === 2) {
        const [len, n] = readVarint(buf, pos);
        const ln = Number(len);
        if (n + ln > end) break;
        const slice = buf.slice(n, n + Math.min(ln, 30));
        const printable = new TextDecoder('utf-8', { fatal: false }).decode(slice).replace(/[^\x20-\x7e]/g, '·');
        if (!out.has(fnum)) out.set(fnum, `<${ln}b>"${printable}"`);
        pos = n + ln;
      } else if (wt === 5) {
        if (pos + 4 > end) break;
        const v = (buf[pos] | (buf[pos+1]<<8) | (buf[pos+2]<<16) | (buf[pos+3]<<24)) >>> 0;
        pos += 4;
        if (!out.has(fnum)) out.set(fnum, `f32=0x${v.toString(16)}`);
      } else { bailReason = `bad wt=${wt} at ${pos - (afterTag - pos)}`; break; }
    }
    (out as any).__bail = bailReason || `pos=${pos} end=${end}`;
    return out;
  }
}

function findF60(buf: Uint8Array, simId: bigint): bigint | null {
  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
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
    // From here, walk forward looking for tag varint 0xe0 0x03 (f60 wt0)
    const end = Math.min(buf.length, pos + 50_000);
    while (pos < end) {
      const b0 = buf[pos];
      if (b0 === 0) return null;
      let tag: number, afterTag: number;
      if ((b0 & 0x80) === 0) { tag = b0; afterTag = pos + 1; }
      else {
        const b1 = buf[pos + 1];
        if ((b1 & 0x80) !== 0) return null;
        tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
        afterTag = pos + 2;
      }
      const fnum = tag >> 3;
      const wt = tag & 7;
      if (fnum === 60 && wt === 0) {
        const [val] = readVarint(buf, afterTag);
        return val;
      }
      pos = afterTag;
      if (wt === 0) { const [, n] = readVarint(buf, pos); pos = n; }
      else if (wt === 1) pos += 8;
      else if (wt === 2) { const [len, n] = readVarint(buf, pos); pos = n + Number(len); }
      else if (wt === 5) pos += 4;
      else return null;
    }
    return null;
  }
  return null;
}

type PetRow = { label: string; kind: string; fields: Map<number, string> };
const allPets: PetRow[] = [];
for (const { save, pets } of TESTS) {
  const f = readFileSync(save);
  const res = parseDbpf(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
  const buffers: Uint8Array[] = [];
  for (const r of res.filter((r) => r.type === 0x0d)) {
    try { buffers.push(r.compType === 0xffff ? decompressRefpack(r.data) : r.data); } catch {}
  }
  const data = parseSaveData(res);
  for (const [name, kind] of Object.entries(pets)) {
    const sim = data.sims.find((s) => s.firstName === name);
    if (!sim) continue;
    let fields: Map<number, string> | null = null;
    for (const buf of buffers) {
      const anc = buildAnchors(buf);
      fields = dumpTopLevelFields(buf, sim.id, anc);
      if (fields) break;
    }
    if (fields) {
      allPets.push({ label: name, kind, fields });
      console.log(`  ${name.padEnd(10)} (${kind})  ${fields.size} fields, bail: ${(fields as any).__bail}`);
    }
  }
}

// Find every field where all cats share a value, all dogs share a value, all horses share a value, AND the three values differ.
const allFnums = new Set<number>();
for (const p of allPets) for (const k of p.fields.keys()) allFnums.add(k);
const sorted = [...allFnums].sort((a, b) => a - b);

console.log('\n── Per-species value table (top-level fields) ──');
console.log('fnum  cat                                     dog                                     horse');
for (const fnum of sorted) {
  const byKind: Record<string, Set<string>> = { cat: new Set(), dog: new Set(), horse: new Set() };
  for (const p of allPets) {
    const v = p.fields.get(fnum);
    if (v !== undefined) byKind[p.kind].add(v);
  }
  const cat = [...byKind.cat].join(' | ') || '—';
  const dog = [...byKind.dog].join(' | ') || '—';
  const horse = [...byKind.horse].join(' | ') || '—';
  const allEqual = cat === dog && dog === horse;
  if (allEqual) continue;
  // Mark "clean" if each species has exactly one distinct value and all 3 differ
  const clean = byKind.cat.size === 1 && byKind.dog.size === 1 && byKind.horse.size === 1
    && new Set([cat, dog, horse]).size === 3;
  const tag = clean ? ' ★' : '  ';
  console.log(`${tag} f${String(fnum).padEnd(3)}  ${cat.slice(0, 38).padEnd(38)}  ${dog.slice(0, 38).padEnd(38)}  ${horse.slice(0, 38).padEnd(38)}`);
}
