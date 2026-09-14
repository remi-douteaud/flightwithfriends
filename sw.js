// Offline cache: everything is fetched once, then served from cache. Bump VERSION when files change.
const VERSION = 'fwf-v2';
const FILES = [
  './', './index.html', './style.css', './app.js', './peer.js', './sdp.js', './qr.js', './room.js',
  './quiz.js', './questions.js', './vendor/jsQR.js', './vendor/qrcode.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
