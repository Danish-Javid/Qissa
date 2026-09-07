/**
 * Story archive — a device-local record of every story Qissa has served
 * on this device (kept in localStorage, max 50 entries).
 *
 * This is deliberately NOT the server's story table: it proves the
 * offline rung works, since the list renders with zero network calls.
 */
import { Link } from 'react-router-dom';
import { LOCALE_META } from '@qissa/core';
import { archiveEntries } from '../lib/offline.js';
import { useLocale } from '../i18n/LocaleProvider.js';

export function Archive() {
  const { tr, num, locale } = useLocale();
  const dateLocale = LOCALE_META[locale].tag;
  const entries = archiveEntries();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tr('archive.title')}</h1>
          <p className="text-sm text-ink/60">{tr('archive.subtitle')}</p>
        </div>
        <Link to="/parent" className="btn-parent">
          {tr('archive.back')}
        </Link>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-ink/60 shadow">
          {tr('archive.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-ink/10 rounded-2xl bg-white shadow">
          {entries.map((entry) => (
            <li key={entry.storyId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{entry.title}</p>
                <p className="text-xs text-ink/50">
                  {tr('archive.entryMeta', {
                    level: num(entry.level),
                    grapheme: entry.targetGrapheme,
                    // The product locale, not the browser's: a parent who
                    // chose اردو should not get an en-US date beside it.
                    when: new Date(entry.servedAt).toLocaleString(dateLocale, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  })}
                </p>
              </div>
              <Link to={`/child/${entry.childId}`} className="btn-parent bg-leaf">
                {tr('archive.readAgain')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
