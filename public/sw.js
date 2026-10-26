/* Feedbook Admin — Service Worker (escopo /admin) */
const CACHE_VERSION = 'fb-admin-v1';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const SHELL_CACHE = CACHE_VERSION + '-shell';

const SHELL_URLS = ['/admin', '/index.html'];
let devMode = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}),
  );
  // Não ativar automaticamente; aguardar mensagem SKIP_WAITING
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'DEV_MODE') {
    devMode = true;
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('fb-admin-')).map((key) => caches.delete(key))),
    ).catch(() => {});
  } else if (event.data.type === 'LOGOUT') {
    // Limpar caches de runtime para não deixar dados acessíveis a outra sessão
    caches.delete(RUNTIME_CACHE).catch(() => {});
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'FeedBook Admin', body: event.data ? event.data.text() : '' };
  }
  const title = String(data.title || 'FeedBook Admin');
  const options = {
    body: String(data.body || ''),
    icon: '/feedbook-pwa-assets/favicon.png',
    badge: '/feedbook-pwa-assets/favicon.png',
    data: { url: data.url || '/admin' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

function isApiOrDataRequest(url) {
  return (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  );
}

function isStaticAsset(request, url) {
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  if (devMode) return;
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Pedidos de dados/admin: network-only (sem cache)
  if (isApiOrDataRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Navegação: network-first com fallback ao shell
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/admin') || caches.match('/index.html');
        }
      })(),
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate
  if (isStaticAsset(request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(request, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })(),
    );
    return;
  }

  // Default: network com fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request)),
  );
});