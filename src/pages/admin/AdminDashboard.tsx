import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type AdminOverview, type AdminStats, type AdminUser } from '../../lib/adminApi';
import { PlumbobLoader } from '../../components/common/PlumbobLoader';
import { AdminTiles } from './AdminTiles';
import { AdminFunnel } from './AdminFunnel';
import { AdminTrends } from './AdminTrends';
import { AdminUsers } from './AdminUsers';
import { AdminFailures } from './AdminFailures';
import { AdminStatsPanel } from './AdminStats';

/**
 * The owner's dashboard. One admin, read-only, linked from nowhere — you get
 * here by typing /admin.
 *
 * ★ A visitor who isn't an admin must not be able to tell this page apart from
 * a URL that means nothing. The API answers every non-admin with a 404, and
 * this renders exactly what any unknown route renders. No "access denied", no
 * sign-in prompt: both would confirm there is something here.
 *
 * The ping gate answers in milliseconds, so the chrome and the "nothing here"
 * decision both land before the aggregate queries do.
 *
 * See docs/admin-dashboard-plan.md.
 */
export default function AdminDashboard() {
  const [state, setState] = useState<'checking' | 'admin' | 'no'>('checking');
  const [email, setEmail] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The gate and the data are separate awaits on purpose: a failed ping
      // means "you are not an admin", a failed overview means "a query broke".
      // Collapsing them into one catch would show a broken query as a page
      // that doesn't exist.
      let who;
      try {
        who = await adminApi.ping();
      } catch {
        if (!cancelled) setState('no');
        return;
      }
      if (cancelled) return;
      setEmail(who.email);
      setState('admin');
      // The three payloads render three independent zones, so they land as
      // they arrive rather than waiting on the slowest. One broken query
      // shouldn't blank the two that work.
      const load = <T,>(fetcher: () => Promise<T>, set: (v: T) => void) =>
        fetcher()
          .then((v) => { if (!cancelled) set(v); })
          .catch((err: Error) => { if (!cancelled) setError(err.message); });

      await Promise.all([
        load(adminApi.overview, setOverview),
        load(adminApi.users, setUsers),
        load(adminApi.stats, setStats),
      ]);
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-c-base flex items-center justify-center">
        <PlumbobLoader size="lg" />
      </div>
    );
  }

  if (state === 'no') return <NotFound />;

  return (
    <div className="min-h-screen bg-c-base">
      <header className="bg-c-card border-b border-c-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/3d-clay-plumbob.svg" alt="" className="h-11 w-auto shrink-0 select-none" draggable={false} />
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-c-text tracking-headline">MySaveFile admin</h1>
            <p className="text-xs text-c-dim">{email}</p>
          </div>
        </div>
        <Link to="/saves" className="text-sm text-c-dim hover:text-c-text transition-colors no-underline">
          Back to saves
        </Link>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-7 py-6">
        {error && <p className="text-c-red text-sm mb-4">{error}</p>}

        {!overview && !error && (
          <div className="flex items-center justify-center py-24"><PlumbobLoader size="md" /></div>
        )}

        {overview && (
          <>
            <AdminTiles tiles={overview.tiles} initialOnline={overview.online} />
            <AdminFunnel funnel={overview.funnel} />
            <AdminTrends trends={overview.trends} hasImportEvents={overview.hasImportEvents} />
            {/* Only once logging has run here — an empty failures list before
                that would be a reassurance nothing has earned. */}
            {overview.hasImportEvents && <AdminFailures failures={overview.recentFailures} />}
          </>
        )}
        {users && <AdminUsers users={users} />}
        {stats && <AdminStatsPanel stats={stats} />}
      </main>
    </div>
  );
}

/**
 * Byte-identical in spirit to what any unknown path shows. The app's catch-all
 * route sends unknown paths to `/`; this page can't do that (the check is
 * async and a redirect would flash), so it says the same nothing in place.
 */
function NotFound() {
  return (
    <div className="min-h-screen bg-c-base flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-c-dim">Nothing here.</p>
      <Link to="/" className="text-c-accent text-sm hover:underline">Go home</Link>
    </div>
  );
}
