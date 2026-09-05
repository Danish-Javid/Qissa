/**
 * Connection indicator + the demo's offline switch.
 *
 * Lives on the pipeline (honesty) view rather than a child screen: a child must
 * never be shown a network state they cannot act on, and the whole point of the
 * offline path is that it looks like nothing happened.
 */
import { useEffect, useState } from 'react';
import {
  isOffline,
  isSimulatingOffline,
  onConnectionChange,
  setSimulatedOffline
} from './connection.js';

export function ConnectionBadge() {
  const [offline, setOffline] = useState(isOffline);
  const [simulated, setSimulated] = useState(isSimulatingOffline);

  useEffect(() => onConnectionChange(setOffline), []);

  function toggle(next: boolean): void {
    setSimulatedOffline(next);
    setSimulated(next);
    setOffline(isOffline());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
          offline ? 'bg-clay/15 text-clay' : 'bg-leaf/15 text-leaf'
        }`}
      >
        <span aria-hidden="true">{offline ? '○' : '●'}</span>
        {offline ? 'Offline' : 'Online'}
        {simulated && <span className="font-normal opacity-70">(simulated)</span>}
      </span>

      <label className="flex items-center gap-2 text-xs font-semibold text-ink/70">
        <input
          type="checkbox"
          className="h-4 w-4 accent-clay"
          checked={simulated}
          onChange={(e) => toggle(e.target.checked)}
        />
        Cut the network
      </label>

      <p className="basis-full text-xs text-ink/50">
        Fails every API call the way a dead connection does, so the app takes the real degraded
        path: the mirrored story plays from the device, the browser voice speaks, and no session is
        recorded. Not persisted — a reload always comes back online.
      </p>
    </div>
  );
}
