/* Tekla Studio service worker: cache-first app shell, offline fallback, versioned caches.
 * Bump VERSION on every release; the old cache is deleted on activate and open pages are told to reload via sw-register.js. */
const VERSION = '1.0.0';
const PREFIX = 'tekla-studio';
const CACHE = `${PREFIX}-v${VERSION}`;
const SCOPE = self.registration.scope;
const url = p => new URL(p, SCOPE).href;

const SHELL = [
  './', 'index.html', 'offline.html', '404.html', 'privacy.html',
  'style.css', 'app.js', 'sw-register.js',
  'js/editor.js', 'js/validator.js', 'js/templates.js', 'js/tag-converter.js', 'js/db.js',
  'manifest.webmanifest', 'browserconfig.xml',
  'icons/icon-192.png.svg', 'icons/icon-512.png.svg', 'icons/icon-maskable-192.png.svg',
  'icons/icon-maskable-512.png.svg', 'icons/apple-touch-icon.png.svg', 'icons/favicon.ico.svg'
].map(url);

self.addEventListener('install', event => {
  /* No automatic skipWaiting: a waiting worker lets the page offer a "Reload" button instead of swapping code mid-edit. */
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX + '-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.status === 404) {
      const page = await cache.match(url('404.html'));
      return page ? new Response(page.body, { status: 404, statusText: 'Not Found', headers: page.headers }) : res;
    }
    if (res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(url('offline.html'))) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request));
});
