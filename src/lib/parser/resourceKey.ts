/**
 * ResourceKey instance extraction.
 *
 * A ResourceKey is a 3-field protobuf sub-message: { 1: type, 2: group, 3:
 * instance }. The planner only ever needs the instance, which acts as the
 * filename of an icon in /public/<set>-icons/<hex>.png. The game has used both
 * varint and fixed64 wire types for the instance across versions, so we handle
 * both. Returned as a zero-padded 16-character lowercase hex string so uint64
 * instances with leading zeros keep them (e.g. 0x65c0432d2aa3714 →
 * "065c0432d2aa3714.png").
 */
import { readTag, readVarint, readFixed64LE } from './protobuf';

export function formatInstance(v: bigint): string {
  return v.toString(16).padStart(16, '0');
}

export function extractResourceKeyInstance(buf: Uint8Array): string | null {
  let p = 0;
  while (p < buf.length) {
    const [fn, wire, afterTag] = readTag(buf, p);
    p = afterTag;
    if (wire === 0) {
      const [v, n] = readVarint(buf, p);
      if (fn === 3) return formatInstance(v);
      p = n;
    } else if (wire === 1) {
      if (fn === 3) return formatInstance(readFixed64LE(buf, p));
      p += 8;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      p = n + Number(l);
    } else if (wire === 5) p += 4;
    else return null;
  }
  return null;
}
