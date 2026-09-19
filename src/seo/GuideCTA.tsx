/**
 * Reusable in-content call-to-action for the guides section.
 *
 * Used two ways, both at build time only (these components are rendered to
 * static HTML in scripts/prerender.mjs and never shipped to the client):
 *   - inline, via a `:::cta` marker inside a guide's markdown body
 *   - automatically, as the closing block at the end of every guide
 *
 * Styling mirrors the landing page's closing CTA so it feels native.
 */
import { btn } from '../components/common/btn';

export function GuideCTA({
  heading = 'Plan your Sims 4 save',
  body = 'Import your save or start from a blank canvas — map your worlds, households, and stories, then share a polished public showcase.',
  label = 'Get started — it’s free',
  href = '/register',
}: {
  heading?: string;
  body?: string;
  label?: string;
  href?: string;
}) {
  return (
    <div
      className="my-10 rounded-3xl border-2 border-c-secondary-border p-8 sm:p-10 text-center"
      style={{ background: 'linear-gradient(135deg, var(--c-accent-soft) 0%, var(--c-secondary-soft) 100%)' }}
    >
      <h2 className="text-xl sm:text-2xl font-bold text-c-text tracking-headline m-0">{heading}</h2>
      <p className="text-sm sm:text-base text-c-muted mt-3 max-w-md mx-auto leading-relaxed">{body}</p>
      <a
        href={href}
        className={btn('primary', { size: 'hero', elevated: true, className: 'mt-6' })}
      >
        {label}
      </a>
    </div>
  );
}
