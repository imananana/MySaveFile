// Does editing a premade in play DROP its creator stamp (f21 present-empty → absent)?
// For a list of household names, report the precise f21 state in each save:
//   named:<x>  = f21 present with a creator name
//   empty      = f21 present but zero-length  (pristine, untouched premade)
//   ABSENT     = f21 tag not in the household body at all  (hypothesis: touched in play)
// Also reports f20 (creator account) presence the same way.
//
// Usage: npx tsx scripts/diagnostics/provStampState.ts <Slot.save> "Name1,Name2,..."
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const SAVES = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const save = process.argv[2] ?? 'Slot_10312029.save';
const NAMES = (process.argv[3] ?? 'Pancakes,Landgraab,BFF,Spencer-Kim-Lewis,Roomies,Karaoke Legends,Feng').split(',').map(s => s.trim());

const b = readFileSync(`${SAVES}/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let buf: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!buf || d.length > buf.length) buf = d; }
const B = buf!;

// collect household anchors (so each body window is bounded by the next anchor)
const anchors: { i: number; name: string; body: number }[] = [];
const seen = new Set<bigint>();
for (let i = 0; i < B.length - 40; i++) {
  if (B[i] !== 0x09 || B[i + 9] !== 0x11) continue;
  const id = readFixed64LE(B, i + 10); let p = i + 18;
  if (B[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(B, p); } catch { continue; }
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  p = after; if (B[p] !== 0x21) continue; p += 9;
  if (seen.has(id)) continue; seen.add(id);
  anchors.push({ i, name, body: p });
}

function stampState(body: number, end: number) {
  let p = body, f20: string = 'absent', f21: string = 'ABSENT', f9: string = 'ABSENT';
  while (p < end) {
    if (B[p] === 0) break; let t, nn; try { [t, nn] = readVarint(B, p); } catch { break; } p = nn;
    const fn = Number(t >> 3n), wt = Number(t & 7n);
    if (wt === 0) { const [v, x] = readVarint(B, p); if (fn === 20) f20 = `v0:${v}`; p = x; }
    else if (wt === 1) { if (fn === 20) f20 = `f64:0x${readFixed64LE(B, p).toString(16)}`; if (fn === 9) f9 = `0x${readFixed64LE(B, p).toString(16)}`; p += 8; }
    else if (wt === 2) {
      const [l, x] = readVarint(B, p); const len = Number(l); const ve = x + len; if (len < 0 || ve > end) break;
      if (fn === 20) f20 = len ? `bytes:${len}` : 'empty';
      if (fn === 21) f21 = len ? `named:"${new TextDecoder().decode(B.slice(x, ve))}"` : 'empty';
      p = ve;
    } else if (wt === 5) p += 4; else break;
  }
  return { f20, f21, f9 };
}

console.log(`\n═══ ${save}  (${anchors.length} households) ═══`);
for (const target of NAMES) {
  const matches = anchors.filter(a => a.name.toLowerCase() === target.toLowerCase());
  if (!matches.length) { console.log(`  "${target}"  → not found`); continue; }
  for (const a of matches) {
    const ai = anchors.indexOf(a);
    const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(B.length, a.body + 2_000_000);
    const { f20, f21, f9 } = stampState(a.body, end);
    console.log(`  "${a.name}"  → f9=${f9 === 'ABSENT' ? 'ABSENT          ' : 'present'}   f21=${f21}`);
  }
}
