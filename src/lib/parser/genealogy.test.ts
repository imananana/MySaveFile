/**
 * Tests for the modern family-tree (genealogy) parser. Synthetic protobuf
 * fixtures model the record shape validated on real saves (Slot 9 /
 * Slot_12345673): per-sim records with typed parent/child/spouse edges, plus
 * nameless ancestor-node records resolved through the ancestor→template map.
 */
import { describe, it, expect } from 'vitest';
import { scanGenealogy, GENE_REL } from './genealogy';

// ─── tiny protobuf encoder ──────────────────────────────────────────────────
const varint = (n: bigint | number): number[] => {
  let v = BigInt(n); const out: number[] = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return out;
};
const tag = (field: number, wire: number) => varint((field << 3) | wire);
const vField = (field: number, value: bigint | number) => [...tag(field, 0), ...varint(value)];
const sField = (field: number, s: string) => {
  const bytes = [...new TextEncoder().encode(s)];
  return [...tag(field, 2), ...varint(bytes.length), ...bytes];
};
const msgField = (field: number, body: number[]) => [...tag(field, 2), ...varint(body.length), ...body];

const edge = (self: bigint, other: bigint, rel: number) =>
  msgField(4, [...vField(1, self), ...vField(2, other), ...vField(3, rel)]);

const record = (id: bigint, first: string, last: string, edges: number[][]) =>
  msgField(1, [...vField(1, id), ...(first ? sField(2, first) : []), ...(last ? sField(3, last) : []), ...edges.flat()]);

const ancestorEntry = (templateId: number, nodeId: bigint) =>
  msgField(2, [...vField(1, templateId), ...vField(2, nodeId)]);

const buf = (...parts: number[][]) => new Uint8Array(parts.flat());

// ids
const BELLA = 100n, MORTIMER = 300n, SIMIS = 200n, CASSANDRA = 400n;
const ANCESTOR = 0x23516c033aaa381n; // a deceased ancestor node (big snowflake id)
const TPL_CORDELIA = 0x786e6;

describe('scanGenealogy', () => {
  it('parses a living-sim record with typed parent/spouse/child edges', () => {
    const b = buf(record(BELLA, 'Bella', 'Goth', [
      edge(BELLA, SIMIS, GENE_REL.PARENT),
      edge(BELLA, MORTIMER, GENE_REL.SPOUSE),
      edge(BELLA, CASSANDRA, GENE_REL.CHILD),
    ]));
    const g = scanGenealogy(b, new Set([BELLA, SIMIS, MORTIMER, CASSANDRA]));
    const rec = g.records.get(BELLA)!;
    expect(rec.firstName).toBe('Bella');
    expect(rec.lastName).toBe('Goth');
    expect(rec.edges).toEqual([
      { other: SIMIS, relType: GENE_REL.PARENT },
      { other: MORTIMER, relType: GENE_REL.SPOUSE },
      { other: CASSANDRA, relType: GENE_REL.CHILD },
    ]);
  });

  it('parses a nameless ancestor-node record and resolves its template', () => {
    const b = buf(
      ancestorEntry(TPL_CORDELIA, ANCESTOR),
      record(ANCESTOR, '', '', [edge(ANCESTOR, BELLA, GENE_REL.CHILD)]),
      record(BELLA, 'Bella', 'Goth', [edge(BELLA, ANCESTOR, GENE_REL.PARENT)]),
    );
    const g = scanGenealogy(b, new Set([BELLA]));
    expect(g.ancestorTemplate.get(ANCESTOR)).toBe(TPL_CORDELIA);
    const anc = g.records.get(ANCESTOR)!;
    expect(anc.firstName).toBe('');                       // resolved via catalog downstream
    expect(anc.edges).toEqual([{ other: BELLA, relType: GENE_REL.CHILD }]);
    expect(g.records.get(BELLA)!.edges[0]).toEqual({ other: ANCESTOR, relType: GENE_REL.PARENT });
  });

  it('ignores a 0a/08 record whose id is not a known sim or ancestor node', () => {
    // an unknown id with no inline name and not in the template map → skipped
    const b = buf(record(999n, '', '', [edge(999n, BELLA, GENE_REL.CHILD)]));
    const g = scanGenealogy(b, new Set([BELLA]));
    expect(g.records.size).toBe(0);
  });

  it('requires at least one edge (a bare id record is not genealogy)', () => {
    const b = buf(record(BELLA, 'Bella', 'Goth', []));
    const g = scanGenealogy(b, new Set([BELLA]));
    expect(g.records.size).toBe(0);
  });

  it('returns an empty graph for a pre-patch blob (fallback signal)', () => {
    const g = scanGenealogy(new Uint8Array([0, 1, 2, 3, 4, 5]), new Set([BELLA]));
    expect(g.records.size).toBe(0);
    expect(g.ancestorTemplate.size).toBe(0);
  });
});
