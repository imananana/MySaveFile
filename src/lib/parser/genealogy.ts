/**
 * Modern family-tree (genealogy) extraction from the 0x0d master blob.
 *
 * Added by the Feb-2026 game patch (the "enhanced family tree"): any save
 * written since then carries a per-sim genealogy record stream, the
 * authoritative source the in-game tree UI reads. It SUPERSEDES the f14
 * ahnentafel + relationship-bit reconstruction for saves that have it — most
 * importantly it stores the premade DECEASED ANCESTORS (Cordelia Capp, Pranav
 * Kunal, Cornelia Goth, …) that f14 omits, so a sim like Tybalt Capp finally
 * gets his full multi-generation pedigree instead of an empty one. Older saves
 * not re-saved under the patch have no genealogy records → callers fall back to
 * the f14 path (`scanFamily` / `scanPairRelationships`).
 *
 * Validated byte-level facts (see scripts/diagnostics genealogy spikes, Slot 9
 * + Slot_12345673; relType decoded against owner-confirmed pairs):
 *   - Per-sim record:  `0a len { 08 simId, 12 firstName, 1a lastName,
 *       (22 len { 08 self, 10 other, 18 relType })* }`. Living sims carry their
 *       name inline (f2/f3); ANCESTOR-NODE records (deceased premades) have NO
 *       name — straight to the edges — and their name/gender/death/portrait
 *       come from a premade-ancestor TEMPLATE resolved via `ancestorTemplate`.
 *   - relType enum (NOT the big RelationshipBit ids — a compact code):
 *       1 = other IS MY CHILD (I am the parent), 2 = other IS MY PARENT,
 *       4 = spouse. Rare couple-variants 8/16/384 (ex / partner /
 *       deceased-spouse) are captured raw but not used for tree structure.
 *       Siblings and step-relations are NOT stored here — they derive from the
 *       parent graph, exactly as on the f14 path.
 *   - Ancestor-node → template map:  `12 len { 08 templateId, 10 nodeId }` —
 *       maps a nameless ancestor-node sim id to its `TunablePremadeAncestor`
 *       tuning instance id (small), which the catalog turns into a name + face.
 */
import { readVarint, readString } from './protobuf';

/** Compact genealogy relType codes (NOT RelationshipBit tuning ids). */
export const GENE_REL = {
  CHILD: 1,   // the other sim is this sim's child (this sim is the parent)
  PARENT: 2,  // the other sim is this sim's parent
  SPOUSE: 4,
} as const;

export interface GenealogyEdge {
  /** The sim/ancestor-node on the other end of the edge. */
  other: bigint;
  /** Compact relType code (see GENE_REL); 8/16/384 = rare couple variants. */
  relType: number;
}

export interface GenealogyRecord {
  id: bigint;
  /** Inline name for living sims; '' for ancestor nodes (resolve via template). */
  firstName: string;
  lastName: string;
  edges: GenealogyEdge[];
}

export interface GenealogyData {
  /** Every genealogy record (living sims + deceased ancestor nodes), by id. */
  records: Map<bigint, GenealogyRecord>;
  /** Ancestor-node sim id → premade-ancestor template instance id. */
  ancestorTemplate: Map<bigint, number>;
}

// Template instance ids are small (< ~0x80000); a node/sim id is a full 64-bit
// snowflake. These thresholds disambiguate the two sides of a map entry and
// keep the whole-blob scan from matching unrelated `12 …` fields.
const MAX_TEMPLATE_ID = 0x200000n;
const MIN_NODE_ID = 0x1000000000n;

/**
 * Ancestor-node → template map: repeated `12 len { 08 templateId 10 nodeId }`.
 * The `12` tag collides with a record's name field, so we accept an entry only
 * when its body is exactly `{ 08 <small id> 10 <big id> }`.
 */
function scanAncestorTemplates(buf: Uint8Array): Map<bigint, number> {
  const out = new Map<bigint, number>();
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0x12) continue;
    const [len, n] = readVarint(buf, i + 1);
    const end = n + Number(len);
    if (Number(len) < 4 || Number(len) > 24 || end > buf.length) continue;
    if (buf[n] !== 0x08) continue;
    const [tpl, p2] = readVarint(buf, n + 1);
    if (tpl <= 0n || tpl >= MAX_TEMPLATE_ID || p2 >= end || buf[p2] !== 0x10) continue;
    const [node, p3] = readVarint(buf, p2 + 1);
    if (p3 !== end || node < MIN_NODE_ID) continue;
    out.set(node, Number(tpl));
    i = end - 1;
  }
  return out;
}

/** Parse one `22 len { 08 self, 10 other, 18 relType }` edge sub-message. */
function parseEdge(buf: Uint8Array, start: number, end: number): GenealogyEdge | null {
  let p = start;
  let other = -1n;
  let relType = -1;
  while (p < end) {
    const [tag, at] = readVarint(buf, p);
    const fn = Number(tag) >> 3, wt = Number(tag) & 7;
    if (fn === 0 || at <= p) break;
    p = at;
    if (wt === 0) {
      const [v, n] = readVarint(buf, p);
      if (fn === 2) other = v; else if (fn === 3) relType = Number(v);
      p = n;
    } else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else break;
  }
  return other >= 0n && relType >= 0 ? { other, relType } : null;
}

/**
 * Parse a genealogy record starting at `0a`. Returns the record (and the offset
 * just past it) only if it validates as a genealogy record: its id is a known
 * sim followed by an inline name, OR an ancestor node in the template map.
 */
function parseRecord(
  buf: Uint8Array,
  recStart: number,
  knownSimIds: Set<bigint>,
  ancestorTemplate: Map<bigint, number>,
): [GenealogyRecord | null, number] {
  if (buf[recStart] !== 0x0a) return [null, recStart + 1];
  const [len, bodyStart] = readVarint(buf, recStart + 1);
  const end = bodyStart + Number(len);
  if (Number(len) < 3 || end > buf.length) return [null, recStart + 1];
  if (buf[bodyStart] !== 0x08) return [null, recStart + 1];
  const [id, afterId] = readVarint(buf, bodyStart + 1);

  const isLiving = knownSimIds.has(id) && buf[afterId] === 0x12; // 08 simId then 12 name
  const isAncestor = ancestorTemplate.has(id);
  if (!isLiving && !isAncestor) return [null, recStart + 1];

  let p = afterId;
  let firstName = '', lastName = '';
  const edges: GenealogyEdge[] = [];
  while (p < end) {
    const [tag, at] = readVarint(buf, p);
    const fn = Number(tag) >> 3, wt = Number(tag) & 7;
    if (fn === 0 || at <= p) break;
    p = at;
    if (fn === 2 && wt === 2) { const [s, n] = readString(buf, p); firstName = s; p = n; }
    else if (fn === 3 && wt === 2) { const [s, n] = readString(buf, p); lastName = s; p = n; }
    else if (fn === 4 && wt === 2) {
      const [l, n] = readVarint(buf, p); const e = n + Number(l);
      const edge = parseEdge(buf, n, e);
      if (edge) edges.push(edge);
      p = e;
    }
    else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else return [null, recStart + 1];
  }
  if (edges.length === 0) return [null, recStart + 1];
  return [{ id, firstName, lastName, edges }, end];
}

/**
 * Extract the modern genealogy graph from a decompressed 0x0d blob. Returns an
 * empty graph (records.size === 0) for pre-patch saves that don't have it — the
 * signal for the caller to fall back to the f14 path.
 */
export function scanGenealogy(buf: Uint8Array, knownSimIds: Set<bigint>): GenealogyData {
  const ancestorTemplate = scanAncestorTemplates(buf);
  const records = new Map<bigint, GenealogyRecord>();
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0x0a) continue;
    const [rec, next] = parseRecord(buf, i, knownSimIds, ancestorTemplate);
    if (rec) {
      if (!records.has(rec.id)) records.set(rec.id, rec);
      i = next - 1;
    }
  }
  return { records, ancestorTemplate };
}
