import { useState, useRef, useCallback, useEffect } from 'react';
import { ShieldCheck, FolderOpen } from '@phosphor-icons/react';
import { useIsMobile } from '../hooks/useIsMobile';
import { ImportDesktopSheet } from './Layout/ImportDesktopSheet';
import { parseDbpf } from '../lib/dbpf';
import { parseSaveData, ParsedHousehold, ParsedSim, ParsedLot, ParsedClub, ParsedHoliday, ParsedSmallBusiness, ParsedDynasty } from '../lib/saveParser';
import { classifyHousehold } from '../lib/parser/provenance';
import type { ParsedFamilyFacts, ParsedVenueRole, ParsedVenueSlot } from '../lib/parser/types';
import type { SimRelType } from '../types';
import { detectPacksFromSave } from '../lib/detectPacks';
import { usePackOwnership } from '../store/usePackOwnership';
import { resolveStockClubName } from '../data/stockClubs';
import { CLUB_ICONS, UNKNOWN_CLUB_ICON } from '../data/clubIcons';
import { resolveStockHoliday } from '../data/stockHolidays';
import { HOLIDAY_ICONS, UNKNOWN_HOLIDAY_ICON } from '../data/holidayIcons';
import { SMALL_BUSINESS_ICONS, UNKNOWN_SMALL_BUSINESS_ICON } from '../data/smallBusinessIcons';
import { STOCK_TRAITS } from '../data/stockTraits';
import { ROLE_TRAITS } from '../data/stockRoleTraits';
import { STOCK_ASPIRATIONS } from '../data/stockAspirations';
import { isDegreeTrait } from '../data/stockDegrees';
import { api } from '../lib/api';
import { LOT_DEFAULTS, resolveSaveLots, buildZoneKeyIndex } from './gameImport/lotMatching';
import { buildComposition } from './gameImport/buildComposition';
import { planFamilyImport } from '../lib/gameImport/familyImport';
import { ModalShell, ModalCancel } from './gameImport/ModalShell';
import { WRONG_FILE } from './gameImport/wrongFile';
import { SyncGuideLink } from './gameImport/syncGuide';
import { ConceptGrid } from './common/CountBlock';
import {
  STOCK_CLUB_FALLBACK_NAME,
  STOCK_HOLIDAY_FALLBACK_NAME,
} from './gameImport/types';
import type {
  HouseholdSnapshot,
  SimSnapshot,
  ClubSnapshot,
  SmallBusinessSnapshot,
  HolidaySnapshot,
  DynastySnapshot,
} from '../lib/parser/snapshot';
import { makeLotBaseline } from '../lib/parser/snapshot';
import { parsedDynastyToSnapshot, parsedCustomVenueToSnapshot } from '../lib/reimport/snapshotBuilders';
import { btn } from './common/btn';
import type {
  ReviewSim,
  ReviewHousehold,
  LotChange,
  ReviewClub,
  ReviewHoliday,
  ReviewSmallBusiness,
  Step,
  GameImportProps,
} from './gameImport/types';

// Shared with the re-sync apply, which had no batching at all until it turned
// out to be why a production sync took minutes. See lib/runChunked.
import { runChunked } from '../lib/runChunked';
import { openSaveFilePicker } from '../lib/pickSaveFile';

// A custom venue staged for creation during import. `name`/`roles`/`slots` come
// from the parser's inline-schedule extraction (empty for CV lots with no parsed
// venue record).
interface ReviewCustomVenue {
  lotKey: string;
  name: string;
  roles: ParsedVenueRole[];
  slots: ParsedVenueSlot[];
}

/** A file path that wraps at its separators instead of mid-word. */
function WrappablePath({ path, sep }: { path: string; sep: string }) {
  const parts = path.split(sep);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && sep}
          {part}
          {i < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  );
}

// Importing reads a local .save file off the user's computer, so on mobile we
// swap the whole flow for a "continue on desktop" sheet (keeps the entry point
// discoverable without mounting the desktop-only review UI).
export function GameImport(props: GameImportProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <ImportDesktopSheet onClose={props.onCancel} />;
  return <GameImportDesktop {...props} />;
}

function GameImportDesktop({ onCancel, onComplete, initialFile }: GameImportProps) {
  const [step, setStep] = useState<Step>('pick');
  // An actionable title plus the detail, rather than a parser exception with a
  // "Failed to…" prefix. Same shape as the portrait sync modal next door.
  const [error, setError] = useState<{ title: string; detail: React.ReactNode } | null>(null);
  const [saveName, setSaveName] = useState('');
  // Source-save identity, captured at pick time and passed to createSaveFile so
  // re-imports can later display a "did you mean this save?" comparison.
  // These are distinct from `saveName` (user-editable planner name).
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [parsedSaveName, setParsedSaveName] = useState<string | null>(null);
  const [households, setHouseholds] = useState<ReviewHousehold[]>([]);
  // Full parsed sim list + family facts, retained for the family-tree step
  // (tree-only ancestors live outside the review households).
  const [familyData, setFamilyData] = useState<{ facts: ParsedFamilyFacts; sims: ParsedSim[] } | null>(null);
  // What the family-tree step will land, computed at parse time so the review
  // can say so. `rows` = tree-only relatives + Unknown ancestor stubs; `links` =
  // the parent/spouse/engaged/partner edge set. The import re-plans against the
  // sims that actually got created, so these can differ by any that failed.
  const [familyCounts, setFamilyCounts] = useState<{ rows: number; links: number }>({ rows: 0, links: 0 });
  const [lotChanges, setLotChanges] = useState<LotChange[]>([]);
  // zone id (hex) → lot_key for apartment units, persisted to lots.source_id
  // at apply so re-sync can identify a unit after an in-game rename.
  const [lotSourceIds, setLotSourceIds] = useState<Map<string, string>>(new Map());
  // Custom venues to create post-import, keyed by planner lot_key. Computed at
  // analyze time; consumed during apply. Includes both lots typed CV in the save
  // and stock CV lots from seed — venues whose inline role/schedule the parser
  // extracted carry the rich name/roles/slots; the rest are empty placeholders.
  const [customVenues, setCustomVenues] = useState<ReviewCustomVenue[]>([]);
  // Save-global preset library (schedules + standalone roles), written wholesale.
  const [venuePresets, setVenuePresets] = useState<{ schedules: unknown[]; roles: unknown[] }>({ schedules: [], roles: [] });
  const [clubs, setClubs] = useState<ReviewClub[]>([]);
  const [dynastiesData, setDynastiesData] = useState<ParsedDynasty[]>([]);
  const [holidays, setHolidays] = useState<ReviewHoliday[]>([]);
  const [seasonLengthWeeks, setSeasonLengthWeeks] = useState<1 | 2 | 4>(1);
  const [smallBusinesses, setSmallBusinesses] = useState<ReviewSmallBusiness[]>([]);
  // Packs the save proves, worked out at parse but not WRITTEN until the import
  // runs — see handleImport. Ownership is account-wide, so writing it at parse
  // meant backing out of this screen still changed every plan you have.
  const [detectedPacks, setDetectedPacks] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Everything landing that isn't a household or a sim, named once and used
   * twice — by the review screen's grid and by the celebration's tail — so
   * the two moments can never disagree about what arrived.
   *
   * No sub-counts. "(11 renamed · 13 retyped)", "· 345 connections" and
   * "· 6 presets" were detail nobody can act on at the one moment they can't
   * act on anything, and they were most of the noise. Presets fold into their
   * venues; the family tree reports rows, not edges. Season length isn't a
   * count of anything, so it doesn't appear here at all.
   */
  const otherConcepts = (): Array<{ key: string; n: number; label: string }> => {
    const presetCount = venuePresets.schedules.length + venuePresets.roles.length;
    // NOTE the labels here are the NOUN ONLY — the count block renders the
    // number itself, so `plural()` (which returns "209 households") would
    // print it twice.
    const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
    return [
      { key: 'lots', n: lotChanges.length, label: noun(lotChanges.length, 'lot change', 'lot changes') },
      { key: 'clubs', n: clubs.length, label: noun(clubs.length, 'club', 'clubs') },
      { key: 'businesses', n: smallBusinesses.length, label: noun(smallBusinesses.length, 'small business', 'small businesses') },
      { key: 'holidays', n: holidays.length, label: noun(holidays.length, 'holiday', 'holidays') },
      { key: 'dynasties', n: dynastiesData.length, label: noun(dynastiesData.length, 'dynasty', 'dynasties') },
      { key: 'venues', n: customVenues.length, label: noun(customVenues.length, 'custom venue', 'custom venues') },
      // Presets are save-global, so they can land with no custom venue of
      // their own — that's the only time they're worth a line to themselves.
      ...(customVenues.length === 0 && presetCount > 0
        ? [{ key: 'presets', n: presetCount, label: noun(presetCount, 'venue preset', 'venue presets') }]
        : []),
      { key: 'family', n: familyCounts.rows, label: noun(familyCounts.rows, 'family tree record', 'family tree records') },
    ].filter((c) => c.n > 0);
  };

  const ingestFile = useCallback(async (file: File) => {
    // Every attempt gets logged, including the ones that end right here — a
    // wrong file is the most invisible failure there is: the player picks
    // something, reads an error, and leaves. See api.logImportEvent.
    const startedAt = Date.now();
    const filenameFallback = file.name.replace(/\.save$/i, '').replace(/_/g, ' ');
    setError(null);
    setStep('parsing');
    setSourceFilename(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const resources = parseDbpf(buffer);
      const saveData = parseSaveData(resources);

      // A `.package` — a mod, or localthumbcache — is the SAME DBPF container
      // as a `.save`, so it parses without complaint and simply yields nothing.
      // Without this, picking one walks all the way to a review screen listing
      // zero of everything, which reads as "the importer is broken" rather than
      // "wrong file". A real save always has lots.
      if (saveData.lots.length === 0 && saveData.sims.length === 0) {
        api.logImportEvent({
          kind: 'import', ok: false,
          errorSummary: 'Wrong file — parsed fine but held no lots or sims',
          durationMs: Date.now() - startedAt,
        });
        setError(WRONG_FILE);
        setStep('pick');
        return;
      }

      // Prefer the human-readable save name stored in the save itself
      // (e.g. "Perfect Save 2026") over the filename (e.g. "Slot_0000000c").
      setSaveName(saveData.saveName || filenameFallback || 'Imported Save');
      setParsedSaveName(saveData.saveName);

      // Work out which packs the save proves, but DON'T write them yet — the
      // union happens in handleImport, once you've actually gone through with
      // it. This used to write here, and cancelling out of the review left the
      // packs behind: account-wide, on every plan, from an import that never
      // happened. Worse than the same bug on re-sync (fixed in 73d48a5), since
      // this is usually the FIRST detection — and going from nothing detected
      // to something detected is exactly what switches the planner from showing
      // the whole library to showing only what that one save happened to prove.
      setDetectedPacks([...detectPacksFromSave(saveData)]);

      const simsById = new Map<bigint, ParsedSim>();
      for (const s of saveData.sims) simsById.set(s.id, s);

      // Lot changes: one row per PLANNER lot whose name or type differs from the
      // stock world. resolveSaveLots does the collapsing — a multi-unit building
      // is several records in the save that all land on one planner lot, and
      // counting (or writing) them separately is what made the review say "18
      // lot changes" on a save where six lots changed. zoneAssignments records
      // which save zone id landed on which apartment unit — persisted at apply
      // so re-sync can identify a unit after an in-game rename.
      const zoneAssignments = new Map<string, string>();
      const saveLots = resolveSaveLots(saveData.lots, { zoneAssignments });
      setLotSourceIds(zoneAssignments);

      // lotKey lookup keyed by save's binary lot ID — unit-aware, so a renamed
      // apartment's residents land on the same planner lot its name did.
      const lotKeyById = buildZoneKeyIndex(saveData.lots, zoneAssignments);
      // ParsedLot lookup keyed by save's binary lot ID
      const lotById = new Map<bigint, ParsedLot>();
      for (const l of saveData.lots) lotById.set(l.id, l);
      const changes: LotChange[] = [];
      for (const [lotKey, resolvedLot] of saveLots) {
        const defaults = LOT_DEFAULTS.get(lotKey)!; // resolveSaveLots only emits seeded lots
        const newName = resolvedLot.customName !== defaults.name ? resolvedLot.customName : null;
        const newType = resolvedLot.customType !== defaults.type ? resolvedLot.customType : null;
        if (newName || newType) {
          changes.push({
            lotKey,
            defaultName: defaults.name,
            defaultType: defaults.type,
            newName,
            newType,
          });
        }
      }
      setLotChanges(changes);

      // Build the custom-venue set, keyed by planner lot_key. Start from the
      // parser's inline-schedule extractions (the rich name/roles/slots),
      // resolving each venue's game lot id → planner lot_key. Then union in
      // every lot that ends up typed Custom Venue (from the resolved lot set —
      // covers stock CV lots like Camp Gibbi Gibbi) as empty placeholders, so
      // untracked-but-CV lots still get a row.
      const cvByLotKey = new Map<string, ReviewCustomVenue>();
      for (const v of saveData.customVenues) {
        const lotKey = v.lotId !== null ? (lotKeyById.get(v.lotId) ?? null) : null;
        if (!lotKey) continue;
        cvByLotKey.set(lotKey, { lotKey, name: v.name, roles: v.roles, slots: v.slots });
      }
      for (const [lotKey, resolvedLot] of saveLots) {
        if (resolvedLot.customType === 'Custom Venue' && !cvByLotKey.has(lotKey)) {
          cvByLotKey.set(lotKey, { lotKey, name: '', roles: [], slots: [] });
        }
      }
      setCustomVenues([...cvByLotKey.values()]);
      setVenuePresets({ schedules: saveData.savedVenuePresets, roles: saveData.savedRolePresets });

      // Clubs: resolve each parsed club's display name + hangout lot_key.
      // - Name: stored save name → stock-seed map → fallback placeholder
      // - Icon: keep instance hex only if it's in our renamed library (otherwise blank)
      // - Hangout: ParsedClub.hangoutZoneId (full 64-bit lot id) → ParsedLot → planner lot_key
      const clubIconSet = new Set(CLUB_ICONS);
      const reviewClubs: ReviewClub[] = saveData.clubs.map((c: ParsedClub) => {
        const stockName = resolveStockClubName(c.clubSeed);
        const isStock = !c.name;
        const name = c.name ?? stockName ?? STOCK_CLUB_FALLBACK_NAME;
        // Unknown icons (mods, packs we haven't ripped yet, the un-findable real
        // Renegades icon) fall back to the question-mark placeholder so the row
        // still renders something instead of an empty slot.
        const icon = c.iconInstance && clubIconSet.has(c.iconInstance)
          ? c.iconInstance
          : UNKNOWN_CLUB_ICON;
        const hangoutLotKey = c.hangoutZoneId !== null
          ? (lotKeyById.get(c.hangoutZoneId) ?? null)
          : null;
        return {
          parsedId: c.id, name, description: c.description, icon, hangoutLotKey,
          hangoutVenueTypeId: c.hangoutVenueTypeId, isStock,
          memberSimIds: c.memberSimIds,
          leaderSimId: c.leaderSimId, criteria: c.criteria, rules: c.rules, inviteOnly: c.inviteOnly,
        };
      });
      setClubs(reviewClubs);
      setDynastiesData(saveData.dynasties);
      setSeasonLengthWeeks(saveData.seasonLengthWeeks);

      // Holidays: each parsed entry already has day + season from the matching
      // Calendar. Name comes from the stored Holiday record (when user customized)
      // or the STOCK_HOLIDAYS map. Icon is the ResourceKey instance hex when
      // stored, otherwise the stock map's default; blank if neither.
      const holidayIconSet = new Set(HOLIDAY_ICONS);
      const reviewHolidays: ReviewHoliday[] = saveData.holidays.map((h: ParsedHoliday) => {
        const stock = resolveStockHoliday(h.holidayType);
        const isStock = h.name === null;
        const name = h.name ?? stock?.name ?? STOCK_HOLIDAY_FALLBACK_NAME;
        // Icon precedence:
        //   1. stored custom ResourceKey instance, if it's in our library → use it
        //   2. stored custom ResourceKey instance not in library (mod/unknown) → UNKNOWN
        //   3. no stored icon (pure stock holiday) → stock map's default
        //   4. otherwise → blank
        let icon = '';
        if (h.iconInstance) {
          icon = holidayIconSet.has(h.iconInstance) ? h.iconInstance : UNKNOWN_HOLIDAY_ICON;
        } else if (stock?.icon) {
          icon = stock.icon;
        }
        return { holidayType: h.holidayType, name, icon, season: h.season, day: h.day, isStock, traditions: h.traditions.map((t) => t.toString(16)), timeOff: h.timeOff, decorationPreset: h.decorationPreset, scaledDates: h.scaledDates };
      });
      setHolidays(reviewHolidays);

      // Small businesses: name + description + icon + owner sim_id + lot_id.
      // Owner is stored as a sim_id; we resolve to a planner household at
      // import time by looking up the sim's household via simIdMap.
      // Icon resolution happens once the small-business-icons folder is
      // renamed to ResourceKey instance hex (same pattern as clubs/holidays);
      // for now everything passes through with an empty icon string.
      const smallBusinessIconSet = new Set(SMALL_BUSINESS_ICONS);
      const reviewSmallBusinesses: ReviewSmallBusiness[] = saveData.smallBusinesses.map((sb: ParsedSmallBusiness) => {
        // A business can span several lots (sb.lotIds); resolve all that map, and
        // keep the first as the primary single-lot assignment.
        const lotKeys = sb.lotIds.map((zid) => lotKeyById.get(zid)).filter((k): k is string => !!k);
        const lotKey = lotKeys[0] ?? null;
        // Icon precedence:
        //   1. Stored icon hex in our library → use it
        //   2. Stored icon hex NOT in library (different pack / stock icon we didn't rip) → UNKNOWN placeholder
        //   3. No stored icon → blank (user can pick in the planner)
        let icon = '';
        if (sb.iconInstance) {
          icon = smallBusinessIconSet.has(sb.iconInstance) ? sb.iconInstance : UNKNOWN_SMALL_BUSINESS_ICON;
        }
        return {
          parsedId: sb.id,
          name: sb.name || '(unnamed business)',
          description: sb.description,
          icon,
          ownerParsedSimId: sb.ownerSimId,
          lotKey,
          lotKeys,
          employeeParsedSimIds: sb.employeeSimIds,
          customerCriteria: sb.customerCriteria,
          activities: sb.activities,
          feeMode: sb.feeMode,
          priceModifierPct: sb.priceModifierPct,
          renownRank: sb.renownRank,
          alignment: sb.alignment,
          perkPoints: sb.perkPoints,
        };
      });
      setSmallBusinesses(reviewSmallBusinesses);

      // Reverse the parser's natural order so user-created households tend to
      // appear at the top of the picker. The save lists households in an order
      // that roughly maps to creation (Willow Creek premades first, expansion
      // premades next in release order, user-made families last). Reversing
      // puts your families at the top and the long tail of EA premades at the
      // bottom — easier to scan when you only want to import a few of your own.
      // A recently-edited household may still float to the top, but that's a
      // minor cost vs. the alternative.
      const review: ReviewHousehold[] = saveData.households.slice().reverse().map((hh: ParsedHousehold) => {
        const hhSims = hh.simIds
          .map((id) => simsById.get(id))
          .filter((s): s is ParsedSim => s !== undefined)
          .map((s): ReviewSim => ({
            parsedId: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            gender: s.gender,
            lifestage: s.lifestage,
            species: s.species,
            petSubtype: s.petSubtype,
            petBreed: s.petBreed,
            occult: s.occult,
            isGhost: s.isGhost,
            deathCause: s.deathCause,
            traitIds: s.traitIds,
            aspirationId: s.aspirationId,
            enrolledDegree: s.enrolledDegree,
            career: s.career,
            skills: s.skills.map((sk) => ({ skillId: sk.uid, level: sk.level, points: sk.points })),
          }));

        const lotKey = hh.lotId ? (lotKeyById.get(hh.lotId) ?? null) : null;
        const gameLot = hh.lotId ? lotById.get(hh.lotId) : undefined;
        const origin = classifyHousehold(hh, simsById, saveData.ownerAccountId);

        return {
          parsedId: hh.id,
          name: hh.name,
          description: hh.description,
          money: hh.money != null ? Number(hh.money) : null,
          provenance: origin.bucket,
          provenanceSub: origin.sub,
          creatorName: origin.creator,
          sims: hhSims,
          lotKey,
          gameLotName: gameLot?.name ?? null,
          hasLotInSave: hh.lotId !== null,
          // Full-ingest: import every household. Townies/premades land in Rest
          // of Town in the workspace, so there's no per-household opt-in here.
          selected: true,
        };
      });

      setHouseholds(review);
      setFamilyData({ facts: saveData.familyFacts, sims: saveData.sims });
      // Same planner the import runs, over the sims the review is about to
      // bring in — so the tally can name the tree instead of letting it land
      // silently. Cheap: a BFS over the parsed facts, no I/O.
      const familyPlan = planFamilyImport(
        saveData.familyFacts,
        saveData.sims,
        review.flatMap((h) => h.sims.map((s) => '0x' + s.parsedId.toString(16))),
      );
      setFamilyCounts({
        rows: familyPlan.treeOnly.length + familyPlan.stubs.length,
        links: familyPlan.edges.length,
      });
      setStep('review');
    } catch (err) {
      console.error('[GameImport] parse error:', err);
      api.logImportEvent({
        kind: 'import', ok: false,
        errorSummary: `Parse failed: ${(err as Error).message}`,
        durationMs: Date.now() - startedAt,
      });
      setError(WRONG_FILE);
      setStep('pick');
    }
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    void ingestFile(file);
  }, [ingestFile]);

  // Aimed at the saves folder where the browser can do it, the plain input
  // everywhere else. See lib/pickSaveFile.ts for why it aims and doesn't
  // remember the file.
  const chooseSaveFile = useCallback(() => {
    void openSaveFilePicker((file) => void ingestFile(file), fileRef.current);
  }, [ingestFile]);

  // First-run hands the file straight over — it asked for it on its own hero,
  // so re-showing a pick step here would be asking twice.
  useEffect(() => {
    if (initialFile) void ingestFile(initialFile);
  }, [initialFile, ingestFile]);

  /**
   * Bin a save left behind by an import that fell over partway. The save file is
   * created in step 1, so by the time anything can fail there IS something on
   * the account — the offer to delete it is the only honest move.
   */
  async function discardHalfImport(id: string, name: string) {
    try {
      await api.deleteSaveFile(id);
      setError({ title: 'Import stopped partway.', detail: <>Deleted “{name}”.</> });
    } catch (err) {
      console.error('[GameImport] discard failed:', err);
      setError({
        title: 'Import stopped partway.',
        detail: <>Couldn't delete “{name}”. You can delete it from your saves page.</>,
      });
    }
  }

  async function handleImport() {
    const selected = households.filter((h) => h.selected);
    if (!selected.length) return;

    const startedAt = Date.now();
    const simsComing = selected.reduce((n, h) => n + h.sims.length, 0);
    setStep('importing');
    setError(null);

    // Pack ownership: union in what this save proves, now that you've actually
    // committed to the import. Non-destructive (adds, never removes) and
    // account-wide, so it lands on every save you have. Same placement as the
    // re-sync apply, for the same reason: cancel has to mean cancel.
    usePackOwnership.getState().unionAutoDetected(detectedPacks);

    // Tracked outside the try so the failure message can name the save that
    // already exists — and offer to bin it — instead of claiming there isn't one.
    let createdSave: { id: string; name: string } | null = null;

    try {
      // 1. Create the save file
      setImportProgress('Creating save file…');
      const sf = await api.createSaveFile(saveName.trim() || 'Imported Save', {
        ...(sourceFilename ? { sourceSaveFilename: sourceFilename } : {}),
        ...(parsedSaveName ? { sourceSaveName: parsedSaveName } : {}),
      });
      createdSave = { id: sf.id, name: sf.name };

      // The save's OWN pack evidence — the showcase's "Packs used" pills read
      // this per-save list (the union above is account-wide). Fire-and-forget.
      api.setDetectedPacks(sf.id, detectedPacks).catch(() => {});

      // Season length (confirmed from GameplayOptions.season_length) — always set
      // it (new saves default to 28d, so an imported NORMAL/7d save must override).
      // The parser already imported each holiday from the matching-length calendar.
      // Seed both the plan length and the imported baseline to the save's length
      // (they start matching — "following"; a later manual override diverges them).
      try { await api.setSeasonLength(sf.id, seasonLengthWeeks, seasonLengthWeeks); } catch { /* non-fatal */ }

      // 2. Apply lot custom types + custom names (silent — no per-lot UI).
      //    All lot updates are independent of each other — run them in parallel
      //    batches so we don't wait for one Railway round-trip per lot.
      //    Exactly one write per planner lot: `lotChanges` is built from the
      //    resolved (collapsed) lot set, so a multi-unit building's units can no
      //    longer take turns overwriting each other's baseline — the last of
      //    which used to write the STOCK name in, leaving the next re-sync to
      //    read a game rename as the player's own edit.
      // One write per planner lot: the union of value changes and apartment-
      // unit source ids (some lots have both — they merge into one PATCH).
      const lotWrites = new Map<string, Parameters<typeof api.updateLot>[2]>();
      for (const lc of lotChanges) {
        lotWrites.set(lc.lotKey, {
          ...(lc.newName ? { customName: lc.newName } : {}),
          ...(lc.newType ? { customType: lc.newType } : {}),
          // Seed the lot baseline with the save's actual name+type so the
          // 3-way re-sync merge has a real anchor. Only lots that differ
          // from the seed are in lotChanges — a lot matching the seed needs
          // no baseline (reconciliation falls back to the seed default).
          lastImportedState: makeLotBaseline({
            customName: lc.newName ?? lc.defaultName,
            customType: lc.newType ?? lc.defaultType,
          }),
        });
      }
      // Remember each apartment unit's zone id — the identity a future
      // re-sync needs to recognize a unit the player has since renamed.
      for (const [zoneHex, lotKey] of lotSourceIds) {
        lotWrites.set(lotKey, { ...(lotWrites.get(lotKey) ?? {}), sourceId: zoneHex });
      }
      if (lotWrites.size > 0) {
        setImportProgress(`Applying ${lotWrites.size} lot changes…`);
        await runChunked([...lotWrites], async ([lotKey, patch]) => {
          try {
            await api.updateLot(sf.id, lotKey, patch);
          } catch { /* non-fatal */ }
        });
      }

      // 3. Create households + sims + lot assignments.
      //    Track the save's bigint sim_id → newly-created planner sim.id so clubs
      //    can resolve their `memberSimIds` after sims exist.
      const simIdMap = new Map<bigint, string>();

      // Households run in parallel batches. Within each household: create the
      // record first (we need its id), then sims + lot assignment in parallel.
      let hhDone = 0;
      setImportProgress(`Importing 0 of ${selected.length} households…`);
      await runChunked(selected, async (hh) => {
        const composition = buildComposition(hh.sims.map((s) => ({
          id: s.parsedId,
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          lifestage: s.lifestage,
          species: s.species,
          petSubtype: s.petSubtype,
          petBreed: s.petBreed,
          occult: s.occult,
          isGhost: s.isGhost,
          householdId: null,
        } as ParsedSim)));

        const hhSnapshot: HouseholdSnapshot = {
          name: hh.name,
          composition,
          description: hh.description,
          assignedLotKey: hh.lotKey,
        };
        const created = await api.createHousehold(sf.id, {
          name: hh.name,
          composition,
          ...(hh.description ? { description: hh.description } : {}),
          money: hh.money,
          provenance: hh.provenance,
          provenanceSub: hh.provenanceSub,
          creatorName: hh.creatorName,
          // Preserve the original Sims household ID so we can later match
          // thumbnails from localthumbcache.package by entity ID.
          sourceId: hh.parsedId.toString(16),
          lastImportedState: hhSnapshot,
        });

        // Sims + lot assignment fire in parallel — neither depends on the other.
        // simIdMap / simToHouseholdMap are populated as each createSim resolves
        // (these Maps are only read after this whole step completes, so
        // concurrent writes are safe).
        const hhSourceId = hh.parsedId.toString(16);
        const simWork = hh.sims.map(async (sim) => {
          try {
            const simSnapshot: SimSnapshot = {
              firstName: sim.firstName,
              lastName: sim.lastName,
              gender: sim.gender,
              lifestage: sim.lifestage,
              species: sim.species,
              petSubtype: sim.petSubtype,
              petBreed: sim.petBreed,
              occult: sim.occult,
              isGhost: sim.isGhost,
              householdSourceId: hhSourceId,
            };
            // Trait IDs from the save include CAS personality picks *and*
            // earned/emotional/lifestyle/reward/mod traits. Filter to the
            // CAS catalog so we only persist what the planner can render —
            // plus hidden NPC role traits (is<Role>), which drive the service
            // classification and the SimPanel role pill (e.g. Statue Busker).
            // Aspiration IDs are similarly filtered against the catalog.
            const traitKeys = sim.traitIds
              .map((id) => '0x' + id.toString(16))
              .filter((key) => key in STOCK_TRAITS || isDegreeTrait(key) || key in ROLE_TRAITS);
            const aspirationKey = sim.aspirationId !== null
              ? '0x' + sim.aspirationId.toString(16)
              : null;
            const cleanedAspiration = aspirationKey && aspirationKey in STOCK_ASPIRATIONS
              ? aspirationKey
              : null;
            // Complete the baseline so the Manager's Mirrored/Edited cue has the
            // full save-truth to diff against (not just identity scalars).
            simSnapshot.traitIds = traitKeys;
            simSnapshot.aspirationId = cleanedAspiration;
            simSnapshot.deathCause = sim.deathCause;
            simSnapshot.enrolledDegree = sim.enrolledDegree;
            simSnapshot.career = sim.career;

            const createdSim = await api.createSim(sf.id, {
              householdId: created.id,
              firstName: sim.firstName,
              lastName: sim.lastName,
              gender: sim.gender,
              lifestage: sim.lifestage,
              species: sim.species,
              petSubtype: sim.petSubtype,
              petBreed: sim.petBreed,
              occult: sim.occult,
              isGhost: sim.isGhost,
              sourceId: sim.parsedId.toString(16),
              lastImportedState: simSnapshot,
              traitIds: traitKeys,
              aspirationId: cleanedAspiration,
              deathCause: sim.deathCause,
              enrolledDegree: sim.enrolledDegree,
              career: sim.career,
              skills: sim.skills,
            });
            simIdMap.set(sim.parsedId, createdSim.id);
          } catch { /* non-fatal — skip this sim */ }
        });
        const assignWork = hh.lotKey
          ? api.assignHousehold(sf.id, created.id, hh.lotKey).catch(() => {})
          : Promise.resolve();
        await Promise.all([...simWork, assignWork]);

        hhDone++;
        setImportProgress(`Importing ${hhDone} of ${selected.length} households…`);
      });

      // 3.5 Family tree: tree-only ancestors (genealogy-reachable sims outside
      //     the imported households), Unknown stubs (dangling ancestor refs),
      //     and the full relationship edge set. Additive — never fails the import.
      if (familyData) {
        try {
          setImportProgress('Importing family tree\u2026');
          const importedHex = [...simIdMap.keys()].map((b) => '0x' + b.toString(16));
          const plan = planFamilyImport(familyData.facts, familyData.sims, importedHex);
          const simByHex = new Map(familyData.sims.map((s) => ['0x' + s.id.toString(16), s]));
          const plannerIdByHex = new Map<string, string>();
          for (const [bigId, pid] of simIdMap) plannerIdByHex.set('0x' + bigId.toString(16), pid);

          await runChunked(plan.treeOnly, async (hex) => {
            const s = simByHex.get(hex);
            if (!s) return;
            try {
              const traitKeys = s.traitIds.map((id) => '0x' + id.toString(16)).filter((key) => key in STOCK_TRAITS || isDegreeTrait(key) || key in ROLE_TRAITS);
              const aspKey = s.aspirationId !== null ? '0x' + s.aspirationId.toString(16) : null;
              const created = await api.createSim(sf.id, {
                householdId: null,
                firstName: s.firstName,
                lastName: s.lastName,
                gender: s.gender,
                lifestage: s.lifestage,
                species: s.species,
                petSubtype: s.petSubtype,
                petBreed: s.petBreed,
                occult: s.occult,
                isGhost: s.isGhost,
                sourceId: s.id.toString(16),
                traitIds: traitKeys,
                aspirationId: aspKey && aspKey in STOCK_ASPIRATIONS ? aspKey : null,
                recordStatus: 'tree_only',
                deathCause: s.deathCause,
                enrolledDegree: s.enrolledDegree,
                career: s.career,
              });
              plannerIdByHex.set(hex, created.id);
            } catch { /* non-fatal */ }
          });

          await runChunked(plan.stubs, async (hex) => {
            try {
              const created = await api.createSim(sf.id, {
                householdId: null,
                firstName: 'Unknown',
                lastName: '',
                sourceId: hex.replace(/^0x/, ''),
                recordStatus: 'stub',
              });
              plannerIdByHex.set(hex, created.id);
            } catch { /* non-fatal */ }
          });

          const edges = plan.edges
            .map((e) => ({ simAId: plannerIdByHex.get(e.a), simBId: plannerIdByHex.get(e.b), relType: e.relType }))
            .filter((e): e is { simAId: string; simBId: string; relType: SimRelType } => !!e.simAId && !!e.simBId);
          if (edges.length) await api.putRelationships(sf.id, edges);
        } catch { /* family tree is additive \u2014 never fail the import */ }
      }

      // 4. Create clubs + assign their hangout lots + resolve members.
      // Members that aren't in simIdMap (sim wasn't imported because its
      // household was deselected, or the sim_id wasn't found in any household)
      // are silently dropped — Meat Lovers with 3 imported members shows 3.
      if (clubs.length > 0) {
        setImportProgress(`Importing ${clubs.length} clubs…`);
        await runChunked(clubs, async (club) => {
          try {
            const memberSimIds = club.memberSimIds
              .map((bigId) => simIdMap.get(bigId))
              .filter((x): x is string => x !== undefined);
            const clubSnapshot: ClubSnapshot = {
              name: club.name,
              icon: club.icon,
              description: club.description,
              assignedLotKey: club.hangoutLotKey,
              memberSimSourceIds: club.memberSimIds.map((b) => b.toString(16)),
            };
            const createdClub = await api.createClub(sf.id, {
              name: club.name,
              icon: club.icon,
              memberSimIds,
              leaderSimId: club.leaderSimId !== null ? (simIdMap.get(club.leaderSimId) ?? null) : null,
              criteria: club.criteria,
              rules: club.rules,
              inviteOnly: club.inviteOnly,
              hangoutVenueTypeId: club.hangoutVenueTypeId,
              ...(club.description ? { description: club.description } : {}),
              sourceId: club.parsedId.toString(16),
              lastImportedState: clubSnapshot,
            });
            if (club.hangoutLotKey) {
              try {
                await api.assignClub(sf.id, createdClub.id, club.hangoutLotKey);
              } catch { /* non-fatal */ }
            }
          } catch { /* non-fatal — skip this club */ }
        });
      }

      // 4b. Create dynasties (read-only display data). Head + members are remapped
      // to planner sim ids; members whose sim wasn't imported are dropped. The
      // snapshot references sims by source_id (hex) so re-sync survives id reassigns.
      if (dynastiesData.length > 0) {
        setImportProgress(`Importing ${dynastiesData.length} dynasties…`);
        await runChunked(dynastiesData, async (dyn) => {
          try {
            const headSimId = dyn.headSimId != null ? (simIdMap.get(dyn.headSimId) ?? null) : null;
            const members = dyn.members
              .map((m) => { const pid = simIdMap.get(m.simId); return pid ? { simId: pid, order: m.order, role: m.role } : null; })
              .filter((m): m is { simId: string; order: number; role: string | null } => m !== null);
            // Build via the shared builder so the stored snapshot is canonically
            // sorted exactly like the re-sync "current"/"next" snapshots — else a
            // game roster reorder would read as a phantom conflict on re-sync.
            const dynastySnapshot: DynastySnapshot = parsedDynastyToSnapshot(dyn);
            await api.createDynasty(sf.id, {
              name: dyn.name,
              description: dyn.description,
              headSimId,
              members,
              valueIds: dyn.valueIds,
              crestBgHash: dyn.crestBgHash,
              crestFgHash: dyn.crestFgHash,
              prestige: dyn.prestige,
              unity: dyn.unity,
              perkIds: dyn.perkIds,
              allianceSourceIds: dyn.allianceDynastyIds.map((aid) => aid.toString(16)),
              rivalrySourceIds: dyn.rivalryDynastyIds.map((rid) => rid.toString(16)),
              sourceId: dyn.id.toString(16),
              lastImportedState: dynastySnapshot,
            });
          } catch { /* non-fatal — skip this dynasty */ }
        });
      }

      // 5. Create small businesses (name + icon + owner sim + lot).
      //    Owner is the specific owning sim (the save stores its sim_id); we map
      //    it to the planner sim.id via simIdMap. Owner sims whose household
      //    wasn't imported (e.g. unchecked household with no lot) get a null owner.
      if (smallBusinesses.length > 0) {
        setImportProgress(`Importing ${smallBusinesses.length} small businesses…`);
        await runChunked(smallBusinesses, async (sb) => {
          try {
            const sbSnapshot: SmallBusinessSnapshot = {
              name: sb.name,
              icon: sb.icon,
              description: sb.description,
              assignedLotKeys: sb.lotKey ? [sb.lotKey] : [],
              ownerSimSourceId: sb.ownerParsedSimId !== null ? sb.ownerParsedSimId.toString(16) : null,
            };
            const created = await api.createSmallBusiness(sf.id, {
              name: sb.name,
              icon: sb.icon,
              description: sb.description || '',
              employeeSimIds: sb.employeeParsedSimIds.map((eid) => simIdMap.get(eid)).filter((x): x is string => x !== undefined),
              customerCriteria: sb.customerCriteria,
              activities: sb.activities,
              feeMode: sb.feeMode,
              priceModifierPct: sb.priceModifierPct,
              renownRank: sb.renownRank,
              alignment: sb.alignment,
              perkPoints: sb.perkPoints,
              sourceId: sb.parsedId.toString(16),
              lastImportedState: sbSnapshot,
            });
            // Owner-sim + lot assignment are independent — fire in parallel.
            const ownerSimId = sb.ownerParsedSimId !== null
              ? (simIdMap.get(sb.ownerParsedSimId) ?? null)
              : null;
            await Promise.all([
              ownerSimId
                ? api.updateSmallBusiness(sf.id, created.id, { ownerSimId }).catch(() => {})
                : Promise.resolve(),
              // Assign every lot the business spans (multi-lot).
              ...sb.lotKeys.map((lk) => api.assignSmallBusiness(sf.id, created.id, lk).catch(() => {})),
            ]);
          } catch { /* non-fatal — skip this business */ }
        });
      }

      // 6. Create holidays (silent, no per-holiday toggle, all independent).
      if (holidays.length > 0) {
        setImportProgress(`Importing ${holidays.length} holidays…`);
        await runChunked(holidays, async (h) => {
          try {
            const holidaySnapshot: HolidaySnapshot = {
              name: h.name,
              icon: h.icon,
              scaledDates: h.scaledDates,
            };
            await api.createHoliday(sf.id, {
              name: h.name,
              icon: h.icon,
              season: h.season,
              day: h.day,
              traditions: h.traditions,
              timeOff: h.timeOff,
              decorationPreset: h.decorationPreset,
              sourceId: h.holidayType.toString(16),
              scaledDates: h.scaledDates,
              lastImportedState: holidaySnapshot,
            });
          } catch { /* non-fatal — skip this holiday */ }
        });
      }

      // 7. Create custom_venues rows. Venues the parser decoded carry their
      //    in-game name + full role/schedule structure; CV lots with no parsed
      //    venue go in as empty placeholders.
      if (customVenues.length > 0) {
        setImportProgress(`Importing ${customVenues.length} custom venues…`);
        await runChunked(customVenues, async (cv) => {
          try {
            // Baseline snapshot (canonicalized) so the next re-sync can diff.
            const snapshot = parsedCustomVenueToSnapshot({ name: cv.name, lotId: null, roles: cv.roles, slots: cv.slots });
            await api.createCustomVenue(sf.id, {
              lotKey: cv.lotKey,
              name: cv.name,
              roles: cv.roles,
              slots: cv.slots,
              source: 'import',
              lastImportedState: snapshot,
            });
          } catch { /* non-fatal — skip this venue */ }
        });
      }

      // 7b. Preset library (save-global, read-only reference). Written wholesale.
      if (venuePresets.schedules.length > 0 || venuePresets.roles.length > 0) {
        setImportProgress('Importing venue presets…');
        try { await api.replaceCustomVenuePresets(sf.id, venuePresets); } catch { /* non-fatal */ }
      }

      // Flag the one-time celebration for the next Dashboard mount. A plain
      // boolean: that screen shows no counts, because you read them on the
      // review step and then pressed Import.
      // The second flag arms the first-stop tally: the first page opened after
      // landing gets logged once (see useFirstStopAfterImport), so the funnel
      // can say where people go — or don't — right after an import.
      try {
        localStorage.setItem('show_post_import_toast', '1');
        localStorage.setItem('post_import_first_stop', '1');
      } catch { /* private mode */ }

      api.logImportEvent({
        saveFileId: sf.id, kind: 'import', ok: true,
        simCount: simsComing, durationMs: Date.now() - startedAt,
      });

      onComplete(sf.id, sf.name);
    } catch (err) {
      console.error('[GameImport] import failed:', err);
      // Named with the save it left behind where there is one, so the admin
      // failures list can point at the half-import rather than at nothing.
      api.logImportEvent({
        saveFileId: createdSave?.id ?? null, kind: 'import', ok: false,
        errorSummary: (err as Error).message, durationMs: Date.now() - startedAt,
      });
      // The exception itself goes to the console; what a player needs is what
      // state their account is in. Only a failed createSaveFile leaves nothing
      // behind — every later step has a save file to explain.
      if (createdSave) {
        const half = createdSave;
        setError({
          title: 'Import stopped partway.',
          detail: (
            <>
              <span>“{half.name}” was created, with part of your save in it.</span>
              <button
                onClick={() => discardHalfImport(half.id, half.name)}
                className={btn('danger', { size: 'sm', className: 'mt-2.5' })}
              >
                Delete it
              </button>
            </>
          ),
        });
      } else {
        setError({
          title: "Couldn't start the import.",
          detail: <>Nothing was saved, so it's safe to try again.</>,
        });
      }
      setStep('review');
    }
  }

  const selectedSimCount = households.reduce((sum, h) => sum + h.sims.length, 0);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (step === 'pick') {
    // First-run already has the file; the effect above is about to move us to
    // 'parsing', and flashing a "choose a file" modal in between would ask for
    // something we were just given.
    if (initialFile) return null;
    return (
      <ModalShell
        onClose={onCancel}
        title="Import from Sims 4 save"
        footer={<>
          <ModalCancel onClick={onCancel} />
          <button onClick={chooseSaveFile} className={btn('primary')}>
            <FolderOpen size={15} weight="bold" /> Choose save file
          </button>
        </>}
      >
        {/* Both platforms, written the way each one writes it. Deliberately no
            advice about WHICH file to pick — save numbers don't run in a
            dependable order, and sending someone to the wrong save is worse
            than making them look. The confirm step after the pick tells them
            what they actually chose. */}
        <div className="bg-c-card border border-c-border rounded-lg p-3.5 mb-4">
          <p className="text-2xs font-bold text-c-dim uppercase tracking-label m-0 mb-2.5">
            Where your saves live
          </p>
          <div className="flex flex-col gap-2.5">
            {/* Wrap at the separators. Left to itself the browser either
                breaks mid-word ("Electronic Ar / ts") or runs off the edge
                looking truncated; a <wbr> after each slash gives it somewhere
                sensible to break instead. */}
            <div>
              <p className="text-xs text-c-dim m-0 mb-0.5">Windows</p>
              <p className="text-[13px] text-c-text font-mono m-0 leading-relaxed">
                <WrappablePath path="C:\Users\[Your Username]\Documents\Electronic Arts\The Sims 4\saves" sep="\" />
              </p>
            </div>
            <div>
              <p className="text-xs text-c-dim m-0 mb-0.5">Mac</p>
              <p className="text-[13px] text-c-text font-mono m-0 leading-relaxed">
                <WrappablePath path="Documents/Electronic Arts/The Sims 4/saves" sep="/" />
              </p>
            </div>
          </div>
        </div>
        <div
          role="note"
          className="mb-5 flex items-start gap-2 rounded-lg border border-c-accent-border bg-c-accent-soft px-3 py-2 text-xs text-c-muted"
        >
          <ShieldCheck size={18} weight="duotone" className="mt-px shrink-0 text-c-green" />
          <span>
            Your save file is read <span className="text-c-text font-medium">locally in your browser</span> —
            the raw file is never uploaded. Only the extracted records (lots,
            sims, households) are sent to the planner's server.
          </span>
        </div>
        {error && (
          <div className="bg-c-card border border-c-red-border rounded-lg p-4 mb-4">
            <p className="text-sm font-semibold text-c-red m-0">{error.title}</p>
            <p className="text-[13px] text-c-muted leading-relaxed mt-1.5 m-0">{error.detail}</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".save"
          className="hidden"
          onChange={handleFile}
        />
      </ModalShell>
    );
  }

  if (step === 'parsing') {
    return (
      <ModalShell onClose={onCancel} title="Reading save file…">
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-c-accent border-t-transparent animate-spin" />
          <span className="text-sm text-c-muted">Parsing DBPF container…</span>
        </div>
      </ModalShell>
    );
  }

  if (step === 'importing') {
    return (
      <ModalShell onClose={onCancel} hideClose title="Importing…">
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-5 h-5 rounded-full border-2 border-c-accent border-t-transparent animate-spin" />
          <span className="text-sm text-c-muted">{importProgress}</span>
        </div>
      </ModalShell>
    );
  }

  if (step === 'review') {
    const concepts = otherConcepts();

    return (
      <ModalShell
        onClose={onCancel}
        title="Everything in this save"
        footer={<>
          {/* The detail this screen no longer carries lives one click away, in
              the footer's empty left half — out of the reading path, costing
              the body nothing. Renders nothing until the guide is written. */}
          <SyncGuideLink label="How importing works" />
          <ModalCancel onClick={onCancel} />
          <button onClick={handleImport} disabled={households.length === 0} className={btn('primary')}>
            Import
          </button>
        </>}
      >
        {/* Identity, not a control. The only decision on this screen is "is
            this the right save?", so the save's own name leads and the slot
            sits under it — the slot being how you tell two of your own saves
            apart. It used to be a rename field, which offered a THIRD place to
            rename (the Dashboard title and /saves both already do it) at the
            one moment nobody wants to stop and name something. */}
        <div className="mb-5">
          <p className="text-lg font-bold text-c-text tracking-headline m-0">{saveName}</p>
          {sourceFilename && (
            <p className="text-xs text-c-dim font-mono mt-1 m-0">{sourceFilename}</p>
          )}
        </div>

        {households.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-c-muted text-sm">No households found in this save file.</p>
          </div>
        ) : (
          /* ONE flat grid, households and sims among the rest. Earlier drafts
             gave those two a bigger tier above a rule, which put a second
             alignment axis and a second type size on a card that is, in the
             end, a list of what's in a file. The modal's title is the headline;
             this is the content. Nothing in it needs ranking. */
          <div className="mb-4">
            <ConceptGrid
              counts={[
                { key: 'hh', n: households.length, label: households.length === 1 ? 'household' : 'households' },
                { key: 'sims', n: selectedSimCount, label: selectedSimCount === 1 ? 'sim' : 'sims' },
                ...concepts,
              ]}
            />
          </div>
        )}

        {error && (
          <div className="bg-c-card border border-c-red-border rounded-lg p-4 mb-3">
            <p className="text-sm font-semibold text-c-red m-0">{error.title}</p>
            {/* A div, not a p: the half-import case puts a Delete button in here. */}
            <div className="text-[13px] text-c-muted leading-relaxed mt-1.5 flex flex-col items-start">
              {error.detail}
            </div>
          </div>
        )}

      </ModalShell>
    );
  }

  return null;
}

