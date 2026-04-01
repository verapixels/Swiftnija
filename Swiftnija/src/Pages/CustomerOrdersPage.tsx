// pages/OrdersPage.tsx
// ── Fixes applied:
// 1. Bank transfer → custom popup with Paystack DVA (dedicated virtual account) + countdown
// 2. Money splitting handled inside paystackWebhook after charge.success
// 3. Tracking page shows items ONLY after paymentStatus === "paid"
// 4. Delivery fee default changed to ₦2,000 + calculation fixed (BASE_FEE bumped)

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiShoppingBag, FiShoppingCart, FiMapPin, FiChevronRight,
  FiPackage, FiClock, FiTruck, FiPlus, FiCheck,
  FiCreditCard, FiArrowRight, FiHome, FiBriefcase,
  FiBook, FiArrowLeft, FiStar, FiZap, FiShield,
  FiNavigation, FiX, FiExternalLink,
  FiMinus, FiAlertCircle, FiLock, FiEye, FiEyeOff,
  FiTag, FiChevronDown, FiChevronUp, FiCopy, FiCheckCircle,
} from "react-icons/fi";
import { MdOutlineStorefront, MdDeliveryDining } from "react-icons/md";
import { RiVerifiedBadgeFill, RiBankCardLine } from "react-icons/ri";
import { auth, db } from "../firebase";
import {
  collection, query, where, orderBy, limit, getDocs,
  doc, getDoc, onSnapshot, setDoc, serverTimestamp,
} from "firebase/firestore";
import { useTheme } from "../context/ThemeContext";
import { useCart } from "../context/Cartcontext";
import { PAYSTACK_PUBLIC_KEY } from "../services/paystack";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── Types ────────────────────────────────────────────────────────────────────
type ActiveOrder = {
  id: string;
  status: string;
  paymentStatus?: string;
  vendorName: string;
  total: number;
  items: { name: string; qty: number }[];
  createdAt: any;
};

type CartVendorGroup = {
  vendorId: string;
  vendorName: string;
  vendorVerified?: boolean;
  vendorLogo?: string;
  firstItem: string;
  itemCount: number;
  items: any[];
};

type SavedAddress = {
  id: string;
  label: "Home" | "Work" | "School" | "Church" | "Other";
  address: string;
  landmark?: string;
  isDefault: boolean;
  lat?: number;
  lng?: number;
};

type ShippingMeta = {
  weightKg: number | null;
  sizeCategory: "small" | "medium" | "large" | "extra_large" | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
} | null;

// ── Constants ────────────────────────────────────────────────────────────────
const ACCENT = "#FF6B00";
const ACCENT2 = "#FF9A00";

// FIX 4: Delivery fee constants — BASE_FEE raised, default changed to 2000
const BASE_FEE               = 1_200;   // was 800
const PER_KM                 = 200;
const MIN_FEE                = 2_000;   // was 500 — new default
const MAX_FEE                = 50_000;
const MULTI_VENDOR_SURCHARGE = 500;
const LANDMARK_SURCHARGE     = 600;
const SIZE_MULTIPLIERS: Record<string, number> = {
  small: 1.0, medium: 1.3, large: 1.7, extra_large: 2.5,
};

const STATUS_META: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  pending:        { label: "Order Placed",   color: "#f59e0b", bg: "rgba(245,158,11,.12)",  icon: FiClock },
  confirmed:      { label: "Confirmed",      color: "#3b82f6", bg: "rgba(59,130,246,.12)",  icon: FiCheck },
  finding_rider:  { label: "Finding Rider",  color: "#8b5cf6", bg: "rgba(139,92,246,.12)",  icon: FiNavigation },
  rider_assigned: { label: "Rider Assigned", color: "#FF6B00", bg: "rgba(255,107,0,.12)",   icon: MdDeliveryDining },
  picked_up:      { label: "Picked Up",      color: "#FF6B00", bg: "rgba(255,107,0,.12)",   icon: FiPackage },
  arriving:       { label: "Almost Here!",   color: "#10B981", bg: "rgba(16,185,129,.12)",  icon: FiTruck },
  delivered:      { label: "Delivered",      color: "#10B981", bg: "rgba(16,185,129,.12)",  icon: FiCheck },
};

const LABEL_ICONS: Record<string, any> = {
  Home: FiHome, Work: FiBriefcase, School: FiBook, Church: FiBook, Other: FiMapPin,
};
const LABEL_COLORS: Record<string, string> = {
  Home: "#3b82f6", Work: "#8b5cf6", School: "#10B981", Church: "#f59e0b", Other: ACCENT,
};

const parsePrice = (p: string) => parseFloat(String(p).replace(/[₦,\s]/g, "")) || 0;
const fbFunctions = getFunctions(undefined, "us-central1");

// ── Coord cache ───────────────────────────────────────────────────────────────
const coordCache = new Map<string, any>();

// ── Delivery helpers ──────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function legFee(vLat: number, vLng: number, uLat: number, uLng: number, shipping?: ShippingMeta): number {
  const km = haversineKm(vLat, vLng, uLat, uLng);
  const distanceFee = Math.min(Math.max(Math.round(BASE_FEE + km * PER_KM), MIN_FEE), MAX_FEE);
  const weightKg = shipping?.weightKg ?? 0;
  const weightSurcharge = weightKg > 2 ? (weightKg - 2) * 50 : 0;
  const sizeMultiplier = shipping?.sizeCategory ? (SIZE_MULTIPLIERS[shipping.sizeCategory] ?? 1.0) : 1.0;
  let volumetricFactor = 1.0;
  if (shipping?.lengthCm && shipping?.widthCm && shipping?.heightCm) {
    const vKg = (shipping.lengthCm * shipping.widthCm * shipping.heightCm) / 5000;
    if (vKg > 5) volumetricFactor = 1.0 + (vKg - 5) * 0.04;
  }
  const SIZE_MIN_FEES: Record<string, number> = {
    small: 2_000, medium: 2_500, large: 4_000, extra_large: 10_000,
  };
  const sizeMinFee = shipping?.sizeCategory ? (SIZE_MIN_FEES[shipping.sizeCategory] ?? MIN_FEE) : MIN_FEE;
  const raw = Math.round((distanceFee + weightSurcharge) * sizeMultiplier * volumetricFactor);
  return Math.max(raw, sizeMinFee);
}

function getUserCoords(): Promise<GeolocationCoordinates> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("No geolocation"));
    navigator.geolocation.getCurrentPosition(p => res(p.coords), rej, { timeout: 10_000, maximumAge: 0 });
  });
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> {
  const key = address.toLowerCase().trim();
  if (coordCache.has(key)) {
    const cached = coordCache.get(key);
    return cached ? { ...cached, approximate: cached.approximate ?? false } : null;
  }
  try {
    const fn = httpsCallable<{ address: string }, { lat: number | null; lng: number | null }>(fbFunctions, "mapsForwardGeocode");
    const res = await fn({ address });
    if (res.data.lat !== null && res.data.lng !== null) {
      const result = { lat: res.data.lat, lng: res.data.lng, approximate: false };
      coordCache.set(key, result);
      return result;
    }
  } catch { /* fallback */ }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ng`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), approximate: false };
      coordCache.set(key, result);
      return result;
    }
  } catch { /* give up */ }
  coordCache.set(key, null);
  return null;
}

// ── Theme builder ─────────────────────────────────────────────────────────────
function useColors(dark: boolean) {
  return {
    bg:   dark ? "#09090e" : "#f0f0f8",
    surf: dark ? "#111118" : "#ffffff",
    brd:  dark ? "#1c1c2a" : "#e4e4f0",
    txt:  dark ? "#eeeef8" : "#0f0f1a",
    sub:  dark ? "#606080" : "#7070a0",
    dim:  dark ? "#2a2a3e" : "#d0d0e8",
    inp:  dark ? "#15151f" : "#f5f5ff",
    inpB: dark ? "#22223a" : "#d8d8f0",
    card: dark ? "#13131e" : "#ffffff",
    glow: dark ? "rgba(255,107,0,.18)" : "rgba(255,107,0,.10)",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN OrdersPage
// ══════════════════════════════════════════════════════════════════════════════
export default function OrdersPage() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const navigate = useNavigate();
  const { cart } = useCart();
  const c = useColors(dark);

  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [vendorLogos, setVendorLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    const allIds = cart
      .filter(it => it.vendorId)
      .map(it => it.vendorId as string)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    if (allIds.length === 0) return;
    Promise.all(
      allIds.map(async id => {
        try {
          const snap = await getDoc(doc(db, "vendors", id));
          if (!snap.exists()) return [id, null, null] as const;
          const d = snap.data();
          const name = d.businessName || d.storeName || d.displayName || d.name || null;
          const logo = d.logo || d.logoUrl || d.image || d.avatar || null;
          return [id, name, logo] as const;
        } catch { return [id, null, null] as const; }
      })
    ).then(results => {
      const nameMap: Record<string, string> = {};
      const logoMap: Record<string, string> = {};
      for (const [id, name, logo] of results) {
        if (id && name) nameMap[id] = name;
        if (id && logo) logoMap[id] = logo;
      }
      setResolvedNames(prev => ({ ...prev, ...nameMap }));
      setVendorLogos(prev => ({ ...prev, ...logoMap }));
    });
  }, [cart]);

  const vendorGroups: CartVendorGroup[] = (() => {
    const map = new Map<string, CartVendorGroup>();
    for (const item of cart) {
      const key = item.vendorId || item.vendorName || "_unknown";
      const displayName =
        (item.vendorName && item.vendorName !== "Unknown Store" ? item.vendorName : null) ||
        (item.vendorId ? resolvedNames[item.vendorId] : null) ||
        "Unknown Store";
      const logo = item.vendorId ? vendorLogos[item.vendorId] : undefined;
      if (!map.has(key)) {
        map.set(key, { vendorId: item.vendorId || "", vendorName: displayName, vendorVerified: item.vendorVerified, vendorLogo: logo, firstItem: item.name, itemCount: 0, items: [] });
      } else {
        const g = map.get(key)!;
        if (g.vendorName === "Unknown Store" && displayName !== "Unknown Store") g.vendorName = displayName;
        if (!g.vendorLogo && logo) g.vendorLogo = logo;
      }
      const g = map.get(key)!;
      g.itemCount += item.qty;
      g.items.push(item);
    }
    return [...map.values()];
  })();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setOrdersLoading(false); return; }
    const q = query(collection(db, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(10));
    const unsub = onSnapshot(q, snap => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as ActiveOrder)
        .filter(o => !["delivered", "cancelled"].includes(o.status));
      setActiveOrders(active);
      setOrdersLoading(false);
    });
    return () => unsub();
  }, []);

  const visibleOrders = showAllOrders ? activeOrders : activeOrders.slice(0, 1);

  return (
    <>
      <style>{globalStyles(dark, c)}</style>
      <div className="op-root" style={{ background: c.bg, color: c.txt }}>
        <div className="op-hero" style={{ background: dark ? "#0f0f1a" : "#fff" }}>
          <div className="op-hero-radial" />
          <div className="op-hero-inner">
            <div className="op-hero-eyebrow" style={{ color: ACCENT }}><FiShoppingBag size={13} /><span>SwiftNija</span></div>
            <h1 className="op-hero-title" style={{ color: c.txt }}>Your <span style={{ color: ACCENT }}>Orders</span></h1>
            <p className="op-hero-sub" style={{ color: c.sub }}>Track deliveries &amp; continue shopping</p>
          </div>
          <div className="op-hero-wave" style={{ background: c.bg }} />
        </div>
        <div className="op-body">
          <section className="op-section">
            <div className="op-sec-head">
              <div className="op-sec-pill" style={{ background: dark ? "rgba(255,107,0,.08)" : "rgba(255,107,0,.07)", border: "1px solid rgba(255,107,0,.22)" }}>
                <FiTruck size={12} color={ACCENT} />
                <span style={{ color: ACCENT }}>Track your orders</span>
              </div>
              {activeOrders.length > 1 && (
                <button onClick={() => setShowAllOrders(v => !v)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: ACCENT, fontSize: 12, fontWeight: 800 }}>
                  {showAllOrders ? <><FiChevronUp size={14} /> Show less</> : <><FiChevronDown size={14} /> View all ({activeOrders.length})</>}
                </button>
              )}
            </div>
            {ordersLoading ? (
              <div className="op-skeleton-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
                <div className="op-sk" style={{ width: "60%", height: 14 }} />
                <div className="op-sk" style={{ width: "40%", height: 11, marginTop: 10 }} />
              </div>
            ) : activeOrders.length === 0 ? (
              <div className="op-empty-card" style={{ background: c.surf, border: `1.5px dashed ${c.brd}` }}>
                <div className="op-empty-orb" style={{ background: dark ? "rgba(255,107,0,.05)" : "rgba(255,107,0,.04)" }}>
                  <FiShoppingBag size={30} color={dark ? "#2e2e4a" : "#d8d8ee"} strokeWidth={1.4} />
                </div>
                <p className="op-empty-title" style={{ color: c.txt }}>No active orders</p>
                <p className="op-empty-sub" style={{ color: c.sub }}>Your ongoing deliveries will appear here</p>
              </div>
            ) : (
              <div className="op-order-list">
                {visibleOrders.map((order, i) => {
                  const meta = STATUS_META[order.status] || STATUS_META.pending;
                  const Icon = meta.icon;
                  // FIX 3: Show "Awaiting Payment" badge if not paid yet
                  const isPaid = order.paymentStatus === "paid";
                  return (
                    <div key={order.id} className="op-order-card" style={{ background: c.card, border: `1.5px solid ${c.brd}`, animationDelay: `${i * 0.07}s` }} onClick={() => navigate(`/orders/${order.id}/track`)}>
                      <div className="op-order-stripe" style={{ background: `linear-gradient(180deg,${meta.color},${meta.color}88)` }} />
                      <div className="op-order-body">
                        <div className="op-order-top">
                          <div className="op-order-pill" style={{ background: meta.bg, color: meta.color }}><Icon size={11} /><span>{meta.label}</span></div>
                          <span className="op-order-ref" style={{ color: c.sub }}>#{order.id.slice(-7).toUpperCase()}</span>
                        </div>
                        {!isPaid && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.25)", fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>
                            <FiClock size={10} /> Awaiting payment confirmation
                          </div>
                        )}
                        <div className="op-order-vendor" style={{ color: c.txt }}>{order.vendorName || "Store"}</div>
                        {/* FIX 3: Only show items if payment confirmed */}
                        {isPaid ? (
                          <div className="op-order-items" style={{ color: c.sub }}>
                            {order.items?.slice(0, 2).map((it, j) => (
                              <span key={j}>{it.qty}× {it.name}{j < Math.min(order.items.length, 2) - 1 ? "," : ""} </span>
                            ))}
                            {order.items?.length > 2 && <span>+{order.items.length - 2} more</span>}
                          </div>
                        ) : (
                          <div className="op-order-items" style={{ color: c.sub, fontStyle: "italic" }}>
                            Items visible after payment
                          </div>
                        )}
                        <div className="op-order-foot">
                          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 900, color: ACCENT }}>₦{order.total?.toLocaleString()}</span>
                          <div className="op-track-pill" style={{ background: `${meta.color}18`, color: meta.color }}>Track <FiChevronRight size={12} /></div>
                        </div>
                      </div>
                      {order.status === "finding_rider" && (<div className="op-pulse-row"><span /><span /><span /></div>)}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="op-section">
            <div className="op-sec-head">
              <div className="op-sec-pill" style={{ background: dark ? "rgba(59,130,246,.07)" : "rgba(59,130,246,.05)", border: "1px solid rgba(59,130,246,.2)" }}>
                <FiShoppingCart size={12} color="#3b82f6" />
                <span style={{ color: "#3b82f6" }}>Continue your order</span>
              </div>
            </div>
            {vendorGroups.length === 0 ? (
              <div className="op-empty-card" style={{ background: c.surf, border: `1.5px dashed ${c.brd}` }}>
                <div className="op-empty-orb" style={{ background: dark ? "rgba(59,130,246,.05)" : "rgba(59,130,246,.04)" }}>
                  <FiShoppingCart size={30} color={dark ? "#2e2e4a" : "#d8d8ee"} strokeWidth={1.4} />
                </div>
                <p className="op-empty-title" style={{ color: c.txt }}>No carts yet</p>
                <p className="op-empty-sub" style={{ color: c.sub }}>Add items from stores to build your cart</p>
              </div>
            ) : (
              <div className="op-cart-list">
                {vendorGroups.map((group, i) => {
                  const groupTotal = group.items.reduce((s, it) => s + parsePrice(it.price) * it.qty, 0);
                  const uniqueItems = group.items.filter((it: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.name === it.name) === idx);
                  const cartRoute = `/orders/cart/${group.vendorId || encodeURIComponent(group.vendorName)}`;
                  return (
                    <div key={group.vendorId || i} className="op-cart-card" style={{ background: c.card, border: `1.5px solid ${c.brd}`, animationDelay: `${i * 0.08}s` }} onClick={() => navigate(cartRoute)}>
                      <div className="op-cart-avatar" style={{ background: "rgba(255,107,0,.09)", border: "1.5px solid rgba(255,107,0,.18)", overflow: "hidden" }}>
                        {group.vendorLogo ? <img src={group.vendorLogo} alt={group.vendorName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 14 }} /> : <MdOutlineStorefront size={22} color={ACCENT} />}
                      </div>
                      <div className="op-cart-info">
                        <div className="op-cart-vrow">
                          <span className="op-cart-vname" style={{ color: c.txt }}>{group.vendorName}</span>
                          {group.vendorVerified && <RiVerifiedBadgeFill size={13} color="#3b82f6" />}
                          <span className="op-cart-badge" style={{ background: ACCENT }}>{group.itemCount}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 4 }}>
                          {uniqueItems.slice(0, 2).map((it: any, j: number) => (
                            <div key={j} className="op-cart-item-row" style={{ color: c.sub }}><span style={{ color: ACCENT, fontWeight: 800, fontSize: 11 }}>{it.qty}×</span> {it.name}</div>
                          ))}
                          {uniqueItems.length > 2 && (
                            <button className="op-cart-viewall" style={{ color: ACCENT, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }} onClick={e => { e.stopPropagation(); navigate(cartRoute); }}>
                              + {uniqueItems.length - 2} more item{uniqueItems.length - 2 !== 1 ? "s" : ""} — View all
                            </button>
                          )}
                        </div>
                        <div className="op-cart-total" style={{ color: ACCENT }}>₦{groupTotal.toLocaleString()}</div>
                      </div>
                      <div className="op-cart-continue" style={{ color: ACCENT }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px" }}>Continue</span>
                        <FiArrowRight size={14} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="op-history-card" style={{ background: dark ? "#111118" : "#f5f5ff", border: `1.5px solid ${c.brd}` }} onClick={() => navigate("/profile?tab=history")}>
            <div className="op-history-icon" style={{ background: "rgba(255,107,0,.09)" }}><FiPackage size={18} color={ACCENT} /></div>
            <div style={{ flex: 1 }}>
              <p style={{ color: c.txt, fontWeight: 700, fontSize: 13, margin: 0 }}>Review past orders or reorder?</p>
              <p style={{ color: ACCENT, fontWeight: 800, fontSize: 12, margin: "3px 0 0", display: "flex", alignItems: "center", gap: 4 }}>Check your order history <FiExternalLink size={11} /></p>
            </div>
          </div>
          <div style={{ height: 120 }} />
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR CART PAGE
// ══════════════════════════════════════════════════════════════════════════════
export function VendorCartPage() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const navigate = useNavigate();
  const { cart, addToCart, removeOne } = useCart();
  const c = useColors(dark);

  const vendorId = window.location.pathname.split("/").pop() || "";

  const [vendor, setVendor] = useState<any>(null);
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(null);
  const [showAddressPage, setShowAddressPage] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoErr, setPromoErr] = useState("");
  const [promoData, setPromoData] = useState<{ type: string; value: number } | null>(null);
  // FIX 4: default delivery fee is now 2000
  const [deliveryFee, setDeliveryFee] = useState<number>(2_000);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryBreakdown, setDeliveryBreakdown] = useState<string>("");
  const lastCartSig = useRef<string>("");

  const [allergyNote, setAllergyNote] = useState("");
  const [allergyEditing, setAllergyEditing] = useState(false);

  const vendorCart = cart.filter(it =>
    it.vendorId === vendorId ||
    (!it.vendorId && encodeURIComponent(it.vendorName || "") === vendorId)
  );
  const subtotal = vendorCart.reduce((s, it) => s + parsePrice(it.price) * it.qty, 0);
  const totalItems = vendorCart.reduce((s, it) => s + it.qty, 0);

  const discount = promoApplied && promoData
    ? promoData.type === "percentage" ? Math.round(subtotal * (promoData.value / 100)) : promoData.value
    : 0;
  const total = subtotal > 0 ? subtotal - discount + deliveryFee : 0;

  useEffect(() => {
    if (!vendorId) return;
    (async () => {
      try {
        const vSnap = await getDoc(doc(db, "vendors", vendorId));
        if (vSnap.exists()) setVendor({ id: vendorId, ...vSnap.data() });
        const pSnap = await getDocs(query(collection(db, "products"), where("vendorId", "==", vendorId), limit(6)));
        setFeaturedProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { }
      finally { setLoadingProducts(false); }
    })();
  }, [vendorId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then(snap => {
      if (!snap.exists()) return;
      const addrs: SavedAddress[] = snap.data().savedAddresses ?? [];
      setSavedAddresses(addrs);
      const def = addrs.find(a => a.isDefault);
      if (def) setSelectedAddress(def);
      const note = snap.data().allergiesNote || "";
      if (note) setAllergyNote(note);
    });
  }, []);

  // FIX 4: Compute delivery fee — robust version that always resolves
  const computeDelivery = useCallback(async () => {
    if (vendorCart.length === 0) { setDeliveryFee(0); return; }
    const addrSig = selectedAddress?.id ?? "gps";
    const sig = [vendorCart.map(i => `${i.name}:${i.qty}`).join("|"), addrSig].join("@");
    if (sig === lastCartSig.current) return;
    lastCartSig.current = sig;
    setDeliveryLoading(true);

    try {
      let userLat = 0, userLng = 0, userApprox = false;

      if (selectedAddress?.lat && selectedAddress?.lng) {
        userLat = selectedAddress.lat; userLng = selectedAddress.lng;
      } else if (selectedAddress?.address) {
        const coords = await geocodeAddress(selectedAddress.address);
        if (coords) { userLat = coords.lat; userLng = coords.lng; userApprox = coords.approximate; }
      } else {
        // No saved address — try GPS
        try {
          const pos = await getUserCoords();
          userLat = pos.latitude; userLng = pos.longitude;
        } catch {
          // GPS refused → use default
          setDeliveryFee(MIN_FEE);
          setDeliveryBreakdown("Enable GPS or add address for exact fee");
          setDeliveryLoading(false);
          return;
        }
      }

      if (userLat === 0 && userLng === 0) {
        setDeliveryFee(MIN_FEE);
        setDeliveryBreakdown("Could not locate address — flat fee applied");
        setDeliveryLoading(false);
        return;
      }

      // Resolve vendor coords
      let vendorLat = vendor?.lat, vendorLng = vendor?.lng;
      if ((!vendorLat || !vendorLng) && vendor?.address) {
        const coords = await geocodeAddress([vendor.address, vendor.city, "Nigeria"].filter(Boolean).join(", "));
        if (coords) { vendorLat = coords.lat; vendorLng = coords.lng; }
      }

      if (!vendorLat || !vendorLng) {
        // Vendor has no location — use flat default
        setDeliveryFee(MIN_FEE);
        setDeliveryBreakdown("Vendor location unavailable — flat fee applied");
        setDeliveryLoading(false);
        return;
      }

      const fee = legFee(vendorLat, vendorLng, userLat, userLng, null);
      const km = haversineKm(vendorLat, vendorLng, userLat, userLng);
      let breakdown = "";
      if (userApprox) breakdown = "Estimated — pin your address for precise rate";
      else if (km < 3) breakdown = "Within 3 km";
      else if (km < 7) breakdown = "3 – 7 km away";
      else if (km < 15) breakdown = "7 – 15 km away";
      else breakdown = "15+ km away";

      const finalFee = Math.min(fee + (userApprox ? LANDMARK_SURCHARGE : 0), MAX_FEE);
      setDeliveryFee(Math.max(finalFee, MIN_FEE)); // never below MIN_FEE
      setDeliveryBreakdown(breakdown);
    } catch {
      setDeliveryFee(MIN_FEE);
      setDeliveryBreakdown("Could not calculate — flat fee applied");
    } finally {
      setDeliveryLoading(false);
    }
  }, [vendorCart, selectedAddress, vendor]);

  useEffect(() => {
    lastCartSig.current = "";
    computeDelivery();
  }, [computeDelivery]);

  const handlePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoErr("Enter a promo code"); return; }
    try {
      const snap = await getDocs(query(collection(db, "discounts"), where("code", "==", code), where("status", "==", "active")));
      if (snap.empty) { setPromoErr("Invalid or expired promo code"); setPromoApplied(false); return; }
      const d = snap.docs[0].data();
      const now = new Date();
      if (d.startDate?.toDate() && now < d.startDate.toDate()) { setPromoErr("This promo hasn't started yet"); return; }
      if (d.endDate?.toDate() && now > d.endDate.toDate()) { setPromoErr("This promo has expired"); return; }
      if (d.usageLimit && d.usedCount >= d.usageLimit) { setPromoErr("Promo usage limit reached"); return; }
      if (d.minOrderAmount && subtotal < d.minOrderAmount) { setPromoErr(`Min order ₦${d.minOrderAmount.toLocaleString()} required`); return; }
      setPromoData({ type: d.type, value: d.value });
      setPromoApplied(true);
      setPromoErr("");
    } catch { setPromoErr("Could not validate — try again"); }
  };

  const handleAddFeatured = (p: any) => {
    addToCart({ name: p.name, price: `₦${p.price}`, img: p.images?.[0] || p.image || p.img || "", vendorName: vendor?.businessName || vendor?.storeName || "", vendorId });
    setAddedIds(prev => new Set([...prev, p.id]));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 1800);
  };

  const vendorDisplayName = vendor?.businessName || vendor?.storeName || "Store";
  const vendorLogo = vendor?.logo || vendor?.logoUrl || vendor?.image || vendor?.avatar || null;

  if (showAddressPage) {
    return (
      <AddressPickerPage dark={dark} c={c} savedAddresses={savedAddresses} selectedAddress={selectedAddress}
        onSave={async (addr) => {
          const uid = auth.currentUser?.uid;
          if (uid) {
            let list = savedAddresses.filter(a => a.id !== addr.id);
            if (addr.isDefault) list = list.map(a => ({ ...a, isDefault: false }));
            list = addr.isDefault ? [addr, ...list] : [...list, addr];
            setSavedAddresses(list);
            setSelectedAddress(addr);
            await setDoc(doc(db, "users", uid), { savedAddresses: list, updatedAt: serverTimestamp() }, { merge: true });
          }
          setShowAddressPage(false);
        }}
        onBack={() => setShowAddressPage(false)} />
    );
  }

  if (showPaymentSheet) {
    return (
      <PaymentPage dark={dark} c={c} vendorCart={vendorCart} subtotal={subtotal} discount={discount} deliveryFee={deliveryFee}
        selectedAddress={selectedAddress} vendorId={vendorId} vendorName={vendorDisplayName}
        onBack={() => setShowPaymentSheet(false)}
        onSuccess={(orderId) => { setShowPaymentSheet(false); navigate(`/orders/${orderId}/track`); }} />
    );
  }

  const anyEstimated = deliveryBreakdown.includes("Estimated") || (!!selectedAddress && !selectedAddress.lat);

  return (
    <>
      <style>{globalStyles(dark, c)}</style>
      <div className="vcp-root" style={{ background: c.bg, color: c.txt }}>
        <div className="vcp-header" style={{ background: c.surf, borderBottom: `1px solid ${c.brd}` }}>
          <button className="vcp-back-btn" style={{ color: c.txt }} onClick={() => navigate(-1)}><FiArrowLeft size={20} /></button>
          {vendorLogo && (
            <div style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: `1.5px solid ${c.brd}` }}>
              <img src={vendorLogo} alt={vendorDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: c.txt }}>{vendorDisplayName}</div>
            <div style={{ fontSize: 11, color: c.sub, fontWeight: 600 }}>{totalItems} item{totalItems !== 1 ? "s" : ""} in cart</div>
          </div>
          <div className="vcp-header-badge" style={{ background: "rgba(255,107,0,.1)", color: ACCENT }}><FiShoppingCart size={14} /><span>{totalItems}</span></div>
        </div>

        <div className="vcp-body" style={{ paddingBottom: 160 }}>
          {/* Cart items */}
          <div className="vcp-section-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
            <div className="vcp-card-head" style={{ borderBottom: `1px solid ${c.brd}` }}>
              <FiShoppingCart size={13} color={ACCENT} />
              <span style={{ color: c.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px" }}>Your cart · {vendorDisplayName}</span>
            </div>
            {vendorCart.map(item => (
              <div key={item.name} className="vcp-item" style={{ borderBottom: `1px solid ${c.brd}` }}>
                <div className="vcp-item-thumb" style={{ background: "rgba(255,107,0,.07)" }}>
                  {item.img ? <img src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <FiPackage size={20} color={dark ? "#333" : "#ccc"} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: ACCENT, fontFamily: "'Syne',sans-serif" }}>{item.price}</div>
                </div>
                <div className="vcp-qty-row">
                  <button className="vcp-qty-btn" style={{ color: ACCENT }} onPointerDown={() => removeOne(item.name)}><FiMinus size={12} /></button>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: c.txt, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                  <button className="vcp-qty-btn" style={{ color: ACCENT }} onPointerDown={() => addToCart({ name: item.name, price: item.price, img: item.img, vendorName: item.vendorName, vendorId: item.vendorId })}><FiPlus size={12} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery address */}
          <div className="vcp-section-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
            <div className="vcp-card-head" style={{ borderBottom: `1px solid ${c.brd}` }}>
              <FiMapPin size={13} color={ACCENT} />
              <span style={{ color: c.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px" }}>Delivery address</span>
            </div>
            {selectedAddress ? (
              <div className="vcp-addr-row">
                {(() => { const Icon = LABEL_ICONS[selectedAddress.label] || FiMapPin; const col = LABEL_COLORS[selectedAddress.label] || ACCENT; return (
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: `${col}18`, border: `1.5px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} color={col} />
                  </div>
                ); })()}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: LABEL_COLORS[selectedAddress.label] || ACCENT, textTransform: "uppercase", letterSpacing: ".5px" }}>{selectedAddress.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedAddress.address}</div>
                </div>
                <button className="vcp-change-btn" style={{ color: ACCENT, borderColor: "rgba(255,107,0,.25)", background: "rgba(255,107,0,.07)" }} onClick={() => setShowAddressPage(true)}>Change</button>
              </div>
            ) : (
              <button className="vcp-add-addr" style={{ color: ACCENT, border: `1.5px dashed rgba(255,107,0,.3)`, background: "rgba(255,107,0,.06)" }} onClick={() => setShowAddressPage(true)}>
                <FiPlus size={15} /> Add delivery address
              </button>
            )}
          </div>

          {/* Allergy notes */}
          <div className="vcp-section-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
            <div className="vcp-card-head" style={{ borderBottom: `1px solid ${c.brd}` }}>
              <span style={{ fontSize: 14 }}>🌿</span>
              <span style={{ color: c.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px", flex: 1 }}>Allergies / Special Notes</span>
              <button onClick={() => setAllergyEditing(v => !v)} style={{ border: "none", cursor: "pointer", color: ACCENT, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 8, background: "rgba(255,107,0,.08)" }}>
                {allergyEditing ? "Done" : allergyNote ? "Edit" : "+ Add"}
              </button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {!allergyNote && !allergyEditing && (
                <button onClick={() => setAllergyEditing(true)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, border: `1.5px dashed rgba(255,107,0,.3)`, borderRadius: 13, background: "rgba(255,107,0,.04)", color: ACCENT, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <FiPlus size={14} /> Add allergy or special instruction
                </button>
              )}
              {allergyNote && !allergyEditing && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(255,107,0,.05)", border: "1px solid rgba(255,107,0,.15)", borderRadius: 12, padding: "10px 13px" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>📝</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.txt, lineHeight: 1.5, flex: 1 }}>{allergyNote}</span>
                  <button onClick={() => setAllergyNote("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2, flexShrink: 0 }}><FiX size={13} /></button>
                </div>
              )}
              {allergyEditing && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea value={allergyNote} onChange={e => setAllergyNote(e.target.value)} placeholder="e.g. nut allergy, no onions…" autoFocus rows={3}
                    style={{ width: "100%", background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 12, padding: "10px 13px", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, outline: "none", resize: "none", lineHeight: 1.5 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setAllergyEditing(false)} style={{ flex: 1, background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "white", border: "none", borderRadius: 11, padding: "10px 0", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      <FiCheck size={13} style={{ marginRight: 5 }} /> Save Note
                    </button>
                    <button onClick={() => { setAllergyNote(""); setAllergyEditing(false); }} style={{ padding: "10px 16px", background: "rgba(239,68,68,.08)", border: "1.5px solid rgba(239,68,68,.2)", borderRadius: 11, color: "#ef4444", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clear</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="vcp-section-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
            <div className="vcp-card-head" style={{ borderBottom: `1px solid ${c.brd}` }}>
              <FiTag size={13} color={ACCENT} />
              <span style={{ color: c.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px" }}>Order Summary</span>
            </div>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${c.brd}` }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1, background: c.inp, border: `1.5px solid ${promoApplied ? "#22c55e" : c.inpB}`, borderRadius: 12, padding: "10px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: c.txt, outline: "none" }}
                  placeholder="Enter promo code" value={promoCode}
                  onChange={e => { setPromoCode(e.target.value); setPromoErr(""); if (promoApplied) { setPromoApplied(false); setPromoData(null); } }}
                  disabled={promoApplied} />
                {promoApplied
                  ? <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#22c55e", fontWeight: 700, fontSize: 12, padding: "0 8px" }}><FiCheck size={14} /> Applied!</div>
                  : <button onClick={handlePromo} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 12, padding: "10px 16px", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Apply</button>}
              </div>
              {promoErr && <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, marginTop: 6 }}>✕ {promoErr}</div>}
            </div>
            <div style={{ padding: "4px 16px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${c.brd}` }}>
                <span style={{ fontSize: 13, color: c.sub, fontWeight: 600 }}>Subtotal ({totalItems} item{totalItems !== 1 ? "s" : ""})</span>
                <span style={{ fontSize: 13, color: c.txt, fontWeight: 700 }}>₦{subtotal.toLocaleString()}</span>
              </div>
              {promoApplied && discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${c.brd}` }}>
                  <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>Discount ({promoData?.type === "percentage" ? `${promoData.value}%` : "fixed"})</span>
                  <span style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>−₦{discount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: `1px solid ${c.brd}` }}>
                <div>
                  <div style={{ fontSize: 13, color: c.sub, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <FiMapPin size={11} color={ACCENT} /> Delivery fee
                    {anyEstimated && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, background: "rgba(245,158,11,.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.25)" }}>~est</span>}
                  </div>
                  {deliveryBreakdown && !deliveryLoading && <div style={{ fontSize: 10.5, color: c.sub, fontWeight: 600, marginTop: 2 }}>{deliveryBreakdown}</div>}
                </div>
                <span style={{ fontSize: 13, color: c.txt, fontWeight: 700, flexShrink: 0 }}>
                  {deliveryLoading ? <span style={{ display: "inline-block", animation: "vcp-spin .7s linear infinite" }}>⟳</span> : deliveryFee > 0 ? `₦${deliveryFee.toLocaleString()}` : "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: c.txt }}>Total</span>
                <div style={{ textAlign: "right" }}>
                  {promoApplied && discount > 0 && <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, textDecoration: "line-through", marginBottom: 1 }}>₦{(subtotal + deliveryFee).toLocaleString()}</div>}
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Featured products */}
          {featuredProducts.length > 0 && (
            <>
              <div className="vcp-feat-label" style={{ color: c.sub }}><FiStar size={12} color={ACCENT} /><span>More from {vendorDisplayName}</span></div>
              <div className="vcp-feat-grid">
                {loadingProducts ? [0, 1, 2].map(i => (
                  <div key={i} className="vcp-feat-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
                    <div className="op-sk" style={{ height: 90, borderRadius: "12px 12px 0 0" }} />
                    <div style={{ padding: "10px 12px" }}><div className="op-sk" style={{ width: "70%", height: 10 }} /><div className="op-sk" style={{ width: "45%", height: 9, marginTop: 6 }} /></div>
                  </div>
                )) : featuredProducts.slice(0, 3).map(p => (
                  <div key={p.id} className="vcp-feat-card" style={{ background: c.surf, border: `1.5px solid ${c.brd}` }}>
                    <div className="vcp-feat-img" style={{ background: "rgba(255,107,0,.06)" }}>
                      {(p.images?.[0] || p.image || p.img) ? <img src={p.images?.[0] || p.image || p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <FiPackage size={22} color={dark ? "#333" : "#ccc"} />}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{p.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: ACCENT, marginBottom: 8, fontFamily: "'Syne',sans-serif" }}>₦{Number(String(p.price).replace(/[^0-9.]/g, "")).toLocaleString()}</div>
                      <button className={`vcp-feat-add ${addedIds.has(p.id) ? "added" : ""}`} onClick={() => handleAddFeatured(p)} style={{ background: addedIds.has(p.id) ? "#10B981" : ACCENT }}>
                        {addedIds.has(p.id) ? <FiCheck size={12} /> : <FiPlus size={12} />}{addedIds.has(p.id) ? "Added!" : "Add"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {featuredProducts.length > 3 && (
                <button className="vcp-view-more" style={{ background: dark ? "rgba(255,107,0,.07)" : "rgba(255,107,0,.05)", border: `1.5px solid rgba(255,107,0,.22)`, color: ACCENT }} onClick={() => navigate(`/store/${vendorId}`)}>
                  <MdOutlineStorefront size={15} /> View full store
                </button>
              )}
            </>
          )}
          <div style={{ height: 20 }} />
        </div>

        {/* Sticky pay bar */}
        <div className="vcp-sticky-bar" style={{ background: dark ? "#0a0a0f" : "#f0f0f8", borderTop: `1.5px solid ${c.brd}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".5px", lineHeight: 1 }}>{vendorDisplayName}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: ACCENT, lineHeight: 1.1, marginTop: 3 }}>₦{total.toLocaleString()}</div>
            {promoApplied && discount > 0 && <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, marginTop: 1 }}>You save ₦{discount.toLocaleString()}!</div>}
          </div>
          <button className="vcp-pay-btn-sticky" disabled={vendorCart.length === 0} onClick={() => setShowPaymentSheet(true)}>
            <FiZap size={16} />Continue to Pay<FiArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADDRESS PICKER PAGE (unchanged)
// ══════════════════════════════════════════════════════════════════════════════
function AddressPickerPage({ dark, c, savedAddresses, selectedAddress, onSave, onBack }: {
  dark: boolean; c: any; savedAddresses: SavedAddress[]; selectedAddress: SavedAddress | null;
  onSave: (addr: SavedAddress) => Promise<void>; onBack: () => void;
}) {
  const LABELS: SavedAddress["label"][] = ["Home", "Work", "School", "Church", "Other"];
  const [step, setStep] = useState<"list" | "add">("list");
  const [label, setLabel] = useState<SavedAddress["label"]>("Home");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!address.trim()) return;
    setSaving(true);
    await onSave({ id: Date.now().toString(), label, address: address.trim(), landmark: landmark.trim() || undefined, isDefault, lat: undefined, lng: undefined });
    setSaving(false);
  };

  return (
    <>
      <style>{globalStyles(dark, c)}</style>
      <div style={{ minHeight: "100vh", background: c.bg, color: c.txt, fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ background: c.surf, borderBottom: `1px solid ${c.brd}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
          <button style={{ background: "transparent", border: "none", cursor: "pointer", color: c.txt, display: "flex", alignItems: "center", width: 38, height: 38, borderRadius: 11, justifyContent: "center" }} onClick={step === "add" ? () => setStep("list") : onBack}><FiArrowLeft size={20} /></button>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: c.txt }}>{step === "list" ? "Choose Delivery Address" : "Add New Address"}</span>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, margin: "0 auto" }}>
          {step === "list" ? (
            <>
              <div className="ap-addr-option" style={{ background: c.surf, border: `1.5px solid ${!selectedAddress ? ACCENT : c.brd}`, boxShadow: !selectedAddress ? `0 0 0 3px rgba(255,107,0,.1)` : "none" }} onClick={() => onSave({ id: "gps", label: "Other", address: "GPS location", isDefault: false })}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(255,107,0,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><FiNavigation size={18} color={ACCENT} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.txt }}>Use current GPS location</div>
                  <div style={{ fontSize: 11, color: c.sub, fontWeight: 600 }}>Auto-detect where I am</div>
                </div>
                {!selectedAddress && <FiCheck size={16} color={ACCENT} />}
              </div>
              {savedAddresses.map(addr => {
                const Icon = LABEL_ICONS[addr.label] || FiMapPin;
                const col = LABEL_COLORS[addr.label] || ACCENT;
                const isActive = selectedAddress?.id === addr.id;
                return (
                  <div key={addr.id} className="ap-addr-option" style={{ background: c.surf, border: `1.5px solid ${isActive ? ACCENT : c.brd}`, boxShadow: isActive ? `0 0 0 3px rgba(255,107,0,.1)` : "none" }} onClick={() => onSave(addr)}>
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: `${col}18`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={col} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: col, textTransform: "uppercase" }}>{addr.label}</span>
                        {addr.isDefault && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: `${ACCENT}18`, color: ACCENT }}>Default</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr.address}</div>
                    </div>
                    {isActive && <FiCheck size={16} color={ACCENT} />}
                  </div>
                );
              })}
              <button onClick={() => setStep("add")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(255,107,0,.07)", border: `1.5px dashed rgba(255,107,0,.28)`, borderRadius: 16, padding: 15, color: ACCENT, fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" }}>
                <FiPlus size={16} /> Add new address
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {LABELS.map(lb => {
                  const Icon = LABEL_ICONS[lb] || FiMapPin;
                  const col = LABEL_COLORS[lb] || ACCENT;
                  const active = label === lb;
                  return (
                    <button key={lb} onClick={() => setLabel(lb)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${active ? col : c.brd}`, background: active ? `${col}18` : "transparent", color: active ? col : c.sub, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>
                      <Icon size={13} /> {lb}
                    </button>
                  );
                })}
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", display: "block", marginBottom: 6 }}>Street Address</label>
                <div style={{ display: "flex", alignItems: "center", gap: 9, background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 13, padding: "11px 14px" }}>
                  <FiMapPin size={14} color={c.sub} />
                  <input style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600 }} placeholder="e.g. 12 Adeola Odeku Street, VI" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", display: "block", marginBottom: 6 }}>Nearest Landmark <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
                <div style={{ display: "flex", alignItems: "center", gap: 9, background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 13, padding: "11px 14px" }}>
                  <FiAlertCircle size={14} color={c.sub} />
                  <input style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600 }} placeholder="e.g. Opposite First Bank" value={landmark} onChange={e => setLandmark(e.target.value)} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div onClick={() => setIsDefault(v => !v)} style={{ width: 21, height: 21, borderRadius: 6, border: `2px solid ${isDefault ? ACCENT : c.dim}`, background: isDefault ? "rgba(255,107,0,.14)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isDefault && <FiCheck size={13} color={ACCENT} />}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: c.txt }}>Set as default address</span>
              </label>
              <button onClick={handleSave} disabled={!address.trim() || saving}
                style={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "white", border: "none", borderRadius: 14, padding: 16, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, cursor: address.trim() && !saving ? "pointer" : "not-allowed", opacity: address.trim() && !saving ? 1 : .5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 22px rgba(255,107,0,.3)" }}>
                {saving ? <><span className="mini-spin" /> Saving...</> : <><FiCheck size={16} /> Save &amp; Use This Address</>}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FIX 1: BANK TRANSFER POPUP — custom DVA modal instead of Paystack iframe
// ══════════════════════════════════════════════════════════════════════════════
interface BankTransferPopupProps {
  dark: boolean;
  c: any;
  total: number;
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function BankTransferPopup({ dark, c, total, orderId, onClose, onSuccess }: BankTransferPopupProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountDetails, setAccountDetails] = useState<{
    account_number: string;
    bank: string;
    account_name: string;
    expires_at: number; // unix ms
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request a Paystack DVA (dedicated virtual account) for this transaction
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const fn = httpsCallable(fbFunctions, "paystackCreateDVA");
        const res = await fn({ orderId, amountKobo: total * 100 }) as any;
        if (cancelled) return;
        const data = res.data;
        const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min
        setAccountDetails({
          account_number: data.account_number,
          bank: data.bank_name ?? data.bank ?? "Paystack Bank",
          account_name: data.account_name ?? "Swift9ja",
          expires_at: expiresAt,
        });
        setSecondsLeft(30 * 60);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not generate account number");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, total]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [secondsLeft]);

  // Poll Firestore every 5s to check if payment came in
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        if (snap.exists() && snap.data().paymentStatus === "paid") {
          clearInterval(interval);
          onSuccess();
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [orderId, onSuccess]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timerStr = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const urgency = secondsLeft < 300; // last 5 min

  const copyAcct = () => {
    if (!accountDetails) return;
    navigator.clipboard.writeText(accountDetails.account_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const checkNow = async () => {
    setCheckingPayment(true);
    try {
      const snap = await getDoc(doc(db, "orders", orderId));
      if (snap.exists() && snap.data().paymentStatus === "paid") {
        onSuccess();
      } else {
        alert("Payment not confirmed yet. Please complete the transfer and try again in a moment.");
      }
    } catch { alert("Could not check payment status — try again."); }
    finally { setCheckingPayment(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 480, background: dark ? "#0e0e18" : "#fff", borderRadius: "24px 24px 0 0", padding: "0 0 40px", boxShadow: "0 -20px 60px rgba(0,0,0,.4)", animation: "op-in .3s ease" }}>

        {/* Handle + header */}
        <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 0" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: dark ? "#2a2a3a" : "#e0e0f0" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 0" }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 18, color: dark ? "#eeeef8" : "#0f0f1a" }}>Pay with Bank Transfer</div>
            <div style={{ fontSize: 12, color: dark ? "#606080" : "#7070a0", fontWeight: 600, marginTop: 2 }}>Powered by Paystack</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: dark ? "#1a1a28" : "#f0f0f8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: dark ? "#eeeef8" : "#0f0f1a" }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Paystack branding strip */}
        <div style={{ margin: "16px 20px 0", padding: "10px 16px", borderRadius: 12, background: "linear-gradient(135deg,rgba(0,128,0,.08),rgba(0,128,0,.04))", border: "1px solid rgba(0,128,0,.18)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#00c853", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FiShield size={16} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#00c853" }}>Secured by Paystack</div>
            <div style={{ fontSize: 10, color: dark ? "#606080" : "#9090b0", fontWeight: 600 }}>256-bit encrypted · Bank-grade security</div>
          </div>
        </div>

        <div style={{ padding: "16px 20px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid rgba(255,107,0,.2)`, borderTop: `3px solid ${ACCENT}`, animation: "op-spin .8s linear infinite" }} />
              <div style={{ fontSize: 13, color: dark ? "#606080" : "#9090b0", fontWeight: 600 }}>Generating your account number…</div>
            </div>
          ) : error ? (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>
              <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 12, background: ACCENT, color: "white", border: "none", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Try Another Method</button>
            </div>
          ) : accountDetails ? (
            <>
              {/* Amount to pay */}
              <div style={{ textAlign: "center", margin: "0 0 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: dark ? "#606080" : "#9090b0", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 4 }}>Amount to Pay</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 32, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: dark ? "#606080" : "#9090b0", fontWeight: 600, marginTop: 2 }}>Transfer exactly this amount to confirm your order</div>
              </div>

              {/* Account details card */}
              <div style={{ background: dark ? "#13131e" : "#f8f8ff", border: `1.5px solid ${dark ? "#1c1c2a" : "#e0e0f0"}`, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
                {/* Bank name */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${dark ? "#1c1c2a" : "#e0e0f0"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: dark ? "#606080" : "#9090b0", textTransform: "uppercase", letterSpacing: ".6px" }}>Bank Name</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#eeeef8" : "#0f0f1a" }}>{accountDetails.bank}</span>
                </div>
                {/* Account number — large + copy */}
                <div style={{ padding: "16px", borderBottom: `1px solid ${dark ? "#1c1c2a" : "#e0e0f0"}` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: dark ? "#606080" : "#9090b0", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>Account Number</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: ACCENT, letterSpacing: 4 }}>{accountDetails.account_number}</span>
                    <button onClick={copyAcct} style={{ width: 40, height: 40, borderRadius: 12, border: `1.5px solid rgba(255,107,0,.3)`, background: "rgba(255,107,0,.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, flexShrink: 0, transition: "all .2s" }}>
                      {copied ? <FiCheckCircle size={18} /> : <FiCopy size={18} />}
                    </button>
                  </div>
                  {copied && <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, marginTop: 4 }}>✓ Copied to clipboard!</div>}
                </div>
                {/* Account name */}
                <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: dark ? "#606080" : "#9090b0", textTransform: "uppercase", letterSpacing: ".6px" }}>Account Name</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "#eeeef8" : "#0f0f1a" }}>{accountDetails.account_name}</span>
                </div>
              </div>

              {/* Countdown */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: urgency ? "rgba(239,68,68,.08)" : "rgba(245,158,11,.07)", border: `1px solid ${urgency ? "rgba(239,68,68,.25)" : "rgba(245,158,11,.25)"}`, marginBottom: 16 }}>
                <FiClock size={14} color={urgency ? "#ef4444" : "#f59e0b"} />
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: urgency ? "#ef4444" : "#f59e0b" }}>
                    Account valid for{" "}
                  </span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: urgency ? "#ef4444" : "#f59e0b" }}>{timerStr}</span>
                  <span style={{ fontSize: 11, color: dark ? "#606080" : "#9090b0", marginLeft: 6, fontWeight: 600 }}>minutes</span>
                </div>
              </div>

              {/* CTA */}
              <button onClick={checkNow} disabled={checkingPayment}
                style={{ width: "100%", padding: "15px", borderRadius: 16, background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "white", border: "none", fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, cursor: checkingPayment ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 24px rgba(255,107,0,.35)", opacity: checkingPayment ? .7 : 1 }}>
                {checkingPayment ? <><span className="mini-spin" />Checking Payment…</> : <><FiCheckCircle size={18} />I've Made the Transfer</>}
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: dark ? "#606080" : "#9090b0", fontWeight: 600, marginTop: 10 }}>
                Payment is automatically detected — this button speeds up confirmation
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT PAGE — FIX 1: bank transfer opens custom DVA popup
// ══════════════════════════════════════════════════════════════════════════════
function PaymentPage({ dark, c, vendorCart, subtotal, discount, deliveryFee, selectedAddress, vendorId, vendorName, onBack, onSuccess }: {
  dark: boolean; c: any; vendorCart: any[]; subtotal: number;
  discount: number; deliveryFee: number;
  selectedAddress: SavedAddress | null;
  vendorId: string; vendorName: string;
  onBack: () => void;
  onSuccess: (orderId: string) => void;
}) {
  const [method, setMethod] = useState<"bank" | "card" | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  // FIX 1: bank transfer modal state
  const [showBankModal, setShowBankModal] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const total = subtotal - discount + deliveryFee;

  const fmtCard = (v: string) => v.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
  const fmtExp = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

  // Create the order doc in Firestore, then decide which payment to show
  const createOrder = async (): Promise<string> => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Please log in");
    let email = auth.currentUser?.email ?? "";
    if (!email) {
      const snap = await getDoc(doc(db, "users", uid));
      email = (snap.data()?.email as string) ?? "";
    }
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();
    const orderId = `SWIFT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const customerPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    let subaccount: string | undefined;
    if (vendorId) {
      try { const vs = await getDoc(doc(db, "vendors", vendorId)); subaccount = vs.data()?.bankAccount?.subaccount_code; } catch {}
    }

    await setDoc(doc(db, "orders", orderId), {
      orderId, userId: uid,
      customerName: userData?.fullName || auth.currentUser?.displayName || "Customer",
      customerEmail: email, customerPhone: userData?.phone || "",
      vendorId, vendorName,
      items: vendorCart.map(i => ({ name: i.name, qty: i.qty, price: parsePrice(i.price), img: i.img || "", vendorName: i.vendorName || "", vendorId: i.vendorId || "" })),
      subtotal, deliveryFee, discount, total,
      deliveryAddress: selectedAddress?.address || "GPS location",
      deliveryLabel: selectedAddress?.label || "GPS",
      paymentMethod: method === "bank" ? "bank_transfer" : "card",
      customerPickupCode,
      paymentStatus: "pending",
      status: "pending",
      vendorSubaccountCode: subaccount || null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });

    return orderId;
  };

  // FIX 1: Bank transfer → create order → show DVA modal
  const handleBankTransfer = async () => {
    setProcessing(true);
    try {
      const orderId = await createOrder();
      setPendingOrderId(orderId);
      setShowBankModal(true);
    } catch (e: any) {
      alert("Error: " + (e?.message || String(e)));
    } finally {
      setProcessing(false);
    }
  };

  // Card → Paystack popup (existing flow)
  const openPaystack = async () => {
    setProcessing(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) { alert("Please log in"); setProcessing(false); return; }
      let email = auth.currentUser?.email ?? "";
      if (!email) { const snap = await getDoc(doc(db, "users", uid)); email = (snap.data()?.email as string) ?? ""; }

      if (!window.PaystackPop) {
        await new Promise<void>((res, rej) => {
          if (document.getElementById("paystack-js")) { res(); return; }
          const s = document.createElement("script");
          s.id = "paystack-js"; s.src = "https://js.paystack.co/v1/inline.js";
          s.onload = () => res(); s.onerror = () => rej(new Error("Paystack load failed"));
          document.head.appendChild(s);
        });
        await new Promise(r => setTimeout(r, 200));
      }

      const orderId = await createOrder();

      const initFn = httpsCallable(fbFunctions, "paystackInitializeOrderPayment");
      const initRes = await initFn({ orderId, amountKobo: total * 100 }) as any;

      window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY, email, amount: total * 100, currency: "NGN",
        ref: initRes.data.reference,
        metadata: { orderId, delivery_address: selectedAddress?.address ?? "GPS" },
        onSuccess: () => { setProcessing(false); onSuccess(orderId); },
        onCancel: () => setProcessing(false),
      }).openIframe();
    } catch (e: any) {
      alert("Payment error: " + (e?.message || String(e)));
      setProcessing(false);
    }
  };

  const handlePay = () => {
    if (method === "bank") handleBankTransfer();
    else if (method === "card") openPaystack();
  };

  return (
    <>
      <style>{globalStyles(dark, c)}</style>
      {/* FIX 1: Show DVA bank transfer modal */}
      {showBankModal && pendingOrderId && (
        <BankTransferPopup
          dark={dark} c={c}
          total={total}
          orderId={pendingOrderId}
          onClose={() => { setShowBankModal(false); }}
          onSuccess={() => { setShowBankModal(false); onSuccess(pendingOrderId); }}
        />
      )}

      <div style={{ minHeight: "100vh", background: c.bg, color: c.txt, fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ background: c.surf, borderBottom: `1px solid ${c.brd}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: c.txt, display: "flex", alignItems: "center" }}><FiArrowLeft size={20} /></button>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: c.txt }}>Checkout</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#10B981" }}><FiLock size={12} /> Secure</div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, margin: "0 auto" }}>
          {/* Order summary */}
          <div style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 20, overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: `1px solid ${c.brd}` }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".7px" }}>Order Summary</span>
            </div>
            <div style={{ padding: "0 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${c.brd}`, fontSize: 13, color: c.sub, fontWeight: 600 }}>
                <span>Subtotal ({vendorCart.reduce((s, i) => s + i.qty, 0)} items)</span>
                <span style={{ color: c.txt, fontWeight: 700 }}>₦{subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${c.brd}`, fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
                  <span>Discount</span><span style={{ fontWeight: 700 }}>−₦{discount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${c.brd}`, fontSize: 13, color: c.sub, fontWeight: 600 }}>
                <span>Delivery fee</span><span style={{ color: c.txt, fontWeight: 700 }}>₦{deliveryFee.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: c.txt }}>Total</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".8px", paddingLeft: 2 }}>Choose payment method</div>

          {/* Bank Transfer option */}
          <div className="pay-method" style={{ background: c.surf, border: `1.5px solid ${method === "bank" ? ACCENT : c.brd}`, borderRadius: 18, padding: 16, cursor: "pointer", boxShadow: method === "bank" ? `0 0 0 3px rgba(255,107,0,.1)` : "none", transition: "all .2s" }} onClick={() => setMethod("bank")}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: method === "bank" ? "rgba(255,107,0,.11)" : c.inp, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s" }}>
                <RiBankCardLine size={22} color={method === "bank" ? ACCENT : c.sub} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.txt }}>Bank Transfer</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: c.sub }}>Get a virtual account — transfer to confirm</div>
              </div>
              <div className="pay-radio" style={{ marginLeft: "auto", borderColor: method === "bank" ? ACCENT : c.dim }}>{method === "bank" && <div className="pay-radio-dot" />}</div>
            </div>
          </div>

          {/* Card */}
          <div className="pay-method" style={{ background: c.surf, border: `1.5px solid ${method === "card" ? ACCENT : c.brd}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", boxShadow: method === "card" ? `0 0 0 3px rgba(255,107,0,.1)` : "none", transition: "all .2s" }} onClick={() => setMethod("card")}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: method === "card" ? "rgba(255,107,0,.11)" : c.inp, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s" }}>
                <FiCreditCard size={20} color={method === "card" ? ACCENT : c.sub} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.txt }}>Debit / Credit Card</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: c.sub }}>Visa · Mastercard · Verve</div>
              </div>
              <div className="pay-radio" style={{ marginLeft: "auto", borderColor: method === "card" ? ACCENT : c.dim }}>{method === "card" && <div className="pay-radio-dot" />}</div>
            </div>
            {method === "card" && (
              <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${c.brd}`, display: "flex", flexDirection: "column", gap: 10 }} onClick={e => e.stopPropagation()}>
                <CardField label="Cardholder Name" placeholder="John Doe" value={cardName} onChange={setCardName} c={c} icon={<FiShield size={14} color={c.sub} />} />
                <CardField label="Card Number" placeholder="0000 0000 0000 0000" value={cardNum} onChange={(v: string) => setCardNum(fmtCard(v))} c={c} icon={<FiCreditCard size={14} color={c.sub} />} maxLength={19} inputMode="numeric" />
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><CardField label="Expiry" placeholder="MM/YY" value={cardExp} onChange={(v: string) => setCardExp(fmtExp(v))} c={c} maxLength={5} inputMode="numeric" /></div>
                  <div style={{ flex: 1 }}><CardField label="CVV" placeholder="•••" value={cardCvv} onChange={(v: string) => setCardCvv(v.replace(/\D/g, "").slice(0, 4))} c={c} maxLength={4} isSecret={!showCvv} inputMode="numeric"
                    suffix={<button onClick={() => setShowCvv(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: c.sub, display: "flex", padding: 0 }}>{showCvv ? <FiEyeOff size={14} /> : <FiEye size={14} />}</button>} /></div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <div onClick={() => setSaveCard(v => !v)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${saveCard ? ACCENT : c.dim}`, background: saveCard ? "rgba(255,107,0,.12)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {saveCard && <FiCheck size={12} color={ACCENT} />}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.sub }}>Save card for future payments</span>
                </label>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: c.sub, fontSize: 11, fontWeight: 600 }}>
            <FiShield size={12} color={ACCENT} /> Secured by Paystack · End-to-end encrypted
          </div>

          {method && (
            <button onClick={handlePay} disabled={processing}
              style={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "white", border: "none", borderRadius: 18, padding: "17px 24px", fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, cursor: processing ? "not-allowed" : "pointer", opacity: processing ? .7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 28px rgba(255,107,0,.35)", transition: "transform .2s,box-shadow .2s", width: "100%" }}>
              {processing ? <><span className="mini-spin" /> Processing…</> : <><FiZap size={18} /> {method === "bank" ? "Generate Account Number" : `Pay ₦${total.toLocaleString()} Now`} <FiArrowRight size={18} /></>}
            </button>
          )}
          <div style={{ height: 50 }} />
        </div>
      </div>
    </>
  );
}

// ── Card field helper ──────────────────────────────────────────────────────────
interface CardFieldProps {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; c: Record<string, string>;
  icon?: React.ReactNode; suffix?: React.ReactNode;
  maxLength?: number; isSecret?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}
function CardField({ label, placeholder, value, onChange, c, icon, maxLength, isSecret, inputMode, suffix }: CardFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 12, padding: "10px 13px" }}>
        {icon}
        <input type={isSecret ? "password" : "text"} inputMode={inputMode || "text"}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600 }}
          placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} />
        {suffix}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ══════════════════════════════════════════════════════════════════════════════
function globalStyles(dark: boolean, c: any) {
  const sk = dark ? "#1c1c2a" : "#e8e8f4";
  const sk2 = dark ? "#252538" : "#f0f0fa";
  return `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
button{font-family:'DM Sans',sans-serif;}
.op-root{min-height:100vh;font-family:'DM Sans',sans-serif;padding-bottom:120px;}
.op-hero{position:relative;padding:52px 20px 60px;overflow:hidden;}
.op-hero-radial{position:absolute;inset:0;background:radial-gradient(ellipse 90% 70% at 50% -10%, rgba(255,107,0,.2) 0%, transparent 65%);pointer-events:none;}
.op-hero-inner{position:relative;z-index:2;}
.op-hero-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;}
.op-hero-title{font-family:'Syne',sans-serif;font-size:clamp(34px,9vw,48px);font-weight:900;letter-spacing:-2px;line-height:1.05;margin-bottom:6px;}
.op-hero-sub{font-size:14px;font-weight:600;opacity:.8;}
.op-hero-wave{position:absolute;bottom:-28px;left:0;right:0;height:60px;clip-path:ellipse(56% 60px at 50% 0%);z-index:3;}
.op-body{padding:44px 16px 0;max-width:620px;margin:0 auto;display:flex;flex-direction:column;gap:28px;}
.op-section{display:flex;flex-direction:column;gap:12px;}
.op-sec-head{display:flex;align-items:center;}
.op-sec-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;}
.op-empty-card{border-radius:22px;padding:40px 20px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;}
.op-empty-orb{width:76px;height:76px;border-radius:24px;display:flex;align-items:center;justify-content:center;margin-bottom:4px;}
.op-empty-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;}
.op-empty-sub{font-size:13px;font-weight:600;opacity:.7;}
.op-skeleton-card{border-radius:20px;padding:24px;}
.op-sk{border-radius:8px;background:linear-gradient(90deg,${sk} 25%,${sk2} 50%,${sk} 75%);background-size:200% 100%;animation:op-shimmer 1.4s infinite;display:block;}
@keyframes op-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.op-order-list{display:flex;flex-direction:column;gap:10px;}
.op-order-card{border-radius:20px;overflow:hidden;display:flex;cursor:pointer;position:relative;transition:transform .2s,box-shadow .2s;animation:op-in .42s ease both;}
.op-order-card:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(0,0,0,.16);}
.op-order-stripe{width:5px;flex-shrink:0;}
.op-order-body{flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:8px;}
.op-order-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.op-order-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;}
.op-order-ref{font-size:11px;font-weight:700;}
.op-order-vendor{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;}
.op-order-items{font-size:12px;font-weight:600;}
.op-order-foot{display:flex;align-items:center;justify-content:space-between;}
.op-track-pill{display:flex;align-items:center;gap:4px;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:800;}
.op-pulse-row{position:absolute;bottom:10px;right:14px;display:flex;gap:4px;align-items:center;}
.op-pulse-row span{width:5px;height:5px;border-radius:50%;background:${ACCENT};display:inline-block;}
.op-pulse-row span:nth-child(1){animation:op-dot .9s 0s infinite ease-in-out;}
.op-pulse-row span:nth-child(2){animation:op-dot .9s .18s infinite ease-in-out;}
.op-pulse-row span:nth-child(3){animation:op-dot .9s .36s infinite ease-in-out;}
@keyframes op-dot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
.op-cart-list{display:flex;flex-direction:column;gap:10px;}
.op-cart-card{border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:13px;cursor:pointer;transition:transform .2s,border-color .2s,box-shadow .2s;animation:op-in .42s ease both;}
.op-cart-card:hover{transform:translateY(-3px);border-color:${ACCENT} !important;box-shadow:0 10px 32px rgba(255,107,0,.15);}
.op-cart-avatar{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.op-cart-info{flex:1;min-width:0;}
.op-cart-vrow{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
.op-cart-vname{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;}
.op-cart-badge{font-size:10px;font-weight:800;color:white;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
.op-cart-item-row{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.op-cart-viewall{font-size:11px;font-weight:800;text-decoration:underline;text-underline-offset:2px;margin-top:1px;}
.op-cart-continue{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;}
.op-cart-total{font-size:13px;font-weight:900;font-family:'Syne',sans-serif;}
.op-history-card{border-radius:20px;padding:16px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:transform .2s;}
.op-history-card:hover{transform:translateY(-1px);}
.op-history-icon{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.vcp-root{min-height:100vh;font-family:'DM Sans',sans-serif;}
.vcp-header{padding:14px 16px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;backdrop-filter:blur(10px);}
.vcp-back-btn{width:38px;height:38px;border-radius:11px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.vcp-header-badge{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:800;}
.vcp-body{padding:14px 16px;display:flex;flex-direction:column;gap:14px;max-width:620px;margin:0 auto;}
.vcp-section-card{border-radius:20px;overflow:hidden;}
.vcp-card-head{display:flex;align-items:center;gap:7px;padding:12px 16px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;}
.vcp-item{display:flex;align-items:center;gap:12px;padding:11px 16px;}
.vcp-item-thumb{width:52px;height:52px;border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
.vcp-qty-row{display:flex;align-items:center;gap:3px;background:rgba(255,107,0,.09);border-radius:12px;padding:3px 4px;border:1px solid rgba(255,107,0,.18);}
.vcp-qty-btn{width:30px;height:30px;border-radius:9px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}
.vcp-qty-btn:hover{background:rgba(255,107,0,.2);}
.vcp-addr-row{display:flex;align-items:center;gap:12px;padding:13px 16px;}
.vcp-change-btn{border-radius:10px;padding:5px 13px;font-size:11px;font-weight:800;cursor:pointer;border-width:1.5px;border-style:solid;flex-shrink:0;}
.vcp-add-addr{width:calc(100% - 32px);display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;font-size:13px;font-weight:700;cursor:pointer;margin:0 16px 14px;}
.vcp-feat-label{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;padding:0 2px;}
.vcp-feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
@media(max-width:380px){.vcp-feat-grid{grid-template-columns:repeat(2,1fr);}}
.vcp-feat-card{border-radius:16px;overflow:hidden;display:flex;flex-direction:column;}
.vcp-feat-img{height:92px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.vcp-feat-add{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;border:none;border-radius:9px;padding:7px;color:white;font-size:11px;font-weight:800;cursor:pointer;margin-top:7px;transition:transform .15s,background .3s;}
.vcp-feat-add:hover{transform:scale(1.04);}
.vcp-feat-add.added{background:#10B981!important;}
.vcp-view-more{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:14px;font-size:13px;font-weight:800;cursor:pointer;}
.vcp-sticky-bar{position:fixed;bottom:64px;left:0;right:0;z-index:50;padding:12px 16px 14px;display:flex;align-items:center;gap:14px;box-shadow:0 -4px 24px rgba(0,0,0,.22);}
.vcp-pay-btn-sticky{flex-shrink:0;background:linear-gradient(135deg,${ACCENT},${ACCENT2});color:white;border:none;border-radius:16px;padding:14px 20px;font-family:'Syne',sans-serif;font-size:14px;font-weight:900;display:flex;align-items:center;gap:8px;box-shadow:0 6px 24px rgba(255,107,0,.4);cursor:pointer;transition:transform .2s,box-shadow .2s;white-space:nowrap;}
.vcp-pay-btn-sticky:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 32px rgba(255,107,0,.5);}
.vcp-pay-btn-sticky:active:not(:disabled){transform:scale(.97);}
.vcp-pay-btn-sticky:disabled{opacity:.42;cursor:not-allowed;}
.ap-addr-option{border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:border-color .2s,box-shadow .2s;}
.ap-addr-option:hover{border-color:${ACCENT} !important;}
.pay-method{transition:border-color .2s,box-shadow .2s;}
.pay-radio{width:22px;height:22px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.pay-radio-dot{width:11px;height:11px;border-radius:50%;background:${ACCENT};}
.mini-spin{width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:op-spin .7s linear infinite;flex-shrink:0;display:inline-block;}
@keyframes op-spin{to{transform:rotate(360deg)}}
@keyframes vcp-spin{to{transform:rotate(360deg)}}
@keyframes op-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@media(min-width:600px){
  .op-body{padding:52px 24px 0;}
  .vcp-body{padding:20px 24px;}
  .vcp-sticky-bar{bottom:64px;padding:14px 24px 16px;}
}
`;
}