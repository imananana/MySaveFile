/**
 * Dump the first 64 bytes of f47 for each known pet, and find byte offsets
 * where the value is species-stable (same for all cats, same for all dogs,
 * same for all horses, AND the three differ).
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
    const x = b[p++]; v |= BigInt(x & 0x7f) << s; s += 7n;
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

function findF47(buf: Uint8Array, simId: bigint): Uint8Array | null {
  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
    const id = readFixed64LE(buf, i + 1);
    if (id !== simId) continue;
    let pos = i + 9;
    if (buf[pos] !== 0x11) continue; pos += 9;
    if (buf[pos] !== 0x18) continue; pos++;
    const [, a1] = readVarint(buf, pos); pos = a1;
    if (buf[pos] !== 0x21) continue; pos += 9;
    if (buf[pos] !== 0x2a) continue; pos++;
    const [fl, fs] = readVarint(buf, pos); pos = fs + Number(fl);
    if (buf[pos] !== 0x32) continue; pos++;
    const [ll, ls] = readVarint(buf, pos); pos = ls + Number(ll);
    // Walk forward looking for tag for f47 (47 << 3 = 376; wt=2 → tag = 378 = 0xfa 0x02)
    const end = Math.min(buf.length, pos + 200_000);
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
      const fnum = tag >> 3, wt = tag & 7;
      if (fnum === 0) return null;
      pos = afterTag;
      if (fnum === 47 && wt === 2) {
        const [len, n] = readVarint(buf, pos);
        return buf.slice(n, n + Number(len));
      }
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

const f47ByPet: { label: string; kind: string; data: Uint8Array }[] = [];
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
    let d: Uint8Array | null = null;
    for (const buf of buffers) { d = findF47(buf, sim.id); if (d) break; }
    if (d) f47ByPet.push({ label: name, kind, data: d });
  }
}

console.log(`Found f47 for ${f47ByPet.length} pets, lengths: ${f47ByPet.map(p => p.data.length).join(', ')}`);

console.log('\nFirst 80 bytes of f47 per pet:\n');
for (const p of f47ByPet) {
  const hex = Array.from(p.data.slice(0, 80)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  ${p.label.padEnd(10)} (${p.kind.padEnd(5)})  ${hex}`);
}

// Byte-by-byte: which offsets are species-stable?
console.log('\n── Byte offsets where value is identical within each species AND differs across species ──');
const minLen = Math.min(...f47ByPet.map(p => p.data.length));
let hits = 0;
for (let off = 0; off < Math.min(minLen, 500); off++) {
  const byKind: Record<string, Set<number>> = { cat: new Set(), dog: new Set(), horse: new Set() };
  for (const p of f47ByPet) byKind[p.kind].add(p.data[off]);
  if (byKind.cat.size !== 1 || byKind.dog.size !== 1 || byKind.horse.size !== 1) continue;
  const c = [...byKind.cat][0], d = [...byKind.dog][0], h = [...byKind.horse][0];
  if (new Set([c, d, h]).size !== 3) continue;
  console.log(`  offset=${off.toString().padStart(4)}  cat=0x${c.toString(16).padStart(2,'0')}  dog=0x${d.toString(16).padStart(2,'0')}  horse=0x${h.toString(16).padStart(2,'0')}`);
  hits++;
}
console.log(`\n${hits} species-stable byte offsets in the first 500 bytes`);
