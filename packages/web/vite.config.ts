/**
 * Vite config — the PWA build.
 *
 * Decisions:
 *  - @qissa/core is aliased to its TypeScript SOURCE so the browser bundle
 *    and the server always run the exact same pedagogy code, and dev never
 *    waits on a separate core build.
 *  - Dev proxies /api to the Fastify server; production is same-origin
 *    (the server serves this bundle), so the client never hardcodes a host.
 *  - vite-plugin-pwa generates the manifest + service worker (NFR-5.2).
 *    The Vite env allowlist stays EMPTY by design: nothing secret can ever
 *    reach this bundle (plan §Security 1).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Qissa — reading companion',
        short_name: 'Qissa',
        description: 'One story a day. Phonics that never tricks the child.',
        theme_color: '#264653',
        background_color: '#fdf6e3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the app shell; the SW never caches API responses, so a
        // stale story or session can never outlive its server-side truth.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  resolve: {
    alias: {
      '@qissa/core': path.resolve(__dirname, '../core/src/index.ts')
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    // Chunk warnings are noise for an app this size; keep the build loud
    // only for real errors.
    chunkSizeWarningLimit: 900
  }
});
