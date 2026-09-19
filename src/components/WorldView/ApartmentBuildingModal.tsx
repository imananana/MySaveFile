import { X, CaretRight } from '@phosphor-icons/react';
import type { PlannedLot, LotStatus } from '../../types';
import { getBuildingName } from '../../data/worlds';
import { Pill } from '../common/Pill';
import { useEscapeToClose } from '../common/useEscapeToClose';

// Status dots/labels match the lot-tile status language (built green, planned
// plum, unplanned neutral).
const STATUS_COLOR: Record<LotStatus, string> = {
  unplanned: '#a89e8f',
  planned: '#7c5cbf',
  built: '#16a34a',
};

const STATUS_LABEL: Record<LotStatus, string> = {
  unplanned: 'Unplanned',
  planned: 'Planned',
  built: 'Built',
};

interface Props {
  lots: PlannedLot[];
  onSelectLot: (lot: PlannedLot) => void;
  onClose: () => void;
}

export function ApartmentBuildingModal({ lots, onSelectLot, onClose }: Props) {
  useEscapeToClose(onClose);
  const buildingName = lots.length > 0 ? getBuildingName(lots[0].name) : '';

  return (
    <div
      /* Deliberately BELOW LotEditModal (z-200). Picking a unit opens the lot
         editor on top and leaves this list mounted underneath, so closing the
         editor drops you back into the building rather than out to the map —
         which is what you want when you're working through several units.
         That was already the behaviour, but only because this component
         happens to appear earlier in WorldView's JSX than the lot editor;
         both sat at z-200 and equal z means paint order decides. Reordering
         the JSX would have silently hidden the editor behind this list. */
      className="fixed inset-0 bg-black/75 z-[190] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[440px] max-h-[80vh] overflow-y-auto p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-2xs font-bold text-c-dim uppercase tracking-label mb-1">
              Apartment Building
            </div>
            <h2 className="text-lg font-bold text-c-text tracking-headline m-0 leading-tight break-words">
              {buildingName}
            </h2>
            <p className="text-xs text-c-dim mt-1 m-0">Select a unit to view or edit.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 w-8 h-8 flex items-center justify-center rounded-lg text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent border-none cursor-pointer transition-colors"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Unit list */}
        <div className="flex flex-col gap-1.5">
          {lots.map((lot) => {
            const unitId = lot.name.match(/^(\S+)/)?.[1] ?? lot.name;
            const status = lot.status ?? 'unplanned';
            const statusColor = STATUS_COLOR[status];
            const householdCount = lot.householdIds?.length ?? 0;
            const customName = lot.customName !== lot.name ? lot.customName : '';

            return (
              <button
                key={lot.lotKey}
                onClick={() => onSelectLot(lot)}
                className="flex items-center gap-3 px-3.5 py-2.5 bg-c-base border border-c-border rounded-lg cursor-pointer text-left w-full transition-colors hover:bg-c-panel hover:border-c-border-mid"
              >
                {/* Status dot */}
                <span
                  style={{ background: statusColor }}
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                />

                {/* Unit number */}
                <span className="text-sm font-semibold text-c-text tabular-nums shrink-0 min-w-[28px]">
                  {unitId}
                </span>

                {/* Custom name (when renamed) */}
                <span className="text-xs text-c-dim flex-1 min-w-0 truncate">
                  {customName}
                </span>

                {/* Occupancy */}
                {householdCount > 0 && (
                  <Pill tone="green">
                    {householdCount} household{householdCount === 1 ? '' : 's'}
                  </Pill>
                )}

                {/* Status label */}
                <span style={{ color: statusColor }} className="text-2xs font-bold uppercase tracking-label shrink-0">
                  {STATUS_LABEL[status]}
                </span>

                <CaretRight size={14} weight="bold" className="text-c-faint shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
