import { useState, useEffect } from 'react';

/**
 * True on narrow (phone) viewports. Drives the desktop-first mobile gating:
 * the planner UI assumes a fixed sidebar + side-by-side panes, so several
 * editor-heavy screens render a "use a desktop" interstitial below this width
 * rather than laying out badly.
 *
 * Mirrors the MobileBanner breakpoint (max-width: 768px) so the banner and the
 * gates agree on what "mobile" means.
 */
export function useIsMobile(query = '(max-width: 768px)'): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return isMobile;
}
