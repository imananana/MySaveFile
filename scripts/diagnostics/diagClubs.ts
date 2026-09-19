/**
 * Walk 0x0d's protobuf structure to find PersistableClubService and dump every
 * Club record. Path: SaveGameData → field 2 (SaveSlotData) → field 7
 * (club_service: PersistableClubService) → field 3 (clubs: repeated Club).
 *
 * For each Club, prints what we can read: club_id, name (if stored — stock
 * clubs don't store name), icon ResourceKey instance (if stored), leader,
 * member sim IDs, hangout_zone_id.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE
  || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_0000000c.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r0d = resources.find((r) => r.type === 0x0d)!;
const raw = r0d.compType === 0xffff ? decompressRefpack(r0d.data) : r0d.data;
console.log(`0x0d decompressed: ${raw.length} bytes\n`);

// ─── Minimal protobuf walker ─────────────────────────────────────────────────
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
function readU64LE(b: Uint8Array, p: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[p + i]) << BigInt(i * 8);
  return v;
}
function readU32LE(b: Uint8Array, p: number): number {
  return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
}

// Scan buf for the FIRST length-delimited field with given field number.
// Returns [start, end] of the inner payload, or null.
function findFieldLD(b: Uint8Array, start: number, end: number, fieldNum: number): { inner: Uint8Array; afterEnd: number } | null {
  const targetTag = (fieldNum << 3) | 2;
  let p = start;
  while (p < end) {
    const tagByte = b[p++];
    if (tagByte === 0) return null;
    const wire = tagByte & 7;
    if (tagByte === targetTag) {
      const [len, after] = readVarint(b, p);
      const ln = Number(len);
      if (after + ln > end) return null;
      return { inner: b.slice(after, after + ln), afterEnd: after + ln };
    }
    // skip
    if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}

// Yield every occurrence of a length-delimited field with given field number.
function* iterFieldLD(b: Uint8Array, fieldNum: number): Generator<Uint8Array> {
  const targetTag = (fieldNum << 3) | 2;
  let p = 0;
  while (p < b.length) {
    const tagByte = b[p++];
    if (tagByte === 0) return;
    const wire = tagByte & 7;
    if (tagByte === targetTag) {
      const [len, after] = readVarint(b, p);
      const ln = Number(len);
      if (after + ln > b.length) return;
      yield b.slice(after, after + ln);
      p = after + ln;
    } else if (wire === 0) { const [, n] = readVarint(b, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(b, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return;
  }
}

// ─── Walk: SaveGameData → SaveSlotData → club_service → clubs ──────────────
const saveSlot = findFieldLD(raw, 0, raw.length, 2);
if (!saveSlot) { console.error('No SaveSlotData (field 2) in 0x0d'); process.exit(1); }
console.log(`SaveSlotData (metadata wrapper): ${saveSlot.inner.length} bytes`);

// SaveSlotData.field 8 = GameplaySaveSlotData (the actual services blob)
const gameSlot = findFieldLD(saveSlot.inner, 0, saveSlot.inner.length, 8);
if (!gameSlot) { console.error('No GameplaySaveSlotData (field 8) in SaveSlotData'); process.exit(1); }
console.log(`GameplaySaveSlotData: ${gameSlot.inner.length} bytes`);

const clubService = findFieldLD(gameSlot.inner, 0, gameSlot.inner.length, 7);
if (!clubService) { console.error('No club_service (field 7) in GameplaySaveSlotData'); process.exit(1); }
console.log(`club_service (PersistableClubService): ${clubService.inner.length} bytes\n`);

// PersistableClubService:
//   1: has_seeded_clubs (bool)
//   2: club_count (uint32)
//   3: clubs (repeated Club)
let clubIdx = 0;
for (const clubBytes of iterFieldLD(clubService.inner, 3)) {
  clubIdx++;
  console.log(`\n═══ Club #${clubIdx} (${clubBytes.length} bytes) ═══`);

  // Walk all fields and print
  let p = 0;
  let clubId = 0n;
  let name: string | null = null;
  let leader = 0n;
  let memberCount = 0;
  let iconInstanceHex: string | null = null;
  let hangoutZoneId: bigint | null = null;
  let clubSeedInstance: string | null = null;
  let venueTypeInstance: string | null = null;

  while (p < clubBytes.length) {
    const tagByte = clubBytes[p++];
    if (tagByte === 0) break;
    const fieldNum = tagByte >> 3;
    const wire = tagByte & 7;

    if (wire === 0) {
      const [v, n] = readVarint(clubBytes, p); p = n;
      if (fieldNum === 1) clubId = v;
      else if (fieldNum === 6) leader = v;
      else if (fieldNum === 23) hangoutZoneId = v;
      else console.log(`  field ${fieldNum} (varint) = ${v}`);
    } else if (wire === 1) {
      p += 8;
    } else if (wire === 2) {
      const [l, after] = readVarint(clubBytes, p);
      const ln = Number(l);
      const sub = clubBytes.slice(after, after + ln);
      p = after + ln;
      if (fieldNum === 2) {
        name = Buffer.from(sub).toString('utf-8');
      } else if (fieldNum === 3) {
        // icon ResourceKey
        // ResourceKey schema (guess): 1: type uint32, 2: group uint32, 3: instance uint64
        // Walk it
        let q = 0;
        while (q < sub.length) {
          const t = sub[q++];
          if (t === 0) break;
          const fn = t >> 3, wt = t & 7;
          if (wt === 0) { const [v, n] = readVarint(sub, q); q = n;
            if (fn === 3) iconInstanceHex = v.toString(16);
          }
          else if (wt === 1) {
            if (fn === 3) iconInstanceHex = readU64LE(sub, q).toString(16);
            q += 8;
          }
          else if (wt === 2) { const [ll, nn] = readVarint(sub, q); q = nn + Number(ll); }
          else if (wt === 5) q += 4;
          else break;
        }
      } else if (fieldNum === 7) {
        // members: repeated uint64 packed
        let q = 0;
        while (q < sub.length) {
          const [, n] = readVarint(sub, q); memberCount++;
          q = n;
        }
      } else if (fieldNum === 8) {
        // venue_type ResourceKey
        let q = 0;
        while (q < sub.length) {
          const t = sub[q++];
          if (t === 0) break;
          const fn = t >> 3, wt = t & 7;
          if (wt === 0) { const [v, n] = readVarint(sub, q); q = n;
            if (fn === 3) venueTypeInstance = v.toString(16);
          } else if (wt === 1) {
            if (fn === 3) venueTypeInstance = readU64LE(sub, q).toString(16);
            q += 8;
          } else if (wt === 2) { const [ll, nn] = readVarint(sub, q); q = nn + Number(ll); }
          else if (wt === 5) q += 4;
          else break;
        }
      } else if (fieldNum === 12) {
        // club_seed ResourceKey
        let q = 0;
        while (q < sub.length) {
          const t = sub[q++];
          if (t === 0) break;
          const fn = t >> 3, wt = t & 7;
          if (wt === 0) { const [v, n] = readVarint(sub, q); q = n;
            if (fn === 3) clubSeedInstance = v.toString(16);
          } else if (wt === 1) {
            if (fn === 3) clubSeedInstance = readU64LE(sub, q).toString(16);
            q += 8;
          } else if (wt === 2) { const [ll, nn] = readVarint(sub, q); q = nn + Number(ll); }
          else if (wt === 5) q += 4;
          else break;
        }
      } else {
        console.log(`  field ${fieldNum} (ldelim, ${ln} bytes)`);
      }
    } else if (wire === 5) {
      p += 4;
    } else {
      break;
    }
  }

  console.log(`  club_id:           ${clubId}`);
  console.log(`  name:              ${name ?? '(not stored — stock club)'}`);
  console.log(`  icon instance:     ${iconInstanceHex ?? '(none)'}`);
  console.log(`  leader sim_id:     ${leader || '(none)'}`);
  console.log(`  member count:      ${memberCount}`);
  console.log(`  hangout_zone_id:   ${hangoutZoneId ?? '(none)'}`);
  console.log(`  club_seed:         ${clubSeedInstance ?? '(none)'}`);
  console.log(`  venue_type:        ${venueTypeInstance ?? '(none)'}`);
}

console.log(`\nTotal clubs: ${clubIdx}`);
