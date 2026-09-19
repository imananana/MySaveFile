import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, MagnifyingGlass } from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import { WORLDS_SORTED_BY_RELEASE, getLotCategory, maxHouseholdsForLot } from '../../data/worlds';
import { useEscapeToClose } from '../common/useEscapeToClose';

export function LotPickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (lotKey: string) => void }) {
  useEscapeToClose(onClose);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const disabledSet = new Set(disabledWorlds);
    const result: Record<string, typeof lots[string][]> = {};
    for (const lot of Object.values(lots)) {
      if (getLotCategory(lot.customType) !== 'home') continue;
      // Hide lots that are full. Residential Rentals hold several households;
      // every other home type holds one.
      if (lot.householdIds.length >= maxHouseholdsForLot(lot.customType)) continue;
      if (disabledSet.has(lot.worldName)) continue;  // skip lots in switched-off worlds
      if (q && !lot.customName.toLowerCase().includes(q) && !lot.worldName.toLowerCase().includes(q)) continue;
      if (!result[lot.worldName]) result[lot.worldName] = [];
      result[lot.worldName].push(lot);
    }
    for (const world of Object.keys(result)) {
      result[world].sort((a, b) => a.customName.localeCompare(b.customName));
    }
    return result;
  }, [lots, search, disabledWorlds]);

  // Portal to <body>: the Households workspace wraps Col1/Col2 in an <aside>
  // with a transform (mobile drawer), which would otherwise scope this fixed
  // overlay to that box instead of the full viewport (partial-screen scrim bug).
  return createPortal(
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-[10px] w-full max-w-[480px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <span className="text-sm text-c-text">Assign to Lot</span>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text cursor-pointer w-7 h-7 flex items-center justify-center"><X size={18} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search lots or worlds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).sort(([a], [b]) => {
            const ai = WORLDS_SORTED_BY_RELEASE.indexOf(a as never);
            const bi = WORLDS_SORTED_BY_RELEASE.indexOf(b as never);
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          }).map(([world, worldLots]) => (
            <div key={world}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">
                {world}
              </div>
              {worldLots.map((lot) => {
                const cap = maxHouseholdsForLot(lot.customType);
                return (
                  <button
                    key={lot.lotKey}
                    onClick={() => { onSelect(lot.lotKey); onClose(); }}
                    className="w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left hover:bg-c-accent-soft transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="text-xs text-c-text truncate">{lot.customName}</span>
                    {cap > 1 && (
                      <span className="text-[10px] text-c-secondary bg-c-secondary-soft px-[6px] py-px rounded shrink-0">
                        {lot.householdIds.length}/{cap} units
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                <MagnifyingGlass size={18} weight="duotone" />
              </div>
              <p className="text-xs font-semibold text-c-text">No lots available</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
