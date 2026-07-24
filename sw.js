const CACHE = 'overhead-v2';
const SHELL = [
  './', './index.html', './styles.css', './manifest.json', './icon.svg',
  './js/state.js', './js/visibility.js', './js/compass.js', './js/guidance.js',
  './js/ar.js', './js/ui.js', './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for API/TLE/camera calls, cache-first for the app shell.
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isShell = SHELL.some(s => url.endsWith(s.replace('./', '')));
  if(isShell){
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
  // weather, TLE, and font/CDN requests go straight to network — not intercepted
});
