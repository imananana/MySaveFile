/**
 * Save parser entry point.
 *
 * The DBPF / RefPack format readers live in dbpf.ts + refpack.ts. The actual
 * per-entity protobuf walkers live in ./parser/*.ts, one file per entity. This
 * file's job is to:
 *
 *   1. Decompress every 0x0d (master state) and 0x06 (per-lot) resource.
 *   2. Run each per-entity scanner against the master buffers.
 *   3. Cross-reference results (sim → household, lot tuning ID → lot type).
 *   4. Return one consolidated `SaveData` object.
 *
 * Public functions:
 *   parseSaveData          — main entry, called by GameImport.tsx
 *   parseLotChunk          — exposed for unit tests + diagnostics
 *   detectLotTypeFromLDNB  — exposed for unit tests + diagnostics
 *   VENUE_TUNING_MAP       — exposed for diagnostics (coverage reports)
 *   HIDDEN_VENUE_TUNINGS   — exposed for diagnostics
 */
import { DbpfResource } from './dbpf';
import { decompressRefpack } from './refpack';
import { findLDField, readVarint, readTag, decodeText } from './parser/protobuf';
import { scanHumanSimStubs, scanFullSimAnchors } from './parser/sims';
import { scanFamily, scanPairRelationships, REL_BITS, FAMILY_BITS } from './parser/family';
import { scanGenealogy, GENE_REL } from './parser/genealogy';
import { PREMADE_ANCESTORS } from '../data/premadeAncestors';
import type { ParsedFamilyFacts } from './parser/types';
import { scanLots, parseLotChunk, detectLotTypeFromLDNB, VENUE_TUNING_MAP, HIDDEN_VENUE_TUNINGS } from './parser/lots';
import { scanHouseholdRecords } from './parser/households';
import { extractSaveOwnerAccount } from './parser/provenance';
import { scanClubs } from './parser/clubs';
import { scanHolidays, scanSeasonLengthOption } from './parser/holidays';
import { scanSmallBusinesses, renownRankFromTraits, alignmentFromTraits } from './parser/smallBusinesses';
import { scanDynasties } from './parser/dynasties';
import { scanCustomVenues, scanSavedPresets } from './parser/customVenues';
import { resolveDynastyRole } from '../data/stockDynasties';
import type {
  ParsedSim,
  ParsedLot,
  ParsedHousehold,
  ParsedClub,
  ParsedHoliday,
  ParsedSmallBusiness,
  ParsedDynasty,
  ParsedCustomVenue,
  ParsedVenueRole,
  SaveData,
} from './parser/types';

// Re-exports for back-compat with existing imports across the app + diagnostics
export type {
  ParsedGender,
  ParsedLifestage,
  ParsedSpecies,
  ParsedOccult,
  ParsedSim,
  ParsedLot,
  ParsedHousehold,
  ClubHangoutSetting,
  ParsedClub,
  ParsedSeason,
  ParsedHoliday,
  ParsedSmallBusiness,
  ParsedDynasty,
  ParsedDynastyMember,
  SaveData,
} from './parser/types';
export { parseLotChunk, detectLotTypeFromLDNB, VENUE_TUNING_MAP, HIDDEN_VENUE_TUNINGS };

export function parseSaveData(resources: DbpfResource[]): SaveData {
  // 1. Decompress and scan the master 0x0d resource(s)
  const buffers: Uint8Array[] = [];
  for (const r of resources.filter((r) => r.type === 0x0d)) {
    try {
      const data = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
      buffers.push(data);
    } catch { /* skip */ }
  }

  // 2. Build the human sim ID set from 0x0a stubs (for pet/human discrimination)
  const humanIds = new Set<bigint>();
  for (const buf of buffers) {
    try {
      for (const id of scanHumanSimStubs(buf)) humanIds.add(id);
    } catch { /* skip */ }
  }

  // 3. Scan full sim records (0x32 anchor) for both humans and pets
  const allSims = new Map<bigint, ParsedSim>();
  for (const buf of buffers) {
    try {
      for (const sim of scanFullSimAnchors(buf, humanIds)) {
        if (!allSims.has(sim.id)) allSims.set(sim.id, sim);
      }
    } catch { /* skip */ }
  }

  // 3b. Owner = dominant sim last-saver account (f23), for household provenance.
  let ownerAccountId: bigint | null = null;
  for (const buf of buffers) {
    try { ownerAccountId = extractSaveOwnerAccount(buf); } catch { /* skip */ }
    if (ownerAccountId) break;
  }

  // 4. Scan lot descriptors (0x3a outer)
  const lotMap = new Map<bigint, ParsedLot>();
  for (const buf of buffers) {
    try {
      for (const [id, lot] of scanLots(buf)) {
        if (!lotMap.has(id)) lotMap.set(id, lot);
      }
    } catch { /* skip */ }
  }

  // 5. Lot type detection — scan 0x06 chunks for venue tuning IDs.
  //    Map lotId low-32 → 0x06 chunk; decompress, extract LDNB, find tuning ID.
  const lots = [...lotMap.values()];
  const lotsByInstLo = new Map<number, ParsedLot[]>();
  for (const l of lots) {
    const instLo = Number(l.id & 0xffffffffn);
    if (!lotsByInstLo.has(instLo)) lotsByInstLo.set(instLo, []);
    lotsByInstLo.get(instLo)!.push(l);
  }

  // Also track detection by field5 so multi-unit sub-units inherit from a sibling
  const detectedByField5 = new Map<string, string>();

  for (const r of resources.filter((r) => r.type === 0x06 && r.compType === 0xffff)) {
    const targets = lotsByInstLo.get(r.instLo);
    if (!targets) continue;
    try {
      const raw = decompressRefpack(r.data);
      const parsed = parseLotChunk(raw);
      if (!parsed) continue;
      const tuningId = detectLotTypeFromLDNB(parsed.ldnb);
      if (tuningId === null) continue;
      const key = '0x' + tuningId.toString(16);
      const type = VENUE_TUNING_MAP[key];
      if (!type) continue;
      // Apply to any lot matching this instLo + full ID
      for (const l of targets) {
        if (l.id === parsed.lotId) {
          l.detectedType = type;
          if (l.field5 !== null) detectedByField5.set(l.field5.toString(), type);
        }
      }
    } catch { /* skip */ }
  }

  // Inheritance pass: lots that share a field5 with a detected sibling get the
  // sibling's type (multi-unit buildings split into sub-unit lots).
  for (const l of lots) {
    if (l.detectedType !== null) continue;
    if (l.field5 === null) continue;
    const inherited = detectedByField5.get(l.field5.toString());
    if (inherited) l.detectedType = inherited;
  }

  // 6. Scan households + extract sim rosters
  const households: ParsedHousehold[] = [];
  const hhSeen = new Set<bigint>();
  for (const buf of buffers) {
    try {
      for (const hh of scanHouseholdRecords(buf)) {
        if (!hhSeen.has(hh.id)) {
          hhSeen.add(hh.id);
          households.push(hh);
        }
      }
    } catch { /* skip */ }
  }

  // 7. Cross-reference sim records' householdId to populate household.simIds
  //    where the household's f11.f1 packed roster missed something. Prefer the
  //    f11 list when present (canonical), fall back to sim records' hhId field.
  for (const hh of households) {
    if (hh.simIds.length === 0) {
      // Fall back: gather all sims whose householdId matches this hh
      for (const sim of allSims.values()) {
        if (sim.householdId === hh.id) hh.simIds.push(sim.id);
      }
    }
  }

  // 8. Scan clubs (lives in SaveSlotData → GameplaySaveSlotData → PersistableClubService).
  const clubs: ParsedClub[] = [];
  const clubSeen = new Set<bigint>();
  for (const buf of buffers) {
    try {
      for (const c of scanClubs(buf)) {
        if (!clubSeen.has(c.id)) {
          clubSeen.add(c.id);
          clubs.push(c);
        }
      }
    } catch { /* skip */ }
  }

  // 9. Scan holidays (calendars + per-holiday customization records).
  const holidays: ParsedHoliday[] = [];
  const holidaySeen = new Set<string>();
  for (const buf of buffers) {
    try {
      for (const h of scanHolidays(buf)) {
        // De-dup by holidayType + day + season (different calendars list the
        // same holiday with different days; we already filtered to one calendar
        // per buffer but multiple 0x0d buffers would still collide).
        const key = `${h.holidayType}|${h.day}|${h.season}`;
        if (!holidaySeen.has(key)) {
          holidaySeen.add(key);
          holidays.push(h);
        }
      }
    } catch { /* skip */ }
  }

  // 9b. Scan dynasties (SaveSlotData → GameplaySaveSlotData → field 60).
  const dynasties: ParsedDynasty[] = [];
  const dynastySeen = new Set<bigint>();
  for (const buf of buffers) {
    try {
      for (const d of scanDynasties(buf)) {
        if (!dynastySeen.has(d.id)) {
          dynastySeen.add(d.id);
          dynasties.push(d);
        }
      }
    } catch { /* skip */ }
  }
  // Resolve each member's role from their FULL traits (the stored sim.traitIds
  // are filtered to the CAS catalog and drop the HIDDEN dynasty role traits).
  for (const d of dynasties) {
    for (const m of d.members) {
      const sim = allSims.get(m.simId);
      m.role = sim ? resolveDynastyRole(sim.traitIds.map((t) => '0x' + t.toString(16))) : null;
    }
  }

  // 10. Save name — stored at SaveSlotData.field 9 in the 0x0d resource.
  //     (Different from the file name like Slot_10312032.save; this is the
  //     human-readable name shown in the game's load-save list.)
  let saveName: string | null = null;
  for (const buf of buffers) {
    try {
      const slot = findLDField(buf, 2);
      if (!slot) continue;
      // Walk SaveSlotData top-level fields looking for field 9 (string).
      let p = 0;
      while (p < slot.length) {
        const [fn, wire, afterTag] = readTag(slot, p);
        p = afterTag;
        if (wire === 0) { const [, n] = readVarint(slot, p); p = n; }
        else if (wire === 1) p += 8;
        else if (wire === 2) {
          const [l, n] = readVarint(slot, p);
          const ln = Number(l);
          if (fn === 9) {
            saveName = decodeText(slot.slice(n, n + ln));
            break;
          }
          p = n + ln;
        } else if (wire === 5) p += 4;
        else break;
      }
      if (saveName) break;
    } catch { /* skip */ }
  }

  // 11. Scan small businesses (player-owned, post-Businesses & Hobbies pack).
  const smallBusinesses: ParsedSmallBusiness[] = [];
  const sbSeen = new Set<bigint>();
  for (const buf of buffers) {
    try {
      for (const sb of scanSmallBusinesses(buf)) {
        if (!sbSeen.has(sb.id)) {
          sbSeen.add(sb.id);
          smallBusinesses.push(sb);
        }
      }
    } catch { /* skip */ }
  }
  // Renown rank + alignment aren't in the business record — they're hidden traits
  // on the owner sim (trait_SmallBusiness_Rank_N / _Reputation_N). Resolve them
  // now that all sims are parsed.
  for (const sb of smallBusinesses) {
    if (sb.ownerSimId == null) continue;
    const owner = allSims.get(sb.ownerSimId);
    if (owner) {
      sb.renownRank = renownRankFromTraits(owner.traitIds);
      // A never-configured business carries no reputation trait, but the game
      // displays it as Neutral (the universal default — confirmed in-game on
      // Slot_00000007's NPC businesses; the trait is only persisted once
      // alignment is engaged, e.g. Pastry Shop's explicit Neutral 0x5be15). We
      // only default when the owner's traits were actually read; an unresolved
      // owner stays null rather than asserting Neutral without evidence.
      sb.alignment = alignmentFromTraits(owner.traitIds) ?? 4;
    }
  }

  // 12. Family facts (humans only) from the largest 0x0d blob — per-sim
  // pointers + ancestor slots, plus couple/ex edges from the relationship
  // service records. Parent ids are NOT filtered to known sims: dangling ids
  // are the in-game "Unknown" ancestors and become stub rows at import.
  const familyFacts: ParsedFamilyFacts = { bySim: {}, pairEdges: [] };
  const master = buffers.reduce<Uint8Array | null>((best, b) => (!best || b.length > best.length ? b : best), null);
  if (master) {
    try {
      const hx = (id: bigint) => '0x' + id.toString(16);
      const humanSimIds = new Set([...allSims.values()].filter((s) => s.species === 'human').map((s) => s.id));
      const raw = scanFamily(master, humanSimIds);
      // Reconstruct the FULL pedigree, not just immediate parents. The f14
      // ahnentafel stores ancestors by generation index (0/1 = parents, ≥2 =
      // grandparents and up). In ahnentafel numbering the node at index i is a
      // parent of the node at index floor((i-2)/2) — and idx 0/1 are parents of
      // the subject. Walking that gives every parent→child link in the tree,
      // INCLUDING through record-less "Unknown" middles (e.g. a grandparent who
      // outlives a deleted middle generation — Conor Tompkins → Unknown →
      // Vanessa). Previously we kept only idx 0/1, silently dropping every
      // grandparent the save actually stores.
      const pedParents = new Map<string, Set<string>>();
      const addParent = (childHex: string, parentHex: string) => {
        if (childHex === parentHex) return;
        let set = pedParents.get(childHex);
        if (!set) pedParents.set(childHex, (set = new Set()));
        set.add(parentHex);
      };
      for (const [id, fam] of raw) {
        const byIndex = new Map<number, bigint>();
        for (const a of fam.ancestors) byIndex.set(a.index, a.id);
        for (const a of fam.ancestors) {
          if (a.index <= 1) addParent(hx(id), hx(a.id));           // parent of the subject
          else {
            const child = byIndex.get(Math.floor((a.index - 2) / 2)); // parent of a lower ancestor
            if (child !== undefined) addParent(hx(child), hx(a.id));
          }
        }
      }
      // Subjects (sims with a record) carry pedigree parents + couple pointers.
      for (const [id, fam] of raw) {
        familyFacts.bySim[hx(id)] = {
          parents: [...(pedParents.get(hx(id)) ?? [])],
          spouse: fam.spouseId !== null ? hx(fam.spouseId) : null,
          engaged: fam.engagedId !== null ? hx(fam.engagedId) : null,
          partner: fam.partnerId !== null ? hx(fam.partnerId) : null,
        };
      }
      // Record-less middle ancestors (the "Unknown" stubs) get a facts entry too
      // so the import can bridge UP through them to a present grandparent.
      for (const [childHex, parents] of pedParents) {
        if (!familyFacts.bySim[childHex]) {
          familyFacts.bySim[childHex] = { parents: [...parents], spouse: null, engaged: null, partner: null };
        }
      }
      // Per-sim parent-slot set (idx 0/1, INCLUDING dangling/Unknown ids) — the
      // graph already derives siblings through any shared parent slot, even a
      // record-less stub (the Newson kids share one Unknown). Used to suppress
      // redundant sibling edges below.
      const parentSlots = new Map<bigint, Set<bigint>>();
      for (const [id, fam] of raw) {
        parentSlots.set(id, new Set(fam.ancestors.filter((a) => a.index === 0 || a.index === 1).map((a) => a.id)));
      }
      const sharesParentSlot = (x: bigint, y: bigint): boolean => {
        const px = parentSlots.get(x); const py = parentSlots.get(y);
        if (!px || !py) return false;
        for (const p of px) if (py.has(p)) return true;
        return false;
      };

      const seenPair = new Set<string>();
      for (const pr of scanPairRelationships(master, humanSimIds)) {
        const [a, b] = pr.simA < pr.simB ? [pr.simA, pr.simB] : [pr.simB, pr.simA];
        const push = (relType: 'partner' | 'ex_spouse' | 'ex_partner' | 'ex_fiance' | 'sibling' | 'half_sibling') => {
          const key = `${a}|${b}|${relType}`;
          if (seenPair.has(key)) return;
          seenPair.add(key);
          familyFacts.pairEdges.push({ a: hx(a), b: hx(b), relType });
        };
        if (pr.bits.includes(REL_BITS.significantOther)) push('partner');
        if (pr.bits.includes(REL_BITS.divorced)) push('ex_spouse');
        if (pr.bits.includes(REL_BITS.brokenUp)) push('ex_partner');
        if (pr.bits.includes(REL_BITS.brokenUpEngaged)) push('ex_fiance');
        // Blood-/half-sibling bits survive parent-record culling. We emit them
        // ONLY when the pair shares NO parent slot — pairs that share a parent
        // (incl. a record-less Unknown stub) are left to parent-derivation,
        // which also types them, so the two sources stay disjoint by
        // construction (no dedup needed). full (8802) wins over half (468542)
        // if both somehow appear. See FAMILY_BITS for the step-sibling caveat.
        if (!sharesParentSlot(a, b)) {
          if (pr.bits.includes(FAMILY_BITS.sibling)) push('sibling');
          else if (pr.bits.includes(FAMILY_BITS.halfSibling)) push('half_sibling');
        }
      }

      // 12b. Modern family tree (Feb-2026 patch). When the genealogy record
      // stream is present it's the authoritative graph the in-game tree reads,
      // and it carries the premade DECEASED ANCESTORS (Cordelia Capp, Pranav
      // Kunal, …) that the f14 ahnentafel omits — fixing the empty-pedigree
      // case for premade dynasties. We prefer it per-sim over f14 and inject
      // the ancestors as deceased tree-only sims. Pre-patch saves have no
      // records, so this is a no-op and the f14 facts above stand.
      const gen = scanGenealogy(master, humanSimIds);
      if (gen.records.size > 0) {
        // Premade ancestor nodes → synthetic deceased sims, named/gendered from
        // the template catalog (nameless or uncatalogued node → "Unknown").
        for (const rec of gen.records.values()) {
          if (rec.firstName || allSims.has(rec.id)) continue;  // living sim, already parsed
          const tplId = gen.ancestorTemplate.get(rec.id);
          const cat = tplId !== undefined ? PREMADE_ANCESTORS['0x' + tplId.toString(16)] : undefined;
          const [first, ...rest] = (cat?.name ?? 'Unknown').split(' ');
          allSims.set(rec.id, {
            id: rec.id, firstName: first, lastName: rest.join(' '),
            gender: cat?.gender ?? 'female', lifestage: 'elder', species: 'human',
            petSubtype: 'pet', petBreed: null, occult: 'none',
            isGhost: true, deathCause: cat?.deathCause ?? null, householdId: null,
            traitIds: [], aspirationId: null, enrolledDegree: null, career: null, skills: [],
          });
        }
        // Parent + spouse from the typed edges (relType 2 = the other sim is MY
        // parent; 1 = the other is MY child — recorded on both ends, so parent
        // direction is captured either way; 4 = spouse).
        const genParents = new Map<bigint, Set<bigint>>();
        const genSpouse = new Map<bigint, bigint>();
        const addParent = (child: bigint, parent: bigint) => {
          const s = genParents.get(child); if (s) s.add(parent); else genParents.set(child, new Set([parent]));
        };
        for (const rec of gen.records.values()) for (const e of rec.edges) {
          if (e.relType === GENE_REL.PARENT) addParent(rec.id, e.other);
          else if (e.relType === GENE_REL.CHILD) addParent(e.other, rec.id);
          else if (e.relType === GENE_REL.SPOUSE && !genSpouse.has(rec.id)) genSpouse.set(rec.id, e.other);
        }
        // Override bySim per sim that has a genealogy record (genealogy wins;
        // f14 still covers sims with no record — singletons with no kin).
        for (const rec of gen.records.values()) {
          const prev = familyFacts.bySim[hx(rec.id)];
          familyFacts.bySim[hx(rec.id)] = {
            parents: [...(genParents.get(rec.id) ?? [])].map(hx),
            spouse: genSpouse.has(rec.id) ? hx(genSpouse.get(rec.id)!) : (prev?.spouse ?? null),
            engaged: prev?.engaged ?? null,
            partner: prev?.partner ?? null,
          };
        }
      }
    } catch { /* family facts are additive — never fail the whole parse */ }
  }

  // 13. Custom venues / getaways (EP20) — on-lot field-24 records, plus saved
  // schedule presets (field 58), both in the master blob.
  let customVenues: ParsedCustomVenue[] = [];
  let savedVenuePresets: ParsedCustomVenue[] = [];
  let savedRolePresets: ParsedVenueRole[] = [];
  if (master) {
    try { customVenues = scanCustomVenues(master); } catch { /* additive — never fail the parse */ }
    try { const p = scanSavedPresets(master); savedVenuePresets = p.schedules; savedRolePresets = p.roles; } catch { /* additive */ }
  }

  // Active season length (GameplayOptions.season_length): NORMAL(0)→1wk, LONG(1)→2wk, VERY_LONG(2)→4wk.
  let seasonLengthOption: 0 | 1 | 2 = 0;
  for (const buf of buffers) {
    try { const o = scanSeasonLengthOption(buf); if (o) { seasonLengthOption = o; break; } } catch { /* skip */ }
  }
  const seasonLengthWeeks = ({ 0: 1, 1: 2, 2: 4 } as const)[seasonLengthOption];

  return { saveName, ownerAccountId, sims: [...allSims.values()], lots, households, clubs, holidays, smallBusinesses, dynasties, customVenues, savedVenuePresets, savedRolePresets, familyFacts, seasonLengthWeeks };
}
