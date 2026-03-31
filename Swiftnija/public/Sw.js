// public/sw.js — Swift9ja Vendor Push Notification Service Worker

const CACHE_NAME = "swift9ja-vendor-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Swift9ja", body: event.data.text() };
  }

  const options = {
    body: payload.body || "You have a new notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || "swift9ja-notif",
    requireInteraction: payload.requireInteraction || false,
    data: payload.data || {},
    actions: payload.actions || [
      { action: "view", title: "View Dashboard" },
      { action: "dismiss", title: "Dismiss" },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Swift9ja", options)
  );
});

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

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-orders") {
    console.log("[SW] Background sync: orders");
  }
});