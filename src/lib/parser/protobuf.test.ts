/**
 * Regression tests for the protobuf wire-format primitives (H1).
 *
 * Every entity reader in src/lib/parser/* walks the save buffer with these six
 * functions, so a silent bug here corrupts ALL imported data. We build buffers
 * with the small encoders below (the mirror image of the readers) and assert
 * the readers recover exactly what we put in — including multi-byte varints
 * (field numbers >= 16) and multi-byte UTF-8 (accented names from non-EN saves).
 */
import { describe, it, expect } from 'vitest';
import {
  readFixed64LE,
  readVarint,
  readString,
  readTag,
  findLDField,
  iterLDFields,
} from './protobuf';

// ─── encoders (inverse of the readers under test) ─────────────────────────────

function encodeVarint(value: number | bigint): number[] {
  let n = BigInt(value);
  const out: number[] = [];
  do {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) b |= 0x80;
    out.push(b);
  } while (n > 0n);
  return out;
}

function fixed64LE(value: bigint): number[] {
  const out: number[] = new Array(8);
  for (let i = 0; i < 8; i++) out[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  return out;
}

function tag(field: number, wire: number): number[] {
  return encodeVarint((field << 3) | wire);
}

function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

/** Length-delimited (wire 2) field: tag + length varint + body. */
function ldField(field: number, body: number[]): number[] {
  return [...tag(field, 2), ...encodeVarint(body.length), ...body];
}

function buf(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

// ─── readVarint ───────────────────────────────────────────────────────────────

describe('readVarint', () => {
  it('reads a single-byte varint', () => {
    expect(readVarint(new Uint8Array([0x05]), 0)).toEqual([5n, 1]);
  });

  it('reads a two-byte varint (300 = 0xAC 0x02)', () => {
    expect(readVarint(new Uint8Array([0xac, 0x02]), 0)).toEqual([300n, 2]);
  });

  it('reads a large multi-byte varint past 32 bits', () => {
    const v = 0x1_0000_0001n;
    const [out, next] = readVarint(new Uint8Array(encodeVarint(v)), 0);
    expect(out).toBe(v);
    expect(next).toBe(encodeVarint(v).length);
  });

  it('respects the start position', () => {
    expect(readVarint(new Uint8Array([0xff, 0x05]), 1)).toEqual([5n, 2]);
  });
});

// ─── readFixed64LE ────────────────────────────────────────────────────────────

describe('readFixed64LE', () => {
  it('reassembles a little-endian 64-bit value spanning both 32-bit halves', () => {
    const v = 0xdead_beef_0000_6fc6n;
    expect(readFixed64LE(new Uint8Array(fixed64LE(v)), 0)).toBe(v);
  });

  it('reads at an offset', () => {
    const v = 42n;
    expect(readFixed64LE(new Uint8Array([0x00, 0x00, ...fixed64LE(v)]), 2)).toBe(v);
  });
});

// ─── readString ───────────────────────────────────────────────────────────────

describe('readString', () => {
  it('reads an ASCII string and returns the end offset', () => {
    const body = utf8('Meat Lovers');
    const [s, end] = readString(new Uint8Array([body.length, ...body]), 0);
    expect(s).toBe('Meat Lovers');
    expect(end).toBe(1 + body.length);
  });

  it('decodes multi-byte UTF-8 (Portuguese accents) correctly', () => {
    // Proves accented club/sim names are NOT the cause of the PT-locale gap —
    // when the bytes are present they decode fine (see clubs.test.ts for the
    // real root cause: the name field is omitted entirely on PT stock clubs).
    const body = utf8('Caçadores da Promoção');
    const [s] = readString(new Uint8Array([body.length, ...body]), 0);
    expect(s).toBe('Caçadores da Promoção');
  });
});

// ─── readTag ──────────────────────────────────────────────────────────────────

describe('readTag', () => {
  it('decodes a single-byte tag (field 1, wire 1)', () => {
    expect(readTag(new Uint8Array([0x09]), 0)).toEqual([1, 1, 1]);
  });

  it('decodes a multi-byte tag (field 22, wire 0 — uses a 2-byte varint)', () => {
    const t = tag(22, 0);
    expect(t.length).toBe(2); // sanity: field >= 16 needs a multi-byte tag
    expect(readTag(new Uint8Array(t), 0)).toEqual([22, 0, 2]);
  });
});

// ─── findLDField ──────────────────────────────────────────────────────────────

describe('findLDField', () => {
  it('returns the body of the first matching length-delimited field', () => {
    const target = utf8('hello');
    const b = buf(
      [...tag(1, 0), ...encodeVarint(99)],   // field 1 varint (skipped)
      ldField(2, target),                     // field 2 LD (wanted)
    );
    expect(Array.from(findLDField(b, 2)!)).toEqual(target);
  });

  it('skips fixed64, varint, and other LD fields to reach the target', () => {
    const b = buf(
      [...tag(6, 1), ...fixed64LE(123n)],     // field 6 fixed64 (skipped)
      ldField(3, utf8('other')),              // field 3 LD (skipped)
      [...tag(1, 0), ...encodeVarint(7)],     // field 1 varint (skipped)
      ldField(8, utf8('found me')),           // field 8 LD (wanted)
    );
    expect(new TextDecoder().decode(findLDField(b, 8)!)).toBe('found me');
  });

  it('returns null when the field is absent', () => {
    const b = buf(ldField(2, utf8('x')));
    expect(findLDField(b, 9)).toBeNull();
  });
});

// ─── iterLDFields ─────────────────────────────────────────────────────────────

describe('iterLDFields', () => {
  it('yields every record of a repeated length-delimited field', () => {
    const b = buf(
      ldField(3, utf8('a')),
      [...tag(1, 0), ...encodeVarint(5)],     // unrelated field between records
      ldField(3, utf8('bb')),
      ldField(3, utf8('ccc')),
      ldField(4, utf8('not me')),             // different field number
    );
    const got = [...iterLDFields(b, 3)].map((u) => new TextDecoder().decode(u));
    expect(got).toEqual(['a', 'bb', 'ccc']);
  });

  it('yields nothing when no record matches', () => {
    const b = buf(ldField(5, utf8('x')));
    expect([...iterLDFields(b, 3)]).toEqual([]);
  });
});
