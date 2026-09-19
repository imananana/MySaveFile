/**
 * Shared "Sim filter" requirement editor — used by club membership requirements,
 * small-business customer requirements, and custom-venue role requirements.
 *
 * The in-game model (confirmed via the Role Criteria screen): there is ONE
 * requirement per criterion TYPE, and a requirement holds MULTIPLE values that
 * mean "any of" (e.g. Age = Teen, Young Adult, Adult is a single requirement;
 * Career = Civil Designer OR Computer Team is a single requirement — you can't be
 * in two careers at once). So adding a value MERGES into the existing requirement
 * of that type rather than creating a second one. A few types are single-select
 * (one value, one requirement): gender, orientation, marital, relationship.
 *
 * This module owns the generic pieces; each feature passes its own category list
 * + criterion adapters (the stored criterion shapes differ slightly).
 */
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Check, MagnifyingGlass, LockSimple } from '@phosphor-icons/react';
import type { Choice } from '../../data/criteriaCatalogs';
import { criterionValueIcons } from '../../data/venueIcons';
import { getSkillPack, getTraitPack, getCareerPack } from '../../data/packAssignments';
import { usePackOwnership } from '../../store/usePackOwnership';
import type { VenueCriterion } from '../../lib/parser/types';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn } from './btn';
import { Tooltip } from './Tooltip';

export type ReqOpt = { v: number; l: string };
export type ReqCategory = {
  type: string;            // criterion type key ('skill' | 'career' | 'age' | …)
  label: string;
  raw: number;             // raw type code stored on the criterion
  kind: 'enum' | 'catalog';
  opts?: ReqOpt[];         // enum: the fixed value choices
  catalog?: Choice[];      // catalog: searchable id/name list (skills/traits/careers)
};

/** Types where a sim has exactly one value, so the requirement is single-select.
 *  (gender / orientation / marital / relationship are identity-or-status picks;
 *  funds is a single financial-status tier.) */
export const SINGLE_SELECT_TYPES = new Set(['gender', 'orientation', 'marital', 'relationship', 'funds']);
export const isSingleSelect = (type: string) => SINGLE_SELECT_TYPES.has(type);

// Catalog criterion types whose values map to a pack (so they can be pack-gated).
// Catalog ids are the decimal form of the tuning hex → convert back to look up.
const CATALOG_PACK_OF: Record<string, (hex: string) => string> = {
  skill: getSkillPack,
  trait: getTraitPack,
  career: getCareerPack,
};
const decimalIdToHex = (id: string) => '0x' + Number(id).toString(16);

/**
 * Filter a criteria category list down to the packs the user owns — so the
 * skill/trait/career pickers only offer content you have, matching the sim
 * panel. Non-pack catalogs (activities) and enum categories pass through
 * untouched. Only gates what you can ADD; stored criteria still resolve by value.
 */
export function useOwnedCategories(categories: ReqCategory[]): ReqCategory[] {
  const isOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  return useMemo(() => categories.map((c) => {
    const packOf = CATALOG_PACK_OF[c.type];
    if (c.kind !== 'catalog' || !c.catalog || !packOf) return c;
    return { ...c, catalog: c.catalog.filter((ch) => isOwned(packOf(decimalIdToHex(ch.id)))) };
  }), [categories, isOwned, manualOverrides, autoDetected]);
}

/**
 * Merge values into the criteria list as ONE criterion per type. `find` locates an
 * existing criterion of the same type; `make` builds a fresh one; `setValues`
 * returns a copy with new values. Multi-select types union (deduped); single-select
 * types replace.
 */
export function mergeValues<T>(
  list: T[],
  type: string,
  values: number[],
  find: (c: T) => boolean,
  getValues: (c: T) => number[],
  make: (values: number[]) => T,
  setValues: (c: T, values: number[]) => T,
): T[] {
  const idx = list.findIndex(find);
  if (idx === -1) return [...list, make(values)];
  if (isSingleSelect(type)) return list.map((c, i) => (i === idx ? make(values) : c));
  const union = [...new Set([...getValues(list[idx]), ...values])];
  return list.map((c, i) => (i === idx ? setValues(list[idx], union) : c));
}

// ─── Catalog picker (single OR multi select) ──────────────────────────────────

const CATEGORY_ORDER = ['SOCIAL', 'FOOD_AND_DRINK', 'ART_AND_MUSIC', 'FUN_AND_GAMES', 'HOBBIES', 'OUTDOOR', 'HOME_ACTIVITIES', 'KID_ACTIVITIES', 'MISCHIEF_AND_MAYHEM'];
const CATEGORY_LABEL: Record<string, string> = {
  SOCIAL: 'Social', FOOD_AND_DRINK: 'Food & Drink', ART_AND_MUSIC: 'Art & Music', FUN_AND_GAMES: 'Fun & Games',
  HOBBIES: 'Hobbies', OUTDOOR: 'Outdoor', HOME_ACTIVITIES: 'Home', KID_ACTIVITIES: 'Kids', MISCHIEF_AND_MAYHEM: 'Mischief & Mayhem',
};

/** Searchable picker.
 *  - Single-select: a tap selects and closes.
 *  - Multi-select is an EDIT-SET: pass `preselected` to open pre-checked; uncheck
 *    to remove; **Done REPLACES the whole set** (empty is allowed). Item states:
 *      · `preselected`  — checked, removable
 *      · `lockedIds`    — checked + can't uncheck (game-truth, e.g. observed skills)
 *      · `disabledIds`  — unchecked + can't add (cross-exclusion, e.g. the other bucket)
 *      · `maxSelected`  — caps additions in-modal (greys the rest, shows N / max)
 *  Callers that omit `preselected` keep the legacy add-mode (returns only the newly
 *  checked, "Add N" button). Categorized items get filter pills + grouped sections. */
/** Below this many options the list fits on screen, so a search box is noise. */
const SEARCH_THRESHOLD = 8;

export function CatalogPickerModal({ title, items, onSelect, onClose, multiSelect = false, disabledIds, preselected, lockedIds, maxSelected }: {
  title: string;
  items: Choice[];
  onSelect: (items: Choice[]) => void;
  onClose: () => void;
  multiSelect?: boolean;
  disabledIds?: Set<string>;
  preselected?: Set<string>;
  lockedIds?: Set<string>;
  maxSelected?: number;
}) {
  useEscapeToClose(onClose);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const isEditSet = multiSelect && preselected !== undefined;
  const [picked, setPicked] = useState<Set<string>>(() => new Set([...(preselected ?? []), ...(lockedIds ?? [])]));
  const atCap = maxSelected != null && picked.size >= maxSelected;
  const hasCats = items.some((i) => i.cat);
  // Known activity categories keep their fixed order/labels; any OTHER cat string
  // (e.g. degree schools) becomes its own section in first-appearance order,
  // labeled by the string itself. Cat-less items in a mixed set fall to "Other".
  const catLabel = (c: string) => CATEGORY_LABEL[c] ?? (c === 'OTHER' ? 'Other' : c);
  const cats = useMemo(() => {
    const present = CATEGORY_ORDER.filter((c) => items.some((i) => i.cat === c));
    for (const i of items) if (i.cat && !CATEGORY_LABEL[i.cat] && !present.includes(i.cat)) present.push(i.cat);
    return present;
  }, [items]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!activeCat || (i.cat ?? 'OTHER') === activeCat));
  }, [items, search, activeCat]);
  const groups = useMemo(() => {
    if (!hasCats || activeCat) return null;
    const m = new Map<string, Choice[]>();
    for (const i of filtered) { const k = i.cat ?? 'OTHER'; (m.get(k) ?? m.set(k, []).get(k)!).push(i); }
    const ordered = cats.filter((c) => m.has(c)).map((c) => ({ key: c, label: catLabel(c), items: m.get(c)! }));
    if (m.has('OTHER')) ordered.push({ key: 'OTHER', label: 'Other', items: m.get('OTHER')! });
    return ordered;
  }, [filtered, hasCats, activeCat, cats]);

  function tap(item: Choice) {
    if (disabledIds?.has(item.id) || lockedIds?.has(item.id)) return; // can't add / can't uncheck
    if (!multiSelect) { onSelect([item]); onClose(); return; }
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(item.id)) n.delete(item.id);
      else { if (maxSelected != null && n.size >= maxSelected) return s; n.add(item.id); }
      return n;
    });
  }
  function confirm() {
    const chosen = items.filter((i) => picked.has(i.id));
    if (chosen.length || isEditSet) onSelect(chosen); // edit-set may replace with an empty set
    onClose();
  }

  const Row = (item: Choice) => {
    const locked = !!lockedIds?.has(item.id);
    const on = picked.has(item.id) || locked;
    const off = !locked && (disabledIds?.has(item.id) || (atCap && !on)); // unaddable
    return (
      <button key={item.id} disabled={off || locked} onClick={() => tap(item)} className={`flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel text-left items-center gap-2.5 transition-colors ${locked ? 'cursor-default' : off ? 'opacity-40 cursor-default' : 'cursor-pointer hover:bg-c-accent-soft'}`}>
        {multiSelect && (
          locked
            ? <span title="From save — can't remove" className="w-4 h-4 rounded border bg-c-accent border-c-accent flex items-center justify-center shrink-0"><LockSimple size={9} weight="bold" className="text-white" /></span>
            : <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-c-accent border-c-accent' : 'border-c-border'}`}>{on && <Check size={11} weight="bold" className="text-white" />}</span>
        )}
        {item.icon && <img src={item.icon} alt="" className="w-6 h-6 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
        <span className={`text-sm font-medium truncate ${locked ? 'text-c-dim' : 'text-c-text'}`}>{item.name}</span>
      </button>
    );
  };
  const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} className={`flex-1 whitespace-nowrap text-center text-2xs font-semibold rounded-full px-3 py-1.5 cursor-pointer border transition-colors ${active ? 'bg-c-accent border-c-accent text-white' : 'bg-c-base border-c-border text-c-dim hover:border-c-accent hover:text-c-text'}`}>{label}</button>
  );

  // Portal to <body>: opened from panels that may live under a transformed
  // ancestor (e.g. the Households workspace aside), which would otherwise scope
  // this fixed overlay to that box instead of the full viewport.
  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        {/* A search field over a list you can already see in full is furniture,
            not a tool -- "Choose age" offers five options and had a search box
            above them. It appears once the list is long enough to scroll. */}
        {items.length > SEARCH_THRESHOLD && (
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        )}
        {hasCats && (
          <div className="px-3 py-2.5 border-b border-c-border flex flex-wrap gap-1.5">
            <Pill label="All" active={!activeCat} onClick={() => setActiveCat(null)} />
            {cats.map((c) => <Pill key={c} label={catLabel(c)} active={activeCat === c} onClick={() => setActiveCat(c)} />)}
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {groups ? groups.map((g) => (
            <div key={g.key}>
              <div className="sticky top-0 bg-c-card px-4 py-2 text-2xs text-c-faint uppercase tracking-label font-semibold border-b border-c-panel">{g.label}</div>
              {g.items.map(Row)}
            </div>
          )) : filtered.map(Row)}
          {filtered.length === 0 && <div className="px-4 py-10 text-center text-xs text-c-faint">No matches</div>}
        </div>
        {multiSelect && (
          <div className="px-4 py-3 border-t border-c-border flex items-center gap-3 justify-end">
            {maxSelected != null && (
              <span className={`mr-auto text-2xs font-semibold tabular-nums ${atCap ? 'text-c-red' : 'text-c-faint'}`}>{picked.size} / {maxSelected}</span>
            )}
            <button type="button" onClick={confirm} disabled={!isEditSet && picked.size === 0} className={btn('primary')}>{isEditSet ? 'Done' : `Add ${picked.size || ''}`}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Requirement chip (one criterion type, its values each removable) ─────────

/** A criterion chip: the TYPE label + each value as a removable sub-pill ("any of",
 *  matching the in-game multi-value criterion). Removing the last value drops the
 *  whole criterion. Optional per-value icon + trailing meta (e.g. caregiver note). */
export function RequirementChip({ typeLabel, values, valueLabel, valueIcon, onRemoveValue, onEdit, meta }: {
  typeLabel: string;
  values: number[];
  valueLabel: (i: number) => string;
  valueIcon?: (i: number) => string | undefined;
  onRemoveValue?: (i: number) => void;   // omit for read-only display (no ✕)
  onEdit?: () => void;                    // click the TYPE label to edit the whole value set
  meta?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-c-panel border border-c-border px-2 py-1">
      {onEdit
        ? <Tooltip text="Edit values">
          <button type="button" onClick={onEdit} className="text-[10px] font-bold uppercase tracking-label text-c-secondary shrink-0 bg-transparent border-none cursor-pointer hover:underline p-0" aria-label="Edit values">{typeLabel}</button>
        </Tooltip>
        : <span className="text-[10px] font-bold uppercase tracking-label text-c-secondary shrink-0">{typeLabel}</span>}
      <span className="flex flex-wrap items-center gap-1">
        {values.map((_, i) => {
          const icon = valueIcon?.(i);
          return (
            <span key={i} className="group/val inline-flex items-center gap-1 rounded-md bg-c-card border border-c-border px-1.5 py-0.5">
              {icon && <img src={icon} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
              <span className="text-xs text-c-text">{valueLabel(i)}</span>
              {onRemoveValue && <button type="button" onClick={() => onRemoveValue(i)} aria-label="Remove" className="text-c-faint hover:text-c-red hidden group-hover/val:flex focus:flex bg-transparent border-none cursor-pointer items-center"><X size={10} weight="bold" /></button>}
            </span>
          );
        })}
      </span>
      {meta}
    </span>
  );
}

// ─── Builder (category → values → commit) ─────────────────────────────────────

/** "Add to a list" affordance for requirements: a single green `+ Add requirement`
 *  button → category picker → value picker, mirroring the `+ Add activity` flow so
 *  every editor adds new items the same way. Both steps reuse CatalogPickerModal
 *  (single-tap to pick a category; multi/single-select for the values depending on
 *  the type). When `atMax`, the button is hidden (the N/5 header conveys the cap);
 *  an optional `capLabel` may still be shown. */
/** A category's selectable values as Choices (catalog list as-is, or enum opts
 *  mapped to the same shape). Shared by the add-builder and the value editor. */
export function valueChoicesForCat(cat: ReqCategory): Choice[] {
  if (cat.kind === 'catalog') return cat.catalog ?? [];
  // Enum values resolve their own art centrally (age→lifestage, occult/fame/
  // marital/funds→criteria-icons); gender/orientation/relationship have none.
  return (cat.opts ?? []).map((o) => ({ id: String(o.v), name: o.l, icon: criterionValueIcons(cat.type as VenueCriterion['type'], o.v)[0] }));
}

export function RequirementBuilder({ categories, onAdd, atMax, capLabel, usedTypes, onEditExisting }: {
  categories: ReqCategory[];
  onAdd: (type: string, raw: number, values: number[]) => void;
  atMax?: boolean;
  capLabel?: string;
  /** Types already present on this entity. */
  usedTypes?: Set<string>;
  /**
   * Re-open an existing requirement of that type, pre-checked, instead of
   * refusing to add a second one.
   *
   * One criterion per type is the GAME's model, not ours — a requirement holds
   * many values meaning "any of", so Skill = Bartending OR Cooking is one
   * requirement with two values. That part has to stay if the plan is going to
   * be a valid save. What didn't have to stay was greying the row: someone who
   * had added Bartending and came back for Cooking hit a dead entry that
   * explained nothing, and reasonably read it as a bug. Now picking an existing
   * type opens the same editor its chip opens, with what you already chose
   * already ticked, so "add another" and "amend" are the same gesture.
   */
  onEditExisting?: (type: string) => void;
}) {
  const [pickingCat, setPickingCat] = useState(false);
  const [cat, setCat] = useState<ReqCategory | null>(null);
  // Gate the skill/trait/career catalogs to owned packs (base content always included).
  const ownedCategories = useOwnedCategories(categories);

  function reset() { setPickingCat(false); setCat(null); }

  if (atMax) return capLabel ? <p className="text-2xs text-c-faint">{capLabel}</p> : null;

  const categoryItems: Choice[] = ownedCategories.map((c) => ({ id: c.type, name: c.label }));
  const valueItems: Choice[] = cat ? valueChoicesForCat(cat) : [];
  const multi = cat ? !isSingleSelect(cat.type) : false;

  return (
    <>
      <button
        type="button"
        onClick={() => setPickingCat(true)}
        className="self-start inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent"
      >
        <Plus size={14} weight="bold" /> Add requirement
      </button>

      {/* Step 1 — pick the category (single tap advances to the value step).
          An already-used type hands off to its editor rather than dead-ending;
          only call sites that haven't wired that up still grey the row. */}
      {pickingCat && (
        <CatalogPickerModal
          title="Add a requirement"
          items={categoryItems}
          disabledIds={onEditExisting ? undefined : usedTypes}
          onSelect={(items) => {
            const type = items[0]?.id;
            if (type && onEditExisting && usedTypes?.has(type)) { reset(); onEditExisting(type); return; }
            setCat(ownedCategories.find((c) => c.type === type) ?? null);
          }}
          onClose={() => setPickingCat(false)}
        />
      )}

      {/* Step 2 — pick value(s) for that category. */}
      {cat && (
        <CatalogPickerModal
          title={`Choose ${cat.label.toLowerCase()}`}
          items={valueItems}
          multiSelect={multi}
          onSelect={(picked) => { onAdd(cat.type, cat.raw, picked.map((p) => Number(p.id))); reset(); }}
          onClose={reset}
        />
      )}
    </>
  );
}

/** Edit ONE existing criterion's value set (click-a-chip flow): opens the value
 *  picker pre-checked; Done REPLACES that criterion's values (empty clears it).
 *  Single-value types stay single-select. */
export function RequirementValuePicker({ cat, values, onReplace, onClose }: {
  cat: ReqCategory;
  values: number[];
  onReplace: (values: number[]) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const multi = !isSingleSelect(cat.type);
  return (
    <CatalogPickerModal
      title={`Edit ${cat.label.toLowerCase()}`}
      items={valueChoicesForCat(cat)}
      multiSelect={multi}
      preselected={multi ? new Set(values.map(String)) : undefined}
      onSelect={(picked) => onReplace(picked.map((p) => Number(p.id)))}
      onClose={onClose}
    />
  );
}

/** Replace one criterion's values wholesale (find by type → overwrite; create if
 *  missing; drop the criterion when the new set is empty). Sibling of mergeValues. */
export function replaceValues<T>(
  list: T[], values: number[],
  find: (c: T) => boolean,
  make: (values: number[]) => T,
  setValues: (c: T, values: number[]) => T,
): T[] {
  const idx = list.findIndex(find);
  if (idx === -1) return values.length ? [...list, make(values)] : list;
  if (!values.length) return list.filter((_, i) => i !== idx);
  return list.map((c, i) => (i === idx ? setValues(list[idx], values) : c));
}
