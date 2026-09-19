/**
 * Diversity audit. Dashboard with auto-detected highlight cards up top, then
 * Demographics / Households / Personality sections. Personality bars are
 * segmented by gender so habit-cluster skews (e.g. "Hot-Headed is 95% male")
 * are visible without manual refiltering.
 *
 * Pure presentation + computation. All inputs via props.
 */
import { useMemo, useState } from 'react';
import { CaretDown, CaretRight, GenderFemale, GenderMale, Users, House, User, Scales, Storefront, Books, Coins, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import type { Sim, Household, PlannedLot, SimLifestage, SimGender, SimRelationship } from '../../types';
import { STOCK_TRAITS, traitsForLifestage } from '../../data/stockTraits';
import { STOCK_ASPIRATIONS, aspirationsForLifestage } from '../../data/stockAspirations';
import { STOCK_SKILLS } from '../../data/stockSkills';
import { earnedDegreesFromTraits } from '../../data/stockDegrees';
import type { CareerKind } from '../../data/stockCareers';
import { careerIconUrlById } from '../../data/careerIcons';
import { effectiveCareer, effectiveSkillIds, effectiveHouseholdId, effectiveFunds, effectiveComposition, isEmployed } from '../../lib/effective';
import { buildKinIndex, type KinIndex } from '../../lib/kin';
import { Dropdown } from '../common/Dropdown';
import {
  inferHouseholdType,
  HOUSEHOLD_TYPE_LABEL,
  HOUSEHOLD_TYPES_ORDERED,
} from '../../lib/householdClassifier';
import type { ParsedLifestage } from '../../lib/parser/types';
import { usePackOwnership } from '../../store/usePackOwnership';
import { getTraitPack, getAspirationPack } from '../../data/packAssignments';
import { isLotTypeOwned } from '../../data/lotTypePacks';
import { RELEASE_TO_PACK } from '../../data/packs';
import { WORLDS_DATA, WORLDS_SORTED_BY_RELEASE, compareWorldsCanonical } from '../../data/worlds';

const TRAIT_SLOTS: Record<ParsedLifestage, number> = {
  newborn: 0, infant: 1, toddler: 1, child: 1, teen: 2,
  youngAdult: 3, adult: 3, elder: 3, pet: 0,
};

const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};

const LIFESTAGE_SHORT: Record<SimLifestage, string> = {
  newborn: 'Nb', infant: 'Inf', toddler: 'Tod', child: 'Chi', teen: 'Tn',
  youngAdult: 'YA', adult: 'Adt', elder: 'Eld', pet: 'Pet',
};

const LIFESTAGES_FOR_PYRAMID: SimLifestage[] = [
  'elder', 'adult', 'youngAdult', 'teen', 'child', 'toddler', 'infant', 'newborn',
];

// When the user hasn't picked a specific lifestage, audit only YA/Adult/Elder
// (their CAS pools are big enough for the math to be meaningful). Filtering
// to a kid lifestage explicitly opts in to that smaller pool.
const DEFAULT_PERSONALITY_LIFESTAGES: ReadonlySet<SimLifestage> = new Set([
  'youngAdult', 'adult', 'elder',
]);

type LifestageFilter = 'all' | ParsedLifestage;
type GenderFilter = 'all' | SimGender;
type WorldFilter = 'all' | 'unassigned' | string;

const MOST_USED_TOP_N = 10;
const LEAST_USED_TOP_N = 10;
const SKEW_MIN_OBSERVED = 5; // hide skew highlights for traits with too few picks to be meaningful

// ─── Stat types ──────────────────────────────────────────────────────────────

interface PickStat {
  id: string;
  name: string;
  iconInstance: string | null;
  observed: number;
  eligible: number;
  expected: number;
  observedPercent: number;
  expectedPercent: number;
  ratio: number;
  byLifestage: Partial<Record<SimLifestage, number>>;
  byGender: Record<SimGender, number>;
  /** Eligible counts by gender — used to normalize the skew metric. */
  eligibleByGender: Record<SimGender, number>;
  /** Magnitude of gender skew on 0-1 scale (0 = perfectly balanced, 1 = all one gender). */
  skewMagnitude: number;
  skewDirection: SimGender | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanGendered(text: string): string {
  return text.replace(/\{F\d+\.([^}]+)\}\{M\d+\.([^}]+)\}/g, '$1/$2');
}
const humanSims = (sims: Sim[]) => sims.filter((s) => s.species !== 'pet');

function filterByDemo(
  sims: Sim[],
  lifestage: LifestageFilter,
  gender: GenderFilter,
  world: WorldFilter,
  worldBySim: Map<string, string | null>,
): Sim[] {
  return sims.filter((s) => {
    if (lifestage !== 'all' && s.lifestage !== lifestage) return false;
    if (gender !== 'all' && s.gender !== gender) return false;
    if (world !== 'all') {
      const w = worldBySim.get(s.id) ?? null;
      if (world === 'unassigned' && w !== null) return false;
      if (world !== 'unassigned' && w !== world) return false;
    }
    return true;
  });
}

function makeWorldBySim(
  sims: Sim[],
  households: Record<string, Household>,
  lots: Record<string, PlannedLot>,
): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const s of sims) {
    // A sim with a planned move counts in the world they're moving TO. A
    // destination that's still a plan-only shell has no lot yet, so they read
    // as unassigned until you give it one.
    const hhId = effectiveHouseholdId(s);
    const hh = hhId ? households[hhId] : undefined;
    const lotKey = hh?.assignedLotKey;
    const lot = lotKey ? lots[lotKey] : undefined;
    m.set(s.id, lot?.worldName ?? null);
  }
  return m;
}

/**
 * Compute trait/aspiration stats with gender skew.
 *
 * Skew metric: compare the observed gender ratio for sims-with-this-pick
 * to the ratio of eligible sims by gender. If 60% of eligible adults are
 * female and 60% of sims with Bookworm are also female, that's balanced
 * (skew ≈ 0). If 95% of sims with Hot-Headed are male while eligibles are
 * 60% female, skewMagnitude is high.
 */
function genderSkew(byGender: Record<SimGender, number>, eligibleByGender: Record<SimGender, number>): {
  magnitude: number;
  direction: SimGender | null;
} {
  const total = byGender.male + byGender.female;
  const eligibleTotal = eligibleByGender.male + eligibleByGender.female;
  if (total === 0 || eligibleTotal === 0) return { magnitude: 0, direction: null };
  const obsMaleRatio = byGender.male / total;
  const expMaleRatio = eligibleByGender.male / eligibleTotal;
  const diff = obsMaleRatio - expMaleRatio;
  return { magnitude: Math.abs(diff), direction: diff > 0 ? 'male' : diff < 0 ? 'female' : null };
}

function computeTraitStats(sims: Sim[], isTraitVisible?: (id: string) => boolean): PickStat[] {
  const out: PickStat[] = [];
  for (const [id, t] of Object.entries(STOCK_TRAITS)) {
    if (isTraitVisible && !isTraitVisible(id)) continue;
    let observed = 0, expected = 0, eligible = 0;
    const byLifestage: PickStat['byLifestage'] = {};
    const byGender: PickStat['byGender'] = { male: 0, female: 0 };
    const eligibleByGender: PickStat['eligibleByGender'] = { male: 0, female: 0 };
    for (const sim of sims) {
      const ls = sim.lifestage;
      if (ls === 'pet') continue;
      if (!(t.ages as SimLifestage[]).includes(ls)) continue;
      eligible++;
      eligibleByGender[sim.gender] += 1;
      const pool = traitsForLifestage(ls as ParsedLifestage);
      const slots = TRAIT_SLOTS[ls as ParsedLifestage];
      if (pool.length === 0 || slots === 0) continue;
      expected += slots / pool.length;
      if ((sim.traitIds ?? []).includes(id)) {
        observed++;
        byLifestage[ls] = (byLifestage[ls] ?? 0) + 1;
        byGender[sim.gender] += 1;
      }
    }
    if (eligible === 0) continue;
    const skew = genderSkew(byGender, eligibleByGender);
    out.push({
      id, name: t.name, iconInstance: t.iconInstance ? id.replace(/^0x/, '') : null,
      observed, eligible, expected,
      observedPercent: observed / eligible,
      expectedPercent: expected / eligible,
      ratio: expected > 0 ? observed / expected : 0,
      byLifestage, byGender, eligibleByGender,
      skewMagnitude: skew.magnitude,
      skewDirection: skew.direction,
    });
  }
  return out;
}

function computeAspirationStats(sims: Sim[], isAspVisible?: (id: string) => boolean): PickStat[] {
  const out: PickStat[] = [];
  for (const [id, a] of Object.entries(STOCK_ASPIRATIONS)) {
    if (isAspVisible && !isAspVisible(id)) continue;
    let observed = 0, expected = 0, eligible = 0;
    const byLifestage: PickStat['byLifestage'] = {};
    const byGender: PickStat['byGender'] = { male: 0, female: 0 };
    const eligibleByGender: PickStat['eligibleByGender'] = { male: 0, female: 0 };
    for (const sim of sims) {
      const ls = sim.lifestage;
      if (ls === 'pet') continue;
      if (!(a.ages as SimLifestage[]).includes(ls)) continue;
      eligible++;
      eligibleByGender[sim.gender] += 1;
      const pool = aspirationsForLifestage(ls as ParsedLifestage);
      if (pool.length === 0) continue;
      expected += 1 / pool.length;
      if (sim.aspirationId === id) {
        observed++;
        byLifestage[ls] = (byLifestage[ls] ?? 0) + 1;
        byGender[sim.gender] += 1;
      }
    }
    if (eligible === 0) continue;
    const skew = genderSkew(byGender, eligibleByGender);
    out.push({
      id, name: cleanGendered(a.name), iconInstance: a.iconInstance ? id.replace(/^0x/, '') : null,
      observed, eligible, expected,
      observedPercent: observed / eligible,
      expectedPercent: expected / eligible,
      ratio: expected > 0 ? observed / expected : 0,
      byLifestage, byGender, eligibleByGender,
      skewMagnitude: skew.magnitude,
      skewDirection: skew.direction,
    });
  }
  return out;
}

// Skill prevalence with gender skew — mirrors computeTraitStats, but skills are
// observed (no slot pool), so "eligible" = all skill-capable sims and there's no
// expected baseline. `sims` should already be the skill-capable, demo-filtered set.
function computeSkillStats(sims: Sim[]): PickStat[] {
  const eligible = sims.length;
  const eligibleByGender: PickStat['eligibleByGender'] = { male: 0, female: 0 };
  for (const s of sims) eligibleByGender[s.gender] += 1;
  const out: PickStat[] = [];
  for (const [id, name] of Object.entries(STOCK_SKILLS)) {
    let observed = 0;
    const byLifestage: PickStat['byLifestage'] = {};
    const byGender: PickStat['byGender'] = { male: 0, female: 0 };
    for (const s of sims) {
      // Built or planned — this measures whether a skill is represented at all,
      // and a goal you've set counts toward that.
      if (!effectiveSkillIds(s).has(id)) continue;
      observed++;
      byGender[s.gender] += 1;
      byLifestage[s.lifestage] = (byLifestage[s.lifestage] ?? 0) + 1;
    }
    const skew = genderSkew(byGender, eligibleByGender);
    out.push({
      id, name, iconInstance: id.replace(/^0x/, ''),
      observed, eligible, expected: 0,
      observedPercent: eligible > 0 ? observed / eligible : 0,
      expectedPercent: 0, ratio: 0,
      byLifestage, byGender, eligibleByGender,
      skewMagnitude: skew.magnitude, skewDirection: skew.direction,
    });
  }
  return out;
}

interface HouseholdBucketCount { key: string; label: string; count: number; fraction: number; }
function computeHouseholdBuckets(households: Household[], simsByHousehold: Map<string, Sim[]>, kin?: KinIndex): HouseholdBucketCount[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const h of households) {
    const members = simsByHousehold.get(h.id) ?? [];
    const type = inferHouseholdType({
      // Shape from the members under the plan, not the save's stored count —
      // otherwise a household you built here classifies as "Other" forever
      // (its composition is never written) and a planned move never lands.
      household: { composition: effectiveComposition(h, members), sourceId: h.sourceId },
      sims: members,
      kin,
    });
    counts.set(type, (counts.get(type) ?? 0) + 1);
    total++;
  }
  return HOUSEHOLD_TYPES_ORDERED
    .filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => ({
      key: k, label: HOUSEHOLD_TYPE_LABEL[k],
      count: counts.get(k) ?? 0,
      fraction: total > 0 ? (counts.get(k) ?? 0) / total : 0,
    }));
}

interface HouseholdSizeCount { size: number; count: number; }
function computeHouseholdSizes(households: Household[], simsByHousehold: Map<string, Sim[]>): HouseholdSizeCount[] {
  const sizes = new Map<number, number>();
  for (const h of households) {
    const named = simsByHousehold.get(h.id) ?? [];
    let size = named.length;
    if (size === 0) {
      const c = h.composition;
      size = c.elder.male + c.elder.female + c.adult.male + c.adult.female
        + c.youngAdult.male + c.youngAdult.female + c.teen.male + c.teen.female
        + c.child.male + c.child.female + c.toddler.male + c.toddler.female
        + c.infant.male + c.infant.female
        + (c.newborn?.male ?? 0) + (c.newborn?.female ?? 0);
    }
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
  }
  const max = Math.max(0, ...sizes.keys());
  const out: HouseholdSizeCount[] = [];
  for (let s = 1; s <= Math.max(8, max); s++) {
    out.push({ size: s, count: sizes.get(s) ?? 0 });
  }
  return out;
}

interface PetSubtypeCount { subtype: string; count: number; }
const computePetBreakdown = (allSims: Sim[]): PetSubtypeCount[] => {
  const counts = new Map<string, number>();
  for (const s of allSims) {
    if (s.species !== 'pet') continue;
    counts.set(s.petSubtype, (counts.get(s.petSubtype) ?? 0) + 1);
  }
  return ['cat', 'dog', 'horse', 'pet']
    .filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => ({ subtype: k, count: counts.get(k) ?? 0 }));
};

// "Occult" view also folds in Ghost — different mechanic in-game but
// conceptually fits the same supernatural lens.
interface OccultCount { key: string; count: number; }
const computeOccultBreakdown = (sims: Sim[]): OccultCount[] => {
  const counts = new Map<string, number>();
  let ghosts = 0;
  for (const s of sims) {
    if (s.species === 'pet') continue;
    counts.set(s.occult, (counts.get(s.occult) ?? 0) + 1);
    if (s.isGhost) ghosts++;
  }
  const ordered = ['none', 'vampire', 'spellcaster', 'werewolf', 'fairy', 'alien', 'mermaid'];
  const out: OccultCount[] = ordered
    .filter((o) => (counts.get(o) ?? 0) > 0)
    .map((o) => ({ key: o, count: counts.get(o) ?? 0 }));
  if (ghosts > 0) out.push({ key: 'ghost', count: ghosts });
  return out;
};

// Career distribution — one row per distinct career held, with gender split.
interface CareerCount { uid: string; name: string; kind: CareerKind; count: number; male: number; female: number; }
function computeCareerStats(sims: Sim[]): CareerCount[] {
  const m = new Map<string, CareerCount>();
  for (const s of sims) {
    // One career per sim, and it's the planned one where there is one — a sim
    // can't be counted under both the job they have and the job you want them
    // to have, or every percentage on this page is wrong.
    const c = effectiveCareer(s);
    if (!c) continue;
    let row = m.get(c.uid);
    if (!row) { row = { uid: c.uid, name: c.name, kind: c.kind, count: 0, male: 0, female: 0 }; m.set(c.uid, row); }
    row.count += 1;
    row[s.gender] += 1;
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface PyramidRow { lifestage: SimLifestage; male: number; female: number; }
const computePyramid = (sims: Sim[]): PyramidRow[] => {
  const rows: PyramidRow[] = LIFESTAGES_FOR_PYRAMID.map((ls) => ({ lifestage: ls, male: 0, female: 0 }));
  for (const s of sims) {
    if (s.species === 'pet') continue;
    const row = rows.find((r) => r.lifestage === s.lifestage);
    if (row) row[s.gender]++;
  }
  return rows;
};

// ─── Lot coverage ────────────────────────────────────────────────────────────

type LotCategory = 'singleFamily' | 'apartments' | 'foodDrink' | 'outdoor' | 'business' | 'health' | 'rental' | 'other';
const LOT_CATEGORIES_ORDERED: LotCategory[] = ['singleFamily', 'apartments', 'foodDrink', 'outdoor', 'business', 'health', 'rental', 'other'];

// Maps raw lot type strings (in-game venues) to coarse categories. Types
// not in this map are treated as uncategorized (skipped — they don't count
// toward any category nor toward the world's total). The exclusion list
// includes hidden/secret venues + civic instances that aren't player-managed.
const LOT_TYPE_CATEGORY: Record<string, LotCategory> = {
  // Residential (single-family homes)
  'Residential': 'singleFamily',
  // Apartments & dorms (multi-unit / shared building residences)
  'Residential Rental': 'apartments', 'Apartment': 'apartments',
  'Penthouse': 'apartments', 'University Housing': 'apartments',
  // Rental — vacation cabins / temporary stays
  'Rental': 'rental', 'Vacation Rental': 'rental',
  // Food and Drink
  'Bar': 'foodDrink', 'Cafe': 'foodDrink', 'Restaurant': 'foodDrink',
  'Lounge': 'foodDrink', 'Thrift and Bubble Tea Store': 'foodDrink',
  'Karaoke Bar': 'foodDrink', 'Nightclub': 'foodDrink',
  // Outdoor
  'Park': 'outdoor', 'Center Park': 'outdoor', 'National Park': 'outdoor',
  'Playground': 'outdoor', 'Beach': 'outdoor', 'Pool': 'outdoor',
  'Island Bluff': 'outdoor', 'Chalet Gardens': 'outdoor',
  'Ancient Ruins': 'outdoor', 'Cemetery': 'outdoor',
  // Business
  'Retail': 'business', 'Vet Clinic': 'business', 'Small Business Venue': 'business',
  // Health
  'Gym': 'health', 'Spa': 'health', 'Onsen Bathhouse': 'health',
  // Civic / Other
  'Community Space': 'other', 'Market': 'other', 'Custom Venue': 'other',
  'Backroom': 'other', 'Library': 'other', 'Museum': 'other',
  'Arts Center': 'other', 'Recreation Center': 'other',
  'Foxbury Commons': 'other', 'UBrite Commons': 'other',
  'Wedding Venue': 'other',
  // Excluded entirely (do not appear in counts): Hermit's Hut, The Magic Realm,
  // Auditorium, Alien Party Lot, Hospital, Police Station, Acting Studio,
  // High School, Mount Komorebi Summit, Headless Quarter, Secret Lot,
  // FutureSim Labs, Secret Lab.
};

// Worlds with this few or fewer lots are skipped from the "most lopsided"
// highlight — tiny themed worlds always read as lopsided by design and would
// dominate the metric without it being interesting.
const LOPSIDED_MIN_LOTS = 9;

// Two-family palette tuned to the site's leaf-green + soft-purple identity:
// residences are green (c-accent family), everything else is plum (c-secondary
// family). Within each family the categories vary in lightness so a save's
// overall mix reads as "how much green vs plum" at a glance.
const LOT_CATEGORY_META: Record<LotCategory, { label: string; bg: string; text: string; bgSoft: string; border: string }> = {
  // Residences — green family (c-accent #16a34a)
  singleFamily: { label: 'Residential',         bg: 'bg-[#16a34a]', text: 'text-[#15803d]', bgSoft: 'bg-[#ecfdf3]', border: 'border-[#bbf7d0]' },
  apartments:   { label: 'Apartments & Dorms',  bg: 'bg-[#86c897]', text: 'text-[#15803d]', bgSoft: 'bg-[#ecfdf3]', border: 'border-[#bbf7d0]' },
  // Venues + rentals — plum family (c-secondary #7c5cbf), darkest → lightest
  foodDrink:    { label: 'Food & Drink',        bg: 'bg-[#5d4393]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
  outdoor:      { label: 'Outdoor',             bg: 'bg-[#7c5cbf]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
  business:     { label: 'Business',            bg: 'bg-[#9170c7]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
  health:       { label: 'Health',              bg: 'bg-[#ad8fd1]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
  rental:       { label: 'Rental',              bg: 'bg-[#c2a4dd]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
  other:        { label: 'Civic/Other',         bg: 'bg-[#d8c5ec]', text: 'text-[#4a3275]', bgSoft: 'bg-[#f3eefb]', border: 'border-[#d6c5f0]' },
};

const lotCategoryOrNull = (lot: PlannedLot): LotCategory | null =>
  LOT_TYPE_CATEGORY[lot.customType] ?? null;

interface WorldCoverage {
  world: string;
  total: number;
  byCategory: Record<LotCategory, number>;
  byRawType: Map<string, number>;
  categoriesCovered: number;
}

function computeLotCoverage(
  lots: PlannedLot[],
  isWorldVisible?: (worldName: string) => boolean,
  isLotTypeVisible?: (typeLabel: string) => boolean,
  disabledWorlds: string[] = [],
): WorldCoverage[] {
  const byWorld = new Map<string, WorldCoverage>();
  for (const lot of lots) {
    const w = lot.worldName;
    if (!w) continue;
    if (disabledWorlds.includes(w)) continue;  // lot/world content of switched-off worlds is out
    if (isWorldVisible && !isWorldVisible(w)) continue;
    if (isLotTypeVisible && !isLotTypeVisible(lot.customType)) continue;
    const cat = lotCategoryOrNull(lot);
    if (cat === null) continue; // skip uncategorized (Hermit's Hut, Secret Lab, etc.)
    let row = byWorld.get(w);
    if (!row) {
      row = {
        world: w,
        total: 0,
        byCategory: { singleFamily: 0, apartments: 0, foodDrink: 0, outdoor: 0, business: 0, health: 0, rental: 0, other: 0 },
        byRawType: new Map(),
        categoriesCovered: 0,
      };
      byWorld.set(w, row);
    }
    row.byCategory[cat] += 1;
    row.byRawType.set(lot.customType, (row.byRawType.get(lot.customType) ?? 0) + 1);
    row.total += 1;
  }
  for (const row of byWorld.values()) {
    row.categoriesCovered = LOT_CATEGORIES_ORDERED.reduce(
      (acc, c) => acc + (row.byCategory[c] > 0 ? 1 : 0),
      0,
    );
  }
  return [...byWorld.values()].sort((a, b) => compareWorldsCanonical(a.world, b.world));
}

// Residential categories are excluded from the venue ranking — every world is
// mostly homes, so they'd dominate and drown out the interesting signal (which
// non-home venues the save leans on).
const RESIDENTIAL_CATEGORIES: ReadonlySet<LotCategory> = new Set(['singleFamily', 'apartments', 'rental']);

interface VenueTypeCount { type: string; category: LotCategory; count: number; }

// Venue types to omit from the "Rarest" column — venues that are unique or
// special by design (one per world / pack) always read as rare and aren't an
// interesting "you're missing this" signal.
const VENUE_RAREST_EXCLUDE: ReadonlySet<string> = new Set([
  'UBrite Commons', 'Foxbury Commons', 'Island Bluff',
  'Chalet Gardens', 'Center Park', 'Ancient Ruins',
]);

/** Aggregate non-residential lot types across the given world rows, ranked by count. */
function computeVenueRanking(rows: WorldCoverage[]): VenueTypeCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const [type, n] of row.byRawType) {
      const cat = LOT_TYPE_CATEGORY[type];
      if (!cat || RESIDENTIAL_CATEGORIES.has(cat)) continue;
      counts.set(type, (counts.get(type) ?? 0) + n);
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, category: LOT_TYPE_CATEGORY[type] as LotCategory, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Count single-occupant households split by the lone sim's gender. Uses named
 *  sims when present, else falls back to composition counts. Pets are ignored
 *  for the "solo" determination. */
function computeSoloCounts(
  households: Household[],
  simsByHousehold: Map<string, Sim[]>,
): { male: number; female: number } {
  let male = 0, female = 0;
  for (const h of households) {
    const named = (simsByHousehold.get(h.id) ?? []).filter((s) => s.species !== 'pet');
    if (named.length > 0) {
      if (named.length === 1) named[0].gender === 'male' ? male++ : female++;
      continue;
    }
    const c = h.composition;
    const males = c.elder.male + c.adult.male + c.youngAdult.male + c.teen.male + c.child.male + c.toddler.male + c.infant.male + (c.newborn?.male ?? 0);
    const females = c.elder.female + c.adult.female + c.youngAdult.female + c.teen.female + c.child.female + c.toddler.female + c.infant.female + (c.newborn?.female ?? 0);
    if (males + females === 1) males === 1 ? male++ : female++;
  }
  return { male, female };
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function GroupHeader({ accent, title, subtitle }: {
  accent: 'accent' | 'secondary' | 'gradient';
  title: string;
  subtitle?: string;
}) {
  // Vertical accent bar to the left replaces the editorial number prefix.
  // Less "magazine-y," more grounded in the planner's existing color language.
  const bar = accent === 'accent'
    ? 'bg-c-accent'
    : accent === 'secondary'
      ? 'bg-c-secondary'
      : 'bg-gradient-to-b from-c-secondary to-c-accent';
  return (
    <header className="mb-6 flex items-stretch gap-4">
      <div className={`w-1 rounded-full ${bar} shrink-0`} />
      <div>
        <h2 className="text-2xl font-bold text-c-text tracking-display leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-c-dim mt-1">{subtitle}</p>}
      </div>
    </header>
  );
}

function SectionPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-c-card border border-c-border p-6 md:p-8">
      {children}
    </section>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-2xs font-semibold uppercase tracking-label text-c-dim mb-2">{children}</div>
  );
}

/**
 * Render a horizontal bar split into female (purple, left) + male (green, right)
 * segments. Total fill = observedPercent of available width. Bar segments
 * scale to the observed gender split.
 */
function GenderSplitBar({ observedPercent, byGender, expectedPercent, scaleMax }: {
  observedPercent: number;
  byGender: Record<SimGender, number>;
  expectedPercent: number;
  scaleMax: number;
}) {
  const totalWidth = (observedPercent / scaleMax) * 100;
  const baselineLeft = (expectedPercent / scaleMax) * 100;
  const observedTotal = byGender.male + byGender.female;
  const femaleFraction = observedTotal > 0 ? byGender.female / observedTotal : 0;
  return (
    <div className="relative h-3 bg-c-base rounded-full overflow-hidden">
      <div className="absolute inset-y-0 left-0 flex rounded-full overflow-hidden" style={{ width: `${totalWidth}%` }}>
        {femaleFraction > 0 && (
          <div
            className="bg-c-secondary h-full"
            style={{ width: `${femaleFraction * 100}%`, boxShadow: 'inset -1.5px 0 0 0 var(--c-card)' }}
          />
        )}
        <div className="bg-c-accent h-full flex-1" />
      </div>
      <div
        className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-c-dim rounded-full"
        style={{ left: `calc(${baselineLeft}% - 1px)` }}
        title={`Baseline ~${(expectedPercent * 100).toFixed(1)}%`}
      />
    </div>
  );
}

function PickRow({
  iconInstance, iconFolder, name, observed, eligible,
  observedPercent, expectedPercent,
  byLifestage, byGender, eligibleByGender,
  skewMagnitude, skewDirection,
}: PickStat & { iconFolder: 'trait-icons' | 'aspiration-icons' | 'skill-icons' }) {
  const [expanded, setExpanded] = useState(false);
  const neverUsed = observed === 0;
  const scaleMax = Math.max(0.05, observedPercent, expectedPercent * 4);
  // Strong-skew flag: high magnitude AND enough observations to matter
  const strongSkew = skewMagnitude >= 0.25 && observed >= SKEW_MIN_OBSERVED && skewDirection !== null;

  return (
    <div className="rounded-md hover:bg-c-base transition-colors">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left flex items-center gap-2.5 py-1.5 px-1.5 bg-transparent border-none cursor-pointer"
      >
        {iconInstance ? (
          <img src={`/${iconFolder}/${iconInstance}.png`} alt="" className="w-5 h-5 object-contain shrink-0" />
        ) : (
          <div className="w-5 h-5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-c-text truncate">{name}</span>
          <div className="mt-1">
            <GenderSplitBar
              observedPercent={observedPercent}
              byGender={byGender}
              expectedPercent={expectedPercent}
              scaleMax={scaleMax}
            />
          </div>
        </div>
        <div className="text-right shrink-0 leading-tight">
          <div className="text-xs tabular-nums text-c-text">
            {neverUsed ? '—' : `${Math.round(observedPercent * 100)}%`}
          </div>
          <div className="text-3xs text-c-faint tabular-nums">{observed}/{eligible}</div>
        </div>
        <CaretRight size={10} weight="bold" className={`text-c-faint shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 pt-0.5 flex items-center gap-2 flex-wrap text-3xs">
          <span className="text-c-dim">
            Baseline: <span className="text-c-text tabular-nums">{(expectedPercent * 100).toFixed(1)}%</span>
          </span>
          {byGender.female > 0 && (
            <span className="inline-flex items-center gap-0.5 text-c-secondary">
              <GenderFemale size={10} weight="bold" /> {byGender.female}
              {eligibleByGender.female > 0 && (
                <span className="text-c-dim">/{eligibleByGender.female}</span>
              )}
            </span>
          )}
          {byGender.male > 0 && (
            <span className="inline-flex items-center gap-0.5 text-c-accent">
              <GenderMale size={10} weight="bold" /> {byGender.male}
              {eligibleByGender.male > 0 && (
                <span className="text-c-dim">/{eligibleByGender.male}</span>
              )}
            </span>
          )}
          {strongSkew && (
            <span className={`inline-flex items-center gap-1 ${skewDirection === 'male' ? 'text-c-accent' : 'text-c-secondary'}`}>
              skews {skewDirection}
            </span>
          )}
          {Object.entries(byLifestage)
            .filter(([, n]) => n && n > 0)
            .map(([ls, n]) => (
              <span key={ls} className="px-1.5 py-0.5 rounded-full bg-c-base border border-c-border text-c-text">
                {n} {LIFESTAGE_SHORT[ls as SimLifestage]}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function PickList({
  stats, topN, emptyMessage, iconFolder,
}: {
  stats: PickStat[];
  topN: number;
  emptyMessage: string;
  iconFolder: 'trait-icons' | 'aspiration-icons' | 'skill-icons';
}) {
  const [showAll, setShowAll] = useState(false);
  if (stats.length === 0) return <p className="text-2xs text-c-dim italic">{emptyMessage}</p>;
  const visible = showAll ? stats : stats.slice(0, topN);
  return (
    <>
      <div className="space-y-0">
        {visible.map((s) => (
          <PickRow key={s.id} {...s} iconFolder={iconFolder} />
        ))}
      </div>
      {stats.length > topN && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-3xs text-c-accent hover:underline mt-1 bg-transparent border-none cursor-pointer flex items-center gap-1"
        >
          {showAll ? 'Collapse' : `Show all ${stats.length}`}
          <CaretDown size={9} weight="bold" className={showAll ? 'rotate-180' : ''} />
        </button>
      )}
    </>
  );
}

function TopicRow({
  title, mostUsed, leastUsed, iconFolder,
}: {
  title: string;
  mostUsed: PickStat[];
  leastUsed: PickStat[];
  iconFolder: 'trait-icons' | 'aspiration-icons' | 'skill-icons';
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-c-text tracking-headline mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        <div>
          <SubLabel>Most used</SubLabel>
          <PickList stats={mostUsed} topN={MOST_USED_TOP_N} emptyMessage="None yet." iconFolder={iconFolder} />
        </div>
        <div>
          <SubLabel>Least used</SubLabel>
          <PickList stats={leastUsed} topN={LEAST_USED_TOP_N} emptyMessage="—" iconFolder={iconFolder} />
        </div>
      </div>
    </div>
  );
}

function HouseholdTypeList({ buckets }: { buckets: HouseholdBucketCount[] }) {
  const max = Math.max(0, ...buckets.map((b) => b.count));
  if (buckets.length === 0) return <p className="text-2xs text-c-dim italic">No households yet.</p>;
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => {
        const widthPct = max > 0 ? (b.count / max) * 100 : 0;
        return (
          <div key={b.key} className="flex items-center gap-3 py-0.5">
            <div className="text-xs text-c-text w-32 shrink-0 truncate">{b.label}</div>
            <div className="flex-1 h-3 bg-c-base rounded-full overflow-hidden">
              <div className="h-full bg-c-accent rounded-full" style={{ width: `${widthPct}%` }} />
            </div>
            <div className="text-xs text-c-dim tabular-nums w-10 text-right">{b.count}</div>
          </div>
        );
      })}
    </div>
  );
}

function HouseholdSizeBars({ rows }: { rows: HouseholdSizeCount[] }) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 8).map((r) => {
        const widthPct = max > 0 ? (r.count / max) * 100 : 0;
        return (
          <div key={r.size} className={`flex items-center gap-3 py-0.5 ${r.count === 0 ? 'opacity-40' : ''}`}>
            <div className="text-xs text-c-text w-20 shrink-0">
              {r.size} sim{r.size === 1 ? '' : 's'}
            </div>
            <div className="flex-1 h-3 bg-c-base rounded-full overflow-hidden">
              <div className="h-full bg-c-accent rounded-full" style={{ width: `${widthPct}%` }} />
            </div>
            <div className="text-xs text-c-dim tabular-nums w-10 text-right">{r.count}</div>
          </div>
        );
      })}
    </div>
  );
}

function PopulationPyramid({ rows }: { rows: PyramidRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.male, r.female)));
  const totalFemale = rows.reduce((s, r) => s + r.female, 0);
  const totalMale = rows.reduce((s, r) => s + r.male, 0);
  const total = totalFemale + totalMale;
  const femalePctOfTotal = total > 0 ? Math.round((totalFemale / total) * 100) : 0;
  const malePctOfTotal = total > 0 ? Math.round((totalMale / total) * 100) : 0;
  return (
    <div>
      {/* Totals header — gender parity at a glance, before the per-lifestage breakdown */}
      <div className="grid grid-cols-[52px_1fr_10px_1fr] sm:grid-cols-[80px_1fr_12px_1fr] items-end gap-1.5 sm:gap-2 mb-3">
        <div />
        <div className="flex justify-end items-baseline gap-2 text-c-secondary">
          <div className="flex items-center gap-1">
            <GenderFemale size={12} weight="bold" />
            <span className="hidden sm:inline text-3xs uppercase tracking-label">Female</span>
          </div>
          <span className="text-lg font-bold tabular-nums leading-none">{totalFemale}</span>
          <span className="text-3xs text-c-dim tabular-nums">{femalePctOfTotal}%</span>
        </div>
        <div />
        <div className="flex items-baseline gap-2 text-c-accent">
          <span className="text-3xs text-c-dim tabular-nums">{malePctOfTotal}%</span>
          <span className="text-lg font-bold tabular-nums leading-none">{totalMale}</span>
          <div className="flex items-center gap-1">
            <span className="hidden sm:inline text-3xs uppercase tracking-label">Male</span>
            <GenderMale size={12} weight="bold" />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((r) => {
          const malePct = (r.male / max) * 100;
          const femalePct = (r.female / max) * 100;
          const empty = r.male === 0 && r.female === 0;
          return (
            <div key={r.lifestage} className={`grid grid-cols-[52px_1fr_10px_1fr] sm:grid-cols-[80px_1fr_12px_1fr] items-center gap-1.5 sm:gap-2 ${empty ? 'opacity-30' : ''}`}>
              <div className="text-2xs text-c-text text-right truncate">{LIFESTAGE_LABEL[r.lifestage]}</div>
              <div className="h-4 flex items-center gap-1.5">
                <span className="w-5 sm:w-8 text-right text-[10px] text-c-secondary font-semibold tabular-nums shrink-0">
                  {r.female > 0 ? r.female : ''}
                </span>
                <div className="flex-1 h-full flex justify-end items-center min-w-0">
                  <div className="h-full bg-c-secondary rounded-l-sm" style={{ width: `${femalePct}%` }} />
                </div>
              </div>
              <div className="h-4 w-px bg-c-border mx-auto" />
              <div className="h-4 flex items-center gap-1.5">
                <div className="flex-1 h-full flex items-center min-w-0">
                  <div className="h-full bg-c-accent rounded-r-sm" style={{ width: `${malePct}%` }} />
                </div>
                <span className="w-5 sm:w-8 text-left text-[10px] text-c-accent font-semibold tabular-nums shrink-0">
                  {r.male > 0 ? r.male : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OCCULT_LABEL: Record<string, string> = {
  none: 'Mortal', vampire: 'Vampire', spellcaster: 'Spellcaster',
  werewolf: 'Werewolf', fairy: 'Fairy', alien: 'Alien', mermaid: 'Mermaid',
  ghost: 'Ghost',
};

// Occult-themed palette — color-coded chips give the section a more
// distinctive look than uniform neutral. Colors reference the in-game
// occult vibe (vampire = red, alien = emerald, etc.). Gender rule
// doesn't apply here — these are categories, not gender markers.
const OCCULT_PALETTE: Record<string, { dot: string; text: string; bg: string }> = {
  none:        { dot: 'bg-c-faint',  text: 'text-c-dim',          bg: 'bg-c-base border-c-border' },
  vampire:     { dot: 'bg-red-500',  text: 'text-red-700',        bg: 'bg-red-50 border-red-200' },
  spellcaster: { dot: 'bg-purple-500', text: 'text-purple-700',   bg: 'bg-purple-50 border-purple-200' },
  werewolf:    { dot: 'bg-amber-500', text: 'text-amber-700',     bg: 'bg-amber-50 border-amber-200' },
  fairy:       { dot: 'bg-pink-500', text: 'text-pink-700',       bg: 'bg-pink-50 border-pink-200' },
  alien:       { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  mermaid:     { dot: 'bg-sky-500',  text: 'text-sky-700',        bg: 'bg-sky-50 border-sky-200' },
  ghost:       { dot: 'bg-slate-400', text: 'text-slate-600',     bg: 'bg-slate-50 border-slate-200' },
};

function OccultChips({ rows }: { rows: OccultCount[] }) {
  if (rows.length === 0) return <p className="text-2xs text-c-dim italic">No occult data.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((o) => {
        const p = OCCULT_PALETTE[o.key] ?? OCCULT_PALETTE.none;
        return (
          <div key={o.key} className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border ${p.bg} text-2xs`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            <span className={`font-medium ${p.text}`}>{OCCULT_LABEL[o.key] ?? o.key}</span>
            <span className={`tabular-nums font-semibold ${p.text}`}>{o.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function CareerBars({ rows }: { rows: CareerCount[] }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return <p className="text-2xs text-c-dim italic">No careers in this selection.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  const visible = showAll ? rows : rows.slice(0, 12);
  return (
    <>
      <div className="space-y-1.5">
        {visible.map((r) => {
          const widthPct = max > 0 ? (r.count / max) * 100 : 0;
          const femaleFrac = r.count > 0 ? r.female / r.count : 0;
          const kindLabel = r.kind !== 'fulltime' ? CAREER_KIND_LABEL[r.kind] : null;
          return (
            <div key={r.uid} className="flex items-center gap-3 py-0.5">
              <div className="w-44 shrink-0 min-w-0 flex items-center gap-1.5">
                {(() => {
                  const icon = careerIconUrlById(r.uid);
                  return icon ? <img src={icon} alt="" className="w-4 h-4 shrink-0 object-contain" /> : null;
                })()}
                <div className="min-w-0">
                  <div className="text-xs text-c-text truncate" title={r.name}>{r.name}</div>
                  {kindLabel && <div className="text-3xs text-c-faint truncate">{kindLabel}</div>}
                </div>
              </div>
              <div className="flex-1 h-3 bg-c-base rounded-full overflow-hidden">
                <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${widthPct}%` }}>
                  {femaleFrac > 0 && <div className="bg-c-secondary h-full" style={{ width: `${femaleFrac * 100}%` }} />}
                  <div className="bg-c-accent h-full flex-1" />
                </div>
              </div>
              <div className="text-xs text-c-dim tabular-nums w-8 text-right">{r.count}</div>
            </div>
          );
        })}
      </div>
      {rows.length > 12 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-3xs text-c-accent hover:underline mt-1.5 bg-transparent border-none cursor-pointer flex items-center gap-1"
        >
          {showAll ? 'Collapse' : `Show all ${rows.length}`}
          <CaretDown size={9} weight="bold" className={showAll ? 'rotate-180' : ''} />
        </button>
      )}
    </>
  );
}

// Generic gender-split bar list for education (enrollment / degrees) — by subject.
interface EduCount { key: string; label: string; sub?: string; count: number; male: number; female: number; }
function EduBars({ rows, empty }: { rows: EduCount[]; empty: string }) {
  if (rows.length === 0) return <p className="text-2xs text-c-dim italic">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const widthPct = max > 0 ? (r.count / max) * 100 : 0;
        const femaleFrac = r.count > 0 ? r.female / r.count : 0;
        return (
          <div key={r.key} className="flex items-center gap-3 py-0.5">
            <div className="w-40 shrink-0 min-w-0">
              <div className="text-xs text-c-text truncate" title={r.label}>{r.label}</div>
              {r.sub && <div className="text-3xs text-c-faint truncate">{r.sub}</div>}
            </div>
            <div className="flex-1 h-3 bg-c-base rounded-full overflow-hidden">
              <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${widthPct}%` }}>
                {femaleFrac > 0 && <div className="bg-c-secondary h-full" style={{ width: `${femaleFrac * 100}%` }} />}
                <div className="bg-c-accent h-full flex-1" />
              </div>
            </div>
            <div className="text-xs text-c-dim tabular-nums w-8 text-right">{r.count}</div>
          </div>
        );
      })}
    </div>
  );
}

const PET_SUBTYPE_LABEL: Record<string, string> = {
  cat: 'Cats', dog: 'Dogs', horse: 'Horses', pet: 'Other',
};
const PET_SUBTYPE_ICON: Record<string, string> = {
  cat: 'cat-sim', dog: 'dog-sim', horse: 'horse-sim', pet: 'cat-sim',
};

function PetChips({ rows }: { rows: PetSubtypeCount[] }) {
  if (rows.length === 0) return <p className="text-2xs text-c-dim italic">No pets in this save.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((p) => (
        <span key={p.subtype} className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-c-base border border-c-border text-2xs">
          <img src={`/lifestage-icons/${PET_SUBTYPE_ICON[p.subtype]}.png`} alt="" className="w-3.5 h-3.5 object-contain" />
          <span className="text-c-text">{PET_SUBTYPE_LABEL[p.subtype] ?? p.subtype}</span>
          <span className="text-c-dim tabular-nums font-semibold">{p.count}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Lot coverage subcomponents ──────────────────────────────────────────────

function LotCoverageLegend({ onToggleExplainer, showingExplainer }: {
  onToggleExplainer: () => void;
  showingExplainer: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {LOT_CATEGORIES_ORDERED.map((c) => {
        const m = LOT_CATEGORY_META[c];
        return (
          <div key={c} className="inline-flex items-center gap-1.5 text-2xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${m.bg}`} />
            <span className="text-c-dim">{m.label}</span>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onToggleExplainer}
        className="text-2xs text-c-dim hover:text-c-text underline underline-offset-2 decoration-dotted ml-1"
      >
        {showingExplainer ? 'Hide categories' : 'What’s in each?'}
      </button>
    </div>
  );
}

function CategoryExplainer() {
  // Inverse of LOT_TYPE_CATEGORY — grouped by category for display.
  const byCat = LOT_CATEGORIES_ORDERED.map((cat) => {
    const types = Object.entries(LOT_TYPE_CATEGORY)
      .filter(([, c]) => c === cat)
      .map(([t]) => t)
      .sort();
    return { cat, types };
  });
  const excluded = [
    'Hermit’s Hut', 'The Magic Realm', 'Auditorium', 'Alien Party Lot',
    'Hospital', 'Police Station', 'Acting Studio', 'High School',
    'Mount Komorebi Summit', 'Headless Quarter', 'Secret Lot',
    'FutureSim Labs', 'Secret Lab',
  ];
  return (
    <div className="rounded-xl bg-c-base border border-c-border p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {byCat.map(({ cat, types }) => {
          const m = LOT_CATEGORY_META[cat];
          return (
            <div key={cat}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-sm ${m.bg}`} />
                <span className={`text-2xs font-semibold ${m.text}`}>{m.label}</span>
              </div>
              <div className="text-2xs text-c-dim leading-relaxed">{types.join(', ')}</div>
            </div>
          );
        })}
      </div>
      <div className="pt-3 border-t border-c-border">
        <div className="text-2xs font-semibold uppercase tracking-label text-c-dim mb-1">Not counted</div>
        <div className="text-2xs text-c-dim leading-relaxed">{excluded.join(', ')}</div>
      </div>
    </div>
  );
}

function LotCoverageBar({ row, maxTotal }: { row: WorldCoverage; maxTotal: number }) {
  // Bar width scales with world size so big worlds look bigger. Segments
  // within the bar are proportional to that world's own composition.
  const widthPct = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;
  return (
    <div className="grid grid-cols-[10rem_1fr_4.5rem] items-center gap-3">
      <div className="text-xs font-medium text-c-text truncate" title={row.world}>{row.world}</div>
      <div className="h-5 bg-c-base rounded-md overflow-hidden flex" style={{ width: `${widthPct}%`, minWidth: '8px' }}>
        {LOT_CATEGORIES_ORDERED.map((c) => {
          const count = row.byCategory[c];
          if (count === 0) return null;
          const pct = (count / row.total) * 100;
          const m = LOT_CATEGORY_META[c];
          const rawTypes = [...row.byRawType.entries()]
            .filter(([t]) => LOT_TYPE_CATEGORY[t] === c)
            .map(([t, n]) => `${t} ×${n}`)
            .join(', ');
          return (
            <div
              key={c}
              className={`h-full ${m.bg}`}
              style={{ width: `${pct}%` }}
              title={`${m.label}: ${count} (${rawTypes})`}
            />
          );
        })}
      </div>
      <div className="text-2xs text-c-dim tabular-nums text-right">
        <span className="font-semibold text-c-text">{row.categoriesCovered}</span>
        <span className="text-c-dim">/{LOT_CATEGORIES_ORDERED.length}</span>
        <span className="text-c-dim ml-1.5">· {row.total}</span>
      </div>
    </div>
  );
}

function RawTypeChips({ rawTypes }: { rawTypes: Map<string, number> }) {
  const entries = [...rawTypes.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p className="text-2xs text-c-dim italic">No lots in this world.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([type, count]) => {
        const cat = LOT_TYPE_CATEGORY[type];
        const m = LOT_CATEGORY_META[cat ?? 'other'];
        return (
          <div key={type} className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border ${m.bgSoft} ${m.border} text-2xs`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.bg}`} />
            <span className={`font-medium ${m.text}`}>{type}</span>
            <span className={`tabular-nums font-semibold ${m.text}`}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tabs + hero strip ─────────────────────────────────────────────────────

type DiversityTab = 'population' | 'personality' | 'careers' | 'skills' | 'households' | 'lots';

const TAB_DEFS: { key: DiversityTab; label: string }[] = [
  { key: 'population', label: 'Population' },
  { key: 'personality', label: 'Personality' },
  { key: 'careers', label: 'Work & School' },
  { key: 'skills', label: 'Skills' },
  { key: 'households', label: 'Households' },
  { key: 'lots', label: 'Lots' },
];

// Skills exist only for these lifestages (toddlers have toddler skills; child+
// have the rest). Newborn/infant/pet have no catalogued skills — excluded so
// they don't dilute coverage / age-group stats. Confirmed against real saves.
const SKILL_CAPABLE_LIFESTAGES: ReadonlySet<SimLifestage> = new Set(['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder']);
const SKILL_AGE_GROUPS: SimLifestage[] = ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];

const WORKING_AGE: ReadonlySet<SimLifestage> = new Set(['teen', 'youngAdult', 'adult', 'elder']);
const CAREER_KIND_LABEL: Record<CareerKind, string> = {
  fulltime: 'Career', parttime: 'Part-time', freelance: 'Freelance',
  teen: 'Teen job', club: 'Club', npc: 'NPC', school: 'School',
};

function TabBar({ active, onChange }: { active: DiversityTab; onChange: (t: DiversityTab) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-c-panel border border-c-border overflow-x-auto">
      {TAB_DEFS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer border-none ${
            active === t.key
              ? 'bg-c-secondary text-white shadow-sm'
              : 'bg-transparent text-c-dim hover:text-c-text hover:bg-c-card'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface HeroStat {
  label: string;
  value: React.ReactNode;
  sub?: string;
  iconUrl?: string;          // image icon (trait/aspiration png)
  icon?: PhosphorIcon;       // phosphor icon, rendered in a soft accent circle
  accent?: 'accent' | 'secondary' | 'neutral';
}

function HeroStrip({ stats }: { stats: HeroStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${stats.length >= 3 ? 'lg:grid-cols-3' : ''} gap-3`}>
      {stats.map((s, i) => {
        const dot = s.accent === 'accent' ? 'bg-c-accent' : s.accent === 'secondary' ? 'bg-c-secondary' : 'bg-c-border';
        const iconWrap = s.accent === 'secondary'
          ? 'bg-c-secondary-soft text-c-secondary'
          : 'bg-c-accent-soft text-c-accent';
        const Icon = s.icon;
        return (
          <div key={i} className="rounded-2xl bg-gradient-to-br from-c-card to-c-panel border border-c-border p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-3xs font-bold uppercase tracking-label-lg text-c-dim flex items-center gap-1.5 mb-2">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {s.label}
              </div>
              <div className="text-2xl font-bold text-c-text tracking-display leading-none">{s.value}</div>
              {s.sub && <div className="text-2xs text-c-dim mt-1.5">{s.sub}</div>}
            </div>
            {s.iconUrl ? (
              <img src={s.iconUrl} alt="" className="w-11 h-11 object-contain shrink-0 -mt-1 -mr-1" />
            ) : Icon ? (
              <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${iconWrap}`}>
                <Icon size={20} weight="duotone" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Personality "most gendered" hero — one card holds the top male-skewed and
// top female-skewed pick side by side. Male → green, female → purple, matching
// the planner's gender color rule.
// iconUrl = a pre-resolved icon URL (careers resolve via careerIconUrlById, not
// a folder+instance path). When set it wins over iconFolder/iconInstance.
type GenderedPick = Pick<PickStat, 'name' | 'iconInstance' | 'byGender' | 'observed'> & { iconUrl?: string | null };
function GenderedHeroCard({ label, male, female, iconFolder }: {
  label: string;
  male: GenderedPick | null;
  female: GenderedPick | null;
  iconFolder: 'trait-icons' | 'aspiration-icons' | 'skill-icons';
}) {
  const pct = (p: GenderedPick, g: SimGender) => Math.round((p.byGender[g] / p.observed) * 100);
  const halves = [
    { g: 'male' as const, pick: male, GIcon: GenderMale, tint: 'bg-c-accent-soft', text: 'text-c-accent', word: 'male' },
    { g: 'female' as const, pick: female, GIcon: GenderFemale, tint: 'bg-c-secondary-soft', text: 'text-c-secondary', word: 'female' },
  ];
  return (
    <div className="rounded-2xl bg-gradient-to-br from-c-card to-c-panel border border-c-border p-5">
      <div className="text-3xs font-bold uppercase tracking-label-lg text-c-dim mb-3">{label}</div>
      <div className="grid grid-cols-2 gap-2.5">
        {halves.map(({ g, pick, GIcon, tint, text, word }) => (
          <div key={g} className={`rounded-xl ${tint} p-3`}>
            <div className={`flex items-center gap-1.5 ${text} mb-1.5`}>
              <GIcon size={15} weight="bold" />
              <span className="text-lg font-bold tabular-nums leading-none">{pick ? `${pct(pick, g)}%` : '—'}</span>
              <span className="text-3xs font-semibold uppercase tracking-label opacity-80">{word}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              {(() => {
                const src = pick?.iconUrl ?? (pick?.iconInstance ? `/${iconFolder}/${pick.iconInstance}.png` : null);
                return src ? <img src={src} alt="" className="w-6 h-6 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null;
              })()}
              <span className="text-xs font-semibold text-c-text truncate leading-tight">{pick?.name ?? 'No clear skew'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Venue ranking (Lots tab) ──────────────────────────────────────────────

const VENUE_TOP_N = 8;

function VenueRankingColumn({ title, rows, total }: { title: string; rows: VenueTypeCount[]; total: number }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, VENUE_TOP_N);
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      {rows.length === 0 ? (
        <p className="text-2xs text-c-dim italic">No venues to rank.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map((v) => {
              const m = LOT_CATEGORY_META[v.category];
              const pct = total > 0 ? (v.count / total) * 100 : 0;
              return (
                <div key={v.type} className="flex items-center gap-2.5">
                  <span className="w-28 shrink-0 text-xs text-c-text truncate" title={v.type}>{v.type}</span>
                  <div className="flex-1 h-4 bg-c-base rounded-sm overflow-hidden">
                    <div className={`h-full ${m.bg} rounded-sm`} style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-2xs text-c-dim tabular-nums font-semibold">{v.count}</span>
                </div>
              );
            })}
          </div>
          {rows.length > VENUE_TOP_N && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-3xs text-c-accent hover:underline mt-1.5 bg-transparent border-none cursor-pointer flex items-center gap-1"
            >
              {showAll ? 'Collapse' : `Show all ${rows.length}`}
              <CaretDown size={9} weight="bold" className={showAll ? 'rotate-180' : ''} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function DiversityView({
  sims, households, lots, disabledWorlds = [], relationships = [],
}: {
  sims: Sim[];
  households: Record<string, Household>;
  lots: Record<string, PlannedLot>;
  disabledWorlds?: string[];
  /** Family edges. Absent → households classify on shape alone, as before. */
  relationships?: SimRelationship[];
}) {
  const kin = useMemo(() => buildKinIndex(relationships), [relationships]);
  const [tab, setTab] = useState<DiversityTab>('population');
  const [lifestageFilter, setLifestageFilter] = useState<LifestageFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [worldFilter, setWorldFilter] = useState<WorldFilter>('all');
  const [showCategoryExplainer, setShowCategoryExplainer] = useState(false);

  // Pack ownership predicates. Subscribe to the state slices so memos
  // recompute when packs are toggled mid-session.
  const isPackOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);

  const isTraitVisible = useMemo(
    () => (id: string) => isPackOwned(getTraitPack(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPackOwned, manualOverrides, autoDetected],
  );
  const isAspVisible = useMemo(
    () => (id: string) => isPackOwned(getAspirationPack(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPackOwned, manualOverrides, autoDetected],
  );
  const isLotTypeVisible = useMemo(
    () => (label: string) => isLotTypeOwned(label, isPackOwned),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPackOwned, manualOverrides, autoDetected],
  );
  const isWorldVisible = useMemo(
    () => (worldName: string) => {
      const w = (WORLDS_DATA as Record<string, { release: number }>)[worldName];
      if (!w) return true;
      const packId = RELEASE_TO_PACK[w.release];
      return !packId || isPackOwned(packId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPackOwned, manualOverrides, autoDetected],
  );

  const worldBySim = useMemo(
    () => makeWorldBySim(sims, households, lots),
    [sims, households, lots],
  );

  // Worlds in the filter dropdown: only the ones the user's sims actually
  // live in (so unused worlds don't clutter), only owned-pack ones, and never
  // manually-disabled worlds (EA pre-builds every world with sims, so the
  // disable toggle is the real signal of what the user cares about).
  // Sorted by the planner's canonical world order (WORLDS_SORTED_BY_RELEASE),
  // which keeps base-game worlds in their conventional Newcrest → Oasis
  // Springs → Willow Creek sequence regardless of which world happens to
  // hold the user's first imported sim.
  const allWorlds = useMemo(() => {
    const set = new Set<string>();
    for (const w of worldBySim.values()) if (w && isWorldVisible(w)) set.add(w);
    return WORLDS_SORTED_BY_RELEASE.filter((w) => set.has(w) && !disabledWorlds.includes(w));
  }, [worldBySim, isWorldVisible, disabledWorlds]);

  const allHumans = useMemo(() => humanSims(sims), [sims]);
  const filteredHumans = useMemo(
    () => filterByDemo(allHumans, lifestageFilter, genderFilter, worldFilter, worldBySim),
    [allHumans, lifestageFilter, genderFilter, worldFilter, worldBySim],
  );

  // For Personality: respect the user's lifestage filter if they pick a
  // specific one (even a kid one). Default 'all' still restricts to YA+Adult+Elder.
  const filteredForPersonality = useMemo(() => {
    if (lifestageFilter !== 'all') return filteredHumans;
    return filteredHumans.filter((s) => DEFAULT_PERSONALITY_LIFESTAGES.has(s.lifestage));
  }, [filteredHumans, lifestageFilter]);

  const traitStats = useMemo(
    () => computeTraitStats(filteredForPersonality, isTraitVisible),
    [filteredForPersonality, isTraitVisible],
  );
  const aspirationStats = useMemo(
    () => computeAspirationStats(filteredForPersonality, isAspVisible),
    [filteredForPersonality, isAspVisible],
  );

  const traitsMostUsed = useMemo(
    () => traitStats.filter((t) => t.observed > 0).sort((a, b) => b.observedPercent - a.observedPercent),
    [traitStats],
  );
  const traitsLeastUsed = useMemo(
    () => [...traitStats].sort((a, b) => a.observedPercent - b.observedPercent || b.expectedPercent - a.expectedPercent),
    [traitStats],
  );
  const aspirationsMostUsed = useMemo(
    () => aspirationStats.filter((a) => a.observed > 0).sort((x, y) => y.observedPercent - x.observedPercent),
    [aspirationStats],
  );
  const aspirationsLeastUsed = useMemo(
    () => [...aspirationStats].sort((a, b) => a.observedPercent - b.observedPercent || b.expectedPercent - a.expectedPercent),
    [aspirationStats],
  );

  // ── Skills ── observed game-truth, skill-capable sims only (demo-filtered).
  const skillSims = useMemo(
    () => filteredHumans.filter((s) => SKILL_CAPABLE_LIFESTAGES.has(s.lifestage)),
    [filteredHumans],
  );
  const skillStats = useMemo(() => computeSkillStats(skillSims), [skillSims]);
  const skillsMostUsed = useMemo(
    () => skillStats.filter((s) => s.observed > 0).sort((a, b) => b.observed - a.observed || a.name.localeCompare(b.name)),
    [skillStats],
  );
  const skillsLeastUsed = useMemo(
    () => skillStats.filter((s) => s.observed > 0).sort((a, b) => a.observed - b.observed || a.name.localeCompare(b.name)),
    [skillStats],
  );
  // Hero data: coverage, most-maxed (level 10), rarest present skill, top per age.
  const skillCoverage = useMemo(
    () => ({ present: skillStats.filter((s) => s.observed > 0).length, total: Object.keys(STOCK_SKILLS).length }),
    [skillStats],
  );
  const mostMaxed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of skillSims) for (const sk of s.skills ?? []) if (sk.level >= 10) counts.set(sk.skillId, (counts.get(sk.skillId) ?? 0) + 1);
    let top: { id: string; count: number } | null = null;
    for (const [id, count] of counts) if (!top || count > top.count) top = { id, count };
    return top ? { id: top.id, name: STOCK_SKILLS[top.id] ?? top.id, count: top.count } : null;
  }, [skillSims]);
  const rarestSkill = useMemo(() => {
    const present = skillStats.filter((s) => s.observed > 0);
    return present.length ? present.reduce((a, b) => (b.observed < a.observed ? b : a)) : null;
  }, [skillStats]);
  const skillAgeGroups = useMemo(() => SKILL_AGE_GROUPS.map((ls) => {
    const grp = skillSims.filter((s) => s.lifestage === ls);
    const counts = new Map<string, number>();
    for (const s of grp) for (const id of effectiveSkillIds(s)) counts.set(id, (counts.get(id) ?? 0) + 1);
    let top: { id: string; count: number } | null = null;
    for (const [id, count] of counts) if (!top || count > top.count) top = { id, count };
    return { lifestage: ls, simCount: grp.length, topId: top?.id ?? null, topName: top ? (STOCK_SKILLS[top.id] ?? top.id) : null };
  }).filter((g) => g.simCount > 0), [skillSims]);
  const skillsHero = useMemo<HeroStat[]>(() => {
    const out: HeroStat[] = [
      { label: 'Skill coverage', value: `${skillCoverage.present} / ${skillCoverage.total}`, sub: 'skills represented', icon: Books, accent: 'secondary' },
    ];
    if (mostMaxed) out.push({ label: 'Most maxed', value: mostMaxed.name, sub: `${mostMaxed.count} sim${mostMaxed.count === 1 ? '' : 's'} at level 10`, iconUrl: `/skill-icons/${mostMaxed.id.replace(/^0x/, '')}.png`, accent: 'accent' });
    if (rarestSkill) out.push({ label: 'Rarest skill', value: rarestSkill.name, sub: `${rarestSkill.observed} sim${rarestSkill.observed === 1 ? '' : 's'}`, iconUrl: `/skill-icons/${rarestSkill.iconInstance}.png`, accent: 'neutral' });
    return out;
  }, [skillCoverage, mostMaxed, rarestSkill]);

  // Household membership under the plan: a sim with a planned move is counted
  // in their destination, so household types, sizes and solo counts describe
  // the town once your moves land — a couple you've split reads as two singles.
  const simsByHousehold = useMemo(() => {
    const m = new Map<string, Sim[]>();
    for (const s of sims) {
      const hhId = effectiveHouseholdId(s);
      if (!hhId) continue; // tree-only sims have no household
      const arr = m.get(hhId) ?? [];
      arr.push(s);
      m.set(hhId, arr);
    }
    return m;
  }, [sims]);

  // Households respect the world filter (lifestage/gender filters don't apply
  // to households as a unit — they're heterogeneous by composition).
  const filteredHouseholds = useMemo(() => {
    if (worldFilter === 'all') return Object.values(households);
    return Object.values(households).filter((h) => {
      const lotKey = h.assignedLotKey;
      const lot = lotKey ? lots[lotKey] : undefined;
      const world = lot?.worldName ?? null;
      if (worldFilter === 'unassigned') return world === null;
      return world === worldFilter;
    });
  }, [households, lots, worldFilter]);

  const householdBuckets = useMemo(() => computeHouseholdBuckets(filteredHouseholds, simsByHousehold, kin), [filteredHouseholds, simsByHousehold, kin]);
  const sizeRows = useMemo(() => computeHouseholdSizes(filteredHouseholds, simsByHousehold), [filteredHouseholds, simsByHousehold]);
  // Median household funds — median, not mean: funds are heavily right-skewed
  // (a few rich households), so the median reflects the typical home.
  const medianFunds = useMemo(() => {
    const vals = filteredHouseholds.map(effectiveFunds).filter((m): m is number => m != null).sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  }, [filteredHouseholds]);

  // Pets respect the world filter (a pet is in the same household as a sim;
  // its world is its household's world).
  const filteredPets = useMemo(() => {
    return sims.filter((s) => {
      if (s.species !== 'pet') return false;
      if (worldFilter === 'all') return true;
      const w = worldBySim.get(s.id) ?? null;
      if (worldFilter === 'unassigned') return w === null;
      return w === worldFilter;
    });
  }, [sims, worldFilter, worldBySim]);
  const petBreakdown = useMemo(() => computePetBreakdown(filteredPets), [filteredPets]);

  // Demographics (occult mix + population pyramid) respect all filters.
  const occultBreakdown = useMemo(() => computeOccultBreakdown(filteredHumans), [filteredHumans]);
  const pyramid = useMemo(() => computePyramid(filteredHumans), [filteredHumans]);

  // Careers respect all demo filters.
  const careerStats = useMemo(() => computeCareerStats(filteredHumans), [filteredHumans]);
  // NPC jobs are excluded here (managed from the roster's NPC filter instead).
  const realCareers = useMemo(() => careerStats.filter((c) => c.kind !== 'npc' && c.kind !== 'club'), [careerStats]);

  // Most-gendered career: skew of each career's gender split vs the overall
  // employed gender ratio. Min 3 holders to be meaningful.
  const careerGendered = useMemo(() => {
    let em = 0, ef = 0;
    for (const c of realCareers) { em += c.male; ef += c.female; }
    const expMale = em + ef > 0 ? em / (em + ef) : 0.5;
    let male: GenderedPick | null = null, female: GenderedPick | null = null, mBest = 0, fBest = 0;
    for (const c of realCareers) {
      const total = c.male + c.female;
      if (total < 3) continue;
      const diff = c.male / total - expMale;
      const pick: GenderedPick = { name: c.name, iconInstance: null, iconUrl: careerIconUrlById(c.uid), byGender: { male: c.male, female: c.female }, observed: total };
      if (diff > mBest) { mBest = diff; male = pick; }
      if (-diff > fBest) { fBest = -diff; female = pick; }
    }
    return { male, female };
  }, [realCareers]);

  // Education: currently-enrolled + earned degrees, by subject, gender-split.
  const education = useMemo(() => {
    const enrolled = new Map<string, EduCount>();
    const degrees = new Map<string, EduCount>();
    let enrolledTotal = 0, degreeTotal = 0;
    const uni = { Britechester: 0, Foxbury: 0 };
    for (const s of filteredHumans) {
      if (s.enrolledDegree) {
        enrolledTotal++;
        uni[s.enrolledDegree.school]++;
        const k = s.enrolledDegree.subject;
        const row = enrolled.get(k) ?? { key: k, label: k, count: 0, male: 0, female: 0 };
        row.count++; row[s.gender]++; enrolled.set(k, row);
      }
      for (const d of earnedDegreesFromTraits(s.traitIds)) {
        degreeTotal++;
        const k = d.subject;
        const row = degrees.get(k) ?? { key: k, label: k, count: 0, male: 0, female: 0 };
        row.count++; row[s.gender]++; degrees.set(k, row);
      }
    }
    const sortRows = (m: Map<string, EduCount>) => [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { enrolled: sortRows(enrolled), degrees: sortRows(degrees), enrolledTotal, degreeTotal, uni };
  }, [filteredHumans]);

  // Most-gendered degree subject — same skew logic as careers, over earned
  // degrees. Sparse in most saves, so it only shows when a subject clears the
  // min-holders bar (else the gendered row gracefully drops to one card).
  const degreeGendered = useMemo(() => {
    let em = 0, ef = 0;
    for (const d of education.degrees) { em += d.male; ef += d.female; }
    const expMale = em + ef > 0 ? em / (em + ef) : 0.5;
    let male: GenderedPick | null = null, female: GenderedPick | null = null, mBest = 0, fBest = 0;
    for (const d of education.degrees) {
      const total = d.male + d.female;
      if (total < 3) continue;
      const diff = d.male / total - expMale;
      const pick: GenderedPick = { name: d.label, iconInstance: null, byGender: { male: d.male, female: d.female }, observed: total };
      if (diff > mBest) { mBest = diff; male = pick; }
      if (-diff > fBest) { fBest = -diff; female = pick; }
    }
    return { male, female };
  }, [education]);

  const careersHero = useMemo<HeroStat[]>(() => {
    const workingAge = filteredHumans.filter((s) => WORKING_AGE.has(s.lifestage));
    const employed = workingAge.filter((s) => isEmployed(effectiveCareer(s))).length;
    const pct = workingAge.length > 0 ? Math.round((employed / workingAge.length) * 100) : 0;
    const top = realCareers[0];
    const stats: HeroStat[] = [
      { label: 'Employed', value: `${pct}%`, sub: `${employed} of ${workingAge.length} working-age sims`, accent: 'accent', iconUrl: '/career-icons/career-icon.png' },
    ];
    if (top) stats.push({ label: 'Most common career', value: top.name, sub: `${top.count} sim${top.count === 1 ? '' : 's'}`, accent: 'accent', iconUrl: careerIconUrlById(top.uid) ?? '/career-icons/career-icon.png' });
    // University hero only when the save actually has university activity.
    if (education.enrolledTotal > 0 || education.degreeTotal > 0) {
      stats.push({ label: 'University', value: education.enrolledTotal, sub: `enrolled · ${education.degreeTotal} degree${education.degreeTotal === 1 ? '' : 's'} earned`, accent: 'secondary', iconUrl: '/career-icons/graduated-icon.png' });
    }
    return stats;
  }, [filteredHumans, realCareers, education]);

  // Lot coverage respects the world filter: when a specific world is chosen,
  // the section becomes a single-world detail view. 'unassigned' has no
  // meaning for lots (every lot has a world), so we ignore it.
  const lotCoverageAll = useMemo(
    () => computeLotCoverage(Object.values(lots), isWorldVisible, isLotTypeVisible, disabledWorlds),
    [lots, isWorldVisible, isLotTypeVisible, disabledWorlds],
  );
  const lotCoverageRows = useMemo(() => {
    if (worldFilter === 'all' || worldFilter === 'unassigned') return lotCoverageAll;
    return lotCoverageAll.filter((r) => r.world === worldFilter);
  }, [lotCoverageAll, worldFilter]);
  const lotCoverageMaxTotal = useMemo(
    () => lotCoverageAll.reduce((m, r) => Math.max(m, r.total), 0),
    [lotCoverageAll],
  );
  const lotsModifiedCount = useMemo(
    () => Object.values(lots).filter((l) => l.customType !== l.defaultType).length,
    [lots],
  );
  const mostBalancedWorld = useMemo(
    () => [...lotCoverageAll].sort((a, b) => b.categoriesCovered - a.categoriesCovered || b.total - a.total)[0],
    [lotCoverageAll],
  );
  // Skip tiny worlds — they're lopsided by design (single-theme packs) so
  // surfacing them as "most lopsided" isn't actionable.
  const mostLopsidedWorld = useMemo(
    () => [...lotCoverageAll]
      .filter((r) => r.total >= LOPSIDED_MIN_LOTS)
      .sort((a, b) => a.categoriesCovered - b.categoriesCovered || a.total - b.total)[0],
    [lotCoverageAll],
  );

  // Non-residential lot type ranking (Lots tab). Respects the world filter
  // via lotCoverageRows.
  const venueRanking = useMemo(() => computeVenueRanking(lotCoverageRows), [lotCoverageRows]);
  const venueTotal = useMemo(() => venueRanking.reduce((s, v) => s + v.count, 0), [venueRanking]);
  // Most-common = full ranking (column slices to top N + show-all). Rarest =
  // reversed, minus the always-rare exclusions.
  const venuesMostCommon = venueRanking;
  const venuesRarest = useMemo(
    () => [...venueRanking].reverse().filter((v) => !VENUE_RAREST_EXCLUDE.has(v.type)),
    [venueRanking],
  );

  // Solo-occupant household counts by gender (Households hero).
  const soloCounts = useMemo(
    () => computeSoloCounts(filteredHouseholds, simsByHousehold),
    [filteredHouseholds, simsByHousehold],
  );

  // Gender + lifestage shape for the Population hero. Female → purple,
  // male → green (planner gender color rule).
  const populationHero = useMemo<HeroStat[]>(() => {
    const total = filteredHumans.length;
    if (total === 0) return [];
    const female = filteredHumans.filter((s) => s.gender === 'female').length;
    const male = total - female;
    const fPct = Math.round((female / total) * 100);
    const lsCounts = new Map<SimLifestage, number>();
    for (const s of filteredHumans) lsCounts.set(s.lifestage, (lsCounts.get(s.lifestage) ?? 0) + 1);
    const lsTop = [...lsCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const stats: HeroStat[] = [
      {
        label: 'Gender balance',
        value: (
          <span>
            <span className="text-c-secondary">{fPct}% ♀</span>
            <span className="text-c-faint"> · </span>
            <span className="text-c-accent">{100 - fPct}% ♂</span>
          </span>
        ),
        sub: `${female} female · ${male} male`,
        icon: Users,
        accent: 'secondary',
      },
    ];
    if (lsTop) {
      stats.unshift({ label: 'Population', value: `${total} sims`, sub: `most common: ${LIFESTAGE_LABEL[lsTop[0]]} (${Math.round((lsTop[1] / total) * 100)}%)`, icon: Users, accent: 'accent' });
    }
    return stats;
  }, [filteredHumans]);

  // Personality hero is rendered as two custom GenderedHeroCards (most gendered
  // trait + most gendered aspiration), so we compute the skew extremes here.
  const mostGendered = (stats: PickStat[], dir: SimGender): PickStat | null =>
    stats
      .filter((s) => s.skewDirection === dir && s.observed >= SKEW_MIN_OBSERVED)
      .sort((a, b) => b.skewMagnitude - a.skewMagnitude)[0] ?? null;
  const topMaleTrait = useMemo(() => mostGendered(traitStats, 'male'), [traitStats]);
  const topFemaleTrait = useMemo(() => mostGendered(traitStats, 'female'), [traitStats]);
  const topMaleAsp = useMemo(() => mostGendered(aspirationStats, 'male'), [aspirationStats]);
  const topFemaleAsp = useMemo(() => mostGendered(aspirationStats, 'female'), [aspirationStats]);

  const householdsHero = useMemo<HeroStat[]>(() => {
    const out: HeroStat[] = [];
    const topBucket = householdBuckets[0];
    if (topBucket) out.push({
      label: 'Most common type', value: topBucket.label,
      sub: `${topBucket.count} households · ${Math.round(topBucket.fraction * 100)}% of total`,
      icon: House,
      accent: 'accent',
    });
    out.push({
      label: 'Solo households',
      value: (
        <span>
          <span className="text-c-secondary">{soloCounts.female} ♀</span>
          <span className="text-c-faint"> · </span>
          <span className="text-c-accent">{soloCounts.male} ♂</span>
        </span>
      ),
      sub: 'single-occupant homes by gender',
      icon: User,
      accent: 'secondary',
    });
    if (medianFunds != null) out.push({
      label: 'Median funds',
      value: `§${medianFunds.toLocaleString()}`,
      sub: 'typical household Simoleons',
      icon: Coins,
      accent: 'accent',
    });
    return out;
  }, [householdBuckets, soloCounts, medianFunds]);

  const lotsHero = useMemo<HeroStat[]>(() => {
    const out: HeroStat[] = [];
    if (mostBalancedWorld) out.push({
      label: 'Most balanced world', value: mostBalancedWorld.world,
      sub: `${mostBalancedWorld.categoriesCovered}/${LOT_CATEGORIES_ORDERED.length} categories · ${mostBalancedWorld.total} lots`,
      icon: Scales,
      accent: 'accent',
    });
    const topVenue = venuesMostCommon[0];
    if (topVenue) out.push({
      label: 'Most-used venue', value: topVenue.type,
      sub: `${topVenue.count} lots${venueTotal > 0 ? ` · ${Math.round((topVenue.count / venueTotal) * 100)}% of venues` : ''}`,
      icon: Storefront,
      accent: 'secondary',
    });
    return out;
  }, [mostBalancedWorld, venuesMostCommon, venueTotal]);

  if (allHumans.length === 0) {
    return (
      <div className="bg-c-card border border-c-border rounded-lg p-10 text-center text-c-dim">
        <p className="text-sm">No named sims yet. Import a save or add sims to start auditing.</p>
      </div>
    );
  }

  const showKidNote = lifestageFilter !== 'all' && !DEFAULT_PERSONALITY_LIFESTAGES.has(lifestageFilter);

  const singleWorldView = !(worldFilter === 'all' || worldFilter === 'unassigned');

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 text-2xs flex-wrap py-3 px-4 rounded-lg bg-c-card border border-c-border">
        <span className="text-c-dim uppercase tracking-label font-semibold">Filter</span>
        <Select ariaLabel="Age" value={lifestageFilter} onChange={(v) => setLifestageFilter(v as LifestageFilter)} options={[
          { value: 'all', label: 'All ages' },
          { value: 'newborn', label: 'Newborn' },
          { value: 'infant', label: 'Infant' },
          { value: 'toddler', label: 'Toddler' },
          { value: 'child', label: 'Child' },
          { value: 'teen', label: 'Teen' },
          { value: 'youngAdult', label: 'Young Adult' },
          { value: 'adult', label: 'Adult' },
          { value: 'elder', label: 'Elder' },
        ]} />
        <Select ariaLabel="Gender" value={genderFilter} onChange={(v) => setGenderFilter(v as GenderFilter)} options={[
          { value: 'all', label: 'All genders' },
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
        ]} />
        <Select ariaLabel="World" value={worldFilter} onChange={(v) => setWorldFilter(v as WorldFilter)} options={[
          { value: 'all', label: 'All worlds' },
          { value: 'unassigned', label: 'Unassigned' },
          ...allWorlds.map((w) => ({ value: w, label: w })),
        ]} />
        {(lifestageFilter !== 'all' || genderFilter !== 'all' || worldFilter !== 'all') && (
          <span className="text-c-dim italic">{filteredHumans.length} match</span>
        )}
      </div>

      {/* Tabs */}
      <TabBar active={tab} onChange={setTab} />

      {/* ── Population ── */}
      {tab === 'population' && (
        <div className="space-y-6">
          <HeroStrip stats={populationHero} />
          <SectionPanel>
            <GroupHeader accent="secondary" title="Demographics" subtitle="Who lives here, in numbers." />
            <div className="grid grid-cols-1 md:grid-cols-5 gap-x-10 gap-y-8">
              <div className="md:col-span-3">
                <SubLabel>Population</SubLabel>
                <PopulationPyramid rows={pyramid} />
              </div>
              <div className="md:col-span-2 space-y-5">
                <div>
                  <SubLabel>Occult mix</SubLabel>
                  <OccultChips rows={occultBreakdown} />
                </div>
                <div>
                  <SubLabel>Pets</SubLabel>
                  <PetChips rows={petBreakdown} />
                </div>
              </div>
            </div>
          </SectionPanel>
        </div>
      )}

      {/* ── Personality ── */}
      {tab === 'personality' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GenderedHeroCard label="Most gendered trait" male={topMaleTrait} female={topFemaleTrait} iconFolder="trait-icons" />
            <GenderedHeroCard label="Most gendered aspiration" male={topMaleAsp} female={topFemaleAsp} iconFolder="aspiration-icons" />
          </div>
          <SectionPanel>
            <GroupHeader
              accent="gradient"
              title="Personality"
              subtitle={
                showKidNote
                  ? `${LIFESTAGE_LABEL[lifestageFilter as SimLifestage]} pool is small — counts may look extreme.`
                  : 'Habit clusters in trait + aspiration picks. Bars split female (purple) and male (green).'
              }
            />
            <div className="space-y-10">
              <TopicRow title="Traits" mostUsed={traitsMostUsed} leastUsed={traitsLeastUsed} iconFolder="trait-icons" />
              <TopicRow title="Aspirations" mostUsed={aspirationsMostUsed} leastUsed={aspirationsLeastUsed} iconFolder="aspiration-icons" />
            </div>
          </SectionPanel>
        </div>
      )}

      {/* ── Work & School ── */}
      {tab === 'careers' && (
        <div className="space-y-6">
          <HeroStrip stats={careersHero} />
          {(() => {
            const hasCareer = !!(careerGendered.male || careerGendered.female);
            const hasDegree = !!(degreeGendered.male || degreeGendered.female);
            if (!hasCareer && !hasDegree) return null;
            // Two cards → side by side; one card → full width (never lonely).
            return (
              <div className={hasCareer && hasDegree ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                {hasCareer && <GenderedHeroCard label="Most gendered career" male={careerGendered.male} female={careerGendered.female} iconFolder="trait-icons" />}
                {hasDegree && <GenderedHeroCard label="Most gendered degree" male={degreeGendered.male} female={degreeGendered.female} iconFolder="trait-icons" />}
              </div>
            );
          })()}
          <SectionPanel>
            <GroupHeader
              accent="accent"
              title="Careers"
              subtitle="What your sims do for work. Bars split female (purple) and male (green)."
            />
            <CareerBars rows={realCareers} />
          </SectionPanel>
          {(education.enrolledTotal > 0 || education.degreeTotal > 0) && (
            <SectionPanel>
              <GroupHeader
                accent="secondary"
                title="Education"
                subtitle={`University: ${education.uni.Britechester} at Britechester · ${education.uni.Foxbury} at Foxbury (enrolled).`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                <div>
                  <SubLabel>Enrolled · {education.enrolledTotal}</SubLabel>
                  <EduBars rows={education.enrolled} empty="No sims in university." />
                </div>
                <div>
                  <SubLabel>Degrees earned · {education.degreeTotal}</SubLabel>
                  <EduBars rows={education.degrees} empty="No degrees earned yet." />
                </div>
              </div>
            </SectionPanel>
          )}
        </div>
      )}

      {/* ── Skills ── */}
      {tab === 'skills' && (
        <div className="space-y-6">
          <HeroStrip stats={skillsHero} />
          {skillAgeGroups.length > 0 && (
            <SectionPanel>
              <GroupHeader
                accent="secondary"
                title="Most popular by age"
                subtitle="The skill the most sims of each life stage have built."
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {skillAgeGroups.map((g) => (
                  <div key={g.lifestage} className="rounded-xl bg-c-panel p-3">
                    <div className="text-2xs font-bold uppercase tracking-label text-c-muted mb-1.5">{LIFESTAGE_LABEL[g.lifestage]}</div>
                    {g.topId ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <img src={`/skill-icons/${g.topId.replace(/^0x/, '')}.png`} alt="" className="w-6 h-6 object-contain shrink-0" />
                        <span className="text-xs font-semibold text-c-text truncate leading-tight">{g.topName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-c-faint">No skills yet</span>
                    )}
                  </div>
                ))}
              </div>
            </SectionPanel>
          )}
          <SectionPanel>
            <GroupHeader
              accent="secondary"
              title="Skills"
              subtitle="Which skills your sims have built. Bars split female (purple) and male (green)."
            />
            <TopicRow title="Skills" mostUsed={skillsMostUsed} leastUsed={skillsLeastUsed} iconFolder="skill-icons" />
          </SectionPanel>
        </div>
      )}

      {/* ── Households ── */}
      {tab === 'households' && (
        <div className="space-y-6">
          <HeroStrip stats={householdsHero} />
          <SectionPanel>
            <GroupHeader accent="accent" title="Households" subtitle="How your families are shaped." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
              <div>
                <SubLabel>Types</SubLabel>
                <HouseholdTypeList buckets={householdBuckets} />
              </div>
              <div>
                <SubLabel>Sizes</SubLabel>
                <HouseholdSizeBars rows={sizeRows} />
              </div>
            </div>
          </SectionPanel>
        </div>
      )}

      {/* ── Lots ── */}
      {tab === 'lots' && (
        <div className="space-y-6">
          <HeroStrip stats={lotsHero} />

          {lotCoverageRows.length === 0 ? (
            <SectionPanel>
              <p className="text-sm text-c-dim italic">No lots to audit.</p>
            </SectionPanel>
          ) : (
            <>
              {/* Venue ranking — non-residential types most/least common */}
              <SectionPanel>
                <GroupHeader
                  accent="secondary"
                  title="Venue types"
                  subtitle={singleWorldView ? `Non-residential lots in ${worldFilter}.` : 'Which non-residential lots your save leans on (and the rare ones). Homes excluded.'}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                  <VenueRankingColumn title="Most common" rows={venuesMostCommon} total={venueTotal} />
                  <VenueRankingColumn title="Rarest" rows={venuesRarest} total={venueTotal} />
                </div>
              </SectionPanel>

              {/* Coverage by world */}
              <SectionPanel>
                <GroupHeader
                  accent="accent"
                  title="Lot type coverage"
                  subtitle={
                    singleWorldView
                      ? `Lot mix in ${worldFilter}.`
                      : 'How balanced each world is across residential, apartments, venues, and civic lots.'
                  }
                />
                {!singleWorldView ? (
                  <div className="space-y-4">
                    <p className="text-2xs text-c-dim">
                      <span className="font-semibold text-c-text">{lotsModifiedCount}</span> lots have a type changed from default
                      {mostLopsidedWorld && mostLopsidedWorld !== mostBalancedWorld && (
                        <> · most lopsided world: <span className="font-semibold text-c-text">{mostLopsidedWorld.world}</span></>
                      )}
                    </p>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <SubLabel>Coverage by world</SubLabel>
                        <LotCoverageLegend
                          onToggleExplainer={() => setShowCategoryExplainer((v) => !v)}
                          showingExplainer={showCategoryExplainer}
                        />
                      </div>
                      {showCategoryExplainer && (
                        <div className="mb-4"><CategoryExplainer /></div>
                      )}
                      <div className="space-y-2">
                        {lotCoverageRows.map((row) => (
                          <LotCoverageBar key={row.world} row={row} maxTotal={lotCoverageMaxTotal} />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <SubLabel>Category mix</SubLabel>
                        <LotCoverageLegend
                          onToggleExplainer={() => setShowCategoryExplainer((v) => !v)}
                          showingExplainer={showCategoryExplainer}
                        />
                      </div>
                      {showCategoryExplainer && (
                        <div className="mb-4"><CategoryExplainer /></div>
                      )}
                      <div className="space-y-2">
                        {lotCoverageRows.map((row) => (
                          <LotCoverageBar key={row.world} row={row} maxTotal={lotCoverageRows[0].total} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <SubLabel>Lot types in this world</SubLabel>
                      <RawTypeChips rawTypes={lotCoverageRows[0].byRawType} />
                    </div>
                  </div>
                )}
              </SectionPanel>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The app's own dropdown rather than a native <select>, so these three match
// every other menu in the planner and can scroll a long world list.
function Select<T extends string>({ value, onChange, options, ariaLabel }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <Dropdown
      compact
      value={value}
      onChange={(v) => onChange(v as T)}
      options={options}
      ariaLabel={ariaLabel}
    />
  );
}
