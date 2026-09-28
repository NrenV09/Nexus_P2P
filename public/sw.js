// Quantum Link PWA Service Worker for Offline Saving & Operation
const CACHE_NAME = 'quantum-link-v1';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache partial warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Don't intercept non-GET requests or WebSocket connections
  if (request.method !== 'GET' || request.url.startsWith('ws://') || request.url.startsWith('wss://')) {
    return;
  }

  // Network-first with cache fallback for HTML, Cache-first for static assets
  const url = new URL(request.url);
  const isHtml = request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html');

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallback = await caches.match('/index.html') || await caches.match('/');
          if (fallback) return fallback;
          return new Response('Offline: Quantum Link is operating offline.', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
  } else {
    // Cache first, then network fallback
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Return nothing or cached asset if available
          return caches.match(request);
        });
      })
    );
  }
});
