import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';

/**
 * Where does someone go FIRST after importing their save?
 *
 * The import lands them on the overview and goes quiet — this measures what
 * happens next. GameImport arms a localStorage flag at import time; the first
 * navigation to any page INSIDE a save consumes it and logs the destination,
 * bucketed. Landing on the overview itself doesn't count (that's where the
 * import puts you, not where you chose to go), and neither does leaving the
 * app — a user with no first_stop event at all is the "never went anywhere"
 * signal the admin card subtracts out.
 *
 * ★ Lives at the App level, not in PlannerApp: pages like the showcase editor
 * mount OUTSIDE PlannerApp's routes, and the flag should survive someone who
 * bounces back to the picker and opens their save again tomorrow — their
 * first stop is still their first stop.
 *
 * One event per armed flag. The flag re-arms on every import, but the tally
 * counts distinct people per destination, so a veteran's third import can't
 * inflate anything.
 */

const STORAGE_KEY = 'post_import_first_stop';

/** The destinations worth telling apart; everything else lands in 'other'. */
const BUCKETS: Record<string, Parameters<typeof api.logFeatureEvent>[0]> = {
  world: 'first_stop_world',
  sims: 'first_stop_sims',
  households: 'first_stop_households',
  family: 'first_stop_family',
  photos: 'first_stop_photos',
};

export function useFirstStopAfterImport() {
  const { pathname } = useLocation();

  useEffect(() => {
    let armed = false;
    try {
      armed = localStorage.getItem(STORAGE_KEY) !== null;
    } catch { /* private mode */ }
    if (!armed) return;

    // A page inside a save: /saves/<id>/<segment>… — the bare overview
    // (/saves/<id>) and everything outside /saves deliberately don't match.
    const m = pathname.match(/^\/saves\/[^/]+\/([^/]+)/);
    if (!m) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode */ }
    api.logFeatureEvent(BUCKETS[m[1]] ?? 'first_stop_other');
  }, [pathname]);
}
