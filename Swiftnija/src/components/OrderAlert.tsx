import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Bike, MoreVertical } from "lucide-react";

const OrderAlert = () => {
  const [order, setOrder] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Listen for orders assigned to this rider with status "pending_acceptance"
    const q = query(
      collection(db, "orders"),
      where("riderId", "==", uid),
      where("status", "==", "rider_assigned")
    );

    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setOrder({ id: d.id, ...d.data() });
      } else {
        setOrder(null);
      }
    });
  }, []);

  const acceptOrder = async () => {
    if (!order) return;
    setAccepting(true);
    await updateDoc(doc(db, "orders", order.id), {
      status: "picked_up",
      riderAccepted: true,
      acceptedAt: serverTimestamp(),
    });
    setAccepting(false);
  };

  if (!order) return null;

  const distanceKm = order.distanceKm ?? "—";
  const category = order.items?.[0]?.category ?? order.category ?? "Order";
  const pay = order.riderPay ?? order.deliveryFee ?? 0;

  return (
    <div style={{ margin: "16px 20px 0", borderRadius: "12px", border: "1px solid #7a4a1e", backgroundColor: "#1c1c1c", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bike size={20} color="#f97316" />
          <span style={{ fontWeight: "bold", color: "#f2f2f2" }}>New Order Alert!</span>
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}>
          <MoreVertical size={20} />
        </button>
      </div>
      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", color: "#888" }}>
        <p style={{ margin: 0 }}>Category: {category}</p>
        <p style={{ margin: 0 }}>Distance: {distanceKm} km</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0 }}>Potential Pay:</p>
          <span style={{ fontSize: "20px", fontWeight: "bold", color: "#f97316" }}>₦{Number(pay).toLocaleString()}</span>
        </div>
      </div>
      <button
        onClick={acceptOrder}
        disabled={accepting}
        style={{
          marginTop: 14, width: "100%", padding: "12px 0",
          background: "linear-gradient(135deg,#f97316,#ff9a00)",
          color: "#fff", border: "none", borderRadius: 10,
          fontSize: 14, fontWeight: 800, cursor: accepting ? "not-allowed" : "pointer",
          opacity: accepting ? 0.6 : 1
        }}
      >
        {accepting ? "Accepting…" : "Accept Order"}
      </button>
    </div>
  );
};

export default OrderAlert;