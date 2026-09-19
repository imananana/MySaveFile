/**
 * Shared Notes / Description fields — one visual language for every entity
 * editor (households, sims, lots, clubs, businesses, dynasties, holidays,
 * custom venues, mods, worlds, the save file).
 *
 *   Notes       → 🔒 lock,  PRIVATE, always editable, planner-only.
 *   Description → 🌐 globe, PUBLIC. Two flavors:
 *       • game-mirror (read-only): shows the save's text, hidden when empty.
 *       • authored (editable): a planner-written public blurb (lots, save, world).
 *
 * Both render inside the same clean white "card" shell as the household panel —
 * no amber sticky-note treatment. The icon + suffix carry the private/public
 * meaning so the wording stays identical everywhere.
 */
import { useState, type ReactNode } from 'react';
import { Lock, GlobeHemisphereWest, CaretDown } from '@phosphor-icons/react';

function Shell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  // `bare` drops the white-card frame so the field sits as a hairline-divided
  // section inside a white column (the Households workspace). Everywhere else
  // keeps the framed card.
  return (
    <div className={bare ? 'border-t border-c-border py-4 space-y-2.5' : 'rounded-xl border border-c-border bg-c-card px-4 py-3.5 space-y-2.5'}>
      {children}
    </div>
  );
}

function Header({ icon, label, suffix, mutedLabel }: { icon: ReactNode; label: string; suffix: string; mutedLabel?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-c-faint flex items-center">{icon}</span>
      <h4 className={`text-[10px] font-bold uppercase tracking-label m-0 ${mutedLabel ? 'text-c-dim' : 'text-c-secondary'}`}>{label}</h4>
      <span className="text-[10px] normal-case tracking-normal text-c-faint font-normal">· {suffix}</span>
    </div>
  );
}

const TEXTAREA =
  'w-full bg-c-base border border-c-border rounded-lg px-3 py-2 text-c-text text-sm resize-y outline-none focus:border-c-accent placeholder:text-c-faint';

/**
 * The shared field body. When `collapsible`, the header row becomes a toggle and
 * the textarea hides until opened — used by the lot editor to keep an empty
 * Description/Notes out of the way. `defaultOpen` seeds it open when the field
 * already has content.
 */
function EditableField({
  icon,
  label,
  suffix,
  value,
  onChange,
  onBlur,
  rows,
  bare,
  collapsible,
  defaultOpen,
  mutedLabel,
}: {
  icon: ReactNode;
  label: string;
  suffix: string;
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  rows: number;
  bare?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  mutedLabel?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);
  return (
    <Shell bare={bare}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer"
        >
          <span className="text-c-faint flex items-center">{icon}</span>
          <h4 className={`text-[10px] font-bold uppercase tracking-label m-0 ${mutedLabel ? 'text-c-dim' : 'text-c-secondary'}`}>{label}</h4>
          <span className="text-[10px] normal-case tracking-normal text-c-faint font-normal">· {suffix}</span>
          <CaretDown size={12} weight="bold" className={`ml-auto text-c-faint transition-transform ${open ? '-rotate-180' : ''}`} />
        </button>
      ) : (
        <Header icon={icon} label={label} suffix={suffix} mutedLabel={mutedLabel} />
      )}
      {open && (
        <textarea
          className={TEXTAREA}
          rows={rows}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlur}
        />
      )}
    </Shell>
  );
}

export function Notes({
  value,
  onChange,
  onBlur,
  rows = 3,
  bare,
  collapsible,
  defaultOpen,
  mutedLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  rows?: number;
  bare?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  mutedLabel?: boolean;
}) {
  return (
    <EditableField
      icon={<Lock size={12} weight="fill" />}
      label="Notes"
      suffix="private"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      rows={rows}
      bare={bare}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      mutedLabel={mutedLabel}
    />
  );
}

/**
 * A game-mirrored description: read-only, hidden entirely when the save has none.
 * Returns null when empty so callers can drop it in unconditionally.
 */
export function MirroredDescription({ value, bare }: { value: string; bare?: boolean }) {
  if (!value) return null;
  return (
    <Shell bare={bare}>
      <Header icon={<GlobeHemisphereWest size={12} weight="fill" />} label="Description" suffix="from save" />
      <p className="text-sm text-c-muted leading-relaxed whitespace-pre-wrap m-0">{value}</p>
    </Shell>
  );
}

/** An authored public description: planner-written (lots, save file, worlds). */
export function AuthoredDescription({
  value,
  onChange,
  onBlur,
  rows = 3,
  collapsible,
  defaultOpen,
  mutedLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  rows?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
  mutedLabel?: boolean;
}) {
  return (
    <EditableField
      icon={<GlobeHemisphereWest size={12} weight="fill" />}
      label="Description"
      suffix="public"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      rows={rows}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      mutedLabel={mutedLabel}
    />
  );
}
