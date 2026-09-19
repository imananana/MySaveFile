/**
 * Family / lineage extraction from the 0x0d master blob.
 *
 * Validated byte-level facts (see scripts/diagnostics/spike{Parents,TopFields,
 * EdgeGraph} and relService/relbitHunt/dumpField):
 *   - Blood parents:  sim record → f30.f14, an ancestor "ahnentafel" of
 *       { index, simId } entries. index 0/1 = the two parents (0=mother-slot,
 *       1=father-slot for hetero; parent A/B otherwise); index ≥2 = grandparents
 *       and higher (parents of the node at floor((i-2)/2)). Blood-only — step
 *       parents are never listed here. Cross-household.
 *   - Spouse:   top-level f15, a fixed64 sim id. Current spouse only (divorce
 *       clears it). Written straight from CAS.
 *   - Engaged:  top-level f68, a fixed64 sim id. Written straight from CAS.
 *   - Partner:  top-level f72, a message { f1: 8 raw LE bytes = partner sim id }.
 *       Written straight from CAS, mirrored on both sims.
 *   - Pair relationships: the relationship SERVICE records (pre-sims section of
 *       the same blob) — one per sim pair: f1/f2 = the two sim ids (varint),
 *       f3.f1 = packed RelationshipBit tuning ids, f3.f3 = tracks with float
 *       scores (16650 = friendship, 16651 = romance). The bits that matter are
 *       permanent historical markers: romantic-Divorced (15815) and
 *       romantic-Broken_Up (15811) / Broken_Up_Engaged (15812). Volatile
 *       score-derived combo bits (Sweethearts/Lovebirds/Bad Romance…) are
 *       present in the list but must never drive logic — the raw track floats
 *       are extracted instead. Service records materialize on a household's
 *       first play; CAS-only relationships are covered by the f15/f68/f72
 *       pointers above.
 *
 * Step/half/full siblings, grandparents, step-parents and separated co-parents
 * are all DERIVED from the facts above with no guessing.
 */
import { readVarint, readFixed64LE } from './protobuf';

export interface RawFamily {
  /** Blood parents present in f14 at index 0/1 (resolved to known sim ids). */
  parents: bigint[];
  /** Full f14 ahnentafel (parents at 0/1, grandparents+ at ≥2). */
  ancestors: { id: bigint; index: number }[];
  /** Current spouse (f15), or null. */
  spouseId: bigint | null;
  /** Fiancé (f68), or null. */
  engagedId: bigint | null;
  /** Current boyfriend/girlfriend (f72), or null. */
  partnerId: bigint | null;
}

/** RelationshipBit tuning ids the tree derives edges from (validated on seeded pairs). */
export const REL_BITS = {
  brokenUp: 15811n,        // romantic-Broken_Up
  brokenUpEngaged: 15812n, // romantic-Broken_Up_Engaged
  divorced: 15815n,        // romantic-Divorced
  engaged: 15816n,         // romantic-Engaged
  married: 15822n,         // romantic-Married
  significantOther: 15825n, // romantic-Significant_Other
} as const;

/**
 * Structural family RelationshipBit tuning ids. Unlike the romantic REL_BITS,
 * these are AUTHORITATIVE blood/kin links the game writes directly from CAS and
 * marks `relationship_culling_prevention=PLAYED_AND_UNPLAYED` — so they survive
 * even when a sim's parent records are culled (the parentless-premade case).
 *
 * Tuning-confirmed (RelationshipBit type 0x0904DF10, S4S-extracted):
 *   sibling     8802   = family_Target_IsBrotherSisterOf_Actor (instance 0x2262,
 *                        counts_as_incest=True → FULL/BLOOD sibling, BIDIRECTIONAL).
 *   halfSibling 468542 = family_Target_IsHalfsiblingOf_Actor (one shared blood parent).
 * Both survive parent culling, so they catch sibling pairs whose parents are no
 * longer in the save (premade sisters like the Pleasants render as strangers
 * otherwise). They're only EMITTED as edges when the pair shares no parent slot
 * at all — pairs that share a parent are left to parent-derivation, which also
 * types them — so the two sources stay disjoint by construction (no dedup).
 *
 * KNOWN WEAKNESS (accepted): step-siblings have their own bit (8824) which we do
 * NOT read. Step-sibs share no blood parent, so the "share a parent → derive it"
 * suppression can't separate them from parent-derivation (they're found via the
 * parent's-spouse chain, not a shared parent) — including 8824 would force real
 * dedup. So a FULLY-CULLED step pair (both parent-chains gone) renders unrelated.
 * Parented step-sibs are still derived/typed normally; only premade-with-no-
 * parents step pairs are missed, which is the rarest case. Adding 8824 later is
 * a parser-only change (read bit → emit edge) — it does NOT reopen the layout.
 * The wider kinship vocabulary (grandparent 8808, cousin 8826, …) is captured in
 * `pr.bits` and can be interpreted later if/when the layout needs it.
 */
export const FAMILY_BITS = {
  sibling: 8802n,        // family_Target_IsBrotherSisterOf_Actor — full/blood, bidirectional
  halfSibling: 468542n,  // family_Target_IsHalfsiblingOf_Actor — one shared blood parent
} as const;

const TRACK_FRIENDSHIP = 16650n;
const TRACK_ROMANCE = 16651n;

/** One relationship service record — a sim pair with its bits and track scores. */
export interface PairRelationship {
  simA: bigint;
  simB: bigint;
  /** Raw RelationshipBit tuning ids (includes volatile combo bits — filter via REL_BITS). */
  bits: bigint[];
  friendship: number | null;
  romance: number | null;
}

export type SiblingType = 'full' | 'half' | 'step';

export interface Relations {
  parents: bigint[];
  children: bigint[];
  siblings: { id: bigint; type: SiblingType }[];
  grandparents: bigint[];
  grandchildren: bigint[];
  spouseId: bigint | null;
  engagedId: bigint | null;
  /** Current boyfriend(s)/girlfriend(s): f72 pointer (CAS-only households) plus
   *  romantic-Significant_Other pairs (played households; the game removes the
   *  bit on breakup, so presence = current). Plural — poly is real. */
  partners: bigint[];
  /** Sims this sim was married to and divorced from (romantic-Divorced bit). */
  exSpouses: bigint[];
  /** Sims this sim dated and broke up with (romantic-Broken_Up bit). */
  exPartners: bigint[];
  /** Sims this sim was engaged to and split from (romantic-Broken_Up_Engaged bit). */
  exFiances: bigint[];
  /** Spouse/fiancé of a blood parent who isn't a blood parent of this sim. */
  stepParents: bigint[];
  /** People this sim shares a child with but has NO current union with (separated co-parents). */
  coParents: bigint[];
}

export interface FamilyGraph {
  raw: Map<bigint, RawFamily>;
  /** parent sim id → child sim ids. */
  childrenOf: Map<bigint, bigint[]>;
  /** sim id → its pair relationship records (both directions indexed). */
  pairsOf: Map<bigint, PairRelationship[]>;
}

// ─── extraction ────────────────────────────────────────────────────────────────

// Sim record anchor: 0x09[8 simId] 0x11[8 lotId] 0x18[varint ts] 0x21[8 hhId] 0x2a[name…]
function scanAnchors(buf: Uint8Array, simIds: Set<bigint>): { id: bigint; start: number }[] {
  const anchors: { id: bigint; start: number }[] = [];
  for (let i = 0; i < buf.length - 60; i++) {
    if (buf[i] !== 0x09) continue;
    let pos = i + 9;
    if (buf[pos] !== 0x11) continue; pos += 9;
    if (buf[pos] !== 0x18) continue; pos++;
    const [, afterTs] = readVarint(buf, pos); pos = afterTs;
    if (buf[pos] !== 0x21) continue; pos += 9;
    if (buf[pos] !== 0x2a) continue;
    const id = readFixed64LE(buf, i + 1);
    if (!simIds.has(id)) continue;
    anchors.push({ id, start: i });
    i = pos;
  }
  anchors.sort((a, b) => a.start - b.start);
  return anchors;
}

// Parse the repeated { f1:index, f2:simId } entries of an f14 message.
function parseF14Entries(buf: Uint8Array, s: number, e: number, out: { id: bigint; index: number }[]): void {
  let p = s;
  while (p < e) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 2 && fn === 1) {
      const [l, n] = readVarint(buf, p); const cs = n, ce = n + Number(l);
      let index = -1; let sim = 0n; let q = cs;
      while (q < ce) {
        const [etb, eat] = readVarint(buf, q); const efn = Number(etb) >> 3, ewt = Number(etb) & 7;
        if (efn === 0 || eat <= q) break; q = eat;
        if (ewt === 0) { const [v, nn] = readVarint(buf, q); if (efn === 1) index = Number(v); else if (efn === 2) sim = v; q = nn; }
        else if (ewt === 1) { if (efn === 2) sim = readFixed64LE(buf, q); q += 8; }
        else if (ewt === 2) { const [ll, nn] = readVarint(buf, q); q = nn + Number(ll); }
        else if (ewt === 5) { q += 4; } else break;
      }
      if (sim) out.push({ id: sim, index });
      p = ce;
    } else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) { p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) { p += 4; } else break;
  }
}

// Find field 14 inside an f30 message and parse its entries.
function parseF30(buf: Uint8Array, s: number, e: number, out: { id: bigint; index: number }[]): void {
  let p = s;
  while (p < e) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) { p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const cs = n, ce = n + Number(l); if (fn === 14) parseF14Entries(buf, cs, ce, out); p = ce; }
    else if (wt === 5) { p += 4; } else break;
  }
}

// f72 = { f1: 8 raw LE bytes = partner sim id } (NOT a wt1 fixed64 — the id
// sits as plain bytes inside a length-delimited submessage).
function parseF72(buf: Uint8Array, s: number, e: number, simIds: Set<bigint>): bigint | null {
  let p = s;
  while (p < e) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 2) {
      const [l, n] = readVarint(buf, p);
      if (fn === 1 && Number(l) === 8) { const v = readFixed64LE(buf, n); if (simIds.has(v)) return v; }
      p = n + Number(l);
    }
    else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) p += 8; else if (wt === 5) p += 4; else break;
  }
  return null;
}

function extractOne(buf: Uint8Array, start: number, end: number, simIds: Set<bigint>): RawFamily {
  let spouseId: bigint | null = null;
  let engagedId: bigint | null = null;
  let partnerId: bigint | null = null;
  const ancestors: { id: bigint; index: number }[] = [];
  let p = start;
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 1) {
      if (fn === 15) { const v = readFixed64LE(buf, p); if (simIds.has(v)) spouseId = v; }
      else if (fn === 68) { const v = readFixed64LE(buf, p); if (simIds.has(v)) engagedId = v; }
      p += 8;
    }
    else if (wt === 2) {
      const [l, n] = readVarint(buf, p); const cs = n, ce = n + Number(l);
      if (fn === 30) parseF30(buf, cs, ce, ancestors);
      else if (fn === 72) { const v = parseF72(buf, cs, ce, simIds); if (v !== null) partnerId = v; }
      p = ce;
    }
    else if (wt === 5) { p += 4; } else break;
  }
  const parents = ancestors.filter((a) => (a.index === 0 || a.index === 1) && simIds.has(a.id)).map((a) => a.id);
  return { parents, ancestors, spouseId, engagedId, partnerId };
}

/** Extract raw per-sim family facts from a decompressed 0x0d blob. */
export function scanFamily(buf: Uint8Array, simIds: Set<bigint>): Map<bigint, RawFamily> {
  const anchors = scanAnchors(buf, simIds);
  const out = new Map<bigint, RawFamily>();
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].start;
    const end = i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, start + 300_000);
    out.set(anchors[i].id, extractOne(buf, start, end, simIds));
  }
  return out;
}

/**
 * Extract the relationship service records (pair → bits + track scores) from a
 * decompressed 0x0d blob. Record shape: `0a len { 08 varint simA, 10 varint
 * simB, 1a { 0a packed-varint bit ids, 1a { 08 track id, 15 float score } } }`.
 * Both sim ids must resolve to known sims — that requirement is what makes the
 * cheap whole-blob scan safe.
 */
export function scanPairRelationships(buf: Uint8Array, simIds: Set<bigint>): PairRelationship[] {
  const out: PairRelationship[] = [];
  for (let i = 0; i < buf.length - 24; i++) {
    if (buf[i] !== 0x0a) continue;
    const [len, n] = readVarint(buf, i + 1);
    if (Number(len) < 12 || Number(len) > 4096 || n + Number(len) > buf.length) continue;
    let p = n; const end = n + Number(len);
    if (buf[p] !== 0x08) continue;
    const [simA, n2] = readVarint(buf, p + 1); if (!simIds.has(simA)) continue;
    p = n2; if (buf[p] !== 0x10) continue;
    const [simB, n3] = readVarint(buf, p + 1); if (!simIds.has(simB)) continue;
    p = n3;
    const bits: bigint[] = [];
    let friendship: number | null = null;
    let romance: number | null = null;
    while (p < end) {
      const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
      if (fn === 0 || at <= p) break; p = at;
      if (wt === 0) { const [, nn] = readVarint(buf, p); p = nn; }
      else if (wt === 1) p += 8; else if (wt === 5) p += 4;
      else if (wt === 2) {
        const [l2, m2] = readVarint(buf, p); const e2 = m2 + Number(l2);
        if (fn === 3) {
          let q = m2;
          while (q < e2) {
            const [tb2, at2] = readVarint(buf, q); const fn2 = Number(tb2) >> 3, wt2 = Number(tb2) & 7;
            if (fn2 === 0 || at2 <= q) break; q = at2;
            if (wt2 === 2 && fn2 === 1) {
              // packed varint list of RelationshipBit tuning ids
              const [l3, m3] = readVarint(buf, q); const e3 = m3 + Number(l3);
              let r = m3;
              while (r < e3) { const [v, rr] = readVarint(buf, r); if (rr <= r) break; bits.push(v); r = rr; }
              q = e3;
            } else if (wt2 === 2 && fn2 === 3) {
              // track entry { f1: track id, f2: float32 score }
              const [l3, m3] = readVarint(buf, q); const e3 = m3 + Number(l3);
              let r = m3; let id = 0n; let score: number | null = null;
              while (r < e3) {
                const [tb3, at3] = readVarint(buf, r); const fn3 = Number(tb3) >> 3, wt3 = Number(tb3) & 7;
                if (fn3 === 0 || at3 <= r) break; r = at3;
                if (wt3 === 0) { const [v, rr] = readVarint(buf, r); if (fn3 === 1) id = v; r = rr; }
                else if (wt3 === 5) { if (fn3 === 2) score = new DataView(buf.buffer, buf.byteOffset + r, 4).getFloat32(0, true); r += 4; }
                else if (wt3 === 1) r += 8;
                else if (wt3 === 2) { const [l4, m4] = readVarint(buf, r); r = m4 + Number(l4); }
                else break;
              }
              if (score !== null) {
                if (id === TRACK_FRIENDSHIP) friendship = score;
                else if (id === TRACK_ROMANCE) romance = score;
              }
              q = e3;
            } else if (wt2 === 0) { const [, qq] = readVarint(buf, q); q = qq; }
            else if (wt2 === 1) q += 8; else if (wt2 === 5) q += 4;
            else if (wt2 === 2) { const [l3, m3] = readVarint(buf, q); q = m3 + Number(l3); }
            else break;
          }
        }
        p = e2;
      } else break;
    }
    out.push({ simA, simB, bits, friendship, romance });
    i = end - 1;
  }
  return out;
}

// ─── graph + derivation ──────────────────────────────────────────────────────

/** Build a query-able graph from raw family facts (+ optional pair relationships). */
export function buildFamilyGraph(raw: Map<bigint, RawFamily>, pairs: PairRelationship[] = []): FamilyGraph {
  const childrenOf = new Map<bigint, bigint[]>();
  for (const [childId, fam] of raw) {
    for (const parentId of fam.parents) {
      const arr = childrenOf.get(parentId);
      if (arr) arr.push(childId); else childrenOf.set(parentId, [childId]);
    }
  }
  const pairsOf = new Map<bigint, PairRelationship[]>();
  for (const pr of pairs) {
    for (const id of [pr.simA, pr.simB]) {
      const arr = pairsOf.get(id);
      if (arr) arr.push(pr); else pairsOf.set(id, [pr]);
    }
  }
  return { raw, childrenOf, pairsOf };
}

const dedupe = (ids: bigint[]): bigint[] => [...new Set(ids)];

/** Derive every family relationship for one sim — all exact, no guessing. */
export function relationsFor(g: FamilyGraph, id: bigint): Relations {
  const me = g.raw.get(id);
  if (!me) return { parents: [], children: [], siblings: [], grandparents: [], grandchildren: [], spouseId: null, engagedId: null, partners: [], exSpouses: [], exPartners: [], exFiances: [], stepParents: [], coParents: [] };

  const myParents = new Set(me.parents);
  const children = g.childrenOf.get(id) ?? [];

  // Siblings: count shared blood parents, then classify. f14 lists every parent
  // that exists in the save, so a *visible* non-shared parent proves the siblings
  // differ → half. If they share one parent and NEITHER has a known second
  // parent, the missing parent(s) are off-screen and we can't prove a difference,
  // so we assume full (e.g. CAS-genetics siblings / a single premade parent like
  // the Munches). "half" is only asserted when we can see the differing parent.
  const sharedCount = new Map<bigint, number>();
  for (const p of me.parents) for (const c of g.childrenOf.get(p) ?? []) if (c !== id) sharedCount.set(c, (sharedCount.get(c) ?? 0) + 1);
  const siblings: { id: bigint; type: SiblingType }[] = [...sharedCount].map(([sid, shared]) => {
    if (shared >= 2) return { id: sid, type: 'full' as const };
    const sibParents = g.raw.get(sid)?.parents.length ?? 0;
    const differingParentVisible = me.parents.length >= 2 || sibParents >= 2;
    return { id: sid, type: differingParentVisible ? ('half' as const) : ('full' as const) };
  });

  // Step-siblings: children of a blood parent's spouse/fiancé who aren't blood siblings.
  const seenSib = new Set<bigint>([...sharedCount.keys()]);
  const stepParents: bigint[] = [];
  for (const p of me.parents) {
    const pf = g.raw.get(p);
    if (!pf) continue;
    for (const partner of [pf.spouseId, pf.engagedId]) {
      if (!partner || myParents.has(partner)) continue;
      stepParents.push(partner);
      for (const sc of g.childrenOf.get(partner) ?? []) {
        if (sc === id || seenSib.has(sc)) continue;
        seenSib.add(sc);
        siblings.push({ id: sc, type: 'step' });
      }
    }
  }

  // Grandparents: parents' parents, plus any ahnentafel entry at index ≥2.
  const grandparents: bigint[] = [];
  for (const p of me.parents) { const pf = g.raw.get(p); if (pf) grandparents.push(...pf.parents); }
  for (const a of me.ancestors) if (a.index >= 2 && g.raw.has(a.id)) grandparents.push(a.id);

  const grandchildren: bigint[] = [];
  for (const c of children) grandchildren.push(...(g.childrenOf.get(c) ?? []));

  // Ex edges from the pair relationship bits (permanent historical markers),
  // plus current partners: the f72 CAS pointer is dropped once a household is
  // played, after which romantic-Significant_Other carries the truth (the game
  // removes that bit on breakup, so presence = current).
  const exSpouses: bigint[] = [];
  const exPartners: bigint[] = [];
  const exFiances: bigint[] = [];
  const partners: bigint[] = me.partnerId !== null ? [me.partnerId] : [];
  for (const pr of g.pairsOf.get(id) ?? []) {
    const other = pr.simA === id ? pr.simB : pr.simA;
    if (pr.bits.includes(REL_BITS.divorced)) exSpouses.push(other);
    if (pr.bits.includes(REL_BITS.brokenUp)) exPartners.push(other);
    if (pr.bits.includes(REL_BITS.brokenUpEngaged)) exFiances.push(other);
    if (pr.bits.includes(REL_BITS.significantOther)) partners.push(other);
  }
  const partnersSet = new Set(partners);

  // Separated co-parents: share a child but no CURRENT union (marriage,
  // engagement, or partnership) with each other.
  const coParents: bigint[] = [];
  const coCandidate = new Set<bigint>();
  for (const c of children) { const cf = g.raw.get(c); if (cf) for (const p of cf.parents) if (p !== id) coCandidate.add(p); }
  for (const other of coCandidate) {
    if (other === me.spouseId || other === me.engagedId || partnersSet.has(other)) continue;
    coParents.push(other);
  }

  return {
    parents: me.parents,
    children: dedupe(children),
    siblings,
    grandparents: dedupe(grandparents),
    grandchildren: dedupe(grandchildren),
    spouseId: me.spouseId,
    engagedId: me.engagedId,
    partners: dedupe(partners),
    exSpouses: dedupe(exSpouses),
    exPartners: dedupe(exPartners),
    exFiances: dedupe(exFiances),
    stepParents: dedupe(stepParents),
    coParents: dedupe(coParents),
  };
}
