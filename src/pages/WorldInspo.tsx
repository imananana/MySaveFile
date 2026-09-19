import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  X, Plus, CaretLeft, CaretRight, CaretDown, Check, Lightbulb, ArrowLeft,
  ArrowSquareOut, MapPin, Tag,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import { uploadPhotos } from '../lib/photoUpload';
import { useSaveFile } from '../store/useSaveFile';
import type { Photo } from '../types';
import { WORLD_ICONS } from '../data/worldIcons';
import type { WorldName } from '../data/worlds';
import { EmptyState } from '../components/common/EmptyState';
import { Pill } from '../components/common/Pill';
import { btn } from '../components/common/btn';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

// ─── Photo Viewer ─────────────────────────────────────────────────────────────
// ONE layer. This used to be a detail modal with a Zoom button that opened a
// second, full-screen lightbox on top of it — two modals for one photograph,
// with the photo shown small in the first and the controls unreachable from the
// second. Now there's a single dark-stage view: the photo at full size, and one
// quiet bar under it holding everything you can actually do to it.
//
// No @gallery_creator anywhere: the server hard-nulls that column for inspo
// uploads (only `built` photos can carry one), so on this page it was markup
// that could never render.

function PhotoViewer({
  photos,
  initialIndex,
  saveFileId,
  worldName,
  allTags,
  onClose,
  onChanged,
}: {
  photos: Photo[];
  initialIndex: number;
  saveFileId: string;
  worldName: string;
  allTags: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(tagMenuRef, () => setTagMenuOpen(false), tagMenuOpen);
  const [newTag, setNewTag] = useState('');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(fileMenuRef, () => setFileMenuOpen(false), fileMenuOpen);
  const [busy, setBusy] = useState(false);
  const lots = useSaveFile((s) => s.lots);

  const photo = photos[idx];
  const hasPrev = idx > 0;
  const hasNext = idx < photos.length - 1;

  useEffect(() => {
    if (!photo) return;
    setLocalTags(photo.tags ?? []);
    setTagMenuOpen(false);
    setFileMenuOpen(false);
    setNewTag('');
  }, [photo?.id]);

  // Removing a photo from the world shortens the list under us. Without this,
  // taking the LAST one off the board leaves idx pointing past the end and the
  // viewer renders an empty black screen instead of closing.
  useEffect(() => {
    if (photos.length === 0) onClose();
    else if (idx > photos.length - 1) setIdx(photos.length - 1);
  }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { if (tagMenuOpen || fileMenuOpen) { setTagMenuOpen(false); setFileMenuOpen(false); } else onClose(); }
      else if (e.key === 'ArrowLeft' && hasPrev) setIdx((i) => i - 1);
      else if (e.key === 'ArrowRight' && hasNext) setIdx((i) => i + 1);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, hasPrev, hasNext, tagMenuOpen, fileMenuOpen]);

  // Every lot in THIS world, with how much inspo each already holds. The old
  // picker listed every world and every lot in the save behind two tabs — a
  // trapdoor to somewhere else, answering a question this page already settled.
  // You reached this board by choosing the world; the only open question left is
  // which lot inside it.
  const worldLots = useMemo(() => {
    return Object.values(lots)
      .filter((l) => l.worldName === worldName)
      .sort((a, b) => (a.customName ?? a.lotKey).localeCompare(b.customName ?? b.lotKey));
  }, [lots, worldName]);

  if (!photo) return null;

  const isLotFiled = photo.assignment?.target_type === 'lot';
  const lotName = isLotFiled ? (lots[photo.assignment!.target_key]?.customName ?? photo.assignment!.target_key) : null;

  async function saveTags(next: string[]) {
    setLocalTags(next);
    await api.updatePhotoMeta(photo.id, { tags: next });
    onChanged();
  }

  async function refile(target: { type: 'world' | 'lot'; key: string }) {
    setBusy(true);
    try {
      await api.assignPhoto(photo.id, saveFileId, target.type, target.key);
      onChanged();
    } finally {
      setBusy(false);
      setFileMenuOpen(false);
    }
  }

  // The board's one true removal: drop the WORLD tag and the photo leaves here
  // for the unassigned pile. Dropping just the LOT tag is a different, much
  // smaller act — the photo stays on this board — so it lives inside the filing
  // menu as "Anywhere in <world>", not next to this.
  async function removeFromWorld() {
    setBusy(true);
    try {
      await api.unassignPhoto(photo.id, saveFileId);
      onChanged();
      if (photos.length <= 1) onClose();
      else setIdx((i) => Math.min(i, photos.length - 2));
    } finally {
      setBusy(false);
    }
  }

  const chip = 'inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 transition-colors';

  return (
    <div
      className="fixed inset-0 z-[600] flex flex-col backdrop-blur-sm"
      /* Inline, not a bg-[#14120f]/96 class: the opacity modifier on an
         arbitrary hex doesn't compile under the CDN build and the ground came
         out fully transparent. A warm near-black rather than pure #000 — it
         sits under photographs of houses, not a cinema screen. */
      style={{ backgroundColor: 'rgba(22, 19, 16, 0.97)' }}
      onClick={onClose}
    >
      {/* Top rail — close on the left where the eye starts, position on the
          right. Both sit clear of the photo so nothing overlaps the work. */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 bg-transparent border-none cursor-pointer transition-colors"
        >
          <X size={18} weight="bold" />
        </button>
        <span className="text-2xs font-semibold uppercase tracking-label text-white/45 truncate">
          {worldName}
        </span>
        <span className="ml-auto text-2xs font-semibold uppercase tracking-label text-white/45 tabular-nums">
          {idx + 1} <span className="text-white/25">/</span> {photos.length}
        </span>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center px-4 sm:px-16 pb-3">
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
              disabled={!hasPrev}
              aria-label="Previous photo"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border-none cursor-pointer disabled:opacity-0 disabled:cursor-default flex items-center justify-center transition-all z-10"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
              disabled={!hasNext}
              aria-label="Next photo"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border-none cursor-pointer disabled:opacity-0 disabled:cursor-default flex items-center justify-center transition-all z-10"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </>
        )}
        <img
          src={api.photoUrl(photo.filename)}
          alt=""
          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Action bar — tags on one line, filing on the next. Reads as a caption
          under the photograph rather than a form beside it. */}
      <div
        className="shrink-0 border-t border-white/10 px-4 sm:px-6 pt-3 pb-4 flex flex-col gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={tagMenuRef} className="flex flex-wrap items-center gap-1.5 relative">
          {localTags.map((t) => (
            <span key={t} className={`${chip} bg-white/10 text-white/85`}>
              {t}
              <button
                onClick={() => saveTags(localTags.filter((x) => x !== t))}
                aria-label={`Remove tag ${t}`}
                className="text-white/40 hover:text-white bg-transparent border-none cursor-pointer p-0 leading-none flex items-center"
              >
                <X size={10} weight="bold" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setTagMenuOpen((v) => !v)}
            className={`${chip} bg-transparent text-white/50 hover:text-white border border-dashed border-white/25 hover:border-white/50`}
          >
            <Tag size={11} weight="fill" />
            Tag
          </button>
          {tagMenuOpen && (
            <>
              <div className="absolute left-0 bottom-full mb-2 z-20 min-w-[220px] max-h-[260px] overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-xl py-1">
                {allTags.map((t) => {
                  const on = localTags.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => saveTags(on ? localTags.filter((x) => x !== t) : [...localTags, t])}
                      className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none transition-colors ${
                        on ? 'text-c-secondary font-semibold' : 'text-c-muted hover:bg-c-panel'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                        on ? 'bg-c-secondary border-c-secondary text-white' : 'border-c-border'
                      }`}>
                        {on && <Check size={9} weight="bold" />}
                      </span>
                      {t}
                    </button>
                  );
                })}
                {/* Coining a tag works from here too — the pool's vocabulary is
                    per-user and PATCH registers whatever it's handed, so a tag
                    invented on a moodboard is a real tag everywhere. */}
                <div className="px-2 pt-1 mt-1 border-t border-c-border">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const v = newTag.trim().toLowerCase();
                      if (!v || localTags.includes(v)) { setNewTag(''); return; }
                      saveTags([...localTags, v]);
                      setNewTag('');
                    }}
                    placeholder="New tag…"
                    className="w-full text-xs px-2 py-1.5 rounded border border-c-border bg-c-base text-c-text focus:outline-none focus:border-c-secondary"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ONE filing control. Picking "Anywhere in <world>" drops a lot tag
              without taking the photo off the board; picking a lot moves it.
              Three separate buttons (label / Remove / Change assignment) made a
              two-step choice look like three unrelated ones. */}
          <div ref={fileMenuRef} className="relative">
            <button
              onClick={() => setFileMenuOpen((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/85 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 border-none cursor-pointer transition-colors disabled:opacity-40"
            >
              <MapPin size={12} weight="fill" className={isLotFiled ? 'text-c-secondary' : 'text-white/40'} />
              {lotName ?? `Anywhere in ${worldName}`}
              <CaretDown size={10} weight="bold" className={fileMenuOpen ? 'rotate-180' : ''} />
            </button>
            {fileMenuOpen && (
              <>
                <div className="absolute left-0 bottom-full mb-2 z-20 min-w-[260px] max-h-[300px] overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-xl py-1">
                  <button
                    onClick={() => refile({ type: 'world', key: worldName })}
                    className={`w-full text-left px-3 py-2 text-xs cursor-pointer bg-transparent border-none transition-colors ${
                      isLotFiled ? 'text-c-muted hover:bg-c-panel' : 'text-c-secondary font-semibold'
                    }`}
                  >
                    Anywhere in {worldName}
                  </button>
                  {worldLots.length > 0 && (
                    <p className="px-3 pt-2 pb-1 m-0 text-2xs font-semibold uppercase tracking-label text-c-faint border-t border-c-border">
                      A lot in {worldName}
                    </p>
                  )}
                  {worldLots.map((l) => {
                    const on = photo.assignment?.target_type === 'lot' && photo.assignment.target_key === l.lotKey;
                    return (
                      <button
                        key={l.lotKey}
                        onClick={() => refile({ type: 'lot', key: l.lotKey })}
                        className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none transition-colors truncate ${
                          on ? 'text-c-secondary font-semibold' : 'text-c-muted hover:bg-c-panel'
                        }`}
                      >
                        {l.customName ?? l.lotKey}
                      </button>
                    );
                  })}
                  {worldLots.length === 0 && (
                    <p className="px-3 py-2 m-0 text-xs text-c-faint border-t border-c-border">
                      No lots in {worldName} yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={removeFromWorld}
            disabled={busy}
            className="ml-auto text-2xs font-semibold uppercase tracking-label text-white/40 hover:text-white bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40"
          >
            Remove from {worldName}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add From Pool Drawer ─────────────────────────────────────────────────────

function AddFromPoolDrawer({
  pool,
  saveFileId,
  worldName,
  allTags,
  onClose,
  onAssigned,
}: {
  pool: Photo[];
  saveFileId: string;
  worldName: string;
  allTags: string[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(tagMenuRef, () => setTagMenuOpen(false), tagMenuOpen);
  const [busy, setBusy] = useState(false);
  const lots = useSaveFile((s) => s.lots);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // The WHOLE pool, not just the unassigned slice. This drawer is a door into
  // the world and you shop your entire library through it — scoping it to
  // unassigned hid every photo you'd already filed somewhere, which is exactly
  // the set you're most likely to want to move.
  // A photo already on this board is named by its LOT (that's the detail you
  // don't already know); one living elsewhere is named by its WORLD, because
  // clicking it takes it out of that world and a lot name alone wouldn't warn you.
  function whereIs(p: Photo): { here: boolean; label: string | null } {
    if (!p.assignment) return { here: false, label: null };
    const { target_type, target_key } = p.assignment;
    if (target_type === 'world') return { here: target_key === worldName, label: target_key };
    const lot = lots[target_key];
    const here = lot?.worldName === worldName;
    return { here, label: here ? (lot?.customName ?? target_key) : (lot?.worldName ?? target_key) };
  }

  const filtered = pool
    .filter((p) => {
      if (!activeTags.length) return true;
      const tags = p.tags ?? [];
      return activeTags.every((t) => tags.includes(t));   // AND, not OR
    })
    // Same instinct as the pool: the photos you can still do something with come
    // first. Unassigned, then filed elsewhere, then the ones already here — which
    // are shown (they're part of the pool, and you'd hunt for them otherwise) but
    // sunk out of the way rather than salted through the grid.
    .sort((a, b) => rank(a) - rank(b));

  function rank(p: Photo): number {
    if (whereIs(p).here) return 2;
    return p.assignment ? 1 : 0;
  }

  async function add(photo: Photo) {
    setBusy(true);
    try {
      await api.assignPhoto(photo.id, saveFileId, 'world', worldName);
      onAssigned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[400] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-c-card rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 shrink-0">
          <Lightbulb size={18} weight="duotone" className="text-c-secondary shrink-0" />
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Add to {worldName}</h3>

          {/* Same collapsed control as the pool — the vocabulary is user-coined
              and unbounded, so a permanent chip row grows without limit. */}
          {allTags.length > 0 && (
            <div ref={tagMenuRef} className="relative ml-2">
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
              {tagMenuOpen && (
                <>
                  <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[200px] max-h-[280px] overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-lg py-1">
                    {allTags.map((t) => {
                      const on = activeTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setActiveTags((prev) => on ? prev.filter((x) => x !== t) : [...prev, t])}
                          className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none transition-colors ${
                            on ? 'text-c-secondary font-semibold' : 'text-c-muted hover:bg-c-panel'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                            on ? 'bg-c-secondary border-c-secondary text-white' : 'border-c-border'
                          }`}>
                            {on && <Check size={9} weight="bold" />}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                    {activeTags.length > 0 && (
                      <div className="px-3 pt-1 mt-1 border-t border-c-border">
                        <button
                          onClick={() => setActiveTags([])}
                          className="py-1 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto w-8 h-8 flex items-center justify-center text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer rounded-lg hover:bg-c-panel transition-colors"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {filtered.length === 0 && (
            <EmptyState
              icon={<Lightbulb size={28} weight="duotone" />}
              title={pool.length === 0 ? 'Your inspo pool is empty' : 'No photos match these filters'}
              description={pool.length === 0
                ? 'Upload screenshots, Pinterest finds and build references to the pool, then file them into the worlds you\'re planning.'
                : 'Every selected tag has to be on the photo. Try dropping one.'}
              cta={activeTags.length ? { label: 'Clear filters', onClick: () => setActiveTags([]) } : undefined}
            />
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {filtered.map((p) => {
              const { here, label } = whereIs(p);
              return (
                <button
                  key={p.id}
                  onClick={() => !busy && !here && add(p)}
                  disabled={busy || here}
                  title={here ? `Already in ${worldName}` : label ? `Move from ${label} to ${worldName}` : `Add to ${worldName}`}
                  className={`group relative aspect-square w-full rounded-xl overflow-hidden bg-transparent p-0 border-none transition-all ${
                    here
                      ? 'cursor-default opacity-45'
                      : 'cursor-pointer shadow-sm hover:shadow-[0_0_0_2px_var(--c-accent)]'
                  }`}
                >
                  <img src={api.photoUrl(p.filename, 200)} alt="" className="w-full h-full object-cover" />
                  {/* Where it lives now, so a click that MOVES a photo out of
                      another world never comes as a surprise. */}
                  {label && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-1 text-2xs font-semibold text-white bg-gradient-to-t from-black/70 to-transparent text-left">
                      {here && <Check size={9} weight="bold" className="shrink-0" />}
                      <span className="truncate">{label}</span>
                    </span>
                  )}
                  {!here && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold">
                      {label ? 'Move here' : `Add to ${worldName}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* The pool is the big surface; this drawer is the shortcut. Say so. */}
        <div className="shrink-0 border-t border-c-border px-5 py-2.5 flex items-center justify-between gap-3">
          <p className="text-2xs text-c-dim m-0">Click a photo to file it under {worldName}.</p>
          <Link
            to={`/saves/${saveFileId}/photos`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-c-secondary hover:text-c-secondary-hover no-underline transition-colors shrink-0"
          >
            Open the full pool
            <ArrowSquareOut size={12} weight="bold" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function WorldInspo() {
  const { saveFileId, worldName: encodedName } = useParams<{ saveFileId: string; worldName: string }>();
  const worldName = decodeURIComponent(encodedName ?? '');
  const sfId = saveFileId!;

  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(tagMenuRef, () => setTagMenuOpen(false), tagMenuOpen);
  const [vocab, setVocab] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lots = useSaveFile((s) => s.lots);

  const load = useCallback(async () => {
    setAllPhotos(await api.listInspoPhotos(sfId));
  }, [sfId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listInspoTags().then(setVocab).catch(() => {}); }, []);

  // Photos assigned to this world (world-level) or to any lot in this world.
  // Hidden photos are excluded — hiding is the per-save "get this out of my
  // way", so it has to hold on the board too, not just in the pool.
  const worldPhotos = allPhotos.filter((p) => {
    if (p.excluded) return false;
    if (!p.assignment) return false;
    if (p.assignment.target_type === 'world' && p.assignment.target_key === worldName) return true;
    if (p.assignment.target_type === 'lot') return lots[p.assignment.target_key]?.worldName === worldName;
    return false;
  });

  // Only the tags actually on this board — filtering by a tag no photo here
  // carries can only ever empty the page.
  const boardTags = Array.from(new Set(worldPhotos.flatMap((p) => p.tags ?? []))).sort();

  const shown = worldPhotos.filter((p) => {
    if (!activeTags.length) return true;
    const tags = p.tags ?? [];
    return activeTags.every((t) => tags.includes(t));   // AND, not OR
  });

  const pool = allPhotos.filter((p) => !p.excluded);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    setUploading(true);
    try {
      await uploadPhotos(files, async (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'inspo');
        const newPhoto = await api.uploadPhoto(fd);
        await api.assignPhoto(newPhoto.id, sfId, 'world', worldName);
      });
      await load();
    } finally {
      setUploading(false);
    }
  }

  function getLotName(photo: Photo): string | null {
    if (photo.assignment?.target_type !== 'lot') return null;
    return lots[photo.assignment.target_key]?.customName ?? null;
  }

  return (
    /* Flat on the cream ground, same padding and header anatomy as the world
       page this hangs off — round world icon, big title, one muted detail line,
       actions right. It used to invent its own header (a bare text back-link, an
       em-dashed "World — Inspo" title and a purple count pill) which matched
       nothing else in the app. */
    <div className="px-4 sm:px-7 py-4 sm:py-6">
      <div className="mb-4">
        <Link
          to={`/saves/${saveFileId}/world/${encodedName}`}
          className="inline-flex items-center gap-1 text-xs text-c-accent hover:text-c-accent-hover no-underline mb-2 transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          {worldName}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3.5 sm:flex-1 sm:min-w-0">
            {WORLD_ICONS[worldName as WorldName] && (
              <img src={WORLD_ICONS[worldName as WorldName]} alt="" className="w-16 h-16 object-contain rounded-full shrink-0" />
            )}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-c-text m-0 leading-tight tracking-headline">Inspo</h1>
              <p className="mt-1 text-sm text-c-dim flex items-center gap-1.5 flex-wrap m-0">
                <span>{worldName}</span>
                <span className="text-c-faint" aria-hidden>·</span>
                <span>{worldPhotos.length} {worldPhotos.length === 1 ? 'photo' : 'photos'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPool(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-c-secondary border border-c-secondary-border hover:border-c-secondary bg-c-secondary-soft rounded-lg px-4 py-2.5 transition-colors cursor-pointer"
            >
              <Lightbulb size={16} weight="duotone" />
              Browse pool
            </button>
            {/* Green, like Upload Photos in the pool — one colour for "put a
                photo into the app", wherever you happen to be standing. */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={btn('primary', { size: 'lg' })}
            >
              <Plus size={16} weight="bold" />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Section rule, exactly like the world page's Map / neighbourhood rows —
          the filter rides on the rule instead of floating as a loose chip row. */}
      {worldPhotos.length > 0 && (
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-base font-bold m-0 tracking-headline text-c-secondary">Moodboard</h2>
          <Pill tone="purple" caps>
            {shown.length}
          </Pill>
          <div className="flex-1 h-px bg-c-border" />
          {boardTags.length > 0 && (
            <div ref={tagMenuRef} className="relative shrink-0">
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
              {tagMenuOpen && (
                <>
                  <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[200px] max-h-[280px] overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-lg py-1">
                    {boardTags.map((t) => {
                      const on = activeTags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setActiveTags((prev) => on ? prev.filter((x) => x !== t) : [...prev, t])}
                          className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none transition-colors ${
                            on ? 'text-c-secondary font-semibold' : 'text-c-muted hover:bg-c-panel'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                            on ? 'bg-c-secondary border-c-secondary text-white' : 'border-c-border'
                          }`}>
                            {on && <Check size={9} weight="bold" />}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                    {activeTags.length > 0 && (
                      <div className="px-3 pt-1 mt-1 border-t border-c-border">
                        <button
                          onClick={() => setActiveTags([])}
                          className="py-1 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {worldPhotos.length === 0 ? (
        /* The shared empty state, not a bespoke green-to-purple gradient panel
           with its own icon medallion — that treatment appeared on exactly one
           screen in the app. */
        <EmptyState
          icon={<Lightbulb size={28} weight="duotone" />}
          title={`Start ${worldName}'s moodboard`}
          description="Floor plans, exterior dreams, landscaping refs — anything that gives this world its vibe. Pull from the pool you already have, or upload something new."
          cta={{ label: 'Browse the pool', onClick: () => setShowPool(true) }}
          secondary={{ label: uploading ? 'Uploading…' : 'Upload a photo', onClick: () => fileInputRef.current?.click() }}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Lightbulb size={28} weight="duotone" />}
          title="No photos match these filters"
          description="Every selected tag has to be on the photo. Try dropping one."
          cta={{ label: 'Clear filters', onClick: () => setActiveTags([]) }}
        />
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
          {shown.map((photo, i) => {
            const lotName = getLotName(photo);
            return (
              <button
                key={photo.id}
                onClick={() => setViewerIdx(i)}
                /* Same tile as the pool: a shadow ring on hover rather than a
                   border plus a scale transform, which nudged neighbours and
                   made a masonry wall twitch as the cursor crossed it. */
                className="group relative w-full mb-3 break-inside-avoid rounded-xl overflow-hidden bg-transparent p-0 border-none cursor-pointer shadow-sm hover:shadow-[0_0_0_2px_var(--c-secondary)] transition-shadow"
              >
                <img
                  src={api.photoUrl(photo.filename, 300)}
                  alt=""
                  loading="lazy"
                  className="w-full h-auto object-cover block"
                  style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : undefined }}
                  onLoad={(e) => {
                    if (!photo.width) {
                      const t = e.currentTarget;
                      if (t.naturalWidth && t.naturalHeight) api.setPhotoDimensions(photo.id, t.naturalWidth, t.naturalHeight).catch(() => {});
                    }
                  }}
                />
                {/* Which lot it's filed under. Sits in a gradient at the foot of
                    the tile instead of a hard black lozenge in the corner. */}
                {lotName && (
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-2 py-1.5 text-2xs font-semibold text-white bg-gradient-to-t from-black/70 to-transparent text-left">
                    <MapPin size={10} weight="fill" className="shrink-0" />
                    <span className="truncate">{lotName}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewerIdx !== null && shown.length > 0 && (
        <PhotoViewer
          photos={shown}
          initialIndex={Math.min(viewerIdx, shown.length - 1)}
          saveFileId={sfId}
          worldName={worldName}
          allTags={vocab}
          onClose={() => setViewerIdx(null)}
          onChanged={load}
        />
      )}

      {showPool && (
        <AddFromPoolDrawer
          pool={pool}
          saveFileId={sfId}
          worldName={worldName}
          allTags={vocab}
          onClose={() => setShowPool(false)}
          onAssigned={load}
        />
      )}
    </div>
  );
}
