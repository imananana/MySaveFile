/**
 * Hourglass layout — the "whole tree" lens. Centered on one sim, it shows the
 * full descendant tree downward and the ancestor line upward, in the same v5
 * card/ring/relation-chip skin as the focus view. Re-centering on anyone
 * rebuilds the hourglass around them.
 *
 * This first cut is the DOWNWARD half done properly (a recursive tidy
 * descendant tree — couples adjacent, children centered below, no overlaps)
 * plus the focus generation (focus + siblings + spouse) and one generation of
 * parents. The multi-generation upward pedigree (grandparents + aunts/uncles)
 * is layered on next.
 */
import type { SimRelationship, SimRelType } from '../../types';
import {
  indexRelationships, COUPLE_TYPES,
  CARD_W, CARD_H, COUPLE_GAP, RING_R, GAPX, GROUP_GAP, LANE, PAD,
  type FamilyLayout, type PlacedCard, type PlacedUnion, type PlacedEdge, type FocusRelation,
} from './layout';

const COUPLE_W = CARD_W * 2 + COUPLE_GAP;  // full width of a two-card couple unit
const HALF = (CARD_W + COUPLE_GAP) / 2;    // couple card-center offset from the union center

// Breadth fallback: once a unit has more bare leaf-children (no spouse, no kids
// of their own) than this, collapse ALL of them into one overflow chip so a
// 100-baby legacy doesn't blow the tree thousands of px wide. Branching
// children (who carry a subtree) always keep their own card.
const LEAF_COLLAPSE = 8;
// Same idea for the focus's sibling row: past this many siblings, collapse the
// overflow full-siblings into one chip (distinct half-siblings stay visible).
const SIB_CAP = 6;

interface DUnit {
  head: string;                              // the blood descendant (or a synthetic chip key)
  spouse: string | null;                     // married-in partner (leaf)
  union: SimRelType | 'coparent' | null;
  gen: number;
  kids: DUnit[];
  unitW: number;
  width: number;                             // full bounding extent (kids block ∪ this couple)
  anchor: number;                            // union center (couple) or card center (single)
  anchorOffset: number;                      // anchor position relative to the unit's left edge
  kidsShift: number;                         // kids-block left edge relative to the unit's left edge
  flip?: boolean;                            // true → head on the right, spouse on the left
  overflow?: string[];                       // chip node: the collapsed leaf-child ids
}

export function buildHourglassLayout(
  focusId: string,
  relationships: SimRelationship[],
  opts: { ancestorDepth?: number; stubIds?: Set<string> } = {},
): FamilyLayout {
  // Lone "Unknown" ancestors clutter the top of the tree. Suppress them only
  // when they're at the top — i.e. a sim whose parents are ALL stubs shows no
  // parent above. A stub that CO-parents a real ancestor (a missing spouse
  // mid-tree, like Daniel's Unknown co-parent) is kept; it's meaningful.
  const stubs = opts.stubIds ?? new Set<string>();
  const { parentsOf, childrenOf, bonds, siblingsOf } = indexRelationships(relationships);
  const bond = (a: string, b: string): SimRelType | null => bonds.get(a)?.get(b) ?? null;
  const unionType = (a: string, b: string): SimRelType | 'coparent' => bond(a, b) ?? 'coparent';
  const sharesChild = (a: string, b: string) =>
    (childrenOf.get(a) ?? []).some((c) => (childrenOf.get(b) ?? []).includes(c));

  const cards: PlacedCard[] = [];
  const unions: PlacedUnion[] = [];
  const edges: PlacedEdge[] = [];
  const relationOf = new Map<string, FocusRelation>();
  const placed = new Set<string>();

  const yOf = (gen: number) => gen * (CARD_H + LANE);  // normalized later

  // ── Descendant spouse pick: the co-parent of this person's kids (whether or
  // not a couple BOND survives — dead/culled ancestors keep their kids but
  // lose the marriage record, so we fall back to pure co-parentage), else the
  // strongest marriage bond. Married-in spouses become leaves. ───────────────
  const pickSpouse = (id: string, claimed: Set<string>): string | null => {
    // co-parents = the other parents of this person's children
    const coCount = new Map<string, number>();
    for (const c of childrenOf.get(id) ?? []) {
      for (const p of parentsOf.get(c) ?? []) {
        if (p !== id && !claimed.has(p)) coCount.set(p, (coCount.get(p) ?? 0) + 1);
      }
    }
    const coParents = [...coCount.entries()].sort(
      (a, b) => b[1] - a[1] || bondRank(bond(id, a[0])) - bondRank(bond(id, b[0])),
    );
    if (coParents.length) return coParents[0][0];
    // no shared kids: a marriage/engagement bond partner stands beside them
    const married = [...(bonds.get(id)?.keys() ?? [])]
      .filter((p) => !claimed.has(p) && (bond(id, p) === 'spouse' || bond(id, p) === 'engaged'))
      .sort((a, b) => bondRank(bond(id, a)) - bondRank(bond(id, b)));
    return married[0] ?? null;
  };
  void sharesChild;

  // ── 1. Build the descendant unit tree (focus is the root) ──────────────────
  const buildDesc = (id: string, gen: number, claimed: Set<string>): DUnit => {
    claimed.add(id);
    placed.add(id);
    const spouse = pickSpouse(id, claimed);
    if (spouse) { claimed.add(spouse); placed.add(spouse); }

    const childIds: string[] = [];
    for (const c of [...(childrenOf.get(id) ?? []), ...(spouse ? childrenOf.get(spouse) ?? [] : [])]) {
      if (!childIds.includes(c)) childIds.push(c);
    }
    // Order by drop source so lines never cross: a child of only the head
    // (mother) sits on the head's side, shared children in the middle, a child
    // of only the spouse (father) on the spouse's side.
    const srcRank = (c: string) => {
      const kp = parentsOf.get(c) ?? [];
      const fromHead = kp.includes(id);
      const fromSpouse = spouse ? kp.includes(spouse) : false;
      if (fromHead && fromSpouse) return 1;
      if (fromSpouse && !fromHead) return 2;
      return 0; // head-only → head's side
    };
    childIds.sort((a, b) => srcRank(a) - srcRank(b));
    let kids: DUnit[] = [];
    for (const c of childIds) {
      if (claimed.has(c)) continue;
      kids.push(buildDesc(c, gen + 1, claimed));
    }
    // Breadth fallback: collapse bare leaf-children beyond the cap into a single
    // overflow chip; keep branching children (and leaf couples) as real cards.
    const isBareLeaf = (k: DUnit) => !k.spouse && k.kids.length === 0 && !k.overflow;
    const bareLeaves = kids.filter(isBareLeaf);
    if (bareLeaves.length > LEAF_COLLAPSE) {
      const keep = kids.filter((k) => !isBareLeaf(k));
      const chip: DUnit = {
        head: `chip:${id}`, spouse: null, union: null, gen: gen + 1, kids: [],
        unitW: CARD_W, width: CARD_W, anchor: 0, anchorOffset: CARD_W / 2, kidsShift: 0,
        overflow: bareLeaves.map((k) => k.head),
      };
      kids = [...keep, chip];
    }
    const unitW = spouse ? COUPLE_W : CARD_W;
    // Horizontal half-extent of this unit's own cards around its anchor: a couple
    // spans ±COUPLE_W/2 around its union, a lone head ±CARD_W/2.
    const halfExtent = spouse ? COUPLE_W / 2 : CARD_W / 2;

    // Decide each child-couple's flip HERE (head toward the sibling cluster's
    // centre) so the extent math below sees real head positions, not guesses.
    kids.forEach((k, i) => { if (k.spouse) k.flip = i < kids.length / 2; });

    let width: number, anchorOffset: number, kidsShift: number;
    if (kids.length === 0) {
      width = unitW;
      anchorOffset = unitW / 2;
      kidsShift = 0;
    } else {
      // Relative left offset of each child within the kids block.
      const kx: number[] = [];
      let cur = 0;
      for (const k of kids) { kx.push(cur); cur += k.width + GROUP_GAP; }
      const kidsW = cur - GROUP_GAP;
      const headCenterRel = (k: DUnit, left: number) => {
        const a = left + k.anchorOffset;
        return k.spouse ? (k.flip ? a + HALF : a - HALF) : a;
      };
      // The union sits over the children's HEAD cards (the drop source) so a
      // single child lands a perfectly straight line.
      const coupleAnchor = (headCenterRel(kids[0], kx[0]) + headCenterRel(kids[kids.length - 1], kx[kids.length - 1])) / 2;
      // Reserve the bounding extent of BOTH the kids block and this unit's own
      // couple — which can sit off-centre when a child's deep/flipped subtree
      // pulls the anchor aside. Reserving that extent is exactly what stops the
      // couple spilling into the adjacent sibling.
      const leftExtent = Math.min(0, coupleAnchor - halfExtent);
      const rightExtent = Math.max(kidsW, coupleAnchor + halfExtent);
      width = rightExtent - leftExtent;
      anchorOffset = coupleAnchor - leftExtent;
      kidsShift = -leftExtent;
    }
    return {
      head: id, spouse, union: spouse ? unionType(id, spouse) : null,
      gen, kids, unitW, width, anchor: 0, anchorOffset, kidsShift,
    };
  };

  const claimed = new Set<string>();
  const root = buildDesc(focusId, 0, claimed);

  // The blood descendant's card center (the spouse hangs to the right). Parents
  // connect to THIS, so centering the unit over its children's head centers
  // keeps every connector straight instead of jogging by half a couple-width.
  const headCenterX = (u: DUnit) => (u.spouse ? (u.flip ? u.anchor + HALF : u.anchor - HALF) : u.anchor);
  const spouseCenterX = (u: DUnit) => (u.flip ? u.anchor - HALF : u.anchor + HALF);

  // ── 2. Assign x: place the unit at leftX using the extents computed above ──
  // width / anchorOffset / kidsShift were derived bottom-up (including flips and
  // off-centre couples), so placement is a straight walk: anchor at its offset,
  // kids laid left→right starting at the kids-block shift.
  const assignDesc = (u: DUnit, leftX: number) => {
    u.anchor = leftX + u.anchorOffset;
    let cursor = leftX + u.kidsShift;
    for (const k of u.kids) {
      assignDesc(k, cursor);
      cursor += k.width + GROUP_GAP;
    }
  };
  assignDesc(root, 0);

  // ── 3. Emit descendant cards + unions + child connectors ───────────────────
  const emitDesc = (u: DUnit) => {
    const y = yOf(u.gen);
    // cards
    if (u.overflow) {
      cards.push({ simId: u.head, x: u.anchor - CARD_W / 2, y, chip: { ids: u.overflow, kind: 'children' } });
    } else if (u.spouse) {
      cards.push({ simId: u.head, x: headCenterX(u) - CARD_W / 2, y });
      cards.push({ simId: u.spouse, x: spouseCenterX(u) - CARD_W / 2, y });
      unions.push({ aId: u.head, bId: u.spouse, relType: u.union ?? 'coparent', x: u.anchor, y: y + CARD_H / 2, loose: false });
    } else {
      cards.push({ simId: u.head, x: u.anchor - CARD_W / 2, y });
    }
    // child connectors. A child shared by both partners drops from the union;
    // a child of only one partner drops from that partner's card alone (the
    // science-baby case — Camila hangs from Vera, not the Vera⚭Josie union).
    // Each distinct source gets its own bus height so two sources never run at
    // the same y and box up.
    if (u.kids.length) {
      const busY = y + CARD_H + LANE / 2;
      const unionStartY = u.union === 'coparent' ? y + CARD_H / 2 : y + CARD_H / 2 + RING_R;
      const headX = headCenterX(u);
      const spouseX = spouseCenterX(u);
      for (const k of u.kids) {
        const kp = parentsOf.get(k.head) ?? [];
        const fromHead = kp.includes(u.head);
        const fromSpouse = u.spouse ? kp.includes(u.spouse) : false;
        let srcX: number, startY: number;
        if (k.overflow) { srcX = u.spouse ? u.anchor : headX; startY = u.spouse ? unionStartY : y + CARD_H; }
        else if (u.spouse && fromHead && fromSpouse) { srcX = u.anchor; startY = unionStartY; }
        else if (fromSpouse && !fromHead) { srcX = spouseX; startY = y + CARD_H; }
        else { srcX = headX; startY = y + CARD_H; }
        const kx = headCenterX(k);
        const kTop = yOf(k.gen);
        // straight drop when the child sits under its source; else a single elbow
        const points = Math.abs(srcX - kx) < 1
          ? [{ x: srcX, y: startY }, { x: kx, y: kTop }]
          : [{ x: srcX, y: startY }, { x: srcX, y: busY }, { x: kx, y: busY }, { x: kx, y: kTop }];
        edges.push({ childId: k.head, points });
      }
    }
    for (const k of u.kids) emitDesc(k);
  };
  emitDesc(root);

  // Relation chips for descendants
  const setDescRelations = (u: DUnit, depth: number) => {
    if (depth > 0) {
      relationOf.set(u.head, depth === 1 ? 'child' : depth === 2 ? 'grandchild' : 'great-grandchild');
      if (u.spouse) relationOf.set(u.spouse, 'child-in-law');
    } else if (u.spouse) {
      relationOf.set(u.spouse, (u.union as FocusRelation) ?? 'partner');
    }
    for (const k of u.kids) setDescRelations(k, depth + 1);
  };
  setDescRelations(root, 0);

  // ── 4. Focus generation: siblings (leaves) flanking the focus subtree ──────
  const focusX = headCenterX(root);
  // The focus's own parents. A lone Unknown stub at the very top is clutter
  // ONLY when it sits above a single sim — there an "Unknown" card adds nothing,
  // so we suppress it and the focus becomes a top sim with the "+ add parent"
  // affordance. But when that same Unknown stub is SHARED BY SIBLINGS it's the
  // bracket that makes them read as siblings (the Pleasants hang from "Unknown"
  // in-game; the 6 Newson kids share one), so we keep it. A real parent with a
  // stub co-parent is always kept (mid-level Unknown stays).
  const realParents = (parentsOf.get(focusId) ?? []).slice(0, 2);
  const allStubParents = realParents.length > 0 && realParents.every((p) => stubs.has(p));
  const parentSet = new Set(realParents);
  const siblings: string[] = [];
  for (const p of realParents) for (const c of childrenOf.get(p) ?? []) {
    if (c !== focusId && !siblings.includes(c) && !placed.has(c)) siblings.push(c);
  }
  // Keep an all-stub top parent only when it bridges ≥2 siblings; else suppress.
  const parents = (allStubParents && siblings.length === 0) ? [] : realParents;
  const sibY = yOf(0);
  // ORDER siblings by the parent they share, so connectors never cross:
  //   [share left parent] [share both] FOCUS [spouse] [share right parent]
  // A half-sibling lands on the side of the parent it descends from, a full
  // sibling stays next to the focus, and each drops from the right source.
  const leftSibs: string[] = [], fullSibs: string[] = [], rightSibs: string[] = [];
  for (const s of siblings) {
    const sp = parentsOf.get(s) ?? [];
    const has0 = sp.includes(parents[0]);
    const has1 = parents.length === 2 && sp.includes(parents[1]);
    if (has0 && has1) fullSibs.push(s);
    else if (has1 && !has0) rightSibs.push(s);
    else leftSibs.push(s);   // shares the left parent (or a lone parent)
  }
  // Breadth fallback: cap the sibling row, collapsing overflow full-siblings
  // (the legacy case) into one chip. Distinct half-siblings always stay visible.
  const sibChipId = 'chip:siblings';
  let fullShown = fullSibs;
  let sibChip: string[] = [];
  if (siblings.length > SIB_CAP) {
    const budget = Math.max(1, SIB_CAP - leftSibs.length - rightSibs.length);
    fullShown = fullSibs.slice(0, budget);
    sibChip = fullSibs.slice(budget);
  }
  const gen0Children: { id: string; x: number }[] = [{ id: focusId, x: focusX }];
  const placeSib = (s: string, centerX: number) => {
    cards.push({ simId: s, x: centerX - CARD_W / 2, y: sibY });
    placed.add(s);
    relationOf.set(s, siblingRelation(s, parentSet, parentsOf));
    gen0Children.push({ id: s, x: centerX });
  };
  // left of the focus: full siblings nearest, then left-parent half-siblings
  let cur = focusX - CARD_W - GAPX;
  for (const s of [...fullShown, ...leftSibs]) { placeSib(s, cur); cur -= CARD_W + GAPX; }
  if (sibChip.length) {
    cards.push({ simId: sibChipId, x: cur - CARD_W / 2, y: sibY, chip: { ids: sibChip, kind: 'siblings' } });
    gen0Children.push({ id: sibChipId, x: cur });
    cur -= CARD_W + GAPX;
  }

  // Explicit relbit siblings: blood/half pairs the parent graph CAN'T derive
  // because the shared parents are culled (premade sisters like the Pleasants).
  // They share no shown parent, so they sit in the gen-0 row beside the focus
  // with NO drop-line — `noDropSibs` keeps the parent-connector pass from
  // inventing a line to a parent they don't descend from.
  const noDropSibs = new Set<string>();
  for (const s of siblingsOf.get(focusId) ?? []) {
    if (s.id === focusId || placed.has(s.id)) continue;
    cards.push({ simId: s.id, x: cur - CARD_W / 2, y: sibY });
    placed.add(s.id);
    relationOf.set(s.id, s.type === 'half' ? 'half-sibling' : 'sibling');
    gen0Children.push({ id: s.id, x: cur });
    noDropSibs.add(s.id);
    cur -= CARD_W + GAPX;
  }

  // right of the focus's spouse: right-parent half-siblings
  const rightEdge = (root.spouse ? focusX + 2 * HALF : focusX) + CARD_W + GAPX;
  cur = rightEdge;
  for (const s of rightSibs) { placeSib(s, cur); cur += CARD_W + GAPX; }

  // ── 5. Ancestors — ONE recursive pass (mirror of the descendant tree). Each
  // ancestor couple is a node whose "up-children" are its members' parent
  // couples; the node centers over those, and widths come from the actual
  // placement. Because measure and placement are the same pass, the two sides
  // can't disagree → no overlap. Connectors down to a child angle as needed
  // (standard pedigree), but never cross.
  const gen0Center = (Math.min(...gen0Children.map((c) => c.x)) + Math.max(...gen0Children.map((c) => c.x))) / 2;
  const ancestorDepth = Math.max(1, opts.ancestorDepth ?? 3);

  interface UpNode {
    members: string[];                          // couple (or single) at this gen
    gen: number;
    ups: { node: UpNode; child: string }[];     // each member's parent subtree
    aunts: Record<string, string[]>;            // member → its siblings (aunts/uncles)
    rowW: number;                               // couple + aunts width
    width: number;
    anchor: number;                             // couple union center (assigned)
    pos: Record<string, number>;                // member/aunt → card center x
  }

  const buildUp = (members: string[], gen: number, depth: number): UpNode => {
    for (const m of members) placed.add(m);
    const ups: { node: UpNode; child: string }[] = [];
    const aunts: Record<string, string[]> = {};
    if (depth < ancestorDepth) {
      members.forEach((m, mi) => {
        let ps = (parentsOf.get(m) ?? []).filter((p) => !placed.has(p)).slice(0, 2);
        // all-stub parents = a lone Unknown ancestor at the top → don't climb
        if (!ps.length || ps.every((p) => stubs.has(p))) return;
        // m's siblings = aunts/uncles (the other children of m's parents)
        const sibs: string[] = [];
        for (const p of ps) for (const c of childrenOf.get(p) ?? []) {
          if (c !== m && !placed.has(c) && !members.includes(c) && !sibs.includes(c)) sibs.push(c);
        }
        // Order the up-couple so the grandparent the aunts SHARE sits on the
        // aunts' side (a left member's aunts hang left, a right member's hang
        // right). A half-aunt drops from her shared grandparent's card; if that
        // grandparent is on the far side, her drop crosses the member's union
        // drop (Beaker: Erin shares Gudrun, but Gudrun was the right grandparent
        // while Erin sat left → crossed lines).
        if (ps.length === 2 && sibs.length) {
          const share = (p: string) => sibs.filter((s) => (parentsOf.get(s) ?? []).includes(p)).length;
          const sharedAtLeft = share(ps[0]) >= share(ps[1]);
          const wantSharedLeft = mi === 0;   // m0 → aunts left, m1 → aunts right
          if (sharedAtLeft !== wantSharedLeft) ps = [ps[1], ps[0]];
        }
        for (const s of sibs) placed.add(s);
        ups.push({ node: buildUp(ps, gen - 1, depth + 1), child: m });
        aunts[m] = sibs;
      });
    }
    const coupleW = members.length === 2 ? COUPLE_W : CARD_W;
    const auntCount = Object.values(aunts).reduce((s, a) => s + a.length, 0);
    const rowW = coupleW + auntCount * (CARD_W + GAPX);
    const upsW = ups.length ? ups.reduce((s, u) => s + u.node.width, 0) + (ups.length - 1) * GROUP_GAP : 0;
    return { members, gen, ups, aunts, rowW, width: Math.max(rowW, upsW), anchor: 0, pos: {} };
  };

  const assignUp = (node: UpNode, leftX: number) => {
    if (node.ups.length) {
      const upsW = node.ups.reduce((s, u) => s + u.node.width, 0) + (node.ups.length - 1) * GROUP_GAP;
      let cursor = leftX + (node.width - upsW) / 2;
      for (const u of node.ups) { assignUp(u.node, cursor); cursor += u.node.width + GROUP_GAP; }
    }
    // Lay out the row [member0's aunts][member0][member1][member1's aunts]
    // centered in the node's width. Maternal aunts flank member0 on the left,
    // paternal aunts flank member1 on the right, keeping the couple adjacent.
    let x = leftX + (node.width - node.rowW) / 2;
    const m0 = node.members[0];
    for (const a of node.aunts[m0] ?? []) { node.pos[a] = x + CARD_W / 2; x += CARD_W + GAPX; }
    node.pos[m0] = x + CARD_W / 2; x += CARD_W;
    if (node.members.length === 2) {
      const m1 = node.members[1];
      node.pos[m1] = node.pos[m0] + 2 * HALF;
      x = node.pos[m1] + CARD_W / 2;
      for (const a of node.aunts[m1] ?? []) { x += GAPX; node.pos[a] = x + CARD_W / 2; x += CARD_W; }
      node.anchor = (node.pos[m0] + node.pos[m1]) / 2;
    } else {
      node.anchor = node.pos[m0];
    }
  };

  // bottom of a node's couple (where a child connector starts)
  const upStartY = (members: string[], gen: number): number => {
    const y = yOf(gen);
    if (members.length < 2) return y + CARD_H;
    return unionType(members[0], members[1]) === 'coparent' ? y + CARD_H / 2 : y + CARD_H / 2 + RING_R;
  };

  // every placed ancestor's card center + generation (filled after assignUp, so
  // connectors can find a parent who sits elsewhere on the tree — the loop case
  // where a grandparent is ALSO drawn as a grand-uncle married into the line).
  const upPos = new Map<string, { x: number; gen: number }>();

  const emitUp = (node: UpNode, depth: number, shift: number) => {
    const y = yOf(node.gen);
    const memberRel: FocusRelation = depth === 1 ? 'parent' : depth === 2 ? 'grandparent' : 'great-grandparent';
    const auntRel: FocusRelation = depth === 1 ? 'aunt-uncle' : 'grand-aunt-uncle';
    if (node.members.length === 2) {
      cards.push({ simId: node.members[0], x: node.pos[node.members[0]] + shift - CARD_W / 2, y });
      cards.push({ simId: node.members[1], x: node.pos[node.members[1]] + shift - CARD_W / 2, y });
      unions.push({ aId: node.members[0], bId: node.members[1], relType: unionType(node.members[0], node.members[1]), x: node.anchor + shift, y: y + CARD_H / 2, loose: false });
    } else {
      cards.push({ simId: node.members[0], x: node.pos[node.members[0]] + shift - CARD_W / 2, y });
    }
    for (const m of node.members) relationOf.set(m, memberRel);
    for (const m of node.members) for (const a of node.aunts[m] ?? []) {
      cards.push({ simId: a, x: node.pos[a] + shift - CARD_W / 2, y });
      relationOf.set(a, auntRel);
    }
    // Each child member + aunt/uncle hangs from EVERY one of their parents that
    // is on the canvas. When two of those parents are a drawn couple (same row,
    // within a couple's width — the up-couple, OR a grandparent married to a
    // grand-uncle in a loop), the child drops from BETWEEN them (their union
    // glyph); otherwise one line per parent. A half-aunt who shares only one
    // shown grandparent thus hangs from that one alone (never reads as the
    // other's kid), while a loop child like Jennifer keeps lines to BOTH the
    // grandmother Diane and her husband-who-is-also-a-grand-uncle Jeff.
    for (const u of node.ups) {
      const baseBusY = yOf(u.node.gen) + CARD_H + LANE / 2;
      const targets = [u.child, ...(node.aunts[u.child] ?? [])];
      const drops: { t: string; srcX: number; startY: number }[] = [];
      for (const t of targets) {
        const pp = (parentsOf.get(t) ?? []).filter((p) => upPos.has(p));
        // two placed parents sitting together on a row = a drawn couple
        let pair: [string, string] | null = null;
        for (let i = 0; i < pp.length && !pair; i++) for (let j = i + 1; j < pp.length; j++) {
          const a = upPos.get(pp[i])!, b = upPos.get(pp[j])!;
          if (a.gen === b.gen && Math.abs(a.x - b.x) <= COUPLE_W) { pair = [pp[i], pp[j]]; break; }
        }
        if (pair) {
          const a = upPos.get(pair[0])!, b = upPos.get(pair[1])!;
          const ringed = unionType(pair[0], pair[1]) !== 'coparent';
          drops.push({ t, srcX: (a.x + b.x) / 2, startY: yOf(a.gen) + CARD_H / 2 + (ringed ? RING_R : 0) });
          for (const p of pp) if (p !== pair[0] && p !== pair[1]) {
            const pos = upPos.get(p)!; drops.push({ t, srcX: pos.x, startY: yOf(pos.gen) + CARD_H });
          }
        } else {
          for (const p of pp) { const pos = upPos.get(p)!; drops.push({ t, srcX: pos.x, startY: yOf(pos.gen) + CARD_H }); }
        }
      }
      // distinct sources get their own bus height so two drops never share a y
      // and read as one fork off a couple
      const lane = new Map<number, number>();
      for (const d of drops) if (!lane.has(d.srcX)) lane.set(d.srcX, lane.size);
      const laneShift = [0, 18, -18, 36, -36];
      for (const d of drops) {
        const kx = node.pos[d.t] + shift;
        const busY = baseBusY + (lane.size > 1 ? laneShift[lane.get(d.srcX)! % laneShift.length] : 0);
        edges.push({ childId: d.t, points: Math.abs(d.srcX - kx) < 1
          ? [{ x: d.srcX, y: d.startY }, { x: kx, y }]
          : [{ x: d.srcX, y: d.startY }, { x: d.srcX, y: busY }, { x: kx, y: busY }, { x: kx, y }] });
      }
      emitUp(u.node, depth + 1, shift);
    }
  };

  if (parents.length) {
    const top = buildUp(parents, -1, 1);
    assignUp(top, 0);
    const shift = gen0Center - top.anchor;
    const collectPos = (n: UpNode) => {
      for (const m of n.members) upPos.set(m, { x: n.pos[m] + shift, gen: n.gen });
      for (const m of n.members) for (const a of n.aunts[m] ?? []) upPos.set(a, { x: n.pos[a] + shift, gen: n.gen });
      for (const c of n.ups) collectPos(c.node);
    };
    collectPos(top);
    emitUp(top, 1, shift);
    // Connect parents down to focus + siblings. A child of both shown parents
    // drops from the union; a half-sibling (only one shown parent) drops from
    // that parent's card alone, so it doesn't read as the other parent's kid.
    const py = yOf(-1);
    const baseBusY = py + CARD_H + LANE / 2;
    const unionStartY = upStartY(parents, -1);
    const p0c = parents.length === 2 ? gen0Center - HALF : gen0Center;
    const p1c = gen0Center + HALF;
    const drops = gen0Children.filter((ch) => !noDropSibs.has(ch.id)).map((ch) => {
      // the collapsed-siblings chip stands in for full siblings → from the union
      if (ch.id === sibChipId) return { ch, srcX: gen0Center, startY: unionStartY };
      const cp = parentsOf.get(ch.id) ?? [];
      const has0 = cp.includes(parents[0]);
      const has1 = parents.length === 2 && cp.includes(parents[1]);
      if (parents.length === 2 && has0 && has1) return { ch, srcX: gen0Center, startY: unionStartY };
      if (has1 && !has0) return { ch, srcX: p1c, startY: py + CARD_H };
      return { ch, srcX: p0c, startY: py + CARD_H };
    });
    // each distinct drop source gets its own bus height so a half-sibling's bus
    // never merges with the union bus (which read as one fork off the union)
    const lane = new Map<number, number>();
    for (const d of drops) if (!lane.has(d.srcX)) lane.set(d.srcX, lane.size);
    const laneShift = [0, 20, -20, 40, -40];
    for (const d of drops) {
      const busY = baseBusY + (lane.size > 1 ? laneShift[lane.get(d.srcX)! % laneShift.length] : 0);
      edges.push({ childId: d.ch.id, points: Math.abs(d.srcX - d.ch.x) < 1
        ? [{ x: d.srcX, y: d.startY }, { x: d.ch.x, y: sibY }]
        : [{ x: d.srcX, y: d.startY }, { x: d.srcX, y: busY }, { x: d.ch.x, y: busY }, { x: d.ch.x, y: sibY }] });
    }
  }

  // ── 5.5 Loose unions: a couple bond between two PLACED sims that isn't drawn
  // as an adjacent couple (e.g. a parent married to an aunt — the loop
  // marriages this save has). Draw it as a point-to-point dashed union so the
  // marriage never silently disappears. ───────────────────────────────────────
  const ukey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const drawn = new Set(unions.map((u) => ukey(u.aId, u.bId)));
  const loosePlaced = new Set(cards.map((c) => c.simId));
  for (const r of relationships) {
    if (!COUPLE_TYPES.has(r.relType)) continue;
    const key = ukey(r.simAId, r.simBId);
    if (drawn.has(key) || !loosePlaced.has(r.simAId) || !loosePlaced.has(r.simBId)) continue;
    drawn.add(key);
    unions.push({ aId: r.simAId, bId: r.simBId, relType: r.relType, x: 0, y: 0, loose: true });
  }

  // ── 5.6 "Add parent" affordances: a top-of-tree sim that has NO parent at
  // all in the data (founders + the focus/its spouse when parentless). A sim
  // whose parent is an Unknown stub already shows the +add stub card, so it's
  // excluded here. ────────────────────────────────────────────────────────────
  const addParentIds = new Set<string>();
  const offerAddParent = (id: string) => {
    if (stubs.has(id)) return;
    // offer when there's no REAL parent shown — no parents at all, or only
    // suppressed Unknown stubs (a real parent + stub co-parent does not qualify;
    // that stub already shows its own +add card)
    if ((parentsOf.get(id) ?? []).some((p) => !stubs.has(p))) return;
    addParentIds.add(id);
  };
  // Only offer "+add parent" on the focus when NO parent card sits above it.
  // A kept Unknown stub (the shared-sibling case) is a shown parent → no offer.
  if (parents.length === 0) offerAddParent(root.head);
  if (root.spouse) offerAddParent(root.spouse);
  for (const [id] of upPos) offerAddParent(id);
  // A shown Unknown stub bridging siblings is the top of that line — make IT
  // build-up-able (the +add lands on the Unknown card), so the line can be
  // extended and named upward instead of dead-ending at the Unknown.
  if (allStubParents && siblings.length > 0) for (const p of parents) addParentIds.add(p);

  // ── 6. Normalize to a (0,0)-anchored, padded canvas ────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + CARD_W); maxY = Math.max(maxY, c.y + CARD_H); }
  const dx = PAD - minX, dy = PAD - minY;
  for (const c of cards) { c.x += dx; c.y += dy; c.relation = relationOf.get(c.simId); }
  for (const u of unions) { u.x += dx; u.y += dy; }
  for (const e of edges) e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

  return { cards, unions, edges, addParentIds, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function bondRank(t: SimRelType | null): number {
  const order: Record<string, number> = { spouse: 0, engaged: 1, partner: 2, ex_spouse: 3, ex_fiance: 4, ex_partner: 5 };
  return t ? (order[t] ?? 9) : 9;
}

function siblingRelation(
  sib: string, focusParents: Set<string>, parentsOf: Map<string, string[]>,
): FocusRelation {
  const sp = parentsOf.get(sib) ?? [];
  const shared = sp.filter((p) => focusParents.has(p)).length;
  const full = focusParents.size > 0 && shared === focusParents.size && sp.length === focusParents.size;
  return full ? 'sibling' : 'half-sibling';
}
