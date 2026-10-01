const CACHE_NAME = 'manege-v4';
// Ne pas pré-cacher les pages HTML (sinon login / bundles obsolètes sur iOS PWA).
const STATIC_ASSETS = ['/logo.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais mettre en cache Auth / API / navigations HTML / JS Next.
  if (
    url.hostname.includes('supabase.co') ||
    event.request.method !== 'GET' ||
    event.request.mode === 'navigate' ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api')
  ) {
    return;
  }

  // Network-first pour le reste (icônes, etc.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = { body: event.data ? event.data.text() : '' };
      }
      const title = data.title || 'Manège';
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/logo.png',
        badge: '/logo.png',
        data: { url: data.url || '/messages' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/messages';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await clients.openWindow(url);
    })(),
  );
});
