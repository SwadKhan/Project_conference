//---------------------------------------------------------------------
// Service worker: makes the app run with no network at all.
//
// Every asset is precached on install, and every request is served
// cache-first. After the first load the network is never needed - and
// never reached, because nothing here points off this machine.
//
// The cache is named after the build tag in version.js - bump that one
// constant and the old cache is retired on the next activate.
//---------------------------------------------------------------------

importScripts('./version.js');

const CACHE = 'portauth-' + self.APP_BUILD;

const ASSETS = [
    './',
    './index.html',
    './version.js',
    './css/style.css',
    './js/app.js',
    './js/qrcode.js',
    './js/qrcode_UTF8.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // { cache: 'reload' } is load-bearing: a plain addAll() reads
            // through the browser's HTTP cache and can bake a stale asset
            // into a fresh cache version.
            .then((cache) => cache.addAll(
                ASSETS.map((url) => new Request(url, { cache: 'reload' }))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((name) => name !== CACHE).map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

// The page asks which build this cache holds; a mismatch means the client
// is stale, and the page says so rather than half-working in silence.
self.addEventListener('message', (event) => {
    if (event.data === 'build?' && event.source) {
        event.source.postMessage({ build: self.APP_BUILD });
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only same-origin GETs are ours to serve.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((hit) => {
            if (hit) return hit;

            return fetch(request)
                .then((response) => {
                    // Keep anything new that turns up while a network exists.
                    if (response && response.ok && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(CACHE).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline and uncached: hand navigations the app shell.
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('', { status: 504, statusText: 'Offline' });
                });
        })
    );
});
