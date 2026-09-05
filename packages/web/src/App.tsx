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
import { Navigate, Route, Routes } from 'react-router-dom';
import { ChildHome } from './child/ChildHome.js';
import { Landing } from './Landing.js';
import { Archive } from './parent/Archive.js';
import { Dashboard } from './parent/Dashboard.js';
import { Digest } from './parent/Digest.js';
import { Login } from './parent/Login.js';
import { Pipeline } from './parent/Pipeline.js';
import { Setup } from './parent/Setup.js';
import { LocaleProvider } from './i18n/LocaleProvider.js';

export default function App() {
  // LocaleProvider issues the app-load GET /auth/me. That single call does two
  // jobs: it adopts the parent's stored language, and — because the api client
  // re-seeds the CSRF token from any response carrying one — it restores the
  // double-submit token that sessionStorage loses on a fresh tab. Without it a
  // reload is authenticated for reads but 403s on every write, which drops the
  // child straight to the "hand the device to a grown-up" screen.
  return (
    <LocaleProvider>
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
    </LocaleProvider>
  );
}
