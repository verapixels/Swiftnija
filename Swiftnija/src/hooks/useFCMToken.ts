
import { useEffect } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { messaging, db } from "../firebase"; // adjust path if needed
import { auth } from "../firebase";
 
export function useFCMToken() {
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const uid = user.uid;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("[FCM] Notification permission denied");
        return;
      }

      try {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;
        if (!vapidKey) {
          console.error("[FCM] VITE_FIREBASE_VAPID_KEY is not set");
          return;
        }

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
          { scope: "/" }
        );
        await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });

        if (!token) {
          console.warn("[FCM] No token returned");
          return;
        }

        await updateDoc(doc(db, "riders", uid), { fcmToken: token });
        console.info("[FCM] ✅ Token saved for rider", uid);
      } catch (err) {
        console.error("[FCM] Token error:", err);
      }
    });

    const unsubscribeMsg = onMessage(messaging, (payload) => {
      window.dispatchEvent(new CustomEvent("fcm-new-order", {
        detail: {
          orderId:     payload.data?.orderId,
          vendorName:  payload.data?.vendorName,
          totalAmount: payload.data?.totalAmount,
          title:       payload.notification?.title,
          body:        payload.notification?.body,
        },
      }));
    });

    return () => {
      unsubscribeAuth();
      unsubscribeMsg();
    };
  }, []);
}
 