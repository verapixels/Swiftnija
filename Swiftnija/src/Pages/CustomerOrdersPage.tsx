// pages/CartPage.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useCart } from "../context/Cartcontext";
import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { PAYSTACK_PUBLIC_KEY } from "../services/paystack";
import {
  FiShoppingCart, FiTrash2, FiPlus, FiMinus,
  FiArrowRight, FiTag, FiPackage, FiMapPin,
  FiCheckCircle, FiShield, FiZap, FiHome,
  FiBriefcase, FiChevronDown, FiX, FiNavigation,
} from "react-icons/fi";
import { RiVerifiedBadgeFill, RiWalletLine } from "react-icons/ri";
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, getDocs, limit,
  onSnapshot, orderBy, limit as fbLimit,
} from "firebase/firestore";

declare global {
  interface Window {
    PaystackPop: {
      setup(opts: {
        key: string; email: string; amount: number; currency?: string;
        ref?: string; metadata?: Record<string, unknown>; subaccount?: string;
        onSuccess: (t: { reference: string }) => void; onCancel: () => void;
      }): { openIframe(): void };
    };
  }
}

type SavedAddress = {
  id: string;
  label: "Home" | "Work" | "Other";
  address: string;
  landmark?: string;
  extraClue?: string;
  phone?: string;
  isDefault: boolean;
  lat?: number;
  lng?: number;
};

type ShippingMeta = {
  weightKg:     number | null;
  sizeCategory: "small" | "medium" | "large" | "extra_large" | null;
  lengthCm:     number | null;
  widthCm:      number | null;
  heightCm:     number | null;
} | null;

const fbFunctions = getFunctions();

const ACCENT                 = "#FF6B00";
const BASE_FEE               = 800;
const PER_KM                 = 200;
const MIN_FEE                = 500;
const MAX_FEE                = 50_000;
const MULTI_VENDOR_SURCHARGE = 500;
const LANDMARK_SURCHARGE     = 600;

const SIZE_MULTIPLIERS: Record<string, number> = {
  small: 1.0, medium: 1.3, large: 1.7, extra_large: 2.5,
};

const parsePrice = (p: string): number =>
  parseFloat(p.replace(/[₦,\s]/g, "")) || 0;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function legFee(
  vLat: number, vLng: number,
  uLat: number, uLng: number,
  shipping?: ShippingMeta,
): number {
  const km          = haversineKm(vLat, vLng, uLat, uLng);
  const distanceFee = Math.min(Math.max(Math.round(BASE_FEE + km * PER_KM), MIN_FEE), MAX_FEE);
  const weightKg        = shipping?.weightKg ?? 0;
  const weightSurcharge = weightKg > 2 ? (weightKg - 2) * 50 : 0;
  const sizeMultiplier  = shipping?.sizeCategory ? (SIZE_MULTIPLIERS[shipping.sizeCategory] ?? 1.0) : 1.0;
  let volumetricFactor  = 1.0;
  if (shipping?.lengthCm && shipping?.widthCm && shipping?.heightCm) {
    const vKg = (shipping.lengthCm * shipping.widthCm * shipping.heightCm) / 5000;
    if (vKg > 5) volumetricFactor = 1.0 + (vKg - 5) * 0.04;
  }
  const SIZE_MIN_FEES: Record<string, number> = {
    small: 500, medium: 1_500, large: 4_000, extra_large: 10_000,
  };
  const sizeMinFee = shipping?.sizeCategory ? (SIZE_MIN_FEES[shipping.sizeCategory] ?? MIN_FEE) : MIN_FEE;
  const raw = Math.round((distanceFee + weightSurcharge) * sizeMultiplier * volumetricFactor);
  return Math.max(raw, sizeMinFee);
}

function getUserCoords(): Promise<GeolocationCoordinates> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("No geolocation"));
    navigator.geolocation.getCurrentPosition(p => res(p.coords), rej,
      { timeout: 10_000, maximumAge: 0 });
  });
}

const coordCache = new Map<string, { lat: number; lng: number; approximate?: boolean } | null>();

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
  } catch (e) { console.warn("[CartPage] mapsForwardGeocode failed:", e); }
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
  } catch (e) { console.warn("[CartPage] Nominatim fallback failed:", e); }
  const cityPart = address.split(",").slice(-3).join(",").trim();
  if (cityPart && cityPart !== address) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityPart + " Nigeria")}&format=json&limit=1&countrycodes=ng`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json() as Array<{ lat: string; lon: string }>;
      if (data[0]) {
        const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), approximate: true };
        coordCache.set(key, result);
        return result;
      }
    } catch { /* give up */ }
  }
  coordCache.set(key, null);
  return null;
}

async function fetchShippingMeta(productName: string): Promise<ShippingMeta> {
  const cacheKey = `shipping:${productName}`;
  if ((coordCache as unknown as Map<string, unknown>).has(cacheKey)) {
    return (coordCache as unknown as Map<string, ShippingMeta>).get(cacheKey) ?? null;
  }
  try {
    for (const field of ["name", "productName", "title"]) {
      const snap = await getDocs(query(collection(db, "products"), where(field, "==", productName), limit(1)));
      if (!snap.empty) {
        const data = snap.docs[0].data();
        const meta = data.shipping ?? null;
        (coordCache as unknown as Map<string, ShippingMeta>).set(cacheKey, meta);
        return meta;
      }
    }
  } catch { /* ignore */ }
  (coordCache as unknown as Map<string, ShippingMeta>).set(cacheKey, null);
  return null;
}

// ── Pending order hook ────────────────────────────────────────────────────────
function usePendingOrder() {
  const [pendingOrderId,     setPendingOrderId]     = useState<string | null>(null);
  const [pendingOrderStatus, setPendingOrderStatus] = useState<string>("pending");
  const unsubOrderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(
      collection(db, "orders"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      fbLimit(5),
    );
    const unsubList = onSnapshot(q, (snap) => {
      const activeDoc = snap.docs.find(d => {
        const s = d.data().status ?? "pending";
        return s !== "delivered" && s !== "cancelled";
      });
      if (!activeDoc) {
        setPendingOrderId(null);
        unsubOrderRef.current?.();
        unsubOrderRef.current = null;
        return;
      }
      const orderId = activeDoc.id;
      setPendingOrderId(orderId);
      setPendingOrderStatus(activeDoc.data().status ?? "pending");
      if (unsubOrderRef.current) unsubOrderRef.current();
      unsubOrderRef.current = onSnapshot(doc(db, "orders", orderId), orderSnap => {
        if (!orderSnap.exists()) { setPendingOrderId(null); return; }
        const status = orderSnap.data().status ?? "pending";
        setPendingOrderStatus(status);
        if (status === "delivered" || status === "cancelled") setPendingOrderId(null);
      });
    });
    return () => { unsubList(); unsubOrderRef.current?.(); };
  }, [auth.currentUser?.uid]);

  return { pendingOrderId, pendingOrderStatus };
}

// ── Pending order banner ──────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  pending: "Order Placed", confirmed: "Order Confirmed",
  finding_rider: "Finding Rider", rider_assigned: "Rider Assigned",
  picked_up: "Order Picked Up", arriving: "Rider Arriving", delivered: "Delivered!",
};
const STATUS_ICONS: Record<string, string> = {
  pending: "🕐", confirmed: "✅", finding_rider: "🔍",
  rider_assigned: "🏍️", picked_up: "📦", arriving: "🚀", delivered: "🎉",
};

function PendingOrderBanner({ orderId, status, onTrack }: {
  orderId: string; status: string; onTrack: () => void;
}) {
  const isArriving = status === "arriving";
  const isFinding  = status === "finding_rider" || status === "pending" || status === "confirmed";
  return (
    <>
      <style>{`
        @keyframes pob-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,107,0,0)} 50%{box-shadow:0 0 0 12px rgba(255,107,0,0.12)} }
        @keyframes pob-arrive-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} 50%{box-shadow:0 0 0 12px rgba(16,185,129,0.15)} }
        @keyframes pob-dot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes pob-in { from{opacity:0;transform:translateY(24px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        .pob-wrap { position:fixed; bottom:96px; left:12px; right:12px; z-index:500; animation:pob-in .45s cubic-bezier(.34,1.56,.64,1) both; pointer-events:none; max-width:500px; margin:0 auto; }
        .pob-card { display:flex; align-items:center; gap:12px; background:#13131a; border:2px solid; border-radius:22px; padding:13px 15px; pointer-events:all; cursor:pointer; transition:transform .2s,box-shadow .2s; }
        .pob-card:hover{transform:translateY(-2px)} .pob-card:active{transform:scale(.98)}
        .pob-card.orange{border-color:rgba(255,107,0,0.55);animation:pob-pulse 2.4s ease-in-out infinite}
        .pob-card.green{border-color:rgba(16,185,129,0.55);animation:pob-arrive-pulse 2s ease-in-out infinite}
        .pob-icon{width:46px;height:46px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px}
        .pob-icon.orange{background:rgba(255,107,0,0.12);border:1.5px solid rgba(255,107,0,0.25)}
        .pob-icon.green{background:rgba(16,185,129,0.12);border:1.5px solid rgba(16,185,129,0.25)}
        .pob-body{flex:1;min-width:0}
        .pob-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#55556a;font-family:'DM Sans',sans-serif}
        .pob-status{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;margin-top:1px;display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pob-status.orange{color:#FF6B00} .pob-status.green{color:#10B981}
        .pob-ref{font-size:10px;font-weight:700;color:#333350;margin-top:1px}
        .pob-dot{width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block}
        .pob-dot:nth-child(1){animation:pob-dot .9s ease-in-out 0s infinite}
        .pob-dot:nth-child(2){animation:pob-dot .9s ease-in-out .18s infinite}
        .pob-dot:nth-child(3){animation:pob-dot .9s ease-in-out .36s infinite}
        .pob-cta{flex-shrink:0;display:flex;align-items:center;gap:6px;color:white;border:none;border-radius:14px;padding:10px 16px;cursor:pointer;font-family:'Syne',sans-serif;font-size:13px;font-weight:800;transition:transform .15s,box-shadow .15s;white-space:nowrap}
        .pob-cta:hover{transform:scale(1.04)} .pob-cta:active{transform:scale(.97)}
        .pob-cta.orange{background:linear-gradient(135deg,#FF6B00,#FF9A00);box-shadow:0 4px 16px rgba(255,107,0,0.45)}
        .pob-cta.green{background:linear-gradient(135deg,#10B981,#059669);box-shadow:0 4px 16px rgba(16,185,129,0.45)}
      `}</style>
      <div className="pob-wrap">
        <div className={`pob-card ${isArriving ? "green" : "orange"}`} onClick={onTrack}>
          <div className={`pob-icon ${isArriving ? "green" : "orange"}`}>{STATUS_ICONS[status] ?? "🏍️"}</div>
          <div className="pob-body">
            <div className="pob-label">Active Order</div>
            <div className={`pob-status ${isArriving ? "green" : "orange"}`}>
              {STATUS_LABELS[status] ?? "In Progress"}
              {isFinding && (
                <span style={{ display: "inline-flex", gap: 3, marginLeft: 4 }}>
                  <span className="pob-dot" /><span className="pob-dot" /><span className="pob-dot" />
                </span>
              )}
            </div>
            <div className="pob-ref">#{orderId.slice(-8).toUpperCase()}</div>
          </div>
          <button className={`pob-cta ${isArriving ? "green" : "orange"}`} onClick={e => { e.stopPropagation(); onTrack(); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Track
          </button>
        </div>
      </div>
    </>
  );
}

// ── Address picker ────────────────────────────────────────────────────────────
function AddressPicker({ addresses, selected, onSelect, loading, dark, c }: {
  addresses: SavedAddress[]; selected: SavedAddress | null;
  onSelect: (addr: SavedAddress | null) => void;
  loading: boolean; dark: boolean; c: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const labelIcon = (label: string) => {
    if (label === "Home") return <FiHome size={13} />;
    if (label === "Work") return <FiBriefcase size={13} />;
    return <FiMapPin size={13} />;
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)} disabled={loading}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          background: c.inp, border: `1.5px solid ${open ? ACCENT : c.inpB}`,
          borderRadius: 14, padding: "11px 14px",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "border-color .2s,box-shadow .2s",
          boxShadow: open ? `0 0 0 3px rgba(255,107,0,0.12)` : "none",
          outline: "none", opacity: loading ? 0.6 : 1,
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: selected ? "rgba(255,107,0,0.12)" : c.surf,
          border: `1px solid ${selected ? "rgba(255,107,0,0.25)" : c.brd}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: selected ? ACCENT : c.sub, flexShrink: 0,
        }}>
          {loading ? <span style={{ display: "inline-block", animation: "cp-spin .7s linear infinite" }}>⟳</span>
            : selected ? labelIcon(selected.label) : <FiNavigation size={13} />}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          {selected ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: ".5px", lineHeight: 1 }}>{selected.label}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: c.txt, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.address}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: c.sub }}>{loading ? "Loading your addresses…" : "Choose a delivery address"}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {selected && (
            <div role="button" onClick={e => { e.stopPropagation(); onSelect(null); }}
              style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", cursor: "pointer" }}>
              <FiX size={11} />
            </div>
          )}
          <FiChevronDown size={15} style={{ color: c.sub, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }} />
        </div>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 16,
          overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
          animation: "cp-dropdown-in .18s cubic-bezier(.34,1.56,.64,1)", zIndex: 9999,
        }}>
          {addresses.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", color: c.sub, fontSize: 13, fontWeight: 600 }}>
              No saved addresses yet. <a href="/profile" style={{ color: ACCENT, fontWeight: 700 }}>Add one in your profile →</a>
            </div>
          ) : (
            <>
              <button onClick={() => { onSelect(null); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: !selected ? `rgba(255,107,0,0.06)` : "transparent", border: "none", borderBottom: `1px solid ${c.brd}`, cursor: "pointer", outline: "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: !selected ? "rgba(255,107,0,0.12)" : c.inp, border: `1px solid ${!selected ? "rgba(255,107,0,0.3)" : c.inpB}`, display: "flex", alignItems: "center", justifyContent: "center", color: !selected ? ACCENT : c.sub, flexShrink: 0 }}>
                  <FiNavigation size={13} />
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: !selected ? ACCENT : c.txt }}>Use my current location (GPS)</div>
                  <div style={{ fontSize: 11, color: c.sub, fontWeight: 600 }}>Automatically detect where you are</div>
                </div>
                {!selected && <FiCheckCircle size={14} color={ACCENT} style={{ marginLeft: "auto" }} />}
              </button>
              {addresses.map((addr, i) => {
                const isActive = selected?.id === addr.id;
                const isLast   = i === addresses.length - 1;
                return (
                  <button key={addr.id} onClick={() => { onSelect(addr); setOpen(false); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: isActive ? "rgba(255,107,0,0.06)" : "transparent", border: "none", borderBottom: isLast ? "none" : `1px solid ${c.brd}`, cursor: "pointer", outline: "none" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: isActive ? "rgba(255,107,0,0.12)" : c.inp, border: `1px solid ${isActive ? "rgba(255,107,0,0.3)" : c.inpB}`, display: "flex", alignItems: "center", justifyContent: "center", color: isActive ? ACCENT : c.sub, flexShrink: 0 }}>
                      {labelIcon(addr.label)}
                    </div>
                    <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: isActive ? ACCENT : c.sub, textTransform: "uppercase", letterSpacing: ".5px", display: "flex", alignItems: "center", gap: 6 }}>
                        {addr.label}
                        {addr.isDefault && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: "rgba(255,107,0,0.12)", color: ACCENT, border: "1px solid rgba(255,107,0,0.25)" }}>Default</span>}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: c.txt, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr.address}</div>
                      {addr.landmark && <div style={{ fontSize: 11, color: c.sub, marginTop: 1 }}>📍 {addr.landmark}</div>}
                    </div>
                    {isActive && <FiCheckCircle size={14} color={ACCENT} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Payment method modal ──────────────────────────────────────────────────────
function PaymentMethodModal({ total, walletBalance, walletLoading, onPaystack, onWallet, onClose, dark, c }: {
  total: number; walletBalance: number | null; walletLoading: boolean;
  onPaystack: () => void; onWallet: () => void; onClose: () => void;
  dark: boolean; c: Record<string, string>;
}) {
  const hasEnough = walletBalance !== null && walletBalance >= total;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "cp-fade-in .2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 28, padding: 28, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 20, animation: "cp-modal-in .3s cubic-bezier(.34,1.56,.64,1)", boxShadow: "0 32px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Syne,sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, letterSpacing: "-0.5px" }}>Choose Payment</div>
            <div style={{ fontSize: 12, color: c.sub, fontWeight: 600, marginTop: 3 }}>How would you like to pay?</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.brd}`, background: c.inp, color: c.sub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiX size={16} />
          </button>
        </div>
        <div style={{ background: `rgba(255,107,0,0.06)`, border: `1.5px solid rgba(255,107,0,0.15)`, borderRadius: 16, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.sub }}>Order Total</span>
          <span style={{ fontFamily: "Syne,sans-serif", fontSize: 22, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</span>
        </div>
        <button onClick={hasEnough ? onWallet : undefined} disabled={!hasEnough || walletLoading}
          style={{ width: "100%", padding: "18px 20px", borderRadius: 20, background: hasEnough ? `rgba(16,185,129,0.06)` : c.inp, border: `2px solid ${hasEnough ? "rgba(16,185,129,0.3)" : c.brd}`, cursor: hasEnough ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 16, transition: "all .2s", outline: "none", opacity: walletLoading ? 0.6 : 1 }}
          onMouseEnter={e => { if (hasEnough) (e.currentTarget as HTMLButtonElement).style.borderColor = "#10B981"; }}
          onMouseLeave={e => { if (hasEnough) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(16,185,129,0.3)"; }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: hasEnough ? "rgba(16,185,129,0.12)" : c.surf, border: `1.5px solid ${hasEnough ? "rgba(16,185,129,0.25)" : c.brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: hasEnough ? "#10B981" : c.sub }}>
            <RiWalletLine size={22} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontFamily: "Syne,sans-serif", fontSize: 15, fontWeight: 800, color: hasEnough ? c.txt : c.sub }}>Pay with Wallet</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {walletLoading ? <span style={{ fontSize: 12, color: c.sub, fontWeight: 600 }}>Loading balance…</span> : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 800, color: hasEnough ? "#10B981" : "#ef4444", background: hasEnough ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)", border: `1px solid ${hasEnough ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.2)"}`, borderRadius: 8, padding: "2px 8px" }}>
                    ₦{(walletBalance ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })} available
                  </span>
                  {!hasEnough && <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>Insufficient balance</span>}
                </>
              )}
            </div>
            {!hasEnough && !walletLoading && <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, marginTop: 3 }}>Top up your wallet in your profile</div>}
          </div>
          {hasEnough && <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981", flexShrink: 0 }}><FiArrowRight size={14} /></div>}
        </button>
        <button onClick={onPaystack}
          style={{ width: "100%", padding: "18px 20px", borderRadius: 20, background: `rgba(255,107,0,0.04)`, border: `2px solid rgba(255,107,0,0.2)`, cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all .2s", outline: "none" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,107,0,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,107,0,0.2)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,107,0,0.04)"; }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: "rgba(255,107,0,0.12)", border: "1.5px solid rgba(255,107,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT }}><FiZap size={22} /></div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontFamily: "Syne,sans-serif", fontSize: 15, fontWeight: 800, color: c.txt }}>Pay with Paystack</div>
            <div style={{ fontSize: 12, color: c.sub, fontWeight: 600, marginTop: 4 }}>Card · Bank transfer · USSD · QR</div>
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,107,0,0.15)", border: "1px solid rgba(255,107,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, flexShrink: 0 }}><FiArrowRight size={14} /></div>
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 600, color: c.sub }}>
          <FiShield size={12} /> All payments are encrypted and secure
        </div>
      </div>
    </div>
  );
}

// ── Main CartPage ─────────────────────────────────────────────────────────────
export default function CartPage() {
  const { theme }  = useTheme();
  const dark       = theme === "dark";
  const { cart, addToCart, removeOne, clearItem, clearCart, cartCount, cartLoading } = useCart();
  const navigate   = useNavigate();

  const [promoCode,         setPromoCode]         = useState("");
  const [promoApplied,      setPromoApplied]       = useState(false);
  const [promoErr,          setPromoErr]           = useState("");
  const [promoData,         setPromoData]          = useState<{ type: string; value: number } | null>(null);
  const [deliveryFee,       setDeliveryFee]        = useState<number>(0);
  const [deliveryLoading,   setDeliveryLoading]    = useState(false);
  const [deliveryBreakdown, setDeliveryBreakdown]  = useState<string>("");
  const [checkoutLoading,   setCheckoutLoading]    = useState(false);
  const [paySuccess,        setPaySuccess]         = useState(false);
  const [showPaymentModal,  setShowPaymentModal]   = useState(false);
  const [walletBalance,     setWalletBalance]      = useState<number | null>(null);
  const [walletLoading,     setWalletLoading]      = useState(false);
  const [savedAddresses,    setSavedAddresses]     = useState<SavedAddress[]>([]);
  const [addressesLoading,  setAddressesLoading]   = useState(false);
  const [selectedAddress,   setSelectedAddress]    = useState<SavedAddress | null>(null);

  const { pendingOrderId, pendingOrderStatus } = usePendingOrder();
  const lastCartSig = useRef<string>("");

  const c = {
    bg:   dark ? "#0a0a0e" : "#f2f2fa",
    surf: dark ? "#13131a" : "#ffffff",
    brd:  dark ? "#1e1e2c" : "#e0e0ee",
    txt:  dark ? "#eeeef8" : "#111118",
    sub:  dark ? "#66668a" : "#7777a2",
    dim:  dark ? "#30304a" : "#c0c0d8",
    inp:  dark ? "#16161f" : "#f7f7ff",
    inpB: dark ? "#26263a" : "#d4d4ee",
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAddressesLoading(true);
    getDoc(doc(db, "users", uid))
      .then(snap => {
        if (!snap.exists()) return;
        const addrs: SavedAddress[] = snap.data().savedAddresses ?? [];
        setSavedAddresses(addrs);
        const def = addrs.find(a => a.isDefault);
        if (def) setSelectedAddress(def);
      })
      .catch(err => console.warn("[CartPage] Could not load addresses:", err))
      .finally(() => setAddressesLoading(false));
  }, []);

  const loadWalletBalance = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setWalletLoading(true);
    try {
      const snap = await getDoc(doc(db, "wallets", uid));
      setWalletBalance(snap.exists() ? (snap.data().balance ?? 0) : 0);
    } catch (e) {
      console.warn("[CartPage] Could not load wallet:", e);
      setWalletBalance(0);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const getVendorCoords = useCallback(async (vendorName: string): Promise<{ lat: number; lng: number; approximate: boolean } | null> => {
    if (!vendorName) return null;
    const cacheKey = `vendor:${vendorName}`;
    if (coordCache.has(cacheKey)) {
      const cached = coordCache.get(cacheKey);
      return cached ? { ...cached, approximate: cached.approximate ?? false } : null;
    }
    const nameFields = ["businessName", "storeName", "displayName", "name", "shopName"];
    let vendorDoc: Record<string, unknown> | null = null;
    for (const field of nameFields) {
      try {
        const snap = await getDocs(query(collection(db, "vendors"), where(field, "==", vendorName), limit(1)));
        if (!snap.empty) { vendorDoc = snap.docs[0].data() as Record<string, unknown>; break; }
      } catch { /* continue */ }
    }
    if (!vendorDoc) { coordCache.set(cacheKey, null); return null; }
    if (typeof vendorDoc.lat === "number" && typeof vendorDoc.lng === "number") {
      const r = { lat: vendorDoc.lat as number, lng: vendorDoc.lng as number, approximate: false };
      coordCache.set(cacheKey, r); return r;
    }
    type GP = { latitude: number; longitude: number };
    for (const k of ["geopoint", "location", "coordinates"]) {
      const gp = vendorDoc[k] as GP | undefined;
      if (gp?.latitude) { const r = { lat: gp.latitude, lng: gp.longitude, approximate: false }; coordCache.set(cacheKey, r); return r; }
    }
    type LL = { lat: number; lng: number };
    for (const k of ["location", "coordinates"]) {
      const ll = vendorDoc[k] as LL | undefined;
      if (ll?.lat) { const r = { lat: ll.lat, lng: ll.lng, approximate: false }; coordCache.set(cacheKey, r); return r; }
    }
    const addrStr = (vendorDoc.address ?? vendorDoc.storeAddress) as string | undefined;
    const city    = (vendorDoc.city ?? "") as string;
    if (typeof addrStr === "string" && addrStr.trim()) {
      const full   = [addrStr.trim(), city.trim(), "Nigeria"].filter(Boolean).join(", ");
      const coords = await geocodeAddress(full);
      coordCache.set(cacheKey, coords); return coords;
    }
    coordCache.set(cacheKey, null); return null;
  }, []);

  const resolveVendorNameForProduct = useCallback(async (productName: string): Promise<string | null> => {
    const cacheKey = `product-vendor:${productName}`;
    if ((coordCache as unknown as Map<string, unknown>).has(cacheKey)) {
      return (coordCache as unknown as Map<string, string | null>).get(cacheKey) ?? null;
    }
    try {
      for (const field of ["name", "productName", "title"]) {
        const snap = await getDocs(query(collection(db, "products"), where(field, "==", productName), limit(1)));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const vn   = data.vendorName ?? data.businessName ?? data.vendor ?? null;
          (coordCache as unknown as Map<string, string | null>).set(cacheKey, vn);
          return vn as string | null;
        }
      }
    } catch { /* continue */ }
    (coordCache as unknown as Map<string, string | null>).set(cacheKey, null);
    return null;
  }, []);

  const resolveUserCoords = useCallback(async (): Promise<{ lat: number; lng: number; source: "saved" | "gps" | "none"; approximate: boolean }> => {
    if (selectedAddress?.lat && selectedAddress?.lng) {
      return { lat: selectedAddress.lat, lng: selectedAddress.lng, source: "saved", approximate: false };
    }
    if (selectedAddress?.address) {
      const coords = await geocodeAddress(selectedAddress.address);
      if (coords) return { lat: coords.lat, lng: coords.lng, source: "saved", approximate: coords.approximate };
    }
    try {
      const pos = await getUserCoords();
      return { lat: Math.round(pos.latitude * 1000) / 1000, lng: Math.round(pos.longitude * 1000) / 1000, source: "gps", approximate: false };
    } catch {
      return { lat: 0, lng: 0, source: "none", approximate: false };
    }
  }, [selectedAddress]);

  const computeDelivery = useCallback(async () => {
    if (cart.length === 0) { setDeliveryFee(0); setDeliveryBreakdown(""); return; }
    if (cartLoading) return;
    const addrSig = selectedAddress?.id ?? "gps";
    const sig = [cart.map(i => `${i.vendorName ?? ""}:${i.name}:${i.qty}`).join("|"), addrSig].join("@");
    if (sig === lastCartSig.current) return;
    lastCartSig.current = sig;
    setDeliveryLoading(true);
    try {
      const userPos = await resolveUserCoords();
      if (userPos.source === "none" || (userPos.lat === 0 && userPos.lng === 0)) {
        setDeliveryFee(MIN_FEE);
        setDeliveryBreakdown(selectedAddress ? "Could not locate that address — flat fee applied" : "Enable location for an exact fee");
        return;
      }
      const { lat: userLat, lng: userLng, approximate: userApprox } = userPos;

      const vendorGroups = new Map<string, typeof cart>();
      for (const item of cart) {
        let vn = item.vendorName;
        if ((!vn || vn === "unknown") && item.vendorId) {
          try {
            const vsnap = await getDoc(doc(db, "vendors", item.vendorId));
            if (vsnap.exists()) {
              const vdata = vsnap.data();
              vn = vdata.businessName || vdata.storeName || vdata.displayName || vn;
              if (typeof vdata.lat === "number" && typeof vdata.lng === "number") {
                const key = item.vendorId;
                if (!vendorGroups.has(key)) vendorGroups.set(key, []);
                vendorGroups.get(key)!.push({ ...item, vendorName: vn, vendorLat: vdata.lat, vendorLng: vdata.lng });
                continue;
              }
            }
          } catch { /* continue */ }
        }
        if (!vn || vn === "unknown") vn = (await resolveVendorNameForProduct(item.name)) ?? undefined;
        const key = vn ?? (item.vendorId ? `id:${item.vendorId}` : `_coords_${item.vendorLat}_${item.vendorLng}`);
        if (!vendorGroups.has(key)) vendorGroups.set(key, []);
        vendorGroups.get(key)!.push({ ...item, vendorName: vn });
      }

      const vendorKeys = [...vendorGroups.keys()].filter(vn => {
        const item = vendorGroups.get(vn)![0];
        return (item.vendorLat && item.vendorLng) || (vn && !vn.startsWith("_coords_undefined")) || vn.startsWith("id:");
      });

      if (vendorKeys.length === 0) {
        setDeliveryFee(MIN_FEE); setDeliveryBreakdown("Vendor location unavailable — flat fee applied"); return;
      }

      const coordResults = await Promise.all(
        vendorKeys.map(async (vn) => {
          const item = vendorGroups.get(vn)![0];
          if (item.vendorLat && item.vendorLng) return { name: vn, lat: item.vendorLat, lng: item.vendorLng, approximate: false };
          if (item.vendorId) {
            try {
              const vsnap = await getDoc(doc(db, "vendors", item.vendorId));
              if (vsnap.exists()) {
                const vdata = vsnap.data();
                if (typeof vdata.lat === "number" && typeof vdata.lng === "number") return { name: vn, lat: vdata.lat, lng: vdata.lng, approximate: false };
                const addr = [vdata.address || vdata.storeAddress, vdata.city, "Nigeria"].filter(Boolean).join(", ");
                if (addr) { const coords = await geocodeAddress(addr); if (coords) return { name: vn, ...coords }; }
              }
            } catch { /* continue */ }
          }
          const coords = await getVendorCoords(vn);
          return coords ? { name: vn, ...coords } : null;
        })
      );

      const resolved = coordResults.filter(Boolean) as Array<{ name: string; lat: number; lng: number; approximate: boolean }>;
      if (resolved.length === 0) { setDeliveryFee(MIN_FEE); setDeliveryBreakdown("Could not locate vendors — flat fee applied"); return; }

      let totalFee = 0, anyApproximate = userApprox;
      const primary         = resolved[0];
      const primaryKm       = haversineKm(primary.lat, primary.lng, userLat, userLng);
      const primaryItems    = vendorGroups.get(primary.name) ?? [];
      const primaryShipping = await fetchShippingMeta(primaryItems[0].name);
      totalFee = legFee(primary.lat, primary.lng, userLat, userLng, primaryShipping);
      if (primary.approximate) { totalFee += LANDMARK_SURCHARGE; anyApproximate = true; }
      for (let i = 1; i < resolved.length; i++) {
        const v        = resolved[i];
        const vKm      = haversineKm(v.lat, v.lng, userLat, userLng);
        const detourKm = Math.max(0, vKm - primaryKm);
        let surcharge  = detourKm < 2 ? MULTI_VENDOR_SURCHARGE : Math.round(detourKm * PER_KM) + MULTI_VENDOR_SURCHARGE;
        if (v.approximate) { surcharge += LANDMARK_SURCHARGE; anyApproximate = true; }
        totalFee += surcharge;
      }
      if (userApprox) totalFee += LANDMARK_SURCHARGE;
      totalFee = Math.min(totalFee, MAX_FEE);

      let breakdown = "";
      if (anyApproximate)           breakdown = "Estimated — pin your address for a precise rate";
      else if (resolved.length > 1) breakdown = `Covers pickup from ${resolved.length} stores`;
      else {
        if (primaryKm < 3)       breakdown = "Within 3 km";
        else if (primaryKm < 7)  breakdown = "3 – 7 km away";
        else if (primaryKm < 15) breakdown = "7 – 15 km away";
        else                     breakdown = "15+ km away";
      }
      setDeliveryFee(totalFee);
      setDeliveryBreakdown(breakdown);
    } catch (e) {
      console.error("[CartPage] Delivery error:", e);
      setDeliveryFee(MIN_FEE);
      setDeliveryBreakdown("Could not calculate — flat fee applied");
    } finally {
      setDeliveryLoading(false);
    }
  }, [cart, cartLoading, selectedAddress, resolveUserCoords, getVendorCoords, resolveVendorNameForProduct]);

  useEffect(() => {
    if (cart.length === 0 || cartLoading) return;
    lastCartSig.current = "";
    computeDelivery();
  }, [computeDelivery, selectedAddress, cartLoading]);

  const subtotal     = cart.reduce((s, i) => s + parsePrice(i.price) * i.qty, 0);
  const anyEstimated = deliveryBreakdown.includes("Estimated") || (!!selectedAddress && !selectedAddress.lat);
  const discount     = promoApplied && promoData
    ? promoData.type === "percentage" ? Math.round(subtotal * (promoData.value / 100)) : promoData.value
    : 0;
  const total = subtotal > 0 ? subtotal - discount + deliveryFee : 0;

  const handlePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoErr("Enter a promo code"); return; }
    try {
      const snap = await getDocs(query(collection(db, "discounts"), where("code", "==", code), where("status", "==", "active")));
      if (snap.empty) { setPromoErr("Invalid or expired promo code"); setPromoApplied(false); return; }
      const d   = snap.docs[0].data();
      const now = new Date();
      if (d.startDate?.toDate() && now < d.startDate.toDate()) { setPromoErr("This promo hasn't started yet"); setPromoApplied(false); return; }
      if (d.endDate?.toDate()   && now > d.endDate.toDate())   { setPromoErr("This promo code has expired");    setPromoApplied(false); return; }
      if (d.usageLimit && d.usedCount >= d.usageLimit)         { setPromoErr("This promo code has reached its usage limit"); setPromoApplied(false); return; }
      if (d.minOrderAmount && subtotal < d.minOrderAmount)     { setPromoErr(`Minimum order of ₦${d.minOrderAmount.toLocaleString()} required`); setPromoApplied(false); return; }
      setPromoData({ type: d.type, value: d.value });
      setPromoApplied(true);
      setPromoErr("");
    } catch (e) {
      console.error("[Promo]", e);
      setPromoErr("Could not validate code — try again");
    }
  };

  const handleCheckoutClick = async () => {
    if (cart.length === 0 || total === 0) return;
    setShowPaymentModal(true);
    loadWalletBalance();
  };

  // ── Wallet pay ──────────────────────────────────────────────────────────────
const handleWalletPay = async () => {
  setShowPaymentModal(false);
  setCheckoutLoading(true);
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) { alert("Please log in to checkout."); return; }

    const orderId = `SWIFT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const customerPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();

    // 1. Create the order first
    await setDoc(doc(db, "orders", orderId), {
      orderId, userId: uid,
      customerName:  userData?.fullName || auth.currentUser?.displayName || "Customer",
      customerEmail: userData?.email    || auth.currentUser?.email        || "",
      customerPhone: userData?.phone    || "",
      vendorId:   cart[0]?.vendorId   || "",
      vendorName: cart[0]?.vendorName || "",
      items: cart.map(i => ({ name: i.name, qty: i.qty, price: parsePrice(i.price), img: i.img || "", vendorName: i.vendorName || "", vendorId: i.vendorId || "" })),
      subtotal, deliveryFee, discount, total,
      deliveryAddress: selectedAddress?.address || "GPS location",
      deliveryLabel:   selectedAddress?.label   || "GPS",
      paymentMethod: "wallet",
      customerPickupCode,
      paymentStatus: "pending",
      walletCharged: false,
      status: "confirmed",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });

    // 2. Call splitWalletPayment — deducts from user, credits vendor + rider + platform
    const splitFn = httpsCallable(fbFunctions, "splitWalletPayment");
    await splitFn({ orderId });

    clearCart();
    navigate(`/orders/${orderId}/track`);
  } catch (err: any) {
    console.error("[WalletPay]", err);
    alert("Wallet payment failed: " + (err?.message || String(err)));
  } finally {
    setCheckoutLoading(false);
  }
};

  // ── Paystack ────────────────────────────────────────────────────────────────
  const handlePaystack = async () => {
    setShowPaymentModal(false);
    setCheckoutLoading(true);
    try {
      if (!window.PaystackPop) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.getElementById("paystack-js");
          if (existing) { resolve(); return; }
          const s = document.createElement("script");
          s.id = "paystack-js"; s.src = "https://js.paystack.co/v1/inline.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Paystack script failed to load"));
          document.head.appendChild(s);
        });
        await new Promise(r => setTimeout(r, 200));
      }
      if (!window.PaystackPop) { alert("Paystack could not load. Please check your internet connection."); return; }
      let email = auth.currentUser?.email ?? "";
      if (!email && auth.currentUser?.uid) {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        email = (snap.data()?.email as string) ?? "";
      }
      if (!email) { alert("Please log in to checkout."); return; }
      let subaccountCode: string | undefined;
      const firstVendorName = cart[0]?.vendorName;
      if (firstVendorName) {
        try {
          for (const field of ["businessName", "storeName", "displayName", "name"]) {
            const snap = await getDocs(query(collection(db, "vendors"), where(field, "==", firstVendorName), limit(1)));
            if (!snap.empty) { subaccountCode = snap.docs[0].data()?.bankAccount?.subaccount_code; break; }
          }
        } catch { /* subaccount optional */ }
      }
      const reference         = `SWIFT_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const customerPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase(); // ← NEW
      const deliveryAddr      = selectedAddress?.address ?? "GPS location";
      window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY, email, amount: total * 100, currency: "NGN", ref: reference,
        ...(subaccountCode ? { subaccount: subaccountCode } : {}),
        metadata: {
          cart_items:       cart.map(i => `${i.qty}x ${i.name} (${i.vendorName ?? ""})`).join(", "),
          delivery_address: deliveryAddr,
          delivery_label:   selectedAddress?.label ?? "GPS",
        },
        onSuccess: (t) => {
          void (async () => {
            const uid = auth.currentUser?.uid;
            if (uid) {
              try {
                const orderId  = t.reference;
                const userSnap = await getDoc(doc(db, "users", uid));
                const userData = userSnap.data();
                await setDoc(doc(db, "orders", orderId), {
                  orderId, userId: uid,
                  customerName:  userData?.fullName || auth.currentUser?.displayName || "Customer",
                  customerEmail: userData?.email    || auth.currentUser?.email        || "",
                  customerPhone: userData?.phone    || "",
                  vendorId:   cart[0]?.vendorId   || "",
                  vendorName: cart[0]?.vendorName || "",
                  items: cart.map(i => ({ name: i.name, qty: i.qty, price: parsePrice(i.price), img: i.img || "", vendorName: i.vendorName || "", vendorId: i.vendorId || "" })),
                  subtotal, deliveryFee, discount, total,
                  deliveryAddress: selectedAddress?.address || "GPS location",
                  deliveryLabel:   selectedAddress?.label   || "GPS",
                  paymentMethod: "paystack",
                  paystackReference: t.reference,
                  customerPickupCode, // ← NEW
                  status: "confirmed",
                  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                });
                clearCart();
                setCheckoutLoading(false);
                navigate(`/orders/${orderId}/track`);
              } catch (err) {
                console.error("[Paystack] Failed to save order:", err);
                setPaySuccess(true);
                clearCart();
                setCheckoutLoading(false);
              }
            }
          })();
        },
        onCancel: () => { setCheckoutLoading(false); },
      }).openIframe();
    } catch (err: any) {
      console.error("[Paystack]", err);
      alert("Payment failed: " + (err?.message || String(err)));
      setCheckoutLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes cp-in    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cp-pop   { 0%{transform:scale(1)} 45%{transform:scale(1.22)} 100%{transform:scale(1)} }
        @keyframes cp-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,107,0,0.4)} 50%{box-shadow:0 0 0 8px rgba(255,107,0,0)} }
        @keyframes cp-spin  { to{transform:rotate(360deg)} }
        @keyframes cp-dropdown-in { from{opacity:0;transform:translateY(-8px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes cp-fade-in  { from{opacity:0} to{opacity:1} }
        @keyframes cp-modal-in { from{opacity:0;transform:scale(.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }

        .cp { min-height:100vh; font-family:'DM Sans',sans-serif; padding:24px 16px 220px; transition:background .3s,color .3s; }
        .cp-in { max-width:660px; margin:0 auto; }
        .cp-head { display:flex; align-items:center; gap:12px; margin-bottom:32px; animation:cp-in .35s ease both; }
        .cp-accent-bar { width:5px; height:44px; border-radius:4px; background:linear-gradient(180deg,${ACCENT},#FF9A00); flex-shrink:0; }
        .cp-title { font-family:'Syne',sans-serif; font-size:clamp(28px,6vw,38px); font-weight:900; letter-spacing:-1.5px; line-height:1; }
        .cp-badge { margin-left:auto; background:${ACCENT}; color:#fff; border-radius:20px; padding:5px 16px; font-family:'Syne',sans-serif; font-size:13px; font-weight:800; }
        .cp-empty { display:flex; flex-direction:column; align-items:center; padding:80px 20px; gap:20px; text-align:center; animation:cp-in .4s ease both; }
        .cp-empty-ring { width:96px; height:96px; border-radius:32px; border:2px dashed rgba(255,107,0,0.3); background:rgba(255,107,0,0.06); display:flex; align-items:center; justify-content:center; animation:cp-pulse 2.4s infinite; }
        .cp-empty-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .cp-success { display:flex; flex-direction:column; align-items:center; padding:80px 20px; gap:16px; text-align:center; animation:cp-in .4s ease both; }
        .cp-success-ring { width:100px; height:100px; border-radius:50%; background:rgba(34,197,94,0.12); border:2px solid #22c55e; display:flex; align-items:center; justify-content:center; }
        .cp-deliver-section { margin-bottom:20px; animation:cp-in .3s ease both; animation-delay:.05s; position:relative; z-index:100; }
        .cp-deliver-label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; margin-bottom:10px; }
        .cp-deliver-hint { font-size:11px; font-weight:600; margin-top:7px; display:flex; align-items:center; gap:5px; }
        .cp-list { display:flex; flex-direction:column; gap:10px; margin-bottom:20px; }
        .cp-card { display:flex; align-items:stretch; border-radius:20px; overflow:hidden; border:1.5px solid; transition:border-color .2s,box-shadow .2s,transform .18s; animation:cp-in .3s ease both; position:relative; }
        .cp-card:hover { transform:translateY(-2px); border-color:${ACCENT} !important; box-shadow:0 8px 28px rgba(255,107,0,0.14); }
        .cp-thumb { width:90px; min-width:90px; flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; pointer-events:none; }
        .cp-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .cp-body { flex:1; padding:14px 15px; min-width:0; display:flex; flex-direction:column; gap:9px; }
        .cp-name { font-family:'Syne',sans-serif; font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cp-vendor { display:flex; align-items:center; gap:4px; font-size:11px; font-weight:600; }
        .cp-row { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        .cp-price { font-family:'Syne',sans-serif; font-size:16px; font-weight:900; color:${ACCENT}; }
        .cp-qty { display:flex; align-items:center; gap:2px; background:rgba(255,107,0,0.09); border-radius:12px; padding:2px 3px; border:1px solid rgba(255,107,0,0.15); }
        .cp-qbtn { width:30px; height:30px; border-radius:10px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; color:${ACCENT}; position:relative; z-index:2; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
        .cp-qbtn:hover{background:rgba(255,107,0,0.2)} .cp-qbtn:active{background:rgba(255,107,0,0.35);transform:scale(0.92)}
        .cp-qnum { font-family:'Syne',sans-serif; font-size:15px; font-weight:800; color:${ACCENT}; min-width:24px; text-align:center; }
        .cp-del { background:none; border:none; cursor:pointer; padding:6px; border-radius:9px; display:flex; align-items:center; transition:background .15s; position:relative; z-index:2; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
        .cp-del:hover{background:rgba(239,68,68,0.12)} .cp-del:active{transform:scale(0.88);background:rgba(239,68,68,0.2)}
        .cp-summary { border-radius:24px; border:1.5px solid; padding:24px 22px; display:flex; flex-direction:column; gap:16px; animation:cp-in .45s ease both; }
        .cp-section-label { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; display:flex; align-items:center; gap:6px; margin-bottom:8px; }
        .cp-promo-row { display:flex; gap:8px; }
        .cp-promo-inp { flex:1; border-radius:13px; border:1.5px solid; padding:11px 15px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; outline:none; transition:border-color .2s,box-shadow .2s; }
        .cp-promo-inp:focus{border-color:${ACCENT};box-shadow:0 0 0 3px rgba(255,107,0,0.1)} .cp-promo-inp::placeholder{opacity:.5}
        .cp-promo-btn { background:${ACCENT}; color:#fff; border:none; border-radius:13px; padding:11px 20px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:700; cursor:pointer; transition:opacity .15s,transform .15s; }
        .cp-promo-btn:hover{opacity:.88;transform:translateY(-1px)}
        .cp-row-item { display:flex; align-items:flex-start; justify-content:space-between; font-size:13px; padding:3px 0; gap:8px; }
        .cp-divider { height:1px; border:none; margin:4px 0; }
        .cp-delivery-hint { font-size:10.5px; font-weight:600; margin-top:2px; opacity:.75; line-height:1.5; }
        .cp-approx-badge { display:inline-block; font-size:9px; font-weight:800; padding:2px 7px; border-radius:5px; background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.25); margin-left:6px; vertical-align:middle; }
        .cp-spin-el { display:inline-block; animation:cp-spin .7s linear infinite; }
        .cp-cta { width:100%; background:linear-gradient(135deg,${ACCENT},#FF9A00); color:#fff; border:none; border-radius:18px; padding:17px 24px; font-family:'Syne',sans-serif; font-size:16px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 8px 32px rgba(255,107,0,0.32); transition:transform .2s,box-shadow .2s; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
        .cp-cta:hover:not(:disabled){transform:translateY(-3px);box-shadow:0 16px 40px rgba(255,107,0,0.44)} .cp-cta:active:not(:disabled){transform:translateY(0)} .cp-cta:disabled{opacity:.45;cursor:not-allowed}
        .cp-secure { display:flex; align-items:center; justify-content:center; gap:6px; font-size:11px; font-weight:600; margin-top:2px; }
        @media(min-width:600px){.cp{padding:28px 24px 220px}} @media(min-width:1024px){.cp{padding:36px 48px 220px}}
      `}</style>

      <div className="cp" style={{ background: c.bg, color: c.txt }}>
        <div className="cp-in">

          <div className="cp-head">
            <div className="cp-accent-bar" />
            <h1 className="cp-title" style={{ color: c.txt }}>My Cart</h1>
            {cartCount > 0 && <div className="cp-badge">{cartCount} item{cartCount !== 1 ? "s" : ""}</div>}
          </div>

          {showPaymentModal && (
            <PaymentMethodModal total={total} walletBalance={walletBalance} walletLoading={walletLoading}
              onPaystack={handlePaystack} onWallet={handleWalletPay}
              onClose={() => setShowPaymentModal(false)} dark={dark} c={c} />
          )}

          {paySuccess && (
            <div className="cp-success">
              <div className="cp-success-ring"><FiCheckCircle size={48} color="#22c55e" /></div>
              <div style={{ fontFamily: "Syne,sans-serif", fontSize: 28, fontWeight: 900, color: "#22c55e" }}>Order Placed! 🎉</div>
              <p style={{ color: c.sub, fontSize: 14, lineHeight: 1.7, maxWidth: 280, textAlign: "center" }}>
                Payment successful. Your order is being processed and a rider will pick it up soon.
              </p>
            </div>
          )}

          {!paySuccess && cart.length === 0 && (
            <div className="cp-empty">
              <div className="cp-empty-ring"><FiShoppingCart size={38} color={ACCENT} /></div>
              <div className="cp-empty-title" style={{ color: c.txt }}>Your cart is empty</div>
              <p style={{ color: c.sub, fontSize: 14, lineHeight: 1.7, maxWidth: 260 }}>
                Browse products and tap <strong style={{ color: ACCENT }}>Add</strong> or{" "}
                <strong style={{ color: ACCENT }}>Buy</strong> to add items here.
              </p>
            </div>
          )}

          {!paySuccess && cart.length > 0 && (
            <>
              <div className="cp-deliver-section">
                <div className="cp-deliver-label" style={{ color: c.sub }}>
                  <FiMapPin size={12} color={ACCENT} />
                  <span style={{ color: c.txt }}>Deliver to</span>
                </div>
                <AddressPicker addresses={savedAddresses} selected={selectedAddress}
                  onSelect={addr => { setSelectedAddress(addr); lastCartSig.current = ""; }}
                  loading={addressesLoading} dark={dark} c={c} />
                {!selectedAddress && !addressesLoading && (
                  <div className="cp-deliver-hint" style={{ color: c.sub }}>
                    <FiNavigation size={11} color={ACCENT} />
                    Using your <strong style={{ color: c.txt }}>current GPS location</strong>.
                    {savedAddresses.length > 0 ? " Pick a saved address above for a more accurate fee." : " Save addresses in your profile for faster checkout."}
                  </div>
                )}
                {selectedAddress && !selectedAddress.lat && !addressesLoading && (
                  <div className="cp-deliver-hint" style={{ color: "#f59e0b" }}>⚠ This address has no exact pin — fee is estimated from the text address.</div>
                )}
                {selectedAddress?.lat && (
                  <div className="cp-deliver-hint" style={{ color: "#10B981" }}>✓ Exact coordinates on file — delivery fee is precise.</div>
                )}
              </div>

              <div className="cp-list">
                {cart.map((item, i) => (
                  <div key={item.name} className="cp-card" style={{ background: c.surf, borderColor: c.brd, animationDelay: `${i * 0.05}s` }}>
                    <div className="cp-thumb" style={{ background: "rgba(255,107,0,0.07)", minHeight: 92 }}>
                      {item.img ? <img src={item.img} alt={item.name} />
                        : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: dark ? "#333" : "#ccc" }}>
                            <FiPackage size={26} />
                            <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase" }}>No img</span>
                          </div>}
                    </div>
                    <div className="cp-body">
                      <div>
                        <div className="cp-name" style={{ color: c.txt }}>{item.name}</div>
                        {item.vendorName && (
                          <div className="cp-vendor" style={{ color: c.sub }}>
                            {item.vendorName}
                            {item.vendorVerified && <RiVerifiedBadgeFill size={11} color="#3b82f6" />}
                          </div>
                        )}
                      </div>
                      <div className="cp-row">
                        <span className="cp-price">{item.price}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="cp-qty">
                            <button className="cp-qbtn" type="button" onPointerDown={e => { e.stopPropagation(); removeOne(item.name); }}><FiMinus size={13} /></button>
                            <span className="cp-qnum">{item.qty}</span>
                            <button className="cp-qbtn" type="button" onPointerDown={e => { e.stopPropagation(); addToCart({ name: item.name, price: item.price, img: item.img, vendorName: item.vendorName, vendorVerified: item.vendorVerified, vendorLat: item.vendorLat, vendorLng: item.vendorLng }); }}><FiPlus size={13} /></button>
                          </div>
                          <button className="cp-del" type="button" style={{ color: c.dim }} onPointerDown={e => { e.stopPropagation(); clearItem(item.name); }}><FiTrash2 size={15} /></button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: c.sub }}>
                        Line total: <span style={{ color: c.txt, fontWeight: 700 }}>₦{(parsePrice(item.price) * item.qty).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="cp-summary" style={{ background: c.surf, borderColor: c.brd }}>
                <div>
                  <div className="cp-section-label" style={{ color: c.sub }}><FiTag size={12} color={ACCENT} /> Promo Code</div>
                  <div className="cp-promo-row">
                    <input className="cp-promo-inp"
                      style={{ background: c.inp, borderColor: promoApplied ? "#22c55e" : c.inpB, color: c.txt }}
                      placeholder="Try SWIFT10 for 10% off"
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value); setPromoErr(""); setPromoApplied(false); setPromoData(null); }}
                      disabled={promoApplied} />
                    {promoApplied
                      ? <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#22c55e", fontWeight: 700, fontSize: 13, padding: "0 10px" }}><FiCheckCircle size={16} /> Applied!</div>
                      : <button className="cp-promo-btn" onClick={handlePromo}>Apply</button>}
                  </div>
                  {promoErr && <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, marginTop: 7 }}>✕ {promoErr}</div>}
                </div>

                <hr className="cp-divider" style={{ background: c.brd }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="cp-row-item">
                    <span style={{ color: c.sub, fontWeight: 600 }}>Subtotal ({cartCount} item{cartCount !== 1 ? "s" : ""})</span>
                    <span style={{ color: c.txt, fontWeight: 700 }}>₦{subtotal.toLocaleString()}</span>
                  </div>
                  {promoApplied && (
                    <div className="cp-row-item">
                      <span style={{ color: "#22c55e", fontWeight: 600 }}>Discount ({promoData?.type === "percentage" ? `${promoData.value}%` : "fixed"})</span>
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>−₦{discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="cp-row-item">
                    <div>
                      <div style={{ color: c.sub, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                        <FiMapPin size={12} color={ACCENT} /> Delivery fee
                        {anyEstimated && <span className="cp-approx-badge">~ estimated</span>}
                      </div>
                      {deliveryBreakdown && !deliveryLoading && <div className="cp-delivery-hint" style={{ color: c.sub }}>{deliveryBreakdown}</div>}
                    </div>
                    <span style={{ color: c.txt, fontWeight: 700, flexShrink: 0 }}>
                      {deliveryLoading ? <span className="cp-spin-el">⟳</span> : deliveryFee > 0 ? `₦${deliveryFee.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <hr className="cp-divider" style={{ background: c.brd }} />
                  <div className="cp-row-item">
                    <span style={{ fontFamily: "Syne,sans-serif", fontSize: 16, fontWeight: 800, color: c.txt }}>Total</span>
                    <span style={{ fontFamily: "Syne,sans-serif", fontSize: 22, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</span>
                  </div>
                </div>

                <button className="cp-cta" onClick={handleCheckoutClick}
                  disabled={checkoutLoading || deliveryLoading || cart.length === 0}>
                  {checkoutLoading
                    ? <><span className="cp-spin-el">⟳</span> Processing...</>
                    : <><FiZap size={18} /> Proceed to Checkout <FiArrowRight size={18} /></>}
                </button>

                <div className="cp-secure" style={{ color: c.dim }}>
                  <FiShield size={12} /> Secured by Paystack · End-to-end encrypted
                </div>
              </div>
            </>
          )}

          <div style={{ height: 80 }} />
        </div>
      </div>

      {pendingOrderId && (
        <PendingOrderBanner orderId={pendingOrderId} status={pendingOrderStatus}
          onTrack={() => navigate(`/orders/${pendingOrderId}/track`)} />
      )}
    </>
  );
}