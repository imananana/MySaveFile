import { Link } from 'react-router-dom';
import { CaretLeft, CaretRight, ArrowRight } from '@phosphor-icons/react';

/**
 * About — her page, mostly in her words: the bio leads, and the MySaveFile
 * explainer lives with the credits in one collapsed block below. All quoted
 * copy ("What is MySaveFile", "How this was built", the bio paragraphs) is
 * HERS, VERBATIM — do not edit or "tighten" it.
 *
 * Prerendered (entry-server.tsx): everything renders statically, the
 * <details> rows work without JS.
 *
 * The code is open source (GPLv3) and the "Source code" row links the public
 * repository — SOURCE_URL below. That repository is a cleaned snapshot, not the
 * one this app deploys from; never link the private one.
 */

const FEEDBACK_EMAIL = 'iman@mysavefile.com';
const MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Hello from MySaveFile')}`;

/** Her Patreon — the brand account (verified live 2026-09-17; the share
    link's utm_* tracking params are deliberately stripped). The old
    /imanistan personal account is retired. Empty = the button doesn't render. */
const PATREON_URL = 'https://www.patreon.com/imanistani';

const SOURCE_URL = 'https://github.com/imananana/MySaveFile';

export function About() {
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

        {/* Slim masthead — identifies the site without stealing the lead */}
        <div className="flex items-center gap-3 mb-8">
          <img src="/3d-clay-plumbob.svg" alt="" className="h-10 w-auto shrink-0 select-none" draggable={false} />
          <div>
            <div className="text-xl font-bold text-c-text tracking-headline leading-tight">MySaveFile</div>
            <div className="text-3xs font-bold uppercase tracking-label-lg text-c-secondary">The Sims 4 Save Planner</div>
          </div>
        </div>

        {/* Her — the page's lead */}
        <div className="bg-c-card border border-c-border rounded-2xl p-7 sm:p-9 mb-10 flex flex-col sm:flex-row gap-7 sm:gap-9 items-start">
          <img
            src="/imanistan.jpg"
            alt="Iman's sim"
            className="w-40 h-40 sm:w-48 sm:h-48 rounded-3xl shrink-0 select-none mx-auto sm:mx-0"
            draggable={false}
          />
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-c-text m-0 tracking-headline">Hi, I'm Iman</h1>
            <p className="text-2xs font-bold uppercase tracking-label text-c-dim mt-1.5 mb-4">
              Creator of MySaveFile
            </p>
            {/* Her bio, verbatim. */}
            <div className="text-[15px] text-c-muted leading-relaxed flex flex-col gap-3">
              <p className="m-0">
                I was little in the Sims 2 era and I couldn't get a real copy, so I'd spend a lot
                of time imagining playing the Sims. I've been grown up for a while now, and one of
                the best things about that has been unlimited access to, in my opinion, the best
                game on earth. I think this website is my way to keep on imagining playing the
                Sims, even when I'm not.
              </p>
              <p className="m-0">
                I hope you enjoy using this tool, and that it makes it easier to spend your time
                in-game doing the things you really love instead of the administrative things
                it's so easy to get bogged down by.
              </p>
              <p className="m-0">I'd love to hear from you, reach out!</p>
            </div>
            <div className="flex flex-wrap gap-2.5 mt-5">
              <a
                href={MAILTO}
                className="inline-block text-sm font-semibold text-c-green bg-c-accent-soft border border-c-accent-border rounded-lg px-4 py-2 no-underline hover:bg-c-accent-border transition-colors"
              >
                Email me
              </a>
              {PATREON_URL && (
                <a
                  href={PATREON_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-c-muted bg-c-card border border-c-border rounded-lg px-4 py-2 no-underline hover:text-c-text hover:border-c-dim transition-colors"
                >
                  Patreon
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Everything else — one collapsed block */}
        <section className="mb-10">
          <h2 className="text-2xs font-bold uppercase tracking-label text-c-dim m-0 mb-2.5">About MySaveFile</h2>
          <div className="bg-c-card border border-c-border rounded-xl overflow-hidden">
            <AboutRow title="What is MySaveFile">
              {/* Her copy, verbatim. */}
              <p>
                MySaveFile is a planner that reads your real Sims 4 save - lots, households, sims,
                everything. Sync your save, plan here, play the game, and then re-sync it.
              </p>
              <p>
                <Link to="/help" className="inline-flex items-center gap-1.5 text-c-secondary font-semibold no-underline hover:underline">
                  Help &amp; guides <ArrowRight size={12} weight="bold" />
                </Link>
              </p>
            </AboutRow>
            <AboutRow title="How this was built">
              {/* Her copy, verbatim. */}
              <p>
                I'm not a coder, just a Sims 4 expert with a strong vision. I created this tool
                using Claude, an AI tool. The ideas for this site are mine, as is the art, logo,
                and writing. Some assets including maps and icons, come from EA.
              </p>
            </AboutRow>
            <AboutRow title="Format knowledge">
              <p>
                The planner is an independent re-implementation of community-documented file
                formats. It contains no EA / Maxis code, and no code from the projects below.
                With thanks to:
              </p>
              <ul>
                <li>
                  <ExtLink href="https://github.com/s4ptacle/Sims4Tools">s4pi</ExtLink> — the DBPF
                  container format and thumbnail layout
                </li>
                <li>
                  <ExtLink href="https://github.com/jolieschae/Phase-3-Sims-4-Game-Mod">
                    Phase-3-Sims-4-Game-Mod
                  </ExtLink>{' '}
                  by jolieschae — decompiled save-record definitions
                </li>
                <li>
                  <ExtLink href="https://sims4studio.com">Sims 4 Studio</ExtLink> — extraction of
                  the game's tuning files, and the icon resource keys behind the in-game icon
                  pickers
                </li>
              </ul>
              <p>
                Newer records — small businesses, dynasties, custom venues, family trees — were
                reverse-engineered for this project against real saves.
              </p>
            </AboutRow>
            <AboutRow title="Source code">
              <p>
                The planner's code is open source under the GPLv3 licence, the same licence as
                s4pi.
              </p>
              <p>
                <ExtLink href={SOURCE_URL}>View the source on GitHub</ExtLink>
              </p>
              <p>
                The MySaveFile name, logo, art and writing aren't part of that licence, and EA's
                icons and maps aren't in the repository.
              </p>
            </AboutRow>
            <AboutRow title="Tools & type">
              <ul>
                <li>React, TypeScript, Vite, Zustand · Node.js, Express, PostgreSQL</li>
                <li>Hosted on Railway · photos on Cloudflare R2</li>
                <li>
                  <ExtLink href="https://phosphoricons.com">Phosphor Icons</ExtLink> · Plus Jakarta
                  Sans &amp; Yellowtail via{' '}
                  <ExtLink href="https://fonts.google.com">Google Fonts</ExtLink>
                </li>
              </ul>
            </AboutRow>
            <AboutRow title="EA / Maxis">
              <p>
                The Sims 4, its world maps, icons and game data are © Electronic Arts Inc. /
                Maxis. The planner reads your local save in your browser, and shows the game's
                icons and world maps so your plan looks like your save; those images remain EA's.
                This is an unofficial,
                non-commercial fan project, not affiliated with or endorsed by EA. "The Sims" is a
                trademark of Electronic Arts Inc.
              </p>
            </AboutRow>
          </div>
        </section>

        <div className="flex flex-wrap gap-4 text-xs pt-6 border-t border-c-border text-c-dim">
          <Link to="/privacy" className="hover:text-c-text no-underline">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-c-text no-underline">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

/** One collapsed row — the Help index's <details> grammar. */
function AboutRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-c-border last:border-b-0">
      <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none select-none hover:bg-c-panel transition-colors">
        <CaretRight size={13} weight="bold" className="text-c-faint shrink-0 transition-transform group-open:rotate-90" />
        <span className="text-sm font-semibold text-c-text">{title}</span>
      </summary>
      <div className="px-4 pb-4 pl-[42px] text-sm text-c-muted leading-relaxed flex flex-col gap-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_p]:m-0">
        {children}
      </div>
    </details>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-c-secondary font-semibold hover:underline">
      {children}
    </a>
  );
}
