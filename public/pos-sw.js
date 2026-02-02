/**
 * pos-sw.js
 * 
 * Service Worker for ECHO POS PWA
 * 
 * Features:
 * - Enables PWA install eligibility on Android
 * - Caches essential assets for offline use
 * - Network-first strategy for API calls (prices from DB)
 * - Cache-first strategy for static assets
 * - Offline fallback for the POS UI
 */

const CACHE_NAME = 'echo-pos-v3';
const OFFLINE_URL = '/admin/pos';

// Assets to cache for offline use
// Note: React build outputs hashed filenames, so we cache dynamically
const PRECACHE_ASSETS = [
  '/pos-manifest.json',
  '/assets/icons/pos-icon-192.svg',
  '/assets/icons/pos-icon-512.svg',
  '/assets/icons/LOGO_favicon.svg'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[POS SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[POS SW] Caching essential assets');
        // Don't fail install if some assets fail to cache
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[POS SW] Failed to cache ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[POS SW] Service worker installed, activating...');
        // Force activation
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[POS SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`[POS SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[POS SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip ALL cross-origin requests - let browser handle them directly
  // This avoids CSP issues with Google Fonts and other external resources
  if (url.origin !== location.origin) {
    return;
  }
  
  // API calls - Network first, no cache (prices must come from DB)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Return a generic offline response for API calls
          return new Response(
            JSON.stringify({ error: 'offline', message: 'You are offline' }),
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Navigation requests (HTML) - Network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version or offline page
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Fallback to cached POS page
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // Static assets - Cache first with network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version, but also update cache in background
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }
        
        // Not in cache - fetch from network
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
