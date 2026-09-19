/**
 * Lot build-prompt rollers — the lot-flavored siblings of the household
 * randomizer. Two modes:
 *
 *   WorldPromptRoller ("Roll a world") — abstract prompt: random owned world +
 *     lot type + size, each independently lockable/rerollable. Worlds that are
 *     100% planned/built (nothing left to do) are excluded.
 *
 *   SaveLotRoller ("Roll a lot") — picks a real, still-unplanned lot from the
 *     save (residential or venue) and offers to open it in the lot editor.
 *
 * Both respect pack ownership AND the per-save disabled-worlds list.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shuffle, ArrowsClockwise, Lock, LockOpen, MapPin, Buildings, Ruler, PencilSimple } from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { WORLDS_SORTED_BY_RELEASE, WORLDS_DATA, getAllLotTypes, getLotCategory, isLotVisible } from '../data/worlds';
import { RELEASE_TO_PACK } from '../data/packs';
import { isLotTypeOwned } from '../data/lotTypePacks';
import { usePackOwnership } from '../store/usePackOwnership';
import { useSaveFile } from '../store/useSaveFile';
import type { PlannedLot } from '../types';
import { btn } from '../components/common/btn';
import { Tooltip } from '../components/common/Tooltip';

const LOT_SIZES = ['20x15', '20x20', '30x20', '30x30', '40x30', '40x40', '50x40', '50x50', '64x64'];

const ROLLER_TYPE_EXCLUDE: ReadonlySet<string> = new Set([
  'UBrite Commons', 'Foxbury Commons', 'Island Bluff',
  'Chalet Gardens', 'Center Park', 'Ancient Ruins',
]);

const CATEGORY_DOT: Record<string, string> = {
  home: 'bg-c-accent',
  rental: 'bg-c-accent-soft',
  venue: 'bg-c-secondary',
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
function pickFresh<T>(arr: T[], current: T | undefined): T {
  if (arr.length <= 1 || current === undefined) return pick(arr);
  const pool = arr.filter((x) => x !== current);
  return pick(pool.length > 0 ? pool : arr);
}

// Distinct buildable footprints (NxM) of visible lots in a world — so a rolled
// size is one that actually exists there (no "64x64 in Forgotten Hollow" when
// that world has no such lot). Falls back to the standard set if a world has
// no grid-sized lots (e.g. apartment-only shells).
function sizesInWorld(world: string): string[] {
  const w = WORLDS_DATA[world as keyof typeof WORLDS_DATA];
  if (!w) return LOT_SIZES;
  const set = new Set<string>();
  for (const lot of w.lots) {
    if (isLotVisible(lot.type) && /^\d+x\d+$/.test(lot.size)) set.add(lot.size);
  }
  return sortBySize([...set].length > 0 ? [...set] : LOT_SIZES);
}

function sortBySize(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const [aw, ah] = a.split('x').map(Number);
    const [bw, bh] = b.split('x').map(Number);
    return aw * ah - bw * bh;
  });
}

// Apartments + penthouses are world-locked in-game. Apartments are unit shells
// (no editable footprint); penthouses come in the fixed sizes their world's
// penthouse lots ship with.
const APARTMENT_WORLDS: ReadonlySet<string> = new Set(['San Myshuno', 'Evergreen Harbor', 'Ondarion']);
const PENTHOUSE_WORLDS: ReadonlySet<string> = new Set(['San Myshuno', 'Ciudad Enamorada']);

/** Worlds (within `pool`) where the given lot type can exist. */
function worldsAllowingType(type: string, pool: string[]): string[] {
  if (type === 'Apartment') return pool.filter((w) => APARTMENT_WORLDS.has(w));
  if (type === 'Penthouse') return pool.filter((w) => PENTHOUSE_WORLDS.has(w));
  return pool;
}

/** Buildable footprints for a (world, type). Empty = no footprint (apartments). */
function sizesForTypeInWorld(world: string, type: string): string[] {
  if (type === 'Apartment') return [];
  if (type === 'Penthouse') {
    const w = WORLDS_DATA[world as keyof typeof WORLDS_DATA];
    const set = new Set<string>();
    if (w) for (const lot of w.lots) {
      if (lot.type === 'Penthouse' && /^\d+x\d+$/.test(lot.size)) set.add(lot.size);
    }
    return sortBySize([...set]);
  }
  return sizesInWorld(world);
}

/** Shared pack-ownership + disabled-world predicates. */
function useWorldGate() {
  const isPackOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const lots = useSaveFile((s) => s.lots);
  return useMemo(
    () => ({ isPackOwned, disabledWorlds, lots }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPackOwned, manualOverrides, autoDetected, disabledWorlds, lots],
  );
}

const worldOwnedAndEnabled = (
  world: string,
  isPackOwned: (p: string) => boolean,
  disabledWorlds: string[],
): boolean => {
  if (disabledWorlds.includes(world)) return false;
  const packId = RELEASE_TO_PACK[WORLDS_DATA[world as keyof typeof WORLDS_DATA].release];
  return !packId || isPackOwned(packId);
};

// ─── Roll a world (abstract prompt) ──────────────────────────────────────────

export function WorldPromptRoller() {
  const { isPackOwned, disabledWorlds, lots } = useWorldGate();

  // Worlds eligible to roll: owned + enabled + still have at least one
  // unplanned lot (i.e. not 100% planned/built).
  const worldPool = useMemo(() => {
    const hasOpenLot = new Set<string>();
    for (const l of Object.values(lots)) {
      if (l.status === 'unplanned' && isLotVisible(l.defaultType)) hasOpenLot.add(l.worldName);
    }
    return WORLDS_SORTED_BY_RELEASE.filter(
      (w) => worldOwnedAndEnabled(w, isPackOwned, disabledWorlds) && hasOpenLot.has(w),
    );
  }, [lots, isPackOwned, disabledWorlds]);

  // Only types that have at least one eligible world (drops Apartment /
  // Penthouse when their worlds aren't owned/enabled/open).
  const typePool = useMemo(
    () => getAllLotTypes().filter(
      (t) => !ROLLER_TYPE_EXCLUDE.has(t) && isLotTypeOwned(t, isPackOwned) && worldsAllowingType(t, worldPool).length > 0,
    ),
    [isPackOwned, worldPool],
  );

  const [rolled, setRolled] = useState<{ world: string; lotType: string; size: string | null } | null>(null);
  const [locks, setLocks] = useState({ world: false, lotType: false, size: false });

  const empty = worldPool.length === 0 || typePool.length === 0;
  const toggleLock = (k: keyof typeof locks) => setLocks((l) => ({ ...l, [k]: !l[k] }));

  // Resolve a size for a (world, type), keeping a locked size if it's still
  // valid there. Returns null for types with no footprint (apartments).
  const resolveSize = (world: string, type: string, prevSize: string | null, keepLocked: boolean): string | null => {
    const sizes = sizesForTypeInWorld(world, type);
    if (sizes.length === 0) return null;
    if (keepLocked && prevSize && sizes.includes(prevSize)) return prevSize;
    return pickFresh(sizes, prevSize ?? undefined);
  };

  // Slots are coupled: lot type constrains which worlds are valid (apartments /
  // penthouses are world-locked) and which sizes exist. We roll type → world →
  // size, with each step honoring the others' locks so prompts stay buildable.
  function rollAll() {
    setRolled((prev) => {
      const lotType = locks.lotType && prev
        ? prev.lotType
        : pickFresh(
            (locks.world && prev ? typePool.filter((t) => worldsAllowingType(t, worldPool).includes(prev.world)) : typePool),
            prev?.lotType,
          );
      let worldChoices = worldsAllowingType(lotType, worldPool);
      if (locks.size && prev?.size) {
        const f = worldChoices.filter((w) => sizesForTypeInWorld(w, lotType).includes(prev.size!));
        if (f.length) worldChoices = f;
      }
      const world = locks.world && prev && worldChoices.includes(prev.world) ? prev.world : pickFresh(worldChoices, prev?.world);
      return { world, lotType, size: resolveSize(world, lotType, prev?.size ?? null, locks.size) };
    });
  }

  const rerollWorld = () => setRolled((p) => {
    if (!p) return p;
    let choices = worldsAllowingType(p.lotType, worldPool);
    if (locks.size && p.size) {
      const f = choices.filter((w) => sizesForTypeInWorld(w, p.lotType).includes(p.size!));
      if (f.length) choices = f;
    }
    const world = pickFresh(choices, p.world);
    return { ...p, world, size: resolveSize(world, p.lotType, p.size, locks.size) };
  });

  // Rerolling type keeps the world fixed by only drawing types valid there,
  // then re-resolves the size for the new type.
  const rerollType = () => setRolled((p) => {
    if (!p) return p;
    const pool = typePool.filter((t) => worldsAllowingType(t, worldPool).includes(p.world));
    const lotType = pickFresh(pool.length ? pool : typePool, p.lotType);
    return { ...p, lotType, size: resolveSize(p.world, lotType, p.size, false) };
  });

  const rerollSize = () => setRolled((p) => {
    if (!p) return p;
    const sizes = sizesForTypeInWorld(p.world, p.lotType);
    if (sizes.length === 0) return p;
    return { ...p, size: pickFresh(sizes, p.size ?? undefined) };
  });

  return (
    <div className="max-w-xl mx-auto">
      <RollButton onClick={rollAll} disabled={empty} label={rolled ? 'Roll again' : 'Roll a world'} />
      {empty ? (
        <EmptyCard text="No eligible worlds — everything's planned or built, or no packs are enabled." />
      ) : !rolled ? (
        <EmptyCard text="Roll for a build prompt — a world, lot type, and size to design around." />
      ) : (
        <div className="rounded-2xl bg-c-card border border-c-border divide-y divide-c-border overflow-hidden">
          <LotSlot icon={MapPin} label="World" value={rolled.world} locked={locks.world}
            onLock={() => toggleLock('world')} onReroll={rerollWorld} />
          <LotSlot icon={Buildings} label="Lot type" value={rolled.lotType} dot={CATEGORY_DOT[getLotCategory(rolled.lotType)]} locked={locks.lotType}
            onLock={() => toggleLock('lotType')} onReroll={rerollType} />
          {/* Apartments have no footprint — the size slot is omitted for them. */}
          {rolled.size !== null && (
            <LotSlot icon={Ruler} label="Size" value={rolled.size} locked={locks.size}
              onLock={() => toggleLock('size')} onReroll={rerollSize} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Roll a lot (real, unplanned lot from the save) ──────────────────────────

export function SaveLotRoller() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const { isPackOwned, disabledWorlds, lots } = useWorldGate();

  // Pool: unplanned lots (touching a lot — planning or building it — moves it
  // off 'unplanned' and out of the roll), in owned+enabled worlds, visible
  // types only, of an owned lot type. Includes residential and venues.
  const lotPool = useMemo(
    () => Object.values(lots).filter(
      (l) =>
        l.status === 'unplanned' &&
        isLotVisible(l.defaultType) &&
        worldOwnedAndEnabled(l.worldName, isPackOwned, disabledWorlds) &&
        isLotTypeOwned(l.customType, isPackOwned),
    ),
    [lots, isPackOwned, disabledWorlds],
  );

  const [rolled, setRolled] = useState<PlannedLot | null>(null);
  const empty = lotPool.length === 0;

  function roll() {
    setRolled((prev) => pickFresh(lotPool, prev ?? undefined));
  }

  return (
    <div className="max-w-xl mx-auto">
      <RollButton onClick={roll} disabled={empty} label={rolled ? 'Roll again' : 'Roll a lot'} />
      {empty ? (
        <EmptyCard text="No unplanned lots to roll — every eligible lot is already planned or built." />
      ) : !rolled ? (
        <EmptyCard text="Roll an unplanned lot from the save to work on next." />
      ) : (
        <>
          <p className="text-2xs uppercase tracking-label text-c-dim mb-2">This lot, as it is now</p>
          <div className="rounded-2xl bg-c-card border border-c-border divide-y divide-c-border overflow-hidden">
            <ReadonlySlot icon={MapPin} label="Lot" value={rolled.customName || rolled.name} sub={rolled.worldName} />
            <ReadonlySlot icon={Buildings} label="Currently a" value={rolled.customType} dot={CATEGORY_DOT[getLotCategory(rolled.customType)]} />
            <ReadonlySlot icon={Ruler} label="Size" value={rolled.size} />
          </div>
          <button
            onClick={() => saveFileId && navigate(`/saves/${saveFileId}/world/${encodeURIComponent(rolled.worldName)}?lot=${encodeURIComponent(rolled.lotKey)}`)}
            className={btn('primary', { size: 'lg', block: true, className: 'mt-3' })}
          >
            <PencilSimple size={16} weight="bold" />
            Open in editor
          </button>
        </>
      )}
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function RollButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 mb-5 rounded-xl bg-c-secondary text-white font-semibold text-sm tracking-headline flex items-center justify-center gap-2 hover:bg-c-secondary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Shuffle size={18} weight="bold" />
      {label}
    </button>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-c-card border border-c-border border-dashed p-12 text-center">
      <Buildings size={32} weight="duotone" className="text-c-faint mx-auto mb-3" />
      <p className="text-sm text-c-dim">{text}</p>
    </div>
  );
}

function SlotShell({ icon: Icon, label, children, tinted }: {
  icon: PhosphorIcon; label: string; children: React.ReactNode; tinted?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 px-5 py-4 transition-colors ${tinted ? 'bg-c-accent-soft' : ''}`}>
      <div className="w-9 h-9 rounded-xl bg-c-panel flex items-center justify-center shrink-0">
        <Icon size={18} weight="duotone" className="text-c-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-3xs font-bold uppercase tracking-label-lg text-c-dim mb-0.5">{label}</div>
        {children}
      </div>
    </div>
  );
}

function LotSlot({ icon, label, value, dot, locked, onLock, onReroll }: {
  icon: PhosphorIcon; label: string; value: string; dot?: string; locked: boolean; onLock: () => void; onReroll: () => void;
}) {
  return (
    <SlotShell icon={icon} label={label} tinted={locked}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
          <span className="text-lg font-bold text-c-text tracking-display truncate">{value}</span>
        </div>
        <Tooltip text={`Reroll ${label.toLowerCase()}`}>
          <button onClick={onReroll}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-c-dim hover:text-c-secondary hover:bg-c-panel bg-transparent border-none cursor-pointer transition-colors shrink-0" aria-label={`Reroll ${label.toLowerCase()}`}>
            <ArrowsClockwise size={15} weight="bold" />
          </button>
        </Tooltip>
        <Tooltip text={locked ? 'Unlock' : 'Lock'}>
          <button onClick={onLock}
            className={`w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors shrink-0 ${locked ? 'text-c-accent hover:bg-c-accent-soft' : 'text-c-faint hover:text-c-dim hover:bg-c-panel'}`} aria-label={locked ? 'Unlock' : 'Lock'}>
            {locked ? <Lock size={15} weight="fill" /> : <LockOpen size={15} weight="bold" />}
          </button>
        </Tooltip>
      </div>
    </SlotShell>
  );
}

function ReadonlySlot({ icon, label, value, sub, dot }: {
  icon: PhosphorIcon; label: string; value: string; sub?: string; dot?: string;
}) {
  return (
    <SlotShell icon={icon} label={label}>
      <div className="flex items-center gap-2">
        {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
        <span className="text-lg font-bold text-c-text tracking-display truncate">{value}</span>
      </div>
      {sub && <div className="text-xs font-medium text-c-muted truncate mt-0.5">{sub}</div>}
    </SlotShell>
  );
}
