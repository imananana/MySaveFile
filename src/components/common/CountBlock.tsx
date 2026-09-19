import { Fragment } from 'react';

type Count = { key: string; n: number; label: string };

/**
 * The one way this app states "here's what's in your save".
 *
 * Four screens report counts — the import review, the first-import
 * celebration, the sync review, and the sync confirmation — and they used to
 * do it three different ways. The rule that settled them:
 *
 *   **The block scales with how much is NEW to you.**
 *
 * First import, everything is new, so every concept is named (CountBlock +
 * ConceptGrid). The celebration is a moment, so two numbers and a tail
 * (CountBlock + DotList). A sync is the screen you see most and the least
 * new, so it's one line (DotList alone). The confirmation has nothing new at
 * all, so it's one word and uses none of this.
 *
 * ★ ONE ALIGNMENT AXIS. Every number in every size right-aligns into the same
 * GUTTER width, so every label starts at the same x whether it belongs to a
 * 24px headline or a 15px grid row. The first build centred the headline pair
 * and left-aligned the grid, which put three different alignments on one small
 * card and read, correctly, as careless.
 *
 * Deliberately bare — no card, no border, no dividers between rows. The old
 * sync summary boxed nine rows and put a hairline between each; eight
 * hairlines in one small panel is what made it read as an inventory rather
 * than as news.
 */

/**
 * The headline pair, on ONE centred line.
 *
 * It used to stack, left-aligned, with the numbers right-aligned into a shared
 * column. On a centred card that read as a fragment of a table someone had
 * pasted in — the block had its own alignment while everything around it was
 * centred. One line settles it, and the dot matches the tail underneath, so the
 * whole card is one voice at two sizes.
 */
export function CountBlock({ counts }: { counts: Count[] }) {
  return (
    <p className="text-center m-0">
      {counts.map((c, i) => (
        <Fragment key={c.key}>
          {i > 0 && <span className="text-c-faint mx-2.5">·</span>}
          <span className="whitespace-nowrap">
            <span className="text-2xl font-extrabold text-c-text tracking-headline tabular-nums mr-1.5">
              {c.n}
            </span>
            <span className="text-sm text-c-muted">{c.label}</span>
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * Every concept in the save, as one flat list. Only the first import earns it.
 *
 * Households and sims sit in here too, rather than in a bigger tier above a
 * rule: ranking them added a second alignment axis and a second type size to
 * what is, in the end, a list of what's in a file.
 *
 * ★ Each cell is a PHRASE, flush left — deliberately NOT the shared right-
 * aligned gutter the headline pair uses. Right-aligning a column of 182 / 14 /
 * 3 / 8 / 51 straightens the right edge but staggers the left one, and five
 * rows of that draw a vase silhouette down the card. A column only wants to be
 * right-aligned when you're meant to compare the magnitudes; here you're
 * reading a list, so the flush left edge matters more than the decimal points.
 */
export function ConceptGrid({ counts }: { counts: Count[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      {counts.map((c) => (
        <p key={c.key} className="text-[13px] text-c-dim leading-tight m-0">
          {/* A real gap, not a word space: 16px bold against 13px regular needs
              more air than one space gives it, or "182households" reads as a
              single word at a glance. */}
          <span className="text-base font-bold text-c-text tabular-nums mr-1.5">{c.n}</span>
          {c.label}
        </p>
      ))}
    </div>
  );
}

/**
 * The tail. Replaced "Plus …" and "Also in: …" — a lead-in is padding when
 * the numbers already say what the line is. Each item is nowrap so nothing
 * ever breaks as "1 small / business".
 */
export function DotList({ counts, className = '' }: { counts: Count[]; className?: string }) {
  return (
    <p className={`text-xs text-c-dim leading-relaxed m-0 ${className}`}>
      {counts.map((c, i) => (
        <Fragment key={c.key}>
          {/* The separator sits OUTSIDE the nowrap span on purpose: with every
              item unbreakable AND no whitespace between them, the browser has
              nowhere to wrap and the line runs straight out of the card. The
              spaces around this dot are the only break opportunities. */}
          {i > 0 && <span className="text-c-faint">{' · '}</span>}
          <span className="whitespace-nowrap">
            <b className="font-semibold text-c-muted tabular-nums">{c.n}</b> {c.label}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
