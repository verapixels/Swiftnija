// pages/UserOrderHistory.tsx
// Standalone order history page — clean, responsive, theme-aware (dark/light)
// No emoji, React icons only, modular and maintainable

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiPackage, FiChevronRight, FiX, FiArrowLeft,
  FiMapPin, FiShoppingCart, FiTruck, FiClock,
  FiCheck, FiXCircle, FiAlertCircle, FiSearch,
  FiRefreshCw, FiShield, FiChevronDown,
  FiCalendar, FiPhone,
  FiCreditCard, FiBox,
} from "react-icons/fi";
import { MdDeliveryDining, MdOutlineStorefront } from "react-icons/md";
import { auth, db } from "../firebase";
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, getDoc, doc,
} from "firebase/firestore";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { useTheme } from "../context/ThemeContext";
import { useCart } from "../context/Cartcontext";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderItem = {
  name: string;
  qty: number;
  price: number;
  img?: string;
  image?: string;
  images?: string[];
  vendorName?: string;
  vendorId?: string;
};

type Order = {
  id: string;
  createdAt: any;
  status: OrderStatus;
  paymentStatus?: string;
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  items: OrderItem[];
  store?: string;
  vendorName?: string;
  vendorId?: string;
  vendorLogo?: string;
  deliveryAddress?: string;
  deliveryLabel?: string;
  riderName?: string;
  riderPhone?: string;
  riderId?: string;
  paymentMethod?: string;
  paystackReference?: string;
  customerName?: string;
  customerPickupCode?: string;
};

type OrderStatus =
  | "delivered" | "cancelled" | "pending" | "processing"
  | "confirmed" | "finding_rider" | "rider_assigned"
  | "picked_up" | "arriving";

type FilterType = "all" | "delivered" | "cancelled" | "active";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = "#FF6B00";
const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<OrderStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: any;
}> = {
  delivered:      { label: "Delivered",      color: "#10B981", bg: "rgba(16,185,129,.1)",  Icon: FiCheck },
  cancelled:      { label: "Cancelled",      color: "#ef4444", bg: "rgba(239,68,68,.1)",   Icon: FiXCircle },
  pending:        { label: "Pending",         color: "#f59e0b", bg: "rgba(245,158,11,.1)",  Icon: FiClock },
  processing:     { label: "Processing",      color: "#3b82f6", bg: "rgba(59,130,246,.1)",  Icon: FiRefreshCw },
  confirmed:      { label: "Confirmed",       color: "#3b82f6", bg: "rgba(59,130,246,.1)",  Icon: FiCheck },
  finding_rider:  { label: "Finding Rider",   color: "#f59e0b", bg: "rgba(245,158,11,.1)",  Icon: FiAlertCircle },
  rider_assigned: { label: "Rider Assigned",  color: "#8b5cf6", bg: "rgba(139,92,246,.1)",  Icon: MdDeliveryDining },
  picked_up:      { label: "Picked Up",       color: ACCENT,    bg: "rgba(255,107,0,.1)",   Icon: FiPackage },
  arriving:       { label: "Almost Here",     color: "#10B981", bg: "rgba(16,185,129,.1)",  Icon: FiTruck },
};

const ACTIVE_STATUSES: OrderStatus[] = [
  "pending", "processing", "confirmed",
  "finding_rider", "rider_assigned", "picked_up", "arriving",
];

const parsePrice = (p: any) =>
  parseFloat(String(p).replace(/[₦,\s]/g, "")) || 0;

// ─── Theme hook ───────────────────────────────────────────────────────────────

function useColors(dark: boolean) {
  return {
    bg:   dark ? "#080810" : "#f4f4f8",
    surf: dark ? "#0f0f18" : "#ffffff",
    card: dark ? "#12121c" : "#ffffff",
    brd:  dark ? "#1a1a28" : "#e8e8f0",
    brd2: dark ? "#222234" : "#d8d8e8",
    txt:  dark ? "#e8e8f2" : "#0c0c18",
    txt2: dark ? "#7070a0" : "#6060a0",
    txt3: dark ? "#3a3a58" : "#c0c0d8",
    inp:  dark ? "#13131e" : "#f8f8ff",
    inpB: dark ? "#1e1e30" : "#d4d4e8",
    dim:  dark ? "#1e1e2e" : "#ececf8",
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserOrderHistory() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const c = useColors(dark);
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [error, setError] = useState("");
  const [vendorLogos, setVendorLogos] = useState<Record<string, string>>({});

  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [fullOrder, setFullOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [reorderToast, setReorderToast] = useState("");

  // Fetch the FULL order doc from Firestore when user opens modal
  const openOrder = async (order: Order) => {
    setSelectedOrder(order);   // show modal immediately with what we have
    setFullOrder(null);
    setLoadingOrder(true);
    try {
      const snap = await getDoc(doc(db, "orders", order.id));
      if (snap.exists()) {
        setFullOrder({ id: snap.id, ...snap.data() } as Order);
      }
    } catch { /* keep using list data */ }
    finally { setLoadingOrder(false); }
  };

  // Fetch vendor logos after orders load
  const fetchVendorLogos = async (docs: Order[]) => {
    const ids = [...new Set(docs.map(o => o.vendorId).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    const results: Record<string, string> = {};
    await Promise.all(ids.map(async id => {
      try {
        const snap = await getDoc(doc(db, "vendors", id));
        if (snap.exists()) {
          const d = snap.data();
          const logo = d.logo || d.logoUrl || d.image || d.avatar || null;
          if (logo) results[id] = logo;
        }
      } catch { /* skip */ }
    }));
    setVendorLogos(prev => ({ ...prev, ...results }));
  };

  // Load initial orders
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); setError("Please log in to view your orders."); return; }
    setLoading(true);
    setError("");

    getDocs(
      query(
        collection(db, "orders"),
        where("userId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      )
    ).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
      setOrders(docs);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      fetchVendorLogos(docs);
    }).catch(e => {
      setError("Could not load orders. Please try again.");
      console.error(e);
    }).finally(() => setLoading(false));
  }, []);

  // Load more (pagination)
  const loadMore = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "orders"),
          where("userId", "==", uid),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        )
      );
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
      setOrders(prev => [...prev, ...docs]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      fetchVendorLogos(docs);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  };

  // Filtered + searched orders
  const filtered = orders.filter(o => {
    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? ACTIVE_STATUSES.includes(o.status) :
      o.status === filter;

    const q = search.trim().toLowerCase();
    const matchSearch = !q || (
      o.id.toLowerCase().includes(q) ||
      (o.vendorName || o.store || "").toLowerCase().includes(q) ||
      o.items?.some(i => i.name.toLowerCase().includes(q))
    );

    return matchFilter && matchSearch;
  });

  // Stats
  const totalSpent = orders.reduce((s, o) => s + (o.total || 0), 0);
  const deliveredCount = orders.filter(o => o.status === "delivered").length;
  const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length;

  // Reorder
  const handleReorder = useCallback((order: Order) => {
    let count = 0;
    for (const item of order.items) {
      for (let i = 0; i < item.qty; i++) {
        addToCart({
          name: item.name,
          price: `₦${item.price.toLocaleString()}`,
          img: item.img || "",
          vendorName: item.vendorName || order.vendorName || order.store || "",
          vendorId: item.vendorId || order.vendorId,
        });
        count++;
      }
    }
    setReorderToast(`${count} item${count !== 1 ? "s" : ""} added to cart`);
    setTimeout(() => setReorderToast(""), 3000);
    setSelectedOrder(null);
    navigate("/orders");
  }, [addToCart, navigate]);

  const FILTERS: { id: FilterType; label: string; count?: number }[] = [
    { id: "all",       label: "All",       count: orders.length },
    { id: "active",    label: "Active",    count: activeCount || undefined },
    { id: "delivered", label: "Delivered", count: deliveredCount || undefined },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <>
      <style>{styles(dark, c)}</style>

      {/* Toast */}
      {reorderToast && (
        <div className="uoh-toast">
          <FiShoppingCart size={14} />
          {reorderToast}
        </div>
      )}

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={fullOrder ?? selectedOrder}
          loadingItems={loadingOrder}
          dark={dark}
          c={c}
          vendorLogo={vendorLogos[(fullOrder ?? selectedOrder).vendorId ?? ""] ?? (fullOrder ?? selectedOrder).vendorLogo}
          onClose={() => { setSelectedOrder(null); setFullOrder(null); }}
          onReorder={handleReorder}
          onTrack={(id) => { setSelectedOrder(null); setFullOrder(null); navigate(`/orders/${id}/track`); }}
          onStore={(id) => { setSelectedOrder(null); setFullOrder(null); navigate(`/store/${id}`); }}
        />
      )}

      <div className="uoh-root" style={{ background: c.bg, color: c.txt }}>

        {/* Header */}
        <header className="uoh-header" style={{ background: c.surf, borderBottom: `1px solid ${c.brd}` }}>
          <button className="uoh-back" onClick={() => navigate(-1)} style={{ color: c.txt }}>
            <FiArrowLeft size={20} />
          </button>
          <div className="uoh-header-text">
            <h1 style={{ color: c.txt }}>Order History</h1>
            <span style={{ color: c.txt2 }}>All your past orders</span>
          </div>
        </header>

        <div className="uoh-body">

          {/* Stats row */}
          {orders.length > 0 && !loading && (
            <div className="uoh-stats">
              <StatCard
                dark={dark} c={c}
                icon={<FiPackage size={16} color={ACCENT} />}
                label="Total Orders"
                value={String(orders.length)}
              />
              <StatCard
                dark={dark} c={c}
                icon={<FiCheck size={16} color="#10B981" />}
                label="Delivered"
                value={String(deliveredCount)}
              />
              <StatCard
                dark={dark} c={c}
                icon={<span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, color: ACCENT, fontSize: 18, lineHeight: 1 }}>₦</span>}
                label="Total Spent"
                value={`₦${totalSpent.toLocaleString()}`}
              />
            </div>
          )}

          {/* Search + Filter */}
          <div className="uoh-controls">
            <div className="uoh-search-wrap" style={{ background: c.inp, border: `1.5px solid ${c.inpB}` }}>
              <FiSearch size={14} color={c.txt2} />
              <input
                className="uoh-search"
                style={{ color: c.txt, background: "transparent" }}
                placeholder="Search orders, stores, items..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ color: c.txt2, background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                  <FiX size={14} />
                </button>
              )}
            </div>

            <div className="uoh-filters">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  className={`uoh-filter-btn ${filter === f.id ? "active" : ""}`}
                  style={{
                    background: filter === f.id ? `rgba(255,107,0,.12)` : c.inp,
                    border: `1.5px solid ${filter === f.id ? "rgba(255,107,0,.35)" : c.inpB}`,
                    color: filter === f.id ? ACCENT : c.txt2,
                  }}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.count !== undefined && f.count > 0 && (
                    <span
                      className="uoh-filter-count"
                      style={{
                        background: filter === f.id ? "rgba(255,107,0,.2)" : c.brd2,
                        color: filter === f.id ? ACCENT : c.txt2,
                      }}
                    >
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="uoh-skeletons">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="uoh-skeleton-card" style={{ background: c.card, border: `1.5px solid ${c.brd}` }}>
                  <div className="uoh-sk" style={{ width: "40%", height: 11 }} />
                  <div className="uoh-sk" style={{ width: "60%", height: 14, marginTop: 10 }} />
                  <div className="uoh-sk" style={{ width: "30%", height: 11, marginTop: 8 }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="uoh-empty" style={{ background: c.card, border: `1.5px dashed ${c.brd}` }}>
              <FiAlertCircle size={28} color={c.txt3} />
              <span style={{ color: c.txt2 }}>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="uoh-empty" style={{ background: c.card, border: `1.5px dashed ${c.brd}` }}>
              <FiPackage size={28} color={c.txt3} />
              <span style={{ color: c.txt, fontWeight: 700, fontSize: 15 }}>
                {search ? "No orders match your search" : filter === "active" ? "No active orders" : filter === "delivered" ? "No delivered orders" : filter === "cancelled" ? "No cancelled orders" : "No orders yet"}
              </span>
              <span style={{ color: c.txt2, fontSize: 13 }}>
                {search ? "Try a different keyword" : "Your orders will appear here once placed"}
              </span>
            </div>
          ) : (
            <>
              <div className="uoh-list">
                {filtered.map((order, i) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    dark={dark}
                    c={c}
                    index={i}
                    vendorLogo={vendorLogos[order.vendorId ?? ""] ?? order.vendorLogo}
                    onClick={() => openOrder(order)}
                  />
                ))}
              </div>

              {hasMore && (
                <button
                  className="uoh-load-more"
                  style={{
                    background: c.inp,
                    border: `1.5px solid ${c.brd2}`,
                    color: c.txt2,
                  }}
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <><span className="uoh-spin" /> Loading...</>
                  ) : (
                    <><FiChevronDown size={14} /> Load more orders</>
                  )}
                </button>
              )}
            </>
          )}


        </div>
      </div>
    </>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ dark, c, icon, label, value }: {
  dark: boolean; c: any;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="uoh-stat-card" style={{ background: c.card, border: `1.5px solid ${c.brd}` }}>
      <div className="uoh-stat-icon" style={{ background: dark ? "rgba(255,107,0,.08)" : "rgba(255,107,0,.06)" }}>
        {icon}
      </div>
      <div className="uoh-stat-val" style={{ color: c.txt }}>{value}</div>
      <div className="uoh-stat-lbl" style={{ color: c.txt2 }}>{label}</div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, dark, c, index, vendorLogo, onClick }: {
  order: Order; dark: boolean; c: any; index: number;
  vendorLogo?: string;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.Icon;
  const date = order.createdAt?.toDate?.();
  const storeName = order.vendorName || order.store || "Store";

  return (
    <div
      className="uoh-order-card"
      style={{
        background: c.card,
        border: `1.5px solid ${c.brd}`,
        animationDelay: `${index * 0.05}s`,
      }}
      onClick={onClick}
    >
      {/* Left accent strip */}
      <div className="uoh-card-strip" style={{ background: cfg.color }} />

      <div className="uoh-card-inner">
        {/* Top row */}
        <div className="uoh-card-top">
          <div className="uoh-card-store-row">
            <div className="uoh-store-icon" style={{ background: dark ? "rgba(255,107,0,.08)" : "rgba(255,107,0,.06)", border: `1px solid ${dark ? "rgba(255,107,0,.15)" : "rgba(255,107,0,.12)"}`, overflow: "hidden" }}>
              {vendorLogo
                ? <img src={vendorLogo} alt={storeName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                : <MdOutlineStorefront size={15} color={ACCENT} />
              }
            </div>
            <span className="uoh-store-name" style={{ color: c.txt }}>{storeName}</span>
          </div>
          <div
            className="uoh-status-pill"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            <Icon size={10} />
            <span>{cfg.label}</span>
          </div>
        </div>

        {/* Items preview */}
        <div className="uoh-items-preview">
          {order.items?.slice(0, 3).map((it, i) => {
            const itImg = (it as any).img || (it as any).image || (it as any).images?.[0] || "";
            return (
              <span key={i} className="uoh-item-chip" style={{ background: c.dim, color: c.txt2, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {itImg && (
                  <img src={itImg} alt={it.name} style={{ width: 16, height: 16, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                {it.qty > 1 && <span style={{ color: ACCENT, fontWeight: 800 }}>{it.qty}×</span>} {it.name}
              </span>
            );
          })}
          {(order.items?.length ?? 0) > 3 && (
            <span className="uoh-item-chip more" style={{ background: c.dim, color: c.txt2 }}>
              +{order.items.length - 3} more
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="uoh-card-meta">
          {order.riderName && (
            <div className="uoh-meta-chip" style={{ background: "rgba(139,92,246,.08)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,.18)" }}>
              <MdDeliveryDining size={10} />
              {order.riderName}
            </div>
          )}
          {order.deliveryLabel && (
            <div className="uoh-meta-chip" style={{ background: c.dim, color: c.txt2, border: `1px solid ${c.brd}` }}>
              <FiMapPin size={9} />
              {order.deliveryLabel}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div className="uoh-card-bottom">
          <div className="uoh-card-date" style={{ color: c.txt2 }}>
            <FiCalendar size={10} />
            {date
              ? date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
              : "—"}
          </div>
          <div className="uoh-card-right">
            <span className="uoh-card-total" style={{ color: ACCENT }}>
              ₦{order.total?.toLocaleString() ?? "—"}
            </span>
            <FiChevronRight size={14} color={c.txt2} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────

function OrderDetailModal({ order, loadingItems, dark, c, vendorLogo, onClose, onReorder, onTrack, onStore }: {
  order: Order; loadingItems: boolean; dark: boolean; c: any;
  vendorLogo?: string;
  onClose: () => void;
  onReorder: (o: Order) => void;
  onTrack: (id: string) => void;
  onStore: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.Icon;
  const date = order.createdAt?.toDate?.();
  const storeName = order.vendorName || order.store || "Store";
  const isActive = ACTIVE_STATUSES.includes(order.status);

  return (
    <div className="uoh-overlay" onClick={onClose}>
      <div
        className="uoh-modal"
        style={{ background: c.surf, border: `1.5px solid ${c.brd}`, display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="uoh-modal-head" style={{ borderBottom: `1px solid ${c.brd}`, flexShrink: 0 }}>
          <div>
            <div className="uoh-modal-title" style={{ color: c.txt }}>
              Order #{order.id.slice(-8).toUpperCase()}
            </div>
            {date && (
              <div className="uoh-modal-date" style={{ color: c.txt2 }}>
                {date.toLocaleDateString("en-NG", {
                  weekday: "short", day: "numeric",
                  month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <button
            className="uoh-modal-close"
            style={{ background: c.dim, color: c.txt2 }}
            onClick={onClose}
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="uoh-modal-body">
          {/* Status */}
          <div
            className="uoh-modal-status"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
          >
            <div className="uoh-modal-status-icon" style={{ background: `${cfg.color}20`, color: cfg.color }}>
              <Icon size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
              {order.paymentStatus && (
                <div style={{ fontSize: 11, color: c.txt2, marginTop: 2 }}>
                  Payment: {order.paymentStatus === "paid" ? "Confirmed" : "Pending"}
                </div>
              )}
            </div>
          </div>

          {/* Items list — ALWAYS FIRST after status */}
          <div className="uoh-items-section" style={{ background: c.inp, border: `1px solid ${c.brd}` }}>
            <div className="uoh-items-head" style={{ borderBottom: `1px solid ${c.brd}`, color: c.txt2 }}>
              <FiBox size={12} />
              <span>Items ordered {!loadingItems && `(${(order.items ?? []).reduce((s, i) => s + (i.qty || 1), 0)})`}</span>
            </div>
            {loadingItems ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px", color: c.txt2, fontSize: 12, fontWeight: 600 }}>
                <span className="uoh-spin" />
                Loading items...
              </div>
            ) : (order.items ?? []).length === 0 ? (
              <div style={{ padding: "14px 16px", fontSize: 12, color: c.txt2, fontStyle: "italic" }}>
                No items found
              </div>
            ) : (order.items ?? []).map((item, i) => {
              const itemImg = (item as any).img || (item as any).image || ((item as any).images ?? [])[0] || "";
              return (
                <div
                  key={i}
                  className="uoh-item-row"
                  style={{ borderBottom: i < (order.items.length - 1) ? `1px solid ${c.brd}` : "none" }}
                >
                  <div className="uoh-item-thumb" style={{ background: dark ? "rgba(255,107,0,.08)" : "rgba(255,107,0,.06)", flexShrink: 0 }}>
                    {itemImg ? (
                      <img
                        src={itemImg}
                        alt={item.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 9, display: "block" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <FiPackage size={14} color={ACCENT} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                    {item.vendorName && (
                      <div style={{ fontSize: 11, color: c.txt2, marginTop: 1 }}>{item.vendorName}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.txt }}>
                      ₦{((item.price || 0) * (item.qty || 1)).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: c.txt2, marginTop: 1 }}>
                      {item.qty || 1} × ₦{(item.price || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Price breakdown */}
          <div className="uoh-breakdown" style={{ background: c.inp, border: `1px solid ${c.brd}` }}>
            {order.subtotal !== undefined && (
              <BreakdownRow label="Subtotal" value={`₦${order.subtotal.toLocaleString()}`} c={c} />
            )}
            {order.deliveryFee !== undefined && (
              <BreakdownRow label="Delivery fee" value={`₦${order.deliveryFee.toLocaleString()}`} c={c} />
            )}
            {!!order.discount && order.discount > 0 && (
              <BreakdownRow label="Discount" value={`−₦${order.discount.toLocaleString()}`} c={c} highlight="#22c55e" />
            )}
            <div style={{ height: 1, background: c.brd, margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0 0" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: c.txt }}>Total</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: ACCENT }}>
                ₦{order.total?.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Vendor */}
          <DetailRow
            icon={
              vendorLogo
                ? <img src={vendorLogo} alt={storeName} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 7 }} />
                : <MdOutlineStorefront size={14} color={ACCENT} />
            }
            label="Store"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
              <span style={{ color: c.txt, fontWeight: 600, fontSize: 13 }}>{storeName}</span>
              {order.vendorId && (
                <button
                  className="uoh-link-btn"
                  style={{ color: ACCENT, border: `1px solid rgba(255,107,0,.25)`, background: "rgba(255,107,0,.07)" }}
                  onClick={() => onStore(order.vendorId!)}
                >
                  Visit store <FiChevronRight size={10} />
                </button>
              )}
            </div>
          </DetailRow>

          {/* Rider */}
          {(order.riderName || order.riderId) ? (
            <DetailRow icon={<MdDeliveryDining size={14} color="#8b5cf6" />} label="Rider">
              <div>
                <div style={{ color: c.txt, fontWeight: 600, fontSize: 13 }}>
                  {order.riderName ?? "Assigned"}
                </div>
                {order.riderPhone && (
                  <div style={{ color: c.txt2, fontSize: 11, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    <FiPhone size={10} /> {order.riderPhone}
                  </div>
                )}
              </div>
            </DetailRow>
          ) : isActive ? (
            <DetailRow icon={<MdDeliveryDining size={14} color={c.txt3} />} label="Rider">
              <span style={{ color: c.txt2, fontSize: 13, fontStyle: "italic" }}>Not yet assigned</span>
            </DetailRow>
          ) : null}

          {/* Address */}
          {order.deliveryAddress && (
            <DetailRow icon={<FiMapPin size={14} color="#10B981" />} label="Delivered to">
              <span style={{ color: c.txt, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
                {order.deliveryAddress}
              </span>
            </DetailRow>
          )}

          {/* Payment */}
          {order.paymentMethod && (
            <DetailRow icon={<FiCreditCard size={14} color="#3b82f6" />} label="Payment">
              <div>
                <div style={{ color: c.txt, fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>
                  {order.paymentMethod.replace(/_/g, " ")}
                </div>
                {order.paystackReference && (
                  <div style={{ color: c.txt2, fontSize: 11, marginTop: 2 }}>
                    Ref: {order.paystackReference.slice(-14).toUpperCase()}
                  </div>
                )}
              </div>
            </DetailRow>
          )}

          {/* Pickup code */}
          {order.customerPickupCode && (
            <DetailRow icon={<FiShield size={14} color="#f59e0b" />} label="Pickup code">
              <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15, color: "#f59e0b", letterSpacing: 2 }}>
                {order.customerPickupCode}
              </span>
            </DetailRow>
          )}
        </div>

        {/* Sticky action bar — always visible above nav */}
        <div className="uoh-modal-footer" style={{ borderTop: `1px solid ${c.brd}`, background: c.surf }}>
          {isActive && order.status !== "cancelled" && (
            <button
              className="uoh-btn-track"
              style={{ background: "rgba(255,107,0,.1)", border: `1.5px solid rgba(255,107,0,.25)`, color: ACCENT }}
              onClick={() => onTrack(order.id)}
            >
              <FiTruck size={14} /> Track Order
            </button>
          )}
          <button
            className="uoh-btn-reorder"
            style={{ background: ACCENT }}
            onClick={() => onReorder(order)}
          >
            <FiShoppingCart size={14} /> Reorder
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function DetailRow({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="uoh-detail-row">
      <div className="uoh-detail-icon">{icon}</div>
      <div className="uoh-detail-content">
        <div className="uoh-detail-label">{label}</div>
        <div className="uoh-detail-value">{children}</div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, c, highlight }: {
  label: string; value: string; c: any; highlight?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, fontWeight: 600, color: highlight ?? c.txt2 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(dark: boolean, c: any) {
  const sk  = dark ? "#16162a" : "#ebebf5";
  const sk2 = dark ? "#1e1e32" : "#f4f4fc";

  return `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.uoh-root {
  min-height: 100vh;
  font-family: 'DM Sans', sans-serif;
  
}

.uoh-header {
  position: sticky;
  top: 0;
  z-index: 30;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  backdrop-filter: blur(12px);
}
.uoh-back {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s;
  flex-shrink: 0;
}
.uoh-back:hover { background: rgba(128,128,180,.1); }
.uoh-header-text h1 {
  font-family: 'Syne', sans-serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -.3px;
  line-height: 1.1;
}
.uoh-header-text span {
  font-size: 12px;
  font-weight: 500;
}

.uoh-body {
  padding: 20px 16px 180px;
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Stats */
.uoh-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.uoh-stat-card {
  border-radius: 16px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}
.uoh-stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.uoh-stat-val {
  font-family: 'Syne', sans-serif;
  font-size: 16px;
  font-weight: 900;
  line-height: 1;
  word-break: break-all;
}
.uoh-stat-lbl {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
}

/* Controls */
.uoh-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.uoh-search-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 13px;
  padding: 10px 14px;
  transition: border-color .2s;
}
.uoh-search-wrap:focus-within { border-color: ${ACCENT} !important; }
.uoh-search {
  flex: 1;
  border: none;
  outline: none;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
}
.uoh-search::placeholder { color: ${c.txt2}; }
.uoh-filters {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.uoh-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.uoh-filter-count {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 20px;
}

/* Order list */
.uoh-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.uoh-order-card {
  display: flex;
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  transition: transform .2s, box-shadow .2s, border-color .2s;
  animation: uoh-in .4s ease both;
}
.uoh-order-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255,107,0,.35) !important;
  box-shadow: 0 8px 28px rgba(0,0,0,${dark ? ".4" : ".08"});
}
@keyframes uoh-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.uoh-card-strip {
  width: 4px;
  flex-shrink: 0;
}
.uoh-card-inner {
  flex: 1;
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}
.uoh-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.uoh-card-store-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.uoh-store-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.uoh-store-name {
  font-family: 'Syne', sans-serif;
  font-size: 14px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.uoh-status-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 800;
  flex-shrink: 0;
  white-space: nowrap;
}
.uoh-items-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.uoh-item-chip {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 7px;
}
.uoh-item-chip.more { opacity: .65; }
.uoh-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.uoh-meta-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.uoh-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.uoh-card-date {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
}
.uoh-card-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.uoh-card-total {
  font-family: 'Syne', sans-serif;
  font-size: 16px;
  font-weight: 900;
}

/* Load more */
.uoh-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 13px;
  border-radius: 14px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
}
.uoh-load-more:hover:not(:disabled) { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
.uoh-load-more:disabled { opacity: .6; cursor: not-allowed; }

/* Empty / error */
.uoh-empty {
  border-radius: 20px;
  padding: 48px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

/* Skeleton */
.uoh-skeletons { display: flex; flex-direction: column; gap: 10px; }
.uoh-skeleton-card {
  border-radius: 16px;
  padding: 20px;
}
.uoh-sk {
  border-radius: 7px;
  background: linear-gradient(90deg, ${sk} 25%, ${sk2} 50%, ${sk} 75%);
  background-size: 200% 100%;
  animation: uoh-shimmer 1.4s infinite;
  display: block;
}
@keyframes uoh-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Overlay + Modal */
.uoh-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,${dark ? ".7" : ".5"});
  backdrop-filter: blur(5px);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: uoh-fade .2s ease;
  padding: 0 0 64px 0;
}
@keyframes uoh-fade { from { opacity: 0; } to { opacity: 1; } }
.uoh-modal {
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 128px);
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: uoh-slide .3s cubic-bezier(.32,1.2,.6,1);
}
.uoh-modal-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.uoh-modal-body::-webkit-scrollbar { display: none; }
.uoh-modal-footer {
  flex-shrink: 0;
  padding: 14px 20px 18px;
  display: flex;
  gap: 10px;
}
@keyframes uoh-slide {
  from { transform: translateY(40px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
.uoh-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 16px;
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 5;
}
.uoh-modal-title {
  font-family: 'Syne', sans-serif;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -.3px;
}
.uoh-modal-date {
  font-size: 11.5px;
  font-weight: 500;
  margin-top: 3px;
}
.uoh-modal-close {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity .15s;
}
.uoh-modal-close:hover { opacity: .7; }
.uoh-modal-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 14px;
}
.uoh-modal-status-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Detail row */
.uoh-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 11px 13px;
  border-radius: 12px;
  background: ${c.inp};
  border: 1px solid ${c.brd};
}
.uoh-detail-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: ${c.surf};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.uoh-detail-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.uoh-detail-label {
  font-size: 10px;
  font-weight: 800;
  color: ${c.txt2};
  text-transform: uppercase;
  letter-spacing: .6px;
}
.uoh-detail-value { display: flex; align-items: center; flex: 1; }
.uoh-link-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 9px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity .15s;
  font-family: 'DM Sans', sans-serif;
  flex-shrink: 0;
}
.uoh-link-btn:hover { opacity: .75; }

/* Items section */
.uoh-items-section {
  border-radius: 14px;
  overflow: hidden;
}
.uoh-items-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .6px;
}
.uoh-item-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
}
.uoh-item-thumb {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

/* Breakdown */
.uoh-breakdown {
  border-radius: 14px;
  padding: 13px 14px;
}

/* Buttons */
.uoh-btn-track, .uoh-btn-reorder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 14px;
  border-radius: 13px;
  border: none;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: transform .15s, opacity .15s;
}
.uoh-btn-track:hover, .uoh-btn-reorder:hover { transform: translateY(-1px); opacity: .88; }
.uoh-btn-reorder { color: white; }

/* Toast */
.uoh-toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 9px;
  background: ${ACCENT};
  color: white;
  padding: 11px 20px;
  border-radius: 20px;
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 6px 24px rgba(255,107,0,.4);
  animation: uoh-toast-in .3s cubic-bezier(.34,1.56,.64,1);
  white-space: nowrap;
}
@keyframes uoh-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(.95); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

/* Spin */
.uoh-spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(128,128,180,.3);
  border-top-color: ${ACCENT};
  animation: uoh-sp .7s linear infinite;
  display: inline-block;
  flex-shrink: 0;
}
@keyframes uoh-sp { to { transform: rotate(360deg); } }

/* Desktop */
@media (min-width: 600px) {
  .uoh-body { padding: 28px 24px 180px; }
  .uoh-overlay { align-items: center; padding: 20px; }
  .uoh-modal { border-radius: 24px; max-height: 88vh; }
  .uoh-modal-footer { padding: 14px 20px 16px; }
  .uoh-stats { gap: 12px; }
  .uoh-stat-val { font-size: 18px; }
}
`;
}