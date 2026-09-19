import type { ReactNode } from 'react';
import { btn } from '../components/common/btn';

/**
 * Standalone public chrome (nav + footer) for the statically-rendered guides
 * section. Mirrors the landing page's PublicNav/footer markup, but every link
 * is a plain <a> — guide pages ship without the SPA bundle, so navigation into
 * the app must be a real full-page load.
 *
 * Build-time only: rendered to static HTML in scripts/prerender.mjs.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-c-base text-c-text font-sans flex flex-col">
      <header
      /* Translucent ON PURPOSE — content scrolls under the blur. A token
         can't carry alpha (bg-c-base/80 compiles to nothing), so the
         colour is inline. Keep it in step with --c-base. */
      style={{ backgroundColor: 'rgba(250, 248, 244, 0.8)' }}
      className="sticky top-0 z-50 backdrop-blur-md border-b border-c-border"
    >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <img src="/3d-clay-plumbob.svg" alt="" className="h-8 w-auto select-none" />
            <span className="text-lg font-bold text-c-text tracking-headline">MySaveFile</span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href="/guides" className="text-sm font-semibold text-c-muted hover:text-c-text px-3 py-2 no-underline transition-colors">Guides</a>
            <a href="/login" className="text-sm font-semibold text-c-muted hover:text-c-text px-3 py-2 no-underline transition-colors">Sign in</a>
            <a href="/register" className={btn('primary')}>Get started</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-c-border bg-c-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <a href="/" className="flex items-center gap-2 no-underline">
              <img src="/3d-clay-plumbob.svg" alt="" className="h-6 w-auto select-none" />
              <span className="text-sm font-bold text-c-text tracking-headline">MySaveFile</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-c-dim">
              <a href="/guides" className="hover:text-c-text no-underline">Guides</a>
              <a href="/about" className="hover:text-c-text no-underline">About</a>
              <a href="/privacy" className="hover:text-c-text no-underline">Privacy</a>
              <a href="/terms" className="hover:text-c-text no-underline">Terms</a>
              <a href="/login" className="hover:text-c-text no-underline">Sign in</a>
            </div>
          </div>
          <p className="text-2xs text-c-faint leading-relaxed mt-6 max-w-2xl">
            The Sims™ is a trademark of Electronic Arts Inc. MySaveFile is an unofficial, non-commercial
            fan project, not affiliated with or endorsed by EA.
          </p>
        </div>
      </footer>
    </div>
  );
}
