import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { X, Plus, CaretLeft, CaretRight, CaretDown, Check, Lightbulb, ArrowSquareOut, MapPin, Tag, Eye, EyeSlash, Trash } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { uploadPhotos } from '../lib/photoUpload';
import { useSaveFile } from '../store/useSaveFile';
import type { Photo } from '../types';
import { WORLDS_SORTED_BY_RELEASE } from '../data/worlds';
import { usePlannableWorlds, useIsWorldPlannable } from '../hooks/usePlannableWorlds';
import { useConfirm } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { Pill } from '../components/common/Pill';
import { btn } from '../components/common/btn';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

type AssignTarget = { targetType: string; targetKey: string; label: string };

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({
  photo,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  navInfo,
}: {
  photo: Photo;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  navInfo?: { idx: number; total: number };
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, hasPrev, hasNext, onPrev, onNext]);

  // No @gallery_creator chip: the server hard-nulls that column for inspo
  // uploads (only `built` photos can carry one), so it could never render here.
  const tags = photo.tags ?? [];

  return (
    <div className="fixed inset-0 bg-black/90 z-[400] flex flex-col items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full bg-transparent border-none cursor-pointer z-10 transition-colors"
      >
        <X size={20} weight="bold" />
      </button>

      {/* Arrows pinned to the viewport, NOT to the image. They cannot move
          between photos because they're absolutely positioned against the
          fixed-inset backdrop. */}
      {(onPrev || onNext) && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
            disabled={!hasPrev}
            aria-label="Previous photo"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white border-none cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center transition-colors z-10"
          >
            <CaretLeft size={20} weight="bold" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNext?.(); }}
            disabled={!hasNext}
            aria-label="Next photo"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white border-none cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center transition-colors z-10"
          >
            <CaretRight size={20} weight="bold" />
          </button>
        </>
      )}

      <img
        src={api.photoUrl(photo.filename)}
        alt="Inspo photo"
        className="max-h-[78vh] max-w-[80vw] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {tags.length > 0 && (
        <div
          className="mt-4 max-w-3xl w-full flex items-center gap-2 flex-wrap justify-center px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {tags.map((tag) => (
            <span key={tag} className="text-2xs font-semibold rounded-full px-2 py-0.5 border border-white/25 text-white/80">
              {tag}
            </span>
          ))}
        </div>
      )}
      {navInfo && navInfo.total > 1 && (
        <p
          className="text-white/30 text-2xs uppercase tracking-label font-semibold mt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {navInfo.idx + 1} / {navInfo.total}
        </p>
      )}
    </div>
  );
}

// ─── Tag Chip ─────────────────────────────────────────────────────────────────
// One colour for every tag — the vocabulary is user-coined and unbounded, so
// per-tag hues would just be the random colour this app has been shedding.
// Tags are purple, the same as everywhere else they appear.

const TAG_ON  = 'bg-c-secondary-soft text-c-secondary border-c-secondary-border';
const TAG_OFF = 'bg-transparent text-c-dim border-c-border hover:text-c-text hover:border-c-border-mid';

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  photo,
  onMetaSave,
  onDelete,
  onAssign,
  onUnassign,
  onLightbox,
  onToggleExclude,
  activeWorldName,
  onActivateWorld,
  allTags,
  onCoinTag,
  onBack,
  navList,
  navIdx,
  onStep,
}: {
  photo: Photo;
  onMetaSave: (fields: { tags?: string[] }) => void;
  onCoinTag: (name: string) => void;
  onDelete: () => void;
  onAssign: (t: AssignTarget) => void;
  onUnassign: () => void;
  onLightbox: () => void;
  onToggleExclude: () => void;
  activeWorldName?: string;
  onActivateWorld?: (w: string) => void;
  allTags: string[];
  onBack?: () => void;
  navList: Photo[];
  /** -1 when the open photo is filtered out of the rail — deliberate. */
  navIdx: number;
  onStep: (delta: number) => void;
}) {
  // Keyboard nav is bound at page level now, not here — see the comment on the
  // Photos() handler. These just drive the on-image arrows.
  const hasPrev = navIdx > 0;
  const hasNext = navIdx >= 0 && navIdx < navList.length - 1;
  function goPrev() { onStep(-1); }
  function goNext() { onStep(1); }

  const [tagInput, setTagInput] = useState('');
  const [composing, setComposing] = useState(false);
  const lots = useSaveFile((s) => s.lots);
  const enabledWorlds = usePlannableWorlds();

  const tags = photo.tags ?? [];

  function toggleTag(tag: string) {
    onMetaSave({ tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] });
  }

  // New tags are coined HERE and nowhere else — the pool filters by the
  // vocabulary but can't extend it. Coining registers the tag with the user's
  // vocabulary as well as putting it on this photo, so taking it back off
  // doesn't destroy it.
  function coinTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    setTagInput('');
    setComposing(false);
    if (!tag) return;
    onCoinTag(tag);
    if (!tags.includes(tag)) onMetaSave({ tags: [...tags, tag] });
  }

  function assignmentLabel(): string | null {
    if (!photo.assignment) return null;
    const { target_type, target_key } = photo.assignment;
    if (target_type === 'world') return target_key;
    if (target_type === 'lot') return lots[target_key]?.customName ?? target_key;
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      {/* Top chrome bar — Back-to-pool + nav arrows live HERE at Y=0 of the
          panel. They never move regardless of which photo is open or its
          aspect ratio. Mouse target is permanent. */}
      <div className="shrink-0 px-3 py-2.5 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-c-accent hover:text-c-accent-hover bg-transparent border-none cursor-pointer px-0 transition-colors"
          >
            <CaretLeft size={12} weight="bold" />
            Back to pool
          </button>
        )}
        <div className="flex-1" />
        {navList && navList.length > 1 && (
          <span className="text-2xs font-semibold tracking-label uppercase text-c-dim tabular-nums">
            {navIdx + 1} <span className="text-c-faint">/</span> {navList.length}
          </span>
        )}
      </div>

      {/* Mobile assign bar — pinned at the top so it's visible the moment you
          open a photo (no scrolling past the image). Pick a world once, then
          tap Assign; assigning auto-advances to the next photo, so you run
          straight through the pile. Hidden on desktop, where the right-hand
          world panel drives assignment. */}
      {onActivateWorld && (
        <div className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2 bg-c-secondary-soft">
          <MapPin size={14} weight="fill" className="text-c-secondary shrink-0" />
          <select
            value={activeWorldName ?? ''}
            onChange={(e) => onActivateWorld(e.target.value)}
            aria-label="Assign to world"
            className="flex-1 min-w-0 text-sm border border-c-secondary-border rounded-lg px-2.5 py-1.5 bg-c-card text-c-text font-semibold focus:outline-none focus:border-c-secondary cursor-pointer"
          >
            {enabledWorlds.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          {photo.assignment ? (
            <span className="shrink-0 text-2xs font-bold uppercase tracking-label text-c-green">✓ Assigned</span>
          ) : (
            <button
              onClick={() => activeWorldName && onAssign({ targetType: 'world', targetKey: activeWorldName, label: activeWorldName })}
              disabled={!activeWorldName}
              className="shrink-0 text-sm font-semibold text-white bg-c-secondary hover:bg-c-secondary-hover rounded-lg px-3.5 py-1.5 border-none cursor-pointer disabled:opacity-40 transition-colors"
            >
              Assign →
            </button>
          )}
        </div>
      )}

      {/* Image preview. The stage flexes to fill whatever the panel doesn't
          need, rather than a fixed 55vh that left dead bands above and below a
          landscape shot. Arrows sit ON the image, where every gallery puts
          them — they used to be a quiet pair up in the chrome bar that read as
          pagination. No "Click to zoom" label: the cursor already says it. */}
      <div
        className="relative flex-1 min-h-[200px] bg-c-stage cursor-zoom-in flex items-center justify-center overflow-hidden px-14 py-3"
        onClick={onLightbox}
      >
        <img
          src={api.photoUrl(photo.filename, 700)}
          alt="Inspo photo"
          className="max-w-full max-h-full object-contain"
        />
        {navList && navList.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              disabled={!hasPrev}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-c-card hover:bg-c-panel border border-c-border text-c-muted hover:text-c-text cursor-pointer transition-colors disabled:opacity-0 disabled:pointer-events-none shadow-sm"
            >
              <CaretLeft size={15} weight="bold" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              disabled={!hasNext}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-c-card hover:bg-c-panel border border-c-border text-c-muted hover:text-c-text cursor-pointer transition-colors disabled:opacity-0 disabled:pointer-events-none shadow-sm"
            >
              <CaretRight size={15} weight="bold" />
            </button>
          </>
        )}
      </div>

      {/* Fields sit below the stage at their natural height — the stage is what
          flexes now, so this never scrolls in practice. */}
      <div className="shrink-0 flex flex-col gap-3 px-4 py-3">
        {/* Tags — the only metadata an inspo photo carries now. Chips-first:
            you pick from the vocabulary far more often than you extend it,
            and picking rather than typing is what stops user-coined tags
            drifting into near-duplicates. */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors cursor-pointer ${
                tags.includes(tag) ? TAG_ON : TAG_OFF
              }`}
            >
              {tag}
            </button>
          ))}
          {composing ? (
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); coinTag(tagInput); }
                if (e.key === 'Escape') { setTagInput(''); setComposing(false); }
              }}
              onBlur={() => coinTag(tagInput)}
              placeholder="new tag…"
              autoFocus
              className="w-28 text-xs px-2.5 py-1 rounded-full border border-c-secondary-border bg-c-base text-c-text focus:outline-none focus:border-c-secondary"
            />
          ) : (
            <button
              onClick={() => setComposing(true)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-dashed border-c-border text-c-faint hover:text-c-secondary hover:border-c-secondary bg-transparent cursor-pointer transition-colors"
            >
              <Tag size={10} weight="fill" />
              Tag
            </button>
          )}
        </div>

        {/* One quiet row: where it's filed, and the two housekeeping actions.
            No "Not on a world yet" placeholder — absence is the signal, and
            the world column is right there saying what to do about it. No lot
            picker either; lot-level filing belongs in the lot editor. */}
        <div className="flex items-center gap-2 min-h-[26px]">
          {photo.assignment && (
            <>
              <MapPin size={13} weight="fill" className="text-c-green shrink-0" />
              <span className="text-sm font-semibold text-c-green truncate">{assignmentLabel()}</span>
              <button
                onClick={onUnassign}
                aria-label="Take off this world"
                title="Take off this world"
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-c-faint hover:text-c-red hover:bg-c-red-bg bg-transparent border-none cursor-pointer transition-colors"
              >
                <X size={10} weight="bold" />
              </button>
            </>
          )}
          <div className="flex-1" />
          {/* Both small now. The weight difference that used to separate them
              lives in the confirm dialog instead, which is where it matters. */}
          <button
            onClick={onToggleExclude}
            aria-label={photo.excluded ? 'Show in this save' : 'Hide from this save'}
            title={photo.excluded ? 'Show in this save' : 'Hide from this save'}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-c-faint hover:text-c-secondary hover:bg-c-secondary-soft bg-transparent border-none cursor-pointer transition-colors"
          >
            {photo.excluded ? <Eye size={14} weight="regular" /> : <EyeSlash size={14} weight="regular" />}
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete from all saves"
            title="Delete from all saves"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-c-faint hover:text-c-red hover:bg-c-red-bg bg-transparent border-none cursor-pointer transition-colors"
          >
            <Trash size={14} weight="regular" />
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── World Navigator (right panel) ───────────────────────────────────────────

function WorldNavigator({
  photos,
  stickyWorld,
  onAssignWorld,
  selectedId,
  onSelect,
}: {
  photos: Photo[];
  /** Last world assigned to — bound to Enter, and lit so you can see it. */
  stickyWorld: string | null;
  onAssignWorld: (world: string) => void;
  selectedId: string | null;
  onSelect: (p: Photo) => void;
}) {
  const lots = useSaveFile((s) => s.lots);
  const isWorldPlannable = useIsWorldPlannable();

  // Hidden photos don't count toward a world and don't appear under it —
  // hiding is the per-save "get this out of my way", so it has to hold
  // everywhere the photo would otherwise surface.
  const worldPhotoCounts: Record<string, number> = {};
  for (const p of photos) {
    if (p.excluded) continue;
    if (!p.assignment) continue;
    if (p.assignment.target_type === 'world') {
      worldPhotoCounts[p.assignment.target_key] = (worldPhotoCounts[p.assignment.target_key] ?? 0) + 1;
    } else if (p.assignment.target_type === 'lot') {
      const lot = lots[p.assignment.target_key];
      if (lot) {
        worldPhotoCounts[lot.worldName] = (worldPhotoCounts[lot.worldName] ?? 0) + 1;
      }
    }
  }

  const photosForWorld = (w: string) => photos.filter((p) => {
    if (p.excluded) return false;
    if (!p.assignment) return false;
    if (p.assignment.target_type === 'world' && p.assignment.target_key === w) return true;
    if (p.assignment.target_type === 'lot') return lots[p.assignment.target_key]?.worldName === w;
    return false;
  });

  function getLotName(photo: Photo): string | null {
    if (photo.assignment?.target_type !== 'lot') return null;
    return lots[photo.assignment.target_key]?.customName ?? null;
  }

  // Which world is expanded to reveal its inspo. The COUNT is what expands —
  // a separate caret plus the row's send-arrow read as two arrows, and left a
  // ghost gutter beside every empty world.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleExpand = (w: string) => setExpanded((prev) => (prev === w ? null : w));

  // Show only plannable worlds (pack owned + not switched off) — but keep any
  // non-plannable world that still holds photos so you can find and reassign
  // them (disabling a world/pack doesn't unassign its inspo).
  const visibleWorlds = WORLDS_SORTED_BY_RELEASE.filter(
    (w) => isWorldPlannable(w) || (worldPhotoCounts[w] ?? 0) > 0,
  );

  // Worlds already holding photos float to the top. Otherwise the three you're
  // actually working in sit twenty rows down a release-ordered list.
  const used = visibleWorlds.filter((w) => (worldPhotoCounts[w] ?? 0) > 0);
  const rest = visibleWorlds.filter((w) => !(worldPhotoCounts[w] ?? 0));

  const renderRow = (w: string) => {
    const cnt = worldPhotoCounts[w] ?? 0;
    const isSticky = stickyWorld === w;
    const isOpen = expanded === w;
    return (
      <div key={w} className="mb-0.5">
        {/* One action, one arrow. The row IS the assign button — a bare row
            reads as a list item, and lists select rather than act, which is
            why the send-arrow is permanent rather than hover-only. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onAssignWorld(w)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAssignWorld(w); }
          }}
          className={`group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
            isSticky
              ? 'border-c-accent-border bg-c-accent-soft'
              : 'border-transparent hover:border-c-accent-border hover:bg-c-accent-soft'
          }`}
        >
          <span className={`flex-1 min-w-0 truncate text-xs ${
            isSticky ? 'font-semibold text-c-green' : 'font-medium text-c-muted group-hover:text-c-green'
          }`}>
            {w}
          </span>
          {cnt > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(w); }}
              aria-expanded={isOpen}
              aria-label={`Show ${cnt} photo${cnt === 1 ? '' : 's'} in ${w}`}
              className={`shrink-0 text-2xs font-bold rounded-full px-1.5 py-px border cursor-pointer tabular-nums transition-colors ${
                isOpen
                  ? 'bg-c-secondary border-c-secondary text-white'
                  : 'bg-c-secondary-soft border-transparent text-c-secondary hover:border-c-secondary-border'
              }`}
            >
              {cnt}
            </button>
          )}
          <CaretRight
            size={11}
            weight="bold"
            aria-hidden
            className={`shrink-0 transition-colors ${isSticky ? 'text-c-green' : 'text-c-faint group-hover:text-c-green'}`}
          />
        </div>
        {isOpen && cnt > 0 && (
          <div className="grid grid-cols-3 gap-1.5 px-1 pt-1.5 pb-2">
            {photosForWorld(w).map((p) => {
              const lotName = getLotName(p);
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer p-0 bg-transparent ${
                    selectedId === p.id ? 'border-c-accent' : 'border-transparent hover:border-c-border-mid'
                  }`}
                >
                  <img src={api.photoUrl(p.filename, 120)} alt="" className="w-full h-full object-cover" />
                  {lotName && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] text-white truncate">
                      {lotName}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const groupLabel = (text: string) => (
    <p className="px-2.5 pt-2 pb-1 text-2xs font-bold uppercase tracking-label text-c-faint m-0">{text}</p>
  );

  return (
    <div className="overflow-y-auto flex-1 p-2">
      {used.length > 0 && (
        <>
          {groupLabel('Recent')}
          {used.map(renderRow)}
          {groupLabel('All worlds')}
        </>
      )}
      {rest.map(renderRow)}
    </div>
  );
}

// ─── Photo Thumb ─────────────────────────────────────────────────────────────

function PhotoThumb({ p, selectedId, onSelect, variant = 'square' }: {
  p: Photo;
  selectedId: string | null;
  onSelect: (p: Photo) => void;
  variant?: 'square' | 'masonry';
}) {
  const lots = useSaveFile((s) => s.lots);
  const isSelected = selectedId === p.id;
  // Name the destination, not its record type — a tile that said "lot" told you
  // nothing you couldn't already see from the fact it's marked at all.
  const assignedTo = p.assignment
    ? (p.assignment.target_type === 'lot'
        ? lots[p.assignment.target_key]?.customName ?? p.assignment.target_key
        : p.assignment.target_key)
    : null;
  // Masonry tiles let the image's natural aspect ratio carry the rhythm —
  // this is the Pinterest-style browse moment. Square tiles stay for the
  // narrow sidebar where uniformity is more legible.
  const sizeClass = variant === 'masonry'
    ? 'mb-3 break-inside-avoid w-full'
    : 'aspect-square w-full';
  return (
    <button
      onClick={() => onSelect(p)}
      /* Selection is ONE clean 2px ring, not a 2px border plus a 3px halo on
         top of it. Drawn as a shadow so it sits outside the tile and never
         eats into the photograph. */
      className={`group relative ${sizeClass} rounded-xl overflow-hidden transition-all cursor-pointer bg-transparent p-0 border-none ${
        isSelected
          ? 'shadow-[0_0_0_2px_var(--c-accent)]'
          : 'shadow-sm hover:shadow-[0_0_0_2px_var(--c-accent-border)]'
      }`}
    >
      {/* No tag chips on tiles. This is a picture-forward page and the metadata
          belongs in the panel, not stamped over the photograph. */}
      <img
        src={api.photoUrl(p.filename, 300)}
        alt="Inspo photo"
        loading="lazy"
        className={`w-full ${variant === 'masonry' ? 'h-auto block' : 'h-full object-cover'} transition-transform duration-300 group-hover:scale-[1.02]`}
        style={variant === 'masonry' && p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined}
        onLoad={(e) => {
          if (!p.width) {
            const t = e.currentTarget;
            if (t.naturalWidth && t.naturalHeight) api.setPhotoDimensions(p.id, t.naturalWidth, t.naturalHeight).catch(() => {});
          }
        }}
      />
      {assignedTo && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/50 to-transparent px-1.5 pt-4 pb-1 text-2xs font-semibold text-white truncate">
          {assignedTo}
        </div>
      )}
    </button>
  );
}

// ─── Main Photos Page ─────────────────────────────────────────────────────────

export function Photos() {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const sfId = saveFileId!;
  const confirm = useConfirm();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Photo | null>(null);
  // Display order, fixed for the session. Assigned photos are sorted to the
  // back ON LOAD and then hold their slot no matter what you do — the grid
  // never reshuffles under you mid-run. Next time you open the page they've
  // sunk. Nothing is ever removed from here; assignment is a tag, not a move.
  const [order, setOrder] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHiddenPhotos, setShowHiddenPhotos] = useState(false);
  // Tag filtering is EXCLUSIVE (AND): a photo must carry every selected tag.
  // "rich" + "residential" narrows to rich residentials; inclusive OR would
  // widen to everything that's either, which is the opposite of filtering.
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(tagMenuRef, () => setTagMenuOpen(false), tagMenuOpen);
  const [managingTags, setManagingTags] = useState(false);
  // The world you last sent a photo to. Lit in the list and bound to Enter, so
  // a run of same-world photos costs one keypress each.
  const [stickyWorld, setStickyWorld] = useState<string | null>(null);
  // Last assignment, offered back for one action. Lives in the world column's
  // hint slot rather than floating over the working area.
  const [undoable, setUndoable] = useState<
    { photoId: string; prev: Photo['assignment']; label: string } | null
  >(null);
  const [worldPanelOpen, setWorldPanelOpen] = useState(false);
  useEffect(() => { if (selected) setWorldPanelOpen(true); }, [selected]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const scrollBeforeFilter = useRef<number | null>(null);

  const loadPhotos = useCallback(async () => {
    const list = await api.listInspoPhotos(sfId);
    setPhotos(list);
    // Fresh open = the one moment worked content sinks to the back.
    setOrder([
      ...list.filter((p) => !p.assignment),
      ...list.filter((p) => p.assignment),
    ].map((p) => p.id));
    setSelected((prev) => (prev ? list.find((p) => p.id === prev.id) ?? null : null));
  }, [sfId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  function filterPhoto(p: Photo): boolean {
    if (!activeTags.length) return true;
    const tags = p.tags ?? [];
    return activeTags.every((t) => tags.includes(t));   // AND, not OR
  }

  // The vocabulary is a real per-user list from the server, NOT derived from
  // what photos currently carry. Deriving it meant coining a tag and then
  // taking it off that one photo destroyed it — and left no way to retire a
  // tag short of finding every photo using it.
  const [vocab, setVocab] = useState<string[]>([]);
  useEffect(() => { api.listInspoTags().then(setVocab).catch(() => {}); }, []);
  const allTags = vocab;

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  // What the rail actually shows, in display order.
  const railList = useMemo(() => {
    const base = order
      .map((id) => byId.get(id))
      .filter((p): p is Photo => !!p && (showHiddenPhotos ? true : !p.excluded))
      .filter(filterPhoto);
    // Applying a filter is already a full re-render, so it's the safe moment to
    // push worked content to the back — nothing shifts under an active run.
    return activeTags.length
      ? [...base].sort((a, b) => (a.assignment ? 1 : 0) - (b.assignment ? 1 : 0))
      : base;
  }, [order, byId, showHiddenPhotos, activeTags]); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenCount = photos.filter((p) => p.excluded).length;
  const navIdx = selected ? railList.findIndex((p) => p.id === selected.id) : -1;

  // The pool always settles: photos you've already filed sink to the back.
  // Only the RAIL freezes its order — while a photo is open you're mid-run and
  // nothing may shift under you. Stepping back out to the pool is the moment it
  // re-settles, so the browse view is never left holding a run's leftovers.
  useEffect(() => {
    if (selected) return;
    setOrder((prev) => {
      const rank = (id: string) => (byId.get(id)?.assignment ? 1 : 0);
      const next = [...prev].sort((a, b) => rank(a) - rank(b));  // stable: within a bucket, nothing moves
      return next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [selected, byId]);

  // Filters never move the open photo — you can be looking at one the current
  // filter excludes, which is deliberate. So navigating from "outside" the list
  // enters it at whichever end you're heading towards.
  function goTo(delta: number) {
    if (!railList.length) return;
    if (navIdx === -1) { setSelected(delta > 0 ? railList[0] : railList[railList.length - 1]); return; }
    const n = navIdx + delta;
    if (n < 0 || n >= railList.length) return;
    setSelected(railList[n]);
    setUndoable(null);
  }

  function toggleTagFilter(tag: string) {
    // Remember where you were the moment filtering starts, so clearing puts you
    // back rather than at the top of a list you've never seen.
    if (!activeTags.length) scrollBeforeFilter.current = railRef.current?.scrollTop ?? 0;
    setActiveTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      if (!next.length) restoreScroll();
      return next;
    });
  }

  function clearTagFilters() {
    setActiveTags([]);
    restoreScroll();
  }

  function restoreScroll() {
    const y = scrollBeforeFilter.current;
    if (y === null) return;
    scrollBeforeFilter.current = null;
    requestAnimationFrame(() => { if (railRef.current) railRef.current.scrollTop = y; });
  }

  async function handleRenameTag(from: string, raw: string) {
    const to = raw.trim().toLowerCase();
    if (!to || to === from) return;
    setVocab(await api.renameInspoTag(from, to));
    setActiveTags((prev) => prev.map((t) => (t === from ? to : t)));
    await loadPhotos();          // the rename rewrote every photo carrying it
  }

  async function handleDeleteTag(name: string) {
    if (!await confirm({
      message: `Delete the tag "${name}"? It'll come off every photo using it. The photos themselves are untouched.`,
      confirmLabel: 'Delete tag',
      danger: true,
    })) return;
    setVocab(await api.deleteInspoTag(name));
    setActiveTags((prev) => prev.filter((t) => t !== name));
    await loadPhotos();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      const uploaded = await uploadPhotos(files, async (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'inspo');
        const p = await api.uploadPhoto(fd);
        return { ...p, assignment: null, tags: [] } as Photo;
      });
      if (!uploaded.length) return;
      api.logFeatureEvent('inspo_upload');
      setPhotos((prev) => [...uploaded, ...prev]);
      // New arrivals go to the front of the queue — they're the whole reason
      // you just opened the page.
      setOrder((prev) => [...uploaded.map((u) => u.id), ...prev]);
      setSelected(uploaded[0]);
    } finally {
      setUploading(false);
    }
  }

  async function handleMetaSave(fields: { tags?: string[] }) {
    if (!selected) return;
    await api.updatePhotoMeta(selected.id, fields);
    setPhotos((prev) => prev.map((p) => p.id === selected.id ? { ...p, ...fields } : p));
    setSelected((s) => s ? { ...s, ...fields } : s);
  }

  async function handleDelete() {
    if (!selected) return;
    // The inspo pool is per-USER, not per-save — deleting drops the photo from
    // every save it's filed in, not just this one. Hide is the per-save action;
    // the copy has to make that difference obvious before the click.
    if (!await confirm({
      message: 'Delete this photo from every save? Your inspo pool is shared across all your saves, so this removes it everywhere. To just take it out of this save, use Hide instead.',
      confirmLabel: 'Delete everywhere',
      danger: true,
    })) return;
    await api.deletePhoto(selected.id);
    setPhotos((prev) => prev.filter((p) => p.id !== selected.id));
    setSelected(null);
  }

  // The whole workflow in one function: file it, remember the world, offer the
  // undo, and step to the next photo that still needs a home. One click — or
  // one keypress — per photo, with no separate "commit" step.
  async function handleAssign(t: AssignTarget) {
    if (!selected) return;
    const photo = selected;
    const prev = photo.assignment ?? null;
    await api.assignPhoto(photo.id, sfId, t.targetType, t.targetKey);
    const assignment = { target_type: t.targetType, target_key: t.targetKey };
    setPhotos((ps) => ps.map((p) => p.id === photo.id ? { ...p, assignment } : p));
    if (t.targetType === 'world') setStickyWorld(t.targetKey);
    setUndoable({ photoId: photo.id, prev, label: t.label });

    const idx = railList.findIndex((p) => p.id === photo.id);
    const next = railList.slice(idx + 1).find((p) => !p.assignment)
              ?? railList.find((p) => !p.assignment && p.id !== photo.id);
    setSelected(next ?? { ...photo, assignment });
  }

  function assignToWorld(world: string) {
    return handleAssign({ targetType: 'world', targetKey: world, label: world });
  }

  async function handleUndoAssign() {
    if (!undoable) return;
    const { photoId, prev } = undoable;
    if (prev) await api.assignPhoto(photoId, sfId, prev.target_type, prev.target_key);
    else      await api.unassignPhoto(photoId, sfId);
    setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, assignment: prev } : p));
    const back = photos.find((p) => p.id === photoId);
    if (back) setSelected({ ...back, assignment: prev });
    setUndoable(null);
  }

  async function handleUnassign() {
    if (!selected) return;
    await api.unassignPhoto(selected.id, sfId);
    setPhotos((prev) => prev.map((p) => p.id === selected.id ? { ...p, assignment: null } : p));
    setSelected((s) => s ? { ...s, assignment: null } : s);
    setUndoable(null);
  }

  async function handleToggleExclude() {
    if (!selected) return;
    const photo = selected;

    if (photo.excluded) {
      // Un-hiding is a correction, not a run — stay put so you can see it come back.
      await api.unexcludePhoto(photo.id, sfId);
      setPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, excluded: false } : p));
      setSelected((s) => s ? { ...s, excluded: false } : s);
      return;
    }

    // Hiding auto-advances, exactly like assigning. Clearing junk is then one
    // click per photo — which is most of what a bulk-hide would have bought,
    // without a selection layer on a picture-forward page.
    await api.excludePhoto(photo.id, sfId);
    setPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, excluded: true } : p));
    const idx = railList.findIndex((p) => p.id === photo.id);
    const next = railList[idx + 1] ?? railList[idx - 1] ?? null;
    setSelected(next && next.id !== photo.id ? next : { ...photo, excluded: true });
    setUndoable(null);
  }

  function selectPhoto(p: Photo) {
    setSelected(p);
    setUndoable(null);
  }

  // Keyboard lives at PAGE level, not inside the detail panel. It used to be
  // bound in DetailPanel, where the caption input sat directly under the photo
  // and swallowed the arrow keys the moment you touched it — which is why the
  // arrows "didn't work". The caption is gone, but the guard stays: any typing
  // target owns its own keys, including the new-tag field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected || lightbox) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(1); }
      else if (e.key === 'Enter' && stickyWorld) { e.preventDefault(); assignToWorld(stickyWorld); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // no dep array: the handler closes over railList/navIdx, which change every render

  // Wide masonry browse by default; click a photo and the pool steps aside into
  // a 2-up queue so the detail panel gets the room.
  const widePool = !selected;
  const totalCount = photos.filter((p) => !p.excluded).length;

  const thumbGridClass = widePool
    ? 'columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3'
    : 'grid grid-cols-2 gap-2';
  const thumbVariant: 'square' | 'masonry' = widePool ? 'masonry' : 'square';

  /* Filters — one chip pair, shared by both modes. Wide mode folds them into
     the header row (there's a whole empty half-row of space up there, and a
     lone filter band under the title read as an unfinished shelf); narrow mode
     gives them their own line, because 312px can't hold title + filters +
     upload. Gated on either control having something to say, so a user with no
     tags doesn't lose the hidden toggle along with the tag menu. */
  const filterBar = (allTags.length > 0 || hiddenCount > 0) ? (
    <div ref={tagMenuRef} className="flex items-center gap-2 relative">
      {allTags.length > 0 && (
        <button
          onClick={() => setTagMenuOpen((v) => !v)}
          className={`inline-flex items-center gap-2 text-xs font-semibold rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
            activeTags.length
              ? 'bg-c-secondary-soft text-c-secondary border-c-secondary-border'
              : 'bg-transparent text-c-dim border-c-border hover:text-c-text'
          }`}
        >
          <Tag size={12} weight="fill" />
          Tags
          {activeTags.length > 0 && (
            <Pill tone="filled" tabular>{activeTags.length}</Pill>
          )}
          <CaretDown size={10} weight="bold" className={tagMenuOpen ? 'rotate-180' : ''} />
        </button>
      )}
      {tagMenuOpen && (
        <>
          <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[200px] max-h-[280px] overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-lg py-1">
            {allTags.map((t) => (
              managingTags ? (
                /* Manage mode: rename in place, or retire the tag. Deleting
                   takes it off every photo too — otherwise "delete a tag"
                   means visiting every photo that uses it. */
                <div key={t} className="flex items-center gap-1 px-2 py-1">
                  <input
                    defaultValue={t}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') { (e.target as HTMLInputElement).value = t; (e.target as HTMLInputElement).blur(); }
                    }}
                    onBlur={(e) => handleRenameTag(t, e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-c-border bg-c-base text-c-text focus:outline-none focus:border-c-secondary"
                  />
                  <button
                    onClick={() => handleDeleteTag(t)}
                    aria-label={`Delete tag ${t}`}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-c-faint hover:text-c-red hover:bg-c-red-bg bg-transparent border-none cursor-pointer transition-colors"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </div>
              ) : (
                <button
                  key={t}
                  onClick={() => toggleTagFilter(t)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none transition-colors ${
                    activeTags.includes(t) ? 'text-c-secondary font-semibold' : 'text-c-muted hover:bg-c-panel'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                    activeTags.includes(t) ? 'bg-c-secondary border-c-secondary text-white' : 'border-c-border'
                  }`}>
                    {activeTags.includes(t) && <Check size={9} weight="bold" />}
                  </span>
                  {t}
                </button>
              )
            ))}
            <div className="flex items-center gap-2 mt-1 pt-1 px-3 border-t border-c-border">
              {activeTags.length > 0 && !managingTags && (
                <button
                  onClick={clearTagFilters}
                  className="py-1 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setManagingTags((v) => !v)}
                className="ml-auto py-1 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-secondary bg-transparent border-none cursor-pointer transition-colors"
              >
                {managingTags ? 'Done' : 'Manage'}
              </button>
            </div>
          </div>
        </>
      )}
      {/* Hidden photos. This used to be a bare "2 HIDDEN" label that flipped to
          "Hiding" — a stat where a control belonged, and neither word said what
          the click would do. Now it names the state you're in: unlit "Show 2
          hidden" is an offer, lit "Showing 2 hidden" is a fact you click to
          undo. Same chip shape as Tags, so it reads as a filter, not a badge. */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowHiddenPhotos((v) => !v)}
          title={showHiddenPhotos ? 'Leave hidden photos out of the pool again' : 'Include hidden photos in the pool'}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${
            showHiddenPhotos
              ? 'bg-c-secondary-soft text-c-secondary border-c-secondary-border'
              : 'bg-transparent text-c-dim border-c-border hover:text-c-text'
          }`}
        >
          {showHiddenPhotos ? <Eye size={12} weight="fill" /> : <EyeSlash size={12} weight="fill" />}
          {showHiddenPhotos ? `Showing ${hiddenCount} hidden` : `Show ${hiddenCount} hidden`}
        </button>
      )}
    </div>
  ) : null;

  return (
    /* Columns are white cards floating on the cream ground, separated by an
       8px gutter and nothing else — no rules between them. One uniform 8px
       rhythm: outer padding matches the gutter, so the cards breathe against
       the sidebar and the top bar instead of jamming into them.
       The outer padding is paid for out of the RAILS (320 → 312), not the
       centre column — a list column doesn't miss 8px, the photo detail panel
       does. Net fixed chrome is 656px either way, so the breathing room is
       free to the centre. */
    <div className="flex h-full overflow-hidden gap-2 p-2 bg-c-base">
      {/* Left panel — photo browser. Mobile: hide when a photo is selected.
          Desktop: widens to fill viewport when nothing's selected (masonry
          browse), narrows to a sidebar when editing. */}
      <div className={`${selected ? 'hidden md:flex md:w-[312px] md:shrink-0' : 'flex flex-1'} min-w-0 flex-col overflow-hidden bg-c-card rounded-xl shadow-sm`}>
        {/* Header — ONE toolbar row in wide mode: title, count, filters, and the
            upload action all on the same line. It used to be a title band with
            the filters stranded on a second row underneath, which left ~150px
            of empty white above the photos on a page whose entire job is
            showing photos. Narrow mode (photo selected, rail at 312px) can't
            fit all four, so it keeps the filters on their own line below. */}
        <div className="flex items-center px-4 py-2.5 gap-3">
          {widePool ? (
            <>
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <Lightbulb size={18} weight="duotone" className="text-c-secondary shrink-0" />
                <h2 className="text-xl font-bold text-c-text tracking-headline m-0 truncate">Inspo Pool</h2>
                {totalCount > 0 && (
                  <Pill tone="purple" tabular>
                    {totalCount}
                  </Pill>
                )}
              </div>
              {filterBar && <div className="ml-2 min-w-0">{filterBar}</div>}
            </>
          ) : (
            <h2 className="text-xl font-bold text-c-text tracking-headline m-0 truncate">Inspo Pool</h2>
          )}
          {widePool ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={btn('primary', { className: 'ml-auto shrink-0' })}
            >
              <Plus size={15} weight="bold" />
              {uploading ? 'Uploading…' : 'Upload Photos'}
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Upload photos"
              title="Upload photos"
              className="w-9 h-9 inline-flex items-center justify-center text-white bg-c-accent hover:bg-c-accent-hover rounded-lg transition-all disabled:opacity-50 border-none cursor-pointer shadow-sm hover:shadow-md shrink-0"
            >
              <Plus size={16} weight="bold" />
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
        </div>

        {/* Narrow mode only — the rail can't fit filters on the header line.
            Wide mode renders the same `filterBar` up in the toolbar instead. */}
        {!widePool && filterBar && <div className="px-3 pb-2">{filterBar}</div>}

        {/* ONE continuous grid. The Unassigned / Assigned / Hidden accordion is
            gone: assignment state is a sort order and a marker, not a shelf you
            have to open. "Assigned" also defaulted to collapsed, which hid most
            of the library behind a click on arrival. */}
        <div ref={railRef} className="overflow-y-auto flex-1">
          {photos.length === 0 && (
            <EmptyState
              icon={<Lightbulb size={28} weight="duotone" />}
              title="No inspo photos yet"
              description="Upload screenshots, Pinterest finds, or build references. Tag them, then send them to the worlds you're planning."
              cta={{ label: '+ Upload', onClick: () => fileInputRef.current?.click() }}
            />
          )}

          {/* Filters excluded everything — without this the column just goes
              silently blank and reads as "you have no photos". */}
          {photos.length > 0 && railList.length === 0 && (
            <EmptyState
              icon={<Lightbulb size={28} weight="duotone" />}
              title="No photos match these filters"
              description="Every selected tag has to be on the photo. Try dropping one."
              cta={{ label: 'Clear filters', onClick: clearTagFilters }}
            />
          )}

          {railList.length > 0 && (
            <div className="px-3 pt-1 pb-3">
              <div className={thumbGridClass}>
                {railList.map((p) => (
                  <PhotoThumb
                    key={p.id}
                    p={p}
                    selectedId={selected?.id ?? null}
                    onSelect={selectPhoto}
                    variant={thumbVariant}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle panel — detail. Only rendered when a photo is selected so the
          left pool can take the viewport in browse mode. On mobile, this
          panel always takes over the full width when active.

          The wrapper is `flex flex-1 min-w-0` so it claims the remaining row
          space, and the inner DetailPanel gets `w-full` to enforce that
          width regardless of the photo's natural aspect ratio. Without
          `w-full`, the inner panel was content-sizing to the image and
          dragging the entire column wider for landscape shots — which made
          the top-bar nav arrows drift dozens of pixels between photos. */}
      {selected && (
        <div className="flex flex-1 min-w-0 overflow-hidden bg-c-card rounded-xl shadow-sm">
          <DetailPanel
            photo={selected}
            onMetaSave={handleMetaSave}
            onDelete={handleDelete}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onLightbox={() => setLightbox(true)}
            onToggleExclude={handleToggleExclude}
            activeWorldName={stickyWorld ?? undefined}
            onActivateWorld={setStickyWorld}
            allTags={allTags}
            onCoinTag={(name) => api.createInspoTag(name).then((v) => { setVocab(v); api.logFeatureEvent('tag_created'); }).catch(() => {})}
            onBack={() => { setSelected(null); setWorldPanelOpen(false); }}
            navList={railList}
            navIdx={navIdx}
            onStep={goTo}
          />
        </div>
      )}

      {/* Right panel — world navigator (desktop only). When a photo is
          selected the header pops with a plumbob + plum gradient to telegraph
          "this is the next step." When browsing without a selection it stays
          chill since the user is just filtering. */}
      {selected && worldPanelOpen ? (
        <div className="hidden md:flex md:w-[312px] md:shrink-0 min-w-0 flex-col overflow-hidden bg-c-card rounded-xl shadow-sm">
          <div className="px-3 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWorldPanelOpen(false)}
                aria-label="Collapse world panel"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded border border-c-border text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent cursor-pointer transition-colors"
                title="Collapse world panel"
              >
                <CaretRight size={11} weight="bold" />
              </button>
              {/* An instruction, not a label. "Assign to a World" named the
                  column; this tells you what a click does. */}
              <h2 className="text-sm font-bold tracking-headline flex-1 m-0 text-c-secondary">
                Click a world to assign
              </h2>
              {stickyWorld && (
                <a
                  href={`/saves/${sfId}/world/${encodeURIComponent(stickyWorld)}/inspo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-c-dim hover:text-c-accent transition-colors no-underline shrink-0"
                  title={`Open the ${stickyWorld} moodboard`}
                >
                  <ArrowSquareOut size={11} weight="bold" />
                  Board
                </a>
              )}
            </div>
            {/* One slot, three jobs — and only ever one at a time. The undo
                lives HERE rather than floating over the tag row, and the
                keyboard hint is stated once instead of as a chip on every row. */}
            <div className="mt-1.5 min-h-[18px] flex items-center gap-2 text-2xs">
              {undoable ? (
                <>
                  <span className="text-c-green font-semibold truncate">→ {undoable.label}</span>
                  <button
                    onClick={handleUndoAssign}
                    className="shrink-0 font-bold uppercase tracking-label text-c-dim hover:text-c-red bg-transparent border-none cursor-pointer px-0 transition-colors"
                  >
                    Undo
                  </button>
                </>
              ) : stickyWorld ? (
                <span className="text-c-dim">
                  <kbd className="font-sans font-bold text-c-green">Enter</kbd> sends to{' '}
                  <span className="font-semibold text-c-green">{stickyWorld}</span>
                </span>
              ) : (
                <span className="text-c-faint">The last world you use gets bound to Enter.</span>
              )}
            </div>
          </div>
          <WorldNavigator
            photos={photos}
            stickyWorld={stickyWorld}
            onAssignWorld={assignToWorld}
            selectedId={selected?.id ?? null}
            onSelect={selectPhoto}
          />
        </div>
      ) : selected ? (
        <button
          onClick={() => setWorldPanelOpen(true)}
          className="hidden md:flex w-9 shrink-0 flex-col items-center justify-center gap-2 bg-c-card rounded-xl shadow-sm hover:bg-c-secondary-soft transition-colors cursor-pointer text-c-secondary border-none"
          title="Open world panel"
        >
          <CaretLeft size={12} weight="bold" />
          <MapPin size={14} weight="fill" />
          <span
            className="text-2xs font-bold uppercase tracking-label"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Assign world
          </span>
        </button>
      ) : null}

      {lightbox && selected && (
        <Lightbox
          photo={selected}
          hasPrev={navIdx > 0}
          hasNext={navIdx >= 0 && navIdx < railList.length - 1}
          onPrev={() => goTo(-1)}
          onNext={() => goTo(1)}
          onClose={() => setLightbox(false)}
          navInfo={navIdx >= 0 ? { idx: navIdx, total: railList.length } : undefined}
        />
      )}
    </div>
  );
}
