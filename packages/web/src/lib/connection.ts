/**
 * Connection state + the demo's offline switch (FR-K).
 *
 * The README claims this app "runs with the venue Wi-Fi unplugged". That claim
 * is true — the offline story cache, Web Speech and the client VAD are all
 * real — but on stage it is unprovable without physically pulling a cable,
 * which nobody will do mid-pitch and which also kills the projector.
 *
 * So the claim gets a switch. Simulated offline makes every /api call fail the
 * same way a dead network does, which drives the app down the exact same code
 * path: the mirrored story plays from localStorage, the browser voice speaks,
 * and no session row is written. It is not a mock of offline behaviour — it is
 * the real degraded path, triggered deliberately.
 *
 * Deliberately NOT persisted across reloads. An operator who forgets to switch
 * it back and reloads gets a working app, not a mysteriously broken one.
 */

type Listener = (offline: boolean) => void;

let simulated = false;
const listeners = new Set<Listener>();

/** True when the browser reports no network, or the demo switch is on. */
export function isOffline(): boolean {
  return simulated || !navigator.onLine;
}

export function isSimulatingOffline(): boolean {
  return simulated;
}

export function setSimulatedOffline(next: boolean): void {
  if (simulated === next) return;
  simulated = next;
  emit();
}

function emit(): void {
  const state = isOffline();
  for (const listener of listeners) listener(state);
}

/** Subscribe to connection changes; returns an unsubscribe. */
export function onConnectionChange(listener: Listener): () => void {
  listeners.add(listener);
  const relay = (): void => emit();
  window.addEventListener('online', relay);
  window.addEventListener('offline', relay);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('online', relay);
    window.removeEventListener('offline', relay);
  };
}

/**
 * The error a simulated-offline request throws.
 *
 * A distinct class rather than a generic Error so the api client can be sure
 * this came from the switch, and callers that already handle network failure
 * need no new branch — they see a rejected fetch, exactly as they would with
 * the cable pulled.
 */
export class SimulatedOfflineError extends Error {
  constructor() {
    super('simulated offline (demo switch)');
    this.name = 'SimulatedOfflineError';
  }
}
