// Offline cache: everything is fetched once, then served from cache. Bump VERSION when files change.
const VERSION = 'fwf-v4';
const FILES = [
  './', './index.html', './style.css', './app.js', './peer.js', './sdp.js', './qr.js', './room.js',
  './game.js', './quiz-ui.js', './bot.js', './bank.js', './themes.js', './reactions.js', './shapes.js',
  './vendor/jsQR.js', './vendor/qrcode.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  './questions/animaux.js', './questions/art.js', './questions/celebrites.js', './questions/cinema.js',
  './questions/cuisine.js', './questions/dinosaures.js', './questions/drapeaux.js', './questions/f1.js',
  './questions/fleurs.js', './questions/formes.js', './questions/geographie.js', './questions/harry-potter.js',
  './questions/histoire.js', './questions/internet-fr.js', './questions/jeux-video.js',
  './questions/legumes.js', './questions/litterature.js', './questions/lol.js', './questions/monde-1444.js',
  './questions/musique-2010.js', './questions/musique-70-90.js', './questions/musique-90-2010.js',
  './questions/rois-de-france.js', './questions/seigneur-des-anneaux.js', './questions/warcraft.js',
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
