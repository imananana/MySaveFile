/**
 * Lot name → planner-key matching.
 *
 * The .save file stores each lot's user-facing name (e.g. "Pancake House") but
 * the planner indexes lots by stable `worldName::lotName` keys. We resolve the
 * mapping using two signals, in order of preference:
 *
 *   1. `field5` — a stable EA canonical lot ID that survives across saves and
 *      packs. Matched via `LOT_FIELD5_MAP`. Most reliable.
 *   2. Lot name — fuzzy-normalized (lowercase, smart quotes flattened, EA
 *      unit-number prefixes stripped). Fallback when field5 is missing OR
 *      when field5 disagrees with the name in the same world (multi-unit
 *      apartments — field5 points at the building, the name distinguishes
 *      the unit).
 */
import { WORLDS_DATA, getBuildingName } from '../../data/worlds';
import { LOT_FIELD5_MAP } from '../../data/lotField5Map';

export function normalizeLotName(s: string): string {
  return s
    .toLowerCase().trim()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/<[^>]+>/g, '');
}

export const LOT_NAME_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [world, { lots }] of Object.entries(WORLDS_DATA)) {
    for (const lot of lots as unknown as Array<{ name: string }>) {
      const plannerKey = `${world}::${lot.name}`;
      const full    = normalizeLotName(lot.name);
      const noNum   = full.replace(/^\d+\s+/, '');
      const norm    = full.replace(/\s+/g, '');
      const normNum = noNum.replace(/\s+/g, '');
      m.set(full, plannerKey);
      if (!m.has(noNum))   m.set(noNum, plannerKey);
      if (!m.has(norm))    m.set(norm, plannerKey);
      if (!m.has(normNum)) m.set(normNum, plannerKey);
    }
  }
  return m;
})();

export const LOT_DEFAULTS: Map<string, { name: string; type: string }> = (() => {
  const m = new Map<string, { name: string; type: string }>();
  for (const [world, { lots }] of Object.entries(WORLDS_DATA)) {
    for (const lot of lots as unknown as Array<{ name: string; type: string }>) {
      m.set(`${world}::${lot.name}`, { name: lot.name, type: lot.type });
    }
  }
  return m;
})();

function matchLotName(gameLotName: string): string | null {
  const lower  = normalizeLotName(gameLotName);
  const noNum  = lower.replace(/^\d+\s+/, '');
  const norm   = lower.replace(/\s+/g, '');
  const normNum = noNum.replace(/\s+/g, '');
  for (const key of [lower, norm, noNum, normNum]) {
    if (LOT_NAME_INDEX.has(key)) return LOT_NAME_INDEX.get(key)!;
  }
  for (const [key, value] of LOT_NAME_INDEX) {
    if (key.startsWith(noNum + ' ') || key.startsWith(lower + ' ')) return value;
  }
  return null;
}

export function matchLot(field5: bigint | null, gameLotName: string): string | null {
  const byField5 = field5 !== null ? LOT_FIELD5_MAP[field5.toString()] ?? null : null;
  const byName = matchLotName(gameLotName);
  // Multi-unit apartment buildings: field5 covers the whole building and maps to
  // one seed unit, but the save has distinct lot records for each unit. When the
  // name resolves to a DIFFERENT unit in the same world, trust the name — field5
  // here is the parent building, not the specific unit.
  if (byField5 && byName && byField5 !== byName) {
    const [worldA] = byField5.split('::');
    const [worldB] = byName.split('::');
    if (worldA === worldB) return byName;
  }
  return byField5 ?? byName;
}

// Planner keys where EA writes an internal codename into the save that bears no
// resemblance to the display name in worlds.ts. Treat the save's name as unchanged.
export const SEED_NAME_USES_INTERNAL = new Set<string>([
  'Ravenwood::Netherworld Department of Death', // the save calls this "HeadlessQuarters"
]);

// Seed categories that are structural variants of the type EA actually stores.
// A "change" from one of these to its parent is a taxonomy artifact, not an edit.
export const SEED_VARIANT_OVERRIDE = new Map<string, Set<string>>([
  ['Apartment',       new Set(['Residential'])],
  ['Penthouse',       new Set(['Residential'])],
  ['Vacation Rental', new Set(['Rental'])],
]);

// ─── Multi-unit buildings ────────────────────────────────────────────────────
// The units of one apartment building share a single field5 — the BUILDING's
// id — and are told apart only by name. That makes an in-game unit rename
// destroy the one signal that identified the unit, which is why unit identity
// needs the save's own zone id (SaveLotRecord.id) held onto between syncs
// (lots.source_id).
//
// 'Apartment' ONLY: a For Rent building (Residential Rental) is ONE planner
// lot that its unit records deliberately collapse into — there is no sibling
// set to disambiguate, and grouping them here would break that collapse.
// Verified against every Apartment seed (San Myshuno, Evergreen Harbor,
// Ondarion): getBuildingName groups each building's units exactly.

const MULTI_UNIT_TYPES = new Set(['Apartment']);

/** lotKey → all sibling unit keys of its building (incl. itself), in seed
    order. Only buildings with ≥2 units appear. */
export const MULTI_UNIT_SIBLINGS: Map<string, string[]> = (() => {
  const byBuilding = new Map<string, string[]>();
  for (const [world, { lots }] of Object.entries(WORLDS_DATA)) {
    for (const lot of lots as unknown as Array<{ name: string; type: string }>) {
      if (!MULTI_UNIT_TYPES.has(lot.type)) continue;
      const b = `${world}::${getBuildingName(lot.name)}`;
      const arr = byBuilding.get(b);
      if (arr) arr.push(`${world}::${lot.name}`); else byBuilding.set(b, [`${world}::${lot.name}`]);
    }
  }
  const m = new Map<string, string[]>();
  for (const keys of byBuilding.values()) {
    if (keys.length < 2) continue;
    for (const k of keys) m.set(k, keys);
  }
  return m;
})();

/** The minimum a save lot record needs for resolution (a `ParsedLot`). */
export interface SaveLotRecord {
  /** The save's own zone id — the only identity that survives a unit rename.
      Optional: name/field5 resolution works without it. */
  id?: bigint | null;
  field5: bigint | null;
  name: string;
  detectedType: string | null;
}

export interface ResolveLotsOptions {
  /** zone id (hex) → planner lot_key, from lots.source_id remembered at an
      earlier sync. A record whose zone id is here resolves there, name be
      damned — that's the point. */
  zoneKeyMap?: Map<string, string>;
  /** OUT: zone id (hex) → the lot_key each record finally resolved to, for
      every record that landed on a MULTI-UNIT lot. Callers persist these to
      lots.source_id so the next sync survives renames. */
  zoneAssignments?: Map<string, string>;
}

/**
 * The save's lot records resolved to ONE name + type per planner lot.
 *
 * A multi-unit building — apartments, For Rent co-housing — is several records
 * in the save, one per unit, and they all collapse onto a single planner lot.
 * So they have to be merged BEFORE anything counts them or writes them:
 * counting records reported "18 lot changes" on a save where six lots changed,
 * and writing them one after another let a default-named sibling unit stamp the
 * stock name into a renamed lot's baseline — which the next re-sync then had to
 * read as a rename the player made.
 *
 * Merge rule, per field: the first custom value wins, and a record matching the
 * seed never displaces one that doesn't. Two differently-renamed units on one
 * planner lot is unresolvable by definition (the planner has a single row), so
 * the choice only needs to be deterministic.
 *
 * Names are returned already normalized to the seed default when the save's name
 * is only EA's harmless variant of it, and types with the seed-variant override
 * applied — so a caller can compare against `LOT_DEFAULTS` directly to decide
 * whether the lot changed at all. Records with no planner lot (mods, packs we
 * don't seed) are skipped.
 */
export function resolveSaveLots(
  records: Iterable<SaveLotRecord>,
  opts: ResolveLotsOptions = {},
): Map<string, { customName: string; customType: string }> {
  const resolved = new Map<string, { customName: string; customType: string }>();
  const zoneHex = (l: SaveLotRecord): string | null => (l.id != null ? l.id.toString(16) : null);

  const write = (l: SaveLotRecord, key: string) => {
    const defaults = LOT_DEFAULTS.get(key);
    if (!defaults) return;

    const hex = zoneHex(l);
    if (hex && MULTI_UNIT_SIBLINGS.has(key)) opts.zoneAssignments?.set(hex, key);

    const nameMatches = !l.name
      || SEED_NAME_USES_INTERNAL.has(key)
      || isLotNameUnchanged(l.name, defaults.name);
    const customName = nameMatches ? defaults.name : l.name;

    let customType = l.detectedType ?? defaults.type;
    const variants = SEED_VARIANT_OVERRIDE.get(defaults.type);
    if (variants && variants.has(customType)) customType = defaults.type;

    const prev = resolved.get(key);
    if (!prev) {
      resolved.set(key, { customName, customType });
      return;
    }
    resolved.set(key, {
      customName: prev.customName !== defaults.name ? prev.customName : customName,
      customType: prev.customType !== defaults.type ? prev.customType : customType,
    });
  };

  // Pass 1 — records with certain identity, in order of authority:
  //   1. A name that IDENTIFIES a seed lot. The strongest signal — and the
  //      escape hatch: renaming a unit back to its stock name in-game
  //      corrects even a wrongly-remembered id at the next sync.
  //   2. A remembered zone id (lots.source_id from an earlier sync) — what
  //      identifies a unit whose name no longer matches anything.
  //   3. A field5 that points at a single-unit lot (unique per lot; renames
  //      of normal lots have always survived through it).
  // What's left is exactly the ambiguous case: a RENAMED unit of a
  // multi-unit building, with no remembered id — its field5 names only the
  // building. Those wait for pass 2.
  const deferred: SaveLotRecord[] = [];
  const claimed = new Set<string>();
  for (const l of records) {
    const key = matchLot(l.field5, l.name);
    const defaults = key ? LOT_DEFAULTS.get(key) : undefined;
    const nameIdentifies = !!key && !!defaults && (
      !l.name
      || SEED_NAME_USES_INTERNAL.has(key)
      || isLotNameUnchanged(l.name, defaults.name)
    );
    if (nameIdentifies) {
      claimed.add(key!);
      write(l, key!);
      continue;
    }
    const hex = zoneHex(l);
    const byZone = hex ? opts.zoneKeyMap?.get(hex) : undefined;
    if (byZone && LOT_DEFAULTS.has(byZone)) {
      claimed.add(byZone);
      write(l, byZone);
      continue;
    }
    if (!key || !defaults) continue;
    if (MULTI_UNIT_SIBLINGS.has(key)) {
      deferred.push(l);
      continue;
    }
    claimed.add(key);
    write(l, key);
  }

  // Pass 2 — renamed units land on their building's UNCLAIMED units. With a
  // single rename in a building this is exact; with several (and no zone ids
  // remembered yet) the pairing is a deterministic guess — zone-id order
  // against seed order — which at least gives every unit A name and never
  // leaks a rename onto an already-claimed sibling. The assignments recorded
  // above lock identity for every sync after this one.
  const byBuilding = new Map<string, SaveLotRecord[]>();
  for (const l of deferred) {
    const key = matchLot(l.field5, l.name)!;
    const building = MULTI_UNIT_SIBLINGS.get(key)![0];
    const arr = byBuilding.get(building);
    if (arr) arr.push(l); else byBuilding.set(building, [l]);
  }
  for (const [building, lots] of byBuilding) {
    const free = MULTI_UNIT_SIBLINGS.get(building)!.filter((k) => !claimed.has(k));
    lots.sort((a, b) => (a.id ?? 0n) < (b.id ?? 0n) ? -1 : (a.id ?? 0n) > (b.id ?? 0n) ? 1 : 0);
    for (let i = 0; i < lots.length && i < free.length; i++) {
      claimed.add(free[i]);
      write(lots[i], free[i]);
    }
  }

  return resolved;
}

/**
 * zone id → planner lot_key for every record, UNIT-AWARE: where resolveSaveLots
 * assigned a record (multi-unit buildings), that assignment wins; plain
 * field5+name matching covers everything else. Every consumer that maps a
 * save's lot ids to planner keys (household homes, club hangouts, business
 * lots) must go through this, or a renamed apartment's RESIDENTS land on a
 * different lot than its NAME did.
 */
export function buildZoneKeyIndex(
  records: Iterable<SaveLotRecord>,
  zoneAssignments?: Map<string, string>,
): Map<bigint, string> {
  const m = new Map<bigint, string>();
  for (const l of records) {
    if (l.id == null) continue;
    const key = zoneAssignments?.get(l.id.toString(16)) ?? matchLot(l.field5, l.name);
    if (key) m.set(l.id, key);
  }
  return m;
}

// Returns true if saveName and seedName describe the same lot after accounting
// for EA's harmless naming conventions:
//   - capitalization, quote/apostrophe variants, embedded HTML font tags, whitespace
//   - EA prefixing a unit number ("1 Torendi Tower Penthouse" vs "Torendi Tower Penthouse")
//   - EA omitting a trailing category word ("IX Landgraab" vs "IX Landgraab Apartments")
export function isLotNameUnchanged(saveName: string, seedName: string): boolean {
  const stripSpaces = (s: string) => s.replace(/\s+/g, '');
  const normSave = normalizeLotName(saveName);
  const normSeed = normalizeLotName(seedName);
  const a0 = stripSpaces(normSave);
  const b = stripSpaces(normSeed);
  if (a0 === b) return true;
  const aNoNum = stripSpaces(normSave.replace(/^\d+[a-z]?\s+/, ''));
  if (aNoNum === b) return true;
  if (aNoNum.length > 0 && (aNoNum.startsWith(b) || b.startsWith(aNoNum))) return true;
  if (a0.length > 0 && (a0.startsWith(b) || b.startsWith(a0))) return true;
  return false;
}
