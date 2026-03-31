import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export function useMaintenanceBanner(dashboardKey: "customer" | "vendor" | "rider" | "admin") {
  const [banner, setBanner] = useState<{ active: boolean; message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return; // ← wait until logged in
      unsub = onSnapshot(doc(db, "platformSettings", "global"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const isOn = data.maintenanceMode === true;
        const targets: string[] = data.maintenanceTargets ?? ["all"];
        const isTargeted = targets.includes("all") || targets.includes(dashboardKey);

        setBanner({
          active: isOn && isTargeted,
          message: data.maintenanceMessage || "We're currently under maintenance. Please check back shortly. 🔧",
        });

        if (!isOn) setDismissed(false);
      });
    });

    return () => {
      unsubAuth();
      unsub?.();
    };
  }, [dashboardKey]);

  const dismiss = () => setDismissed(true);

  return { banner, dismissed, dismiss };
}