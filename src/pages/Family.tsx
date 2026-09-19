/**
 * /family — the family tree. One canvas: the hourglass (full lineage centered
 * on the viewed sim — ancestors fan up, descendants fan down), v5 card visuals,
 * union rings between couples (linked = together, separated = ex, dotted =
 * co-parents), warm paper canvas, always-docked right detail panel. Click any
 * card to re-center; drag to pan; ⌘/ctrl-scroll or pinch to zoom. The landing
 * grid picks a family/sim; auto-entry anchors on the youngest-gen heir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSaveFile } from '../store/useSaveFile';
import type { Sim, SimRelType } from '../types';
import {
  familyComponents, pickFamilyAnchor,
  CARD_W, CARD_H, COUPLE_GAP, RING_R,
  type FamilyLayout, type PlacedUnion,
} from '../lib/familyTree/layout';
import { buildHourglassLayout } from '../lib/familyTree/hourglass';
import { makeDemoFamily } from '../lib/familyTree/demoFamilies';
import { SimCard } from '../components/familyTree/SimCard';
import { FocusPanel } from '../components/familyTree/FocusPanel';
import { FamilyLanding } from '../components/familyTree/FamilyLanding';
import { AddAncestorModal } from '../components/familyTree/AddAncestorModal';
import { EditUnionModal } from '../components/familyTree/EditUnionModal';
import { OverflowChipCard, OverflowGridModal } from '../components/familyTree/OverflowChip';
import { SetSimPhotoModal } from '../components/familyTree/SetSimPhotoModal';
import { GhostIcon } from '../components/familyTree/icons';
import { Tooltip } from '../components/common/Tooltip';

// Glyph tiers (user-confirmed): wedding rings are for marriage-tier bonds
// only. Partners get a single circle, co-parents a bare dotted line.
const MARRIAGE_BONDS = new Set(['spouse', 'engaged']);
const EX_MARRIAGE_BONDS = new Set(['ex_spouse', 'ex_fiance']);
// panel ordering: current bonds first, then exes
const BOND_ORDER: Record<string, number> = {
  spouse: 0, engaged: 1, partner: 2, ex_spouse: 3, ex_fiance: 4, ex_partner: 5,
};

/** v5 ring glyph: linked rings = married/engaged, separated = divorced. */
function RingGlyph({ x, y, current }: { x: number; y: number; current: boolean }) {
  const col = current ? '#7c5cbf' : '#8a8170';
  const off = current ? 3.6 : 5.6;
  const r = current ? 5 : 4.4;
  return (
    <g>
      <circle cx={x} cy={y} r={13} fill="#fff" stroke={col} strokeWidth={1.3} />
      <circle cx={x - off} cy={y} r={r} fill="none" stroke={col} strokeWidth={1.7} />
      <circle cx={x + off} cy={y} r={r} fill="none" stroke={col} strokeWidth={1.7} />
    </g>
  );
}

/** Unmarried partner glyph: one circle, not wedding rings. */
function PartnerGlyph({ x, y, current }: { x: number; y: number; current: boolean }) {
  const col = current ? '#7c5cbf' : '#8a8170';
  return (
    <g>
      <circle cx={x} cy={y} r={13} fill="#fff" stroke={col} strokeWidth={1.3} />
      <circle cx={x} cy={y} r={5} fill="none" stroke={col} strokeWidth={1.7} strokeDasharray={current ? undefined : '3 2'} />
    </g>
  );
}

function UnionGlyphs({ layout, onSelect }: { layout: FamilyLayout; onSelect?: (u: PlacedUnion) => void }) {
  const centerOf = (simId: string) => {
    const c = layout.cards.find((k) => k.simId === simId);
    return c ? { x: c.x + CARD_W / 2, y: c.y + CARD_H / 2 } : null;
  };

  const glyphFor = (u: PlacedUnion, x: number, y: number) => {
    if (u.relType === 'coparent') return null;
    if (MARRIAGE_BONDS.has(u.relType)) return <RingGlyph x={x} y={y} current />;
    if (EX_MARRIAGE_BONDS.has(u.relType)) return <RingGlyph x={x} y={y} current={false} />;
    return <PartnerGlyph x={x} y={y} current={u.relType === 'partner'} />;
  };

  const renderCompound = (u: PlacedUnion, i: number) => {
    const lx = u.x - COUPLE_GAP / 2;
    const rx = u.x + COUPLE_GAP / 2;
    const clickable = onSelect
      ? { onClick: () => onSelect(u), className: 'cursor-pointer' }
      : {};
    if (u.relType === 'coparent') {
      return (
        <g key={`u${i}`} {...clickable}>
          <line x1={lx} y1={u.y} x2={rx} y2={u.y}
            stroke="#b5ab98" strokeWidth={2.5} strokeDasharray="2 5" />
          {/* invisible fat hit area — a 2.5px dotted line is unclickable */}
          {onSelect && <line x1={lx} y1={u.y} x2={rx} y2={u.y} stroke="transparent" strokeWidth={18} />}
        </g>
      );
    }
    const current = u.relType === 'partner' || MARRIAGE_BONDS.has(u.relType);
    const dash = current ? undefined : '9 6';
    return (
      <g key={`u${i}`} {...clickable}>
        <line x1={lx} y1={u.y} x2={u.x - RING_R} y2={u.y} stroke="#a89e8f" strokeWidth={2.5} strokeDasharray={dash} />
        <line x1={u.x + RING_R} y1={u.y} x2={rx} y2={u.y} stroke="#a89e8f" strokeWidth={2.5} strokeDasharray={dash} />
        {glyphFor(u, u.x, u.y)}
        {onSelect && <circle cx={u.x} cy={u.y} r={16} fill="transparent" />}
      </g>
    );
  };

  const renderLoose = (u: PlacedUnion, i: number) => {
    const a = centerOf(u.aId);
    const b = centerOf(u.bId);
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Same generation (side by side): draw the connector edge→ring→edge so the
    // line shows in the gap instead of hiding behind the cards. Cross-gen loose
    // unions (poly across rows) keep the diagonal dashed tie.
    if (Math.abs(a.y - b.y) < 1) {
      const lx = Math.min(a.x, b.x) + CARD_W / 2;   // inner edge of the left card
      const rx = Math.max(a.x, b.x) - CARD_W / 2;   // inner edge of the right card
      const current = u.relType === 'partner' || MARRIAGE_BONDS.has(u.relType);
      const dash = current ? undefined : '9 6';
      return (
        <g key={`l${i}`}>
          <line x1={lx} y1={my} x2={mx - RING_R} y2={my} stroke="#a89e8f" strokeWidth={2.5} strokeDasharray={dash} />
          <line x1={mx + RING_R} y1={my} x2={rx} y2={my} stroke="#a89e8f" strokeWidth={2.5} strokeDasharray={dash} />
          {glyphFor(u, mx, my)}
        </g>
      );
    }
    return (
      <g key={`l${i}`}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a89e8f" strokeWidth={1.5} strokeDasharray="9 6" />
        {glyphFor(u, mx, my)}
      </g>
    );
  };

  return (
    <>
      {layout.unions.map((u, i) => (u.loose ? renderLoose(u, i) : renderCompound(u, i)))}
    </>
  );
}

export default function Family() {
  const storeSims = useSaveFile((s) => s.sims);
  const storeRelationships = useSaveFile((s) => s.relationships);
  const loadRelationships = useSaveFile((s) => s.loadRelationships);
  const saveFileId = useSaveFile((s) => s.saveFileId);
  const updateSim = useSaveFile((s) => s.updateSim);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const focusParam = searchParams.get('focus');

  // Dev/visual harness: ?demo=<kind> swaps in a synthetic wide family (no API,
  // no store) so breadth fallbacks can be eyeballed at impractical scales.
  const demo = useMemo(() => makeDemoFamily(searchParams.get('demo') ?? ''), [searchParams]);

  // The tree is the archive of what the SAVE remembers, so a sim your save has
  // never heard of who lives in a household is a planner invention and stays
  // out of it. The test is on the SIM, not its household: a real sim you move
  // into a household you built keeps their whole lineage, because what makes
  // that lineage theirs is their record in the save. An ancestor you wrote in
  // by hand also has no save record but belongs to no household, which is
  // exactly what distinguishes the two.
  const sims = useMemo(() => {
    if (demo) return demo.sims;
    const out: Record<string, Sim> = {};
    for (const s of Object.values(storeSims)) {
      if (s.sourceId === null && s.householdId !== null) continue;
      out[s.id] = s;
    }
    return out;
  }, [demo, storeSims]);

  // Edges come from the store (single source of truth). A local "loaded" flag
  // preserves the null-until-fetched semantics the layout effects rely on
  // (an empty {} is a valid loaded state, not "still loading").
  const [relsLoaded, setRelsLoaded] = useState(false);
  // Memoize so `edges` keeps a stable reference across renders. Without this,
  // Object.values(...) minted a fresh array every render → the layout memo
  // recomputed every render → the fit-to-view effect re-ran and reset zoom on
  // every render (manual zoom never stuck).
  // Edges are filtered to the sims above, so an excluded one can never place a
  // card the tree then can't draw.
  const edges = useMemo(
    () => (demo
      ? demo.edges
      : relsLoaded
        ? Object.values(storeRelationships).filter((e) => sims[e.simAId] && sims[e.simBId])
        : null),
    [demo, relsLoaded, storeRelationships, sims],
  );
  const [error, setError] = useState('');
  // The ?focus= URL param is the source of truth for "which sim" — deep links
  // from the roster/household land here, and re-centers write it back.
  const [focusId, setFocusId] = useState<string | null>(focusParam);
  const [trail, setTrail] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [editingStub, setEditingStub] = useState<Sim | null>(null);
  const [editingUnion, setEditingUnion] = useState<PlacedUnion | null>(null);
  const [addingParentFor, setAddingParentFor] = useState<{ childId: string; childLastName: string } | null>(null);
  const [viewingOverflow, setViewingOverflow] = useState<{ ids: string[]; kind: 'children' | 'siblings' } | null>(null);
  const [editingPhotoFor, setEditingPhotoFor] = useState<Sim | null>(null);
  // The stage is tracked in STATE as well as a ref. Effects that need the
  // element — fitting the tree, the wheel listener — can't use the ref alone:
  // the landing renders first, so the stage doesn't exist on the mount those
  // effects run in, and clicking a family re-renders without remounting the
  // page. Keyed on the node, they run the moment it actually attaches.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setStageEl(el);
  }, []);
  // Set once you zoom by hand, cleared whenever a new tree opens: your zoom
  // survives a window resize, but re-centering always re-fits.
  const userZoomed = useRef(false);
  const pan = useRef({ down: false, active: false, x: 0, y: 0, sx: 0, sy: 0, pid: 0 });

  useEffect(() => {
    if (!saveFileId || demo) return;
    loadRelationships()
      .then(() => setRelsLoaded(true))
      .catch((e) => setError((e as Error).message));
  }, [saveFileId, demo, loadRelationships]);

  const components = useMemo(
    () => (edges ? familyComponents(sims, edges) : []),
    [sims, edges],
  );

  // Mirror focusId off the URL param (deep link, refresh, browser back/forward).
  useEffect(() => { setFocusId(focusParam ?? null); }, [focusParam]);

  // Single-family saves skip the landing — auto-enter on the best anchor.
  // Demo mode forces its intended focus so the harness lands where we want.
  useEffect(() => {
    if (focusParam || !edges) return;
    if (demo) { setSearchParams({ demo: searchParams.get('demo')!, focus: demo.focusId }, { replace: true }); return; }
    if (components.length !== 1) return;
    const anchor = pickFamilyAnchor(components[0].simIds, edges);
    if (anchor) setSearchParams({ focus: anchor }, { replace: true });
  }, [focusParam, edges, components, demo, searchParams, setSearchParams]);

  // A focus that points at a real sim; otherwise we fall back to the landing.
  const effectiveFocus = focusId && sims[focusId] ? focusId : null;

  const layout = useMemo(() => {
    if (!edges || !effectiveFocus) return null;
    const stubIds = new Set(Object.values(sims).filter((s) => s.recordStatus === 'stub').map((s) => s.id));
    return buildHourglassLayout(effectiveFocus, edges, { stubIds });
  }, [edges, effectiveFocus, sims]);

  // Open each (re-centered) hourglass zoomed to fit the stage, so the whole
  // lineage lands on screen; the user zooms in / pans from there.
  //
  // Measured through a ResizeObserver rather than read once, because on the
  // commit that first mounts the stage the flex chain above it hasn't been
  // resolved yet and it reports the CONTENT's height — a four-generation tree
  // measured 566×1064 against its own 534×1032, which is a fit of exactly 1.
  // The tree then opened at 100% with its youngest generation below the fold.
  // The observer fires again once the stage settles to its real height, and
  // covers window resizes, which nothing used to.
  useEffect(() => {
    userZoomed.current = false;   // a new tree always opens fitted
    if (!stageEl || !layout || !layout.width || !layout.height) return;
    const fit = () => {
      if (userZoomed.current) return;
      const w = stageEl.clientWidth;
      const h = stageEl.clientHeight;
      if (!w || !h) return;
      setZoom(Math.max(0.15, Math.min((w - 32) / layout.width, (h - 32) / layout.height, 1)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stageEl);
    return () => ro.disconnect();
  }, [layout, stageEl]);

  // Pinch / ctrl+wheel zoom (plain scroll still pans). Native listener so we can
  // preventDefault the page zoom.
  useEffect(() => {
    if (!stageEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      userZoomed.current = true;
      setZoom((z) => Math.min(1, Math.max(0.15, +(z - e.deltaY * 0.0015).toFixed(3))));
    };
    stageEl.addEventListener('wheel', onWheel, { passive: false });
    return () => stageEl.removeEventListener('wheel', onWheel);
  }, [stageEl]);

  // Drag empty canvas to pan. We only capture the pointer once the drag passes
  // a small threshold — a plain click never captures, so clicks on cards and
  // union glyphs fire normally (pointer capture would otherwise swallow them).
  function onPanStart(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const stage = stageRef.current;
    if (!stage) return;
    pan.current = { down: true, active: false, x: e.clientX, y: e.clientY, sx: stage.scrollLeft, sy: stage.scrollTop, pid: e.pointerId };
  }
  function onPanMove(e: React.PointerEvent) {
    const p = pan.current;
    const stage = stageRef.current;
    if (!p.down || !stage) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.active) {
      if (Math.hypot(dx, dy) < 5) return;   // below threshold → still a potential click
      p.active = true;
      try { stage.setPointerCapture(p.pid); } catch { /* ok */ }
    }
    stage.scrollLeft = p.sx - dx;
    stage.scrollTop = p.sy - dy;
  }
  function onPanEnd(e: React.PointerEvent) {
    if (pan.current.active) { try { stageRef.current?.releasePointerCapture(e.pointerId); } catch { /* ok */ } }
    pan.current.down = false;
    pan.current.active = false;
  }

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return Object.values(sims)
      .filter((s) => s.recordStatus !== 'manual' && s.species === 'human')
      .filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [sims, search]);

  const refetchEdges = useCallback(() => {
    if (saveFileId) loadRelationships().catch(() => {});
  }, [saveFileId, loadRelationships]);

  // Sim portraits — one bulk fetch → a simId → photo-url map for tree + panel.
  const [simPhotos, setSimPhotos] = useState<Record<string, string>>({});
  const refetchSimPhotos = useCallback(() => {
    if (!saveFileId || demo) { setSimPhotos({}); return; }
    api.listSimPortraits(saveFileId).then((rows) => {
      const m: Record<string, string> = {};
      // 96px is the biggest an avatar is ever drawn (SimAvatar `panel`).
      for (const r of rows) m[r.simId] = api.photoUrl(r.filename, 96);
      setSimPhotos(m);
    }).catch(() => {});
  }, [saveFileId, demo]);
  useEffect(() => { refetchSimPhotos(); }, [refetchSimPhotos]);

  const goToFocus = useCallback((simId: string, pushHistory: boolean) => {
    if (pushHistory && focusId && simId !== focusId) setTrail((t) => [...t.slice(-19), focusId]);
    // Entering a family FROM the landing pushes a real history entry, so the
    // browser Back button returns to the landing. Re-centering WITHIN a tree
    // replaces (the internal trail + Back button handle intra-tree history), so
    // Back never steps through every sim you clicked — it jumps to the landing.
    const cameFromLanding = !focusParam;
    setFocusId(simId);
    const next: Record<string, string> = { focus: simId };
    const d = searchParams.get('demo');
    if (d) next.demo = d;   // keep the dev harness alive across re-centers
    setSearchParams(next, { replace: !cameFromLanding });
    setSearch('');
  }, [focusId, focusParam, searchParams, setSearchParams]);

  function recenter(simId: string) {
    // Unknown stubs open the Add-ancestor drawer instead of re-centering
    if (sims[simId]?.recordStatus === 'stub') { setEditingStub(sims[simId]); return; }
    if (simId === focusId) return;
    goToFocus(simId, true);
  }

  function goBack() {
    setTrail((t) => {
      const prev = t[t.length - 1];
      if (prev) goToFocus(prev, false);
      return t.slice(0, -1);
    });
  }

  function goToLanding() {
    setTrail([]);
    setFocusId(null);
    setSearchParams({}, { replace: true });
  }

  const focusSim: Sim | undefined = effectiveFocus ? sims[effectiveFocus] : undefined;

  // Kin lists for the detail panel: parents, full+half siblings, children.
  const kin = useMemo(() => {
    const empty = { parents: [] as Sim[], siblings: [] as Sim[], children: [] as Sim[] };
    if (!edges || !effectiveFocus) return empty;
    const toSims = (ids: Iterable<string>) =>
      [...new Set(ids)].map((id) => sims[id]).filter((s): s is Sim => !!s);
    const parentIds = edges.filter((e) => e.relType === 'parent' && e.simBId === effectiveFocus).map((e) => e.simAId);
    const childIds = edges.filter((e) => e.relType === 'parent' && e.simAId === effectiveFocus).map((e) => e.simBId);
    const parentSet = new Set(parentIds);
    const sibIds = edges
      .filter((e) => e.relType === 'parent' && parentSet.has(e.simAId) && e.simBId !== effectiveFocus)
      .map((e) => e.simBId);
    // Explicit relbit siblings (parentless pairs the parent graph can't derive).
    const explicitSibIds = edges
      .filter((e) => (e.relType === 'sibling' || e.relType === 'half_sibling')
        && (e.simAId === effectiveFocus || e.simBId === effectiveFocus))
      .map((e) => (e.simAId === effectiveFocus ? e.simBId : e.simAId));
    return { parents: toSims(parentIds), siblings: toSims([...sibIds, ...explicitSibIds]), children: toSims(childIds) };
  }, [edges, effectiveFocus, sims]);

  // Every couple bond touching the focus sim, for the panel — partners with
  // no shared children still deserve to be SEEN (they exist in the save).
  const partners = useMemo(() => {
    if (!edges || !effectiveFocus) return [];
    const out: Array<{ sim: Sim; relType: SimRelType }> = [];
    const seen = new Set<string>();
    for (const e of edges) {
      if (!(e.relType in BOND_ORDER)) continue;
      const other = e.simAId === effectiveFocus ? e.simBId : e.simBId === effectiveFocus ? e.simAId : null;
      if (!other || seen.has(other)) continue;
      const sim = sims[other];
      if (!sim) continue;
      seen.add(other);
      out.push({ sim, relType: e.relType });
    }
    return out.sort((a, b) => (BOND_ORDER[a.relType] ?? 9) - (BOND_ORDER[b.relType] ?? 9));
  }, [edges, effectiveFocus, sims]);

  const familyLabel = focusSim?.lastName ? `${focusSim.lastName}${focusSim.lastName.endsWith('s') ? '' : 's'}` : '';
  const multiFamily = components.length > 1;
  const showLanding = !effectiveFocus && components.length > 0;

  if (error) return <div className="h-full grid place-items-center text-sm text-c-red px-6 text-center">{error}</div>;
  if (!edges) return <div className="h-full grid place-items-center text-sm text-c-dim">Loading family tree…</div>;
  if (components.length === 0) return (
    <div className="h-full grid place-items-center text-sm text-c-dim px-6 text-center">
      No family edges stored for this save yet — re-sync it from its .save file to import the tree.
    </div>
  );
  if (showLanding) return (
    <div className="h-full px-5 py-4 max-w-[1600px] mx-auto w-full">
      <FamilyLanding
        components={components}
        sims={sims}
        relationships={edges}
        onPickFamily={(c) => { const a = pickFamilyAnchor(c.simIds, edges); if (a) goToFocus(a, false); }}
        onPickSim={(id) => goToFocus(id, false)}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col px-5 py-4 max-w-[1600px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            disabled={trail.length === 0}
            className="text-sm px-2.5 py-1.5 rounded-lg border border-c-border bg-c-base text-c-dim hover:text-c-text hover:border-c-accent disabled:opacity-40 disabled:hover:text-c-dim disabled:hover:border-c-border transition-colors"
          >
            ← Back
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-c-dim">
              {multiFamily ? (
                <Tooltip text="All families">
                  <button onClick={goToLanding} className="bg-transparent border-none p-0 m-0 cursor-pointer uppercase tracking-wider font-semibold text-c-dim hover:text-c-accent transition-colors" aria-label="All families">Family Tree</button>
                </Tooltip>
              ) : 'Family Tree'}
              {familyLabel ? ` · ${familyLabel}` : ''}
            </div>
            <div className="text-lg font-extrabold leading-tight text-c-text">
              Viewing <span className="text-c-accent-hover">{focusSim ? `${focusSim.firstName} ${focusSim.lastName}`.trim() : ''}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search-to-focus */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a sim"
              className="bg-c-base border border-c-border rounded-lg px-3 py-1.5 text-sm text-c-text w-52 outline-none focus:border-c-accent"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 right-0 w-72 bg-c-card border border-c-border rounded-lg shadow-lg z-20 overflow-hidden">
                {searchResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => recenter(s.id)}
                    className="w-full text-left px-3 py-1.5 text-sm text-c-text hover:bg-c-panel flex items-baseline gap-2"
                  >
                    <span>{`${s.firstName} ${s.lastName}`.trim() || '(unnamed)'}</span>
                    <span className="text-[10px] text-c-dim">
                      {s.recordStatus === 'stub' ? 'unknown' : s.isGhost ? (s.recordStatus === 'active' ? 'ghost' : 'deceased') : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Multi-family: the "Family Tree" breadcrumb above returns to the
              picker, so no separate button here. Single-family has no picker, so
              keep a Reset that re-centers on the family anchor. */}
          {!multiFamily && (
            <button
              onClick={() => { if (edges && components[0]) { const a = pickFamilyAnchor(components[0].simIds, edges); if (a) { setTrail([]); goToFocus(a, false); } } }}
              className="text-sm px-2.5 py-1.5 rounded-lg border border-c-border bg-c-base text-c-dim hover:text-c-text hover:border-c-accent transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Stage + panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="relative flex-1 min-h-0 rounded-2xl border border-c-border overflow-hidden">
        <div
          ref={setStage}
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerLeave={onPanEnd}
          className="absolute inset-0 flex overflow-auto cursor-grab active:cursor-grabbing select-none"
          style={{
            backgroundColor: '#faf8f3',
            backgroundImage: 'radial-gradient(circle at 1px 1px,#ece7db 1px,transparent 0)',
            backgroundSize: '30px 30px',
          }}
        >
          {layout && (() => {
            const content = (
              <div className="relative" style={{ width: layout.width, height: layout.height }}>
                <svg width={layout.width} height={layout.height} className="absolute inset-0" style={{ zIndex: 0 }}>
                  {layout.edges.map((e, i) => (
                    <polyline
                      key={i}
                      points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#a89e8f"
                      strokeWidth={2.5}
                    />
                  ))}
                  <UnionGlyphs layout={layout} onSelect={setEditingUnion} />
                </svg>
                {layout.cards.map((card) => {
                  if (card.chip) {
                    const preview = card.chip.ids.slice(0, 3).map((id) => sims[id]).filter(Boolean);
                    return (
                      <div key={card.simId} className="absolute" style={{ left: card.x, top: card.y, zIndex: 1 }}>
                        <OverflowChipCard
                          count={card.chip.ids.length}
                          kind={card.chip.kind}
                          preview={preview}
                          onOpen={() => setViewingOverflow(card.chip!)}
                        />
                      </div>
                    );
                  }
                  const sim = sims[card.simId];
                  if (!sim) return null;
                  return (
                    <div
                      key={card.simId}
                      className="absolute"
                      style={{ left: card.x, top: card.y, width: CARD_W, height: CARD_H, zIndex: 1 }}
                    >
                      <SimCard
                        sim={sim}
                        isFocus={card.simId === effectiveFocus}
                        relation={card.relation}
                        onClick={() => recenter(card.simId)}
                        photoUrl={simPhotos[card.simId]}
                      />
                    </div>
                  );
                })}
                {/* "+ add parent" above a top-of-tree sim with no parent —
                    extend the line upward by inventing an ancestor. Prominent on
                    the focused sim, quietly present on the rest. */}
                {layout.addParentIds && layout.cards.map((card) => {
                  if (!layout.addParentIds!.has(card.simId)) return null;
                  const sim = sims[card.simId];
                  if (!sim) return null;
                  const isFocus = card.simId === effectiveFocus;
                  return (
                    <button
                      key={`addp-${card.simId}`}
                      title="Add a parent"
                      onClick={(e) => { e.stopPropagation(); setAddingParentFor({ childId: card.simId, childLastName: sim.lastName }); }}
                      className={`absolute grid place-items-center h-6 w-6 rounded-full leading-none transition-all ${
                        isFocus
                          ? 'text-c-green bg-c-accent-soft border border-c-accent-border shadow-sm hover:bg-c-accent hover:text-white hover:border-c-accent'
                          : 'text-c-dim border border-c-border bg-c-card opacity-70 hover:opacity-100 hover:text-c-green hover:border-c-accent-border hover:bg-c-accent-soft'
                      }`}
                      style={{ left: card.x + CARD_W / 2, top: card.y - 34, transform: 'translateX(-50%)', zIndex: 2 }}
                    >
                      <span className="text-base font-light -mt-px">+</span>
                    </button>
                  );
                })}
              </div>
            );
            // m-auto inside the flex stage: centers when the tree is smaller
            // than the viewport, stays fully scrollable (drag-pan) when bigger.
            // zoom is 1 in focus, fit-scale in overview.
            return (
              <div className="m-auto p-4" style={{ width: layout.width * zoom + 32, height: layout.height * zoom + 32 }}>
                <div style={{ transformOrigin: 'top left', transform: `scale(${zoom})`, width: layout.width, height: layout.height }}>
                  {content}
                </div>
              </div>
            );
          })()}
        </div>
        {/* Floating zoom control — sits on the wrapper (outside the scroll
            container) so it stays put while you pan/scroll the tree. */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-c-border bg-c-card shadow-sm px-1 py-1">
          <Tooltip text="Zoom out">
            <button onClick={() => { userZoomed.current = true; setZoom((z) => Math.max(0.15, +(z - 0.1).toFixed(2))); }} className="w-7 h-7 grid place-items-center rounded-md text-c-dim hover:text-c-text hover:bg-c-panel transition-colors" aria-label="Zoom out">−</button>
          </Tooltip>
          <span className="text-xs text-c-dim tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Tooltip text="Zoom in">
            <button onClick={() => { userZoomed.current = true; setZoom((z) => Math.min(1, +(z + 0.1).toFixed(2))); }} className="w-7 h-7 grid place-items-center rounded-md text-c-dim hover:text-c-text hover:bg-c-panel transition-colors" aria-label="Zoom in">+</button>
          </Tooltip>
        </div>
        </div>
        {focusSim && (
          <FocusPanel
            sim={focusSim}
            parents={kin.parents}
            siblings={kin.siblings}
            children={kin.children}
            partners={partners}
            onSelect={recenter}
            onSaveNotes={(notes) => { if (!demo) updateSim(focusSim.id, { notes }); }}
            photoUrl={simPhotos[focusSim.id]}
            onEditPhoto={!demo && saveFileId ? () => setEditingPhotoFor(focusSim) : undefined}
            onOpenHousehold={!demo && saveFileId && focusSim.householdId
              ? () => navigate(`/saves/${saveFileId}/households?hh=${focusSim.householdId}&sim=${focusSim.id}`)
              : undefined}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-c-muted shrink-0">
        <span className="font-semibold text-c-dim uppercase tracking-wider">Legend</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#ecfdf3', boxShadow: '0 0 0 2px #16a34a inset' }} /> Male
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#f3eefb', boxShadow: '0 0 0 2px #7c5cbf inset' }} /> Female
        </span>
        <span className="text-c-faint">·</span>
        <span className="flex items-center gap-1.5"><GhostIcon /> Ghost</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block border" style={{ background: '#ede7db', borderColor: '#d8d0c1' }} /> Deceased
        </span>
        <span className="text-c-faint">·</span>
        <span className="flex items-center gap-1.5"><span style={{ color: '#7c5cbf' }}>⚭</span> married/engaged</span>
        <span className="flex items-center gap-1.5"><span style={{ color: '#8a8170' }}>⚯</span> divorced (dashed)</span>
        <span className="flex items-center gap-1.5"><span style={{ color: '#7c5cbf' }}>○</span> partners</span>
        <span className="flex items-center gap-1.5 text-c-faint">┄ co-parents</span>
        <span className="text-c-faint">·</span>
        <span className="text-c-faint">
          drag to pan · ⌘/ctrl-scroll or pinch to zoom · click a sim to re-center · click a ring or dotted line to edit a bond
        </span>
      </div>

      {editingStub && (
        <AddAncestorModal sim={editingStub} onClose={() => setEditingStub(null)} />
      )}
      {addingParentFor && (
        <AddAncestorModal
          childId={addingParentFor.childId}
          childLastName={addingParentFor.childLastName}
          onClose={() => setAddingParentFor(null)}
          onSaved={refetchEdges}
        />
      )}
      {editingPhotoFor && saveFileId && (
        <SetSimPhotoModal
          saveFileId={saveFileId}
          sim={editingPhotoFor}
          onClose={() => setEditingPhotoFor(null)}
          onChanged={refetchSimPhotos}
        />
      )}
      {viewingOverflow && (
        <OverflowGridModal
          kind={viewingOverflow.kind}
          sims={viewingOverflow.ids.map((id) => sims[id]).filter(Boolean)}
          onClose={() => setViewingOverflow(null)}
          onSelect={(id) => { setViewingOverflow(null); recenter(id); }}
        />
      )}
      {editingUnion && saveFileId && sims[editingUnion.aId] && sims[editingUnion.bId] && (
        <EditUnionModal
          saveFileId={saveFileId}
          a={sims[editingUnion.aId]}
          b={sims[editingUnion.bId]}
          existing={(edges ?? []).filter((e) =>
            e.relType !== 'parent'
            && ((e.simAId === editingUnion.aId && e.simBId === editingUnion.bId)
              || (e.simAId === editingUnion.bId && e.simBId === editingUnion.aId)))}
          onClose={() => setEditingUnion(null)}
          onChanged={refetchEdges}
        />
      )}
    </div>
  );
}
