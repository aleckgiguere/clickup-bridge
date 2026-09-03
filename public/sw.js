// ClickBridge Service Worker for Windows PWA Desktop App
const CACHE_NAME = 'clickbridge-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Purge old caches to prevent stale bundle mismatch
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API routes & ClickUp proxy: ALWAYS go straight to network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigation (HTML pages): Network-first with friendly waking/offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;

          // Clean fallback page instead of browser crash if container is waking up
          return new Response(
            `<!DOCTYPE html>
            <html lang="fr">
              <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>ClickBridge - Démarrage</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 24px; box-sizing: border-box; }
                  .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 32px; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
                  h2 { margin: 0 0 12px; font-size: 20px; color: #e2e8f0; }
                  p { font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px; }
                  button { background: #9333ea; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
                  button:hover { background: #a855f7; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h2>Démarrage de ClickBridge...</h2>
                  <p>Le serveur sort de son mode veille ou rétablit la connexion. Si l'application ne s'ouvre pas immédiatement, cliquez ci-dessous.</p>
                  <button onclick="window.location.reload()">Recharger l'application</button>
                </div>
              </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 3. Static assets: Network first, fallback to cache, NEVER return undefined
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok && event.request.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Never return undefined in respondWith, return a 408 response
        return new Response('', { status: 408, statusText: 'Network Unavailable' });
      })
  );
});
