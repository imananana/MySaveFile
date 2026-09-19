import { X } from '@phosphor-icons/react';
import { CLUB_ICONS } from '../../data/clubIcons';
import { HOLIDAY_ICONS } from '../../data/holidayIcons';
import { SMALL_BUSINESS_ICONS } from '../../data/smallBusinessIcons';
import { useEscapeToClose } from '../common/useEscapeToClose';

interface IconPickerProps {
  iconSet: 'small-business' | 'club' | 'holiday';
  value: string;
  onChange: (icon: string) => void;
}

// All icon sets are explicit lists of ResourceKey instance hexes, matching the
// filenames in /public/<folder>/<hex>.png. A save's stored ResourceKey instance
// for a club/holiday/business maps directly to a file with no lookup table.
const ICON_CONFIG: Record<string, { folder: string; icons: readonly string[] }> = {
  'small-business': { folder: 'small-business-icons', icons: SMALL_BUSINESS_ICONS },
  'club':           { folder: 'club-icons',           icons: CLUB_ICONS },
  'holiday':        { folder: 'holiday-icons',        icons: HOLIDAY_ICONS },
};

export function IconPicker({ iconSet, value, onChange }: IconPickerProps) {
  const { folder, icons } = ICON_CONFIG[iconSet];

  return (
    <div className="flex flex-wrap gap-[6px]">
      {/* None tile */}
      <button
        type="button"
        onClick={() => onChange('')}
        className={`w-14 h-14 rounded-md border flex items-center justify-center text-[10px] text-c-faint cursor-pointer ${
          value === ''
            ? 'border-c-accent bg-c-accent-soft ring-1 ring-c-accent'
            : 'border-c-border bg-c-card'
        }`}
      >
        None
      </button>
      {icons.map((icon) => {
        const selected = value === icon;
        return (
          <button
            key={icon}
            type="button"
            onClick={() => onChange(icon)}
            className={`w-14 h-14 rounded-md border flex items-center justify-center p-[4px] cursor-pointer overflow-hidden ${
              selected
                ? 'border-c-accent bg-c-accent-soft ring-1 ring-c-accent'
                : 'border-c-border bg-c-card hover:border-c-dim'
            }`}
          >
            <img
              src={`/${folder}/${icon}.png`}
              alt=""
              className="w-full h-full object-contain"
            />
          </button>
        );
      })}
    </div>
  );
}

// Pop-out wrapper — the icon grid takes a lot of vertical space inline, so the
// editors open it in a modal (matching the catalog + dynasty pickers). Picking
// an icon applies it and closes; the backdrop closes without changing anything.
export function IconPickerModal({ iconSet, value, onChange, onClose }: IconPickerProps & { onClose: () => void }) {
  useEscapeToClose(onClose);
  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Choose an icon</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5 bg-c-base">
          <IconPicker iconSet={iconSet} value={value} onChange={(icon) => { onChange(icon); onClose(); }} />
        </div>
      </div>
    </div>
  );
}
