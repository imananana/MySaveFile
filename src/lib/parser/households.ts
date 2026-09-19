/**
 * Household scanner.
 *
 * Anchor pattern:
 *   0x09 [8 token] 0x11 [8 hhId] 0x1a [len][name] 0x21 [8 lotId]
 *
 * Then the body continues with more fields:
 *   field 11 (tag 0x5a)      → wraps sub-field 1 (tag 0x0a) = packed sim IDs
 *   field 18 (tag 0x92 0x01) → user-set description string
 */
import { readVarint, readFixed64LE, readString, decodeText } from './protobuf';
import type { ParsedHousehold } from './types';

export function scanHouseholdRecords(buf: Uint8Array): ParsedHousehold[] {
  const households: ParsedHousehold[] = [];
  const seen = new Set<bigint>();

  // First pass: find all anchor offsets so we know each record's window
  const anchors: { start: number; hhId: bigint; name: string; lotId: bigint; bodyStart: number }[] = [];

  for (let i = 0; i < buf.length - 40; i++) {
    if (buf[i] !== 0x09) continue;
    if (buf[i + 9] !== 0x11) continue;

    let pos = i + 10;
    if (pos + 8 > buf.length) continue;
    const hhId = readFixed64LE(buf, pos);
    pos += 8;

    if (buf[pos] !== 0x1a) continue;
    pos++;
    const [hhName, afterName] = readString(buf, pos);
    if (!hhName || hhName.length < 2 || hhName.length > 60) continue;
    if (!/^[\x20-\x7e]+$/.test(hhName)) continue;
    if (hhName.includes('_')) continue;
    pos = afterName;

    if (buf[pos] !== 0x21) continue;
    pos++;
    if (pos + 8 > buf.length) continue;
    const lotId = readFixed64LE(buf, pos);
    pos += 8;

    if (seen.has(hhId)) continue;
    seen.add(hhId);

    anchors.push({ start: i, hhId, name: hhName, lotId, bodyStart: pos });
  }

  // Second pass: for each anchor, walk fields up to the next anchor, looking
  // for the field 11 (0x5a) → sub-field 1 (0x0a) packed sim ID array.

  for (let ai = 0; ai < anchors.length; ai++) {
    const a = anchors[ai];
    const windowEnd = ai + 1 < anchors.length ? anchors[ai + 1].start : Math.min(buf.length, a.bodyStart + 2_000_000);
    const { simIds, description, money, isPlayed, playerEngaged, creatorName, creatorAccountId } = extractHouseholdBody(buf, a.bodyStart, windowEnd);
    households.push({
      id: a.hhId,
      name: a.name,
      description,
      simIds,
      lotId: a.lotId === 0n ? null : a.lotId,
      money,
      isPlayed,
      playerEngaged,
      creatorName,
      creatorAccountId,
    });
  }

  return households;
}

function extractHouseholdBody(buf: Uint8Array, start: number, end: number): { simIds: bigint[]; description: string; money: bigint | null; isPlayed: boolean; playerEngaged: boolean; creatorName: string | null; creatorAccountId: bigint | null } {
  // Walk top-level fields using varint tags (so we handle multi-byte tags like
  // field 18, tag bytes 0x92 0x01 = household description).
  //   field 5  (tag 0x28)     wt0 (varint) → HouseholdData.money (Simoleons)
  //   field 9  (tag 0x49)     wt1 (fixed64) → player-authorship ID. PRESENT iff the save
  //                            owner created / CAS-edited / moved a sim into / played this
  //                            household; ABSENT on untouched EA premades + townies + spawns.
  //                            (Validated against ground truth — see provenance.ts.)
  //   field 11 (tag 0x5a)     wt2 → sub-field 1 (tag 0x0a) = packed sim IDs
  //   field 18 (tag 0x92 0x01) wt2 → user-set description string
  //   field 20 (tag 0xa1 0x01) wt1 (fixed64) → gallery/CAS creator account id (0 if unstamped)
  //   field 21 (tag 0xaa 0x01) wt2 → gallery/CAS creator NAME (empty if unstamped)
  //   field 31 (tag 0xf8 0x01) wt0 → "played" flag (1 = player-managed household)
  let p = start;
  const ids: bigint[] = [];
  let description = '';
  let money: bigint | null = null;
  let isPlayed = false;
  let playerEngaged = false;
  let creatorName: string | null = null;
  let creatorAccountId: bigint | null = null;

  while (p < end) {
    if (buf[p] === 0) break;
    let tagVal: bigint;
    try {
      const [t, n] = readVarint(buf, p);
      tagVal = t; p = n;
    } catch { break; }
    const fn = Number(tagVal >> 3n);
    const wireType = Number(tagVal & 7n);

    if (wireType === 0) {
      // varint value — capture HouseholdData.money (field 5) + played flag (31).
      const [val, next] = readVarint(buf, p);
      if (fn === 5) money = val;
      else if (fn === 31) isPlayed = val === 1n;
      p = next;
    } else if (wireType === 1) {
      // fixed64 — field 9 = player-authorship marker (presence), field 20 = creator account.
      if (fn === 9) playerEngaged = true;
      else if (fn === 20) { const acct = readFixed64LE(buf, p); creatorAccountId = acct === 0n ? null : acct; }
      p += 8;
    } else if (wireType === 2) {
      const [len, next] = readVarint(buf, p);
      if (len < 0n || len > 1_000_000n) break;
      const valEnd = next + Number(len);
      if (valEnd > end) break;

      if (fn === 21) {
        try { const s = decodeText(buf.slice(next, valEnd)); if (s.length) creatorName = s; }
        catch { /* leave null */ }
      } else if (fn === 11) {
        // walk inner fields looking for sub-field 1 (tag 0x0a) = packed sim IDs
        let inner = next;
        while (inner < valEnd) {
          const subTag = buf[inner++];
          if (subTag === 0) break;
          const subWt = subTag & 0x07;
          if (subWt === 2) {
            const [subLen, subStart] = readVarint(buf, inner);
            const subValEnd = subStart + Number(subLen);
            if (subValEnd > valEnd) break;
            if (subTag === 0x0a) {
              for (let off = subStart; off + 8 <= subValEnd; off += 8) {
                ids.push(readFixed64LE(buf, off));
              }
            }
            inner = subValEnd;
          } else if (subWt === 0) {
            const [, n] = readVarint(buf, inner); inner = n;
          } else if (subWt === 1) inner += 8;
          else if (subWt === 5) inner += 4;
          else break;
        }
      } else if (fn === 18) {
        try { description = decodeText(buf.slice(next, valEnd)); }
        catch { /* leave empty */ }
      }

      p = valEnd;
    } else if (wireType === 5) {
      p += 4;
    } else {
      break;
    }
  }

  return { simIds: ids, description, money, isPlayed, playerEngaged, creatorName, creatorAccountId };
}
