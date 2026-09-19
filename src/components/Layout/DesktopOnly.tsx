import type { ReactNode } from 'react';
import { Desktop } from '@phosphor-icons/react';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Gates editor-heavy screens on genuinely tiny PHONE viewports with a friendly
 * "open on a computer" interstitial. These editors reflow their rails into a
 * drawer (see MasterDetail), so the gate keys on device type, not just width: it
 * fires only when narrow AND the primary pointer is coarse (touch). A desktop
 * browser resized to any width keeps a fine pointer, so it never trips — only
 * real phones/small touch devices do.
 *
 * Wrap a route element:  <DesktopOnly title="Clubs"><ClubManager /></DesktopOnly>
 */
export function DesktopOnly({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  // Real touch phones only (narrow + coarse pointer) — a resized desktop browser
  // keeps a fine pointer, so it never trips this regardless of window width.
  const isMobile = useIsMobile('(max-width: 639.98px) and (pointer: coarse)');
  if (!isMobile) return <>{children}</>;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-c-accent-soft text-c-secondary mb-4">
        <Desktop size={30} weight="duotone" />
      </div>
      <h1 className="text-xl font-bold text-c-text tracking-headline mb-2">The {title} tool works best on desktop</h1>
      <p className="text-sm text-c-dim max-w-xs leading-relaxed">
        {description ?? `This screen needs more room than a phone gives it. Open MySaveFile on a computer to use the ${title} tool.`}
      </p>
    </div>
  );
}
