import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type ApiError } from '../lib/api';
import { btn } from '../components/common/btn';
import { waitFor } from '../lib/relativeTime';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [throttled, setThrottled] = useState<number | undefined>();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setThrottled(undefined);
    setLoading(true);
    try {
      // Always resolves ok regardless of whether the account exists.
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      // Being throttled means no mail was sent, so claiming it's on its way
      // leaves someone waiting for an email that will never arrive. The count is
      // per connection, not per address, so saying so reveals nothing.
      if ((err as ApiError).status === 429) setThrottled((err as ApiError).retryAfter ?? 60);
      // On any other error we still show the same confirmation, so the page
      // never reveals whether an address has an account.
      else setSent(true);
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
          {sent ? (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Check your email</h2>
              <p className="text-c-dim text-sm mb-5">
                If an account exists for <span className="font-semibold text-c-muted">{email}</span>,
                we've sent a link to reset your password. It expires in 1 hour.
              </p>
              <Link
                to="/login"
                className={btn('primary', { block: true })}
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-c-text mb-1">Forgot your password?</h2>
              <p className="text-c-dim text-sm mb-5">Enter your email and we'll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-c-muted mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full border border-c-border rounded-lg px-3 py-2 text-c-text bg-c-card focus:outline-none focus:ring-2 focus:ring-c-accent text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                {throttled !== undefined && (
                  <p className="text-c-red text-sm">
                    Too many attempts. Try again in {waitFor(throttled)}.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={btn('primary', { block: true })}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-c-dim">
          Remembered it?{' '}
          <Link to="/login" className="text-c-accent hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
