import type { ReactNode } from 'react';

/**
 * The small rounded-full token that sits next to a heading, a name or a row —
 * a count ("8 photos"), a status ("Premade"), a role ("Head"), a marker ("♀ F").
 *
 * There were ~25 hand-rolled versions of this, six of them near-identical plum
 * ones differing only in `font-bold` vs `font-semibold`, `px-1.5` vs `px-2`,
 * `py-px` vs `py-0.5`, and whether the border used the real token or an opacity
 * modifier that renders nothing. None of that encoded anything.
 *
 * ★ What this component does NOT own is MEANING. Green and purple carry at
 * least three unrelated jobs in this app:
 *
 *   - provenance — green = came from the save, purple = your hand
 *   - gender     — male green, female purple (a deliberate convention)
 *   - emphasis   — Head green vs Member neutral, in clubs and businesses
 *
 * So `tone` is named for the colour, not for a meaning. Naming it `tone="save"`
 * would have made two of those three call sites read as lies. The pill
 * standardises geometry and weight; the caller keeps its own semantics.
 */

type Tone = 'green' | 'purple' | 'neutral' | 'filled';

const TONES: Record<Tone, string> = {
  green:   'text-c-green bg-c-accent-soft border-c-accent-border',
  purple:  'text-c-secondary bg-c-secondary-soft border-c-secondary-border',
  neutral: 'text-c-dim bg-c-panel border-c-border',
  // The count badge that rides INSIDE an active control (the "3" on a lit Tags
  // chip). Solid so it reads as a badge on the button rather than a sibling of
  // it — a genuinely different job, not a fourth colour.
  filled:  'text-white bg-c-secondary border-c-secondary',
};

export function Pill({
  children,
  tone = 'neutral',
  caps = false,
  size = 'sm',
  tabular = false,
  className = '',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  /**
   * Uppercase + letter-spaced. Use when the content is a WORD ("PREMADE",
   * "8 PHOTOS"); leave off for a bare number, where caps do nothing. Caps also
   * pull the weight up to bold — small uppercase needs it to hold its colour.
   */
  caps?: boolean;
  /** `sm` sits beside a heading or in a table cell; `md` is for list-row role tags. */
  size?: 'sm' | 'md';
  /** Digits that change in place (live counts) — stops the pill twitching. */
  tabular?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 shrink-0 rounded-full border ${
        size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'
      } text-2xs ${caps ? 'font-bold uppercase tracking-label' : 'font-semibold'} ${
        tabular ? 'tabular-nums' : ''
      } ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
