const CACHE = 'habits-v1';

const FILES = [
  '/habit-tracker.html',
  '/habit-manifest.json',
  '/habit-icon-192.png',
  '/habit-icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Mono:wght@300;400;500&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(FILES.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => {
        if (event.request.destination === 'document') return caches.match('/habit-tracker.html');
      });
    })
  );
});

// ── DAILY REMINDER AT 7AM ─────────────────────────────
let reminderTimer = null;

function msUntil7am() {
  const now = new Date();
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNext() {
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    self.registration.showNotification('Habit Tracker', {
      body: '🌿 Time to check in on your habits for today!',
      icon: '/habit-icon-192.png',
      badge: '/habit-icon-192.png',
      tag: 'daily-habit-reminder',
      data: { url: self.registration.scope }
    });
    scheduleNext(); // schedule for next day
  }, msUntil7am());
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_HABIT_REMINDER') {
    scheduleNext();
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
