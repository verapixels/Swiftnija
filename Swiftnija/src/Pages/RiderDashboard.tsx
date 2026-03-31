import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import BottomNav from "../components/BottomNav";
import { useTheme } from "../context/ThemeContext";
import { useFCMToken } from "../hooks/useFCMToken";
import IncomingOrderAlert from "../components/IncomingOrderAlert";
import RiderNavigationMap from "../components/Ridernavigationmap";
import {
  RiTimeLine, RiAlertLine, RiMapPinLine, RiMotorbikeLine,
  RiShieldCheckLine, RiPhoneLine,
  RiSunLine, RiMoonLine,
} from "react-icons/ri";
import RiderOrderHistory from "./RiderOrderHistory";
import RiderPayoutsPage from "./Riderpayoutspage";
import RiderSettingsTab from "./Ridersettingstab";
import { useMaintenanceBanner } from "../hooks/useMaintenanceBanner";

const O = "#FF6B00";

type RiderData = {
  uid: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  city: string;
  vehicleType: string;
  selfieUrl: string;
  idType: string;
  status: string;
  approved: boolean;
  isOnline: boolean;
  currentOrderId?: string;
  currentOrderCollection?: string;
  currentDeliveryId?: string;
  rejectionReason?: string;
  stats: { acceptanceRate: number; rating: number; totalDeliveries: number };
};

type ActiveOrder = {
  orderId: string;
  status: string;
  vendorName?: string;
  vendorLat?: number;
  vendorLng?: number;
  destLat?: number;
  destLng?: number;
  destAddress?: string;
  riderAccepted?: boolean;
  deliveryFee?: number;
  riderPickupCode?: string;
};

type IncomingOrderData = {
  orderId: string;
  vendorName: string;
  totalAmount: string;
};

// Earnings from Firestore
type EarningsData = {
  today: number;
  week: number;
  month: number;
  orders: number;
};

const VEHICLE_LABELS: Record<string, string> = {
  bike: "Motorcycle", bicycle: "Bicycle", car: "Car", van: "Van",
};

const T = {
  dark: {
    bg: "#0a0a0a", card: "rgba(255,255,255,0.04)", cardBorder: "rgba(255,255,255,0.08)",
    text: "#e8e8f0", textSub: "rgba(232,232,240,0.5)", textMuted: "rgba(232,232,240,0.28)",
    headerBg: "rgba(10,10,10,0.93)", rowBorder: "rgba(255,255,255,0.05)",
    earningsBg: "linear-gradient(135deg,#1a0f05,#0f0a04)",
    toggleBg: "rgba(255,255,255,0.07)", toggleBorder: "rgba(255,255,255,0.1)",
    toggleColor: "rgba(255,255,255,0.6)",
  },
  light: {
    bg: "#f0f0f5", card: "rgba(0,0,0,0.03)", cardBorder: "rgba(0,0,0,0.08)",
    text: "#111118", textSub: "rgba(17,17,24,0.5)", textMuted: "rgba(17,17,24,0.35)",
    headerBg: "rgba(240,240,245,0.93)", rowBorder: "rgba(0,0,0,0.05)",
    earningsBg: "linear-gradient(135deg,#fff8f3,#fff3ea)",
    toggleBg: "rgba(0,0,0,0.06)", toggleBorder: "rgba(0,0,0,0.1)",
    toggleColor: "rgba(17,17,24,0.5)",
  },
};

// ─── Earnings loader ──────────────────────────────────────────────────────────
async function loadEarnings(uid: string): Promise<EarningsData> {
  const now    = new Date();
  const todayStart  = new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart   = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);

  // Query all accepted/delivered orders for this rider
  const q = query(
    collection(db, "orders"),
    where("riderId", "==", uid),
    where("riderAccepted", "==", true),
  );
  const snap = await getDocs(q);

  let today = 0, week = 0, month = 0, orders = 0;

  snap.forEach(d => {
    const data  = d.data();
    const fee   = Number(data.deliveryFee ?? 0);
    const ts    = (data.createdAt as Timestamp | null)?.toDate?.() ?? null;
    if (!ts || data.status !== "delivered") return;

    orders++;
    month += fee;
    if (ts >= weekStart)  week  += fee;
    if (ts >= todayStart) today += fee;
  });

  return { today, week, month, orders };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RiderDashboard() {
  const { theme, toggleTheme } = useTheme();
  const tk = T[theme];

  // KEY FIX: tab 3 is now Settings, not a route navigation
  const [tab,            setTab]            = useState(0);
  const [rider,          setRider]          = useState<RiderData | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [earnings,       setEarnings]       = useState<EarningsData>({ today: 0, week: 0, month: 0, orders: 0 });
  const [earningsLoaded, setEarningsLoaded] = useState(false);

  const [incomingOrder,  setIncomingOrder]  = useState<IncomingOrderData | null>(null);
  const [activeOrder,    setActiveOrder]    = useState<ActiveOrder | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showNavMap,     setShowNavMap]     = useState(false);

  const { banner: maintenanceBanner, dismissed: bannerDismissed, dismiss: dismissBanner } = useMaintenanceBanner("rider");

  // Load rider data
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, "riders", uid), snap => {
      if (snap.exists()) setRider(snap.data() as RiderData);
    });
  }, []);

  // Load earnings once when rider is available, and refresh when switching to home tab
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || earningsLoaded) return;
    loadEarnings(uid).then(e => { setEarnings(e); setEarningsLoaded(true); });
  }, [rider, earningsLoaded]);

  // Re-fetch earnings whenever user comes to home tab
  useEffect(() => {
    if (tab === 0) {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      loadEarnings(uid).then(setEarnings);
    }
  }, [tab]);

  useFCMToken();

  useEffect(() => {
    if (!rider?.currentOrderId) {
      const timeout = setTimeout(() => {
        setActiveOrder(null);
        setIncomingOrder(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }

    const orderCollection = rider.currentOrderCollection ?? "orders";
    const unsub = onSnapshot(doc(db, orderCollection, rider.currentOrderId), snap => {
      if (!snap.exists()) {
        setIncomingOrder(null);
        setActiveOrder(null);
        return;
      }
      const order = snap.data();

      if (order.riderAccepted && order.riderId && order.riderId !== rider.uid) {
        setIncomingOrder(null);
        setActiveOrder(null);
        return;
      }

      const isPendingAcceptance =
        !order.riderAccepted &&
        ["rider_assigned", "pending", "finding_rider"].includes(order.status);

      if (isPendingAcceptance) {
        setIncomingOrder({
          orderId: snap.id,
          vendorName: order.vendorName ?? "Vendor",
          totalAmount: String(order.deliveryFee ?? order.total ?? ""),
        });
        setActiveOrder(null);
      } else {
        setIncomingOrder(null);
        setActiveOrder({
          orderId:         snap.id,
          status:          order.status,
          vendorName:      order.vendorName,
          vendorLat:       order.vendorLat,
          vendorLng:       order.vendorLng,
          destLat:         order.userLat,
          destLng:         order.userLng,
          destAddress:     order.deliveryAddress,
          riderAccepted:   order.riderAccepted,
          deliveryFee:     order.deliveryFee ?? 0,
          riderPickupCode: order.riderPickupCode,
        });
      }
    });

    return () => unsub();
  }, [rider?.currentOrderId, rider?.currentOrderCollection, rider?.uid]);

  // FCM foreground messages
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        setIncomingOrder({
          orderId:     detail.orderId,
          vendorName:  detail.vendorName ?? "Vendor",
          totalAmount: detail.totalAmount ?? "",
        });
      }
    };
    window.addEventListener("fcm-new-order", handler);
    return () => window.removeEventListener("fcm-new-order", handler);
  }, []);

  // Notification sound
  useEffect(() => {
    const audio = new Audio("/alert.mp3");
    audio.preload = "auto";

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "PLAY_NOTIFICATION_SOUND") {
        audio.volume = parseFloat(localStorage.getItem("riderAlertVolume") ?? "1.0");
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      if (event.data?.type === "new-order" && event.data.orderId) {
        setIncomingOrder({
          orderId:     event.data.orderId,
          vendorName:  event.data.vendorName ?? "Vendor",
          totalAmount: event.data.totalAmount ?? "",
        });
      }
    };

    const handleForegroundOrder = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.orderId) {
        audio.volume = parseFloat(localStorage.getItem("riderAlertVolume") ?? "1.0");
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleSWMessage);
    window.addEventListener("fcm-new-order", handleForegroundOrder);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
      window.removeEventListener("fcm-new-order", handleForegroundOrder);
    };
  }, []);

  const handleUpdateStatus = async (newStatus: "picked_up" | "arriving" | "delivered") => {
    if (!activeOrder || updatingStatus) return;
    if (activeOrder.status === newStatus) return;
    if (activeOrder.status === "delivered") return;
    setUpdatingStatus(true);
    try {
      const fn = httpsCallable(functions, "updateOrderStatus");
      await fn({
        orderId: activeOrder.orderId,
        newStatus,
        orderCollection: rider?.currentOrderCollection ?? "orders",
      });
    } catch (err) {
      console.error("[RiderDashboard] updateOrderStatus error:", err);
    }
    setUpdatingStatus(false);
  };

  // KEY FIX: no navigate() — tab 3 renders inline
  const handleTabChange = (idx: number) => setTab(idx);

  const toggleOnline = async () => {
    if (!rider || togglingOnline) return;
    setTogglingOnline(true);
    try {
      await updateDoc(doc(db, "riders", rider.uid), { isOnline: !rider.isOnline });
    } catch {}
    setTogglingOnline(false);
  };

  const ThemeBtn = () => (
    <button onClick={toggleTheme} style={{
      width: 36, height: 36, borderRadius: 10,
      background: tk.toggleBg, border: `1px solid ${tk.toggleBorder}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", color: tk.toggleColor,
      WebkitTapHighlightColor: "transparent", transition: "all 0.2s", flexShrink: 0,
    }}>
      {theme === "dark" ? <RiSunLine size={17} /> : <RiMoonLine size={17} />}
    </button>
  );

  // Loading
  if (!rider) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: tk.bg, flexDirection: "column", gap: 16 }}>
      <style>{BASE_CSS}</style>
      <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija"
        style={{ width: 60, height: 60, objectFit: "contain", filter: `drop-shadow(0 0 16px ${O}88)` }} />
      <span style={{ color: tk.textMuted, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>Loading…</span>
    </div>
  );

  // Under review
  if (rider.status === "under_review") return (
    <div style={{ minHeight: "100dvh", background: tk.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Syne',sans-serif", transition: "background 0.3s" }}>
      <style>{BASE_CSS}</style>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: `${O}18`, border: `1px solid ${O}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <RiTimeLine size={36} color={O} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: tk.text, letterSpacing: "-1px", marginBottom: 12 }}>Under Review</h1>
        <p style={{ fontSize: 14, color: tk.textSub, lineHeight: 1.7, fontFamily: "'DM Sans',sans-serif", marginBottom: 32 }}>
          Hey {rider.firstName}! 👋 Your application is being reviewed.<br />
          Usually takes <strong style={{ color: tk.text }}>24–48 hours</strong>.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <ThemeBtn />
          <button onClick={() => signOut(auth)} style={{ padding: "12px 24px", borderRadius: 12, background: tk.card, border: `1px solid ${tk.cardBorder}`, color: tk.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Sign Out</button>
        </div>
      </div>
    </div>
  );

  // Rejected
  if (rider.status === "rejected") return (
    <div style={{ minHeight: "100dvh", background: tk.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Syne',sans-serif", transition: "background 0.3s" }}>
      <style>{BASE_CSS}</style>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <RiAlertLine size={36} color="#ef4444" />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: tk.text, letterSpacing: "-1px", marginBottom: 12 }}>Application Rejected</h1>
        <p style={{ fontSize: 14, color: tk.textSub, lineHeight: 1.7, fontFamily: "'DM Sans',sans-serif", marginBottom: 16 }}>Unfortunately your application was not approved.</p>
        {rider.rejectionReason && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 14, padding: 16, marginBottom: 24 }}>
            <p style={{ color: tk.textSub, fontSize: 14, fontFamily: "'DM Sans',sans-serif" }}>{rider.rejectionReason}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
          <button onClick={() => window.location.href = "/rider/signup"} style={{ padding: "13px 24px", borderRadius: 12, background: `linear-gradient(135deg,${O},#FF9A00)`, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}>Fix &amp; Resubmit</button>
          <button onClick={() => signOut(auth)} style={{ padding: "13px 24px", borderRadius: 12, background: tk.card, border: `1px solid ${tk.cardBorder}`, color: tk.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Sign Out</button>
        </div>
      </div>
    </div>
  );

  const timeOfDay = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  const hasActiveDelivery = activeOrder &&
    !incomingOrder &&
    ["rider_assigned", "picked_up", "arriving"].includes(activeOrder.status) &&
    activeOrder.riderAccepted;

  const fmt = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ minHeight: "100dvh", background: tk.bg, fontFamily: "'Syne',sans-serif", paddingBottom: activeOrder ? 200 : 90, maxWidth: 480, margin: "0 auto", transition: "background 0.3s" }}>
      <style>{BASE_CSS}</style>

      {/* MAINTENANCE BANNER */}
      {maintenanceBanner?.active && !bannerDismissed && (
        <div style={{ background: "linear-gradient(90deg,#7f1d1d,#991b1b)", color: "white", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, position: "sticky", top: 0, zIndex: 9999, fontFamily: "'DM Sans', sans-serif" }}>
          🔧
          <span style={{ flex: 1 }}>{maintenanceBanner.message}</span>
          <button onClick={dismissBanner} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, color: "white", cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", background: tk.headerBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${tk.cardBorder}`, transition: "background 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontSize: 18, fontWeight: 900, color: O, fontFamily: "'Syne',sans-serif" }}>SwiftNija</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeBtn />
          <button onClick={() => signOut(auth)} style={{ padding: "7px 14px", borderRadius: 10, background: tk.card, border: `1px solid ${tk.cardBorder}`, color: tk.textSub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", WebkitTapHighlightColor: "transparent" }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Active delivery pill */}
      {hasActiveDelivery && activeOrder && (
        <div onClick={() => setShowNavMap(true)} style={{ margin: "10px 16px 0", padding: "10px 14px", borderRadius: 12, background: `${O}18`, border: `1px solid ${O}33`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <span style={{ fontSize: 16 }}>🏍️</span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: tk.text, fontFamily: "'DM Sans',sans-serif" }}>
            {activeOrder.status === "processing" ? "Vendor is preparing…" :
             activeOrder.status === "ready"      ? "Order ready — go pick up!" :
             activeOrder.status === "picked_up"  ? "Heading to customer" :
             activeOrder.status === "arriving"   ? "Almost there!" : "Active delivery"}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: O, fontFamily: "'DM Sans',sans-serif" }}>
            Tap to navigate →
          </span>
        </div>
      )}

      {/* ── HOME TAB ── */}
      {tab === 0 && (
        <div style={{ animation: "fadeIn 0.3s both" }}>
          {/* Notification permission banner */}
          {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
            <div style={{ margin: "12px 16px 0", background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.3)", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔔</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: O, fontFamily: "'DM Sans',sans-serif" }}>Enable notifications</div>
                <div style={{ fontSize: 11, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>You'll miss new order alerts without this</div>
              </div>
              <button
                onClick={async () => {
                  const perm = await Notification.requestPermission();
                  if (perm === "denied") alert("Notifications blocked. Go to Chrome Settings → Site Settings → Notifications → allow this site.");
                }}
                style={{ background: O, color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer", flexShrink: 0, fontFamily: "'DM Sans',sans-serif" }}
              >Enable</button>
            </div>
          )}

          <div style={{ padding: "24px 20px 16px" }}>
            <p style={{ fontSize: 13, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>{timeOfDay()} 👋</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: tk.text, letterSpacing: "-0.8px", lineHeight: 1.1 }}>{rider.firstName} {rider.lastName}</h1>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "5px 12px", borderRadius: 20, background: tk.card, border: `1px solid ${tk.cardBorder}`, fontSize: 12, fontWeight: 600, color: tk.textSub, fontFamily: "'DM Sans',sans-serif" }}>
              <RiMapPinLine size={12} /> {rider.city}
              <span style={{ width: 1, height: 10, background: tk.cardBorder, margin: "0 2px" }} />
              <RiMotorbikeLine size={12} /> {VEHICLE_LABELS[rider.vehicleType] || rider.vehicleType}
            </div>
          </div>

          {/* Online toggle */}
          <div onClick={toggleOnline} style={{ margin: "0 20px 20px", borderRadius: 18, padding: "18px 20px", background: rider.isOnline ? `linear-gradient(135deg,${O}18,${O}08)` : tk.card, border: `1px solid ${rider.isOnline ? `${O}33` : tk.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", WebkitTapHighlightColor: "transparent", transition: "all 0.3s" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", marginBottom: 3 }}>Status</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: rider.isOnline ? O : tk.text }}>{rider.isOnline ? "● Online — accepting orders" : "○ Offline"}</div>
            </div>
            <div onClick={e => { e.stopPropagation(); toggleOnline(); }} style={{ width: 52, height: 28, borderRadius: 50, background: rider.isOnline ? O : tk.cardBorder, display: "flex", alignItems: "center", padding: 3, transition: "background 0.3s", cursor: "pointer", flexShrink: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "transform 0.3s", transform: rider.isOnline ? "translateX(24px)" : "translateX(0)", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "0 20px 20px" }}>
            {[
              { val: rider.stats.totalDeliveries, label: "Deliveries" },
              { val: rider.stats.rating > 0 ? rider.stats.rating.toFixed(1) : "—", label: "Rating", color: rider.stats.rating >= 4 ? "#10B981" : undefined },
              { val: `${rider.stats.acceptanceRate}%`, label: "Acceptance" },
            ].map(s => (
              <div key={s.label} style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, padding: "16px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color || tk.text }}>{s.val}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5, fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Earnings card — reads from Firestore ── */}
          <div style={{ margin: "0 20px 20px", borderRadius: 18, background: tk.earningsBg, border: `1px solid ${O}22`, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: tk.textMuted, textTransform: "uppercase" as const, letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", marginBottom: 6 }}>Today's Earnings</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: tk.text, letterSpacing: "-1px" }}>
              <span style={{ fontSize: 18, color: O }}>₦</span>
              {earnings.today.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: tk.textMuted, marginTop: 6, fontFamily: "'DM Sans',sans-serif" }}>
              {earnings.today === 0 ? "Complete deliveries to start earning" : `From ${earnings.orders} delivered order${earnings.orders !== 1 ? "s" : ""}`}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {[
                [fmt(earnings.week),  "This Week"],
                [fmt(earnings.month), "This Month"],
                [String(earnings.orders), "Orders"],
              ].map(([v, l]) => (
                <div key={l} style={{ flex: 1, background: tk.card, border: `1px solid ${tk.cardBorder}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: tk.text }}>{v}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Account Info */}
          <div style={{ padding: "0 20px", marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: tk.textMuted, textTransform: "uppercase" as const, letterSpacing: 1, fontFamily: "'DM Sans',sans-serif" }}>Account Info</p>
          </div>
          <div style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, overflow: "hidden", margin: "0 20px 20px" }}>
            {[
              [<RiShieldCheckLine size={14} color={O} />, "Status", <span style={{ color: "#10B981", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>✓ Approved</span>],
              [<RiMapPinLine size={14} color={O} />, "City", rider.city],
              [<RiMotorbikeLine size={14} color={O} />, "Vehicle", VEHICLE_LABELS[rider.vehicleType] || rider.vehicleType],
              [<RiPhoneLine size={14} color={O} />, "Phone", `+234 ${rider.phone}`],
            ].map(([icon, label, val], i, arr) => (
              <div key={label as string} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${tk.rowBorder}` : "none", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{icon}{label as string}</span>
                {typeof val === "string" ? <span style={{ fontSize: 13, fontWeight: 700, color: tk.text, fontFamily: "'DM Sans',sans-serif" }}>{val}</span> : val}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EARNINGS TAB ── */}
      {tab === 1 && (
        <div style={{ animation: "fadeIn 0.3s both" }}>
          <RiderPayoutsPage />
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 2 && (
        <div style={{ animation: "fadeIn 0.3s both" }}>
          <div style={{ padding: "24px 20px 8px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: tk.text, letterSpacing: "-0.5px" }}>Delivery History</h2>
            <p style={{ fontSize: 13, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>Your accepted, rejected and reassigned orders</p>
          </div>
          <RiderOrderHistory />
        </div>
      )}

      {/* ── SETTINGS / PROFILE TAB — no route, renders inline ── */}
      {tab === 3 && (
        <div style={{ animation: "fadeIn 0.3s both" }}>
          <RiderSettingsTab />
        </div>
      )}

      {/* Incoming order alert */}
      {incomingOrder && (
        <IncomingOrderAlert order={incomingOrder} onDismiss={() => setIncomingOrder(null)} />
      )}

      {/* Active order panel */}
      {activeOrder && !incomingOrder && !showNavMap && (
        <ActiveOrderPanel
          order={activeOrder}
          onUpdateStatus={handleUpdateStatus}
          onNavigate={() => setShowNavMap(true)}
          onDismiss={() => setActiveOrder(null)}
          loading={updatingStatus}
          orderCollection={rider?.currentOrderCollection ?? "orders"}
        />
      )}

      {showNavMap && activeOrder && (
        <RiderNavigationMap
          orderId={activeOrder.orderId}
          orderStatus={activeOrder.status}
          orderCollection={rider?.currentOrderCollection ?? "orders"}
          vendorLat={activeOrder.vendorLat}
          vendorLng={activeOrder.vendorLng}
          vendorName={activeOrder.vendorName}
          destLat={activeOrder.destLat ?? 6.5244}
          destLng={activeOrder.destLng ?? 3.3792}
          destAddress={activeOrder.destAddress}
          onClose={() => setShowNavMap(false)}
          onStatusUpdate={(newStatus) => {
            setShowNavMap(false);
            handleUpdateStatus(newStatus);
          }}
        />
      )}

      <BottomNav activeTab={tab} onTabChange={handleTabChange} />
    </div>
  );
}

// ─── DeliveredPanel ───────────────────────────────────────────────────────────

function DeliveredPanel({ onDismiss }: { onDismiss: () => void }) {
  const [secs, setSecs] = useState(10);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(t); onDismiss(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative", textAlign: "center", padding: "16px 14px", background: "rgba(16,185,129,0.1)", borderRadius: 16, border: "1px solid rgba(16,185,129,0.25)" }}>
      <button onClick={onDismiss} style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#66668a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1 }}>
        ✕
      </button>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, color: "#10B981", marginBottom: 6 }}>Delivered! Great work today.</div>
      <div style={{ fontSize: 12, color: "#44445a", fontWeight: 600 }}>Closing in {secs}s…</div>
    </div>
  );
}

// ─── ActiveOrderPanel ─────────────────────────────────────────────────────────

type ActiveOrderPanelProps = {
  order: ActiveOrder;
  onUpdateStatus: (s: "picked_up" | "arriving" | "delivered") => void;
  onNavigate: () => void;
  onDismiss: () => void;
  orderCollection?: string;
  loading: boolean;
};

const STATUS_NEXT: Record<string, { label: string; next: "picked_up" | "arriving" | "delivered"; emoji: string } | null> = {
  rider_assigned: { label: "Mark as Picked Up", next: "picked_up",  emoji: "📦" },
  processing:     { label: "Mark as Picked Up", next: "picked_up",  emoji: "📦" },
  ready:          { label: "Mark as Picked Up", next: "picked_up",  emoji: "📦" },
  picked_up:      { label: "Mark as Arriving",  next: "arriving",   emoji: "🏍️" },
  arriving:       { label: "Open Nav to Verify Code", next: "delivered", emoji: "🔐" },
  delivered:      null,
};

export function ActiveOrderPanel({ order, onUpdateStatus, onNavigate, onDismiss, orderCollection, loading }: ActiveOrderPanelProps) {
  const next = STATUS_NEXT[order.status];
  const isActiveStage = ["rider_assigned","processing","ready","picked_up","arriving","delivered"].includes(order.status);
  if (!isActiveStage) return null;

  const isWaiting   = order.status === "processing";
  const isReady     = order.status === "ready";
  const isDelivered = order.status === "delivered";
  const isArriving  = order.status === "arriving";

  const showPickupCode = order.riderPickupCode &&
    ["rider_assigned", "processing", "ready"].includes(order.status) &&
    orderCollection !== "deliveryRequests";

  return (
    <>
      <style>{`
        @keyframes aop-in { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes aop-code-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .aop-root {
          position:fixed; bottom:0; left:0; right:0; z-index:200;
          background:#111118; border-top:2px solid rgba(255,107,0,0.3);
          border-radius:24px 24px 0 0;
          padding:16px 16px calc(80px + env(safe-area-inset-bottom,0px)) 16px;
          box-shadow:0 -8px 40px rgba(0,0,0,0.6),0 -2px 0 rgba(255,107,0,0.2);
          animation:aop-in 0.35s cubic-bezier(.34,1.1,.64,1) both;
          display:flex; flex-direction:column; gap:12px;
        }
        .aop-handle { width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.12);margin:0 auto 4px; }
        .aop-btns { display:flex;gap:10px;width:100%; }
        .aop-nav-btn { flex:1;height:56px;border-radius:16px;background:rgba(255,107,0,0.12);border:2px solid rgba(255,107,0,0.4);color:#FF6B00;font-family:'Syne',sans-serif;font-size:14px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-width:0; }
        .aop-nav-btn:active { transform:scale(0.96); }
        .aop-action-btn { flex:2;height:56px;border-radius:16px;border:none;font-family:'Syne',sans-serif;font-size:14px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-width:0; }
        .aop-action-btn:active:not(:disabled) { transform:scale(0.96); }
        .aop-action-btn:disabled { cursor:not-allowed; }
        .aop-pickup-code { padding:12px 14px;border-radius:14px;background:rgba(139,92,246,0.08);border:1.5px solid rgba(139,92,246,0.3);display:flex;align-items:center;justify-content:space-between;gap:12px;animation:aop-code-in .3s ease; }
      `}</style>

      <div className="aop-root">
        <div className="aop-handle" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: O, textTransform: "uppercase" as const, letterSpacing: ".8px", fontFamily: "'DM Sans',sans-serif" }}>Active Delivery</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#eeeef8", fontFamily: "'Syne',sans-serif", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{order.vendorName ?? "Delivery in progress"}</div>
            {order.deliveryFee && order.deliveryFee > 0 && (
              <div style={{ fontSize: 12, color: "#FF9A00", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>Est. earning: ₦{order.deliveryFee.toLocaleString("en-NG")}</div>
            )}
          </div>
          <StatusBadge status={order.status} />
        </div>

        {showPickupCode && (
          <div className="aop-pickup-code">
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#8B5CF6", textTransform: "uppercase" as const, letterSpacing: ".6px", fontFamily: "'DM Sans',sans-serif", marginBottom: 4 }}>Your Pickup Code — show to vendor</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 900, color: "#8B5CF6", letterSpacing: 8 }}>{order.riderPickupCode}</div>
            </div>
            <div style={{ fontSize: 28, flexShrink: 0 }}>🔑</div>
          </div>
        )}

        {isDelivered ? (
          <DeliveredPanel onDismiss={onDismiss} />
        ) : isArriving ? (
          <>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", fontSize: 13, fontWeight: 700, color: "#a78bfa", display: "flex", alignItems: "center", gap: 8 }}>
              🔐 Ask customer for their delivery code — open navigation to verify
            </div>
            <div className="aop-btns">
              <button className="aop-nav-btn" onClick={onNavigate}>🗺️ Navigate</button>
              <button className="aop-action-btn" onClick={onNavigate} style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "#fff", boxShadow: "0 4px 20px rgba(139,92,246,0.4)" }}>
                🔐 Verify Code
              </button>
            </div>
          </>
        ) : (isWaiting || isReady) ? (
          <>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: isReady ? "rgba(16,185,129,0.08)" : "rgba(59,130,246,0.08)", border: `1px solid ${isReady ? "rgba(16,185,129,0.25)" : "rgba(59,130,246,0.2)"}`, color: isReady ? "#10b981" : "#60a5fa", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              {isReady ? "✅ Order ready — head to vendor and pick up" : "⏳ Vendor is preparing the order — wait nearby"}
            </div>
            <div className="aop-btns">
              <button className="aop-nav-btn" onClick={onNavigate}>🗺️ Navigate</button>
              <button className="aop-action-btn" onClick={() => next && onUpdateStatus(next.next)} disabled={loading || isWaiting} style={{ background: isWaiting ? "#1e1e2c" : "linear-gradient(135deg,#FF6B00,#FF9A00)", color: isWaiting ? "#555" : "#fff", boxShadow: isWaiting ? "none" : "0 4px 20px rgba(255,107,0,0.4)" }}>
                {loading ? <Spinner /> : isWaiting ? "Waiting for vendor…" : `${next?.emoji ?? "📦"} ${next?.label ?? "Mark Picked Up"}`}
              </button>
            </div>
          </>
        ) : (
          <div className="aop-btns">
            <button className="aop-nav-btn" onClick={onNavigate}>🗺️ Navigate</button>
            {next && (
              <button className="aop-action-btn" onClick={() => onUpdateStatus(next.next)} disabled={loading} style={{ background: loading ? "#1e1e2c" : "linear-gradient(135deg,#FF6B00,#FF9A00)", color: "#fff", boxShadow: loading ? "none" : "0 4px 20px rgba(255,107,0,0.4)" }}>
                {loading ? <Spinner /> : <>{next.emoji} {next.label}</>}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.7s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    rider_assigned: { label: "Assigned",  color: "#FF6B00", bg: "rgba(255,107,0,0.1)",   border: "rgba(255,107,0,0.3)"   },
    processing:     { label: "Preparing", color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.3)"  },
    ready:          { label: "Ready",     color: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)"  },
    picked_up:      { label: "Picked Up", color: "#FF6B00", bg: "rgba(255,107,0,0.12)",  border: "rgba(255,107,0,0.35)"  },
    arriving:       { label: "Arriving",  color: "#8B5CF6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.35)" },
    delivered:      { label: "Delivered", color: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)"  },
  };
  const s = map[status] ?? { label: status, color: "#FF6B00", bg: "rgba(255,107,0,0.08)", border: "rgba(255,107,0,0.2)" };
  return (
    <div style={{ padding: "5px 12px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 800, fontFamily: "'DM Sans',sans-serif", textTransform: "uppercase" as const, letterSpacing: ".5px" }}>
      {s.label}
    </div>
  );
}

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
`;