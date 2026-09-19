import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CaretDown, CaretUp, Check, MagnifyingGlass, X, Plus, GraduationCap, GearSix } from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import { Dropdown } from '../common/Dropdown';
import { Tooltip } from '../common/Tooltip';
import { Notes } from '../common/EntityText';
import { CatalogPickerModal } from '../common/RequirementEditor';
import { btn } from '../common/btn';
import { PillGroup, AddBtn, SwapBtn, RevertBtn, REVERT_ICON } from '../common/PillBtn';
import { STOCK_TRAITS, traitsForLifestage, traitIconUrlById } from '../../data/stockTraits';
import { ROLE_TRAITS } from '../../data/stockRoleTraits';
import { STOCK_ASPIRATIONS, aspirationsForLifestage, aspirationIconUrlById } from '../../data/stockAspirations';
import { STOCK_SKILLS } from '../../data/stockSkills';
import { SKILL_CRITERIA_IDS } from '../../data/skillCriteriaIds';
import { skillAgeTier, type SkillAgeTier } from '../../data/stockSkillCurves';
import { skillIconUrlById } from '../../data/skillIcons';
import { STOCK_CAREERS, type CareerKind } from '../../data/stockCareers';
import { careerIconUrlById } from '../../data/careerIcons';
import { earnedDegreeFromTrait, isDegreeTrait, DEGREE_SUBJECTS } from '../../data/stockDegrees';
import { DEATH_CAUSE_TRAITS } from '../../data/deathCauses';
import { useConfirm } from '../common/ConfirmDialog';
import { usePackOwnership } from '../../store/usePackOwnership';
import { getTraitPack, getAspirationPack, getCareerPack, getSkillPack, getOccultPack } from '../../data/packAssignments';
import { resolveGenderedText } from '../../lib/genderedText';
import { computeHouseholdRelevance, isForegroundEffective } from '../../lib/householdRelevance';
import type { Choice } from '../../data/criteriaCatalogs';
import type { Sim, SimGender, SimLifestage, SimOccult } from '../../types';
import { EMPTY_COMPOSITION } from '../../types';
import type { ParsedLifestage } from '../../lib/parser/types';
import { useEscapeToClose } from '../common/useEscapeToClose';

// ─── Constants (shared shape with the randomizer / old SimForm) ───────────────

// User-locked CAS trait caps per lifestage. Pets get 0 (no catalog).
const TRAIT_COUNT: Record<SimLifestage, number> = {
  newborn: 0, infant: 1, toddler: 1, child: 1, teen: 2, youngAdult: 3, adult: 3, elder: 3, pet: 0,
};

const LIFESTAGE_PARSED_BRIDGE: Record<SimLifestage, ParsedLifestage> = {
  newborn: 'newborn', infant: 'infant', toddler: 'toddler', child: 'child', teen: 'teen',
  youngAdult: 'youngAdult', adult: 'adult', elder: 'elder', pet: 'pet',
};

const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};

// De-aging is allowed (planner is a free canvas) — every human stage offered, no clamp.
const LIFESTAGE_OPTIONS: { value: string; label: string }[] = (
  ['newborn', 'infant', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'] as SimLifestage[]
).map((v) => ({ value: v, label: LIFESTAGE_LABEL[v] }));

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const OCCULT_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'vampire', label: 'Vampire' },
  { value: 'alien', label: 'Alien' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'spellcaster', label: 'Spellcaster' },
  { value: 'werewolf', label: 'Werewolf' },
  { value: 'fairy', label: 'Fairy' },
];

// Ghost folded in as an occult (Simmer mental model). Mutually exclusive with
// the real occults — selecting one clears the other.
const OCCULT_GHOST_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'ghost', label: 'Ghost' },
  ...OCCULT_OPTIONS.filter((o) => o.value !== 'none'),
];

// Collapse the skills chip list past this many (they can pile up).
const SKILLS_LIMIT = 8;

// Which skill age-tier a lifestage builds — gates the add-skill picker so a
// young adult isn't offered Thinking (toddler) or Motor (child), etc. Newborn/
// infant have no skill catalog.
const SKILL_TIER_FOR_LIFESTAGE: Partial<Record<SimLifestage, SkillAgeTier>> = {
  toddler: 'toddler', child: 'child', teen: 'adult', youngAdult: 'adult', adult: 'adult', elder: 'adult',
};

/**
 * Which kinds of job a lifestage can hold — the career picker's age filter.
 *
 * Teens work the teen jobs; everyone grown works full-time, part-time and
 * freelance. Children and under hold no job at all, so the Career row doesn't
 * appear for them.
 *
 * The two lists overlap by NAME: Babysitter, Barista, Fast Food, Manual Labor
 * and Retail each exist twice in the game, once as a teen job and once as an
 * adult part-time one. Offering both at once put five pairs of identical rows in
 * the picker — same label, same icon, no way to tell which was which, and half
 * of them wrong for the sim you were editing. Filtering by age removes every
 * pair, because each pair is exactly one teen job and one adult job.
 *
 * Save-imported sims can't be re-aged (see the Lifestage row), so this filter is
 * stable for them.
 */
const CAREER_KINDS_FOR_LIFESTAGE: Partial<Record<SimLifestage, CareerKind[]>> = {
  teen: ['teen'],
  youngAdult: ['fulltime', 'parttime', 'freelance'],
  adult: ['fulltime', 'parttime', 'freelance'],
  elder: ['fulltime', 'parttime', 'freelance'],
};

const CAREER_KIND_LABEL: Partial<Record<CareerKind, string>> = {
  fulltime: 'Full-time', parttime: 'Part-time', freelance: 'Freelance', teen: 'Teen job',
};

// The generic freelancer track. A sim's real choice is the trade (Digital
// Artist, Programmer, …); the generic entry lives only in the save's career
// history, and pickCareer already collapses it. Offering it alongside its own
// trades read as a fourth trade.
const FREELANCER_BASE_UID = '0x327c7';

// Every known cause of death (catalog values are unique per trait), plus '—'
// for the living. Authoring a cause implies death → occult flips to Ghost.
const DEATH_CAUSE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  ...[...new Set(Object.values(DEATH_CAUSE_TRAITS))].sort().map((n) => ({ value: n, label: n })),
];

const occultLabel = (o: SimOccult) => OCCULT_OPTIONS.find((x) => x.value === o)?.label ?? '—';
const occultGhostLabel = (o: SimOccult, ghost: boolean) => (ghost ? 'Ghost' : occultLabel(o));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// ─── Presentational grammar (shared across panels) ────────────────────────────

function IconImg({ url, size = 15 }: { url: string | null | undefined; size?: number }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="object-contain shrink-0"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/** Read-only mirror value in the same silhouette as a Dropdown/SoftInput —
 *  full-color, field-shaped; the MISSING caret/affordance is the read-only cue
 *  (no graying, no lock — per the field-state grammar). */
const StaticValue = ({ children }: { children: ReactNode }) => (
  <div className="w-full bg-c-base border border-c-border rounded-md px-3 py-1.5 text-sm text-c-text">{children}</div>
);


/** Soft-filled card = one section as a solid object (matches Business/Venue). */
function Card({ title, count, action, children }: { title: string; count?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-c-border py-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h4 className="text-[10px] font-bold text-c-secondary uppercase tracking-label m-0">{title}</h4>
          {count != null && <span className="text-[10px] text-c-faint">{count}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, children, align = 'center' }: { label: string; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div className={`flex gap-3 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <div className={`w-[68px] shrink-0 text-[11px] text-c-dim ${align === 'start' ? 'pt-1.5' : ''}`}>{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Soft-filled text input with an internal, co-located revert when edited. */
function SoftInput({ value, onChange, onBlur, edited, savedDisplay, onRevert, autoFocus }: {
  value: string; onChange: (v: string) => void; onBlur: () => void;
  edited?: boolean; savedDisplay?: string | null; onRevert?: () => void; autoFocus?: boolean;
}) {
  return (
    <div className="relative w-full">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        className={`w-full bg-c-base rounded-lg px-3 py-2 text-sm text-c-text outline-none border focus:border-c-accent ${edited ? 'border-c-secondary pr-11' : 'border-c-border'}`}
      />
      {edited && onRevert && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <RevertBtn savedDisplay={savedDisplay} onClick={onRevert} />
        </span>
      )}
    </div>
  );
}

/** Soft-filled chip. `sub` renders as a small badge (e.g. a skill level). No
 *  onRemove → read-only mirror (no ✕). `edited` = a planner add (subtle emphasis). */
function Chip({ icon, label, sub, onRemove, edited }: {
  icon?: ReactNode; label: string; sub?: string; onRemove?: () => void; edited?: boolean;
}) {
  return (
    <span className={`group/chip inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[12px] text-c-text border ${edited ? 'border-c-secondary bg-c-base' : 'border-c-border bg-c-base'}`}>
      {icon}
      <span className="truncate">{label}</span>
      {sub != null && <span className="text-[10px] font-bold text-c-dim bg-c-panel rounded px-1 ml-0.5">{sub}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="text-c-faint hover:text-c-red hidden group-hover/chip:flex focus:flex bg-transparent border-none cursor-pointer items-center -mr-1"
        >
          <X size={10} weight="bold" />
        </button>
      )}
    </span>
  );
}

// ─── Move-destination picker ──────────────────────────────────────────────────
// Pick where a sim plans to move: an existing household, or a name-only NEW
// household shell (the mover is its founding sim — no CAS card needed here, per
// project_planned_moves_spec's "move-picker = name-only, never CAS"). Real sims
// only; plan-only sims never open this.
function MovePickerModal({ sim, onClose, onJump }: { sim: Sim; onClose: () => void; onJump?: (householdId: string) => void }) {
  useEscapeToClose(onClose);
  const households = useSaveFile((s) => s.households);
  const sims = useSaveFile((s) => s.sims);
  const lots = useSaveFile((s) => s.lots);
  const relationships = useSaveFile((s) => s.relationships);
  const addHousehold = useSaveFile((s) => s.addHousehold);
  const updateSim = useSaveFile((s) => s.updateSim);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // My Households (foreground) first, then Rest of Town — same split as Col1.
  const relevance = useMemo(() => computeHouseholdRelevance(households, sims, relationships), [households, sims, relationships]);
  const { mine, town } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cands = Object.values(households)
      .filter((h) => h.id !== sim.householdId)
      .filter((h) => !q || h.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      mine: cands.filter((h) => isForegroundEffective(h, relevance)),
      town: cands.filter((h) => !isForegroundEffective(h, relevance)),
    };
  }, [households, sim.householdId, search, relevance]);
  const candidates = [...mine, ...town];

  /**
   * Applies the move and STAYS OPEN.
   *
   * It used to close on the click, so the destination you'd just chosen flashed
   * past and you had to reopen to confirm it took. Now the picked household is
   * ticked and you leave when you're ready — Done, the X, Escape, or clicking
   * away, like everything else.
   */
  function choose(destId: string) {
    // Consumed-on-match: picking the sim's own household is a no-op (clear).
    updateSim(sim.id, { plannedMoveHouseholdId: destId === sim.householdId ? null : destId });
  }
  async function createAndMove() {
    if (creating) return;
    // Default the shell's name to the mover's surname (e.g. "Addam") so you
    // can just hit Create — no manual typing required.
    const name = newName.trim() || sim.lastName?.trim() || 'New household';
    setCreating(true);
    // A plan-only shell: no lot/sim of its own, it exists because the mover
    // points at it. Provenance yours/built so it lands in My Households.
    const id = await addHousehold({
      name, composition: { ...EMPTY_COMPOSITION }, assignedLotKey: null, notes: '', description: '',
      thumbnailFilename: null, sourceId: null, money: null, plannedMoney: null,
      provenance: 'yours', provenanceSub: 'built', creatorName: null, visibility: 'auto',
    });
    updateSim(sim.id, { plannedMoveHouseholdId: id });
    onClose();
    // Jump straight to the household you just made so you can flesh it out.
    onJump?.(id);
  }

  const lotName = (h: (typeof households)[string]) => (h.assignedLotKey ? lots[h.assignedLotKey]?.customName ?? null : null);

  // Portal to <body> so the scrim covers the whole viewport (the workspace aside
  // has a transform that would otherwise scope this fixed overlay to that box).
  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-[10px] w-full max-w-[440px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <span className="text-sm text-c-text">Plan a move for {sim.firstName || 'this sim'}</span>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text cursor-pointer w-7 h-7 flex items-center justify-center"><X size={18} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search households…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {([['My Households', mine], ['Rest of Town', town]] as const).map(([label, group]) => group.length === 0 ? null : (
            <div key={label}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">{label}</div>
              {group.map((h) => {
                const ln = lotName(h);
                // Purple, not green: a planned move is your hand, not the save.
                const picked = h.id === sim.plannedMoveHouseholdId;
                return (
                  <button
                    key={h.id}
                    onClick={() => choose(h.id)}
                    className={`w-full px-4 py-2.5 border-none border-b border-c-panel cursor-pointer text-left transition-colors flex items-center justify-between gap-2 ${
                      picked ? 'bg-c-secondary-soft' : 'bg-transparent hover:bg-c-accent-soft'
                    }`}
                  >
                    <span className={`text-[13px] truncate ${picked ? 'text-c-secondary font-semibold' : 'text-c-text'}`}>{h.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {ln && <span className="text-[11px] text-c-faint">{ln}</span>}
                      {picked && <Check size={14} weight="bold" className="text-c-secondary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {candidates.length === 0 && <p className="px-4 py-4 text-[12px] text-c-faint italic m-0">No other households.</p>}
        </div>
        {/* Name-only new household (mover founds it). */}
        <div className="px-4 py-3 border-t border-c-border flex items-center gap-2">
          <input
            placeholder={sim.lastName ? sim.lastName : 'New household name…'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createAndMove(); }}
            className="flex-1 min-w-0 bg-c-base border border-c-border rounded-md px-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent"
          />
          <button
            type="button"
            onClick={createAndMove}
            disabled={creating}
            className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-md text-[12px] font-semibold cursor-pointer transition-colors bg-c-accent-soft text-c-accent hover:bg-c-accent hover:text-white disabled:opacity-40 disabled:cursor-default border-none"
          >
            <Plus size={13} weight="bold" /> Create
          </button>
        </div>
        {/* A way out that isn't the X. The move is already saved by the time you
            get here, so this dismisses rather than confirms. */}
        <div className="px-4 py-3 border-t border-c-border flex justify-end">
          <button onClick={onClose} className={btn('ghost')}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── The panel ────────────────────────────────────────────────────────────────

export function SimPanel({ sim, onJumpToHousehold }: { sim: Sim; onJumpToHousehold?: (householdId: string) => void }) {
  const updateSim = useSaveFile((s) => s.updateSim);
  const clubsMap = useSaveFile((s) => s.clubs);
  const dynastiesMap = useSaveFile((s) => s.dynasties);
  const businessesMap = useSaveFile((s) => s.smallBusinesses);
  const householdsMap = useSaveFile((s) => s.households);
  const confirm = useConfirm();

  // Planned move (Option C sticker). Only REAL, on-roster sims can move; plan-
  // only + tree-only sims are locked to their household (see spec).
  const [pickingMove, setPickingMove] = useState(false);
  // Edit toggle (mirrors Col2): fields are clean read-only values until Edit is
  // on, then the controls + per-field purple/reverts appear.
  const [editing, setEditing] = useState(false);
  const currentHousehold = sim.householdId ? householdsMap[sim.householdId] : null;
  const plannedDest = sim.plannedMoveHouseholdId ? householdsMap[sim.plannedMoveHouseholdId] : null;
  const canMove = !!sim.sourceId && sim.recordStatus === 'active';

  // Local state for the free-text fields — auto-save on blur (app save model).
  const [firstName, setFirstName] = useState(sim.firstName);
  const [lastName, setLastName] = useState(sim.lastName);
  const [notes, setNotes] = useState(sim.notes);
  // Keep the local text mirrors in sync with the committed values. These only
  // change externally via a blur-commit or a revert (never mid-type), so pulling
  // them straight through won't clobber in-progress typing — and it lets a
  // revert (or revert-all) actually repopulate the input, not just the header.
  useEffect(() => { setFirstName(sim.firstName); }, [sim.firstName]);
  useEffect(() => { setLastName(sim.lastName); }, [sim.lastName]);
  useEffect(() => { setNotes(sim.notes); }, [sim.notes]);

  // Pack ownership gates the trait / aspiration pools (re-filter on toggle).
  const isOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);

  const isPet = sim.species === 'pet';
  const baseline = sim.lastImportedState ?? null; // null = plan-only → no Mirrored/Edited cue ever

  // CAS-personality traits the sim currently has (the rest of traitIds = degree /
  // hidden / occult traits, surfaced elsewhere or hidden).
  const casTraitIds = useMemo(() => (sim.traitIds ?? []).filter((id) => STOCK_TRAITS[id]), [sim.traitIds]);
  const traitCap = TRAIT_COUNT[sim.lifestage] ?? 0;

  // Every occult is one pack's life state, so you're offered the ones you own —
  // the same rule as the traits and aspiration a row below. Ghost is base game
  // and always offered. A sim who already IS an occult keeps it listed even with
  // that pack off, so the field can never fail to show what they are.
  const occultGhostOptions = useMemo(() => {
    const current = sim.isGhost ? 'ghost' : sim.occult;
    return OCCULT_GHOST_OPTIONS.filter((o) => o.value === current || isOwned(getOccultPack(o.value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.occult, sim.isGhost, isOwned, manualOverrides, autoDetected]);

  const traitPool = useMemo(() => {
    if (isPet) return [];
    return traitsForLifestage(LIFESTAGE_PARSED_BRIDGE[sim.lifestage]).filter((t) => isOwned(getTraitPack(t.id)));
  }, [isPet, sim.lifestage, isOwned, manualOverrides, autoDetected]);
  const aspirationPool = useMemo(() => {
    if (isPet) return [];
    return aspirationsForLifestage(LIFESTAGE_PARSED_BRIDGE[sim.lifestage]).filter((a) => isOwned(getAspirationPack(a.id)));
  }, [isPet, sim.lifestage, isOwned, manualOverrides, autoDetected]);

  // Popout state.
  const [pickingTraits, setPickingTraits] = useState(false);
  const [pickingAspiration, setPickingAspiration] = useState(false);
  const [pickingSkill, setPickingSkill] = useState(false);
  const [pickingCareer, setPickingCareer] = useState(false);
  const [pickingEnrolled, setPickingEnrolled] = useState(false);
  const [pickingEarned, setPickingEarned] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  // ── Edited-state bookkeeping. A field is Edited iff a baseline exists and the
  // authored value differs from it (consumed-on-match by construction). Each flag
  // drives a per-row revert pill; they're also gathered into ONE merged patch for
  // the header "revert all" (see buildRevertPatch below). ──
  const scalarEdited = <K extends keyof Sim>(saved: Sim[K] | undefined, key: K): boolean =>
    !!baseline && saved !== sim[key];

  const firstEdited = scalarEdited(baseline?.firstName, 'firstName');
  const lastEdited = scalarEdited(baseline?.lastName, 'lastName');
  const genderEdited = scalarEdited(baseline?.gender, 'gender');
  const occultEdited = scalarEdited(baseline?.occult, 'occult');
  const ghostEdited = scalarEdited(baseline?.isGhost, 'isGhost');
  const deathEdited = !!baseline && baseline.deathCause !== undefined && (baseline.deathCause ?? null) !== (sim.deathCause ?? null);

  // Traits (CAS set) + aspiration are multi/ref fields — compare explicitly.
  const baseCasTraits = useMemo(() => (baseline?.traitIds ?? []).filter((id) => STOCK_TRAITS[id]), [baseline]);
  // Only diff traits/aspiration when the baseline actually captured them — older
  // import snapshots (pre-completeness fix) omit these, and a missing baseline
  // must read as Mirrored, never a phantom Edited.
  const traitsEdited = !!baseline && baseline.traitIds !== undefined && !sameSet(casTraitIds, baseCasTraits);
  function revertTraits() {
    const nonCas = (sim.traitIds ?? []).filter((id) => !STOCK_TRAITS[id]); // keep degree/hidden traits as-is
    updateSim(sim.id, { traitIds: [...nonCas, ...baseCasTraits] });         // restore only the CAS subset
  }
  const aspirationEdited = !!baseline && baseline.aspirationId !== undefined && (baseline.aspirationId ?? null) !== (sim.aspirationId ?? null);

  // ── Derived read-only data ──
  const skills = (sim.skills ?? []).slice().sort((a, b) => b.level - a.level);

  // NPC role (service sims only): the hidden is<Role> trait rides along in
  // traitIds since import keeps ROLE_TRAITS keys. Null for everyone else.
  const roleName = useMemo(() => (sim.traitIds ?? []).map((id) => ROLE_TRAITS[id]).find(Boolean) ?? null, [sim.traitIds]);

  // Memberships (read-only mirrors — these are edited in their own editors):
  // clubs, dynasties, small businesses this sim belongs to, with their role.
  const memberships = useMemo(() => {
    const clubs = Object.values(clubsMap)
      .filter((c) => c.memberSimIds.includes(sim.id) || c.leaderSimId === sim.id)
      .map((c) => ({ key: `club-${c.id}`, icon: `/club-icons/${c.icon}.png`, label: c.name, sub: c.leaderSimId === sim.id ? 'Leader' : undefined }));
    const dynasties = Object.values(dynastiesMap).flatMap((d) => {
      const m = d.members.find((x) => x.simId === sim.id);
      return m ? [{ key: `dyn-${d.id}`, icon: null, label: d.name, sub: m.role ?? (d.headSimId === sim.id ? 'Head' : 'Member') }] : [];
    });
    const businesses = Object.values(businessesMap).flatMap((b) => {
      const role = b.ownerSimId === sim.id ? 'Owner' : b.employeeSimIds.includes(sim.id) ? 'Employee' : null;
      return role ? [{ key: `biz-${b.id}`, icon: `/small-business-icons/${b.icon}.png`, label: b.name, sub: role }] : [];
    });
    return { clubs, dynasties, businesses };
  }, [clubsMap, dynastiesMap, businessesMap, sim.id]);
  const hasMemberships = memberships.clubs.length + memberships.dynasties.length + memberships.businesses.length > 0;

  // A save/mod cause outside the catalog still needs to display + stay selected.
  const deathOptions = useMemo(() => (
    sim.deathCause && !DEATH_CAUSE_OPTIONS.some((o) => o.value === sim.deathCause)
      ? [...DEATH_CAUSE_OPTIONS, { value: sim.deathCause, label: sim.deathCause }]
      : DEATH_CAUSE_OPTIONS
  ), [sim.deathCause]);

  // Earned degrees live as degree-traits inside traitIds (authorable). Partition
  // by isDegreeTrait so degree edits and CAS-trait edits never step on each other.
  const curDegreeTraits = useMemo(() => (sim.traitIds ?? []).filter((id) => isDegreeTrait(id)), [sim.traitIds]);
  const baseDegreeTraits = useMemo(() => (baseline?.traitIds ?? []).filter((id) => isDegreeTrait(id)), [baseline]);
  const degreesEdited = !!baseline && baseline.traitIds !== undefined && !sameSet(curDegreeTraits, baseDegreeTraits);
  const degreeItems: Choice[] = useMemo(() => {
    // Grouped by school in the picker (cat → section + filter pill), with each
    // school's Distinguished subjects listed first.
    const out: (Choice & { d: { distinguished: boolean } })[] = [];
    for (const s of DEGREE_SUBJECTS) {
      for (const uid of [s.traits.ba, s.traits.baHonors, s.traits.bs, s.traits.bsHonors]) {
        const d = earnedDegreeFromTrait(uid);
        if (d) out.push({ id: uid, cat: d.school, name: `${d.subject}${d.distinguished ? ' (Distinguished)' : ''}${d.honors ? ' · Honors' : ''}`, d });
      }
    }
    return out
      .sort((a, b) => a.cat!.localeCompare(b.cat!) || Number(b.d.distinguished) - Number(a.d.distinguished) || a.name.localeCompare(b.name))
      .map(({ d: _d, ...c }) => c);
  }, []);

  // Enrolled degree — an authorable object field with a clean baseline diff.
  const enrolledEdited = !!baseline && baseline.enrolledDegree !== undefined && JSON.stringify(baseline.enrolledDegree ?? null) !== JSON.stringify(sim.enrolledDegree ?? null);
  const enrolledItems: Choice[] = useMemo(() => {
    // Grouped by school in the picker; each school's Distinguished subjects first.
    const out: (Choice & { dist: boolean })[] = [];
    for (const s of DEGREE_SUBJECTS) {
      for (const school of ['Britechester', 'Foxbury'] as const) {
        const dist = school === s.specialtySchool;
        out.push({ id: `${s.name}|${school}`, cat: school, name: `${s.name}${dist ? ' (Distinguished)' : ''}`, dist });
      }
    }
    return out
      .sort((a, b) => a.cat!.localeCompare(b.cat!) || Number(b.dist) - Number(a.dist) || a.name.localeCompare(b.name))
      .map(({ dist: _dist, ...c }) => c);
  }, []);

  // Planner-authored goal skills (separate from observed `skills`). On a save-
  // backed sim these are additions beyond the save, so "revert" = clear them all;
  // a plan-only sim's goals ARE the plan (no save to revert to → no affordance).
  const plannedSkillIds = sim.plannedSkillIds ?? [];
  const plannedSkillsEdited = !!sim.sourceId && plannedSkillIds.length > 0;
  const observedSkillIds = useMemo(() => new Set((sim.skills ?? []).map((s) => s.skillId)), [sim.skills]);
  // Offer only skills the sim's lifestage can build, minus hidden/retail junk.
  // Adult tier is additionally gated by SKILL_CRITERIA_IDS (Skill_All_Visible) to
  // drop non-skill statistics (Sales, Maintenance, Juice Pong, Ping Pong, …); the
  // toddler/child tiers are already the clean explicit skill sets.
  const skillTier = SKILL_TIER_FOR_LIFESTAGE[sim.lifestage] ?? null;
  const skillItems: Choice[] = useMemo(() => {
    if (!skillTier) return [];
    return Object.entries(STOCK_SKILLS)
      .filter(([hex]) => skillAgeTier(hex) === skillTier && (skillTier !== 'adult' || SKILL_CRITERIA_IDS.has(hex.replace(/^0x/, ''))))
      .filter(([hex]) => isOwned(getSkillPack(hex)))
      .map(([hex, name]) => ({ id: hex, name, icon: skillIconUrlById(hex) ?? undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [skillTier, isOwned, manualOverrides, autoDetected]);

  // Career track — authored via plannedCareerUid; the save's level stays mirror.
  // 'none' = planned unemployed (career removed); null = mirror the save.
  const plannedNone = sim.plannedCareerUid === 'none';
  const authoredCareerUid = plannedNone ? null : (sim.plannedCareerUid ?? null);
  const authoredCareer = authoredCareerUid ? STOCK_CAREERS[authoredCareerUid] : null;
  const careerEdited = !!sim.sourceId && (plannedNone ? !!sim.career : !!authoredCareerUid && authoredCareerUid !== (sim.career?.uid ?? null));
  const careerKinds = CAREER_KINDS_FOR_LIFESTAGE[sim.lifestage] ?? null;
  const careerItems: Choice[] = useMemo(() => {
    if (!careerKinds) return [];
    // One kind (teens) needs no section headings — they'd label the whole list.
    const grouped = careerKinds.length > 1;
    return Object.entries(STOCK_CAREERS)
      .filter(([uid, c]) => careerKinds.includes(c.kind) && uid !== FREELANCER_BASE_UID)
      .filter(([uid]) => isOwned(getCareerPack(uid)))
      .map(([uid, c]) => ({
        id: uid,
        name: c.name,
        cat: grouped ? CAREER_KIND_LABEL[c.kind] : undefined,
        icon: careerIconUrlById(uid) ?? undefined,
        kindOrder: careerKinds.indexOf(c.kind),
      }))
      .sort((a, b) => a.kindOrder - b.kindOrder || a.name.localeCompare(b.name))
      .map(({ kindOrder: _k, ...c }) => c);
  }, [careerKinds, isOwned, manualOverrides, autoDetected]);

  // ── Revert-all: every edited field folded into ONE patch. Traits + earned
  // degrees both live in traitIds, so we rebuild that array once (reverting only
  // the edited subset, keeping the current value of the other) instead of two
  // clobbering updateSim calls. All other fields are independent keys. ──
  // A planned move is a planner-authored change (like career/skills), so it
  // counts toward the sim's edits and folds into revert-all. Without this a
  // move-only change left the "↺ N" cue hidden — no way to revert from here.
  const plannedMoveEdited = !!sim.plannedMoveHouseholdId;
  const editedCount = [firstEdited, lastEdited, genderEdited, occultEdited, ghostEdited, deathEdited,
    aspirationEdited, traitsEdited, degreesEdited, enrolledEdited, careerEdited, plannedSkillsEdited,
    plannedMoveEdited]
    .filter(Boolean).length;
  function buildRevertPatch(): Partial<Sim> {
    const patch: Partial<Sim> = {};
    if (firstEdited) patch.firstName = baseline!.firstName;
    if (lastEdited) patch.lastName = baseline!.lastName;
    if (genderEdited) patch.gender = baseline!.gender;
    if (occultEdited) patch.occult = baseline!.occult;
    if (ghostEdited) patch.isGhost = baseline!.isGhost;
    if (deathEdited) patch.deathCause = baseline?.deathCause ?? null;
    if (aspirationEdited) patch.aspirationId = baseline?.aspirationId ?? null;
    if (enrolledEdited) patch.enrolledDegree = baseline?.enrolledDegree ?? null;
    if (careerEdited) patch.plannedCareerUid = null;
    if (plannedSkillsEdited) patch.plannedSkillIds = [];
    if (plannedMoveEdited) patch.plannedMoveHouseholdId = null;
    if (traitsEdited || degreesEdited) {
      const cas = traitsEdited ? baseCasTraits : casTraitIds;
      const degrees = degreesEdited ? baseDegreeTraits : curDegreeTraits;
      const other = (sim.traitIds ?? []).filter((id) => !STOCK_TRAITS[id] && !isDegreeTrait(id));
      patch.traitIds = [...other, ...cas, ...degrees];
    }
    return patch;
  }
  const revertAll = async () => {
    const ok = await confirm({
      message: `Revert ${editedCount === 1 ? 'the 1 edit' : `all ${editedCount} edits`} on ${sim.firstName || 'this sim'} back to the save?\n\nThis can't be undone.`,
      confirmLabel: 'Revert all',
      danger: true,
    });
    if (ok) updateSim(sim.id, buildRevertPatch());
  };

  // ── Handlers ──
  function commitText(key: 'firstName' | 'lastName' | 'notes', value: string) {
    const v = key === 'notes' ? value : value.trim();
    if (v !== sim[key]) updateSim(sim.id, { [key]: v } as Partial<Sim>);
  }
  // Edit-set: the picked CAS traits ARE the new CAS set. Non-CAS trait ids
  // (earned degrees + hidden/role traits) live in the same array and must be
  // preserved untouched. Traits are freely editable (revert restores game-truth).
  function setTraits(picked: Choice[]) {
    const nonCas = (sim.traitIds ?? []).filter((id) => !STOCK_TRAITS[id]);
    updateSim(sim.id, { traitIds: [...nonCas, ...picked.map((p) => p.id).slice(0, traitCap)] });
  }
  function removeTrait(id: string) {
    updateSim(sim.id, { traitIds: (sim.traitIds ?? []).filter((t) => t !== id) });
  }
  // Changing lifestage trims CAS traits + aspiration to what's valid for the new
  // stage (game-faithful: a big jump like adult→toddler drops everything; a small
  // one like teen→YA keeps the overlap). Non-CAS traits (degrees/hidden) survive.
  function changeLifestage(v: SimLifestage) {
    const parsed = LIFESTAGE_PARSED_BRIDGE[v];
    const validTraits = new Set(traitsForLifestage(parsed).map((t) => t.id));
    const keptCas = (sim.traitIds ?? []).filter((id) => STOCK_TRAITS[id] && validTraits.has(id)).slice(0, TRAIT_COUNT[v] ?? 0);
    const nonCas = (sim.traitIds ?? []).filter((id) => !STOCK_TRAITS[id]);
    const validAsp = new Set(aspirationsForLifestage(parsed).map((a) => a.id));
    const keptAsp = sim.aspirationId && validAsp.has(sim.aspirationId) ? sim.aspirationId : null;
    updateSim(sim.id, { lifestage: v, traitIds: [...nonCas, ...keptCas], aspirationId: keptAsp });
  }
  function changeOccultGhost(v: string) {
    if (v === 'ghost') updateSim(sim.id, { isGhost: true, occult: 'none' });
    // Leaving ghost = alive again → a lingering cause of death makes no sense.
    else updateSim(sim.id, { occult: v as SimOccult, isGhost: false, deathCause: null });
  }
  // Authoring a cause of death implies the death: occult flips to Ghost.
  // Clearing it leaves ghost-ness alone (ghost-with-unknown-cause is valid).
  function changeDeathCause(v: string) {
    if (v) updateSim(sim.id, { deathCause: v, isGhost: true, occult: 'none' });
    else updateSim(sim.id, { deathCause: null });
  }
  // Edit-set: picked = the full checked set (planned + locked observed). Observed
  // skills are game-truth locked in a DIFFERENT field (sim.skills) — never write
  // them; the planned field is picked minus the observed ids.
  function setSkills(picked: Choice[]) {
    updateSim(sim.id, { plannedSkillIds: picked.map((p) => p.id).filter((id) => !observedSkillIds.has(id)) });
  }
  function removeSkill(id: string) {
    updateSim(sim.id, { plannedSkillIds: plannedSkillIds.filter((x) => x !== id) });
  }
  function addEarnedDegree(uid: string) {
    if (!(sim.traitIds ?? []).includes(uid)) updateSim(sim.id, { traitIds: [...(sim.traitIds ?? []), uid] });
  }
  function removeEarnedDegree(uid: string) {
    updateSim(sim.id, { traitIds: (sim.traitIds ?? []).filter((id) => id !== uid) });
  }
  function revertDegrees() {
    const nonDegree = (sim.traitIds ?? []).filter((id) => !isDegreeTrait(id)); // keep CAS + hidden
    updateSim(sim.id, { traitIds: [...nonDegree, ...baseDegreeTraits] });
  }
  function removeCareer() {
    // ✕ = plan "unemployed": sentinel 'none' overrides a save-mirrored career;
    // plain null for plan-only sims / save-unemployed (nothing to override).
    updateSim(sim.id, { plannedCareerUid: sim.sourceId && sim.career ? 'none' : null });
  }
  function setEnrolled(id: string) {
    const [subject, school] = id.split('|') as [string, 'Britechester' | 'Foxbury'];
    const subj = DEGREE_SUBJECTS.find((s) => s.name === subject);
    updateSim(sim.id, { enrolledDegree: { subject, school, distinguished: subj ? school === subj.specialtySchool : false } });
  }

  const aspiration = sim.aspirationId ? STOCK_ASPIRATIONS[sim.aspirationId] : null;
  const traitItems: Choice[] = traitPool.map((t) => ({ id: t.id, name: t.name, icon: traitIconUrlById(t.id) ?? undefined }));
  const aspirationItems: Choice[] = aspirationPool.map((a) => ({ id: a.id, name: resolveGenderedText(a.name, sim.gender), icon: aspirationIconUrlById(a.id) ?? undefined }));

  // Career & Education — a row shows when it has a value; in edit mode it also
  // shows when there's something to author. The filled flag picks Swap (has a
  // value) vs Add (empty) for the row's action pill.
  const careerFilled = !plannedNone && (!!authoredCareer || !!sim.career);
  const enrolledFilled = !!sim.enrolledDegree;
  // University (enrollment + degrees) is all Discover University (EP08) content —
  // hide those rows entirely when the pack isn't owned.
  const ownsUniversity = isOwned('EP08');
  // A child has no job to give, so the row doesn't appear rather than offering an
  // Add that opens an empty picker.
  const showCareerRow = careerFilled || (editing && careerItems.length > 0);
  const showUniRows = ownsUniversity && (editing || enrolledFilled || curDegreeTraits.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0 ${sim.gender === 'male' ? 'bg-c-accent-soft text-c-accent' : 'bg-c-secondary-soft text-c-secondary'} ${sim.isGhost ? 'opacity-60' : ''}`}
        >
          {(sim.firstName || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-c-text truncate leading-tight">
            {sim.firstName}{sim.lastName ? ' ' + sim.lastName : ''}
          </div>
          {/* Provenance pill only (ghost/occult live in Identity below — no pill
              for them up here). Rides the brand axis: green = From save,
              purple = From planner (your hand). Plus the NPC role for service
              sims (e.g. Statue Busker), read from their hidden is<Role> trait. */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-label ${sim.sourceId ? 'text-c-accent border-c-accent' : 'text-c-secondary border-c-secondary'}`}>
              {sim.sourceId ? 'From save' : 'From planner'}
            </span>
            {roleName && (
              <span className="inline-flex items-center rounded-full border border-c-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-label text-c-dim">{roleName}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {/* View mode: a purple "N edits" cue that drops into Edit (like Col2's
              edited beacon). Edit mode: the bulk revert-all. */}
          {editedCount > 0 && !editing && (
            /* "↺ 3" says nothing on its own, so this one keeps a hover label —
               the app's own, not the browser's. */
            <Tooltip text="Revert every edited field to the save's value">
              <button
                type="button"
                onClick={() => { setEditing(true); revertAll(); }}
                aria-label="Revert every edited field to the save's value"
                className="inline-flex items-center gap-1 h-7 rounded-full border border-c-secondary bg-c-secondary-soft text-c-secondary px-2.5 text-[11px] font-semibold cursor-pointer transition-colors hover:bg-c-secondary hover:text-white"
              >
                {REVERT_ICON} {editedCount}
              </button>
            </Tooltip>
          )}
          {editedCount > 0 && editing && (
            <button
              type="button"
              onClick={revertAll}
              aria-label="Restore every edited field to the save's value"
              className="inline-flex items-center gap-1.5 h-7 rounded-full border border-c-border bg-c-secondary-soft text-c-secondary px-3 text-[11px] font-semibold cursor-pointer transition-colors hover:border-c-secondary"
            >
              {REVERT_ICON} Revert {editedCount} {editedCount === 1 ? 'edit' : 'edits'}
            </button>
          )}
          {/* Edit / Done toggle — same affordance as the Col2 household panel. */}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            title={editing ? 'Done editing' : 'Edit this sim'}
            className={`inline-flex items-center gap-1.5 rounded-md pl-2 pr-2.5 py-1.5 text-[11px] font-semibold cursor-pointer border-none transition-colors ${editing ? 'bg-c-secondary text-white' : 'bg-c-secondary-soft text-c-secondary hover:bg-c-secondary hover:text-white'}`}
          >
            <GearSix size={14} weight={editing ? 'fill' : 'bold'} /> {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 pb-2">
        {/* Household — the sim's home (mirror) + planned move (Option C sticker).
            Sits above Identity: "where they live / where they're headed" frames
            the sim. Membership mirrors the save; a planned move is your hand
            (purple), and clears on ANY in-game move (explained in Col2). Locked
            for plan-only / tree-only sims. */}
        {(currentHousehold || canMove || plannedDest) && (
          <Card title="Household">
            <div className="flex items-center gap-2 min-w-0">
              {/* One line: current home, then the planned-move sticker (purple =
                  content, a plan — kept in view mode). No house icon. */}
              <span className="text-[13px] text-c-text truncate">{currentHousehold?.name ?? <span className="text-c-faint italic">No household</span>}</span>
              {plannedDest && (
                <>
                  <ArrowRight size={13} weight="bold" className="text-c-secondary shrink-0" />
                  <button
                    type="button"
                    onClick={() => onJumpToHousehold?.(plannedDest.id)}
                    title={`View ${plannedDest.name}`}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] text-c-text border border-c-secondary bg-c-base hover:bg-c-secondary-soft cursor-pointer transition-colors min-w-0"
                  >
                    <span className="truncate">{plannedDest.name}</span>
                  </button>
                </>
              )}
              {editing && canMove && (
                <PillGroup>
                  {plannedDest && <RevertBtn title="Cancel planned move" onClick={() => updateSim(sim.id, { plannedMoveHouseholdId: null })} />}
                  <SwapBtn title={plannedDest ? 'Change destination' : 'Plan a move'} onClick={() => setPickingMove(true)} />
                </PillGroup>
              )}
            </div>
          </Card>
        )}

        {/* Identity — read-only values by default; Edit reveals the controls. */}
        <Card title="Identity">
          <div className="grid grid-cols-2 gap-x-7 gap-y-2.5">
            <FieldRow label="First">
              {editing
                ? <SoftInput value={firstName} onChange={setFirstName} onBlur={() => commitText('firstName', firstName)} edited={firstEdited} savedDisplay={baseline?.firstName} onRevert={() => updateSim(sim.id, { firstName: baseline!.firstName })} />
                : <StaticValue>{sim.firstName || '—'}</StaticValue>}
            </FieldRow>
            <FieldRow label="Last">
              {editing
                ? <SoftInput value={lastName} onChange={setLastName} onBlur={() => commitText('lastName', lastName)} edited={lastEdited} savedDisplay={baseline?.lastName || '—'} onRevert={() => updateSim(sim.id, { lastName: baseline!.lastName })} />
                : <StaticValue>{sim.lastName || '—'}</StaticValue>}
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-2.5">
            <FieldRow label="Gender">
              {editing ? (
                <div className="flex items-center gap-1.5 w-full">
                  <Dropdown className="flex-1" edited={genderEdited} value={sim.gender} options={GENDER_OPTIONS} onChange={(v) => updateSim(sim.id, { gender: v as SimGender })} ariaLabel="Gender" />
                  {genderEdited && <RevertBtn savedDisplay={baseline ? (baseline.gender === 'male' ? 'Male' : 'Female') : null} onClick={() => updateSim(sim.id, { gender: baseline!.gender })} />}
                </div>
              ) : <StaticValue>{sim.gender === 'male' ? 'Male' : 'Female'}</StaticValue>}
            </FieldRow>
            {!isPet && (
              <FieldRow label="Lifestage">
                {editing && !sim.sourceId
                  // Save-backed lifestage stays read-only even in edit (a re-age
                  // would cascade-wipe traits/skills/career — a deliberate action).
                  ? <Dropdown className="w-full" value={sim.lifestage} options={LIFESTAGE_OPTIONS} onChange={(v) => changeLifestage(v as SimLifestage)} ariaLabel="Lifestage" />
                  : <StaticValue>{LIFESTAGE_LABEL[sim.lifestage]}</StaticValue>}
              </FieldRow>
            )}
            {!isPet && (
              <FieldRow label="Occult">
                {editing ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <Dropdown className="flex-1" edited={occultEdited || ghostEdited} value={sim.isGhost ? 'ghost' : sim.occult} options={occultGhostOptions} onChange={changeOccultGhost} ariaLabel="Occult" />
                    {(occultEdited || ghostEdited) && <RevertBtn savedDisplay={baseline ? occultGhostLabel(baseline.occult, baseline.isGhost) : null} onClick={() => updateSim(sim.id, { occult: baseline!.occult, isGhost: baseline!.isGhost })} />}
                  </div>
                ) : <StaticValue>{occultGhostLabel(sim.occult, sim.isGhost)}</StaticValue>}
              </FieldRow>
            )}
            {/* Cause of death — editable when editing (authoring a cause implies
                Ghost); in view mode shown only for the departed. */}
            {(editing ? !isPet : !!sim.deathCause) && (
              <FieldRow label="Died of">
                {editing ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <Dropdown className="flex-1" edited={deathEdited} value={sim.deathCause ?? ''} options={deathOptions} onChange={changeDeathCause} ariaLabel="Cause of death" />
                    {deathEdited && <RevertBtn savedDisplay={baseline?.deathCause ?? '—'} onClick={() => updateSim(sim.id, { deathCause: baseline?.deathCause ?? null })} />}
                  </div>
                ) : <StaticValue>{sim.deathCause ?? '—'}</StaticValue>}
              </FieldRow>
            )}
          </div>
        </Card>

        {/* Aspiration & Traits */}
        {!isPet && (
          <Card title="Aspiration & Traits">
            {(aspirationPool.length > 0 || aspiration) && (
              <FieldRow label="Aspiration" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {sim.aspirationId && STOCK_ASPIRATIONS[sim.aspirationId] ? (
                    <Chip edited={editing && aspirationEdited} icon={<IconImg url={aspirationIconUrlById(sim.aspirationId)} />} label={resolveGenderedText(STOCK_ASPIRATIONS[sim.aspirationId].name, sim.gender)} onRemove={editing && aspirationPool.length > 0 ? () => updateSim(sim.id, { aspirationId: null }) : undefined} />
                  ) : !editing ? <span className="text-[12px] text-c-faint italic">None</span> : null}
                  {editing && aspirationPool.length > 0 && (
                    <PillGroup>
                      {sim.aspirationId
                        ? <SwapBtn title="Change aspiration" onClick={() => setPickingAspiration(true)} />
                        : <AddBtn title="Choose an aspiration" onClick={() => setPickingAspiration(true)} />}
                      {aspirationEdited && <RevertBtn savedDisplay={baseline?.aspirationId ? (STOCK_ASPIRATIONS[baseline.aspirationId] ? resolveGenderedText(STOCK_ASPIRATIONS[baseline.aspirationId].name, sim.gender) : '—') : '—'} onClick={() => updateSim(sim.id, { aspirationId: baseline?.aspirationId ?? null })} />}
                    </PillGroup>
                  )}
                </div>
              </FieldRow>
            )}
            <FieldRow label="Traits" align="start">
              <div className="flex items-center gap-1.5 flex-wrap">
                {casTraitIds.map((id) => (
                  <Chip key={id} edited={editing && !!baseline && baseline.traitIds !== undefined && !baseCasTraits.includes(id)} icon={<IconImg url={traitIconUrlById(id)} />} label={STOCK_TRAITS[id]?.name ?? id} onRemove={editing ? () => removeTrait(id) : undefined} />
                ))}
                {casTraitIds.length === 0 && !editing && <span className="text-[12px] text-c-faint italic">None</span>}
                {editing && (
                  <PillGroup>
                    <AddBtn title="Edit traits" onClick={() => setPickingTraits(true)} />
                    {traitsEdited && <RevertBtn savedDisplay={baseCasTraits.map((id) => STOCK_TRAITS[id]?.name).filter(Boolean).join(', ') || 'none'} onClick={revertTraits} />}
                  </PillGroup>
                )}
              </div>
            </FieldRow>
          </Card>
        )}

        {/* Skills — save skills read-only (with level), planner goal skills addable.
            Hidden entirely in view mode when there are none. */}
        {!isPet && (editing || skills.length > 0 || plannedSkillIds.length > 0) && (
          <Card title="Skills">
            {skills.length === 0 && plannedSkillIds.length === 0 ? (
              <div className="flex items-center gap-1.5"><span className="text-[12px] text-c-faint italic">No skills yet.</span>{editing && <AddBtn title="Add skills" onClick={() => setPickingSkill(true)} />}</div>
            ) : (
              <div className="space-y-2">
                {/* Observed skills (from the save) — read-only, with level; collapse past the
                    limit. When there are no planned goals, the add pill rides this row too. */}
                {skills.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(skillsExpanded ? skills : skills.slice(0, SKILLS_LIMIT)).map((sk) => (
                      <Chip key={sk.skillId} icon={<IconImg url={skillIconUrlById(sk.skillId)} />} label={STOCK_SKILLS[sk.skillId] ?? sk.skillId} sub={String(sk.level)} />
                    ))}
                    {skills.length > SKILLS_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setSkillsExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent border-none cursor-pointer transition-colors"
                      >
                        {skillsExpanded ? <><CaretUp size={11} weight="bold" /> Show less</> : <><CaretDown size={11} weight="bold" /> {skills.length - SKILLS_LIMIT} more</>}
                      </button>
                    )}
                    {editing && plannedSkillIds.length === 0 && <AddBtn title="Add skills" onClick={() => setPickingSkill(true)} />}
                  </div>
                )}
                {/* Planned goal skills (authored) — their own row, with the add pill + revert. */}
                {plannedSkillIds.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {plannedSkillIds.map((id) => (
                      <Chip key={id} edited={editing} icon={<IconImg url={skillIconUrlById(id)} />} label={STOCK_SKILLS[id] ?? id} onRemove={editing ? () => removeSkill(id) : undefined} />
                    ))}
                    {editing && (
                      <PillGroup>
                        <AddBtn title="Add skills" onClick={() => setPickingSkill(true)} />
                        {plannedSkillsEdited && <RevertBtn title="Revert to save skills" onClick={() => updateSim(sim.id, { plannedSkillIds: [] })} />}
                      </PillGroup>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Career & Education — each labeled row; view mode hides empty rows,
            edit mode shows them all so you can author. */}
        {!isPet && (showCareerRow || showUniRows) && (
          <Card title="Career & Education">
            {showCareerRow && (
              <FieldRow label="Career" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {authoredCareer ? (
                    <Chip edited={editing && careerEdited} icon={<IconImg url={careerIconUrlById(authoredCareerUid!)} />} label={authoredCareer.name} onRemove={editing ? removeCareer : undefined} />
                  ) : !plannedNone && sim.career ? (
                    <Chip icon={<IconImg url={careerIconUrlById(sim.career.uid)} />} label={sim.career.name} sub={String(sim.career.level)} onRemove={editing ? removeCareer : undefined} />
                  ) : !editing ? <span className="text-[12px] text-c-faint italic">None</span> : null}
                  {editing && (
                    <PillGroup>
                      {careerItems.length === 0 ? null : careerFilled
                        ? <SwapBtn title="Change career" onClick={() => setPickingCareer(true)} />
                        : <AddBtn title="Add a career" onClick={() => setPickingCareer(true)} />}
                      {careerEdited && <RevertBtn savedDisplay={sim.career ? `${sim.career.name} · Lvl ${sim.career.level}` : 'unemployed'} onClick={() => updateSim(sim.id, { plannedCareerUid: null })} />}
                    </PillGroup>
                  )}
                </div>
              </FieldRow>
            )}
            {ownsUniversity && (editing || enrolledFilled) && (
              <FieldRow label="University" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {enrolledFilled ? (
                    <Chip edited={editing && enrolledEdited} icon={<GraduationCap size={13} weight="regular" />} label={`${sim.enrolledDegree!.subject} · ${sim.enrolledDegree!.school}${sim.enrolledDegree!.distinguished ? ' (Distinguished)' : ''}`} onRemove={editing ? () => updateSim(sim.id, { enrolledDegree: null }) : undefined} />
                  ) : !editing ? <span className="text-[12px] text-c-faint italic">Not enrolled</span> : null}
                  {editing && (
                    <PillGroup>
                      {enrolledFilled
                        ? <SwapBtn title="Change enrolled degree" onClick={() => setPickingEnrolled(true)} />
                        : <AddBtn title="Enroll in a degree" onClick={() => setPickingEnrolled(true)} />}
                      {enrolledEdited && <RevertBtn savedDisplay={baseline?.enrolledDegree ? `${baseline.enrolledDegree.subject} · ${baseline.enrolledDegree.school}` : 'not enrolled'} onClick={() => updateSim(sim.id, { enrolledDegree: baseline?.enrolledDegree ?? null })} />}
                    </PillGroup>
                  )}
                </div>
              </FieldRow>
            )}
            {ownsUniversity && (editing || curDegreeTraits.length > 0) && (
              <FieldRow label="Degrees" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {curDegreeTraits.map((uid) => {
                    const d = earnedDegreeFromTrait(uid);
                    if (!d) return null;
                    // Earned degrees from the save are game-truth (you can't un-earn
                    // a degree) — locked, no ✕. Planner-added degrees stay removable.
                    const locked = baseDegreeTraits.includes(uid);
                    return <Chip key={uid} edited={editing && !locked} icon={<GraduationCap size={13} weight="regular" />} label={`${d.subject} · ${d.school}${d.distinguished ? ' (Distinguished)' : d.honors ? ' (Honors)' : ''}`} onRemove={editing && !locked ? () => removeEarnedDegree(uid) : undefined} />;
                  })}
                  {curDegreeTraits.length === 0 && !editing && <span className="text-[12px] text-c-faint italic">None</span>}
                  {editing && (
                    <PillGroup>
                      <AddBtn title="Add an earned degree" onClick={() => setPickingEarned(true)} />
                      {degreesEdited && <RevertBtn savedDisplay={baseDegreeTraits.length ? baseDegreeTraits.map((u) => earnedDegreeFromTrait(u)?.subject ?? '?').join(', ') : 'none'} onClick={revertDegrees} />}
                    </PillGroup>
                  )}
                </div>
              </FieldRow>
            )}
          </Card>
        )}

        {/* Memberships — read-only mirrors (no ✕/add): clubs, dynasties, and
            businesses have their own editors; this is the sim-side view. */}
        {hasMemberships && (
          <Card title="Memberships">
            {memberships.clubs.length > 0 && (
              <FieldRow label="Clubs" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {memberships.clubs.map((m) => <Chip key={m.key} icon={<IconImg url={m.icon} />} label={m.label} sub={m.sub} />)}
                </div>
              </FieldRow>
            )}
            {memberships.dynasties.length > 0 && (
              <FieldRow label="Dynasty" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {memberships.dynasties.map((m) => <Chip key={m.key} label={m.label} sub={m.sub} />)}
                </div>
              </FieldRow>
            )}
            {memberships.businesses.length > 0 && (
              <FieldRow label="Business" align="start">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {memberships.businesses.map((m) => <Chip key={m.key} icon={<IconImg url={m.icon} />} label={m.label} sub={m.sub} />)}
                </div>
              </FieldRow>
            )}
          </Card>
        )}

        {/* Notes — always visible + editable (auto-save on blur), matching the
            household panel. Not gated behind the panel's Edit toggle. */}
        <Notes value={notes} rows={2} bare onChange={setNotes} onBlur={() => commitText('notes', notes)} />
      </div>

      {pickingTraits && (
        <CatalogPickerModal title="Edit traits" items={traitItems} multiSelect preselected={new Set(casTraitIds)} maxSelected={traitCap} onSelect={setTraits} onClose={() => setPickingTraits(false)} />
      )}
      {pickingAspiration && (
        <CatalogPickerModal title="Choose an aspiration" items={aspirationItems} onSelect={(picked) => { if (picked[0]) updateSim(sim.id, { aspirationId: picked[0].id }); }} onClose={() => setPickingAspiration(false)} />
      )}
      {pickingSkill && (
        <CatalogPickerModal title="Edit skills" items={skillItems} multiSelect preselected={new Set([...plannedSkillIds, ...observedSkillIds])} lockedIds={observedSkillIds} onSelect={setSkills} onClose={() => setPickingSkill(false)} />
      )}
      {pickingCareer && (
        <CatalogPickerModal title="Choose a career" items={careerItems} onSelect={(picked) => { if (picked[0]) updateSim(sim.id, { plannedCareerUid: picked[0].id }); }} onClose={() => setPickingCareer(false)} />
      )}
      {pickingEnrolled && (
        <CatalogPickerModal title="Enroll in a degree" items={enrolledItems} onSelect={(picked) => { if (picked[0]) setEnrolled(picked[0].id); }} onClose={() => setPickingEnrolled(false)} />
      )}
      {pickingEarned && (
        <CatalogPickerModal title="Add an earned degree" items={degreeItems} disabledIds={new Set(curDegreeTraits)} onSelect={(picked) => { if (picked[0]) addEarnedDegree(picked[0].id); }} onClose={() => setPickingEarned(false)} />
      )}
      {pickingMove && <MovePickerModal sim={sim} onClose={() => setPickingMove(false)} onJump={onJumpToHousehold} />}
    </div>
  );
}
