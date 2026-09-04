/**
 * Story archive — a device-local record of every story Qissa has served
 * on this device (kept in localStorage, max 50 entries).
 *
 * This is deliberately NOT the server's story table: it proves the
 * offline rung works, since the list renders with zero network calls.
 */
import { Link } from 'react-router-dom';
import { archiveEntries } from '../lib/offline.js';

export function Archive() {
  const entries = archiveEntries();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Story archive</h1>
          <p className="text-sm text-ink/60">Stored on this device only — this page works fully offline.</p>
        </div>
        <Link to="/parent" className="btn-parent">
          Back
        </Link>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-ink/60 shadow">
          Nothing here yet. Every story you serve is recorded automatically as it's read.
        </p>
      ) : (
        <ul className="divide-y divide-ink/10 rounded-2xl bg-white shadow">
          {entries.map((entry) => (
            <li key={entry.storyId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{entry.title}</p>
                <p className="text-xs text-ink/50">
                  Level {entry.level} · sound “{entry.targetGrapheme}” · served{' '}
                  {new Date(entry.servedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <Link to={`/child/${entry.childId}`} className="btn-parent bg-leaf">
                Read again
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
