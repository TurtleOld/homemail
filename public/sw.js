const CACHE_NAME = 'mail-client-v1';
const urlsToCache = [
  '/',
  '/mail',
  '/settings',
  '/icons/mail-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/mail/realtime') || 
      url.pathname.startsWith('/api/') ||
      event.request.method !== 'GET') {
    return fetch(event.request);
  }

  // Never cache login-related routes (avoid stale auth redirects/login pages).
  if (url.pathname.startsWith('/login') || url.pathname.startsWith('/api/auth/')) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
      .catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Новое письмо';
  const options = {
    body: data.body || 'У вас новое письмо',
    icon: '/icons/mail-icon.png',
    badge: '/icons/mail-icon.png',
    tag: data.tag || 'mail',
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/mail')
  );
});
