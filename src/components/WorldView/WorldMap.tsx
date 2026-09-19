import { useState, useRef, useMemo } from 'react';
import { useSaveFile } from '../../store/useSaveFile';
import { getBuildingName, HIDDEN_LOT_TYPES } from '../../data/worlds';
import { LOT_PINS, DEV_CLICK_LOGGING } from '../../data/lotPins';
import { getLotIconSrc } from '../../data/lotIcons';
import type { WorldName } from '../../data/worlds';
import type { PlannedLot } from '../../types';

// ─── Pin type system ──────────────────────────────────────────────────────────

type PinType = 'residential' | 'residential-rental' | 'apartment' | 'rental' | 'venue';

function getPinType(type: string): PinType {
  if (type === 'Residential' || type === 'Haunted House' || type === 'Tiny Home Residential') return 'residential';
  if (type === 'Residential Rental') return 'residential-rental';
  if (type === 'Apartment') return 'apartment';
  if (type === 'Rental' || type === 'Vacation Rental') return 'rental';
  return 'venue';
}

// ─── Map image path ───────────────────────────────────────────────────────────

function mapImagePath(worldName: string): string {
  return `/maps/${worldName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.webp`;
}

// ─── Occupancy helpers ────────────────────────────────────────────────────────

// 'occupied' = single-unit home with household; 'partial' = multi-unit with some filled; 'full' = all units filled
type OccupancyState = 'none' | 'occupied' | 'partial' | 'full';

function getOccupancy(pinType: PinType, lot: PlannedLot, buildingLots: PlannedLot[]): OccupancyState {
  if (pinType === 'venue') return 'none';
  if (pinType === 'residential') {
    return lot.householdIds.length > 0 ? 'occupied' : 'none';
  }
  if (pinType === 'apartment') {
    const filled = buildingLots.filter((l) => l.householdIds.length > 0).length;
    if (filled === 0) return 'none';
    return filled === buildingLots.length ? 'full' : 'partial';
  }
  if (pinType === 'residential-rental') {
    if (lot.householdIds.length === 0) return 'none';
    return lot.householdIds.length >= 6 ? 'full' : 'partial';
  }
  // rental: any household = partial
  return lot.householdIds.length > 0 ? 'partial' : 'none';
}

function isOccupiable(pinType: PinType): boolean {
  return pinType !== 'venue';
}

// ─── Tooltip content ──────────────────────────────────────────────────────────

function occupancyLabel(pinType: PinType, lot: PlannedLot, buildingLots: PlannedLot[], households: Record<string, { name: string }>): string {
  if (pinType === 'venue') return '';
  if (pinType === 'apartment') {
    const occupied = buildingLots.filter((l) => l.householdIds.length > 0).length;
    return `${occupied} / ${buildingLots.length} units occupied`;
  }
  const n = lot.householdIds.length;
  if (n === 0) return 'Unoccupied';
  // Multi-unit rentals hold several households — show the count, not a name list
  // (the names just overflow the tooltip).
  if (pinType === 'residential-rental' || pinType === 'rental') {
    return `${n} household${n === 1 ? '' : 's'}`;
  }
  const names = lot.householdIds.map((id) => households[id]?.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Occupied';
}

// ─── MapPin component ─────────────────────────────────────────────────────────

interface PinProps {
  lot: PlannedLot;
  buildingLots: PlannedLot[];
  displayName: string;
  x: number;
  y: number;
  onEdit: () => void;
}

function MapPin({ lot, buildingLots, displayName, x, y, onEdit }: PinProps) {
  const [hovered, setHovered] = useState(false);
  const households = useSaveFile((s) => s.households);

  const lotType = HIDDEN_LOT_TYPES.has(lot.defaultType) ? lot.defaultType : (lot.customType || lot.defaultType);
  const pinType = getPinType(lotType);
  const iconSrc = getLotIconSrc(lotType);
  const occupancy = getOccupancy(pinType, lot, buildingLots);
  // Household count for the occupancy indicator. Apartments aggregate across
  // their unit sub-lots; everything else uses the pin's own householdIds.
  const occupancyCountRaw = pinType === 'apartment'
    ? buildingLots.filter((l) => l.householdIds.length > 0).length
    : lot.householdIds.length;
  const occupancyDisplay = occupancyCountRaw > 9 ? '9+' : String(occupancyCountRaw);
  const occLabel = occupancyLabel(pinType, lot, buildingLots, households);
  const showOccupancyDot = isOccupiable(pinType) && occupancy !== 'none';
  const displayType = lot.customType || lot.defaultType;
  const showSize = displayType !== 'Apartment';
  const occupancyRowLabel = pinType === 'residential' ? 'Household' : pinType === 'apartment' ? 'Units' : 'Occupancy';

  // Category color is gone from the map — the tiles below carry plan status and
  // the royal-blue game icon already names the lot type. So the pin is a plain
  // white disc (max contrast for the blue icon) with a compact 2.5px ring in the
  // icon's own #0949ab (softened to ~0.68 over the white so it reads as a marker
  // edge, not a hard line) + a thin white edge and drop shadow for legibility on
  // busy map art. Occupancy is the only lively signal.
  const pinShadow = [
    '0 0 0 1.5px rgba(255,255,255,0.95)',
    hovered ? '0 0 0 4.5px rgba(255,255,255,0.5)' : null,
    hovered ? '0 3px 10px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.35)',
  ].filter(Boolean).join(', ');

  // Flip the tooltip below the pin when the pin sits high on the map, so it never
  // runs off the top edge. (The map no longer clips, but this keeps it tidy.)
  const tooltipBelow = y < 32;

  return (
    <div
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${hovered ? 'z-20' : 'z-10'}`}
    >
      {/* Tooltip */}
      {hovered && (
        <div className={`absolute ${tooltipBelow ? 'top-[calc(100%+10px)]' : 'bottom-[calc(100%+10px)]'} left-1/2 -translate-x-1/2 bg-white border border-c-border shadow-lg rounded-lg px-3 py-2.5 min-w-[160px] max-w-[240px] pointer-events-none z-30`}>
          <div className="text-xs font-semibold text-c-text leading-snug">{displayName}</div>
          <div className="text-[10px] font-bold uppercase tracking-label text-c-dim mt-0.5">{displayType}</div>
          {(showSize || (isOccupiable(pinType) && occLabel)) && (
            <div className="mt-2 pt-2 border-t border-c-border flex flex-col gap-1">
              {showSize && (
                <div className="flex items-center justify-between gap-4 text-[10.5px]">
                  <span className="text-c-dim">Lot size</span>
                  <span className="font-bold text-c-text tabular-nums">{lot.size}</span>
                </div>
              )}
              {isOccupiable(pinType) && occLabel && (
                <div className="flex items-start justify-between gap-4 text-[10.5px]">
                  <span className="text-c-dim shrink-0">{occupancyRowLabel}</span>
                  <span className="font-medium text-c-muted text-right">{occLabel}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pin button — plain white disc, royal-blue game icon centered. */}
      <button
        onClick={onEdit}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`${displayName} — ${displayType}`}
        style={{ borderColor: 'rgba(9,73,171,0.68)', boxShadow: pinShadow }}
        className="relative w-[38px] h-[38px] rounded-full cursor-pointer flex items-center justify-center p-0 transition-all duration-150 border-[2.5px] bg-white"
      >
        {iconSrc && <img src={iconSrc} alt="" className="w-[21px] h-[21px] object-contain" />}
        {/* Occupancy indicator — residential pins with at least one household.
            Neutral-dark chip (green now reads as "built" on the tiles). Shows the
            household count; apartments aggregate across their unit sub-lots. */}
        {showOccupancyDot && (
          <span
            className="absolute -bottom-[3px] -right-[3px] min-w-[15px] h-[15px] px-[3px] rounded-full border-2 border-white flex items-center justify-center text-white"
            style={{ background: '#1a1714', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
            aria-hidden="true"
          >
            <span className="text-[8.5px] font-bold leading-none tabular-nums">{occupancyDisplay}</span>
          </span>
        )}
      </button>
    </div>
  );
}

// ─── WorldMap component ───────────────────────────────────────────────────────

interface WorldMapProps {
  worldName: WorldName;
  lots: PlannedLot[];
  onEditLot: (lots: PlannedLot[]) => void;
}

export function WorldMap({ worldName, lots, onEditLot }: WorldMapProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgError, setImgError] = useState(false);
  const lots_ = useSaveFile((s) => s.lots);

  const pinData = LOT_PINS[worldName];
  const imagePath = mapImagePath(worldName);

  const pinItems = useMemo(() => {
    const buildingOrder: string[] = [];
    const buildingMap = new Map<string, PlannedLot[]>();
    const singles: { lot: PlannedLot; pinKey: string; displayName: string; buildingLots: PlannedLot[] }[] = [];

    for (const lot of lots) {
      if (lot.defaultType === 'Apartment') {
        const building = getBuildingName(lot.name);
        if (!buildingMap.has(building)) {
          buildingOrder.push(building);
          buildingMap.set(building, []);
        }
        buildingMap.get(building)!.push(lot);
      } else {
        singles.push({ lot, pinKey: lot.name, displayName: lot.customName, buildingLots: [lot] });
      }
    }

    const apartmentItems = buildingOrder.map((building) => {
      const bLots = buildingMap.get(building)!;
      return { lot: bLots[0], pinKey: building, displayName: building, buildingLots: bLots };
    });

    return [...singles, ...apartmentItems];
  }, [lots]);

  function handleMapClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!DEV_CLICK_LOGGING) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    console.log(`[MapPin] { x: ${x.toFixed(1)}, y: ${y.toFixed(1)} }`);
  }

  return (
    <div>
      {DEV_CLICK_LOGGING && (
        <div className="relative overflow-hidden bg-c-card border border-c-border rounded-md px-3 py-[6px] mb-3 text-[11px] text-c-muted">
          <span className="absolute left-0 inset-y-0 w-[3px] bg-c-gold" aria-hidden />
          Dev mode: click the map to log pin coordinates to the console.
        </div>
      )}

      {imgError ? (
        <div className="bg-c-card border border-c-border rounded-lg p-10 text-center text-c-faint text-[13px]">
          Map image not found for <span className="text-c-green">{worldName}</span>.
          <br />
          <span className="text-[11px] mt-2 block">
            Place the image at <code className="text-c-muted">{imagePath}</code>
          </span>
        </div>
      ) : (
        // No overflow-hidden on this wrapper: pin tooltips must be able to spill
        // past the map edges without being clipped, so the rounding/border/shadow
        // live on the <img> itself rather than a clipping container.
        <div className="relative w-full">
          <img
            ref={imgRef}
            src={imagePath}
            alt={`${worldName} map`}
            onError={() => setImgError(true)}
            onClick={handleMapClick}
            draggable={false}
            className={`w-full block select-none rounded-xl border border-c-border shadow-lg ${DEV_CLICK_LOGGING ? 'cursor-crosshair' : 'cursor-default'}`}
          />

          {/* Depth-sort by y so lower pins (closer to the viewer in the isometric
              art) paint on top of higher ones — e.g. a library in front of a
              club sitting just above it. Hover still lifts any pin via z-index. */}
          {pinItems
            .map((item) => ({ item, coords: pinData?.[item.pinKey] }))
            .filter((x) => !!x.coords)
            .sort((a, b) => a.coords!.y - b.coords!.y)
            .map(({ item, coords }) => {
              const { lot, pinKey, displayName, buildingLots } = item;
              const c = coords!;
              const liveLot = lots_[lot.lotKey] ?? lot;
              const liveBuildingLots = buildingLots.map((l) => lots_[l.lotKey] ?? l);
              return (
                <MapPin
                  key={pinKey}
                  lot={liveLot}
                  buildingLots={liveBuildingLots}
                  displayName={displayName}
                  x={c.x}
                  y={c.y}
                  onEdit={() => onEditLot(liveBuildingLots)}
                />
              );
            })}

          {!pinData && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 shadow-sm border border-c-border rounded-md px-[14px] py-[6px] text-[11px] text-c-dim whitespace-nowrap">
              Pin positions not yet configured for this world.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
