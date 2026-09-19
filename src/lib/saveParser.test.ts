/**
 * Tests for the publicly-exported pieces of saveParser.ts.
 *
 * The save parser is the highest-risk surface in the app — silent regressions
 * here mean imported saves get corrupted data without the user noticing.
 * These tests cover the small, pure functions that everything else hangs on:
 * the lot-chunk protobuf walker and the LDNB venue-tuning ID detector.
 *
 * Internal helpers (readVarint, parseClub, etc.) are tested transitively by
 * parseLotChunk — the chunk walker uses every protobuf primitive in the file.
 *
 * We don't use real .save fixtures here on purpose: real saves are private and
 * shouldn't be committed. Buffers below are hand-constructed bytes that mirror
 * the exact layouts observed during reverse-engineering.
 */
import { describe, it, expect } from 'vitest';
import { parseLotChunk, detectLotTypeFromLDNB } from './saveParser';

// ─── byte-buffer helpers ──────────────────────────────────────────────────────

/** Builds a Uint8Array from a list of either bytes (0–255) or sub-arrays. */
function bytes(...parts: Array<number | Uint8Array | number[]>): Uint8Array {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') flat.push(p);
    else if (Array.isArray(p)) flat.push(...p);
    else flat.push(...Array.from(p));
  }
  return new Uint8Array(flat);
}

/** Little-endian fixed64 (8 bytes) for a bigint. */
function fixed64LE(value: bigint): number[] {
  const out: number[] = new Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  return out;
}

// ─── parseLotChunk ────────────────────────────────────────────────────────────

describe('parseLotChunk', () => {
  it('extracts lotId (field 1, fixed64) and ldnb (field 2, length-delimited)', () => {
    const lotId = 0x0235169012345678n;
    const ldnbBody = [0xde, 0xad, 0xbe, 0xef];
    const buf = bytes(
      0x09,                       // tag: field 1, wire 1 (fixed64)
      fixed64LE(lotId),
      0x12,                       // tag: field 2, wire 2 (length-delimited)
      ldnbBody.length,            // length varint (small enough for 1 byte)
      ldnbBody,
    );

    const result = parseLotChunk(buf);
    expect(result).not.toBeNull();
    expect(result!.lotId).toBe(lotId);
    expect(Array.from(result!.ldnb)).toEqual(ldnbBody);
  });

  it('returns null when field 1 (lotId) is missing', () => {
    const buf = bytes(0x12, 4, [0x00, 0x01, 0x02, 0x03]);
    expect(parseLotChunk(buf)).toBeNull();
  });

  it('returns null when field 2 (ldnb) is missing', () => {
    const buf = bytes(0x09, fixed64LE(123n));
    expect(parseLotChunk(buf)).toBeNull();
  });

  it('returns null when a length-delimited field spills past the buffer', () => {
    // Tag for field 2, length claims 100 bytes, but buffer has only 4 bytes after the length.
    const buf = bytes(0x12, 100, [0x00, 0x01, 0x02, 0x03]);
    expect(parseLotChunk(buf)).toBeNull();
  });

  it('skips an irrelevant varint field (wire type 0) before reaching the real ones', () => {
    // Field 3 wire 0 (varint) "0x18 [varint]" — should be skipped, then real fields parse.
    const lotId = 42n;
    const ldnbBody = [0xff];
    const buf = bytes(
      0x18, 0x05,                 // field 3 varint = 5 (irrelevant)
      0x09, fixed64LE(lotId),
      0x12, ldnbBody.length, ldnbBody,
    );
    const result = parseLotChunk(buf);
    expect(result?.lotId).toBe(lotId);
    expect(Array.from(result!.ldnb)).toEqual(ldnbBody);
  });

  it('returns early when both fields are found (does not read trailing junk)', () => {
    const lotId = 7n;
    const ldnbBody = [0xaa, 0xbb];
    const trailingJunk = [0xff, 0xff, 0xff]; // would be invalid protobuf
    const buf = bytes(
      0x09, fixed64LE(lotId),
      0x12, ldnbBody.length, ldnbBody,
      trailingJunk,
    );
    expect(parseLotChunk(buf)).not.toBeNull();
  });
});

// ─── detectLotTypeFromLDNB ────────────────────────────────────────────────────

describe('detectLotTypeFromLDNB', () => {
  it('finds the venue tuning ID at the LDNB end marker (28 zeros + 06 00 00 00 + fixed64)', () => {
    // 0x6fc6 = Residential
    const tuningId = 0x6fc6n;
    const ldnb = bytes(
      new Uint8Array(40),         // padding so the marker isn't at the very start
      new Uint8Array(28),         // 28 zero bytes (the LDNB padding before the marker)
      0x06, 0x00, 0x00, 0x00,    // marker
      fixed64LE(tuningId),        // venue tuning ID
      new Uint8Array(12),         // trailing bytes (i must be >= length - 12)
    );
    expect(detectLotTypeFromLDNB(ldnb)).toBe(tuningId);
  });

  it('rejects high-bit values (high 32 bits non-zero are not tuning IDs)', () => {
    // A value with high 4 bytes non-zero — should be skipped.
    const ldnb = bytes(
      new Uint8Array(40),
      new Uint8Array(28),
      0x06, 0x00, 0x00, 0x00,
      fixed64LE(0x0000000100006fc6n), // high 4 bytes non-zero — invalid
      new Uint8Array(12),
    );
    expect(detectLotTypeFromLDNB(ldnb)).toBeNull();
  });

  it('rejects small values (< 0x1000 are not tuning IDs)', () => {
    const ldnb = bytes(
      new Uint8Array(40),
      new Uint8Array(28),
      0x06, 0x00, 0x00, 0x00,
      fixed64LE(0xfffn),          // too small
      new Uint8Array(12),
    );
    expect(detectLotTypeFromLDNB(ldnb)).toBeNull();
  });

  it('returns null when no marker pattern is present', () => {
    const ldnb = new Uint8Array(100); // all zeros — no 0x06 marker
    expect(detectLotTypeFromLDNB(ldnb)).toBeNull();
  });

  it('rejects a 0x06 byte that lacks the preceding 28 zero bytes', () => {
    const ldnb = bytes(
      new Uint8Array(10),
      0xff, 0xff,                  // garbage where the 28 zeros should be
      new Uint8Array(26),
      0x06, 0x00, 0x00, 0x00,
      fixed64LE(0x6fc6n),
      new Uint8Array(12),
    );
    expect(detectLotTypeFromLDNB(ldnb)).toBeNull();
  });
});
