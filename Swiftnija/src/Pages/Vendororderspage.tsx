// Pages/VendorOrdersPage.tsx
import { useState, useEffect, useCallback } from "react";
import {
  FiShoppingBag, FiSearch, FiRefreshCw,
  FiClock, FiCheckCircle, FiXCircle, FiTruck,
  FiPackage, FiPhone, FiMapPin, FiChevronDown,
  FiChevronUp, FiAlertCircle, FiUser, FiCalendar,
  FiDollarSign, FiZap,
} from "react-icons/fi";
import { MdDeliveryDining } from "react-icons/md";
import { auth, db } from "../firebase";
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc,
  serverTimestamp, Timestamp, getDoc, deleteField,
} from "firebase/firestore";

type OrderStatus =
  | "pending" | "confirmed" | "finding_rider" | "rider_assigned"
  | "processing" | "ready" | "picked_up" | "arriving"
  | "delivered" | "cancelled" | "no_rider_found";

type OrderItem = {
  name: string; price: string; qty: number;
  img?: string; vendorName?: string; vendorId?: string;
};

type CustomerOrder = {
  id: string; reference: string;
  customerEmail: string; customerName?: string; customerPhone?: string;
  items: OrderItem[]; total: number; deliveryFee: number;
  deliveryAddress: string; deliveryLabel?: string;
  status: OrderStatus;
  riderAccepted?: boolean; riderName?: string; riderId?: string;
  createdAt: Timestamp | null; note?: string;
};

const STATUS_CFG: Record<string, {
  label: string; color: string; bg: string; border: string;
  icon: React.ReactNode; next?: OrderStatus; nextLabel?: string; vendorLocked?: boolean;
}> = {
  pending:        { label: "Pending",           color: "#f59e0b", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.25)", icon: <FiClock size={12} />,          next: "finding_rider", nextLabel: "Accept & Find Rider" },
  confirmed:      { label: "Confirmed",         color: "#f59e0b", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.25)", icon: <FiClock size={12} />,          next: "finding_rider", nextLabel: "Accept & Find Rider" },
  finding_rider:  { label: "Finding Rider",     color: "#FF6B00", bg: "rgba(255,107,0,.1)",  border: "rgba(255,107,0,.25)", icon: <FiZap size={12} />,            vendorLocked: true },
  rider_assigned: { label: "Rider Assigned",    color: "#8b5cf6", bg: "rgba(139,92,246,.1)", border: "rgba(139,92,246,.25)",icon: <MdDeliveryDining size={12} />, vendorLocked: true },
  processing:     { label: "Preparing",         color: "#3b82f6", bg: "rgba(59,130,246,.1)", border: "rgba(59,130,246,.25)",icon: <FiPackage size={12} />,        next: "ready", nextLabel: "Mark Ready for Pickup" },
  ready:          { label: "Ready for Pickup",  color: "#10b981", bg: "rgba(16,185,129,.1)", border: "rgba(16,185,129,.25)",icon: <FiCheckCircle size={12} />,    vendorLocked: true },
  picked_up:      { label: "Picked Up by Rider",color: "#FF6B00", bg: "rgba(255,107,0,.1)",  border: "rgba(255,107,0,.25)", icon: <FiTruck size={12} />,          vendorLocked: true },
  arriving:       { label: "Arriving",          color: "#FF6B00", bg: "rgba(255,107,0,.1)",  border: "rgba(255,107,0,.25)", icon: <FiTruck size={12} />,          vendorLocked: true },
  delivered:      { label: "Delivered",         color: "#10b981", bg: "rgba(16,185,129,.1)", border: "rgba(16,185,129,.25)",icon: <FiCheckCircle size={12} />,    vendorLocked: true },
  cancelled:      { label: "Cancelled",         color: "#ef4444", bg: "rgba(239,68,68,.1)",  border: "rgba(239,68,68,.25)", icon: <FiXCircle size={12} />,        vendorLocked: true },
  no_rider_found: { label: "No Rider Found",    color: "#ef4444", bg: "rgba(239,68,68,.1)",  border: "rgba(239,68,68,.25)", icon: <FiAlertCircle size={12} />,    next: "finding_rider", nextLabel: "Try Again" },
};

const getCfg        = (status: string) => STATUS_CFG[status] ?? STATUS_CFG["confirmed"];
const RIDER_STAGES: OrderStatus[] = ["picked_up", "arriving"];

const FILTER_TABS = [
  { id: "all",           label: "All" },
  { id: "pending",       label: "Pending" },
  { id: "finding_rider", label: "Finding Rider" },
  { id: "processing",    label: "Preparing" },
  { id: "ready",         label: "Ready" },
  { id: "delivered",     label: "Delivered" },
  { id: "cancelled",     label: "Cancelled" },
];

const fmtTs = (ts: Timestamp | null | undefined) =>
  ts ? ts.toDate().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtNaira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

function AcceptCheckbox({ checked, onChange, loading }: {
  checked: boolean; onChange: () => void; loading: boolean;
}) {
  return (
    <div className={`accept-cb ${checked ? "checked" : ""} ${loading ? "loading" : ""}`}
      onClick={!checked && !loading ? onChange : undefined}>
      <div className={`accept-cb-box ${checked ? "checked" : ""}`}>
        {loading
          ? <span className="accept-spinner">⟳</span>
          : checked
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            : null}
      </div>
      <div className="accept-cb-body">
        <span className="accept-cb-label">{checked ? "✓ Order Accepted — Finding Rider" : "Accept & Find Rider"}</span>
        <span className="accept-cb-sub">{checked ? "Matching with the nearest available rider…" : "Tap to accept this order and dispatch a rider"}</span>
      </div>
      {checked && <div className="accept-dots"><span /><span /><span /></div>}
    </div>
  );
}

function OrderCard({ order, onAdvance, onCancel }: {
  order: CustomerOrder;
  onAdvance: (id: string, status: OrderStatus) => void;
  onCancel: (id: string, riderId?: string) => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [updating, setUpdating] = useState(false);

  const cfg       = getCfg(order.status);
  const isPending = order.status === "pending" || order.status === "confirmed";
  const isFinding = order.status === "finding_rider";
  const isWaitingForRider  = order.status === "rider_assigned" && !order.riderAccepted;
  const canStartPreparing  = order.status === "rider_assigned" && order.riderAccepted === true;

  const subtotal = order.items.reduce((s, i) => {
    const p = parseFloat(String(i.price).replace(/[^0-9.]/g, "")) || 0;
    return s + p * i.qty;
  }, 0);

  const handleAccept = async () => { setUpdating(true); await onAdvance(order.id, "finding_rider"); setUpdating(false); };
  const advance = async (overrideStatus?: OrderStatus) => {
    const target = overrideStatus ?? cfg.next;
    if (!target) return;
    setUpdating(true);
    await onAdvance(order.id, target);
    setUpdating(false);
  };

  return (
    <div className="vd-order-card">
      <div className="vd-oc-header" style={{ cursor: "pointer" }} onClick={() => setOpen(v => !v)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
              #{order.reference.slice(-8).toUpperCase()}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              {cfg.icon} {cfg.label}
              {isFinding && <span className="vd-finding-dots"><span /><span /><span /></span>}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>
            <FiUser size={11} />{order.customerName || order.customerEmail}
            <span style={{ color: "var(--text3)" }}>·</span>
            <FiCalendar size={11} />{fmtTs(order.createdAt)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, color: "#FF6B00" }}>{fmtNaira(subtotal)}</span>
          {open ? <FiChevronUp size={16} color="var(--text3)" /> : <FiChevronDown size={16} color="var(--text3)" />}
        </div>
      </div>

      {isPending && (
        <div style={{ padding: "0 0 12px" }}>
          <AcceptCheckbox checked={false} onChange={handleAccept} loading={updating} />
        </div>
      )}

      {isFinding && (
        <div className="vd-finding-banner">
          <div className="vd-finding-radar">
            <div className="vd-fr1" /><div className="vd-fr2" /><div className="vd-fr3" />
            <div className="vd-fr-dot" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#FF6B00" }}>Finding rider<span className="vd-finding-dots"><span /><span /><span /></span></div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", marginTop: 2 }}>Dispatching to the nearest available rider</div>
          </div>
        </div>
      )}

      {isWaitingForRider && (
        <div style={{ padding: "11px 14px", borderRadius: 12, marginBottom: 4, background: "rgba(139,92,246,.06)", border: "1.5px solid rgba(139,92,246,.2)", fontSize: 12, fontWeight: 700, color: "#8b5cf6", display: "flex", alignItems: "center", gap: 8 }}>
          <MdDeliveryDining size={14} /> Rider assigned — waiting for them to accept the order…
        </div>
      )}

      {canStartPreparing && (
        <div style={{ padding: "0 0 12px", display: "flex", gap: 8 }}>
          <button className="vd-btn-primary" style={{ flex: 1, justifyContent: "center", opacity: updating ? .6 : 1 }}
            disabled={updating} onClick={() => advance("processing")}>
            {updating ? <><span style={{ display: "inline-block", animation: "vdo-spin .7s linear infinite" }}>⟳</span> Updating…</> : <><FiPackage size={14} /> Start Preparing</>}
          </button>
        </div>
      )}

      {order.status === "no_rider_found" && (
        <div style={{ padding: "0 0 12px" }}>
          <button className="vd-btn-primary" style={{ width: "100%", justifyContent: "center", opacity: updating ? .6 : 1 }}
            disabled={updating} onClick={() => advance("finding_rider")}>
            {updating ? <><span style={{ display: "inline-block", animation: "vdo-spin .7s linear infinite" }}>⟳</span> Retrying…</> : <><FiZap size={14} /> No rider found — Try Again</>}
          </button>
        </div>
      )}

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 14, animation: "vdo-expand .2s ease" }}>
          {/* Items */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <FiPackage size={11} /> Items ({order.items.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {order.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg)", borderRadius: 10, padding: "8px 10px", border: "1px solid var(--border)" }}>
                  {item.img
                    ? <img src={item.img} alt={item.name} style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--inp)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FiPackage size={14} color="var(--text3)" /></div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>Qty: {item.qty}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#FF6B00", flexShrink: 0 }}>{item.price}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>
              <span>Units ordered</span>
              <span style={{ color: "var(--text)" }}>{order.items.reduce((s, i) => s + i.qty, 0)}</span>
            </div>
            <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800 }}>
              <span style={{ color: "var(--text)" }}>Your Earnings</span>
              <span style={{ color: "#FF6B00", fontFamily: "'Syne',sans-serif" }}>{fmtNaira(subtotal)}</span>
            </div>
          </div>

          {/* Delivery address */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)" }}>
            <FiMapPin size={14} color="#FF6B00" style={{ marginTop: 1, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>
                Deliver to {order.deliveryLabel ? `· ${order.deliveryLabel}` : ""}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{order.deliveryAddress}</div>
            </div>
          </div>

          {/* Customer info */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: 10, padding: "8px 12px", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>
              <FiUser size={12} color="#FF6B00" /> {order.customerEmail}
            </div>
            {order.customerPhone && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg)", borderRadius: 10, padding: "8px 12px", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>
                <FiPhone size={12} color="#FF6B00" /> {order.customerPhone}
              </div>
            )}
          </div>

          {order.note && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(245,158,11,.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(245,158,11,.2)" }}>
              <FiAlertCircle size={13} color="#f59e0b" style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b" }}><strong>Note:</strong> {order.note}</div>
            </div>
          )}

          {order.status === "processing" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="vd-btn-primary" style={{ flex: 1, justifyContent: "center", opacity: updating ? .6 : 1 }}
                disabled={updating} onClick={() => advance()}>
                {updating ? <><span style={{ display: "inline-block", animation: "vdo-spin .7s linear infinite" }}>⟳</span> Updating…</> : <><FiCheckCircle size={14} /> Mark Ready for Pickup</>}
              </button>
              <button className="vd-btn-danger" disabled={updating} onClick={() => onCancel(order.id, order.riderId)}>
                <FiXCircle size={14} /> Cancel
              </button>
            </div>
          )}

          {isPending && (
            <button className="vd-btn-danger" style={{ alignSelf: "flex-start" }} disabled={updating}
              onClick={() => onCancel(order.id, order.riderId)}>
              <FiXCircle size={14} /> Cancel Order
            </button>
          )}

          {order.status === "ready" && (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,.06)", border: "1.5px solid rgba(16,185,129,.2)", fontSize: 12, fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
              <FiCheckCircle size={14} /> Order ready — waiting for rider to pick up 🏍️
            </div>
          )}

          {RIDER_STAGES.includes(order.status) && (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,107,0,.06)", border: "1.5px solid rgba(255,107,0,.2)", fontSize: 12, fontWeight: 700, color: "#FF6B00", display: "flex", alignItems: "center", gap: 8 }}>
              <FiTruck size={14} /> Rider is on the way — updates are automatic
            </div>
          )}

          {order.status === "delivered" && (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,.06)", border: "1.5px solid rgba(16,185,129,.2)", fontSize: 12, fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
              <FiCheckCircle size={14} /> Order completed successfully 🎉
            </div>
          )}

          {order.status === "cancelled" && (
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(239,68,68,.06)", border: "1.5px solid rgba(239,68,68,.2)", fontSize: 12, fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
              <FiXCircle size={14} /> This order was cancelled
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatsBar({ orders }: { orders: CustomerOrder[] }) {
  const active = orders.filter(o => ["finding_rider","rider_assigned","processing","ready","picked_up","arriving"].includes(o.status)).length;
  const earnings = orders.filter(o => o.status === "delivered").reduce((s, o) => s + o.items.reduce((is, i) => { const p = parseFloat(String(i.price).replace(/[^0-9.]/g, "")) || 0; return is + p * i.qty; }, 0), 0);
  const pendingCount = orders.filter(o => o.status === "pending" || o.status === "confirmed").length;
  const stats = [
    { label: "Total",     value: orders.length,                                       icon: <FiShoppingBag size={17} />, color: "#FF6B00" },
    { label: "Pending",   value: pendingCount,                                         icon: <FiClock size={17} />,       color: "#f59e0b" },
    { label: "Active",    value: active,                                               icon: <FiPackage size={17} />,     color: "#3b82f6" },
    { label: "Delivered", value: orders.filter(o => o.status === "delivered").length, icon: <FiCheckCircle size={17} />, color: "#10b981" },
    { label: "Earnings",  value: fmtNaira(earnings),                                  icon: <FiDollarSign size={17} />,  color: "#FF6B00" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
      {stats.map((s, i) => (
        <div key={i} className="vd-stat-card" style={{ padding: "14px 16px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 8 }}>{s.icon}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{s.value}</div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function VendorOrdersPage() {
  const [orders,   setOrders]   = useState<CustomerOrder[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");
  const [search,   setSearch]   = useState("");
  const [spinning, setSpinning] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const uid = auth.currentUser?.uid;

  const subscribe = useCallback(() => {
  if (!uid) return;
  setLoading(true);
  setError(null);

  const q = query(
    collection(db, "orders"),
    where("vendorId", "==", uid),   // ✅ filter by vendor
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(q, snap => {
    const result: CustomerOrder[] = [];
    snap.forEach(d => {
      const raw   = d.data() as Record<string, unknown>;
      const items = (raw.items ?? raw.cartItems ?? []) as OrderItem[];
      const meta  = (raw.metadata as Record<string, unknown>) ?? {};

      const vendorItems  = items.filter(i => i.vendorId === uid);
      const rawStatusStr = String(raw.status ?? "confirmed");
      const rawStatus    = (STATUS_CFG[rawStatusStr] ? rawStatusStr : "confirmed") as OrderStatus;

      result.push({
        id:              d.id,
        reference:       String(raw.reference ?? raw.ref ?? d.id),
        customerEmail:   String(raw.customerEmail ?? raw.email ?? ""),
        customerName:    raw.customerName as string | undefined,
        customerPhone:   raw.customerPhone as string | undefined,
        items:           vendorItems.length > 0 ? vendorItems : items,
        total:           Number(raw.total ?? raw.amount ?? 0),
        deliveryFee:     Number(raw.deliveryFee ?? 0),
        deliveryAddress: String((meta.delivery_address as string) ?? raw.deliveryAddress ?? raw.address ?? "Not specified"),
        deliveryLabel:   String(meta.delivery_label ?? raw.deliveryLabel ?? ""),
        status:          rawStatus,
        riderAccepted:   raw.riderAccepted as boolean | undefined,
        riderName:       raw.riderName as string | undefined,
        riderId:         raw.riderId as string | undefined,
        createdAt:       (raw.createdAt as Timestamp) ?? null,
        note:            raw.note as string | undefined,
      });
    });
    setOrders(result);
    setLoading(false);
  }, err => {
    setError("Could not load orders. Check your connection.");
    setLoading(false);
  });

  return unsub;
  
}, [uid]);

  useEffect(() => {
    const unsub = subscribe();
    return () => { if (unsub) unsub(); };
  }, [subscribe]);

  const handleAdvance = async (id: string, status: OrderStatus) => {
    try {
      const extra: Record<string, unknown> = { status, updatedAt: serverTimestamp(  ) };

      if (status === "finding_rider") {
        extra.riderAccepted  = false;
        // ── Generate rider pickup code ──────────────────────────────────────
        extra.riderPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        // ── Write vendor coords to order ────────────────────────────────────
        if (uid) {
          try {
            const vSnap = await getDoc(doc(db, "vendors", uid));
            if (vSnap.exists()) {
              const v     = vSnap.data();
              const vName = v.businessName || v.storeName || v.name || "";
              if (vName) extra.vendorName = vName;
              if (v.lat && v.lng) { extra.vendorLat = v.lat; extra.vendorLng = v.lng; }
            }
          } catch { /* non-critical */ }
        }
      }

      await updateDoc(doc(db, "orders", id), extra);
    } catch {
      alert("Failed to update order. Please try again.");
    }
  };

  const handleCancel = async (id: string, riderId?: string) => {
    if (!confirm("Cancel this order?")) return;
    try {
      if (riderId) await updateDoc(doc(db, "riders", riderId), { currentOrderId: deleteField() });
      await updateDoc(doc(db, "orders", id), { status: "cancelled", updatedAt: serverTimestamp() });
    } catch (err) {
      console.error("[handleCancel]", err);
      alert("Failed to cancel order. Please try again.");
    }
  };

  const handleRefresh = async () => {
    setSpinning(true);
    await new Promise(r => setTimeout(r, 600));
    setSpinning(false);
  };

  const filtered = orders.filter(o => {
    const effectiveStatus = o.status === "confirmed" ? "pending" : o.status;
    const matchStatus     = filter === "all" || effectiveStatus === filter;
    const q               = search.toLowerCase();
    const matchSearch     = !q || o.reference.toLowerCase().includes(q) || o.customerEmail.toLowerCase().includes(q) || (o.customerName ?? "").toLowerCase().includes(q) || o.items.some(i => i.name.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const pendingCount = orders.filter(o => o.status === "pending" || o.status === "confirmed").length;

  return (
    <>
      <style>{`
        @keyframes vdo-expand  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes vdo-spin    { to{transform:rotate(360deg)} }
        @keyframes vdo-in      { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dot-bounce  { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
        @keyframes radar-pulse { 0%{opacity:.9;transform:scale(.5)} 100%{opacity:0;transform:scale(1)} }
        @keyframes cb-pop      { 0%{transform:scale(1)} 40%{transform:scale(1.06)} 100%{transform:scale(1)} }
        .accept-cb{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;cursor:pointer;border:2px solid rgba(255,107,0,0.2);background:rgba(255,107,0,0.04);transition:all .2s}
        .accept-cb:not(.checked):hover{border-color:#FF6B00;background:rgba(255,107,0,0.08)}
        .accept-cb.checked{border-color:rgba(255,107,0,0.35);background:rgba(255,107,0,0.06);cursor:default}
        .accept-cb.loading{opacity:.7;cursor:not-allowed}
        .accept-cb-box{width:28px;height:28px;border-radius:8px;flex-shrink:0;border:2.5px solid rgba(255,107,0,0.4);display:flex;align-items:center;justify-content:center;background:transparent;transition:all .25s}
        .accept-cb-box.checked{background:#FF6B00;border-color:#FF6B00;animation:cb-pop .3s ease both;box-shadow:0 2px 10px rgba(255,107,0,0.4)}
        .accept-spinner{display:inline-block;animation:vdo-spin .7s linear infinite;color:#FF6B00;font-size:14px}
        .accept-cb-body{flex:1}
        .accept-cb-label{display:block;font-size:13px;font-weight:800;color:var(--text)}
        .accept-cb-sub{display:block;font-size:11px;font-weight:600;color:var(--text3);margin-top:2px}
        .accept-dots{display:flex;gap:3px;align-items:center}
        .accept-dots span{width:5px;height:5px;border-radius:50%;background:#FF6B00;animation:dot-bounce .9s ease-in-out infinite}
        .accept-dots span:nth-child(2){animation-delay:.18s} .accept-dots span:nth-child(3){animation-delay:.36s}
        .vd-finding-banner{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:12px;margin-bottom:4px;background:rgba(255,107,0,0.06);border:1.5px solid rgba(255,107,0,0.2);animation:vdo-in .3s ease both}
        .vd-finding-radar{position:relative;width:36px;height:36px;flex-shrink:0}
        .vd-fr1,.vd-fr2,.vd-fr3{position:absolute;border-radius:50%;border:2px solid rgba(255,107,0,0.4);animation:radar-pulse 2.4s ease-out infinite}
        .vd-fr1{width:12px;height:12px;top:12px;left:12px;animation-delay:0s}
        .vd-fr2{width:22px;height:22px;top:7px;left:7px;animation-delay:.6s}
        .vd-fr3{width:32px;height:32px;top:2px;left:2px;animation-delay:1.2s}
        .vd-fr-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:#FF6B00;top:14.5px;left:14.5px}
        .vd-finding-dots{display:inline-flex;gap:2px;align-items:center;margin-left:3px;vertical-align:middle}
        .vd-finding-dots span{width:4px;height:4px;border-radius:50%;background:currentColor;animation:dot-bounce .9s ease-in-out infinite}
        .vd-finding-dots span:nth-child(2){animation-delay:.18s} .vd-finding-dots span:nth-child(3){animation-delay:.36s}
      `}</style>

      <div className="vd-page vd-fade-up">
        <div className="vd-page-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,107,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF6B00" }}><FiShoppingBag size={18} /></div>
              <h1 className="vd-page-title">Customer Orders</h1>
              {pendingCount > 0 && <span style={{ background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20 }}>{pendingCount} new</span>}
            </div>
            <p className="vd-page-sub">Live orders · matched by your vendor account</p>
          </div>
          <button className="vd-btn-outline" onClick={handleRefresh} style={{ flexShrink: 0 }}>
            <FiRefreshCw size={14} style={{ animation: spinning ? "vdo-spin .7s linear infinite" : "none" }} /> Refresh
          </button>
        </div>

        {error && <div className="vd-alert error" style={{ marginBottom: 16 }}><FiAlertCircle size={14} /> {error}</div>}
        {!uid  && <div className="vd-alert warning" style={{ marginBottom: 16 }}><FiAlertCircle size={14} /> Not logged in — please sign out and sign back in.</div>}

        {!loading && <StatsBar orders={orders} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <div className="vd-search-row">
            <div className="vd-search-wrap">
              <FiSearch size={14} color="var(--text3)" />
              <input className="vd-search-input" placeholder="Search by ref, customer or product…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 0 }}>✕</button>}
            </div>
          </div>
          <div className="vd-filter-tabs" style={{ flexWrap: "wrap" }}>
            {FILTER_TABS.map(tab => {
              const count = tab.id === "all" ? orders.length : orders.filter(o => { const eff = o.status === "confirmed" ? "pending" : o.status; return eff === tab.id; }).length;
              return (
                <button key={tab.id} className={`vd-filter-tab${filter === tab.id ? " active" : ""}`} onClick={() => setFilter(tab.id)}>
                  {tab.label}
                  {count > 0 && <span style={{ marginLeft: 5, background: filter === tab.id ? "rgba(255,107,0,.2)" : "var(--border)", color: filter === tab.id ? "#FF6B00" : "var(--text3)", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 20 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map(i => <div key={i} className="vd-order-card" style={{ height: 72 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="vd-empty-big">
            <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(255,107,0,.08)", border: "2px dashed rgba(255,107,0,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><FiShoppingBag size={30} color="#FF6B00" /></div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{search || filter !== "all" ? "No matching orders" : "No orders yet"}</div>
            <div style={{ fontSize: 13, color: "var(--text3)", maxWidth: 300, textAlign: "center", lineHeight: 1.7 }}>
              {search || filter !== "all" ? "Try adjusting your search or filter." : "When customers place orders for your products, they'll appear here in real-time."}
            </div>
            {(search || filter !== "all") && <button className="vd-btn-outline" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="vd-orders-list">
            {filtered.map((order, i) => (
              <div key={order.id} style={{ animation: "vdo-in .25s ease both", animationDelay: `${i * .03}s` }}>
                <OrderCard order={order} onAdvance={handleAdvance} onCancel={handleCancel} />
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </>
  );
}