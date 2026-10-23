import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset paths so the same build works at a domain root or under /Wanderwild/ on GitHub Pages.
  base: './',
  build: {
    // MapLibre alone is ~1 MB minified; it is precached by the service worker after the first visit.
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Wanderwild',
        short_name: 'Wanderwild',
        description: 'Walk the real world as a fantasy realm.',
        theme_color: '#3b2a1a',
        background_color: '#e8d9b5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,pbf}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Branch previews live under /preview/ on the same site; let them load their own pages.
        navigateFallbackDenylist: [/\/preview\//],
        runtimeCaching: [
          {
            // Map tiles, glyphs and TileJSON from OpenFreeMap: serve cached copies so
            // recently walked areas still render with a weak signal.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
