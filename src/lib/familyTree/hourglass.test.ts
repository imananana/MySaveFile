/**
 * Hourglass layout invariants — first cut: full descendant tree down + focus
 * generation + one generation of parents. Pinned with the Medina seed and a
 * multi-generation descendant chain.
 */
import { describe, it, expect } from 'vitest';
import { buildHourglassLayout } from './hourglass';
import { CARD_W, CARD_H, type FamilyLayout } from './layout';
import type { SimRelationship, SimRelType } from '../../types';

let id = 0;
const E = (a: string, b: string, relType: SimRelType): SimRelationship =>
  ({ id: `e${id++}`, simAId: a, simBId: b, relType, source: 'import' });

const card = (L: FamilyLayout, sid: string) => {
  const c = L.cards.find((x) => x.simId === sid);
  if (!c) throw new Error(`card ${sid} not placed`);
  return c;
};
const has = (L: FamilyLayout, sid: string) => L.cards.some((c) => c.simId === sid);
const cx = (L: FamilyLayout, sid: string) => card(L, sid).x + CARD_W / 2;
const cy = (L: FamilyLayout, sid: string) => card(L, sid).y + CARD_H / 2;

const noOverlap = (L: FamilyLayout) => {
  for (let i = 0; i < L.cards.length; i++) {
    for (let j = i + 1; j < L.cards.length; j++) {
      const p = L.cards[i], q = L.cards[j];
      expect(Math.abs(p.x - q.x) < CARD_W && Math.abs(p.y - q.y) < CARD_H,
        `${p.simId} overlaps ${q.simId}`).toBe(false);
    }
  }
};

const MEDINA = [
  E('vera', 'josie', 'spouse'),
  E('betsy', 'vera', 'partner'),
  E('vera', 'bio', 'parent'), E('josie', 'bio', 'parent'),
  E('vera', 'guardian', 'parent'), E('josie', 'guardian', 'parent'),
  E('vera', 'camila', 'parent'),
];

describe('buildHourglassLayout — breadth fallback', () => {
  it('collapses many bare leaf-children into one chip but keeps branching kids', () => {
    const rels: SimRelationship[] = [E('mom', 'dad', 'spouse')];
    for (let i = 0; i < 20; i++) { rels.push(E('mom', `k${i}`, 'parent'), E('dad', `k${i}`, 'parent')); }
    // one child branches (has a kid of their own) → must stay a real card
    rels.push(E('k0', 'gk', 'parent'));
    const L = buildHourglassLayout('mom', rels, { ancestorDepth: 1 });
    const chips = L.cards.filter((c) => c.chip);
    expect(chips).toHaveLength(1);
    expect(chips[0].chip!.kind).toBe('children');
    expect(chips[0].chip!.ids).toHaveLength(19);     // 20 kids minus the brancher
    expect(chips[0].chip!.ids).not.toContain('k0');  // brancher kept as a card
    expect(has(L, 'k0')).toBe(true);
    expect(has(L, 'gk')).toBe(true);                 // grandchild subtree survives
    expect(L.width).toBeLessThan(2200);              // bounded, not 20-wide
    noOverlap(L);
  });

  it('collapses an oversized sibling row into one chip dropping from the union', () => {
    const rels: SimRelationship[] = [E('pa', 'ma', 'spouse')];
    for (let i = 0; i < 14; i++) { rels.push(E('pa', `s${i}`, 'parent'), E('ma', `s${i}`, 'parent')); }
    const L = buildHourglassLayout('s0', rels, { ancestorDepth: 2 });
    const chip = L.cards.find((c) => c.chip);
    expect(chip?.chip!.kind).toBe('siblings');
    expect(chip!.chip!.ids.length).toBeGreaterThan(5);   // the overflow siblings
    expect(L.width).toBeLessThan(2200);
    noOverlap(L);
  });
});

describe('buildHourglassLayout — flipped couple overflow (Crumplebottom/Goth)', () => {
  it('a child-couple with a deep flipped subtree does not overlap its plain sibling', () => {
    const rels = [
      E('simon', 'prudence', 'spouse'),
      E('simon', 'cornelia', 'parent'), E('prudence', 'cornelia', 'parent'),
      E('simon', 'agnes', 'parent'),    E('prudence', 'agnes', 'parent'),
      E('cornelia', 'gunther', 'spouse'),
      E('cornelia', 'mortimer', 'parent'), E('gunther', 'mortimer', 'parent'),
      E('mortimer', 'bella', 'spouse'),
      E('mortimer', 'cassandra', 'parent'), E('bella', 'cassandra', 'parent'),
      E('mortimer', 'alexander', 'parent'), E('bella', 'alexander', 'parent'),
    ];
    const L = buildHourglassLayout('simon', rels, { ancestorDepth: 1 });
    noOverlap(L);
  });
});

describe('buildHourglassLayout — descendants down', () => {
  it('places the focus couple and all children below them', () => {
    const L = buildHourglassLayout('vera', MEDINA);
    expect(has(L, 'vera')).toBe(true);
    expect(has(L, 'josie')).toBe(true);   // spouse beside
    for (const kid of ['bio', 'guardian', 'camila']) {
      expect(has(L, kid)).toBe(true);
      expect(cy(L, kid)).toBeGreaterThan(cy(L, 'vera')); // below the focus
    }
    expect(card(L, 'bio').y).toBe(card(L, 'camila').y);  // same descendant band
    noOverlap(L);
  });

  it('recurses through multiple descendant generations', () => {
    const rels = [
      E('a', 'b', 'spouse'),
      E('a', 'c', 'parent'), E('b', 'c', 'parent'),
      E('c', 'd', 'spouse'),
      E('c', 'e', 'parent'), E('d', 'e', 'parent'),
    ];
    const L = buildHourglassLayout('a', rels);
    expect(cy(L, 'a')).toBeLessThan(cy(L, 'c'));  // child below
    expect(cy(L, 'c')).toBeLessThan(cy(L, 'e'));  // grandchild below that
    expect(card(L, 'e').relation).toBe('grandchild');
    expect(card(L, 'c').relation).toBe('child');
    noOverlap(L);
  });

  it('shows parents above and siblings beside the focus', () => {
    const rels = [
      E('mom', 'dad', 'spouse'),
      E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
      E('mom', 'sis', 'parent'), E('dad', 'sis', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels);
    expect(cy(L, 'mom')).toBeLessThan(cy(L, 'me'));  // parents above
    expect(card(L, 'mom').relation).toBe('parent');
    expect(has(L, 'sis')).toBe(true);
    expect(card(L, 'sis').y).toBe(card(L, 'me').y);  // sibling same band
    expect(card(L, 'sis').relation).toBe('sibling');
    noOverlap(L);
  });

  it('climbs multiple ancestor generations (parents → grandparents → great-grandparents)', () => {
    const rels = [
      E('gg1', 'gg2', 'spouse'), E('gg1', 'gpa', 'parent'), E('gg2', 'gpa', 'parent'),
      E('gpa', 'gma', 'spouse'), E('gpa', 'mom', 'parent'), E('gma', 'mom', 'parent'),
      E('mom', 'dad', 'spouse'), E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 3 });
    expect(card(L, 'mom').relation).toBe('parent');
    expect(card(L, 'gpa').relation).toBe('grandparent');
    expect(card(L, 'gg1').relation).toBe('great-grandparent');
    // generations strictly climb
    expect(cy(L, 'gpa')).toBeLessThan(cy(L, 'mom'));
    expect(cy(L, 'gg1')).toBeLessThan(cy(L, 'gpa'));
    expect(card(L, 'gpa').y).toBe(card(L, 'gma').y);  // a couple shares a band
    noOverlap(L);
  });

  it('spreads grandparent couples so the two sides do not overlap or cross', () => {
    // both of me's parents have their own parent couples — the maternal and
    // paternal grandparent couples must not overlap.
    const rels = [
      E('mgpa', 'mgma', 'spouse'), E('mgpa', 'mom', 'parent'), E('mgma', 'mom', 'parent'),
      E('pgpa', 'pgma', 'spouse'), E('pgpa', 'dad', 'parent'), E('pgma', 'dad', 'parent'),
      E('mom', 'dad', 'spouse'), E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 2 });
    // maternal grandparents are entirely left of paternal grandparents
    expect(Math.max(cx(L, 'mgpa'), cx(L, 'mgma'))).toBeLessThan(Math.min(cx(L, 'pgpa'), cx(L, 'pgma')));
    noOverlap(L);
  });

  it('shows a co-parent spouse even with no surviving couple bond (culled ancestors)', () => {
    // Gretle and Victor share kids but have NO couple edge (lost to culling).
    const rels = [
      E('gretle', 'gunther', 'parent'), E('victor', 'gunther', 'parent'),
      E('gretle', 'frida', 'parent'), E('victor', 'frida', 'parent'),
    ];
    const L = buildHourglassLayout('gretle', rels);
    expect(has(L, 'victor')).toBe(true);
    const u = L.unions.find((x) => !x.loose)!;
    expect(u.relType).toBe('coparent');                       // dotted co-parent union
    expect([u.aId, u.bId].sort()).toEqual(['gretle', 'victor']);
  });

  it('a half-sibling drops from the shared parent, not the focus\'s parent union', () => {
    // Diane+Jeff → Jennifer.  Diane+Unknown → Daniel.  Jennifer & Daniel share
    // only Diane. From either focus, the half-sibling must hang from Diane, not
    // the focus parents' couple union.
    const rels = [
      E('diane', 'jeff', 'spouse'),
      E('diane', 'jennifer', 'parent'), E('jeff', 'jennifer', 'parent'),
      E('diane', 'daniel', 'parent'), E('unknownx', 'daniel', 'parent'),
    ];
    // focus Jennifer: parents Diane+Jeff (union). Daniel is half-brother and
    // must drop from Diane alone.
    const J = buildHourglassLayout('jennifer', rels);
    const dianeJ = cx(J, 'diane');
    const danielEdge = J.edges.find((e) => e.childId === 'daniel')!;
    expect(danielEdge.points[0].x).toBe(dianeJ);   // from Diane's card
    const unionJ = J.unions.find((u) => !u.loose)!;
    expect(danielEdge.points[0].x).not.toBe(unionJ.x);

    // focus Daniel: parents Diane+Unknown. Jennifer is half-sister, drops from
    // Diane alone (not the Diane+Unknown union).
    const D = buildHourglassLayout('daniel', rels);
    const dianeD = cx(D, 'diane');
    const jenEdge = D.edges.find((e) => e.childId === 'jennifer')!;
    expect(jenEdge.points[0].x).toBe(dianeD);
    // …and Jennifer sits on Diane's side of the union, so her connector never
    // crosses Daniel's: Jennifer's card and her source (Diane) are on the same
    // side of the parent union.
    const unionD = D.unions.find((u) => !u.loose)!;
    expect(Math.sign(cx(D, 'jennifer') - unionD.x)).toBe(Math.sign(dianeD - unionD.x));
  });

  it('an aunt/uncle who shares only one grandparent drops from that grandparent, not the union', () => {
    // Real Pleasant loop: Daniel = Diane+Unknown, Jennifer = Diane+Jeff. They
    // share only Diane. Lucy = Jennifer's kid, so Jennifer is a shown parent and
    // Daniel is Lucy's uncle (Jennifer's sibling on the ancestor side). Daniel
    // must hang from Diane alone — never the Diane⚭Jeff union (that read as
    // "Daniel is Jeff's kid"). Mirror: from Angela (Daniel's kid), Jennifer is
    // the aunt and must hang from Diane, not the Diane⚭Unknown union.
    const rels = [
      E('diane', 'jeff', 'spouse'),
      E('diane', 'jennifer', 'parent'), E('jeff', 'jennifer', 'parent'),
      E('diane', 'daniel', 'parent'), E('unknownd', 'daniel', 'parent'),
      E('jennifer', 'lucy', 'parent'), E('john', 'lucy', 'parent'),
      E('daniel', 'angela', 'parent'), E('marysue', 'angela', 'parent'),
    ];
    const Lc = buildHourglassLayout('lucy', rels, { ancestorDepth: 3 });
    const dEdge = Lc.edges.find((e) => e.childId === 'daniel')!;
    const uL = Lc.unions.find((u) => !u.loose && [u.aId, u.bId].sort().join() === ['diane', 'jeff'].sort().join())!;
    expect(dEdge.points[0].x).toBe(cx(Lc, 'diane'));  // from Diane's card
    expect(dEdge.points[0].x).not.toBe(uL.x);         // NOT the Diane⚭Jeff union
    noOverlap(Lc);

    const An = buildHourglassLayout('angela', rels, { ancestorDepth: 3 });
    const jEdge = An.edges.find((e) => e.childId === 'jennifer')!;
    const uA = An.unions.find((u) => !u.loose && [u.aId, u.bId].sort().join() === ['diane', 'unknownd'].sort().join())!;
    expect(jEdge.points[0].x).toBe(cx(An, 'diane'));  // Jennifer from Diane alone
    expect(jEdge.points[0].x).not.toBe(uA.x);         // NOT the Diane⚭Unknown union
    noOverlap(An);
  });

  it('offers "+ add parent" only on top-of-tree sims with no parent in the data', () => {
    const rels = [
      E('gpa', 'gma', 'spouse'),
      E('gpa', 'mom', 'parent'), E('gma', 'mom', 'parent'),
      E('mom', 'me', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 3 });
    expect(L.addParentIds?.has('gpa')).toBe(true);    // founder → offered
    expect(L.addParentIds?.has('gma')).toBe(true);
    expect(L.addParentIds?.has('mom')).toBe(false);   // parents shown → not offered
    expect(L.addParentIds?.has('me')).toBe(false);    // focus has a parent → not offered
  });

  it('suppresses a lone Unknown stub above the focus and offers "+ add parent" instead', () => {
    const rels = [E('unk', 'me', 'parent')];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 3, stubIds: new Set(['unk']) });
    expect(L.cards.some((c) => c.simId === 'unk')).toBe(false);  // top-level Unknown hidden
    expect(L.addParentIds?.has('me')).toBe(true);               // offered instead
  });

  it('shows siblings under their shared Unknown stub parent (the Newson case)', () => {
    // 6 kids all parented by one Unknown stub → they're siblings. Anchoring on
    // one shows the other five AND the shared "Unknown" parent, so the bracket
    // reads as a sibling group rather than six floating cards.
    const kids = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'];
    const rels = kids.map((k) => E('unk', k, 'parent'));
    const L = buildHourglassLayout('k0', rels, { ancestorDepth: 3, stubIds: new Set(['unk']) });
    expect(has(L, 'unk')).toBe(true);                            // shared stub now shown as the bracket
    for (const k of kids) expect(has(L, k)).toBe(true);          // all six siblings shown
    expect(L.addParentIds?.has('k0')).toBeFalsy();               // parent shown → no +add on focus
  });

  it('keeps a co-parent Unknown stub and does not offer "+" on a sim with a real parent', () => {
    const rels = [E('mom', 'me', 'parent'), E('unk', 'me', 'parent')];   // real + stub co-parents
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 3, stubIds: new Set(['unk']) });
    expect(L.cards.some((c) => c.simId === 'unk')).toBe(true);   // co-parent stub kept
    expect(L.addParentIds?.has('me')).toBe(false);              // me has a real parent (mom)
    expect(L.addParentIds?.has('unk')).toBe(false);             // stubs are never add targets
  });

  it('connects a loop child to BOTH parents when the second parent is on the tree', () => {
    // Full Pleasant loop: Diane & Jeff are married AND half-siblings (Melinda's
    // kids). Jennifer = Diane+Jeff. Daniel = Diane+Unknown. From Angela (Daniel's
    // kid), Daniel is the father and Jennifer his half-sibling (aunt). Because
    // Jeff is also on the tree (as a grand-uncle, Diane's sibling), Jennifer must
    // hang from the Diane⚭Jeff couple — not from Diane alone, and never from the
    // Diane⚭Unknown union.
    const rels = [
      E('melinda', 'diane', 'parent'), E('melinda', 'jeff', 'parent'),
      E('diane', 'jeff', 'spouse'),
      E('diane', 'jennifer', 'parent'), E('jeff', 'jennifer', 'parent'),
      E('diane', 'daniel', 'parent'), E('unknownd', 'daniel', 'parent'),
      E('daniel', 'angela', 'parent'), E('marysue', 'angela', 'parent'),
    ];
    const A = buildHourglassLayout('angela', rels, { ancestorDepth: 3 });
    expect(has(A, 'jeff')).toBe(true);                 // Jeff drawn (grand-uncle)
    const jEdge = A.edges.find((e) => e.childId === 'jennifer')!;
    const mid = (cx(A, 'diane') + cx(A, 'jeff')) / 2;
    expect(Math.abs(jEdge.points[0].x - mid)).toBeLessThan(1);  // from BETWEEN Diane & Jeff
    const uA = A.unions.find((u) => [u.aId, u.bId].sort().join() === ['diane', 'unknownd'].sort().join());
    if (uA) expect(jEdge.points[0].x).not.toBe(uA.x);  // not the Diane⚭Unknown union
    noOverlap(A);
  });

  it('orders the up-couple so a half-aunt\'s drop never crosses the member\'s union drop', () => {
    // Real Beaker loop: Loki = Gudrun+Unknown, Erin = Bjorn+Gudrun (share only
    // Gudrun). From Atom (Loki's kid), Loki is the father and Erin the aunt.
    // Erin sits left of Loki, so the shared grandparent (Gudrun) must be ordered
    // to the LEFT of the up-couple — else Erin's drop from Gudrun crosses Loki's
    // drop from the Unknown⚭Gudrun union.
    const rels = [
      E('gudrun', 'loki', 'parent'), E('unknowng', 'loki', 'parent'),
      E('bjorn', 'erin', 'parent'), E('gudrun', 'erin', 'parent'),
      E('bjorn', 'gudrun', 'spouse'),
      E('loki', 'atom', 'parent'), E('circe', 'atom', 'parent'),
    ];
    const L = buildHourglassLayout('atom', rels, { ancestorDepth: 2 });
    const erinEdge = L.edges.find((e) => e.childId === 'erin')!;
    const lokiEdge = L.edges.find((e) => e.childId === 'loki')!;
    expect(erinEdge.points[0].x).toBe(cx(L, 'gudrun'));        // Erin from Gudrun's card
    // Erin sits left of Loki; her source (Gudrun) is also left of Loki's source
    // → same ordering, lines run parallel and never cross.
    expect(cx(L, 'erin')).toBeLessThan(cx(L, 'loki'));
    expect(erinEdge.points[0].x).toBeLessThan(lokiEdge.points[0].x);
    noOverlap(L);
  });

  it('shows aunts/uncles as leaves on their parent\'s side', () => {
    const rels = [
      E('mgpa', 'mgma', 'spouse'),
      E('mgpa', 'mom', 'parent'), E('mgma', 'mom', 'parent'),
      E('mgpa', 'auntm', 'parent'), E('mgma', 'auntm', 'parent'),  // mom's sibling
      E('pgpa', 'pgma', 'spouse'),
      E('pgpa', 'dad', 'parent'), E('pgma', 'dad', 'parent'),
      E('pgpa', 'auntp', 'parent'), E('pgma', 'auntp', 'parent'),  // dad's sibling
      E('mom', 'dad', 'spouse'), E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 2 });
    expect(card(L, 'auntm').relation).toBe('aunt-uncle');
    expect(card(L, 'auntp').relation).toBe('aunt-uncle');
    // maternal aunt on mom's side (left of mom), paternal aunt on dad's (right)
    expect(cx(L, 'auntm')).toBeLessThan(cx(L, 'mom'));
    expect(cx(L, 'auntp')).toBeGreaterThan(cx(L, 'dad'));
    expect(card(L, 'auntm').y).toBe(card(L, 'mom').y);  // same band as the parents
    // an aunt connects up to her own parents (the grandparents), not down
    const grandUnion = L.unions.find((u) => (u.aId === 'mgpa' && u.bId === 'mgma') || (u.aId === 'mgma' && u.bId === 'mgpa'))!;
    const auntEdge = L.edges.find((e) => e.points.some((p) => Math.abs(p.x - cx(L, 'auntm')) < 1));
    expect(auntEdge).toBeDefined();
    expect(auntEdge!.points[0].x).toBe(grandUnion.x);
    noOverlap(L);
  });

  it('suppresses a lone Unknown ancestor but keeps a co-parent Unknown', () => {
    const rels = [
      E('mom', 'dad', 'spouse'), E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
      E('unkA', 'mom', 'parent'),                       // mom's only parent is a stub
      E('gpa', 'dad', 'parent'), E('unkB', 'dad', 'parent'),  // dad: real grandparent + stub co-parent
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 3, stubIds: new Set(['unkA', 'unkB']) });
    expect(has(L, 'unkA')).toBe(false);   // lone stub at the top → suppressed
    expect(has(L, 'gpa')).toBe(true);
    expect(has(L, 'unkB')).toBe(true);    // co-parent stub beside a real grandparent → kept
  });

  it('draws a loose marriage union between two placed non-adjacent sims (a loop)', () => {
    // Diane & Jeff share a parent (Melinda) so Jeff is the focus's uncle, but
    // Diane & Jeff are also married. The marriage must still be drawn.
    const rels = [
      E('diane', 'dan', 'parent'), E('unknownx', 'dan', 'parent'),
      E('melinda', 'diane', 'parent'), E('melinda', 'jeff', 'parent'),
      E('diane', 'jeff', 'spouse'),
    ];
    const L = buildHourglassLayout('dan', rels, { ancestorDepth: 3, stubIds: new Set(['unknownx']) });
    expect(has(L, 'diane')).toBe(true);
    expect(has(L, 'jeff')).toBe(true);    // appears as the uncle (Melinda's other child)
    const loose = L.unions.find((u) => u.loose && [u.aId, u.bId].sort().join() === ['diane', 'jeff'].sort().join());
    expect(loose).toBeDefined();
    expect(loose!.relType).toBe('spouse');
  });

  it('respects the ancestorDepth cap', () => {
    const rels = [
      E('gpa', 'gma', 'spouse'), E('gpa', 'mom', 'parent'), E('gma', 'mom', 'parent'),
      E('mom', 'dad', 'spouse'), E('mom', 'me', 'parent'), E('dad', 'me', 'parent'),
    ];
    const L = buildHourglassLayout('me', rels, { ancestorDepth: 1 });
    expect(has(L, 'mom')).toBe(true);
    expect(has(L, 'gpa')).toBe(false);   // depth 1 = parents only
  });

  it('labels descendant in-laws and ranks generations downward', () => {
    const L = buildHourglassLayout('vera', MEDINA);
    expect(card(L, 'josie').relation).toBe('spouse');
    expect(card(L, 'bio').relation).toBe('child');
    noOverlap(L);
  });

  it('orders children by source so single-parent kids sit on that parent\'s side (no crossing)', () => {
    // Diane (head/left) + Jeff (spouse/right). Jennifer is both their child;
    // Daniel is Diane's only. Daniel must end up left (Diane's side) of Jennifer.
    const rels = [
      E('diane', 'jeff', 'spouse'),
      E('diane', 'jennifer', 'parent'), E('jeff', 'jennifer', 'parent'),
      E('diane', 'daniel', 'parent'),
    ];
    const L = buildHourglassLayout('diane', rels);
    expect(cx(L, 'daniel')).toBeLessThan(cx(L, 'jennifer'));   // mother's side
    const dEdge = L.edges.find((e) => e.childId === 'daniel')!;
    const jEdge = L.edges.find((e) => e.childId === 'jennifer')!;
    expect(dEdge.points[0].x).toBe(cx(L, 'diane'));            // drops from Diane, not the union
    const union = L.unions.find((u) => !u.loose)!;
    expect(jEdge.points[0].x).toBe(union.x);
    // Daniel's drop never crosses to the right past the union
    expect(Math.max(...dEdge.points.map((p) => p.x))).toBeLessThanOrEqual(union.x);
    noOverlap(L);
  });

  it('a single-parent child drops from that parent, not the union', () => {
    const L = buildHourglassLayout('vera', MEDINA);
    const union = L.unions.find((u) => !u.loose && ((u.aId === 'vera' && u.bId === 'josie') || (u.aId === 'josie' && u.bId === 'vera')))!;
    const camila = L.edges.find((e) => e.childId === 'camila')!;
    const bio = L.edges.find((e) => e.childId === 'bio')!;
    expect(camila.points[0].x).toBe(cx(L, 'vera'));   // from Vera's card
    expect(camila.points[0].x).not.toBe(union.x);
    expect(bio.points[0].x).toBe(union.x);            // from the union
  });
});

describe('buildHourglassLayout — shared Unknown top parent', () => {
  const stubs = (...ids: string[]) => ({ stubIds: new Set(ids), ancestorDepth: 3 });

  it('keeps a shared Unknown stub so siblings hang from one bracket', () => {
    // Angela + Lilith share only an Unknown stub parent (the Pleasants case).
    const rels = [E('unknown', 'angela', 'parent'), E('unknown', 'lilith', 'parent')];
    const L = buildHourglassLayout('angela', rels, stubs('unknown'));
    expect(has(L, 'unknown')).toBe(true);                   // stub kept (bridges 2 siblings)
    expect(has(L, 'lilith')).toBe(true);                    // sibling shown
    expect(cy(L, 'unknown')).toBeLessThan(cy(L, 'angela')); // parent sits above
    expect(L.edges.some((e) => e.childId === 'angela')).toBe(true);  // drop line to focus
    expect(L.edges.some((e) => e.childId === 'lilith')).toBe(true);  // drop line to sibling
    expect(L.addParentIds?.has('angela')).toBeFalsy();      // no redundant +add on the focus
    expect(L.addParentIds?.has('unknown')).toBe(true);      // the Unknown itself is build-up-able
    noOverlap(L);
  });

  it('suppresses a lone Unknown stub above a single sim (+add parent instead)', () => {
    const L = buildHourglassLayout('angela', [E('unknown', 'angela', 'parent')], stubs('unknown'));
    expect(has(L, 'unknown')).toBe(false);              // lone Unknown suppressed
    expect(L.addParentIds?.has('angela')).toBe(true);   // offers +add parent instead
  });
});
