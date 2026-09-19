/**
 * Re-import a Sims 4 save into an existing planner save. Pulls fresh game
 * truth in, preserves user-edited fields and all planner-only state (notes,
 * inspo, photos, hand-created records).
 *
 * Flow:
 *   1. User picks a .save
 *   2. We parse it AND fetch the previously-stored snapshots in parallel
 *   3. Build next/current/last snapshot maps for each entity type
 *   4. Run diffEntities → three buckets per entity (update / add / remove)
 *   5. Render a review modal with per-row checkboxes + conflict markers
 *   6. On Apply: walk the user's selections and call the appropriate CRUD
 *      endpoints + write the new snapshots (2d — not yet wired)
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { FolderOpen, Check } from '@phosphor-icons/react';
import { FileName } from './common/FileName';
import { WRONG_FILE } from './gameImport/wrongFile';
import { useIsMobile } from '../hooks/useIsMobile';
import { ImportDesktopSheet } from './Layout/ImportDesktopSheet';
import { parseDbpf } from '../lib/dbpf';
import { parseSaveData } from '../lib/saveParser';
import { classifyHousehold } from '../lib/parser/provenance';
import { detectPacksFromSave } from '../lib/detectPacks';
import { usePackOwnership } from '../store/usePackOwnership';
import type { SaveData, ParsedSim } from '../lib/saveParser';
import { resolveStockClubName } from '../data/stockClubs';
import { CLUB_ICONS, UNKNOWN_CLUB_ICON } from '../data/clubIcons';
import { resolveStockHoliday } from '../data/stockHolidays';
import { HOLIDAY_ICONS, UNKNOWN_HOLIDAY_ICON } from '../data/holidayIcons';
import { SMALL_BUSINESS_ICONS, UNKNOWN_SMALL_BUSINESS_ICON } from '../data/smallBusinessIcons';
import { STOCK_TRAITS } from '../data/stockTraits';
import { ROLE_TRAITS } from '../data/stockRoleTraits';
import { isDegreeTrait } from '../data/stockDegrees';
import { STOCK_ASPIRATIONS } from '../data/stockAspirations';
import { resolveSaveLots, buildZoneKeyIndex } from './gameImport/lotMatching';
import { getLotCategory, isSmallBusinessEligible, isClubHangoutEligible } from '../data/worlds';
import { api } from '../lib/api';
import { DotList } from './common/CountBlock';
import { SyncGuideLink } from './gameImport/syncGuide';
import { planFamilyImport } from '../lib/gameImport/familyImport';
import type { SimRelType, SimRelationship } from '../types';
import { useSaveFile } from '../store/useSaveFile';
import { diffEntities, diffLots, reconcileBusinessLots, type EntityDiff } from '../lib/reimport/diff';
// The apply used to await one request at a time. Invisible locally (~1ms a hop),
// minutes in production. Batched wherever the writes are genuinely independent.
import { runChunked } from '../lib/runChunked';
import { stickersToClearOnMove } from '../lib/reimport/plannedMoveSync';
import { detectAdoptions } from '../lib/householdRealization';
import type {
  LotSnapshot, HouseholdSnapshot, SimSnapshot, ClubSnapshot,
  SmallBusinessSnapshot, HolidaySnapshot, DynastySnapshot, CustomVenueSnapshot,
} from '../lib/parser/snapshot';
import { lotSetFromSnapshot, makeLotBaseline } from '../lib/parser/snapshot';
import { businessLotsToYield, businessLotsOnIncompatibleType, venueLotsToRevert, clubsToYield, venueLotsToRelease } from '../lib/reimport/coherence';
import {
  clubRefresh, dynastyRefresh, smallBusinessRefresh, holidayRefreshPatch, scaledFor,
} from '../lib/reimport/silentRefresh';
import { btn } from './common/btn';
import { openSaveFilePicker } from '../lib/pickSaveFile';
// Lot fields ride in the SB snapshot as the reconciliation baseline but are
// handled by reconcileBusinessLots, not the field-level diff — so exclude them.
const SB_DIFF_IGNORE_FIELDS = new Set(['assignedLotKeys', 'assignedLotKey']);
import {
  parsedHouseholdToSnapshot, parsedSimToSnapshot,
  parsedClubToSnapshot, parsedSmallBusinessToSnapshot, parsedHolidayToSnapshot, parsedDynastyToSnapshot,
  parsedCustomVenueToSnapshot,
  lotToCurrentSnapshot, householdToCurrentSnapshot, simToCurrentSnapshot,
  clubToCurrentSnapshot, smallBusinessToCurrentSnapshot, holidayToCurrentSnapshot, dynastyToCurrentSnapshot,
  customVenueToCurrentSnapshot,
} from '../lib/reimport/snapshotBuilders';

interface GameReimportProps {
  saveFileId: string;
  currentSourceFilename: string | null;
  currentSourceSaveName: string | null;
  onCancel: () => void;
  /**
   * Called after a successful apply. Receives the id of the save that was
   * just synced — typically equal to `saveFileId`, but on a first-link
   * sync the user may opt to "Duplicate this planner first," in which case
   * the new (duplicate) save's id is passed and the parent should navigate
   * there instead of reloading the original.
   */
  onComplete: (syncedSaveFileId: string) => void;
}

interface SnapshotsResponse {
  lots:            Array<{ lot_key: string; source_id: string | null; last_imported_state: object | null }>;
  households:      Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  sims:            Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  clubs:           Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  smallBusinesses: Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  holidays:        Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  dynasties:       Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
  customVenues:    Array<{ id: string; lot_key: string; last_imported_state: object | null }>;
}

interface FullDiff {
  lots:            EntityDiff<LotSnapshot>;
  households:      EntityDiff<HouseholdSnapshot>;
  sims:            EntityDiff<SimSnapshot>;
  clubs:           EntityDiff<ClubSnapshot>;
  smallBusinesses: EntityDiff<SmallBusinessSnapshot>;
  holidays:        EntityDiff<HolidaySnapshot>;
  dynasties:       EntityDiff<DynastySnapshot>;
  customVenues:    EntityDiff<CustomVenueSnapshot>;
}

/**
 * Auto-applied family-tree preservation, computed at analyze time.
 *  - culls: roster sims missing from the save that matter to the family tree
 *    (deceased, referenced as a relative by a present sim, or already woven
 *    into stored edges). Never offered for deletion — they flip off the
 *    roster into the tree ('culled', or 'tree_only' when their record still
 *    exists in the save without a household we track).
 *  - deceasedFlips: roster sims who died and moved to a household we don't
 *    track (the game's hidden dead-household) — truly dead, so they leave
 *    the roster for the tree.
 */
interface FamilySyncPlan {
  culls: Array<{ plannerId: string; name: string; recordExists: boolean }>;
  deceasedFlips: Array<{ plannerId: string; sourceHex: string; name: string }>;
  /** Tree rows the sync will create that the planner doesn't have yet — for
   *  saves imported before family support existed this is the whole tree. */
  backfill: { newTreeRows: number; newEdges: boolean };
}

type Step = 'pick' | 'analyzing' | 'review' | 'applying' | 'done';

/** How long "Synced" sits before the modal hands back. */
const DONE_MS = 1500;

/**
 * Name what a silent refresh actually moved, to the console.
 *
 * The review screen counts THINGS, deliberately — "2 clubs", not a field-level
 * ledger a player can't act on. But that means when a club or a holiday is
 * counted, nothing anywhere says which of its fields moved, and the answer
 * stops existing the moment the patch lands: the new values overwrite the old,
 * the deltas are never sent to the server, and traditions / day-off /
 * decorations aren't in a snapshot to compare against later. One line each, so
 * the question is at least answerable while the sync is happening.
 */
function logRefresh(kind: string, name: string, fields: string[]) {
  if (fields.length) console.info(`[sync] ${kind} "${name}" refreshed:`, fields.join(', '));
}

// ─── Snapshot-map builders ────────────────────────────────────────────────────

// All resolution logic that mirrors GameImport's review-side mapping. Kept
// alongside the diff so a change to one isn't silently inconsistent with the
// other — both sides of the comparison must use the same resolution rules.

function buildNextMaps(saveData: SaveData, zoneKeyMap?: Map<string, string>) {
  // Helpers shared across entity types
  const simsById = new Map<bigint, ParsedSim>();
  for (const s of saveData.sims) simsById.set(s.id, s);

  // Lots — one snapshot per planner lot, resolved by the same shared rule the
  // first import uses (multi-unit records collapsed, EA's name variants and
  // seed-variant types normalized to the seed). Unmatched parsed lots (mods,
  // unknown packs) have nowhere to land in the planner, so they're skipped.
  // zoneKeyMap (planner lots' remembered source_ids) pins apartment units to
  // their planner lots across renames; zoneAssignments carries back what THIS
  // save resolved, for persisting after apply.
  const zoneAssignments = new Map<string, string>();
  const lots: Map<string, LotSnapshot> = resolveSaveLots(saveData.lots, { zoneKeyMap, zoneAssignments });

  // Save lot id → planner key, agreeing with the unit assignments above —
  // built AFTER resolveSaveLots so a renamed apartment's residents land on
  // the same planner lot its name did.
  const lotKeyByLotId = buildZoneKeyIndex(saveData.lots, zoneAssignments);

  // Households — keyed by source_id hex. Iterate in reverse-parser order so
  // the diff rows render newest-first (matches the first-import picker).
  const households = new Map<string, HouseholdSnapshot>();
  for (const hh of saveData.households.slice().reverse()) {
    const householdSims = hh.simIds
      .map((id) => simsById.get(id))
      .filter((s): s is ParsedSim => s !== undefined);
    households.set(hh.id.toString(16), parsedHouseholdToSnapshot(hh, householdSims, lotKeyByLotId));
  }

  // Sims — keyed by source_id hex
  // We need each sim's householdSourceId. Build a sim→household lookup.
  const simToHouseholdSourceId = new Map<bigint, string>();
  for (const hh of saveData.households) {
    const hhSourceId = hh.id.toString(16);
    for (const simId of hh.simIds) simToHouseholdSourceId.set(simId, hhSourceId);
  }
  const sims = new Map<string, SimSnapshot>();
  for (const s of saveData.sims) {
    const hhSourceId = simToHouseholdSourceId.get(s.id);
    if (!hhSourceId) continue; // orphan sim, skip
    sims.set(s.id.toString(16), parsedSimToSnapshot(s, hhSourceId));
  }

  // Clubs — keyed by source_id hex, mirror GameImport resolution
  const clubIconSet = new Set(CLUB_ICONS);
  const clubs = new Map<string, ClubSnapshot>();
  for (const c of saveData.clubs) {
    const stockName = resolveStockClubName(c.clubSeed);
    const resolvedName = c.name ?? stockName ?? 'Stock Club';
    const resolvedIcon = c.iconInstance && clubIconSet.has(c.iconInstance) ? c.iconInstance : UNKNOWN_CLUB_ICON;
    clubs.set(c.id.toString(16), parsedClubToSnapshot(c, resolvedName, resolvedIcon, lotKeyByLotId));
  }

  // Small businesses — keyed by source_id hex
  const sbIconSet = new Set(SMALL_BUSINESS_ICONS);
  const smallBusinesses = new Map<string, SmallBusinessSnapshot>();
  for (const sb of saveData.smallBusinesses) {
    let icon = '';
    if (sb.iconInstance) {
      icon = sbIconSet.has(sb.iconInstance) ? sb.iconInstance : UNKNOWN_SMALL_BUSINESS_ICON;
    }
    smallBusinesses.set(sb.id.toString(16), parsedSmallBusinessToSnapshot(sb, icon, lotKeyByLotId));
  }

  // Holidays — keyed by source_id hex (the holiday tuning ID)
  const holidayIconSet = new Set(HOLIDAY_ICONS);
  const holidays = new Map<string, HolidaySnapshot>();
  for (const h of saveData.holidays) {
    const stock = resolveStockHoliday(h.holidayType);
    const resolvedName = h.name ?? stock?.name ?? 'Unknown Holiday';
    let icon = '';
    if (h.iconInstance) {
      icon = holidayIconSet.has(h.iconInstance) ? h.iconInstance : UNKNOWN_HOLIDAY_ICON;
    } else if (stock?.icon) {
      icon = stock.icon;
    }
    holidays.set(h.holidayType.toString(16), parsedHolidayToSnapshot(h, resolvedName, icon));
  }

  // Dynasties — keyed by source_id hex (the dynasty id)
  const dynasties = new Map<string, DynastySnapshot>();
  for (const d of saveData.dynasties) {
    dynasties.set(d.id.toString(16), parsedDynastyToSnapshot(d));
  }

  // Custom venues — keyed by planner lot_key (stable like lots, not a game
  // source_id). Only venues whose lot we matched land in the planner; skip the
  // rest. A lot holds at most one venue, so lot_key is a safe identity.
  const customVenues = new Map<string, CustomVenueSnapshot>();
  for (const v of saveData.customVenues) {
    const lotKey = v.lotId !== null ? (lotKeyByLotId.get(v.lotId) ?? null) : null;
    if (!lotKey) continue;
    customVenues.set(lotKey, parsedCustomVenueToSnapshot(v));
  }

  return { lots, households, sims, clubs, smallBusinesses, holidays, dynasties, customVenues, zoneAssignments };
}

// ─── Component ────────────────────────────────────────────────────────────────

// Re-syncing reads the local .save off the user's computer, so on mobile we
// swap the flow for a "continue on desktop" sheet rather than mounting the
// desktop-only diff/review UI.
export function GameReimport(props: GameReimportProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <ImportDesktopSheet onClose={props.onCancel} />;
  return <GameReimportDesktop {...props} />;
}

function GameReimportDesktop({
  saveFileId,
  currentSourceFilename,
  currentSourceSaveName,
  onCancel,
  onComplete,
}: GameReimportProps) {
  const [step, setStep] = useState<Step>('pick');
  // Title someone can act on + detail, matching GameImport and the portrait
  // sync modal. The raw exception goes to the console, not to the player.
  const [error, setError] = useState<{ title: string; detail: React.ReactNode } | null>(null);
  const [pickedFilename, setPickedFilename] = useState<string | null>(null);
  // First-link only — when checked, the apply step duplicates the planner save
  // first and applies changes to the copy, leaving the original untouched. Lets
  // users keep their hand-crafted from-scratch plan safe while still pulling in
  // game truth on a copy.
  const [duplicateFirst, setDuplicateFirst] = useState(false);
  const [pickedSaveName, setPickedSaveName] = useState<string | null>(null);
  const [diff, setDiff] = useState<FullDiff | null>(null);
  // The parsed SaveData stays in state through the review step so the apply
  // phase can look up household sims (when adding a household, we also need
  // to create its sims) and translate source_id → planner_id for relational
  // refs (club members, sb owner).
  const [parsedSave, setParsedSave] = useState<SaveData | null>(null);
  // Each business's game lot set at the PREVIOUS sync (source_id hex → lot_keys),
  // captured at analyze time so the apply phase can reconcile lot sets
  // plan-vs-save (reconcileBusinessLots needs this baseline).
  const [sbLotBaselines, setSbLotBaselines] = useState<Map<string, string[]>>(new Map());
  // Businesses that will yield a lot to reality on apply (invariant B2): a
  // business on a residential lot a game household — not including the owner —
  // now occupies. Predicted at analyze so the count surfaces in the summary;
  // executed in handleApply.
  const [sbYields, setSbYields] = useState<{ sbId: string; lotKey: string }[]>([]);
  // Lots stranded as "Small Business Venue" that a game household now occupies —
  // the venue type is impossible with residents, so it reverts to the game's
  // reported type. Independent of any business (covers lots whose business
  // already moved off in a prior sync). Predicted at analyze, applied on apply.
  const [lotTypeReverts, setLotTypeReverts] = useState<{ lotKey: string; gameType: string }[]>([]);
  // Clubs whose hangout lot the save now reports as a club-ineligible type
  // (Rental / Vacation Rental / University Housing, invariant C2) — unassigned
  // from the lot on apply. Sibling of sbYields; predicted at analyze.
  const [clubYields, setClubYields] = useState<{ clubId: string; lotKey: string }[]>([]);
  // Venues you built that must let their lot go — either the save now puts a
  // real custom venue on it, or the lot is no longer typed Custom Venue. The
  // venue itself always survives; only the address is given up. Predicted at
  // analyze so the apply runs it BEFORE the add loop needs the lot free.
  const [venueLotReleases, setVenueLotReleases] = useState<{ venueId: string; lotKey: string; reason: 'taken' | 'retyped' }[]>([]);
  // Imported records whose game-truth moved in a field the diff never looks at
  // — a club's rules, a business's details or lots, a holiday's traditions, a
  // dynasty's alliances. They're refreshed on apply either way; holding their
  // planner ids here is what lets them COUNT on the review screen instead of
  // landing under a headline that says nothing changed.
  const [silentlyChanged, setSilentlyChanged] = useState<Record<'clubs' | 'smallBusinesses' | 'holidays' | 'dynasties', string[]>>(
    { clubs: [], smallBusinesses: [], holidays: [], dynasties: [] },
  );
  // The save's per-lot name+type (next.lots), captured at analyze so handleApply
  // can refresh each lot's baseline (lots.last_imported_state) to reality.
  const [lotSaveSnaps, setLotSaveSnaps] = useState<Map<string, LotSnapshot>>(new Map());
  // zone id (hex) → lot_key, from this parse's unit resolution — persisted to
  // lots.source_id at apply so the NEXT sync survives apartment renames.
  const [lotZoneAssignments, setLotZoneAssignments] = useState<Map<string, string>>(new Map());
  const [familySync, setFamilySync] = useState<FamilySyncPlan | null>(null);
  const [applyProgress, setApplyProgress] = useState('');
  // Every detected change applies (silent full-apply). Kept as a set so the
  // apply loops can gate on it; populated wholesale at analyze time.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Pull the current planner state we need to derive "current" snapshots
  const plannerLots       = useSaveFile((s) => s.lots);
  const plannerHouseholds = useSaveFile((s) => s.households);
  const plannerSims       = useSaveFile((s) => s.sims);
  const plannerClubs      = useSaveFile((s) => s.clubs);
  const plannerSBs        = useSaveFile((s) => s.smallBusinesses);
  const plannerHolidays   = useSaveFile((s) => s.holidays);
  const plannerDynasties  = useSaveFile((s) => s.dynasties);
  const plannerCVs        = useSaveFile((s) => s.customVenues);
  const plannerSeasonLength = useSaveFile((s) => s.seasonLength);
  const plannerImportedSeasonLength = useSaveFile((s) => s.importedSeasonLength);
  const plannerName       = useSaveFile((s) => s.name);


  const ingestFile = useCallback(async (file: File) => {
    // Every attempt is logged, the ones that end in "wrong file" included —
    // that is the failure nobody could see before. See api.logImportEvent.
    const startedAt = Date.now();
    setError(null);
    setPickedFilename(file.name);
    setStep('analyzing');

    try {
      const [buffer, snapshots, existingEdges] = await Promise.all([
        file.arrayBuffer(),
        api.getImportSnapshots(saveFileId) as Promise<SnapshotsResponse>,
        // Family edges already stored for this save — used to decide which
        // missing sims are genealogy-relevant. Additive: failure just means
        // fewer sims qualify for auto-preservation.
        api.listRelationships(saveFileId).catch(() => [] as SimRelationship[]),
      ]);
      // Reading the FILE is its own failure mode, kept separate from the rest
      // of this function on purpose: "you picked the wrong thing" and "the
      // sync broke" want completely different words, and a player should never
      // be shown "Offset is outside the bounds of the DataView". Both wrong-file
      // shapes below share one message — the move is the same either way.
      let saveData;
      try {
        saveData = parseSaveData(parseDbpf(buffer));
      } catch (err) {
        console.error('[GameReimport] parse failed:', err);
        api.logImportEvent({
          saveFileId, kind: 'resync', ok: false,
          errorSummary: `Parse failed: ${(err as Error).message}`,
          durationMs: Date.now() - startedAt,
        });
        setError(WRONG_FILE);
        setStep('pick');
        return;
      }

      // A `.package` — a mod, or localthumbcache — is the SAME DBPF container
      // as a `.save`, so it parses fine and simply yields nothing. Here the
      // stakes are higher than on first import: an empty parse compared against
      // a full plan looks like the whole town vanished, which is the worst
      // possible thing to show on a screen whose job is deciding what to keep.
      if (saveData.lots.length === 0 && saveData.sims.length === 0) {
        api.logImportEvent({
          saveFileId, kind: 'resync', ok: false,
          errorSummary: 'Wrong file — parsed fine but held no lots or sims',
          durationMs: Date.now() - startedAt,
        });
        setError(WRONG_FILE);
        setStep('pick');
        return;
      }

      setPickedSaveName(saveData.saveName);
      setParsedSave(saveData);

      // NOTE: pack detection deliberately does NOT run here. It used to, and a
      // sync the user cancelled still rewrote their pack list — on every save,
      // since ownership is per-account. Cancel has to mean cancel; the union
      // now happens in handleApply. (First import is different: that flow only
      // exists to apply, so it detects at parse.)

      // Remembered unit identity: planner lots that carry a source_id (the
      // save's own zone id, stored by an earlier sync) resolve by IT — the
      // only thing that still identifies an apartment unit after a rename.
      const zoneKeyMap = new Map<string, string>();
      for (const lot of Object.values(plannerLots)) {
        if (lot.sourceId) zoneKeyMap.set(lot.sourceId, lot.lotKey);
      }
      const next = buildNextMaps(saveData, zoneKeyMap);

      // ── Build "current" snapshot maps from the planner store + planner side ──
      // For relational fields (sim's household_source_id, club members' source_ids,
      // sb owner's source_id) we need lookup tables planner-uuid → source_id.
      const hhSourceById   = new Map<string, string>();   // planner hhId → hh source_id
      for (const hh of Object.values(plannerHouseholds)) if (hh.sourceId) hhSourceById.set(hh.id, hh.sourceId);
      const simSourceById  = new Map<string, string>();   // planner simId → sim source_id
      for (const s of Object.values(plannerSims))         if (s.sourceId) simSourceById.set(s.id, s.sourceId);

      // Lots — keyed by lot_key. 3-way reconciliation (see diffLots): pass the
      // planner value + the baseline (the save's last-imported value), falling
      // back to the seed default when no baseline is recorded — which makes an
      // unrecorded lot behave exactly like the old stateless rule.
      const currentLots = new Map<string, { current: LotSnapshot; baseline: LotSnapshot }>();
      for (const lot of Object.values(plannerLots)) {
        currentLots.set(lot.lotKey, {
          current: lotToCurrentSnapshot(lot),
          baseline: lot.lastSaved ?? { customName: lot.name, customType: lot.defaultType },
        });
      }

      // Households
      const currentHouseholds = new Map<string, { plannerId: string; current: HouseholdSnapshot; last: HouseholdSnapshot | null }>();
      const lastHhBySourceId = new Map<string, HouseholdSnapshot>();
      for (const row of snapshots.households) {
        if (row.source_id && row.last_imported_state) lastHhBySourceId.set(row.source_id, row.last_imported_state as HouseholdSnapshot);
      }
      // Reverse lookup: planner household uuid → planner lot_key. We derive
      // this from lot.household_ids (the side users actually see in the lot
      // modal) rather than household.assignedLotKey, because the two fields
      // can drift out of sync after a partial-failure or a buggy earlier
      // version. The lot side is authoritative for the user-visible state, so
      // using it as the "current" value in the diff lets sync correctly
      // reconcile drift on each re-import instead of locking the bad state in.
      const householdToLotKey = new Map<string, string>();
      for (const lot of Object.values(plannerLots)) {
        for (const hhId of lot.householdIds) {
          // First write wins; in practice a household should be on at most
          // one lot, but defensive against bad data.
          if (!householdToLotKey.has(hhId)) householdToLotKey.set(hhId, lot.lotKey);
        }
      }
      for (const hh of Object.values(plannerHouseholds)) {
        if (!hh.sourceId) continue; // hand-created, invisible to diff
        const sims = Object.values(plannerSims).filter((s) => s.householdId === hh.id);
        const lotKey = householdToLotKey.get(hh.id) ?? null;
        currentHouseholds.set(hh.sourceId, {
          plannerId: hh.id,
          current: householdToCurrentSnapshot(hh, sims, lotKey),
          last: lastHhBySourceId.get(hh.sourceId) ?? null,
        });
      }

      // Sims
      const currentSims = new Map<string, { plannerId: string; current: SimSnapshot; last: SimSnapshot | null }>();
      const lastSimBySourceId = new Map<string, SimSnapshot>();
      for (const row of snapshots.sims) {
        if (row.source_id && row.last_imported_state) lastSimBySourceId.set(row.source_id, row.last_imported_state as SimSnapshot);
      }
      for (const sim of Object.values(plannerSims)) {
        if (!sim.sourceId) continue;
        const hhSource = sim.householdId ? hhSourceById.get(sim.householdId) : undefined;
        if (!hhSource) continue; // household is hand-created — sim is dangling for diff purposes
        currentSims.set(sim.sourceId, {
          plannerId: sim.id,
          current: simToCurrentSnapshot(sim, hhSource),
          last: lastSimBySourceId.get(sim.sourceId) ?? null,
        });
      }

      // Clubs — same drift mitigation as households. lot.club_ids is what
      // the user sees in the lot modal; derive current.assignedLotKey from it.
      const clubToLotKey = new Map<string, string>();
      for (const lot of Object.values(plannerLots)) {
        for (const cId of lot.clubIds) {
          if (!clubToLotKey.has(cId)) clubToLotKey.set(cId, lot.lotKey);
        }
      }
      const currentClubs = new Map<string, { plannerId: string; current: ClubSnapshot; last: ClubSnapshot | null }>();
      const lastClubBySourceId = new Map<string, ClubSnapshot>();
      for (const row of snapshots.clubs) {
        if (row.source_id && row.last_imported_state) lastClubBySourceId.set(row.source_id, row.last_imported_state as ClubSnapshot);
      }
      for (const c of Object.values(plannerClubs)) {
        if (!c.sourceId) continue;
        const memberSourceIds = c.memberSimIds
          .map((id) => simSourceById.get(id))
          .filter((s): s is string => s !== undefined);
        const liveSnapshot: ClubSnapshot = {
          ...clubToCurrentSnapshot(c, memberSourceIds),
          assignedLotKey: clubToLotKey.get(c.id) ?? null,
        };
        currentClubs.set(c.sourceId, {
          plannerId: c.id,
          current: liveSnapshot,
          last: lastClubBySourceId.get(c.sourceId) ?? null,
        });
      }

      // Small businesses
      const currentSBs = new Map<string, { plannerId: string; current: SmallBusinessSnapshot; last: SmallBusinessSnapshot | null }>();
      const lastSBBySourceId = new Map<string, SmallBusinessSnapshot>();
      for (const row of snapshots.smallBusinesses) {
        if (row.source_id && row.last_imported_state) lastSBBySourceId.set(row.source_id, row.last_imported_state as SmallBusinessSnapshot);
      }
      // Capture each business's prior game lot set for the apply phase's
      // plan-vs-save reconciliation (tolerant of the old single-lot shape).
      const sbLotBaselineMap = new Map<string, string[]>();
      for (const [sid, snap] of lastSBBySourceId) sbLotBaselineMap.set(sid, lotSetFromSnapshot(snap));
      setSbLotBaselines(sbLotBaselineMap);

      // Predict B2 reality-collision yields (executed in handleApply). residents-
      // per-lot is drawn from the incoming save's game households only, so purely-
      // planned situations are left alone (those are the editor's job to prevent).
      const yLotKeyByLotId = buildZoneKeyIndex(saveData.lots, next.zoneAssignments);
      const residentSourcesByLot = new Map<string, Set<string>>();
      for (const hh of saveData.households) {
        if (hh.lotId == null) continue;
        const lotKey = yLotKeyByLotId.get(hh.lotId);
        if (lotKey) residentSourcesByLot.set(lotKey, new Set(hh.simIds.map((id) => id.toString(16))));
      }
      // The save's reported type per lot — used both to yield a business off a
      // lot the player rezoned to something it can't live on, and to revert a
      // stranded venue lot's type below.
      const gameTypeByLot = new Map<string, string>();
      for (const [k, snap] of next.lots) gameTypeByLot.set(k, snap.customType);
      setLotSaveSnaps(next.lots); // for the apply-phase lot-baseline refresh (1b)
      setLotZoneAssignments(next.zoneAssignments); // apply persists these to lots.source_id

      const predictedYields: { sbId: string; lotKey: string }[] = [];
      for (const sb of Object.values(plannerSBs)) {
        // Cover BOTH imported and planner-only businesses. Imported ones have
        // their lot set reconciled plan-vs-save first; a planner-only business
        // (no sourceId / not in the save) uses its planned lots directly.
        const parsedSB = sb.sourceId
          ? saveData.smallBusinesses.find((ps) => ps.id.toString(16) === sb.sourceId)
          : undefined;
        const lots = parsedSB
          ? reconcileBusinessLots(
              sb.assignedLotKeys,
              parsedSB.lotIds.map((z) => yLotKeyByLotId.get(z)).filter((k): k is string => !!k),
              sbLotBaselineMap.get(sb.sourceId!) ?? [],
            ).result
          : sb.assignedLotKeys;
        // Owner resolved from the PLANNER side (planner sim → its source_id).
        // A planner-only owner has no source yet → null → never a resident.
        const ownerSource = sb.ownerSimId ? (simSourceById.get(sb.ownerSimId) ?? null) : null;
        // Two independent yield triggers: (1) a foreign household moved onto the
        // lot, (2) the lot was rezoned to a type a business can't occupy (Cafe,
        // Retail, …). Union them so each colliding lot is dropped once.
        const yieldLots = new Set([
          ...businessLotsToYield(!!sb.ownerSimId, ownerSource, lots, residentSourcesByLot),
          ...businessLotsOnIncompatibleType(lots, gameTypeByLot, isSmallBusinessEligible),
        ]);
        for (const lotKey of yieldLots) {
          predictedYields.push({ sbId: sb.id, lotKey });
        }
      }
      setSbYields(predictedYields);

      // Lot-type coherence: any lot the planner still types 'Small Business
      // Venue' that a game household now occupies can't stay a venue — the type
      // reverts to the game's reported type. Owns the type side entirely, so it
      // also fixes lots stranded as venues after their business already moved
      // off (the case where no yield fires at all).
      const plannerVenueLots = Object.values(plannerLots)
        .filter((l) => l.customType === 'Small Business Venue')
        .map((l) => l.lotKey);
      setLotTypeReverts(venueLotsToRevert(plannerVenueLots, residentSourcesByLot, gameTypeByLot));

      // Club coherence (C2): a club whose hangout lot the save now reports as a
      // club-ineligible type (Rental / Vacation Rental / University Housing) is
      // unassigned from it. Only specific-lot hangouts collide — general-venue
      // hangouts (hangoutVenueTypeId, no assignedLotKey) pass a null lot.
      const clubLotByClubId = new Map<string, string | null>(
        Object.values(plannerClubs).map((c) => [c.id, c.assignedLotKey]),
      );
      setClubYields(clubsToYield(clubLotByClubId, gameTypeByLot, isClubHangoutEligible));
      for (const sb of Object.values(plannerSBs)) {
        if (!sb.sourceId) continue;
        // Owner is the specific owning sim — resolve its source_id directly so the
        // "current" side compares cleanly against the imported ownerSimSourceId.
        const ownerSource = sb.ownerSimId ? (simSourceById.get(sb.ownerSimId) ?? null) : null;
        currentSBs.set(sb.sourceId, {
          plannerId: sb.id,
          current: smallBusinessToCurrentSnapshot(sb, ownerSource),
          last: lastSBBySourceId.get(sb.sourceId) ?? null,
        });
      }

      // Holidays
      const currentHolidays = new Map<string, { plannerId: string; current: HolidaySnapshot; last: HolidaySnapshot | null }>();
      const lastHolidayBySourceId = new Map<string, HolidaySnapshot>();
      for (const row of snapshots.holidays) {
        if (row.source_id && row.last_imported_state) lastHolidayBySourceId.set(row.source_id, row.last_imported_state as HolidaySnapshot);
      }
      for (const h of Object.values(plannerHolidays)) {
        if (!h.sourceId) continue;
        currentHolidays.set(h.sourceId, {
          plannerId: h.id,
          current: holidayToCurrentSnapshot(h),
          last: lastHolidayBySourceId.get(h.sourceId) ?? null,
        });
      }

      // Dynasties — head + members mapped planner id → source id (like clubs).
      const currentDynasties = new Map<string, { plannerId: string; current: DynastySnapshot; last: DynastySnapshot | null }>();
      const lastDynastyBySourceId = new Map<string, DynastySnapshot>();
      for (const row of snapshots.dynasties) {
        if (row.source_id && row.last_imported_state) lastDynastyBySourceId.set(row.source_id, row.last_imported_state as DynastySnapshot);
      }
      for (const d of Object.values(plannerDynasties)) {
        if (!d.sourceId) continue;
        const headSource = d.headSimId ? (simSourceById.get(d.headSimId) ?? null) : null;
        const memberSources = d.members
          .map((m) => { const s = simSourceById.get(m.simId); return s ? { sourceId: s, order: m.order, role: m.role } : null; })
          .filter((m): m is { sourceId: string; order: number; role: string | null } => m !== null);
        currentDynasties.set(d.sourceId, {
          plannerId: d.id,
          current: dynastyToCurrentSnapshot(d, headSource, memberSources),
          last: lastDynastyBySourceId.get(d.sourceId) ?? null,
        });
      }

      // Custom venues — keyed by planner lot_key (not a source_id), so the
      // "current" map mirrors lots: identity is the lot the venue sits on.
      const currentCVs = new Map<string, { plannerId: string; current: CustomVenueSnapshot; last: CustomVenueSnapshot | null }>();
      const lastCVByLotKey = new Map<string, CustomVenueSnapshot>();
      for (const row of snapshots.customVenues) {
        if (row.lot_key && row.last_imported_state) lastCVByLotKey.set(row.lot_key, row.last_imported_state as CustomVenueSnapshot);
      }
      for (const cv of Object.values(plannerCVs)) {
        // Planner-authored venues live on lots the game doesn't know as custom
        // venues (and may have no lot at all), so they'd diff as "remove" every
        // sync. Keep them out of the diff entirely — editable, planner-owned,
        // never game-synced. Imported venues always carry a lot_key.
        if (cv.source === 'planner' || !cv.lotKey) continue;
        currentCVs.set(cv.lotKey, {
          plannerId: cv.id,
          current: customVenueToCurrentSnapshot(cv),
          last: lastCVByLotKey.get(cv.lotKey) ?? null,
        });
      }

      // Venue↔lot coherence. Needs the lot merge first, because the type a lot
      // ENDS UP with is what decides whether it can still be a venue — a lot the
      // planner converted still reads as Residential in the save.
      const lotDiff = diffLots(next.lots, currentLots);
      const resolvedTypeByLot = new Map<string, string>();
      for (const lot of Object.values(plannerLots)) resolvedTypeByLot.set(lot.lotKey, lot.customType);
      for (const u of lotDiff.updates) resolvedTypeByLot.set(u.plannerId, u.resolved.customType);
      setVenueLotReleases(venueLotsToRelease(
        Object.values(plannerCVs)
          .filter((cv) => cv.source === 'planner' && !!cv.lotKey)
          .map((cv) => ({ venueId: cv.id, lotKey: cv.lotKey as string })),
        new Set(next.customVenues.keys()),
        resolvedTypeByLot,
      ));

      // Run the diffs
      const fullDiff: FullDiff = {
        lots:            lotDiff,
        households:      diffEntities(next.households,      currentHouseholds),
        sims:            diffEntities(next.sims,            currentSims),
        clubs:           diffEntities(next.clubs,           currentClubs),
        smallBusinesses: diffEntities(next.smallBusinesses, currentSBs, SB_DIFF_IGNORE_FIELDS),
        holidays:        diffEntities(next.holidays,        currentHolidays),
        dynasties:       diffEntities(next.dynasties,       currentDynasties),
        customVenues:    diffEntities(next.customVenues,    currentCVs),
      };

      // Filter out orphan sim adds. A sim "add" only makes sense when its
      // parent household is already in the planner (e.g. a baby was born to an
      // imported family). Sims whose parent household isn't in the planner
      // belong to a household that's also in the Adds bucket — they'll be
      // created together with their household by the apply step, so showing
      // them as separate rows would just be noise.
      const householdSourceIdsInPlanner = new Set(currentHouseholds.keys());
      fullDiff.sims.adds = fullDiff.sims.adds.filter(
        (a) => householdSourceIdsInPlanner.has(a.nextSnapshot.householdSourceId),
      );

      // ── Family-tree preservation (the planner is the archive the game
      // doesn't have). Partition the sim removes: a missing sim that matters
      // to the family tree is never offered for deletion — it leaves the
      // roster automatically but stays in the tree. "Matters" = deceased, OR
      // referenced as a relative by a sim still in the save, OR already woven
      // into stored family edges.
      const referencedHex = new Set<string>(); // '0x…' ids relatives point at
      for (const f of Object.values(saveData.familyFacts?.bySim ?? {})) {
        for (const p of f.parents) referencedHex.add(p);
        if (f.spouse) referencedHex.add(f.spouse);
        if (f.engaged) referencedHex.add(f.engaged);
        if (f.partner) referencedHex.add(f.partner);
      }
      const edgedPlannerIds = new Set<string>();
      for (const e of existingEdges) { edgedPlannerIds.add(e.simAId); edgedPlannerIds.add(e.simBId); }
      const recordHex = new Set(saveData.sims.map((s) => s.id.toString(16)));

      const culls: FamilySyncPlan['culls'] = [];
      fullDiff.sims.removes = fullDiff.sims.removes.filter((r) => {
        const sim = plannerSims[r.plannerId];
        if (!sim) return true;
        const relevant = sim.isGhost
          || (sim.sourceId !== null && referencedHex.has('0x' + sim.sourceId))
          || edgedPlannerIds.has(sim.id);
        if (!relevant) return true; // genealogy-irrelevant townie → normal remove offer
        culls.push({
          plannerId: r.plannerId,
          name: `${sim.firstName} ${sim.lastName}`.trim() || '(unnamed)',
          // A remove just means "not in any household we track" — the record
          // itself may still exist (e.g. homeless). Record gone = truly culled.
          recordExists: sim.sourceId !== null && recordHex.has(sim.sourceId),
        });
        return false;
      });

      // Roster sims who died and moved to a household we don't track (the
      // game's hidden dead-household): truly dead → off the roster, into the
      // tree. Deceased sims still in a tracked household are playable ghosts
      // and stay on the roster.
      const deceasedFlips: FamilySyncPlan['deceasedFlips'] = [];
      for (const [sourceHex, snap] of next.sims) {
        if (!snap.isGhost) continue;
        if (householdSourceIdsInPlanner.has(snap.householdSourceId)) continue;
        const cur = currentSims.get(sourceHex);
        if (!cur) continue; // not an active roster sim
        deceasedFlips.push({
          plannerId: cur.plannerId,
          sourceHex,
          name: `${snap.firstName} ${snap.lastName}`.trim() || '(unnamed)',
        });
      }

      // Backfill preview: would the family sync create tree rows / edges the
      // planner doesn't have? (Saves imported before family support get their
      // whole tree on the first re-sync.) Uses the pre-apply roster — close
      // enough for display; the apply step recomputes against the final set.
      let backfill = { newTreeRows: 0, newEdges: false };
      if (saveData.familyFacts?.bySim && Object.keys(saveData.familyFacts.bySim).length > 0) {
        const activeHex = new Set<string>();
        const knownHex = new Set<string>();
        for (const s of Object.values(plannerSims)) {
          if (!s.sourceId) continue;
          knownHex.add('0x' + s.sourceId);
          if ((s.recordStatus ?? 'active') === 'active') activeHex.add('0x' + s.sourceId);
        }
        const preview = planFamilyImport(saveData.familyFacts, saveData.sims, activeHex);
        backfill = {
          newTreeRows: [...preview.treeOnly, ...preview.stubs].filter((h) => !knownHex.has(h)).length,
          newEdges: preview.edges.length > 0 && !existingEdges.some((e) => e.source === 'import'),
        };
      }
      setFamilySync({ culls, deceasedFlips, backfill });

      // ── Which imported records moved in a field the diff can't see ────────
      // Same comparisons the apply step runs (shared in lib/reimport/
      // silentRefresh), so a thing counts here exactly when it gets written
      // there. The season length the plan will END at decides a holiday's
      // placement, so mirror the adopt rule before asking.
      const plannerSimIdBySource = new Map<string, string>();
      for (const [plannerId, sourceId] of simSourceById) plannerSimIdBySource.set(sourceId, plannerId);
      const adoptLen = !!saveData.seasonLengthWeeks
        && (plannerImportedSeasonLength == null || saveData.seasonLengthWeeks !== plannerImportedSeasonLength);
      const finalLen = adoptLen ? saveData.seasonLengthWeeks : plannerSeasonLength;

      const silent: Record<'clubs' | 'smallBusinesses' | 'holidays' | 'dynasties', string[]> =
        { clubs: [], smallBusinesses: [], holidays: [], dynasties: [] };
      for (const c of Object.values(plannerClubs)) {
        if (!c.sourceId) continue;
        const parsed = saveData.clubs.find((pc) => pc.id.toString(16) === c.sourceId);
        if (parsed && clubRefresh(c, parsed, plannerSimIdBySource).changed) silent.clubs.push(c.id);
      }
      for (const sb of Object.values(plannerSBs)) {
        if (!sb.sourceId) continue;
        const parsed = saveData.smallBusinesses.find((ps) => ps.id.toString(16) === sb.sourceId);
        if (parsed && smallBusinessRefresh(sb, parsed, plannerSimIdBySource, yLotKeyByLotId, sbLotBaselineMap.get(sb.sourceId) ?? []).changed) {
          silent.smallBusinesses.push(sb.id);
        }
      }
      for (const h of Object.values(plannerHolidays)) {
        if (!h.sourceId) continue;
        const parsed = saveData.holidays.find((ph) => ph.holidayType.toString(16) === h.sourceId);
        if (parsed && Object.keys(holidayRefreshPatch(h, parsed, finalLen)).length > 0) silent.holidays.push(h.id);
      }
      for (const d of Object.values(plannerDynasties)) {
        if (!d.sourceId) continue;
        const parsed = saveData.dynasties.find((pd) => pd.id.toString(16) === d.sourceId);
        if (parsed && dynastyRefresh(d, parsed).changed) silent.dynasties.push(d.id);
      }
      setSilentlyChanged(silent);

      setDiff(fullDiff);

      // Silent full-apply model: the plan mirrors the save, so every detected
      // change applies — no per-item opt-in. Select every key up front; the
      // apply loops still gate on `selected`, so this makes them run the lot.
      const initial = new Set<string>();
      const all: Array<[keyof FullDiff, EntityDiff<unknown>]> = Object.entries(fullDiff) as Array<[keyof FullDiff, EntityDiff<unknown>]>;
      for (const [type, d] of all) {
        for (const u of d.updates) initial.add(`${type}:update:${u.plannerId}`);
        for (const a of d.adds)    initial.add(`${type}:add:${a.sourceId}`);
        for (const r of d.removes) initial.add(`${type}:remove:${r.plannerId}`);
      }
      setSelected(initial);

      setStep('review');
    } catch (err) {
      console.error('[GameReimport] error:', err);
      api.logImportEvent({
        saveFileId, kind: 'resync', ok: false,
        errorSummary: `Analyze failed: ${(err as Error).message}`,
        durationMs: Date.now() - startedAt,
      });
      setError({
        title: "Couldn't read that save.",
        detail: <>Nothing in your plan has changed. {(err as Error).message}</>,
      });
      setStep('pick');
    }
  }, [saveFileId, plannerLots, plannerHouseholds, plannerSims, plannerClubs, plannerSBs, plannerHolidays, plannerCVs]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    void ingestFile(file);
  }, [ingestFile]);

  // Aimed at the saves folder where the browser can do it, the plain input
  // everywhere else. See lib/pickSaveFile.ts for why it aims and doesn't
  // remember the file — Save As is normal, so the file has to stay a choice.
  const chooseSaveFile = useCallback(() => {
    void openSaveFilePicker((file) => void ingestFile(file), fileRef.current);
  }, [ingestFile]);

  // Per-entity-type change counts for the compact sync summary. `count` is
  // adds + updates + removes for that type; `grand` is the total across all.
  // Grouped "what happened" summary — plain-language lines rather than a raw
  // per-entity-type tally. De-noised: each changed thing is counted once under
  // its most salient action, and household composition changes that are merely
  // the flip side of a sim move are suppressed (so a 1-sim move reads "1 sim
  // moved households", not "2 households, 1 sim").
  const totals = useMemo(() => {
    if (!diff) return null;
    const noun = (singular: string, plural: string, n: number) => (n === 1 ? singular : plural);

    // One tally per CONCEPT, and one entry per THING — never per change. Two
    // clubs changed is what a player recognises; ten changes were made to clubs
    // is bookkeeping they can't act on, and it double-counted a club that both
    // changed and lost its hangout. So each concept collects the IDS of the
    // things that moved, and the number shown is how many there are.
    const changed = new Map<string, Set<string>>();
    const mark = (concept: string, ids: Iterable<string>) => {
      const set = changed.get(concept) ?? new Set<string>();
      for (const id of ids) set.add(id);
      changed.set(concept, set);
    };
    // An added record has no planner id yet, so it's keyed by its game id.
    const addKeys = (rows: Array<{ sourceId: string }>) => rows.map((r) => `new:${r.sourceId}`);
    const plannerKeys = (rows: Array<{ plannerId: string }>) => rows.map((r) => r.plannerId);

    // Sims — moves and plain updates land in the same bucket; the split only
    // existed to word two different sentences.
    mark('sims', plannerKeys(diff.sims.updates));
    mark('sims', addKeys(diff.sims.adds));
    mark('sims', plannerKeys(diff.sims.removes));

    // Households — suppress composition-only updates (derived from sim moves).
    mark('households', diff.households.updates
      .filter((u) => u.changes.some((c) => c.field !== 'composition'))
      .map((u) => u.plannerId));
    mark('households', addKeys(diff.households.adds));
    mark('households', plannerKeys(diff.households.removes));

    // World entities — plain new / updated / left (they don't "move"), plus the
    // fields the diff never sees, which are applied on every sync regardless.
    const WORLD: Array<[keyof FullDiff, string]> = [
      ['clubs', 'clubs'],
      ['smallBusinesses', 'smallBusinesses'],
      ['holidays', 'holidays'],
      ['dynasties', 'dynasties'],
      ['customVenues', 'customVenues'],
    ];
    for (const [type, concept] of WORLD) {
      const d = diff[type];
      mark(concept, addKeys(d.adds));
      mark(concept, plannerKeys(d.updates));
      mark(concept, plannerKeys(d.removes));
    }
    mark('clubs', silentlyChanged.clubs);
    mark('smallBusinesses', silentlyChanged.smallBusinesses);
    mark('holidays', silentlyChanged.holidays);
    mark('dynasties', silentlyChanged.dynasties);

    // Lots — update-only (every save seeds every lot), keyed by lot_key. A lot
    // that both takes a new name and reverts a venue type is one lot.
    mark('lots', plannerKeys(diff.lots.updates));
    mark('lots', lotTypeReverts.map((r) => r.lotKey));

    // Coherence yields — the business or club is already counted if the diff
    // caught it too; the set makes sure it isn't counted twice.
    mark('smallBusinesses', sbYields.map((y) => y.sbId));
    mark('clubs', clubYields.map((y) => y.clubId));
    mark('customVenues', venueLotReleases.map((r) => r.venueId));

    // Family tree — auto-applied (ancestors/relatives added + roster exits +
    // deaths). Rows, not entities: a backfill has no id to dedupe against.
    let familyRows = 0;
    if (familySync) {
      const ids = new Set([
        ...familySync.culls.map((c) => c.plannerId),
        ...familySync.deceasedFlips.map((d) => d.plannerId),
      ]);
      familyRows = familySync.backfill.newTreeRows + ids.size;
      if (familyRows === 0 && familySync.backfill.newEdges) familyRows = 1;
    }

    const tally = new Map<string, number>();
    for (const [concept, ids] of changed) if (ids.size > 0) tally.set(concept, ids.size);
    if (familyRows > 0) tally.set('familyTree', familyRows);
    let grand = [...tally.values()].reduce((sum, n) => sum + n, 0);

    // Fixed display order — the things a player recognises first.
    const CONCEPTS: Array<[string, string, string]> = [
      ['households',      'household',      'households'],
      ['sims',            'sim',            'sims'],
      ['lots',            'lot',            'lots'],
      ['clubs',           'club',           'clubs'],
      ['smallBusinesses', 'small business', 'small businesses'],
      ['holidays',        'holiday',        'holidays'],
      ['dynasties',       'dynasty',        'dynasties'],
      ['customVenues',    'custom venue',   'custom venues'],
      ['familyTree',      'family tree update', 'family tree updates'],
    ];
    const counts = CONCEPTS
      .map(([key, sg, pl]) => ({ key, n: tally.get(key) ?? 0, label: noun(sg, pl, tally.get(key) ?? 0) }))
      .filter((c) => c.n > 0);

    // Season length — adopted only when the save's length changed since last
    // sync. Not a concept count: it's one setting, so it gets its own line.
    let seasonLength: string | null = null;
    if (parsedSave && parsedSave.seasonLengthWeeks !== (plannerImportedSeasonLength ?? plannerSeasonLength)) {
      seasonLength = ({ 1: '7-day', 2: '14-day', 4: '28-day' } as const)[parsedSave.seasonLengthWeeks];
      grand += 1;
    }

    return { grand, counts, seasonLength };
  }, [diff, sbYields, lotTypeReverts, clubYields, venueLotReleases, silentlyChanged, familySync, parsedSave, plannerImportedSeasonLength, plannerSeasonLength]);

  async function handleApply() {
    if (!diff || !parsedSave) return;
    const startedAt = Date.now();
    setStep('applying');
    setError(null);

    const failures: string[] = [];

    // First-link duplicate path: if the user opted in, clone the planner save
    // and apply changes to the clone. The original stays untouched. All
    // subsequent api.* calls in this function target `targetSaveFileId`, which
    // is either the clone's id or the original save's id.
    let targetSaveFileId = saveFileId;
    if (duplicateFirst && !currentSourceFilename) {
      try {
        const dup = await api.duplicateSaveFile(saveFileId);
        targetSaveFileId = dup.id;
      } catch (e) {
        console.error('[GameReimport] duplicate failed:', e);
        api.logImportEvent({
          saveFileId, kind: 'resync', ok: false,
          errorSummary: `Duplicate-first failed: ${(e as Error).message}`,
          durationMs: Date.now() - startedAt,
        });
        setError({
          title: "Couldn't make the copy.",
          detail: <>Your original plan is untouched. {(e as Error).message}</>,
        });
        setStep('review');
        return;
      }
    }

    // When applying destructively to the original save (not a fresh clone),
    // park a faithful copy in the trash first so a bad re-import is recoverable
    // (E4). Abort if the safety backup can't be made — recoverability is the point.
    if (targetSaveFileId === saveFileId) {
      try {
        await api.snapshotSaveFile(targetSaveFileId);
      } catch (e) {
        console.error('[GameReimport] pre-apply snapshot failed:', e);
        api.logImportEvent({
          saveFileId, kind: 'resync', ok: false,
          errorSummary: `Pre-apply backup failed: ${(e as Error).message}`,
          durationMs: Date.now() - startedAt,
        });
        setError({
          title: "Couldn't make a backup first.",
          detail: <>Stopping here rather than syncing without one. {(e as Error).message}</>,
        });
        setStep('review');
        return;
      }
    }

    // Pack ownership: union in what this save proves, now that the user has
    // actually committed to the sync. Non-destructive (adds, never removes),
    // and account-wide, so it lands on every save they have.
    const provenPacks = [...detectPacksFromSave(parsedSave)];
    usePackOwnership.getState().unionAutoDetected(provenPacks);
    // Also record the save's OWN evidence — the showcase's "Packs used" pills
    // read this per-save list, not the account-wide union. Fire-and-forget:
    // the sync must not fail over a cosmetic field.
    api.setDetectedPacks(saveFileId, provenPacks).catch(() => {});

    // Build lookup tables we'll need throughout. These mutate as we add new
    // entities below so subsequent steps can reference them.
    const hhSourceIdToPlannerId = new Map<string, string>();
    for (const hh of Object.values(plannerHouseholds)) {
      if (hh.sourceId) hhSourceIdToPlannerId.set(hh.sourceId, hh.id);
    }
    const simSourceIdToPlannerId = new Map<string, string>();
    for (const s of Object.values(plannerSims)) {
      if (s.sourceId) simSourceIdToPlannerId.set(s.sourceId, s.id);
    }
    // Bare-hex source ids of sims created during THIS apply — these join the
    // family sync's "roster" set alongside the store's active sims.
    const createdSimSourceHexes = new Set<string>();

    // Resolve a planner sim id for a sim source_id (needed by small-business
    // ownership — owner is the specific owning sim). Null when the owning sim
    // isn't in the current roster.
    function plannerSimIdForSimSource(simSourceId: string | null): string | null {
      if (!simSourceId) return null;
      return simSourceIdToPlannerId.get(simSourceId) ?? null;
    }

    try {
      // ── 0. Pre-apply: heal household + club lot drift ──────────────────
      // Each entity's *.assigned_lot_key field can drift from the lot's
      // membership array (lot.household_ids / lot.club_ids) after a partial
      // failure or earlier-buggy sync. The lot side is what the user sees in
      // the lot modal, so trust it and rewrite the household/club side to
      // match. Invisible to the user — no UI surface, just data cleanup.
      setApplyProgress('Reconciling lot assignments…');

      const lotByHouseholdId = new Map<string, string>();
      const lotByClubId = new Map<string, string>();
      for (const lot of Object.values(plannerLots)) {
        for (const hhId of lot.householdIds) if (!lotByHouseholdId.has(hhId)) lotByHouseholdId.set(hhId, lot.lotKey);
        for (const cId of lot.clubIds) if (!lotByClubId.has(cId)) lotByClubId.set(cId, lot.lotKey);
      }
      for (const hh of Object.values(plannerHouseholds)) {
        const lotSide = lotByHouseholdId.get(hh.id) ?? null;
        if (lotSide !== hh.assignedLotKey) {
          try {
            if (lotSide) await api.assignHousehold(targetSaveFileId, hh.id, lotSide, { displace: true });
            else await api.unassignHousehold(targetSaveFileId, hh.id);
          } catch (e) {
            failures.push(`Heal household ${hh.name}: ${(e as Error).message}`);
          }
        }
      }
      for (const c of Object.values(plannerClubs)) {
        const lotSide = lotByClubId.get(c.id) ?? null;
        if (lotSide !== c.assignedLotKey) {
          try {
            if (lotSide) await api.assignClub(targetSaveFileId, c.id, lotSide);
            else await api.unassignClub(targetSaveFileId, c.id);
          } catch (e) {
            failures.push(`Heal club ${c.name}: ${(e as Error).message}`);
          }
        }
      }

      // ── 0b. Club coherence (C2) — drop a club off a hangout the save turned
      // into a club-ineligible lot type. Runs AFTER the drift-heal above so the
      // heal can't re-assign it. unassignClub clears both sides transactionally.
      for (const y of clubYields) {
        try {
          await api.unassignClub(targetSaveFileId, y.clubId);
        } catch (e) {
          failures.push(`Club ${y.clubId} hangout yield: ${(e as Error).message}`);
        }
      }

      // ── 1. Lot updates + baseline refresh, in ONE request per lot ──────
      // The two used to be separate calls, and that split was the only way a lot
      // could end up permanently wrong: if the value write failed and the
      // baseline write succeeded, the lot kept its old name/type while the
      // baseline claimed the save had already reported the new one — so every
      // later sync read it as "you edited this, the save didn't" and left it
      // alone forever. One PATCH is one row update, so they now fail together
      // and the next sync simply tries again.
      //
      // The two halves carry DIFFERENT values and must not be conflated:
      //   customName/customType ← u.resolved, the 3-way merge (planner-kept
      //     fields keep their value; save-won fields take the incoming one)
      //   lastImportedState     ← the RAW save snapshot, never the merge
      //
      // The baseline half is write-on-change (skip when it already matches
      // reality): avoids a write for every lot in the world, and self-heals a
      // stale or pre-versioned baseline on the first sync after it shipped.
      setApplyProgress('Updating lots…');
      const lotPatches = new Map<string, { customName?: string; customType?: string; sourceId?: string; lastImportedState?: object }>();
      for (const u of diff.lots.updates) {
        if (!selected.has(`lots:update:${u.plannerId}`)) continue;
        lotPatches.set(u.plannerId, { customName: u.resolved.customName, customType: u.resolved.customType });
      }
      for (const [lotKey, snap] of lotSaveSnaps) {
        const plannerLot = plannerLots[lotKey];
        if (!plannerLot) continue;
        const stored = plannerLot.lastSaved ?? { customName: plannerLot.name, customType: plannerLot.defaultType };
        if (stored.customName === snap.customName && stored.customType === snap.customType) continue;
        const patch = lotPatches.get(lotKey) ?? {};
        patch.lastImportedState = makeLotBaseline(snap);
        lotPatches.set(lotKey, patch);
      }
      // Remember each apartment unit's zone id (write-on-change). This is what
      // lets the NEXT sync identify a renamed unit: the units of one building
      // share a field5 and are otherwise told apart only by name.
      for (const [zoneHex, lotKey] of lotZoneAssignments) {
        const plannerLot = plannerLots[lotKey];
        if (!plannerLot || plannerLot.sourceId === zoneHex) continue;
        const patch = lotPatches.get(lotKey) ?? {};
        patch.sourceId = zoneHex;
        lotPatches.set(lotKey, patch);
      }
      // Batched: a lot patch touches only its own row. Nothing here assigns an
      // occupant, so there's no capacity check to race.
      await runChunked([...lotPatches], async ([lotKey, patch]) => {
        try {
          await api.updateLot(targetSaveFileId, lotKey, patch);
        } catch (e) {
          failures.push(`Lot ${lotKey}: ${(e as Error).message}`);
        }
      });

      // ── 2. Household updates ───────────────────────────────────────────
      // Lot reconciliation rules (also used for clubs and SBs below):
      //  - next.assignedLotKey is set  → always assignHousehold (idempotent
      //                                  when no real move; heals drift).
      //  - next is null AND parsed save says no lot → unassign (legit unassign).
      //  - next is null AND parsed save HAD a lot we couldn't match
      //                                → skip; don't risk an unwanted unassign.
      // Sims-by-id for re-classifying provenance as households change (e.g. an
      // EA premade you started playing flips to Yours). Provenance is derived
      // game-truth — silently refreshed, never diffed.
      const reSimsById = new Map<bigint, ParsedSim>();
      for (const s of parsedSave.sims) reSimsById.set(s.id, s);

      setApplyProgress('Updating households…');
      for (const u of diff.households.updates) {
        if (!selected.has(`households:update:${u.plannerId}`)) continue;
        // `r` is the merge — what the record becomes. `u.nextSnapshot` is the raw
        // save value and is ONLY the new baseline. Writing the raw snapshot over
        // the record would undo every edit you made to a household the game also
        // touched in some other field.
        const r = u.resolved;
        const next = u.nextSnapshot;
        try {
          const parsedHh = parsedSave.households.find((h) => h.id.toString(16) === u.sourceId);
          const origin = parsedHh ? classifyHousehold(parsedHh, reSimsById, parsedSave.ownerAccountId) : null;
          await api.updateHousehold(targetSaveFileId, u.plannerId, {
            name: r.name,
            composition: r.composition,
            description: r.description,
            ...(origin ? { provenance: origin.bucket, provenanceSub: origin.sub, creatorName: origin.creator } : {}),
            lastImportedState: next,
          });
          const gameHasLot = parsedHh ? parsedHh.lotId !== null : false;
          try {
            if (r.assignedLotKey) {
              // displace: the save says this household lives here, so a plan-only
              // household parked on the lot steps aside rather than blocking it.
              await api.assignHousehold(targetSaveFileId, u.plannerId, r.assignedLotKey, { displace: true });
            } else if (!gameHasLot) {
              await api.unassignHousehold(targetSaveFileId, u.plannerId);
            }
          } catch (e) {
            failures.push(`Household ${u.plannerId} lot move: ${(e as Error).message}`);
          }
        } catch (e) {
          failures.push(`Household ${u.plannerId}: ${(e as Error).message}`);
        }
      }

      // ── 2.4. Realization auto-adopt (Track B, Pass 2) — established links only.
      // Match plan-only shells (planned-move targets + invented/CAS households)
      // to the brand-new real households this sync surfaced, so the adds block
      // adopts them IN PLACE (shell keeps its planner id + notes + funds target,
      // takes the real source id) rather than creating a duplicate. Skipped on
      // first-link, which keeps its documented coexist-and-manually-dedup flow
      // (and where the clone path would remap ids out from under us anyway).
      const adoptByRealSourceId = new Map<string, string>(); // realSourceId → shell planner id
      if (currentSourceFilename) {
        const shellInputs = Object.values(plannerHouseholds)
          .filter((h) => h.sourceId == null)
          .map((h, i) => ({
            shellId: h.id,
            order: i, // stable tiebreak; only matters on the rare two-shells-one-household contest
            moverSourceIds: Object.values(plannerSims)
              .filter((s) => s.plannedMoveHouseholdId === h.id && s.sourceId)
              .map((s) => s.sourceId as string),
            assignedLotKey: h.assignedLotKey,
          }));
        const incoming = diff.households.adds.map((a) => {
          const parsedHh = parsedSave.households.find((ph) => ph.id.toString(16) === a.sourceId);
          return {
            sourceId: a.sourceId,
            memberSourceIds: parsedHh ? parsedHh.simIds.map((id) => id.toString(16)) : [],
            assignedLotKey: a.nextSnapshot.assignedLotKey,
          };
        });
        for (const adopt of detectAdoptions(shellInputs, incoming)) {
          adoptByRealSourceId.set(adopt.realSourceId, adopt.shellId);
        }
      }

      // ── 2.5. Household adds (with their sims) ──────────────────────────
      // Must happen BEFORE sim updates: a sim that "moved" to a brand-new
      // household needs that household to exist in the planner first,
      // otherwise the sim-update step skips the householdId change silently.
      // Two passes, because this is where a big sync spends most of its life: a
      // save arriving with hundreds of new households, each with several sims,
      // was one create at a time — the single largest block of requests a sync
      // makes. Creating a household and creating a sim touch nothing but their
      // own rows, so pass A batches them. Only the LOT work is contentious (the
      // assign route reads a lot's occupants, decides on capacity, then writes),
      // so pass B does that sequentially afterwards. Assignment used to happen
      // between the household and its sims; nothing depended on that order.
      setApplyProgress('Adding new households…');
      const lotWork: Array<{ plannerId: string; lotKey: string }> = [];
      await runChunked(diff.households.adds, async (a) => {
        if (!selected.has(`households:add:${a.sourceId}`)) return;
        const next = a.nextSnapshot;
        try {
          const parsedHh = parsedSave.households.find((h) => h.id.toString(16) === a.sourceId);
          const origin = parsedHh ? classifyHousehold(parsedHh, reSimsById, parsedSave.ownerAccountId) : null;
          const adoptShellId = adoptByRealSourceId.get(a.sourceId);
          let created: { id: string };
          if (adoptShellId) {
            // Adopt in place: the plan-only shell BECOMES this real household.
            // Mirror the game identity (name/composition/description/lot +
            // provenance) and take its source id; the shell's notes + funds
            // target survive because we don't touch those fields.
            await api.updateHousehold(targetSaveFileId, adoptShellId, {
              name: next.name,
              composition: next.composition,
              description: next.description,
              sourceId: a.sourceId,
              ...(origin ? { provenance: origin.bucket, provenanceSub: origin.sub, creatorName: origin.creator } : {}),
              lastImportedState: next,
            });
            created = { id: adoptShellId };
            // Wholesale membership swap: drop the shell's invented placeholder
            // sims (source-less) — the real roster is linked below. Reality wins
            // on membership; no attempt to pair placeholders to real sims.
            await Promise.all(Object.values(plannerSims)
              .filter((s) => s.householdId === adoptShellId && !s.sourceId)
              .map(async (s) => {
                try { await api.deleteSim(targetSaveFileId, s.id); }
                catch (e) { failures.push(`Adopt cleanup (${s.firstName || s.id}): ${(e as Error).message}`); }
              }));
          } else {
            created = await api.createHousehold(targetSaveFileId, {
              name: next.name,
              composition: next.composition,
              description: next.description,
              sourceId: a.sourceId,
              ...(origin ? { provenance: origin.bucket, provenanceSub: origin.sub, creatorName: origin.creator } : {}),
              lastImportedState: next,
            });
          }
          hhSourceIdToPlannerId.set(a.sourceId, created.id);
          // Queued for pass B — the lot is the one thing that can't be raced.
          if (next.assignedLotKey) lotWork.push({ plannerId: created.id, lotKey: next.assignedLotKey });
          // Also create the household's sims (which were filtered out of the
          // top-level adds bucket as orphans). A household's sims are distinct
          // rows and a sim belongs to exactly one household, so nothing here
          // contends — same shape the first import has always used.
          if (parsedHh) {
            await Promise.all(parsedHh.simIds.map(async (simBigId) => {
              const ps = reSimsById.get(simBigId);
              if (!ps) return;
              try {
                const traitKeys = ps.traitIds
                  .map((id) => '0x' + id.toString(16))
                  .filter((key) => key in STOCK_TRAITS || isDegreeTrait(key) || key in ROLE_TRAITS);
                const aspirationKey = ps.aspirationId !== null
                  ? '0x' + ps.aspirationId.toString(16)
                  : null;
                const cleanedAspiration = aspirationKey && aspirationKey in STOCK_ASPIRATIONS
                  ? aspirationKey
                  : null;
                const simSnap: SimSnapshot = {
                  firstName: ps.firstName,
                  lastName: ps.lastName,
                  gender: ps.gender,
                  lifestage: ps.lifestage,
                  species: ps.species,
                  petSubtype: ps.petSubtype,
                  petBreed: ps.petBreed,
                  occult: ps.occult,
                  isGhost: ps.isGhost,
                  householdSourceId: a.sourceId,
                  traitIds: traitKeys,
                  aspirationId: cleanedAspiration,
                  deathCause: ps.deathCause,
                  enrolledDegree: ps.enrolledDegree,
                  career: ps.career,
                };
                // Already in the planner as a tree-only/culled/stub ancestor?
                // Promote that row back onto the roster instead of duplicating.
                const existingSimId = simSourceIdToPlannerId.get(ps.id.toString(16));
                if (existingSimId) {
                  await api.updateSim(targetSaveFileId, existingSimId, {
                    householdId: created.id,
                    recordStatus: 'active',
                    firstName: ps.firstName,
                    lastName: ps.lastName,
                    gender: ps.gender,
                    lifestage: ps.lifestage,
                    species: ps.species,
                    petSubtype: ps.petSubtype,
                    petBreed: ps.petBreed,
                    occult: ps.occult,
                    isGhost: ps.isGhost,
                    lastImportedState: simSnap,
                    traitIds: traitKeys,
                    aspirationId: cleanedAspiration,
                    deathCause: ps.deathCause,
                    enrolledDegree: ps.enrolledDegree,
                    career: ps.career,
                  });
                  createdSimSourceHexes.add(ps.id.toString(16));
                  return;
                }
                const createdSim = await api.createSim(targetSaveFileId, {
                  householdId: created.id,
                  firstName: ps.firstName,
                  lastName: ps.lastName,
                  gender: ps.gender,
                  lifestage: ps.lifestage,
                  species: ps.species,
                  petSubtype: ps.petSubtype,
                  petBreed: ps.petBreed,
                  occult: ps.occult,
                  isGhost: ps.isGhost,
                  sourceId: ps.id.toString(16),
                  lastImportedState: simSnap,
                  traitIds: traitKeys,
                  aspirationId: cleanedAspiration,
                  deathCause: ps.deathCause,
                  enrolledDegree: ps.enrolledDegree,
                  career: ps.career,
                });
                simSourceIdToPlannerId.set(ps.id.toString(16), createdSim.id);
                createdSimSourceHexes.add(ps.id.toString(16));
              } catch (e) {
                failures.push(`Sim in ${next.name}: ${(e as Error).message}`);
              }
            }));
          }
        } catch (e) {
          failures.push(`Household ${next.name}: ${(e as Error).message}`);
        }
      });

      // ── 2.5b. Pass B — put the new households on their lots, one at a time.
      // Sequential on purpose: the assign route reads a lot's occupants, works
      // out capacity, then writes, so two of these racing for the same lot can
      // both decide there's room. Far fewer calls than the creates above, so
      // serialising them costs little.
      for (const w of lotWork) {
        // First-link single-occupancy-safe coexist: on a home lot that can hold
        // only one household, reality takes the lot — any plan-only household
        // already parked there steps aside (unassigned, still exists) so we
        // never double-occupy. Established re-syncs adopt the plan instead and
        // never reach this branch.
        if (!currentSourceFilename) {
          const plannedLot = plannerLots[w.lotKey];
          const singleOccupancy = !!plannedLot
            && getLotCategory(plannedLot.customType) === 'home'
            && plannedLot.customType !== 'Residential Rental';
          if (singleOccupancy) {
            for (const ph of Object.values(plannerHouseholds)) {
              if (ph.sourceId == null && ph.assignedLotKey === w.lotKey) {
                try { await api.unassignHousehold(targetSaveFileId, ph.id); }
                catch (e) { failures.push(`Step aside ${ph.name}: ${(e as Error).message}`); }
              }
            }
          }
        }
        await api.assignHousehold(targetSaveFileId, w.plannerId, w.lotKey, { displace: true }).catch(() => {});
      }

      // ── 3. Sim updates ─────────────────────────────────────────────────
      setApplyProgress('Updating sims…');
      // Planned-move sync, Pass 1: a sim's "Planned move → X" sticker is spent
      // the moment the sim actually moves households in-game — match or not.
      // We drive the decision through the tested rule (stickersToClearOnMove)
      // and gate it on the move being APPLIED this sync (selected), so deferring
      // a move in the wizard keeps the plan. See lib/reimport/plannedMoveSync.
      const clearStickerFor = new Set(
        stickersToClearOnMove(
          diff.sims.updates
            .filter((u) => selected.has(`sims:update:${u.plannerId}`))
            .map((u) => {
              const moveChange = u.changes.find((c) => c.field === 'householdSourceId');
              return {
                simId: u.plannerId,
                plannedMoveHouseholdId: plannerSims[u.plannerId]?.plannedMoveHouseholdId,
                // No householdSourceId change → feed prev === next so the rule
                // reads it as "stayed put" and keeps the sticker.
                prevHouseholdSourceId: moveChange
                  ? (moveChange.current as string | null | undefined)
                  : u.nextSnapshot.householdSourceId,
                nextHouseholdSourceId: u.nextSnapshot.householdSourceId,
              };
            }),
        ),
      );
      // Batched: each sim's update is its own row. The household a sim moves to
      // is set by id on that same row — it doesn't touch lot occupancy — so
      // there's nothing here for two sims to contend over.
      await runChunked(diff.sims.updates, async (u) => {
        if (!selected.has(`sims:update:${u.plannerId}`)) return;
        // Same split as households: `r` is the merge that gets written, `next`
        // is the raw save value and only ever the baseline.
        const r = u.resolved;
        const next = u.nextSnapshot;
        try {
          // The household this sim now belongs to — read from the SAVE, not the
          // merge: which household a save-backed sim lives in is game truth (a
          // planned move is a separate field), so this is the move being applied.
          const targetHhId = hhSourceIdToPlannerId.get(next.householdSourceId);
          await api.updateSim(targetSaveFileId, u.plannerId, {
            ...(targetHhId ? { householdId: targetHhId } : {}),
            firstName: r.firstName,
            lastName: r.lastName,
            gender: r.gender,
            lifestage: r.lifestage,
            species: r.species,
            petSubtype: r.petSubtype,
            petBreed: r.petBreed,
            occult: r.occult,
            isGhost: r.isGhost,
            lastImportedState: next,
            // Without these, the diff-detected trait/aspiration changes never
            // make it to the DB and re-synced sims stay empty.
            traitIds: r.traitIds ?? [],
            aspirationId: r.aspirationId ?? null,
            deathCause: r.deathCause ?? null,
            enrolledDegree: r.enrolledDegree ?? null,
            career: r.career ?? null,
            // Pass 1: spend the planned-move sticker on a real in-game move.
            ...(clearStickerFor.has(u.plannerId) ? { plannedMoveHouseholdId: null } : {}),
          });
        } catch (e) {
          failures.push(`Sim ${u.plannerId}: ${(e as Error).message}`);
        }
      });

      // ── 4. Club updates ────────────────────────────────────────────────
      setApplyProgress('Updating clubs…');
      for (const u of diff.clubs.updates) {
        if (!selected.has(`clubs:update:${u.plannerId}`)) continue;
        const r = u.resolved;              // the merge — what the club becomes
        const next = u.nextSnapshot;       // the raw save value — baseline only
        try {
          const memberIds = r.memberSimSourceIds
            .map((s) => simSourceIdToPlannerId.get(s))
            .filter((s): s is string => s !== undefined);
          await api.updateClub(targetSaveFileId, u.plannerId, {
            name: r.name,
            icon: r.icon,
            description: r.description,
            memberSimIds: memberIds,
            lastImportedState: next,
          });
          const parsedClub = parsedSave.clubs.find((c) => c.id.toString(16) === u.sourceId);
          const gameHasHangout = parsedClub ? parsedClub.hangoutZoneId !== null : false;
          try {
            if (r.assignedLotKey) {
              await api.assignClub(targetSaveFileId, u.plannerId, r.assignedLotKey);
            } else if (!gameHasHangout) {
              await api.unassignClub(targetSaveFileId, u.plannerId);
            }
          } catch (e) {
            failures.push(`Club ${u.plannerId} lot move: ${(e as Error).message}`);
          }
        } catch (e) {
          failures.push(`Club ${u.plannerId}: ${(e as Error).message}`);
        }
      }

      // ── 5. Small-business reviewed fields (name / icon / description / owner)
      // NOT written here — collected, and written by 6.6b in the same request as
      // the silent detail refresh, the reconciled lot set and the baseline. See
      // that block for why one request rather than four.
      const sbReviewedPatch = new Map<string, Parameters<typeof api.updateSmallBusiness>[2]>();
      for (const u of diff.smallBusinesses.updates) {
        if (!selected.has(`smallBusinesses:update:${u.plannerId}`)) continue;
        const r = u.resolved;
        const patchBody: Parameters<typeof api.updateSmallBusiness>[2] = {
          name: r.name,
          icon: r.icon,
          description: r.description,
        };
        // Only send ownerSimId if the diff actually flagged the owner changing
        // — otherwise an unresolvable owner sim_source_id would null the field
        // on a routine name/icon update.
        if (u.changes.some((c) => c.field === 'ownerSimSourceId')) {
          patchBody.ownerSimId = plannerSimIdForSimSource(r.ownerSimSourceId);
        }
        sbReviewedPatch.set(u.plannerId, patchBody);
      }

      // ── 6a. Season length — MIRROR UNTIL OVERRIDE (decide first) ───────
      // The plan's season length (what the Holidays calendar renders) is
      // authored; it does NOT snap back to the save on every sync. We adopt the
      // save's length ONLY when it actually CHANGED since our last sync — a real
      // in-game change restarts mirroring and supersedes any manual override.
      // null baseline = pre-feature save → adopt to seed it. Decided up front so
      // imported holidays below re-scale to the length the plan will end up at.
      const saveSeasonLen = parsedSave.seasonLengthWeeks;
      const adoptLen = !!saveSeasonLen && (plannerImportedSeasonLength == null || saveSeasonLen !== plannerImportedSeasonLength);
      const finalPlanLength = adoptLen ? saveSeasonLen : plannerSeasonLength;
      if (adoptLen) {
        try { await api.setSeasonLength(targetSaveFileId, saveSeasonLen, saveSeasonLen); } catch (e) { failures.push(`Season length: ${(e as Error).message}`); }
      }

      // ── 6b. Holiday updates (reviewable identity + snapshot) ───────────
      setApplyProgress('Updating holidays…');
      for (const u of diff.holidays.updates) {
        if (!selected.has(`holidays:update:${u.plannerId}`)) continue;
        const r = u.resolved;
        const next = u.nextSnapshot;
        const sd = scaledFor(r.scaledDates, finalPlanLength);
        try {
          await api.updateHoliday(targetSaveFileId, u.plannerId, {
            name: r.name,
            icon: r.icon,
            ...(sd ? { season: sd.season, day: sd.day } : {}),
            scaledDates: r.scaledDates,
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Holiday ${u.plannerId}: ${(e as Error).message}`);
        }
      }

      // ── 6c. Refresh every matched imported holiday SILENTLY ────────────
      // Traditions/time-off/decoration aren't in the diffed snapshot, and the
      // displayed day/season must re-scale to the plan's final length (exactly
      // like the game's per-length calendar). Refresh unconditionally; PATCH only
      // the fields that changed. Hand-made holidays that no longer fit the length
      // are NOT parked here — the Holidays view surfaces them as "set aside".
      for (const h of Object.values(plannerHolidays)) {
        if (!h.sourceId) continue;
        const parsedH = parsedSave.holidays.find((ph) => ph.holidayType.toString(16) === h.sourceId);
        if (!parsedH) continue;
        const patch = holidayRefreshPatch(h, parsedH, finalPlanLength);
        if (Object.keys(patch).length === 0) continue;
        logRefresh('holiday', h.name, Object.keys(patch));
        try {
          await api.updateHoliday(targetSaveFileId, h.id, patch);
        } catch (e) {
          failures.push(`Holiday ${h.id} refresh: ${(e as Error).message}`);
        }
      }

      // ── 6.5. Dynasty updates (read-only game data; notes preserved) ────
      setApplyProgress('Updating dynasties…');
      for (const u of diff.dynasties.updates) {
        if (!selected.has(`dynasties:update:${u.plannerId}`)) continue;
        const r = u.resolved;
        const next = u.nextSnapshot;
        try {
          const headSimId = r.headSimSourceId ? (simSourceIdToPlannerId.get(r.headSimSourceId) ?? null) : null;
          const members = r.members
            .map((m) => { const pid = simSourceIdToPlannerId.get(m.sourceId); return pid ? { simId: pid, order: m.order, role: m.role } : null; })
            .filter((m): m is { simId: string; order: number; role: string | null } => m !== null);
          // NAME is deliberately absent: it's reconciled in 6.5b against the
          // planner row rather than the baseline, so a rename that never landed
          // heals on a later sync instead of being hidden by its own baseline.
          await api.updateDynasty(targetSaveFileId, u.plannerId, {
            description: r.description,
            headSimId, members,
            valueIds: r.valueIds,
            crestBgHash: r.crestBgHash,
            crestFgHash: r.crestFgHash,
            prestige: r.prestige,
            unity: r.unity,
            perkIds: r.perkIds,
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Dynasty ${u.plannerId}: ${(e as Error).message}`);
        }
      }

      // ── 6.5b. Alliances/rivalries — refresh SILENTLY for ALL dynasties ──
      // These aren't in the diffed snapshot (per the re-sync redesign, only
      // top-level add/remove surfaces for dynasties), so they don't ride on a
      // selected update. Refresh every matched dynasty unconditionally on each
      // sync so they stay current even when nothing else about the dynasty
      // changed (and regardless of which changes the user selected). Dynasties
      // are few, so the extra PATCHes are cheap; partial PATCH leaves all other
      // fields (incl. notes) untouched.
      for (const d of Object.values(plannerDynasties)) {
        if (!d.sourceId) continue;
        const parsedDyn = parsedSave.dynasties.find((pd) => pd.id.toString(16) === d.sourceId);
        if (!parsedDyn) continue;
        // Skip the PATCH when nothing changed (avoid needless writes).
        const { changed, fields, allianceSourceIds, rivalrySourceIds, name } = dynastyRefresh(d, parsedDyn);
        if (!changed) continue;
        logRefresh('dynasty', d.name, fields);
        try {
          await api.updateDynasty(targetSaveFileId, d.id, {
            allianceSourceIds, rivalrySourceIds,
            ...(name !== null ? { name } : {}),
          });
        } catch (e) {
          failures.push(`Dynasty ${d.id} alliances: ${(e as Error).message}`);
        }
      }

      // ── 6.6. Club requirements / activities / invite / leader — refresh SILENTLY ─
      // None of these are in the diffed ClubSnapshot (only top-level add/remove +
      // name/lot surface per the re-sync redesign), so refresh every matched club
      // unconditionally. leaderSimId maps save→planner; criteria/rules are stored
      // as-parsed (JSON-safe). Partial PATCH leaves notes/etc. untouched.
      for (const c of Object.values(plannerClubs)) {
        if (!c.sourceId) continue;
        const parsedC = parsedSave.clubs.find((pc) => pc.id.toString(16) === c.sourceId);
        if (!parsedC) continue;
        const { changed, fields, leaderSimId } = clubRefresh(c, parsedC, simSourceIdToPlannerId);
        if (!changed) continue;
        logRefresh('club', c.name, fields);
        try {
          await api.updateClub(targetSaveFileId, c.id, {
            leaderSimId, criteria: parsedC.criteria, rules: parsedC.rules, inviteOnly: parsedC.inviteOnly,
            hangoutVenueTypeId: parsedC.hangoutVenueTypeId,
          });
        } catch (e) {
          failures.push(`Club ${c.id} requirements: ${(e as Error).message}`);
        }
      }

      // ── 6.6b. Small businesses — EVERYTHING about one business, in ONE request
      // Reviewed fields (name/icon/description/owner, collected in step 5), rich
      // fields (employees/criteria/activities/fee/price/renown/alignment/perks,
      // game-authoritative → refreshed silently), the reconciled lot SET, and the
      // baseline all land in a single PATCH = a single row update.
      //
      // They used to be up to four separate requests, and the lot set was the
      // dangerous one: assign/unassign landing separately from the baseline meant
      // a failed lot move plus a written baseline left the business on the wrong
      // lots, with the baseline now agreeing with the save so no later sync ever
      // re-examined it. Nothing in the app could fix that either — a business
      // from your save has no lot controls in the UI. Hence the route taking the
      // whole lot set at once.
      //
      // The lot rule itself is unchanged (reconcileBusinessLots): your
      // assignments stick; the game only overrides when it actually moved the
      // business. This is still the SINGLE writer of the baseline, always
      // refreshed to current game truth so the next sync's relocation detection
      // isn't fooled by a stale one.
      setApplyProgress('Updating small businesses…');
      const sbIconSet = new Set(SMALL_BUSINESS_ICONS);
      const sbZoneToLotKey = buildZoneKeyIndex(parsedSave.lots, lotZoneAssignments);
      for (const sb of Object.values(plannerSBs)) {
        if (!sb.sourceId) continue;
        const parsedSB = parsedSave.smallBusinesses.find((ps) => ps.id.toString(16) === sb.sourceId);
        if (!parsedSB) continue;
        const { detailsChanged, lotsChanged, fields, employeeSimIds, lotsResult } = smallBusinessRefresh(
          sb, parsedSB, simSourceIdToPlannerId, sbZoneToLotKey, sbLotBaselines.get(sb.sourceId) ?? [],
        );
        if (fields.length) logRefresh('business', sb.name, fields);

        // Baseline rebuilt from the parse so it carries the full lot set +
        // scalar fields. Raw game truth, never the reconciled result.
        const icon = parsedSB.iconInstance
          ? (sbIconSet.has(parsedSB.iconInstance) ? parsedSB.iconInstance : UNKNOWN_SMALL_BUSINESS_ICON)
          : '';
        const patch: Parameters<typeof api.updateSmallBusiness>[2] = {
          ...(sbReviewedPatch.get(sb.id) ?? {}),
          lastImportedState: parsedSmallBusinessToSnapshot(parsedSB, icon, sbZoneToLotKey),
        };
        if (detailsChanged) {
          Object.assign(patch, {
            employeeSimIds, customerCriteria: parsedSB.customerCriteria, activities: parsedSB.activities,
            feeMode: parsedSB.feeMode, priceModifierPct: parsedSB.priceModifierPct,
            renownRank: parsedSB.renownRank, alignment: parsedSB.alignment, perkPoints: parsedSB.perkPoints,
          });
        }
        // Send the lot set only when it actually moved — an unchanged set would
        // just rewrite the same value, and the editor's own assignments are the
        // ones being preserved here.
        if (lotsChanged) patch.assignedLotKeys = lotsResult;

        try {
          await api.updateSmallBusiness(targetSaveFileId, sb.id, patch);
        } catch (e) {
          failures.push(`Small business ${sb.name}: ${(e as Error).message}`);
        }
      }

      // ── 6.6c. B2 yield — drop businesses off a lot a household moved onto ──
      // Predicted at analyze (sbYields). Runs AFTER lot reconciliation so the
      // business is actually on the lot when we remove it. A home business owned
      // by a resident is never in this list. The lot's TYPE is handled by 6.6d,
      // independently, so a lot stranded as a venue after its business already
      // moved off still gets corrected.
      for (const y of sbYields) {
        try {
          await api.unassignSmallBusinessLot(targetSaveFileId, y.sbId, y.lotKey);
        } catch (e) {
          failures.push(`Small business ${y.sbId} yield: ${(e as Error).message}`);
        }
      }

      // ── 6.6d. Venue-lot coherence — a lot a household moved onto can't stay a
      // Small Business Venue, so it takes the game's reported (residential) type.
      // Runs after step-1 lot updates so it isn't clobbered.
      for (const r of lotTypeReverts) {
        try {
          await api.updateLot(targetSaveFileId, r.lotKey, { customType: r.gameType });
        } catch (e) {
          failures.push(`Lot ${r.lotKey} venue revert: ${(e as Error).message}`);
        }
      }

      // ── 6.6-pre. Venues you built let go of a lot they can no longer hold ──
      // MUST run before the venue adds below: when the save now reports a real
      // custom venue on a lot one of yours claimed, the lot has to be free
      // before the add can take it (one venue per lot is a hard constraint).
      // The venue you built is never edited or deleted here — it keeps its name,
      // roles and schedule and simply becomes lot-less.
      for (const r of venueLotReleases) {
        try {
          await api.updateCustomVenue(targetSaveFileId, r.venueId, { lotKey: null });
          console.info(`[sync] planned venue ${r.venueId} released ${r.lotKey} (${r.reason})`);
        } catch (e) {
          failures.push(`Custom venue ${r.venueId} lot release: ${(e as Error).message}`);
        }
      }

      // ── 6.6. Custom-venue updates (read-only game data; notes preserved) ─
      setApplyProgress('Updating custom venues…');
      for (const u of diff.customVenues.updates) {
        if (!selected.has(`customVenues:update:${u.plannerId}`)) continue;
        const r = u.resolved;
        const next = u.nextSnapshot;
        try {
          await api.updateCustomVenue(targetSaveFileId, u.plannerId, {
            name: r.name,
            roles: r.roles,
            slots: r.slots,
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Custom venue ${u.plannerId}: ${(e as Error).message}`);
        }
      }

      // ── 7. Sim adds (newborns into existing households) ────────────────
      setApplyProgress('Adding new sims…');
      for (const a of diff.sims.adds) {
        if (!selected.has(`sims:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        const targetHhId = hhSourceIdToPlannerId.get(next.householdSourceId);
        if (!targetHhId) {
          failures.push(`Sim ${next.firstName}: parent household not in planner`);
          continue;
        }
        try {
          // A "new" sim may already exist as a tree-only/culled/stub ancestor
          // (e.g. a dead relative resurrected into a tracked household).
          // Promote that row back onto the roster instead of duplicating.
          const existingSimId = simSourceIdToPlannerId.get(a.sourceId);
          if (existingSimId) {
            await api.updateSim(targetSaveFileId, existingSimId, {
              householdId: targetHhId,
              recordStatus: 'active',
              firstName: next.firstName,
              lastName: next.lastName,
              gender: next.gender,
              lifestage: next.lifestage,
              species: next.species,
              petSubtype: next.petSubtype,
              petBreed: next.petBreed,
              occult: next.occult,
              isGhost: next.isGhost,
              lastImportedState: next,
              traitIds: next.traitIds ?? [],
              aspirationId: next.aspirationId ?? null,
              enrolledDegree: next.enrolledDegree ?? null,
              career: next.career ?? null,
              // back from the dead → no cause of death anymore
              ...(next.isGhost ? {} : { deathCause: null }),
            });
            createdSimSourceHexes.add(a.sourceId);
            continue;
          }
          const created = await api.createSim(targetSaveFileId, {
            householdId: targetHhId,
            firstName: next.firstName,
            lastName: next.lastName,
            gender: next.gender,
            lifestage: next.lifestage,
            species: next.species,
            petSubtype: next.petSubtype,
            petBreed: next.petBreed,
            occult: next.occult,
            isGhost: next.isGhost,
            sourceId: a.sourceId,
            lastImportedState: next,
            traitIds: next.traitIds ?? [],
            aspirationId: next.aspirationId ?? null,
            deathCause: next.deathCause ?? null,
            enrolledDegree: next.enrolledDegree ?? null,
            career: next.career ?? null,
          });
          simSourceIdToPlannerId.set(a.sourceId, created.id);
          createdSimSourceHexes.add(a.sourceId);
        } catch (e) {
          failures.push(`Sim ${next.firstName}: ${(e as Error).message}`);
        }
      }

      // ── 8. Family tree sync ────────────────────────────────────────────
      // Recompute the genealogy closure against the fresh save and reconcile:
      //  • preserved ancestors: missing-but-genealogy-relevant sims flip off
      //    the roster ('culled', or 'tree_only' when their record survives)
      //  • newly-deceased sims move from the roster into the tree
      //  • missing tree_only/stub rows are created — this is also the
      //    backfill for saves imported before family support existed
      //  • death causes refresh and the import-sourced edge set is replaced
      // Additive: a failure here never fails the sync.
      setApplyProgress('Syncing family tree…');
      try {
        const facts = parsedSave.familyFacts;
        if (facts?.bySim && Object.keys(facts.bySim).length > 0) {
          const parsedSimByHex = new Map(parsedSave.sims.map((s) => ['0x' + s.id.toString(16), s] as const));

          // Auto-applied roster exits, computed at analyze time.
          const flippedIds = new Set<string>();
          // Batched. `flippedIds` is only read after both of these finish, so
          // filling it from inside the batches is safe.
          await runChunked(familySync?.culls ?? [], async (c) => {
            flippedIds.add(c.plannerId);
            try {
              await api.updateSim(targetSaveFileId, c.plannerId, {
                recordStatus: c.recordExists ? 'tree_only' : 'culled',
                householdId: null,
              });
            } catch (e) {
              failures.push(`Preserve ${c.name}: ${(e as Error).message}`);
            }
          });
          await runChunked(familySync?.deceasedFlips ?? [], async (d) => {
            flippedIds.add(d.plannerId);
            const ps = parsedSimByHex.get('0x' + d.sourceHex);
            try {
              await api.updateSim(targetSaveFileId, d.plannerId, {
                recordStatus: 'tree_only',
                householdId: null,
                isGhost: true,
                deathCause: ps?.deathCause ?? null,
              });
            } catch (e) {
              failures.push(`Move ${d.name} to tree: ${(e as Error).message}`);
            }
          });

          // The roster set the closure walks out from: active sims that are
          // staying active, plus everything created/promoted this apply.
          const removedIds = new Set(
            diff.sims.removes.filter((r) => selected.has(`sims:remove:${r.plannerId}`)).map((r) => r.plannerId),
          );
          const importedHex = new Set<string>();
          for (const s of Object.values(plannerSims)) {
            if (!s.sourceId || (s.recordStatus ?? 'active') !== 'active') continue;
            if (flippedIds.has(s.id) || removedIds.has(s.id)) continue;
            importedHex.add('0x' + s.sourceId);
          }
          for (const hex of createdSimSourceHexes) importedHex.add('0x' + hex);

          const plan = planFamilyImport(facts, parsedSave.sims, importedHex);
          const plannerIdByHex = new Map<string, string>();
          for (const [bare, pid] of simSourceIdToPlannerId) plannerIdByHex.set('0x' + bare, pid);

          // Tree-only rows: create the missing, refresh/upgrade the existing
          // (stub → tree_only when the record appears; culled → tree_only when
          // the record returns; plain data refresh otherwise).
          // Batched, like the equivalent loop in the first import. Each hex is a
          // distinct sim, and `plannerIdByHex` is only read by the stub pass and
          // the edge build below — both of which run after this finishes.
          await runChunked(plan.treeOnly, async (hex) => {
            const s = parsedSimByHex.get(hex);
            if (!s) return;
            const traitKeys = s.traitIds.map((id) => '0x' + id.toString(16)).filter((k) => k in STOCK_TRAITS || isDegreeTrait(k) || k in ROLE_TRAITS);
            const aspKey = s.aspirationId !== null ? '0x' + s.aspirationId.toString(16) : null;
            const data = {
              firstName: s.firstName,
              lastName: s.lastName,
              gender: s.gender,
              lifestage: s.lifestage,
              species: s.species,
              petSubtype: s.petSubtype,
              petBreed: s.petBreed,
              occult: s.occult,
              isGhost: s.isGhost,
              traitIds: traitKeys,
              aspirationId: aspKey && aspKey in STOCK_ASPIRATIONS ? aspKey : null,
              deathCause: s.deathCause,
              enrolledDegree: s.enrolledDegree,
              career: s.career,
            };
            const existingId = plannerIdByHex.get(hex);
            try {
              if (existingId) {
                if ((plannerSims[existingId]?.recordStatus ?? 'tree_only') === 'manual') return; // sync-invisible
                await api.updateSim(targetSaveFileId, existingId, { ...data, householdId: null, recordStatus: 'tree_only' });
              } else {
                const created = await api.createSim(targetSaveFileId, {
                  ...data, householdId: null, sourceId: s.id.toString(16), recordStatus: 'tree_only',
                });
                plannerIdByHex.set(hex, created.id);
              }
            } catch { /* non-fatal */ }
          });

          // Stub rows for dangling ancestor refs (the in-game "Unknown"s).
          // An existing row of any status already serves as the tree node.
          await runChunked(plan.stubs, async (hex) => {
            if (plannerIdByHex.has(hex)) return;
            try {
              const created = await api.createSim(targetSaveFileId, {
                householdId: null, firstName: 'Unknown', lastName: '',
                sourceId: hex.replace(/^0x/, ''), recordStatus: 'stub',
              });
              plannerIdByHex.set(hex, created.id);
            } catch { /* non-fatal */ }
          });

          // Death-cause refresh for roster sims — the diff snapshots don't
          // carry deathCause, so reconcile it directly (also backfills
          // playable ghosts imported before death causes existed).
          await runChunked(Object.values(plannerSims), async (s) => {
            if (!s.sourceId || (s.recordStatus ?? 'active') !== 'active') return;
            if (flippedIds.has(s.id) || removedIds.has(s.id)) return;
            const ps = parsedSimByHex.get('0x' + s.sourceId);
            if (!ps) return;
            const cause = ps.deathCause ?? null;
            if ((s.deathCause ?? null) === cause) return;
            try { await api.updateSim(targetSaveFileId, s.id, { deathCause: cause }); } catch { /* non-fatal */ }
          });

          // Replace the import-sourced edge set wholesale (manual edges are
          // untouched server-side).
          const edges = plan.edges
            .map((e) => ({ simAId: plannerIdByHex.get(e.a), simBId: plannerIdByHex.get(e.b), relType: e.relType }))
            .filter((e): e is { simAId: string; simBId: string; relType: SimRelType } => !!e.simAId && !!e.simBId);
          await api.putRelationships(targetSaveFileId, edges);
        }
      } catch (e) {
        console.warn('[GameReimport] family sync failed:', e);
        failures.push(`Family tree sync: ${(e as Error).message}`);
      }

      // ── 9. Club adds ───────────────────────────────────────────────────
      setApplyProgress('Adding new clubs…');
      for (const a of diff.clubs.adds) {
        if (!selected.has(`clubs:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        try {
          const memberIds = next.memberSimSourceIds
            .map((s) => simSourceIdToPlannerId.get(s))
            .filter((s): s is string => s !== undefined);
          const created = await api.createClub(targetSaveFileId, {
            name: next.name,
            icon: next.icon,
            description: next.description,
            memberSimIds: memberIds,
            sourceId: a.sourceId,
            lastImportedState: next,
          });
          if (next.assignedLotKey) {
            await api.assignClub(targetSaveFileId, created.id, next.assignedLotKey).catch(() => {});
          }
        } catch (e) {
          failures.push(`Club ${next.name}: ${(e as Error).message}`);
        }
      }

      // ── 10. Small-business adds ────────────────────────────────────────
      setApplyProgress('Adding new small businesses…');
      for (const a of diff.smallBusinesses.adds) {
        if (!selected.has(`smallBusinesses:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        try {
          const created = await api.createSmallBusiness(targetSaveFileId, {
            name: next.name,
            icon: next.icon,
            description: next.description,
            sourceId: a.sourceId,
            lastImportedState: next,
          });
          const ownerSimId = plannerSimIdForSimSource(next.ownerSimSourceId);
          if (ownerSimId) {
            await api.updateSmallBusiness(targetSaveFileId, created.id, { ownerSimId }).catch(() => {});
          }
          for (const k of next.assignedLotKeys ?? []) {
            await api.assignSmallBusiness(targetSaveFileId, created.id, k).catch(() => {});
          }
        } catch (e) {
          failures.push(`Business ${next.name}: ${(e as Error).message}`);
        }
      }

      // ── 11. Holiday adds ───────────────────────────────────────────────
      setApplyProgress('Adding new holidays…');
      for (const a of diff.holidays.adds) {
        if (!selected.has(`holidays:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        try {
          // An imported holiday owns its canonical date. A hand-made holiday on
          // the same slot isn't parked here — the Holidays view computes that
          // collision and surfaces it as "set aside" (reversible). Place the new
          // holiday at its day for the plan's final length.
          const sd = scaledFor(next.scaledDates, finalPlanLength);
          // Traditions aren't in the diffed snapshot — pull them from the parsed save.
          const parsedH = parsedSave.holidays.find((ph) => ph.holidayType.toString(16) === a.sourceId);
          await api.createHoliday(targetSaveFileId, {
            name: next.name,
            icon: next.icon,
            season: sd?.season ?? 'Spring',
            day: sd?.day ?? 1,
            traditions: parsedH?.traditions.map((t) => t.toString(16)),
            timeOff: parsedH?.timeOff,
            decorationPreset: parsedH?.decorationPreset,
            sourceId: a.sourceId,
            scaledDates: next.scaledDates,
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Holiday ${next.name}: ${(e as Error).message}`);
        }
      }

      // ── 11.5. Dynasty adds ─────────────────────────────────────────────
      setApplyProgress('Adding new dynasties…');
      for (const a of diff.dynasties.adds) {
        if (!selected.has(`dynasties:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        try {
          const headSimId = next.headSimSourceId ? (simSourceIdToPlannerId.get(next.headSimSourceId) ?? null) : null;
          const members = next.members
            .map((m) => { const pid = simSourceIdToPlannerId.get(m.sourceId); return pid ? { simId: pid, order: m.order, role: m.role } : null; })
            .filter((m): m is { simId: string; order: number; role: string | null } => m !== null);
          await api.createDynasty(targetSaveFileId, {
            name: next.name,
            description: next.description,
            headSimId, members,
            valueIds: next.valueIds,
            crestBgHash: next.crestBgHash,
            crestFgHash: next.crestFgHash,
            prestige: next.prestige,
            unity: next.unity,
            perkIds: next.perkIds,
            sourceId: a.sourceId,
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Dynasty ${next.name}: ${(e as Error).message}`);
        }
      }

      // ── 11.6. Custom-venue adds (a.sourceId is the planner lot_key) ────
      setApplyProgress('Adding new custom venues…');
      for (const a of diff.customVenues.adds) {
        if (!selected.has(`customVenues:add:${a.sourceId}`)) continue;
        const next = a.nextSnapshot;
        try {
          await api.createCustomVenue(targetSaveFileId, {
            lotKey: a.sourceId,
            name: next.name,
            roles: next.roles,
            slots: next.slots,
            source: 'import',
            lastImportedState: next,
          });
        } catch (e) {
          failures.push(`Custom venue ${next.name || a.sourceId}: ${(e as Error).message}`);
        }
      }

      // ── 11.7. Preset library (save-global, read-only). Refreshed wholesale
      //    from the new save — not part of the reviewed diff. ────────────────
      try {
        await api.replaceCustomVenuePresets(targetSaveFileId, {
          schedules: parsedSave.savedVenuePresets,
          roles: parsedSave.savedRolePresets,
        });
      } catch (e) {
        failures.push(`Venue presets: ${(e as Error).message}`);
      }

      // ── 12. Removes (last, since cascades clean up cleanly) ────────────
      // Order: clubs/sb/holidays first (no FK dependents), then sims, then
      // households (cascades any leftover sims).
      setApplyProgress('Removing items missing from save…');
      for (const r of diff.clubs.removes) {
        if (!selected.has(`clubs:remove:${r.plannerId}`)) continue;
        try { await api.deleteClub(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete club: ${(e as Error).message}`); }
      }
      for (const r of diff.smallBusinesses.removes) {
        if (!selected.has(`smallBusinesses:remove:${r.plannerId}`)) continue;
        try { await api.deleteSmallBusiness(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete business: ${(e as Error).message}`); }
      }
      for (const r of diff.holidays.removes) {
        if (!selected.has(`holidays:remove:${r.plannerId}`)) continue;
        try { await api.deleteHoliday(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete holiday: ${(e as Error).message}`); }
      }
      for (const r of diff.dynasties.removes) {
        if (!selected.has(`dynasties:remove:${r.plannerId}`)) continue;
        try { await api.deleteDynasty(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete dynasty: ${(e as Error).message}`); }
      }
      for (const r of diff.customVenues.removes) {
        if (!selected.has(`customVenues:remove:${r.plannerId}`)) continue;
        try { await api.deleteCustomVenue(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete custom venue: ${(e as Error).message}`); }
      }
      for (const r of diff.sims.removes) {
        if (!selected.has(`sims:remove:${r.plannerId}`)) continue;
        try { await api.deleteSim(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete sim: ${(e as Error).message}`); }
      }
      for (const r of diff.households.removes) {
        if (!selected.has(`households:remove:${r.plannerId}`)) continue;
        try { await api.deleteHousehold(targetSaveFileId, r.plannerId); } catch (e) { failures.push(`Delete household: ${(e as Error).message}`); }
      }

      // ── 12.5. Orphan cleanup (Track B) — established links only. A plan-only
      // shell left with no members and no live incoming planned moves is spent
      // scaffolding: a move-shell whose mover has realized/moved, or an emptied
      // plan. Delete it silently — the user never wants a memberless household
      // lingering. CAS households always keep ≥1 invented member unless they
      // adopted, so this only ever removes genuinely-empty shells.
      if (currentSourceFilename) {
        const adoptedShellIds = new Set(adoptByRealSourceId.values());
        const orphanShellIds = Object.values(plannerHouseholds)
          .filter((h) => h.sourceId == null)          // plan-only only
          .filter((h) => !adoptedShellIds.has(h.id))  // adopters are now real — keep
          .filter((h) => !Object.values(plannerSims).some((s) => s.householdId === h.id)) // 0 members
          .filter((h) => !Object.values(plannerSims).some(  // 0 live incoming stickers
            (s) => s.plannedMoveHouseholdId === h.id && !clearStickerFor.has(s.id),
          ))
          .map((h) => h.id);
        for (const id of orphanShellIds) {
          try { await api.deleteHousehold(targetSaveFileId, id); }
          catch (e) { failures.push(`Orphan cleanup: ${(e as Error).message}`); }
        }
      }

      // ── 13. Observed game-truth refresh (skills + funds) — SILENT ──────
      // Skills and household funds drift every play session, so they're kept
      // OUT of the field diff — which also means the update calls above never
      // carry them. Refresh them here to mirror the latest save, for every
      // sim/household matched to a planner row (created, updated, OR unchanged).
      // Skip genuine no-ops so an identical save writes NOTHING (keeps "no
      // changes" honest and avoids needless churn). No progress label — this is
      // a silent side-effect of syncing, not a plan change. Additive: a failure
      // here never fails the sync. (Also backfills saves whose sims/households
      // predate skills/funds capture on their prior sync.)
      // Batched: one write per sim across a whole town is the single largest
      // block of requests a sync makes, and every one is independent.
      await runChunked(parsedSave.sims, async (ps) => {
        const plannerId = simSourceIdToPlannerId.get(ps.id.toString(16));
        if (!plannerId) return;
        const nextSkills = ps.skills.map((sk) => ({ skillId: sk.uid, level: sk.level, points: sk.points }));
        const cur = plannerSims[plannerId]?.skills ?? [];
        const curById = new Map(cur.map((s) => [s.skillId, s]));
        const unchanged = cur.length === nextSkills.length
          && nextSkills.every((s) => { const c = curById.get(s.skillId); return !!c && c.level === s.level && c.points === s.points; });
        if (unchanged) return;
        try { await api.updateSim(targetSaveFileId, plannerId, { skills: nextSkills }); }
        catch (e) { failures.push(`Skills refresh (${ps.firstName}): ${(e as Error).message}`); }
      });
      await runChunked(parsedSave.households, async (ph) => {
        const plannerId = hhSourceIdToPlannerId.get(ph.id.toString(16));
        if (!plannerId) return;
        const nextMoney = ph.money != null ? Number(ph.money) : null;
        if (nextMoney === (plannerHouseholds[plannerId]?.money ?? null)) return; // unchanged
        try { await api.updateHousehold(targetSaveFileId, plannerId, { money: nextMoney }); }
        catch (e) { failures.push(`Funds refresh: ${(e as Error).message}`); }
      });

      if (failures.length > 0) {
        console.warn('[GameReimport] partial failures:', failures);
        setError({
          title: `Synced, but ${failures.length} change${failures.length === 1 ? " didn't" : "s didn't"} go through.`,
          detail: <>Everything else was applied. Re-syncing will try the rest again.</>,
        });
      }
      // ★ A partial failure is still ok:true. The sync DID complete and the
      // plan is coherent; treating it as a failed sync would put it in the
      // admin dashboard's failure list next to syncs that never landed at all,
      // which are a different problem. The count rides in the summary instead,
      // so a run of them is still visible.
      api.logImportEvent({
        saveFileId: targetSaveFileId, kind: 'resync', ok: true,
        errorSummary: failures.length > 0
          ? `${failures.length} change${failures.length === 1 ? '' : 's'} didn't go through: ${failures[0]}`
          : null,
        simCount: parsedSave.sims.length,
        durationMs: Date.now() - startedAt,
      });
      // Stamp the source filename + save name so "Previously imported from"
      // tracks the file you MOST RECENTLY synced — not just the first-ever
      // link. Handles in-game "Save As" (which mints a new slot number): the
      // next sync re-points the source to that file, so the identity check
      // stops flagging it. Best-effort — a stamp failure shouldn't roll back
      // a successful apply.
      if (pickedFilename) {
        try { await api.setSaveFileSource(targetSaveFileId, pickedFilename, pickedSaveName ?? ''); } catch (e) { console.warn('[GameReimport] setSaveFileSource failed:', e); }
      }
      // Track the save's NAME too. Adopt it on the FIRST link (the planner
      // name so far is just a placeholder like "New Save"), and on later syncs
      // only while the planner name is still following the save — a manual
      // rename supersedes it. Covers "New Save" → real name on first link, and
      // "Imanistan Save" → "Sync Test Save" after an in-game Save As.
      const firstLink = !currentSourceSaveName;
      const stillFollowingSave = plannerName === currentSourceSaveName;
      if (pickedSaveName && pickedSaveName !== plannerName && (firstLink || stillFollowingSave)) {
        try { await api.renameSaveFile(targetSaveFileId, pickedSaveName); } catch (e) { console.warn('[GameReimport] renameSaveFile failed:', e); }
      }
      // Stamp the sync timestamp so the "Synced N days ago" indicator resets.
      // Best-effort — a stamp failure shouldn't roll back a successful apply.
      try { await api.touchSaveFileSyncedAt(targetSaveFileId); } catch (e) { console.warn('[GameReimport] touchSyncedAt failed:', e); }
      // Celebrate a save being LINKED, never a routine re-sync. A plan built
      // from scratch reaches its save through this flow rather than through
      // GameImport, so "your save is linked!" belonged here too — but only the
      // first time. Fanfare on every sync would wear out fast.
      if (!currentSourceFilename) {
        // Same shape the first import writes: two headline numbers plus one line
        // naming everything else that came in, so nothing lands unmentioned.
        try {
          localStorage.setItem('show_post_import_toast', '1');
        } catch { /* private mode */ }
      }
      // Proof it happened, and nothing else. The counts were on the previous
      // screen and you pressed the button, so repeating them is a receipt for a
      // receipt. Skipped on a FIRST link, where the celebration is the moment —
      // two congratulations in a row is one too many.
      if (currentSourceFilename) {
        setStep('done');
        window.setTimeout(() => onComplete(targetSaveFileId), DONE_MS);
      } else {
        onComplete(targetSaveFileId);
      }
    } catch (e) {
      console.error('[GameReimport] apply error:', e);
      api.logImportEvent({
        saveFileId: targetSaveFileId, kind: 'resync', ok: false,
        errorSummary: (e as Error).message, durationMs: Date.now() - startedAt,
      });
      setError({
        title: "Couldn't finish the sync.",
        detail: <>Your backup is intact, so it's safe to try again. {(e as Error).message}</>,
      });
      setStep('review');
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4">
      <div className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-c-border shrink-0">
          {/* One word, no subtitle. This is the screen you see most, so it
              earns the least — and "your notes, photos, inspo and descriptions
              stay as they are" is a promise you need once, not every week. It
              belongs on the guide the footer links to. */}
          <h2 className="text-base font-bold text-c-text tracking-headline m-0">Sync</h2>
        </div>

        {step === 'pick' && (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto bg-c-base">
            {currentSourceFilename ? (
              <div className="bg-c-card border border-c-border rounded-lg p-4">
                <p className="text-2xs font-bold text-c-dim uppercase tracking-label mb-1.5">Previously imported from</p>
                <p className="text-sm m-0"><FileName>{currentSourceFilename}</FileName></p>
                {currentSourceSaveName && <p className="text-xs text-c-muted mt-0.5">"{currentSourceSaveName}"</p>}
              </div>
            ) : (
              // First-link mode: this planner save was created from scratch and
              // is being attached to a .save file for the first time.
              <div className="relative overflow-hidden bg-c-base border border-c-border rounded-lg p-4 text-xs leading-snug flex flex-col gap-3">
                <span className="absolute left-0 inset-y-0 w-[3px] bg-c-gold" aria-hidden />
                <div>
                  <p className="font-semibold text-c-text text-sm mb-1">First time linking a .save file to this planner save</p>
                  <p className="text-c-muted">
                    Lot type and name changes will sync cleanly. Any households, sims, clubs, or small businesses you've already created here won't be matched against the save's records — they'll stay as-is, and the save's versions will come in alongside them. Delete any duplicates manually after applying.
                  </p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer group bg-c-card border border-c-border hover:border-c-accent rounded-md p-2.5 transition-colors">
                  <input
                    type="checkbox"
                    checked={duplicateFirst}
                    onChange={(e) => setDuplicateFirst(e.target.checked)}
                    className="accent-c-accent w-4 h-4 cursor-pointer mt-px shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-c-text">Duplicate this planner first</span>
                    <p className="text-2xs text-c-muted mt-0.5 leading-snug">
                      Keeps your current setup safe. Sync will run on the copy and you'll be taken there. Useful if you've already done a lot of manual planning.
                    </p>
                  </div>
                </label>
              </div>
            )}
            {error && (
              <div className="bg-c-card border border-c-red-border rounded-lg p-4">
                <p className="text-sm font-semibold text-c-red m-0">{error.title}</p>
                <p className="text-[13px] text-c-muted leading-relaxed mt-1.5 m-0">{error.detail}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".save" className="hidden" onChange={handleFile} />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onCancel} className={btn('ghost')}>Cancel</button>
              <button onClick={chooseSaveFile} className={btn('primary')}>
                <FolderOpen size={15} weight="bold" /> Pick save file
              </button>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="p-12 text-center text-sm text-c-dim">Analyzing…</div>
        )}

        {step === 'applying' && (
          <div className="p-12 text-center flex flex-col gap-2 items-center">
            <p className="text-sm text-c-text font-medium">{applyProgress || 'Applying…'}</p>
            <p className="text-xs text-c-dim">Don't close this window.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="p-12 flex flex-col items-center gap-3">
            {/* No plumbob: that belongs to the first link. No full stop and no
                exclamation mark either — punctuation on a lone word reads as
                trying, and the tick already carries the tone. */}
            <span className="w-9 h-9 rounded-full bg-c-accent-soft text-c-green grid place-items-center">
              <Check size={19} weight="bold" />
            </span>
            <p className="text-lg font-bold text-c-text tracking-headline m-0">Synced</p>
          </div>
        )}

        {step === 'review' && diff && totals && (
          <>
            {/* Identity only speaks up when something is off. Matching the file
                you always sync from is the normal case and needs no comment —
                it's already named in the header. No amber: a different file is
                a fact to state, not an alarm to raise.

                Both lines are the same size — an 11.5px second line under a
                13px first one reads as a different typeface rather than a
                quieter one. Colour carries the hierarchy instead. */}
            {currentSourceFilename
              ? pickedFilename !== currentSourceFilename && pickedSaveName !== currentSourceSaveName && (
                  <div className="mx-6 mt-5 -mb-1 rounded-lg bg-c-panel p-3">
                    <p className="text-[13px] font-semibold text-c-text m-0">
                      Different save file detected.
                    </p>
                    <p className="text-[13px] text-c-dim mt-0.5 m-0">
                      Could be a Save As. Your plan is backed up first.
                    </p>
                  </div>
                )
              : (
                  <div className="mx-6 mt-5 -mb-1 rounded-lg border border-c-border bg-c-panel p-3">
                    <p className="text-[13px] text-c-text m-0">
                      Anything you already built here won't be merged — the save's version comes in alongside it.
                    </p>
                  </div>
                )}

            {/* The review IS this: a count per concept and a button. Nothing is
                selectable, because nothing is optional — every sync applies
                wholesale. Itemising changes would ask for an understanding the
                user can't act on, every single time they sync. */}
            <div className="px-6 pt-5 pb-5 flex-1 overflow-y-auto bg-c-base">
              {totals.grand === 0 ? (
                // NOT "no changes" — the silent fields (skills, careers, funds,
                // relationships, club/business detail) are deliberately kept out
                // of the diff, so they never reach a count and yet always
                // refresh on apply. Saying "nothing changed" would be a lie.
                <>
                  <p className="text-sm font-semibold text-c-text m-0">
                    No new households, sims or lots.
                  </p>
                  <p className="text-[13px] text-c-dim mt-1.5 m-0">
                    Skills, careers, funds and relationships will still refresh.
                  </p>
                </>
              ) : (
                /* Nine boxed rows, each with a hairline under it, is an
                   inventory. This is a status line: every concept on one
                   dot-separated line, numbers bold and nouns dim, two type
                   colours instead of four. "Skills, careers, funds and
                   relationships refresh too" is gone from here — it exists so
                   the ZERO case isn't a lie, and that's where it stays. */
                <div className="flex flex-col gap-2">
                  <p className="text-2xs font-bold text-c-dim uppercase tracking-label m-0">
                    Changed since your last sync
                  </p>
                  <DotList counts={totals.counts} className="text-[13px]" />
                  {totals.seasonLength && (
                    <p className="text-xs text-c-dim m-0">Seasons are now {totals.seasonLength}.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-c-border flex items-center justify-end gap-2 shrink-0">
              {/* Everything this screen stopped saying lives here, in the half
                  of the footer that was empty anyway. */}
              <SyncGuideLink label="How syncing works" />
              <button onClick={onCancel} className="text-sm text-c-dim hover:text-c-text px-3 py-1.5">Cancel</button>
              <button onClick={handleApply} className={btn('primary')}>
                Sync
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

