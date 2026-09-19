/**
 * Regression tests for parseClub (H1) — and a documented guard for the
 * PT-locale club-name limitation (H2).
 *
 * Clubs are the trickiest entity: optional name, packed member list, and
 * hangout state that depends on an enum. These buffers are hand-built from the
 * field layout documented in clubs.ts.
 */
import { describe, it, expect } from 'vitest';
import { parseClub } from './clubs';

// ─── encoders ─────────────────────────────────────────────────────────────────

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

// A ResourceKey sub-message { 1: type, 2: group, 3: instance(fixed64) }, wrapped
// as length-delimited field `field` on the parent message.
function resourceKey(field: number, instance: bigint): number[] {
  return ldField(field, [
    ...varintField(1, 0),
    ...varintField(2, 0),
    ...fixed64Field(3, instance),
  ]);
}

// ─── parseClub ──────────────────────────────────────────────────────────────

describe('parseClub', () => {
  it('parses a full custom club (name, description, leader, members, lot hangout)', () => {
    const b = buf(
      varintField(1, 0x1234),               // id
      ldField(2, utf8('Meat Lovers')),      // name
      ldField(4, utf8('We grill.')),        // description
      fixed64Field(6, 0xaaaa_0001n),        // leader
      ldField(7, [...fixed64LE(0x1001n), ...fixed64LE(0x1002n)]), // 2 packed members
      varintField(22, 2),                   // hangout_setting = 2 (lot)
      fixed64Field(23, 0xbbbb_0002n),       // hangout_zone_id
    );
    const club = parseClub(b)!;
    expect(club.id).toBe(0x1234n);
    expect(club.name).toBe('Meat Lovers');
    expect(club.description).toBe('We grill.');
    expect(club.leaderSimId).toBe(0xaaaa_0001n);
    expect(club.memberSimIds).toEqual([0x1001n, 0x1002n]);
    expect(club.hangoutSetting).toBe('lot');
    expect(club.hangoutZoneId).toBe(0xbbbb_0002n); // kept because setting is 'lot'
  });

  it('drops hangoutZoneId when the hangout is a venue, not a specific lot', () => {
    const b = buf(
      varintField(1, 1n),
      varintField(22, 1),                   // hangout_setting = 1 (venue)
      fixed64Field(23, 0x9999n),            // zone id present but should be ignored
    );
    const club = parseClub(b)!;
    expect(club.hangoutSetting).toBe('venue');
    expect(club.hangoutZoneId).toBeNull();
  });

  it('defaults hangout to none when the setting field is absent', () => {
    const club = parseClub(buf(varintField(1, 7n)))!;
    expect(club.hangoutSetting).toBe('none');
    expect(club.hangoutZoneId).toBeNull();
    expect(club.memberSimIds).toEqual([]);
  });

  it('returns null when the club id (field 1) is missing', () => {
    expect(parseClub(buf(ldField(2, utf8('Nameless'))))).toBeNull();
  });

  it('decodes a club name with multi-byte UTF-8 accents', () => {
    const club = parseClub(buf(
      varintField(1, 2n),
      ldField(2, utf8('Caçadores')),
    ))!;
    expect(club.name).toBe('Caçadores'); // decode is fine when the field is present
  });

  // H2 — documented PT-locale limitation. Localized stock clubs in non-EN saves
  // carry NO inline name (field 2); they reference a club_seed (field 12) whose
  // human name lives in the game's string table, which we don't ship. So name is
  // null by design. If a future change starts resolving seeds to names, update
  // this test rather than letting it silently regress.
  it('leaves name null for a stock club that only has a club_seed (PT-locale case)', () => {
    const club = parseClub(buf(
      varintField(1, 0x55n),
      resourceKey(3, 0xfeed_1234n),  // field 3 icon (sub-message, not a name)
      resourceKey(12, 0x00c0_ffeen), // field 12 club_seed reference
    ))!;
    expect(club.name).toBeNull();         // the gap: no human-readable name
    expect(club.clubSeed).not.toBeNull(); // but we DO capture the seed reference
  });
});
