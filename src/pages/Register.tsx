import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store/useAuth';
import { btn } from '../components/common/btn';

export default function Register() {
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password);
      navigate('/saves');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-c-base flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Link to="/" className="flex flex-col items-center no-underline mb-7 group">
          <img
            src="/3d-clay-plumbob.svg"
            alt=""
            className="h-24 w-auto mb-4 select-none"
            draggable={false}
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline leading-none group-hover:text-c-accent transition-colors">
            MySaveFile
          </h1>
          <p className="text-2xs font-semibold tracking-label-lg uppercase text-c-dim mt-2">
            The Sims 4 Save Planner
          </p>
        </Link>

        <div className="bg-c-card border border-c-border rounded-xl shadow-sm w-full p-7">
          <h2 className="text-lg font-bold text-c-text mb-1">Create account</h2>
          <p className="text-c-dim text-sm mb-5">Start planning your Sims 4 worlds</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-c-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-c-border rounded-lg px-3 py-2 text-c-text bg-c-card focus:outline-none focus:ring-2 focus:ring-c-accent text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-c-muted mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-c-border rounded-lg px-3 py-2 text-c-text bg-c-card focus:outline-none focus:ring-2 focus:ring-c-accent text-sm"
                placeholder="At least 8 characters"
              />
            </div>

            {error && <p className="text-c-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className={btn('primary', { block: true })}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 relative flex items-center">
            <div className="flex-1 border-t border-c-border" />
            <span className="px-3 text-c-faint text-xs">or</span>
            <div className="flex-1 border-t border-c-border" />
          </div>

          <a
            href="/api/auth/google"
            className="mt-4 flex items-center justify-center gap-2 border border-c-border rounded-lg py-2 text-sm text-c-muted hover:bg-c-panel transition-colors no-underline"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign up with Google
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-c-dim">
          Already have an account?{' '}
          <Link to="/login" className="text-c-accent hover:underline font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
