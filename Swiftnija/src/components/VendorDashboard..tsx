// VendorDashboard.tsx — Full featured dashboard shell
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiHome, FiPackage, FiShoppingBag, FiBarChart2,
  FiBell, FiUser, FiSettings, FiMenu, FiLogOut, FiX,
  FiZap, FiAlertCircle, FiClock, FiCheck, FiCheckCircle,
  FiWifi, FiWifiOff,
} from "react-icons/fi";
import { RiMoneyDollarCircleLine, RiLineChartLine } from "react-icons/ri";
import { MdVerified, MdDeliveryDining } from "react-icons/md";
import { HiOutlineSpeakerphone } from "react-icons/hi";

import { auth, db } from "../firebase";
import {
  doc, setDoc, serverTimestamp, collection, query,
  orderBy, onSnapshot, where, Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { useVendorData } from "../hooks/useVendorData";
import OverviewPage    from "../Pages/OverviewPage";
import ProductsPage    from "../Pages/ProductsPage";
import OrdersPage      from "../Pages/Vendororderspage";
import AnalyticsPage   from "../Pages/AnalyticsPage";
import PayoutsPage     from "../Pages/PayoutsPage";
import ProfilePage     from "../Pages/ProfilePage";
import SettingsPage    from "../Pages/SettingsPage";
import PickupCodePage  from "../Pages/PickupCodePage";
import PromotionsPage  from "../Pages/PromotionsPage";
import VendorBlueBadge from "../Pages/Vendorbluebadge";
import type { VendorProfile } from "../types";
import { useMaintenanceBanner } from "../hooks/useMaintenanceBanner";

// ─── Notification type ────────────────────────────────────────────────────────
type DashNotif = {
  id: string;
  msg: string;
  time: string;
  read: boolean;
  type: "order" | "system" | "info";
  orderId?: string;
};

// ─── Push notification helpers ────────────────────────────────────────────────
async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendPushNotification(title: string, body: string, tag?: string) {
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: tag ?? "swiftnija",
    requireInteraction: false,
    silent: false,
  });
  setTimeout(() => n.close(), 8000);
}

// ─── Audio context (lazy, singleton) ─────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// Call this once on any user gesture (e.g. first click anywhere)
function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function playOrderSound(soundEnabled: boolean) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state === "suspended") return; // not yet unlocked — skip silently
  try {
    const times = [0, 0.15, 0.3];
    times.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880 + i * 220;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.04);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.18);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* audio not supported */ }
}

// ─── Service Worker registration for background push ─────────────────────────
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {/* sw optional */});
  }
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "just now";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── PENDING SCREEN ───────────────────────────────────────────────────────────
function PendingScreen({ vendor }: { vendor: VendorProfile }) {
  const navigate = useNavigate();
  return (
    <div className="vd-pending-screen">
      <div style={{ width: 90, height: 90, borderRadius: 28, background: "rgba(245,158,11,0.1)", border: "2px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28, fontSize: 38 }}>⏳</div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "var(--text)", marginBottom: 12, lineHeight: 1.1 }}>Account Under Review</h2>
      <p style={{ color: "var(--text3)", fontSize: 15, lineHeight: 1.7, maxWidth: 420, marginBottom: 32 }}>
        Hi <strong style={{ color: "var(--text)" }}>{vendor.owner?.split(" ")[0] || vendor.name}</strong>, your store{" "}
        <strong style={{ color: "#FF6B00" }}>{vendor.name}</strong> is being reviewed. We'll email{" "}
        <strong style={{ color: "var(--text)" }}>{vendor.email}</strong> once approved — usually within 1–2 business days.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 380, marginBottom: 36 }}>
        {[
          { step: "Account created", done: true,  color: "#10B981" },
          { step: "Admin review",    done: false,  color: "#F59E0B", active: true },
          { step: "Store approved",  done: false,  color: "#888" },
          { step: "Start selling",   done: false,  color: "#888" },
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${s.color}`, background: s.done ? s.color : (s as any).active ? `${s.color}20` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {s.done ? <span style={{ color: "white", fontSize: 14 }}>✓</span>
                : (s as any).active ? <FiClock size={14} color={s.color} />
                : <span style={{ color: s.color, fontSize: 12, fontWeight: 700 }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 14, color: s.done ? "var(--text)" : (s as any).active ? s.color : "var(--text3)", fontWeight: (s as any).active ? 700 : 500 }}>{s.step}</span>
            {(s as any).active && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, background: "rgba(245,158,11,0.1)", padding: "3px 10px", borderRadius: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>In progress</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 12, background: "transparent", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        onClick={() => auth.signOut().then(() => navigate("/vendor/login"))}
      >
        <FiLogOut size={15} /> Sign Out
      </button>
    </div>
  );
}

// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
// Prevent refresh logout — only log out on explicit signout or token expiry
function useAuthGuard() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Persist auth state — Firebase handles this with local persistence by default
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthReady(true);
      if (!user) {
        // Only redirect if no user — not on every refresh
        navigate("/vendor/login", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  return authReady;
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function VendorDashboard() {
  const navigate = useNavigate();
  const authReady = useAuthGuard();
  const { vendor, setVendor, products, orders, promotions, settings, setSettings, loading } = useVendorData();

  const [activeTab, setActiveTab]         = useState("home");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [storeOnline, setStoreOnline]     = useState(true);
  const [notifications, setNotifications] = useState<DashNotif[]>([
    { id: "welcome", msg: "Welcome to your SwiftNija dashboard!", time: "just now", read: false, type: "system" },
  ]);
  const [newOrderPulse, setNewOrderPulse] = useState(false);
  const [refreshKey, setRefreshKey]       = useState(0);
  const { banner: maintenanceBanner, dismissed: bannerDismissed, dismiss: dismissBanner } = useMaintenanceBanner("vendor");

  const seenOrderIds = useRef<Set<string>>(new Set());
  const pushGranted  = useRef(false);

  const unread = notifications.filter(n => !n.read).length;
  const pendingOrders = orders.filter(o => o.status === "pending").length;

  

  
  // ── Init: request push permission, register SW, unlock audio ─────────────────
useEffect(() => {
  registerServiceWorker();
  requestPushPermission().then(granted => { pushGranted.current = granted; });

  const unlock = () => resumeAudioContext();
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });

  return () => {
    window.removeEventListener("click", unlock);
    window.removeEventListener("touchstart", unlock);
  };
}, []);

 useEffect(() => {
  if (settings) setStoreOnline(settings.storeOpen !== false);
}, [settings?.storeOpen]);

  // ── Real-time new order listener ──────────────────────────────────────────
 useEffect(() => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const q = query(
  collection(db, "orders"),
  where("vendorId", "==", uid),
  where("paymentStatus", "==", "paid"),   // ← add this
  orderBy("createdAt", "desc"),
);

  const unsub = onSnapshot(q, (snap) => {
     // AFTER — only notify when payment is confirmed
snap.docChanges().forEach((change) => {
  if (change.type !== "added") return;
  const data = change.doc.data();
  const orderId = change.doc.id;

  if (seenOrderIds.current.has(orderId)) return;
  seenOrderIds.current.add(orderId);

  // ✅ KEY FIX: skip unpaid orders entirely
  if (data.paymentStatus !== "paid") return;

        // Skip if it's an old order (older than 5 mins)
        const createdAt = data.createdAt as Timestamp | null;
        if (createdAt) {
          const ageMs = Date.now() - createdAt.toDate().getTime();
          if (ageMs > 5 * 60 * 1000) return; // older than 5 mins — on initial load
        }

        const ref = String(data.reference ?? orderId).slice(-8).toUpperCase();
        const customer = data.customerName || data.customerEmail || "A customer";
        const msg = `🛍 New order #${ref} from ${customer}`;

        // Add to in-app notification panel
        setNotifications(prev => [{
          id: orderId,
          msg,
          time: relTime(createdAt),
          read: false,
          type: "order",
          orderId,
        }, ...prev]);

        // Badge pulse animation
        setNewOrderPulse(true);
        setTimeout(() => setNewOrderPulse(false), 3000);

        // Sound
        playOrderSound(settings?.soundEnabled !== false);

        // Browser push notification
        if (pushGranted.current) {
          sendPushNotification(
            "⚡ New SwiftNija Order!",
            `Order #${ref} from ${customer} is waiting for your confirmation.`,
            orderId,
          );
        }
      });
    }, () => {/* silently ignore listener errors */});

    return () => unsub();
  }, [auth.currentUser?.uid, settings?.soundEnabled]);

  
  // ── Store online/offline toggle ───────────────────────────────────────────
  const toggleStore = async () => {
    const next = !storeOnline;
    setStoreOnline(next);
    const updated = { ...settings, storeOpen: next };
    setSettings(updated);
    if (auth.currentUser) {
      await setDoc(
        doc(db, "vendorSettings", auth.currentUser.uid),
        { storeOpen: next, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(console.error);
    }
  };

  // ── In-page refresh ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // ── Mark all notifications read ───────────────────────────────────────────
  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // ── Theme CSS vars ────────────────────────────────────────────────────────
  const themeVars = settings?.darkMode ? {
    "--bg": "#0a0a0f", "--surface": "#0f0f16", "--border": "#1c1c26",
    "--text": "#e4e4f0", "--text2": "#7a7a99", "--text3": "#3e3e55",
    "--card": "#121219", "--inp": "#18181f", "--inpbd": "#222232",
  } : {
    "--bg": "#f0f0f7", "--surface": "#ffffff", "--border": "#e0e0ec",
    "--text": "#111118", "--text2": "#55556a", "--text3": "#aaaabc",
    "--card": "#ffffff", "--inp": "#f5f5fc", "--inpbd": "#d8d8ec",
  };

  const handleVendorUpdate = (updates: Partial<VendorProfile>) => {
    if (vendor) setVendor({ ...vendor, ...updates });
  };

  const handleSettingsUpdate = async (updated: typeof settings) => {
    setSettings(updated);
    if (auth.currentUser) {
      await setDoc(
        doc(db, "vendorSettings", auth.currentUser.uid),
        { ...updated, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(console.error);
    }
  };

  const NAV_SECTIONS = [
    {
      label: "Main",
      items: [
        { id: "home",      icon: <FiHome size={17} />,                 label: "Overview",      badge: null },
        { id: "products",  icon: <FiPackage size={17} />,              label: "Products",      badge: products.filter(p => p.stock === 0).length || null },
        { id: "orders",    icon: <FiShoppingBag size={17} />,          label: "Orders",        badge: pendingOrders || null },
        { id: "payouts",   icon: <RiMoneyDollarCircleLine size={17} />,label: "Payouts",       badge: null },
        { id: "analytics", icon: <RiLineChartLine size={17} />,        label: "Analytics",     badge: null },
      ],
    },
    {
      label: "Store",
      items: [
        { id: "promotions", icon: <HiOutlineSpeakerphone size={17} />, label: "Promotions",   badge: promotions.filter(p => p.status === "active").length || null },
        { id: "pickup",     icon: <MdDeliveryDining size={17} />,      label: "Pickup Codes", badge: null },
      ],
    },
    {
      label: "Account",
      items: [
        { id: "profile",    icon: <FiUser size={17} />,     label: "Profile",    badge: null },
        { id: "settings",   icon: <FiSettings size={17} />, label: "Settings",   badge: null },
        { id: "bluebadge",  icon: <MdVerified size={17} />, label: "Blue Badge", badge: null },
      ],
    },
  ];

  const renderPage = () => {
    if (!vendor) return null;
    switch (activeTab) {
      case "home":       return <OverviewPage key={refreshKey} vendor={vendor} products={products} orders={orders} loading={loading} setActiveTab={setActiveTab} setShowAddProduct={() => setActiveTab("products")} />;
      case "products":   return <ProductsPage key={refreshKey} products={products} loading={loading} />;
      case "orders":     return <OrdersPage key={refreshKey} />;
      case "analytics":  return <AnalyticsPage key={refreshKey} products={products} orders={orders} loading={loading} />;
      case "payouts": return <PayoutsPage key={refreshKey} />;
      case "profile":    return <ProfilePage key={refreshKey} vendor={vendor} onUpdate={handleVendorUpdate} />;
      case "settings":   return <SettingsPage key={refreshKey} vendor={vendor} settings={settings} setSettings={handleSettingsUpdate} onVendorUpdate={handleVendorUpdate} />;
      case "pickup":     return <PickupCodePage key={refreshKey} />;
      case "promotions": return <PromotionsPage key={refreshKey} vendor={vendor} />;
      case "bluebadge":  return <VendorBlueBadge key={refreshKey} vendor={vendor} />;
      default:           return <OverviewPage key={refreshKey} vendor={vendor} products={products} orders={orders} loading={loading} setActiveTab={setActiveTab} setShowAddProduct={() => setActiveTab("products")} />;
    }
  };


  // Loading skeleton while auth resolves
  if (!authReady || (!vendor && loading)) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#888", fontFamily: "Inter, sans-serif", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⚡</div>
        <div style={{ fontSize: 14 }}>Loading dashboard…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authReady && !vendor && !loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#888", fontFamily: "Inter, sans-serif", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 32 }}>⚡</div>
        <div style={{ fontSize: 14 }}>Could not load vendor data.</div>
        <button onClick={() => auth.signOut().then(() => window.location.href = "/vendor/login")} style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: "transparent", border: "1px solid #333", color: "#888", cursor: "pointer" }}>
          Sign Out
        </button>
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <div className="vd-root" style={themeVars as React.CSSProperties}>

          {/* ── MAINTENANCE BANNER ── */}
    {maintenanceBanner?.active && !bannerDismissed && (
  <div style={{
    background: "linear-gradient(90deg,#7f1d1d,#991b1b)",
    color: "white",
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 700,
    position: "fixed",       // ← change from "sticky"
    top: 0, left: 0, right: 0,  // ← add left and right
    zIndex: 9999,
    fontFamily: "'Inter', sans-serif",  // ← add fontFamily
  }}>
    🔧
    <span style={{ flex: 1 }}>{maintenanceBanner.message}</span>
    <button onClick={dismissBanner} style={{
      background: "rgba(255,255,255,0.15)",
      border: "1px solid rgba(255,255,255,0.3)",
      borderRadius: 8, color: "white", cursor: "pointer",
      padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0,
    }}>
      ✕ Dismiss
    </button>
  </div>
)}

      {/* ═══ SIDEBAR ═══ */}
      <aside className={`vd-sidebar ${sidebarOpen ? "open" : ""}`}>
        {/* Brand */}
        <div className="vd-brand">
          <div className="vd-brand-icon">⚡</div>
          <span className="vd-brand-name">swift<span style={{ color: "#FF6B00" }}>nija</span></span>
        </div>

        {/* Vendor chip */}
        <div className="vd-vendor-chip">
          <div className="vd-vendor-avatar">
            {vendor.logo
              ? <img src={vendor.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
              : vendor.name[0]
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div className="vd-vendor-name">{vendor.name}</div>
              {/* Blue tick only if blueBadge is approved — NOT just verified */}
              {vendor.blueBadge && <MdVerified size={12} color="#1877F2" />}
            </div>
            <div className="vd-vendor-sub">
              {/* Store online/offline indicator */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: storeOnline ? "#10B981" : "#EF4444", display: "inline-block" }} />
                {storeOnline ? "Store Open" : "Store Closed"}
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="vd-nav">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              <div className="vd-nav-section">{section.label}</div>
              {section.items.map(item => (
                <div
                  key={item.id}
                  className={`vd-nav-item ${activeTab === item.id ? "active" : ""}`}
                  onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className={`vd-nav-badge ${item.id === "orders" && newOrderPulse ? "pulse-badge" : ""}`}>
                      {item.badge}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="vd-signout" onClick={() => auth.signOut().then(() => navigate("/vendor/login"))}>
          <FiLogOut size={17} /><span>Sign Out</span>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="vd-main">

        {/* ── Topbar ── */}
        <header className="vd-topbar">
          <button className="vd-icon-btn vd-menu-btn" onClick={() => setSidebarOpen(v => !v)}>
            <FiMenu size={19} />
          </button>

          <span className="vd-topbar-title">
            {NAV_SECTIONS.flatMap(s => s.items).find(i => i.id === activeTab)?.label || "Dashboard"}
          </span>

          {/* Store open/close toggle in topbar */}
          <button
            onClick={toggleStore}
            className="vd-store-toggle"
            style={{ background: storeOnline ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${storeOnline ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: storeOnline ? "#10B981" : "#EF4444" }}
            title={storeOnline ? "Store is Open — click to close" : "Store is Closed — click to open"}
          >
            {storeOnline ? <FiWifi size={14} /> : <FiWifiOff size={14} />}
            <span className="vd-store-toggle-label">{storeOnline ? "Open" : "Closed"}</span>
          </button>

          {/* Refresh button */}
          <button className="vd-icon-btn" onClick={handleRefresh} title="Refresh page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button
              className="vd-icon-btn"
              onClick={() => setNotifOpen(v => !v)}
              style={{ position: "relative" }}
            >
              <FiBell size={17} className={newOrderPulse ? "bell-ring" : ""} />
              {unread > 0 && (
                <span className={`vd-notif-dot ${newOrderPulse ? "notif-dot-pulse" : ""}`}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {/* Notification panel */}
            {notifOpen && (
              <div className="vd-notif-panel">
                <div className="vd-notif-header">
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                    Notifications {unread > 0 && <span style={{ color: "#FF6B00" }}>({unread})</span>}
                  </span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#FF6B00", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <FiCheckCircle size={12} /> Mark all read
                      </button>
                    )}
                    <button className="vd-modal-close" onClick={() => setNotifOpen(false)}>
                      <FiX size={15} />
                    </button>
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                    No notifications yet
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`vd-notif-item ${!n.read ? "unread" : ""}`}
                      onClick={() => {
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                        if (n.type === "order") { setActiveTab("orders"); setNotifOpen(false); }
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.read ? "transparent" : "#FF6B00", flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--text)", fontSize: 13 }}>{n.msg}</div>
                        <div style={{ color: "var(--text3)", fontSize: 11, marginTop: 2 }}>{n.time}</div>
                      </div>
                      {n.type === "order" && !n.read && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#FF6B00", background: "rgba(255,107,0,0.1)", padding: "2px 6px", borderRadius: 6 }}>
                          View
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        {/* ── Content — pending gate ── */}
        <div className="vd-content">
          {!vendor.verified && activeTab !== "profile" && activeTab !== "settings" ? (
            <PendingScreen vendor={vendor} />
          ) : (
            renderPage()
          )}
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="vd-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* New order toast */}
      {newOrderPulse && (
        <div className="vd-order-toast" onClick={() => { setActiveTab("orders"); setNewOrderPulse(false); }}>
          <div style={{ fontSize: 20 }}>🛍</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>New Order!</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>Tap to view and accept</div>
          </div>
        </div>
      )}

      {/* ═══ STYLES ═══ */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .vd-root { display:flex; height:100vh; overflow:hidden; font-family:'Inter',sans-serif; color:var(--text); background:var(--bg); }
        .vd-main { flex:1; display:flex; flex-direction:column; height:100vh; overflow:hidden; min-width:0; }
        .vd-content { flex:1; overflow-y:auto; padding:24px; scrollbar-width:thin; scrollbar-color:rgba(255,107,0,0.2) transparent; }
        .vd-content::-webkit-scrollbar { width:4px; }
        .vd-content::-webkit-scrollbar-thumb { background:rgba(255,107,0,0.2); border-radius:4px; }

        .vd-sidebar { width:240px; height:100vh; background:var(--surface); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:20px 14px; gap:6px; flex-shrink:0; overflow:hidden; transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); z-index:100; }
        .vd-brand { display:flex; align-items:center; gap:10px; padding:0 8px; margin-bottom:18px; flex-shrink:0; }
        .vd-brand-icon { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#FF6B00,#FF8C00); display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
        .vd-brand-name { font-family:'Syne',sans-serif; font-size:18px; font-weight:900; color:var(--text); }
        .vd-vendor-chip { display:flex; align-items:center; gap:10px; padding:10px 12px; background:rgba(255,107,0,0.06); border-radius:14px; margin-bottom:8px; flex-shrink:0; border:1px solid rgba(255,107,0,0.1); }
        .vd-vendor-avatar { width:36px; height:36px; border-radius:50%; background:#FF6B00; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:15px; flex-shrink:0; overflow:hidden; }
        .vd-vendor-name { font-size:12px; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .vd-vendor-sub { font-size:10px; color:var(--text3); margin-top:2px; }
        .vd-nav { display:flex; flex-direction:column; gap:2px; flex:1; overflow-y:auto; }
        .vd-nav::-webkit-scrollbar { display:none; }
        .vd-nav-section { font-size:9px; font-weight:800; color:var(--text3); letter-spacing:1px; text-transform:uppercase; padding:12px 8px 5px; }
        .vd-nav-item { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:11px; cursor:pointer; color:var(--text2); font-size:13px; font-weight:600; transition:all 0.15s; flex-shrink:0; position:relative; }
        .vd-nav-item:hover { background:rgba(255,107,0,0.07); color:#FF6B00; }
        .vd-nav-item.active { background:rgba(255,107,0,0.12); color:#FF6B00; font-weight:700; }
        .vd-nav-item.active::before { content:''; position:absolute; left:0; top:20%; height:60%; width:3px; background:#FF6B00; border-radius:0 3px 3px 0; }
        .vd-nav-badge { margin-left:auto; background:#EF4444; color:white; font-size:9px; font-weight:800; padding:2px 7px; border-radius:20px; min-width:18px; text-align:center; }
        .vd-nav-badge.pulse-badge { animation:badge-pop 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        .vd-signout { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:11px; cursor:pointer; color:#EF4444; font-size:13px; font-weight:600; transition:all 0.15s; margin-top:4px; flex-shrink:0; }
        .vd-signout:hover { background:rgba(239,68,68,0.08); }

        .vd-topbar { height:56px; min-height:56px; border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 16px; gap:10px; background:var(--surface); flex-shrink:0; }
        .vd-topbar-title { font-weight:700; font-size:15px; color:var(--text); flex:1; }
        .vd-icon-btn { background:none; border:1px solid var(--border); border-radius:10px; padding:7px; cursor:pointer; color:var(--text2); display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
        .vd-icon-btn:hover { border-color:rgba(255,107,0,0.3); color:#FF6B00; }
        .vd-menu-btn { display:none; }

        .vd-store-toggle { display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:10px; cursor:pointer; font-size:12px; font-weight:700; font-family:'Inter',sans-serif; transition:all 0.2s; white-space:nowrap; }
        .vd-store-toggle-label { display:none; }
        @media(min-width:640px) { .vd-store-toggle-label { display:inline; } }

        .vd-notif-dot { position:absolute; top:-3px; right:-3px; min-width:16px; height:16px; border-radius:10px; background:#EF4444; color:white; font-size:8px; font-weight:800; display:flex; align-items:center; justify-content:center; border:2px solid var(--surface); padding:0 3px; }
        .vd-notif-dot.notif-dot-pulse { animation:dot-pulse 0.5s cubic-bezier(0.34,1.56,0.64,1); }

        .vd-notif-panel { position:absolute; right:0; top:50px; width:340px; background:var(--surface); border:1px solid var(--border); border-radius:18px; overflow:hidden; z-index:200; box-shadow:0 12px 40px rgba(0,0,0,0.35); animation:slideDown 0.2s ease; max-height:480px; overflow-y:auto; }
        .vd-notif-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--surface); z-index:1; }
        .vd-notif-item { display:flex; gap:12px; padding:13px 18px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.15s; align-items:flex-start; }
        .vd-notif-item:last-child { border-bottom:none; }
        .vd-notif-item:hover { background:rgba(255,107,0,0.04); }
        .vd-notif-item.unread { background:rgba(255,107,0,0.03); }
        .vd-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:99; }

        .vd-order-toast { position:fixed; bottom:24px; right:24px; z-index:500; display:flex; align-items:center; gap:12px; padding:14px 18px; background:var(--surface); border:2px solid #FF6B00; border-radius:18px; box-shadow:0 12px 40px rgba(255,107,0,0.3); cursor:pointer; animation:toast-in 0.4s cubic-bezier(0.34,1.56,0.64,1); max-width:280px; }

        .vd-pending-screen { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:80vh; padding:40px 24px; text-align:center; }

        /* Shared page styles */
        .vd-page { max-width:920px; margin:0 auto; }
        .vd-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:12px; flex-wrap:wrap; }
        .vd-page-title { font-family:'Syne',sans-serif; font-size:22px; font-weight:900; color:var(--text); }
        .vd-page-sub { font-size:13px; color:var(--text3); margin-top:3px; }
        .vd-greeting { font-size:13px; color:var(--text3); margin-bottom:3px; }
        .vd-loading { text-align:center; padding:60px 20px; color:var(--text3); font-size:14px; }
        .vd-empty { color:var(--text3); padding:20px 0; text-align:center; font-size:13px; }
        .vd-empty-big { color:var(--text3); padding:60px 0; text-align:center; font-size:14px; display:flex; flex-direction:column; align-items:center; gap:12px; }

        .vd-card { background:var(--card); border:1px solid var(--border); border-radius:18px; padding:18px; margin-bottom:16px; }
        .vd-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .vd-card-title { font-size:14px; font-weight:700; color:var(--text); }
        .vd-see-all { font-size:12px; color:#FF6B00; cursor:pointer; font-weight:700; }
        .vd-see-all:hover { text-decoration:underline; }

        .vd-stats-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-bottom:20px; }
        .vd-stat-card { background:var(--card); border:1px solid var(--border); border-radius:18px; padding:18px; transition:border-color 0.2s; }
        .vd-stat-card:hover { border-color:rgba(255,107,0,0.2); }
        .vd-stat-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .vd-stat-icon { width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; }
        .vd-stat-value { font-size:24px; font-weight:800; color:var(--text); font-family:'Syne',sans-serif; }
        .vd-stat-label { font-size:12px; color:var(--text3); margin-top:3px; }
        .vd-stat-sub { font-size:11px; color:var(--text3); margin-top:5px; }
        .vd-stat-trend { display:flex; align-items:center; gap:3px; font-size:12px; font-weight:700; }

        .vd-btn-primary { display:inline-flex; align-items:center; gap:7px; padding:10px 20px; border-radius:11px; background:linear-gradient(135deg,#FF6B00,#FF8C00); border:none; color:white; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; font-family:'Inter',sans-serif; white-space:nowrap; }
        .vd-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(255,107,0,0.4); }
        .vd-btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none !important; box-shadow:none !important; }
        .vd-btn-outline { display:inline-flex; align-items:center; gap:7px; padding:10px 20px; border-radius:11px; background:transparent; border:1px solid var(--border); color:var(--text2); font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif; }
        .vd-btn-outline:hover { border-color:rgba(255,107,0,0.3); color:#FF6B00; }
        .vd-btn-danger { display:inline-flex; align-items:center; gap:7px; padding:10px 20px; border-radius:11px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#EF4444; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif; }
        .vd-btn-danger:hover { background:rgba(239,68,68,0.2); }

        .vd-field { width:100%; padding:11px 14px; border-radius:11px; border:1.5px solid var(--inpbd); background:var(--inp); color:var(--text); font-size:13px; outline:none; font-family:'Inter',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; }
        .vd-field:focus { border-color:#FF6B00; box-shadow:0 0 0 3px rgba(255,107,0,0.1); }
        .vd-field-label { display:block; font-size:10px; font-weight:800; color:var(--text3); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px; }
        .vd-textarea { resize:vertical; min-height:80px; line-height:1.5; }
        .vd-field-wrap { position:relative; }
        .vd-field-icon-right { position:absolute; right:13px; top:50%; transform:translateY(-50%); color:var(--text3); cursor:pointer; display:flex; background:none; border:none; }
        .vd-field-error { color:#EF4444; font-size:11px; font-weight:600; margin-top:5px; }
        .vd-field-hint { color:var(--text3); font-size:11px; margin-top:5px; }
        .vd-form-group { margin-bottom:18px; }
        .vd-form-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }

        .vd-toggle { width:46px; height:26px; border-radius:13px; background:var(--border); position:relative; cursor:pointer; transition:background 0.25s; flex-shrink:0; }
        .vd-toggle.on { background:#FF6B00; }
        .vd-toggle-knob { position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:white; transition:left 0.25s; box-shadow:0 1px 4px rgba(0,0,0,0.3); }
        .vd-toggle.on .vd-toggle-knob { left:23px; }

        .vd-settings-group { background:var(--card); border:1px solid var(--border); border-radius:18px; overflow:hidden; margin-bottom:16px; }
        .vd-settings-group-title { padding:14px 18px; font-size:12px; font-weight:800; color:var(--text); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
        .vd-setting-row { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); gap:16px; transition:background 0.15s; }
        .vd-setting-row:last-child { border-bottom:none; }
        .vd-setting-row:hover { background:rgba(255,107,0,0.02); }
        .vd-setting-info { flex:1; }
        .vd-setting-label { font-size:13px; font-weight:600; color:var(--text); }
        .vd-setting-desc { font-size:12px; color:var(--text3); margin-top:2px; }

        .vd-order-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
        .vd-order-row:last-child { border-bottom:none; }
        .vd-order-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#FF6B00,#FF8C00); display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:14px; flex-shrink:0; }
        .vd-order-info { flex:1; min-width:0; }
        .vd-order-name { font-size:13px; font-weight:700; color:var(--text); }
        .vd-order-item { font-size:11px; color:var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vd-orders-list { display:flex; flex-direction:column; gap:12px; }
        .vd-order-card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:16px; transition:border-color 0.2s; }
        .vd-order-card:hover { border-color:rgba(255,107,0,0.2); }
        .vd-oc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }

        .vd-top-product { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border); }
        .vd-top-product:last-child { border-bottom:none; }
        .vd-tp-img { width:44px; height:44px; border-radius:11px; overflow:hidden; flex-shrink:0; background:var(--border); }
        .vd-products-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:16px; }
        .vd-prod-card { background:var(--card); border:1px solid var(--border); border-radius:16px; overflow:hidden; transition:border-color 0.2s, transform 0.2s; }
        .vd-prod-card:hover { border-color:rgba(255,107,0,0.2); transform:translateY(-2px); }
        .vd-prod-img { height:145px; position:relative; background:var(--border); overflow:hidden; }
        .vd-prod-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.55); opacity:0; display:flex; align-items:center; justify-content:center; gap:8px; transition:opacity 0.2s; }
        .vd-prod-img:hover .vd-prod-overlay { opacity:1; }
        .vd-prod-action-btn { width:34px; height:34px; border-radius:9px; background:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#333; transition:background 0.15s; }
        .vd-prod-action-btn:hover { background:#f0f0f0; }
        .vd-prod-action-btn.danger { color:#EF4444; }
        .vd-prod-body { padding:13px; }
        .vd-prod-cat { font-size:9px; font-weight:800; color:#FF6B00; letter-spacing:0.7px; text-transform:uppercase; margin-bottom:5px; }
        .vd-prod-name { font-size:13px; font-weight:700; color:var(--text); margin-bottom:6px; }

        .vd-search-row { display:flex; gap:10px; margin-bottom:16px; }
        .vd-search-wrap { flex:1; display:flex; align-items:center; gap:8px; background:var(--inp); border:1.5px solid var(--inpbd); border-radius:11px; padding:0 14px; transition:border-color 0.2s; }
        .vd-search-wrap:focus-within { border-color:#FF6B00; }
        .vd-search-input { flex:1; background:none; border:none; outline:none; color:var(--text); font-size:13px; padding:10px 0; font-family:'Inter',sans-serif; }
        .vd-filter-tabs { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
        .vd-filter-tab { padding:7px 16px; border-radius:20px; border:1.5px solid var(--border); background:none; color:var(--text2); font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s; font-family:'Inter',sans-serif; }
        .vd-filter-tab:hover { border-color:rgba(255,107,0,0.3); color:#FF6B00; }
        .vd-filter-tab.active { background:rgba(255,107,0,0.12); border-color:rgba(255,107,0,0.3); color:#FF6B00; }

        .vd-quick-actions { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:6px; }
        .vd-qa-item { display:flex; flex-direction:column; align-items:center; gap:9px; padding:18px 8px; background:var(--card); border:1px solid var(--border); border-radius:16px; cursor:pointer; transition:all 0.2s; }
        .vd-qa-item:hover { border-color:rgba(255,107,0,0.3); transform:translateY(-3px); box-shadow:0 8px 24px rgba(0,0,0,0.15); }
        .vd-qa-icon { width:46px; height:46px; border-radius:13px; display:flex; align-items:center; justify-content:center; }
        .vd-qa-label { font-size:11px; font-weight:700; color:var(--text2); text-align:center; }

        .vd-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:300; padding:20px; backdrop-filter:blur(4px); }
        .vd-modal { background:var(--surface); border:1px solid var(--border); border-radius:22px; padding:28px; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; animation:modalPop 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .vd-modal-sm { max-width:360px; }
        .vd-modal-lg { max-width:560px; }
        .vd-modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
        .vd-modal-title { font-family:'Syne',sans-serif; font-size:18px; font-weight:900; color:var(--text); }
        .vd-modal-close { background:none; border:1px solid var(--border); border-radius:9px; padding:6px; cursor:pointer; color:var(--text2); display:flex; }
        .vd-modal-close:hover { color:#EF4444; border-color:rgba(239,68,68,0.3); }

        .vd-cover-wrap { position:relative; margin-bottom:52px; }
        .vd-cover-img { width:100%; height:170px; border-radius:18px; background:linear-gradient(135deg,rgba(255,107,0,0.2),rgba(59,130,246,0.15)); background-size:cover; background-position:center; display:flex; align-items:flex-end; justify-content:flex-end; padding:14px; overflow:hidden; }
        .vd-cover-edit-btn { display:flex; align-items:center; gap:6px; padding:7px 14px; border-radius:9px; background:rgba(0,0,0,0.55); border:none; color:white; font-size:12px; font-weight:600; cursor:pointer; backdrop-filter:blur(8px); transition:background 0.2s; }
        .vd-cover-edit-btn:hover { background:rgba(0,0,0,0.75); }
        .vd-logo-wrap { position:absolute; bottom:-42px; left:22px; }
        .vd-logo { width:84px; height:84px; border-radius:50%; background:linear-gradient(135deg,#FF6B00,#FF8C00); border:4px solid var(--surface); display:flex; align-items:center; justify-content:center; overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,0.25); }
        .vd-logo-edit-btn { position:absolute; bottom:3px; right:0; width:26px; height:26px; border-radius:50%; background:#FF6B00; border:2.5px solid var(--surface); color:white; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background 0.2s; }
        .vd-logo-edit-btn:hover { background:#e55a00; }
        .vd-profile-section { background:var(--card); border:1px solid var(--border); border-radius:18px; padding:20px; margin-bottom:16px; }
        .vd-section-title { font-size:11px; font-weight:800; color:var(--text3); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:18px; padding-bottom:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
        .vd-locked-field { display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:11px; border:1.5px dashed var(--border); background:var(--bg); color:var(--text2); font-size:13px; }

        .vd-otp-row { display:flex; gap:10px; justify-content:center; margin:20px 0; }
        .vd-otp-digit { width:52px; height:60px; border-radius:13px; border:2px solid var(--inpbd); background:var(--inp); color:var(--text); font-size:26px; font-weight:900; text-align:center; outline:none; font-family:'Syne',sans-serif; transition:border-color 0.2s, box-shadow 0.2s; caret-color:#FF6B00; }
        .vd-otp-digit:focus { border-color:#FF6B00; box-shadow:0 0 0 3px rgba(255,107,0,0.12); }

        .vd-upload-area { border:2px dashed var(--border); border-radius:14px; padding:24px; display:flex; flex-direction:column; align-items:center; cursor:pointer; transition:all 0.2s; }
        .vd-upload-area:hover { border-color:#FF6B00; background:rgba(255,107,0,0.03); }

        .vd-promo-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; margin-bottom:24px; }
        .vd-promo-card { background:var(--card); border:2px solid var(--border); border-radius:20px; padding:22px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden; }
        .vd-promo-card:hover { transform:translateY(-3px); box-shadow:0 12px 36px rgba(0,0,0,0.2); }
        .vd-promo-badge { position:absolute; top:14px; right:14px; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:800; }
        .vd-active-promo { border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:12px; }
        .vd-promo-progress { height:6px; border-radius:4px; background:var(--border); overflow:hidden; margin-top:10px; }
        .vd-promo-progress-bar { height:100%; border-radius:4px; transition:width 0.5s; }

        .vd-pickup-result { padding:20px; border-radius:18px; border:1px solid var(--border); background:var(--card); margin-top:0; }

        .vd-hours-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; margin-bottom:16px; }
        .vd-day-btn { padding:8px 4px; border-radius:10px; border:1.5px solid var(--border); background:none; color:var(--text2); font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s; text-align:center; font-family:'Inter',sans-serif; }
        .vd-day-btn.active { background:rgba(255,107,0,0.12); border-color:rgba(255,107,0,0.3); color:#FF6B00; }

        .vd-alert { display:flex; align-items:center; gap:10px; padding:13px 16px; border-radius:13px; font-size:13px; font-weight:600; margin-bottom:16px; }
        .vd-alert.error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); color:#EF4444; }
        .vd-alert.success { background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); color:#10B981; }
        .vd-alert.warning { background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); color:#F59E0B; }
        .vd-alert.info { background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2); color:#3B82F6; }

        .vd-bar-chart { display:flex; align-items:flex-end; gap:6px; height:110px; padding:0 4px; }
        .vd-spin { animation:spin 0.7s linear infinite; }
        .vd-fade-up { animation:fadeUp 0.35s ease both; }

        /* Blue badge page */
        .vd-bb-hero { background:linear-gradient(135deg,rgba(24,119,242,0.08),rgba(139,92,246,0.06)); border:1px solid rgba(24,119,242,0.15); border-radius:22px; padding:32px; text-align:center; margin-bottom:24px; }
        .vd-bb-status { display:inline-flex; align-items:center; gap:8px; padding:6px 16px; border-radius:20px; font-size:12px; font-weight:800; }
        .vd-doc-upload { border:2px dashed var(--border); border-radius:14px; padding:20px; display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; transition:all 0.2s; text-align:center; }
        .vd-doc-upload:hover { border-color:#1877F2; background:rgba(24,119,242,0.03); }
        .vd-doc-upload.uploaded { border-color:rgba(16,185,129,0.4); background:rgba(16,185,129,0.04); }

        select.vd-field { appearance:none; -webkit-appearance:none; padding-right:36px; }
        select.vd-field option { background:var(--surface); color:var(--text); }

        /* Animations */
        @keyframes modalPop { from { opacity:0; transform:scale(0.93) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes badge-pop { 0% { transform:scale(1); } 40% { transform:scale(1.4); } 100% { transform:scale(1); } }
        @keyframes dot-pulse { 0% { transform:scale(1); } 40% { transform:scale(1.6); } 100% { transform:scale(1); } }
        @keyframes toast-in { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes bell-ring { 0%,100% { transform:rotate(0); } 20% { transform:rotate(-15deg); } 40% { transform:rotate(15deg); } 60% { transform:rotate(-10deg); } 80% { transform:rotate(10deg); } }
        .bell-ring { animation:bell-ring 0.6s ease; }

        @media(max-width:800px) {
          .vd-sidebar { position:fixed; top:0; left:0; transform:translateX(-100%); box-shadow:none; }
          .vd-sidebar.open { transform:translateX(0); box-shadow:12px 0 40px rgba(0,0,0,0.4); }
          .vd-menu-btn { display:flex !important; }
          .vd-stats-grid { grid-template-columns:1fr 1fr; }
          .vd-quick-actions { grid-template-columns:repeat(2,1fr); }
          .vd-promo-grid { grid-template-columns:1fr; }
          .vd-form-row { grid-template-columns:1fr; }
          .vd-hours-grid { grid-template-columns:repeat(4,1fr); }
          .vd-order-toast { bottom:12px; right:12px; left:12px; max-width:none; }
        }
      `}</style>
    </div>
  );
}