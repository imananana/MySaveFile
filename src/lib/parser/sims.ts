/**
 * Sim record scanner — extracts every sim (humans + pets) plus gender,
 * lifestage, occult, ghost status, pet species/breed.
 *
 * Two passes:
 *
 * 1. `scanHumanSimStubs` walks the 0x0a outer tag to collect human sim IDs.
 *    Pet records don't have a 0x0a stub. This is purely a discriminator —
 *    the actual sim attributes come from the full anchor scan.
 *
 * 2. `scanFullSimAnchors` walks the wider buffer for anchor patterns:
 *       0x09 [8 sim ID] 0x11 [8 lot ID] 0x18 [varint ts] 0x21 [8 hh ID]
 *       0x2a [len first] 0x32 [len last] 0x38 [varint gender]
 *       0x40 [varint lifestage] …
 *    and reads gender/lifestage/occult/ghost/pet metadata from the trailing
 *    fields.
 */
import { readVarint, readFixed64LE, readString, decodeText } from './protobuf';
import { petSubtypeFromBreed, PetSubtype } from '../../data/petBreeds';
import { deathCauseFromTraits } from '../../data/deathCauses';
import { enrolledDegreeFromUids } from '../../data/stockDegrees';
import { pickCareer, type SimCareer, type RawCareerEntry } from '../../data/careerSelect';
import { STOCK_SKILLS } from '../../data/stockSkills';
import { skillLevelFromPoints } from '../../data/stockSkillCurves';
import type {
  ParsedSim,
  ParsedGender,
  ParsedLifestage,
  ParsedOccult,
} from './types';

const ASCII_NAME = /^[A-Z][A-Za-z'\-. ]{0,28}$/;
const LAST_NAME_OK = /^[A-Za-z'\-. ]{0,28}$/;

function isPlausibleName(first: string, last: string): boolean {
  if (!ASCII_NAME.test(first)) return false;
  if (last.length > 0 && !LAST_NAME_OK.test(last)) return false;
  if (first.includes('_') || last.includes('_')) return false;
  return true;
}

export function scanHumanSimStubs(buf: Uint8Array): Set<bigint> {
  const ids = new Set<bigint>();
  for (let i = 0; i < buf.length - 6; i++) {
    if (buf[i] !== 0x0a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 4n || msgLen > 200n || msgEnd > buf.length) continue;

    pos = msgStart;
    if (buf[pos] !== 0x08) continue;
    pos++;
    const [simId, afterId] = readVarint(buf, pos);
    if (simId === 0n || simId < 0x10000n) continue;
    pos = afterId;

    if (pos >= msgEnd || buf[pos] !== 0x12) continue;
    pos++;
    const [firstName, afterFirst] = readString(buf, pos);
    if (!firstName || firstName.length < 1 || firstName.length > 30) continue;
    pos = afterFirst;

    if (pos >= msgEnd || buf[pos] !== 0x1a) continue;
    pos++;
    const [lastName] = readString(buf, pos);
    if (lastName.length > 30) continue;

    if (!isPlausibleName(firstName, lastName)) continue;

    ids.add(simId);
    i = msgEnd - 1;
  }
  return ids;
}

// ─── Full sim record scanner (0x32 outer tag — HUMANS + PETS) ────────────────
// Anchor pattern, body of each detail record:
//   0x09 [8 sim ID]
//   0x11 [8 lot ID]
//   0x18 [varint timestamp]
//   0x21 [8 household ID]
//   0x2a [len] [first name]      ← humans + pets both have this
//   0x32 [len] [last name]       ← may be empty (typical for pets)
//   0x38 [varint] = gender (4096 = male, 8192 = female)
//   0x40 [varint] = lifestage (power-of-2 enum for humans)
//
// Each anchor in the wider buffer corresponds to a unique sim record, regardless
// of the outer tag, so we can scan by anchor without parsing the wrapper.

const HUMAN_LIFESTAGE_MAP: Record<number, ParsedLifestage> = {
  1:   'newborn',  // bassinet baby — inferred from the power-of-2 Age enum, pending seeded-save verification
  2:   'toddler',
  4:   'child',
  8:   'teen',
  16:  'youngAdult',
  32:  'adult',
  64:  'elder',
  128: 'infant',
};

const OCCULT_MAP: Record<number, ParsedOccult> = {
  1:  'none',
  3:  'alien',
  4:  'vampire',
  9:  'mermaid',
  16: 'spellcaster',
  33: 'werewolf',
  65: 'fairy',
};

// Extract occult + ghost status from the sim record by properly walking
// top-level fields (not byte-scanning, which produces false positives where
// nested-field content happens to start with 0xf2 0x01 or 0xb0 0x03).
//
//   - field 30 (tag varint = 242, encoded 0xf2 0x01) is the occult tracker;
//     inside it, field 17 (tag varint = 138, encoded 0x8a 0x01) is the active
//     occult sub-message, whose field 1 (0x08) varint is the occult enum.
//     Mapping: 1=human, 3=alien, 4=vampire, 9=mermaid, 16=spellcaster,
//     33=werewolf, 65=fairy.
//   - field 54 (tag varint = 432, encoded 0xb0 0x03) holds a varint that
//     equals 0xD3582E8CD8AFF609 for ghosts and 0 (or other unrelated small
//     values) for alive sims.
function extractOccultFromSim(buf: Uint8Array, start: number, maxBytes = 100_000): { occult: ParsedOccult; isGhost: boolean } {
  const hardEnd = Math.min(buf.length, start + maxBytes);
  let occult: ParsedOccult = 'none';
  let isGhost = false;

  let p = start;
  while (p < hardEnd) {
    // Read the next top-level field tag (varint).
    let tag: number;
    let afterTag: number;
    const b0 = buf[p];
    if (b0 === 0) return { occult, isGhost };
    if ((b0 & 0x80) === 0) {
      tag = b0;
      afterTag = p + 1;
    } else {
      // Multi-byte varint tag (only up to 2 bytes needed for fields up to 8191)
      const b1 = buf[p + 1];
      if ((b1 & 0x80) !== 0) return { occult, isGhost }; // give up on 3+ byte tag
      tag = (b1 << 7) | (b0 & 0x7f);
      afterTag = p + 2;
    }
    const fieldNum = tag >> 3;
    const wireType = tag & 7;

    // Found f30 (occult tracker)
    if (fieldNum === 30 && wireType === 2) {
      const [f30Len, f30Start] = readVarint(buf, afterTag);
      const f30End = f30Start + Number(f30Len);
      if (f30End > hardEnd) return { occult, isGhost };
      // Walk inside f30 looking for f17
      let inner = f30Start;
      while (inner < f30End) {
        const ib0 = buf[inner];
        if (ib0 === 0) break;
        let innerTag: number;
        let afterInnerTag: number;
        if ((ib0 & 0x80) === 0) {
          innerTag = ib0;
          afterInnerTag = inner + 1;
        } else {
          const ib1 = buf[inner + 1];
          if ((ib1 & 0x80) !== 0) break;
          innerTag = (ib1 << 7) | (ib0 & 0x7f);
          afterInnerTag = inner + 2;
        }
        const ifn = innerTag >> 3;
        const iwt = innerTag & 7;
        if (ifn === 17 && iwt === 2) {
          const [f17Len, f17Start] = readVarint(buf, afterInnerTag);
          const f17End = f17Start + Number(f17Len);
          if (f17End > f30End) break;
          if (f17Start < f17End && buf[f17Start] === 0x08) {
            const [val] = readVarint(buf, f17Start + 1);
            const mapped = OCCULT_MAP[Number(val)];
            if (mapped) occult = mapped;
          }
          break;
        }
        if (iwt === 0) { const [, n] = readVarint(buf, afterInnerTag); inner = n; }
        else if (iwt === 1) inner = afterInnerTag + 8;
        else if (iwt === 2) { const [l, n] = readVarint(buf, afterInnerTag); inner = n + Number(l); }
        else if (iwt === 5) inner = afterInnerTag + 4;
        else break;
      }
      p = f30End;
      continue;
    }

    // Found f54 (ghost flag)
    if (fieldNum === 54 && wireType === 0) {
      const [val, next] = readVarint(buf, afterTag);
      if (val === 0xD3582E8CD8AFF609n) isGhost = true;
      p = next;
      // Once we've found f54, occult is usually already decoded too (f30
      // comes before f54 in the field ordering). But continue just in case.
      continue;
    }

    // Other field — skip past it
    if (wireType === 0) { const [, n] = readVarint(buf, afterTag); p = n; }
    else if (wireType === 1) p = afterTag + 8;
    else if (wireType === 2) { const [l, n] = readVarint(buf, afterTag); p = n + Number(l); }
    else if (wireType === 5) p = afterTag + 4;
    else return { occult, isGhost };
  }
  return { occult, isGhost };
}

// Walk into a length-delimited sub-message at [start, end) looking for a child
// field by number+wire type. Returns the value-start offset (after the length
// prefix) for wt=2 matches, or the position-after-varint for wt=0 matches.
function findChildField(buf: Uint8Array, start: number, end: number, targetFn: number, targetWt: number): { pos: number; end: number } | null {
  let p = start;
  while (p < end) {
    const b0 = buf[p];
    if (b0 === 0) return null;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else {
      const b1 = buf[p + 1];
      if ((b1 & 0x80) !== 0) return null;
      tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
      afterTag = p + 2;
    }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) return null;
    p = afterTag;
    if (fn === targetFn && wt === targetWt) {
      if (wt === 2) {
        const [len, n] = readVarint(buf, p);
        return { pos: n, end: n + Number(len) };
      }
      if (wt === 0) { return { pos: p, end }; }
    }
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) p += 4;
    else return null;
  }
  return null;
}

// Extract per-sim CAS-picked traits and current aspiration from a SimData
// record. Walks top-level fields of the record from `start` (which is
// positioned right after f10 in scanFullSimAnchors) looking for:
//   - field 30 (LD, attributes / PersistableSimInfoAttributes) → field 10 (LD,
//     trait_tracker / PersistableTraitTracker) → field 1 (LD, packed
//     repeated uint64 trait_ids)
//   - field 34 (varint) — primary_aspiration (the CAS-picked long-term one)
//
// The trait_ids list contains EVERY trait the sim has (CAS-picked + earned
// reward + emotional + lifestyle). Filtering to CAS personality traits happens
// at the display layer via a curated STOCK_TRAITS tuning-ID map; the parser
// faithfully returns all of them so future map expansions don't require
// re-parsing.
//
// Money is intentionally NOT extracted here. The protobuf has SimData.money
// at field 27 but it's never populated on the records we see — funds live at
// the household level (HouseholdData.field 5), and `households.ts` reads it
// there.
//
// Tag encoding reminder (varint-encoded protobuf tag = (fieldNum << 3) | wireType):
//   - field 30, wt=2 → 242 → 0xF2 0x01 (shared with extractOccultFromSim)
//   - field 34, wt=0 → 272 → 0x90 0x02
// Read the university-enrollment tracker (attributes.f30): f1 = degree program
// uid, f2 = university uid. Each is a scalar (varint or fixed64). Both are 0
// when the sim isn't currently enrolled — return null in that case.
function readUniversityTracker(buf: Uint8Array, start: number, end: number): { program: bigint; university: bigint } | null {
  let p = start; let program: bigint | null = null; let university: bigint | null = null;
  while (p < end) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else { const b1 = buf[p + 1]; if ((b1 & 0x80) !== 0) break; tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f); afterTag = p + 2; }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;
    let val = 0n; let next: number;
    if (wt === 0) { const [v, n] = readVarint(buf, afterTag); val = v; next = n; }
    else if (wt === 1) { val = readFixed64LE(buf, afterTag); next = afterTag + 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); next = n + Number(l); }
    else if (wt === 5) { next = afterTag + 4; }
    else break;
    if ((wt === 0 || wt === 1) && fn === 1) program = val;
    else if ((wt === 0 || wt === 1) && fn === 2) university = val;
    p = next;
    if (program !== null && university !== null) break;
  }
  if (!program || !university) return null;
  return { program, university };
}

type EnrolledDegree = { subject: string; school: 'Britechester' | 'Foxbury'; distinguished: boolean };

// Read one career sub-message (attributes.f12.f1 active-career, or f12.f2
// record): f1 = career tuning uid (varint or fixed64), f4 = level. Returns null
// if there's no uid.
function readCareerEntry(buf: Uint8Array, start: number, end: number): { uid: bigint; level: number } | null {
  let p = start; let uid: bigint | null = null; let level = 0;
  while (p < end) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else { const b1 = buf[p + 1]; if ((b1 & 0x80) !== 0) break; tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f); afterTag = p + 2; }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;
    let val = 0n; let next: number;
    if (wt === 0) { const [v, n] = readVarint(buf, afterTag); val = v; next = n; }
    else if (wt === 1) { val = readFixed64LE(buf, afterTag); next = afterTag + 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); next = n + Number(l); }
    else if (wt === 5) { next = afterTag + 4; }
    else break;
    if (fn === 1 && (wt === 0 || wt === 1)) uid = val;
    else if (fn === 4 && wt === 0) level = Number(val);
    p = next;
  }
  return uid ? { uid, level } : null;
}

// Collect the sim's ACTIVE careers: attributes.f12 (career tracker) → every
// f1 child (the current-career pointer). One f1 per current track — adults have
// one, teens have two (High School + an after-school activity), freelancers'
// f1 is the specific trade.
//
// We deliberately read f1, NOT f2: the f2 children are the full per-career
// history, which (a) keeps STALE entries after a job change — e.g. a sim who
// moved Culinary→Writer still has a dead Culinary f2 record, and the old picker
// would surface it — and (b) is sometimes EMPTY for a sim who does have a job
// (e.g. premades like Dina Caliente, canonically a Dishwasher: f1 present, no
// f2). The f1 set is exactly the current job(s). (Reverse-engineered via
// scripts/diagnostics/dumpCareerStruct.ts.)
function readCareerEntries(buf: Uint8Array, attrStart: number, attrEnd: number): RawCareerEntry[] {
  const tracker = findChildField(buf, attrStart, attrEnd, 12, 2);
  if (!tracker) return [];
  const out: RawCareerEntry[] = [];
  let p = tracker.pos;
  while (p < tracker.end) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else { const b1 = buf[p + 1]; if ((b1 & 0x80) !== 0) break; tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f); afterTag = p + 2; }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;
    if (fn === 1 && wt === 2) {
      const [len, n] = readVarint(buf, afterTag);
      const e = readCareerEntry(buf, n, n + Number(len));
      if (e) out.push({ uid: '0x' + e.uid.toString(16), level: e.level });
      p = n + Number(len);
    } else if (wt === 0) { const [, n] = readVarint(buf, afterTag); p = n; }
    else if (wt === 1) p = afterTag + 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); p = n + Number(l); }
    else if (wt === 5) p = afterTag + 4;
    else break;
  }
  return out;
}

export interface ParsedSkill { uid: string; name: string; points: number; level: number }

// Read one skill entry (attributes.f13.f1): f1 = skill statistic id, f2 = fixed32
// float cumulative points. Returns null if there's no id.
function readSkillEntry(buf: Uint8Array, start: number, end: number): { uid: bigint; points: number } | null {
  let p = start; let uid: bigint | null = null; let points = 0;
  while (p < end) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else { const b1 = buf[p + 1]; if ((b1 & 0x80) !== 0) break; tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f); afterTag = p + 2; }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;
    if (wt === 0) { const [v, n] = readVarint(buf, afterTag); if (fn === 1) uid = v; p = n; }
    else if (wt === 1) { if (fn === 1) uid = readFixed64LE(buf, afterTag); p = afterTag + 8; }
    else if (wt === 5) { if (fn === 2) points = new DataView(buf.buffer, buf.byteOffset + afterTag, 4).getFloat32(0, true); p = afterTag + 4; }
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); p = n + Number(l); }
    else break;
  }
  return uid ? { uid, points } : null;
}

// Collect the sim's skills: attributes.f13 (skill tracker) → every f1 child
// (one per skill with progress). Resolves name via STOCK_SKILLS and level via
// the per-category curve (stockSkillCurves). Reverse-engineered in
// scripts/diagnostics/spikeSkills.ts. Sorted by level desc then name.
function readSkills(buf: Uint8Array, attrStart: number, attrEnd: number): ParsedSkill[] {
  const tracker = findChildField(buf, attrStart, attrEnd, 13, 2);
  if (!tracker) return [];
  const out: ParsedSkill[] = [];
  let p = tracker.pos;
  while (p < tracker.end) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else { const b1 = buf[p + 1]; if ((b1 & 0x80) !== 0) break; tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f); afterTag = p + 2; }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;
    if (fn === 1 && wt === 2) {
      const [len, n] = readVarint(buf, afterTag);
      const e = readSkillEntry(buf, n, n + Number(len));
      if (e) {
        const uid = '0x' + e.uid.toString(16);
        // Only surface catalogued, player-facing skills. The tracker also holds
        // HIDDEN skills (Vampire Lore, infant milestones, etc.) that STOCK_SKILLS
        // deliberately omits — skip those so they never reach storage/UI.
        if (STOCK_SKILLS[uid]) {
          out.push({ uid, name: STOCK_SKILLS[uid], points: e.points, level: skillLevelFromPoints(uid, e.points) });
        }
      }
      p = n + Number(len);
    } else if (wt === 0) { const [, n] = readVarint(buf, afterTag); p = n; }
    else if (wt === 1) p = afterTag + 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); p = n + Number(l); }
    else if (wt === 5) p = afterTag + 4;
    else break;
  }
  out.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return out;
}

function extractTraitsAndAspiration(
  buf: Uint8Array,
  start: number,
  maxBytes = 200_000,
): { traitIds: bigint[]; aspirationId: bigint | null; enrolledDegree: EnrolledDegree | null; career: SimCareer | null; skills: ParsedSkill[] } {
  const hardEnd = Math.min(buf.length, start + maxBytes);
  const traitIds: bigint[] = [];
  let aspirationId: bigint | null = null;
  let enrolledDegree: EnrolledDegree | null = null;
  let career: SimCareer | null = null;
  let skills: ParsedSkill[] = [];

  let p = start;
  while (p < hardEnd) {
    const b0 = buf[p];
    if (b0 === 0) break;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else {
      const b1 = buf[p + 1];
      if ((b1 & 0x80) !== 0) break; // 3-byte tag — give up
      tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
      afterTag = p + 2;
    }
    const fn = tag >> 3, wt = tag & 7;
    if (fn === 0) break;

    if (fn === 34 && wt === 0) {
      const [v, n] = readVarint(buf, afterTag);
      if (v !== 0n) aspirationId = v;
      p = n;
      continue;
    }

    if (fn === 30 && wt === 2) {
      // SimData.attributes — dive in for f10 (trait_tracker) → f1 (trait_ids).
      const [attrLen, attrStart] = readVarint(buf, afterTag);
      const attrEnd = attrStart + Number(attrLen);
      if (attrEnd > hardEnd) break;
      const trackerHit = findChildField(buf, attrStart, attrEnd, 10, 2);
      if (trackerHit) {
        const idsHit = findChildField(buf, trackerHit.pos, trackerHit.end, 1, 2);
        if (idsHit) {
          // Packed repeated uint64 — concatenation of varints, no tags between.
          let ip = idsHit.pos;
          while (ip < idsHit.end) {
            const [v, n] = readVarint(buf, ip);
            traitIds.push(v);
            if (n === ip) break; // safety against zero-length varints
            ip = n;
          }
        }
      }
      // University-enrollment tracker — attributes.f30 → f1 program / f2 university.
      const uniHit = findChildField(buf, attrStart, attrEnd, 30, 2);
      if (uniHit) {
        const u = readUniversityTracker(buf, uniHit.pos, uniHit.end);
        if (u) enrolledDegree = enrolledDegreeFromUids('0x' + u.program.toString(16), '0x' + u.university.toString(16));
      }
      // Career tracker — attributes.f12 → f2 entries; pick the active job.
      career = pickCareer(readCareerEntries(buf, attrStart, attrEnd));
      skills = readSkills(buf, attrStart, attrEnd);
      p = attrEnd;
      continue;
    }

    // Other field — skip past it
    if (wt === 0) { const [, n] = readVarint(buf, afterTag); p = n; }
    else if (wt === 1) p = afterTag + 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, afterTag); p = n + Number(l); }
    else if (wt === 5) p = afterTag + 4;
    else break;
  }

  return { traitIds, aspirationId, enrolledDegree, career, skills };
}

// The pet species enum lives at f28.f5.f1.f2 (varint). Verified across 40+ pets
// (cats / dogs / horses including mixed-breed and gallery imports):
//   28 = cat, 35 = dog, 3 = horse. Other values (e.g. 60) are small wildlife
//   like foxes; we treat those as generic 'pet'.
function extractPetSpeciesEnum(buf: Uint8Array, start: number, maxBytes = 200_000): bigint | null {
  const hardEnd = Math.min(buf.length, start + maxBytes);
  const f28 = findChildField(buf, start, hardEnd, 28, 2);
  if (!f28) return null;
  const f5 = findChildField(buf, f28.pos, f28.end, 5, 2);
  if (!f5) return null;
  const f1 = findChildField(buf, f5.pos, f5.end, 1, 2);
  if (!f1) return null;
  const f2 = findChildField(buf, f1.pos, f1.end, 2, 0);
  if (!f2) return null;
  const [v] = readVarint(buf, f2.pos);
  return v;
}

const PET_SPECIES_ENUM: Record<number, PetSubtype> = {
  28: 'cat',
  35: 'dog',
  3:  'horse',
};

// Walk top-level fields of a sim record from postF10 looking for f64 (breed
// name string). Tag 64<<3 | 2 = 514 → varint-encoded as 0x82 0x04. Returns the
// breed name string, or null if not found / empty / record bails out.
function extractPetBreed(buf: Uint8Array, start: number, maxBytes = 200_000): string | null {
  const hardEnd = Math.min(buf.length, start + maxBytes);
  let p = start;
  while (p < hardEnd) {
    const b0 = buf[p];
    if (b0 === 0) return null;
    let tag: number; let afterTag: number;
    if ((b0 & 0x80) === 0) { tag = b0; afterTag = p + 1; }
    else {
      const b1 = buf[p + 1];
      if ((b1 & 0x80) !== 0) return null;
      tag = ((b1 & 0x7f) << 7) | (b0 & 0x7f);
      afterTag = p + 2;
    }
    const fieldNum = tag >> 3;
    const wireType = tag & 7;
    if (fieldNum === 0) return null;
    if (fieldNum === 64 && wireType === 2) {
      const [len, lenEnd] = readVarint(buf, afterTag);
      const ln = Number(len);
      if (ln === 0 || ln > 100) return null;
      const slice = buf.slice(lenEnd, lenEnd + ln);
      const name = decodeText(slice);
      // Sanity: breed names are printable ASCII/Latin extended
      if (!/^[\p{L}\p{M}'\-. ]{1,80}$/u.test(name)) return null;
      return name;
    }
    p = afterTag;
    if (wireType === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wireType === 1) p += 8;
    else if (wireType === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wireType === 5) p += 4;
    else return null;
  }
  return null;
}

export function scanFullSimAnchors(buf: Uint8Array, _humanIds: Set<bigint>): ParsedSim[] {
  const results: ParsedSim[] = [];
  const seen = new Set<bigint>();

  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
    let pos = i + 9; // skip 0x09 + 8 bytes (sim ID)

    if (pos >= buf.length || buf[pos] !== 0x11) continue;
    pos += 9;

    if (pos >= buf.length || buf[pos] !== 0x18) continue;
    pos++;
    const [, afterTs] = readVarint(buf, pos);
    pos = afterTs;

    if (pos >= buf.length || buf[pos] !== 0x21) continue;
    const hhIdOffset = pos + 1;
    pos += 9;

    if (pos >= buf.length || buf[pos] !== 0x2a) continue;
    pos++;
    const [firstLen, firstStart] = readVarint(buf, pos);
    if (firstLen < 1n || firstLen > 30n) continue;
    const firstEnd = firstStart + Number(firstLen);
    if (firstEnd > buf.length) continue;
    const firstName = decodeText(buf.slice(firstStart, firstEnd));
    pos = firstEnd;

    if (pos >= buf.length || buf[pos] !== 0x32) continue;
    pos++;
    const [lastLen, lastStart] = readVarint(buf, pos);
    if (lastLen > 30n) continue;
    const lastEnd = lastStart + Number(lastLen);
    if (lastEnd > buf.length) continue;
    const lastName = lastLen > 0n
      ? decodeText(buf.slice(lastStart, lastEnd))
      : '';
    pos = lastEnd;

    if (pos >= buf.length || buf[pos] !== 0x38) continue;
    pos++;
    const [genderRaw, afterGender] = readVarint(buf, pos);
    pos = afterGender;

    if (pos >= buf.length || buf[pos] !== 0x40) continue;
    pos++;
    const [lifestageRaw, afterLifestage] = readVarint(buf, pos);
    pos = afterLifestage;

    // f9 (tag 0x4d, fixed32) — skip 5 bytes (tag + 4-byte value)
    if (pos >= buf.length || buf[pos] !== 0x4d) continue;
    pos += 5;

    // f10 (tag 0x50, varint) — the PET DISCRIMINATOR.
    // Real pets have f10 = 0; humans always have f10 > 0 (funds or similar
    // starter value). Verified across two saves with 9 confirmed pets + 15
    // confirmed humans including single-name NPCs (Baby Ariel, Kylo Ren etc.)
    if (pos >= buf.length || buf[pos] !== 0x50) continue;
    pos++;
    const [f10Raw, afterF10] = readVarint(buf, pos);
    pos = afterF10;

    // Validate name plausibility (filters out coincidental anchor matches in
    // unrelated binary data).
    if (!firstName || firstName.length < 1) continue;
    if (firstName.length > 30) continue;
    // Allow any printable UTF-8 character in names (Sims 4 supports non-ASCII)
    if (!/^[\p{L}][\p{L}\p{M}'\-. ]{0,28}$/u.test(firstName)) continue;
    if (lastName.length > 0 && !/^[\p{L}\p{M}'\-. ]{0,28}$/u.test(lastName)) continue;
    if (firstName.includes('_') || lastName.includes('_')) continue;

    const simId = readFixed64LE(buf, i + 1);
    if (simId === 0n || simId < 0x10000n) continue;
    const hhId = readFixed64LE(buf, hhIdOffset);

    if (seen.has(simId)) continue;
    seen.add(simId);

    const gender: ParsedGender = genderRaw === 4096n ? 'male'
      : genderRaw === 8192n ? 'female'
      : 'female';

    // Pet discriminator: f10 = 0 reliably signals a pet across saves.
    // Humans always have f10 > 0 (funds/starter value). Verified across two
    // saves with 9 confirmed pets + 15 confirmed humans including single-name
    // NPCs like Baby Ariel, Kylo Ren, Mayor Whiskers (the lone single-name
    // pet — distinguished by f10 = 0).
    const isPet = f10Raw === 0n;

    const lifestage: ParsedLifestage = isPet
      ? 'pet'
      : (HUMAN_LIFESTAGE_MAP[Number(lifestageRaw)] ?? 'adult');

    // Scan forward from this point for f30 (occult tracker). Pets don't have
    // occult/ghost status, so skip the scan for them.
    const { occult, isGhost } = isPet
      ? { occult: 'none' as const, isGhost: false }
      : extractOccultFromSim(buf, pos);

    // For pets, the species enum lives at f28.f5.f1.f2 (28=cat, 35=dog, 3=horse).
    // Fall back to breed-name matching only if the enum is missing.
    const petBreed = isPet ? extractPetBreed(buf, pos) : null;
    let petSubtype: PetSubtype = 'pet';
    if (isPet) {
      const enumVal = extractPetSpeciesEnum(buf, pos);
      if (enumVal !== null) {
        petSubtype = PET_SPECIES_ENUM[Number(enumVal)] ?? 'pet';
      } else {
        petSubtype = petSubtypeFromBreed(petBreed);
      }
    }

    // CAS-picked traits + current aspiration. Same forward scan range as the
    // occult walk. Pets have no aspiration; skip the extract entirely for them
    // (traits are technically present but not surfaced).
    const { traitIds, aspirationId, enrolledDegree, career, skills } = isPet
      ? { traitIds: [], aspirationId: null, enrolledDegree: null, career: null, skills: [] }
      : extractTraitsAndAspiration(buf, pos);

    results.push({
      id: simId,
      firstName,
      lastName,
      gender,
      lifestage,
      species: isPet ? 'pet' : 'human',
      petSubtype,
      petBreed,
      occult,
      isGhost,
      deathCause: isGhost ? deathCauseFromTraits(traitIds) : null,
      householdId: hhId === 0n ? null : hhId,
      traitIds,
      aspirationId,
      enrolledDegree,
      career,
      skills,
    });

    // Advance past this record's header to avoid double-counting
    i = pos - 1;
  }

  return results;
}
