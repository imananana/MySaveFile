import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { btn } from '../components/common/btn';
import { PostcardCover } from './showcase/Covers';
import { postcardTitleSize } from './showcase/derive';
import './showcase/showcase.css';
import './landing.css';

/**
 * The pre-login landing page.
 *
 * One claim, made three ways: your save and your plan stay in step. The hero is
 * a real world map wearing the planner's own pin grammar — green for what the
 * save says, plum for what you've planned — because that colour pair IS the
 * product, and a visitor should meet it before they meet a feature list.
 *
 * Sample data below (lot names, the postcard's save) is illustrative and
 * deliberately not the developer's own save: real counts on a marketing page
 * read as a promise about what a typical save holds.
 */

// The save on the share card. Invented on purpose: real counts from a real
// save read as a promise about what a typical save holds.
const SHOWCASE_SAMPLE = {
  name: 'The Best Save',
  creator: 'MeTheSimmer',
  worldNames: ['Newcrest', 'Oasis Springs', 'Willow Creek'],
  stats: [['worlds', 28], ['households', 210]] as [string, number][],
};

// Decorative pins. Positions are percentages of the hero box, not of the map
// art: the map is object-fit:cover, so it crops differently at every window
// shape and nothing here is anchored to a real lot anyway. `crowd` marks the
// one that steps out when three cards no longer fit side by side.
const PINS: { name: string; detail: string; tone: 'save' | 'planned'; x: string; y: string; crowd?: boolean }[] = [
  { name: 'The Kid Club',    detail: 'Recreation Center',           tone: 'save',    x: '67.7%', y: '21.6%' },
  { name: 'Celebration Way', detail: 'Planned: Spa',                tone: 'planned', x: '82.7%', y: '26.9%', crowd: true },
  { name: 'Pier Views',      detail: 'Planned: Residential Rental', tone: 'planned', x: '65.1%', y: '81.6%' },
];

function MapPin({ name, detail, tone, x, y, crowd }: (typeof PINS)[number]) {
  const planned = tone === 'planned';
  return (
    <div
      className={`absolute lp-pin ${crowd ? 'lp-pin--crowd' : ''} flex-col items-start gap-1.5`}
      style={{ '--lp-x': x, '--lp-y': y } as React.CSSProperties}
      aria-hidden
    >
      <span
        className={`ml-[18px] w-3.5 h-3.5 rounded-full border-[3px] border-white ${planned ? 'bg-c-secondary' : 'bg-c-accent'}`}
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }}
      />
      <div
        className={`bg-c-card border rounded-xl px-3.5 py-2.5 ${planned ? 'border-c-secondary-border' : 'border-c-border'}`}
        style={{ boxShadow: planned ? '0 10px 24px -10px rgba(60,40,80,0.45)' : '0 10px 24px -10px rgba(40,60,40,0.45)' }}
      >
        <span className="block text-[13px] font-bold text-c-text whitespace-nowrap">{name}</span>
        <span className={`block mt-0.5 text-[11px] font-semibold whitespace-nowrap ${planned ? 'text-c-secondary' : 'text-c-green'}`}>
          {detail}
        </span>
      </div>
    </div>
  );
}

// Everything that has to survive a changing width lives in landing.css, in
// percentages and clamps rather than steps — see the note at the top of it.
function Hero() {
  return (
    <section className="lp-hero">
      <img
        src="/maps/san-sequoia.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        draggable={false}
      />
      {/* Cream wash — a token can't carry alpha (bg-c-base/80 compiles to
          nothing), so the gradients live in landing.css beside the widths they
          have to stay in step with. */}
      <div className="absolute inset-0 lp-wash-side" />
      <div className="absolute inset-0 lp-wash-down" />
      <div
        className="absolute left-0 right-0 top-0 h-32"
        style={{ background: 'linear-gradient(180deg, rgba(250,248,244,0.92) 0%, rgba(250,248,244,0) 100%)' }}
      />

      {/* Nav — rides over the map, no rule under it */}
      <header className="absolute left-0 right-0 top-0 z-20">
        <div className="h-16 px-4 sm:px-6 lg:px-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <img src="/3d-clay-plumbob.svg" alt="" className="h-8 w-auto select-none" draggable={false} />
            <span className="text-lg font-bold text-c-text tracking-headline">MySaveFile</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="text-sm font-semibold text-c-muted hover:text-c-text px-3 py-2 no-underline transition-colors">
              Sign in
            </Link>
            <Link to="/register" className={btn('primary')}>Get started</Link>
          </nav>
        </div>
      </header>

      {/* Synced chip — the loop, stated as a state */}
      <div
        className="lp-chip absolute right-6 xl:right-12 top-[86px] xl:top-[92px] items-center gap-2 bg-c-card border border-c-accent-border rounded-full px-4 py-2"
        style={{ boxShadow: '0 6px 16px -6px rgba(40,60,40,0.3)' }}
        aria-hidden
      >
        <span className="w-2.5 h-2.5 rounded-full bg-c-accent" />
        <span className="text-[13px] font-semibold text-c-green">Synced with your save</span>
      </div>

      {PINS.map((p) => <MapPin key={p.name} {...p} />)}

      {/* Copy sits in flow, so it sets the hero's height on narrow screens */}
      <div className="relative z-10 lp-pad">
        <div className="lp-copy flex flex-col gap-4 xl:gap-[18px]">
          <img
            src="/3d-clay-plumbob.svg"
            alt=""
            className="lp-logo w-auto self-start select-none"
            style={{ filter: 'drop-shadow(0 8px 16px rgba(22,163,74,0.3))' }}
            draggable={false}
          />
          <p className="text-2xs font-bold uppercase tracking-label-lg text-c-secondary m-0">
            The Sims 4 save planner
          </p>
          <h1 className="lp-title m-0 font-bold text-c-text tracking-headline">
            Your save and your plan, always in sync.
          </h1>
          <p className="m-0 text-base sm:text-lg text-c-muted leading-relaxed">
            See your game as it really is. Sync your save to pull in lots, households, clubs,
            holidays, family trees, and more. Plan what&apos;s next, then go play in-game.
            Sync again to see what&apos;s changed.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <Link to="/register" className={btn('primary', { size: 'hero', elevated: true })}>
              Get started
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link to="/login" className={btn('secondary', { size: 'hero' })}>Sign in</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One section: a visual that sits on the cream, then a name and a sentence. */
function Beat({ visual, title, children }: { visual: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="lp-beat flex flex-col gap-3.5">
      <div className="relative h-[170px]">{visual}</div>
      <h2 className="m-0 text-lg font-bold text-c-text tracking-headline">{title}</h2>
      <p className="m-0 -mt-1.5 text-sm text-c-muted leading-relaxed">{children}</p>
    </div>
  );
}

function Beats() {
  return (
    <section className="px-4 sm:px-6 lg:px-[72px] py-16 lg:pt-16 lg:pb-14">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-8">
        <Beat
          title="Save your inspo"
          visual={
            // A pinned polaroid, floating on the cream — no tray behind it.
            <div
              className="absolute left-1/2 -translate-x-1/2 top-[-17px] w-[214px] bg-c-card border border-c-border rounded-md p-[7px] pb-[9px] -rotate-3"
              style={{ boxShadow: '0 14px 28px -12px rgba(40,40,30,0.4)' }}
            >
              <img src="/landing/inspo-pin.webp" alt="" className="w-full h-[153px] object-cover rounded-[3px]" loading="lazy" draggable={false} />
              <span className="block mt-1.5 text-[11px] font-semibold text-c-muted">pinned to Newcrest</span>
              <span
                className="absolute left-1/2 -ml-[7px] -top-[7px] w-3.5 h-3.5 rounded-full bg-c-secondary border-[3px] border-white"
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
              />
            </div>
          }
        >
          Find inspiration on the internet or in the real world, upload it and save it to the
          world or lot you&apos;d like to use it for.
        </Beat>

        <Beat
          title="Manage everything"
          visual={
            <div className="h-full rounded-2xl overflow-hidden border border-c-border bg-c-card">
              {/* Wider than its box on phones, so the shot is zoomed rather
                  than shrunk — a whole desktop screen squeezed into 360px
                  reads as a grey smudge instead of as the app. */}
              <img
                src="/landing/diversity-skills.jpg"
                alt="The Diversity screen, showing which skills the sims in a save have built"
                className="w-[180%] sm:w-full max-w-none h-full object-cover object-left-top sm:object-top"
                loading="lazy"
                draggable={false}
              />
            </div>
          }
        >
          Big picture and nitty-gritty, plan it all.
        </Beat>

        <Beat
          title="Show it off"
          visual={
            // The REAL share cover, not a picture of one: the same component
            // the server screenshots for /s/:slug/og. It can never drift.
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-[325px] rounded-md overflow-hidden" style={{ boxShadow: '0 10px 26px -10px rgba(40,40,30,0.4)' }} aria-hidden>
                {/* The cover sizes its own title from a layout effect, which
                    cannot run while this page is prerendered — the static HTML
                    would ship with no --ts at all and the title would snap to
                    size on hydration. Seeding the same value the effect starts
                    from renders it right in the static HTML; the effect then
                    only shrinks an overflowing title, which this one isn't. */}
                <div className="sc-ogFrame fit" style={{ '--ts': `${postcardTitleSize(SHOWCASE_SAMPLE.name)}cqw` } as React.CSSProperties}>
                  <PostcardCover data={SHOWCASE_SAMPLE} palette="classic" />
                </div>
              </div>
            </div>
          }
        >
          Make a public page of all your hard work so others can admire or review before
          downloading. No account needed!
        </Beat>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <footer className="relative overflow-hidden mt-2">
      <img
        src="/landing/closing-vista.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
      {/* Heavier than the hero's: this band carries the legal line and the
          footer links at small sizes, and the vista's rooftops sat straight
          under them. The picture stays as atmosphere, never as a photo. */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(250,248,244,0.97) 0%, rgba(250,248,244,0.9) 45%, rgba(250,248,244,0.83) 100%)' }}
      />
      <div className="relative flex flex-col items-center gap-4 text-center px-4 sm:px-6 lg:px-[72px] pt-14 pb-16 sm:pt-[72px] sm:pb-[88px]">
        <h2 className="m-0 text-2xl sm:text-3xl font-bold text-c-text tracking-headline">
          Start with the save you already have — it&apos;s all in there.
        </h2>
        <Link to="/register" className={btn('primary', { size: 'hero', elevated: true })}>
          Get started
          <ArrowRight size={16} weight="bold" />
        </Link>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-2 text-sm font-semibold text-c-muted">
          <Link to="/about" className="hover:text-c-text no-underline">About</Link>
          <Link to="/help" className="hover:text-c-text no-underline">Help</Link>
          <Link to="/privacy" className="hover:text-c-text no-underline">Privacy</Link>
          <Link to="/terms" className="hover:text-c-text no-underline">Terms</Link>
          <Link to="/login" className="hover:text-c-text no-underline">Sign in</Link>
        </nav>
        <p className="m-0 max-w-xl text-2xs text-c-dim leading-relaxed">
          The Sims™ is a trademark of Electronic Arts Inc. MySaveFile is an unofficial,
          non-commercial fan project, not affiliated with or endorsed by EA.
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-c-base text-c-text font-sans">
      <Hero />
      <Beats />
      <Closing />
    </div>
  );
}
