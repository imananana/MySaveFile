/**
 * Regression tests for the family derivation (L2). These exercise the pure
 * graph logic in family.ts with synthetic raw data modeled on the real seeded
 * households we validated byte-for-byte (Goth, Verrick, Loden, Spencer-Kim-Lewis,
 * Roomies, and the relbit seeds: Divorce/Breakup/Wedlock/Steady/Engaged/
 * Housemates). The byte extraction itself is validated via scripts/diagnostics.
 */
import { describe, it, expect } from 'vitest';
import { buildFamilyGraph, relationsFor, scanPairRelationships, REL_BITS, type RawFamily, type PairRelationship } from './family';

const F = (p: bigint[], spouse: bigint | null = null, engaged: bigint | null = null, partner: bigint | null = null): RawFamily => ({
  parents: p,
  ancestors: p.map((id, i) => ({ id, index: i })),
  spouseId: spouse,
  engagedId: engaged,
  partnerId: partner,
});
const PAIR = (a: bigint, b: bigint, bits: bigint[], friendship: number | null = null, romance: number | null = null): PairRelationship =>
  ({ simA: a, simB: b, bits, friendship, romance });
// A volatile score-derived combo bit (Bad Romance) — must never produce edges.
const COMBO_BAD_ROMANCE = 15843n;
const types = (rs: { id: bigint; type: string }[]) => Object.fromEntries(rs.map((r) => [r.id.toString(), r.type]));

describe('family — nuclear (Goth)', () => {
  // Bella(1) ⚭ Mortimer(2); kids Cassandra(3), Alexander(4)
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([
    [1n, F([], 2n)], [2n, F([], 1n)], [3n, F([1n, 2n])], [4n, F([1n, 2n])],
  ]));

  it('children/spouse from a parent', () => {
    const r = relationsFor(g, 1n);
    expect(r.spouseId).toBe(2n);
    expect(r.children.sort()).toEqual([3n, 4n]);
  });
  it('full siblings (both parents shared)', () => {
    const r = relationsFor(g, 3n);
    expect(r.parents.sort()).toEqual([1n, 2n]);
    expect(types(r.siblings)).toEqual({ '4': 'full' });
  });
});

describe('family — blended/step (Verrick)', () => {
  // Kalen(10) ⚭ Hadley(11); Mollie(12)→Kalen; Aurora(13)→Hadley; Dorian(14)→both
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([
    [10n, F([], 11n)], [11n, F([], 10n)],
    [12n, F([10n])], [13n, F([11n])], [14n, F([10n, 11n])],
  ]));

  it('half-sibling shares one parent; step-sibling shares none (via married parent)', () => {
    const r = relationsFor(g, 12n); // Mollie: blood dad Kalen
    expect(types(r.siblings)).toEqual({ '14': 'half', '13': 'step' }); // Dorian half, Aurora step
    expect(r.stepParents).toEqual([11n]); // Hadley (married to Kalen, not Mollie's parent)
  });
  it('child of the new couple is half-sibling to both prior kids', () => {
    const r = relationsFor(g, 14n); // Dorian
    expect(types(r.siblings)).toEqual({ '12': 'half', '13': 'half' });
  });
});

describe('family — single in-save parent (Munch): assume full, not half', () => {
  // Mila(50) is the only parent in the save; kids 51,52,53 (dad off-screen)
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([
    [50n, F([])], [51n, F([50n])], [52n, F([50n])], [53n, F([50n])],
  ]));
  it('siblings sharing one parent with no visible second parent = full', () => {
    expect(types(relationsFor(g, 51n).siblings)).toEqual({ '52': 'full', '53': 'full' });
  });
});

describe('family — three generations (Loden)', () => {
  // Hattie(20) → Nora(21); Dahlia(22) ⚭ Nora(21); kids Erik(23)
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([
    [20n, F([])], [21n, F([20n], 22n)], [22n, F([], 21n)], [23n, F([21n, 22n])],
  ]));

  it('grandparent derives from parent-of-parent', () => {
    const r = relationsFor(g, 23n); // Erik
    expect(r.grandparents).toEqual([20n]); // Hattie (Nora's mother)
  });
  it('grandchild from the elder', () => {
    const r = relationsFor(g, 20n); // Hattie
    expect(r.children).toEqual([21n]);
    expect(r.grandchildren).toEqual([23n]);
  });
});

describe('family — divorce with kid (Spencer-Kim-Lewis)', () => {
  // Eric(30) & Alice(31) NOT married; shared kid Olivia(32)
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([
    [30n, F([])], [31n, F([])], [32n, F([30n, 31n])],
  ]));

  it('shared kid + no marriage = separated co-parents', () => {
    const r = relationsFor(g, 30n);
    expect(r.spouseId).toBeNull();
    expect(r.coParents).toEqual([31n]);
    expect(r.children).toEqual([32n]);
  });
  it('kid keeps both blood parents despite divorce', () => {
    expect(relationsFor(g, 32n).parents.sort()).toEqual([30n, 31n]);
  });
});

describe('family — roommates with no relationship data (Housemates seed)', () => {
  const g = buildFamilyGraph(new Map<bigint, RawFamily>([[40n, F([])], [41n, F([])]]));
  it('no blood, no marriage, no bits = no derived relations', () => {
    const r = relationsFor(g, 40n);
    expect(r.parents).toEqual([]);
    expect(r.children).toEqual([]);
    expect(r.siblings).toEqual([]);
    expect(r.coParents).toEqual([]);
    expect(r.spouseId).toBeNull();
    expect(r.partners).toEqual([]);
    expect(r.exSpouses).toEqual([]);
    expect(r.exPartners).toEqual([]);
  });
});

describe('current partners (Steady seeds: CAS f72 + played service bit)', () => {
  // 60/61: CAS-set partners, never played — f72 pointer only, no service record.
  // 62/63: played partners — f72 dropped, romantic-Significant_Other carries it.
  // 64: poly — SO bits toward two sims (Penny Pizzazz case).
  const g = buildFamilyGraph(
    new Map<bigint, RawFamily>([
      [60n, F([], null, null, 61n)], [61n, F([], null, null, 60n)],
      [62n, F([])], [63n, F([])],
      [64n, F([])], [65n, F([])], [66n, F([])],
    ]),
    [
      PAIR(62n, 63n, [REL_BITS.significantOther], 45.0, 39.9),
      PAIR(64n, 65n, [REL_BITS.significantOther]),
      PAIR(64n, 66n, [REL_BITS.significantOther]),
    ],
  );
  it('CAS f72 pointer mirrors on both sims', () => {
    expect(relationsFor(g, 60n).partners).toEqual([61n]);
    expect(relationsFor(g, 61n).partners).toEqual([60n]);
  });
  it('played pair: partner from the Significant_Other service bit', () => {
    expect(relationsFor(g, 62n).partners).toEqual([63n]);
    expect(relationsFor(g, 63n).partners).toEqual([62n]);
  });
  it('poly: multiple concurrent partners are all surfaced', () => {
    expect(relationsFor(g, 64n).partners.sort()).toEqual([65n, 66n]);
  });
});

describe('ex edges from pair relationship bits (Divorce/Breakup seeds)', () => {
  // Tierra(70)/Tyree(71) divorced; Wade(72)/Bentley(73) broke up;
  // Trace(74)/Gage(75) married (current — pointer, no ex bits).
  const g = buildFamilyGraph(
    new Map<bigint, RawFamily>([
      [70n, F([])], [71n, F([])], [72n, F([])], [73n, F([])],
      [74n, F([], 75n)], [75n, F([], 74n)],
    ]),
    [
      PAIR(70n, 71n, [COMBO_BAD_ROMANCE, REL_BITS.divorced], 32.0, -100.0),
      PAIR(72n, 73n, [COMBO_BAD_ROMANCE, REL_BITS.brokenUp], 32.0, -100.0),
      // real Wedlock pair's record carries Married but NOT Significant_Other
      PAIR(74n, 75n, [REL_BITS.married], 45.0, 74.9),
    ],
  );

  it('romantic-Divorced bit → exSpouses, both directions', () => {
    expect(relationsFor(g, 70n).exSpouses).toEqual([71n]);
    expect(relationsFor(g, 71n).exSpouses).toEqual([70n]);
    expect(relationsFor(g, 70n).exPartners).toEqual([]);
  });
  it('romantic-Broken_Up bit → exPartners, distinct from divorce', () => {
    expect(relationsFor(g, 72n).exPartners).toEqual([73n]);
    expect(relationsFor(g, 72n).exSpouses).toEqual([]);
  });
  it('married pair gets no ex/partner edges; combo bits never produce edges', () => {
    const r = relationsFor(g, 74n);
    expect(r.spouseId).toBe(75n);
    expect(r.partners).toEqual([]);
    expect(r.exSpouses).toEqual([]);
    expect(r.exPartners).toEqual([]);
  });
});

describe('co-parents respect the partner pointer', () => {
  // Unmarried couple, CURRENTLY partners (f72), with a shared kid — they are
  // a couple, not "separated co-parents". Contrast: a truly split pair.
  const g = buildFamilyGraph(
    new Map<bigint, RawFamily>([
      [80n, F([], null, null, 81n)], [81n, F([], null, null, 80n)], [82n, F([80n, 81n])],
      [83n, F([])], [84n, F([])], [85n, F([83n, 84n])],
    ]),
    [PAIR(83n, 84n, [REL_BITS.divorced])],
  );
  it('current partners with a kid are NOT co-parents', () => {
    expect(relationsFor(g, 80n).coParents).toEqual([]);
    expect(relationsFor(g, 80n).partners).toEqual([81n]);
  });
  it('divorced pair with a kid are co-parents AND ex-spouses', () => {
    const r = relationsFor(g, 83n);
    expect(r.coParents).toEqual([84n]);
    expect(r.exSpouses).toEqual([84n]);
  });
});

describe('scanPairRelationships — byte-level decode of a service record', () => {
  const vr = (v: bigint): number[] => { const out: number[] = []; while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; } out.push(Number(v)); return out; };
  const f32 = (x: number): number[] => { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, x, true); return [...new Uint8Array(b)]; };
  const msg = (tag: number, body: number[]): number[] => [tag, ...vr(BigInt(body.length)), ...body];

  it('decodes pair ids, bit list, and friendship/romance tracks', () => {
    const A = 0x23516ab8bd2018cn, B = 0x23516ab8be70197n;
    const bitsPacked = [...vr(REL_BITS.divorced), ...vr(COMBO_BAD_ROMANCE)];
    const trackF = msg(0x1a, [0x08, ...vr(16650n), 0x15, ...f32(32.0)]);   // f3.f3 friendship
    const trackR = msg(0x1a, [0x08, ...vr(16651n), 0x15, ...f32(-100.0)]); // f3.f3 romance
    const f3 = msg(0x1a, [...msg(0x0a, bitsPacked), ...trackF, ...trackR]);
    const record = msg(0x0a, [0x08, ...vr(A), 0x10, ...vr(B), ...f3]);
    const buf = Uint8Array.from([0xde, 0xad, ...record, 0xbe, 0xef]); // noise padding
    const pairs = scanPairRelationships(buf, new Set([A, B]));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].simA).toBe(A);
    expect(pairs[0].simB).toBe(B);
    expect(pairs[0].bits).toContain(REL_BITS.divorced);
    expect(pairs[0].friendship).toBeCloseTo(32.0);
    expect(pairs[0].romance).toBeCloseTo(-100.0);
  });

  it('ignores records whose ids are not known sims', () => {
    const record = [0x0a, 14, 0x08, ...vr(999n), 0x10, ...vr(998n), 0x1a, 2, 0x0a, 0];
    expect(scanPairRelationships(Uint8Array.from(record), new Set([1n, 2n]))).toHaveLength(0);
  });
});
