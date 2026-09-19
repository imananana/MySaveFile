import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Plus, Minus, MapPin, Trash, Buildings, MagnifyingGlass, Users, Clock, CaretRight, CaretDown, Tag, Info, Backpack, GearSix, PencilSimple, FloppyDisk, Warning, CardsThree, GlobeHemisphereWest, CalendarBlank, UsersThree, PuzzlePiece } from '@phosphor-icons/react';
import { Notes } from '../components/common/EntityText';
import { OverviewLanding, HeroSplit, StatTile } from '../components/common/OverviewTiles';
import { useNavigate, useParams } from 'react-router-dom';
import { useSaveFile } from '../store/useSaveFile';
import type { PlannedLot } from '../types';
import type { ParsedVenueRole, ParsedVenueSlot, VenueCriterion } from '../lib/parser/types';
import { isLotVisible, compareWorldsCanonical } from '../data/worlds';
import { criterionTypeLabel, criterionValueText } from '../data/venueLabels';
import { STOCK_ACTIVITIES } from '../data/stockActivities';
import { activityIconUrl, criterionValueIcons } from '../data/venueIcons';
import { STOCK_VENUE_PRESETS } from '../data/stockVenuePresets';
import { STOCK_OCCULTS } from '../data/stockOccults';
import { VENUE_KIND_ICON } from '../data/venueIcons';
import { SKILL_CHOICES, TRAIT_CHOICES, CAREER_CHOICES, VENUE_ACTIVITY_CHOICES } from '../data/criteriaCatalogs';
import { Dropdown } from '../components/common/Dropdown';
import { Tooltip } from '../components/common/Tooltip';
import { MasterDetail } from '../components/common/MasterDetail';
import { CatalogPickerModal, RequirementBuilder, RequirementChip, RequirementValuePicker, mergeValues, replaceValues, type ReqOpt, type ReqCategory } from '../components/common/RequirementEditor';
import { EmptyState } from '../components/common/EmptyState';
import { useConfirm } from '../components/common/ConfirmDialog';
import { PackNotOwnedBanner } from '../components/common/PackNotOwnedBanner';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import { Pill } from '../components/common/Pill';
import { useEscapeToClose } from '../components/common/useEscapeToClose';
import { btn, iconBtn } from '../components/common/btn';
import { PlannerPill } from '../components/common/PlannerPill';


// A preset as shown in the library — unifies the three origins (the player's
// imported/planner presets + the Sims-Team stock catalog) behind one shape.
type PresetItem = {
  id: string;
  kind: 'schedule' | 'role';
  name: string;
  data: { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] } | ParsedVenueRole;
  origin: 'stock' | 'import' | 'planner';
};
const PRESET_ORIGIN_LABEL: Record<PresetItem['origin'], string> = {
  stock: 'Maxis', import: 'From save', planner: 'Made in planner',
};

/** Activity tuning id → display name. Anything not in the catalog is a modded /
 *  custom-content activity (often a 64-bit id we can't name) → "Custom activity". */
const activityName = (id: string): string => STOCK_ACTIVITIES[String(id)]?.name ?? 'Custom activity';

/** Drop the planner-only provenance pointer before a role is stored INSIDE a preset
 *  — a preset shouldn't carry a back-reference to another preset. */
const stripRoleProvenance = (r: ParsedVenueRole): ParsedVenueRole => {
  const copy = { ...r };
  delete copy.sourcePresetId;
  return copy;
};

/** "3 roles · 20 sims" — the pair the Roles heading needs. Several sims can fill
 *  one role, so neither number implies the other; every view shows both, rather
 *  than the editor counting roles while the read-only view counted sims. */
function rolesSummary(roles: ParsedVenueRole[]): string {
  const heads = roles.reduce((n, r) => n + (r.simCount || 0), 0);
  return `${roles.length} ${roles.length === 1 ? 'role' : 'roles'} · ${heads} ${heads === 1 ? 'sim' : 'sims'}`;
}

/** 24h hour → "6 AM" / "12 PM" / "11 PM". */
function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

// Lot eligibility. A custom venue can go anywhere except a hidden lot, an
// apartment or a penthouse (you'd bulldoze a rental to build one, so rentals are
// fine) — and never onto a lot somebody lives on, because a venue isn't a home.
//
// Getaways don't appear here at all: a getaway is hosted by a household and
// exists only while you're playing it, so it never takes a lot.
const APARTMENT_TYPES = new Set(['Apartment', 'Penthouse']);

function isLotEligible(lot: PlannedLot): boolean {
  if (lot.location === 'Hidden Lot' || !isLotVisible(lot.defaultType)) return false;
  if (APARTMENT_TYPES.has(lot.customType) || APARTMENT_TYPES.has(lot.defaultType)) return false;
  if (lot.householdIds.length > 0) return false;
  return true;
}

function LotPickerModal({
  onClose,
  onSelect,
  trackedLotKeys,
}: {
  onClose: () => void;
  onSelect: (lotKey: string) => void;
  trackedLotKeys: Set<string>;
}) {
  useEscapeToClose(onClose);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const result: Record<string, PlannedLot[]> = {};
    const disabledSet = new Set(disabledWorlds);
    for (const lot of Object.values(lots)) {
      if (disabledSet.has(lot.worldName)) continue;
      if (trackedLotKeys.has(lot.lotKey)) continue;
      if (!isLotEligible(lot)) continue;
      if (q && !(lot.customName || lot.name).toLowerCase().includes(q) && !lot.worldName.toLowerCase().includes(q)) continue;
      (result[lot.worldName] ??= []).push(lot);
    }
    for (const world of Object.keys(result)) {
      result[world].sort((a, b) => (a.customName || a.name).localeCompare(b.customName || b.name));
    }
    return result;
  }, [lots, disabledWorlds, search, trackedLotKeys]);

  const LotRow = (lot: PlannedLot) => (
    <button
      key={lot.lotKey}
      onClick={() => onSelect(lot.lotKey)}
      className="w-full text-left px-4 py-2.5 border-b border-c-panel hover:bg-c-accent-soft text-sm text-c-text flex justify-between items-center gap-3 cursor-pointer bg-transparent transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{lot.customName || lot.name}</span>
      </span>
      <Pill tone="purple" caps>{lot.customType}</Pill>
    </button>
  );

  const empty = Object.keys(grouped).length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Assign a lot</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search lots or worlds…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {empty && (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                <MagnifyingGlass size={18} weight="duotone" />
              </div>
              <p className="text-xs font-semibold text-c-text">No eligible lots found</p>
            </div>
          )}
          {Object.keys(grouped).sort(compareWorldsCanonical).map((world) => (
            <div key={world}>
              <div className="sticky top-0 bg-c-card px-4 py-2 text-2xs text-c-faint uppercase tracking-label font-semibold border-b border-c-panel">{world}</div>
              {grouped[world].map(LotRow)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Read-only venue display ──────────────────────────────────────────────────

/** An icon asset that hides itself when the file is missing (graceful fallback). */
function IconImg({ src, className }: { src: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
      className={className}
    />
  );
}

/** An activity. Default = icon + name; `iconOnly` = just the icon with the name on
 *  hover (the dense editor surfaces use this to kill label clutter). */
function Activity({ id, className, iconOnly }: { id: string; className?: string; iconOnly?: boolean }) {
  const url = activityIconUrl(id);
  const dim = iconOnly ? 'w-[22px] h-[22px]' : 'w-4 h-4';
  // An activity we can't name came from a mod — its tuning lives in the mod's
  // own package, never in the save, so there is no name to recover. A puzzle
  // piece at full icon size says "a mod put this here" and keeps the row from
  // jogging; the anonymous dot it replaces read as a rendering failure.
  const icon = url
    ? <IconImg src={url} className={`${dim} object-contain shrink-0`} />
    : <PuzzlePiece size={iconOnly ? 20 : 15} weight="duotone" className="text-c-faint shrink-0" />;
  if (iconOnly) {
    return <Tooltip text={activityName(id)}><span className={`inline-flex items-center justify-center ${className ?? ''}`}>{icon}</span></Tooltip>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {icon}
      {activityName(id)}
    </span>
  );
}

/** Two-letter monogram from a role name ("Cat Woman" → "CW", "Greeter" → "GR",
 *  unnamed → "·"). Stable per role, so the same marker appears in the Roles panel
 *  and in the schedule — the eye links slot↔role without spending a color. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Role identity avatar: the monogram in the venue's purple circle. In-palette
 *  (no new colors), distinct, collision-free where names differ. */
function RoleAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-6 h-6 text-2xs' : 'w-8 h-8 text-xs';
  return (
    <span className={`${cls} rounded-full bg-c-secondary-soft text-c-secondary font-bold flex items-center justify-center shrink-0 tracking-tight`}>
      {monogram(name)}
    </span>
  );
}

/** A role's sim headcount — a small people icon + the number (replaces "×N", which
 *  read like a multiplier). Inherits the caller's text color/size. */
function SimCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className ?? ''}`}>
      <Users size={12} weight="fill" className="shrink-0 opacity-90" />{count}
    </span>
  );
}

// ─── Authoring (planner-created venues only) ──────────────────────────────────
// The clock, the role editor, the schedule builder. Reuses the shared criteria
// catalogs (criteriaCatalogs.ts) so the venue role-requirement picker offers the
// same correct sets as clubs/small businesses, plus a venue-context activity set.

const MAX_SIMS = 20;             // in-game cap of 20 sims PER ROLE and PER TIME SLOT
const MAX_ROLE_ACTIVITIES = 5;  // the five "+" activity slots per role
const MAX_ROLE_REQUIREMENTS = 5; // max sim-criteria per role (same as activities)
const UNNAMED_ROLE = 'Unnamed role';
const ON_DUTY_LABEL = 'In attendance';
/** Sum of sim counts for the roles on duty in a slot (the per-slot 20 cap). */
function slotHeadcount(slot: ParsedVenueSlot, roles: ParsedVenueRole[]): number {
  return slot.assignments.reduce((n, a) => n + (roles.find((r) => r.index === a.roleIndex)?.simCount ?? 0), 0);
}
const MAX_SLOTS = 8;           // 24h ÷ the 3h minimum gap
const SLOT_GAP = 3;            // minimum hours between any two time slots (inclusive)

/** Circular distance between two 24h hours (so 11 PM↔1 AM = 2, not 22). */
const circularDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};
/** Hours a slot may occupy: ≥3h (inclusive) from every OTHER slot, on a 24h
 *  cycle. `exceptHour` (the slot being edited) is ignored so its own value
 *  doesn't block it. */
function validHours(slots: ParsedVenueSlot[], exceptHour?: number): Set<number> {
  const others = slots.filter((s) => s.hour !== exceptHour);
  const ok = new Set<number>();
  for (let h = 0; h < 24; h++) if (others.every((s) => circularDist(h, s.hour) >= SLOT_GAP)) ok.add(h);
  return ok;
}
// Hour-picker option order, matching the game: 1 AM → 11 PM, then 12 AM last.
const PICKER_HOUR_ORDER: number[] = [...Array(23)].map((_, i) => i + 1).concat(0);

// Requirement categories the venue role builder offers — the same Sim-filter
// system as clubs (VenueCriterion), minus club-only marital/funds, plus the
// venue-specific gender/orientation/relationship. Region omitted for now (EA
// codenames). Single-vs-multi select derived centrally (RequirementEditor).
const AGE_OPTS: ReqOpt[] = [{ v: 4, l: 'Child' }, { v: 8, l: 'Teen' }, { v: 16, l: 'Young Adult' }, { v: 32, l: 'Adult' }, { v: 64, l: 'Elder' }];
const OCCULT_OPTS: ReqOpt[] = Object.entries(STOCK_OCCULTS).map(([hex, name]) => ({ v: parseInt(hex, 16), l: name }));
const FAME_OPTS: ReqOpt[] = [1, 2, 3, 4, 5].map((n) => ({ v: n, l: `Level ${n}` }));
const GENDER_OPTS: ReqOpt[] = [{ v: 4096, l: 'Male' }, { v: 8192, l: 'Female' }];
const ORIENTATION_OPTS: ReqOpt[] = [{ v: 4096, l: 'Attracted to Males' }, { v: 8192, l: 'Attracted to Females' }, { v: 12288, l: 'Attracted to Anyone' }, { v: 16384, l: 'Attracted to no one' }];
const RELATIONSHIP_OPTS: ReqOpt[] = [{ v: 0, l: 'Single' }, { v: 1, l: 'In a Relationship' }, { v: 2, l: 'Married' }];

const VENUE_REQ_CATEGORIES: ReqCategory[] = [
  { type: 'age', label: 'Age', raw: 5, kind: 'enum', opts: AGE_OPTS },
  { type: 'skill', label: 'Skill', raw: 0, kind: 'catalog', catalog: SKILL_CHOICES },
  { type: 'trait', label: 'Trait', raw: 1, kind: 'catalog', catalog: TRAIT_CHOICES },
  { type: 'career', label: 'Career', raw: 3, kind: 'catalog', catalog: CAREER_CHOICES },
  { type: 'occult', label: 'Occult', raw: 9, kind: 'enum', opts: OCCULT_OPTS },
  { type: 'fame', label: 'Celebrity level', raw: 7, kind: 'enum', opts: FAME_OPTS },
  { type: 'gender', label: 'Gender', raw: 10, kind: 'enum', opts: GENDER_OPTS },
  { type: 'orientation', label: 'Orientation', raw: 12, kind: 'enum', opts: ORIENTATION_OPTS },
  { type: 'relationship', label: 'Relationship', raw: 13, kind: 'enum', opts: RELATIONSHIP_OPTS },
];

/** Merge added values into a role's criteria as one VenueCriterion per type. */
function mergeVenueCriteria(existing: VenueCriterion[], type: string, raw: number, values: number[]): VenueCriterion[] {
  return mergeValues<VenueCriterion>(
    existing, type, values,
    (c) => c.type === type,
    (c) => c.values,
    (vals) => ({ type: type as VenueCriterion['type'], required: true, values: vals, rawType: raw }),
    (c, vals) => ({ ...c, values: vals }),
  );
}
function replaceVenueCriteria(existing: VenueCriterion[], type: string, raw: number, values: number[]): VenueCriterion[] {
  return replaceValues<VenueCriterion>(
    existing, values,
    (c) => c.type === type,
    (vals) => ({ type: type as VenueCriterion['type'], required: true, values: vals, rawType: raw }),
    (c, vals) => ({ ...c, values: vals }), // preserves required
  );
}

/** Game-style hour dropdown: midnight last, invalid hours greyed + unselectable. */
function HourPicker({ value, allowed, onChange }: { value: number; allowed: Set<number>; onChange: (h: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center justify-between gap-2 bg-c-base border border-c-border rounded-md px-3 py-1.5 text-base font-bold text-c-text tabular-nums cursor-pointer transition-colors hover:border-c-accent w-[112px]">
        {formatHour(value)}
        <CaretDown size={13} weight="bold" className={`text-c-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-40 mt-1 w-[120px] max-h-64 overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-lg py-1">
          {PICKER_HOUR_ORDER.map((h) => {
            const disabled = h !== value && !allowed.has(h);
            const sel = h === value;
            return (
              <button key={h} type="button" role="option" aria-selected={sel} disabled={disabled} onClick={() => { onChange(h); setOpen(false); }}
                className={`w-full text-left text-sm px-3 py-1.5 border-none transition-colors tabular-nums ${disabled ? 'text-c-faint opacity-40 cursor-default bg-transparent' : sel ? 'text-c-green font-semibold bg-c-panel cursor-pointer' : 'text-c-text bg-transparent hover:bg-c-panel cursor-pointer'}`}>
                {formatHour(h)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Editable role card: name, sim count, requirements, activities (≤5). */
function RoleEditorCard({ role, onChange, onRemove, onSaveAsPreset }: {
  role: ParsedVenueRole;
  onChange: (patch: Partial<ParsedVenueRole>) => void;
  onRemove: () => void;
  onSaveAsPreset: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [pickActivity, setPickActivity] = useState(false);
  const [editingReqType, setEditingReqType] = useState<string | null>(null); // requirement chip being edited
  useEffect(() => { setName(role.name); }, [role.index, role.name]);

  // Cap is 20 per role (and separately 20 per time slot — enforced in the schedule).
  const atSimCap = role.simCount >= MAX_SIMS;

  return (
    <div className="group/role rounded-xl border border-c-border bg-c-card shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-c-panel">
        <RoleAvatar name={name} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== role.name) onChange({ name: name.trim() }); }}
          placeholder="Role name"
          className="flex-1 min-w-0 bg-c-base border border-c-border rounded-md text-sm font-semibold text-c-text outline-none placeholder:text-c-faint focus:border-c-accent px-2.5 py-1.5"
        />
        {/* Sim count stepper. It was a bare minus / number / plus with nothing
            naming the quantity, so the row read as five unlabelled icons. */}
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <span className="text-2xs font-bold uppercase tracking-label text-c-faint">Sims</span>
          <button type="button" aria-label="Fewer sims" onClick={() => onChange({ simCount: Math.max(1, role.simCount - 1) })} disabled={role.simCount <= 1} className="w-6 h-6 rounded-md border border-c-border bg-c-base text-c-dim hover:border-c-accent hover:text-c-text disabled:opacity-30 disabled:cursor-default cursor-pointer flex items-center justify-center transition-colors"><Minus size={12} weight="bold" /></button>
          <SimCount count={role.simCount} className="text-sm font-bold text-c-secondary justify-center min-w-[2.75rem]" />
          <button type="button" aria-label="More sims" onClick={() => onChange({ simCount: role.simCount + 1 })} disabled={atSimCap} className="w-6 h-6 rounded-md border border-c-border bg-c-base text-c-dim hover:border-c-accent hover:text-c-text disabled:opacity-30 disabled:cursor-default cursor-pointer flex items-center justify-center transition-colors"><Plus size={12} weight="bold" /></button>
        </div>
        <Tooltip text="Save this role as a preset" side="top">
          <button type="button" onClick={onSaveAsPreset} aria-label="Save role as preset" className={iconBtn(7)}><FloppyDisk size={15} weight="bold" /></button>
        </Tooltip>
        <Tooltip text="Remove role" side="top">
          <button type="button" onClick={onRemove} aria-label="Remove role" className={iconBtn(7, 'danger')}><Trash size={15} weight="bold" /></button>
        </Tooltip>
      </div>

      <div className="px-4 py-3.5 flex flex-col gap-4">
        {/* Requirements (≤5) */}
        <div className="flex flex-col gap-2">
          <div className="text-2xs font-semibold text-c-dim uppercase tracking-label flex items-center gap-1.5">Requirements <span className={`normal-case tracking-normal font-bold ${role.criteria.length >= MAX_ROLE_REQUIREMENTS ? 'text-c-secondary' : 'text-c-faint'}`}>{role.criteria.length}/{MAX_ROLE_REQUIREMENTS}</span></div>
          {role.criteria.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {role.criteria.map((c, i) => (
                <RequirementChip
                  key={i}
                  typeLabel={criterionTypeLabel(c)}
                  values={c.values}
                  valueLabel={(vi) => criterionValueText({ ...c, values: [c.values[vi]] })}
                  valueIcon={(vi) => criterionValueIcons(c.type, c.values[vi])[0]}
                  onEdit={() => setEditingReqType(c.type)}
                  onRemoveValue={(vi) => {
                    const nv = c.values.filter((_, j) => j !== vi);
                    onChange({ criteria: nv.length
                      ? role.criteria.map((cc, j) => (j === i ? { ...cc, values: nv } : cc))
                      : role.criteria.filter((_, j) => j !== i) });
                  }}
                  meta={
                    <Tooltip text={c.required ? 'Required — click to make optional' : 'Optional — click to make required'}>
                      <button
                        type="button"
                        onClick={() => onChange({ criteria: role.criteria.map((cc, j) => (j === i ? { ...cc, required: !cc.required } : cc)) })}
                     
                        className={`text-2xs font-medium rounded-full px-1.5 py-0.5 cursor-pointer border transition-colors ${c.required ? 'text-c-faint border-transparent hover:border-c-border' : 'text-c-dim bg-c-panel border-c-border'}`} aria-label={c.required ? 'Required — click to make optional' : 'Optional — click to make required'}>
                        {c.required ? 'required' : 'optional'}
                      </button>
                    </Tooltip>
                  }
                />
              ))}
            </div>
          )}
          <RequirementBuilder
            categories={VENUE_REQ_CATEGORIES}
            atMax={role.criteria.length >= MAX_ROLE_REQUIREMENTS}
            usedTypes={new Set(role.criteria.map((c) => c.type))}
            onEditExisting={setEditingReqType}
            onAdd={(type, raw, values) => onChange({ criteria: mergeVenueCriteria(role.criteria, type, raw, values) })}
          />
          {editingReqType && (() => {
            const cat = VENUE_REQ_CATEGORIES.find((rc) => rc.type === editingReqType);
            if (!cat) return null;
            const crit = role.criteria.find((c) => c.type === editingReqType);
            return (
              <RequirementValuePicker
                cat={cat}
                values={crit?.values ?? []}
                onReplace={(values) => onChange({ criteria: replaceVenueCriteria(role.criteria, editingReqType, cat.raw, values) })}
                onClose={() => setEditingReqType(null)}
              />
            );
          })()}
        </div>

        {/* Activities (≤5) */}
        <div className="flex flex-col gap-2">
          <div className="text-2xs font-semibold text-c-dim uppercase tracking-label flex items-center gap-1.5">Activities <span className={`normal-case tracking-normal font-bold ${role.activities.length >= MAX_ROLE_ACTIVITIES ? 'text-c-secondary' : 'text-c-faint'}`}>{role.activities.length}/{MAX_ROLE_ACTIVITIES}</span></div>
          {role.activities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.activities.map((a, i) => (
                <span key={i} className="group/act inline-flex items-center gap-1 rounded-md bg-c-panel border border-c-border px-1.5 py-1.5">
                  <Activity id={a} iconOnly />
                  <button type="button" onClick={() => onChange({ activities: role.activities.filter((_, j) => j !== i) })} aria-label={`Remove ${activityName(a)}`} className="text-c-faint hover:text-c-red hidden group-hover/act:flex focus:flex bg-transparent border-none cursor-pointer items-center"><X size={12} weight="bold" /></button>
                </span>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setPickActivity(true)} className="self-start inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent">
            <Plus size={14} weight="bold" /> {role.activities.length >= MAX_ROLE_ACTIVITIES ? 'Edit activities' : 'Add activity'}
          </button>
        </div>
      </div>

      {pickActivity && (
        <CatalogPickerModal
          title="Edit activities"
          items={VENUE_ACTIVITY_CHOICES}
          multiSelect
          preselected={new Set(role.activities)}
          maxSelected={MAX_ROLE_ACTIVITIES}
          onSelect={(picked) => onChange({ activities: picked.map((p) => p.id).slice(0, MAX_ROLE_ACTIVITIES) })}
          onClose={() => setPickActivity(false)}
        />
      )}
    </div>
  );
}

/** One in-attendance role within a time slot. Shows the role's activities inline
 *  as icons (its defaults, or this slot's overrides); the gear opens an inline
 *  editor to tweak them for THIS slot (≤5). A filled/purple gear is itself the
 *  "customized for this slot" signal — no separate badge. "Reset" drops the slot
 *  back to inheriting the role's activities. */
function SlotRoleAttendee({ slot, role, onRemove, onSetOverrides }: {
  slot: ParsedVenueSlot;
  role: ParsedVenueRole;
  onRemove: () => void;
  onSetOverrides: (overrides: string[] | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState(false);
  const assignment = slot.assignments.find((a) => a.roleIndex === role.index);
  const overridden = assignment?.activityOverrides != null;
  const effective = overridden ? assignment!.activityOverrides! : role.activities;
  const gearActive = editing || overridden;

  return (
    <div className="group/att rounded-lg border border-c-border bg-c-stage px-3 py-2 flex items-center gap-3">
      <RoleAvatar name={role.name} size="sm" />
      <span className={`text-sm font-semibold shrink-0 ${role.name ? 'text-c-text' : 'text-c-faint italic'}`}>{role.name || UNNAMED_ROLE}</span>

      {/* Activities — icon-only. Read = tooltips; edit = chips with ✕ + a ＋ */}
      {!editing ? (
        <span className="flex-1 flex flex-wrap items-center gap-2.5 min-w-0">
          {effective.length === 0
            ? <span className="text-2xs text-c-faint">—</span>
            : effective.map((id, i) => <Activity key={i} id={id} iconOnly />)}
        </span>
      ) : (
        <span className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
          {effective.map((id, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-c-panel border border-c-border pl-1.5 pr-1 py-0.5">
              <Activity id={id} iconOnly />
              <button type="button" onClick={() => onSetOverrides(effective.filter((_, j) => j !== i))} aria-label={`Remove ${activityName(id)}`} className="text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer flex items-center"><X size={11} weight="bold" /></button>
            </span>
          ))}
          {effective.length === 0 && <span className="text-2xs text-c-faint">No activities</span>}
          <button type="button" onClick={() => setPick(true)} aria-label="Edit activities" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-c-border text-c-accent hover:border-c-accent hover:bg-c-accent-soft cursor-pointer bg-c-base transition-colors"><Plus size={13} weight="bold" /></button>
        </span>
      )}

      {/* Right cluster: reset (editing) · headcount · gear · remove */}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {editing && overridden && <button type="button" onClick={() => onSetOverrides(null)} className="text-2xs font-semibold text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer">Reset</button>}
        <SimCount count={role.simCount} className="text-2xs font-semibold text-c-secondary bg-c-secondary-soft rounded-full px-1.5 py-0.5 shrink-0" />
        <Tooltip text={overridden ? 'Customized for this slot — click to edit' : 'Customize activities for this slot'}>
          <button type="button" onClick={() => setEditing((e) => !e)} aria-label="Customize activities for this slot" className={`rounded-md p-1.5 cursor-pointer border-none transition-colors ${gearActive ? 'bg-c-secondary-soft text-c-secondary' : 'bg-c-panel text-c-dim hover:text-c-text'}`}><GearSix size={16} weight={gearActive ? 'fill' : 'bold'} /></button>
        </Tooltip>
        <button type="button" onClick={onRemove} aria-label="Remove from this slot" className="text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-0.5 flex items-center opacity-0 group-hover/att:opacity-100 focus:opacity-100 transition-opacity"><X size={13} weight="bold" /></button>
      </div>

      {pick && (
        <CatalogPickerModal
          title={`Activities — ${role.name || UNNAMED_ROLE}`}
          items={VENUE_ACTIVITY_CHOICES}
          multiSelect
          preselected={new Set(effective)}
          maxSelected={MAX_ROLE_ACTIVITIES}
          onSelect={(picked) => onSetOverrides(picked.map((p) => p.id).slice(0, MAX_ROLE_ACTIVITIES))}
          onClose={() => setPick(false)}
        />
      )}
    </div>
  );
}

/** Editable schedule: time slots (the clock) + main activity + on-duty roles. */
function ScheduleEditor({ slots, roles, onChange, extraActions }: {
  slots: ParsedVenueSlot[];
  roles: ParsedVenueRole[];
  onChange: (slots: ParsedVenueSlot[]) => void;
  extraActions?: React.ReactNode;
}) {
  const [pickMainFor, setPickMainFor] = useState<number | null>(null); // by hour
  const sorted = [...slots].sort((a, b) => a.hour - b.hour);
  const addable = validHours(slots);

  function addSlot() {
    if (slots.length === 0) { onChange([{ hour: 6, mainActivity: null, assignments: [] }]); return; }
    const maxHour = Math.max(...slots.map((s) => s.hour));
    // Prefer last + 3h (the game's auto-default); else the first valid hour.
    const target = (maxHour + SLOT_GAP) % 24;
    const hour = addable.has(target) ? target : [...addable][0];
    if (hour === undefined) return; // schedule is full
    onChange([...slots, { hour, mainActivity: null, assignments: [] }]);
  }
  function patchSlot(hour: number, patch: Partial<ParsedVenueSlot>) {
    onChange(slots.map((s) => (s.hour === hour ? { ...s, ...patch } : s)));
  }
  function removeSlot(hour: number) { onChange(slots.filter((s) => s.hour !== hour)); }
  function toggleRole(hour: number, roleIndex: number) {
    const slot = slots.find((s) => s.hour === hour);
    if (!slot) return;
    const on = slot.assignments.some((a) => a.roleIndex === roleIndex);
    const assignments = on
      ? slot.assignments.filter((a) => a.roleIndex !== roleIndex)
      : [...slot.assignments, { roleIndex, activityOverrides: null, outfitOverride: null }];
    patchSlot(hour, { assignments });
  }
  // Set this role's per-slot activity list (null = reset to the role's defaults).
  function setOverrides(hour: number, roleIndex: number, overrides: string[] | null) {
    const slot = slots.find((s) => s.hour === hour);
    if (!slot) return;
    patchSlot(hour, { assignments: slot.assignments.map((a) => (a.roleIndex === roleIndex ? { ...a, activityOverrides: overrides } : a)) });
  }

  const canAdd = slots.length < MAX_SLOTS && addable.size > 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Add Timeslot + start-from/save-as (extraActions) on one row, like the Roles row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={addSlot} disabled={!canAdd} className={btn('primary', { elevated: true })}>
          <Plus size={14} weight="bold" /> Add Timeslot
        </button>
        {extraActions}
      </div>
      {!canAdd && slots.length > 0 && (
        <p className="text-2xs text-c-faint">{slots.length >= MAX_SLOTS ? `Maximum ${MAX_SLOTS} time slots.` : 'No free hours at least 3 hours from the others.'}</p>
      )}
      {sorted.map((slot) => {
        const slotMain = slot.mainActivity;
        return (
          <div key={slot.hour} className="rounded-xl border border-c-border bg-c-card shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-c-panel flex-wrap">
              <HourPicker value={slot.hour} allowed={validHours(slots, slot.hour)} onChange={(h) => patchSlot(slot.hour, { hour: h })} />
              {/* Main activity — the venue-wide activity for this slot. Optional: no
                  default (Free Time is just one of the activities you can pick). */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {slotMain !== null ? (
                  <span className="group/main inline-flex items-center gap-1.5 rounded-lg bg-c-panel border border-c-border pl-3 pr-2 py-1.5">
                    <button type="button" onClick={() => setPickMainFor(slot.hour)} aria-label="Change main activity" className="inline-flex items-center bg-transparent border-none cursor-pointer p-0">
                      <Activity id={slotMain} className="text-sm font-semibold text-c-text" />
                    </button>
                    <button type="button" onClick={() => patchSlot(slot.hour, { mainActivity: null })} aria-label="Clear main activity" className="text-c-faint hover:text-c-red opacity-0 group-hover/main:opacity-100 focus:opacity-100 bg-transparent border-none cursor-pointer flex items-center transition-opacity"><X size={12} weight="bold" /></button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setPickMainFor(slot.hour)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-dashed border-c-border px-3 py-1.5 cursor-pointer transition-colors bg-transparent text-c-dim hover:border-c-accent hover:text-c-text">
                    <Plus size={14} weight="bold" /> Main activity
                  </button>
                )}
              </div>
              <button type="button" onClick={() => removeSlot(slot.hour)} disabled={slots.length <= 1} aria-label="Remove time slot" className="shrink-0 text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-1 flex items-center transition-colors disabled:opacity-25 disabled:cursor-default"><Trash size={14} weight="bold" /></button>
            </div>
            {/* In-attendance roles (per-slot 20-sim cap) + per-role activity overrides */}
            <div className="px-4 py-3">
              {roles.length === 0 ? (
                <p className="text-xs text-c-faint italic">Add roles above, then choose who's in attendance here.</p>
              ) : (() => {
                const headcount = slotHeadcount(slot, roles);
                const onDuty = roles.filter((r) => slot.assignments.some((a) => a.roleIndex === r.index));
                const offDuty = roles.filter((r) => !slot.assignments.some((a) => a.roleIndex === r.index));
                return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-semibold text-c-dim uppercase tracking-label">{ON_DUTY_LABEL}</span>
                    <span className={`text-2xs font-bold tabular-nums rounded-full px-1.5 py-0.5 ${headcount > MAX_SIMS ? 'text-c-red' : headcount >= MAX_SIMS ? 'bg-c-secondary-soft text-c-secondary' : 'text-c-faint'}`}>{headcount} / {MAX_SIMS}</span>
                  </div>
                  {onDuty.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {onDuty.map((r) => (
                        <SlotRoleAttendee
                          key={r.index}
                          slot={slot}
                          role={r}
                          onRemove={() => toggleRole(slot.hour, r.index)}
                          onSetOverrides={(ov) => setOverrides(slot.hour, r.index, ov)}
                        />
                      ))}
                    </div>
                  )}
                  {/* Add a role via dropdown — only roles that still fit the 20/slot cap. */}
                  {(() => {
                    const fitting = offDuty.filter((r) => headcount + r.simCount <= MAX_SIMS);
                    // Cap is evident from the headcount pill (it fills/colors at 20/20),
                    // so when nothing fits we simply drop the add control — no extra text.
                    if (fitting.length === 0) return null;
                    return (
                      <Dropdown
                        value=""
                        ariaLabel="Add a role to this time slot"
                        placeholder="+ Add role"
                        className="w-48"
                        options={[{ value: '', label: '+ Add role' }, ...fitting.map((r) => ({ value: String(r.index), label: r.name || UNNAMED_ROLE }))]}
                        onChange={(v) => { if (v) toggleRole(slot.hour, Number(v)); }}
                      />
                    );
                  })()}
                </div>
                );
              })()}
            </div>
          </div>
        );
      })}

      {pickMainFor !== null && (
        <CatalogPickerModal
          title="Main activity"
          items={VENUE_ACTIVITY_CHOICES}
          onSelect={(items) => { const id = items[0]?.id; if (id) patchSlot(pickMainFor, { mainActivity: id }); }}
          onClose={() => setPickMainFor(null)}
        />
      )}
    </div>
  );
}

/** A role CARD: avatar + name + headcount always; detail on expand. When no
 *  onToggle is given (e.g. preset display) it renders open and non-interactive. */
function RoleRow({ role, expanded, onToggle }: { role: ParsedVenueRole; expanded: boolean; onToggle?: () => void }) {
  const hasDetail = role.criteria.length > 0 || role.activities.length > 0;
  const interactive = !!onToggle && hasDetail;
  return (
    <div className="rounded-xl border border-c-border bg-c-card shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        disabled={!interactive}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-transparent border-none cursor-pointer disabled:cursor-default hover:bg-c-panel transition-colors"
      >
        <RoleAvatar name={role.name} />
        <span className={`text-sm font-semibold flex-1 ${role.name ? 'text-c-text' : 'text-c-faint italic'}`}>{role.name || UNNAMED_ROLE}</span>
        <SimCount count={role.simCount} className="text-sm font-bold text-c-secondary" />
        {interactive && <CaretRight size={13} weight="bold" className={`text-c-dim transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />}
      </button>
      {expanded && hasDetail && (
        <div className="px-4 pb-4 pt-3 border-t border-c-panel flex flex-col gap-3.5 text-sm">
          {role.criteria.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-2xs font-semibold text-c-dim uppercase tracking-label">Requirements</div>
              <div className="flex flex-wrap gap-2">
                {role.criteria.map((c, i) => (
                  <RequirementChip
                    key={i}
                    typeLabel={criterionTypeLabel(c)}
                    values={c.values}
                    valueLabel={(vi) => criterionValueText({ ...c, values: [c.values[vi]] })}
                    valueIcon={(vi) => criterionValueIcons(c.type, c.values[vi])[0]}
                    meta={!c.required ? <Pill tone="neutral">optional</Pill> : undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {role.activities.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-2xs font-semibold text-c-dim uppercase tracking-label">Activities</div>
              <div className="flex flex-wrap items-center gap-2.5">
                {role.activities.map((a, i) => <Activity key={i} id={a} iconOnly />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The schedule: one boxed card per time slot. The TIME leads (it's a timetable);
 *  the default activity sits beside it; role-specific activities sit in a separated
 *  zone below (no arrows). */
function ScheduleList({ venue }: { venue: { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] } }) {
  const roleByIndex = useMemo(() => {
    const m = new Map<number, ParsedVenueRole>();
    for (const r of venue.roles) m.set(r.index, r);
    return m;
  }, [venue.roles]);

  const slots = [...venue.slots].sort((a, b) => a.hour - b.hour);

  return (
    <div className="flex flex-col gap-2.5">
      {slots.map((slot, i) => (
        <div key={i} className="rounded-xl border border-c-border bg-c-card shadow-sm overflow-hidden">
          {/* Time (the star) + the slot's default activity (if any) */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg font-bold text-c-text tabular-nums w-[68px] shrink-0">{formatHour(slot.hour)}</span>
            {slot.mainActivity !== null
              ? <Activity id={slot.mainActivity} className="text-base font-semibold text-c-text min-w-0" />
              : slot.assignments.length === 0
                ? <span className="text-base text-c-faint italic">Nothing scheduled</span>
                : null}
          </div>
          {/* What each on-duty role does. Precedence: per-slot override →
              slot default → the role's own default activities. */}
          {slot.assignments.length > 0 && (
            <div className="border-t border-c-panel bg-c-stage px-4 py-2.5 flex flex-col gap-1.5">
              {slot.assignments.map((a, j) => {
                const role = roleByIndex.get(a.roleIndex);
                const acts = a.activityOverrides != null ? a.activityOverrides
                  : slot.mainActivity != null ? [slot.mainActivity]
                  : (role?.activities ?? []);
                return (
                  <div key={j} className="flex items-center gap-2.5 text-sm min-w-0">
                    <RoleAvatar name={role?.name ?? ''} size="sm" />
                    <span className={`shrink-0 ${role?.name ? 'text-c-dim' : 'text-c-faint italic'}`}>{role?.name || UNNAMED_ROLE}</span>
                    {acts.length > 0
                      ? <span className="flex flex-wrap items-center gap-2.5 min-w-0">{acts.map((id, k) => <Activity key={k} id={id} iconOnly />)}</span>
                      : <span className="text-c-faint">—</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Read-only detail for a saved preset — a schedule template (schedule + roles,
 *  reusing the venue layout) or a standalone role template. */
function PresetDetail({ preset, onDelete }: { preset: PresetItem; onDelete?: () => void }) {
  const sectionH3 = 'flex items-center gap-2 text-base font-bold text-c-text tracking-headline m-0 mb-3';
  const kindTag = (
    <Pill tone="purple" caps>
      {preset.kind === 'role' ? 'Role preset' : 'Schedule preset'}
    </Pill>
  );
  const originTag = (
    <Pill tone="neutral" caps>
      {PRESET_ORIGIN_LABEL[preset.origin]}
    </Pill>
  );
  // Only planner-authored presets are user-deletable (Maxis + imported are reference).
  const deleteBtn = preset.origin === 'planner' && onDelete ? (
    <button onClick={onDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
      <Trash size={13} weight="bold" /> Delete preset
    </button>
  ) : null;

  if (preset.kind === 'role') {
    const role = preset.data as ParsedVenueRole;
    return (
      <div className="max-w-2xl flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0">{preset.name || '(unnamed role)'}</h2>
          {kindTag}{originTag}{deleteBtn}
        </div>
        <RoleRow role={role} expanded />
      </div>
    );
  }

  const data = preset.data as { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] };
  return (
    <div className="max-w-5xl flex flex-col gap-7">
      <div className="flex items-center gap-2.5">
        <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0">{preset.name || '(unnamed preset)'}</h2>
        {kindTag}{originTag}{deleteBtn}
      </div>
      <div className={`grid grid-cols-1 gap-x-8 gap-y-7 items-start ${data.slots.length > 0 ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
        {data.slots.length > 0 && (
          <div>
            <h3 className={sectionH3}><Clock size={18} weight="duotone" className="text-c-secondary" />Schedule</h3>
            <ScheduleList venue={data} />
          </div>
        )}
        <div>
          <h3 className={sectionH3}>
            <Users size={18} weight="duotone" className="text-c-secondary" />
            Roles
            {data.roles.length > 0 && <span className="text-xs text-c-faint font-normal">{rolesSummary(data.roles)}</span>}
          </h3>
          {data.roles.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {data.roles.map((role, i) => <RoleRow key={i} role={role} expanded />)}
            </div>
          ) : (
            <p className="text-sm text-c-faint italic">This preset has no roles.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Save-as-preset dialog. When `updateTarget` is set (the schedule/role was started
 *  from one of YOUR planner presets), it leads with "Update 'X'" (overwrite) and
 *  keeps "Save as new" below; otherwise it's just name + Save. */
function SavePresetModal({ title, defaultName, updateTarget, onSave, onUpdate, onClose }: {
  title: string;
  defaultName: string;
  updateTarget?: { name: string } | null;
  onSave: (name: string) => void;
  onUpdate?: () => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();
  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[420px] overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="p-5 flex flex-col gap-4 bg-c-base">
          {updateTarget && onUpdate && (
            <>
              <button onClick={onUpdate} className={btn('primary', { block: true })}>
                <FloppyDisk size={14} weight="bold" /> Update “{updateTarget.name}”
              </button>
              <div className="flex items-center gap-2 text-2xs text-c-faint uppercase tracking-label">
                <span className="flex-1 h-px bg-c-border" /> or save as new <span className="flex-1 h-px bg-c-border" />
              </div>
            </>
          )}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) onSave(trimmed); }}
            placeholder="Preset name"
            className="w-full bg-c-card border border-c-border rounded-md px-3 py-2 text-c-text text-sm outline-none focus:border-c-accent placeholder:text-c-faint"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className={btn('ghost', { size: 'sm' })}>Cancel</button>
            <button onClick={() => onSave(trimmed)} disabled={!trimmed} className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-md px-4 py-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default border ${updateTarget ? 'bg-c-base text-c-dim border-c-border hover:border-c-accent hover:text-c-text' : 'bg-c-accent text-white border-c-accent hover:bg-c-accent-hover'}`}>
              <FloppyDisk size={14} weight="bold" /> {updateTarget ? 'Save as new' : 'Save preset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Apply-a-preset picker — presets of one kind, grouped by origin, searchable. */
function PresetPickerModal({ kind, presets, onPick, onClose }: {
  kind: 'schedule' | 'role';
  presets: PresetItem[];
  onPick: (p: PresetItem) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const [search, setSearch] = useState('');
  const groups = useMemo(() => {
    const q = search.toLowerCase();
    return ([['import', 'From save'], ['planner', 'Made in planner'], ['stock', 'Maxis']] as const)
      .map(([origin, label]) => ({
        origin, label,
        items: presets.filter((p) => p.kind === kind && p.origin === origin && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.items.length > 0);
  }, [presets, kind, search]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{kind === 'schedule' ? 'Start from a schedule preset' : 'Add a role from a preset'}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search presets…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {total === 0 && <div className="px-4 py-10 text-center text-xs text-c-faint">No matching presets.</div>}
          {groups.map((g) => (
            <div key={g.origin}>
              <div className="sticky top-0 bg-c-card px-4 py-2 text-2xs text-c-faint uppercase tracking-label font-semibold border-b border-c-panel">{g.label}</div>
              {g.items.map((p) => (
                <button key={p.id} onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 border-0 border-b border-c-panel text-left bg-transparent cursor-pointer hover:bg-c-accent-soft transition-colors">
                  <span className="text-sm font-medium text-c-text truncate">{p.name || '(unnamed)'}</span>
                  {p.kind === 'schedule'
                    ? <span className="text-2xs text-c-faint shrink-0">{(p.data as { roles: ParsedVenueRole[] }).roles?.length ?? 0} roles</span>
                    : <SimCount count={(p.data as ParsedVenueRole).simCount} className="text-2xs text-c-faint shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomVenues() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const lots = useSaveFile((s) => s.lots);
  const updateLot = useSaveFile((s) => s.updateLot);
  const customVenues = useSaveFile((s) => s.customVenues);
  const customVenuePresets = useSaveFile((s) => s.customVenuePresets);
  const households = useSaveFile((s) => s.households);
  const addCustomVenue = useSaveFile((s) => s.addCustomVenue);
  const updateCustomVenue = useSaveFile((s) => s.updateCustomVenue);
  const deleteCustomVenue = useSaveFile((s) => s.deleteCustomVenue);
  const addCustomVenuePreset = useSaveFile((s) => s.addCustomVenuePreset);
  const updateCustomVenuePreset = useSaveFile((s) => s.updateCustomVenuePreset);
  const deleteCustomVenuePreset = useSaveFile((s) => s.deleteCustomVenuePreset);
  const confirm = useConfirm();

  const [view, setView] = useState<'venues' | 'presets'>('venues');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [presetSaveTarget, setPresetSaveTarget] = useState<{ kind: 'schedule' } | { kind: 'role'; role: ParsedVenueRole } | null>(null);
  const [applyKind, setApplyKind] = useState<'schedule' | 'role' | null>(null);   // which apply-preset picker is open
  const [pendingReplace, setPendingReplace] = useState<PresetItem | null>(null);   // schedule preset awaiting the replace warning
  const [saveThenApply, setSaveThenApply] = useState<PresetItem | null>(null);     // "save current first" then apply this
  const [editingNotes, setEditingNotes] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [presetKind, setPresetKind] = useState<'schedule' | 'role'>('schedule');
  const [expandedRoles, setExpandedRoles] = useState<Set<number>>(new Set());

  // The preset library merges three origins: the player's own imported presets,
  // future planner-authored ones, and the Sims-Team built-ins (static catalog).
  const allPresets = useMemo<PresetItem[]>(() => {
    const stock: PresetItem[] = [
      ...STOCK_VENUE_PRESETS.schedules.map((p) => ({ id: `stock:s:${p.key}`, kind: 'schedule' as const, name: p.name, data: p.data, origin: 'stock' as const })),
      ...STOCK_VENUE_PRESETS.roles.map((p) => ({ id: `stock:r:${p.key}`, kind: 'role' as const, name: p.name, data: p.data, origin: 'stock' as const })),
    ];
    const mine: PresetItem[] = customVenuePresets.map((p) => ({ id: p.id, kind: p.kind, name: p.name, data: p.data, origin: p.source }));
    return [...mine, ...stock];
  }, [customVenuePresets]);

  // Split by kind (Schedule | Role sub-toggle), then grouped by origin (player's
  // first, Sims-Team last), filtered by the search box.
  const presetGroups = useMemo(() => {
    const q = search.toLowerCase();
    const inGroup = (origin: PresetItem['origin']) =>
      allPresets
        .filter((p) => p.origin === origin && p.kind === presetKind && (!q || p.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name));
    return ([
      ['import', 'From save'],
      ['planner', 'Made in planner'],
      ['stock', 'Maxis'],
    ] as const)
      .map(([origin, label]) => ({ origin, label, items: inGroup(origin) }))
      .filter((g) => g.items.length > 0);
  }, [allPresets, search, presetKind]);

  const presetMatchCount = presetGroups.reduce((n, g) => n + g.items.length, 0);
  const scheduleCount = allPresets.filter((p) => p.kind === 'schedule').length;
  const roleCount = allPresets.filter((p) => p.kind === 'role').length;
  const selectedPreset = selectedPresetId ? allPresets.find((p) => p.id === selectedPresetId) ?? null : null;

  // Joined view: custom_venues rows + their (optional) lot data, filtered by
  // search. Planner venues may have no lot — they stay in the list regardless.
  // Display name leads with the LOT name for imported venues (their schedule may
  // be unnamed, so the lot is all there is) and with the VENUE name for planner ones.
  const venues = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(customVenues)
      .map((cv) => {
        const lot = cv.lotKey ? lots[cv.lotKey] : undefined;
        const displayName = cv.source === 'import'
          ? (lot ? (lot.customName || lot.name) : (cv.name || '(custom venue)'))
          : (cv.name || '(unnamed venue)');
        return { cv, lot, displayName };
      })
      .filter(({ lot, displayName }) => !q || displayName.toLowerCase().includes(q) || (lot?.worldName.toLowerCase().includes(q) ?? false))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [customVenues, lots, search]);

  const trackedLotKeys = useMemo(
    () => new Set(Object.values(customVenues).map((cv) => cv.lotKey).filter((k): k is string => !!k)),
    [customVenues],
  );

  // How many worlds the venues that HAVE a lot are spread across (a lot-less
  // planner venue isn't anywhere yet, so it can't count towards this).
  const worldCount = useMemo(() => {
    const worlds = new Set<string>();
    for (const cv of Object.values(customVenues)) {
      const lot = cv.lotKey ? lots[cv.lotKey] : undefined;
      if (lot) worlds.add(lot.worldName);
    }
    return worlds.size;
  }, [customVenues, lots]);

  // Landing "at a glance" stats. total counts ALL custom venues (incl. lot-less
  // planner ones). fromSave = parsed from the save; planned = authored here.
  const venueStats = useMemo(() => {
    const all = Object.values(customVenues);
    const total = all.length;
    const fromSave = all.filter((cv) => cv.source === 'import').length;
    return { total, fromSave, planned: total - fromSave };
  }, [customVenues]);

  const selectedCv = selectedId ? customVenues[selectedId] : null;
  const selectedLot = selectedCv && selectedCv.lotKey ? lots[selectedCv.lotKey] : null;

  /**
   * Where this schedule came from — a LABEL, not a control.
   *
   * One button used to carry both jobs: it opened the preset picker AND
   * reported the source, so its text changed from "Custom" to a preset name to
   * "Start from a preset" depending on state. Neither job worked. A button
   * reading "Custom" tells you nothing (custom just means you built it
   * yourself) and gives no hint it can be clicked, and the only clue was a
   * native OS tooltip. Now the button always says the same thing and this rides
   * on the section heading instead.
   *
   * Null when there's no preset behind it: absence IS the "custom" state, and
   * naming it would be labelling an untitled document "Untitled".
   * A dangling sourcePresetId (preset since deleted) also lands here.
   */
  const scheduleSource = selectedCv?.sourcePresetId ? allPresets.find((p) => p.id === selectedCv.sourcePresetId && p.kind === 'schedule') ?? null : null;
  const scheduleEdited = !!scheduleSource && !!selectedCv && JSON.stringify({ roles: selectedCv.roles, slots: selectedCv.slots }) !== JSON.stringify(scheduleSource.data);
  const scheduleOrigin = scheduleSource
    ? `from ${scheduleSource.name || 'a preset'}${scheduleEdited ? ' · edited' : ''}`
    : null;

  function selectVenue(id: string) {
    // Read live store state — right after creating a venue the render-closure
    // `customVenues` is stale (doesn't yet hold the new row), so jump-into-editor
    // would silently no-op.
    const cv = useSaveFile.getState().customVenues[id];
    if (!cv) return;
    setSelectedId(id);
    setEditingNotes(cv.notes || '');
    setIsDirty(false);
    setEditingName(cv.name || '');
    setNameDirty(false);
    // Small venues (≤3 roles) start fully expanded since the detail reads cleanly;
    // larger ones start collapsed to avoid a tall wall. Users can toggle either way.
    setExpandedRoles(cv.roles.length <= 3 ? new Set(cv.roles.map((r) => r.index)) : new Set());
  }

  // Suspend list nav while any picker/modal is open so arrows don't move the
  // selection underneath it.
  const navBlocked = showPicker || showHostPicker || !!presetSaveTarget || !!applyKind || !!pendingReplace;
  useListKeyboardNav({
    items: venues,
    selectedId,
    onSelect: selectVenue,
    getId: (v) => v.cv.id,
    enabled: view === 'venues' && !navBlocked,
  });
  useListKeyboardNav({
    items: presetGroups.flatMap((g) => g.items),
    selectedId: selectedPresetId,
    onSelect: setSelectedPresetId,
    enabled: view === 'presets' && !navBlocked,
  });

  function toggleRole(index: number) {
    setExpandedRoles((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function handleNotesBlur() {
    if (!selectedCv || !isDirty) return;
    updateCustomVenue(selectedCv.id, { notes: editingNotes });
    setIsDirty(false);
  }

  function handleNameBlur() {
    if (!selectedCv || !nameDirty) return;
    updateCustomVenue(selectedCv.id, { name: editingName.trim() });
    setNameDirty(false);
  }

  // ── Editor mutators (planner venues; auto-save on every change) ──────────────
  function patchRoles(roles: ParsedVenueRole[]) { if (selectedCv) updateCustomVenue(selectedCv.id, { roles }); }
  function patchSlots(slots: ParsedVenueSlot[]) { if (selectedCv) updateCustomVenue(selectedCv.id, { slots }); }
  function addRole() {
    if (!selectedCv) return;
    const nextIndex = selectedCv.roles.length ? Math.max(...selectedCv.roles.map((r) => r.index)) + 1 : 0;
    patchRoles([...selectedCv.roles, { name: '', simCount: 1, criteria: [], activities: [], outfit: { mode: 'none' }, index: nextIndex }]);
  }
  function updateRole(index: number, patch: Partial<ParsedVenueRole>) {
    if (!selectedCv) return;
    patchRoles(selectedCv.roles.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  }
  function removeRole(index: number) {
    if (!selectedCv) return;
    // Drop the role AND any slot assignments that referenced it, in one write.
    const roles = selectedCv.roles.filter((r) => r.index !== index);
    const slots = selectedCv.slots.map((s) => ({ ...s, assignments: s.assignments.filter((a) => a.roleIndex !== index) }));
    updateCustomVenue(selectedCv.id, { roles, slots });
  }

  // ── Apply a preset (planner venues) ─────────────────────────────────────────
  // Deep-copy preset data so later edits never mutate the shared preset object and
  // the edited-vs-pristine compare stays meaningful.
  function applySchedulePreset(p: PresetItem) {
    if (!selectedCv) return;
    const data = p.data as { roles: ParsedVenueRole[]; slots: ParsedVenueSlot[] };
    const roles = JSON.parse(JSON.stringify(data.roles ?? [])) as ParsedVenueRole[];
    const slots = JSON.parse(JSON.stringify(data.slots ?? [])) as ParsedVenueSlot[];
    updateCustomVenue(selectedCv.id, { roles, slots, sourcePresetId: p.id });
  }
  // Start-from a schedule preset. Warn before clobbering hand-built work (auto-save
  // = no undo) so you can save the current schedule as a preset first.
  function pickSchedulePreset(p: PresetItem) {
    setApplyKind(null);
    if (!selectedCv) return;
    if (selectedCv.roles.length > 0 || selectedCv.slots.length > 0) setPendingReplace(p);
    else applySchedulePreset(p);
  }
  function addRoleFromPreset(p: PresetItem) {
    setApplyKind(null);
    if (!selectedCv) return;
    const r = JSON.parse(JSON.stringify(p.data)) as ParsedVenueRole;
    const nextIndex = selectedCv.roles.length ? Math.max(...selectedCv.roles.map((x) => x.index)) + 1 : 0;
    patchRoles([...selectedCv.roles, { ...r, index: nextIndex, sourcePresetId: p.id }]);
  }

  // Create flow: a new venue is born lot-less and editable — jump straight into
  // the editor. The lot is assigned later (or never) from inside the editor.
  async function handleCreateVenue() {
    const id = await addCustomVenue({ lotKey: null, name: '', venueSchedule: '', notes: '', roles: [], slots: [] });
    selectVenue(id);
  }

  // Assign / unassign a lot. Unlike a small business — which is merely LOCATED
  // on a lot — a venue lot *is* the game's "Custom Venue" type, so the two move
  // together: assigning converts the lot, and letting it go hands the type back.
  function handleAssignLot(lotKey: string) {
    if (!selectedCv) return;
    setShowPicker(false);
    const prev = selectedCv.lotKey;
    updateCustomVenue(selectedCv.id, { lotKey });
    if (prev && prev !== lotKey) revertConvertedLot(prev, selectedCv.id);
    if (lots[lotKey] && lots[lotKey].customType !== 'Custom Venue') {
      updateLot(lotKey, { customType: 'Custom Venue' });
    }
  }
  function handleUnassignLot() {
    if (!selectedCv) return;
    const prev = selectedCv.lotKey;
    updateCustomVenue(selectedCv.id, { lotKey: null });
    if (prev) revertConvertedLot(prev, selectedCv.id);
  }

  /** Hand a lot its type back when no venue holds it any more. Only ever undoes
   *  a conversion the PLANNER made: the revert target is what the save last
   *  reported for that lot, so a lot the game itself calls a Custom Venue keeps
   *  the type (there is nothing to undo). Mirrors the small-business rule. */
  function revertConvertedLot(lotKey: string, forVenueId: string) {
    const lot = lots[lotKey];
    if (!lot || lot.customType !== 'Custom Venue') return;
    const revertType = lot.lastSaved?.customType ?? lot.defaultType;
    if (!revertType || revertType === 'Custom Venue') return;
    const heldByAnother = Object.values(customVenues).some((v) => v.id !== forVenueId && v.lotKey === lotKey);
    if (!heldByAnother) updateLot(lotKey, { customType: revertType });
  }

  // Getaway toggle. A getaway is hosted by a household and only exists while
  // you're playing it, so it never holds a lot — switching it on releases any
  // lot the venue had. Switching it off clears the host. (Imports can't reach here.)
  function toggleGetaway(on: boolean) {
    if (!selectedCv) return;
    if (on) {
      const prev = selectedCv.lotKey;
      updateCustomVenue(selectedCv.id, { isGetaway: true, lotKey: null });
      if (prev) revertConvertedLot(prev, selectedCv.id);
    } else {
      updateCustomVenue(selectedCv.id, { isGetaway: false, hostHouseholdId: null });
    }
  }
  function setHost(hostHouseholdId: string | null) {
    if (!selectedCv) return;
    updateCustomVenue(selectedCv.id, { hostHouseholdId });
  }

  // Deleting a venue hands its lot back too — otherwise the lot is stranded as
  // a Custom Venue with nothing on it, and the picker won't re-offer it.
  async function handleDelete() {
    if (!selectedCv) return;
    const ok = await confirm({
      message: `Delete this ${selectedCv.isGetaway ? 'getaway' : 'custom venue'}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const lotKey = selectedCv.lotKey;
    const id = selectedCv.id;
    await deleteCustomVenue(id);
    if (lotKey) revertConvertedLot(lotKey, id);
    setSelectedId(null);
  }

  return (
    <div className="flex flex-col h-full max-w-[1600px] w-full">
      <PackNotOwnedBanner packId="EP20" feature="Custom Venues" />
      <MasterDetail>
      {/* Left list */}
      <MasterDetail.Rail width="w-64">
        <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
          <h1 className="text-xl font-bold text-c-text m-0 tracking-headline">Custom Venues</h1>
          {/* Venues | Presets toggle */}
          <div className="flex gap-1 p-0.5 bg-c-base border border-c-border rounded-lg">
            {(['venues', 'presets'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setSearch(''); }}
                className={`flex-1 text-2xs font-semibold uppercase tracking-label py-1.5 rounded-md transition-colors cursor-pointer border-none ${
                  view === v ? 'bg-c-card text-c-text shadow-sm' : 'bg-transparent text-c-dim hover:text-c-text'
                }`}
              >
                {v === 'venues' ? 'Venues' : 'Presets'}
              </button>
            ))}
          </div>
          {/* Presets sub-toggle: Schedule | Role */}
          {view === 'presets' && (
            <div className="flex gap-1 p-0.5 bg-c-base border border-c-border rounded-lg">
              {([['schedule', 'Schedules', scheduleCount], ['role', 'Roles', roleCount]] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => { setPresetKind(k); setSelectedPresetId(null); }}
                  className={`flex-1 text-2xs font-semibold uppercase tracking-label py-1.5 rounded-md transition-colors cursor-pointer border-none ${
                    presetKind === k ? 'bg-c-secondary text-white shadow-sm' : 'bg-transparent text-c-dim hover:text-c-text'
                  }`}
                >
                  {label} <span className={presetKind === k ? 'text-white/70' : 'text-c-faint'}>{n}</span>
                </button>
              ))}
            </div>
          )}
          {view === 'venues' && (
            <button
              onClick={handleCreateVenue}
              className={btn('primary', { block: true, elevated: true })}
            >
              <Plus size={14} weight="bold" />
              <span className="text-2xs font-semibold uppercase tracking-label">New venue</span>
            </button>
          )}
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder={view === 'venues' ? 'Search venues...' : 'Search presets...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-c-base border border-c-border rounded-md pl-9 pr-9 py-[6px] text-c-text text-xs w-full outline-none focus:border-c-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1"
                aria-label="Clear search"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {view === 'venues' ? (
            <>
              {venues.length === 0 && (
                search ? (
                  <div className="px-4 py-10 text-center">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                      <MagnifyingGlass size={18} weight="duotone" />
                    </div>
                    <p className="text-xs font-semibold text-c-text mb-0.5">No matches</p>
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="text-2xs font-semibold uppercase tracking-label text-c-accent hover:underline bg-transparent border-none cursor-pointer mt-1"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-xs text-c-faint">
                    No custom venues yet. Click "+ New venue" to start one.
                  </div>
                )
              )}
              {venues.map(({ cv, displayName }) => (
                <button
                  key={cv.id}
                  onClick={() => selectVenue(cv.id)}
                  data-listnav-id={cv.id}
                  className={`flex flex-col items-start gap-0.5 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left w-full transition-colors ${
                    cv.id === selectedId
                      ? 'bg-c-accent-soft border-l-c-accent'
                      : 'bg-transparent border-l-transparent hover:bg-c-panel'
                  }`}
                >
                  <span className="flex items-center gap-2 w-full min-w-0">
                    <span className="flex-1 min-w-0 text-sm font-semibold text-c-text tracking-headline truncate">{displayName}</span>
                    {cv.source !== 'import' && <PlannerPill />}
                  </span>
                  {/* Imported venues: the schedule/preset name as a quiet subtitle. */}
                  {cv.source === 'import' && cv.name && (
                    <span className="text-2xs text-c-faint truncate w-full">{cv.name}</span>
                  )}
                </button>
              ))}
            </>
          ) : (
            <>
              {presetMatchCount === 0 && (
                <div className="px-4 py-8 text-center text-xs text-c-faint">
                  {search ? 'No matching presets.' : 'No presets available.'}
                </div>
              )}
              {presetGroups.map((group) => (
                <div key={group.origin}>
                  <div className="sticky top-0 bg-c-card px-4 py-2 text-2xs text-c-faint uppercase tracking-label font-semibold border-b border-c-panel">{group.label}</div>
                  {group.items.map((p) => {
                    const roleCount = (p.data as { roles: ParsedVenueRole[] }).roles?.length ?? 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPresetId(p.id)}
                        data-listnav-id={p.id}
                        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left w-full transition-colors ${
                          p.id === selectedPresetId
                            ? 'bg-c-secondary-soft border-l-c-secondary'
                            : 'bg-transparent border-l-transparent hover:bg-c-panel'
                        }`}
                      >
                        <span className="text-sm font-semibold text-c-text tracking-headline truncate">{p.name || '(unnamed)'}</span>
                        {p.kind === 'schedule'
                          ? <span className="text-2xs text-c-faint shrink-0">{roleCount} {roleCount === 1 ? 'role' : 'roles'}</span>
                          : <SimCount count={(p.data as ParsedVenueRole).simCount} className="text-2xs text-c-faint shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </MasterDetail.Rail>

      {/* Right panel */}
      <MasterDetail.Detail label="Venues">
      <div className="flex-1 overflow-y-auto p-8 bg-c-base">
        {view === 'presets' ? (
          selectedPreset ? (
            <PresetDetail
              preset={selectedPreset}
              onDelete={async () => {
                const ok = await confirm({ message: `Delete the preset "${selectedPreset.name || 'this preset'}"?`, confirmLabel: 'Delete', danger: true });
                if (!ok) return;
                await deleteCustomVenuePreset(selectedPreset.id);
                setSelectedPresetId(null);
              }}
            />
          ) : (
            <div className="max-w-md">
              <h2 className="text-xl font-bold text-c-text tracking-display m-0 mb-1">Preset library</h2>
              <p className="text-xs text-c-dim mb-6">Reusable schedule and role templates — the Sims-Team built-ins plus any you've saved in-game. Pick one to view it.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-c-secondary-border bg-c-secondary-soft px-4 py-4">
                  <div className="text-3xl font-bold text-c-secondary leading-none tracking-display">{scheduleCount}</div>
                  <div className="text-2xs text-c-secondary uppercase tracking-label font-semibold mt-2">Schedule presets</div>
                </div>
                <div className="rounded-lg border border-c-secondary-border bg-c-secondary-soft px-4 py-4">
                  <div className="text-3xl font-bold text-c-secondary leading-none tracking-display">{roleCount}</div>
                  <div className="text-2xs text-c-secondary uppercase tracking-label font-semibold mt-2">Role presets</div>
                </div>
              </div>
            </div>
          )
        ) : !selectedCv && venues.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="bg-c-card border border-c-border rounded-xl w-full max-w-md">
              <EmptyState
                icon={<Buildings size={28} weight="duotone" />}
                title="No custom venues yet"
                description="Build a custom venue or getaway — set up its roles and schedule, then assign a lot whenever you like. Venues imported from your game show up here too."
                cta={{ label: '+ New venue', onClick: handleCreateVenue }}
              />
            </div>
          </div>
        ) : !selectedCv ? (
          <OverviewLanding
            title="Custom Venues at a glance"
            columns={3}
          >
            <HeroSplit
              total={venueStats.total}
              label={venueStats.total === 1 ? 'Venue' : 'Venues'}
              segments={[
                { value: venueStats.fromSave, label: 'from save', tone: 'green' },
                { value: venueStats.planned, label: 'planned', tone: 'plum' },
              ]}
            />
            <StatTile tone="neutral" label="Worlds" value={worldCount} sub="your venues span" icon={<GlobeHemisphereWest size={20} weight="duotone" />} />
            <StatTile tone="green" label="Schedule presets" value={scheduleCount} sub="in your library" icon={<CalendarBlank size={20} weight="duotone" />} />
            <StatTile tone="plum" label="Role presets" value={roleCount} sub="in your library" icon={<UsersThree size={20} weight="duotone" />} />
          </OverviewLanding>
        ) : (
          (() => {
            const isEditable = selectedCv.source === 'planner';
            const isGetaway = selectedCv.isGetaway;
            return (
          <div className="max-w-5xl flex flex-col gap-7">
            {isEditable ? (
              <>
                {/* Editor header — kind icon + editable name as the identity */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <img src={VENUE_KIND_ICON[isGetaway ? 'getaway' : 'venue']} alt="" className="w-11 h-11 object-contain shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">{isGetaway ? 'Getaway' : 'Custom Venue'}</div>
                      {/* Dashed underline + pencil = obviously an editable field, not a heading */}
                      <div className="group/name flex items-center gap-1.5 border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                        <input
                          value={editingName}
                          onChange={(e) => { setEditingName(e.target.value); setNameDirty(true); }}
                          onBlur={handleNameBlur}
                          placeholder={isGetaway ? 'Name this getaway…' : 'Name this venue…'}
                          className="flex-1 min-w-0 bg-transparent border-none text-3xl font-extrabold text-c-text tracking-headline outline-none placeholder:text-c-faint py-0.5"
                        />
                        <PencilSimple size={15} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
                      </div>
                    </div>
                  </div>

                  {/* Controls: getaway switch · host (getaway) · lot assignment */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Getaway — a real toggle switch so it reads as on/off, not a tag */}
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isGetaway}
                        onClick={() => toggleGetaway(!isGetaway)}
                        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer border-none shrink-0 ${isGetaway ? 'bg-c-secondary' : 'bg-c-border'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isGetaway ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-c-text">
                        <Backpack size={14} weight={isGetaway ? 'fill' : 'regular'} className={isGetaway ? 'text-c-secondary' : 'text-c-dim'} /> Getaway
                      </span>
                      <Tooltip text="Getaways are hosted by a household and only exist while you're actively playing it in-game. Unlike your other venues, a getaway you plan here is yours alone — it never syncs in from the save.">
                        <span className="inline-flex text-c-faint hover:text-c-dim cursor-help"><Info size={15} weight="bold" /></span>
                      </Tooltip>
                    </div>

                    {/* Host household — searchable picker */}
                    {isGetaway && (
                      <button type="button" onClick={() => setShowHostPicker(true)} className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-c-border bg-c-card px-3 py-1.5 cursor-pointer transition-colors hover:border-c-accent shadow-sm">
                        <Users size={14} weight="duotone" className="text-c-secondary" />
                        {selectedCv.hostHouseholdId
                          ? <span className="font-medium text-c-text">{households[selectedCv.hostHouseholdId]?.name ?? 'Host'}</span>
                          : <span className="text-c-dim">Choose host…</span>}
                        <CaretDown size={12} weight="bold" className="text-c-faint" />
                      </button>
                    )}

                    {/* Lot assignment. A getaway never takes a lot, so the
                        control is absent entirely rather than disabled. */}
                    {isGetaway ? null : selectedLot ? (
                      <span className="inline-flex items-center gap-2 rounded-lg bg-c-card border border-c-border shadow-sm pl-3 pr-1.5 py-1 text-sm">
                        <button
                          type="button"
                          onClick={() => navigate(`/saves/${saveFileId}/world/${encodeURIComponent(selectedLot.worldName)}?lot=${encodeURIComponent(selectedLot.lotKey)}`, { state: { from: `/saves/${saveFileId}/custom-venues` } })}
                          className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-c-text font-semibold hover:text-c-green hover:underline p-0"
                        >
                          <MapPin size={13} weight="fill" className="text-c-secondary" /> {selectedLot.customName || selectedLot.name}
                          <span className="text-c-dim font-normal">· {selectedLot.worldName}</span>
                        </button>
                        <button type="button" onClick={() => setShowPicker(true)} className="text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text bg-c-panel rounded-full px-2 py-0.5 cursor-pointer border-none">Change</button>
                        <button type="button" onClick={handleUnassignLot} aria-label="Unassign lot" className="text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-0.5 flex items-center"><X size={13} weight="bold" /></button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setShowPicker(true)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-c-border bg-c-card px-3 py-1.5 cursor-pointer transition-colors text-c-dim hover:border-c-accent hover:text-c-text shadow-sm">
                        <MapPin size={14} weight="bold" className="text-c-secondary" /> Assign a lot
                      </button>
                    )}

                    {/* Remove — grouped at the end of the meta row, not floating alone */}
                    <button onClick={handleDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                      <Trash size={13} weight="bold" /> Remove
                    </button>
                  </div>
                </div>

                {/* Two-panel: Schedule (left) + Roles (right), like the read-only view */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-7 items-start lg:grid-cols-[1.4fr_1fr]">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-bold text-c-text tracking-headline m-0 mb-3">
                      <Clock size={18} weight="duotone" className="text-c-secondary" /> Schedule
                      {/* Provenance rides the heading like the Roles count does —
                          quiet, and absent entirely when you built this yourself. */}
                      {scheduleOrigin && (
                        <span className="text-xs font-normal text-c-faint truncate min-w-0">{scheduleOrigin}</span>
                      )}
                    </h3>
                    <ScheduleEditor
                      slots={selectedCv.slots}
                      roles={selectedCv.roles}
                      onChange={patchSlots}
                      extraActions={<>
                        {/* Fixed label. "Use", not "Add", because applying a schedule
                            preset REPLACES this one — Roles next door genuinely adds,
                            and keeps its own verb. */}
                        <button type="button" onClick={() => setApplyKind('schedule')} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3.5 py-2 cursor-pointer transition-colors bg-c-base text-c-dim border-c-border hover:border-c-accent hover:text-c-text">
                          <CardsThree size={14} weight="fill" className="text-c-secondary shrink-0" /> Use a preset
                        </button>
                        {(selectedCv.slots.length > 0 || selectedCv.roles.length > 0) && (
                          <button type="button" onClick={() => setPresetSaveTarget({ kind: 'schedule' })} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer shrink-0">
                            <FloppyDisk size={14} weight="bold" /> Save as preset
                          </button>
                        )}
                      </>}
                    />
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-bold text-c-text tracking-headline m-0 mb-3">
                      <Users size={18} weight="duotone" className="text-c-secondary" /> Roles
                      {selectedCv.roles.length > 0 && <span className="text-xs font-normal text-c-faint">{rolesSummary(selectedCv.roles)}</span>}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <button type="button" onClick={addRole} className={btn('primary', { elevated: true })}>
                        <Plus size={14} weight="bold" /> Add role
                      </button>
                      <button type="button" onClick={() => setApplyKind('role')} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3.5 py-2 cursor-pointer transition-colors bg-c-base text-c-dim border-c-border hover:border-c-accent hover:text-c-text">
                        <CardsThree size={14} weight="fill" className="text-c-secondary" /> Add from preset
                      </button>
                    </div>
                    {selectedCv.roles.length > 0 && (
                      <div className="flex flex-col gap-2.5">
                        {selectedCv.roles.map((role) => (
                          <RoleEditorCard key={role.index} role={role} onChange={(patch) => updateRole(role.index, patch)} onRemove={() => removeRole(role.index)} onSaveAsPreset={() => setPresetSaveTarget({ kind: 'role', role })} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Read-only (imported) — same header shape as the editor */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <img src={VENUE_KIND_ICON.venue} alt="" className="w-11 h-11 object-contain shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">Custom Venue</div>
                      <h2
                        className="text-3xl font-extrabold text-c-text tracking-headline m-0 cursor-pointer hover:text-c-green transition-colors w-fit"
                        onClick={() => selectedLot && navigate(
                          `/saves/${saveFileId}/world/${encodeURIComponent(selectedLot.worldName)}?lot=${encodeURIComponent(selectedLot.lotKey)}`,
                          { state: { from: `/saves/${saveFileId}/custom-venues` } },
                        )}
                      >
                        {selectedLot ? (selectedLot.customName || selectedLot.name) : (selectedCv.name || '(custom venue)')}
                      </h2>
                    </div>
                  </div>

                  {/* Meta row: schedule/preset tag · world · Remove */}
                  <div className="flex items-center gap-2 text-sm text-c-dim flex-wrap">
                    {selectedCv.name && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-c-secondary-soft border border-c-secondary-border px-2.5 py-0.5">
                        <Tag size={12} weight="fill" className="text-c-secondary" />
                        <span className="text-xs font-semibold text-c-secondary">{selectedCv.name}</span>
                      </span>
                    )}
                    {selectedLot && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={14} weight="fill" className="text-c-secondary shrink-0" />
                        {selectedLot.worldName}
                      </span>
                    )}
                    <button onClick={handleDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                      <Trash size={13} weight="bold" /> Remove
                    </button>
                  </div>
                </div>

                {/* Schedule (left) + Roles (right) */}
                <div className={`grid grid-cols-1 gap-x-8 gap-y-7 items-start ${selectedCv.slots.length > 0 ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
                  {selectedCv.slots.length > 0 && (
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold text-c-text tracking-headline m-0 mb-3">
                        <Clock size={18} weight="duotone" className="text-c-secondary" /> Schedule
                      </h3>
                      <ScheduleList venue={selectedCv} />
                    </div>
                  )}
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-bold text-c-text tracking-headline m-0 mb-3">
                      <Users size={18} weight="duotone" className="text-c-secondary" /> Roles
                      {selectedCv.roles.length > 0 && (
                        <span className="text-xs text-c-faint font-normal">{rolesSummary(selectedCv.roles)}</span>
                      )}
                    </h3>
                    {selectedCv.roles.length > 0 ? (
                      <div className="flex flex-col gap-2.5">
                        {selectedCv.roles.map((role, i) => (
                          <RoleRow key={i} role={role} expanded={expandedRoles.has(role.index)} onToggle={() => toggleRole(role.index)} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-c-faint italic">
                        No role data yet — set up this venue's roles in-game, then re-sync to see them here.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Notes — private */}
            <Notes
              value={editingNotes}
              onChange={(v) => { setEditingNotes(v); setIsDirty(true); }}
              onBlur={handleNotesBlur}
              rows={4}
            />
          </div>
            );
          })()
        )}
      </div>
      </MasterDetail.Detail>

      {showPicker && selectedCv && (
        <LotPickerModal
          onClose={() => setShowPicker(false)}
          onSelect={handleAssignLot}
          trackedLotKeys={trackedLotKeys}
        />
      )}

      {showHostPicker && selectedCv && (
        <CatalogPickerModal
          title="Choose host household"
          items={Object.values(households).sort((a, b) => a.name.localeCompare(b.name)).map((h) => ({ id: h.id, name: h.name }))}
          onSelect={(items) => { if (items[0]) setHost(items[0].id); }}
          onClose={() => setShowHostPicker(false)}
        />
      )}

      {applyKind && selectedCv && (
        <PresetPickerModal
          kind={applyKind}
          presets={allPresets}
          onPick={(p) => { if (applyKind === 'schedule') pickSchedulePreset(p); else addRoleFromPreset(p); }}
          onClose={() => setApplyKind(null)}
        />
      )}

      {/* Destructive-replace warning — start-from over a non-empty schedule */}
      {pendingReplace && selectedCv && (
        <div className="fixed inset-0 bg-black/75 z-[310] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) setPendingReplace(null); }}>
          <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[440px] overflow-hidden">
            <div className="px-5 py-4 border-b border-c-border flex items-center gap-2">
              <Warning size={18} weight="fill" className="text-amber-500" />
              <h3 className="text-base font-bold text-c-text tracking-headline m-0">Replace your current schedule?</h3>
            </div>
            <div className="p-5 flex flex-col gap-4 bg-c-base">
              <p className="text-sm text-c-dim m-0">Starting from <strong className="text-c-text">{pendingReplace.name || 'this preset'}</strong> replaces this venue's current schedule and roles. Auto-save means there's no undo.</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => { setSaveThenApply(pendingReplace); setPresetSaveTarget({ kind: 'schedule' }); setPendingReplace(null); }} className={btn('primary', { block: true })}>
                  <FloppyDisk size={14} weight="bold" /> Save current as a preset first
                </button>
                <button onClick={() => { applySchedulePreset(pendingReplace); setPendingReplace(null); }} className="w-full text-sm font-semibold rounded-md px-4 py-2 cursor-pointer transition-colors bg-c-panel text-c-text hover:bg-c-border border-none">
                  Replace anyway
                </button>
                <button onClick={() => setPendingReplace(null)} className={btn('ghost', { block: true })}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {presetSaveTarget && selectedCv && (() => {
        const isSched = presetSaveTarget.kind === 'schedule';
        const srcId = isSched ? selectedCv.sourcePresetId : presetSaveTarget.role.sourcePresetId;
        // Only YOUR planner presets of the matching kind are overwritable.
        const srcPreset = srcId ? allPresets.find((p) => p.id === srcId && p.origin === 'planner' && p.kind === presetSaveTarget.kind) ?? null : null;
        const applyAfter = () => { if (saveThenApply) { applySchedulePreset(saveThenApply); setSaveThenApply(null); } };
        return (
          <SavePresetModal
            title={isSched ? 'Save schedule as preset' : 'Save role as preset'}
            defaultName={isSched ? (selectedCv.name || scheduleSource?.name || '') : (presetSaveTarget.role.name || '')}
            updateTarget={srcPreset ? { name: srcPreset.name } : null}
            onUpdate={srcPreset ? async () => {
              const data = isSched ? { roles: selectedCv.roles.map(stripRoleProvenance), slots: selectedCv.slots } : stripRoleProvenance(presetSaveTarget.role);
              await updateCustomVenuePreset(srcPreset.id, { name: srcPreset.name, data });
              setPresetSaveTarget(null);
              applyAfter();
            } : undefined}
            onSave={async (name) => {
              // Link the source to the preset it just created, so a later edit can Update it.
              if (isSched) {
                const newId = await addCustomVenuePreset({ kind: 'schedule', name, data: { roles: selectedCv.roles.map(stripRoleProvenance), slots: selectedCv.slots } });
                if (!saveThenApply) updateCustomVenue(selectedCv.id, { sourcePresetId: newId });
              } else {
                const ri = presetSaveTarget.role.index;
                const newId = await addCustomVenuePreset({ kind: 'role', name, data: stripRoleProvenance(presetSaveTarget.role) });
                patchRoles(selectedCv.roles.map((r) => (r.index === ri ? { ...r, sourcePresetId: newId } : r)));
              }
              setPresetSaveTarget(null);
              applyAfter();
            }}
            onClose={() => { setPresetSaveTarget(null); setSaveThenApply(null); }}
          />
        );
      })()}
      </MasterDetail>
    </div>
  );
}
