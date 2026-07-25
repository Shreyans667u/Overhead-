const CACHE = 'overhead-v2';
const SHELL = [
  './', './index.html', './styles.css', './visibility.js', './app.js',
  './compass.js', './ar.js', './ui.js', './manifest.json', './icon.svg'
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

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const isShell = SHELL.some(s => url.endsWith(s.replace('./', '')));
  if(isShell){
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
  // weather / TLE / font / CDN requests go straight to network
});
