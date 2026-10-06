/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// The app shell is cached for offline use. Game data is NOT bundled: it is
// downloaded at runtime from community sources and cached in IndexedDB.
// BASE is the path the app is served from: "/" locally, "/EmperorsList/" on GitHub Pages.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'EmperorsList',
        short_name: 'EmperorsList',
        description: 'Unofficial army builder and game companion.',
        theme_color: '#100B0B',
        background_color: '#100B0B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
