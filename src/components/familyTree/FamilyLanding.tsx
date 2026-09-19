/**
 * Family Tree landing — shown when /family is opened without a ?focus sim and
 * the save has more than one family line. A compact search (jump straight to
 * anyone) over a size-sorted grid of family-line tiles; jump to a whole line
 * on its best anchor. Single-family saves skip this and drop in.
 *
 * Each tile's art is a MINI TREE: that family's real parent structure drawn
 * as dots and lines, dots in the gender colours, ghosts faded. The art is the
 * data — a four-generation dynasty looks deep, a young couple looks young,
 * and no two tiles are alike. Big lines are CAPPED (first 4 generations, 6
 * dots per row) so a 40-person clan reads as a shape, not a smudge; the count
 * line underneath carries the true size.
 */
import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { Sim, SimRelationship } from '../../types';
import type { FamilyComponent } from '../../lib/familyTree/layout';
import { initials } from './SimCard';

interface FamilyLandingProps {
  components: FamilyComponent[];
  sims: Record<string, Sim>;
  relationships: SimRelationship[];
  onPickFamily: (c: FamilyComponent) => void;
  onPickSim: (simId: string) => void;
}

const INITIAL_SHOWN = 16;   // a clean 4-col × 4-row grid (no empty slots)

// ── the mini tree ──────────────────────────────────────────────────────────

const MAX_ROWS = 4;      // generations drawn; deeper ones exist only in the count
const MAX_PER_ROW = 6;   // dots per generation row

interface MiniDot { x: number; y: number; male: boolean; ghost: boolean }
interface MiniEdge { x1: number; y1: number; x2: number; y2: number }
interface MiniTree { dots: MiniDot[]; edges: MiniEdge[]; generations: number }

/**
 * A family's parent edges → generation rows → dot positions. Generation =
 * longest parent-chain above the sim (so a sim with a young parent and an old
 * one sits below both). Cycle-guarded: save data does occasionally assert a
 * sim as their own ancestor via merged duplicates, and the guard just cuts
 * the loop rather than throwing the page.
 */
function buildMiniTree(
  c: FamilyComponent,
  sims: Record<string, Sim>,
  relationships: SimRelationship[],
): MiniTree {
  const inSet = (id: string) => c.simIds.has(id) && !!sims[id] && sims[id].recordStatus !== 'stub';
  const parentsOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.relType !== 'parent' || !inSet(r.simAId) || !inSet(r.simBId)) continue;
    const arr = parentsOf.get(r.simBId);
    if (arr) { if (!arr.includes(r.simAId)) arr.push(r.simAId); } else parentsOf.set(r.simBId, [r.simAId]);
  }

  const depthMemo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    const memo = depthMemo.get(id);
    if (memo !== undefined) return memo;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = parentsOf.get(id) ?? [];
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => depth(p, seen)));
    depthMemo.set(id, d);
    return d;
  };

  const members = [...c.simIds].filter(inSet);
  for (const id of members) depth(id, new Set());
  const generations = members.length ? 1 + Math.max(...members.map((id) => depthMemo.get(id) ?? 0)) : 0;

  // Rows: parents of drawn sims first within each generation, so drawn edges
  // land on drawn dots as often as the cap allows.
  const drawnParents = new Set(parentsOf.keys());
  const byRow: string[][] = [];
  for (const id of members) {
    const d = Math.min(depthMemo.get(id) ?? 0, MAX_ROWS - 1);
    (byRow[d] ??= []).push(id);
  }
  const pos = new Map<string, { x: number; y: number }>();
  const dots: MiniDot[] = [];
  const W = 64;
  const rowsDrawn = Math.min(byRow.length, MAX_ROWS);
  for (let r = 0; r < rowsDrawn; r++) {
    const row = (byRow[r] ?? [])
      .sort((a, b) => Number(drawnParents.has(b)) - Number(drawnParents.has(a)))
      .slice(0, MAX_PER_ROW);
    // Barycenter pass: place each sim near the average x of its already-placed
    // parents, so children sit UNDER their parents and sibling lines fall
    // straight instead of crossing the whole tile.
    const bary = (id: string): number => {
      const ps = (parentsOf.get(id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : W / 2;
    };
    if (r > 0) row.sort((a, b) => bary(a) - bary(b));
    const y = rowsDrawn === 1 ? 26 : 7 + (r * 38) / (rowsDrawn - 1);
    row.forEach((id, i) => {
      const x = ((i + 1) * W) / (row.length + 1);
      pos.set(id, { x, y });
      dots.push({ x, y, male: sims[id].gender === 'male', ghost: !!sims[id].isGhost });
    });
  }

  // One line per CHILD, from the couple's midpoint — not one per parent.
  // Two parents each drawing to every child makes the lines X-cross between
  // siblings; joining the couple with a short bar and fanning out from its
  // middle is the same trick the real tree's union rings do, at 64px.
  const edges: MiniEdge[] = [];
  const couples = new Map<string, { anchor: { x: number; y: number }; children: string[] }>();
  for (const [child, ps] of parentsOf) {
    if (!pos.get(child)) continue;
    const placed = ps.filter((p) => pos.get(p));
    if (!placed.length) continue;
    const key = [...placed].sort().join('+');
    let entry = couples.get(key);
    if (!entry) {
      const xs = placed.map((p) => pos.get(p)!);
      entry = {
        anchor: { x: xs.reduce((a, b) => a + b.x, 0) / xs.length, y: xs[0].y },
        children: [],
      };
      couples.set(key, entry);
      if (xs.length > 1) {
        const [a, b] = [xs[0], xs[xs.length - 1]];
        edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); // the couple bar
      }
    }
    entry.children.push(child);
  }
  for (const { anchor, children } of couples.values()) {
    for (const child of children) {
      const cp = pos.get(child)!;
      edges.push({ x1: anchor.x, y1: anchor.y, x2: cp.x, y2: cp.y });
    }
  }
  return { dots, edges, generations };
}

/** The gender colours as literal values — SVG needs real colours, and the
    tokens (`--c-accent`, `--c-secondary`) are what these are. Ghosts go
    parchment, like the tree's own ghost cards. */
const DOT = {
  male: '#16a34a',
  female: '#7c5cbf',
  ghost: '#b3a98f',
};

function MiniTreeArt({ tree }: { tree: MiniTree }) {
  return (
    <svg viewBox="0 0 64 52" className="w-16 h-[52px] shrink-0 overflow-visible" aria-hidden>
      {tree.edges.map((e, i) => (
        <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#ddd5c5" strokeWidth={1.4} />
      ))}
      {tree.dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={4}
          fill={d.ghost ? DOT.ghost : d.male ? DOT.male : DOT.female}
          opacity={d.ghost ? 0.55 : 1}
          stroke="#fff"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}

function Avatar({ sim }: { sim: Sim }) {
  const male = sim.gender === 'male';
  const dead = sim.isGhost;
  return (
    <div
      className="w-9 h-9 rounded-full grid place-items-center text-[11px] font-extrabold border-2 border-white shrink-0"
      style={{
        background: dead ? '#e0dacd' : male ? '#ecfdf3' : '#f3eefb',
        color: dead ? '#8a8170' : male ? '#15803d' : '#7c5cbf',
      }}
    >
      {initials(sim.firstName, sim.lastName)}
    </div>
  );
}

interface FamilyStat {
  c: FamilyComponent;
  title: string;
  total: number;
  tree: MiniTree;
}

function FamilyTile({ s, onClick }: { s: FamilyStat; onClick: () => void }) {
  const gens = s.tree.generations;
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 text-left bg-c-card border border-c-border rounded-2xl px-5 py-4 hover:border-c-accent hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      <MiniTreeArt tree={s.tree} />
      <div className="min-w-0">
        <div className="font-extrabold text-[17px] text-c-text leading-tight truncate">{s.title}</div>
        <div className="text-sm text-c-dim mt-0.5">
          {s.total} {s.total === 1 ? 'person' : 'people'}
          {gens > 1 && <> · {gens} generations</>}
        </div>
      </div>
    </button>
  );
}

export function FamilyLanding({ components, sims, relationships, onPickFamily, onPickSim }: FamilyLandingProps) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Per-family stats, sorted by real (non-stub) member count desc.
  const families = useMemo<FamilyStat[]>(() => {
    return components
      .map((c) => {
        const total = [...c.simIds].filter((id) => sims[id] && sims[id].recordStatus !== 'stub').length;
        const primary = (c.label.split(' · ')[0] || '(unnamed)');
        return {
          c,
          // The family name exactly as-is — no "The " prefix and no pluralizing
          // "s" (appending one mangles names that shouldn't take it).
          title: primary,
          total,
          tree: buildMiniTree(c, sims, relationships),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [components, sims, relationships]);

  const shown = showAll ? families : families.slice(0, INITIAL_SHOWN);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    return Object.values(sims)
      .filter((s) => s.species === 'human')
      .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [sims, q]);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl w-full px-6 pt-8 pb-10">
        {/* Header + search */}
        <div className="text-center">
          {/* No subtitle: the search box states its own job in the placeholder,
              and the family count sits on the grid it counts. */}
          <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline mb-6">Family Tree</h1>
          <div className="relative w-full max-w-md mx-auto">
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for a sim"
              autoFocus
              className="w-full bg-white border border-c-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-c-text shadow-sm focus:border-c-accent outline-none"
            />
            {results.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-c-border rounded-xl shadow-lg z-20 overflow-hidden text-left">
                {results.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onPickSim(s.id)}
                    className="w-full text-left px-3 py-2 text-sm text-c-text hover:bg-c-panel flex items-center gap-2.5"
                  >
                    <Avatar sim={s} />
                    <span className="flex-1 truncate">{`${s.firstName} ${s.lastName}`.trim() || '(unnamed)'}</span>
                    <span className="text-[10px] text-c-dim shrink-0">
                      {s.recordStatus === 'stub' ? 'unknown'
                        : s.recordStatus === 'manual' ? 'added'
                        : s.isGhost ? (s.recordStatus === 'active' ? 'ghost' : 'deceased') : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Family grid — biggest first */}
        <div className="mt-8">
          <div className="text-2xs uppercase tracking-label font-semibold text-c-dim mb-3">
            {families.length} {families.length === 1 ? 'family' : 'families'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {shown.map((s, i) => (
              <FamilyTile key={i} s={s} onClick={() => onPickFamily(s.c)} />
            ))}
          </div>
          {families.length > INITIAL_SHOWN && (
            <div className="mt-5 text-center">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-sm px-4 py-2 rounded-lg border border-c-border bg-white text-c-muted hover:bg-c-panel hover:text-c-text transition-colors"
              >
                {showAll ? 'Show fewer' : `Show all ${families.length} families`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
