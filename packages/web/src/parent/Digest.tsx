/**
 * Parent digest — the "what happened and why" screen (FR-B).
 *
 * Everything here is read-only and parent-facing: the learner model's
 * grapheme status, per-session outcomes (incl. the server-enforced cap),
 * distress escalations (category only — never the child's raw words),
 * the reasoning timeline straight from the append-only audit log, recent
 * miscues with accent notes, and — if voice consent was given — playback
 * of the stored reading clips.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import type { DigestResponse } from '../api/types.js';

export function Digest() {
  const { childId } = useParams();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (childId === undefined) return;
    api
      .get<DigestResponse>(`/children/${childId}/digest`)
      .then(setDigest)
      .catch(() => setError('Could not load the digest. Are you signed in?'));
  }, [childId]);

  if (error !== null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p className="rounded-xl bg-clay/10 p-4 text-clay">{error}</p>
        <Link to="/parent" className="text-leaf underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (digest === null) {
    return <p className="p-6 text-ink/60">Loading the digest…</p>;
  }

  const learner = digest.learner;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{digest.child.name} — the story of their learning</h1>
          <p className="mt-1 text-sm text-ink/60">
            Sounds and words are the first chapter — every session also wove in spoken language,
            the wider world and a mission for home.
          </p>
          <p className="text-sm text-ink/60">
            Voice consent: {digest.child.consentGivenAt ? `given ${formatDate(digest.child.consentGivenAt)}` : 'not given — no audio is stored'}
          </p>
        </div>
        <Link to="/parent" className="btn-parent">
          Back
        </Link>
      </header>

      {/* Learner model — what the engine currently believes the child knows. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Phonics knowledge</h2>
        {learner === null ? (
          <p className="text-sm text-ink/60">No reading yet — the first story will teach the first sounds.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink/60">
              Level {learner.currentLevel} · {learner.vocabularyCount} decodable words unlocked
            </p>
            <GraphemeRow label="Mastered" graphemes={learner.mastered} tone="bg-leaf/15 text-leaf" />
            <GraphemeRow label="Learning" graphemes={learner.learning} tone="bg-gold/20 text-gold" />
            <GraphemeRow label="Reteach" graphemes={learner.reteach} tone="bg-clay/10 text-clay" />
            {learner.fluency.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Fluency trend (words/min)</p>
                <div className="flex flex-wrap gap-2">
                  {learner.fluency.map((point) => (
                    <span key={point.at} className="rounded-lg bg-paper px-2 py-1 text-sm">
                      {formatDate(point.at)}: <strong>{Math.round(point.wordsPerMinute)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Sessions — one row per reading, cap flags visible to the parent. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Sessions</h2>
        {digest.sessions.length === 0 ? (
          <p className="text-sm text-ink/60">No sessions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/50">
                <th className="py-2">When</th>
                <th className="py-2">Words</th>
                <th className="py-2">Accuracy</th>
                <th className="py-2">WPM</th>
                <th className="py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {digest.sessions.map((session) => (
                <tr key={session.id} className="border-b border-ink/5">
                  <td className="py-2">
                    {formatDate(session.startedAt)}
                    {session.cappedByServer && (
                      <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold">15-min cap</span>
                    )}
                  </td>
                  <td className="py-2">
                    {session.wordsCorrect}/{session.wordsRead}
                  </td>
                  <td className="py-2">{session.wordsRead === 0 ? '—' : `${Math.round((session.wordsCorrect / session.wordsRead) * 100)}%`}</td>
                  <td className="py-2">{session.wordsPerMinute === null ? '—' : Math.round(session.wordsPerMinute)}</td>
                  <td className="py-2">
                    ${(session.costMicroUsd / 1e6).toFixed(4)} <span className="text-xs text-ink/40">({session.providerMode})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Safety — distress escalations surface the category only (FR-I.2). */}
      {digest.distressEscalations.length > 0 && (
        <section className="rounded-2xl border-2 border-clay/30 bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-bold text-clay">Needs your attention</h2>
          <ul className="space-y-2 text-sm">
            {digest.distressEscalations.map((alert, index) => (
              <li key={index} className="rounded-lg bg-clay/10 p-3">
                <strong>{alert.category}</strong> — {formatDate(alert.createdAt)}. Qissa acknowledged it in the moment;
                please follow up with your child.
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reasoning timeline — append-only audit rows, newest first. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Why the engine did what it did</h2>
        {digest.reasoning.length === 0 ? (
          <p className="text-sm text-ink/60">No decisions recorded yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {digest.reasoning.slice(0, 30).map((row, index) => (
              <li key={index} className="flex gap-3 rounded-lg bg-paper p-3">
                <span className="shrink-0 text-xs text-ink/40">{formatDate(row.createdAt)}</span>
                <span>
                  <strong>{row.event}</strong> {summarize(row.detail)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Miscues — the teaching signal, with accent allow-list notes. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Recent miscues</h2>
        {digest.miscues.length === 0 ? (
          <p className="text-sm text-ink/60">No miscues recorded — or none since the last session.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {digest.miscues.slice(0, 20).map((miscue, index) => (
              <li key={index} className="rounded-lg bg-paper p-3">
                Expected <strong>{miscue.expected}</strong>
                {miscue.spoken !== null && <> — heard “{miscue.spoken}”</>} · {miscue.miscueType} · sound “{miscue.grapheme}”
                {miscue.accentApplied && (
                  <span className="ml-2 rounded-full bg-leaf/15 px-2 py-0.5 text-xs text-leaf">
                    accent variant{miscue.accentNote !== null ? `: ${miscue.accentNote}` : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audio clips — only exist when consent was given (NFR-3). */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Hear the progress</h2>
        {digest.audioClips.length === 0 ? (
          <p className="text-sm text-ink/60">
            No clips stored. Clips exist only when voice consent is on, and are deleted after 30 days.
          </p>
        ) : (
          <ul className="space-y-3">
            {digest.audioClips.map((clip) => (
              <li key={clip.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-paper p-3 text-sm">
                <span className="text-xs text-ink/50">{formatDate(clip.createdAt)}</span>
                {/* Same-origin stream; the session cookie authorizes it. */}
                <audio controls preload="none" src={`/api/audio/${clip.id}`} className="h-9 w-full max-w-sm" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Grapheme status chips — one row per mastery bucket. */
function GraphemeRow({ label, graphemes, tone }: { label: string; graphemes: string[]; tone: string }) {
  if (graphemes.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="w-20 text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</span>
      {graphemes.map((grapheme) => (
        <span key={grapheme} className={`rounded-md px-2 py-0.5 text-sm font-bold ${tone}`}>
          {grapheme}
        </span>
      ))}
    </div>
  );
}

/** Locale date-time without seconds — digest rows stay scannable. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Audit detail is free-form JSON; render a short human-readable hint. */
function summarize(detail: unknown): string {
  if (detail === null || detail === undefined) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object') {
    const entries = Object.entries(detail as Record<string, unknown>)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? '…' : String(value)}`);
    return entries.join(', ');
  }
  return String(detail);
}
