import type { PlannedLot, LotStatus, Photo } from '../../types';
import { useSaveFile } from '../../store/useSaveFile';
import { HIDDEN_LOT_TYPES } from '../../data/worlds';
import { getLotIconSrc } from '../../data/lotIcons';
import { api } from '../../lib/api';
import { Tooltip } from '../common/Tooltip';

// Plan status is the tile's headline (the map carries category + occupancy).
// The whole card tints by status so a neighborhood reads as a build-progress
// heatmap; a white header strip states the status word explicitly. Unplanned
// stays a clean white card (no tint = nothing done yet). Greens are softened
// (#c9e4d0, not the neon #bbf7d0) to match the purple's calm.
const STATUS: Record<LotStatus, { label: string; bg: string; border: string; dot: string; text: string }> = {
  unplanned: { label: 'Unplanned', bg: '#ffffff', border: '#e8e1d4', dot: '#a89e8f', text: '#7a7268' },
  planned:   { label: 'Planned',   bg: '#f3eefb', border: '#d6c5f0', dot: '#7c5cbf', text: '#6b46c1' },
  built:     { label: 'Built',     bg: '#ecfdf3', border: '#c9e4d0', dot: '#16a34a', text: '#15803d' },
};

interface LotCardProps {
  lot: PlannedLot;
  onEdit: () => void;
  coverPhoto?: Photo;
}

export function LotCard({ lot, onEdit, coverPhoto }: LotCardProps) {
  const clubs = useSaveFile((s) => s.clubs);
  const smallBusinesses = useSaveFile((s) => s.smallBusinesses);
  const customVenues = useSaveFile((s) => s.customVenues);

  const s = STATUS[lot.status];
  const iconType = HIDDEN_LOT_TYPES.has(lot.defaultType) ? lot.defaultType : lot.customType;
  const iconSrc = getLotIconSrc(iconType);
  // Apartment units share the building footprint — their per-unit "size" isn't a
  // meaningful, plannable lot dimension, so we hide the size chip for them (only
  // the type where this is true).
  const showSize = lot.customType !== 'Apartment';

  const assignedClubs = (lot.clubIds ?? [])
    .map((id) => clubs[id])
    .filter(Boolean);

  // `lot.hasSmallBusiness` is unreliable — read the assignment fresh from the
  // SmallBusinesses table so the indicator dot and name reflect actual state.
  const attachedSB = Object.values(smallBusinesses).find((sb) => sb.assignedLotKeys.includes(lot.lotKey));
  const hasSmallBusiness = !!attachedSB;
  const showSBMark = hasSmallBusiness && lot.customType !== 'Small Business Venue';

  // Only ever shown on a lot the type says is a venue — a venue lot IS the
  // "Custom Venue" type, so anything else can't be running a schedule.
  const attachedVenue = lot.customType === 'Custom Venue'
    ? Object.values(customVenues).find((cv) => cv.lotKey === lot.lotKey)
    : undefined;

  // Occupancy lives on the map (pin badge + hover); the tile stays focused on
  // plan status, so the meta line is just the lot type.
  const metaText = lot.customType;

  return (
    <div
      onClick={onEdit}
      style={{ background: s.bg, borderColor: s.border }}
      className="border rounded-xl shadow-sm overflow-hidden flex flex-col cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-px"
    >
      {/* Status header — white strip stating the plan status (set in the editor) */}
      <div
        style={{ color: s.text }}
        className="flex items-center gap-1.5 h-[26px] px-3 bg-white border-b border-c-border text-2xs font-bold uppercase tracking-label"
      >
        <span style={{ background: s.dot }} className="w-[7px] h-[7px] rounded-full shrink-0" />
        {STATUS[lot.status].label}
      </div>

      {/* Cover photo — inset/framed by the tint so it stays the star */}
      {coverPhoto && (
        <div className="mx-2 mt-2 h-28 rounded-lg overflow-hidden">
          <img
            src={api.photoUrl(coverPhoto.filename, 320)}
            alt={coverPhoto.caption || lot.customName}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-3.5 py-3 flex flex-col gap-1">
        {/* Name row — icon, name, and the immutable lot size as the headline fact */}
        <div className="flex items-center gap-2.5">
          {iconSrc && (
            <div className="relative shrink-0">
              <img src={iconSrc} alt="" className="w-7 h-7 object-contain" />
              {showSBMark && (
                <div className="absolute -bottom-[2px] -right-[2px]">
                  <Tooltip text="Includes Small Business">
                    <div className="w-[10px] h-[10px] rounded-full bg-c-secondary border-2 border-white" />
                  </Tooltip>
                </div>
              )}
            </div>
          )}
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-c-text leading-snug tracking-headline">
            {lot.customName}
          </span>
          {showSize && (
            <span className="shrink-0 text-xs font-bold text-c-text tabular-nums bg-white/70 border border-c-border rounded-md px-2 py-0.5">
              {lot.size}
            </span>
          )}
        </div>

        {/* Type · household */}
        <div className="text-xs text-c-dim">{metaText}</div>

        {showSBMark && attachedSB?.name && (
          <div className="text-2xs text-c-faint truncate">Business: {attachedSB.name}</div>
        )}
        {assignedClubs.length > 0 && (
          <div className="text-2xs text-c-faint truncate">
            Club{assignedClubs.length > 1 ? 's' : ''}: {assignedClubs.map((c) => c.name).join(', ')}
          </div>
        )}
        {/* The type already reads "Custom Venue", so the tile only adds the
            venue's own name — and only when it has one worth reading. */}
        {attachedVenue?.name && (
          <div className="text-2xs text-c-faint truncate">Venue: {attachedVenue.name}</div>
        )}
      </div>
    </div>
  );
}
