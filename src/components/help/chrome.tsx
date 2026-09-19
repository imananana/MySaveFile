import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';

/**
 * Shared chrome for the two syncing help pages.
 *
 * `/help/syncing` is the friendly one; `/help/syncing/advanced` is the full
 * merge reference behind it. They're one surface split in two, so the shell,
 * the section grammar and the row grammar live here rather than being copied —
 * a page that drifts from its own sibling is how a reader stops trusting both.
 */

export function HelpPage({
  title,
  backTo = '/',
  backLabel = 'Back',
  onBack,
  lede,
  children,
}: {
  title: string;
  backTo?: string;
  backLabel?: string;
  /** Given instead of `backTo` when back means "wherever you came from". */
  onBack?: () => void;
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  const backClass =
    'inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text transition-colors mb-8 no-underline bg-transparent border-none p-0 cursor-pointer';

  return (
    <div className="min-h-screen bg-c-base text-c-text">
      <div className="max-w-2xl mx-auto px-6 py-10 sm:py-12">
        {onBack ? (
          <button onClick={onBack} className={backClass}>
            <CaretLeft size={12} weight="bold" />
            {backLabel}
          </button>
        ) : (
          <Link to={backTo} className={backClass}>
            <CaretLeft size={12} weight="bold" />
            {backLabel}
          </Link>
        )}

        {/* The lede carries the gap down to the content when there is one.
            Without it the header has to carry its own. */}
        <div className={`flex items-center gap-4 ${lede ? 'mb-3' : 'mb-14'}`}>
          <img src="/3d-clay-plumbob.svg" alt="" className="h-12 w-auto shrink-0 select-none" draggable={false} />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-c-text m-0 tracking-headline leading-tight">
              {title}
            </h1>
            <p className="text-2xs font-bold uppercase tracking-label-lg text-c-secondary mt-1">
              MySaveFile · The Sims 4 Save Planner
            </p>
          </div>
        </div>

        {lede && <div className="text-sm text-c-muted leading-relaxed mt-4 mb-11">{lede}</div>}

        {children}
      </div>
    </div>
  );
}

/**
 * A numbered part, headed the way every other section in the app is headed:
 * a coloured bold title with a hairline running out to the right margin.
 */
export function Part({
  n,
  id,
  title,
  lede,
  children,
}: {
  n: string;
  id?: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-extrabold text-c-green tabular-nums shrink-0 border border-c-accent-border bg-c-accent-soft rounded-full w-6 h-6 grid place-items-center">
          {n}
        </span>
        <h2 className="text-base font-bold text-c-green tracking-headline m-0 shrink-0">{title}</h2>
        <span className="flex-1 h-px bg-c-border" />
      </div>
      {lede && <p className="text-sm text-c-muted leading-relaxed mb-6 m-0">{lede}</p>}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A bold claim, then the detail under it. */
export function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-c-text m-0 mb-1.5">{title}</h3>
      <div className="text-sm text-c-muted leading-relaxed flex flex-col gap-2">{children}</div>
    </div>
  );
}

/** The page's one table row: the case on the left, what happens on the right. */
export function Row({ when, then }: { when: React.ReactNode; then: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-4 py-2.5 border-b border-c-border last:border-b-0">
      <p className="text-sm text-c-text m-0">{when}</p>
      <p className="text-sm text-c-dim m-0">{then}</p>
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return <div className="bg-c-card border border-c-border rounded-lg px-4 py-1 mt-1">{children}</div>;
}

export const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-c-text font-semibold">{children}</strong>
);
