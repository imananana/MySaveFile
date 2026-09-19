// The showcase — ONE public page per save at /s/<slug>, rebuilt from the
// v21 front-page mockup. The owner opens the same page (also reachable as
// /saves/:id/showcase before a slug exists) and ALWAYS sees edit mode; there
// is no separate edit screen — editing IS the public page with purple
// affordances, and everything auto-saves. World views come in-page — the URL
// never changes while browsing worlds.
//
// Public = REALITY only: everything shown is the delivered .save (plus
// showcase-authored dressing: blurbs, features, order). No planner goals.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { DownloadSimple, Eye, ArrowRight, ArrowUpRight, ArrowUp, ArrowDown, CaretUp, CaretDown, DotsSixVertical, Image, Plus, X, ArrowCounterClockwise, UploadSimple, Check } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { normalizeGalleryId } from '../../lib/url';
import { announceSaveRename, onSaveRenamed, onTabVisible } from '../../lib/saveNameSync';
import { useSaveFile } from '../../store/useSaveFile';
import { useAuth } from '../../store/useAuth';
import { deriveShowcase, initials, resolveHero, MAX_FEATURED_HOUSEHOLDS, MAX_FEATURED_LOTS, type DerivedShowcase, type DerivedWorld, type DerivedHousehold, type WorldLotEntry } from './derive';
import { toast } from '../../store/useToast';
import { LOT_PINS } from '../../data/lotPins';
import { getBuildingName } from '../../data/worlds';
import { getLotIconSrc } from '../../data/lotIcons';
import type { WorldName } from '../../data/worlds';
import { PosterCover, PostcardCover, buildCoverData, type CoverData } from './Covers';
import { EditableText, useSortable, moveItem, PickerPopout, usePickerState, useFilePick } from './editKit';
import { DetailOverlay, overlayClickGuard, type OverlayTarget } from './DetailOverlay';
import { ShowcaseWorldView } from './ShowcaseWorldView';
import type { ShowcasePayload, ShowcasePhoto, ShowcaseSettings, ShowcaseWorldSettings, LeadKind, CoverKind } from './types';
import './showcase.css';

const PACKS_SHOWN = 5;

const mapArt = (worldName: string): string =>
  `/maps/${worldName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.webp`;

// ── the world map, wearing the planner's real pins ─────────────────────────
// White disc + the royal-blue lot-type game icon + an occupancy count badge —
// the planner map's own language, not dots. Every pin reads at the same
// weight: the map is showing what the WORLD holds, so fading the lots that
// happen to lack a showcase photo just made the map look patchy. Apartment
// units collapse into ONE building pin like the planner. On the world page
// pins hover a name card; on the front page the whole map is a "Visit"
// target, so pins are static decoration (no pointer events, no cards).

interface MapPinItem {
  key: string;            // LOT_PINS key — the lot name, or the building name
  name: string;
  type: string;
  size: string | null;
  occupants: number;      // households (apartments: occupied units)
  units: number | null;   // apartments only
  residentName: string | null;
  home: boolean;          // occupiable — an empty one reads "Unoccupied"
}

const HOME_TYPES = new Set(['Residential', 'Haunted House', 'Tiny Home Residential', 'Residential Rental', 'Apartment', 'Rental', 'Vacation Rental']);

// Every shipped map is 2200×1422. A map that isn't measures itself on load.
const MAP_ASPECT = 2200 / 1422;

export function AutoMap({ worldName, entries, interactive = false, pinSize = 40 }: {
  worldName: string; entries?: WorldLotEntry[]; interactive?: boolean; pinSize?: number;
}) {
  // Pin coordinates are percentages of the MAP ART, but the showcase shows
  // that art in a 16:9 card, which crops a band off the top and bottom to
  // fill it. Positioning pins against the card therefore squashed them all
  // toward the middle — ~6% of the card's height at either edge, more than a
  // pin's width. So the pins live on a stage that IS the image plane: sized
  // to cover the card and centred exactly like the picture, it crops the
  // pins by the same amount it crops the map under them.
  const [aspect, setAspect] = useState(MAP_ASPECT);
  const measure = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setAspect(el.naturalWidth / el.naturalHeight);
  }, []);

  const pins = LOT_PINS[worldName as WorldName];
  const items: MapPinItem[] = [];
  if (pins && entries) {
    const buildings = new Map<string, WorldLotEntry[]>();
    for (const e of entries) {
      if (e.lot.defaultType === 'Apartment') {
        const b = getBuildingName(e.lot.lotName);
        if (!buildings.has(b)) buildings.set(b, []);
        buildings.get(b)!.push(e);
        continue;
      }
      items.push({
        key: e.lot.lotName,
        name: e.lot.customName || e.lot.lotName,
        type: e.lot.customType || e.lot.defaultType,
        size: e.lot.size && e.lot.size !== '?' ? e.lot.size.replace(/x/i, '×') : null,
        occupants: e.lot.householdIds.length,
        units: null,
        residentName: e.lot.householdIds.length === 1 ? e.resident?.hh.name ?? null : null,
        home: HOME_TYPES.has(e.lot.defaultType),
      });
    }
    for (const [b, es] of buildings) {
      items.push({
        key: b,
        name: b,
        type: es[0].lot.customType || es[0].lot.defaultType,
        size: null,
        occupants: es.filter((e) => e.lot.householdIds.length > 0).length,
        units: es.length,
        residentName: null,
        home: true,
      });
    }
  }
  return (
    <div className="sc-autoMap" style={{ '--pinS': `${pinSize}px`, '--mapAR': aspect } as React.CSSProperties}>
      <div className="sc-mapStage">
      <img
        src={mapArt(worldName)}
        alt=""
        loading="lazy"
        ref={measure}
        onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      />
      {items
        .map((it) => ({ it, c: pins?.[it.key] }))
        .filter((x): x is { it: MapPinItem; c: { x: number; y: number } } => !!x.c)
        .sort((a, b) => a.c.y - b.c.y) // depth-sort — lower pins paint on top
        .map(({ it, c }) => {
          const icon = getLotIconSrc(it.type);
          const occLine = !it.home ? null
            : it.units != null ? `${it.occupants} / ${it.units} units occupied`
            : it.occupants === 0 ? 'Unoccupied'
            : it.residentName ?? `${it.occupants} households`;
          return (
            <span
              key={it.key}
              className={`sc-pin ${interactive ? '' : 'still'}`}
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
            >
              {icon && <img src={icon} alt="" />}
              {it.home && it.occupants > 0 && <span className="sc-occ">{it.occupants > 9 ? '9+' : it.occupants}</span>}
              {interactive && (
                <span className="sc-pinCard">
                  <span className="sc-pn2">{it.name}</span>
                  <span className="sc-pt">{it.type}{it.size ? ` · ${it.size}` : ''}</span>
                  {occLine && <span className="sc-po">{occLine}</span>}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// A portraitless household's "portrait" is its cast: overlapping initial
// circles in the gender colours. Cards using it stay SHORT — never a tall
// empty box with circles floating in it.
export function CastRow({ h }: { h: DerivedHousehold }) {
  const shown = h.sims.slice(0, 6);
  if (shown.length === 0) {
    return <div className="sc-castRow"><span className="sc-mi more">{initials(h.hh.name)}</span></div>;
  }
  return (
    <div className="sc-castRow">
      {shown.map((sim) => (
        <span key={sim.id} className={`sc-mi ${sim.gender === 'male' ? 'm' : 'f'}`}>{(sim.firstName || '?')[0]}</span>
      ))}
      {h.sims.length > 6 && <span className="sc-mi more">+{h.sims.length - 6}</span>}
    </div>
  );
}

// ── the edit context — every in-place control goes through this ────────────

export interface EditCtx {
  saveFileId: string;
  patchSettings: (fn: (s: ShowcaseSettings) => ShowcaseSettings) => void;
  patchWorld: (name: string, fn: (w: ShowcaseWorldSettings) => ShowcaseWorldSettings) => void;
  setName: (name: string) => void;
  setDescription: (text: string) => void;
  setSaveFileUrl: (url: string | null) => void;
  /** Straight-to-your-files upload; the new photo lands in the payload so the
      page can use it immediately. Returns null on failure. */
  uploadShowcasePhoto: (file: File, targetType: 'cover' | 'world', targetKey: string) => Promise<ShowcasePhoto | null>;
  setBlurb: (world: string, text: string) => void;
  setHouseholdDescription: (hhId: string, text: string) => void;
  setLotDescription: (lotKey: string, text: string) => void;
  /** The front band's household ids, materialized from the auto default the
      first time the creator touches it. Never longer than the maximum. */
  featuredHhIds: () => string[];
  /** Feature one more, unless the list is already at its maximum — in which
      case nothing changes and the creator is told to unfeature one first.
      Every Feature control goes through these two, so the ceiling can't
      disagree between the front page, a world page and a picker. */
  featureHousehold: (hhId: string) => void;
  featureLot: (world: string, lotKey: string) => void;
  /** True when there is no room left — controls render as full. */
  hhBandFull: () => boolean;
  worldLotsFull: (world: string) => boolean;
  worldOrderIds: () => string[];
  /** Creator identity, editable right on the page — writes the PROFILE
      (useAuth), so every showcase and the planner see it immediately. */
  setCreatorName: (name: string) => void;
  uploadCreatorPhoto: (file: File) => Promise<void>;
}

function useEditCtx(
  payload: ShowcasePayload | null,
  derived: DerivedShowcase | null,
  setPayload: React.Dispatch<React.SetStateAction<ShowcasePayload | null>>,
  reload: () => void,
  /** Set while an edit has not reached the server yet — the loader reads it
      so a refresh can't undo work that is still in flight. */
  unsaved: React.MutableRefObject<ShowcaseSettings | null>,
): EditCtx | null {
  // Debounced whole-blob auto-save; the last write wins.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((saveFileId: string, blob: ShowcaseSettings) => {
    // Held from the keystroke until the server has it, not just until the
    // request is sent: a refresh that overlapped the write was replacing the
    // page with the server's older copy, so the edit vanished off the screen
    // and the NEXT edit was computed from that stale copy and overwrote it.
    unsaved.current = blob;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.setShowcaseSettings(saveFileId, blob);
      } catch { /* keep it marked unsaved; the next edit rewrites the lot */ }
      if (unsaved.current === blob) unsaved.current = null;
    }, 500);
  }, [unsaved]);

  // A tab going away flushes immediately rather than sitting on the debounce.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden' || !saveTimer.current || !payload?.saveFileId) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const blob = unsaved.current;
      if (blob) api.setShowcaseSettings(payload.saveFileId, blob).then(() => {
        if (unsaved.current === blob) unsaved.current = null;
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [payload?.saveFileId, unsaved]);

  const derivedRef = useRef(derived);
  derivedRef.current = derived;

  return useMemo(() => {
    if (!payload?.isOwner || !payload.saveFileId) return null;
    const saveFileId = payload.saveFileId;

    // The featured list as the page shows it — the stored one when the
    // creator has taken over, otherwise the auto default, and never past the
    // maximum either way (a blob written before the cap loses its tail here,
    // so editing works on exactly what is on screen).
    const featuredHhIds = (): string[] =>
      (payload.showcase?.featuredHouseholds
        ?? (derivedRef.current?.featuredHouseholds ?? []).map((d) => d.hh.id)
      ).slice(0, MAX_FEATURED_HOUSEHOLDS);

    const patchSettings: EditCtx['patchSettings'] = (fn) => {
      setPayload((prev) => {
        if (!prev) return prev;
        const nextSettings = fn(prev.showcase ?? {});
        scheduleSave(saveFileId, nextSettings);
        return { ...prev, showcase: nextSettings };
      });
    };

    return {
      saveFileId,
      patchSettings,
      patchWorld: (name, fn) => patchSettings((s) => ({
        ...s,
        worlds: { ...(s.worlds ?? {}), [name]: fn(s.worlds?.[name] ?? {}) },
      })),
      setName: (name) => {
        if (!name.trim()) return;
        setPayload((prev) => (prev ? { ...prev, name } : prev));
        // The name belongs to the SAVE, not to this page: the planner chrome
        // in this tab follows it immediately, other tabs hear the announce.
        if (useSaveFile.getState().saveFileId === saveFileId) useSaveFile.setState({ name });
        announceSaveRename(saveFileId, name);
        // The slug follows the name — reload picks up the re-minted slug
        // (and follows the redirect if we're on the old slug URL).
        api.renameSaveFile(saveFileId, name).then(reload).catch(() => {});
      },
      setDescription: (text) => {
        setPayload((prev) => (prev ? { ...prev, description: text } : prev));
        api.setSaveFileDescription(saveFileId, text).catch(() => {});
      },
      setSaveFileUrl: (url) => {
        setPayload((prev) => (prev ? { ...prev, saveFileUrl: url } : prev));
        api.setSaveFileUrl(saveFileId, url).catch(() => {});
      },
      uploadShowcasePhoto: async (file, targetType, targetKey) => {
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('type', 'built');
        fd.append('saveFileId', saveFileId);
        fd.append('targetType', targetType);
        fd.append('targetKey', targetKey);
        try {
          const ph = await api.uploadPhoto(fd);
          const sp: ShowcasePhoto = {
            id: ph.id, filename: ph.filename, caption: ph.caption ?? '',
            width: null, height: null, galleryCreator: null,
            createdAt: ph.created_at, targetType, targetKey,
          };
          // A showcase slot holds ONE photo: uploading a new cover or world
          // hero REPLACES the old upload, which is deleted for real — these
          // photos exist nowhere else in the planner, so a kept-around old
          // one would be invisible dead weight with no place to remove it.
          const replaced = (payload.photos ?? []).filter(
            (old) => old.targetType === targetType && old.targetKey === targetKey && old.id !== sp.id,
          );
          for (const old of replaced) api.deletePhoto(old.id).catch(() => {});
          setPayload((prev) => (prev ? {
            ...prev,
            photos: [...prev.photos.filter((x) => !replaced.some((old) => old.id === x.id)), sp],
          } : prev));
          return sp;
        } catch {
          return null;
        }
      },
      setBlurb: (world, text) => {
        setPayload((prev) => {
          if (!prev) return prev;
          const worldBlurbs = { ...prev.worldBlurbs, [world]: text };
          api.setWorldBlurbs(saveFileId, worldBlurbs).catch(() => {});
          return { ...prev, worldBlurbs };
        });
      },
      setHouseholdDescription: (hhId, text) => {
        setPayload((prev) => prev ? {
          ...prev,
          households: prev.households.map((h) => (h.id === hhId ? { ...h, description: text } : h)),
        } : prev);
        api.updateHousehold(saveFileId, hhId, { description: text }).catch(() => {});
      },
      setLotDescription: (lotKey, text) => {
        setPayload((prev) => prev ? {
          ...prev,
          lots: prev.lots.map((l) => (l.lotKey === lotKey ? { ...l, description: text } : l)),
        } : prev);
        api.updateLot(saveFileId, lotKey, { description: text }).catch(() => {});
      },
      featuredHhIds,
      featureHousehold: (hhId) => {
        const ids = featuredHhIds();
        if (ids.includes(hhId)) return;
        if (ids.length >= MAX_FEATURED_HOUSEHOLDS) {
          toast(`You have already featured ${MAX_FEATURED_HOUSEHOLDS} households.`);
          return;
        }
        patchSettings((s) => ({ ...s, featuredHouseholds: [hhId, ...ids] }));
      },
      featureLot: (world, lotKey) => {
        const keys = payload.showcase?.worlds?.[world]?.featuredLots ?? [];
        if (keys.includes(lotKey)) return;
        if (keys.length >= MAX_FEATURED_LOTS) {
          toast(`You have already featured ${MAX_FEATURED_LOTS} lots in this world.`);
          return;
        }
        patchSettings((s) => ({
          ...s,
          worlds: { ...(s.worlds ?? {}), [world]: { ...(s.worlds?.[world] ?? {}), featuredLots: [lotKey, ...keys] } },
        }));
      },
      hhBandFull: () => featuredHhIds().length >= MAX_FEATURED_HOUSEHOLDS,
      worldLotsFull: (world) =>
        (payload.showcase?.worlds?.[world]?.featuredLots ?? []).length >= MAX_FEATURED_LOTS,
      worldOrderIds: () =>
        payload.showcase?.worldOrder ?? (derivedRef.current?.worlds ?? []).map((w) => w.name),
      setCreatorName: (name) => {
        const v = name.trim();
        setPayload((prev) => (prev ? { ...prev, creator: { ...prev.creator, name: v || null } } : prev));
        useAuth.getState().updateProfile({ creatorName: v || null }).catch(() => {});
      },
      uploadCreatorPhoto: async (file) => {
        const fd = new FormData();
        fd.append('photo', file);
        try {
          await useAuth.getState().uploadProfilePhoto(fd);
          const filename = useAuth.getState().user?.profilePhotoFilename ?? null;
          setPayload((prev) => (prev ? { ...prev, creator: { ...prev.creator, profilePhotoFilename: filename } } : prev));
        } catch { /* keep the old avatar; nothing to roll back */ }
      },
    };
  }, [payload, setPayload, scheduleSave, reload]);
}

// ── building blocks ────────────────────────────────────────────────────────

// The avatar, click-to-change while editing — the new photo is the PROFILE
// photo, so it follows the creator to every showcase and the planner.
function CreatorAvatar({ p, edit, xl }: { p: ShowcasePayload; edit: EditCtx | null; xl?: boolean }) {
  const [busy, setBusy] = useState(false);
  const filePick = useFilePick(async (file) => {
    if (!edit) return;
    setBusy(true);
    await edit.uploadCreatorPhoto(file);
    setBusy(false);
  });
  const face = p.creator.profilePhotoFilename
    ? <img src={api.photoUrl(p.creator.profilePhotoFilename, xl ? 120 : 36)} alt="" />
    : initials(p.creator.name ?? '?');
  if (!edit) return <div className={`sc-avatar ${xl ? 'xl' : ''}`}>{face}</div>;
  return (
    <div className={`sc-avatarEdit ${busy ? 'busy' : ''}`} onClick={filePick.open} role="button" title="Change your photo">
      <div className={`sc-avatar ${xl ? 'xl' : ''}`}>{face}</div>
      <span className="sc-avBadge"><UploadSimple size={xl ? 14 : 10} weight="bold" /></span>
      {filePick.input}
    </div>
  );
}

// "by <name>" — the name commits to the PROFILE while editing.
function CreatorName({ p, edit }: { p: ShowcasePayload; edit: EditCtx | null }) {
  if (edit) {
    return <EditableText tag="span" value={p.creator.name ?? ''} placeholder="your creator name" onCommit={edit.setCreatorName} spellCheck={false} />;
  }
  return <>{p.creator.name ?? 'a MySaveFile creator'}</>;
}

// The Gallery is an in-game search handle, never a link — so it never wears
// the link pills' clothes. It renders as plain identity text next to the
// name; only real links get pills.
// Brand names the auto-capitalizer gets wrong.
const SOCIAL_LABELS: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube' };
const socialLabel = (key: string) =>
  SOCIAL_LABELS[key.toLowerCase()] ?? key[0].toUpperCase() + key.slice(1);

function splitSocials(creator: ShowcasePayload['creator']) {
  const entries = Object.entries(creator.socialLinks ?? {}).filter(([, v]) => v);
  const galleryEntry = entries.find(([k]) => k.toLowerCase() === 'gallery');
  return {
    gallery: galleryEntry ? normalizeGalleryId(galleryEntry[1]).replace(/^@/, '') : null,
    links: entries.filter(([k]) => k.toLowerCase() !== 'gallery'),
  };
}

function Byline({ p, edit }: { p: ShowcasePayload; edit: EditCtx | null }) {
  const { gallery, links } = splitSocials(p.creator);
  return (
    <div className="sc-byline">
      <CreatorAvatar p={p} edit={edit} />
      <span className="sc-who">by <CreatorName p={p} edit={edit} /></span>
      {gallery && <span className="sc-galleryTag">Gallery @{gallery}</span>}
      {links.map(([key, value]) => (
        <a className="sc-soc" key={key} href={value} target="_blank" rel="noopener noreferrer">{socialLabel(key)}</a>
      ))}
    </div>
  );
}

function MetaLine({ d, light }: { d: DerivedShowcase; light: boolean }) {
  const parts: React.ReactNode[] = [
    <span key="w"><b>{d.counts.worlds}</b> {d.counts.worlds === 1 ? 'world' : 'worlds'}</span>,
  ];
  if (d.counts.households > 0) parts.push(<span key="h"><b>{d.counts.households}</b> households</span>);
  if (d.packNames.length > 0) parts.push(<span key="p"><b>{d.packNames.length}</b> packs</span>);
  if (d.requiredMods > 0) parts.push(<span key="m"><b>{d.requiredMods}</b> required {d.requiredMods === 1 ? 'mod' : 'mods'}</span>);
  if (d.updatedLabel) parts.push(<span key="u">{d.updatedLabel}</span>);
  return (
    <div className="sc-metaLine" style={light ? undefined : { color: 'var(--c-dim)' }}>
      {parts.map((el, i) => <span key={i}>{i > 0 && ' · '}{el}</span>)}
    </div>
  );
}

function DownloadBtn({ url, label = 'Download this save' }: { url: string | null; label?: string }) {
  if (!url) return null; // no link set → the button simply doesn't render
  return (
    <a className="sc-dl" href={url} target="_blank" rel="noopener noreferrer">
      <DownloadSimple size={16} weight="bold" className="sc-i" /> {label}
    </a>
  );
}

// The download link lives ON the showcase: the edit bar always shows its
// state (add / set), and the empty slot where the green button would sit
// offers it too — no trip to Save settings.
function DownloadLinkEditor({ p, edit, variant }: { p: ShowcasePayload; edit: EditCtx; variant: 'chip' | 'dashed' }) {
  const picker = usePickerState();
  const [val, setVal] = useState(p.saveFileUrl ?? '');
  useEffect(() => { setVal(p.saveFileUrl ?? ''); }, [p.saveFileUrl]);
  const save = () => { edit.setSaveFileUrl(val.trim() || null); picker.close(); };
  return (
    <span className={`sc-dlWrap ${variant === 'dashed' ? 'right' : ''}`}>
      {variant === 'chip' ? (
        // In the edit bar it belongs to the bar's own button family — the
        // purple affordance is for the page body, not the chrome.
        <button className="sc-copy" onClick={picker.toggle}>
          {p.saveFileUrl
            ? <><Check size={13} weight="bold" className="sc-i" /> Download link</>
            : <><Plus size={13} weight="bold" className="sc-i" /> Add download link</>}
        </button>
      ) : (
        <span className="sc-dlAdd" onClick={picker.toggle}>
          <DownloadSimple size={15} weight="bold" className="sc-i" /> Add download link
        </span>
      )}
      <PickerPopout open={picker.open} onClose={picker.close}>
        <input
          className="sc-dlInput"
          placeholder="https:// link to the .save download"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') picker.close(); }}
        />
        <div className="sc-dlBtns">
          <button className="sc-dlSave" onClick={save}>Save</button>
          {p.saveFileUrl && (
            <button className="sc-dlRemove" onClick={() => { setVal(''); edit.setSaveFileUrl(null); picker.close(); }}>Remove</button>
          )}
        </div>
      </PickerPopout>
    </span>
  );
}

// The green button when a link exists; while editing, its empty slot becomes
// the add-link affordance instead of nothing.
function DownloadSlot({ p, edit }: { p: ShowcasePayload; edit: EditCtx | null }) {
  if (p.saveFileUrl) return <DownloadBtn url={p.saveFileUrl} />;
  return edit ? <DownloadLinkEditor p={p} edit={edit} variant="dashed" /> : null;
}

// The Change-cover picker — the card from the covers round, live.
function CoverPicker({ p, edit, onClose }: { p: ShowcasePayload; edit: EditCtx; onClose: () => void }) {
  const cover = p.showcase?.cover;
  const kind = cover?.kind ?? 'postcard';
  const pick = (next: { kind: CoverKind; palette?: string }) => {
    edit.patchSettings((s) => ({ ...s, cover: { ...s.cover, ...next } }));
  };
  // "Your photo" goes straight to your files — no picker of pre-added photos.
  // Once one is uploaded, clicking the option re-selects it; the little
  // upload swatch swaps it for a different file.
  const [busy, setBusy] = useState(false);
  const filePick = useFilePick(async (file) => {
    setBusy(true);
    const sp = await edit.uploadShowcasePhoto(file, 'cover', edit.saveFileId);
    setBusy(false);
    if (sp) edit.patchSettings((s) => ({ ...s, cover: { ...s.cover, kind: 'photo', photoId: sp.id } }));
  });
  const hasCoverPhoto = !!cover?.photoId && p.photos.some((ph) => ph.id === cover.photoId);
  const sw = (palette: string, css: React.CSSProperties, sel: boolean, coverKind: CoverKind) => (
    <span
      key={palette}
      className={`sc-sw ${sel ? 'sel' : ''}`}
      style={css}
      onClick={(e) => { e.stopPropagation(); pick({ kind: coverKind, palette }); }}
    />
  );
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 15 }} onClick={onClose} />
      <div className="sc-pickerCard" onClick={(e) => e.stopPropagation()}>
        <span className="sc-plabel">Cover</span>
        <span className={`sc-pOpt ${kind === 'poster' ? 'sel' : ''}`} onClick={() => pick({ kind: 'poster' })}>Poster
          <span className="sc-swatches">
            {sw('green', { background: '#15803d' }, kind === 'poster' && (cover?.palette ?? 'green') === 'green', 'poster')}
            {sw('plum', { background: '#5e4691' }, kind === 'poster' && cover?.palette === 'plum', 'poster')}
            {sw('ink', { background: '#26221c' }, kind === 'poster' && cover?.palette === 'ink', 'poster')}
          </span>
        </span>
        <span className={`sc-pOpt ${kind === 'postcard' ? 'sel' : ''}`} onClick={() => pick({ kind: 'postcard' })}>Postcard
          <span className="sc-swatches">
            {sw('classic', { background: 'linear-gradient(135deg,#f6efdf 50%,#d94f46 50%)' }, kind === 'postcard' && (cover?.palette ?? 'classic') === 'classic', 'postcard')}
            {sw('ash', { background: 'linear-gradient(135deg,#e6e0d2 50%,#8f5b4c 50%)' }, kind === 'postcard' && cover?.palette === 'ash', 'postcard')}
            {sw('pastel', { background: 'linear-gradient(135deg,#fbf3f6 50%,#e59ab5 50%)' }, kind === 'postcard' && cover?.palette === 'pastel', 'postcard')}
          </span>
        </span>
        <span className={`sc-pOpt ${kind === 'photo' ? 'sel' : ''}`} onClick={() => (hasCoverPhoto ? pick({ kind: 'photo' }) : filePick.open())}>
          {busy ? 'Uploading…' : 'Your photo'}
          <span className="sc-swatches">
            <span className="sc-sw up" onClick={(e) => { e.stopPropagation(); filePick.open(); }}>
              <UploadSimple size={12} weight="bold" />
            </span>
          </span>
        </span>
        {filePick.input}
      </div>
    </>
  );
}

function Hero({ p, d, edit }: { p: ShowcasePayload; d: DerivedShowcase; edit: EditCtx | null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cover = p.showcase?.cover;
  const { kind, heroPhoto } = resolveHero(p);
  const coverData: CoverData = buildCoverData(p, d);

  const chips = edit && (
    <div className="sc-heroChips">
      <span className="sc-eChip" style={{ background: '#fff', boxShadow: '0 2px 8px rgba(26,23,20,.10)' }} onClick={() => setPickerOpen((v) => !v)}>
        <Image size={12} className="sc-i" /> Change cover
      </span>
      {pickerOpen && <CoverPicker p={p} edit={edit} onClose={() => setPickerOpen(false)} />}
    </div>
  );

  if (kind !== 'photo') {
    // Byline, stats, description and download all live in the creator band
    // below — the cover is only the cover.
    return (
      <div className="sc-coverHero">
        {chips}
        {kind === 'postcard'
          ? <PostcardCover data={coverData} palette={cover?.palette ?? 'classic'} onRename={edit ? edit.setName : undefined} />
          : <PosterCover data={coverData} palette={cover?.palette ?? 'green'} onRename={edit ? edit.setName : undefined} />}
      </div>
    );
  }

  return (
    <div className="sc-hero">
      <img className="sc-phimg" src={api.photoUrl(heroPhoto!.filename)} alt="" />
      <div className="sc-scrim" />
      {chips}
      <div className="sc-heroInner">
        <div>
          {edit
            ? <EditableText tag="h1" value={p.name} placeholder="Name your save" onCommit={edit.setName} spellCheck={false} className="" style={{ color: '#fff', fontSize: 'clamp(32px, 4.6vw, 58px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.04, textShadow: '0 2px 18px rgba(0,0,0,.35)' }} />
            : <h1>{p.name}</h1>}
          <Byline p={p} edit={edit} />
          <MetaLine d={d} light />
        </div>
        <DownloadSlot p={p} edit={edit} />
      </div>
    </div>
  );
}

// ── the creator band — ONE composed block under the cover ─────────────────
// This zone used to be three sparse strips (a 36px byline, a lone floating
// sentence, tiny crests) that read as dead space under a huge, dense cover —
// and buried the creator's identity, the thing they're proudest of, as the
// smallest object on the page. Composed instead: identity at real size on
// the left (the avatar leads), the description as real prose beside it, the
// download at the end. Flat on the cream, no box. Under a PHOTO hero the
// identity already sits on the image, so the band carries only the prose.
function CreatorBand({ p, d, edit, identity }: {
  p: ShowcasePayload; d: DerivedShowcase; edit: EditCtx | null; identity: boolean;
}) {
  const { gallery, links } = splitSocials(p.creator);
  const prose = (p.description || edit) ? (
    <div className="sc-prose">
      {edit
        ? <EditableText tag="p" value={p.description} placeholder="Add a description" onCommit={edit.setDescription} className="sc-desc2" />
        : <p className="sc-desc2">{p.description}</p>}
    </div>
  ) : null;

  if (!identity) return prose && <div className="sc-creatorBand solo">{prose}</div>;

  // Content caps at 1280 and centers (the world hero's own cap) — on a wide
  // screen the slack becomes symmetric margins instead of gulfs between the
  // columns. The stats line spans the band's full width underneath, one
  // unhurried line captioning the whole save, instead of wrapping into a
  // blob beneath the chips.
  return (
    <div className="sc-creatorBand">
      <div className="sc-cbInner">
        {/* identity = avatar + name only, so the avatar carries the block;
            socials live on the caption line below, where five of them have a
            whole band's width instead of crowding the name */}
        <div className="sc-ident">
          <CreatorAvatar p={p} edit={edit} xl />
          <div className="min-w-0">
            {/* the little "by" needs its OWN class: styling it as `span` also
                caught the editable name, which is a span too — the creator's
                name silently rendered at caption size the whole time you were
                editing, which is always, for the owner */}
            <div className="sc-creatorName"><span className="sc-byLbl">by</span> <CreatorName p={p} edit={edit} /></div>
            {/* the Gallery handle is identity, not a link — it lives with the
                name, and the caption row below keeps only real links */}
            {gallery && <div className="sc-galleryTag">Gallery @{gallery}</div>}
          </div>
        </div>
        {prose ?? <div />}
        <div className="sc-bandDl"><DownloadSlot p={p} edit={edit} /></div>
        {/* the caption line anchors the band: stats at one end, socials at
            the other — two held corners instead of dangling space */}
        <div className="sc-cbStats">
          <MetaLine d={d} light={false} />
          {links.length > 0 && (
            <div className="sc-socRow">
              {links.map(([key, value]) => (
                <a className="sc-soc" key={key} href={value} target="_blank" rel="noopener noreferrer">{socialLabel(key)}</a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TourNav({ d, active, edit }: { d: DerivedShowcase; active: number; edit: EditCtx | null }) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Crests size to the tour: a 30-world wall stays compact, a handful of
  // worlds get crests with real presence (two 40px circles alone in a
  // full-width band read as lost buttons, not a nav).
  const n = d.worlds.length;
  const rowVars = n > 10
    ? { '--tn': '34px', '--tngap': '13px' }
    : n > 6
      ? { '--tn': 'clamp(36px, 2.8vw, 48px)', '--tngap': 'clamp(12px, 1.1vw, 18px)' }
      : { '--tn': 'clamp(56px, 4.6vw, 68px)', '--tngap': 'clamp(20px, 2vw, 32px)' };

  // Dragging a crest reorders the worlds (chapters follow).
  const sort = useSortable((from, to) => {
    if (!edit) return;
    edit.patchSettings((s) => ({ ...s, worldOrder: moveItem(edit.worldOrderIds(), from, to) }));
  });

  // Keep the active crest in view by scrolling the ROW only — never
  // scrollIntoView from a scroll handler (it yanks the page).
  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const chip = row.children[active] as HTMLElement | undefined;
    if (chip) row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
  }, [active]);

  if (d.worlds.length < 2) return null;
  return (
    <nav className={`sc-tourNav ${edit ? 'editing' : ''}`}>
      <div className="sc-row" ref={rowRef} style={rowVars as React.CSSProperties}>
        {d.worlds.map((w, i) => (
          <a
            className={`sc-tn ${i === active ? 'act' : ''}`}
            key={w.name}
            href={`#world-${i}`}
            title={w.name}
            {...(edit ? { ...sort.item(i), ...sort.handle(i) } : {})}
          >
            {w.icon ? <img src={w.icon} alt={w.name} /> : null}
          </a>
        ))}
      </div>
      {edit && d.worlds.length > 1 && (
        <span className="sc-eChip" onClick={() => edit.patchSettings((s) => ({ ...s, worldOrder: undefined }))}>
          <ArrowCounterClockwise size={12} className="sc-i" /> Reset order
        </span>
      )}
    </nav>
  );
}

function ChapterLead({ w, onVisit, edit }: { w: DerivedWorld; onVisit: (world: string) => void; edit: EditCtx | null }) {
  const setLead = (lead: LeadKind) => edit?.patchWorld(w.name, (ws) => ({ ...ws, lead }));
  // Upload goes straight to your files, then leads the chapter with the shot.
  const [busy, setBusy] = useState(false);
  const filePick = useFilePick(async (file) => {
    if (!edit) return;
    setBusy(true);
    const sp = await edit.uploadShowcasePhoto(file, 'world', w.name);
    setBusy(false);
    if (sp) edit.patchWorld(w.name, (ws) => ({ ...ws, lead: 'photo', leadPhotoId: sp.id }));
  });
  // A lead is only offered when it has something to render. Every option
  // used to show always, so picking "Your photo" for a world with no photo
  // lit up a chip and changed nothing — the renderer just fell through to
  // the map. The auto map is the one lead that always works.
  const hhPortraits = w.households.filter((h) => h.portraitFilename);
  const leads: [LeadKind, string][] = [];
  if (w.leadPhoto) leads.push(['photo', 'Your photo']);
  if (w.lotPhotos.length >= 2) leads.push(['collage', 'Lot collage']);
  if (hhPortraits.length >= 2) leads.push(['hhcollage', 'Household collage']);
  leads.push(['map', 'Auto map']);

  // What is ACTUALLY on screen: a stored choice can point at content that has
  // since been deleted, and the lit chip has to agree with the picture.
  const lead: LeadKind = leads.some(([k]) => k === w.lead) ? w.lead : 'map';

  const picker = edit && (
    <div className="sc-leadPick" onClick={(e) => e.stopPropagation()}>
      {/* Auto map always shows, even alone — the lit chip names the current
          lead, so the row reads the same on every world. */}
      {leads.map(([k, label]) => (
        <span className={`sc-eChip ${lead === k ? 'sel' : ''}`} key={k} onClick={() => setLead(k)}>{label}</span>
      ))}
      <span className="sc-eChip" onClick={filePick.open}>
        <UploadSimple size={12} weight="bold" className="sc-i" /> {busy ? 'Uploading…' : 'Upload'}
      </span>
      {filePick.input}
    </div>
  );
  // Only the auto map keeps a corner tag — it marks a stand-in the creator
  // hasn't replaced. Collages and photos are THEIR content; labelling it
  // "their lot photos" over their own pictures read as noise.
  let img: React.ReactNode;
  let tag: string | null = null;
  if (lead === 'collage') {
    const cells = w.lotPhotos.slice(0, 4);
    img = (
      <div className={`sc-collage ${cells.length === 3 ? 'three' : cells.length === 2 ? 'two' : ''}`}>
        {cells.map((ph) => <div className="sc-cell" key={ph.id}><img className="sc-phimg" src={api.photoUrl(ph.filename, 600)} alt="" /></div>)}
      </div>
    );
  } else if (lead === 'hhcollage') {
    const cells = hhPortraits.slice(0, 4);
    img = (
      <div className={`sc-collage hh ${cells.length === 3 ? 'three' : cells.length === 2 ? 'two' : ''}`}>
        {cells.map((h) => <div className="sc-cell" key={h.hh.id}><img className="sc-phimg" src={api.photoUrl(h.portraitFilename!, 600)} alt="" /></div>)}
      </div>
    );
  } else if (lead === 'photo') {
    img = <img className="sc-phimg" src={api.photoUrl(w.leadPhoto!.filename, 1100)} alt="" />;
  } else {
    // Auto map — the world's own map art with its lot pins; never homework.
    // Static pins here: the whole card is one big "Visit" target.
    img = <AutoMap worldName={w.name} entries={w.lotEntries} pinSize={28} />;
    tag = 'auto map';
  }
  return (
    <div className="sc-chapMap" onClick={() => onVisit(w.name)}>
      {img}
      {tag ? <span className="sc-tag">{tag}</span> : null}
      {picker}
      {!edit && <span className="sc-go"><span>Visit {w.name} →</span></span>}
    </div>
  );
}

// The dashed + tile: feature a lot onto the peek row (and the world page's
// big cards — ONE list).
function FeatureLotTile({ w, edit }: { w: DerivedWorld; edit: EditCtx }) {
  const picker = usePickerState();
  const candidates = w.lotEntries.filter((e) => e.photo && !e.featured && !e.hidden);
  const full = edit.worldLotsFull(w.name);
  return (
    <div className="sc-mini add" style={{ position: 'relative' }} onClick={picker.toggle}>
      <Plus size={16} className="sc-i" />
      <span>Feature</span>
      <PickerPopout open={picker.open} onClose={picker.close}>
        {full && <div className="sc-pickEmpty">You have already featured {MAX_FEATURED_LOTS} lots in this world.</div>}
        {!full && candidates.length === 0 && <div className="sc-pickEmpty">Every photographed lot is already featured.</div>}
        {!full && candidates.map((e) => (
          <button
            className="sc-pickRow"
            key={e.lot.lotKey}
            onClick={() => {
              edit.featureLot(w.name, e.lot.lotKey);
              picker.close();
            }}
          >
            <span className="sc-pimg">{e.photo && <img className="sc-phimg" src={api.photoUrl(e.photo.filename, 52)} alt="" loading="lazy" decoding="async" />}</span>
            <span><span className="sc-pn">{e.lot.customName || e.lot.lotName}</span></span>
          </button>
        ))}
      </PickerPopout>
    </div>
  );
}

function Chapter({ w, i, onVisit, edit }: { w: DerivedWorld; i: number; onVisit: (world: string) => void; edit: EditCtx | null }) {
  const showMinis = w.lead !== 'collage' && (w.peek.length > 0 || !!edit);
  // Every thumb drags, anywhere in the row — featured or not. A drag moves
  // the lot in the WORLD'S lot order (the same order the world page's grid
  // drag writes), so it never features anything by accident. Featuring
  // decides what is in the row; dragging decides the order.
  const sort = useSortable((from, to) => {
    if (!edit) return;
    const fromKey = w.peekKeys[from];
    const toKey = w.peekKeys[to];
    if (!fromKey || !toKey || fromKey === toKey) return;
    edit.patchWorld(w.name, (ws) => {
      // The order materializes from what's on screen the first time it's
      // dragged, exactly like the world page's grid.
      const current = ws.lotOrder ?? w.lotEntries.map((e) => e.lot.lotKey);
      const f = current.indexOf(fromKey);
      const t = current.indexOf(toKey);
      if (f === -1 || t === -1) return ws;
      return { ...ws, lotOrder: moveItem(current, f, t) };
    });
  });
  return (
    <section className={`sc-chapter ${i % 2 === 0 ? 'alt' : ''} ${i % 2 ? 'flip' : ''}`} id={`world-${i}`}>
      {edit && (
        <div className="sc-chapTools">
          <span className="sc-eChip" onClick={() => edit.patchWorld(w.name, (ws) => ({ ...ws, shown: false }))}>
            <Eye size={12} className="sc-i" /> Shown
          </span>
        </div>
      )}
      <div className="sc-chapGrid">
        <ChapterLead w={w} onVisit={onVisit} edit={edit} />
        <div className="sc-chapBody">
          <h2>{w.name}</h2>
          <div className="sc-stats">
            {w.photographedLotCount > 0 && `${w.photographedLotCount} ${w.photographedLotCount === 1 ? 'lot' : 'lots'}`}
            {w.photographedLotCount > 0 && w.households.length > 0 && ' · '}
            {w.households.length > 0 && `${w.households.length} ${w.households.length === 1 ? 'household' : 'households'}`}
          </div>
          {edit
            ? <EditableText tag="p" value={w.blurb} placeholder="Add a description" onCommit={(t) => edit.setBlurb(w.name, t)} className="sc-blurb" />
            : (w.blurb ? <p className="sc-blurb">{w.blurb}</p> : null)}
          {showMinis && (
            <div className="sc-miniRow">
              {/* the same maximum the world page enforces — a row that showed
                  fewer than can be featured would make featuring the last one
                  look like it removed an earlier one, which is the whole bug */}
              {w.peek.map((ph, pi) => {
                const canDrag = !!edit;
                return (
                  <div
                    className={`sc-mini ${canDrag ? 'sc-editGrab' : ''}`}
                    key={ph.id}
                    {...(canDrag ? { ...sort.item(pi), ...sort.handle(pi) } : {})}
                  >
                    <img className="sc-phimg" src={api.photoUrl(ph.filename, 150)} alt="" loading="lazy" decoding="async" />
                    {canDrag && <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>}
                  </div>
                );
              })}
              {edit && <FeatureLotTile w={w} edit={edit} />}
            </div>
          )}
          <button className="sc-visitBtn" onClick={() => onVisit(w.name)}>
            Visit {w.name} <ArrowRight size={13} weight="bold" className="sc-i" />
          </button>
        </div>
      </div>
    </section>
  );
}

function FeatureHouseholdTile({ d, edit }: { d: DerivedShowcase; edit: EditCtx }) {
  const picker = usePickerState();
  const [q, setQ] = useState('');
  const [restOpen, setRestOpen] = useState(false);
  const featured = new Set(edit.featuredHhIds());
  const full = edit.hhBandFull();
  // The Manager's split, by the same signal the auto-default band uses:
  // provenance 'yours' = My Households, everything else = Rest of Town
  // (collapsed until opened or searched — a full save has hundreds).
  const byPortrait = (a: DerivedHousehold, b: DerivedHousehold) =>
    (a.portraitFilename ? 0 : 1) - (b.portraitFilename ? 0 : 1);
  const query = q.trim().toLowerCase();
  const hit = (h: DerivedHousehold) =>
    !query || h.hh.name.toLowerCase().includes(query) || (h.worldName ?? '').toLowerCase().includes(query);
  const candidates = d.allHouseholds.filter((h) => !featured.has(h.hh.id));
  const mine = candidates.filter((h) => h.hh.provenance === 'yours').filter(hit).sort(byPortrait);
  const rest = candidates.filter((h) => h.hh.provenance !== 'yours').filter(hit).sort(byPortrait);
  // Searching looks through everything; so does having no households of
  // your own to lead with.
  const showRest = restOpen || !!query || mine.length === 0;
  const row = (h: DerivedHousehold) => (
    <button
      className="sc-pickRow"
      key={h.hh.id}
      onClick={() => {
        edit.featureHousehold(h.hh.id);
        picker.close();
      }}
    >
      <span className="sc-pimg">
        {h.portraitFilename
          ? <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 52)} alt="" loading="lazy" decoding="async" />
          : <span className="sc-hhPh" style={{ fontSize: 12, color: 'var(--c-faint)' }}>{initials(h.hh.name)}</span>}
      </span>
      <span>
        <span className="sc-pn">{h.hh.name}</span>
        {h.worldName && <span className="sc-pk" style={{ display: 'block' }}>{h.worldName}</span>}
      </span>
    </button>
  );
  return (
    <div
      className="sc-hhAdd"
      style={{ position: 'relative' }}
      onClick={() => {
        if (!picker.open) { setQ(''); setRestOpen(false); }
        picker.toggle();
      }}
    >
      <Plus size={18} className="sc-i" />
      Feature
      {/* the tile never changes — being full is something the pop-out says,
          the same way it reports having nothing left to offer */}
      <PickerPopout open={picker.open} onClose={picker.close}>
        {full && <div className="sc-pickEmpty">You have already featured {MAX_FEATURED_HOUSEHOLDS} households.</div>}
        {!full && candidates.length === 0 && <div className="sc-pickEmpty">Every household is already featured.</div>}
        {!full && candidates.length > 0 && (
          <>
            <div className="sc-pickSearch">
              <input
                placeholder="Search households"
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') picker.close(); }}
              />
            </div>
            {query && mine.length === 0 && rest.length === 0 && (
              <div className="sc-pickEmpty">Nothing matches “{q.trim()}”.</div>
            )}
            {mine.length > 0 && <div className="sc-pickHead">My Households — {mine.length}</div>}
            {mine.map(row)}
            {!showRest && rest.length > 0 && (
              <button className="sc-pickRow sc-pickMore" onClick={(e) => { e.stopPropagation(); setRestOpen(true); }}>
                <CaretDown size={12} weight="bold" className="sc-i" /> Rest of Town — {rest.length}
              </button>
            )}
            {showRest && rest.length > 0 && (
              <>
                <div className="sc-pickHead">Rest of Town — {rest.length}</div>
                {rest.map(row)}
              </>
            )}
          </>
        )}
      </PickerPopout>
    </div>
  );
}

function HouseholdSub({ h }: { h: DerivedHousehold }) {
  const simCount = h.sims.length;
  const sub = [
    simCount > 0 ? `${simCount} ${simCount === 1 ? 'sim' : 'sims'}` : null,
    h.homeLotName,
  ].filter(Boolean).join(' · ');
  return sub ? <div className="sc-s">{sub}</div> : null;
}

function ModList({ p, query }: { p: ShowcasePayload; query: string }) {
  const q = query.trim().toLowerCase();
  const hit = (m: { name: string }) => !q || m.name.toLowerCase().includes(q);
  const req = p.mods.filter((m) => m.importance === 'required').filter(hit);
  const rec = p.mods.filter((m) => m.importance !== 'required').filter(hit);
  if (!req.length && !rec.length) return <div className="sc-none">Nothing matches “{query.trim()}”.</div>;
  const row = (m: ShowcasePayload['mods'][number], i: number) => {
    const body = (
      <>
        <span className={`sc-tChip ${m.type === 'CC' ? 'cc' : ''}`}>{m.type}</span>
        <span className="sc-mn">{m.name}</span>
        {m.url ? <span className="sc-ext"><ArrowUpRight size={11} weight="bold" className="sc-i" /></span> : null}
      </>
    );
    return m.url
      ? <a className="sc-modRow" key={i} href={m.url} target="_blank" rel="noopener noreferrer">{body}</a>
      : <div className="sc-modRow" key={i}>{body}</div>;
  };
  return (
    <div className="sc-modList">
      {req.length > 0 && <><div className="sc-sk sc-grpHead">Required — {req.length}</div>{req.map(row)}</>}
      {rec.length > 0 && <><div className="sc-sk sc-grpHead">Recommended — {rec.length}</div>{rec.map(row)}</>}
    </div>
  );
}

function Closing({ p, d, edit }: { p: ShowcasePayload; d: DerivedShowcase; edit: EditCtx | null }) {
  const [packsOpen, setPacksOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shownPacks = packsOpen ? d.packNames : d.packNames.slice(0, PACKS_SHOWN);
  const rest = d.packNames.length - shownPacks.length;
  const totalMods = d.requiredMods + d.recommendedMods;
  const bigList = totalMods > 24;
  return (
    <section className="sc-closing">
      <h2>Download {p.name}</h2>
      {(d.packNames.length > 0 || totalMods > 0) && (
        <div className="sc-needs">
          {d.packNames.length > 0 && (
            <div>
              <div className="sc-sk">Packs used</div>
              <div className="sc-packPills">
                {shownPacks.map((name) => <span key={name}>{name}</span>)}
                {rest > 0 && <button className="sc-moreChip" onClick={() => setPacksOpen(true)}>+{rest} more</button>}
              </div>
            </div>
          )}
          {totalMods > 0 && (
            <div>
              <div className="sc-sk">Mods &amp; CC</div>
              <div className="sc-ccLine">
                <b>{d.requiredMods}</b> required · <b>{d.recommendedMods}</b> recommended
                <button className="sc-ccList" onClick={() => { setModsOpen(!modsOpen); setQuery(''); }}>
                  {modsOpen ? 'Hide the list' : 'See the full list →'}
                </button>
              </div>
              {modsOpen && (bigList ? (
                <>
                  <input
                    className="sc-modSearch"
                    placeholder={`Filter ${totalMods} mods & CC`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="sc-modListBox scroll"><ModList p={p} query={query} /></div>
                </>
              ) : (
                <div className="sc-modListBox"><ModList p={p} query="" /></div>
              ))}
            </div>
          )}
        </div>
      )}
      <DownloadSlot p={p} edit={edit} />
    </section>
  );
}

// Edit only: worlds visitors never see, each with its reason and a Show chip.
// An auto-hidden world re-shows ITSELF when it gains a photo; a creator-hidden
// one stays here until they show it.
function HiddenWorldsBand({ d, edit }: { d: DerivedShowcase; edit: EditCtx }) {
  // Folded by default, like the world pages' "Other lots" — it's reference,
  // not reading material, and a full save hides a lot of worlds.
  const [open, setOpen] = useState(false);
  if (d.hiddenWorlds.length === 0) return null;
  return (
    <div className="sc-hiddenBand">
      <button className="sc-hLbl" onClick={() => setOpen((v) => !v)}>
        Hidden worlds ({d.hiddenWorlds.length}) {open ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
      </button>
      {open && d.hiddenWorlds.map((w) => (
        <div className="sc-hiddenRow" key={w.name}>
          {w.icon && <img src={w.icon} alt="" />}
          <div>
            <div className="sc-n">{w.name}</div>
            <div className="sc-why">{w.hiddenReason === 'creator' ? 'hidden by you' : 'no photo yet'}</div>
          </div>
          <span className="sc-eChip" onClick={() => edit.patchWorld(w.name, (ws) => ({ ...ws, shown: true }))}>Show</span>
        </div>
      ))}
    </div>
  );
}

function PageFoot() {
  return (
    <footer className="sc-pageFoot">
      <div className="sc-links">
        <span className="sc-brand"><img className="sc-logoImg" src="/3d-clay-plumbob.svg" alt="" /> MySaveFile</span>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </div>
      The Sims™ is a trademark of Electronic Arts Inc. Unofficial, non-commercial fan project, not affiliated with or endorsed by EA.
    </footer>
  );
}

// The branded not-live page — IDENTICAL for a link that is turned off and a
// link that never existed, so existence can't be probed.
function NotLivePage() {
  useEffect(() => { document.title = 'MySaveFile'; }, []);
  return (
    <div className="sc-page">
      <div className="sc-notLive">
        <img src="/3d-clay-plumbob.svg" alt="" />
        <h1>No showcase here!</h1>
        <Link className="sc-cta" to="/">Plan your own save <ArrowRight size={13} weight="bold" className="sc-i" /></Link>
      </div>
      <PageFoot />
    </div>
  );
}

// ── the page ───────────────────────────────────────────────────────────────

export function ShowcasePage() {
  const { slug, saveFileId } = useParams<{ slug?: string; saveFileId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [payload, setPayload] = useState<ShowcasePayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'notfound' | 'ready'>('loading');
  const [copied, setCopied] = useState(false);
  const [activeWorld, setActiveWorld] = useState(0);
  // Click a lot/household card → its detail overlay (one layer; links inside
  // swap the content rather than stacking a second layer).
  const [overlay, setOverlay] = useState<OverlayTarget | null>(null);

  // Edits that have not reached the server yet. A refresh must not undo them:
  // reloads fire on tab focus and on a rename, and one landing mid-write used
  // to replace the page with the server's older copy.
  const unsaved = useRef<ShowcaseSettings | null>(null);

  const load = useCallback((initial: boolean) => {
    if (initial) setStatus('loading');
    const req = slug ? api.getShowcaseBySlug(slug) : api.getShowcasePayloadForSave(saveFileId!);
    req
      .then((data) => {
        if ('redirectTo' in data && data.redirectTo) {
          // An old slug — follow it to the current one, replacing history.
          navigate(`/s/${data.redirectTo}`, { replace: true });
          return;
        }
        const fresh = data as unknown as ShowcasePayload;
        // Everything else on the page is refreshed, but the settings blob
        // keeps the copy being written — otherwise the edit disappears off
        // the screen and the next one is computed from the stale copy.
        setPayload(unsaved.current ? { ...fresh, showcase: unsaved.current } : fresh);
        setStatus('ready');
      })
      .catch(() => { if (initial) setStatus('notfound'); });
  }, [slug, saveFileId, navigate]);

  useEffect(() => { load(true); }, [load]);
  const reload = useCallback(() => load(false), [load]);

  useEffect(() => {
    if (payload) document.title = `${payload.name} — MySaveFile`;
  }, [payload]);

  // A rename made in the planner (or in another tab) reaches the cover art,
  // the page title AND the re-minted slug — so reload rather than patch.
  const ownedId = payload?.saveFileId;
  useEffect(() => {
    if (!ownedId) return;
    return onSaveRenamed((msg) => { if (msg.saveFileId === ownedId) reload(); });
  }, [ownedId, reload]);

  // Catch-up for anything this tab slept through.
  useEffect(() => onTabVisible(reload), [reload]);

  const derived = useMemo(() => (payload ? deriveShowcase(payload) : null), [payload]);
  const edit = useEditCtx(payload, derived, setPayload, reload, unsaved);

  // Scroll-track the tour nav's active crest.
  useEffect(() => {
    if (!derived) return;
    const onScroll = () => {
      let act = 0;
      for (let i = 0; i < derived.worlds.length; i++) {
        const el = document.getElementById(`world-${i}`);
        if (el && el.getBoundingClientRect().top <= 140) act = i;
      }
      setActiveWorld(act);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, [derived]);

  // World views are IN-PAGE: the world lives in history state, never the URL
  // (one URL per save — there is nothing world-shaped to paste). Pushing a
  // history entry keeps the browser back button working. Visitor preview
  // lives there too, for the same reason: Back must step OUT of preview,
  // not out of the showcase entirely.
  const navState = (location.state as { scWorld?: string; scPreview?: boolean } | null) ?? null;
  const worldName = navState?.scWorld ?? null;
  const preview = !!navState?.scPreview;
  const onVisit = useCallback((world: string | null) => {
    navigate(location.pathname, {
      state: {
        ...(world ? { scWorld: world } : {}),
        ...((location.state as { scPreview?: boolean } | null)?.scPreview ? { scPreview: true } : {}),
      },
    });
  }, [navigate, location.pathname, location.state]);
  const enterPreview = useCallback(() => {
    navigate(location.pathname, { state: { ...(navState ?? {}), scPreview: true } });
  }, [navigate, location.pathname, navState]);
  // Leaving preview puts you back exactly where you are, editing — it drops
  // the preview flag from THIS location and keeps the world. Stepping back
  // through history instead (what this used to do) undid one navigation, so
  // after browsing a world or two in preview it dumped you on an earlier
  // page and, worse, often still in preview.
  const exitPreview = useCallback(() => {
    navigate(location.pathname, { state: worldName ? { scWorld: worldName } : {} });
  }, [navigate, location.pathname, worldName]);
  useEffect(() => { window.scrollTo(0, 0); }, [worldName]);

  const setLive = useCallback(async (live: boolean) => {
    if (!payload?.saveFileId) return;
    const res = await api.setShowcaseLive(payload.saveFileId, live);
    setPayload((prev) => (prev ? { ...prev, live: res.live, slug: res.slug ?? prev.slug } : prev));
  }, [payload?.saveFileId]);

  const copyLink = useCallback(() => {
    if (!payload?.slug) return;
    navigator.clipboard.writeText(`https://mysavefile.com/s/${payload.slug}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [payload?.slug]);

  if (status === 'loading') return <div className="sc-page" />;
  if (status === 'notfound' || !payload || !derived) return <NotLivePage />;

  const editing = !!payload.isOwner && !preview;
  const editCtx = editing ? edit : null;
  const currentWorld = worldName ? derived.worlds.find((w) => w.name === worldName) ?? null : null;
  const hhBandTop = !!payload.showcase?.hhBandTop;

  const frontBody = (
    <>
      <Hero p={payload} d={derived} edit={editCtx} />
      <CreatorBand p={payload} d={derived} edit={editCtx} identity={resolveHero(payload).kind !== 'photo'} />
      {hhBandTop && <FrontHouseholds d={derived} edit={editCtx} top onOpen={setOverlay} />}
      <div className="sc-tour">
        <TourNav d={derived} active={activeWorld} edit={editCtx} />
        {derived.worlds.map((w, i) => <Chapter key={w.name} w={w} i={i} onVisit={onVisit} edit={editCtx} />)}
      </div>
      {!hhBandTop && <FrontHouseholds d={derived} edit={editCtx} top={false} onOpen={setOverlay} />}
      <Closing p={payload} d={derived} edit={editCtx} />
      {editCtx && <HiddenWorldsBand d={derived} edit={editCtx} />}
    </>
  );

  // A visitor can only be here when the page is live (the API 404s
  // otherwise), so the visitor branch below needs no live check.
  return (
    <div className={`sc-page ${!editing ? 'visitor-pad' : ''}`} style={{ '--sc-stick': editing ? '53px' : '0px' } as React.CSSProperties}>
      {editing && (
        <div className="sc-editBar">
          {currentWorld ? (
            // Status only on a world page — the Live TOGGLE lives on the
            // front page; this world's own off-switch is its Shown chip.
            <span className={`sc-live ${payload.live ? 'on' : ''} sc-tip`} data-tip="Turn on/off from the main showcase page" style={{ cursor: 'default' }}>
              <span className="sc-dot" />{payload.live ? 'Live' : 'Not live'}
            </span>
          ) : (
            <span className={`sc-live ${payload.live ? 'on' : ''}`} onClick={() => setLive(!payload.live)}>
              <span className="sc-dot" />{payload.live ? 'Live' : 'Not live'}
            </span>
          )}
          <span className={`sc-url ${payload.live ? '' : 'off'}`}>
            <span>mysavefile.com/s/</span>{payload.slug ?? ''}
          </span>
          {payload.slug && <button className="sc-copy" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>}
          <button className="sc-copy" onClick={enterPreview}>
            <Eye size={13} weight="bold" className="sc-i" /> View as visitor
          </button>
          {editCtx && <DownloadLinkEditor p={payload} edit={editCtx} variant="chip" />}
          <span className="sc-hint">Editing controls are only visible to you.</span>
        </div>
      )}

      {currentWorld
        ? <ShowcaseWorldView p={payload} d={derived} world={currentWorld} onVisit={onVisit} edit={editCtx} onOpen={setOverlay} />
        : frontBody}
      <PageFoot />

      {overlay && (
        <DetailOverlay p={payload} d={derived} target={overlay} onOpen={setOverlay} onClose={() => setOverlay(null)} edit={editCtx} />
      )}

      {payload.saveFileUrl && !editing && (
        <a className="sc-stickyDl" href={payload.saveFileUrl} target="_blank" rel="noopener noreferrer">
          <DownloadSimple size={16} weight="bold" className="sc-i" /> Download this save
        </a>
      )}
      {payload.isOwner && preview && (
        <button className="sc-backEdit" onClick={exitPreview}>
          <Eye size={13} weight="bold" className="sc-i" /> Back to editing
        </button>
      )}
    </div>
  );
}

// The front band with its section tools (Move up/down mirrors the world
// page's section flip — family saves lead the front with the cast).
function FrontHouseholds({ d, edit, top, onOpen }: { d: DerivedShowcase; edit: EditCtx | null; top: boolean; onOpen: (t: OverlayTarget) => void }) {
  // Portrait cards first, cast-row cards after — a tall photo card between
  // two short compact ones made the whole band read as broken. Drag reorders
  // within the group; the saved list keeps any beyond-the-cap tail.
  // Already capped where it is derived — the band shows the whole list.
  const featured = [...d.featuredHouseholds]
    .sort((a, b) => (a.portraitFilename ? 0 : 1) - (b.portraitFilename ? 0 : 1));
  const sort = useSortable((from, to) => {
    if (!edit) return;
    const dispIds = featured.map((h) => h.hh.id);
    const moved = moveItem(dispIds, from, to);
    const rest = edit.featuredHhIds().filter((id) => !dispIds.includes(id));
    edit.patchSettings((s) => ({ ...s, featuredHouseholds: [...moved, ...rest] }));
  });
  if (featured.length === 0 && !edit) return null;
  return (
    <section className="sc-hhBand">
      <div className="sc-bandHead">
        <h2>The households</h2>
        {featured.length > 0 && <span className="sc-sub">{featured.length} featured</span>}
        {edit && (
          <span className="sc-sectTools">
            <span className="sc-eChip" onClick={() => edit.patchSettings((s) => ({ ...s, hhBandTop: !top }))}>
              {top ? <><ArrowDown size={12} className="sc-i" /> Move down</> : <><ArrowUp size={12} className="sc-i" /> Move up</>}
            </span>
          </span>
        )}
      </div>
      <div className="sc-hhGrid">
        {featured.map((h, i) => h.portraitFilename ? (
          <div className="sc-hhCard" key={h.hh.id} onClick={(e) => { if (overlayClickGuard(e)) onOpen({ kind: 'hh', hhId: h.hh.id }); }} {...(edit ? sort.item(i) : {})}>
            {edit && (
              <div className="sc-hhX" onClick={() => edit.patchSettings((s) => ({ ...s, featuredHouseholds: edit.featuredHhIds().filter((id) => id !== h.hh.id) }))}>
                <X size={11} weight="bold" />
              </div>
            )}
            <div className={`sc-img ${edit ? 'sc-editGrab' : ''}`} {...(edit ? sort.handle(i) : {})}>
              <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 260)} alt="" loading="lazy" decoding="async" />
              {edit && <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>}
            </div>
            <div className="sc-n">{h.hh.name}</div>
            <HouseholdSub h={h} />
          </div>
        ) : (
          // No portrait → no photo box: a short card led by the cast itself.
          <div className={`sc-hhCard compact ${edit ? 'sc-editGrab' : ''}`} key={h.hh.id} onClick={(e) => { if (overlayClickGuard(e)) onOpen({ kind: 'hh', hhId: h.hh.id }); }} {...(edit ? { ...sort.item(i), ...sort.handle(i) } : {})}>
            {edit && (
              <div className="sc-hhX" onClick={() => edit.patchSettings((s) => ({ ...s, featuredHouseholds: edit.featuredHhIds().filter((id) => id !== h.hh.id) }))}>
                <X size={11} weight="bold" />
              </div>
            )}
            <CastRow h={h} />
            <div className="sc-n">{h.hh.name}</div>
            <HouseholdSub h={h} />
            {edit && <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>}
          </div>
        ))}
        {edit && <FeatureHouseholdTile d={d} edit={edit} />}
      </div>
    </section>
  );
}

export default ShowcasePage;
