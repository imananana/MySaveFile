// Full f9 (player-engaged) x f21 (gallery-stamped) cross-tab for a save.
// Key question: do households WITHOUT f9 carry f21 (i.e. downloaded-but-unplayed)?
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const save = process.argv[2] ?? 'Slot_00001705.save';
const b = readFileSync(`${SAVES}/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
let B: Uint8Array | null = null;
for (const r of parseDbpf(ab).filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!B || d.length > B.length) B = d; }
const buf = B!;

const anchors: { i: number; name: string; body: number }[] = []; const seenH = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue; const id = readFixed64LE(buf, i + 10); let p = i + 18;
  if (buf[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(buf, p); } catch { continue; }
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  p = after; if (buf[p] !== 0x21) continue; p += 9; if (seenH.has(id)) continue; seenH.add(id); anchors.push({ i, name, body: p });
}

const cell = { f9_f21: 0, f9_only: 0, f21_only: 0, neither: 0 };
const f21onlyNames: string[] = []; const neitherNames: string[] = [];
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai]; const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(buf.length, a.body + 2_000_000);
  let p = a.body; let f9 = false, f21 = false;
  while (p < end) { if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn; const fn = Number(t >> 3n), wt = Number(t & 7n);
    if (wt === 0) { const [, x] = readVarint(buf, p); p = x; }
    else if (wt === 1) { if (fn === 9) f9 = true; p += 8; }
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); const ve = x + len; if (len < 0 || ve > end) break; if (fn === 21 && len > 0) f21 = true; p = ve; }
    else if (wt === 5) p += 4; else break; }
  if (f9 && f21) cell.f9_f21++; else if (f9) cell.f9_only++; else if (f21) { cell.f21_only++; f21onlyNames.push(a.name); } else { cell.neither++; if (neitherNames.length < 40) neitherNames.push(a.name); }
}

const total = anchors.length;
console.log(`${save}: ${total} households\n`);
console.log(`            f21 named   f21 empty/absent`);
console.log(`f9 present    ${String(cell.f9_f21).padStart(4)}        ${String(cell.f9_only).padStart(4)}`);
console.log(`f9 absent     ${String(cell.f21_only).padStart(4)}        ${String(cell.neither).padStart(4)}`);
console.log(`\nf9-absent BUT f21-named (downloaded, unplayed?) = ${cell.f21_only}: ${f21onlyNames.join(', ') || '—'}`);
console.log(`\nf9-absent AND f21-absent (true unattributed) = ${cell.neither}:`);
console.log('  ' + neitherNames.join(', '));
console.log(`\nCURATION COVERAGE (f9 OR f21) = ${total - cell.neither}/${total} (${((total - cell.neither) / total * 100).toFixed(0)}%);  unattributed = ${cell.neither} (${(cell.neither / total * 100).toFixed(0)}%)`);
