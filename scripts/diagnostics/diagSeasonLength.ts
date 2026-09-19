/**
 * Hunt for the player's current season-length setting. The save has 3 holiday
 * Calendars (one per season-length variant); we want to know which one is
 * actually "active" so the import picks the correct holiday placements.
 *
 * Strategy: dump every top-level field of GameplaySaveSlotData with its value,
 * then dump every top-level field of SaveGameData → AccountData (if reachable).
 * Run this on the same save against varying in-game settings to identify the
 * field whose value tracks the user's setting.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312032.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;

function readVarint(b: Uint8Array, p: number): [bigint, number] {
  let v = 0n, shift = 0n, i = p;
  while (i < b.length) {
    const byte = BigInt(b[i++]);
    v |= (byte & 0x7fn) << shift;
    if ((byte & 0x80n) === 0n) return [v, i];
    shift += 7n;
    if (shift > 63n) throw new Error('varint too long');
  }
  throw new Error('varint truncated');
}
function readTag(b: Uint8Array, p: number): [number, number, number] {
  const [tv, after] = readVarint(b, p);
  return [Number(tv >> 3n), Number(tv & 7n), after];
}
function findLD(b: Uint8Array, fieldNum: number) {
  let p = 0;
  while (p < b.length) {
    if (p >= b.length) return null;
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(b, p);
      return b.slice(afterLen, afterLen + Number(len));
    }
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}

function dumpTopLevel(label: string, b: Uint8Array, maxValuePreview = 24) {
  console.log(`\n═══ ${label} (${b.length} bytes) ═══`);
  let p = 0;
  while (p < b.length) {
    const [fn, wire, afterTag] = readTag(b, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(b, p);
      console.log(`  f${fn} varint = ${v}`);
      p = n;
    } else if (wire === 1) {
      const hex = Array.from(b.slice(p, p + 8)).map((x) => x.toString(16).padStart(2, '0')).join(' ');
      console.log(`  f${fn} fixed64 [${hex}]`);
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(b, p);
      const ln = Number(l);
      const printable = ln > 0 && ln < 40 && Array.from(b.slice(n, n + ln)).every((x) => x >= 0x20 && x < 0x7f);
      if (printable) {
        console.log(`  f${fn} string = "${Buffer.from(b.slice(n, n + ln)).toString('utf-8')}"`);
      } else {
        const hex = Array.from(b.slice(n, n + Math.min(ln, maxValuePreview))).map((x) => x.toString(16).padStart(2, '0')).join(' ');
        console.log(`  f${fn} ldelim ${ln} bytes [${hex}${ln > maxValuePreview ? '…' : ''}]`);
      }
      p = n + ln;
    } else if (wire === 5) {
      p += 4;
    } else {
      break;
    }
  }
}

const slot = findLD(raw, 2);
dumpTopLevel('SaveSlotData', slot!);

const gameSlot = findLD(slot!, 8);
dumpTopLevel('GameplaySaveSlotData (slot.f8)', gameSlot!);

const account = findLD(raw, 3);
if (account) {
  dumpTopLevel('SaveGameData.field 3 (AccountData)', account);
  // Try walking inside AccountData for nested gameplay_options
  // GameplayAccountData has GameplayOptions at field 2 per the schema.
  const gao = findLD(account, 1);  // first try field 1 — could be GameplayAccountData wrapper
  if (gao) dumpTopLevel('AccountData.f1', gao);
  const gao2 = findLD(account, 2);
  if (gao2) dumpTopLevel('AccountData.f2 (candidate GameplayOptions)', gao2);
} else {
  console.log('\n(No SaveGameData.field 3 — AccountData not in this resource)');
}
