/**
 * Pure re-import diff. Given a snapshot view of the new save and a snapshot
 * view of the current planner state (plus the previously-imported snapshots),
 * produce three buckets per entity type: updates, adds, removes.
 *
 * Conflict detection rule (the whole point of the snapshot column):
 *   - current == next       → no change
 *   - last is unknown       → routine (treat as if last == current; whatever
 *                              game says is the new truth)
 *   - current == last       → user hasn't edited; routine update from game
 *   - next == last          → game hasn't changed (only planner did) — skip
 *   - both diverged         → conflict; user has to decide
 *
 * The diff doesn't apply anything. It just describes what would happen.
 */
import type {
  LotSnapshot, HouseholdSnapshot, SimSnapshot, ClubSnapshot,
  SmallBusinessSnapshot, HolidaySnapshot, DynastySnapshot,
} from '../parser/snapshot';

export type ChangeKind = 'routine' | 'conflict';

export interface FieldChange<T = unknown> {
  field: string;
  current: T;
  next: T;
  last: T | undefined;
  kind: ChangeKind;
}

interface UpdateRecord<S> {
  /** Planner record ID (or planner lot_key for lots). */
  plannerId: string;
  /** Game source_id (hex). For lots this is null when the lot was never imported with a game ID. */
  sourceId: string | null;
  /** Overall kind — 'conflict' if any field is in conflict, else 'routine'. */
  kind: ChangeKind;
  /** Per-field changes; only fields that actually differ between current and next are listed. */
  changes: FieldChange[];
  /**
   * The RAW save snapshot. This is the new BASELINE and nothing else — write it
   * to `last_imported_state` so the next sync's 3-way merge is anchored on what
   * the save actually said.
   *
   * It is NOT what the record's fields should be set to. Writing this over the
   * record is the bug this split exists to prevent: it discards the per-field
   * merge, so any edit you made to a record the game ALSO touched (in some
   * other field) was silently reverted to the save's value.
   */
  nextSnapshot: S;
  /**
   * The per-field MERGED result — what the record's fields should actually be
   * set to. Fields the game moved carry the save's value; fields only YOU moved
   * keep yours. Same shape as `nextSnapshot`, and equal to it whenever you had
   * no edits on this record.
   */
  resolved: S;
}

interface AddRecord<S> {
  sourceId: string;
  /** What the planner would create. Caller uses this both for display and to drive creation. */
  nextSnapshot: S;
}

interface RemoveRecord {
  plannerId: string;
  sourceId: string;
}

export interface EntityDiff<S> {
  updates: UpdateRecord<S>[];
  adds: AddRecord<S>[];
  removes: RemoveRecord[];
}

export interface ReimportDiff {
  lots: EntityDiff<LotSnapshot>;
  households: EntityDiff<HouseholdSnapshot>;
  sims: EntityDiff<SimSnapshot>;
  clubs: EntityDiff<ClubSnapshot>;
  smallBusinesses: EntityDiff<SmallBusinessSnapshot>;
  holidays: EntityDiff<HolidaySnapshot>;
  dynasties: EntityDiff<DynastySnapshot>;
}

// ─── Generic comparison primitive ────────────────────────────────────────────

/** Deep-ish equality for snapshot fields. Snapshots are plain JSON so this is fine. */
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    return true;
  }
  return false;
}

/**
 * Compare a single field. Returns null when current == next (no change), or a
 * FieldChange describing what changed and whether it's a conflict.
 */
function diffField(field: string, current: unknown, last: unknown, next: unknown): FieldChange | null {
  if (eq(current, next)) return null;
  let kind: ChangeKind;
  if (last === undefined) {
    // No baseline → treat as routine; whatever the game says now is the new truth.
    kind = 'routine';
  } else if (eq(current, last)) {
    // Planner hasn't been edited since last import; game changed it.
    kind = 'routine';
  } else if (eq(next, last)) {
    // Game hasn't changed since last import; planner diverged. Not a game-side
    // update — skip (we don't want to undo the user's edit).
    return null;
  } else {
    // Both diverged from baseline. The user has to decide.
    kind = 'conflict';
  }
  return { field, current, last, next, kind };
}

// ─── Per-snapshot diff (works for any snapshot shape) ────────────────────────

/**
 * Compute the field-level changes between current/last/next snapshots of one
 * entity. Returns null when nothing changed; otherwise a fully-populated update.
 *
 * Also builds `resolved`: the per-field merge the apply step must write. It
 * starts from the planner's CURRENT values and takes the save's value only for
 * the fields that actually changed — so a field `diffField` skipped ("you moved
 * it, the game didn't") keeps your edit instead of being overwritten. This
 * mirrors what diffLots has always done; every other entity used to hand the
 * raw save snapshot to the apply and lose the merge on the way.
 *
 * S is constrained to object — the snapshot interfaces from `./parser/snapshot`
 * satisfy this. We cast to a record inside since their keys aren't statically
 * iterable via TypeScript.
 */
function diffSnapshots<S extends object>(
  plannerId: string,
  sourceId: string | null,
  current: S,
  last: S | null,
  next: S,
  ignoreFields?: Set<string>,
): UpdateRecord<S> | null {
  const cur = current as Record<string, unknown>;
  const lst = last as Record<string, unknown> | null;
  const nxt = next as Record<string, unknown>;
  const fields = new Set([...Object.keys(cur), ...Object.keys(nxt)]);
  const changes: FieldChange[] = [];
  const resolved = { ...cur } as Record<string, unknown>;
  for (const f of fields) {
    if (ignoreFields?.has(f)) continue; // e.g. a snapshot field reconciled outside the field diff
    const c = cur[f];
    const l = lst ? lst[f] : undefined;
    const n = nxt[f];
    const fc = diffField(f, c, l, n);
    if (fc) {
      changes.push(fc);
      resolved[f] = n; // the game moved this one → the save wins
    }
  }
  if (changes.length === 0) return null;
  const kind: ChangeKind = changes.some((c) => c.kind === 'conflict') ? 'conflict' : 'routine';
  return { plannerId, sourceId, kind, changes, nextSnapshot: next, resolved: resolved as S };
}

// ─── Per-entity diff driver ──────────────────────────────────────────────────

/**
 * Caller assembles a SourceMap-style view of both sides:
 *   - `nextBySourceId`: source_id (hex) → next snapshot (what the new save would store)
 *   - `plannerBySourceId`: source_id → { plannerId, current snapshot, last snapshot }
 *
 * Hand-created planner records (source_id === null) are EXCLUDED from
 * `plannerBySourceId` by the caller, so they're invisible to the diff.
 */
export function diffEntities<S extends object>(
  nextBySourceId: Map<string, S>,
  plannerBySourceId: Map<string, { plannerId: string; current: S; last: S | null }>,
  ignoreFields?: Set<string>,
): EntityDiff<S> {
  const updates: UpdateRecord<S>[] = [];
  const adds: AddRecord<S>[] = [];
  const removes: RemoveRecord[] = [];

  // Updates + Adds — iterate the new save
  for (const [sourceId, next] of nextBySourceId) {
    const planner = plannerBySourceId.get(sourceId);
    if (planner) {
      const upd = diffSnapshots(planner.plannerId, sourceId, planner.current, planner.last, next, ignoreFields);
      if (upd) updates.push(upd);
    } else {
      adds.push({ sourceId, nextSnapshot: next });
    }
  }

  // Removes — iterate the planner side
  for (const [sourceId, planner] of plannerBySourceId) {
    if (!nextBySourceId.has(sourceId)) {
      removes.push({ plannerId: planner.plannerId, sourceId });
    }
  }

  return { updates, adds, removes };
}

// ─── Lot diff (3-way plan-vs-save-vs-baseline rule, keyed by lot_key) ─────────

const LOT_FIELDS = ['customName', 'customType'] as const;

/**
 * Lots are seeded for every save so there are no adds or removes — only field
 * updates on customName / customType, keyed by planner `lot_key`.
 *
 * Each field is a per-field 3-way merge against a `baseline` — the value the
 * save last reported for this lot. The caller resolves the baseline: the stored
 * last-imported value, or the lot's seed default when none has been recorded
 * (see readLotBaseline / the `lastSaved ?? seed` fallback at the call sites):
 *
 *   - current == next                 → no change
 *   - current != baseline AND
 *       next == baseline              → keep the planner edit (you changed it,
 *                                        the save didn't)
 *   - otherwise                       → the save value wins
 *
 * Anchoring on the save's real prior value — not the immutable seed default —
 * is what lets a planner edit survive on a lot the game reports as a custom type
 * (e.g. a Restaurant), which the older seed-anchored rule silently reverted.
 * Falling back to the seed default when there's no baseline makes an unrecorded
 * lot behave exactly like that older rule, so introducing the baseline can't
 * reopen the silent-revert bug it was created to fix. The rule is per-field, so
 * a planner-named lot whose game *type* changed keeps the name while adopting the
 * type. The apply writes `resolved`; `nextSnapshot` is the raw save value and is
 * only ever the new baseline.
 */
export function diffLots(
  nextByLotKey: Map<string, LotSnapshot>,
  plannerByLotKey: Map<string, { current: LotSnapshot; baseline: LotSnapshot }>,
): EntityDiff<LotSnapshot> {
  const updates: UpdateRecord<LotSnapshot>[] = [];
  for (const [lotKey, next] of nextByLotKey) {
    const planner = plannerByLotKey.get(lotKey);
    if (!planner) continue; // shouldn't happen — every save has every lot seeded
    const { current, baseline } = planner;
    const resolved: LotSnapshot = { ...current };
    const changes: FieldChange[] = [];
    for (const field of LOT_FIELDS) {
      const cur = current[field];
      const nxt = next[field];
      const base = baseline[field];
      if (eq(cur, nxt)) continue;                    // planner already matches the save
      if (!eq(cur, base) && eq(nxt, base)) continue; // you edited it, the save didn't → keep planner
      resolved[field] = nxt;                         // otherwise the save wins
      changes.push({ field, current: cur, last: base, next: nxt, kind: 'routine' });
    }
    if (changes.length === 0) continue;
    updates.push({ plannerId: lotKey, sourceId: null, kind: 'routine', changes, nextSnapshot: next, resolved });
  }
  return { updates, adds: [], removes: [] };
}

// ─── Small-business lot set reconciliation (plan-vs-save, per business) ───────

/**
 * Reconcile a business's lot set on re-sync, honouring the coherence principle
 * "an achievable plan persists; only the game overriding it wins."
 *
 *   - lot the GAME added since last sync (in gameNext, not in gameLast) → adopt
 *   - lot the GAME removed since last sync (in gameLast, not in gameNext) → drop
 *   - lot only YOU added (in planner, never game truth)                 → keep
 *
 * Baseline-driven (gameLast), so a relocation the game performs (X→Y) drops X
 * and adds Y, while a lot you planned onto that the game never had survives. The
 * caller MUST refresh the stored baseline to gameNext every sync — a stale
 * baseline breaks removal detection.
 */
export function reconcileBusinessLots(
  planner: string[],
  gameNext: string[],
  gameLast: string[],
): { result: string[]; added: string[]; removed: string[] } {
  const lastSet = new Set(gameLast);
  const nextSet = new Set(gameNext);
  // Game dropped these since last sync — remove from the planner.
  const removed = planner.filter((k) => lastSet.has(k) && !nextSet.has(k));
  const removedSet = new Set(removed);
  const kept = planner.filter((k) => !removedSet.has(k));
  // Game newly has these — add any the planner doesn't already carry.
  const keptSet = new Set(kept);
  const added = gameNext.filter((k) => !lastSet.has(k) && !keptSet.has(k));
  return { result: [...kept, ...added], added, removed };
}
