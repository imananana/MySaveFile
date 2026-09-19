// Generated covers — poster (DEFAULT) + postcard, ported 1:1 from the covers
// round (mockups/showcase/covers.html → front-page v21). They are HTML
// layouts, not images: full-bleed in the hero, and later re-rendered at
// 1.91:1 for the og:image. Poster stays FLAT — no decoration. All sizing is
// cqw against the .sc-cover container.

import { useCallback, useLayoutEffect, useRef } from 'react';
import { WORLD_ICONS } from '../../data/worldIcons';
import { postcardTitleSize, posterTitleSize, type DerivedShowcase } from './derive';
import { EditableText } from './editKit';
import type { ShowcasePayload } from './types';

export const POSTER_BLOCKS: Record<string, string> = { green: '#15803d', plum: '#5e4691', ink: '#26221c' };

export const POSTCARD_VARS: Record<string, Record<string, string>> = {
  classic: {},
  ash: {
    '--pc-paper': '#e6e0d2', '--pc-e1': '#8f5b4c', '--pc-e2': '#4b4439', '--pc-ink': '#3d3a2f',
    '--pc-ink2': '#6e5f43', '--pc-shadow': '#c9c2ae', '--pc-sub': '#5c5546', '--pc-dim': '#8a8272',
    '--pc-stampf': 'sepia(.4) saturate(.5)',
  },
  pastel: {
    '--pc-paper': '#fbf3f6', '--pc-e1': '#e59ab5', '--pc-e2': '#b3a5dc', '--pc-ink': '#8a4a72',
    '--pc-ink2': '#9d8bcf', '--pc-shadow': '#f2d8e6', '--pc-sub': '#7d6270', '--pc-dim': '#a68f9c',
    '--pc-stampf': 'none',
  },
};

export interface CoverData {
  name: string;
  creator: string;
  worldNames: string[]; // shown worlds, tour order — crests come from these
  stats: [label: string, n: number][]; // the two never-zero ranked stats
}

// What the cover art says, from the save. The page's hero and the og:image
// the server screenshots both read it here, so a shared link can never brag
// different numbers than the page it opens.
export function buildCoverData(p: ShowcasePayload, d: DerivedShowcase): CoverData {
  // The second cover stat stays never-zero: households (Yours) leads for
  // family saves, lots built for build-led ones; a save with neither
  // authored yet falls back to its pack count.
  const secondStat: [string, number] =
    d.buildLed && d.counts.lotsBuilt > 0 ? ['lots built', d.counts.lotsBuilt]
    : d.counts.households > 0 ? ['households', d.counts.households]
    : d.counts.lotsBuilt > 0 ? ['lots built', d.counts.lotsBuilt]
    : ['packs', d.packNames.length];
  return {
    name: p.name,
    creator: p.creator.name ?? 'a MySaveFile creator',
    worldNames: d.worlds.map((w) => w.name),
    stats: [['worlds', d.counts.worlds], secondStat],
  };
}

const crests = (worlds: string[], n: number): string[] =>
  worlds.map((w) => (WORLD_ICONS as Record<string, string>)[w]).filter(Boolean).slice(0, n);

const Logo = () => <img className="sc-logoImg" src="/3d-clay-plumbob.svg" alt="" style={{ height: '2cqw' }} />;

// The title on the cover art IS the save's name — while editing it commits
// the same rename-and-reslug flow as the photo hero's h1 (name parity across
// every cover kind).
//
// It also has to SURVIVE a name of any length, including mid-keystroke. The
// length ramp picks a starting size; then the type shrinks until the cover's
// content block stops overflowing, so a title can never spill off the card or
// shove the byline out from under it. A name that already fits never enters
// the loop, which is why normal names still render at exactly the approved
// size.
const MIN_TS = 1.2;   // cqw — past this the name is unreadable anyway
const TS_STEP = 0.25;

function fitCoverTitle(el: HTMLElement, startSize: number): void {
  // --ts goes on the COVER, not on the title: the postcard's "Greetings from"
  // has to read it too, so the script shrinks alongside a title that has been
  // fitted down (a fixed-size script lands on top of small caps).
  const scope = (el.closest('.sc-cover') ?? el) as HTMLElement;
  scope.style.setProperty('--ts', `${startSize}cqw`);
  // The block the title shares with the rest of the cover's copy.
  const box = el.closest('.sc-inner, .sc-left') as HTMLElement | null;
  if (!box) return;
  let size = startSize;
  let guard = 0;
  // Two overflows can happen: the block runs out of HEIGHT (long names
  // wrapping to many lines), or one WORD runs out of width — the stylesheet
  // forbids mid-word breaks, so a too-big single word juts past the title box
  // (and contenteditable would otherwise break it mid-word: AISHLANDI / A).
  const overflowing = () =>
    box.scrollHeight > box.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  while (overflowing() && size > MIN_TS && guard++ < 48) {
    size = Math.max(MIN_TS, size - TS_STEP);
    scope.style.setProperty('--ts', `${size}cqw`);
  }
}

function CoverTitle({ name, className, sizeFor, onRename }: {
  name: string;
  className: string;
  sizeFor: (name: string) => number;
  onRename?: (name: string) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const fit = useCallback((text: string) => {
    if (ref.current) fitCoverTitle(ref.current, sizeFor(text));
  }, [sizeFor]);

  // Fit the committed name, and re-fit whenever the cover changes size (the
  // cover is fluid, so a window resize changes what fits).
  useLayoutEffect(() => {
    fit(name);
    const cover = ref.current?.closest('.sc-cover');
    if (!cover || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit(ref.current?.innerText ?? name));
    ro.observe(cover);
    return () => ro.disconnect();
  }, [name, fit]);

  // font-size is inline on purpose: it is what the approved covers shipped
  // with, and it deliberately outranks the stylesheet's cqh cap — a height
  // clamp on this type was tried and rejected (it collapses the title to one
  // line and kills the drama). Fitting happens by lowering --ts instead.
  const style = { fontSize: 'var(--ts)' } as React.CSSProperties;

  return onRename
    ? (
      <EditableText
        tag="div"
        elRef={ref}
        value={name}
        placeholder="Name your save"
        onCommit={onRename}
        onInput={(text) => fit(text)}
        spellCheck={false}
        className={className}
        style={style}
      />
    )
    : <div ref={ref as React.RefObject<HTMLDivElement>} className={className} style={style}>{name}</div>;
}

export function PosterCover({ data, palette, onRename }: { data: CoverData; palette: string; onRename?: (name: string) => void }) {
  return (
    <div className="sc-cover sc-fp" style={{ '--fp-block': POSTER_BLOCKS[palette] ?? POSTER_BLOCKS.green } as React.CSSProperties}>
      <div className="sc-left">
        {/* --ts lets the mobile media query scale the cqw-based title */}
        <CoverTitle name={data.name} className="sc-t" sizeFor={posterTitleSize} onRename={onRename} />
        <div className="sc-by">by {data.creator}</div>
        <div className="sc-crestRow">{crests(data.worldNames, 5).map((c) => <img key={c} src={c} alt="" />)}</div>
      </div>
      <div className="sc-right">
        {data.stats.map(([label, n]) => (
          <div className="sc-stat" key={label}><span className="sc-n">{n}</span><span className="sc-l">{label}</span></div>
        ))}
        <div className="sc-moreLine">and so much more</div>
      </div>
      <div className="sc-foot"><Logo /> MySaveFile</div>
    </div>
  );
}

export function PostcardCover({ data, palette, onRename }: { data: CoverData; palette: string; onRename?: (name: string) => void }) {
  return (
    <div className="sc-cover sc-pc" style={POSTCARD_VARS[palette] as React.CSSProperties ?? {}}>
      <div className="sc-edge" />
      <div className="sc-stamps">
        {crests(data.worldNames, 3).map((c) => (
          <div className="sc-stamp" key={c}>
            <img className="sc-frame" src="/stamp-frame.png" alt="" />
            <img className="sc-crest" src={c} alt="" />
          </div>
        ))}
      </div>
      <div className="sc-inner">
        <div className="sc-greet">Greetings from</div>
        <CoverTitle name={data.name} className="sc-big" sizeFor={postcardTitleSize} onRename={onRename} />
        <div className="sc-pop">
          <span>{data.stats[0][1]} {data.stats[0][0]}</span>
          <span className="sc-rule" />
          {/* "pop." reads as a population sign — only households earn it */}
          <span>{data.stats[1][0] === 'households' ? `pop. ${data.stats[1][1]} households` : `${data.stats[1][1]} ${data.stats[1][0]}`}</span>
        </div>
        <div className="sc-by">a save file by <b>{data.creator}</b></div>
      </div>
      <div className="sc-brand"><Logo /> MySaveFile</div>
    </div>
  );
}
