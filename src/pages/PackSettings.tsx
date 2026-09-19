/**
 * Pack ownership settings. The default behavior is "all packs owned" until
 * a save is imported, at which point auto-detect refines the set. This page
 * is the explicit override — Force on / Force off / Auto per pack.
 *
 * Most users won't open this page. It's the escape hatch for advanced save
 * creators or anyone whose auto-detect didn't infer the right set.
 */
import { useMemo, useState } from 'react';
import { CaretDown, MagnifyingGlass, Package } from '@phosphor-icons/react';
import { PACKS, type Pack, type PackType } from '../data/packs';
import { usePackOwnership, type OverrideState } from '../store/usePackOwnership';
import { useConfirm } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';

const TYPE_GROUPS: { type: PackType; label: string }[] = [
  { type: 'base', label: 'Base Game' },
  { type: 'EP',   label: 'Expansion Packs' },
  { type: 'GP',   label: 'Game Packs' },
  { type: 'SP',   label: 'Stuff Packs & Kits' },
];

export default function PackSettings() {
  const [query, setQuery] = useState('');
  // All four open. Stuff Packs used to start collapsed, which made the longest
  // group the only one you had to go looking for — and it holds the packs
  // detection is least likely to find on its own, so it's the group most likely
  // to need a manual switch.
  const [openGroups, setOpenGroups] = useState<Record<PackType, boolean>>({
    base: true, EP: true, GP: true, SP: true,
  });

  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const lastDetectedAt = usePackOwnership((s) => s.lastDetectedAt);
  const setOverride = usePackOwnership((s) => s.setOverride);
  const clearOverrides = usePackOwnership((s) => s.clearOverrides);
  const reset = usePackOwnership((s) => s.reset);
  const confirmDialog = useConfirm();

  const lowerQ = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!lowerQ) return PACKS;
    return PACKS.filter((p) => p.name.toLowerCase().includes(lowerQ) || p.id.toLowerCase().includes(lowerQ));
  }, [lowerQ]);

  const byType = useMemo(() => {
    const m: Record<PackType, Pack[]> = { base: [], EP: [], GP: [], SP: [] };
    for (const p of filtered) m[p.type].push(p);
    return m;
  }, [filtered]);

  const autoSet = useMemo(() => new Set(autoDetected), [autoDetected]);
  const noImportsYet = autoDetected.length === 0;

  // Summary counts for the header
  const counts = useMemo(() => {
    let owned = 0, forcedOn = 0, forcedOff = 0;
    for (const p of PACKS) {
      const ov = manualOverrides[p.id];
      if (ov === 'on') forcedOn++;
      if (ov === 'off') forcedOff++;
      const effectivelyOwned = p.id === 'base'
        || ov === 'on'
        || (ov !== 'off' && (noImportsYet || autoSet.has(p.id)));
      if (effectivelyOwned) owned++;
    }
    return { owned, forcedOn, forcedOff };
  }, [manualOverrides, autoSet, noImportsYet]);

  const hasOverrides = counts.forcedOn + counts.forcedOff > 0;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-6 flex items-start gap-4">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-c-secondary-soft flex items-center justify-center">
          <Package size={24} weight="duotone" className="text-c-secondary" />
        </div>
        <div>
          {/* No subtitle: the "How this works" box below already explains that
              detection is automatic and this page is the override. */}
          <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline leading-tight">Pack ownership</h1>
        </div>
      </header>

      {/* Every line here was once wrong in a way that mattered: it said we
          "hide" what you don't own (nothing is hidden), and it never said this
          covers your whole account or that syncing only ever adds. */}
      <div className="rounded-2xl bg-c-secondary-soft border border-c-secondary-border p-5 mb-5">
        <p className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-3">How this works</p>
        <ul className="space-y-1.5 text-sm text-c-text">
          <li className="flex gap-2">
            <span className="text-c-secondary font-bold">•</span>
            <span>Every pack is on until you sync a save.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-c-secondary font-bold">•</span>
            <span>Syncing switches on the packs it can see evidence of in your save. It only ever adds — and it covers <span className="font-semibold">all your saves</span>, not just this one.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-c-secondary font-bold">•</span>
            <span>A pack that's off is never in your way. Its pages still open; its content just stays out of the pickers.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-c-secondary font-bold">•</span>
            <span>Own something we missed? Set it <span className="font-semibold">On</span> yourself — that beats everything else.</span>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl bg-c-card border border-c-border p-4 mb-5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <div>
            <span className="font-bold text-c-text tabular-nums">{counts.owned}</span>
            <span className="text-c-dim"> / {PACKS.length} packs on</span>
          </div>
          {counts.forcedOn > 0 && (
            <div className="text-2xs text-c-dim">
              <span className="font-semibold text-c-accent">{counts.forcedOn}</span> set on
            </div>
          )}
          {counts.forcedOff > 0 && (
            <div className="text-2xs text-c-dim">
              <span className="font-semibold text-c-red">{counts.forcedOff}</span> set off
            </div>
          )}
          <div className="text-2xs text-c-dim">
            {noImportsYet
              ? 'No save imported yet — all packs on by default'
              : `Auto-detected from imported saves · ${lastDetectedAt ? new Date(lastDetectedAt).toLocaleString() : '—'}`}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-c-dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packs..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-c-card border border-c-border rounded-lg outline-none focus:border-c-accent"
          />
        </div>
        {/* The everyday one: undo your own corrections, keep what the saves
            proved. Only offered when there's something to undo. */}
        {hasOverrides && (
          <button
            type="button"
            onClick={async () => {
              if (await confirmDialog({
                message: 'Put every pack back to Auto? Your On and Off switches go; what your saves detected stays.',
                confirmLabel: 'Back to Auto',
              })) clearOverrides();
            }}
            className="text-2xs text-c-dim hover:text-c-text bg-transparent border border-c-border rounded-lg px-3 py-2 cursor-pointer hover:border-c-border-mid transition-colors whitespace-nowrap"
          >
            Back to Auto
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={<Package size={24} weight="duotone" />}
          title="No packs match"
          description={`Nothing here is called “${query.trim()}”. Only the packs that unlock something in the planner are listed — kits that just add objects and clothes aren't tracked.`}
          cta={{ label: 'Clear search', onClick: () => setQuery('') }}
        />
      )}

      <div className="space-y-3">
        {TYPE_GROUPS.map(({ type, label }) => {
          const packs = byType[type];
          if (packs.length === 0) return null;
          // A search opens whatever it found. Stuff Packs starts collapsed, so
          // searching for one used to leave its heading counting 1 with no row
          // under it — the page appearing to hide the thing you asked for.
          const isOpen = openGroups[type] || !!lowerQ;
          return (
            <section key={type} className="rounded-2xl bg-c-card border border-c-border overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenGroups((s) => ({ ...s, [type]: !s[type] }))}
                className="w-full flex items-center justify-between px-5 py-3 bg-transparent border-none cursor-pointer hover:bg-c-panel transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-bold text-c-secondary tracking-display">{label}</h2>
                  <span className="text-2xs text-c-dim">{packs.length}</span>
                </div>
                <CaretDown size={12} weight="bold" className={`text-c-faint transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              </button>
              {isOpen && (
                <div className="border-t border-c-border">
                  {packs.map((p) => {
                    const ov = manualOverrides[p.id];
                    const isAutoDetected = autoSet.has(p.id);
                    return (
                      <PackRow
                        key={p.id}
                        pack={p}
                        override={ov ?? null}
                        autoDetected={isAutoDetected}
                        noImportsYet={noImportsYet}
                        notFound={!noImportsYet && !isAutoDetected && ov === undefined && p.id !== 'base'}
                        onChange={(state) => setOverride(p.id, state)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* The full wipe, named by what it LEAVES rather than what it clears —
          the old single "Reset all" read as the destructive choice while being
          the permissive one. Detection can't be re-run on demand, so forgetting
          it is the rarer, heavier action and sits down here on its own. */}
      {(hasOverrides || autoDetected.length > 0) && (
        <div className="mt-6 pt-5 border-t border-c-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-2xs text-c-faint leading-snug max-w-md">
            Starting over turns every pack on and forgets what your saves have shown. The next sync works it out again from scratch.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (await confirmDialog({
                message: 'Turn every pack on and forget what your saves detected? Your next sync starts the detection over.',
                confirmLabel: 'Turn everything on',
              })) reset();
            }}
            className="text-2xs font-semibold text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer p-0 underline underline-offset-2 decoration-c-border hover:decoration-c-border-mid transition-colors"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function PackRow({
  pack, override, autoDetected, noImportsYet, notFound, onChange,
}: {
  pack: Pack;
  override: OverrideState | null;
  autoDetected: boolean;
  noImportsYet: boolean;
  notFound: boolean;
  onChange: (state: OverrideState | null) => void;
}) {
  // base game can't be toggled
  const isBase = pack.id === 'base';
  const effectivelyOwned = isBase
    || override === 'on'
    || (override !== 'off' && (noImportsYet || autoDetected));

  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-c-border last:border-b-0 hover:bg-c-panel transition-colors">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`text-sm ${effectivelyOwned ? 'text-c-text font-medium' : 'text-c-dim'}`}>{pack.name}</span>
        <span className="text-2xs text-c-faint tabular-nums">{pack.id}</span>
        {autoDetected && !isBase && (
          <span className="text-2xs px-1.5 py-0.5 rounded bg-c-accent-soft text-c-accent border border-c-accent-border font-semibold">
            auto-detected
          </span>
        )}
        {notFound && (
          <span className="text-2xs px-1.5 py-0.5 rounded bg-c-panel text-c-dim border border-c-border font-semibold">
            not found in imported saves
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isBase ? (
          <span className="text-2xs text-c-dim italic">always owned</span>
        ) : (
          <TriState value={override} resolvedOwned={effectivelyOwned} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function TriState({ value, resolvedOwned, onChange }: {
  value: OverrideState | null;
  /** What Auto currently resolves to for this pack. Auto is the default on
   *  every row, so colouring it green regardless meant a fully locked account
   *  read as 48 green rows — the colour saying "fine" over the whole page. */
  resolvedOwned: boolean;
  onChange: (s: OverrideState | null) => void;
}) {
  const opts: { state: OverrideState | null; label: string }[] = [
    { state: null, label: 'Auto' },
    { state: 'on', label: 'On' },
    { state: 'off', label: 'Off' },
  ];
  return (
    <div className="inline-flex border border-c-border rounded-md overflow-hidden">
      {opts.map((o, i) => {
        const active = value === o.state;
        // On = full accent green, Off = red, Auto = whichever of those it is
        // currently standing in for, softly: green when the pack is on, plain
        // when it isn't.
        const activeClass = o.state === 'on' ? 'bg-c-accent text-white'
                          : o.state === 'off' ? 'bg-c-red text-white'
                          : resolvedOwned ? 'bg-c-accent-soft text-c-green' : 'bg-c-panel text-c-dim';
        return (
          <button
            key={String(o.state)}
            type="button"
            onClick={() => onChange(o.state)}
            className={`text-2xs px-2.5 py-1 font-semibold cursor-pointer border-none transition-colors ${
              active ? activeClass : 'bg-transparent text-c-dim hover:bg-c-panel'
            } ${i > 0 ? 'border-l border-c-border' : ''}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
