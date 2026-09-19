import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass, UsersThree, X, CaretDown, CaretUp, CaretUpDown, FunnelSimple, Tree } from '@phosphor-icons/react';
import { Dropdown } from '../components/common/Dropdown';
import { useSaveFile } from '../store/useSaveFile';
import type { Sim, SimGender, SimLifestage, SimOccult, SimRelType, Dynasty } from '../types';
import { EmptyState } from '../components/common/EmptyState';
import { FocusPanel } from '../components/familyTree/FocusPanel';
import { SetSimPhotoModal } from '../components/familyTree/SetSimPhotoModal';
import { api } from '../lib/api';
import { STOCK_TRAITS, traitIconUrlById } from '../data/stockTraits';
import { STOCK_SKILLS } from '../data/stockSkills';
import { STOCK_ASPIRATIONS, aspirationIconUrlById } from '../data/stockAspirations';
import { hasDegreeTrait } from '../data/stockDegrees';
import { careerIconUrlById } from '../data/careerIcons';
import { effectiveCareer, effectiveSkillIds, effectiveHouseholdId } from '../lib/effective';
import { resolveCrest } from '../data/stockDynasties';
import { DynastyCrest } from '../components/Dynasty/DynastyCrest';
import { resolveGenderedText } from '../lib/genderedText';
import { Pill } from '../components/common/Pill';
import { btn } from '../components/common/btn';
import { Tooltip } from '../components/common/Tooltip';

// Couple-bond ordering for the detail panel: current bonds before exes.
// Mirrors the family tree's ordering so the roster panel reads identically.
const BOND_ORDER: Record<string, number> = {
  spouse: 0, engaged: 1, partner: 2, ex_spouse: 3, ex_fiance: 4, ex_partner: 5,
};

const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};


const LIFESTAGE_ICON: Record<SimLifestage, string> = {
  newborn: 'newborn-sim', infant: 'infant-sim', toddler: 'toddler-sim', child: 'child-sim', teen: 'teen-sim',
  youngAdult: 'young-adult-sim', adult: 'adult-sim', elder: 'elder-sim', pet: 'cat-sim',
};

const OCCULT_LABEL: Record<SimOccult, string> = {
  none: 'None', vampire: 'Vampire', alien: 'Alien', mermaid: 'Mermaid',
  spellcaster: 'Spellcaster', werewolf: 'Werewolf', fairy: 'Fairy',
};

const ALL_LIFESTAGES: SimLifestage[] = ['newborn', 'infant', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder', 'pet'];
const ALL_OCCULTS: SimOccult[] = ['vampire', 'alien', 'mermaid', 'spellcaster', 'werewolf', 'fairy'];

// Sims old enough to hold a job — the "unemployed" filter only applies to these.
const WORKING_AGE: ReadonlySet<SimLifestage> = new Set(['teen', 'youngAdult', 'adult', 'elder']);

// Species filter is expanded so users can filter to specific pet subtypes.
type SpeciesFilter = 'all' | 'human' | 'cat' | 'dog' | 'horse' | 'pet';
type GenderFilter = 'all' | SimGender;
type LifestageFilter = 'all' | SimLifestage;
// 'ghost' folds the deceased-but-present (isGhost) sims into the occult lens —
// there's no separate status column anymore (truly-gone deceased leave the roster).
type OccultFilter = 'all' | SimOccult | 'ghost';
type SortKey = 'name' | 'species' | 'gender' | 'lifestage' | 'aspiration' | 'career' | 'dynasty' | 'traits' | 'household';

// Compact reusable chip-pill button. Active = one uniform purple (plum) state
// across every filter group; inactive = quiet outline.
function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const palette = active
    ? 'bg-c-secondary-soft border-c-secondary-border text-c-secondary'
    : 'bg-transparent border-c-border text-c-dim hover:text-c-text hover:bg-c-panel';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-2xs font-semibold uppercase tracking-label px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${palette}`}
    >
      {children}
    </button>
  );
}

// Small trait/aspiration icon (the in-game texture), mirrors SimList's renderer.
// Falls back to nothing if the icon is missing so the name still reads cleanly.
function TraitAspIcon({ kind, id }: { kind: 'trait' | 'aspiration'; id: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = kind === 'trait' ? traitIconUrlById(id) : aspirationIconUrlById(id);
  if (failed || !url) return null;
  return <img src={url} alt="" className="w-3.5 h-3.5 object-contain shrink-0" onError={() => setFailed(true)} />;
}

export function Sims() {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const navigate = useNavigate();
  const allSims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const dynasties = useSaveFile((s) => s.dynasties);
  const updateSim = useSaveFile((s) => s.updateSim);

  // sim id → its dynasty + role. A sim is in one dynasty in-game, but re-sync
  // can leave a planner dynasty still listing a sim the save has since moved to
  // a different one. On a conflict show the save's (imported, sourceId)
  // membership — reality wins — so this view can't disagree with the tree.
  const dynastyBySim = useMemo(() => {
    const m = new Map<string, { dynasty: Dynasty; role: string | null }>();
    for (const d of Object.values(dynasties)) {
      for (const mem of d.members) {
        const existing = m.get(mem.simId);
        if (existing && !(d.sourceId && !existing.dynasty.sourceId)) continue; // keep unless upgrading planner→save
        m.set(mem.simId, { dynasty: d, role: mem.role });
      }
    }
    return m;
  }, [dynasties]);
  const dynastyList = useMemo(
    () => Object.values(dynasties).sort((a, b) => a.name.localeCompare(b.name)),
    [dynasties],
  );

  // Detail panel: clicking a roster row opens the full family-tree FocusPanel
  // docked on the right. We pull the same relationship edges the tree uses so
  // the panel's kin lists match, plus sim portraits.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const storeRelationships = useSaveFile((s) => s.relationships);
  const loadRelationships = useSaveFile((s) => s.loadRelationships);
  const edges = useMemo(() => Object.values(storeRelationships), [storeRelationships]);
  const [simPhotos, setSimPhotos] = useState<Record<string, string>>({});
  const [editingPhotoFor, setEditingPhotoFor] = useState<Sim | null>(null);

  useEffect(() => {
    if (!saveFileId) return;
    loadRelationships().catch(() => {});
  }, [saveFileId, loadRelationships]);

  const refetchSimPhotos = useCallback(() => {
    if (!saveFileId) return;
    api.listSimPortraits(saveFileId)
      .then((rows) => setSimPhotos(Object.fromEntries(rows.map((r) => [r.simId, api.photoUrl(r.filename, 96)]))))
      .catch(() => {});
  }, [saveFileId]);
  useEffect(() => { refetchSimPhotos(); }, [refetchSimPhotos]);

  // The selected sim resolves against the FULL store (not the filtered roster)
  // so deceased / tree-only relatives clicked in the panel still display.
  const selectedSim = selectedId ? allSims[selectedId] : null;

  // Deep-link: ?sim=<id> (from a club/dynasty member click) selects that sim,
  // opening its detail panel. Clear the param afterward so refresh/back is clean.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const simParam = searchParams.get('sim');
    if (simParam && allSims[simParam]) {
      setSelectedId(simParam);
      searchParams.delete('sim');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allSims]);

  // Kin lists for the panel — parents, full+half siblings, children — derived
  // from the family-tree edge set, identical to Family.tsx.
  const kin = useMemo(() => {
    const empty = { parents: [] as Sim[], siblings: [] as Sim[], children: [] as Sim[] };
    if (!selectedId) return empty;
    const toSims = (ids: Iterable<string>) =>
      [...new Set(ids)].map((id) => allSims[id]).filter((s): s is Sim => !!s);
    const parentIds = edges.filter((e) => e.relType === 'parent' && e.simBId === selectedId).map((e) => e.simAId);
    const childIds = edges.filter((e) => e.relType === 'parent' && e.simAId === selectedId).map((e) => e.simBId);
    const parentSet = new Set(parentIds);
    const sibIds = edges
      .filter((e) => e.relType === 'parent' && parentSet.has(e.simAId) && e.simBId !== selectedId)
      .map((e) => e.simBId);
    return { parents: toSims(parentIds), siblings: toSims(sibIds), children: toSims(childIds) };
  }, [edges, selectedId, allSims]);

  const partners = useMemo(() => {
    if (!selectedId) return [] as Array<{ sim: Sim; relType: SimRelType }>;
    const out: Array<{ sim: Sim; relType: SimRelType }> = [];
    const seen = new Set<string>();
    for (const e of edges) {
      if (!(e.relType in BOND_ORDER)) continue;
      const other = e.simAId === selectedId ? e.simBId : e.simBId === selectedId ? e.simAId : null;
      if (!other || seen.has(other)) continue;
      const sim = allSims[other];
      if (!sim) continue;
      seen.add(other);
      out.push({ sim, relType: e.relType });
    }
    return out.sort((a, b) => (BOND_ORDER[a.relType] ?? 9) - (BOND_ORDER[b.relType] ?? 9));
  }, [edges, selectedId, allSims]);

  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [lifestageFilter, setLifestageFilter] = useState<LifestageFilter>('all');
  const [occultFilter, setOccultFilter] = useState<OccultFilter>('all');
  const [universityFilter, setUniversityFilter] = useState<'all' | 'enrolled' | 'graduate'>('all');
  const [careerFilter, setCareerFilter] = useState<'all' | 'employed' | 'unemployed' | 'npc'>('all');
  const [traitFilter, setTraitFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [aspirationFilter, setAspirationFilter] = useState<string>('all');
  const [dynastyFilter, setDynastyFilter] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  }

  const sims = useMemo(() => {
    // Comparable value per column. Numbers compare numerically (lifestage order,
    // trait count, ghost flag); everything else by localized string.
    const fullName = (s: Sim) => `${s.firstName} ${s.lastName}`.trim().toLowerCase();
    const sortVal = (s: Sim): string | number => {
      switch (sortKey) {
        case 'species':    return s.species === 'pet' ? `1-${s.petSubtype}` : '0-human';
        case 'gender':     return s.gender;
        case 'lifestage':  return ALL_LIFESTAGES.indexOf(s.lifestage);
        case 'aspiration': {
          const a = s.aspirationId ? STOCK_ASPIRATIONS[s.aspirationId] : null;
          return a ? resolveGenderedText(a.name, s.gender).toLowerCase() : '';
        }
        case 'career':     return effectiveCareer(s)?.name.toLowerCase() ?? '';
        case 'dynasty':    return dynastyBySim.get(s.id)?.dynasty.name.toLowerCase() ?? '';
        case 'traits':     return (s.traitIds ?? []).filter((id) => STOCK_TRAITS[id]).length;
        case 'household':  {
          const hhId = effectiveHouseholdId(s);
          return (hhId ? households[hhId] : undefined)?.name?.toLowerCase() ?? '';
        }
        case 'name':
        default:           return fullName(s);
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    const q = search.trim().toLowerCase();
    return Object.values(allSims).filter((s) => {
      if ((s.recordStatus ?? 'active') !== 'active') return false; // roster shows in-save sims only
      // Every column below reads the PLAN, not the save — one value per field,
      // yours where you authored one (see lib/effective.ts).
      const career = effectiveCareer(s);
      if (q) {
        const full = `${s.firstName} ${s.lastName}`.toLowerCase();
        const careerName = career?.name.toLowerCase() ?? '';
        if (!full.includes(q) && !careerName.includes(q)) return false;
      }
      if (speciesFilter === 'human' && s.species !== 'human') return false;
      if (speciesFilter === 'pet' && s.species !== 'pet') return false; // any pet
      if (speciesFilter === 'cat' && !(s.species === 'pet' && s.petSubtype === 'cat')) return false;
      if (speciesFilter === 'dog' && !(s.species === 'pet' && s.petSubtype === 'dog')) return false;
      if (speciesFilter === 'horse' && !(s.species === 'pet' && s.petSubtype === 'horse')) return false;
      if (genderFilter !== 'all' && s.gender !== genderFilter) return false;
      if (lifestageFilter !== 'all' && s.lifestage !== lifestageFilter) return false;
      if (occultFilter === 'ghost') { if (!s.isGhost) return false; }
      else if (occultFilter !== 'all' && s.occult !== occultFilter) return false;
      if (universityFilter === 'graduate' && !hasDegreeTrait(s.traitIds)) return false;
      if (universityFilter === 'enrolled' && !s.enrolledDegree) return false;
      // "Employed" means employed in the plan: a sim you've planned into a job
      // counts, and one you've planned OUT of a job (the ✕ = planned
      // unemployed) drops out, whatever the save still says. An NPC service job
      // still counts as a job here, as it always has — the NPC chip is the way
      // to single those out.
      if (careerFilter === 'employed' && !career) return false;
      if (careerFilter === 'unemployed' && (career || s.species === 'pet' || !WORKING_AGE.has(s.lifestage))) return false;
      if (careerFilter === 'npc' && career?.kind !== 'npc') return false;
      if (traitFilter !== 'all' && !(s.traitIds ?? []).includes(traitFilter)) return false;
      if (skillFilter !== 'all' && !effectiveSkillIds(s).has(skillFilter)) return false;
      if (aspirationFilter !== 'all' && s.aspirationId !== aspirationFilter) return false;
      if (dynastyFilter !== 'all' && dynastyBySim.get(s.id)?.dynasty.id !== dynastyFilter) return false;
      return true;
    }).sort((a, b) => {
      // Pets carry little data (no aspiration, sparse traits/occult), so they
      // scatter empty cells through every sort. Pin them below humans for all
      // sorts EXCEPT an explicit Species sort. The group order is fixed (ignores
      // direction); only the order WITHIN each group flips with sortDir.
      if (sortKey !== 'species') {
        const aPet = a.species === 'pet' ? 1 : 0;
        const bPet = b.species === 'pet' ? 1 : 0;
        if (aPet !== bPet) return aPet - bPet;
      }
      const va = sortVal(a), vb = sortVal(b);
      let c = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      if (c === 0) c = fullName(a).localeCompare(fullName(b)); // stable tiebreak by name
      return c * dir;
    });
  }, [allSims, search, speciesFilter, genderFilter, lifestageFilter, occultFilter, universityFilter, careerFilter, traitFilter, skillFilter, aspirationFilter, dynastyFilter, dynastyBySim, sortKey, sortDir, households]);

  const totalCount = Object.values(allSims).filter((s) => (s.recordStatus ?? 'active') === 'active').length;

  // Trait / aspiration dropdown options: only the ones actually present on the
  // roster (catalogs are huge; an unused-option list would be noise). Names
  // resolved + gendered tokens collapsed to "x/y" for a sim-agnostic label.
  const cleanGendered = (t: string) => t.replace(/\{F\d+\.([^}]+)\}\{M\d+\.([^}]+)\}/g, '$1/$2');
  const traitOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of Object.values(allSims)) {
      if ((s.recordStatus ?? 'active') !== 'active') continue;
      for (const id of s.traitIds ?? []) { const t = STOCK_TRAITS[id]; if (t && !seen.has(id)) seen.set(id, t.name); }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSims]);

  // Distinct skills across the active roster — built AND planned, so a skill
  // you've only set as a goal is still offered as a filter.
  const skillOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of Object.values(allSims)) {
      if ((s.recordStatus ?? 'active') !== 'active') continue;
      for (const id of effectiveSkillIds(s)) { const nm = STOCK_SKILLS[id]; if (nm && !seen.has(id)) seen.set(id, nm); }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSims]);
  const aspirationOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of Object.values(allSims)) {
      if ((s.recordStatus ?? 'active') !== 'active' || !s.aspirationId) continue;
      const a = STOCK_ASPIRATIONS[s.aspirationId];
      if (a && !seen.has(s.aspirationId)) seen.set(s.aspirationId, cleanGendered(a.name));
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSims]);

  // Save-vs-planned split across the active roster — the only headline number
  // worth a summary bar (all demographics already live on the Diversity page).
  const rosterStats = useMemo(() => {
    let fromSave = 0, planned = 0;
    for (const s of Object.values(allSims)) {
      if ((s.recordStatus ?? 'active') !== 'active') continue;
      if (s.sourceId) fromSave++; else planned++;
    }
    return { fromSave, planned };
  }, [allSims]);

  const hasActiveFilters =
    !!search || speciesFilter !== 'all' || genderFilter !== 'all' ||
    lifestageFilter !== 'all' || occultFilter !== 'all' ||
    universityFilter !== 'all' || careerFilter !== 'all' ||
    traitFilter !== 'all' || skillFilter !== 'all' || aspirationFilter !== 'all' || dynastyFilter !== 'all';

  // Count of active filter dimensions excluding search (search has its own clear-X).
  // Drives the count badge next to the collapsed "Filters" header.
  const activeChipCount =
    (speciesFilter !== 'all' ? 1 : 0) +
    (genderFilter !== 'all' ? 1 : 0) +
    (lifestageFilter !== 'all' ? 1 : 0) +
    (occultFilter !== 'all' ? 1 : 0) +
    (universityFilter !== 'all' ? 1 : 0) +
    (careerFilter !== 'all' ? 1 : 0) +
    (traitFilter !== 'all' ? 1 : 0) +
    (skillFilter !== 'all' ? 1 : 0) +
    (aspirationFilter !== 'all' ? 1 : 0) +
    (dynastyFilter !== 'all' ? 1 : 0);

  function clearAll() {
    setSearch('');
    setSpeciesFilter('all');
    setGenderFilter('all');
    setLifestageFilter('all');
    setOccultFilter('all');
    setUniversityFilter('all');
    setCareerFilter('all');
    setTraitFilter('all');
    setSkillFilter('all');
    setAspirationFilter('all');
    setDynastyFilter('all');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Tier-2, not tier-1. Sims has no rail, but the tier follows what the
          title SITS ON, not whether the page has a column: 20px labels a dense
          working surface (a rail, this table), 30px headlines a page with room
          around it. At 30 this competed with the grid directly below it, and
          it jumped every time you clicked between Households and Sims — the
          two sit next to each other in the sidebar.
          No subtitle: the toolbar's count summary is the fact line, and it
          stays live as you filter. */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-c-text tracking-headline">Sims</h1>
      </div>

      {/* Toolbar: search · filters toggle · count summary */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sims…"
            className="w-full bg-c-card border border-c-border rounded-md pl-8 pr-8 py-[7px] text-c-text text-sm outline-none focus:border-c-accent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1"
              aria-label="Clear search"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        {/* Filters toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-[7px] text-xs font-semibold tracking-headline transition-colors cursor-pointer ${
            filtersOpen || activeChipCount > 0
              ? 'bg-c-accent-soft border-c-accent-border text-c-green'
              : 'bg-c-card border-c-border text-c-dim hover:text-c-text'
          }`}
        >
          <FunnelSimple size={13} weight="bold" />
          Filters
          {activeChipCount > 0 && (
            <Pill tone="green" tabular>
              {activeChipCount}
            </Pill>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer"
          >
            <X size={11} weight="bold" /> Clear
          </button>
        )}

        <div className="flex-1 min-w-[8px]" />

        {/* Count summary — total, and the save/planned split when any are planned */}
        <div className="text-xs text-c-dim flex items-center gap-2 tabular-nums">
          <span>
            <span className="font-semibold text-c-text">{sims.length}</span>
            {sims.length !== totalCount && <span className="text-c-faint"> of {totalCount}</span>} sims
          </span>
          {rosterStats.planned > 0 && (<>
            <span className="text-c-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-c-accent" /> {rosterStats.fromSave} save
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-c-secondary" /> {rosterStats.planned} planned
            </span>
          </>)}
        </div>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
      <div className="bg-c-card border border-c-border rounded-lg p-4 mb-3 flex flex-col gap-3 shadow-sm">
        {/* Species + Gender row */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
          <FilterGroup label="Species">
            {(['all', 'human', 'pet', 'cat', 'dog', 'horse'] as SpeciesFilter[]).map((s) => (
              <Chip key={s} active={speciesFilter === s} onClick={() => setSpeciesFilter(speciesFilter === s ? 'all' : s)}>
                {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Gender">
            <Chip active={genderFilter === 'all'} onClick={() => setGenderFilter('all')}>All</Chip>
            <Chip active={genderFilter === 'male'} onClick={() => setGenderFilter(genderFilter === 'male' ? 'all' : 'male')}>♂ Male</Chip>
            <Chip active={genderFilter === 'female'} onClick={() => setGenderFilter(genderFilter === 'female' ? 'all' : 'female')}>♀ Female</Chip>
          </FilterGroup>

        </div>

        {/* Lifestage row */}
        <FilterGroup label="Lifestage">
          <Chip active={lifestageFilter === 'all'} onClick={() => setLifestageFilter('all')}>All</Chip>
          {ALL_LIFESTAGES.map((l) => (
            <Chip key={l} active={lifestageFilter === l} onClick={() => setLifestageFilter(lifestageFilter === l ? 'all' : l)}>
              {LIFESTAGE_LABEL[l]}
            </Chip>
          ))}
        </FilterGroup>

        {/* Occult row */}
        <FilterGroup label="Occult">
          <Chip active={occultFilter === 'all'} onClick={() => setOccultFilter('all')}>All</Chip>
          <Chip active={occultFilter === 'none'} onClick={() => setOccultFilter(occultFilter === 'none' ? 'all' : 'none')}>None</Chip>
          {ALL_OCCULTS.map((o) => (
            <Chip key={o} active={occultFilter === o} onClick={() => setOccultFilter(occultFilter === o ? 'all' : o)}>
              {OCCULT_LABEL[o]}
            </Chip>
          ))}
          <Chip active={occultFilter === 'ghost'} onClick={() => setOccultFilter(occultFilter === 'ghost' ? 'all' : 'ghost')}>
            Ghost
          </Chip>
        </FilterGroup>

        {/* University */}
        <FilterGroup label="University">
          <Chip active={universityFilter === 'all'} onClick={() => setUniversityFilter('all')}>All</Chip>
          <Chip active={universityFilter === 'enrolled'} onClick={() => setUniversityFilter(universityFilter === 'enrolled' ? 'all' : 'enrolled')}>Enrolled</Chip>
          <Chip active={universityFilter === 'graduate'} onClick={() => setUniversityFilter(universityFilter === 'graduate' ? 'all' : 'graduate')}>Has degree</Chip>
        </FilterGroup>

        <FilterGroup label="Career">
          <Chip active={careerFilter === 'all'} onClick={() => setCareerFilter('all')}>All</Chip>
          <Chip active={careerFilter === 'employed'} onClick={() => setCareerFilter(careerFilter === 'employed' ? 'all' : 'employed')}>Employed</Chip>
          <Chip active={careerFilter === 'unemployed'} onClick={() => setCareerFilter(careerFilter === 'unemployed' ? 'all' : 'unemployed')}>Unemployed</Chip>
          <Chip active={careerFilter === 'npc'} onClick={() => setCareerFilter(careerFilter === 'npc' ? 'all' : 'npc')}>NPC job</Chip>
        </FilterGroup>

        {/* Dropdown filters (trait/skill/aspiration/dynasty/household) */}
        <div className="flex items-end gap-3 flex-wrap pt-1 border-t border-c-panel">
          <SelectFilter label="Trait" value={traitFilter} onChange={setTraitFilter}
            options={[{ value: 'all', label: 'Any' }, ...traitOptions.map((t) => ({ value: t.id, label: t.name }))]} />
          <SelectFilter label="Skill" value={skillFilter} onChange={setSkillFilter}
            options={[{ value: 'all', label: 'Any' }, ...skillOptions.map((sk) => ({ value: sk.id, label: sk.name }))]} />
          <SelectFilter label="Aspiration" value={aspirationFilter} onChange={setAspirationFilter}
            options={[{ value: 'all', label: 'Any' }, ...aspirationOptions.map((a) => ({ value: a.id, label: a.name }))]} />
          {dynastyList.length > 0 && (
            <SelectFilter label="Dynasty" value={dynastyFilter} onChange={setDynastyFilter}
              options={[{ value: 'all', label: 'Any' }, ...dynastyList.map((d) => ({ value: d.id, label: d.name }))]} />
          )}
        </div>
      </div>
      )}

      <div className="flex gap-4 items-start">
      <div className="flex-1 min-w-0">
      {sims.length === 0 ? (
        <div className="bg-c-card border border-c-border rounded-lg">
          {totalCount === 0 ? (
            <EmptyState
              icon={<UsersThree size={28} weight="duotone" />}
              title="No sims yet"
              description="Sims live inside households. Open a household to add named sims with gender, lifestage, and occult — or import a save and we'll pull them all in."
              cta={{ label: 'Go to households', onClick: () => navigate(`/saves/${saveFileId}/households`) }}
            />
          ) : (
            <div className="py-14 px-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-c-secondary-soft text-c-secondary mb-3">
                <MagnifyingGlass size={22} weight="duotone" />
              </div>
              <p className="text-sm font-semibold text-c-text mb-1">No sims match those filters</p>
              <p className="text-xs text-c-faint mb-4">
                There are {totalCount} sims in this save — clear a filter to see them.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className={btn('primary', { size: 'sm' })}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-c-card border border-c-border rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-c-panel border-b border-c-border">
                <SortHeader label="Sim"        col="name"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Gender"     col="gender"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Lifestage"  col="lifestage"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Aspiration" col="aspiration" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Traits"     col="traits"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Career"     col="career"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Dynasty"    col="dynasty"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Household"  col="household"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sims.map((s: Sim) => {
                const hhId = effectiveHouseholdId(s);
                const hh = hhId ? households[hhId] : undefined;
                const isPet = s.species === 'pet';
                const career = effectiveCareer(s);
                const aspiration = s.aspirationId ? STOCK_ASPIRATIONS[s.aspirationId] : null;
                const aspirationName = aspiration ? resolveGenderedText(aspiration.name, s.gender) : null;
                const traits = (s.traitIds ?? [])
                  .map((id) => ({ id, name: STOCK_TRAITS[id]?.name }))
                  .filter((x): x is { id: string; name: string } => Boolean(x.name)); // skip unknown/mod traits
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
                    className={`border-b border-c-border last:border-b-0 cursor-pointer transition-colors ${
                      selectedId === s.id ? 'bg-c-accent-soft' : 'hover:bg-c-accent-soft'
                    }`}
                  >
                    {/* Sim: avatar + name + family-tree link */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-c-base border border-c-border flex items-center justify-center overflow-hidden shrink-0">
                          <img
                            src={`/lifestage-icons/${isPet ? `${s.petSubtype}-sim` : LIFESTAGE_ICON[s.lifestage]}.png`}
                            alt=""
                            className="w-7 h-7 object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <span className="text-c-text font-medium flex-1 min-w-0 truncate">
                          {s.firstName}{s.lastName ? ' ' + s.lastName : ''}
                        </span>
                        {!isPet && (
                          <Tooltip text="View in family tree">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/saves/${saveFileId}/family?focus=${s.id}`); }}
                           
                              className="shrink-0 text-c-faint hover:text-c-accent transition-colors bg-transparent border-none cursor-pointer p-1 rounded" aria-label="View in family tree">
                              <Tree size={16} weight="duotone" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {/* Gender */}
                    <td className="px-3 py-2.5">
                      {s.gender === 'male' ? (
                        <Pill tone="green" caps>
                          ♂ M
                        </Pill>
                      ) : (
                        <Pill tone="purple" caps>
                          ♀ F
                        </Pill>
                      )}
                    </td>
                    {/* Lifestage */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-c-text">
                        {isPet ? '—' : LIFESTAGE_LABEL[s.lifestage]}
                      </span>
                    </td>
                    {/* Aspiration */}
                    <td className="px-3 py-2.5">
                      {aspirationName ? (
                        <Tooltip text={aspirationName}>
                          <span className="inline-flex items-center gap-1.5 text-xs text-c-text max-w-[160px]">
                            <TraitAspIcon kind="aspiration" id={s.aspirationId ?? null} />
                            <span className="truncate">{aspirationName}</span>
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-c-faint">—</span>
                      )}
                    </td>
                    {/* Traits — icon-only; hover for the name */}
                    <td className="px-3 py-2.5">
                      {traits.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[148px]">
                          {traits.map((t) => (
                            <Tooltip key={t.id} text={t.name}>
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-c-base border border-c-border">
                                <TraitAspIcon kind="trait" id={t.id} />
                              </span>
                            </Tooltip>
                          ))}
                        </div>
                      ) : (
                        <span className="text-c-faint">—</span>
                      )}
                    </td>
                    {/* Career */}
                    <td className="px-3 py-2.5">
                      {career ? (
                        <Tooltip text={
                          career.level === null ? `${career.name} · planned`
                            : career.kind === 'npc' ? career.name
                            : `${career.name} · Level ${career.level}`
                        }>
                          <span className="inline-flex items-center gap-1.5 text-xs max-w-[170px]">
                          {(() => {
                            const icon = careerIconUrlById(career.uid);
                            return icon ? <img src={icon} alt="" className="w-4 h-4 shrink-0 object-contain" /> : null;
                          })()}
                          <span className={`truncate ${career.kind === 'npc' ? 'text-c-dim' : 'text-c-text'}`}>{career.name}</span>
                          {/* A planned career has no level to show — a level is
                              progress, and progress only exists in the save. */}
                          {career.level === null
                            ? null
                            : career.kind === 'npc'
                              ? <span className="shrink-0 text-3xs uppercase tracking-label text-c-faint">NPC</span>
                              : <span className="text-c-faint shrink-0">{career.level}</span>}
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-c-faint">—</span>
                      )}
                    </td>
                    {/* Dynasty */}
                    <td className="px-3 py-2.5">
                      {(() => {
                        const d = dynastyBySim.get(s.id);
                        if (!d) return <span className="text-c-faint">—</span>;
                        const crest = resolveCrest(d.dynasty.crestBgHash, d.dynasty.crestFgHash);
                        const role = d.role?.startsWith('Black Sheep') ? 'Black Sheep' : d.role;
                        return (
                          <Tooltip text={`${d.dynasty.name}${role ? ' · ' + role : ''}`}>
                            <span className="inline-flex items-center gap-1.5 text-xs max-w-[170px]">
                              <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={20} />
                              <span className="truncate text-c-text">{d.dynasty.name}</span>
                            </span>
                          </Tooltip>
                        );
                      })()}
                    </td>
                    {/* Household */}
                    <td className="px-3 py-2.5">
                      {hh ? (
                        <span className="text-xs text-c-dim truncate">{hh.name}</span>
                      ) : (
                        <span className="text-c-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {selectedSim && (
        <div className="sticky top-4 self-start shrink-0">
          <div className="flex justify-end mb-1.5">
            <button
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1 text-xs text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer"
            >
              <X size={12} weight="bold" /> Close
            </button>
          </div>
          <FocusPanel
            sim={selectedSim}
            parents={kin.parents}
            siblings={kin.siblings}
            children={kin.children}
            partners={partners}
            onSelect={(id) => setSelectedId(id)}
            onSaveNotes={(notes) => { if (saveFileId) updateSim(selectedSim.id, { notes }); }}
            photoUrl={simPhotos[selectedSim.id]}
            onEditPhoto={saveFileId ? () => setEditingPhotoFor(selectedSim) : undefined}
            onOpenHousehold={selectedSim.householdId
              ? () => navigate(`/saves/${saveFileId}/households?hh=${selectedSim.householdId}&sim=${selectedSim.id}`)
              : undefined}
            onOpenFamilyTree={() => navigate(`/saves/${saveFileId}/family?focus=${selectedSim.id}`)}
          />
        </div>
      )}
      </div>

      {editingPhotoFor && saveFileId && (
        <SetSimPhotoModal
          saveFileId={saveFileId}
          sim={editingPhotoFor}
          onClose={() => setEditingPhotoFor(null)}
          onChanged={refetchSimPhotos}
        />
      )}
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────────────

// A labeled compact Dropdown used for the roster's catalog filters (trait,
// skill, aspiration, dynasty, household). Replaces the old native <select>s so
// the menus match the app grammar and can scroll long option lists.
function SelectFilter({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-label text-c-faint">{label}</span>
      <Dropdown
        compact
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        className="w-40"
      />
    </label>
  );
}

function SortHeader({ label, col, sortKey, sortDir, onSort }: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="text-left px-3 py-2.5">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-label bg-transparent border-none cursor-pointer transition-colors ${
          active ? 'text-c-text' : 'text-c-dim hover:text-c-text'
        }`}
      >
        {label}
        {active ? (
          sortDir === 'asc'
            ? <CaretUp size={11} weight="bold" />
            : <CaretDown size={11} weight="bold" />
        ) : (
          <CaretUpDown size={11} weight="bold" className="text-c-faint" />
        )}
      </button>
    </th>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-2xs font-semibold uppercase tracking-label text-c-faint shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}
