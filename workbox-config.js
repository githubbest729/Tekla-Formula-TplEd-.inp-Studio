/* Optional Workbox build (CommonJS: do not set "type": "module" in package.json).
 * The repository ships a hand-written service-worker.js. This config generates a precache-manifest alternative
 * into dist/ without touching that file:  npx workbox-cli generateSW workbox-config.js
 * To use it, copy dist/workbox-service-worker.js over service-worker.js and keep sw-register.js unchanged. */
module.exports = {
  globDirectory: '.',
  globPatterns: [
    '*.html',
    'style.css',
    'app.js',
    'sw-register.js',
    'js/*.js',
    'icons/*.svg',
    'manifest.webmanifest',
    'browserconfig.xml'
  ],
  globIgnores: ['node_modules/**', 'dist/**', 'docs/**', '.github/**', '.well-known/**', 'workbox-config.js', 'service-worker.js'],
  swDest: 'dist/workbox-service-worker.js',
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [/^\/\.well-known\//],
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'CacheFirst',
      options: { cacheName: 'tekla-studio-images', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 } }
    }
  ]
};
