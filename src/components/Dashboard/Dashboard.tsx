import { useState, useMemo, memo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  SquaresFour,
  ListBullets,
  ArrowsClockwise,
  DownloadSimple,
  PencilSimple,
  Lock,
} from '@phosphor-icons/react';
import { useConfirm } from '../common/ConfirmDialog';
import { usePackOwnership } from '../../store/usePackOwnership';
import { PACKS_BY_ID, RELEASE_TO_PACK } from '../../data/packs';
import { Tooltip } from '../common/Tooltip';
import { FirstImportCelebration } from '../common/FirstImportCelebration';
import { useSaveFile, getGlobalStats, getWorldStats } from '../../store/useSaveFile';
import { WORLDS_SORTED_BY_RELEASE, WORLDS_DATA, WORLD_PACK_NAMES, getLotTypeSection, compareLotTypes, CATEGORY_INK, isLotVisible, neighborhoodLabel } from '../../data/worlds';
import type { WorldName, LotTypeSection } from '../../data/worlds';
import type { PlannedLot } from '../../types';
import { WorldProgressBar } from './WorldProgressBar';
import { WORLD_ICONS } from '../../data/worldIcons';
import { getLotIconSrc } from '../../data/lotIcons';
import { GameReimport } from '../GameReimport';
import { formatRelativeTime, daysSince } from '../../lib/relativeTime';
import { btn } from '../common/btn';

// The sync age is ALWAYS shown once a save is linked — nothing appears at a
// threshold to scold you. This only decides when the text firms up from faint
// to solid. A week (the old banner's trigger) is nothing to a player who plays
// in month-long bursts, so it was scolding normal behaviour.
const AGED_SYNC_DAYS = 30;

const SECTION_ORDER: LotTypeSection[] = ['home', 'rental', 'venue', 'other'];
const SECTION_LABELS: Record<LotTypeSection, string> = { home: 'Home', rental: 'Rental', venue: 'Venue', other: 'Other' };
// The game's special lots have no category colour of their own — they aren't a
// kind of build, they're the town's fixtures — so the heading stays neutral.
const SECTION_INK: Record<LotTypeSection, string> = { ...CATEGORY_INK, other: 'var(--c-dim)' };

const LotTypesTab = memo(function LotTypesTab({
  lots,
  excludedWorlds,
}: {
  lots: Record<string, PlannedLot>;
  excludedWorlds: string[];
}) {
  // One pass over YOUR lots, counted under the type each one is NOW — so a
  // house you retyped to a nightclub leaves Residential and arrives at
  // Nightclub, totals and all. Counting the game's catalogue for Total while
  // tallying status by current type let a row read "3 built of a total of 2".
  // Unplanned is a real count for the same reason: as a subtraction it printed
  // "—" instead of admitting the totals didn't hold.
  const excludedSet = useMemo(() => new Set(excludedWorlds), [excludedWorlds]);
  const rows = useMemo(() => {
    const byType = new Map<string, { built: number; planned: number; unplanned: number; total: number }>();
    for (const lot of Object.values(lots)) {
      if (excludedSet.has(lot.worldName)) continue;
      // The eight lots the planner never shows (Sylvan Glade, Sixam, the Magic
      // Realm …) have nothing to plan, so they're not lots you can count.
      if (!isLotVisible(lot.defaultType)) continue;
      const type = lot.customType === 'Vacation Rental' ? 'Rental' : lot.customType;
      const row = byType.get(type) ?? { built: 0, planned: 0, unplanned: 0, total: 0 };
      row[lot.status ?? 'unplanned']++;
      row.total++;
      byType.set(type, row);
    }
    return Array.from(byType.entries())
      .map(([type, counts]) => ({ type, section: getLotTypeSection(type), ...counts }))
      .sort((a, b) => compareLotTypes(a.type, b.type));
  }, [lots, excludedSet]);

  return (
    <div className="flex flex-col gap-5">
      {SECTION_ORDER.map((cat) => {
        const sectionRows = rows.filter((r) => r.section === cat);
        if (sectionRows.length === 0) return null;
        return (
          <div key={cat}>
            <div
              className="text-2xs font-semibold uppercase tracking-label mb-2 px-1"
              style={{ color: SECTION_INK[cat] }}
            >
              {SECTION_LABELS[cat]}
            </div>
            <div className="bg-c-card border border-c-border rounded-lg overflow-x-auto">
              <table className="w-full border-collapse min-w-[440px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[80px]" />
                  <col className="w-[80px]" />
                  <col className="w-[90px]" />
                  <col className="w-[110px]" />
                  <col className="w-[160px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-c-border">
                    <th className="px-4 py-[8px] text-left text-2xs text-c-faint tracking-label uppercase font-semibold">Type</th>
                    <th className="px-3 py-[8px] text-center text-2xs text-c-faint tracking-label uppercase font-semibold">Total</th>
                    <th className="px-3 py-[8px] text-center text-2xs text-c-accent tracking-label uppercase font-semibold">Built</th>
                    <th className="px-3 py-[8px] text-center text-2xs text-c-secondary tracking-label uppercase font-semibold">Planned</th>
                    <th className="px-3 py-[8px] text-center text-2xs text-c-faint tracking-label uppercase font-semibold">Unplanned</th>
                    <th className="px-4 py-[8px] text-left text-2xs text-c-faint tracking-label uppercase font-semibold min-w-[100px]">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map(({ type, total, ...s }) => {
                    const builtPct = total > 0 ? (s.built / total) * 100 : 0;
                    const plannedPct = total > 0 ? (s.planned / total) * 100 : 0;
                    return (
                      <tr key={type} className="border-t border-c-panel">
                        <td className="px-4 py-[9px]">
                          <div className="flex items-center gap-2">
                            <img src={getLotIconSrc(type)} alt="" className="w-4 h-4 object-contain shrink-0 opacity-70" />
                            <span className="text-[13px] text-c-text">{type}</span>
                          </div>
                        </td>
                        <td className="px-3 py-[9px] text-center text-[13px] text-c-muted">{total}</td>
                        <td className="px-3 py-[9px] text-center text-[13px] text-c-accent font-medium">{s.built || '—'}</td>
                        <td className="px-3 py-[9px] text-center text-[13px] text-c-secondary">{s.planned || '—'}</td>
                        <td className="px-3 py-[9px] text-center text-[13px] text-c-faint">
                          {s.unplanned || '—'}
                        </td>
                        <td className="px-4 py-[9px]">
                          <div className="h-1.5 bg-c-border rounded-full overflow-hidden flex">
                            <div style={{ width: `${builtPct}%`, background: '#16a34a' }} className="h-full" />
                            <div style={{ width: `${plannedPct}%`, background: 'var(--c-secondary)' }} className="h-full" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const WorldTile = memo(function WorldTile({ worldName }: { worldName: WorldName }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const lots = useSaveFile((s) => s.lots);
  const households = useSaveFile((s) => s.households);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const toggleWorldDisabled = useSaveFile((s) => s.toggleWorldDisabled);
  // Subscribe to state slices so the tile re-renders when pack ownership flips.
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const stats = useMemo(() => getWorldStats(lots, households, worldName), [lots, households, worldName]);

  const icon = WORLD_ICONS[worldName];
  const isDisabled = disabledWorlds.includes(worldName);
  // Pack lock: the world's pack isn't owned. Separate from per-save disable;
  // they share the greyed treatment but a Lock icon disambiguates the reason.
  const packId = RELEASE_TO_PACK[WORLDS_DATA[worldName].release];
  const packName = packId ? PACKS_BY_ID[packId]?.name ?? packId : null;
  const isPackLocked = packId ? !usePackOwnership.getState().isOwned(packId) : false;
  // Recompute when overrides/auto-detected change so the tile reflects flips.
  void manualOverrides; void autoDetected;
  const isGreyed = isDisabled || isPackLocked;

  async function handleToggleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPackLocked) {
      const ok = await confirm({
        message: `${worldName} requires ${packName}, which the planner thinks you don't own. Open Pack Settings to mark it as owned.`,
        confirmLabel: 'Open Pack Settings',
        cancelLabel: 'Cancel',
      });
      if (ok && saveFileId) navigate(`/saves/${saveFileId}/settings/packs`);
      return;
    }
    toggleWorldDisabled(worldName);
  }

  return (
    <div
      onClick={() => navigate(`/saves/${saveFileId}/world/${encodeURIComponent(worldName)}`)}
      title={isPackLocked ? `Requires ${packName}` : undefined}
      className={`group relative bg-c-card border border-c-border rounded-lg cursor-pointer transition-all ${!isGreyed ? 'hover:border-c-accent hover:shadow-md' : ''}`}
    >
      {isPackLocked && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-c-card border border-c-border flex items-center justify-center shadow-sm">
          <Lock size={10} weight="duotone" className="text-c-dim" />
        </div>
      )}
      {/* Floating world icon — transparent corners show the cream canvas behind */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 -top-7 w-[90%] pointer-events-none ${isGreyed ? 'opacity-40 grayscale' : ''}`}
      >
        {icon ? (
          <img src={icon} alt={worldName} className="w-full h-auto object-contain drop-shadow-sm" />
        ) : (
          <div className="aspect-square w-full flex items-center justify-center bg-c-panel rounded-full">
            <span className="text-3xl font-bold text-c-border-mid select-none">
              {worldName[0]}
            </span>
          </div>
        )}
      </div>

      <div className={isGreyed ? 'opacity-40 grayscale' : ''}>
        <div className="px-2.5 pb-1" style={{ paddingTop: 'calc(90% - 20px)' }}>
          <div className="text-sm font-semibold text-c-text truncate leading-tight mb-0.5 text-center">
            {worldName}
          </div>
          <div className="text-2xs text-c-dim mb-2 truncate text-center">{WORLD_PACK_NAMES[worldName]}</div>
          {/* A world that counts toward nothing reports no progress — a bar and
              a "0 / 15 built" on a world outside the plan is a number about
              nothing. Its reason for being greyed goes in that space instead. */}
          {!isGreyed && <WorldProgressBar total={stats.total} planned={stats.planned} built={stats.built} />}
        </div>
      </div>
      {/* Progress (or the reason there is none) + the enable toggle. The toggle
          only shows on hover for active worlds (keeps the grid calm);
          greyed/disabled worlds keep it visible so they can be switched on. */}
      <div className="px-2.5 pb-2.5 mt-1 flex items-center justify-between gap-2">
        <span
          className={`text-2xs min-w-0 truncate ${isGreyed ? 'text-c-faint' : 'text-c-dim tabular-nums'}`}
          title={isPackLocked ? `Requires ${packName}` : undefined}
        >
          {isPackLocked ? `Requires ${packName}` : isDisabled ? 'Disabled' : (
            <>
              <b className="font-bold text-c-green">{stats.built}</b>
              {' / '}{stats.total} built
            </>
          )}
        </span>
        <button
          onClick={handleToggleClick}
          title={isPackLocked ? `Requires ${packName}` : isDisabled ? 'Re-enable' : 'Disable for this save'}
          className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full border transition-all ${
            isGreyed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          } ${
            isPackLocked
              ? 'bg-c-border border-c-border'
              : isDisabled
                ? 'bg-c-red border-c-red'
                : 'bg-c-accent border-c-accent'
          }`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-c-card shadow transition-transform mt-px ${isDisabled || isPackLocked ? 'translate-x-px' : 'translate-x-3'}`} />
        </button>
      </div>
    </div>
  );
});

const WorldRow = memo(function WorldRow({ worldName }: { worldName: WorldName }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const lots = useSaveFile((s) => s.lots);
  const households = useSaveFile((s) => s.households);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const toggleWorldDisabled = useSaveFile((s) => s.toggleWorldDisabled);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const isDisabled = disabledWorlds.includes(worldName);
  const packId = RELEASE_TO_PACK[WORLDS_DATA[worldName].release];
  const packName = packId ? PACKS_BY_ID[packId]?.name ?? packId : null;
  const isPackLocked = packId ? !usePackOwnership.getState().isOwned(packId) : false;
  void manualOverrides; void autoDetected;
  const isGreyed = isDisabled || isPackLocked;

  async function handleToggleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPackLocked) {
      const ok = await confirm({
        message: `${worldName} requires ${packName}, which the planner thinks you don't own. Open Pack Settings to mark it as owned.`,
        confirmLabel: 'Open Pack Settings',
        cancelLabel: 'Cancel',
      });
      if (ok && saveFileId) navigate(`/saves/${saveFileId}/settings/packs`);
      return;
    }
    toggleWorldDisabled(worldName);
  }
  const stats = useMemo(() => getWorldStats(lots, households, worldName), [lots, households, worldName]);

  const worldData = WORLDS_DATA[worldName];
  const locations = useMemo(() => {
    // Only the lots the planner shows, and through the same label the world
    // page uses — otherwise this column advertised a "Hidden Lot"
    // neighbourhood, sometimes for worlds with no visible lot in it at all.
    const locs = new Set(
      worldData.lots.filter((l) => isLotVisible(l.type)).map((l) => neighborhoodLabel(l.location)),
    );
    return Array.from(locs).join(', ');
  }, [worldData]);

  return (
    <tr
      onClick={() => navigate(`/saves/${saveFileId}/world/${encodeURIComponent(worldName)}`)}
      className="cursor-pointer world-row"
    >
      <td className={`px-4 py-[10px] text-[13px] text-c-text${isGreyed ? ' opacity-40 grayscale' : ''}`}>{worldName}</td>
      <td className={`px-2 py-[10px] text-c-dim text-xs text-center${isGreyed ? ' opacity-40 grayscale' : ''}`}>{WORLD_PACK_NAMES[worldName]}</td>
      <td className={`px-2 py-[10px] text-c-dim text-[11px] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap${isGreyed ? ' opacity-40 grayscale' : ''}`}>
        {locations || '—'}
      </td>
      <td className={`px-2 py-[10px] text-c-dim text-xs text-center${isGreyed ? ' opacity-40 grayscale' : ''}`}>{stats.total}</td>
      {/* Same rule as the tile: a world outside the plan reports no progress,
          only why it's outside it. */}
      <td className={`px-4 py-[10px] min-w-[160px]${isGreyed ? ' opacity-40 grayscale' : ''}`}>
        {isGreyed ? (
          <span className="text-2xs text-c-faint">
            {isPackLocked ? `Requires ${packName}` : 'Disabled'}
          </span>
        ) : (
          <>
            <WorldProgressBar total={stats.total} planned={stats.planned} built={stats.built} />
            <div className="text-2xs mt-[3px] text-c-dim tabular-nums">
              <b className="font-bold text-c-green">{stats.built}</b> / {stats.total} built
            </div>
          </>
        )}
      </td>
      <td className="px-4 py-[10px] text-center">
        <button
          onClick={handleToggleClick}
          title={isPackLocked ? `Requires ${packName}` : isDisabled ? 'Re-enable' : 'Disable for this save'}
          className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors border ${
            isPackLocked
              ? 'bg-c-border border-c-border'
              : isDisabled
                ? 'bg-c-red border-c-red'
                : 'bg-c-accent border-c-accent'
          }`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-c-card shadow transition-transform mt-px ${isDisabled || isPackLocked ? 'translate-x-px' : 'translate-x-3'}`} />
        </button>
      </td>
    </tr>
  );
});

export function Dashboard() {
  const navigate = useNavigate();
  const saveFileId = useSaveFile((s) => s.saveFileId);
  const lots = useSaveFile((s) => s.lots);
  const households = useSaveFile((s) => s.households);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const saveFileName = useSaveFile((s) => s.name);
  const renameSave = useSaveFile((s) => s.renameSave);
  const sourceSaveFilename = useSaveFile((s) => s.sourceSaveFilename);
  const sourceSaveName = useSaveFile((s) => s.sourceSaveName);
  const lastSyncedAt = useSaveFile((s) => s.lastSyncedAt);
  const loadSaveFile = useSaveFile((s) => s.loadSaveFile);
  const isOwned = usePackOwnership((s) => s.isOwned);
  const ownedManualOverrides = usePackOwnership((s) => s.manualOverrides);
  const ownedAutoDetected = usePackOwnership((s) => s.autoDetected);

  // Inline save-name edit — hover the title, click to rename, commit on blur.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(saveFileName);
  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== saveFileName) renameSave(trimmed);
    setEditingName(false);
  };

  const syncedAgo = formatRelativeTime(lastSyncedAt);
  const syncDays = daysSince(lastSyncedAt);
  const isAged = syncDays !== null && syncDays >= AGED_SYNC_DAYS;
  const [view, setView] = useState<'tile' | 'list'>('tile');
  // Tab lives in the URL (?tab=lottypes) so clicking the sidebar's Dashboard
  // link drops the param and returns to the default Worlds view — gives the
  // user a predictable "back to overview" path from the Lot Types deep view.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'overview' | 'lottypes' = searchParams.get('tab') === 'lottypes' ? 'lottypes' : 'overview';
  const setTab = (next: 'overview' | 'lottypes') => {
    if (next === 'overview') {
      const params = new URLSearchParams(searchParams);
      params.delete('tab');
      setSearchParams(params, { replace: true });
    } else {
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    }
  };
  const [showReimport, setShowReimport] = useState(false);

  // A world drops out of the totals for either of two reasons: you switched it
  // off for this save, or its pack isn't one you own. Both stay on screen —
  // this is only about what the plan counts as yours to build. Counting a
  // padlocked world advertised a bigger town than the player can plan.
  const lockedWorlds = useMemo(
    () => WORLDS_SORTED_BY_RELEASE.filter((w) => {
      const packId = RELEASE_TO_PACK[WORLDS_DATA[w].release];
      return packId ? !isOwned(packId) : false;
    }),
    // isOwned's identity never changes, so subscribe to what it reads.
    [isOwned, ownedManualOverrides, ownedAutoDetected],
  );
  const uncountedWorlds = useMemo(
    () => [...new Set<string>([...disabledWorlds, ...lockedWorlds])].sort(),
    [disabledWorlds, lockedWorlds],
  );
  const uncountedSet = useMemo(() => new Set(uncountedWorlds), [uncountedWorlds]);
  const visibleLots = useMemo(
    () => Object.fromEntries(Object.entries(lots).filter(([, l]) => !uncountedSet.has(l.worldName))),
    [lots, uncountedSet],
  );
  const stats = useMemo(() => getGlobalStats(visibleLots, households), [visibleLots, households]);

  const enabledWorldCount = WORLDS_SORTED_BY_RELEASE.length - uncountedWorlds.length;
  const pctBuilt = stats.totalLots > 0 ? Math.round((stats.builtLots / stats.totalLots) * 100) : 0;
  const pctPlanned = stats.totalLots > 0 ? Math.round((stats.plannedLots / stats.totalLots) * 100) : 0;

  const sortedWorlds = useMemo(
    () => [...WORLDS_SORTED_BY_RELEASE].sort((a, b) => {
      const aDisabled = disabledWorlds.includes(a) ? 1 : 0;
      const bDisabled = disabledWorlds.includes(b) ? 1 : 0;
      return aDisabled - bDisabled;
    }),
    [disabledWorlds],
  );

  // A save that isn't linked AND has nothing authored in it is the one state
  // where this page means nothing yet — a grid of 0% worlds. A third of
  // signups took the "plan without a save file" door, landed exactly here,
  // and left without adding a thing; the small Link button top-right wasn't
  // read as the way out. So this one state gets a card that says what linking
  // brings, and the header button yields to it (two controls for one action
  // on one screen is the pattern this page already culled once). The card
  // retires itself the moment anything exists — a link, a household, one
  // planned lot — and never comes back to scold a deliberate from-scratch plan.
  const isUntouched = useMemo(
    () =>
      !sourceSaveFilename &&
      Object.keys(households).length === 0 &&
      !Object.values(lots).some((l) => (l.status ?? 'unplanned') !== 'unplanned'),
    [sourceSaveFilename, households, lots],
  );

  return (
    <div className="px-4 sm:px-7 py-4 sm:py-6 max-w-[1600px]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="w-full max-w-2xl text-2xl sm:text-3xl font-bold text-c-text leading-tight tracking-headline bg-transparent border-0 border-b-2 border-c-accent outline-none pb-0.5"
            />
          ) : (
            <button
              onClick={() => { setNameDraft(saveFileName); setEditingName(true); }}
              title="Rename save"
              className="group inline-flex max-w-full items-center gap-2 bg-transparent border-none p-0 cursor-text text-left"
            >
              <h1 className="text-2xl sm:text-3xl font-bold text-c-text leading-tight tracking-headline break-words">{saveFileName}</h1>
              <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          {/* Compact at-a-glance line — counts respect enabled worlds (#6). */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-sm text-c-dim">
            <span><b className="text-c-text font-bold tabular-nums">{enabledWorldCount}</b> worlds</span>
            <span className="text-c-faint" aria-hidden>·</span>
            <span><b className="text-c-text font-bold tabular-nums">{stats.totalLots}</b> lots</span>
            <span className="text-c-faint" aria-hidden>·</span>
            <span><b className="text-c-green font-bold tabular-nums">{pctBuilt}%</b> built</span>
            <span className="text-c-faint" aria-hidden>·</span>
            <span><b className="text-c-secondary font-bold tabular-nums">{pctPlanned}%</b> planned</span>
            {/* Sync age rides the stats line because it IS a fact about this
                save, like the counts beside it. It replaced an amber banner
                that was the third control on this page firing the same action
                — the topbar chip and the button above already offer it, and
                the banner's only edge was saying the age out loud. Omitted
                entirely when nothing is linked: "synced never" says nothing,
                and those saves show "Import save" instead. */}
            {sourceSaveFilename && syncedAgo && (
              <>
                <span className="text-c-faint" aria-hidden>·</span>
                <span className={isAged ? 'text-c-dim' : 'text-c-faint'}>
                  synced <b className={isAged ? 'text-c-text font-bold' : 'text-c-dim font-semibold'}>{syncedAgo}</b>
                </span>
              </>
            )}
          </div>
        </div>
        {/* Sync — inline with the name (the topbar carries the same action).
            Hidden while the link-a-save card below is up: that card IS this
            button, said properly, and one screen offers one door. */}
        {!isUntouched && <div className="shrink-0">
          {sourceSaveFilename ? (
            <button
              onClick={() => setShowReimport(true)}
              title={syncedAgo ? `Last synced ${syncedAgo}` : `Originally imported from ${sourceSaveFilename}`}
              className={btn('primary', { size: 'sm', elevated: true })}
            >
              <ArrowsClockwise size={14} weight="bold" />
              Sync from save
            </button>
          ) : (
            <button
              onClick={() => setShowReimport(true)}
              title="Import a .save file to pull in your sims, households, and lots"
              className={btn('primary', { size: 'sm', elevated: true })}
            >
              <DownloadSimple size={14} weight="bold" />
              Import save
            </button>
          )}
        </div>}
      </div>

      {isUntouched && (
        <div className="bg-c-card border border-c-border rounded-xl px-5 py-4 mb-6 flex items-center gap-4">
          <span className="w-10 h-10 rounded-full bg-c-accent-soft grid place-items-center shrink-0">
            <DownloadSimple size={20} weight="duotone" className="text-c-green" />
          </span>
          <p className="flex-1 min-w-0 m-0 text-sm leading-snug">
            <span className="font-bold text-c-text">Import your own save file!</span>{' '}
            <span className="text-c-dim">
              Your sims, households, and lots will show up here.
            </span>
          </p>
          <button
            onClick={() => setShowReimport(true)}
            className={btn('primary', { size: 'sm', elevated: true, className: 'shrink-0' })}
          >
            <DownloadSimple size={14} weight="bold" />
            Import save
          </button>
        </div>
      )}

      {/* Section header — Worlds / Lot Types tabs live here now, not in the
          page header. Tile/list toggle hangs to the right on the Worlds tab. */}
      <div className="flex items-center gap-3 mb-4 mt-2">
        <h2 className="text-base font-bold m-0 tracking-headline text-c-green">
          {tab === 'overview' ? 'Worlds' : 'Lot Types'}
        </h2>
        <div className="flex-1 h-px bg-c-border" />
        <div className="flex items-center gap-1.5">
          {(['overview', 'lottypes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-md text-2xs font-semibold uppercase tracking-label border cursor-pointer transition-colors ${tab === t ? 'border-c-accent bg-c-accent-soft text-c-green' : 'border-c-border bg-transparent text-c-dim hover:text-c-text'}`}
            >
              {t === 'overview' ? 'Worlds' : 'Lot types'}
            </button>
          ))}
          {tab === 'overview' && (
            <div className="flex items-center gap-0.5 bg-c-panel border border-c-border rounded-lg p-0.5 ml-1">
              <Tooltip text="Tile view">
                <button
                  onClick={() => setView('tile')}
                  aria-label="Tile view"
                  className={`p-1.5 rounded-md transition-colors ${view === 'tile' ? 'bg-c-card shadow-sm text-c-accent' : 'text-c-dim hover:text-c-text'}`}
                >
                  <SquaresFour size={14} weight={view === 'tile' ? 'fill' : 'regular'} />
                </button>
              </Tooltip>
              <Tooltip text="List view">
                <button
                  onClick={() => setView('list')}
                  aria-label="List view"
                  className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-c-card shadow-sm text-c-accent' : 'text-c-dim hover:text-c-text'}`}
                >
                  <ListBullets size={14} weight={view === 'list' ? 'bold' : 'regular'} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {tab === 'lottypes' ? (
        <LotTypesTab lots={lots} excludedWorlds={uncountedWorlds} />
      ) : view === 'tile' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-x-3 gap-y-10 pt-8">
            {sortedWorlds.map((worldName) => (
              <WorldTile key={worldName} worldName={worldName} />
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-2xs text-c-faint font-medium">
            <span><span className="text-c-accent">■</span> Built</span>
            <span><span className="text-c-secondary">■</span> Planned</span>
            <span><span className="text-c-border-mid">■</span> Unplanned</span>
          </div>
        </>
      ) : (
        <>
          <div className="bg-c-card border border-c-border rounded-lg overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-c-border">
                  {['World', 'Pack', 'Neighborhoods', 'Lots', 'Progress', ''].map((h, i) => (
                    <th
                      key={h}
                      className={`py-[10px] text-2xs text-c-faint tracking-label uppercase font-semibold ${i === 0 || i === 4 ? 'px-4 text-left' : 'px-2 text-center'} ${i === 2 ? 'text-left' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedWorlds.map((worldName) => (
                  <WorldRow key={worldName} worldName={worldName} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-3 text-2xs text-c-faint font-medium">
            <span><span className="text-c-accent">■</span> Built</span>
            <span><span className="text-c-secondary">■</span> Planned</span>
            <span><span className="text-c-border-mid">■</span> Unplanned</span>
          </div>
        </>
      )}

      {showReimport && saveFileId && (
        <GameReimport
          saveFileId={saveFileId}
          currentSourceFilename={sourceSaveFilename}
          currentSourceSaveName={sourceSaveName}
          onCancel={() => setShowReimport(false)}
          onComplete={async (syncedId) => {
            setShowReimport(false);
            if (syncedId !== saveFileId) {
              // User opted to duplicate-and-sync — navigate to the clone.
              navigate(`/saves/${syncedId}`);
            } else if (saveFileId) {
              // Reload to pick up any changes the apply step made
              await loadSaveFile(saveFileId);
            }
          }}
        />
      )}

      {/* Celebratory overlay shown once after a successful .save import. */}
      <FirstImportCelebration />
    </div>
  );
}
