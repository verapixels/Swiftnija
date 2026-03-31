import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import {
  collection, query, where, orderBy, onSnapshot, Timestamp,
} from "firebase/firestore";
import {
  RiCheckLine, RiCloseLine, RiRefreshLine, RiArrowLeftLine,
  RiTimeLine, RiStoreLine, RiMoneyDollarCircleLine, RiCalendarLine,
  RiHashtag, RiMotorbikeLine, RiArrowRightSLine,
  RiFileListLine, RiPieChartLine,
} from "react-icons/ri";
import { useTheme } from "../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string;
  orderId: string;
  vendorName: string;
  total: number;
  status: string;
  action: "accepted" | "rejected" | "reassigned";
  createdAt: Timestamp | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_CFG = {
  accepted: {
    label: "Accepted",
    color: "var(--clr-accepted)",
    bg: "var(--clr-accepted-bg)",
    border: "var(--clr-accepted-border)",
    Icon: RiCheckLine,
  },
  rejected: {
    label: "Rejected",
    color: "var(--clr-rejected)",
    bg: "var(--clr-rejected-bg)",
    border: "var(--clr-rejected-border)",
    Icon: RiCloseLine,
  },
  reassigned: {
    label: "Reassigned",
    color: "var(--clr-reassigned)",
    bg: "var(--clr-reassigned-bg)",
    border: "var(--clr-reassigned-border)",
    Icon: RiRefreshLine,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTs = (ts: Timestamp | null) =>
  ts
    ? ts.toDate().toLocaleDateString("en-NG", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

const fmtDate = (ts: Timestamp | null) =>
  ts
    ? ts.toDate().toLocaleDateString("en-NG", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

const fmtTime = (ts: Timestamp | null) =>
  ts
    ? ts.toDate().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
    : "—";

function statusColor(status: string): string {
  if (!status) return "var(--clr-text-muted)";
  if (status === "delivered") return "var(--clr-accepted)";
  if (status === "cancelled") return "var(--clr-rejected)";
  if (status.includes("rider")) return "var(--clr-brand)";
  return "var(--clr-reassigned)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, mono = false, highlight = false, sc,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  sc?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "13px 16px",
        borderRadius: 14,
        background: highlight ? "var(--clr-accepted-bg)" : "var(--clr-surface-raised)",
        border: `1px solid ${highlight ? "var(--clr-accepted-border)" : "var(--clr-border)"}`,
        transition: "background 0.2s",
      }}
    >
      <div style={{ flexShrink: 0, width: 22, display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--clr-text-muted)", flex: 1 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 17 : 13,
          fontWeight: highlight ? 900 : 700,
          color: sc ?? (highlight ? "var(--clr-accepted)" : "var(--clr-text)"),
          fontFamily: mono ? "'Syne', sans-serif" : "inherit",
          textTransform: sc ? "capitalize" : "none",
          letterSpacing: highlight ? "-0.3px" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="roh-skeleton"
      style={{ height: 80, borderRadius: 18 }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RiderOrderHistory() {
  const { theme } = useTheme();

  const [orders,   setOrders]   = useState<HistoryEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "accepted" | "rejected" | "reassigned">("all");
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  const uid = auth.currentUser?.uid;

  /* ── Firebase listeners ── */
  useEffect(() => {
    if (!uid) return;

    const q1 = query(
      collection(db, "orders"),
      where("riderId", "==", uid),
      orderBy("createdAt", "desc"),
    );

    const unsub1 = onSnapshot(q1, snap => {
      const results: HistoryEntry[] = [];
      snap.forEach(d => {
        const data = d.data();
        const rejectedBy: string[] = data.rejectedBy ?? [];
        const wasReassigned = rejectedBy.includes(uid) && data.riderId !== uid;
        const wasRejected   = rejectedBy.includes(uid) && !data.riderAccepted;
        const wasAccepted   = data.riderAccepted === true && data.riderId === uid;
        let action: "accepted" | "rejected" | "reassigned";
        if (wasReassigned)    action = "reassigned";
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
        return [...prev, ...newEntries].sort(
          (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
      });
    });

    return () => { unsub1(); unsub2(); };
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

  /* ───────────────────── DETAIL VIEW ────────────────────── */
  if (selected) {
    const cfg = ACTION_CFG[selected.action];
    const Icon = cfg.Icon;
    return (
      <div className={`roh-root theme-${theme}`}>
        <style>{CSS_VARS + BASE_STYLES}</style>

        {/* Header */}
        <div className="roh-header">
          <button className="roh-back-btn" onClick={() => setSelected(null)}>
            <RiArrowLeftLine size={19} />
          </button>
          <span className="roh-header-title">Order Details</span>
          <div style={{ width: 40 }} />
        </div>

        <div className="roh-detail-body">

          {/* Hero badge */}
          <div
            className="roh-detail-hero"
            style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
          >
            <div className="roh-hero-circle roh-hero-circle-1" style={{ background: cfg.color }} />
            <div className="roh-hero-circle roh-hero-circle-2" style={{ background: cfg.color }} />

            <div
              className="roh-hero-icon"
              style={{ background: cfg.bg, border: `2px solid ${cfg.border}`, color: cfg.color }}
            >
              <Icon size={30} />
            </div>
            <div className="roh-hero-label" style={{ color: cfg.color }}>{cfg.label}</div>
            <div className="roh-hero-id">Order #{selected.orderId}</div>
          </div>

          {/* Rows */}
          <div className="roh-detail-section-label">
            <RiFileListLine size={13} />
            Order Summary
          </div>
          <div className="roh-detail-rows">
            <DetailRow
              icon={<RiHashtag size={15} color="var(--clr-brand)" />}
              label="Order ID"
              value={`#${selected.orderId}`}
              mono
            />
            <DetailRow
              icon={<RiStoreLine size={15} color="var(--clr-brand)" />}
              label="Vendor"
              value={selected.vendorName}
            />
            <DetailRow
              icon={<RiCalendarLine size={15} color="var(--clr-brand)" />}
              label="Date"
              value={fmtDate(selected.createdAt)}
            />
            <DetailRow
              icon={<RiTimeLine size={15} color="var(--clr-brand)" />}
              label="Time"
              value={fmtTime(selected.createdAt)}
            />
            {selected.action === "accepted" && selected.total > 0 && (
              <DetailRow
                icon={<RiMoneyDollarCircleLine size={15} color="var(--clr-accepted)" />}
                label="Amount"
                value={`₦${selected.total.toLocaleString("en-NG")}`}
                highlight
              />
            )}
            <DetailRow
              icon={
                <div style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: statusColor(selected.status),
                  boxShadow: `0 0 6px ${statusColor(selected.status)}`,
                }} />
              }
              label="Final Status"
              value={selected.status.replace(/_/g, " ") || "—"}
              sc={statusColor(selected.status)}
            />
          </div>

          {/* Context note */}
          <div className="roh-context-card">
            <div className="roh-context-label">What happened</div>
            <div className="roh-context-body">
              {selected.action === "accepted" &&
                "You accepted this order and successfully completed the delivery."}
              {selected.action === "rejected" &&
                "You rejected this order. It was reassigned to another available rider."}
              {selected.action === "reassigned" &&
                "This order was reassigned away from you — either you rejected it or did not respond in time."}
            </div>
          </div>

        </div>
      </div>
    );
  }

  /* ───────────────────── LIST VIEW ──────────────────────── */
  return (
    <div className={`roh-root theme-${theme}`}>
      <style>{CSS_VARS + BASE_STYLES}</style>

      {/* Page header */}
      <div className="roh-page-header">
        <div className="roh-page-icon">
          <RiMotorbikeLine size={22} />
        </div>
        <div>
          <div className="roh-page-title">Order History</div>
          <div className="roh-page-sub">Your delivery activity</div>
        </div>
        <div className="roh-page-count-badge">{counts.all}</div>
      </div>

      {/* Earnings strip */}
      <div className="roh-earnings-strip">
        <div className="roh-earnings-left">
          <div className="roh-earnings-eyebrow">
            <RiPieChartLine size={11} /> Total Earned
          </div>
          <div className="roh-earnings-amount">
            ₦{totalEarned.toLocaleString("en-NG")}
          </div>
        </div>
        <div className="roh-earnings-divider" />
        <div className="roh-earnings-right">
          <div className="roh-earnings-eyebrow" style={{ textAlign: "right" }}>Deliveries</div>
          <div className="roh-earnings-count">{counts.accepted}</div>
          <div className="roh-earnings-eyebrow" style={{ textAlign: "right", marginTop: 6 }}>Total</div>
          <div className="roh-earnings-total-num">{counts.all}</div>
        </div>
        <div className="roh-strip-shimmer" />
      </div>

      {/* Stat cards */}
      <div className="roh-stat-grid">
        {(["accepted", "rejected", "reassigned"] as const).map(type => {
          const cfg = ACTION_CFG[type];
          const Icon = cfg.Icon;
          const isActive = filter === type;
          return (
            <button
              key={type}
              className={`roh-stat-card${isActive ? " roh-stat-active" : ""}`}
              onClick={() => setFilter(isActive ? "all" : type)}
              style={isActive ? { background: cfg.bg, borderColor: cfg.border } : {}}
            >
              <div className="roh-stat-icon" style={{ color: cfg.color }}>
                <Icon size={20} />
              </div>
              <div className="roh-stat-num" style={{ color: cfg.color }}>{counts[type]}</div>
              <div className="roh-stat-label" style={{ color: cfg.color }}>{cfg.label}</div>
              {isActive && (
                <div className="roh-stat-active-dot" style={{ background: cfg.color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="roh-filter-row">
        {(["all", "accepted", "rejected", "reassigned"] as const).map(f => {
          const isActive = filter === f;
          return (
            <button
              key={f}
              className={`roh-chip${isActive ? " roh-chip-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="roh-chip-count">{counts[f === "all" ? "all" : f]}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="roh-list">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : filtered.length === 0 ? (
          <div className="roh-empty">
            <div className="roh-empty-icon"><RiTimeLine size={30} /></div>
            <div className="roh-empty-title">
              No {filter === "all" ? "" : filter} orders yet
            </div>
            <div className="roh-empty-sub">Your delivery history will appear here</div>
          </div>
        ) : (
          filtered.map((order, i) => {
            const cfg = ACTION_CFG[order.action];
            const Icon = cfg.Icon;
            return (
              <div
                key={order.id}
                className="roh-order-row"
                onClick={() => setSelected(order)}
                style={{ animationDelay: `${i * 0.045}s` }}
              >
                <div
                  className="roh-row-icon"
                  style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color }}
                >
                  <Icon size={21} />
                </div>

                <div className="roh-row-info">
                  <div className="roh-row-top">
                    <span className="roh-row-id">#{order.orderId}</span>
                    <span
                      className="roh-row-badge"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <div className="roh-row-vendor">{order.vendorName}</div>
                  <div className="roh-row-time">{fmtTs(order.createdAt)}</div>
                </div>

                <div className="roh-row-right">
                  {order.action === "accepted" && order.total > 0 ? (
                    <div className="roh-row-amount">
                      ₦{order.total.toLocaleString("en-NG")}
                    </div>
                  ) : (
                    <div className="roh-row-amount-empty">—</div>
                  )}
                  <RiArrowRightSLine size={16} style={{ color: "var(--clr-text-dim)" }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS_VARS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  /* ── Dark theme ── */
  .theme-dark {
    --clr-bg:                #09090f;
    --clr-surface:           #0f0f1a;
    --clr-surface-raised:    rgba(255,255,255,0.04);
    --clr-border:            #1c1c2e;
    --clr-border-strong:     #252535;

    --clr-text:              #eeeef8;
    --clr-text-sub:          #8888aa;
    --clr-text-muted:        #55556e;
    --clr-text-dim:          #33334a;

    --clr-brand:             #FF6B00;
    --clr-brand-bg:          rgba(255,107,0,0.10);
    --clr-brand-border:      rgba(255,107,0,0.25);

    --clr-accepted:          #10B981;
    --clr-accepted-bg:       rgba(16,185,129,0.09);
    --clr-accepted-border:   rgba(16,185,129,0.22);

    --clr-rejected:          #f05858;
    --clr-rejected-bg:       rgba(240,88,88,0.09);
    --clr-rejected-border:   rgba(240,88,88,0.22);

    --clr-reassigned:        #a78bfa;
    --clr-reassigned-bg:     rgba(167,139,250,0.09);
    --clr-reassigned-border: rgba(167,139,250,0.22);

    --clr-skeleton-base:     #13131f;
    --clr-skeleton-shine:    #1d1d2f;

    --header-border:         #141421;
    --strip-bg:              linear-gradient(135deg,rgba(255,107,0,0.12),rgba(255,107,0,0.04));
    --strip-border:          rgba(255,107,0,0.20);
  }

  /* ── Light theme ── */
  .theme-light {
    --clr-bg:                #f4f4f9;
    --clr-surface:           #ffffff;
    --clr-surface-raised:    rgba(0,0,0,0.04);
    --clr-border:            #e3e3ef;
    --clr-border-strong:     #d0d0e0;

    --clr-text:              #111118;
    --clr-text-sub:          #44445a;
    --clr-text-muted:        #7777a0;
    --clr-text-dim:          #aaaac0;

    --clr-brand:             #e85e00;
    --clr-brand-bg:          rgba(232,94,0,0.08);
    --clr-brand-border:      rgba(232,94,0,0.20);

    --clr-accepted:          #0a9e6e;
    --clr-accepted-bg:       rgba(10,158,110,0.08);
    --clr-accepted-border:   rgba(10,158,110,0.20);

    --clr-rejected:          #d93535;
    --clr-rejected-bg:       rgba(217,53,53,0.08);
    --clr-rejected-border:   rgba(217,53,53,0.20);

    --clr-reassigned:        #7c5fec;
    --clr-reassigned-bg:     rgba(124,95,236,0.08);
    --clr-reassigned-border: rgba(124,95,236,0.20);

    --clr-skeleton-base:     #ebebf5;
    --clr-skeleton-shine:    #f7f7ff;

    --header-border:         #e3e3ef;
    --strip-bg:              linear-gradient(135deg,rgba(232,94,0,0.09),rgba(232,94,0,0.03));
    --strip-border:          rgba(232,94,0,0.18);
  }
`;

const BASE_STYLES = `
  @keyframes row-in  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fade-in { from{opacity:0} to{opacity:1} }
  @keyframes shimmer { from{background-position:-200% 0} to{background-position:200% 0} }
  @keyframes hero-in { from{opacity:0;transform:scale(.95) translateY(14px)} to{opacity:1;transform:scale(1) translateY(0)} }

  .roh-root {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: var(--clr-bg);
    min-height: 100%;
    transition: background 0.3s, color 0.3s;
  }

  /* ── Page header ── */
  .roh-page-header {
    display: flex; align-items: center; gap: 14px;
    padding: 20px 18px 0; margin-bottom: 18px;
  }
  .roh-page-icon {
    width: 46px; height: 46px; border-radius: 15px;
    background: var(--clr-brand-bg);
    border: 1.5px solid var(--clr-brand-border);
    display: flex; align-items: center; justify-content: center;
    color: var(--clr-brand); flex-shrink: 0;
  }
  .roh-page-title {
    font-family: 'Syne', sans-serif;
    font-size: 20px; font-weight: 900;
    color: var(--clr-text); line-height: 1.1;
  }
  .roh-page-sub {
    font-size: 12px; font-weight: 600;
    color: var(--clr-text-muted); margin-top: 2px;
  }
  .roh-page-count-badge {
    margin-left: auto;
    font-family: 'Syne', sans-serif;
    font-size: 15px; font-weight: 900; color: var(--clr-brand);
    background: var(--clr-brand-bg); border: 1.5px solid var(--clr-brand-border);
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  /* ── Earnings strip ── */
  .roh-earnings-strip {
    position: relative; margin: 0 16px 14px;
    border-radius: 20px; padding: 20px 22px;
    background: var(--strip-bg); border: 1.5px solid var(--strip-border);
    display: flex; align-items: center; gap: 20px; overflow: hidden;
  }
  .roh-strip-shimmer {
    position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg,transparent,var(--clr-brand),transparent);
    opacity: 0.45;
  }
  .roh-earnings-eyebrow {
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 800; letter-spacing: .8px;
    text-transform: uppercase; color: var(--clr-text-muted); margin-bottom: 4px;
  }
  .roh-earnings-amount {
    font-family: 'Syne', sans-serif;
    font-size: 30px; font-weight: 900;
    color: var(--clr-brand); letter-spacing: -1px; line-height: 1;
  }
  .roh-earnings-left { flex: 1; }
  .roh-earnings-right { text-align: right; flex-shrink: 0; }
  .roh-earnings-divider {
    width: 1px; height: 44px;
    background: var(--clr-border-strong); flex-shrink: 0;
  }
  .roh-earnings-count {
    font-family: 'Syne', sans-serif;
    font-size: 22px; font-weight: 900;
    color: var(--clr-accepted); line-height: 1;
  }
  .roh-earnings-total-num {
    font-family: 'Syne', sans-serif;
    font-size: 18px; font-weight: 900;
    color: var(--clr-text); line-height: 1;
  }

  /* ── Stat grid ── */
  .roh-stat-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 8px; padding: 0 16px; margin-bottom: 14px;
  }
  .roh-stat-card {
    position: relative; border-radius: 16px; padding: 14px 10px 13px;
    text-align: center; background: var(--clr-surface);
    border: 1.5px solid var(--clr-border); cursor: pointer;
    transition: all 0.18s; font-family: inherit; overflow: hidden;
  }
  .roh-stat-card:active { transform: scale(0.95); }
  .roh-stat-icon { display: flex; justify-content: center; margin-bottom: 7px; }
  .roh-stat-num {
    font-family: 'Syne', sans-serif;
    font-size: 22px; font-weight: 900; line-height: 1; margin-bottom: 4px;
  }
  .roh-stat-label {
    font-size: 9px; font-weight: 800;
    text-transform: uppercase; letter-spacing: .5px; opacity: 0.75;
  }
  .roh-stat-active-dot {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 28px; height: 3px; border-radius: 2px 2px 0 0;
  }

  /* ── Filter chips ── */
  .roh-filter-row {
    display: flex; gap: 8px; padding: 0 16px; margin-bottom: 14px;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  .roh-filter-row::-webkit-scrollbar { display: none; }
  .roh-chip {
    flex-shrink: 0; display: flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 20px;
    border: 1.5px solid var(--clr-border); background: transparent;
    color: var(--clr-text-muted);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 12px; font-weight: 700; cursor: pointer;
    transition: all 0.15s; white-space: nowrap;
  }
  .roh-chip-active {
    border-color: var(--clr-brand-border);
    background: var(--clr-brand-bg); color: var(--clr-brand);
  }
  .roh-chip-count {
    background: var(--clr-surface-raised);
    border-radius: 8px; padding: 1px 6px;
    font-size: 10px; font-weight: 800;
  }

  /* ── Order list ── */
  .roh-list {
    display: flex; flex-direction: column; gap: 8px;
    padding: 0 16px 90px;
  }

  /* ── Order row ── */
  .roh-order-row {
    border-radius: 18px; padding: 14px;
    background: var(--clr-surface); border: 1.5px solid var(--clr-border);
    display: flex; align-items: center; gap: 13px;
    cursor: pointer; transition: all 0.15s;
    animation: row-in 0.28s ease both;
  }
  .roh-order-row:active { transform: scale(0.985); opacity: 0.85; }
  .roh-row-icon {
    width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .roh-row-info { flex: 1; min-width: 0; }
  .roh-row-top { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
  .roh-row-id {
    font-family: 'Syne', sans-serif;
    font-size: 13px; font-weight: 800; color: var(--clr-text);
  }
  .roh-row-badge {
    font-size: 9px; font-weight: 800;
    padding: 2px 8px; border-radius: 20px;
    text-transform: uppercase; letter-spacing: .5px;
  }
  .roh-row-vendor {
    font-size: 12px; font-weight: 600; color: var(--clr-text-sub);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .roh-row-time {
    font-size: 11px; font-weight: 500; color: var(--clr-text-dim); margin-top: 2px;
  }
  .roh-row-right {
    display: flex; flex-direction: column; align-items: flex-end;
    flex-shrink: 0; gap: 4px;
  }
  .roh-row-amount {
    font-family: 'Syne', sans-serif;
    font-size: 14px; font-weight: 900;
    color: var(--clr-accepted); white-space: nowrap;
  }
  .roh-row-amount-empty { font-size: 13px; font-weight: 700; color: var(--clr-text-dim); }

  /* ── Skeleton ── */
  .roh-skeleton {
    background: linear-gradient(90deg,
      var(--clr-skeleton-base) 25%,
      var(--clr-skeleton-shine) 50%,
      var(--clr-skeleton-base) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  /* ── Empty ── */
  .roh-empty { text-align: center; padding: 64px 20px 80px; animation: fade-in 0.4s ease; }
  .roh-empty-icon {
    width: 68px; height: 68px; border-radius: 22px;
    background: var(--clr-surface); border: 1.5px solid var(--clr-border);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px; color: var(--clr-text-dim);
  }
  .roh-empty-title {
    font-family: 'Syne', sans-serif;
    font-size: 17px; font-weight: 800;
    color: var(--clr-text); margin-bottom: 6px;
  }
  .roh-empty-sub { font-size: 13px; font-weight: 500; color: var(--clr-text-muted); }

  /* ── Detail view ── */
  .roh-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px; border-bottom: 1px solid var(--header-border);
  }
  .roh-back-btn {
    width: 40px; height: 40px; border-radius: 13px;
    background: var(--clr-surface-raised); border: 1px solid var(--clr-border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--clr-text-sub); transition: all 0.15s;
  }
  .roh-back-btn:active { transform: scale(0.92); }
  .roh-header-title {
    font-family: 'Syne', sans-serif;
    font-size: 16px; font-weight: 900; color: var(--clr-text);
  }
  .roh-detail-body { padding: 20px 18px 90px; }
  .roh-detail-hero {
    border-radius: 22px; padding: 32px 20px 26px; text-align: center;
    position: relative; overflow: hidden; margin-bottom: 22px;
    animation: hero-in 0.32s cubic-bezier(.34,1.56,.64,1) both;
  }
  .roh-hero-circle {
    position: absolute; border-radius: 50%; opacity: 0.07;
  }
  .roh-hero-circle-1 { width: 120px; height: 120px; top: -30px; right: -30px; }
  .roh-hero-circle-2 { width: 70px; height: 70px; bottom: -20px; left: 20px; }
  .roh-hero-icon {
    width: 66px; height: 66px; border-radius: 20px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
  }
  .roh-hero-label {
    font-family: 'Syne', sans-serif;
    font-size: 24px; font-weight: 900; margin-bottom: 6px;
  }
  .roh-hero-id { font-size: 13px; font-weight: 700; color: var(--clr-text-muted); }
  .roh-detail-section-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 800; letter-spacing: .8px;
    text-transform: uppercase; color: var(--clr-text-dim); margin-bottom: 10px;
  }
  .roh-detail-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
  .roh-context-card {
    padding: 16px 18px; border-radius: 16px;
    background: var(--clr-surface-raised); border: 1px solid var(--clr-border);
  }
  .roh-context-label {
    font-size: 10px; font-weight: 800; letter-spacing: .8px;
    text-transform: uppercase; color: var(--clr-text-dim); margin-bottom: 8px;
  }
  .roh-context-body {
    font-size: 13px; font-weight: 500;
    color: var(--clr-text-sub); line-height: 1.65;
  }
`;