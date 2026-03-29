// pages/PickupCodePage.tsx
// Vendor inputs RIDER's pickup code → sees rider details → status auto-changes to picked_up

import { useState } from "react";
import {
  FiSearch, FiCheck, FiX, FiPhone, FiPackage,
  FiAlertCircle, FiMail, FiMapPin,
} from "react-icons/fi";
import { MdDeliveryDining } from "react-icons/md";
import {
  collection, query, where, getDocs,
  doc, updateDoc, serverTimestamp, getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";

type RiderDetail = {
  name: string;
  phone: string;
  email: string;
  photoURL?: string;
  vehicleType?: string;
  vehiclePlate?: string;
};

type MatchedOrder = {
  id: string;
  riderPickupCode: string;
  riderId?: string;
  riderName?: string;
  items: Array<{ name: string; qty: number; img?: string }>;
  vendorName?: string;
  status: string;
  customerName?: string;
};

export default function PickupCodePage() {
  const [code,       setCode]       = useState("");
  const [loading,    setLoading]    = useState(false);
  const [order,      setOrder]      = useState<MatchedOrder | null>(null);
  const [rider,      setRider]      = useState<RiderDetail | null>(null);
  const [error,      setError]      = useState("");
  const [confirmed,  setConfirmed]  = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleSearch = async () => {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed || !auth.currentUser) return;
  setLoading(true);
  setError("");
  setOrder(null);
  setRider(null);
  setConfirmed(false);

  const uid = auth.currentUser.uid;

  try {
    // Try with vendorId filter first (works with security rules)
    const q = query(
      collection(db, "orders"),
      where("riderPickupCode", "==", trimmed),
      where("vendorId", "==", uid),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      setError("No order found with this rider code. Ask the rider to check their code.");
      return;
    }

    const d    = snap.docs[0].data();
    const ordId = snap.docs[0].id;

    if (d.status === "delivered" || d.status === "cancelled") {
      setError(`This order is already ${d.status}.`);
      return;
    }

    if (d.status === "picked_up" || d.status === "arriving") {
      setError("Rider has already picked up this order.");
      return;
    }

    setOrder({
      id:              ordId,
      riderPickupCode: d.riderPickupCode,
      riderId:         d.riderId,
      riderName:       d.riderName,
      items:           d.items ?? [],
      vendorName:      d.vendorName,
      status:          d.status,
      customerName:    d.customerName,
    });

    if (d.riderId) {
      try {
        const rSnap = await getDoc(doc(db, "riders", d.riderId));
        if (rSnap.exists()) {
          const r = rSnap.data();
          setRider({
            name:         `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || d.riderName || "Rider",
            phone:        r.phone ?? "",
            email:        r.email ?? "",
            photoURL:     r.selfieUrl ?? r.photoURL ?? "",
            vehicleType:  r.vehicleType ?? "",
            vehiclePlate: r.vehiclePlate ?? "",
          });
        }
      } catch { /* non-critical */ }
    }
  } catch (err: any) {
    setError("Search failed: " + err.message);
  } finally {
    setLoading(false);
  }
};

  const handleConfirmPickup = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        status:    "picked_up",
        updatedAt: serverTimestamp(),
      });
      setConfirmed(true);
    } catch (err: any) {
      setError("Failed to confirm pickup: " + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="vd-page vd-fade-up">
      <div className="vd-page-header">
        <div>
          <h1 className="vd-page-title">Pickup Verification</h1>
          <p className="vd-page-sub">Enter the rider's 6-character pickup code to verify collection</p>
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "rgba(139,92,246,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#8B5CF6",
        }}>
          <MdDeliveryDining size={26} />
        </div>
      </div>

      {/* Code input card */}
      <div className="vd-card" style={{ padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "rgba(139,92,246,0.1)",
            border: "2px solid rgba(139,92,246,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", color: "#8B5CF6", fontSize: 28,
          }}>
            🔑
          </div>
          <h3 style={{
            fontFamily: "'Syne', sans-serif", fontSize: 18,
            fontWeight: 900, color: "var(--text)", marginBottom: 8,
          }}>
            Enter Rider's Pickup Code
          </h3>
          <p style={{ color: "var(--text3)", fontSize: 13, lineHeight: 1.6 }}>
            Ask the rider for their 6-character pickup code.<br />
            This verifies they are the correct rider for this order.
          </p>
        </div>

        <div style={{ maxWidth: 320, margin: "0 auto" }}>
          <input
            className="vd-field"
            placeholder="ABC123"
            value={code}
            onChange={e => {
              setCode(e.target.value.toUpperCase().slice(0, 8));
              setError("");
              setOrder(null);
              setRider(null);
              setConfirmed(false);
            }}
            onKeyDown={handleKeyDown}
            style={{
              fontSize: 28, letterSpacing: 8, textAlign: "center",
              fontFamily: "'Syne', sans-serif", fontWeight: 900,
            }}
          />
          <button
            className="vd-btn-primary"
            onClick={handleSearch}
            disabled={loading || !code.trim()}
            style={{
              width: "100%", justifyContent: "center",
              marginTop: 14, padding: "14px",
              opacity: loading || !code.trim() ? 0.6 : 1,
            }}
          >
            {loading ? (
              <><span style={{ display: "inline-block", animation: "vdo-spin .7s linear infinite" }}>⟳</span> Searching…</>
            ) : (
              <><FiSearch size={16} /> Verify Code</>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="vd-alert error">
          <FiAlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {order && !error && (
        <div className="vd-pickup-result vd-fade-up">

          {/* Code confirmed banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "13px 16px", borderRadius: 14, marginBottom: 18,
            background: "rgba(16,185,129,0.07)",
            border: "1.5px solid rgba(16,185,129,0.25)",
          }}>
            <FiCheck size={18} color="#10B981" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#10B981" }}>
                ✓ Code Verified
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                Order #{order.id.slice(-8).toUpperCase()} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{
              background: "rgba(139,92,246,0.1)",
              border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 10, padding: "7px 14px",
              color: "#8B5CF6", fontFamily: "'Syne', sans-serif",
              fontWeight: 900, fontSize: 16, letterSpacing: 4,
            }}>
              {order.riderPickupCode}
            </div>
          </div>

          {/* Rider profile card */}
          {rider ? (
            <div style={{
              background: "var(--card)", border: "1.5px solid var(--border)",
              borderRadius: 18, padding: 20, marginBottom: 16,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: "var(--text3)",
                textTransform: "uppercase", letterSpacing: ".6px",
                marginBottom: 14, display: "flex", alignItems: "center", gap: 6,
              }}>
                <MdDeliveryDining size={12} color="#FF6B00" /> Assigned Rider
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                {/* Photo */}
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(255,107,0,0.1)",
                  border: "2.5px solid rgba(255,107,0,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", fontSize: 24,
                }}>
                  {rider.photoURL
                    ? <img src={rider.photoURL} alt={rider.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : "🏍️"
                  }
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontSize: 18,
                    fontWeight: 900, color: "var(--text)",
                  }}>
                    {rider.name}
                  </div>
                  {rider.vehicleType && (
                    <div style={{
                      fontSize: 12, color: "#FF6B00", fontWeight: 700,
                      marginTop: 3, textTransform: "capitalize",
                    }}>
                      {rider.vehicleType} {rider.vehiclePlate ? `· ${rider.vehiclePlate}` : ""}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact details */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rider.phone && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 14px", background: "var(--bg)",
                    borderRadius: 12, border: "1px solid var(--border)",
                  }}>
                    <FiPhone size={14} color="#10B981" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, marginBottom: 2 }}>
                        PHONE
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        +234 {rider.phone}
                      </div>
                    </div>
                    <a
                      href={`tel:+234${rider.phone}`}
                      style={{
                        padding: "7px 14px", borderRadius: 10,
                        background: "rgba(16,185,129,0.1)",
                        border: "1px solid rgba(16,185,129,0.25)",
                        color: "#10B981", fontWeight: 800, fontSize: 12,
                        textDecoration: "none",
                      }}
                    >
                      Call
                    </a>
                  </div>
                )}

                {rider.email && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 14px", background: "var(--bg)",
                    borderRadius: 12, border: "1px solid var(--border)",
                  }}>
                    <FiMail size={14} color="#3b82f6" />
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, marginBottom: 2 }}>
                        EMAIL
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {rider.email}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              padding: "14px 16px", borderRadius: 14, marginBottom: 16,
              background: "rgba(245,158,11,0.07)",
              border: "1px solid rgba(245,158,11,0.2)",
              fontSize: 13, fontWeight: 700, color: "#f59e0b",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <FiAlertCircle size={14} />
              Rider profile not found — verify identity manually before handing over.
            </div>
          )}

          {/* Items being picked up */}
          <div style={{
            background: "var(--card)", border: "1.5px solid var(--border)",
            borderRadius: 18, overflow: "hidden", marginBottom: 16,
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
              fontSize: 10, fontWeight: 800, color: "var(--text3)",
              textTransform: "uppercase", letterSpacing: ".6px",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <FiPackage size={11} color="#FF6B00" />
              Items for Pickup ({order.items.reduce((s, i) => s + i.qty, 0)})
            </div>
            {order.items.slice(0, 5).map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 16px",
                borderBottom: i < order.items.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "rgba(255,107,0,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                }}>
                  {item.img
                    ? <img src={item.img} alt={item.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <FiPackage size={14} color="#FF6B00" />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>
                    Qty: {item.qty}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Customer info */}
          {order.customerName && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 14px", background: "var(--card)",
              border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16,
              fontSize: 13, fontWeight: 600, color: "var(--text2)",
            }}>
              <FiMapPin size={13} color="#FF6B00" />
              Delivering to: <strong style={{ color: "var(--text)" }}>{order.customerName}</strong>
            </div>
          )}

          {/* Action buttons */}
          {!confirmed ? (
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="vd-btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => { setOrder(null); setRider(null); setCode(""); }}
              >
                <FiX size={16} /> Wrong Rider
              </button>
              <button
                className="vd-btn-primary"
                style={{
                  flex: 2, justifyContent: "center",
                  background: "linear-gradient(135deg,#10B981,#059669)",
                  opacity: confirming ? 0.6 : 1,
                }}
                disabled={confirming}
                onClick={handleConfirmPickup}
              >
                {confirming ? (
                  <><span style={{ display: "inline-block", animation: "vdo-spin .7s linear infinite" }}>⟳</span> Confirming…</>
                ) : (
                  <><FiCheck size={16} /> Confirm Pickup — Hand Over</>
                )}
              </button>
            </div>
          ) : (
            <div style={{
              textAlign: "center", padding: "24px 20px",
              background: "rgba(16,185,129,0.06)",
              border: "1.5px solid rgba(16,185,129,0.2)",
              borderRadius: 16,
            }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontSize: 18,
                fontWeight: 900, color: "#10B981", marginBottom: 6,
              }}>
                Order Handed Over!
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>
                Status updated to <strong style={{ color: "#FF6B00" }}>Picked Up</strong>.
                The rider is now on their way to the customer.
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      {!order && !error && (
        <div className="vd-card" style={{ marginTop: 0 }}>
          <div className="vd-card-title" style={{ marginBottom: 16 }}>How Pickup Verification Works</div>
          {[
            { step: "1", text: "Customer places an order — a unique delivery code is sent to them" },
            { step: "2", text: "When you accept the order, the rider is assigned and gets their own 6-character pickup code" },
            { step: "3", text: "When the rider arrives at your store, ask them for their pickup code and enter it above" },
            { step: "4", text: "Verify the rider's details match, then confirm pickup — the order status updates automatically" },
            { step: "5", text: "At delivery, the rider asks the customer for their code — if it matches, order is marked delivered" },
          ].map((s, i) => (
            <div key={i} style={{
              display: "flex", gap: 14, marginBottom: 14, alignItems: "flex-start",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#FF6B00", fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>
                {s.step}
              </div>
              <div style={{
                color: "var(--text2)", fontSize: 13,
                lineHeight: 1.5, paddingTop: 6,
              }}>
                {s.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes vdo-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}