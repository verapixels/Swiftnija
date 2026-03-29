// public/sw.js — SwiftNija Vendor Push Notification Service Worker
// Place this file in your /public folder so it's served at /sw.js

const CACHE_NAME = "swiftnija-vendor-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Handle push events (for future FCM/web push integration)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "SwiftNija", body: event.data.text() };
  }

  const options = {
    body: payload.body || "You have a new notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || "swiftnija-notif",
    requireInteraction: payload.requireInteraction || false,
    data: payload.data || {},
    actions: payload.actions || [
      { action: "view", title: "View Dashboard" },
      { action: "dismiss", title: "Dismiss" },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "SwiftNija", options)
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  let url = "/vendor";
  if (action === "view" || !action) {
    if (data.type === "order") {
      url = "/vendor?tab=orders";
    }
  }

  if (action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/vendor") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline order updates (future use)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-orders") {
    console.log("[SW] Background sync: orders");
  }
});