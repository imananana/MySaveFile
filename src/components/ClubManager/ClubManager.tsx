import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { X, Plus, Check, MapPin, PencilSimple, Trash, UsersFour, UsersThree, MagnifyingGlass, EnvelopeSimple, EnvelopeSimpleOpen, ThumbsUp, ThumbsDown, ImageSquare } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSaveFile } from '../../store/useSaveFile';
import type { Club, Sim } from '../../types';
import { getLotCategory, compareWorldsCanonical, isClubHangoutEligible, neighborhoodLabel } from '../../data/worlds';
import { IconPickerModal } from '../common/IconPicker';
import { useConfirm } from '../common/ConfirmDialog';
import { MasterDetail } from '../common/MasterDetail';
import { PackNotOwnedBanner } from '../common/PackNotOwnedBanner';
import { EmptyState } from '../common/EmptyState';
import { criterionTypeLabel, criterionValueText, ageRangeLabel } from '../../data/venueLabels';
import { criterionIcons } from '../../data/venueIcons';
import { clubActivityIconUrl } from '../../data/stockClubActivities';
import { Dropdown } from '../common/Dropdown';
import { STOCK_OCCULTS } from '../../data/stockOccults';
import { type Choice, SKILL_CHOICES, TRAIT_CHOICES, CAREER_CHOICES, ACTIVITY_CHOICES } from '../../data/criteriaCatalogs';
import { CatalogPickerModal, RequirementBuilder, RequirementChip, RequirementValuePicker, mergeValues, replaceValues, type ReqOpt, type ReqCategory } from '../common/RequirementEditor';
import { VENUE_TUNING_MAP } from '../../lib/parser/lots';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import { lotIconUrlById } from '../../data/venueTypeIcons';
import { CLUB_HANGOUT_VENUES, CLUB_HANGOUT_VENUE_LABEL } from '../../data/clubHangoutVenues';
import type { VenueCriterion, ParsedClubRule } from '../../lib/parser/types';
import { Notes, MirroredDescription } from '../common/EntityText';
import { OverviewLanding, HeroSplit, StatTile } from '../common/OverviewTiles';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn, iconBtn } from '../common/btn';
import { Tooltip } from '../common/Tooltip';
import { PlannerPill } from '../common/PlannerPill';

// The non-home venue types a club may hang out at — the public-venue subset of
// the in-game club-venue range (CLUB_HANGOUT_VENUES minus the 4 residential
// "Club member's house" types, which are covered by the member-home rule). Used
// to keep the Specific Location picker to lots that can actually be a hangout.
const RESIDENTIAL_VENUE_IDS = new Set(['0x6fc6', '0x53533', '0x37f83', '0x3d9dc']);
const CLUB_ALLOWED_VENUE_TYPES = new Set(
  CLUB_HANGOUT_VENUES
    .filter((v) => !RESIDENTIAL_VENUE_IDS.has(v.id))
    .map((v) => VENUE_TUNING_MAP[v.id])
    .filter((label): label is string => !!label),
);

// Lifestage values are stored camelCase ('youngAdult'); display as "young adult".
function lifestageLabel(lifestage: string): string {
  return lifestage.replace(/([A-Z])/g, ' $1').toLowerCase();
}

// One labeled group inside the editor card — uppercase micro-label + content,
// matching the holiday/venue editor rhythm.
function Field({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs font-semibold text-c-dim uppercase tracking-label mb-2.5">
        {label}
        {count != null && count > 0 && <span className="text-c-faint font-normal normal-case tracking-normal">· {count}</span>}
      </div>
      {children}
    </div>
  );
}

// A membership requirement (read-only) — reuses the venue criterion display
// (icons + type label + value text). Club criteria are always required.
function CriterionChip({ c, onRemove }: { c: VenueCriterion; onRemove?: () => void }) {
  const icons = criterionIcons(c);
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
        <span className="block text-2xs font-bold uppercase tracking-label text-c-secondary">{criterionTypeLabel(c)}</span>
        <span className="block text-sm font-semibold text-c-text">{criterionValueText(c)}</span>
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

// "To whom" suffix for an activity rule, as READ OUT OF THE SAVE — a lifestage
// set, or the club a rule is aimed at. `clubName` resolves that club by the game
// id the rule carries. Nothing here is authored: the planner shows the target
// the game recorded and offers no way to set one.
function ruleTargetText(rule: ParsedClubRule, clubName: (id: string) => string | undefined): string | null {
  const t = rule.target;
  // The operator is TO, never FOR — a rule is something a member does *to*
  // someone, and "for" reads as who benefits rather than who it's aimed at.
  if (t.kind === 'age') return t.ages.length ? `to ${t.ages.map(ageRangeLabel).join(', ')}` : null;
  if (t.kind === 'club') return `to ${clubName(t.clubId) ?? 'another club'}`;
  return null; // anyone / other → no suffix
}

// One encouraged/discouraged activity. Icon resolves by activity id. Any "to
// whom" the save recorded is shown beneath the name, on every club — it is
// never editable, on either kind.
function RuleChip({ rule, target, onRemove }: {
  rule: ParsedClubRule;
  target: string | null;
  onRemove?: () => void;
}) {
  const icon = clubActivityIconUrl(rule.activityId);
  return (
    <span className={`inline-flex items-center gap-2.5 rounded-xl border pl-2.5 ${onRemove ? 'pr-3' : 'pr-3.5'} py-2 ${rule.encouraged ? 'bg-c-accent-soft border-c-accent-border' : 'bg-c-secondary-soft border-c-secondary-border'}`}>
      {icon && <img src={icon} alt="" className="w-7 h-7 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-c-text">{rule.activity}</span>
        {target && <span className="block text-2xs text-c-faint">{target}</span>}
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

// ── Hand-created authoring: option sets ─────────────────────────────────────
// Skill/trait/career/activity catalogs are shared across clubs + small businesses
// (+ future custom venues) via criteriaCatalogs — one source keeps the in-game
// criteria pickers consistent (visible skills, real careers, etc.).

// General-venue hangout choices — exactly the venue types the in-game club
// hangout picker allows (VenueTuning allowed_for_clubs flag + the residential
// "Club member's house" collapse), shown as "Any <Type>". See
// scripts/diagnostics/buildClubVenueChoices.ts / data/clubHangoutVenues.ts.
// One row per LABEL, not per tuning id: the game has four kinds of home lot and
// all four carry the same club-hangout label, so listing each of them printed
// "Any Club member's house" four times over. One row wins per label — plain
// Residential for the member's house, else the first id — and every other id
// still resolves to the same label on read (CLUB_HANGOUT_VENUE_LABEL is keyed by
// id), so a hangout the save set to any of the four reads back correctly.
const PREFERRED_VENUE_ID = '0x6fc6'; // Residential — the member's-house stand-in
const VENUE_TYPE_CHOICES: { id: string; label: string; icon: string | null }[] =
  CLUB_HANGOUT_VENUES.reduce<{ id: string; label: string; icon: string | null }[]>((acc, v) => {
    const label = `Any ${v.label}`;
    const row = { id: v.id, label, icon: lotIconUrlById(v.id) };
    const seen = acc.findIndex((c) => c.label === label);
    if (seen === -1) acc.push(row);
    else if (v.id === PREFERRED_VENUE_ID) acc[seen] = row;
    return acc;
  }, []);
// venue id → display label ("Any Arts Center"), for resolving a stored hangout.
// Prefer the club-context label (residential → "Club member's house"); fall back
// to the generic venue-type label for any id outside the picker's curated set.
const venueTypeLabel = (id: string | null | undefined): string => {
  if (!id) return 'Any Venue';
  const k = id.startsWith('0x') ? id : '0x' + id;
  const base = CLUB_HANGOUT_VENUE_LABEL[k] ?? VENUE_TUNING_MAP[k];
  return base ? `Any ${base}` : 'Any Venue';
};


const AGE_OPTS: ReqOpt[] = [{ v: 4, l: 'Child' }, { v: 8, l: 'Teen' }, { v: 16, l: 'Young Adult' }, { v: 32, l: 'Adult' }, { v: 64, l: 'Elder' }];
const OCCULT_OPTS: ReqOpt[] = Object.entries(STOCK_OCCULTS).map(([hex, name]) => ({ v: parseInt(hex, 16), l: name }));
const MARITAL_OPTS: ReqOpt[] = [{ v: 0, l: 'Married' }, { v: 1, l: 'Not Married' }];
const FUNDS_OPTS: ReqOpt[] = [{ v: 0, l: 'Poor' }, { v: 1, l: 'Moderate' }, { v: 2, l: 'Wealthy' }];
const FAME_OPTS: ReqOpt[] = [1, 2, 3, 4, 5].map((n) => ({ v: n, l: `Level ${n}` }));

const MAX_CLUB_REQUIREMENTS = 5;
const MAX_CLUB_RULES = 5; // per bucket (encouraged / discouraged)
// The game allows 8 members; a widely-used mod lifts that to effectively
// unlimited. So the count is stated against the limit and never enforced —
// going over is a real plan for a modded game, not a mistake to block.
const MAX_CLUB_MEMBERS = 8;

// Requirement categories the builder can author. raw = the parser's CLUB_CRITERION_TYPE code.
const REQ_CATEGORIES: ReqCategory[] = [
  { type: 'age', label: 'Age', raw: 5, kind: 'enum', opts: AGE_OPTS },
  { type: 'skill', label: 'Skill', raw: 0, kind: 'catalog', catalog: SKILL_CHOICES },
  { type: 'trait', label: 'Trait', raw: 1, kind: 'catalog', catalog: TRAIT_CHOICES },
  { type: 'career', label: 'Career', raw: 3, kind: 'catalog', catalog: CAREER_CHOICES },
  { type: 'occult', label: 'Occult', raw: 9, kind: 'enum', opts: OCCULT_OPTS },
  { type: 'marital', label: 'Marital status', raw: 2, kind: 'enum', opts: MARITAL_OPTS },
  { type: 'funds', label: 'Financial status', raw: 4, kind: 'enum', opts: FUNDS_OPTS },
  { type: 'fame', label: 'Celebrity level', raw: 7, kind: 'enum', opts: FAME_OPTS },
];

/** Merge added values into the club criteria as one VenueCriterion per type. */
function mergeClubCriteria(existing: VenueCriterion[], type: string, raw: number, values: number[]): VenueCriterion[] {
  return mergeValues<VenueCriterion>(
    existing, type, values,
    (c) => c.type === type,
    (c) => c.values,
    (vals) => ({ type: type as VenueCriterion['type'], required: true, values: vals, rawType: raw }),
    (c, vals) => ({ ...c, values: vals }),
  );
}
function replaceClubCriteria(existing: VenueCriterion[], type: string, raw: number, values: number[]): VenueCriterion[] {
  return replaceValues<VenueCriterion>(
    existing, values,
    (c) => c.type === type,
    (vals) => ({ type: type as VenueCriterion['type'], required: true, values: vals, rawType: raw }),
    (c, vals) => ({ ...c, values: vals }),
  );
}

function ClubCard({ club, selected, onClick }: { club: Club; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-listnav-id={club.id}
      className={`flex items-center gap-2 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left w-full transition-colors ${
        selected ? 'bg-c-accent-soft border-l-c-accent' : 'bg-transparent border-l-transparent hover:bg-c-panel'
      }`}
    >
      {club.icon ? (
        <img src={`/club-icons/${club.icon}.png`} alt="" className="w-10 h-10 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span className="w-10 h-10 shrink-0" aria-hidden />
      )}
      <span className="flex-1 min-w-0 text-sm font-semibold text-c-text tracking-headline truncate">{club.name}</span>
      {!club.sourceId && <PlannerPill />}
    </button>
  );
}

// A club member must be at least a child — toddlers, infants, and newborns
// (and pets) can't join a club. Mirrors the small-business owner gate.
const CLUB_MEMBER_INELIGIBLE_LIFESTAGES = new Set(['newborn', 'infant', 'toddler', 'pet']);

function MemberPickerModal({
  onClose,
  onSelect,
  excludeIds,
}: {
  onClose: () => void;
  onSelect: (simIds: string[]) => void;
  excludeIds: Set<string>;
}) {
  useEscapeToClose(onClose);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const byHousehold: Record<string, Sim[]> = {};
    for (const sim of Object.values(sims)) {
      if ((sim.recordStatus ?? 'active') !== 'active') continue; // roster sims only
      if (CLUB_MEMBER_INELIGIBLE_LIFESTAGES.has(sim.lifestage)) continue; // child and up
      if (excludeIds.has(sim.id)) continue;
      const full = `${sim.firstName} ${sim.lastName}`.trim().toLowerCase();
      if (q && !full.includes(q)) continue;
      const hh = sim.householdId ? households[sim.householdId] : undefined;
      const key = hh?.name ?? 'Unknown';
      if (!byHousehold[key]) byHousehold[key] = [];
      byHousehold[key].push(sim);
    }
    for (const k of Object.keys(byHousehold)) {
      byHousehold[k].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      );
    }
    return byHousehold;
  }, [sims, households, search, excludeIds]);

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Add member</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search sims…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([hh, hhSims]) => (
            <div key={hh}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">
                {hh}
              </div>
              {hhSims.map((sim) => {
                const on = picked.has(sim.id);
                return (
                  <button
                    key={sim.id}
                    onClick={() => toggle(sim.id)}
                    className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left justify-between items-center gap-2.5 hover:bg-c-accent-soft transition-colors"
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-c-accent border-c-accent' : 'border-c-border'}`}>{on && <Check size={11} weight="bold" className="text-white" />}</span>
                      <span className="text-sm font-medium text-c-text truncate">{sim.firstName} {sim.lastName}</span>
                    </span>
                    <span className="text-2xs font-semibold uppercase tracking-label text-c-faint shrink-0">{lifestageLabel(sim.lifestage)}</span>
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
              <p className="text-xs font-semibold text-c-text">No sims to add</p>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-c-border flex justify-end">
          <button type="button" onClick={() => { onSelect([...picked]); onClose(); }} disabled={picked.size === 0} className={btn('primary')}>Add {picked.size || ''}</button>
        </div>
      </div>
    </div>
  );
}

function LotPickerModal({ onClose, onSelect, memberHouseholdIds }: { onClose: () => void; onSelect: (lotKey: string) => void; memberHouseholdIds: Set<string> }) {
  useEscapeToClose(onClose);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  const [search, setSearch] = useState('');

  const { homes, byWorld } = useMemo(() => {
    const q = search.toLowerCase();
    const disabledSet = new Set(disabledWorlds);
    const homes: typeof lots[string][] = [];
    const byWorld: Record<string, typeof lots[string][]> = {};
    for (const lot of Object.values(lots)) {
      if (lot.location === 'Hidden Lot') continue;  // ignore hidden lots (Sylvan Glade, Magic Realm, …)
      if (disabledSet.has(lot.worldName)) continue;  // skip lots in switched-off worlds
      const isHome = getLotCategory(lot.customType) === 'home';
      if (isHome) {
        // Homes: only a member's house counts (the in-game "Any Club member's
        // house" rule). Apartments and Residential Rentals ARE valid member-home
        // hangouts (see coherence invariant C2); the shared eligibility check
        // only screens out the non-home types anyway.
        if (!isClubHangoutEligible(lot.customType)) continue;
        if (!lot.householdIds.some((h) => memberHouseholdIds.has(h))) continue;
      } else {
        // Venues: only those whose type is in the club-allowed range.
        if (!CLUB_ALLOWED_VENUE_TYPES.has(lot.customType)) continue;
      }
      if (q && !(lot.customName || lot.name).toLowerCase().includes(q) && !lot.worldName.toLowerCase().includes(q)) continue;
      if (isHome) homes.push(lot);
      else (byWorld[lot.worldName] ??= []).push(lot);
    }
    homes.sort((a, b) => a.name.localeCompare(b.name));
    for (const world of Object.keys(byWorld)) byWorld[world].sort((a, b) => a.name.localeCompare(b.name));
    return { homes, byWorld };
  }, [lots, search, disabledWorlds, memberHouseholdIds]);

  const LotRow = (lot: typeof lots[string]) => (
    <button
      key={lot.lotKey}
      onClick={() => { onSelect(lot.lotKey); onClose(); }}
      className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left justify-between items-center gap-3 hover:bg-c-accent-soft transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-c-text truncate">{lot.customName || lot.name}</div>
        <div className="text-2xs text-c-faint truncate">{lot.worldName} · {neighborhoodLabel(lot.location)}</div>
      </div>
      <span className="text-2xs font-semibold uppercase tracking-label text-c-faint shrink-0">{lot.customType}</span>
    </button>
  );

  const empty = homes.length === 0 && Object.keys(byWorld).length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Assign hangout lot</h3>
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
          {homes.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-green tracking-label uppercase font-semibold">Club member homes</div>
              {homes.map(LotRow)}
            </div>
          )}
          {Object.entries(byWorld).sort(([a], [b]) => compareWorldsCanonical(a, b)).map(([world, worldLots]) => (
            <div key={world}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">{world}</div>
              {worldLots.map(LotRow)}
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

export function ClubManager() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const clubs = useSaveFile((s) => s.clubs);
  const lots = useSaveFile((s) => s.lots);
  const addClub = useSaveFile((s) => s.addClub);
  const updateClub = useSaveFile((s) => s.updateClub);
  const deleteClub = useSaveFile((s) => s.deleteClub);
  const assignClub = useSaveFile((s) => s.assignClub);
  const unassignClub = useSaveFile((s) => s.unassignClub);
  const confirm = useConfirm();

  const sims = useSaveFile((s) => s.sims);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [activityPicker, setActivityPicker] = useState<null | { encouraged: boolean }>(null);
  const [editingReqType, setEditingReqType] = useState<string | null>(null); // requirement chip being edited
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isNotesDirty, setIsNotesDirty] = useState(false);
  // Which hangout mode the authoring picker is showing (None / General Venue /
  // Specific Lot). Local so the user can switch to "venue" before picking one.
  const [hangoutTab, setHangoutTab] = useState<'none' | 'venue' | 'lot'>('none');

  const allClubs = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(clubs)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clubs, search]);

  const selected = selectedId ? clubs[selectedId] : null;
  const assignedLot = selected?.assignedLotKey ? lots[selected.assignedLotKey] : null;
  const isImported = !!selected?.sourceId;

  // Resolve a rule's "toward <club>" target. A rule from the save names its
  // target by the game's club id; a rule you write here names it by planner id
  // (a club you invented has no game id to point at), so both are in the map.
  const clubNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of Object.values(clubs)) {
      if (c.sourceId) m.set(c.sourceId, c.name);
      m.set(c.id, c.name);
    }
    return m;
  }, [clubs]);
  const clubName = (id: string) => clubNameById.get(id);

  // Households a club member lives in — used to restrict home hangouts to
  // member houses (the in-game "Any Club member's house" rule).
  const memberHouseholdIds = useMemo(() => {
    const s = new Set<string>();
    for (const mid of selected?.memberSimIds ?? []) {
      const hh = sims[mid]?.householdId;
      if (hh) s.add(hh);
    }
    return s;
  }, [selected?.memberSimIds, sims]);

  // Indexed so chips can remove by original position in selected.rules.
  const { encouragedRules, discouragedRules } = useMemo(() => {
    const indexed = (selected?.rules ?? []).map((r, i) => ({ r, i }));
    return {
      encouragedRules: indexed.filter((x) => x.r.encouraged),
      discouragedRules: indexed.filter((x) => !x.r.encouraged),
    };
  }, [selected?.rules]);

  const clubStats = useMemo(() => {
    const all = Object.values(clubs);
    const total = all.length;
    const fromSave = all.filter((c) => c.sourceId).length;
    const withHangout = all.filter((c) => c.assignedLotKey || c.hangoutVenueTypeId).length;
    const members = all.reduce((sum, c) => sum + c.memberSimIds.length, 0);
    let largest: { name: string; count: number } | null = null;
    for (const c of all) {
      if (!largest || c.memberSimIds.length > largest.count) largest = { name: c.name, count: c.memberSimIds.length };
    }
    return { total, fromSave, planned: total - fromSave, withHangout, without: total - withHangout, members, largest };
  }, [clubs]);

  // Sync editable fields AFTER render from the live store — reading clubs[id]
  // synchronously in a click handler misses a just-created club (its write lands
  // during the await), the stale-closure bug holidays hit. (See [[feedback]].)
  useEffect(() => {
    if (!selected) return;
    setEditingName(selected.name);
    setEditingNotes(selected.notes);
    setIsNameDirty(false);
    setIsNotesDirty(false);
    setHangoutTab(selected.assignedLotKey ? 'lot' : selected.hangoutVenueTypeId ? 'venue' : 'none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function selectClub(id: string) {
    setSelectedId(id);
    setShowLotPicker(false);
    setShowMemberPicker(false);
    setShowIconPicker(false);
  }

  useListKeyboardNav({ items: allClubs, selectedId, onSelect: selectClub });

  async function handleCreate() {
    const id = await addClub({ name: 'New club', icon: '', notes: '', description: '', assignedLotKey: null, memberSimIds: [], leaderSimId: null, criteria: [], rules: [], inviteOnly: false, hangoutVenueTypeId: null, sourceId: null });
    selectClub(id);
  }

  function handleNameBlur() {
    if (!selected || !isNameDirty) return;
    updateClub(selected.id, { name: editingName || 'New club' });
    setIsNameDirty(false);
  }

  function handleNotesBlur() {
    if (!selected || !isNotesDirty) return;
    updateClub(selected.id, { notes: editingNotes });
    setIsNotesDirty(false);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!await confirm({ message: `Delete "${selected.name}"?`, confirmLabel: 'Delete', danger: true })) return;
    setSelectedId(null);
    await deleteClub(selected.id);
  }

  // Hangout is one of: None / General Venue (type) / Specific Lot — mutually
  // exclusive, so each setter clears the others.
  function handleAssign(lotKey: string) {
    if (!selected) return;
    if (selected.hangoutVenueTypeId) updateClub(selected.id, { hangoutVenueTypeId: null });
    assignClub(lotKey, selected.id);
    setShowLotPicker(false);
  }

  function handleUnassign() {
    if (!selected || !selected.assignedLotKey) return;
    unassignClub(selected.assignedLotKey, selected.id);
  }

  function handleSetVenueType(venueId: string) {
    if (!selected) return;
    if (selected.assignedLotKey) unassignClub(selected.assignedLotKey, selected.id);
    updateClub(selected.id, { hangoutVenueTypeId: venueId });
  }

  function handleHangoutNone() {
    if (!selected) return;
    if (selected.assignedLotKey) unassignClub(selected.assignedLotKey, selected.id);
    if (selected.hangoutVenueTypeId) updateClub(selected.id, { hangoutVenueTypeId: null });
  }

  function handleAddMembers(simIds: string[]) {
    if (!selected) return;
    const add = simIds.filter((id) => !selected.memberSimIds.includes(id));
    if (add.length) updateClub(selected.id, { memberSimIds: [...selected.memberSimIds, ...add] });
  }

  function handleRemoveMember(simId: string) {
    if (!selected) return;
    updateClub(selected.id, {
      memberSimIds: selected.memberSimIds.filter((x) => x !== simId),
      ...(selected.leaderSimId === simId ? { leaderSimId: null } : {}),
    });
  }

  function addCriterion(type: string, raw: number, values: number[]) {
    if (!selected) return;
    updateClub(selected.id, { criteria: mergeClubCriteria(selected.criteria, type, raw, values) });
  }
  function setCriteria(criteria: VenueCriterion[]) {
    if (selected) updateClub(selected.id, { criteria });
  }
  function removeRule(idx: number) {
    if (!selected) return;
    updateClub(selected.id, { rules: selected.rules.filter((_, i) => i !== idx) });
  }
  // Edit-set replace for ONE bucket (encouraged or discouraged). Keeps the other
  // bucket untouched, preserves each surviving rule's target, and caps the bucket.
  function setRules(encouraged: boolean, picked: Choice[]) {
    if (!selected) return;
    const keepOther = selected.rules.filter((r) => r.encouraged !== encouraged);
    const existing = new Map(selected.rules.filter((r) => r.encouraged === encouraged).map((r) => [r.activityId, r]));
    const nextBucket: ParsedClubRule[] = picked.slice(0, MAX_CLUB_RULES).map((c) =>
      existing.get(c.id) ?? { encouraged, activityId: c.id, activity: c.name, target: { kind: 'anyone' } });
    updateClub(selected.id, { rules: [...keepOther, ...nextBucket] });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-[1600px] w-full">
      <PackNotOwnedBanner packId="EP02" feature="Clubs" />
      <MasterDetail>
      {/* Left panel */}
      <MasterDetail.Rail width="w-64">
        <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
          <h1 className="text-xl font-bold text-c-text m-0 tracking-headline">Clubs</h1>
          <button
            onClick={handleCreate}
            className={btn('primary', { block: true, elevated: true })}
          >
            <Plus size={14} weight="bold" />
            <span className="text-2xs font-semibold uppercase tracking-label">New club</span>
          </button>
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search clubs..."
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
          {allClubs.length === 0 && (
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
                No clubs yet. Create one to get started.
              </div>
            )
          )}
          {allClubs.map((c) => (
            <ClubCard
              key={c.id}
              club={c}
              selected={c.id === selectedId}
              onClick={() => selectClub(c.id)}
            />
          ))}
        </div>
      </MasterDetail.Rail>

      {/* Right panel */}
      <MasterDetail.Detail label="Clubs">
      <div className="flex-1 overflow-y-auto p-8 bg-c-base">
        {!selected && clubStats.total === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="bg-c-card border border-c-border rounded-xl w-full max-w-md">
              <EmptyState
                icon={<UsersFour size={28} weight="duotone" />}
                title="No clubs yet"
                description="Create a club to track its name, icon, members, and hangout lot. Import a .save to auto-populate from Get Together stock clubs."
                cta={{ label: '+ New club', onClick: handleCreate }}
              />
            </div>
          </div>
        ) : !selected ? (
          <OverviewLanding title="Clubs at a glance" columns={3}>
            <HeroSplit
              total={clubStats.total}
              label={clubStats.total === 1 ? 'Club' : 'Clubs'}
              segments={[
                { value: clubStats.fromSave, label: 'from save', tone: 'green' },
                { value: clubStats.planned, label: 'planned', tone: 'plum' },
              ]}
            />
            <StatTile tone="green" label="Hangouts" value={clubStats.withHangout} sub={`of ${clubStats.total} clubs`}
              icon={<MapPin size={20} weight="duotone" />} />
            <StatTile tone="green" label="Members" value={clubStats.members} sub="sims in a club"
              icon={<UsersThree size={20} weight="duotone" />} />
            <StatTile tone="plum" label="Largest" value={clubStats.largest ? clubStats.largest.count : 0}
              sub={clubStats.largest ? clubStats.largest.name : '—'}
              icon={<UsersThree size={20} weight="duotone" />} />
          </OverviewLanding>
        ) : (
          <div className="max-w-3xl flex flex-col gap-7">
            {/* Hero — bare icon + name + invite/members subtitle */}
            <div className="flex items-start gap-5">
              {isImported ? (
                selected.icon ? (
                  <img src={`/club-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <UsersFour size={64} weight="duotone" className="text-c-faint shrink-0" />
                )
              ) : (
                <Tooltip text={selected.icon ? 'Change icon' : 'Add an icon'}>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker((v) => !v)}
                 
                    className="shrink-0 bg-transparent border-none p-0 cursor-pointer group" aria-label={selected.icon ? 'Change icon' : 'Add an icon'}>
                    {selected.icon ? (
                      <span className="relative block w-[72px] h-[72px]">
                        <img src={`/club-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain transition-opacity group-hover:opacity-40" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
                <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">Club</div>
                {isImported ? (
                  <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0 leading-tight break-words">{selected.name}</h2>
                ) : (
                  <div className="group/name flex items-center gap-1.5 border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                    <input
                      value={editingName}
                      onChange={(e) => { setEditingName(e.target.value); setIsNameDirty(true); }}
                      onBlur={handleNameBlur}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Name this club…"
                      className="flex-1 min-w-0 bg-transparent border-none text-3xl font-extrabold text-c-text tracking-headline outline-none placeholder:text-c-faint py-0.5"
                    />
                    <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-sm text-c-dim flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    {selected.inviteOnly
                      ? <EnvelopeSimple size={16} weight="duotone" className="text-c-secondary" />
                      : <EnvelopeSimpleOpen size={16} weight="duotone" className="text-c-green" />}
                    {selected.inviteOnly ? 'Invite Only' : 'Open Invitation'}
                  </span>
                  <span className="text-c-faint">·</span>
                  <span>{selected.memberSimIds.length} member{selected.memberSimIds.length !== 1 ? 's' : ''}</span>
                  <button onClick={handleDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                    <Trash size={13} weight="bold" /> Remove
                  </button>
                </div>
              </div>
            </div>

            {/* Description — the club's in-game description, mirrored read-only
                from your save (hidden when empty). */}
            <MirroredDescription value={selected.description} />

            {/* Icon picker — pops out when the header icon is clicked (hand-created) */}
            {!isImported && showIconPicker && (
              <IconPickerModal iconSet="club" value={selected.icon} onChange={(icon) => updateClub(selected.id, { icon })} onClose={() => setShowIconPicker(false)} />
            )}

            {/* One editor surface — grouped, full-width. Imported = read-only display;
                hand-created = full authoring (membership, leader, requirements, activities). */}
            <div className="rounded-xl border border-c-border bg-c-card shadow-sm px-6 flex flex-col divide-y divide-c-border">
              {/* Membership (hand-created authoring) */}
              {!isImported && (
                <div className="py-6">
                  <Field label="Membership">
                    <div className="inline-flex rounded-md border border-c-border overflow-hidden">
                      {[{ v: false, l: 'Open Invitation' }, { v: true, l: 'Invite Only' }].map((o) => (
                        <button
                          key={o.l}
                          type="button"
                          onClick={() => updateClub(selected.id, { inviteOnly: o.v })}
                          className={`text-sm px-3.5 py-1.5 cursor-pointer border-none transition-colors ${selected.inviteOnly === o.v ? 'bg-c-accent text-white font-semibold' : 'bg-c-base text-c-dim hover:text-c-text'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {/* Members — click a member to open their sim detail. Imported shows a
                  Leader/Member pill; hand-created can add/remove + tap the pill to set Leader. */}
              <div className="py-6">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-2xs font-semibold text-c-dim uppercase tracking-label">
                    Members {selected.memberSimIds.length > 0 && (
                      <span className={`font-normal normal-case tracking-normal tabular-nums ${selected.memberSimIds.length > MAX_CLUB_MEMBERS ? 'text-c-red font-semibold' : 'text-c-faint'}`}>
                        · {selected.memberSimIds.length} / {MAX_CLUB_MEMBERS}
                      </span>
                    )}
                  </span>
                  {!isImported && (
                    <button
                      onClick={() => setShowMemberPicker(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent"
                    >
                      <Plus size={14} weight="bold" /> Add member
                    </button>
                  )}
                </div>
                {selected.memberSimIds.length === 0 ? (
                  <p className="text-sm text-c-faint italic m-0">No members{isImported ? '.' : ' yet.'}</p>
                ) : (
                  <div className="flex flex-col gap-px bg-c-border border border-c-border rounded-lg overflow-hidden">
                    {selected.memberSimIds.map((simId) => {
                      const sim = sims[simId];
                      const isLeader = simId === selected.leaderSimId;
                      return (
                        <div key={simId} className="flex items-center justify-between gap-2 px-3 py-2 bg-c-card">
                          {sim ? (
                            <Tooltip text="Open sim">
                              <button
                                type="button"
                                onClick={() => navigate(`/saves/${saveFileId}/sims?sim=${simId}`)}
                                className="min-w-0 bg-transparent border-none p-0 cursor-pointer text-left group" aria-label="Open sim">
                                <span className="text-sm font-medium text-c-text truncate group-hover:text-c-green transition-colors">{sim.firstName} {sim.lastName}</span>
                              </button>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-c-faint italic">deleted sim</span>
                          )}
                          <div className="flex items-center gap-2 shrink-0">
                            {sim && (isImported ? (
                              <span className={`text-2xs font-bold uppercase tracking-label px-2.5 py-1 rounded-full ${isLeader ? 'bg-c-accent-soft text-c-green' : 'bg-c-panel text-c-dim'}`}>
                                {isLeader ? 'Leader' : 'Member'}
                              </span>
                            ) : (
                              <Tooltip text={isLeader ? 'Remove as leader' : 'Make leader of club'}>
                                <button
                                  type="button"
                                  onClick={() => updateClub(selected.id, { leaderSimId: isLeader ? null : simId })}
                               
                                  className={`text-2xs font-bold uppercase tracking-label px-2.5 py-1 rounded-full cursor-pointer border-none transition-colors ${isLeader ? 'bg-c-accent-soft text-c-green' : 'bg-c-panel text-c-faint hover:text-c-dim'}`} aria-label={isLeader ? 'Remove as leader' : 'Make leader of club'}>
                                  {isLeader ? 'Leader' : 'Make leader'}
                                </button>
                              </Tooltip>
                            ))}
                            {!isImported && (
                              <Tooltip text="Remove from club">
                                <button
                                  onClick={() => handleRemoveMember(simId)}
                                  className={iconBtn(7, 'danger')} aria-label="Remove from club">
                                  <X size={11} weight="bold" />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Requirements — read-only (imported, if any) / authored (hand-created) */}
              {(isImported ? selected.criteria.length > 0 : true) && (
                <div className="py-6">
                  <Field label="Requirements" count={selected.criteria.length}>
                    {selected.criteria.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 mb-3">
                        {selected.criteria.map((c, i) => (
                          isImported ? (
                            <CriterionChip key={i} c={c} />
                          ) : (
                            <RequirementChip
                              key={i}
                              typeLabel={criterionTypeLabel(c)}
                              values={c.values}
                              valueLabel={(vi) => criterionValueText({ ...c, values: [c.values[vi]] })}
                              valueIcon={(vi) => criterionIcons({ ...c, values: [c.values[vi]] })[0]}
                              onEdit={() => setEditingReqType(c.type)}
                              onRemoveValue={(vi) => {
                                const nv = c.values.filter((_, j) => j !== vi);
                                setCriteria(nv.length
                                  ? selected.criteria.map((cc, j) => (j === i ? { ...cc, values: nv } : cc))
                                  : selected.criteria.filter((_, j) => j !== i));
                              }}
                            />
                          )
                        ))}
                      </div>
                    )}
                    {!isImported && (
                      <RequirementBuilder
                        categories={REQ_CATEGORIES}
                        atMax={selected.criteria.length >= MAX_CLUB_REQUIREMENTS}
                        capLabel={`Maximum ${MAX_CLUB_REQUIREMENTS} requirements.`}
                        usedTypes={new Set(selected.criteria.map((c) => c.type))}
                        onEditExisting={setEditingReqType}
                        onAdd={addCriterion}
                      />
                    )}
                  </Field>
                </div>
              )}

              {/* Activities — read-only (imported, if any) / authored (hand-created) */}
              {(isImported ? selected.rules.length > 0 : true) && (
                <div className="py-6">
                  <Field label="Activities" count={selected.rules.length}>
                    <div className="flex flex-col gap-4">
                      {(encouragedRules.length > 0 || !isImported) && (
                        <div>
                          <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-label text-c-green mb-2">
                            <ThumbsUp size={13} weight="fill" /> Encouraged
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            {encouragedRules.map(({ r, i }) => <RuleChip key={i} rule={r} target={ruleTargetText(r, clubName)} onRemove={isImported ? undefined : () => removeRule(i)} />)}
                            {!isImported && (
                              <button type="button" onClick={() => setActivityPicker({ encouraged: true })} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-2 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent">
                                <Plus size={14} weight="bold" /> {encouragedRules.length >= MAX_CLUB_RULES ? 'Edit' : 'Add'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {(discouragedRules.length > 0 || !isImported) && (
                        <div>
                          <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-label text-c-secondary mb-2">
                            <ThumbsDown size={13} weight="fill" /> Discouraged
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            {discouragedRules.map(({ r, i }) => <RuleChip key={i} rule={r} target={ruleTargetText(r, clubName)} onRemove={isImported ? undefined : () => removeRule(i)} />)}
                            {!isImported && (
                              <button type="button" onClick={() => setActivityPicker({ encouraged: false })} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-2 cursor-pointer transition-colors bg-c-base text-c-secondary border-c-border hover:border-c-secondary">
                                <Plus size={14} weight="bold" /> {discouragedRules.length >= MAX_CLUB_RULES ? 'Edit' : 'Add'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </Field>
                </div>
              )}

              {/* Hangout — None / General Venue (type) / Specific Lot. Imported
                  clubs are read-only; hidden entirely if they have no hangout. */}
              {(() => {
                const venueId = selected.hangoutVenueTypeId;
                const venueIcon = venueId ? lotIconUrlById(venueId) : null;
                if (isImported && !assignedLot && !venueId) return null;

                const lotBox = (withControls: boolean) => (
                  <div className="bg-c-base border border-c-border rounded-lg px-4 py-3 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <div
                        className="text-sm font-semibold text-c-green cursor-pointer hover:underline truncate"
                        onClick={() => navigate(
                          `/saves/${saveFileId}/world/${encodeURIComponent(assignedLot!.worldName)}?lot=${encodeURIComponent(assignedLot!.lotKey)}`,
                          { state: { from: `/saves/${saveFileId}/clubs` } },
                        )}
                      >
                        {assignedLot!.customName || assignedLot!.name}
                      </div>
                      <div className="text-[11px] text-c-dim truncate">{assignedLot!.worldName} · {neighborhoodLabel(assignedLot!.location)}</div>
                    </div>
                    {withControls && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setShowLotPicker(true)} className="bg-transparent border border-c-accent-border hover:border-c-accent text-c-green hover:bg-c-accent-soft rounded-md px-2.5 py-1 text-2xs font-semibold uppercase tracking-label cursor-pointer transition-colors">Change</button>
                        <button onClick={handleUnassign} className="bg-transparent border border-c-border hover:border-c-red-border text-c-dim hover:text-c-red rounded-md px-2.5 py-1 text-2xs font-semibold uppercase tracking-label cursor-pointer transition-colors">Unassign</button>
                      </div>
                    )}
                  </div>
                );

                const venueBox = () => (
                  <div className="bg-c-base border border-c-border rounded-lg px-4 py-3 flex items-center gap-2.5">
                    {venueIcon && <img src={venueIcon} alt="" className="w-6 h-6 object-contain shrink-0" />}
                    <div className="text-sm font-semibold text-c-text">{venueTypeLabel(venueId)}</div>
                  </div>
                );

                return (
                  <div className="py-6">
                    <Field label="Hangout">
                      {isImported ? (
                        assignedLot ? lotBox(false) : venueBox()
                      ) : (
                        <>
                          <div className="flex gap-1.5 mb-3">
                            {([['none', 'None'], ['venue', 'General Venue'], ['lot', 'Specific Lot']] as const).map(([m, lbl]) => (
                              <button
                                key={m}
                                onClick={() => {
                                  if (m === 'none') handleHangoutNone();
                                  else if (m === 'venue') { if (selected.assignedLotKey) unassignClub(selected.assignedLotKey, selected.id); }
                                  else if (selected.hangoutVenueTypeId) updateClub(selected.id, { hangoutVenueTypeId: null });
                                  setHangoutTab(m);
                                }}
                                className={`flex-1 rounded-md px-3 py-1.5 text-2xs font-semibold uppercase tracking-label border cursor-pointer transition-colors ${hangoutTab === m ? 'bg-c-accent-soft border-c-accent text-c-green' : 'bg-c-base border-c-border text-c-dim hover:border-c-accent'}`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                          {hangoutTab === 'venue' && (
                            <Dropdown
                              value={venueId ?? ''}
                              onChange={handleSetVenueType}
                              placeholder="Choose a venue type"
                              ariaLabel="Hangout venue type"
                              options={VENUE_TYPE_CHOICES.map((v) => ({
                                value: v.id,
                                label: v.label,
                                icon: v.icon ? <img src={v.icon} alt="" className="w-4 h-4 object-contain" /> : undefined,
                              }))}
                            />
                          )}
                          {hangoutTab === 'lot' && (
                            assignedLot ? lotBox(true) : (
                              <button
                                onClick={() => setShowLotPicker(true)}
                                className="w-full bg-c-base border border-dashed border-c-border hover:border-c-accent hover:bg-c-accent-soft rounded-lg px-4 py-3 text-c-dim hover:text-c-accent cursor-pointer text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                              >
                                <MapPin size={14} weight="fill" />
                                Assign a hangout lot
                              </button>
                            )
                          )}
                        </>
                      )}
                    </Field>
                  </div>
                );
              })()}
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

      {showLotPicker && (
        <LotPickerModal
          onClose={() => setShowLotPicker(false)}
          onSelect={handleAssign}
          memberHouseholdIds={memberHouseholdIds}
        />
      )}

      {showMemberPicker && selected && (
        <MemberPickerModal
          onClose={() => setShowMemberPicker(false)}
          onSelect={handleAddMembers}
          excludeIds={new Set(selected.memberSimIds)}
        />
      )}

      {editingReqType && selected && (() => {
        const cat = REQ_CATEGORIES.find((rc) => rc.type === editingReqType);
        if (!cat) return null;
        const crit = selected.criteria.find((c) => c.type === editingReqType);
        return (
          <RequirementValuePicker
            cat={cat}
            values={crit?.values ?? []}
            onReplace={(values) => setCriteria(replaceClubCriteria(selected.criteria, cat.type, cat.raw, values))}
            onClose={() => setEditingReqType(null)}
          />
        );
      })()}

      {activityPicker && selected && (() => {
        const enc = activityPicker.encouraged;
        const rules = selected.rules;
        return (
          <CatalogPickerModal
            title={`Edit ${enc ? 'encouraged' : 'discouraged'} activities`}
            items={ACTIVITY_CHOICES}
            multiSelect
            preselected={new Set(rules.filter((r) => r.encouraged === enc).map((r) => r.activityId))}
            disabledIds={new Set(rules.filter((r) => r.encouraged !== enc).map((r) => r.activityId))} // can't be in both buckets
            maxSelected={MAX_CLUB_RULES}
            onSelect={(picked) => setRules(enc, picked)}
            onClose={() => setActivityPicker(null)}
          />
        );
      })()}
      </MasterDetail>
    </div>
  );
}
