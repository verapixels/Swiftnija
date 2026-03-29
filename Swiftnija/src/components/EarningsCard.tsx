import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const EarningsCard = () => {
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [deliveryCount, setDeliveryCount] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Start of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, "orders"),
      where("riderId", "==", uid),
      where("status", "==", "delivered"),
      where("createdAt", ">=", Timestamp.fromDate(startOfDay))
    );

    return onSnapshot(q, (snap) => {
      let total = 0;
      snap.forEach((doc) => {
        total += doc.data().riderPay ?? doc.data().deliveryFee ?? 0;
      });
      setTodayEarnings(total);
      setDeliveryCount(snap.size);
    });
  }, []);

  return (
    <div style={{
      margin: "16px 20px 0", borderRadius: "12px", border: "1px solid #7a4a1e",
      backgroundColor: "#1c1c1c", padding: "20px"
    }}>
      <p style={{ fontSize: "14px", fontWeight: "500", color: "#888", margin: 0 }}>Today's Earnings</p>
      <p style={{ fontSize: "36px", fontWeight: "bold", color: "#f97316", margin: "4px 0" }}>
        ₦{todayEarnings.toLocaleString()}
      </p>
      <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>{deliveryCount} Deliveries</p>
    </div>
  );
};

export default EarningsCard;