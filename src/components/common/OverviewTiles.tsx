import type { ReactNode } from 'react';

/**
 * Shared "at a glance" overview primitives for the manager-page landing states
 * (Households, Dynasties, Small Businesses, Clubs, Custom Venues, Mods).
 *
 * Visual system is a cousin of the Diversity HeroStrip card: a neutral
 * white→panel gradient card where colour is a garnish — a small dot by the
 * label plus a soft-tinted icon chip. Two hues only: green (`c-accent`, for
 * people/homes) and plum (`c-secondary`, for places/venues), plus a neutral.
 * No amber; "gap" stats read from their label, never an alarm colour.
 *
 * `HeroSplit` is the full-width lead tile: a total plus a two-segment bar,
 * used for "X from your save · Y planned" (green=save, plum=planned — the
 * app's field-state grammar) and, on Households, "My Households · Rest of Town".
 */

export type Tone = 'green' | 'plum' | 'neutral';

const DOT: Record<Tone, string> = {
  green: 'bg-c-accent',
  plum: 'bg-c-secondary',
  neutral: 'bg-c-faint',
};

const ICON_WRAP: Record<Tone, string> = {
  green: 'bg-c-accent-soft text-c-accent',
  plum: 'bg-c-secondary-soft text-c-secondary',
  neutral: 'bg-c-panel text-c-dim',
};

const BAR: Record<Tone, string> = {
  green: 'bg-c-accent',
  plum: 'bg-c-secondary',
  neutral: 'bg-c-faint',
};

/** A single stat tile: label + dot, big value, optional sub, soft icon chip. */
export function StatTile({
  label, value, sub, tone = 'neutral', icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[118px] rounded-2xl border border-c-border bg-gradient-to-br from-c-card to-c-panel px-[18px] py-[18px]">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-2.5 text-3xs font-bold uppercase tracking-label-lg text-c-dim">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[tone]}`} />
          <span className="truncate">{label}</span>
        </div>
        <div className="text-2xl font-bold text-c-text tracking-display leading-none tabular-nums">{value}</div>
        {sub != null && <div className="text-2xs text-c-dim mt-1.5 truncate">{sub}</div>}
      </div>
      <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${ICON_WRAP[tone]}`}>
        {icon}
      </div>
    </div>
  );
}

export interface HeroSegment {
  value: number;
  label: string;
  tone: Tone;
}

/**
 * Full-width lead tile: total + a two-segment proportion bar with a legend.
 * The first segment gets an explicit width (its share of the total); the
 * second fills the rest. Spans the whole grid via `col-span-full`.
 */
export function HeroSplit({
  total, label, segments,
}: {
  total: number;
  label: string;
  segments: [HeroSegment, HeroSegment];
}) {
  const [first, second] = segments;
  const pct = total > 0 ? Math.round((first.value / total) * 100) : 0;
  return (
    <div className="col-span-full flex items-center gap-7 flex-wrap min-h-[118px] rounded-2xl border border-c-border bg-gradient-to-br from-c-card to-c-panel px-6 py-5">
      <div className="flex items-baseline gap-2.5 shrink-0">
        <span className="text-[38px] font-extrabold tracking-display leading-none tabular-nums">{total}</span>
        <span className="text-[11px] font-bold uppercase tracking-label-lg text-c-dim">{label}</span>
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="relative flex h-2.5 mb-[11px] rounded-full bg-c-base overflow-hidden">
          <span
            className={`h-full ${BAR[first.tone]}`}
            style={{ width: `${pct}%`, boxShadow: 'inset -1.5px 0 0 0 var(--c-card)' }}
          />
          <span className={`h-full flex-1 ${BAR[second.tone]}`} />
        </div>
        <div className="flex gap-5 flex-wrap text-xs text-c-muted">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center">
              <span className={`w-[7px] h-[7px] rounded-full mr-[7px] ${DOT[s.tone]}`} />
              <b className="text-c-text font-bold tabular-nums mr-1">{s.value}</b> {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The landing content: a heading over a fixed-column grid. Drop it inside each
 * page's existing scroll/padding container. `columns` matches the number of
 * NON-hero tiles so the tile row fills the same width as the full-span hero
 * (no phantom empty column).
 */
export function OverviewLanding({
  title, columns, children,
}: {
  title: string;
  columns: 2 | 3 | 4;
  children: ReactNode;
}) {
  const cols =
    columns === 2 ? 'sm:grid-cols-2' :
    columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' :
    'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className="max-w-5xl mx-auto">
      <h3 className="text-base font-bold text-c-text tracking-headline m-0 mb-4">{title}</h3>
      <div className={`grid grid-cols-1 ${cols} gap-3`}>
        {children}
      </div>
    </div>
  );
}
