import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';

/** Shared shell for the Privacy Policy and Terms pages — matches About.tsx. */
export function LegalLayout({ title, lastUpdated, intro, children }: {
  title: string;
  lastUpdated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-c-base text-c-text">
      <div className="max-w-2xl mx-auto px-6 py-10 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text transition-colors mb-8 no-underline"
        >
          <CaretLeft size={12} weight="bold" />
          Back
        </Link>

        <div className="flex items-center gap-4 mb-2">
          <img src="/3d-clay-plumbob.svg" alt="" className="h-12 w-auto shrink-0 select-none" draggable={false} />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-c-text m-0 tracking-headline leading-tight">{title}</h1>
            <p className="text-2xs font-bold uppercase tracking-label-lg text-c-secondary mt-1">MySaveFile · The Sims 4 Save Planner</p>
          </div>
        </div>
        <p className="text-2xs text-c-faint mb-8">Last updated {lastUpdated}</p>

        <p className="text-sm text-c-muted leading-relaxed mb-10">{intro}</p>

        {children}

        <div className="flex flex-wrap gap-4 text-xs pt-6 mt-10 border-t border-c-border text-c-dim">
          <Link to="/privacy" className="hover:text-c-text no-underline">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-c-text no-underline">Terms of Service</Link>
          <Link to="/about" className="hover:text-c-text no-underline">About</Link>
        </div>
        <p className="text-2xs text-c-faint leading-relaxed pt-4 mt-4">
          The Sims™ is a trademark of Electronic Arts Inc. This is an unofficial, non-commercial fan project, not affiliated with or endorsed by EA.
        </p>
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-c-secondary m-0 mb-3 tracking-headline">{title}</h2>
      <div className="text-sm text-c-muted leading-relaxed flex flex-col gap-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_strong]:text-c-text [&_strong]:font-semibold [&_a]:text-c-secondary [&_a]:font-semibold [&_a:hover]:underline">
        {children}
      </div>
    </section>
  );
}
