import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  X, Plus, MapPin, PencilSimple, Trash, Storefront, UsersThree, MagnifyingGlass,
  ImageSquare, Star, ShieldCheck, Funnel, Briefcase, Ticket, Tag,
} from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSaveFile } from '../store/useSaveFile';
import type { SmallBusiness, Sim } from '../types';
import type { SmallBusinessCustomerCriterion, VenueCriterion } from '../lib/parser/types';
import { IconPickerModal } from '../components/common/IconPicker';
import { compareWorldsCanonical, canConvertToSmallBusinessVenue, isHomeBusinessLot, neighborhoodLabel } from '../data/worlds';
import { useConfirm } from '../components/common/ConfirmDialog';
import { MasterDetail } from '../components/common/MasterDetail';
import { EmptyState } from '../components/common/EmptyState';
import { PackNotOwnedBanner } from '../components/common/PackNotOwnedBanner';
import {
  customerCriterionTypeLabel, customerCriterionValueText, supervisedCustomerLabel,
} from '../data/venueLabels';
import { criterionValueIcons } from '../data/venueIcons';
import { clubActivityIconUrl } from '../data/stockClubActivities';
import { smallBusinessAlignmentLabel, smallBusinessRankLabel } from '../data/stockBusinessPerks';
import { STOCK_OCCULTS } from '../data/stockOccults';
import { type Choice, SKILL_CHOICES, TRAIT_CHOICES, CAREER_CHOICES, ACTIVITY_CHOICES } from '../data/criteriaCatalogs';
import { CatalogPickerModal, RequirementBuilder, RequirementChip, RequirementValuePicker, mergeValues, replaceValues, type ReqOpt, type ReqCategory } from '../components/common/RequirementEditor';
import { useListKeyboardNav } from '../hooks/useListKeyboardNav';
import { Notes, MirroredDescription } from '../components/common/EntityText';
import { OverviewLanding, HeroSplit, StatTile } from '../components/common/OverviewTiles';
import { Pill } from '../components/common/Pill';
import { useEscapeToClose } from '../components/common/useEscapeToClose';
import { btn, iconBtn } from '../components/common/btn';
import { Tooltip } from '../components/common/Tooltip';
import { PlannerPill } from '../components/common/PlannerPill';
import { WarnCallout } from '../components/common/WarnCallout';

// Eligibility lives in src/data/worlds.ts (isHomeBusinessLot / isSmallBusinessEligible,
// B1) so this page, the lot editor and the re-sync yield can't drift apart.
//
// The vacant-lot branch below honours invariant B2 (a home business sits on an
// OCCUPIED lot, owner = resident) rather than breaking it: picking an empty lot
// as a home business MOVES THE OWNER'S HOUSEHOLD IN first, and only then assigns
// the business — so by the time the business lands, the owner lives there and
// the lot keeps its home type. Converting it instead would be the contradiction:
// a Small Business Venue can't hold residents, and the next sync would revert
// the type straight back.

// Lifestage values are stored camelCase ('youngAdult'); display as "young adult".
function lifestageLabel(lifestage: string): string {
  return lifestage.replace(/([A-Z])/g, ' $1').toLowerCase();
}

// A small business owner must be at least a child — toddlers, infants, and
// newborns (and pets) can't run a business, so they're hidden from the owner
// picker.
const OWNER_INELIGIBLE_LIFESTAGES = new Set(['newborn', 'infant', 'toddler', 'pet']);
// An employee must be at least a teen (teens can work; children and below can't).
const EMPLOYEE_INELIGIBLE_LIFESTAGES = new Set(['newborn', 'infant', 'toddler', 'child', 'pet']);

// One labeled group inside the editor card — uppercase micro-label + content.
function Field({ label, icon, count, action, children }: { label: string; icon?: ReactNode; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 text-2xs font-semibold text-c-dim uppercase tracking-label">
          {icon}
          {label}
          {count != null && count > 0 && <span className="text-c-faint font-normal normal-case tracking-normal">· {count}</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Pricing helpers ─────────────────────────────────────────────────────────
// Price modifier shows a signed percent exactly as the in-game menu (-50% …
// +100%, always signed including +0%). Maps 1:1 to the stored integer.
const priceLabel = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;
const PRICE_OPTS = [-50, -25, 0, 50, 100];
const FEE_MODE_LABEL: Record<SmallBusiness['feeMode'], string> = {
  disabled: 'No entrance fee',
  hourly: 'Hourly fee',
  'one-time': 'One-time entrance fee',
  unknown: 'Not set',
};
const FEE_MODE_OPTS: { v: SmallBusiness['feeMode']; l: string }[] = [
  { v: 'disabled', l: 'No fee' }, { v: 'hourly', l: 'Hourly' }, { v: 'one-time', l: 'One-time' },
];

// ── Option sets for authoring. Skill/trait/career/activity catalogs are shared
// across clubs + small businesses (+ future custom venues) via criteriaCatalogs. ─
type CustCat = SmallBusinessCustomerCriterion['category'];

const MAX_SB_REQUIREMENTS = 5;
const MAX_SB_ACTIVITIES = 5;

const AGE_OPTS: ReqOpt[] = [{ v: 4, l: 'Child' }, { v: 8, l: 'Teen' }, { v: 16, l: 'Young Adult' }, { v: 32, l: 'Adult' }, { v: 64, l: 'Elder' }];
const SUPERVISED_OPTS: ReqOpt[] = [0, 1, 2, 3, 4, 5].map((v) => ({ v, l: supervisedCustomerLabel(v) }));
const OCCULT_OPTS: ReqOpt[] = Object.entries(STOCK_OCCULTS).map(([hex, name]) => ({ v: parseInt(hex, 16), l: name }));
const MARITAL_OPTS: ReqOpt[] = [{ v: 0, l: 'Married' }, { v: 1, l: 'Not Married' }];
const FUNDS_OPTS: ReqOpt[] = [{ v: 0, l: 'Poor' }, { v: 1, l: 'Moderate' }, { v: 2, l: 'Wealthy' }];
const FAME_OPTS: ReqOpt[] = [1, 2, 3, 4, 5].map((n) => ({ v: n, l: `Level ${n}` }));

// Target-customer categories the builder can author. raw = parser's CUSTOMER_CRITERION_TYPE
// code. Single-vs-multi select is derived centrally (RequirementEditor.isSingleSelect).
const CUST_CATEGORIES: { type: CustCat; label: string; raw: number; kind: 'enum' | 'catalog'; opts?: ReqOpt[]; catalog?: Choice[] }[] = [
  { type: 'supervised', label: 'Supervised customer', raw: 8, kind: 'enum', opts: SUPERVISED_OPTS },
  { type: 'age', label: 'Age', raw: 5, kind: 'enum', opts: AGE_OPTS },
  { type: 'skill', label: 'Skill', raw: 0, kind: 'catalog', catalog: SKILL_CHOICES },
  { type: 'trait', label: 'Trait', raw: 1, kind: 'catalog', catalog: TRAIT_CHOICES },
  { type: 'career', label: 'Career', raw: 3, kind: 'catalog', catalog: CAREER_CHOICES },
  { type: 'occult', label: 'Occult', raw: 9, kind: 'enum', opts: OCCULT_OPTS },
  { type: 'marital', label: 'Marital status', raw: 2, kind: 'enum', opts: MARITAL_OPTS },
  { type: 'funds', label: 'Financial status', raw: 4, kind: 'enum', opts: FUNDS_OPTS },
  { type: 'fame', label: 'Celebrity level', raw: 7, kind: 'enum', opts: FAME_OPTS },
];

/** Merge values into the customer criteria as one criterion per category (keeps
 *  existing required/caregiver when extending a category; sets them on a new one). */
function mergeCustomerCriteria(existing: SmallBusinessCustomerCriterion[], category: CustCat, raw: number, values: number[], required: boolean, caregiver: boolean): SmallBusinessCustomerCriterion[] {
  return mergeValues<SmallBusinessCustomerCriterion>(
    existing, category as string, values,
    (c) => c.category === category,
    (c) => c.values,
    (vals) => ({ category, rawCategory: raw, values: vals, required, caregiverStays: caregiver }),
    (c, vals) => ({ ...c, values: vals }),
  );
}
function replaceCustomerCriteria(existing: SmallBusinessCustomerCriterion[], category: CustCat, raw: number, values: number[]): SmallBusinessCustomerCriterion[] {
  return replaceValues<SmallBusinessCustomerCriterion>(
    existing, values,
    (c) => c.category === category,
    (vals) => ({ category, rawCategory: raw, values: vals, required: true, caregiverStays: false }),
    (c, vals) => ({ ...c, values: vals }), // preserves required + caregiverStays
  );
}

// Icons for a customer criterion. 'supervised'/'unknown' have no per-value art;
// everything else reuses the venue criterion icon resolver.
function customerCriterionIcons(c: SmallBusinessCustomerCriterion): string[] {
  if (c.category === 'supervised' || c.category === 'unknown') return [];
  const seen = new Set<string>();
  for (const v of c.values) for (const u of criterionValueIcons(c.category as VenueCriterion['type'], v)) seen.add(u);
  return [...seen];
}

// ── Alignment tone (1=Nefarious … 4=Neutral … 7=Virtuous) ───────────────────
function alignmentTone(level: number): string {
  if (level < 4) return 'text-c-secondary';
  if (level > 4) return 'text-c-green';
  return 'text-c-dim';
}

// One target-customer requirement chip (read-only display + optional remove).
function CustomerChip({ c, onRemove }: { c: SmallBusinessCustomerCriterion; onRemove?: () => void }) {
  const icons = customerCriterionIcons(c);
  return (
    <span className="inline-flex items-center gap-2.5 rounded-xl bg-c-base border border-c-border pl-2.5 pr-3 py-2">
      {icons.length > 0 && (
        <span className="flex items-center gap-1 shrink-0">
          {icons.map((src, i) => (
            <img key={i} src={src} alt="" className="w-7 h-7 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ))}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-label text-c-secondary">
          {customerCriterionTypeLabel(c)}
          {c.required && <span className="text-c-green normal-case tracking-normal font-semibold">· required</span>}
        </span>
        <span className="block text-sm font-semibold text-c-text">{customerCriterionValueText(c)}</span>
        {c.category === 'supervised' && c.caregiverStays && (
          <span className="block text-2xs text-c-faint">Caregiver stays at business</span>
        )}
      </span>
      {onRemove && (
        <Tooltip text="Remove">
          <button type="button" onClick={onRemove} className="ml-0.5 text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-0 leading-none shrink-0" aria-label="Remove">
            <X size={13} weight="bold" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

// One offered-activity chip (read-only + optional remove). Icon resolves by activity id.
function ActivityChip({ id, name, onRemove }: { id: string; name: string; onRemove?: () => void }) {
  const icon = clubActivityIconUrl(id);
  return (
    <span className="inline-flex items-center gap-2.5 rounded-xl bg-c-accent-soft border border-c-accent-border pl-2.5 pr-3 py-2">
      {icon && <img src={icon} alt="" className="w-7 h-7 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
      <span className="text-sm font-semibold text-c-text">{name}</span>
      {onRemove && (
        <Tooltip text="Remove">
          <button type="button" onClick={onRemove} className="ml-0.5 text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-0 leading-none shrink-0" aria-label="Remove">
            <X size={13} weight="bold" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

function SBLotPickerModal({ onClose, onSelect, excludeKeys, ownerHouseholdId }: { onClose: () => void; onSelect: (lotKey: string) => void; excludeKeys: Set<string>; ownerHouseholdId: string | null }) {
  useEscapeToClose(onClose);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const [search, setSearch] = useState('');

  // Owner's home (home business, top) vs everything else (existing Small Business
  // lots + vacant residential lots, grouped by world). Residential lots occupied
  // by another household are not eligible.
  const { ownerHome, byWorld } = useMemo(() => {
    const q = search.toLowerCase();
    const disabledSet = new Set(disabledWorlds);
    let ownerHome: typeof lots[string] | null = null;
    const byWorld: Record<string, typeof lots[string][]> = {};
    const matches = (lot: typeof lots[string]) => !q || (lot.customName || lot.name).toLowerCase().includes(q) || lot.worldName.toLowerCase().includes(q);
    for (const lot of Object.values(lots)) {
      if (excludeKeys.has(lot.lotKey)) continue;
      if (disabledSet.has(lot.worldName)) continue;
      // Owner's home → home business (occupied by the owner, on a residential
      // type that can run a home business).
      const isOwnerHome = !!ownerHouseholdId && lot.householdIds.includes(ownerHouseholdId) && isHomeBusinessLot(lot.customType);
      if (isOwnerHome) { if (matches(lot)) ownerHome = lot; continue; }
      // Dedicated venue → any empty convertible lot. canConvertToSmallBusinessVenue
      // excludes occupied lots (incl. someone else's home), apartment units,
      // student housing, and hidden special lots.
      if (!canConvertToSmallBusinessVenue(lot)) continue;
      if (!matches(lot)) continue;
      (byWorld[lot.worldName] ??= []).push(lot);
    }
    for (const world of Object.keys(byWorld)) byWorld[world].sort((a, b) => a.name.localeCompare(b.name));
    return { ownerHome, byWorld };
  }, [lots, search, disabledWorlds, excludeKeys, ownerHouseholdId]);

  const empty = !ownerHome && Object.keys(byWorld).length === 0;
  const Row = (lot: typeof lots[string]) => (
    <button key={lot.lotKey} onClick={() => { onSelect(lot.lotKey); onClose(); }} className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left justify-between items-center gap-3 hover:bg-c-accent-soft transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-c-text truncate">{lot.customName || lot.name}</div>
        <div className="text-2xs text-c-faint truncate">{lot.worldName} · {neighborhoodLabel(lot.location)}</div>
      </div>
      <span className="text-2xs font-semibold uppercase tracking-label text-c-faint shrink-0">{lot.customType}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Add location</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border space-y-2.5">
          <p className="text-2xs text-c-dim leading-relaxed m-0">
            The owner's home runs a <span className="font-semibold text-c-text">home business</span> (stays Residential). Any other empty lot becomes a <span className="font-semibold text-c-text">Small Business Venue</span>.
          </p>
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search lots or worlds…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {ownerHome && (
            <div>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-green tracking-label uppercase font-semibold">Owner's home · home business</div>
              {Row(ownerHome)}
            </div>
          )}
          {Object.entries(byWorld).sort(([a], [b]) => compareWorldsCanonical(a, b)).map(([world, worldLots]) => (
            <div key={world}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">{world}</div>
              {worldLots.map(Row)}
            </div>
          ))}
          {empty && (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                <MagnifyingGlass size={18} weight="duotone" />
              </div>
              <p className="text-xs font-semibold text-c-text">No eligible lots found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Small choice shown when a homeless owner picks a vacant home lot. One of the
// two answers MOVES A WHOLE HOUSEHOLD, which is a bigger change than anything
// else on this page does — so it's named, in a warning, before either button.
function HomeBusinessChoiceModal({ lotName, householdName, onHome, onStandalone, onClose }: { lotName: string; householdName: string | null; onHome: () => void; onStandalone: () => void; onClose: () => void }) {
  useEscapeToClose(onClose);
  // Two cases, one lowercase so it can sit mid-sentence in the warning.
  const householdPhrase = householdName ? `the ${householdName} household` : "the owner's household";
  const household = householdPhrase.charAt(0).toUpperCase() + householdPhrase.slice(1);
  return (
    <div className="fixed inset-0 bg-black/75 z-[310] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[440px] overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">How should this lot be used?</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="p-5">
          <p className="text-xs text-c-dim m-0 mb-4">The owner doesn't have a home yet, so <span className="font-semibold text-c-text">{lotName}</span> could be either:</p>
          <div className="flex flex-col gap-2.5">
            <button onClick={onHome} className="text-left bg-c-base border border-c-border hover:border-c-accent rounded-lg px-4 py-3 cursor-pointer transition-colors">
              <div className="text-sm font-semibold text-c-text">Home business</div>
              <div className="text-2xs text-c-dim mt-0.5">{household} lives here and runs the business from home. The lot keeps its type.</div>
            </button>
            <button onClick={onStandalone} className="text-left bg-c-base border border-c-border hover:border-c-accent rounded-lg px-4 py-3 cursor-pointer transition-colors">
              <div className="text-sm font-semibold text-c-text">Standalone business</div>
              <div className="text-2xs text-c-dim mt-0.5">The owner doesn't live here. The lot becomes a Small Business Venue.</div>
            </button>
          </div>
          <WarnCallout className="mt-4">
            Assigning the business to this lot will move {householdPhrase} in.
          </WarnCallout>
        </div>
      </div>
    </div>
  );
}

function EmployeePickerModal({ onClose, onSelect, excludeIds }: { onClose: () => void; onSelect: (simId: string) => void; excludeIds: Set<string> }) {
  useEscapeToClose(onClose);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const byHousehold: Record<string, Sim[]> = {};
    for (const sim of Object.values(sims)) {
      if ((sim.recordStatus ?? 'active') !== 'active') continue;
      if (EMPLOYEE_INELIGIBLE_LIFESTAGES.has(sim.lifestage)) continue;  // must be teen+
      if (excludeIds.has(sim.id)) continue;
      const full = `${sim.firstName} ${sim.lastName}`.trim().toLowerCase();
      if (q && !full.includes(q)) continue;
      const hh = sim.householdId ? households[sim.householdId] : undefined;
      const key = hh?.name ?? 'Unknown';
      (byHousehold[key] ??= []).push(sim);
    }
    for (const k of Object.keys(byHousehold)) byHousehold[k].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return byHousehold;
  }, [sims, households, search, excludeIds]);

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Add employee</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search sims…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([hh, hhSims]) => (
            <div key={hh}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">{hh}</div>
              {hhSims.map((sim) => (
                <button key={sim.id} onClick={() => { onSelect(sim.id); onClose(); }} className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left justify-between items-center hover:bg-c-accent-soft transition-colors">
                  <span className="text-sm font-medium text-c-text">{sim.firstName} {sim.lastName}</span>
                  <span className="text-2xs font-semibold uppercase tracking-label text-c-faint">{lifestageLabel(sim.lifestage)}</span>
                </button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                <MagnifyingGlass size={18} weight="duotone" />
              </div>
              <p className="text-xs font-semibold text-c-text">No sims to add</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerPickerModal({ onClose, onSelect, excludeIds }: { onClose: () => void; onSelect: (simId: string) => void; excludeIds: Set<string> }) {
  useEscapeToClose(onClose);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const byHousehold: Record<string, Sim[]> = {};
    for (const sim of Object.values(sims)) {
      if ((sim.recordStatus ?? 'active') !== 'active') continue;
      if (OWNER_INELIGIBLE_LIFESTAGES.has(sim.lifestage)) continue;  // must be child+
      if (excludeIds.has(sim.id)) continue;  // a sim can own at most one business
      const full = `${sim.firstName} ${sim.lastName}`.trim().toLowerCase();
      if (q && !full.includes(q)) continue;
      const hh = sim.householdId ? households[sim.householdId] : undefined;
      (byHousehold[hh?.name ?? 'Unknown'] ??= []).push(sim);
    }
    for (const k of Object.keys(byHousehold)) byHousehold[k].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return byHousehold;
  }, [sims, households, search, excludeIds]);

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Set owner sim</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search sims…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([hh, hhSims]) => (
            <div key={hh}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">{hh}</div>
              {hhSims.map((sim) => (
                <button key={sim.id} onClick={() => { onSelect(sim.id); onClose(); }} className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left justify-between items-center hover:bg-c-accent-soft transition-colors">
                  <span className="text-sm font-medium text-c-text">{sim.firstName} {sim.lastName}</span>
                  <span className="text-2xs font-semibold uppercase tracking-label text-c-faint">{lifestageLabel(sim.lifestage)}</span>
                </button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && <div className="px-4 py-10 text-center text-xs text-c-faint">No sims found</div>}
        </div>
      </div>
    </div>
  );
}

function SBCard({ sb, selected, onClick }: { sb: SmallBusiness; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} data-listnav-id={sb.id} className={`flex items-center gap-2 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left w-full transition-colors ${selected ? 'bg-c-accent-soft border-l-c-accent' : 'bg-transparent border-l-transparent hover:bg-c-panel'}`}>
      {sb.icon ? (
        <img src={`/small-business-icons/${sb.icon}.png`} alt="" className="w-10 h-10 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span className="w-10 h-10 shrink-0" aria-hidden />
      )}
      <span className="flex-1 min-w-0 text-sm font-semibold text-c-text tracking-headline truncate">{sb.name || 'Unnamed Business'}</span>
      {!sb.sourceId && <PlannerPill />}
    </button>
  );
}

export function SmallBusinesses() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const smallBusinesses = useSaveFile((s) => s.smallBusinesses);
  const lots = useSaveFile((s) => s.lots);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const addSmallBusiness = useSaveFile((s) => s.addSmallBusiness);
  const updateSmallBusiness = useSaveFile((s) => s.updateSmallBusiness);
  const deleteSmallBusiness = useSaveFile((s) => s.deleteSmallBusiness);
  const assignSmallBusiness = useSaveFile((s) => s.assignSmallBusiness);
  const unassignSmallBusinessLot = useSaveFile((s) => s.unassignSmallBusinessLot);
  const assignHousehold = useSaveFile((s) => s.assignHousehold);
  const updateLot = useSaveFile((s) => s.updateLot);
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingReqType, setEditingReqType] = useState<string | null>(null); // requirement chip being edited
  const [search, setSearch] = useState('');
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [activityPicker, setActivityPicker] = useState(false);
  // A vacant residential lot picked while the owner is homeless — awaiting the
  // "home business vs standalone Small Business lot" choice.
  const [pendingHomeChoice, setPendingHomeChoice] = useState<string | null>(null);

  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isNotesDirty, setIsNotesDirty] = useState(false);

  const allBusinesses = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(smallBusinesses)
      .filter((sb) => !q || sb.name.toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [smallBusinesses, search]);

  const selected = selectedId ? smallBusinesses[selectedId] : null;
  const isImported = !!selected?.sourceId;
  const ownerSim = selected?.ownerSimId ? sims[selected.ownerSimId] : null;
  const ownerHouseholdId = ownerSim?.householdId ?? null;
  // Lot placement is owner-first: a business's valid lots derive from its owner
  // (their home vs an empty lot to convert), so we gate lot assignment on having
  // an owner. Also matches B6 (a business always has an owner).
  const hasOwner = !!selected?.ownerSimId;
  // Does the owner's household live anywhere? (Determines whether a vacant
  // residential pick is unambiguous — see handleAddLot.)
  const ownerHasHome = useMemo(
    () => !!ownerHouseholdId && Object.values(lots).some((l) => l.householdIds.includes(ownerHouseholdId)),
    [ownerHouseholdId, lots],
  );
  const assignedLots = useMemo(
    () => (selected?.assignedLotKeys ?? []).map((k) => lots[k]).filter(Boolean),
    [selected?.assignedLotKeys, lots],
  );

  const sbStats = useMemo(() => {
    const all = Object.values(smallBusinesses);
    const total = all.length;
    const fromSave = all.filter((sb) => sb.sourceId).length;
    const employees = all.reduce((n, sb) => n + sb.employeeSimIds.length, 0);
    const lots = all.reduce((n, sb) => n + sb.assignedLotKeys.length, 0);
    let topRenown: { rank: number; name: string } | null = null;
    for (const sb of all) {
      if (sb.renownRank == null) continue;
      if (!topRenown || sb.renownRank > topRenown.rank) topRenown = { rank: sb.renownRank, name: sb.name };
    }
    return { total, fromSave, planned: total - fromSave, employees, lots, topRenown };
  }, [smallBusinesses]);

  // A sim holds at most ONE small-business role at a time (owner OR employee of
  // one business). Collect everyone already in any role across all businesses —
  // used to exclude them from both the owner and employee pickers.
  const simsWithAnyBusinessRole = useMemo(() => {
    const s = new Set<string>();
    for (const b of Object.values(smallBusinesses)) {
      if (b.ownerSimId) s.add(b.ownerSimId);
      for (const eid of b.employeeSimIds) s.add(eid);
    }
    return s;
  }, [smallBusinesses]);

  // Sync editable fields after render from the live store (avoids the
  // just-created stale-closure bug — see [[feedback_navigation_prefix]] sibling note).
  useEffect(() => {
    if (!selected) return;
    setEditingName(selected.name);
    setEditingNotes(selected.notes);
    setIsNameDirty(false);
    setIsNotesDirty(false);
    setShowIconPicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function selectBusiness(id: string) {
    setSelectedId(id);
    setShowLotPicker(false);
    setShowEmployeePicker(false);
    setShowOwnerPicker(false);
    setActivityPicker(false);
  }

  useListKeyboardNav({ items: allBusinesses, selectedId, onSelect: selectBusiness });

  async function handleCreate() {
    const id = await addSmallBusiness({
      name: 'New business', icon: '', notes: '', description: '',
      assignedLotKeys: [], ownerSimId: null, employeeSimIds: [],
      customerCriteria: [], activities: [], feeMode: 'disabled', priceModifierPct: 0,
      renownRank: null, alignment: null, perkPoints: 0, sourceId: null,
    });
    selectBusiness(id);
  }

  function handleNameBlur() {
    if (!selected || !isNameDirty) return;
    updateSmallBusiness(selected.id, { name: editingName || 'New business' });
    setIsNameDirty(false);
  }
  function handleNotesBlur() {
    if (!selected || !isNotesDirty) return;
    updateSmallBusiness(selected.id, { notes: editingNotes });
    setIsNotesDirty(false);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!await confirm({ message: `Delete "${selected.name}"?`, confirmLabel: 'Delete', danger: true })) return;
    // Hand back every lot this business converted, before it stops existing —
    // exactly what removing its locations one by one would have done.
    for (const lotKey of selected.assignedLotKeys) revertConvertedLot(lotKey, selected.id);
    setSelectedId(null);
    await deleteSmallBusiness(selected.id);
  }

  // Placing a business:
  //  - the owner's home → home business, lot stays Residential;
  //  - any other lot → dedicated venue, the lot's type becomes Small Business
  //    Venue (converts).
  // The ONE prompt: a homeless owner picking a vacant residential lot can choose
  // to move in (home business) instead of converting it.
  function assignAsDedicated(lotKey: string) {
    if (!selected) return;
    const lot = lots[lotKey];
    if (lot && lot.customType !== 'Small Business Venue') updateLot(lotKey, { customType: 'Small Business Venue' });
    assignSmallBusiness(selected.id, lotKey);
  }
  function handleAddLot(lotKey: string) {
    if (!selected) return;
    setShowLotPicker(false);
    const lot = lots[lotKey];
    if (!lot) return;
    const isResidential = isHomeBusinessLot(lot.customType);
    const isOwnerHome = !!ownerHouseholdId && lot.householdIds.includes(ownerHouseholdId);
    if (isOwnerHome) {
      assignSmallBusiness(selected.id, lotKey);   // home business — no conversion
    } else if (isResidential && ownerHouseholdId && !ownerHasHome) {
      setPendingHomeChoice(lotKey);               // homeless owner → offer home vs dedicated
    } else {
      assignAsDedicated(lotKey);                  // dedicated venue → convert
    }
  }
  function assignAsOwnerHome(lotKey: string) {
    if (!selected || !ownerHouseholdId) return;
    assignHousehold(lotKey, ownerHouseholdId).catch(() => {});  // move the owner's household in
    assignSmallBusiness(selected.id, lotKey);     // lot stays Residential (home business)
  }
  // Undo a business-caused conversion: if the lot is a Small Business Venue we
  // converted, and nothing else keeps it a venue (no household, no other
  // business), revert it to what the SAVE actually had — the baseline type
  // (falling back to the seed default when no save value is recorded), NOT the
  // seed default, so a lot the game reports as e.g. a Restaurant goes back to
  // Restaurant rather than a pristine Residential.
  //
  // Both ways of taking a business off a lot run this. Only one of them used to:
  // deleting a whole business left every lot it had converted stranded as an
  // empty Small Business Venue, reachable only by fixing the type by hand.
  function revertConvertedLot(lotKey: string, forBusinessId: string) {
    const lot = lots[lotKey];
    if (!lot || lot.customType !== 'Small Business Venue') return;
    if (lot.householdIds.length > 0) return;
    const revertType = lot.lastSaved?.customType ?? lot.defaultType;
    if (!revertType || revertType === 'Small Business Venue') return;
    const keptByAnother = Object.values(smallBusinesses)
      .some((b) => b.id !== forBusinessId && b.assignedLotKeys.includes(lotKey));
    if (!keptByAnother) updateLot(lotKey, { customType: revertType });
  }

  function handleRemoveLot(lotKey: string) {
    if (!selected) return;
    unassignSmallBusinessLot(selected.id, lotKey);
    revertConvertedLot(lotKey, selected.id);
  }
  function handleAddEmployee(simId: string) {
    if (!selected || selected.employeeSimIds.includes(simId)) return;
    updateSmallBusiness(selected.id, { employeeSimIds: [...selected.employeeSimIds, simId] });
  }
  function handleRemoveEmployee(simId: string) {
    if (!selected) return;
    updateSmallBusiness(selected.id, { employeeSimIds: selected.employeeSimIds.filter((x) => x !== simId) });
  }
  function addCriterion(category: CustCat, raw: number, values: number[], required: boolean, caregiver: boolean) {
    if (!selected) return;
    updateSmallBusiness(selected.id, { customerCriteria: mergeCustomerCriteria(selected.customerCriteria, category, raw, values, required, caregiver) });
  }
  function setCriteria(customerCriteria: SmallBusinessCustomerCriterion[]) {
    if (selected) updateSmallBusiness(selected.id, { customerCriteria });
  }
  // Edit-set: the picked set IS the new activity list (planner-only; no lock).
  function setActivities(picked: Choice[]) {
    if (!selected) return;
    updateSmallBusiness(selected.id, { activities: picked.slice(0, MAX_SB_ACTIVITIES).map((c) => ({ id: c.id, name: c.name })) });
  }
  function removeActivity(id: string) {
    if (!selected) return;
    updateSmallBusiness(selected.id, { activities: selected.activities.filter((a) => a.id !== id) });
  }

  const lotCardLink = (lotKey: string) => navigate(
    `/saves/${saveFileId}/world/${encodeURIComponent(lots[lotKey].worldName)}?lot=${encodeURIComponent(lotKey)}`,
    { state: { from: `/saves/${saveFileId}/small-businesses` } },
  );

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-[1600px] w-full">
      <PackNotOwnedBanner packId="EP18" feature="Small Businesses" />
      <MasterDetail>
        {/* Left panel */}
        <MasterDetail.Rail width="w-64">
          <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
            <h1 className="text-xl font-bold text-c-text m-0 tracking-headline">Small Businesses</h1>
            <button onClick={handleCreate} className={btn('primary', { block: true, elevated: true })}>
              <Plus size={14} weight="bold" />
              <span className="text-2xs font-semibold uppercase tracking-label">New business</span>
            </button>
            <div className="relative">
              <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
              <input placeholder="Search businesses..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-c-base border border-c-border rounded-md pl-9 pr-9 py-[6px] text-c-text text-xs w-full outline-none focus:border-c-accent" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1" aria-label="Clear search">
                  <X size={11} weight="bold" />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {allBusinesses.length === 0 && (
              search ? (
                <div className="px-4 py-10 text-center">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                    <MagnifyingGlass size={18} weight="duotone" />
                  </div>
                  <p className="text-xs font-semibold text-c-text mb-0.5">No matches</p>
                  <button type="button" onClick={() => setSearch('')} className="text-2xs font-semibold uppercase tracking-label text-c-accent hover:underline bg-transparent border-none cursor-pointer mt-1">Clear search</button>
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-xs text-c-faint">No businesses yet. Create one to get started.</div>
              )
            )}
            {allBusinesses.map((sb) => (
              <SBCard key={sb.id} sb={sb} selected={sb.id === selectedId} onClick={() => selectBusiness(sb.id)} />
            ))}
          </div>
        </MasterDetail.Rail>

        {/* Right panel */}
        <MasterDetail.Detail label="Businesses">
        <div className="flex-1 overflow-y-auto p-8 bg-c-base">
          {!selected && sbStats.total === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="bg-c-card border border-c-border rounded-xl w-full max-w-md">
                <EmptyState
                  icon={<Storefront size={28} weight="duotone" />}
                  title="No small businesses yet"
                  description="Track shops your sims run from home or from a Small Business Venue lot — bakeries, salons, retail. Set an owner, employees, offerings, and pricing."
                  cta={{ label: '+ New Small Business', onClick: handleCreate }}
                />
              </div>
            </div>
          ) : !selected ? (
            <OverviewLanding title="Small Businesses at a glance" columns={3}>
              <HeroSplit
                total={sbStats.total}
                label={sbStats.total === 1 ? 'Business' : 'Businesses'}
                segments={[
                  { value: sbStats.fromSave, label: 'from save', tone: 'green' },
                  { value: sbStats.planned, label: 'planned', tone: 'plum' },
                ]}
              />
              <StatTile tone="green" label="Employees" value={sbStats.employees} sub="sims employed"
                icon={<UsersThree size={20} weight="duotone" />} />
              <StatTile tone="plum" label="Lots" value={sbStats.lots} sub="across your businesses"
                icon={<Storefront size={20} weight="duotone" />} />
              <StatTile tone="green" label="Top renown"
                value={sbStats.topRenown && sbStats.topRenown.rank > 0 ? '★'.repeat(sbStats.topRenown.rank) : '—'}
                sub={sbStats.topRenown && sbStats.topRenown.rank > 0 ? sbStats.topRenown.name : 'no renown yet'}
                icon={<Star size={20} weight="duotone" />} />
            </OverviewLanding>
          ) : (
            <div className="max-w-3xl flex flex-col gap-7">
              {/* Hero — icon + name + location/staff summary, matching the venue/club header. */}
              <div className="flex items-start gap-5">
                {isImported ? (
                  selected.icon ? (
                    <img src={`/small-business-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <Storefront size={64} weight="duotone" className="text-c-faint shrink-0" />
                  )
                ) : (
                  <Tooltip text={selected.icon ? 'Change icon' : 'Add an icon'}>
                    <button type="button" onClick={() => setShowIconPicker((v) => !v)} className="shrink-0 bg-transparent border-none p-0 cursor-pointer group" aria-label={selected.icon ? 'Change icon' : 'Add an icon'}>
                      {selected.icon ? (
                        <span className="relative block w-[72px] h-[72px]">
                          <img src={`/small-business-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain transition-opacity group-hover:opacity-40" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ImageSquare size={20} weight="duotone" className="text-c-accent" />
                            <span className="text-[10px] font-semibold uppercase tracking-label text-c-accent">Change</span>
                          </span>
                        </span>
                      ) : (
                        <span className={`w-[72px] h-[72px] rounded-xl border-2 border-dashed bg-c-card flex flex-col items-center justify-center gap-1 transition-colors ${showIconPicker ? 'border-c-accent' : 'border-c-border group-hover:border-c-accent'}`}>
                          <ImageSquare size={22} weight="duotone" className="text-c-accent" />
                          <span className="text-[10px] font-semibold uppercase tracking-label text-c-accent">Add icon</span>
                        </span>
                      )}
                    </button>
                  </Tooltip>
                )}

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">Small Business</div>
                  {isImported ? (
                    <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0 leading-tight break-words">{selected.name || 'Unnamed Business'}</h2>
                  ) : (
                    <div className="group/name flex items-center gap-1.5 border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                      <input
                        value={editingName}
                        onChange={(e) => { setEditingName(e.target.value); setIsNameDirty(true); }}
                        onBlur={handleNameBlur}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder="Name this business…"
                        className="flex-1 min-w-0 bg-transparent border-none text-3xl font-extrabold text-c-text tracking-headline outline-none placeholder:text-c-faint py-0.5"
                      />
                      <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-c-dim flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={16} weight="duotone" className="text-c-secondary" />
                      {assignedLots.length === 0 ? 'No location' : `${assignedLots.length} location${assignedLots.length !== 1 ? 's' : ''}`}
                    </span>
                    <span className="text-c-faint">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <UsersThree size={16} weight="duotone" className="text-c-secondary" />
                      {selected.employeeSimIds.length} employee{selected.employeeSimIds.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={handleDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                      <Trash size={13} weight="bold" /> Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Description — game-mirror, read-only, hidden when empty. */}
              <MirroredDescription value={selected.description} />

              {/* Renown + Alignment — imported, owner-trait-derived. Read-only. Both
                  cards share one layout: label · [visual + value] · footnote. */}
              {isImported && (selected.renownRank != null || selected.alignment != null) && (
                <div className="grid grid-cols-2 gap-4">
                  {selected.renownRank != null && (
                    <div className="bg-c-card border border-c-border rounded-xl p-5 flex flex-col">
                      <span className="text-2xs font-semibold text-c-dim uppercase tracking-label">Renown</span>
                      <div className="flex items-center gap-2.5 mt-3">
                        <div className="flex items-center gap-0.5 shrink-0">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star key={i} size={17} weight={i < selected.renownRank! ? 'fill' : 'regular'} className={i < selected.renownRank! ? 'text-c-accent' : 'text-c-faint'} />
                          ))}
                        </div>
                        <span className="text-sm font-bold text-c-text truncate">{smallBusinessRankLabel(selected.renownRank)}</span>
                      </div>
                      <div className="text-xs text-c-faint mt-auto pt-3">Rank {selected.renownRank} / 5</div>
                    </div>
                  )}
                  {selected.alignment != null && (
                    <div className="bg-c-card border border-c-border rounded-xl p-5 flex flex-col">
                      <span className="text-2xs font-semibold text-c-dim uppercase tracking-label">Alignment</span>
                      <div className="flex items-center gap-2.5 mt-3">
                        <ShieldCheck size={22} weight="fill" className={`${alignmentTone(selected.alignment)} shrink-0`} />
                        <span className="text-sm font-bold text-c-text truncate">{smallBusinessAlignmentLabel(selected.alignment)}</span>
                      </div>
                      <div className="text-xs text-c-faint mt-auto pt-3">Level {selected.alignment} / 7</div>
                    </div>
                  )}
                </div>
              )}

              {/* Icon picker — pops out when the header icon is clicked (hand-created) */}
              {!isImported && showIconPicker && (
                <IconPickerModal iconSet="small-business" value={selected.icon} onChange={(icon) => updateSmallBusiness(selected.id, { icon })} onClose={() => setShowIconPicker(false)} />
              )}

              {/* One editor surface — grouped, full-width. */}
              <div className="rounded-xl border border-c-border bg-c-card shadow-sm px-6 flex flex-col divide-y divide-c-border">
                {/* Owner & Employees — one club-style list (Owner / Employee pills),
                    owner first. Click a name to open that sim. */}
                {(() => {
                  const peopleCount = (ownerSim ? 1 : 0) + selected.employeeSimIds.length;
                  if (isImported && peopleCount === 0) return null;
                  return (
                    <div className="py-6">
                      <Field
                        label="Owner & Employees"
                        icon={<UsersThree size={12} weight="fill" />}
                        count={peopleCount}
                        action={!isImported ? (
                          <button onClick={() => (ownerSim ? setShowEmployeePicker(true) : setShowOwnerPicker(true))} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent">
                            <Plus size={14} weight="bold" /> {ownerSim ? 'Add employee' : 'Set owner'}
                          </button>
                        ) : undefined}
                      >
                        {peopleCount === 0 ? (
                          <p className="text-sm text-c-faint italic m-0">No owner or employees{isImported ? '.' : ' yet.'}</p>
                        ) : (
                          <div className="flex flex-col gap-px bg-c-border border border-c-border rounded-lg overflow-hidden">
                            {/* Owner row */}
                            {ownerSim && (
                              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-c-card">
                                <Tooltip text="Open sim">
                                  <button type="button" onClick={() => navigate(`/saves/${saveFileId}/sims?sim=${ownerSim.id}`)} className="min-w-0 bg-transparent border-none p-0 cursor-pointer text-left group" aria-label="Open sim">
                                    <span className="text-sm font-medium text-c-text truncate group-hover:text-c-green transition-colors">{ownerSim.firstName} {ownerSim.lastName}</span>
                                  </button>
                                </Tooltip>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Pill tone="green" caps size="md">Owner</Pill>
                                  {!isImported && (
                                    <>
                                      <Tooltip text="Change owner">
                                        <button type="button" onClick={() => setShowOwnerPicker(true)} className="text-2xs font-semibold uppercase tracking-label text-c-faint hover:text-c-dim bg-transparent border-none cursor-pointer" aria-label="Change owner">Change</button>
                                      </Tooltip>
                                      <Tooltip text="Remove owner">
                                        <button onClick={() => updateSmallBusiness(selected.id, { ownerSimId: null })} className={iconBtn(7, 'danger')} aria-label="Remove owner"><X size={11} weight="bold" /></button>
                                      </Tooltip>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            {/* Employee rows */}
                            {selected.employeeSimIds.map((simId) => {
                              const sim = sims[simId];
                              return (
                                <div key={simId} className="flex items-center justify-between gap-2 px-3 py-2 bg-c-card">
                                  {sim ? (
                                    <Tooltip text="Open sim">
                                      <button type="button" onClick={() => navigate(`/saves/${saveFileId}/sims?sim=${simId}`)} className="min-w-0 bg-transparent border-none p-0 cursor-pointer text-left group" aria-label="Open sim">
                                        <span className="text-sm font-medium text-c-text truncate group-hover:text-c-green transition-colors">{sim.firstName} {sim.lastName}</span>
                                      </button>
                                    </Tooltip>
                                  ) : (
                                    <span className="text-xs text-c-faint italic">deleted sim</span>
                                  )}
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Pill tone="neutral" caps size="md">Employee</Pill>
                                    {!isImported && (
                                      <Tooltip text="Remove">
                                        <button onClick={() => handleRemoveEmployee(simId)} className={iconBtn(7, 'danger')} aria-label="Remove"><X size={11} weight="bold" /></button>
                                      </Tooltip>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Field>
                    </div>
                  );
                })()}

                {/* Customer requirements — header "+ Add" matches Business Activities;
                    the builder reveals inline on click. */}
                {(isImported ? selected.customerCriteria.length > 0 : true) && (
                  <div className="py-6">
                    <Field
                      label="Customer Requirements"
                      icon={<Funnel size={12} weight="fill" />}
                      count={selected.customerCriteria.length}
                      action={!isImported ? (
                        <RequirementBuilder
                          categories={CUST_CATEGORIES as ReqCategory[]}
                          atMax={selected.customerCriteria.length >= MAX_SB_REQUIREMENTS}
                          usedTypes={new Set(selected.customerCriteria.map((c) => c.category as string))}
                          onEditExisting={setEditingReqType}
                          onAdd={(type, raw, values) => addCriterion(type as CustCat, raw, values, true, false)}
                        />
                      ) : undefined}
                    >
                      {selected.customerCriteria.length > 0 ? (
                        <div className="flex flex-wrap gap-2.5">
                          {selected.customerCriteria.map((c, i) => {
                            if (isImported) return <CustomerChip key={i} c={c} />;
                            const patch = (p: Partial<SmallBusinessCustomerCriterion>) =>
                              setCriteria(selected.customerCriteria.map((cc, j) => (j === i ? { ...cc, ...p } : cc)));
                            const flagPill = 'text-2xs font-semibold rounded-full px-1.5 py-0.5 border cursor-pointer transition-colors';
                            return (
                              <RequirementChip
                                key={i}
                                typeLabel={customerCriterionTypeLabel(c)}
                                values={c.values}
                                valueLabel={(vi) => customerCriterionValueText({ ...c, values: [c.values[vi]] })}
                                valueIcon={(vi) => customerCriterionIcons({ ...c, values: [c.values[vi]] })[0]}
                                onEdit={() => setEditingReqType(c.category as string)}
                                onRemoveValue={(vi) => {
                                  const nv = c.values.filter((_, j) => j !== vi);
                                  setCriteria(nv.length
                                    ? selected.customerCriteria.map((cc, j) => (j === i ? { ...cc, values: nv } : cc))
                                    : selected.customerCriteria.filter((_, j) => j !== i));
                                }}
                                meta={
                                  <span className="inline-flex items-center gap-1.5">
                                    <Tooltip text="Required vs. preferred">
                                      <button type="button" onClick={() => patch({ required: !c.required })} className={`${flagPill} ${c.required ? 'bg-c-accent-soft border-c-accent-border text-c-green' : 'bg-transparent border-c-border text-c-faint hover:text-c-text'}`} aria-label="Required vs. preferred">{c.required ? 'required' : 'optional'}</button>
                                    </Tooltip>
                                    {c.category === 'supervised' && (
                                      <Tooltip text="Caregiver stays at the business">
                                        <button type="button" onClick={() => patch({ caregiverStays: !c.caregiverStays })} className={`${flagPill} ${c.caregiverStays ? 'bg-c-accent-soft border-c-accent-border text-c-green' : 'bg-transparent border-c-border text-c-faint hover:text-c-text'}`} aria-label="Caregiver stays at the business">caregiver stays</button>
                                      </Tooltip>
                                    )}
                                  </span>
                                }
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-c-faint italic m-0">No requirements{isImported ? '.' : ' yet.'}</p>
                      )}
                    </Field>
                  </div>
                )}

                {/* Business Activities — customer activities offered */}
                {(isImported ? selected.activities.length > 0 : true) && (
                  <div className="py-6">
                    <Field
                      label="Business Activities"
                      icon={<Briefcase size={12} weight="fill" />}
                      count={selected.activities.length}
                      action={!isImported ? (
                        <button onClick={() => setActivityPicker(true)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent">
                          <Plus size={14} weight="bold" /> {selected.activities.length >= MAX_SB_ACTIVITIES ? 'Edit activities' : 'Add activity'}
                        </button>
                      ) : undefined}
                    >
                      {selected.activities.length === 0 ? (
                        <p className="text-sm text-c-faint italic m-0">No activities{isImported ? '.' : ' yet.'}</p>
                      ) : (
                        <div className="flex flex-wrap gap-2.5">
                          {selected.activities.map((a) => (
                            <ActivityChip key={a.id} id={a.id} name={a.name} onRemove={isImported ? undefined : () => removeActivity(a.id)} />
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>
                )}

                {/* Fees & Pricing */}
                <div className="py-6">
                  <Field label="Fees & Pricing" icon={<Ticket size={12} weight="fill" />}>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Entrance / hourly fee */}
                      <div>
                        <div className="text-2xs font-semibold text-c-faint uppercase tracking-label mb-2">Entrance fee</div>
                        {isImported ? (
                          <div className="bg-c-base border border-c-border rounded-lg px-4 py-2.5 text-sm font-semibold text-c-text">{FEE_MODE_LABEL[selected.feeMode]}</div>
                        ) : (
                          <div className="flex rounded-md border border-c-border overflow-hidden">
                            {FEE_MODE_OPTS.map((o) => (
                              // Disabling the fee zeroes the price modifier (matches in-game).
                              <button key={o.v} type="button" onClick={() => updateSmallBusiness(selected.id, o.v === 'disabled' ? { feeMode: o.v, priceModifierPct: 0 } : { feeMode: o.v })} className={`flex-1 text-xs px-2 py-2 cursor-pointer border-none transition-colors ${selected.feeMode === o.v ? 'bg-c-accent text-white font-semibold' : 'bg-c-base text-c-dim hover:text-c-text'}`}>
                                {o.l}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Price modifier — locked to +0% while the fee is disabled (in-game behavior). */}
                      <div>
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-c-faint uppercase tracking-label mb-2"><Tag size={11} weight="fill" /> Price modifier</div>
                        {isImported ? (
                          <div className="bg-c-base border border-c-border rounded-lg px-4 py-2.5 text-sm font-semibold text-c-text">{priceLabel(selected.priceModifierPct)}</div>
                        ) : selected.feeMode === 'disabled' ? (
                          <div className="flex items-center gap-2">
                            <span className="bg-c-base border border-c-border rounded-md px-3 py-1.5 text-sm font-semibold text-c-dim">{priceLabel(0)}</span>
                            <span className="text-2xs text-c-faint">No fee — modifier off</span>
                          </div>
                        ) : (
                          <div className="flex rounded-md border border-c-border overflow-hidden">
                            {PRICE_OPTS.map((p) => (
                              <button key={p} type="button" onClick={() => updateSmallBusiness(selected.id, { priceModifierPct: p })} className={`flex-1 text-xs px-1.5 py-2 cursor-pointer border-none transition-colors ${selected.priceModifierPct === p ? 'bg-c-accent text-white font-semibold' : 'bg-c-base text-c-dim hover:text-c-text'}`}>
                                {priceLabel(p)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Field>
                </div>

                {/* Locations — multi-lot, placed last (least central to the business
                    config). Compact one-line cards; world + type only, no neighborhood. */}
                <div className="py-6">
                  <Field
                    label="Locations"
                    icon={<MapPin size={12} weight="fill" />}
                    count={assignedLots.length}
                    action={!isImported ? (
                      <Tooltip text={hasOwner ? undefined : 'Set an owner first'}>
                        <button
                          onClick={() => { if (hasOwner) setShowLotPicker(true); }}
                          disabled={!hasOwner}
                       
                          className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 transition-colors ${hasOwner ? 'bg-c-base text-c-accent border-c-border hover:border-c-accent cursor-pointer' : 'bg-c-base text-c-faint border-c-border opacity-60 cursor-not-allowed'}`} aria-label={hasOwner ? undefined : 'Set an owner first'}>
                          <Plus size={14} weight="bold" /> Add location
                        </button>
                      </Tooltip>
                    ) : undefined}
                  >
                    {assignedLots.length === 0 ? (
                      isImported ? (
                        <p className="text-sm text-c-faint italic m-0">No location recorded.</p>
                      ) : !hasOwner ? (
                        <p className="text-sm text-c-faint italic m-0">Set an owner first to place this business on a lot.</p>
                      ) : (
                        <button onClick={() => setShowLotPicker(true)} className="w-full bg-c-base border border-dashed border-c-border hover:border-c-accent hover:bg-c-accent-soft rounded-lg px-4 py-3 text-c-dim hover:text-c-accent cursor-pointer text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                          <MapPin size={14} weight="fill" /> Assign to a lot
                        </button>
                      )
                    ) : (
                      <div className="flex flex-col gap-2">
                        {assignedLots.map((lot) => (
                          <div key={lot.lotKey} className="bg-c-base border border-c-border rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-baseline gap-2 min-w-0">
                              <button type="button" onClick={() => lotCardLink(lot.lotKey)} className="text-sm font-semibold text-c-green hover:underline bg-transparent border-none p-0 cursor-pointer text-left truncate">
                                {lot.customName || lot.name}
                              </button>
                              <span className="text-[11px] text-c-dim truncate shrink-0">· {lot.worldName} · {lot.customType}</span>
                            </div>
                            {!isImported && (
                              <button onClick={() => handleRemoveLot(lot.lotKey)} className="bg-transparent border border-c-border hover:border-c-red-border text-c-dim hover:text-c-red rounded-md px-2.5 py-1 text-2xs font-semibold uppercase tracking-label cursor-pointer transition-colors shrink-0">Remove</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>
              </div>

              {/* Notes — private */}
              <Notes
                value={editingNotes}
                onChange={(v) => { setEditingNotes(v); setIsNotesDirty(true); }}
                onBlur={handleNotesBlur}
              />

            </div>
          )}
        </div>
        </MasterDetail.Detail>

        {showLotPicker && selected && (
          <SBLotPickerModal onClose={() => setShowLotPicker(false)} onSelect={handleAddLot} excludeKeys={new Set(selected.assignedLotKeys)} ownerHouseholdId={ownerHouseholdId} />
        )}
        {pendingHomeChoice && selected && (
          <HomeBusinessChoiceModal
            lotName={lots[pendingHomeChoice]?.customName || lots[pendingHomeChoice]?.name || 'this lot'}
            householdName={ownerHouseholdId ? (households[ownerHouseholdId]?.name ?? null) : null}
            onHome={() => { assignAsOwnerHome(pendingHomeChoice); setPendingHomeChoice(null); }}
            onStandalone={() => { assignAsDedicated(pendingHomeChoice); setPendingHomeChoice(null); }}
            onClose={() => setPendingHomeChoice(null)}
          />
        )}
        {showEmployeePicker && selected && (
          <EmployeePickerModal onClose={() => setShowEmployeePicker(false)} onSelect={handleAddEmployee} excludeIds={simsWithAnyBusinessRole} />
        )}
        {showOwnerPicker && selected && (
          <OwnerPickerModal onClose={() => setShowOwnerPicker(false)} excludeIds={simsWithAnyBusinessRole} onSelect={(sid) => { updateSmallBusiness(selected.id, { ownerSimId: sid }); setShowOwnerPicker(false); }} />
        )}
        {activityPicker && selected && (
          <CatalogPickerModal title="Edit business activities" items={ACTIVITY_CHOICES} multiSelect preselected={new Set(selected.activities.map((a) => a.id))} maxSelected={MAX_SB_ACTIVITIES} onSelect={setActivities} onClose={() => setActivityPicker(false)} />
        )}
        {editingReqType && selected && (() => {
          const cat = (CUST_CATEGORIES as ReqCategory[]).find((rc) => rc.type === editingReqType);
          if (!cat) return null;
          const crit = selected.customerCriteria.find((c) => c.category === editingReqType);
          return (
            <RequirementValuePicker
              cat={cat}
              values={crit?.values ?? []}
              onReplace={(values) => setCriteria(replaceCustomerCriteria(selected.customerCriteria, editingReqType as CustCat, cat.raw, values))}
              onClose={() => setEditingReqType(null)}
            />
          );
        })()}
      </MasterDetail>
    </div>
  );
}
