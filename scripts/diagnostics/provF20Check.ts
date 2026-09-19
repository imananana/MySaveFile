// Does f20 (household creator ACCOUNT) cover more than f21 (creator NAME)?
// Cross-tab every household: f21 state (named/empty/absent) × f20 state (zero/nonzero),
// and list the distinct nonzero f20 account values + their counts. Also show the
// dominant sim f23 last-saver (the save owner) for comparison.
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

// household anchors
const anchors: { i: number; name: string; body: number }[] = [];
const seenH = new Set<bigint>();
for (let i = 0; i < buf.length - 40; i++) {
  if (buf[i] !== 0x09 || buf[i + 9] !== 0x11) continue;
  const id = readFixed64LE(buf, i + 10); let p = i + 18;
  if (buf[p] !== 0x1a) continue; p++; let name, after; try { [name, after] = readString(buf, p); } catch { continue; }
  if (!name || name.length < 2 || name.length > 60 || !/^[\x20-\x7e]+$/.test(name) || name.includes('_')) continue;
  p = after; if (buf[p] !== 0x21) continue; p += 9;
  if (seenH.has(id)) continue; seenH.add(id);
  anchors.push({ i, name, body: p });
}

let f21named = 0, f21empty = 0, f21absent = 0, f20zero = 0, f20nonzero = 0;
let bothStamped = 0, f20only = 0, f21only = 0, neither = 0;
const f20vals = new Map<string, number>();
for (let ai = 0; ai < anchors.length; ai++) {
  const a = anchors[ai]; const end = ai + 1 < anchors.length ? anchors[ai + 1].i : Math.min(buf.length, a.body + 2_000_000);
  let p = a.body; let f20: bigint | null = null; let f21: 'named' | 'empty' | 'absent' = 'absent';
  while (p < end) {
    if (buf[p] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, p); } catch { break; } p = nn;
    const fn = Number(t >> 3n), wt = Number(t & 7n);
    if (wt === 0) { const [v, x] = readVarint(buf, p); if (fn === 20) f20 = v; p = x; }
    else if (wt === 1) { if (fn === 20) f20 = readFixed64LE(buf, p); p += 8; }
    else if (wt === 2) { const [l, x] = readVarint(buf, p); const len = Number(l); const ve = x + len; if (len < 0 || ve > end) break; if (fn === 21) f21 = len ? 'named' : 'empty'; p = ve; }
    else if (wt === 5) p += 4; else break;
  }
  if (f21 === 'named') f21named++; else if (f21 === 'empty') f21empty++; else f21absent++;
  const f20pop = f20 != null && f20 !== 0n;
  if (f20pop) { f20nonzero++; f20vals.set('0x' + f20!.toString(16), (f20vals.get('0x' + f20!.toString(16)) ?? 0) + 1); } else f20zero++;
  const named = f21 === 'named';
  if (named && f20pop) bothStamped++; else if (f20pop) f20only++; else if (named) f21only++; else neither++;
}

// dominant sim f23 (owner)
const saverTally = new Map<string, number>();
const seenS = new Set<bigint>();
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  const id = readFixed64LE(buf, i + 1); let p = i + 9;
  if (buf[p] !== 0x11) continue; p += 9; if (buf[p] !== 0x18) continue; p++; let n; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p += 9; if (buf[p] !== 0x2a) continue; p++; let first; try { [first, p] = readString(buf, p); } catch { continue; }
  if (buf[p] === 0x32) { p++; try { [, p] = readString(buf, p); } catch { /* */ } }
  if (buf[p] !== 0x38) continue; if (id === 0n || seenS.has(id)) continue; seenS.add(id);
  let q = p, saver = 0n; const end = Math.min(buf.length, p + 30000);
  while (q < end) { if (buf[q] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, q); } catch { break; } q = nn; const fn = Number(t >> 3n), wt = Number(t & 7n); if (wt === 0) { const [v, x] = readVarint(buf, q); q = x; if (fn === 23 && saver === 0n) saver = v; } else if (wt === 1) { if (fn === 23 && saver === 0n) saver = readFixed64LE(buf, q); q += 8; } else if (wt === 2) { const [l, x] = readVarint(buf, q); q = x + Number(l); } else if (wt === 5) q += 4; else break; }
  if (saver !== 0n) saverTally.set('0x' + saver.toString(16), (saverTally.get('0x' + saver.toString(16)) ?? 0) + 1);
}

console.log(`${save}: ${anchors.length} households\n`);
console.log(`f21 (creator NAME):  named=${f21named}  empty=${f21empty}  absent=${f21absent}`);
console.log(`f20 (creator ACCT):  nonzero=${f20nonzero}  zero/absent=${f20zero}`);
console.log(`\ncross-tab:`);
console.log(`  both f20+f21 stamped : ${bothStamped}`);
console.log(`  f20 only (acct, no name): ${f20only}   <-- if >0, f20 covers MORE than f21`);
console.log(`  f21 only (name, no acct): ${f21only}`);
console.log(`  neither (true Native)    : ${neither}`);
console.log(`\ndistinct nonzero f20 account values:`);
for (const [v, c] of [...f20vals].sort((a, b) => b[1] - a[1])) console.log(`   ${v}: ${c} households`);
console.log(`\ndominant sim f23 (save owner / last-saver):`);
for (const [v, c] of [...saverTally].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`   ${v}: ${c} sims`);
