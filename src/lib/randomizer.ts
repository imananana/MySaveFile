/**
 * Pure household randomizer. Given a preset + options, returns a preview
 * household with rolled sims (name, gender, lifestage, traits, aspiration).
 * No DB writes, no API calls — the /randomizer UI commits the result later.
 *
 * Design contract (locked with user during Phase 3 planning):
 *   - Trait counts: 1 (infant/toddler/child), 2 (teen), 3 (YA/adult/elder).
 *   - Aspiration: always assigned when the lifestage has eligible options.
 *     Toddlers/infants get null (no toddler aspirations in our catalog yet).
 *   - Gender: 50/50 per sim by default. CoupleType ('mixed' / 'sameSex' /
 *     'random') only constrains adult *pairs* in presets that have one.
 *   - Kid ages: uniform across infant/toddler/child/teen except when all
 *     adults in the household are YoungAdult — then kids cap at child.
 *   - Surnames: shared per preset rule (see SHARES_SURNAME below). Couple
 *     preset is a 50/50 coin flip. Custom uses an explicit toggle.
 *   - Trait conflicts: ignored (user fixes in CAS post-roll).
 *   - Pets: not in scope (composition counts only when saved to planner).
 *   - Family bonds: NOT authored. A rolled household is a set of sims sharing
 *     an address and (usually) a surname; nothing in the planner records who is
 *     married to or descended from whom. The family tree is the archive of what
 *     the SAVE remembers, and inventing bonds would put people the game has
 *     never heard of into it.
 */
import {
  FEMALE_FIRST_NAMES,
  MALE_FIRST_NAMES,
  LAST_NAMES,
} from '../data/stockNames';
import { traitsForLifestage } from '../data/stockTraits';
import { aspirationsForLifestage } from '../data/stockAspirations';
import type { ParsedGender, ParsedLifestage } from './parser/types';

/**
 * Family role a rolled sim plays in its household. Roles shape the composition
 * and drive gender pairing (a couple-type setting applies to the pair, not to
 * everyone), but they are never persisted: the household that gets saved is a
 * roster, not a family graph. Roles, not lifestages, define the structure —
 * `parentA` is a young-adult OR adult; what matters is the generational layer
 * it sits in.
 *   elderA/elderB — the grandparent couple
 *   parentA       — central adult: an elders' blood child AND (if kids) their parent
 *   parentB       — parentA's married-in spouse/partner (NOT an elders' child)
 *   auntUncle     — another elders' blood child (parentA's sibling), childless
 *   partnerA/B    — a standalone couple (no elders, no kids)
 *   sibling       — siblings with no parent present (the Sibling preset)
 *   kid           — child of the present parent(s)
 *   roommate/solo — nobody's relation, and nothing constrains their age
 *   custom        — a slot you asked for by name. Its lifestage is the thing
 *                   you chose, so a per-sim reroll must never move it.
 */
export type Role =
  | 'solo' | 'partnerA' | 'partnerB' | 'sibling'
  | 'parentA' | 'parentB' | 'auntUncle' | 'kid'
  | 'elderA' | 'elderB' | 'roommate' | 'custom';

export type PresetKey =
  | 'solo'
  | 'couple'
  | 'sibling'
  | 'nuclear'
  | 'singleParent'
  | 'multiGen'
  | 'adultChildWithParent'
  | 'roommates'
  | 'emptyNesters'
  | 'surpriseMe'
  | 'custom';

export type CoupleType = 'random' | 'mixed' | 'sameSex';

export interface CustomComposition {
  infant?: number;
  toddler?: number;
  child?: number;
  teen?: number;
  youngAdult?: number;
  adult?: number;
  elder?: number;
}

export interface RollOptions {
  preset: PresetKey;
  coupleType?: CoupleType; // applies to couple / nuclear / multiGen; default 'random'
  custom?: {
    composition: CustomComposition;
    shareSurname: boolean;
  };
  /** Pack-ownership predicate. If supplied, trait + aspiration pools are
   *  filtered to only what the user owns. Caller wires this from the
   *  usePackOwnership store + packAssignments getters. Optional so callers
   *  outside the planner (tests, scripts) can roll without packs context. */
  isPackOwned?: (packId: string) => boolean;
  /** Pack ID lookups for the predicate above. Match the helpers in
   *  data/packAssignments.ts. */
  getTraitPack?: (traitId: string) => string;
  getAspirationPack?: (aspId: string) => string;
}

export interface RolledSim {
  id: string; // local-only uuid (replaced by DB id on commit)
  firstName: string;
  lastName: string;
  gender: ParsedGender;
  lifestage: ParsedLifestage;
  traitIds: string[]; // hex IDs into STOCK_TRAITS
  aspirationId: string | null; // hex ID into STOCK_ASPIRATIONS
  role: Role; // family role — drives relationship derivation at commit
}

export interface RolledHousehold {
  id: string;
  name: string; // "The Smith family" if surname is shared, else "Smith & Jones household", etc.
  preset: PresetKey;
  resolvedPreset: PresetKey; // surpriseMe expands into one of the concrete presets — record it
  sims: RolledSim[];
}

// --- Constants ----------------------------------------------------------------

const TRAIT_COUNTS: Partial<Record<ParsedLifestage, number>> = {
  infant: 1,
  toddler: 1,
  child: 1,
  teen: 2,
  youngAdult: 3,
  adult: 3,
  elder: 3,
};

// Kid lifestages used by family presets.
const KID_LIFESTAGES: ReadonlyArray<ParsedLifestage> = [
  'infant',
  'toddler',
  'child',
  'teen',
];

// Presets that randomly explode into a different preset under "Surprise me".
const SURPRISE_POOL: PresetKey[] = [
  'solo',
  'couple',
  'sibling',
  'nuclear',
  'singleParent',
  'multiGen',
  'adultChildWithParent',
  'roommates',
  'emptyNesters',
];

// Per the locked spec: which presets share a household surname.
//   true  → one shared surname
//   false → independent surnames
//   'coinflip' → 50/50 per roll
function sharesSurname(preset: PresetKey, custom?: RollOptions['custom']): boolean {
  switch (preset) {
    case 'solo':
    case 'roommates':
      return false;
    case 'couple':
      return Math.random() < 0.5;
    case 'sibling':
    case 'nuclear':
    case 'singleParent':
    case 'multiGen':
    case 'adultChildWithParent':
    case 'emptyNesters':
      return true;
    case 'custom':
      return custom?.shareSurname ?? true;
    case 'surpriseMe':
      // Resolved before this is called.
      return true;
  }
}

// Subset of "adult-tier" lifestages that can be parents.
const PARENT_AGES: ReadonlyArray<ParsedLifestage> = ['youngAdult', 'adult'];

// --- Random helpers -----------------------------------------------------------

function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(pairs: ReadonlyArray<readonly [T, number]>): T {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of pairs) {
    r -= weight;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function pickN<T>(arr: ReadonlyArray<T>, n: number): T[] {
  if (n >= arr.length) return [...arr];
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n) {
    const i = Math.floor(Math.random() * arr.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i]);
  }
  return out;
}

function randInt(lo: number, hi: number): number {
  // inclusive both ends
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function uuid(): string {
  // crypto.randomUUID exists in modern browsers and Node 19+. Fallback for
  // unusual environments; collisions don't matter (these are preview-only).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'r-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// --- Composition rolls --------------------------------------------------------

interface Slot {
  lifestage: ParsedLifestage;
  /** Roles let us apply couple-type pairing + derive relationships at commit. */
  role: Role;
}

function rollComposition(preset: PresetKey, custom?: CustomComposition): Slot[] {
  switch (preset) {
    case 'solo': {
      // Slight bias away from elder so Solo doesn't feel elder-heavy
      // (Empty Nesters is the dedicated preset for explicit elder solos too).
      const lifestage = pickWeighted<ParsedLifestage>([
        ['youngAdult', 40],
        ['adult', 40],
        ['elder', 20],
      ]);
      return [{ lifestage, role: 'solo' }];
    }
    case 'couple': {
      // Couples are YA or adult only. Empty Nesters is the dedicated preset
      // for elder couples — letting them roll here too made them feel
      // overrepresented.
      const adultAges: ParsedLifestage[] = ['youngAdult', 'adult'];
      return [
        { lifestage: pick(adultAges), role: 'partnerA' },
        { lifestage: pick(adultAges), role: 'partnerB' },
      ];
    }
    case 'sibling': {
      const count = randInt(2, 3);
      return Array.from({ length: count }, () => ({
        lifestage: 'youngAdult' as ParsedLifestage,
        role: 'sibling' as const,
      }));
    }
    case 'nuclear': {
      // 2 parents (YA/adult only — multi-gen is the path for elder parents).
      // 1–6 kids, capped so total ≤ 8.
      const kidCount = randInt(1, 6);
      const parents: Slot[] = [
        { lifestage: pick(PARENT_AGES), role: 'parentA' },
        { lifestage: pick(PARENT_AGES), role: 'parentB' },
      ];
      const kids = rollKidSlots(kidCount, parents);
      return [...parents, ...kids];
    }
    case 'singleParent': {
      // 1 parent + 1–7 kids, total ≤ 8.
      const kidCount = randInt(1, 7);
      const parents: Slot[] = [
        { lifestage: pick(PARENT_AGES), role: 'parentA' },
      ];
      const kids = rollKidSlots(kidCount, parents);
      return [...parents, ...kids];
    }
    case 'multiGen': {
      // Three generations under one roof. Roll a believable STRUCTURE rather
      // than a flat slot bag — each shape assigns roles the relationship
      // deriver reads unambiguously. Total ≤ 8.
      const elderCount = randInt(1, 2);
      const elders: Slot[] = Array.from({ length: elderCount }, (_, i) => ({
        lifestage: 'elder' as ParsedLifestage,
        role: (i === 0 ? 'elderA' : 'elderB') as Role,
      }));
      const shape = pick(['married', 'single', 'siblings'] as const);
      if (shape === 'married') {
        // S1: elders → their married/partnered child + in-law → 1–4 kids.
        const child: Slot = { lifestage: pick(PARENT_AGES), role: 'parentA' };
        const inLaw: Slot = { lifestage: pick(PARENT_AGES), role: 'parentB' };
        const kidCount = randInt(1, Math.min(4, 8 - elderCount - 2));
        return [...elders, child, inLaw, ...rollKidSlots(kidCount, [child, inLaw])];
      }
      if (shape === 'single') {
        // S2: elders → their single-parent child → 1–4 kids.
        const child: Slot = { lifestage: pick(PARENT_AGES), role: 'parentA' };
        const kidCount = randInt(1, Math.min(4, 8 - elderCount - 1));
        return [...elders, child, ...rollKidSlots(kidCount, [child])];
      }
      // S3: elders → two adult siblings; one of them has 1–4 kids, the other
      // is the childless aunt/uncle.
      const child: Slot = { lifestage: pick(PARENT_AGES), role: 'parentA' };
      const sibling: Slot = { lifestage: pick(PARENT_AGES), role: 'auntUncle' };
      const maxKids = Math.min(4, 8 - elderCount - 2);
      const kidCount = maxKids > 0 ? randInt(1, maxKids) : 0;
      return [...elders, child, sibling, ...rollKidSlots(kidCount, [child])];
    }
    case 'roommates': {
      // Roommates skew young — matches the IRL stereotype of unrelated
      // adults sharing a household. Elder roommates possible but rare.
      const count = randInt(2, 8);
      return Array.from({ length: count }, () => ({
        lifestage: pickWeighted<ParsedLifestage>([
          ['youngAdult', 50],
          ['adult', 40],
          ['elder', 10],
        ]),
        role: 'roommate' as const,
      }));
    }
    case 'emptyNesters': {
      const count = randInt(1, 2);
      return Array.from({ length: count }, (_, i) => ({
        lifestage: 'elder' as ParsedLifestage,
        role: (i === 0 ? 'elderA' : 'elderB') as Role,
      }));
    }
    case 'adultChildWithParent': {
      // "Adult child still lives with parents" / "caring for elder parents."
      // 1–2 elders + their ONE single adult child (no in-law, no grandkids) —
      // that's the mental image of the button. Adult child is YA-biased.
      const elderCount = randInt(1, 2);
      const elders: Slot[] = Array.from({ length: elderCount }, (_, i) => ({
        lifestage: 'elder' as ParsedLifestage,
        role: (i === 0 ? 'elderA' : 'elderB') as Role,
      }));
      const child: Slot = {
        lifestage: pickWeighted<ParsedLifestage>([
          ['youngAdult', 65],
          ['adult', 35],
        ]),
        role: 'parentA',
      };
      return [...elders, child];
    }
    case 'custom': {
      if (!custom) return [];
      const slots: Slot[] = [];
      (Object.keys(custom) as ParsedLifestage[]).forEach((age) => {
        const n = custom[age as keyof CustomComposition] ?? 0;
        for (let i = 0; i < n; i++) {
          slots.push({ lifestage: age, role: 'custom' });
        }
      });
      return slots;
    }
    case 'surpriseMe':
      // Resolved upstream; should never reach here.
      return [];
  }
}

function rollKidSlots(count: number, adults: Slot[]): Slot[] {
  // YA-only households cap kids at child (no teens) per locked spec.
  const allYa = adults.every((s) => s.lifestage === 'youngAdult');
  const allowed: ParsedLifestage[] = allYa
    ? ['infant', 'toddler', 'child']
    : [...KID_LIFESTAGES];
  return Array.from({ length: count }, () => ({
    lifestage: pick(allowed),
    role: 'kid' as const,
  }));
}

// --- Gender assignment --------------------------------------------------------

function assignGenders(slots: Slot[], coupleType: CoupleType): ParsedGender[] {
  const genders: ParsedGender[] = slots.map(() => randomGender());

  // Apply couple-type pairing to the (partnerA, partnerB) or (parentA, parentB)
  // pair if present.
  const aIdx = slots.findIndex((s) => s.role === 'partnerA' || s.role === 'parentA');
  const bIdx = slots.findIndex((s) => s.role === 'partnerB' || s.role === 'parentB');
  if (aIdx >= 0 && bIdx >= 0) {
    const [a, b] = pickPairGenders(coupleType);
    genders[aIdx] = a;
    genders[bIdx] = b;
  }

  // multi-gen: if there's an elder pair, apply coupleType to them too.
  const eaIdx = slots.findIndex((s) => s.role === 'elderA');
  const ebIdx = slots.findIndex((s) => s.role === 'elderB');
  if (eaIdx >= 0 && ebIdx >= 0) {
    const [a, b] = pickPairGenders(coupleType);
    genders[eaIdx] = a;
    genders[ebIdx] = b;
  }

  return genders;
}

function pickPairGenders(coupleType: CoupleType): [ParsedGender, ParsedGender] {
  switch (coupleType) {
    case 'mixed':
      // One male one female, random which is which.
      return Math.random() < 0.5 ? ['male', 'female'] : ['female', 'male'];
    case 'sameSex': {
      const g: ParsedGender = randomGender();
      return [g, g];
    }
    case 'random':
    default:
      return [randomGender(), randomGender()];
  }
}

function randomGender(): ParsedGender {
  return Math.random() < 0.5 ? 'male' : 'female';
}

// --- Surnames -----------------------------------------------------------------

function assignSurnames(slots: Slot[], share: boolean): string[] {
  if (share) {
    const shared = pick(LAST_NAMES);
    return slots.map(() => shared);
  }
  return slots.map(() => pick(LAST_NAMES));
}

// --- First names + per-sim attributes -----------------------------------------

function rollFirstName(gender: ParsedGender): string {
  return gender === 'female' ? pick(FEMALE_FIRST_NAMES) : pick(MALE_FIRST_NAMES);
}

function rollTraits(lifestage: ParsedLifestage, opts?: Pick<RollOptions, 'isPackOwned' | 'getTraitPack'>): string[] {
  const count = TRAIT_COUNTS[lifestage] ?? 0;
  if (count === 0) return [];
  let pool = traitsForLifestage(lifestage);
  if (opts?.isPackOwned && opts?.getTraitPack) {
    pool = pool.filter((t) => opts.isPackOwned!(opts.getTraitPack!(t.id)));
  }
  if (pool.length === 0) return [];
  const picks = pickN(pool, count);
  return picks.map((t) => t.id);
}

function rollAspiration(lifestage: ParsedLifestage, opts?: Pick<RollOptions, 'isPackOwned' | 'getAspirationPack'>): string | null {
  let pool = aspirationsForLifestage(lifestage);
  if (opts?.isPackOwned && opts?.getAspirationPack) {
    pool = pool.filter((a) => opts.isPackOwned!(opts.getAspirationPack!(a.id)));
  }
  if (pool.length === 0) return null;
  return pick(pool).id;
}

// --- Public API ---------------------------------------------------------------

export function rollHousehold(opts: RollOptions): RolledHousehold {
  const resolvedPreset: PresetKey =
    opts.preset === 'surpriseMe' ? pick(SURPRISE_POOL) : opts.preset;

  const coupleType = opts.coupleType ?? 'random';

  const slots = rollComposition(resolvedPreset, opts.custom?.composition);
  const genders = assignGenders(slots, coupleType);
  const surnames = assignSurnames(
    slots,
    sharesSurname(resolvedPreset, opts.custom),
  );

  const sims: RolledSim[] = slots.map((slot, i) => ({
    id: uuid(),
    firstName: rollFirstName(genders[i]),
    lastName: surnames[i],
    gender: genders[i],
    lifestage: slot.lifestage,
    traitIds: rollTraits(slot.lifestage, opts),
    aspirationId: rollAspiration(slot.lifestage, opts),
    role: slot.role,
  }));

  const householdName = buildHouseholdName(sims);

  return {
    id: uuid(),
    name: householdName,
    preset: opts.preset,
    resolvedPreset,
    sims,
  };
}

/** Pack-ownership context passed through to the reroll helpers so they
 *  only draw from packs the user owns. Optional — without it, the full
 *  catalog is in play. */
export type PackContext = Pick<RollOptions, 'isPackOwned' | 'getTraitPack' | 'getAspirationPack'>;

/** The household a sim is being rerolled inside. Without it a reroll can only
 *  safely change the things that belong to the sim alone. */
export interface RerollContext {
  /** Everyone currently in the household, this sim included. */
  sims: RolledSim[];
  coupleType: CoupleType;
}

/** The two halves of each pairing the couple-type setting governs. */
const PAIRED_WITH: Partial<Record<Role, Role>> = {
  partnerA: 'partnerB', partnerB: 'partnerA',
  parentA: 'parentB', parentB: 'parentA',
  elderA: 'elderB', elderB: 'elderA',
};

/**
 * Is this sim half of a couple whose genders the user pinned? Rerolling one of
 * them would silently break the Mixed / Same-sex choice. Only a pairing whose
 * OTHER half is actually present counts — a single parent's `parentA` and a
 * lone `elderA` constrain nothing.
 */
function genderIsPinned(sim: RolledSim, hh?: RerollContext): boolean {
  if (!hh || hh.coupleType === 'random') return false;
  const other = PAIRED_WITH[sim.role];
  return !!other && hh.sims.some((s) => s.role === other);
}

/**
 * The lifestages a role may reroll into and how they're weighted — the same
 * odds the first roll used, so rerolling doesn't quietly flatten a preset's
 * skew. Null when the age is the whole point of the role and must not move:
 * elders are elders, the Sibling preset is young adults, and a Custom slot is
 * the count you asked for.
 */
type AgeOdds = ReadonlyArray<readonly [ParsedLifestage, number]>;
const EVEN = (ages: ReadonlyArray<ParsedLifestage>): AgeOdds => ages.map((a) => [a, 1] as const);

function rerollAges(sim: RolledSim, hh?: RerollContext): AgeOdds | null {
  switch (sim.role) {
    case 'solo':
      return [['youngAdult', 40], ['adult', 40], ['elder', 20]];
    case 'roommate':
      return [['youngAdult', 50], ['adult', 40], ['elder', 10]];
    case 'partnerA': case 'partnerB':
    case 'parentA': case 'parentB': case 'auntUncle':
      return EVEN(PARENT_AGES);
    case 'kid': {
      // Mirrors rollKidSlots: a household whose adults are all young adults
      // keeps its children below teen.
      const adults = (hh?.sims ?? []).filter((s) => s.role === 'parentA' || s.role === 'parentB');
      const allYa = adults.length > 0 && adults.every((s) => s.lifestage === 'youngAdult');
      return EVEN(allYa ? ['infant', 'toddler', 'child'] : KID_LIFESTAGES);
    }
    case 'sibling': case 'elderA': case 'elderB': case 'custom':
      return null;
  }
}

/**
 * A household that shares one surname keeps it — that name IS the household's
 * identity and its title is built from it. Where surnames are independent
 * (solo, roommates, a couple whose coin flip came up separate) a reroll is a
 * different person and takes a different name. Derived from the household as it
 * stands rather than stored, so it stays right after members are removed.
 */
function rerollSurname(sim: RolledSim, hh?: RerollContext): string {
  const others = (hh?.sims ?? []).filter((s) => s.id !== sim.id);
  const shared = others.length > 0 && others.every((s) => s.lastName === sim.lastName);
  return shared ? sim.lastName : pick(LAST_NAMES);
}

/**
 * Reroll a single sim into a different person — as different as the household
 * shape allows. A solo sim or a roommate changes everything; a kid stays a kid
 * but changes age; an elder stays an elder; half of a Mixed or Same-sex couple
 * keeps the gender that setting requires; a Custom slot keeps the age you asked
 * for. Without a RerollContext only the sim's own fields move, which is the
 * conservative reading.
 */
export function rerollSim(sim: RolledSim, ctx?: PackContext, hh?: RerollContext): RolledSim {
  const gender = genderIsPinned(sim, hh) ? sim.gender : randomGender();
  const ages = rerollAges(sim, hh);
  const lifestage = ages && ages.length > 0 ? pickWeighted(ages) : sim.lifestage;
  return {
    ...sim,
    gender,
    lifestage,
    firstName: rollFirstName(gender),
    lastName: rerollSurname(sim, hh),
    traitIds: rollTraits(lifestage, ctx),
    aspirationId: rollAspiration(lifestage, ctx),
  };
}

/** Reroll all of a sim's traits at once. */
export function rerollTraits(sim: RolledSim, ctx?: PackContext): RolledSim {
  return { ...sim, traitIds: rollTraits(sim.lifestage, ctx) };
}

/** Reroll a single trait slot, leaving the others alone. */
export function rerollSingleTrait(sim: RolledSim, slotIdx: number, ctx?: PackContext): RolledSim {
  let pool = traitsForLifestage(sim.lifestage);
  if (ctx?.isPackOwned && ctx?.getTraitPack) {
    pool = pool.filter((t) => ctx.isPackOwned!(ctx.getTraitPack!(t.id)));
  }
  if (pool.length === 0) return sim;
  // Avoid re-rolling into something the sim already has (so the swap is
  // visible). If pool is too small to dodge collisions, just allow it.
  const owned = new Set(sim.traitIds);
  owned.delete(sim.traitIds[slotIdx]);
  const eligible = pool.filter((t) => !owned.has(t.id));
  const chosen = eligible.length > 0 ? pick(eligible) : pick(pool);
  const next = [...sim.traitIds];
  next[slotIdx] = chosen.id;
  return { ...sim, traitIds: next };
}

/** Reroll just the aspiration. */
export function rerollAspiration(sim: RolledSim, ctx?: PackContext): RolledSim {
  return { ...sim, aspirationId: rollAspiration(sim.lifestage, ctx) };
}

// --- Per-field roll helpers (for the CAS creation modal: roll-or-pick each
//     field independently, reusing the same name/trait/aspiration pools). ------
export function rollFirstNameFor(gender: ParsedGender): string { return rollFirstName(gender); }
export function rollLastNameOnce(): string { return pick(LAST_NAMES); }
export function rollGenderOnce(): ParsedGender { return Math.random() < 0.5 ? 'male' : 'female'; }
export function rollTraitsFor(lifestage: ParsedLifestage, ctx?: PackContext): string[] { return rollTraits(lifestage, ctx); }
export function rollAspirationFor(lifestage: ParsedLifestage, ctx?: PackContext): string | null { return rollAspiration(lifestage, ctx); }

// --- Naming -------------------------------------------------------------------

export function buildHouseholdName(sims: RolledSim[]): string {
  if (sims.length === 0) return 'Empty household';
  const surnames = [...new Set(sims.map((s) => s.lastName))];
  if (surnames.length === 1) return `The ${surnames[0]} family`;
  if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]} household`;
  return `${surnames[0]} household`;
}
