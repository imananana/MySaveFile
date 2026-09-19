// Pure derivation: payload + settings → what the showcase renders.
// The save DRAFTS the page (photo signals propose worlds, leads, features);
// the creator's settings override any of it. A settings reference to a
// household/photo/lot that no longer exists is silently dropped — re-sync can
// remove any of them, and "not chosen any more" is the correct degradation.

import { compareWorldsCanonical, WORLD_PACK_NAMES, isLotVisible } from '../../data/worlds';
import { WORLD_ICONS } from '../../data/worldIcons';
import { PACKS } from '../../data/packs';
import type {
  ShowcasePayload, ShowcaseSettings, ShowcaseWorldSettings,
  ShowcasePhoto, ShowcaseLot, ShowcaseHousehold, ShowcaseSim, LeadKind, CoverKind,
} from './types';

// The chosen cover, resolved: 'photo' only when a photo actually exists.
// Shared by the page's Hero, the creator band (whose shape depends on the
// hero kind) and the og:image frame the server screenshots — one answer to
// "which cover is this save wearing?", so a social card can never disagree
// with the page it links to.
export function resolveHero(p: ShowcasePayload): { kind: CoverKind; heroPhoto: ShowcasePhoto | null } {
  const cover = p.showcase?.cover;
  // Default cover: the POSTCARD — it always works and it charms. A photo
  // hero is a deliberate pick (best world shot first when they pick it).
  let kind: CoverKind = cover?.kind ?? 'postcard';
  let heroPhoto: ShowcasePhoto | null = null;
  if (kind === 'photo') {
    heroPhoto = (cover?.photoId ? p.photos.find((ph) => ph.id === cover.photoId) ?? null : null)
      ?? p.photos.find((ph) => ph.targetType === 'world')
      ?? p.photos.find((ph) => ph.targetType === 'lot')
      ?? null;
    if (!heroPhoto) kind = 'postcard';
  }
  return { kind, heroPhoto };
}

export interface DerivedHousehold {
  hh: ShowcaseHousehold;
  sims: ShowcaseSim[];
  portraitFilename: string | null; // uploaded thumbnail, or an hh-target photo
  homeLotName: string | null;
  worldName: string | null;
}

export interface WorldLotEntry {
  lot: ShowcaseLot;
  photo: ShowcasePhoto | null;
  resident: DerivedHousehold | null;
  hidden: boolean;   // photographed but hidden by the creator
  featured: boolean;
}

export interface DerivedWorld {
  name: string;
  icon: string | null;
  shown: boolean;
  hiddenReason: 'creator' | 'no-photo' | null;
  lead: LeadKind;
  leadPhoto: ShowcasePhoto | null;   // the world screenshot for lead='photo'
  worldPhotos: ShowcasePhoto[];
  lotPhotos: ShowcasePhoto[];        // one representative photo per photographed lot, creator order
  peek: ShowcasePhoto[];             // front-page thumb row: the featured lots plus enough others to fill it, in lot order
  /** The lot each `peek` photo belongs to, same order — the front row's drag
      reorders the world's lots, so it needs the key. */
  peekKeys: string[];
  photographedLotCount: number;
  households: DerivedHousehold[];
  blurb: string;
  settings: ShowcaseWorldSettings;
  // World-page detail: every visible-type lot of the world, in creator order
  // (photographed first). Selectors below slice it into the page's sections.
  lotEntries: WorldLotEntry[];
}

// ── how much can be featured ───────────────────────────────────────────────
// Hard maximums, not render limits. Featuring used to always succeed and the
// page simply drew the first N, so featuring one more pushed the oldest off
// the bottom and read as "it deleted one of mine". Now the list itself cannot
// exceed these, the add is refused at the ceiling, and what you see is what
// is featured.
export const MAX_FEATURED_HOUSEHOLDS = 12;
export const MAX_FEATURED_LOTS = 6;
/** How many lot photos a front-page chapter shows on its own, before the
    creator features anything. Featuring grows the row past this, to the
    maximum above. */
export const PEEK_AUTO_LOTS = 3;

// World-page sections, from one world's entries:
// featured big cards → the grid (photographed − hidden − featured) →
// "Other lots" (edit only: unphotographed + hidden-by-you rows).
export const worldFeaturedLots = (w: DerivedWorld): WorldLotEntry[] =>
  (w.settings.featuredLots ?? [])
    .map((k) => w.lotEntries.find((e) => e.lot.lotKey === k))
    .filter((e): e is WorldLotEntry => !!e && !!e.photo)
    .slice(0, MAX_FEATURED_LOTS);
export const worldGridLots = (w: DerivedWorld): WorldLotEntry[] =>
  w.lotEntries.filter((e) => e.photo && !e.hidden && !e.featured);
export const worldOtherLots = (w: DerivedWorld): WorldLotEntry[] =>
  w.lotEntries.filter((e) => !e.photo || e.hidden);

// Zero-photo world: the lots section renders as a one-line lot-type count
// stub ("2 residential lots · 1 park") in the section slot, visitors included.
export function worldLotTypeStub(w: DerivedWorld): string {
  const counts = new Map<string, number>();
  for (const e of w.lotEntries) {
    const t = e.lot.customType || e.lot.defaultType;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => {
      const label = /residential/i.test(t) ? 'residential lot' : t.toLowerCase();
      return `${n} ${label}${n > 1 ? 's' : ''}`;
    })
    .join(' · ');
}

// Which section leads on a world page: the per-world pin wins; otherwise the
// SAVE-level rule (build-led saves default lots-first everywhere). A stub
// lots section never leads.
export function worldLotsFirst(w: DerivedWorld, buildLed: boolean): boolean {
  if (worldFeaturedLots(w).length + worldGridLots(w).length === 0) return false;
  if (w.settings.sectionOrder === 'lots') return true;
  if (w.settings.sectionOrder === 'hh') return false;
  return buildLed;
}

// "Residential · 30×20" — the kind line under lot names.
export function lotKindLine(lot: ShowcaseLot): string {
  const size = lot.size && lot.size !== '?' ? lot.size.replace(/x/i, '×') : '';
  const type = lot.customType || lot.defaultType;
  return size ? `${type} · ${size}` : type;
}

export interface DerivedShowcase {
  worlds: DerivedWorld[];        // shown, in creator/tour order
  hiddenWorlds: DerivedWorld[];  // edit-mode band
  featuredHouseholds: DerivedHousehold[]; // front band (capped 12 at render)
  allHouseholds: DerivedHousehold[];
  packNames: string[];           // newest first
  requiredMods: number;
  recommendedMods: number;
  /** households = the creator's OWN (provenance 'yours'), not the whole town. */
  counts: { worlds: number; households: number; lotsBuilt: number };
  buildLed: boolean;             // any world with >3 lot photos → lots lead everywhere by default
  updatedLabel: string | null;   // "updated 3 days ago"
}

const WORLD_ICON = (name: string): string | null =>
  (WORLD_ICONS as Record<string, string>)[name] ?? null;

export function daysAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 60) return `updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `updated ${months} months ago`;
}

export function deriveShowcase(p: ShowcasePayload): DerivedShowcase {
  const s: ShowcaseSettings = p.showcase ?? {};

  // ── index the raw payload ──
  const simsByHh = new Map<string, ShowcaseSim[]>();
  for (const sim of p.sims) {
    if (!sim.householdId) continue;
    const arr = simsByHh.get(sim.householdId) ?? [];
    arr.push(sim);
    simsByHh.set(sim.householdId, arr);
  }

  const lotsByKey = new Map(p.lots.map((l) => [l.lotKey, l]));
  const lotsByWorld = new Map<string, ShowcaseLot[]>();
  for (const l of p.lots) {
    if (!isLotVisible(l.defaultType)) continue;
    const arr = lotsByWorld.get(l.worldName) ?? [];
    arr.push(l);
    lotsByWorld.set(l.worldName, arr);
  }

  const photosByLot = new Map<string, ShowcasePhoto[]>();
  const photosByWorld = new Map<string, ShowcasePhoto[]>();
  const photosByHh = new Map<string, ShowcasePhoto[]>();
  const photosById = new Map<string, ShowcasePhoto>();
  for (const ph of p.photos) {
    photosById.set(ph.id, ph);
    if (!ph.targetType || !ph.targetKey) continue;
    const map = ph.targetType === 'lot' ? photosByLot : ph.targetType === 'world' ? photosByWorld : ph.targetType === 'household' ? photosByHh : null;
    if (!map) continue;
    const arr = map.get(ph.targetKey) ?? [];
    arr.push(ph);
    map.set(ph.targetKey, arr);
  }

  // ── households ──
  const deriveHh = (hh: ShowcaseHousehold): DerivedHousehold => {
    const lot = hh.assignedLotKey ? lotsByKey.get(hh.assignedLotKey) ?? null : null;
    return {
      hh,
      sims: simsByHh.get(hh.id) ?? [],
      portraitFilename: hh.thumbnailFilename ?? photosByHh.get(hh.id)?.[0]?.filename ?? null,
      homeLotName: lot ? (lot.customName || lot.lotName) : null,
      worldName: lot?.worldName ?? null,
    };
  };
  const allHouseholds = p.households.map(deriveHh);
  const hhById = new Map(allHouseholds.map((d) => [d.hh.id, d]));

  // Front band: the creator's ordered list; default = every Yours household
  // WITH a portrait. Capped HERE, so the list is the same everywhere it is
  // read — the front band, the world pages and the editor all agree on what
  // is featured, and a stored list that predates the cap simply loses its
  // tail rather than hiding it.
  const featuredHouseholds = (s.featuredHouseholds
    ? s.featuredHouseholds.map((id) => hhById.get(id)).filter((d): d is DerivedHousehold => !!d)
    : allHouseholds.filter((d) => d.hh.provenance === 'yours' && d.portraitFilename)
  ).slice(0, MAX_FEATURED_HOUSEHOLDS);

  // ── worlds ──
  const disabled = new Set(p.disabledWorlds ?? []);
  const enabledWorldNames = [...lotsByWorld.keys()].filter((w) => !disabled.has(w));

  const hhByLotKey = new Map<string, DerivedHousehold>();
  for (const d of allHouseholds) {
    if (d.hh.assignedLotKey && !hhByLotKey.has(d.hh.assignedLotKey)) hhByLotKey.set(d.hh.assignedLotKey, d);
  }

  const deriveWorld = (name: string): DerivedWorld => {
    const ws: ShowcaseWorldSettings = s.worlds?.[name] ?? {};
    const worldPhotos = photosByWorld.get(name) ?? [];
    const lots = lotsByWorld.get(name) ?? [];
    const hiddenLots = new Set(ws.hiddenLots ?? []);
    const featuredLots = new Set(ws.featuredLots ?? []);

    // Every lot of the world, photographed first, in creator lot order.
    const lotOrderIdx = (k: string) => {
      const i = ws.lotOrder?.indexOf(k) ?? -1;
      return i === -1 ? 1e9 : i;
    };
    const lotEntries: WorldLotEntry[] = [...lots]
      .map((l) => ({
        lot: l,
        photo: photosByLot.get(l.lotKey)?.[0] ?? null,
        resident: hhByLotKey.get(l.lotKey) ?? null,
        hidden: hiddenLots.has(l.lotKey),
        featured: featuredLots.has(l.lotKey),
      }))
      .sort((a, b) =>
        (a.photo ? 0 : 1) - (b.photo ? 0 : 1)
        || lotOrderIdx(a.lot.lotKey) - lotOrderIdx(b.lot.lotKey)
        || a.lot.lotName.localeCompare(b.lot.lotName));

    const photographed = lotEntries.filter((e) => e.photo);
    const lotPhotos = photographed.filter((e) => !e.hidden).map((e) => e.photo!);

    const hasSignal = worldPhotos.length > 0 || lotPhotos.length > 0;
    const shown = ws.shown ?? hasSignal;

    const leadPhoto = (ws.leadPhotoId ? photosById.get(ws.leadPhotoId) : null) ?? worldPhotos[0] ?? null;
    const lead: LeadKind = ws.lead ?? (leadPhoto ? 'photo' : lotPhotos.length >= 2 ? 'collage' : 'map');

    // The front-page thumb row. A world with nothing featured still shows
    // PEEK_AUTO_LOTS of its lot photos, so a chapter is never bare; featuring
    // grows the row one slot at a time up to the maximum. It used to be
    // "featured, OR ELSE the lot photos", so featuring your first lot wiped
    // the other thumbs off the front page — featuring promotes a lot, it
    // never un-shows the rest.
    // Which lots are in the row: everything featured, always, plus enough of
    // the world's other photos to reach the row length. The row is then laid
    // out in the WORLD'S LOT ORDER, not featured-first — so every thumb can
    // be dragged anywhere in the row. (Pinning the featured ones to the front
    // meant a world with a single featured lot had a thumb that could not
    // move at all.) Featuring decides what is IN the row and what gets a big
    // card on the world page; dragging decides the order.
    const shownEntries = photographed.filter((e) => !e.hidden);
    const featuredKeys = new Set(
      (ws.featuredLots ?? [])
        .filter((k) => shownEntries.some((e) => e.lot.lotKey === k))
        .slice(0, MAX_FEATURED_LOTS),
    );
    const rowLength = Math.min(MAX_FEATURED_LOTS, Math.max(PEEK_AUTO_LOTS, featuredKeys.size));
    const fillerKeys = new Set(
      shownEntries
        .filter((e) => !featuredKeys.has(e.lot.lotKey))
        .slice(0, Math.max(0, rowLength - featuredKeys.size))
        .map((e) => e.lot.lotKey),
    );
    // shownEntries is already in lot order, so filtering keeps that order.
    const peekEntries = shownEntries.filter(
      (e) => featuredKeys.has(e.lot.lotKey) || fillerKeys.has(e.lot.lotKey),
    );
    const peek = peekEntries.map((e) => e.photo!);
    const peekKeys = peekEntries.map((e) => e.lot.lotKey);

    const households = allHouseholds.filter((d) => d.worldName === name);

    return {
      name,
      icon: WORLD_ICON(name),
      shown,
      hiddenReason: shown ? null : (ws.shown === false ? 'creator' : 'no-photo'),
      lead,
      leadPhoto,
      worldPhotos,
      lotPhotos,
      peek,
      peekKeys,
      photographedLotCount: lotPhotos.length, // shown lots only — hidden ones don't count on stats
      households,
      blurb: p.worldBlurbs?.[name] ?? '',
      settings: ws,
      lotEntries,
    };
  };

  const derived = enabledWorldNames.map(deriveWorld);
  const shownWorlds = derived.filter((w) => w.shown);
  const hiddenWorlds = derived.filter((w) => !w.shown).sort((a, b) => compareWorldsCanonical(a.name, b.name));

  // Tour order: creator drag order first, any newly-shown worlds appended in
  // release order (a world that re-shows itself lands at its canonical spot).
  const order = s.worldOrder ?? [];
  shownWorlds.sort((a, b) => {
    const ai = order.indexOf(a.name); const bi = order.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return compareWorldsCanonical(a.name, b.name);
  });

  // ── packs (newest first) ── per-save detection when the save has synced
  // since the column existed; otherwise the worlds present prove their packs.
  const packIdx = new Map(PACKS.map((pk, i) => [pk.id, i]));
  let packNames: string[];
  if (p.detectedPacks?.length) {
    packNames = p.detectedPacks
      .filter((id) => id !== 'base' && packIdx.has(id))
      .sort((a, b) => packIdx.get(b)! - packIdx.get(a)!)
      .map((id) => PACKS[packIdx.get(id)!].name);
  } else {
    const names = new Set<string>();
    for (const w of enabledWorldNames) {
      const pack = (WORLD_PACK_NAMES as Record<string, string>)[w];
      if (pack && pack !== 'Base Game') names.add(pack);
    }
    const byName = new Map(PACKS.map((pk, i) => [pk.name, i]));
    packNames = [...names].sort((a, b) => (byName.get(b) ?? 0) - (byName.get(a) ?? 0));
  }

  const lotsBuilt = derived.reduce((n, w) => n + w.photographedLotCount, 0);
  const buildLed = derived.some((w) => w.lotPhotos.length > 3);

  // The save-level household stat counts what the creator MADE — the
  // planner's "Yours" split — not the ~190 EA premades and townies every
  // full save carries (that number said nothing about any particular save).
  // Per-world counts stay the full roster: they describe the resident list
  // the world page actually shows, kept premades included.
  const yoursHouseholds = allHouseholds.filter((d) => d.hh.provenance === 'yours').length;

  return {
    worlds: shownWorlds,
    hiddenWorlds,
    featuredHouseholds,
    allHouseholds,
    packNames,
    requiredMods: p.mods.filter((m) => m.importance === 'required').length,
    recommendedMods: p.mods.filter((m) => m.importance !== 'required').length,
    counts: { worlds: shownWorlds.length, households: yoursHouseholds, lotsBuilt },
    buildLed,
    updatedLabel: daysAgoLabel(p.lastSyncedAt),
  };
}

// "young adult" / "cat" — the little line under a sim's name.
export const stageLabel = (sim: ShowcaseSim): string => {
  if (sim.species !== 'human') return sim.petSubtype || sim.species;
  return sim.lifestage.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
};

export const initials = (name: string): string =>
  name.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Title auto-fit: the STARTING size, by name length (the first four steps are
// the approved ramp, proven across 5–46 char names in the covers round — do
// not retune them). Past 46 the ramp keeps going so an essay of a name starts
// near its final size; Covers.tsx then measures and shrinks until it fits.
export const postcardTitleSize = (n: string): number =>
  n.length <= 8 ? 11 : n.length <= 15 ? 8.8 : n.length <= 22 ? 6.8 : n.length <= 46 ? 4.6
    : n.length <= 70 ? 3.4 : n.length <= 110 ? 2.6 : 2;
export const posterTitleSize = (n: string): number =>
  n.length <= 8 ? 8.6 : n.length <= 15 ? 6.8 : n.length <= 22 ? 5.4 : n.length <= 46 ? 4
    : n.length <= 70 ? 3 : n.length <= 110 ? 2.3 : 1.8;
