/**
 * Parent login/register — the only door into the app (FR-A.1: children
 * never log in). Server answers are uniform on failure; this form simply
 * surfaces them. The CSRF token from a successful auth is adopted here.
 *
 * Design: the grown-up door still carries the primer identity — warm art,
 * the "first real book" promise, and the three trust truths parents scan
 * for before they hand over a device (safety gate, time caps, voice privacy).
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { AuthResponse } from '../api/types.js';

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<AuthResponse>(`/auth/${mode}`, { email, password });
      api.adoptAuth(response);
      navigate('/parent');
    } catch (err) {
      const body = err instanceof Error ? (err as Error & { body?: { error?: string } }).body : undefined;
      setError(body?.error ?? (mode === 'register' ? 'Could not create the account.' : 'Invalid credentials.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl md:grid md:grid-cols-2">
        {/* Warm side — the primer promise, trust specifics, real art. */}
        <div className="relative hidden flex-col gap-6 bg-leaf p-8 text-white md:flex">
          <div>
            <p className="font-story text-3xl font-bold">Qissa</p>
            <p className="mt-2 text-xl font-bold leading-snug">
              Not a reading app.
              <br />
              Your child's first real book.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              Living stories that teach sounds and words — and weave in numbers, colors, nature and
              feelings — built fresh for your child every time.
            </p>
          </div>
          <img
            src="/landing/scene-parent.png"
            alt="A parent and child reading a storybook together"
            className="w-full rounded-2xl shadow-lg"
          />
          <ul className="space-y-2 text-sm text-white/90">
            <li>✓ Every story passes a safety and decodability gate</li>
            <li>✓ Gentle session caps protect playtime</li>
            <li>✓ Voice stays private — your consent decides</li>
          </ul>
        </div>

        {/* Form side. */}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col justify-center gap-4 p-8">
          <div>
            <h1 className="text-2xl font-bold">Parent sign-in</h1>
            <p className="mt-1 text-sm text-ink/60">
              One account for the grown-ups. Children never need a login — they just tap their story.
            </p>
          </div>

          <label className="block text-sm font-semibold">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              className="input-parent mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold">
            Password {mode === 'register' && <span className="font-normal text-ink/50">(10+ characters)</span>}
            <input
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className="input-parent mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error !== null && <p className="rounded-lg bg-clay/10 p-2 text-sm text-clay">{error}</p>}

          <button type="submit" className="btn-parent w-full py-3" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="w-full text-sm text-leaf underline"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
