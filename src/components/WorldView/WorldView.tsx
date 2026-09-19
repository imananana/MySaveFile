import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Images, EyeSlash, Eye, CaretDown } from '@phosphor-icons/react';
import { useSaveFile, getLotsByWorld } from '../../store/useSaveFile';
import { api } from '../../lib/api';
import type { Photo } from '../../types';
import { WORLDS_DATA, WORLD_PACK_NAMES, isLotVisible, neighborhoodLabel } from '../../data/worlds';
import type { WorldName } from '../../data/worlds';
import { RELEASE_TO_PACK } from '../../data/packs';
import { PackNotOwnedBanner } from '../common/PackNotOwnedBanner';
import { WarnCallout } from '../common/WarnCallout';
import { btn } from '../common/btn';
import { WORLD_ICONS } from '../../data/worldIcons';
import { LotCard } from './LotCard';
import { LotEditModal } from './LotEditModal';
import { ApartmentBuildingModal } from './ApartmentBuildingModal';
import { WorldMap } from './WorldMap';
import type { PlannedLot } from '../../types';
import { Pill } from '../common/Pill';

// Map a referrer pathname (e.g. ".../households") to a friendly back-link label.
// When undefined / unrecognized, callers fall back to "Home".
function referrerLabel(pathname: string | undefined): string | null {
  if (!pathname) return null;
  if (pathname.endsWith('/households')) return 'Households';
  if (pathname.endsWith('/sims'))        return 'Sims';
  if (pathname.endsWith('/clubs'))       return 'Clubs';
  if (pathname.endsWith('/holidays'))    return 'Holidays';
  if (pathname.endsWith('/small-businesses')) return 'Small Businesses';
  if (pathname.endsWith('/custom-venues'))    return 'Custom Venues';
  return null;
}

export function WorldView() {
  const { worldName: encodedName } = useParams<{ worldName: string }>();
  const worldName = decodeURIComponent(encodedName ?? '') as WorldName;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [editingLot, setEditingLot] = useState<PlannedLot | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<PlannedLot[] | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);

  function handleEditLots(lotsArg: PlannedLot[]) {
    if (lotsArg.length === 1) {
      setEditingLot(lotsArg[0]);
    } else {
      setEditingBuilding(lotsArg);
    }
  }

  const saveFileId = useSaveFile((s) => s.saveFileId);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const toggleWorldDisabled = useSaveFile((s) => s.toggleWorldDisabled);
  const worldLots = useMemo(() => getLotsByWorld(lots, worldName), [lots, worldName]);
  const isDisabled = disabledWorlds.includes(worldName);

  const [coverPhotos, setCoverPhotos] = useState<Map<string, Photo>>(new Map());

  function refreshCoverPhotos() {
    if (!saveFileId) return;
    api.listBuiltLotPhotos(saveFileId).then((photos) => {
      const map = new Map<string, Photo>();
      for (const p of photos) {
        if (p.target_key && !map.has(p.target_key)) map.set(p.target_key, p);
      }
      setCoverPhotos(map);
    });
  }

  useEffect(() => { refreshCoverPhotos(); }, [saveFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: when ?lot=<lotKey> is in the URL on mount/navigation, auto-open
  // that lot's edit modal. Used by household/club/small-business/custom-venue
  // links so clicking a lot from elsewhere lands you straight in the editor.
  useEffect(() => {
    const lotKey = searchParams.get('lot');
    if (!lotKey) return;
    const lot = lots[lotKey];
    if (!lot || lot.worldName !== worldName) return;
    setEditingLot(lot);
    // Strip the query param so closing the modal doesn't leave it sticky
    const next = new URLSearchParams(searchParams);
    next.delete('lot');
    setSearchParams(next, { replace: true });
  }, [searchParams, lots, worldName, setSearchParams]);

  const worldData = WORLDS_DATA[worldName];

  // Ordered neighborhood sections
  const neighborhoods = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    if (worldData) {
      for (const lot of worldData.lots) {
        if (!isLotVisible(lot.type)) continue;
        const loc = neighborhoodLabel(lot.location);
        if (!seen.has(loc)) { order.push(loc); seen.add(loc); }
      }
    }
    return order;
  }, [worldData]);

  if (!worldData) {
    return (
      <div className="p-10 text-c-dim">
        World not found. <Link to={`/saves/${saveFileId}`} className="text-c-accent">Back to Home</Link>
      </div>
    );
  }

  const worldPackId = RELEASE_TO_PACK[WORLDS_DATA[worldName].release];

  return (
    <>
      {worldPackId && <PackNotOwnedBanner packId={worldPackId} feature={worldName} />}
      {/* A dimmed title was too quiet for a state that changes what the plan
          counts. This is the same slot and the same shape the unowned-pack
          banner uses, because the two are siblings: a page that opens and works
          in full while being outside something. It also says what being off
          actually DOES, which the greying never could. */}
      {isDisabled && (
        <WarnCallout
          className="mx-4 mt-4 -mb-1"
          title={`${worldName} is switched off for this save.`}
          action={
            <button
              onClick={() => toggleWorldDisabled(worldName)}
              className={btn('primary', { size: 'sm', className: 'shrink-0' })}
            >
              <Eye size={12} weight="bold" /> Enable world
            </button>
          }
        />
      )}
    <div className="px-4 sm:px-7 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-4">
        {(() => {
          // Only a *contextual* back-link (when you deep-linked in from a
          // Household/Club/etc.). No generic Home link — the sidebar and the
          // browser back button already cover that, and dropping it condenses
          // the header so the map gets more room.
          const fromPath = (location.state as { from?: string } | null)?.from;
          const label = referrerLabel(fromPath);
          if (!label || !fromPath) return null;
          return (
            <Link
              to={fromPath}
              className="inline-flex items-center gap-1 text-xs text-c-accent hover:text-c-accent-hover no-underline mb-2 transition-colors"
            >
              <ArrowLeft size={12} weight="bold" />
              {label}
            </Link>
          );
        })()}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3.5 sm:flex-1 sm:min-w-0">
            {WORLD_ICONS[worldName] && (
              // Greyed out exactly as Home's tile greys it, so a world that's
              // off looks the same wherever you meet it.
              <img
                src={WORLD_ICONS[worldName]}
                alt=""
                className={`w-16 h-16 object-contain rounded-full shrink-0 ${isDisabled ? 'opacity-40 grayscale' : ''}`}
              />
            )}
            <div className="min-w-0">
              {/* A switched-off world is dimmed, never struck through: a
                  strikethrough reads as deleted or wrong, and this world is
                  neither — it's simply out of this save's plan. The state is
                  said in words below, the way Home's tiles say it. */}
              <h1 className={`text-2xl sm:text-3xl font-bold m-0 leading-tight break-words tracking-headline ${isDisabled ? 'text-c-dim' : 'text-c-text'}`}>
                {worldName}
              </h1>
              <p className="mt-1 text-sm text-c-dim flex items-center gap-1.5 flex-wrap m-0">
                <span>{WORLD_PACK_NAMES[worldName]}</span>
                <span className="text-c-faint" aria-hidden>·</span>
                <span>{worldLots.length} {worldLots.length === 1 ? 'lot' : 'lots'}</span>
                {isDisabled && (
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-label text-c-dim bg-c-panel border border-c-border rounded-md px-1.5 py-0.5">
                    <EyeSlash size={11} weight="duotone" />
                    Disabled
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Inspo is plum and Showcase is green, matching the app's own
              grammar rather than reversing it: plum is your hand — inspo, tags,
              what you're planning — and green is the save and what's BUILT. A
              showcase photo is the thing that moves a lot to Built, so it takes
              the built colour. The world-off toggle stays quiet in both
              directions; the state is said beside the title. */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/saves/${saveFileId}/world/${encodeURIComponent(worldName)}/inspo`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-c-secondary border border-c-secondary-border hover:border-c-secondary bg-c-secondary-soft rounded-lg px-4 py-2.5 transition-colors no-underline"
            >
              <Lightbulb size={16} weight="duotone" />
              Inspo
            </Link>
            <Link
              to={`/saves/${saveFileId}/world/${encodeURIComponent(worldName)}/showcase`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-c-green border border-c-accent-border hover:border-c-accent bg-c-accent-soft rounded-lg px-4 py-2.5 transition-colors no-underline"
            >
              <Images size={16} weight="duotone" />
              Showcase
            </Link>
            {/* Only the "switch it off" direction lives here. Switching it back
                on belongs to the banner above, which is already saying the world
                is off — two Enable buttons on one screen is one too many. */}
            {!isDisabled && (
              <button
                onClick={() => toggleWorldDisabled(worldName)}
                className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2.5 transition-colors cursor-pointer bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel"
              >
                <EyeSlash size={16} weight="bold" />
                <span className="hidden sm:inline">Disable world</span>
                <span className="sm:hidden">Disable</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-base font-bold m-0 tracking-headline text-c-green">Map</h2>
          <div className="flex-1 h-px bg-c-border" />
          <button
            onClick={() => setMapCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer px-0"
          >
            <CaretDown
              size={12}
              weight="bold"
              className={`transition-transform duration-200 ${mapCollapsed ? '' : 'rotate-180'}`}
            />
            {mapCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>
        {!mapCollapsed && (
          <div className="max-w-[1040px] mx-auto">
            <WorldMap worldName={worldName} lots={worldLots} onEditLot={handleEditLots} />
          </div>
        )}
      </div>

      {/* Neighborhood sections */}
      <div className="space-y-8">
        {neighborhoods.map((neighborhood) => {
          const sectionLots = worldLots.filter((l) => neighborhoodLabel(l.location) === neighborhood);
          if (sectionLots.length === 0) return null;
          return (
            <div key={neighborhood}>
              <div className="flex items-center gap-2.5 mb-3">
                <h2 className="text-base font-bold m-0 tracking-headline text-c-secondary">{neighborhood}</h2>
                <Pill tone="purple" caps>
                  {sectionLots.length}
                </Pill>
                <div className="flex-1 h-px bg-c-border" />
              </div>
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start">
                {sectionLots.map((lot) => (
                  <LotCard
                    key={lot.lotKey}
                    lot={lot}
                    onEdit={() => setEditingLot(lot)}
                    coverPhoto={coverPhotos.get(lot.lotKey)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Building unit picker (apartments) */}
      {editingBuilding && (
        <ApartmentBuildingModal
          lots={editingBuilding.map((l) => lots[l.lotKey] ?? l)}
          onSelectLot={setEditingLot}
          onClose={() => setEditingBuilding(null)}
        />
      )}

      {/* Single lot edit modal */}
      {editingLot && (
        <LotEditModal
          lot={lots[editingLot.lotKey] ?? editingLot}
          onClose={() => setEditingLot(null)}
          onPhotoChange={refreshCoverPhotos}
        />
      )}
    </div>
    </>
  );
}
