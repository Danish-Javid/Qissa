/**
 * App entry — router + service worker registration.
 *
 * Routes split the app into two worlds that never share chrome:
 *   /child/:id     the child loop (two taps per screen, giant targets)
 *   /parent/*      auth, setup, digest — calm, dense, adult
 * `/` redirects based on session presence (checked by ParentDashboard).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
// Andika: a free typeface designed for teaching children to read
// (single-storey a/g, distinct b/d/p/q). Self-hosted via @fontsource so
// the CSP stays 'self' and the PWA works fully offline.
import '@fontsource/andika/400.css';
import '@fontsource/andika/700.css';
import App from './App.js';
import './styles.css';

// Auto-update is right for this app: sessions are short and server-truth
// lives in the DB, so a fresh shell never risks losing a child's place.
registerSW({ immediate: true });

const root = document.getElementById('root');
if (root === null) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
