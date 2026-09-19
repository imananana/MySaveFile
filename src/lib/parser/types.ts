/**
 * Type definitions for the save parser's public output (`SaveData`).
 *
 * The shape of these interfaces is what GameImport.tsx and the rest of the
 * app consume — keep them stable. Anything renamed here is a breaking change
 * for the importer pipeline.
 */
import type { PetSubtype } from '../../data/petBreeds';
import type { CareerKind } from '../../data/stockCareers';

export type ParsedGender = 'male' | 'female';
export type ParsedLifestage =
  | 'newborn' | 'infant' | 'toddler' | 'child' | 'teen' | 'youngAdult' | 'adult' | 'elder' | 'pet';
export type ParsedSpecies = 'human' | 'pet';
export type ParsedOccult = 'none' | 'vampire' | 'alien' | 'mermaid' | 'spellcaster' | 'werewolf' | 'fairy';

export interface ParsedSim {
  id: bigint;
  firstName: string;
  lastName: string;
  gender: ParsedGender;
  lifestage: ParsedLifestage;
  species: ParsedSpecies;
  petSubtype: PetSubtype; // 'pet' for humans + breed-unknown pets, otherwise cat/dog/horse
  petBreed: string | null; // raw breed name from f64, e.g. "Afghan Hound"; null if absent
  occult: ParsedOccult;
  isGhost: boolean;                 // deceased (carries the f54 death marker)
  deathCause: string | null;        // how a deceased sim died, e.g. "Cowplant"; null if alive or cause unmapped
  householdId: bigint | null;
  // Tuning-ID extracts. Names resolve later via STOCK_TRAITS / STOCK_ASPIRATIONS
  // maps; unknown IDs round-trip as raw bigints. Currently extracted but not
  // surfaced in the UI — kept on the parser output so future UI work doesn't
  // need a parser re-pass.
  traitIds: bigint[];               // all traits the sim has (CAS + earned + emotional). Filter at display time.
  aspirationId: bigint | null;      // SimData.primary_aspiration (the CAS-picked long-term aspiration)
  // Currently-enrolled university degree (Discover University), from
  // attributes.f30.f30; null when not enrolled (cleared to 0 once they leave
  // university). Earned degrees are NOT here — they're traits in traitIds.
  enrolledDegree: { subject: string; school: 'Britechester' | 'Foxbury'; distinguished: boolean } | null;
  // Active career (attributes.f12.f1), picked from the tracker entries; null
  // when the sim has no current job. Earned/completed careers are not retained.
  career: { uid: string; name: string; kind: CareerKind; level: number } | null;
  // Skills (attributes.f13.f1 repeated): each skill the sim has any progress in.
  // `points` is the raw stored cumulative value; `level` is derived via the
  // per-category curve (stockSkillCurves). Hidden/occult skills resolve name
  // only if catalogued. Sorted by level desc then name.
  skills: { uid: string; name: string; points: number; level: number }[];
}

export interface ParsedLot {
  id: bigint;
  name: string;            // current name (custom if renamed)
  field5: bigint | null;   // stable EA canonical lot ID across saves
  detectedType: string | null; // planner lot type string, or null if undetectable
}

export interface ParsedHousehold {
  id: bigint;
  name: string;
  description: string;
  simIds: bigint[];
  lotId: bigint | null;
  // Household funds (Simoleons). HouseholdData.field 5. Currently extracted
  // but not surfaced anywhere in the UI — kept on the parser output so a
  // future "budget" feature doesn't need a parser re-pass.
  money: bigint | null;
  // Whether the household is "played" (player-managed) vs an unplayed/NPC/townie
  // household. HouseholdData.field 31 (1 = played). Confirmed against Slot_00000007
  // (exactly Kitchen/Landgraab/Ward = f31:1, all 163 others = 0, matching the
  // game's Manage Households grouping). Used to split played vs NPC and cut
  // background-sim noise. (Confirmed on one save — worth a second-save cross-check.)
  isPlayed: boolean;
  // --- provenance (household origin) ---
  // HouseholdData.f9 — the player-AUTHORSHIP marker. true iff the save owner created,
  // CAS-edited, moved a sim into, or played this household; false on untouched EA
  // premades, generated townies, and spawn-slop. Validated against ground truth across
  // saves (Perfect=labeled, Aneleya=curated, staged Takahashi/Kern tests). This is the
  // primary "Yours vs EA" axis — see classifyHousehold() in provenance.ts.
  playerEngaged: boolean;
  // HouseholdData.f21 — gallery/CAS creator NAME (your account when you build from
  // scratch, even offline; another creator when downloaded). null if unstamped (untouched
  // EA/townie). Attribution detail only — strict subset of playerEngaged, never bucketing.
  creatorName: string | null;
  // HouseholdData.f20 — creator ACCOUNT id (pairs with creatorName). null if 0/unstamped.
  // Compare to SaveData.ownerAccountId to tell "your own build" from "downloaded from X".
  creatorAccountId: bigint | null;
}

/** Household origin classification (computed via classifyHousehold in provenance.ts). */
export type HouseholdOriginBucket = 'yours' | 'ea' | 'mod';
export interface HouseholdOrigin {
  bucket: HouseholdOriginBucket;
  // sub-label: yours → 'built' | 'adopted-ea' | 'downloaded';
  //            ea → 'premade' | 'service' | 'townie';  mod → 'mod-gen'
  sub: string;
  creator: string | null;   // gallery creator name when 'downloaded', else null
  isOwnerBuild: boolean;     // creatorAccountId === SaveData.ownerAccountId
  roleNpc: string | null;    // service role name if a member is a current NPC role (e.g. "Grim Reaper")
}

export type ClubHangoutSetting = 'none' | 'venue' | 'lot';

export interface ParsedClub {
  id: bigint;
  name: string | null;           // null when the save doesn't store one (default Get Together clubs)
  description: string;           // empty string if not set
  iconInstance: string | null;   // lowercase hex of icon ResourceKey's instance — matches /club-icons/<hex>.png
  clubSeed: string | null;       // hex of the seed ResourceKey instance — used to look up the default name
  leaderSimId: bigint | null;
  memberSimIds: bigint[];
  inviteOnly: boolean;            // club record f5: false = Open Invitation, true = Invite Only
  hangoutSetting: ClubHangoutSetting;
  hangoutZoneId: bigint | null;  // full 64-bit zone id (setting='lot'); map to planner lot_key via ParsedLot.id
  hangoutVenueTypeId: string | null; // venue tuning id hex (setting='venue', club f8.f3); resolve via VENUE_TUNING_MAP
  // Membership requirements (club record f9). Same Sim-filter system as venue
  // role criteria, so it reuses VenueCriterion + the venueLabels display helpers.
  criteria: VenueCriterion[];
  // Encouraged/discouraged activities with their "To Whom" target (club f10).
  rules: ParsedClubRule[];
}

// "To Whom" target of a club rule (f10.f3). Absent ⇒ everyone.
export type ParsedClubTarget =
  | { kind: 'anyone' }
  | { kind: 'age'; ages: number[] }            // age bitmask values (8=teen, 16=YA, ...)
  | { kind: 'club'; clubId: string }           // a specific club (its id as lowercase hex — matches Club.sourceId)
  | { kind: 'other'; rawCategory: number };    // some other filter category, not yet decoded to a label

export interface ParsedClubRule {
  encouraged: boolean;     // true = encouraged, false = discouraged
  activityId: string;      // club interaction-group id ('0x…')
  activity: string;        // resolved name via stockClubActivities (fallback raw)
  target: ParsedClubTarget;
}

export type ParsedSeason = 'Summer' | 'Fall' | 'Winter' | 'Spring';

export interface ParsedHoliday {
  holidayType: bigint;        // EA tuning ID — used to look up stock name/icon defaults
  name: string | null;        // stored when user has customized; null for pure stock
  iconInstance: string | null;// ResourceKey instance hex when stored; null for pure stock
  day: number;                // 1-indexed day within the season (1..season_length), at the save's ACTIVE length
  season: ParsedSeason;
  // The game pre-computes a calendar for every season length; this holiday's
  // placement in each, keyed by plan weeks ('1'|'2'|'4' = 7/14/28-day). Lets the
  // planner re-scale imported holidays exactly like the game when the plan
  // length changes. All 1-indexed (matching `day`). Present for every parsed
  // (imported) holiday; hand-made planner holidays have none.
  scaledDates: Record<string, { day: number; season: ParsedSeason }>;
  traditions: bigint[];       // tradition tuning IDs (kept raw for round-trip)
  traditionNames: string[];   // resolved display names (stockTraditions), parallel to `traditions`; raw "Tradition 0x…" when uncatalogued
  timeOff: boolean;           // "Day off Work/School" (record f4/f5, or stock-tuning default) — single in-game toggle sets both
  decorationPreset: string | null; // decoration-theme preset id (decimal string; record f7 or stock default); null = None
}

// One "Add Target Customer Criteria" entry (SmallBusinessData.f21.f4 repeated).
// Same Sim-filter machinery as club/venue criteria (each value term carries the
// 796721156 filter base), but with two small-biz-only flags — `required` (the
// "Make Selected Criteria Required" toggle, which actually VARIES here, unlike
// clubs/venues where membership criteria are always required) and `caregiverStays`
// (the "Caregiver Stays at Business" toggle, only meaningful for Supervised
// Customer). Category 8 = "Supervised Customer" is small-biz-only; other
// categories reuse the club enum (5=age, 0=skill, 3=career, …). All confirmed via
// Slot_00000007 fixtures (see project_parser_completeness).
export interface SmallBusinessCustomerCriterion {
  category: VenueCriterion['type'] | 'supervised'; // 'supervised' = Supervised Customer (small-biz-only)
  rawCategory: number;       // raw category code (f4.f1)
  values: number[];          // selected values (repeated f2). age=bitmask; supervised=0-idx enum
  required: boolean;         // "Make Selected Criteria Required" (f4.f5)
  caregiverStays: boolean;   // "Caregiver Stays at Business" (f4.f6)
}

export interface ParsedSmallBusiness {
  id: bigint;                       // outer record's business_id (fixed64)
  name: string;                     // empty string if not stored
  description: string;
  iconInstance: string | null;      // picked icon's ResourceKey instance hex — matches /small-business-icons/<hex>.png
  ownerSimId: bigint | null;        // null if no owner
  // Hired employees (up to 3). Derived from the staff roster at
  // SmallBusinessData.f21.f8 (repeated, each f1 = a staff sim id) with the owner
  // removed. Confirmed via Slot_00000007 (roster grew owner→+Fatima→+Liberty per
  // hire). Order is hire order.
  employeeSimIds: bigint[];
  // Lot(s) the business operates on. A small business can span MULTIPLE lots —
  // stored as a packed fixed64 array at SmallBusinessData.f21.f14 (confirmed via
  // Slot_00000007: Crick Cabana + Streamlet Single). Each is a 64-bit zone id;
  // map to planner lot_key via ParsedLot.id. Empty when none assigned.
  lotIds: bigint[];
  // Offered customer activities (SmallBusinessData.f21.f3 repeated, same
  // interaction-group system as club rules) → resolved via the club activity
  // catalog, deduped. Excludes the game-managed ticket-kiosk behavior (instance
  // 0x5f108, EA-named "**DEBUG**") that the game appends here once per fee
  // reconfigure — not a user pick (confirmed via fee-mode diffs, Slot_00000007).
  // Owner-trait PERKS are separate (see stockBusinessPerks).
  activities: { id: string; name: string }[];
  // Target customer criteria (SmallBusinessData.f21.f4 repeated) — who the
  // business is set to serve, with required + caregiver flags.
  customerCriteria: SmallBusinessCustomerCriterion[];
  // Entrance/hourly fee MODE (SmallBusinessData.f21.f1.f3). Confirmed via
  // single-variable diffs on Slot_00000007: 0=Disabled, 1=Hourly, 2=One-Time.
  // CAVEAT: a never-configured business also stores 0 (the game UI presents that
  // factory default as "One-Time"), so 0 is ambiguous between explicit-Disabled
  // and never-touched. The fee AMOUNT is not stored anywhere in the save — it's
  // static/computed (lot value / reputation), so we don't surface it.
  feeMode: 'disabled' | 'hourly' | 'one-time' | 'unknown';
  // Price modifier as a percentage: -50, -25, 0, 50, 100. Derived from the
  // multiplier at SmallBusinessData.f3 (1.0=+0%, 2.0=+100%); endpoints 1.0/2.0
  // confirmed, intermediates follow 1 + pct/100. Defaults to 0 when unset.
  priceModifierPct: number;
  // Renown rank (star level, 0–5). The rank is NOT stored in the business record
  // — it's carried by the OWNER sim as a hidden trait_SmallBusiness_Rank_N (B&H
  // tuning), so it's resolved by joining ownerSimId → that sim's traitIds at
  // SaveData assembly. null when owner is unknown or has no rank trait. Confirmed
  // via Slot_00000007 (Messiah Kitchen = Rank_5). NOTE: the trait is per-owner,
  // so if one sim owned multiple businesses this couldn't distinguish them.
  renownRank: number | null;
  // Earned business perk points (SmallBusinessData.f21.f2 entry keyed 0x1F001).
  // Confirmed by value: rank-up loot grants 2/2/2/3/3 per the rank tuning →
  // 12 at 5★, and 2 at 1★ as observed in-game. Defaults to 0.
  perkPoints: number;
  // Business alignment level (1–7): 1=Nefarious, 2=Underground, 3=Illicit,
  // 4=Neutral, 5=Lawful, 6=Scrupulous, 7=Virtuous (in-game names). Like renown,
  // it's a hidden owner trait (trait_SmallBusiness_Reputation_N), resolved via the
  // owner join at SaveData assembly. null when owner unknown / no alignment trait.
  // Confirmed via Slot_00000007 (Messiah Kitchen = level 1 / Nefarious at -999).
  alignment: number | null;
}

/**
 * Per-sim family facts + pair edges, keyed by hex sim ids ('0x…'). Parent ids
 * may reference sims with NO record in the save (culled ancestors — the
 * in-game "Unknown" silhouettes); the importer turns those into stub rows.
 */
export interface ParsedFamilyFacts {
  bySim: Record<string, {
    parents: string[];          // f14 idx 0/1 — may include record-less (dangling) ids
    spouse: string | null;      // f15
    engaged: string | null;     // f68
    partner: string | null;     // f72 (CAS pointer; played households use pair bits instead)
  }>;
  /** Couple/ex + sibling edges from the relationship service records (deduped,
   *  a < b). 'sibling'/'half_sibling' = the cull-proof bit-8802/468542 blood
   *  links, emitted only for pairs the parent graph can't connect. */
  pairEdges: Array<{ a: string; b: string; relType: 'partner' | 'ex_spouse' | 'ex_partner' | 'ex_fiance' | 'sibling' | 'half_sibling' }>;
}

/** A member entry inside a dynasty record (service field 60 → record f6). */
export interface ParsedDynastyMember {
  simId: bigint;
  order: number;   // succession order (f6.f4): 1 = head, then heir, etc.
  // Role (Head/Heir/Member/Black Sheep…) resolved from the member's FULL traits
  // at parse time — the stored sim.traitIds are filtered to the CAS catalog and
  // drop the HIDDEN dynasty role traits, so we must capture it here. null = none.
  role: string | null;
}

/**
 * In-game Dynasty (EP21). Lives at SaveSlotData(2) → GameplaySaveSlotData(8) →
 * field 60 (dynasty service) → repeated field 1 (one record per dynasty).
 * Record fields: 1=id(i64) 2=name 4=head sim(i64) 6=members[] 7=ideal/skill ids
 * (packed 8B entries, low 3 bytes = dynastyValue tuning id) 8=allied dynasty ids
 * 9=rival dynasty ids (both packed fixed64) 10=description 11.f3=crest background
 * hash 12=perk ids. (Prestige/unity values live on the head sim's statistics.)
 */
export interface ParsedDynasty {
  id: bigint;
  name: string;
  description: string;
  headSimId: bigint | null;
  members: ParsedDynastyMember[];
  valueIds: string[];           // field 7 — ideal + skill tuning ids (hex, e.g. "0x723bd"); split via the catalog
  crestBgHash: string | null;   // 16-char hex of the background ResourceKey instance → /dynasty-crests
  crestFgHash: string | null;   // 16-char hex of the foreground symbol ResourceKey instance
  perkIds: number[];            // field 12 — dynasty-level unlocked perk ids
  allianceDynastyIds: bigint[]; // field 8 — allied dynasty ids (mutual). Confirmed via Alfaro fixture.
  rivalryDynastyIds: bigint[];  // field 9 — rival dynasty ids (mutual). Confirmed via Alfaro fixture.
  prestige: number | null;      // raw prestige points (from the head sim's ranked statistic); level is derived
  unity: number | null;         // raw unity points (from the head sim's ranked statistic); rank is derived
}

// ─── Custom venues / getaways (EP20) ──────────────────────────────────────────
// One on-lot custom venue with its inline schedule. See customVenues.ts for the
// byte layout. Criterion/outfit raw values are resolved to labels at the display
// layer (age bitmask, gender flag, fame rank, skill statistic id; outfit enums).

export interface VenueCriterion {
  // 'marital' and 'funds' are club-only — venues use 'relationship' (a different
  // value enum). 'funds' = household financial-status tier.
  type: 'skill' | 'trait' | 'career' | 'age' | 'fame' | 'occult' | 'gender' | 'region' | 'orientation' | 'relationship' | 'marital' | 'funds' | 'unknown';
  required: boolean;
  values: number[];     // one-or-more values (a role can require ANY of several, e.g. Vampire OR Fairy)
  rawType: number;      // raw type code (for unmapped types)
}

export interface VenueRoleOutfit {
  mode: 'none' | 'category' | 'style' | 'custom' | 'unknown';
  category?: number;     // category mode — OutfitCategory enum value
  dressCode?: number;    // style mode — raw id (not name-mapped)
  color?: number;        // style mode — raw id (not name-mapped)
  hasDressCode?: boolean; // style mode — a dress code is set (value != 0)
  hasColor?: boolean;     // style mode — a color is set (value != 0)
}

export interface ParsedVenueRole {
  name: string;
  simCount: number;
  criteria: VenueCriterion[];
  // Default-behavior activity tuning ids → STOCK_ACTIVITIES. DECIMAL STRINGS,
  // not numbers: a modded activity's id can exceed what a JS number holds
  // exactly, and rounding it loses the only handle we have on that activity.
  activities: string[];
  outfit: VenueRoleOutfit;
  index: number;        // stable role index, referenced by slot assignments
  // Planner-only provenance: the role preset this role was added from (omitted =
  // hand-built / from the game). Drives Update-vs-Save-as-new for role presets.
  sourcePresetId?: string;
}

export interface ParsedVenueSlotAssignment {
  roleIndex: number;
  // Per-slot activity list for this role. null = inherit the role's own default
  // activities; a (1–5)-length array = this slot overrides them with its own set
  // (the game's per-slot customization; an empty embedded list also reads as an
  // override). Read from EVERY entry of the slot's embedded role copy (f4), not
  // just the first.
  activityOverrides: string[] | null;
  outfitOverride: VenueRoleOutfit | null;
}

export interface ParsedVenueSlot {
  hour: number;                         // 24h start hour of the slot
  mainActivity: string | null;         // default activity tuning id for the slot
  assignments: ParsedVenueSlotAssignment[];
}

export interface ParsedCustomVenue {
  name: string;
  lotId: bigint | null;                // best-effort lot association (TODO: link to lot)
  roles: ParsedVenueRole[];
  slots: ParsedVenueSlot[];
}

export interface SaveData {
  saveName: string | null;          // SaveSlotData.field 9 (the name shown in the game's save list)
  // Dominant sim last-saver account (f23) = whoever last saved THIS file = the current
  // owner. Uniform across the save. Used by classifyHousehold to tell the owner's own
  // builds from downloaded content. null if undetectable.
  ownerAccountId: bigint | null;
  sims: ParsedSim[];
  lots: ParsedLot[];
  households: ParsedHousehold[];
  clubs: ParsedClub[];
  holidays: ParsedHoliday[];
  smallBusinesses: ParsedSmallBusiness[];
  dynasties: ParsedDynasty[];
  customVenues: ParsedCustomVenue[];
  savedVenuePresets: ParsedCustomVenue[]; // reusable saved schedule presets (no lot)
  savedRolePresets: ParsedVenueRole[];    // reusable saved standalone role presets
  familyFacts: ParsedFamilyFacts;
  seasonLengthWeeks: 1 | 2 | 4;     // active season length: NORMAL(7d)→1, LONG(14d)→2, VERY_LONG(28d)→4
}
