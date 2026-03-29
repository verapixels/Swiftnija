import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { MapPin, Home } from "lucide-react";

const MapView = () => {
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(
      collection(db, "orders"),
      where("riderId", "==", uid),
      where("status", "in", ["rider_assigned", "picked_up", "arriving"])
    );

    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveOrder({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveOrder(null);
      }
    });
  }, []);

  return (
    <div style={{
      margin: "16px 20px 0", borderRadius: "12px", border: "1px solid #e5e7eb",
      backgroundColor: "#1a1a2e", padding: "16px", position: "relative",
      overflow: "hidden", minHeight: "180px"
    }}>
      {/* Grid lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.1 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#6b7280" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {activeOrder ? (
        <>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} xmlns="http://www.w3.org/2000/svg">
            <line x1="30%" y1="35%" x2="70%" y2="65%" stroke="#6366f1" strokeWidth="3" strokeDasharray="8 4" />
            <circle cx="50%" cy="50%" r="4" fill="#6366f1" opacity="0.6" />
          </svg>
          {/* Pickup */}
          <div style={{ position: "absolute", left: "25%", top: "25%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: "flex", height: "32px", width: "32px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#22c55e" }}>
                <MapPin size={16} color="#ffffff" />
              </div>
              <div style={{ borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.9)", padding: "4px 8px" }}>
                <p style={{ fontSize: "12px", fontWeight: "600", margin: 0 }}>{activeOrder.vendorName || "Pickup"}</p>
                <p style={{ fontSize: "10px", color: "#9ca3af", margin: 0 }}>Pickup</p>
              </div>
            </div>
          </div>
          {/* Drop-off */}
          <div style={{ position: "absolute", right: "15%", bottom: "20%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: "flex", height: "32px", width: "32px", alignItems: "center", justifyContent: "center", borderRadius: "9999px", backgroundColor: "#ef4444" }}>
                <Home size={16} color="#ffffff" />
              </div>
              <div style={{ borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.9)", padding: "4px 8px" }}>
                <p style={{ fontSize: "12px", fontWeight: "600", margin: 0 }}>{activeOrder.customerName || "Customer"}</p>
                <p style={{ fontSize: "10px", color: "#9ca3af", margin: 0 }}>{activeOrder.deliveryAddress?.slice(0, 20) || "Drop-off"}</p>
              </div>
            </div>
          </div>
          {/* Rider dot */}
          <div style={{ position: "absolute", left: "38%", top: "42%" }}>
            <div style={{ height: "16px", width: "16px", borderRadius: "9999px", border: "2px solid #60a5fa", backgroundColor: "#3b82f6", boxShadow: "0 0 8px rgba(59,130,246,0.5)" }} />
          </div>
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#888", fontSize: 13, fontWeight: 600 }}>No active delivery</p>
        </div>
      )}
    </div>
  );
};

export default MapView;
