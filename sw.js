// Bump this on every deploy that changes any shell file. Changing this string
// changes the byte content of this script, which is what makes browsers
// notice a new service worker exists and actually install it.
const CACHE = 'overhead-v5';
const SHELL = [
  './', './index.html', './styles.css', './intro.css', './visibility.js', './app.js',
  './compass.js', './ar.js', './ui.js', './intro.js', './manifest.json', './icon.svg',
  './icon-192.png', './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting(); // take over immediately instead of waiting for all tabs to close
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim(); // control already-open tabs right away, not just future ones
});

// Network-first for our own app files: always try to fetch the latest version
// first, and only fall back to the cached copy if the network fails (offline).
// This is the opposite of "cache-first" — it trades a few extra bytes on each
// load for guaranteeing pushed updates actually show up, which matters far
// more for a fast-moving app than shaving milliseconds off a repeat load.
self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isShell = SHELL.some(s => url.endsWith(s.replace('./', '')));
  if(!isShell) return; // weather / TLE / font / CDN requests: untouched, straight to network

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
