/**
 * Regression tests for parseDynasty — guards the field-60 dynasty-record layout
 * (id, name, head, members + succession order, ideal/skill ids, description,
 * crest background hash, perk ids). Buffers are hand-built from the layout
 * documented in dynasties.ts and verified against Slot_00000003.
 */
import { describe, it, expect } from 'vitest';
import { parseDynasty } from './dynasties';

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
function varintField(field: number, v: number | bigint): number[] {
  return [...tag(field, 0), ...encodeVarint(v)];
}
function fixed64Field(field: number, v: bigint): number[] {
  return [...tag(field, 1), ...fixed64LE(v)];
}
function ldField(field: number, body: number[]): number[] {
  return [...tag(field, 2), ...encodeVarint(body.length), ...body];
}
function buf(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

/** A field-7 ideal/skill entry: 3-byte LE tuning id + 5 padding bytes. */
function valueEntry(id: number): number[] {
  return [id & 0xff, (id >> 8) & 0xff, (id >> 16) & 0xff, 0, 0, 0, 0, 0];
}

describe('parseDynasty', () => {
  it('extracts the full record', () => {
    const d = parseDynasty(buf(
      fixed64Field(1, 0x64023c70b4163502n),         // id
      ldField(2, utf8('Tester Dynasty')),           // name
      fixed64Field(4, 0x16046ab6a5163502n),         // head sim
      ldField(6, [...fixed64Field(1, 0x16046ab6a5163502n), ...varintField(4, 1)]), // member Taylor #1
      ldField(6, [...fixed64Field(1, 0x220476b6a5163502n), ...varintField(4, 2)]), // member Chana #2
      ldField(7, [...valueEntry(0x72883), ...valueEntry(0x723c7), ...valueEntry(0x72418)]), // Connoisseur, Jolly, Bowling
      ldField(10, utf8('Description Dynasty Test')), // description
      ldField(11, [...varintField(1, 11720834), ...varintField(2, 0), ...varintField(3, 0x8153a23cf96dc4can)]), // crest bg
      ldField(12, [...varintField(1, 12289), ...varintField(2, 0)]), // a perk
    ))!;

    expect(d.id).toBe(0x64023c70b4163502n);
    expect(d.name).toBe('Tester Dynasty');
    expect(d.description).toBe('Description Dynasty Test');
    expect(d.headSimId).toBe(0x16046ab6a5163502n);
    // role is null here — it's resolved later in saveParser from the member's full traits.
    expect(d.members).toEqual([
      { simId: 0x16046ab6a5163502n, order: 1, role: null },
      { simId: 0x220476b6a5163502n, order: 2, role: null },
    ]);
    expect(d.valueIds).toEqual(['0x72883', '0x723c7', '0x72418']);
    expect(d.crestBgHash).toBe('8153a23cf96dc4ca');
    expect(d.perkIds).toEqual([12289]);
    expect(d.crestFgHash).toBeNull();
  });

  it('extracts allied (f8) and rival (f9) dynasty ids — packed fixed64', () => {
    // Layout verified against the Alfaro dynasty fixture (allied with Goth,
    // rivals with Landgraab); both fields are packed 8-byte dynasty ids.
    const d = parseDynasty(buf(
      fixed64Field(1, 0xa1n),
      ldField(2, utf8('Alfaro')),
      ldField(8, [...fixed64LE(0x60711n), ...fixed64LE(0x60722n)]),  // allies: Goth, +one more
      ldField(9, [...fixed64LE(0x60733n)]),                          // rival: Landgraab
    ))!;
    expect(d.allianceDynastyIds).toEqual([0x60711n, 0x60722n]);
    expect(d.rivalryDynastyIds).toEqual([0x60733n]);
  });

  it('tolerates a minimal record (id + name only)', () => {
    const d = parseDynasty(buf(
      fixed64Field(1, 7n),
      ldField(2, utf8('Bare')),
    ))!;
    expect(d.name).toBe('Bare');
    expect(d.members).toEqual([]);
    expect(d.valueIds).toEqual([]);
  });

  it('returns null for an empty/unidentifiable record', () => {
    expect(parseDynasty(buf(varintField(99, 0)))).toBeNull();
  });
});
