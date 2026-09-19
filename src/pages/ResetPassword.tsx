import { useState, useEffect, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { btn } from '../components/common/btn';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  // Validate the token on load so a used/expired link shows the error state
  // immediately, instead of only after the user fills in and submits the form.
  useEffect(() => {
    if (!token) { setChecking(false); return; }
    let cancelled = false;
    api.checkResetToken(token)
      .then((r) => { if (!cancelled) setTokenValid(r.valid); })
      .catch(() => { if (!cancelled) setTokenValid(false); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      // Brief success state, then send them to sign in.
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-c-base flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        <img src="/3d-clay-plumbob.svg" alt="" className="h-24 w-auto mb-4 select-none" draggable={false} />
        <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline leading-none mb-7">MySaveFile</h1>


        <div className="bg-c-card border border-c-border rounded-xl shadow-sm w-full p-7">
          {!token || (!checking && !tokenValid) ? (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Link expired</h2>
              <p className="text-c-dim text-sm mb-5">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className={btn('primary', { block: true })}
              >
                Request a new link
              </Link>
            </>
          ) : checking ? (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Checking your link…</h2>
              <p className="text-c-dim text-sm">One moment.</p>
            </>
          ) : done ? (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Password updated</h2>
              <p className="text-c-dim text-sm">Taking you to sign in…</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Set a new password</h2>
              <p className="text-c-dim text-sm mb-5">Choose a new password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-c-muted mb-1">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full border border-c-border rounded-lg px-3 py-2 text-c-text bg-c-card focus:outline-none focus:ring-2 focus:ring-c-accent text-sm"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-c-muted mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="w-full border border-c-border rounded-lg px-3 py-2 text-c-text bg-c-card focus:outline-none focus:ring-2 focus:ring-c-accent text-sm"
                    placeholder="••••••••"
                  />
                </div>

                {error && <p className="text-c-red text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className={btn('primary', { block: true })}
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-c-dim">
          <Link to="/login" className="text-c-accent hover:underline font-semibold">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
