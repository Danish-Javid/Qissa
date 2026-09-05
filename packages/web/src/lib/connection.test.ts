/**
 * Connection / simulated-offline tests.
 *
 * The property that matters: the switch must make requests fail BEFORE fetch,
 * so the app walks its real degraded path instead of a "pretend offline"
 * branch. A test that only checked a boolean would not catch a client that
 * consulted the flag and then fetched anyway.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SimulatedOfflineError,
  isOffline,
  isSimulatingOffline,
  onConnectionChange,
  setSimulatedOffline
} from './connection.js';
import { api } from '../api/client.js';

afterEach(() => {
  setSimulatedOffline(false);
  vi.unstubAllGlobals();
});

describe('simulated offline', () => {
  it('reports offline while the switch is on', () => {
    expect(isOffline()).toBe(false);
    setSimulatedOffline(true);
    expect(isOffline()).toBe(true);
    expect(isSimulatingOffline()).toBe(true);
  });

  it('fails API calls without ever reaching the network', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setSimulatedOffline(true);

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(SimulatedOfflineError);
    expect(fetchMock, 'a simulated cut must not send a real request').not.toHaveBeenCalled();
  });

  it('restores normal requests when switched back', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    setSimulatedOffline(true);
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(SimulatedOfflineError);

    setSimulatedOffline(false);
    await expect(api.get('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers and unsubscribes cleanly', () => {
    const seen: boolean[] = [];
    const stop = onConnectionChange((offline) => seen.push(offline));

    setSimulatedOffline(true);
    setSimulatedOffline(false);
    stop();
    setSimulatedOffline(true);

    expect(seen).toEqual([true, false]);
  });

  it('ignores a no-op toggle', () => {
    const seen: boolean[] = [];
    const stop = onConnectionChange((offline) => seen.push(offline));
    setSimulatedOffline(false); // already false
    stop();
    expect(seen).toEqual([]);
  });
});
