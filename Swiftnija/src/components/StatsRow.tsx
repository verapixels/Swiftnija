import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { BarChart3, Star } from "lucide-react";

const StatsRow = () => {
  const [acceptanceRate, setAcceptanceRate] = useState(0);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, "riders", uid), (snap) => {
      if (!snap.exists()) return;
      const stats = snap.data().stats ?? {};
      setAcceptanceRate(stats.acceptanceRate ?? 0);
      setRating(stats.rating ?? 0);
    });
  }, []);

  return (
    <div style={{ margin: "16px 20px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "12px", border: "1px solid #7a4a1e", backgroundColor: "#1c1c1c", padding: "16px" }}>
        <BarChart3 size={28} color="#f97316" />
        <div>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#f2f2f2", margin: 0 }}>{acceptanceRate}%</p>
          <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>Acceptance Rate</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderRadius: "12px", border: "1px solid #7a4a1e", backgroundColor: "#1c1c1c", padding: "16px" }}>
        <Star size={28} color="#f97316" />
        <div>
          <p style={{ fontSize: "24px", fontWeight: "bold", color: "#f2f2f2", margin: 0 }}>{rating.toFixed(1)}</p>
          <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>Rating</p>
        </div>
      </div>
    </div>
  );
};

export default StatsRow;