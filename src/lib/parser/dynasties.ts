/**
 * In-game Dynasty parser (EP21 "royalty & legacy").
 *
 * Dynasties live at SaveGameData → field 2 (SaveSlotData) → field 8
 * (GameplaySaveSlotData) → field 60 (dynasty service) → repeated field 1
 * (one record per dynasty). Verified against Slot_00000003 (8 premade Maxis
 * dynasties + 1 player-founded "Tester Dynasty").
 *
 * Dynasty record fields (confirmed empirically):
 *   1  (fixed64)   dynasty id
 *   2  (string)    name
 *   4  (fixed64)   head sim id (the founder/head; role per sim comes from traits)
 *   6  (sub-msg)*  member { 1:sim_id(fixed64), 4:succession_order } — repeated
 *   7  (bytes)     ideal+skill list, packed 8-byte entries; low 3 bytes of each
 *                  = a dynastyValue tuning id (split into ideals/skills via catalog)
 *   8  (bytes)     allied dynasty ids, packed fixed64 (mutual)
 *   9  (bytes)     rival dynasty ids, packed fixed64 (mutual)
 *   10 (string)    description
 *   11 (sub-msg)   crest background { 3:varint instance hash of the bg ResourceKey }
 *   12 (sub-msg)*  perk { 1:perk_id } — repeated
 *
 * Prestige/unity values live on the dynasty head's per-sim statistics (see
 * scanDynastyStats below), not in this record.
 */
import { readTag, readVarint, readFixed64LE, findLDField, iterLDFields, decodeText } from './protobuf';
import type { ParsedDynasty, ParsedDynastyMember } from './types';

function parseMember(sub: Uint8Array): ParsedDynastyMember | null {
  let simId: bigint | null = null;
  let order = 0;
  let p = 0;
  while (p < sub.length) {
    const [fn, wire, after] = readTag(sub, p);
    p = after;
    if (wire === 0) {
      const [v, n] = readVarint(sub, p);
      p = n;
      if (fn === 4) order = Number(v);
    } else if (wire === 1) {
      if (fn === 1) simId = readFixed64LE(sub, p);
      p += 8;
    } else if (wire === 5) {
      p += 4;
    } else if (wire === 2) {
      const [l, n] = readVarint(sub, p);
      p = n + Number(l);
    } else {
      return null;
    }
  }
  // role is resolved later in saveParser (needs the member's full traits).
  return simId === null ? null : { simId, order, role: null };
}

/** Read field 3 (varint) out of a crest ResourceKey-like sub-message → 16-char hex instance hash. */
function crestHashFromSub(sub: Uint8Array): string | null {
  let p = 0;
  while (p < sub.length) {
    const [fn, wire, after] = readTag(sub, p);
    p = after;
    if (wire === 0) {
      const [v, n] = readVarint(sub, p);
      p = n;
      if (fn === 3) return v.toString(16).padStart(16, '0');
    } else if (wire === 1) {
      p += 8;
    } else if (wire === 5) {
      p += 4;
    } else if (wire === 2) {
      const [l, n] = readVarint(sub, p);
      p = n + Number(l);
    } else {
      break;
    }
  }
  return null;
}

/** Read field 1 (varint) out of a perk sub-message. */
function perkIdFromSub(sub: Uint8Array): number | null {
  if (sub.length === 0) return null;
  const [fn, wire, after] = readTag(sub, 0);
  if (fn === 1 && wire === 0) {
    const [v] = readVarint(sub, after);
    return Number(v);
  }
  return null;
}

export function parseDynasty(buf: Uint8Array): ParsedDynasty | null {
  let id = 0n;
  let name: string | null = null;
  let description = '';
  let headSimId: bigint | null = null;
  const members: ParsedDynastyMember[] = [];
  const valueIds: string[] = [];
  let crestBgHash: string | null = null;
  let crestFgHash: string | null = null;
  const perkIds: number[] = [];
  const allianceDynastyIds: bigint[] = [];  // f8 — confirmed via Alfaro fixture (allied with Goth)
  const rivalryDynastyIds: bigint[] = [];   // f9 — confirmed via Alfaro fixture (rivals with Landgraab)

  let p = 0;
  while (p < buf.length) {
    const [fn, wire, after] = readTag(buf, p);
    p = after;

    if (wire === 0) {
      const [, n] = readVarint(buf, p);
      p = n;
    } else if (wire === 1) {
      if (fn === 1) id = readFixed64LE(buf, p);
      else if (fn === 4) headSimId = readFixed64LE(buf, p);
      p += 8;
    } else if (wire === 5) {
      p += 4;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, p);
      const ln = Number(l);
      const sub = buf.slice(n, n + ln);
      p = n + ln;

      if (fn === 2) {
        name = decodeText(sub);
      } else if (fn === 10) {
        description = decodeText(sub);
      } else if (fn === 3) {
        // crest foreground (symbol) ResourceKey — mirror of f11 (background)
        crestFgHash = crestHashFromSub(sub);
      } else if (fn === 6) {
        const m = parseMember(sub);
        if (m) members.push(m);
      } else if (fn === 7) {
        for (let q = 0; q + 8 <= sub.length; q += 8) {
          const v = sub[q] | (sub[q + 1] << 8) | (sub[q + 2] << 16);
          if (v) valueIds.push('0x' + v.toString(16));
        }
      } else if (fn === 8) {
        // Allied dynasties — packed fixed64 dynasty ids (mutual).
        for (let q = 0; q + 8 <= sub.length; q += 8) allianceDynastyIds.push(readFixed64LE(sub, q));
      } else if (fn === 9) {
        // Rival dynasties — packed fixed64 dynasty ids (mutual).
        for (let q = 0; q + 8 <= sub.length; q += 8) rivalryDynastyIds.push(readFixed64LE(sub, q));
      } else if (fn === 11) {
        crestBgHash = crestHashFromSub(sub);
      } else if (fn === 12) {
        const pid = perkIdFromSub(sub);
        if (pid !== null) perkIds.push(pid);
      }
    } else {
      return null;
    }
  }

  if (id === 0n && name === null) return null;

  return {
    id,
    name: name ?? '',
    description,
    headSimId,
    members,
    valueIds,
    crestBgHash,
    crestFgHash,
    perkIds,
    allianceDynastyIds,
    rivalryDynastyIds,
    prestige: null,
    unity: null,
  };
}

// Ranked-statistic tuning ids (from the EP21 dynasty tuning).
const PRESTIGE_STAT_ID = 466614;
const UNITY_STAT_ID = 466615;

/**
 * Dynasty prestige/unity live on the dynasty HEAD's per-sim data, not in the
 * dynasty service: top-level field 6 (one record per sim) → field 30 (statistic
 * trackers) → ranked-stat entries `08 <statId> 15 <f32 value>`. Returns a map of
 * owner sim id → { prestige, unity } for the (≈9) sims that carry them.
 */
export function scanDynastyStats(buf: Uint8Array): Map<bigint, { prestige: number | null; unity: number | null }> {
  const out = new Map<bigint, { prestige: number | null; unity: number | null }>();

  // Read a ranked stat float by id from a tracker buffer (entry: 08 <id> 15 <f32>).
  const readStat = (tracker: Uint8Array, statId: number): number | null => {
    for (let p = 0; p + 6 < tracker.length; p++) {
      if (tracker[p] !== 0x08) continue;
      const [v, n] = readVarint(tracker, p + 1);
      if (Number(v) === statId && tracker[n] === 0x15) {
        const dv = new DataView(tracker.buffer, tracker.byteOffset + n + 1, 4);
        return dv.getFloat32(0, true);
      }
    }
    return null;
  };

  for (const simRec of iterLDFields(buf, 6)) {
    let prestige: number | null = null;
    let unity: number | null = null;
    for (const tracker of iterLDFields(simRec, 30)) {
      if (prestige === null) prestige = readStat(tracker, PRESTIGE_STAT_ID);
      if (unity === null) unity = readStat(tracker, UNITY_STAT_ID);
    }
    if (prestige === null && unity === null) continue;

    // Owner sim id: the first fixed64 field on the sim record that looks like an id.
    let owner: bigint | null = null;
    let p = 0;
    while (p < simRec.length && owner === null) {
      const [, wire, after] = readTag(simRec, p);
      p = after;
      if (wire === 0) { const [, n] = readVarint(simRec, p); p = n; }
      else if (wire === 1) { owner = readFixed64LE(simRec, p); p += 8; }
      else if (wire === 5) p += 4;
      else if (wire === 2) { const [l, n] = readVarint(simRec, p); p = n + Number(l); }
      else break;
    }
    if (owner !== null) out.set(owner, { prestige, unity });
  }
  return out;
}

/** Walk a 0x0d buffer to the dynasty service and parse every dynasty record. */
export function scanDynasties(buf: Uint8Array): ParsedDynasty[] {
  const saveSlot = findLDField(buf, 2);
  if (!saveSlot) return [];
  const gameSlot = findLDField(saveSlot, 8);
  if (!gameSlot) return [];
  const svc = findLDField(gameSlot, 60);
  if (!svc) return [];

  const out: ParsedDynasty[] = [];
  for (const rec of iterLDFields(svc, 1)) {
    const d = parseDynasty(rec);
    if (d) out.push(d);
  }

  // Attach prestige/unity, stored on each dynasty head's per-sim statistics.
  const stats = scanDynastyStats(buf);
  for (const d of out) {
    if (d.headSimId !== null) {
      const s = stats.get(d.headSimId);
      if (s) { d.prestige = s.prestige; d.unity = s.unity; }
    }
  }
  return out;
}
