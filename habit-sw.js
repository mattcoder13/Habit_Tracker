const CACHE = 'habits-v5';

const BASE = new URL('./', self.location).href;
const FILES = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'habit-manifest.json',
  BASE + 'habit-icon-192.png',
  BASE + 'habit-icon-512.png',
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
        if (event.request.destination === 'document') return caches.match(BASE + 'index.html');
      });
    })
  );
});

// ══════════════════════════════════════════════════════════
// REMINDERS
// ══════════════════════════════════════════════════════════

// Global 7am daily reminder
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
      icon: BASE + 'habit-icon-192.png',
      badge: BASE + 'habit-icon-192.png',
      tag: 'daily-habit-reminder',
      data: { url: self.registration.scope }
    });
    scheduleNext();
  }, msUntil7am());
}

// Per-habit reminders (Phase 3)
let habitTimers = {}; // { id: timeoutId }

function msUntil(hhmm) {
  const [hh, mm] = hhmm.split(':').map(n => parseInt(n, 10));
  if (isNaN(hh) || isNaN(mm)) return null;
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleHabitReminder(item) {
  const delay = msUntil(item.time);
  if (delay == null) return;
  habitTimers[item.id] = setTimeout(() => {
    self.registration.showNotification(item.name, {
      body: '⏰ Time for your habit',
      icon: BASE + 'habit-icon-192.png',
      badge: BASE + 'habit-icon-192.png',
      tag: 'habit-' + item.id,
      data: { url: self.registration.scope }
    });
    scheduleHabitReminder(item); // re-schedule for next day
  }, delay);
}

function setHabitReminders(items) {
  // Clear old
  Object.values(habitTimers).forEach(t => clearTimeout(t));
  habitTimers = {};
  // Schedule new
  (items || []).forEach(item => {
    if (item && item.time) scheduleHabitReminder(item);
  });
}

// Weekly recap — Sunday at 8pm
let weeklyTimer = null;
function msUntilSunday8pm() {
  const now = new Date();
  const next = new Date();
  // getDay(): 0=Sun. Want next Sunday 20:00 that's in the future.
  next.setHours(20, 0, 0, 0);
  const daysUntilSun = (7 - now.getDay()) % 7;
  next.setDate(now.getDate() + daysUntilSun);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next.getTime() - now.getTime();
}
function scheduleWeeklyRecap() {
  if (weeklyTimer) clearTimeout(weeklyTimer);
  weeklyTimer = setTimeout(() => {
    self.registration.showNotification('Habit Tracker · Weekly Recap', {
      body: '📊 Your week at a glance — tap to review.',
      icon: BASE + 'habit-icon-192.png',
      badge: BASE + 'habit-icon-192.png',
      tag: 'weekly-recap',
      data: { url: self.registration.scope }
    });
    scheduleWeeklyRecap();
  }, msUntilSunday8pm());
}

// Message router
self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'SCHEDULE_HABIT_REMINDER') scheduleNext();
  if (d.type === 'SET_HABIT_REMINDERS')     setHabitReminders(d.items);
  if (d.type === 'SCHEDULE_WEEKLY_RECAP')   scheduleWeeklyRecap();
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
