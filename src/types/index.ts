import type { SimCareer } from '../data/careerSelect';
import type { ParsedVenueRole, ParsedVenueSlot, VenueCriterion, ParsedClubRule, SmallBusinessCustomerCriterion } from '../lib/parser/types';
import type { SimSnapshot } from '../lib/parser/snapshot';

export type LotStatus = 'unplanned' | 'planned' | 'built';

export interface SeedLot {
  name: string;
  location: string;
  type: string;
  size: string;
}

export interface PlannedLot {
  lotKey: string;
  worldName: string;
  name: string;           // original seed name — stable, never changes
  customName: string;     // user-editable display name, defaults to name
  location: string;
  defaultType: string;
  customType: string;
  size: string;
  status: LotStatus;
  householdIds: string[]; // max 1 for Residential/Apartment, max 6 for Residential Rental
  notes: string;          // private — planner-only, never shown publicly
  description: string;    // public — shown on the showcase
  hasSmallBusiness: boolean;
  smallBusinessName: string;
  smallBusinessNotes: string;
  smallBusinessIcon: string;
  clubIds: string[];
  sourceId: string | null;  // game lot ID (hex) from the .save; null if never imported
  // The save's last-imported name+type — the baseline for the lot's 3-way
  // re-sync merge and the "revert to your save" target. null until a save
  // populates it (then reconciliation falls back to the seed default). Only
  // trusted when it carries the current version marker (see readLotBaseline).
  lastSaved: { customName: string; customType: string } | null;
}

// A lot the user is tracking with a role-preset schedule. Mirrors the
// small_businesses entity model: rows are only ever created on import or
// via explicit user action, never seeded.
//
// `name`/`roles`/`slots` are the rich, parser-extracted venue structure (EP20
// Stage 1). roles/slots hold the parser's raw shapes verbatim — labels resolve
// at the display layer (venueLabels + STOCK_ACTIVITIES). `venueSchedule` is the
// legacy free-form text field, retained for back-compat but no longer surfaced.
export interface CustomVenue {
  id: string;
  // Nullable: planner venues can be built lot-less and assigned later (or never).
  // Imported venues always carry their lot_key.
  lotKey: string | null;
  name: string;
  venueSchedule: string;
  notes: string;
  roles: ParsedVenueRole[];
  slots: ParsedVenueSlot[];
  // 'import' = parsed from the game save (read-only in the UI except notes;
  // refreshed/removed by re-sync). 'planner' = authored in the planner editor
  // (fully editable; never auto-removed on re-sync). Defaults to 'import'.
  source: 'import' | 'planner';
  // Planner-only. A getaway is household-hosted + ephemeral (vs a lot-bound
  // custom venue); hostHouseholdId is the hosting household. Imports are never
  // getaways.
  isGetaway: boolean;
  hostHouseholdId: string | null;
  // Planner-only provenance: the planner preset this venue's schedule was started
  // from (null = hand-built). Drives the "Custom / preset name (edited)" label and
  // the Update-preset action. Dangling id (deleted preset) is treated as Custom.
  sourcePresetId: string | null;
}

// A saved preset (EP20 preset library): a reusable schedule template (kind
// 'schedule', data = roles + slots) or a standalone role template (kind 'role',
// data = a single role).
//
// Preset origins (three layers):
//   - 'stock'   = Sims-Team built-ins, from tuning (STOCK_VENUE_PRESETS); not a DB row.
//   - 'import'  = parsed from the player's save; refreshed wholesale every sync.
//   - 'planner' = authored in the planner (future); persists across syncs.
// This DB-backed type only carries the save-side origins ('import'|'planner');
// stock presets are merged in at the display layer.
export interface CustomVenuePreset {
  id: string;
  kind: 'schedule' | 'role';
  name: string;
  data: { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] } | ParsedVenueRole;
  source: 'import' | 'planner';
}

export interface SimCount {
  male: number;
  female: number;
}

export interface HouseholdComposition {
  elder: SimCount;
  adult: SimCount;
  youngAdult: SimCount;
  teen: SimCount;
  child: SimCount;
  toddler: SimCount;
  infant: SimCount;
  /** Bassinet babies. Optional: compositions persisted before newborn support lack the key. */
  newborn?: SimCount;
  dog: number;
  cat: number;
  horse: number;
}

export const EMPTY_COMPOSITION: HouseholdComposition = {
  elder: { male: 0, female: 0 },
  adult: { male: 0, female: 0 },
  youngAdult: { male: 0, female: 0 },
  teen: { male: 0, female: 0 },
  child: { male: 0, female: 0 },
  toddler: { male: 0, female: 0 },
  infant: { male: 0, female: 0 },
  newborn: { male: 0, female: 0 },
  dog: 0,
  cat: 0,
  horse: 0,
};

export function getCompositionTotal(c: HouseholdComposition): number {
  const SIM_KEYS = ['elder', 'adult', 'youngAdult', 'teen', 'child', 'toddler', 'infant', 'newborn'] as const;
  const PET_KEYS = ['dog', 'cat', 'horse'] as const;
  return SIM_KEYS.reduce((s, k) => s + (c[k]?.male ?? 0) + (c[k]?.female ?? 0), 0)
    + PET_KEYS.reduce((s, k) => s + c[k], 0);
}

export interface Photo {
  id: string;
  type: 'inspo' | 'built';
  filename: string;
  /** Built photos only. Inspo photos don't carry one — see `tags` instead. */
  caption: string;
  created_at: string;
  save_file_id?: string | null;
  target_type?: 'lot' | 'household' | 'world' | null;
  target_key?: string | null;
  assignment?: { target_type: string; target_key: string } | null;
  excluded?: boolean;
  /**
   * The single vocabulary for inspo photos. Freeform and user-coined — the old
   * fixed `categories` enum (Interior / Exterior / Floor Plan / Landscaping)
   * was a photography taxonomy in a planning tool: it described what a photo
   * *showed* rather than what it was *for*, so it went unused while people
   * reached for tags to say "rich", "venue", "residential". The DB column still
   * exists but nothing reads it.
   */
  tags?: string[];
  gallery_creator?: string | null;
  width?: number | null;    // stored intrinsic size → masonry reserves the tile box
  height?: number | null;
}

export interface Household {
  id: string;
  name: string;
  composition: HouseholdComposition;
  assignedLotKey: string | null;
  notes: string;          // private — planner-only, never shown publicly
  description: string;    // public — the household bio, shown on the showcase (from the save)
  thumbnailFilename: string | null;  // R2 key for the household portrait, or null
  sourceId: string | null;            // original Sims household ID (hex of bigint) from the .save; null if hand-created
  money: number | null;               // household funds (Simoleons) from the save; null if hand-created. Read-only game-truth (fits INT32_MAX).
  // Planner-authored funds GOAL (threshold target): "reach §X". Never set by
  // import. CONSUMED when the save's money reaches it (derived in UI).
  plannedMoney: number | null;
  // Provenance — classified once at import (classifyHousehold), silently
  // re-classified on re-sync, never user-edited or diffed. null for hand-created.
  provenance: 'yours' | 'ea' | 'mod' | null;  // bucket: Yours / EA / Mod
  provenanceSub: string | null;               // sub-label (built/adopted-ea/downloaded/premade/townie/service/mod-gen)
  creatorName: string | null;                  // gallery/mod creator name, only for downloaded/mod-gen
  // Visibility override (user-authored, STICKY — survives re-sync, wins over
  // auto-relevance). 'auto' = let relevance decide; Pin/Send-to-Town set the
  // other two. Clear back to 'auto' via Unpin / Bring back.
  visibility: HouseholdVisibility;
  // Re-sync baseline (written at import/re-sync) — drives the Edited/revert
  // treatment for goal-vs-reality household fields. Missing key = field not
  // captured (older snapshot) → must read as Mirrored, never phantom Edited.
  lastImportedState?: {
    name?: string;
    composition?: HouseholdComposition;
    description?: string;
    assignedLotKey?: string | null;
  } | null;
}

export type HouseholdVisibility = 'pinned' | 'auto' | 'sent_to_town';

export type SimGender = 'male' | 'female';
export type SimLifestage = 'newborn' | 'infant' | 'toddler' | 'child' | 'teen' | 'youngAdult' | 'adult' | 'elder' | 'pet';
export type SimSpecies = 'human' | 'pet';
export type SimPetSubtype = 'cat' | 'dog' | 'horse' | 'pet';
export type SimOccult = 'none' | 'vampire' | 'alien' | 'mermaid' | 'spellcaster' | 'werewolf' | 'fairy';

export type SimRecordStatus = 'active' | 'tree_only' | 'culled' | 'stub' | 'manual';
export type SimRelType = 'parent' | 'spouse' | 'engaged' | 'partner' | 'ex_spouse' | 'ex_partner' | 'ex_fiance' | 'sibling' | 'half_sibling';

export interface SimRelationship {
  id: string;
  simAId: string;   // for 'parent' edges: the parent
  simBId: string;   // for 'parent' edges: the child
  relType: SimRelType;
  source: 'import' | 'manual';
}

export interface Sim {
  id: string;
  householdId: string | null;  // null for tree-only/stub/manual sims (no household)
  firstName: string;
  lastName: string;
  gender: SimGender;
  lifestage: SimLifestage;
  species: SimSpecies;
  petSubtype: SimPetSubtype;  // 'pet' for humans + unclassified pets, otherwise cat/dog/horse
  petBreed: string | null;     // e.g. "Afghan Hound", or null if absent
  occult: SimOccult;
  isGhost: boolean;
  notes: string;
  sourceId: string | null;     // game sim ID (hex); null if hand-created
  // CAS-pickable identity. Hex tuning IDs resolved via STOCK_TRAITS /
  // STOCK_ASPIRATIONS at display time. Populated by the randomizer and
  // future save importer; default to [] / null when unset.
  traitIds: string[];
  aspirationId: string | null;
  // Family tree lifecycle. 'active' = on the roster; everything else lives
  // only in the family tree (see schema.sql for the full state notes).
  recordStatus: SimRecordStatus;
  deathCause: string | null;   // e.g. 'Cowplant'; null = alive or unknown
  culledAt: string | null;     // stamped when a re-sync finds the game culled them
  // University (Discover University). Currently-enrolled degree from the save's
  // f30.f30; null when not enrolled. Earned degrees are NOT stored here — they
  // live in traitIds and resolve via stockDegrees. Optional: sims created
  // before this field (or by the randomizer) simply omit it.
  enrolledDegree?: SimEnrolledDegree | null;
  // Active career from the save (attributes.f12.f2). null = unemployed/none.
  // Optional: sims created before this field (or by the randomizer) omit it.
  career?: SimCareer | null;
  // Observed skills (read-only game-truth from the save; excluded from re-sync
  // diffing). skillId = hex tuning id into STOCK_SKILLS; level derived from points.
  // Optional: hand-created sims / pre-skills saves omit it (treat as []).
  skills?: SimSkill[];
  // Planner-AUTHORED goals (never set by import/re-sync, not diffed) — distinct
  // from observed game-truth. plannedSkillIds = goal skills (hex ids, no level);
  // plannedCareerUid = authored career track (hex uid), the save's level stays
  // mirror. Sentinel 'none' = planned UNEMPLOYED (remove the save-mirrored
  // career); null = mirror the save as-is.
  plannedSkillIds?: string[];
  plannedCareerUid?: string | null;
  // Planner-AUTHORED planned move (the "Planned move → X" sticker). Points at a
  // household id (real or plan-only shell). ONLY real sims (sourceId set) may
  // carry one — plan-only sims are locked to their household. NEVER set by
  // import/re-sync; not diffed. Cleared on ANY in-game move (sync sees the sim's
  // save household changed) and when the target household is deleted. See
  // project_planned_moves_spec. null/absent = no planned move.
  plannedMoveHouseholdId?: string | null;
  // Frozen copy of the game-truth fields at last import — the per-field SAVE
  // BASELINE the Manager diffs against to render the Mirrored/Edited cue
  // (authored value ≠ baseline → "Edited"). Already sent by GET /save-files;
  // null/absent for plan-only sims (no save origin → no cue ever).
  lastImportedState?: SimSnapshot | null;
}

export interface SimSkill {
  skillId: string;   // hex tuning id ('0x..') into STOCK_SKILLS
  level: number;     // 0–10 (toddler skills 0–5), derived from points
  points: number;    // raw cumulative skill points
}

export interface SimEnrolledDegree {
  subject: string;
  school: 'Britechester' | 'Foxbury';
  distinguished: boolean;   // pursuing the distinguished version (field matches school specialty)
}

export type { SimCareer };

export interface Club {
  id: string;
  name: string;
  icon: string;
  assignedLotKey: string | null;
  notes: string;            // private — planner-only, never shown publicly
  description: string;      // public — shown on the showcase (from the save)
  memberSimIds: string[];   // sims.id values (planner IDs, not save bigints)
  // Read-only game-truth fields (refreshed on re-sync; never user-edited):
  leaderSimId: string | null;    // founder — sims.id (planner ID), null if not imported/unmapped
  criteria: VenueCriterion[];    // membership requirements (skill/trait/career/occult/marital/funds/fame/age)
  rules: ParsedClubRule[];       // encouraged/discouraged activities + "to whom" target
  inviteOnly: boolean;           // false = Open Invitation, true = Invite Only
  hangoutVenueTypeId: string | null; // General Venue hangout: venue tuning id hex (mutually exclusive w/ assignedLotKey); resolve via VENUE_TUNING_MAP
  sourceId: string | null;  // game club ID (hex); null if hand-created
}

export interface SmallBusiness {
  id: string;
  name: string;
  icon: string;
  notes: string;            // private — planner-only, never shown publicly
  description: string;      // public — shown on the showcase (from the save)
  assignedLotKeys: string[]; // a business can span several lots (multi-lot)
  ownerSimId: string | null; // the specific owning sim (sims.id); decoupled from any lot
  // Authorable game-truth fields (refreshed on re-sync for imported businesses;
  // editable for hand-created). Mirror the club pattern.
  employeeSimIds: string[];               // hired employees — sims.id (planner ids)
  customerCriteria: SmallBusinessCustomerCriterion[]; // target-customer requirements
  activities: { id: string; name: string }[];         // offered customer activities
  feeMode: 'disabled' | 'hourly' | 'one-time' | 'unknown'; // entrance/hourly fee mode
  priceModifierPct: number;               // -50..100 price markup %
  // Read-only owner-derived stats (never user-edited; from hidden owner traits).
  renownRank: number | null;              // star level 0–5
  alignment: number | null;               // 1–7 (Nefarious..Virtuous)
  perkPoints: number;                     // earned business perk points
  sourceId: string | null;  // game business ID (hex); null if hand-created
}

export type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';
export type SeasonLength = 1 | 2 | 4;

export interface Holiday {
  id: string;
  name: string;
  icon: string;
  season: Season;
  day: number;
  notes: string;
  traditions: string[];     // tradition tuning ids (hex); resolve name via stockTraditions, icon via /holiday-icons/<uid>.png
  unassigned: boolean;      // user explicitly parked it off the calendar — keeps season/day as the intended slot
  timeOff: boolean;         // "Day off Work/School"
  decorationPreset: string | null; // decoration-theme preset id (decimal string); resolve via holidayDecorationName; null = None
  sourceId: string | null;  // game tuning ID (hex); null if hand-created
  // Imported holidays: their in-game day+season at each plan length ('1'|'2'|'4'
  // = 7/14/28-day), so the planner can re-scale them exactly like the game when
  // the plan length changes. null for hand-made planner holidays.
  scaledDates: Record<string, { day: number; season: Season }> | null;
}

export interface DynastyMember {
  simId: string;        // sims.id (planner ID)
  order: number;        // succession order from the save (1 = head, …)
  role: string | null;  // Head / Heir / Member / Black Sheep… (resolved from full traits at parse time)
}

export interface Dynasty {
  id: string;
  name: string;
  description: string;       // public (from the save's dynasty description)
  notes: string;             // private — planner-only
  headSimId: string | null;
  members: DynastyMember[];
  valueIds: string[];        // ideal + skill tuning ids (hex); split via the dynasty catalog
  crestBgHash: string | null;
  crestFgHash: string | null;
  prestige: number | null;   // raw points; level derived via dynastyProgression
  unity: number | null;      // raw points; rank derived via dynastyProgression
  perkIds: number[];
  allianceSourceIds: string[]; // game ids (hex) of allied dynasties; resolve to names/crests via sourceId match
  rivalrySourceIds: string[];  // game ids (hex) of rival dynasties; resolve to names/crests via sourceId match
  sourceId: string | null;   // game dynasty id; null if hand-created (never, for now)
}

export interface Mod {
  id: string;
  name: string;
  url: string;
  type: 'Mod' | 'CC';
  importance: 'required' | 'recommended';
  notes: string;
  excluded?: boolean;
}

export interface SaveFile {
  name: string;
  lots: Record<string, PlannedLot>;
  households: Record<string, Household>;
  sims: Record<string, Sim>;
  relationships: Record<string, SimRelationship>;  // family edges, keyed by edge id
  clubs: Record<string, Club>;
  smallBusinesses: Record<string, SmallBusiness>;
  holidays: Record<string, Holiday>;
  dynasties: Record<string, Dynasty>;
  customVenues: Record<string, CustomVenue>;
  customVenuePresets: CustomVenuePreset[];
  mods: Record<string, Mod>;
  seasonLength: SeasonLength;              // authored PLAN length (what the Holidays calendar renders)
  importedSeasonLength: SeasonLength | null; // the save's length as of last sync; null = never recorded. Drives mirror-until-override + the mismatch hint.
  disabledWorlds: string[];
  neighborhoodCaptions: Record<string, string>;
  worldBlurbs: Record<string, string>;  // per-world public showcase blurb, keyed by world name
  // Identity of the .save file this planner save was originally imported from.
  // Null when the save was hand-created or migrated from a JSON export.
  sourceSaveFilename: string | null;
  sourceSaveName: string | null;
  // Timestamp of last successful game-import or re-sync. Null for saves never
  // linked to a .save file. Drives the "Synced N days ago" UI and stale nudge.
  lastSyncedAt: string | null;
  // External URL where visitors can download the .save (Patreon, Drive, etc.).
  // Surfaced on the public showcase when sharing is on. Null until the user
  // adds one in Save Settings.
  saveFileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
