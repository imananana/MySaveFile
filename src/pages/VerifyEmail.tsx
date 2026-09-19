import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type ApiError } from '../lib/api';
import { useAuth } from '../store/useAuth';
import { btn } from '../components/common/btn';
import { waitFor } from '../lib/relativeTime';

type Status = 'checking' | 'success' | 'error' | 'throttled';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const refreshUser = useAuth((s) => s.refreshUser);
  const [status, setStatus] = useState<Status>('checking');
  const [retryAfter, setRetryAfter] = useState<number | undefined>();

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    let cancelled = false;
    api.verifyEmail(token)
      .then(async () => {
        if (cancelled) return;
        setStatus('success');
        // Refresh the cached user so any "verify your email" nudge clears.
        await refreshUser();
      })
      // A refusal for asking too often is NOT a dead link — the link is fine and
      // will work in a few minutes. Saying "expired" here sent people off to
      // request a replacement that was refused for the same reason.
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 429) { setRetryAfter(err.retryAfter); setStatus('throttled'); }
        else setStatus('error');
      });
    return () => { cancelled = true; };
  }, [token, refreshUser]);

  return (
    <div className="min-h-screen bg-c-base flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img src="/3d-clay-plumbob.svg" alt="" className="h-24 w-auto mb-4 select-none" draggable={false} />
        <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline leading-none mb-7">MySaveFile</h1>


        <div className="bg-c-card border border-c-border rounded-xl shadow-sm w-full p-7 text-center">
          {status === 'checking' && (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Verifying your email…</h2>
              <p className="text-c-dim text-sm">One moment.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Email verified ✓</h2>
              <p className="text-c-dim text-sm mb-5">Thanks — your email address is confirmed.</p>
              <Link
                to="/saves"
                className={btn('primary', { block: true })}
              >
                Go to your saves
              </Link>
            </>
          )}
          {status === 'throttled' && (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Too many attempts</h2>
              <p className="text-c-dim text-sm mb-5">
                The link is fine. Open it again in {waitFor(retryAfter)}.
              </p>
              <Link
                to="/saves"
                className={btn('primary', { block: true })}
              >
                Go to your saves
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Link invalid or expired</h2>
              {/* Says where the replacement actually is. "From your account" sent
                  people to Profile, which has no resend — the only one is the
                  banner on the saves page. */}
              <p className="text-c-dim text-sm mb-5">
                Sign in and press <span className="font-semibold text-c-muted">Resend email</span> on
                the banner above your save files.
              </p>
              <Link
                to="/saves"
                className={btn('primary', { block: true })}
              >
                Go to your saves
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
