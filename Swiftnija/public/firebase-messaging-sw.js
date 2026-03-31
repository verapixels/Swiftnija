importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

firebase.initializeApp({
  apiKey: "AIzaSyDYNYEchX_JuxkwvPi6HD_TdijN_adsQ74",
  authDomain: "swiftnija-c0e04.firebaseapp.com",
  projectId: "swiftnija-c0e04",
  storageBucket: "swiftnija-c0e04.firebasestorage.app",
  messagingSenderId: "607481849237",
  appId: "1:607481849237:web:88b2b88774158dceed429c",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title   = payload.data?.title   ?? "🏍️ New Order!";
  const body    = payload.data?.body    ?? "You have a new delivery request.";
  const orderId = payload.data?.orderId ?? "";
  const type    = payload.data?.type    ?? "new_order";

  // Tell all open Swift9ja tabs to play their looping alert sound
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      client.postMessage({ type: "PLAY_NOTIFICATION_SOUND" });
    }
  });

  self.registration.showNotification(title, {
    body,
    icon:               "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png",
    badge:              "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png",
    tag:                `order-${orderId}`,
    requireInteraction: true,
    silent:             false,
    vibrate:            [400, 100, 400, 100, 400, 100, 400],
    data:               { orderId, type },
    actions: [
      { action: "accept", title: "✅ Accept" },
      { action: "reject", title: "❌ Reject" },
    ],
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const orderId = event.notification.data?.orderId;
  const urlToOpen = `${self.location.origin}/rider`;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/rider")) {
            client.focus();
            if (orderId) {
              client.postMessage({ type: "new-order", orderId });
            }
            return;
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});

self.addEventListener("notificationclose", () => {});