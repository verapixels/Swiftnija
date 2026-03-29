import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const Header = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [riderName, setRiderName] = useState("Rider");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, "riders", uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setIsOnline(data.isOnline ?? false);
      setRiderName(data.name ?? "Rider");
    });
  }, []);

  const toggleOnline = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, "riders", uid), { isOnline: !isOnline });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px" }}>
      <button onClick={toggleOnline} style={{
        display: "flex", alignItems: "center", gap: "8px",
        borderRadius: "9999px", padding: "6px 16px",
        fontSize: "14px", fontWeight: "600", border: "none", cursor: "pointer",
        backgroundColor: isOnline ? "#f97316" : "#2a2a2a",
        color: isOnline ? "#ffffff" : "#888", transition: "all 0.2s"
      }}>
        Go {isOnline ? "Offline" : "Online"}
        <div style={{ width: "36px", height: "20px", borderRadius: "9999px", padding: "2px", backgroundColor: isOnline ? "rgba(255,255,255,0.3)" : "#444", transition: "all 0.2s" }}>
          <div style={{ height: "16px", width: "16px", borderRadius: "9999px", transition: "all 0.2s", transform: isOnline ? "translateX(16px)" : "translateX(0)", backgroundColor: isOnline ? "#ffffff" : "#888" }} />
        </div>
      </button>
      <p style={{ fontSize: "14px", fontWeight: "500", color: "#f2f2f2" }}>
        Hi, <span style={{ color: "#f97316" }}>{riderName}</span>
      </p>
    </div>
  );
};

export default Header;