import { useEffect, useState } from 'react';
import { PlumbobLoader } from './PlumbobLoader';

/**
 * A route loader that stays out of the way when the route is already fast.
 *
 * A `<Suspense>` fallback renders the instant React hits the boundary, so a
 * chunk that lands in 40ms still flashes a full-screen plumbob — which reads
 * as the app being busy, not quick. Nothing at all is worse: the page just goes
 * blank, and on the pre-rendered public pages it blanks text the reader was
 * already looking at.
 *
 * So: show nothing for a moment, then the loader if the wait turns out to be
 * real. 200ms is the usual figure for "long enough that a person notices the
 * page stopped".
 */
export function DelayedFallback({ delay = 200 }: { delay?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!show) return null;
  return (
    <div className="min-h-screen bg-c-base flex items-center justify-center">
      <PlumbobLoader size="lg" />
    </div>
  );
}
