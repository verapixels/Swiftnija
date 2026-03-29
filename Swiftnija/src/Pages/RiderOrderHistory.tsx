import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { RiCheckLine, RiCloseLine, RiRefreshLine, RiArrowLeftLine, RiTimeLine, RiStoreLine, RiMoneyDollarCircleLine, RiCalendarLine, RiHashtag } from "react-icons/ri";

type HistoryEntry = {
  id: string;
  orderId: string;
  vendorName: string;
  total: number;
  status: string;
  action: "accepted" | "rejected" | "reassigned";
  createdAt: Timestamp | null;
};

const ACTION_CFG = {
  accepted:   { label: "Accepted",   color: "#10B981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", Icon: RiCheckLine },
  rejected:   { label: "Rejected",   color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",  Icon: RiCloseLine },
  reassigned: { label: "Reassigned", color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)", Icon: RiRefreshLine },
};

const fmtTs = (ts: Timestamp | null) =>
  ts ? ts.toDate().toLocaleDateString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "—";

const fmtDate = (ts: Timestamp | null) =>
  ts ? ts.toDate().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTime = (ts: Timestamp | null) =>
  ts ? ts.toDate().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function RiderOrderHistory() {
  const [orders,   setOrders]   = useState<HistoryEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "accepted" | "rejected" | "reassigned">("all");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "orders"),
      where("riderId", "==", uid),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, snap => {
      const results: HistoryEntry[] = [];
      snap.forEach(d => {
        const data = d.data();
        const rejectedBy: string[] = data.rejectedBy ?? [];
        const wasReassigned = rejectedBy.includes(uid) && data.riderId !== uid;
        const wasRejected   = rejectedBy.includes(uid) && !data.riderAccepted;
        const wasAccepted   = data.riderAccepted === true && data.riderId === uid;
        let action: "accepted" | "rejected" | "reassigned";
        if (wasReassigned) action = "reassigned";
        else if (wasRejected) action = "rejected";
        else if (wasAccepted) action = "accepted";
        else return;
        results.push({
          id: d.id,
          orderId: String(data.reference ?? d.id).slice(-8).toUpperCase(),
          vendorName: data.vendorName ?? "Vendor",
          total: Number(data.total ?? 0),
          status: data.status ?? "",
          action,
          createdAt: data.createdAt ?? null,
        });
      });
      setOrders(results);
      setLoading(false);
    });

    const q2 = query(
      collection(db, "orders"),
      where("rejectedBy", "array-contains", uid),
      orderBy("createdAt", "desc"),
    );

    const unsub2 = onSnapshot(q2, snap => {
      setOrders(prev => {
        const existing = new Set(prev.map(o => o.id));
        const newEntries: HistoryEntry[] = [];
        snap.forEach(d => {
          if (existing.has(d.id)) return;
          const data = d.data();
          newEntries.push({
            id: d.id,
            orderId: String(data.reference ?? d.id).slice(-8).toUpperCase(),
            vendorName: data.vendorName ?? "Vendor",
            total: Number(data.total ?? 0),
            status: data.status ?? "",
            action: data.riderId !== uid ? "reassigned" : "rejected",
            createdAt: data.createdAt ?? null,
          });
        });
        return [...prev, ...newEntries].sort((a, b) => {
          const ta = a.createdAt?.toMillis() ?? 0;
          const tb = b.createdAt?.toMillis() ?? 0;
          return tb - ta;
        });
      });
    });

    return () => { unsub(); unsub2(); };
  }, [uid]);

  const filtered = filter === "all" ? orders : orders.filter(o => o.action === filter);
  const counts = {
    all:        orders.length,
    accepted:   orders.filter(o => o.action === "accepted").length,
    rejected:   orders.filter(o => o.action === "rejected").length,
    reassigned: orders.filter(o => o.action === "reassigned").length,
  };

  const totalEarned = orders
    .filter(o => o.action === "accepted")
    .reduce((s, o) => s + o.total, 0);

  // ── Detail Sheet ──────────────────────────────────────────────────────────
  if (selected) {
    const cfg = ACTION_CFG[selected.action];
    const Icon = cfg.Icon;
    return (
      <div style={{ minHeight: "100%", fontFamily: "'DM Sans', sans-serif", background: "transparent" }}>
        <style>{STYLES}</style>

        {/* Back header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px", borderBottom: "1px solid #1a1a28",
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a28",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#888", flexShrink: 0,
            }}
          >
            <RiArrowLeftLine size={18} />
          </button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: "#eeeef8" }}>
            Order Details
          </span>
        </div>

        <div style={{ padding: "20px 20px 80px" }}>

          {/* Status hero */}
          <div style={{
            borderRadius: 20, padding: "28px 20px", textAlign: "center",
            background: cfg.bg, border: `1.5px solid ${cfg.border}`,
            marginBottom: 20, position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: -20, right: -20,
              width: 100, height: 100, borderRadius: "50%",
              background: cfg.color, opacity: 0.06,
            }} />
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: cfg.bg, border: `2px solid ${cfg.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px", color: cfg.color,
            }}>
              <Icon size={28} />
            </div>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: 22,
              fontWeight: 900, color: cfg.color, marginBottom: 6,
            }}>
              {cfg.label}
            </div>
            <div style={{ fontSize: 13, color: "#66668a", fontWeight: 600 }}>
              Order #{selected.orderId}
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>

            <DetailRow
              icon={<RiHashtag size={15} color="#FF6B00" />}
              label="Order ID"
              value={`#${selected.orderId}`}
              mono
            />
            <DetailRow
              icon={<RiStoreLine size={15} color="#FF6B00" />}
              label="Vendor"
              value={selected.vendorName}
            />
            <DetailRow
              icon={<RiCalendarLine size={15} color="#FF6B00" />}
              label="Date"
              value={fmtDate(selected.createdAt)}
            />
            <DetailRow
              icon={<RiTimeLine size={15} color="#FF6B00" />}
              label="Time"
              value={fmtTime(selected.createdAt)}
            />
            {selected.action === "accepted" && selected.total > 0 && (
              <DetailRow
                icon={<RiMoneyDollarCircleLine size={15} color="#10B981" />}
                label="Amount"
                value={`₦${selected.total.toLocaleString("en-NG")}`}
                highlight
              />
            )}
            <DetailRow
              icon={<div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(selected.status) }} />}
              label="Final Status"
              value={selected.status.replace(/_/g, " ")}
              statusColor={statusColor(selected.status)}
            />
          </div>

          {/* Action context */}
          <div style={{
            padding: "16px", borderRadius: 16,
            background: "rgba(255,255,255,0.03)", border: "1px solid #1a1a28",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#44445a", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>
              What happened
            </div>
            <div style={{ fontSize: 13, color: "#8888a0", lineHeight: 1.6, fontWeight: 500 }}>
              {selected.action === "accepted" && "You accepted this order and completed the delivery."}
              {selected.action === "rejected" && "You rejected this order. It was reassigned to another available rider."}
              {selected.action === "reassigned" && "This order was reassigned away from you, either because you rejected it or did not respond in time."}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ── Main List ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "transparent" }}>
      <style>{STYLES}</style>

      {/* Summary strip */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{
          borderRadius: 18, padding: "18px 20px",
          background: "linear-gradient(135deg, rgba(255,107,0,0.1), rgba(255,107,0,0.04))",
          border: "1px solid rgba(255,107,0,0.2)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 4 }}>
              Total Earned
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "#FF6B00", letterSpacing: "-0.5px" }}>
              ₦{totalEarned.toLocaleString("en-NG")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#44445a", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 4 }}>
              Total Orders
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "#eeeef8" }}>
              {counts.all}
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {(["accepted", "rejected", "reassigned"] as const).map(type => {
            const cfg = ACTION_CFG[type];
            const Icon = cfg.Icon;
            return (
              <div
                key={type}
                onClick={() => setFilter(filter === type ? "all" : type)}
                className="stat-pill"
                style={{
                  borderRadius: 14, padding: "12px 10px", textAlign: "center",
                  cursor: "pointer", transition: "all 0.2s",
                  background: filter === type ? cfg.bg : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${filter === type ? cfg.border : "#1a1a28"}`,
                }}
              >
                <div style={{ color: cfg.color, display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <Icon size={18} />
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: cfg.color }}>
                  {counts[type]}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, opacity: 0.7, textTransform: "uppercase", letterSpacing: ".4px", marginTop: 2 }}>
                  {cfg.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {(["all", "accepted", "rejected", "reassigned"] as const).map(f => {
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flexShrink: 0, padding: "7px 16px", borderRadius: 20,
                  border: `1.5px solid ${isActive ? "#FF6B00" : "#1a1a28"}`,
                  background: isActive ? "rgba(255,107,0,0.12)" : "transparent",
                  color: isActive ? "#FF6B00" : "#55556a",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  textTransform: "capitalize", transition: "all 0.15s",
                }}
              >
                {f === "all" ? `All · ${counts.all}` : `${f} · ${counts[f]}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px" }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 76, borderRadius: 16 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px 80px" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a28",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", color: "#33334a",
          }}>
            <RiTimeLine size={28} />
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: "#eeeef8", marginBottom: 6 }}>
            No {filter === "all" ? "" : filter} orders yet
          </div>
          <div style={{ fontSize: 13, color: "#44445a", fontWeight: 500 }}>
            Your delivery history will appear here
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 20px 80px" }}>
          {filtered.map((order, i) => {
            const cfg = ACTION_CFG[order.action];
            const Icon = cfg.Icon;
            return (
              <div
                key={order.id}
                onClick={() => setSelected(order)}
                className="order-row"
                style={{
                  borderRadius: 16, padding: "14px 16px",
                  background: "#0e0e18", border: "1.5px solid #1a1a28",
                  display: "flex", alignItems: "center", gap: 14,
                  cursor: "pointer", transition: "all 0.15s",
                  animation: "row-in 0.25s ease both",
                  animationDelay: `${i * 0.04}s`,
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                  background: cfg.bg, border: `1px solid ${cfg.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: cfg.color,
                }}>
                  <Icon size={20} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800, color: "#eeeef8" }}>
                      #{order.orderId}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "2px 7px",
                      borderRadius: 20, background: cfg.bg, color: cfg.color,
                      textTransform: "uppercase", letterSpacing: ".5px", border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#55556a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {order.vendorName}
                  </div>
                  <div style={{ fontSize: 11, color: "#33334a", fontWeight: 500, marginTop: 2 }}>
                    {fmtTs(order.createdAt)}
                  </div>
                </div>

                {/* Right */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {order.action === "accepted" && order.total > 0 ? (
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 900, color: "#10B981" }}>
                      ₦{order.total.toLocaleString("en-NG")}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#33334a", fontWeight: 600 }}>
                      —
                    </div>
                  )}
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: "#33334a",
                    textTransform: "uppercase", letterSpacing: ".4px", marginTop: 3,
                  }}>
                    Tap for details
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon, label, value, mono = false, highlight = false, statusColor: sc,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  statusColor?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "13px 16px", borderRadius: 14,
      background: highlight ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${highlight ? "rgba(16,185,129,0.15)" : "#1a1a28"}`,
    }}>
      <div style={{ flexShrink: 0, width: 20, display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#44445a", flex: 1 }}>{label}</div>
      <div style={{
        fontSize: highlight ? 16 : 13,
        fontWeight: highlight ? 900 : 700,
        color: sc ?? (highlight ? "#10B981" : "#eeeef8"),
        fontFamily: mono ? "'Syne', sans-serif" : "inherit",
        textTransform: sc ? "capitalize" : "none",
      }}>
        {value}
      </div>
    </div>
  );
}

function statusColor(status: string): string | undefined {
  if (!status) return undefined;
  if (status === "delivered") return "#10B981";
  if (status === "cancelled") return "#ef4444";
  if (status.includes("rider")) return "#FF6B00";
  return "#a78bfa";
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  @keyframes row-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer { from{background-position:-200% 0} to{background-position:200% 0} }
  .skeleton {
    background: linear-gradient(90deg, #0e0e18 25%, #161622 50%, #0e0e18 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .order-row:active { transform: scale(0.98); opacity: 0.85; }
  .stat-pill:active { transform: scale(0.97); }
`;