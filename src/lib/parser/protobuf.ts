/**
 * Protobuf wire-format primitives for the Sims 4 save parser.
 *
 * The save's master state (the 0x0d DBPF resource) is a deeply nested
 * protobuf. These small pure functions are used by every entity reader in
 * `src/lib/parser/*` to walk that buffer. They've been unit-tested
 * transitively via `parseLotChunk` in `saveParser.test.ts`.
 *
 * Wire-type reference:
 *   0 = varint (int32, int64, uint32, uint64, bool, enum)
 *   1 = 64-bit fixed (fixed64, sfixed64, double)
 *   2 = length-delimited (string, bytes, embedded messages, packed repeated)
 *   5 = 32-bit fixed (fixed32, sfixed32, float)
 */

export function readFixed64LE(buf: Uint8Array, pos: number): bigint {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}

export function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}

const DECODER = new TextDecoder();

/**
 * Decode UTF-8 and strip NUL (\u0000). Non-English saves can carry NUL inside
 * text fields; Postgres rejects it, so the server scrubs it on write — and the
 * client-side parse must produce the SAME string, or every re-sync diff sees a
 * phantom "changed in game" on the affected fields. Every byte→text decode in
 * the parser goes through here.
 */
export function decodeText(bytes: Uint8Array): string {
  const s = DECODER.decode(bytes);
  return s.includes('\u0000') ? s.replace(/\u0000/g, '') : s;
}

export function readString(buf: Uint8Array, pos: number): [string, number] {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [decodeText(buf.slice(next, end)), end];
}

/** Read a protobuf tag (varint encoding `field_num << 3 | wire_type`). */
export function readTag(buf: Uint8Array, pos: number): [fieldNum: number, wire: number, after: number] {
  const [tagVal, after] = readVarint(buf, pos);
  return [Number(tagVal >> 3n), Number(tagVal & 7n), after];
}

/**
 * Find the first length-delimited (wire type 2) field with the given field
 * number in `buf` and return its body. Returns null if not present.
 */
export function findLDField(buf: Uint8Array, fieldNum: number): Uint8Array | null {
  let p = 0;
  while (p < buf.length) {
    if (buf[p] === 0 && p === 0) return null;
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(buf, p);
      return buf.slice(afterLen, afterLen + Number(len));
    }
    if (wire === 0)      { const [, n] = readVarint(buf, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}

/**
 * Iterate every length-delimited field with the given field number — used for
 * `repeated` fields in protobuf (one yield per record).
 */
export function* iterLDFields(buf: Uint8Array, fieldNum: number): Generator<Uint8Array> {
  let p = 0;
  while (p < buf.length) {
    if (p >= buf.length) return;
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 2 && fn === fieldNum) {
      const [len, afterLen] = readVarint(buf, p);
      const ln = Number(len);
      yield buf.slice(afterLen, afterLen + ln);
      p = afterLen + ln;
    } else if (wire === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wire === 1) p += 8;
    else if (wire === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wire === 5) p += 4;
    else return;
  }
}
