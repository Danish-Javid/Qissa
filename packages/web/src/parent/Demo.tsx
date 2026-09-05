/**
 * Demo control panel (FR-K) — stage setup and teardown, two buttons.
 *
 * This is an operator surface, not a parent one. It exists because the largest
 * risk in a live demo is the thirty seconds of typing between "let me show you"
 * and something being on screen: filling a birth date, discovering three
 * rehearsal children on the account, or opening a digest that has nothing in it
 * because no story has been generated yet.
 *
 * Seeding runs the real pipeline. The stories it produces genuinely passed the
 * decodability gate and the content filter, and genuinely wrote the audit rows
 * that the pipeline view reads — so the honesty screen stays honest.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { LanguageToggle } from '../i18n/LanguageToggle.js';
import { ParentPage } from './ParentPage.js';

interface SeedResponse {
  childId: string;
  name: string;
  stories: string[];
  providerMode: string;
  sessionCapMinutes: number;
}

type Status = { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'done'; seed: SeedResponse } | { kind: 'reset'; removed: number } | { kind: 'error'; message: string };

export function Demo() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const busy = status.kind === 'busy';

  async function seed(): Promise<void> {
    setStatus({ kind: 'busy', what: 'Generating stories through the real pipeline…' });
    try {
      const seeded = await api.post<SeedResponse>('/demo/seed', { stories: 3 });
      setStatus({ kind: 'done', seed: seeded });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof ApiError ? `Seeding failed (${err.status}).` : 'Seeding failed.'
      });
    }
  }

  async function reset(): Promise<void> {
    setStatus({ kind: 'busy', what: 'Removing demo data…' });
    try {
      const { removed } = await api.post<{ removed: number }>('/demo/reset', {});
      setStatus({ kind: 'reset', removed });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof ApiError ? `Reset failed (${err.status}).` : 'Reset failed.'
      });
    }
  }

  return (
    <ParentPage className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="rounded-3xl bg-ink px-6 py-5 text-white shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-story text-2xl font-bold">Demo control</h1>
            <p className="mt-1 text-sm text-white/75">
              Stage setup and teardown. Seeding runs the real story pipeline — nothing here is a
              fixture, so the pipeline view stays truthful.
            </p>
          </div>
          <LanguageToggle tone="dark" />
        </div>
        <Link to="/parent" className="mt-3 inline-block text-sm text-white/80 underline">
          ← Back to dashboard
        </Link>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">One-tap setup</h2>
        <p className="mt-1 text-sm text-ink/70">
          Creates <strong>Ayesha</strong>, age 4, Lahore — the Learn to Read band — and generates
          three stories, each teaching the next sound in her scope. Re-seeding replaces the previous
          demo child rather than stacking another beside it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-parent" disabled={busy} onClick={() => void seed()}>
            {busy ? 'Working…' : 'Set up the demo'}
          </button>
          <button
            type="button"
            className="rounded-xl border border-clay/40 px-4 py-2 text-sm font-semibold text-clay hover:bg-clay/5 disabled:opacity-50"
            disabled={busy}
            onClick={() => void reset()}
          >
            Reset demo data
          </button>
        </div>
        <p className="mt-3 text-xs text-ink/50">
          Reset removes only children created by this seeder, and only on your own account. Real
          children are never touched, and the append-only audit log is never rewritten.
        </p>
      </section>

      {status.kind === 'busy' && (
        <p className="rounded-2xl bg-gold/10 p-4 text-sm text-ink/70">{status.what}</p>
      )}

      {status.kind === 'error' && (
        <p className="rounded-2xl bg-clay/10 p-4 text-sm text-clay">{status.message}</p>
      )}

      {status.kind === 'reset' && (
        <p className="rounded-2xl bg-leaf/10 p-4 text-sm text-leaf">
          Removed {status.removed} demo {status.removed === 1 ? 'child' : 'children'}.
        </p>
      )}

      {status.kind === 'done' && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold">Ready — {status.seed.name}</h2>
          <p className="mt-1 text-sm text-ink/70">
            Provider mode <strong>{status.seed.providerMode}</strong> · session cap{' '}
            {status.seed.sessionCapMinutes} minutes. These stories passed every gate:
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-ink/80">
            {status.seed.stories.map((title, index) => (
              <li key={index}>“{title}”</li>
            ))}
          </ul>

          {/* The demo path, in the order it should be walked. */}
          <ol className="mt-5 space-y-2 text-sm">
            <li>
              <strong>1.</strong> Open the child's doors —{' '}
              <button
                type="button"
                className="text-leaf underline"
                onClick={() => navigate(`/child/${status.seed.childId}`)}
              >
                /child/{status.seed.name}
              </button>
            </li>
            <li>
              <strong>2.</strong> Show the parent's view —{' '}
              <Link to={`/parent/digest/${status.seed.childId}`} className="text-leaf underline">
                why each story was chosen
              </Link>
            </li>
            <li>
              <strong>3.</strong> Close on the honesty screen —{' '}
              <Link to="/parent/pipeline" className="text-leaf underline">
                the pipeline view
              </Link>
            </li>
          </ol>
        </section>
      )}
    </ParentPage>
  );
}
