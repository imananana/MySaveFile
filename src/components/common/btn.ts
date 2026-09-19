/**
 * One grammar for buttons.
 *
 * There were ~50 accent-filled buttons in the app, every one hand-written:
 * three different hover tokens for the same green (`c-accent-hover`,
 * `c-green`, and a raw `green-700` that isn't in the palette at all), four
 * corner radii, three font weights, and ten padding combinations. Sitting side
 * by side on the same screen, they visibly don't match.
 *
 * ★ This is a CLASS BUILDER, not a `<Button>` component, on purpose. These
 * buttons are `<button>`, `<Link>`, `<a>` and `<label>` elements with wildly
 * different props. A component would mean rewriting 50 call sites' markup;
 * swapping a className rewrites none of it. Lower risk, same enforcement of
 * what a button looks like.
 *
 *   <button className={btn('primary')}>Save</button>
 *   <Link to={...} className={btn('secondary', { size: 'sm' })}>Back</Link>
 *   <button className={btn('primary', { block: true, elevated: true })}>…</button>
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'hero';

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-semibold no-underline ' +
  'cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const SIZES: Record<Size, string> = {
  sm:   'text-xs rounded-md px-3 py-1.5',
  md:   'text-sm rounded-lg px-4 py-2',
  lg:   'text-sm rounded-lg px-5 py-2.5',
  // Marketing pages run a softer, larger scale than the app chrome. Kept as a
  // size rather than left as one-offs so the landing CTAs still match EACH
  // OTHER, which they previously didn't.
  hero: 'text-base rounded-xl px-7 py-3',
};

const VARIANTS: Record<Variant, string> = {
  primary:   'text-white bg-c-accent hover:bg-c-accent-hover border-none',
  secondary: 'text-c-dim bg-c-base border border-c-border hover:border-c-accent hover:text-c-text',
  ghost:     'text-c-dim bg-transparent border-none hover:text-c-text',
  // Tinted outline, never a red fill — the app has exactly one solid-red
  // button and it's the odd one out. The old idle tint was written as an
  // opacity modifier on the red token, which renders nothing, so the resting
  // state has never actually been visible until now.
  danger:    'text-c-red bg-transparent border border-c-red-border hover:bg-c-red-bg',
};

export function btn(
  variant: Variant = 'primary',
  opts: {
    size?: Size;
    /** Full width, centred — form submits, rail "New …" actions. */
    block?: boolean;
    /**
     * Lifts the button off the surface. Only for buttons that float over
     * content (a CTA on a photo wall, a marketing hero) — NOT for buttons
     * sitting in a form or a modal footer, which is most of them.
     */
    elevated?: boolean;
    className?: string;
  } = {},
): string {
  const { size = 'md', block = false, elevated = false, className = '' } = opts;
  return [
    BASE,
    SIZES[size],
    VARIANTS[variant],
    block ? 'w-full' : '',
    elevated ? 'shadow-sm hover:shadow-md' : '',
    className,
  ].filter(Boolean).join(' ');
}

/**
 * Square icon-only button — a close X, an expand caret, an inline delete.
 *
 * Kept separate from `btn()` on purpose. These aren't small buttons; they're a
 * different control. They have no label, they're sized by their hit area rather
 * than their text, and the destructive ones don't announce themselves — they
 * just redden under the cursor. Forcing them through the labelled-button
 * grammar would give them padding and a font size that mean nothing to them.
 */
export function iconBtn(
  size: 6 | 7 | 8 | 9 = 8,
  tone: 'neutral' | 'danger' = 'neutral',
  className = '',
): string {
  return [
    'inline-flex items-center justify-center shrink-0 rounded-md bg-transparent',
    'border-none cursor-pointer transition-colors',
    { 6: 'w-6 h-6', 7: 'w-7 h-7', 8: 'w-8 h-8', 9: 'w-9 h-9' }[size],
    tone === 'danger'
      ? 'text-c-faint hover:text-c-red hover:bg-c-red-bg'
      : 'text-c-dim hover:text-c-text hover:bg-c-panel',
    className,
  ].filter(Boolean).join(' ');
}
