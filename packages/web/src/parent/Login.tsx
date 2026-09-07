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
import { useLocale } from '../i18n/LocaleProvider.js';
import { api } from '../api/client.js';
import type { AuthResponse } from '../api/types.js';
import { Illustration } from '../lib/Illustration.js';

export function Login() {
  const { tr } = useLocale();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Registration only. Kept out of the login payload entirely rather than sent
  // as empty strings, which the server's strict schema would reject.
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isGuardian, setIsGuardian] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === 'register'
          ? { email, password, fullName, birthDate, isGuardian }
          : { email, password };
      const response = await api.post<AuthResponse>(`/auth/${mode}`, payload);
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
              {tr('login.pitchLine1')}
              <br />
              {tr('login.pitchLine2')}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              {tr('login.pitchBody')}
            </p>
          </div>
          <Illustration             src="/landing/scene-parent.png"
            alt={tr('login.illustrationAlt')}
            className="w-full rounded-2xl shadow-lg"
          />
          <ul className="space-y-2 text-sm text-white/90">
            <li>✓ {tr('login.promiseGate')}</li>
            <li>✓ {tr('login.promiseCap')}</li>
            <li>✓ {tr('login.promiseVoice')}</li>
          </ul>
        </div>

        {/* Form side. */}
        <form onSubmit={(e) => void submit(e)} className="flex flex-col justify-center gap-4 p-8">
          <div>
            <h1 className="text-2xl font-bold">
              {mode === 'login' ? tr('login.titleSignIn') : tr('login.titleRegister')}
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              {mode === 'login'
                ? tr('login.blurbSignIn')
                : tr('login.blurbRegister')}
            </p>
          </div>

          {mode === 'register' && (
            <label className="block text-sm font-semibold">
              {tr('login.fullName')}
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                className="input-parent mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm font-semibold">
            {tr('login.email')}
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
            {tr('login.password')}{' '}
            {mode === 'register' && (
              <span className="font-normal text-ink/50">{tr('login.passwordHint')}</span>
            )}
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

          {mode === 'register' && (
            <>
              <label className="block text-sm font-semibold">
                {tr('login.birthDate')}
                <span className="block text-xs font-normal text-ink/50">
                  {tr('login.birthDateHint')}
                </span>
                <input
                  type="date"
                  required
                  // Bounds the picker to plausible adult birth years. The server
                  // re-checks the age; this is only here so the calendar opens
                  // somewhere sensible instead of on today's date.
                  max={maxAdultBirthDate()}
                  min="1906-01-01"
                  autoComplete="bday"
                  className="input-parent mt-1"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </label>

              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  required
                  className="mt-1 h-5 w-5 shrink-0 accent-leaf"
                  checked={isGuardian}
                  onChange={(e) => setIsGuardian(e.target.checked)}
                />
                <span className="text-ink/75">
                  {tr('login.guardian')}
                </span>
              </label>
            </>
          )}

          {error !== null && <p className="rounded-lg bg-clay/10 p-2 text-sm text-clay">{error}</p>}

          <button type="submit" className="btn-parent w-full py-3" disabled={busy}>
            {busy ? tr('login.busy') : mode === 'login' ? tr('login.submitSignIn') : tr('login.submitRegister')}
          </button>

          <button
            type="button"
            className="w-full text-sm text-leaf underline"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? tr('login.switchToRegister') : tr('login.switchToSignIn')}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Today minus 18 years, as YYYY-MM-DD — the latest date the picker allows. */
function maxAdultBirthDate(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 18);
  return d.toISOString().slice(0, 10);
}
