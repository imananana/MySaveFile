/**
 * Lot scanner + venue-tuning ID detection.
 *
 * Two distinct things live here:
 *
 * 1. `scanLots` walks the master 0x0d buffer for 0x3a-prefixed lot descriptors
 *    and extracts each lot's id, name, and stable field5 ID (the EA canonical
 *    cross-save identifier).
 *
 * 2. `parseLotChunk` + `detectLotTypeFromLDNB` work on individual lot chunk
 *    DBPF resources (a different DBPF resource type than 0x0d). They extract
 *    the lot's full ID and the embedded LDNB section, then scan the LDNB
 *    backwards for a 32-byte aligned `06 00 00 00 [fixed64]` marker that
 *    contains the venue tuning ID — which maps to a planner lot-type string
 *    via VENUE_TUNING_MAP.
 *
 * Tuning ID origins: empirically observed during reverse-engineering, mapped
 * to lot type names from EA's gameplay tunings (which are factual game data,
 * not copyrighted assets).
 */
import { readVarint, readFixed64LE, readString } from './protobuf';
import type { ParsedLot } from './types';

export function scanLots(buf: Uint8Array): Map<bigint, ParsedLot> {
  const lots = new Map<bigint, ParsedLot>();

  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x3a) continue;

    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
    const msgEnd = msgStart + Number(msgLen);
    pos = msgStart;

    if (buf[pos] !== 0x09) continue;
    pos++;
    if (pos + 8 > msgEnd) continue;
    const lotId = readFixed64LE(buf, pos);
    pos += 8;

    if (pos >= msgEnd || buf[pos] !== 0x12) continue;
    pos++;
    const [lotName, afterName] = readString(buf, pos);
    pos = afterName;

    if (!lotName || lotName.length < 3) continue;
    if (/^[a-z][a-z0-9_:]+$/.test(lotName)) continue;

    let field5: bigint | null = null;
    let p = pos;
    while (p < msgEnd) {
      const tag = buf[p];
      const wireType = tag & 0x07;
      const fieldNum = tag >> 3;
      p++;
      if (fieldNum === 0) break;
      if (tag === 0x28) {
        const [val, next] = readVarint(buf, p);
        field5 = val;
        p = next;
        break;
      }
      if (wireType === 0) { const [, next] = readVarint(buf, p); p = next; }
      else if (wireType === 1) p += 8;
      else if (wireType === 2) { const [len, next] = readVarint(buf, p); p = next + Number(len); }
      else if (wireType === 5) p += 4;
      else break;
    }

    if (!lots.has(lotId)) {
      lots.set(lotId, { id: lotId, name: lotName, field5, detectedType: null });
    }

    i = msgEnd - 1;
  }

  return lots;
}

// ─── Lot type detection (LDNB venue tuning ID scan) ───────────────────────────

export const VENUE_TUNING_MAP: Record<string, string> = {
  '0x6fc6':           'Residential',
  '0x53533':          'Residential Rental',
  '0x1dd87':          'Cafe',
  '0x41e5':           'Bar',
  '0x41e6':           'Nightclub',
  '0x41e9':           'Gym',
  '0x41ea':           'Library',
  '0x41eb':           'Lounge',
  '0x41ec':           'Museum',
  '0x64f7':           'Park',
  '0x32d36':          'University Housing',
  '0x21a74':          'Karaoke Bar',
  '0x26c7f':          'Vet Clinic',
  '0x2334e':          'Arts Center',          // City Living
  '0x4cb15':          'Recreation Center',
  '0x42a78':          'Wedding Venue',
  '0x72790':          'Playground',
  '0x36ac8':          'Community Space',      // Eco Lifestyle parent — the user can flip it via NAP to one of the sub-modes below
  '0x38829':          'Maker Space',          // Eco Lifestyle Community Space sub-mode (was previously mislabeled as Arts Center)
  '0x36ac9':          'Marketplace',          // Eco Lifestyle Community Space sub-mode
  '0x36aca':          'Community Garden',     // Eco Lifestyle Community Space sub-mode
  '0x6f417':          'Custom Venue',
  '0x6069f':          'Small Business Venue',
  '0x19ac5':          'Retail',
  '0x194fb':          'Rental',
  '0x2a709':          'Rental',
  '0x3a762':          'Rental',
  '0x17f54':          'Secret Lot',
  '0x1acce':          'Police Station',
  '0x1a3df':          'FutureSim Labs',
  '0x1a3bd':          'National Park',
  '0x1e0fc':          'Ancient Ruins',
  '0x1e88f':          'Island Bluff',
  '0x21c8c':          'Center Park',
  '0x2e66a':          'Acting Studio',
  '0x31513':          'Secret Lab',
  '0x32146':          'Beach',
  '0x33fa0':          'The Magic Realm',
  '0x3c6b1':          'Onsen Bathhouse',
  '0x43f21':          'High School',
  '0x449ed':          'Auditorium',
  '0x441d5':          'Thrift and Bubble Tea Store',
  '0x73e13':          'Market',
  '0x7335a':          'Backroom',
  '0x1e927':          'Chalet Gardens',
  '0x1fe99':          'Restaurant',
  '0x1cd77':          'Spa',
  '0x1dec':           'Hospital',
  '0x37f83':          'Tiny Home Residential',
  '0x356ea':          'Foxbury Commons',
  '0x356e9':          'UBrite Commons',
  '0x5c2d3':          'Cemetery',
  '0x1e392':          'Pool',
};

// Tuning IDs for hidden/uneditable in-game lots that should never surface in the
// planner UI — Sixam (alien homeworld), Batuu's Resistance Encampment, Selvadorada's
// Omiscan Temple, etc. These aren't in worlds.ts/lotField5Map so they wouldn't
// appear anyway, but we tag them explicitly so future diag runs don't flag them
// as unknown.
export const HIDDEN_VENUE_TUNINGS = new Set<string>([
  '0x1b3fb',  // Sixam (Get to Work secret world)
  '0x2a5b4',  // Omiscan Temple (Jungle Adventure)
  '0x38a1d',  // Resistance Encampment (Journey to Batuu)
  '0x1aff0',  // Doctor Clinic (Get to Work career venue)
  '0x3c54e',  // Mountain Excursion (Snowy Escape)
  '0x5d75a',  // Grim Lot (Life & Death reaper venue)
]);

export function detectLotTypeFromLDNB(ldnb: Uint8Array): bigint | null {
  // Real venue tuning IDs are 32-bit values stored as fixed64 with high 4 bytes zero
  // and value >= 0x1000. The closest-to-end marker is sometimes a coincidental match
  // (e.g. an instance ID followed by an EA class type prefix 0xa0451cbd…) — skip those
  // and keep scanning backward until we hit a value in the expected range.
  outer: for (let i = ldnb.length - 12; i >= 31; i--) {
    if (ldnb[i] !== 0x06) continue;
    if (ldnb[i + 1] !== 0x00 || ldnb[i + 2] !== 0x00 || ldnb[i + 3] !== 0x00) continue;
    for (let j = i - 28; j < i; j++) {
      if (ldnb[j] !== 0x00) continue outer;
    }
    if (i + 12 > ldnb.length) continue;
    const val = readFixed64LE(ldnb, i + 4);
    if ((val >> 32n) !== 0n) continue;     // high 32 bits must be zero
    if (val < 0x1000n) continue;            // too small to be a real tuning ID
    return val;
  }
  return null;
}

export function parseLotChunk(raw: Uint8Array): { lotId: bigint; ldnb: Uint8Array } | null {
  // Outer protobuf: field 1 (0x09 fixed64) = full lot ID, field 2 (0x12) = LDNB bytes
  let p = 0;
  let lotId: bigint | null = null;
  let ldnb: Uint8Array | null = null;

  while (p < raw.length) {
    const tag = raw[p++];
    if (tag === 0) return null;
    const wireType = tag & 0x07;
    if (wireType === 0) {
      const [, next] = readVarint(raw, p);
      p = next;
    } else if (wireType === 1) {
      if (tag === 0x09) lotId = readFixed64LE(raw, p);
      p += 8;
    } else if (wireType === 2) {
      const [len, next] = readVarint(raw, p);
      const end = next + Number(len);
      if (end > raw.length) return null;
      if (tag === 0x12 && !ldnb) ldnb = raw.slice(next, end);
      p = end;
    } else if (wireType === 5) {
      p += 4;
    } else {
      return null;
    }
    if (lotId !== null && ldnb) break;
  }

  if (lotId === null || !ldnb) return null;
  return { lotId, ldnb };
}
