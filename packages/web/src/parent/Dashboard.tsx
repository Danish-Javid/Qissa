/**
 * Parent dashboard — the grown-up's view of the primer.
 *
 * Three jobs, in order of what parents actually scan for:
 *  1. Their children, one warm card each, with the door to reading.
 *  2. What Qissa teaches — the primer breadth: sounds and words are the
 *     engine, but every story also carries numbers, colors, the living
 *     world, feelings and a home mission (woven through the picture-walk
 *     talk, the art and the offline task).
 *  3. The way in — progress and archive, one tap away.
 * Pipeline/audit honesty lives at /parent/pipeline (a judging view, not a
 * parent view). A 401 anywhere sends the parent to /parent/login.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { modeLabel, type MessageKey } from '@qissa/core';
import { api } from '../api/client.js';
import type { ChildSummary, MeResponse } from '../api/types.js';
import { LanguageToggle } from '../i18n/LanguageToggle.js';
import { useLocale } from '../i18n/LocaleProvider.js';
import { ParentPage } from './ParentPage.js';
import { Buddy } from '../child/Buddy.js';

/**
 * The primer scope — what a Qissa story teaches besides letters. Each line
 * says HOW honestly (picture-walk talk / art / home mission), never
 * overclaiming a curriculum the engine does not enforce.
 *
 * Built from the catalog rather than hard-coded. These were English literals
 * in a module constant, and the language switch lives in this very page's
 * header — so an Urdu-reading parent flipped the toggle and watched nothing
 * change. The README claimed the parent layer was "fully translated" while
 * six of ten files never called t() at all.
 */
function primerAreas(tr: (key: MessageKey) => string): { icon: string; name: string; how: string }[] {
  return [
    { icon: '🔤', name: tr('dash.breadthSoundsName'), how: tr('dash.breadthSoundsHow') },
    { icon: '🗣️', name: tr('dash.breadthSpokenName'), how: tr('dash.breadthSpokenHow') },
    { icon: '🎨', name: tr('dash.breadthColorsName'), how: tr('dash.breadthColorsHow') },
    { icon: '🌿', name: tr('dash.breadthWorldName'), how: tr('dash.breadthWorldHow') },
    { icon: '❤️', name: tr('dash.breadthFeelingsName'), how: tr('dash.breadthFeelingsHow') },
    { icon: '🏠', name: tr('dash.breadthHomeName'), how: tr('dash.breadthHomeHow') }
  ];
}


const AVATAR_TONES = ['bg-leaf', 'bg-clay', 'bg-sun', 'bg-gold'];

export function Dashboard() {
  const navigate = useNavigate();
  const { tr, num } = useLocale();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [children, setChildren] = useState<ChildSummary[]>([]);
  // Which child's controls are mid-save, so we can dim + disable them and
  // never fire two overlapping writes for the same child.
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.get<MeResponse>('/auth/me').then(setMe).catch(() => undefined);
    api.get<ChildSummary[]>('/children').then(setChildren).catch(() => undefined);
  }, []);

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Cookie may already be gone; the redirect below is the truth.
    }
    navigate('/parent/login');
  }

  /**
   * Parental controls over the three modes. Each change is a single-field
   * write to POST /children/:id/settings; the server merges it over the stored
   * settings, re-proves ownership, audits it, and returns the resolved child —
   * so we drop the response straight into state (no refetch, and a card can
   * never show a value the server disagreed with). A failed save leaves the
   * last good values on screen; we never optimistically show an unsaved one.
   */
  async function updateSettings(childId: string, patch: Record<string, unknown>): Promise<void> {
    setBusyId(childId);
    try {
      const updated = await api.post<ChildSummary>(`/children/${childId}/settings`, patch);
      setChildren((prev) => prev.map((c) => (c.id === childId ? updated : c)));
    } catch {
      // ignore — the controls revert to the last committed values on screen
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ParentPage className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-leaf px-6 py-5 text-white shadow">
        <div className="flex items-center gap-4">
          {/* Inline SVG, not the 877 KB landing PNG. That PNG is outside the
              service worker's precache, so a flaky or offline load left this
              slot showing a broken-image glyph next to the app's own name. */}
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 p-1">
            <Buddy mood="happy" size={44} />
          </span>
          <div>
            <h1 className="font-story text-2xl font-bold">{tr('common.appName')}</h1>
            <p className="text-sm text-white/85">{tr('dash.tagline', { email: me?.email ?? '…' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* The language switch lives in the dashboard header because that is
              the first parent surface after sign-in — an Urdu-reading parent
              should not have to reach the digest to find it. */}
          <LanguageToggle tone="dark" />
          <button type="button" className="rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/30" onClick={() => void logout()}>
            {tr('dash.signOut')}
          </button>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{tr('dash.yourChildren')}</h2>
          <Link to="/parent/setup" className="btn-parent">
            {tr('dash.addChild')}
          </Link>
        </div>
        {children.length === 0 ? (
          <p className="text-sm text-ink/60">
            {tr('dash.noChildren')}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {children.map((child, index) => (
              <li key={child.id} className="rounded-2xl border border-ink/10 bg-paper/60 p-5">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white ${AVATAR_TONES[index % AVATAR_TONES.length]}`}
                    aria-hidden
                  >
                    {child.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-bold">{child.name}</p>
                    <p className="text-xs text-ink/55">{tr('dash.phonicsLevel', { level: num(child.level) })}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link to={`/child/${child.id}`} className="btn-parent flex-1 bg-leaf text-center">
                    {tr('dash.readTogether')}
                  </Link>
                  <Link to={`/parent/digest/${child.id}`} className="btn-parent flex-1 bg-ink/70 text-center">
                    {tr('dash.progress')}
                  </Link>
                </div>

                {/* Parental control over the three modes. Age places the
                    learning door automatically; here the parent can override
                    it, turn the common Story Time door on/off, set its
                    narration pace, and cap the daily session. Collapsed by
                    default so the card stays scannable. */}
                <details className="mt-3 rounded-xl bg-white/70 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-leaf">{tr('dash.modesAndControls')}</summary>
                  <div className={`mt-3 space-y-3 ${busyId === child.id ? 'opacity-60' : ''}`}>
                    <p className="text-xs text-ink/60">
                      {tr('dash.ageAndDoor', { age: num(child.ageYears), door: modeLabel(child.learningTrack) })}
                      {child.storyTimeEnabled ? tr('dash.plusStoryTime') : ''}
                    </p>

                    <label className="block text-xs font-semibold text-ink/70">
                      {tr('dash.learningDoor')}
                      <select
                        className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-2 py-1.5 text-sm font-normal"
                        value={child.settings.learningTrack ?? 'auto'}
                        disabled={busyId === child.id}
                        onChange={(e) =>
                          void updateSettings(child.id, {
                            learningTrack: e.target.value === 'auto' ? null : e.target.value
                          })
                        }
                      >
                        <option value="auto">{tr('dash.doorAuto')}</option>
                        <option value="first-words">{tr('dash.doorFirstWords')}</option>
                        <option value="learn-to-read">{tr('dash.doorLearnToRead')}</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-ink/70">
                      <span>
                        {tr('dash.storyTime')}
                        <span className="block text-[11px] font-normal text-ink/50">
                          {tr('dash.storyTimeHint')}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-leaf"
                        checked={child.storyTimeEnabled}
                        disabled={busyId === child.id || child.ageYears < 1}
                        onChange={(e) => void updateSettings(child.id, { storyTimeEnabled: e.target.checked })}
                      />
                    </label>

                    <label className="block text-xs font-semibold text-ink/70">
                      {tr('dash.storyTimePace')}
                      <select
                        className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-2 py-1.5 text-sm font-normal"
                        value={child.storyPacing}
                        disabled={busyId === child.id || !child.storyTimeEnabled}
                        onChange={(e) => void updateSettings(child.id, { storyPacing: e.target.value })}
                      >
                        <option value="fluent">{tr('dash.paceFluent')}</option>
                        <option value="slow">{tr('dash.paceSlow')}</option>
                      </select>
                    </label>

                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-ink/70">
                      <span>
                        {tr('dash.lowBandwidth')}
                        <span className="block text-[11px] font-normal text-ink/50">
                          Simple drawn pictures instead of generated art — much less mobile data
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-leaf"
                        checked={child.settings.lowBandwidth === true}
                        disabled={busyId === child.id}
                        onChange={(e) => void updateSettings(child.id, { lowBandwidth: e.target.checked })}
                      />
                    </label>

                    <label className="block text-xs font-semibold text-ink/70">
                      {tr('dash.dailyCap')}
                      <input
                        type="number"
                        min={1}
                        max={60}
                        className="mt-1 w-full rounded-lg border border-ink/20 bg-white px-2 py-1.5 text-sm font-normal"
                        placeholder={tr('dash.serverDefault')}
                        defaultValue={child.sessionCapMinutes ?? ''}
                        disabled={busyId === child.id}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const n = Number(raw);
                          const next = raw === '' || Number.isNaN(n) ? null : Math.min(60, Math.max(1, Math.round(n)));
                          if (next !== (child.sessionCapMinutes ?? null)) {
                            void updateSettings(child.id, { sessionCapMinutes: next });
                          }
                        }}
                      />
                    </label>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Primer breadth — the "not just an edtech app" promise, made visible
          and honest about how each area is taught. */}
      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">{tr('dash.breadthTitle')}</h2>
        <p className="mb-4 mt-1 text-sm text-ink/60">{tr('dash.breadthIntro')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {primerAreas(tr).map((area) => (
            <div key={area.name} className="rounded-xl bg-paper/70 p-4">
              <p className="text-sm font-bold">
                <span className="mr-1.5" aria-hidden>{area.icon}</span>
                {area.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60">{area.how}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex justify-between text-sm">
        <Link to="/parent/demo" className="text-leaf underline">
          {tr('dash.demoControl')}
        </Link>
        <Link to="/parent/archive" className="text-leaf underline">
          {tr('dash.storyArchive')}
        </Link>
        <span className="text-ink/40">
          {me?.consentGivenAt ? tr('dash.consentGiven') : tr('dash.consentMissing')}
        </span>
      </footer>
    </ParentPage>
  );
}
