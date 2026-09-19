import type { ReactNode } from 'react';
import { Warning } from '@phosphor-icons/react';

/**
 * The app's one warning-callout style: a calm white card with a slim amber
 * left accent bar and a duotone amber icon — amber as an *accent*, not a fill.
 * Replaces the old `bg-c-warn-bg` filled-yellow banners, which sat too close
 * to the cream canvas and read as shouty/muddy.
 *
 * Use for genuinely actionable nudges (stale sync, unowned pack, unsaved-ish
 * states). For tiny inline semantic tags, plain `text-c-warn` is still fine —
 * this is specifically the banner shape.
 */
export function WarnCallout({
  title,
  action,
  className = '',
  children,
}: {
  /** Bold lead-in, rendered inline before the message. */
  title?: ReactNode;
  /** Optional trailing action (button / link), right-aligned. */
  action?: ReactNode;
  /** Outer spacing/rounding overrides for the callsite (margins, etc.). */
  className?: string;
  /** The message body. */
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden flex items-center gap-3 rounded-lg border border-c-border bg-c-card pl-4 pr-4 py-3 ${className}`}
    >
      {/* Amber accent bar */}
      <span className="absolute left-0 inset-y-0 w-[3px] bg-c-gold" aria-hidden />
      <Warning size={18} weight="duotone" className="text-c-gold shrink-0" />
      <div className="flex-1 min-w-0 text-xs leading-snug text-c-text">
        {title && <span className="font-semibold">{title}</span>}
        {title && children ? ' ' : null}
        {children && <span className="text-c-dim">{children}</span>}
      </div>
      {action}
    </div>
  );
}
