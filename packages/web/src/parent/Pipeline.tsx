/**
 * Pipeline honesty — the judging/demo view of the safety gate.
 *
 * This is NOT a parent surface: parents care about their child, not about
 * rejection rates. It lives behind the same parent auth (demo credentials at
 * a hackathon) at /parent/pipeline so judges can see live audit truth:
 * what the gate accepted, rejected, fell back to, and what it cost.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { ConnectionBadge } from '../lib/ConnectionBadge.js';
import type { MetricsResponse } from '../api/types.js';

export function Pipeline() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);

  useEffect(() => {
    api.get<MetricsResponse>('/metrics-demo').then(setMetrics).catch(() => undefined);
  }, []);

  const percent = (n: number | null): string => (n === null ? '—' : `${Math.round(n * 100)}%`);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="rounded-3xl bg-ink px-6 py-5 text-white shadow">
        <h1 className="font-story text-2xl font-bold">Under the hood — pipeline honesty</h1>
        <p className="mt-1 text-sm text-white/75">
          Live from the append-only audit trail: what the safety gate actually did, not what a
          marketing page would claim. Provider mode: <strong>{metrics?.providerMode ?? '…'}</strong>.
        </p>
        <Link to="/parent" className="mt-3 inline-block text-sm text-white/80 underline">
          ← Back to dashboard
        </Link>
      </header>

      {/* Resilience, demonstrable rather than asserted. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 text-lg font-bold">Connection</h2>
        <ConnectionBadge />
      </section>

      {metrics === null ? (
        <p className="text-sm text-ink/60">Loading audit metrics…</p>
      ) : (
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Stories accepted" value={String(metrics.pipeline.storiesAccepted)} />
            <Stat label="Stories rejected" value={String(metrics.pipeline.storiesRejected)} />
            <Stat label="Rejection rate" value={percent(metrics.pipeline.rejectionRate)} />
            <Stat label="Fallbacks served" value={String(metrics.pipeline.fallbacksServed)} />
            <Stat label="Sessions capped" value={String(metrics.sessions.cappedByServer)} />
            <Stat label="Words read" value={String(metrics.sessions.wordsRead)} />
            <Stat label="Accuracy" value={percent(metrics.sessions.accuracy)} />
            <Stat label="Vendor spend" value={`$${(metrics.sessions.costMicroUsd / 1e6).toFixed(4)}`} />
            <Stat label="Distress escalations" value={String(metrics.safety.distressEscalations)} />
            <Stat label="Accent catches" value={String(metrics.safety.accentVariantCatches)} />
            <Stat label="Daily budget / child" value={String(metrics.budget.perChildPerDay)} />
            <Stat label="Generations withheld" value={String(metrics.budget.generationsWithheld)} />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}
