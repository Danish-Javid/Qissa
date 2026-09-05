/**
 * Progress certificate — the emotional close (FR-J).
 *
 * Every number on it comes from the digest payload the parent can already
 * audit; nothing is rounded up and nothing is invented. A certificate that
 * flattered the child would undermine the one thing the digest is for.
 *
 * Print is the point. Pakistani homes put children's achievements on the
 * fridge and the wall, and a printed sheet reaches grandparents who will never
 * open a PWA. The print stylesheet lives here rather than in styles.css
 * because it is the only surface in the app that expects paper.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import type { DigestResponse } from '../api/types.js';
import { LanguageToggle } from '../i18n/LanguageToggle.js';
import { useLocale } from '../i18n/LocaleProvider.js';
import { ShareButton } from './ShareButton.js';

export function Certificate() {
  const { childId } = useParams();
  const { tr, num, locale } = useLocale();
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (childId === undefined) return;
    api
      .get<DigestResponse>(`/children/${childId}/digest`)
      .then(setDigest)
      .catch(() => setFailed(true));
  }, [childId]);

  // A swallowed error used to leave this screen on "Loading…" forever, which
  // is indistinguishable from a slow network and impossible to act on.
  if (failed) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="rounded-2xl bg-clay/10 p-4 text-sm text-clay">
          Could not load this child’s progress. Are you signed in as their parent?
        </p>
        <Link to="/parent" className="text-leaf underline">
          {tr('common.backToDashboard')}
        </Link>
      </div>
    );
  }

  if (digest === null) return <p className="p-6 text-ink/60">{tr('common.loading')}</p>;

  const learner = digest.learner;
  const mastered = learner?.mastered ?? [];
  const wordsRead = digest.sessions.reduce((sum, s) => sum + s.wordsRead, 0);
  const level = learner?.currentLevel ?? 1;
  const issued = new Date().toLocaleDateString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Nothing has been read yet: a blank certificate is worse than none.
  if (learner === null || mastered.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="rounded-2xl bg-white p-6 text-sm text-ink/70 shadow">
          {tr('cert.notYet', { name: digest.child.name })}
        </p>
        <Link to={`/parent/digest/${childId}`} className="text-leaf underline">
          {tr('common.backToDashboard')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      {/* Controls — hidden on paper. */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to={`/parent/digest/${childId}`} className="text-sm text-leaf underline">
          {tr('common.backToDashboard')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <LanguageToggle />
          <ShareButton
            name={digest.child.name}
            level={level}
            sounds={mastered.length}
            words={wordsRead}
          />
          <button type="button" className="btn-parent" onClick={() => window.print()}>
            {tr('common.print')}
          </button>
        </div>
      </div>

      <article className="certificate rounded-3xl border-4 border-gold/40 bg-white p-10 text-center shadow">
        <p className="font-story text-sm uppercase tracking-[0.3em] text-gold">{tr('cert.title')}</p>

        <p className="mt-8 text-xs uppercase tracking-widest text-ink/45">{tr('cert.awardedTo')}</p>
        <h1 className="font-story text-4xl font-bold text-ink">{digest.child.name}</h1>

        <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">
          {tr('cert.achievement', { level: num(level), count: num(mastered.length) })}
        </p>

        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
            {tr('cert.soundsLearned', { name: digest.child.name })}
          </p>
          {/* dir="ltr" on the ROW, not just each chip: these arrive in the order
              the scope teaches them (s, a, t, p...), and an RTL container
              reverses that sequence on screen. The graphemes are Latin in both
              locales anyway — they are what the child actually decodes. */}
          <div dir="ltr" className="mt-3 flex flex-wrap justify-center gap-2">
            {mastered.map((grapheme) => (
              <span
                key={grapheme}
                className="rounded-xl bg-leaf/10 px-3 py-1.5 font-story text-lg font-bold text-leaf"
              >
                {grapheme}
              </span>
            ))}
          </div>
        </section>

        {wordsRead > 0 && (
          <p className="mt-8 font-story text-xl text-ink/80">
            {tr('cert.wordsRead', { count: num(wordsRead) })}
          </p>
        )}

        <footer className="mt-10 border-t border-ink/10 pt-4 text-xs text-ink/45">
          <p>{tr('cert.issued', { date: issued })}</p>
          <p className="mt-1 font-story">{tr('cert.signature')}</p>
        </footer>
      </article>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          /* The certificate is the page: drop the app's paper background and
             let the border be the only frame, so it prints without a tinted
             block behind it and without wasting ink on chrome. */
          body { background: #fff !important; }
          .certificate { border-width: 3px; box-shadow: none; margin: 0; }
          @page { margin: 14mm; }
        }
      `}</style>
    </div>
  );
}
