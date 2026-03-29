// pages/SendPickup.tsx
// Full flow: Service Mode → Vehicle/Size → Details → Payment → Order → Live Tracking
// Pricing matrix: 3 vehicle types × 2 service modes (office drop-off vs doorstep pickup)

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiPackage, FiMapPin, FiUser, FiPhone,
  FiCheck, FiTruck, FiShield, FiChevronRight, FiNavigation,
  FiSearch, FiX, FiAlertCircle, FiClock,
} from "react-icons/fi";
import { MdMyLocation } from "react-icons/md";
import { RiMotorbikeFill, RiWalletLine, RiCarLine } from "react-icons/ri";
import {
  collection, doc, addDoc, onSnapshot, serverTimestamp,
  getDoc, query, where, orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import AddressMap from "../components/Addressmap";

// ─── Types ────────────────────────────────────────────────────────────────────
type SelectedLocation = {
  address: string; lat: number; lng: number;
  landmark?: string; label?: string; source?: string;
};
type Mode        = "home" | "send" | "pickup";
type VehicleType = "bike" | "car" | "van" | null;
type ServiceMode = "office" | "doorstep"; // office = bring it to us, doorstep = we come to you
type PayMethod   = "paystack" | "wallet" | null;
interface Loc    { address: string; lat: number; lng: number; landmark?: string; }

interface SendForm {
  senderName: string; senderPhone: string;
  recipientName: string; recipientPhone: string;
  description: string; vehicleType: VehicleType;
  serviceMode: ServiceMode;
  pickup: Loc | null; dropoff: Loc | null;
}
interface PickForm {
  name: string; phone: string; loc: Loc | null;
  desc: string; vehicleType: VehicleType;
}

interface DeliveryOrder {
  id: string; status: string; orderNumber: string;
  riderName?: string; riderPhone?: string;
  riderLat?: number; riderLng?: number;
  estimatedMinutes?: number;
  customerPickupCode?: string;
  pickupAddress: string; dropoffAddress: string;
  total: number; type: "send" | "pickup"; createdAt?: unknown;
}

// ─── Pricing Matrix ───────────────────────────────────────────────────────────
// Each entry: { baseFee, perKm, platformFee, commissionPct }
// officeBaseFee = customer brings package to your office (cheaper)
// doorstepBaseFee = rider goes to customer first (more expensive)
interface VehiclePricing {
  officeDrop: { baseFee: number; perKm: number; platformFee: number; commissionPct: number };
  doorstep:   { baseFee: number; perKm: number; platformFee: number; commissionPct: number };
  label: string;
  sub: string;
  weight: string;
  icon: React.ReactNode;
  img: string;
  badge: string;
}

const DEFAULT_PRICING: Record<NonNullable<VehicleType>, VehiclePricing> = {
  bike: {
    officeDrop: { baseFee: 500,  perKm: 150, platformFee: 200, commissionPct: 10 },
    doorstep:   { baseFee: 1200, perKm: 150, platformFee: 200, commissionPct: 10 },
    label: "Bike / Small Box",
    sub: "Documents, parcels, food. Up to 5 kg.",
    weight: "Up to 5 kg",
    icon: <RiMotorbikeFill size={13} />,
    img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80",
    badge: "BIKE",
  },
  car: {
    officeDrop: { baseFee: 1500, perKm: 350, platformFee: 500, commissionPct: 12 },
    doorstep:   { baseFee: 3500, perKm: 350, platformFee: 500, commissionPct: 12 },
    label: "Car / Big Box",
    sub: "Boxes, appliances, mid-size goods. 5–50 kg.",
    weight: "5–50 kg",
    icon: <RiCarLine size={13} />,
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=700&q=80",
    badge: "CAR",
  },
  van: {
    officeDrop: { baseFee: 3500,  perKm: 600, platformFee: 1000, commissionPct: 15 },
    doorstep:   { baseFee: 8000,  perKm: 600, platformFee: 1000, commissionPct: 15 },
    label: "Van / Multiple Boxes",
    sub: "Furniture, bulk goods, multiple large boxes.",
    weight: "50 kg +",
    icon: <FiTruck size={13} />,
    img: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=700&q=80",
    badge: "VAN",
  },
};

// Live pricing state — fetched from Firestore platformSettings on mount
let livePricing = { ...DEFAULT_PRICING };

// ─── Pricing helpers ──────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPrice(vehicle: NonNullable<VehicleType>, serviceMode: ServiceMode, km: number) {
  const tier = livePricing[vehicle][serviceMode === "office" ? "officeDrop" : "doorstep"];
  const delivery = tier.baseFee + km * tier.perKm;
  const commission = delivery * (tier.commissionPct / 100);
  const total = Math.round(delivery + tier.platformFee);
  const riderEarnings = Math.round(delivery - commission);
  const swiftEarnings = Math.round(tier.platformFee + commission);
  return { delivery: Math.round(delivery), total, riderEarnings, swiftEarnings, ...tier };
}

function genOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  return `ORD-${ymd}-${Math.floor(10000 + Math.random() * 90000)}`;
}

function genPickupCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ─── Paystack inline ──────────────────────────────────────────────────────────
function openPaystackPopup(opts: {
  email: string; amount: number; reference: string; publicKey: string;
  onSuccess: (ref: string) => void; onClose: () => void;
}) {
  const launch = () => {
    const handler = (window as any).PaystackPop.setup({
      key: opts.publicKey, email: opts.email, amount: opts.amount * 100,
      ref: opts.reference, currency: "NGN",
      channels: ["card", "bank", "ussd", "qr", "bank_transfer"],
      onClose: opts.onClose,
      callback: (r: any) => opts.onSuccess(r.reference),
    });
    handler.openIframe();
  };
  const script = document.getElementById("paystack-js");
  if ((window as any).PaystackPop) { launch(); return; }
  if (!script) {
    const s = document.createElement("script");
    s.id = "paystack-js"; s.src = "https://js.paystack.co/v1/inline.js"; s.onload = launch;
    document.head.appendChild(s);
  } else { script.addEventListener("load", launch, { once: true }); }
}

// ─── usePlaces ────────────────────────────────────────────────────────────────
function usePlaces() {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;
  const sessionToken = useRef<any>(null);
  const getToken = () => {
    if (!sessionToken.current && window.google?.maps?.places?.AutocompleteSessionToken)
      sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
    return sessionToken.current;
  };
  const rotateToken = () => { sessionToken.current = null; };

  const search = useCallback(async (input: string) => {
    if (!input || input.length < 3 || !apiKey) return [];
    if (typeof window.google?.maps?.places?.AutocompleteService === "function") {
      try {
        const svc = new window.google.maps.places.AutocompleteService();
        const baseOpts = {
          bounds: new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(6.2, 2.7),
            new window.google.maps.LatLng(6.8, 4.4)
          ),
          componentRestrictions: { country: "NG" }, sessionToken: getToken(),
          location: new window.google.maps.LatLng(6.5833, 3.9833), radius: 60000,
        };
        const [a, b] = await Promise.all([
          new Promise<any[]>(res => svc.getPlacePredictions({ ...baseOpts, input, types: ["establishment"] }, (r: any, s: string) => res(s === "OK" && r ? r : []))),
          new Promise<any[]>(res => svc.getPlacePredictions({ ...baseOpts, input, types: ["address"] }, (r: any, s: string) => res(s === "OK" && r ? r : []))),
        ]);
        const seen = new Set<string>();
        return [...a, ...b].filter(p => { if (seen.has(p.place_id)) return false; seen.add(p.place_id); return true; }).slice(0, 8).map((p: any) => ({ placeId: p.place_id, text: p.description }));
      } catch {}
    }
    try {
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input + ", Lagos, Nigeria")}&key=${apiKey}&region=ng`);
      const d = await r.json();
      return (d.results ?? []).slice(0, 8).map((r: any) => ({ placeId: r.place_id, text: r.formatted_address }));
    } catch { return []; }
  }, [apiKey]);

  const resolve = useCallback(async (placeId: string) => {
    if (!placeId || !apiKey) return null;
    if (typeof window.google?.maps?.places?.PlacesService === "function") {
      try {
        const result = await new Promise<{ lat: number; lng: number; address: string } | null>(res => {
          const svc = new window.google.maps.places.PlacesService(document.createElement("div"));
          svc.getDetails({ placeId, fields: ["geometry", "formatted_address"] }, (place: any, status: string) => {
            if (status !== "OK" || !place?.geometry?.location) { res(null); return; }
            res({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address || "" });
          });
        });
        if (result) { rotateToken(); return result; }
      } catch {}
    }
    try {
      const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${apiKey}`);
      const data = await r.json();
      const result = data.results?.[0];
      if (!result) return null;
      rotateToken();
      return { lat: result.geometry.location.lat, lng: result.geometry.location.lng, address: result.formatted_address || "" };
    } catch { return null; }
  }, [apiKey]);

  return { search, resolve };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = "#FF6B00";

// ─── LocInput ─────────────────────────────────────────────────────────────────
function LocInput({ label, placeholder, value, onChange, dotColor = ACCENT }: {
  label: string; placeholder: string; value: Loc | null;
  onChange: (l: Loc) => void; dotColor?: string;
}) {
  const { search, resolve } = usePlaces();
  const [q, setQ] = useState(value?.address || "");
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = (val: string) => {
    setQ(val); setNotFound(false);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.length < 3) { setSuggestions([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const r = await search(val);
      setSuggestions(r); setNotFound(r.length === 0); setLoading(false);
    }, 500);
  };

  const pick = async (placeId: string, text: string) => {
    setSuggestions([]); setLoading(true);
    const d = await resolve(placeId);
    setLoading(false);
    if (d) { setQ(d.address || text); setNotFound(false); onChange({ address: d.address || text, lat: d.lat, lng: d.lng }); }
    else { setQ(text); setNotFound(true); }
  };

  const confirmed = value && value.lat !== 0 && value.lng !== 0;

  return (
    <>
      {showMap && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", width: "100vw", height: "100dvh", overflow: "hidden", background: "#0a0a0d" }}>
          <AddressMap savedAddresses={[]} defaultAddressId="" onConfirm={(loc: SelectedLocation) => { setQ(loc.address); setNotFound(false); setShowMap(false); onChange({ address: loc.address, lat: loc.lat, lng: loc.lng, landmark: loc.landmark }); }} onClose={() => setShowMap(false)} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
        <label style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#16161b", border: `1.5px solid ${confirmed ? dotColor : notFound ? "#ef4444" : "#1e1e26"}`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ width: 10, height: 10, borderRadius: dotColor === ACCENT ? "50%" : 3, background: confirmed ? dotColor : notFound ? "#ef4444" : "#44445a", flexShrink: 0 }} />
          <FiSearch size={12} color="#44445a" style={{ flexShrink: 0 }} />
          <input value={q} onChange={e => handleInput(e.target.value)} placeholder={placeholder} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontFamily: "'Nunito',sans-serif", fontSize: 13, fontWeight: 600 }} />
          {loading && <span style={{ width: 14, height: 14, border: "2px solid rgba(255,107,0,.3)", borderTopColor: ACCENT, borderRadius: "50%", animation: "sp-spin .7s linear infinite", flexShrink: 0 }} />}
          {confirmed && !loading && <FiCheck size={13} color={dotColor} style={{ flexShrink: 0 }} />}
          {q && !loading && <button onClick={() => { setQ(""); setSuggestions([]); setNotFound(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#44445a", display: "flex", padding: 2 }}><FiX size={13} /></button>}
        </div>
        {suggestions.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 300, background: "#111115", border: "1.5px solid #1e1e26", borderRadius: 14, overflow: "hidden", boxShadow: "0 14px 40px rgba(0,0,0,.7)", marginTop: 4 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => pick(s.placeId, s.text)} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "12px 14px", background: "transparent", border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid #1e1e26" : "none", color: "#8888a0", fontFamily: "'Nunito',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,107,0,.08)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <FiMapPin size={12} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ lineHeight: 1.4 }}>{s.text}</span>
              </button>
            ))}
            <button onClick={() => { setSuggestions([]); setShowMap(true); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", background: "rgba(255,107,0,.04)", border: "none", borderTop: "1px solid #1e1e26", color: ACCENT, fontFamily: "'Nunito',sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <MdMyLocation size={14} color={ACCENT} /> Can't find it? Drop a pin on the map
            </button>
          </div>
        )}
        {notFound && !loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", fontSize: 12, fontWeight: 700, color: "#f87171" }}>
            <FiAlertCircle size={13} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>Address not found.{" "}<button onClick={() => setShowMap(true)} style={{ background: "none", border: "none", cursor: "pointer", color: ACCENT, fontWeight: 900, fontSize: 12, fontFamily: "'Nunito',sans-serif", padding: 0, textDecoration: "underline" }}>Drop a pin →</button></div>
          </div>
        )}
        {confirmed && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#44445a", padding: "4px 2px" }}><FiCheck size={10} color={dotColor} /><span style={{ color: dotColor === ACCENT ? ACCENT : "#3b82f6", fontWeight: 700 }}>Location pinned</span><span>· {value!.lat.toFixed(4)}, {value!.lng.toFixed(4)}</span></div>}
        {!confirmed && !notFound && q.length < 3 && (
          <button onClick={() => setShowMap(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: "rgba(255,107,0,.06)", border: "1.5px dashed rgba(255,107,0,.3)", color: ACCENT, fontFamily: "'Nunito',sans-serif", fontSize: 12, fontWeight: 800, width: "100%" }}>
            <MdMyLocation size={15} /> Or tap to pin location on map
          </button>
        )}
      </div>
    </>
  );
}

// ─── TIn ──────────────────────────────────────────────────────────────────────
function TIn({ label, value, onChange, placeholder, type = "text", icon }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; icon?: React.ReactNode; }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#16161b", border: "1.5px solid #1e1e26", borderRadius: 12, padding: "12px 14px" }}>
        {icon && <span style={{ color: "#44445a", flexShrink: 0 }}>{icon}</span>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontFamily: "'Nunito',sans-serif", fontSize: 13, fontWeight: 600 }} />
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────
function Steps({ cur, labels }: { cur: number; labels: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "16px 20px 0" }}>
      {labels.map((lbl, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: cur > i + 1 ? ACCENT : cur === i + 1 ? "rgba(255,107,0,.15)" : "#1e1e26", border: `2px solid ${cur >= i + 1 ? ACCENT : "#2a2a36"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {cur > i + 1 ? <FiCheck size={11} color="white" /> : <span style={{ fontSize: 10, fontWeight: 900, color: cur === i + 1 ? ACCENT : "#44445a" }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: cur === i + 1 ? ACCENT : "#44445a", textTransform: "uppercase", letterSpacing: ".5px", textAlign: "center" }}>{lbl}</span>
          </div>
          {i < labels.length - 1 && <div style={{ height: 2, flex: 1, marginBottom: 16, background: cur > i + 1 ? ACCENT : "#1e1e26" }} />}
        </div>
      ))}
    </div>
  );
}

// ─── PriceCard ────────────────────────────────────────────────────────────────
function PriceCard({ vehicle, serviceMode, pickup, dropoff }: { vehicle: NonNullable<VehicleType>; serviceMode: ServiceMode; pickup: Loc | null; dropoff: Loc | null }) {
  if (!pickup || !dropoff) return null;
  const km = haversine(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const p = calcPrice(vehicle, serviceMode, km);
  return (
    <div style={{ background: "rgba(255,107,0,.07)", border: "1.5px solid rgba(255,107,0,.22)", borderRadius: 16, padding: 16, marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><FiNavigation size={11} /> Estimated Cost</div>
      {[
        { l: "Distance", v: `${km.toFixed(1)} km` },
        { l: `Base fee (${serviceMode === "office" ? "Economy Hub" : "Doorstep Pickup"})`, v: `₦${p.baseFee.toLocaleString()}` },
        { l: `Per km (₦${p.perKm})`, v: `₦${Math.round(km * p.perKm).toLocaleString()}` },
        { l: `Platform fee`, v: `₦${p.platformFee.toLocaleString()}` },
        { l: `Swift9ja commission (${p.commissionPct}%)`, v: `₦${Math.round(p.delivery * p.commissionPct / 100).toLocaleString()}` },
      ].map((r, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#8888a0", marginBottom: 7 }}><span>{r.l}</span><span>{r.v}</span></div>
      ))}
      <div style={{ height: 1, background: "rgba(255,107,0,.2)", margin: "8px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 900, fontFamily: "'Syne',sans-serif" }}>
        <span style={{ color: "#e8e8f0" }}>Total</span><span style={{ color: ACCENT }}>₦{p.total.toLocaleString()}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#44445a", marginTop: 8 }}>
        <span>Rider earns: ₦{p.riderEarnings.toLocaleString()}</span>
        <span>Swift9ja: ₦{p.swiftEarnings.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTA({ onBack, onNext, disabled, label, loading }: { onBack?: () => void; onNext: () => void; disabled?: boolean; label: string; loading?: boolean; }) {
  return (
    <div style={{ position: "fixed", bottom: 68, left: 0, right: 0, padding: "14px 18px", background: "linear-gradient(to top,#0a0a0d 60%,transparent)", zIndex: 50, display: "flex", gap: 10 }}>
      {onBack && <button onClick={onBack} style={{ width: 50, height: 52, borderRadius: 13, border: "1.5px solid #1e1e26", background: "#16161b", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FiArrowLeft size={16} /></button>}
      <button disabled={disabled || loading} onClick={onNext} style={{ flex: 1, padding: "15px 0", borderRadius: 14, border: "none", background: (!disabled && !loading) ? `linear-gradient(135deg,${ACCENT},#FF8C00)` : "#1e1e26", color: (!disabled && !loading) ? "white" : "#44445a", fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, cursor: (!disabled && !loading) ? "pointer" : "not-allowed", boxShadow: (!disabled && !loading) ? "0 8px 28px rgba(255,107,0,.35)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {loading ? <><span style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,.3)", borderTopColor: "white", borderRadius: "50%", animation: "sp-spin .7s linear infinite" }} /> Processing…</> : label}
      </button>
    </div>
  );
}

// ─── SHead ────────────────────────────────────────────────────────────────────
function SHead({ icon, title, bg }: { icon: React.ReactNode; title: string; bg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: "#e8e8f0" }}>{title}</span>
    </div>
  );
}

// ─── Service Mode Toggle ──────────────────────────────────────────────────────
function ServiceModeToggle({ value, onChange }: { value: ServiceMode; onChange: (v: ServiceMode) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Service Type</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([
          { k: "office" as ServiceMode, label: "Economy Hub", sub: "You bring it to our office. Save more.", emoji: "🏢", tag: "CHEAPER" },
          { k: "doorstep" as ServiceMode, label: "Doorstep Pickup", sub: "We send a rider to collect from you.", emoji: "🏍️", tag: "PRIORITY" },
        ] as const).map(opt => (
          <div key={opt.k} onClick={() => onChange(opt.k)} style={{ border: `2px solid ${value === opt.k ? ACCENT : "#1e1e26"}`, borderRadius: 16, padding: "14px 12px", cursor: "pointer", background: value === opt.k ? "rgba(255,107,0,.06)" : "#16161b", transition: "all .2s", position: "relative" }}>
            {value === opt.k && <div style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}><FiCheck size={10} color="white" /></div>}
            <div style={{ fontSize: 22, marginBottom: 8 }}>{opt.emoji}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, color: value === opt.k ? ACCENT : "#e8e8f0", marginBottom: 4 }}>{opt.label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#66668a", lineHeight: 1.4, marginBottom: 8 }}>{opt.sub}</div>
            <span style={{ fontSize: 9, fontWeight: 900, color: opt.k === "office" ? "#10b981" : ACCENT, background: opt.k === "office" ? "rgba(16,185,129,.12)" : "rgba(255,107,0,.12)", padding: "3px 8px", borderRadius: 20, letterSpacing: ".5px" }}>{opt.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vehicle Picker ───────────────────────────────────────────────────────────
function VehiclePicker({ value, serviceMode, onChange }: { value: VehicleType; serviceMode: ServiceMode; onChange: (v: VehicleType) => void }) {
  const vehicles = (["bike", "car", "van"] as NonNullable<VehicleType>[]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {vehicles.map(vk => {
        const cfg = livePricing[vk];
        const tier = serviceMode === "office" ? cfg.officeDrop : cfg.doorstep;
        const selected = value === vk;
        return (
          <div key={vk} onClick={() => onChange(vk)} style={{ border: `2px solid ${selected ? ACCENT : "#1e1e26"}`, borderRadius: 20, overflow: "hidden", cursor: "pointer", background: selected ? "rgba(255,107,0,.06)" : "#16161b", transition: "all .25s" }}>
            <div style={{ height: 160, position: "relative", overflow: "hidden" }}>
              <img src={cfg.img} alt={cfg.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 50%)" }} />
              {selected && <div style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}><FiCheck size={14} color="white" /></div>}
              <div style={{ position: "absolute", top: 12, left: 12 }}>
                <span style={{ background: selected ? ACCENT : "rgba(0,0,0,.55)", color: "white", fontSize: 10, fontWeight: 900, padding: "4px 10px", borderRadius: 20 }}>{cfg.badge}</span>
              </div>
              <div style={{ position: "absolute", bottom: 12, left: 14, right: 14 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ background: "rgba(0,0,0,.55)", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{cfg.weight}</span>
                  <span style={{ background: "rgba(255,107,0,.7)", color: "white", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>From ₦{tier.baseFee.toLocaleString()}</span>
                  <span style={{ background: "rgba(0,0,0,.55)", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>₦{tier.perKm}/km</span>
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, color: "#e8e8f0", marginBottom: 4 }}>{cfg.label}</div>
              <div style={{ fontSize: 12, color: "#66668a", fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>{cfg.sub}</div>
              <div style={{ fontSize: 11, color: "#44445a", fontWeight: 700 }}>Platform fee: ₦{tier.platformFee.toLocaleString()} + {tier.commissionPct}% commission</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── STATUS STEPS ─────────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { key: "pending",        label: "Order Placed",      sub: "Finding a rider for you…" },
  { key: "finding_rider",  label: "Finding Rider",      sub: "Searching for available riders…" },
  { key: "rider_assigned", label: "Rider Assigned",     sub: "Rider is on the way to pickup" },
  { key: "picked_up",      label: "Package Picked Up",  sub: "Rider is heading to drop-off" },
  { key: "arriving",       label: "Almost There",       sub: "Rider is arriving at destination" },
  { key: "delivered",      label: "Delivered ✓",        sub: "Package delivered successfully!" },
];

// ─── TrackingPage ─────────────────────────────────────────────────────────────
function TrackingPage({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "deliveryRequests", orderId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
     setOrder({
  id: snap.id, status: d.status || "pending",
  orderNumber: d.orderNumber || snap.id.slice(-8).toUpperCase(),
  riderName: d.riderName, riderPhone: d.riderPhone,
  riderLat: d.riderLat, riderLng: d.riderLng, estimatedMinutes: d.estimatedMinutes,
  pickupAddress: d.pickupAddress || d.pickup?.address || "—",
  dropoffAddress: d.dropoffAddress || d.dropoff?.address || "—",
  total: d.total || 0, type: d.type || "send", createdAt: d.createdAt,
  customerPickupCode: d.customerPickupCode, // ← ADD HERE
});
      setLoading(false);
    });
    return () => unsub();
  }, [orderId]);

  const currentStepIdx = order ? STATUS_STEPS.findIndex(s => s.key === order.status) : 0;
  const isDelivered = order?.status === "delivered";

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
      <div style={{ padding: "22px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>Order ID</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: ACCENT }}>#{order?.orderNumber || "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>Total Paid</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#e8e8f0" }}>₦{order?.total.toLocaleString() || "—"}</div>
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#66668a" }}>
            <div style={{ width: 36, height: 36, border: `3px solid rgba(255,107,0,.3)`, borderTopColor: ACCENT, borderRadius: "50%", animation: "sp-spin .7s linear infinite", margin: "0 auto 16px" }} />
            Loading order details…
          </div>
        ) : (
          <>
            <div style={{ background: "#16161b", border: "1.5px solid #1e1e26", borderRadius: 18, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 16 }}>Delivery Progress</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {STATUS_STEPS.map((step, i) => {
                  const isDone = i < currentStepIdx, isCurrent = i === currentStepIdx;
                  return (
                    <div key={step.key} style={{ display: "flex", gap: 12, position: "relative" }}>
                      {i < STATUS_STEPS.length - 1 && <div style={{ position: "absolute", left: 11, top: 24, width: 2, height: "calc(100% - 8px)", background: isDone ? ACCENT : "#1e1e2c", zIndex: 0 }} />}
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: isDone ? ACCENT : isCurrent ? "rgba(255,107,0,.15)" : "#111115", border: `2px solid ${isDone || isCurrent ? ACCENT : "#2a2a36"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                        {isDone ? <FiCheck size={11} color="white" /> : isCurrent ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, animation: "sp-pulse 1.5s infinite" }} /> : null}
                      </div>
                      <div style={{ paddingBottom: i < STATUS_STEPS.length - 1 ? 20 : 0, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: isCurrent ? 900 : 700, color: isDone ? "#e8e8f0" : isCurrent ? ACCENT : "#44445a", fontFamily: isCurrent ? "'Syne',sans-serif" : "inherit" }}>{step.label}</div>
                        {isCurrent && <div style={{ fontSize: 11, fontWeight: 600, color: "#66668a", marginTop: 2 }}>{step.sub}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {order?.riderName && !["pending","finding_rider"].includes(order.status) && (
              <div style={{ background: "rgba(255,107,0,.07)", border: "1.5px solid rgba(255,107,0,.22)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12 }}>Your Rider</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg,${ACCENT},#FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center" }}><RiMotorbikeFill size={22} color="white" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, color: "#e8e8f0" }}>{order.riderName}</div>
                    {order.riderPhone && <div style={{ fontSize: 12, fontWeight: 600, color: "#66668a", marginTop: 2 }}>{order.riderPhone}</div>}
                  </div>
                  {order.riderPhone && <a href={`tel:${order.riderPhone}`} style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,107,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, textDecoration: "none" }}><FiPhone size={16} /></a>}
                </div>
                {order.estimatedMinutes && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 13, fontWeight: 700, color: "#e8e8f0" }}><FiClock size={13} color={ACCENT} /> ETA: ~{order.estimatedMinutes} minutes</div>}
              </div>
            )}

            {order?.riderName && order.status === "arriving" && (
  <div style={{
    background: "rgba(139,92,246,.08)",
    border: "1.5px solid rgba(139,92,246,.3)",
    borderRadius: 16,
    padding: "16px 18px",
    marginBottom: 16,
    textAlign: "center",
  }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>
      Your Delivery Code
    </div>
    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 36, fontWeight: 900, color: "#8B5CF6", letterSpacing: 10, marginBottom: 6 }}>
      {order.customerPickupCode ?? "—"}
    </div>
    <div style={{ fontSize: 12, fontWeight: 600, color: "#66668a" }}>
      Show this code to your rider to confirm delivery
    </div>
  </div>
)}

            <div style={{ background: "#16161b", border: "1.5px solid #1e1e26", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, paddingTop: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: ACCENT }} />
                  <div style={{ flex: 1, width: 2, background: "linear-gradient(to bottom,#FF6B00,#3b82f6)", minHeight: 30 }} />
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: "#3b82f6" }} />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div><div style={{ fontSize: 10, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>Pickup</div><div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8f0", lineHeight: 1.4 }}>{order?.pickupAddress}</div></div>
                  <div><div style={{ fontSize: 10, fontWeight: 800, color: "#3b82f6", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 2 }}>Drop-off</div><div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8f0", lineHeight: 1.4 }}>{order?.dropoffAddress}</div></div>
                </div>
              </div>
            </div>
            {isDelivered && (
              <div style={{ textAlign: "center", padding: "24px 16px", background: "rgba(16,185,129,.08)", border: "1.5px solid rgba(16,185,129,.25)", borderRadius: 18, marginBottom: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "#10b981", marginBottom: 6 }}>Delivered Successfully!</div>
              </div>
            )}
            {["pending","finding_rider"].includes(order?.status || "") && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(255,107,0,.06)", border: "1.5px dashed rgba(255,107,0,.25)", borderRadius: 14, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", animation: "sp-pulse 1.5s infinite" }}><RiMotorbikeFill size={18} color={ACCENT} /></div>
                <div><div style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0" }}>Finding your rider…</div><div style={{ fontSize: 11, fontWeight: 600, color: "#66668a", marginTop: 2 }}>Usually 2–10 minutes. We'll notify you.</div></div>
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ padding: "0 18px" }}>
        <button onClick={onBack} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #1e1e26", background: "#16161b", color: "#8888a0", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>← Back to Home</button>
      </div>
    </div>
  );
}

// ─── PaymentStep ──────────────────────────────────────────────────────────────
function PaymentStep({ total, onBack, onPay, submitting }: { total: number; onBack: () => void; onPay: (method: PayMethod) => void; submitting: boolean; }) {
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [selected, setSelected] = useState<PayMethod>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoadingWallet(false); return; }
    getDoc(doc(db, "wallets", uid)).then(snap => {
      setWalletBalance(snap.exists() ? (snap.data()?.balance ?? 0) : 0);
      setLoadingWallet(false);
    }).catch(() => { setWalletBalance(0); setLoadingWallet(false); });
  }, []);

  const canAffordWallet = walletBalance !== null && walletBalance >= total;

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 140 }}>
      <Steps cur={4} labels={["Mode", "Vehicle", "Details", "Pay"]} />
      <div style={{ padding: "22px 18px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "#e8e8f0", marginBottom: 6 }}>Choose Payment</h2>
          <p style={{ fontSize: 13, color: "#66668a", fontWeight: 600 }}>How would you like to pay?</p>
        </div>
        <div style={{ background: "rgba(255,107,0,.07)", border: "1.5px solid rgba(255,107,0,.22)", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#8888a0" }}>Amount to pay</span>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: ACCENT }}>₦{total.toLocaleString()}</span>
        </div>
        {[
          { key: "paystack" as PayMethod, icon: "💳", title: "Pay with Paystack", sub: "Card, bank transfer, USSD, QR", color: "rgba(0,173,99,.15)", border: "rgba(0,173,99,.3)", disabled: false, balanceText: null },
          { key: "wallet" as PayMethod, icon: null, title: "SwiftNija Wallet", sub: null, color: "rgba(139,92,246,.15)", border: "rgba(139,92,246,.3)", disabled: !canAffordWallet, balanceText: loadingWallet ? "Loading balance…" : `Balance: ₦${(walletBalance ?? 0).toLocaleString()}${!canAffordWallet ? " — insufficient" : ""}` },
        ].map(opt => (
          <div key={String(opt.key)} onClick={() => !opt.disabled && setSelected(opt.key)} style={{ border: `2px solid ${selected === opt.key ? ACCENT : "#1e1e26"}`, borderRadius: 16, padding: 16, cursor: opt.disabled ? "not-allowed" : "pointer", background: selected === opt.key ? "rgba(255,107,0,.06)" : "#16161b", opacity: opt.disabled ? 0.5 : 1, transition: "all .2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: opt.color, border: `1px solid ${opt.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {opt.icon ? <span style={{ fontSize: 20 }}>{opt.icon}</span> : <RiWalletLine size={22} color="#8B5CF6" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: "#e8e8f0" }}>{opt.title}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: opt.balanceText ? (canAffordWallet ? "#10b981" : "#ef4444") : "#66668a", marginTop: 2 }}>{opt.balanceText || opt.sub}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${selected === opt.key ? ACCENT : "#2a2a36"}`, background: selected === opt.key ? ACCENT : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected === opt.key && <FiCheck size={12} color="white" />}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#44445a" }}>
          <FiShield size={10} color={ACCENT} /> Secured · All payments are encrypted
        </div>
      </div>
      <CTA onBack={onBack} onNext={() => selected && onPay(selected)} disabled={!selected} label={selected === "wallet" ? `Pay ₦${total.toLocaleString()} from Wallet` : `Pay ₦${total.toLocaleString()} with Paystack`} loading={submitting} />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SEND FLOW
// ══════════════════════════════════════════════════════
function SendFlow({ onBack, onOrderCreated }: { onBack: () => void; onOrderCreated: (id: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState<SendForm>({
    senderName: "", senderPhone: "", recipientName: "", recipientPhone: "",
    description: "", vehicleType: null, serviceMode: "doorstep",
    pickup: null, dropoff: null,
  });
  const s = <K extends keyof SendForm>(k: K, v: SendForm[K]) => setF(p => ({ ...p, [k]: v }));
  const km = f.pickup && f.dropoff ? haversine(f.pickup.lat, f.pickup.lng, f.dropoff.lat, f.dropoff.lng) : 0;
  const p = f.vehicleType ? calcPrice(f.vehicleType, f.serviceMode, km) : null;
  const ok3 = !!(f.senderName && f.senderPhone && f.recipientName && f.recipientPhone && f.pickup && f.dropoff);
  const PUBKEY = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string;

  const createOrder = async (paymentRef: string, payMethod: string): Promise<string> => {
    const user = auth.currentUser;
    const pr = calcPrice(f.vehicleType!, f.serviceMode, km);
    const docRef = await addDoc(collection(db, "deliveryRequests"), {
      type: "send", orderNumber: genOrderNumber(), status: "finding_rider",
      userId: user?.uid || null, customerName: f.senderName, customerPhone: f.senderPhone,
      customerEmail: user?.email || null, recipientName: f.recipientName, recipientPhone: f.recipientPhone,
      packageDescription: f.description, vehicleType: f.vehicleType, serviceMode: f.serviceMode,
      pickupAddress: f.pickup!.address, pickupLat: f.pickup!.lat, pickupLng: f.pickup!.lng,
      dropoffAddress: f.dropoff!.address, dropoffLat: f.dropoff!.lat, dropoffLng: f.dropoff!.lng,
      distanceKm: parseFloat(km.toFixed(2)), deliveryFee: pr.delivery,
      platformFee: pr.platformFee, commissionPct: pr.commissionPct,
      total: pr.total, riderEarnings: pr.riderEarnings, swiftEarnings: pr.swiftEarnings,
        paymentMethod: payMethod, paymentReference: paymentRef, paymentStatus: "paid",
city: "Lagos", createdAt: serverTimestamp(),
customerPickupCode: genPickupCode(), // ← ADD HERE
    });
    return docRef.id;
  };

  const handlePay = async (method: PayMethod) => {
    setSubmitting(true); setError("");
    try {
      if (method === "wallet") {
        const user = auth.currentUser;
        if (!user) throw new Error("Please sign in to continue.");
        const pr = calcPrice(f.vehicleType!, f.serviceMode, km);
        const docRef = await addDoc(collection(db, "deliveryRequests"), {
          type: "send", orderNumber: genOrderNumber(), status: "pending",
          userId: user.uid, customerName: f.senderName, customerPhone: f.senderPhone,
          customerEmail: user.email, recipientName: f.recipientName, recipientPhone: f.recipientPhone,
          packageDescription: f.description, vehicleType: f.vehicleType, serviceMode: f.serviceMode,
          pickupAddress: f.pickup!.address, pickupLat: f.pickup!.lat, pickupLng: f.pickup!.lng,
          dropoffAddress: f.dropoff!.address, dropoffLat: f.dropoff!.lat, dropoffLng: f.dropoff!.lng,
          distanceKm: parseFloat(km.toFixed(2)), deliveryFee: pr.delivery,
          platformFee: pr.platformFee, commissionPct: pr.commissionPct,
          total: pr.total, riderEarnings: pr.riderEarnings, swiftEarnings: pr.swiftEarnings,
          paymentMethod: "wallet", paymentStatus: "pending", city: "Lagos", createdAt: serverTimestamp(),
           customerPickupCode: genPickupCode(), // ← ADD HERE
        });
        const debit = httpsCallable(functions, "walletDebit");
        await debit({ amountNaira: pr.total, orderId: docRef.id, description: `Send package: ${f.pickup?.address} → ${f.dropoff?.address}` });
        const { updateDoc: upd } = await import("firebase/firestore");
        await upd(docRef, { paymentStatus: "paid", status: "finding_rider", paymentReference: `wallet_${docRef.id}` });
        onOrderCreated(docRef.id);
        return;
      } else {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("Please sign in to continue");
        openPaystackPopup({
          email: user.email, amount: p!.total,
          reference: `delivery_send_${user.uid}_${Date.now()}`,
          publicKey: PUBKEY,
          onSuccess: async (ref) => { const id = await createOrder(ref, "paystack"); onOrderCreated(id); },
          onClose: () => setSubmitting(false),
        });
        return;
      }
    } catch (e: any) {
      setError(e.message || "Payment failed. Please try again.");
    }
    setSubmitting(false);
  };

  if (step === 4) return <PaymentStep total={p?.total || 0} onBack={() => setStep(3)} onPay={handlePay} submitting={submitting} />;

  // Step 1 — Service Mode + Vehicle
  if (step === 1) return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 140 }}>
      <Steps cur={1} labels={["Mode", "Vehicle", "Details", "Pay"]} />
      <div style={{ padding: "22px 18px 0" }}>
        <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "#e8e8f0", marginBottom: 6 }}>How are we starting?</h2>
        <p style={{ fontSize: 13, color: "#66668a", fontWeight: 600, marginBottom: 20 }}>Economy Hub is cheaper — you bring the package to us.</p>
        <ServiceModeToggle value={f.serviceMode} onChange={v => s("serviceMode", v)} />
      </div>
      <CTA onNext={() => setStep(2)} label="Choose Vehicle →" />
    </div>
  );

  // Step 2 — Vehicle Type
  if (step === 2) return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 140 }}>
      <Steps cur={2} labels={["Mode", "Vehicle", "Details", "Pay"]} />
      <div style={{ padding: "22px 18px 0" }}>
        <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "#e8e8f0", marginBottom: 6 }}>What are you sending?</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, padding: "10px 14px", borderRadius: 12, background: f.serviceMode === "office" ? "rgba(16,185,129,.08)" : "rgba(255,107,0,.08)", border: `1px solid ${f.serviceMode === "office" ? "rgba(16,185,129,.2)" : "rgba(255,107,0,.2)"}` }}>
          <span style={{ fontSize: 16 }}>{f.serviceMode === "office" ? "🏢" : "🏍️"}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: f.serviceMode === "office" ? "#10b981" : ACCENT }}>{f.serviceMode === "office" ? "Economy Hub — you bring it to us" : "Doorstep Pickup — we come to you"}</span>
        </div>
        <VehiclePicker value={f.vehicleType} serviceMode={f.serviceMode} onChange={v => s("vehicleType", v)} />
      </div>
      <CTA onBack={() => setStep(1)} onNext={() => setStep(3)} disabled={!f.vehicleType} label="Continue →" />
    </div>
  );

  // Step 3 — Details
  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 140 }}>
      <Steps cur={3} labels={["Mode", "Vehicle", "Details", "Pay"]} />
      <div style={{ padding: "22px 18px 0", display: "flex", flexDirection: "column", gap: 20 }}>
        <section>
          <SHead icon={<FiNavigation size={13} color={ACCENT} />} title="Route" bg="rgba(255,107,0,.15)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <LocInput label="Pickup Location" placeholder="Type an estate, street or area…" value={f.pickup} onChange={l => s("pickup", l)} dotColor={ACCENT} />
            {f.pickup && f.dropoff && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 8 }}>
                <div style={{ width: 2, height: 22, background: "linear-gradient(to bottom,#FF6B00,#3b82f6)", borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#44445a" }}>{haversine(f.pickup.lat, f.pickup.lng, f.dropoff.lat, f.dropoff.lng).toFixed(1)} km</span>
              </div>
            )}
            <LocInput label="Drop-off Location" placeholder="Where should we deliver to?" value={f.dropoff} onChange={l => s("dropoff", l)} dotColor="#3b82f6" />
          </div>
          {f.vehicleType && f.pickup && f.dropoff && (
            <PriceCard vehicle={f.vehicleType} serviceMode={f.serviceMode} pickup={f.pickup} dropoff={f.dropoff} />
          )}
        </section>
        <div style={{ height: 1, background: "#1e1e26" }} />
        <section>
          <SHead icon={<FiUser size={13} color={ACCENT} />} title="Sender" bg="rgba(255,107,0,.15)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TIn label="Your Name" value={f.senderName} onChange={v => s("senderName", v)} placeholder="Enter your name" icon={<FiUser size={13} />} />
            <TIn label="Your Phone" value={f.senderPhone} onChange={v => s("senderPhone", v)} placeholder="080XXXXXXXX" type="tel" icon={<FiPhone size={13} />} />
          </div>
        </section>
        <div style={{ height: 1, background: "#1e1e26" }} />
        <section>
          <SHead icon={<FiUser size={13} color="#3b82f6" />} title="Recipient" bg="rgba(59,130,246,.15)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <TIn label="Recipient's Name" value={f.recipientName} onChange={v => s("recipientName", v)} placeholder="Who receives it?" icon={<FiUser size={13} />} />
            <TIn label="Recipient's Phone" value={f.recipientPhone} onChange={v => s("recipientPhone", v)} placeholder="080XXXXXXXX" type="tel" icon={<FiPhone size={13} />} />
            <TIn label="Package Description" value={f.description} onChange={v => s("description", v)} placeholder="e.g. Documents, shoes, phone" icon={<FiPackage size={13} />} />
          </div>
        </section>
        {error && <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171", fontSize: 13, fontWeight: 700 }}>⚠ {error}</div>}
      </div>
      <CTA onBack={() => setStep(2)} onNext={() => setStep(4)} disabled={!ok3} label="Choose Payment →" />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PICKUP FLOW
// ══════════════════════════════════════════════════════
function PickupFlow({ onBack, onOrderCreated }: { onBack: () => void; onOrderCreated: (id: string) => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState<PickForm>({ name: "", phone: "", loc: null, desc: "", vehicleType: "bike" });
  const s = <K extends keyof PickForm>(k: K, v: PickForm[K]) => setF(p => ({ ...p, [k]: v }));
  const ok = !!(f.name && f.phone && f.loc && f.vehicleType);
  const pr = f.vehicleType ? calcPrice(f.vehicleType, "doorstep", 0) : null;
  const TOTAL = pr?.total || 0;
  const PUBKEY = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string;

  const createOrder = async (paymentRef: string, payMethod: string): Promise<string> => {
    const user = auth.currentUser;
    const p2 = calcPrice(f.vehicleType!, "doorstep", 0);
    const docRef = await addDoc(collection(db, "deliveryRequests"), {
      type: "pickup", orderNumber: genOrderNumber(), status: "finding_rider",
      userId: user?.uid || null, customerName: f.name, customerPhone: f.phone,
      customerEmail: user?.email || null, packageDescription: f.desc,
      vehicleType: f.vehicleType, serviceMode: "doorstep",
      pickupAddress: f.loc!.address, pickupLat: f.loc!.lat, pickupLng: f.loc!.lng,
      dropoffAddress: "To be confirmed with rider", dropoffLat: f.loc!.lat, dropoffLng: f.loc!.lng,
      distanceKm: 0, deliveryFee: p2.baseFee, platformFee: p2.platformFee,
      commissionPct: p2.commissionPct, total: p2.total,
      riderEarnings: p2.riderEarnings, swiftEarnings: p2.swiftEarnings,
      paymentMethod: payMethod, paymentReference: paymentRef, paymentStatus: "paid",
      city: "Lagos", createdAt: serverTimestamp(),
      customerPickupCode: genPickupCode(),
    });
    return docRef.id;
  };

  const handlePay = async (method: PayMethod) => {
    setSubmitting(true); setError("");
    try {
      const p2 = calcPrice(f.vehicleType!, "doorstep", 0);
      if (method === "wallet") {
        const user = auth.currentUser;
        if (!user) throw new Error("Please sign in to continue.");
        const docRef = await addDoc(collection(db, "deliveryRequests"), {
          type: "pickup", orderNumber: genOrderNumber(), status: "pending",
          userId: user.uid, customerName: f.name, customerPhone: f.phone,
          customerEmail: user.email, packageDescription: f.desc,
          vehicleType: f.vehicleType, serviceMode: "doorstep",
          pickupAddress: f.loc!.address, pickupLat: f.loc!.lat, pickupLng: f.loc!.lng,
          dropoffAddress: "To be confirmed with rider", dropoffLat: f.loc!.lat, dropoffLng: f.loc!.lng,
          distanceKm: 0, deliveryFee: p2.baseFee, platformFee: p2.platformFee,
          commissionPct: p2.commissionPct, total: p2.total,
          riderEarnings: p2.riderEarnings, swiftEarnings: p2.swiftEarnings,
          paymentMethod: "wallet", paymentStatus: "pending", city: "Lagos", createdAt: serverTimestamp(),
          customerPickupCode: genPickupCode(),
        });
        const debit = httpsCallable(functions, "walletDebit");
        await debit({ amountNaira: p2.total, orderId: docRef.id, description: `Schedule pickup: ${f.loc?.address}` });
        const { updateDoc: upd } = await import("firebase/firestore");
        await upd(docRef, { paymentStatus: "paid", status: "finding_rider", paymentReference: `wallet_${docRef.id}` });
        onOrderCreated(docRef.id);
        return;
      } else {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("Please sign in to continue");
        openPaystackPopup({
          email: user.email, amount: p2.total,
          reference: `delivery_pickup_${user.uid}_${Date.now()}`,
          publicKey: PUBKEY,
          onSuccess: async (ref) => { const id = await createOrder(ref, "paystack"); onOrderCreated(id); },
          onClose: () => setSubmitting(false),
        });
        return;
      }
    } catch (e: any) {
      setError(e.message || "Payment failed. Please try again.");
    }
    setSubmitting(false);
  };

  if (showPayment) return <PaymentStep total={TOTAL} onBack={() => setShowPayment(false)} onPay={handlePay} submitting={submitting} />;

  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 140 }}>
      <div style={{ padding: "22px 18px 0", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "#e8e8f0", marginBottom: 6 }}>Schedule a Pickup</h2>
          <p style={{ fontSize: 13, color: "#66668a", fontWeight: 600 }}>We'll send a rider to collect your package</p>
        </div>
        <div style={{ borderRadius: 18, overflow: "hidden", height: 165, position: "relative" }}>
          <img src="https://images.unsplash.com/photo-1609349093040-8ac03b7fdbcc?w=700&q=80" alt="Pickup" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right,rgba(0,0,0,.75) 0%,transparent 65%)" }} />
          <div style={{ position: "absolute", bottom: 16, left: 16 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "white", marginBottom: 4 }}>We Come to You</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>Rider picks up from your location</div>
          </div>
        </div>

        {/* Vehicle selector for pickup */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#66668a", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Vehicle Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(["bike", "car", "van"] as NonNullable<VehicleType>[]).map(vk => {
              const cfg = livePricing[vk];
              const tier = cfg.doorstep;
              const selected = f.vehicleType === vk;
              return (
                <div key={vk} onClick={() => s("vehicleType", vk)} style={{ border: `2px solid ${selected ? ACCENT : "#1e1e26"}`, borderRadius: 14, padding: "12px 10px", cursor: "pointer", background: selected ? "rgba(255,107,0,.06)" : "#16161b", transition: "all .2s", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{vk === "bike" ? "🏍️" : vk === "car" ? "🚗" : "🚐"}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 900, color: selected ? ACCENT : "#e8e8f0", marginBottom: 3 }}>{cfg.badge}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>₦{tier.baseFee.toLocaleString()}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#44445a" }}>+₦{tier.perKm}/km</div>
                </div>
              );
            })}
          </div>
        </div>

        <LocInput label="Your Pickup Location" placeholder="Where should we come?" value={f.loc} onChange={l => s("loc", l)} dotColor={ACCENT} />
        <TIn label="Your Name" value={f.name} onChange={v => s("name", v)} placeholder="Enter your full name" icon={<FiUser size={13} />} />
        <TIn label="Your Phone" value={f.phone} onChange={v => s("phone", v)} placeholder="080XXXXXXXX" type="tel" icon={<FiPhone size={13} />} />
        <TIn label="Package Description" value={f.desc} onChange={v => s("desc", v)} placeholder="What are we picking up?" icon={<FiPackage size={13} />} />

        {f.vehicleType && (
          <div style={{ background: "rgba(255,107,0,.07)", border: "1.5px solid rgba(255,107,0,.2)", borderRadius: 14, padding: "14px 15px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Service Fee ({livePricing[f.vehicleType].label})</div>
            {[
              { l: "Base pickup fee", v: `₦${livePricing[f.vehicleType].doorstep.baseFee.toLocaleString()}` },
              { l: "Platform fee", v: `₦${livePricing[f.vehicleType].doorstep.platformFee.toLocaleString()}` },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#8888a0", marginBottom: 6 }}><span>{r.l}</span><span>{r.v}</span></div>
            ))}
            <div style={{ height: 1, background: "rgba(255,107,0,.15)", margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 900, fontFamily: "'Syne',sans-serif" }}>
              <span style={{ color: "#e8e8f0" }}>Starting from</span>
              <span style={{ color: ACCENT }}>₦{TOTAL.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: "#44445a", fontWeight: 600, marginTop: 6 }}>+ ₦{livePricing[f.vehicleType].doorstep.perKm}/km · Final price confirmed with rider</div>
          </div>
        )}
        {error && <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", color: "#f87171", fontSize: 13, fontWeight: 700 }}>⚠ {error}</div>}
      </div>
      <CTA onNext={() => setShowPayment(true)} disabled={!ok} label="Choose Payment →" />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function SendPickup() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("home");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<DeliveryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Sync live pricing from Firestore platformSettings
  useEffect(() => {
    getDoc(doc(db, "platformSettings", "global")).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.sendPickupPricing) {
        livePricing = { ...DEFAULT_PRICING };
        const sp = d.sendPickupPricing as typeof DEFAULT_PRICING;
        (["bike","car","van"] as NonNullable<VehicleType>[]).forEach(vk => {
          if (sp[vk]) livePricing[vk] = { ...livePricing[vk], ...sp[vk] };
        });
      }
    });
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoadingOrders(false); return; }
    const q = query(collection(db, "deliveryRequests"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setMyOrders(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, status: data.status, orderNumber: data.orderNumber || d.id.slice(-8).toUpperCase(), riderName: data.riderName, pickupAddress: data.pickupAddress || "—", dropoffAddress: data.dropoffAddress || "—", total: data.total || 0, type: data.type || "send", createdAt: data.createdAt };
      }));
      setLoadingOrders(false);
    }, () => setLoadingOrders(false));
    return () => unsub();
  }, []);

  const handleOrderCreated = (orderId: string) => { setActiveOrderId(orderId); setMode("home"); };
  const back = () => { if (activeOrderId) { setActiveOrderId(null); return; } if (mode !== "home") { setMode("home"); return; } navigate(-1); };
  const title = mode === "home" ? "Send & Pickup" : mode === "send" ? "Send a Package" : "Schedule Pickup";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0d", display: "flex", flexDirection: "column", fontFamily: "'Nunito',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "#111115", borderBottom: "1px solid #1e1e26", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={back} style={{ width: 38, height: 38, borderRadius: 11, border: "1.5px solid #1e1e26", background: "#16161b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#aaa", flexShrink: 0 }}><FiArrowLeft size={16} /></button>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 900, color: "#e8e8f0" }}>{activeOrderId ? "Track Order" : title}</span>
      </div>

      {activeOrderId && <TrackingPage orderId={activeOrderId} onBack={() => setActiveOrderId(null)} />}

      {!activeOrderId && mode === "home" && (
        <div style={{ flex: 1, padding: "28px 18px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <div>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: "#e8e8f0", marginBottom: 8 }}>Package Services</h1>
            <p style={{ fontSize: 13, color: "#66668a", fontWeight: 600, lineHeight: 1.6 }}>Send packages anywhere or schedule a pickup. Fast, reliable, tracked.</p>
          </div>
          {[
            { m: "send" as Mode, label: "Send a Package", sub: "Door-to-door delivery", badge: "SEND", bc: ACCENT, img: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=700&q=80", chips: ["Bike · Car · Van", "Live tracking"] },
            { m: "pickup" as Mode, label: "Schedule a Pickup", sub: "Rider collects from you", badge: "PICKUP", bc: "#3b82f6", img: "https://images.unsplash.com/photo-1609349093040-8ac03b7fdbcc?w=700&q=80", chips: ["We come to you", "Priority doorstep"] },
          ].map(c => (
            <div key={c.m} onClick={() => setMode(c.m)} style={{ borderRadius: 22, overflow: "hidden", cursor: "pointer", border: "2px solid #1e1e26" }}>
              <div style={{ height: 190, position: "relative", overflow: "hidden" }}>
                <img src={c.img} alt={c.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 50%)" }} />
                <div style={{ position: "absolute", top: 14, right: 14, background: c.bc, borderRadius: 12, padding: "5px 13px", fontSize: 11, fontWeight: 800, color: "white" }}>{c.badge}</div>
                <div style={{ position: "absolute", bottom: 16, left: 16 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: "white", marginBottom: 6 }}>{c.label}</div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {c.chips.map((ch, i) => <span key={i} style={{ background: "rgba(255,107,0,.65)", color: "white", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>{ch}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ background: "#16161b", padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", marginBottom: 2 }}>{c.sub}</div>
                  <div style={{ fontSize: 12, color: "#66668a", fontWeight: 600 }}>Bike from ₦{(livePricing.bike.doorstep.baseFee + livePricing.bike.doorstep.platformFee).toLocaleString()} · Van up to ₦{(livePricing.van.doorstep.baseFee + livePricing.van.doorstep.platformFee).toLocaleString()}+</div>
                </div>
                <FiChevronRight size={18} color={ACCENT} />
              </div>
            </div>
          ))}
          {!loadingOrders && myOrders.length > 0 && (
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, color: "#e8e8f0", marginBottom: 12, marginTop: 8 }}>My Deliveries</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {myOrders.slice(0, 5).map(o => {
                  const isActive = !["delivered","cancelled"].includes(o.status);
                  return (
                    <div key={o.id} onClick={() => setActiveOrderId(o.id)} style={{ background: "#16161b", border: `1.5px solid ${isActive ? "rgba(255,107,0,.3)" : "#1e1e26"}`, borderRadius: 14, padding: "13px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: isActive ? "rgba(255,107,0,.12)" : "rgba(255,255,255,.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {o.type === "pickup" ? <FiMapPin size={16} color={isActive ? ACCENT : "#44445a"} /> : <FiPackage size={16} color={isActive ? ACCENT : "#44445a"} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0", marginBottom: 2 }}>#{o.orderNumber}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#66668a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.pickupAddress}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: isActive ? ACCENT : "#10b981", marginBottom: 2 }}>{isActive ? "Active" : "Done"}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#44445a" }}>₦{o.total.toLocaleString()}</div>
                      </div>
                      <FiChevronRight size={14} color="#44445a" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ height: 100 }} />
        </div>
      )}

      {!activeOrderId && mode === "send"   && <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><SendFlow   onBack={() => setMode("home")} onOrderCreated={handleOrderCreated} /></div>}
      {!activeOrderId && mode === "pickup" && <div style={{ flex: 1, display: "flex", flexDirection: "column" }}><PickupFlow onBack={() => setMode("home")} onOrderCreated={handleOrderCreated} /></div>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a0d;color:#e8e8f0;}
        @keyframes sp-spin{to{transform:rotate(360deg)}}
        @keyframes sp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
      `}</style>
    </div>
  );
}