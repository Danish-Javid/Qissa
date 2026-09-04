/**
 * Route map.
 *
 * Two worlds, zero shared chrome:
 *  /child/:id   — the three-door home (First Words, Learn to Read, Story
 *                 Time). No navigation, no settings, no text the child must
 *                 parse to operate the app.
 *  /parent/*    — login, setup, dashboard, digest, archive, pipeline (the
 *                 judging / honesty view).
 */
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/client.js';
import { ChildHome } from './child/ChildHome.js';
import { Landing } from './Landing.js';
import { Archive } from './parent/Archive.js';
import { Dashboard } from './parent/Dashboard.js';
import { Digest } from './parent/Digest.js';
import { Login } from './parent/Login.js';
import { Pipeline } from './parent/Pipeline.js';
import { Setup } from './parent/Setup.js';

export default function App() {
  // Restore the CSRF double-submit token on every app load. The HttpOnly
  // session cookie outlives sessionStorage, so a reload in a fresh tab is
  // authenticated for reads but would 403 on every write — which drops the
  // child straight to the "hand the device to a grown-up" screen. GET /auth/me
  // re-seeds the token from the live session (the api client auto-adopts it).
  // Best effort: a logged-out visitor just gets a 401 and carries on.
  useEffect(() => {
    api.get('/auth/me').catch(() => undefined);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/child/:childId" element={<ChildHome />} />
      <Route path="/parent" element={<Dashboard />} />
      <Route path="/parent/login" element={<Login />} />
      <Route path="/parent/setup" element={<Setup />} />
      <Route path="/parent/digest/:childId" element={<Digest />} />
      <Route path="/parent/archive" element={<Archive />} />
      <Route path="/parent/pipeline" element={<Pipeline />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
