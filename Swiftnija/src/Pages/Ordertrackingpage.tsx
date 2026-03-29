// pages/OrderTrackingPage.tsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

declare global { interface Window { google: any; } }

const O = "#FF6B00";

type OrderItem = { name: string; qty: number; price: string | number; img?: string; };

type TrackData = {
  status: string;
  riderAccepted?: boolean;
  riderName?: string;
  riderPhone?: string;
  riderPhotoURL?: string;
  riderVehicleId?: string;
  items?: OrderItem[];
  total?: number;
  deliveryFee?: number;
  vendorName?: string;
  userLat?: number;
  userLng?: number;
  riderLat?: number;
  riderLng?: number;
  deliveryAddress?: string;
  customerPickupCode?: string; // ← NEW
};

const RANK: Record<string, number> = {
  pending: 0, confirmed: 1, finding_rider: 2, rider_assigned: 3,
  processing: 4, ready: 5, picked_up: 6, arriving: 7, delivered: 8, cancelled: 99,
};
const rank = (status: string) => RANK[status] ?? 1;

const STEPS = [
  { label: "Order Confirmed",        doneFrom: 2,  activeFrom: 1 },
  { label: "Rider On The Way",       doneFrom: 6,  activeFrom: 3 },
  { label: "Vendor Preparing Order", doneFrom: 6,  activeFrom: 4 },
  { label: "Order Picked Up",        doneFrom: 7,  activeFrom: 6 },
  { label: "Out for Delivery",       doneFrom: 8,  activeFrom: 7 },
  { label: "Delivered",              doneFrom: 9,  activeFrom: 8 },
];

type StepState = "done" | "active" | "pending";
function stepState(r: number, doneFrom: number, activeFrom: number): StepState {
  if (r >= doneFrom)   return "done";
  if (r >= activeFrom) return "active";
  return "pending";
}

const fmtN = (n: number) => `₦${Number(n).toLocaleString("en-NG")}`;

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1; shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
const parseP = (p: string | number) => typeof p === "number" ? p : parseFloat(String(p).replace(/[^0-9.]/g, "")) || 0;

function useGoogleMaps() {
  const [ready, setReady] = useState(typeof window !== "undefined" && typeof window.google?.maps?.Map === "function");
  useEffect(() => {
    if (ready) return;
    const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;
    if (!key) return;
    const cb = "__gmaps_otp_cb";
    (window as any)[cb] = () => setReady(true);
    if (document.getElementById("gmaps-otp")) {
      const t = setInterval(() => { if (typeof window.google?.maps?.Map === "function") { clearInterval(t); setReady(true); } }, 150);
      return () => clearInterval(t);
    }
    const s = document.createElement("script");
    s.id = "gmaps-otp";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&callback=${cb}`;
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }, []);
  return ready;
}

function bikeIconUrl() {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
  <circle cx="28" cy="28" r="26" fill="#111118" stroke="${O}" stroke-width="2.5"/>
  <circle cx="16" cy="36" r="7" fill="none" stroke="${O}" stroke-width="2.2"/>
  <circle cx="16" cy="36" r="2.2" fill="${O}"/>
  <circle cx="40" cy="36" r="7" fill="none" stroke="${O}" stroke-width="2.2"/>
  <circle cx="40" cy="36" r="2.2" fill="${O}"/>
  <line x1="16" y1="36" x2="26" y2="20" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="26" y1="20" x2="40" y2="36" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="26" y1="20" x2="36" y2="20" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <line x1="26" y1="20" x2="28" y2="13" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
  <line x1="24" y1="13" x2="32" y2="13" stroke="${O}" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="29" y="23" width="9" height="7" rx="2" fill="${O}" opacity="0.9"/>
  <circle cx="28" cy="17" r="4.5" fill="${O}"/>
  <polygon points="28,5 23,13 33,13" fill="${O}" opacity="0.85"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
}

function destPinUrl() {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
  <path d="M18 2C10.3 2 4 8.3 4 16c0 10.5 14 28 14 28s14-17.5 14-28C32 8.3 25.7 2 18 2z" fill="${O}" stroke="white" stroke-width="2.5"/>
  <circle cx="18" cy="16" r="6" fill="white"/>
  <circle cx="18" cy="16" r="3" fill="${O}"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
}

async function drawRouteOnMap(from: { lat: number; lng: number }, to: { lat: number; lng: number }, map: any, polyRef: { current: any }, onEta?: (eta: string) => void) {
  if (!map || !window.google?.maps?.Polyline) return;
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;
  polyRef.current?.setMap(null);
  polyRef.current = new window.google.maps.Polyline({
    path: [from, to], geodesic: true, strokeColor: O, strokeWeight: 3, strokeOpacity: 0.5,
    icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "14px" }], map,
  });
  if (!apiKey) return;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.polyline.encodedPolyline" },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat,   longitude: to.lng   } } },
        travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      }),
    });
    if (!res.ok) return;
    const json  = await res.json();
    const route = json.routes?.[0];
    if (!route) return;
    if (route.polyline?.encodedPolyline) {
      const pts = decodePolyline(route.polyline.encodedPolyline);
      polyRef.current?.setMap(null);
      polyRef.current = new window.google.maps.Polyline({ path: pts, geodesic: true, strokeColor: O, strokeWeight: 5, strokeOpacity: 0.9, map });
      const b = new window.google.maps.LatLngBounds();
      pts.forEach(p => b.extend(p));
      map.fitBounds(b, { top: 60, bottom: 60, left: 40, right: 40 });
      const z = map.getZoom() ?? 14;
      if (z < 12) map.setZoom(13);
      if (z > 17) map.setZoom(16);
    }
    const secs = parseInt((route.duration ?? "0s").replace("s", ""), 10);
    if (secs > 0) {
      const mins = Math.round(secs / 60);
      onEta?.(mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`);
    }
  } catch {}
}

function LiveMap({ data, onEta }: { data: TrackData; onEta?: (eta: string) => void }) {
  const mapsReady    = useGoogleMaps();
  const divRef       = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const riderRef     = useRef<any>(null);
  const destRef      = useRef<any>(null);
  const routePolyRef = useRef<any>(null);
  const inited       = useRef(false);
  const etaTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destLatLng   = useRef<{ lat: number; lng: number } | null>(null);
  const riderLatLng  = useRef<{ lat: number; lng: number } | null>(null);
  const dest         = { lat: data.userLat ?? 6.5244, lng: data.userLng ?? 3.3792 };

  useEffect(() => {
    if (data.userLat && data.userLng) { destLatLng.current = { lat: data.userLat, lng: data.userLng }; destRef.current?.setPosition(destLatLng.current); return; }
    if (!data.deliveryAddress) return;
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;
    if (!apiKey) return;
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(data.deliveryAddress + ", Nigeria")}&key=${apiKey}`)
      .then(r => r.json())
      .then(json => {
        const loc = json.results?.[0]?.geometry?.location;
        if (loc) { destLatLng.current = { lat: loc.lat, lng: loc.lng }; destRef.current?.setPosition(destLatLng.current); mapRef.current?.panTo(destLatLng.current); }
      }).catch(() => {});
  }, [data.userLat, data.userLng, data.deliveryAddress]);

  useEffect(() => {
    if (!mapsReady || !divRef.current || inited.current) return;
    if (typeof window.google?.maps?.Map !== "function") return;
    inited.current = true;
    const map = new window.google.maps.Map(divRef.current, {
      center: dest, zoom: 15, disableDefaultUI: true, gestureHandling: "none",
      styles: [
        { elementType: "geometry",            stylers: [{ color: "#1a1a24" }] },
        { elementType: "labels.text.stroke",  stylers: [{ color: "#1a1a24" }] },
        { elementType: "labels.text.fill",    stylers: [{ color: "#6666aa" }] },
        { featureType: "road",                elementType: "geometry",         stylers: [{ color: "#2a2a3a" }] },
        { featureType: "road",                elementType: "geometry.stroke",  stylers: [{ color: "#111118" }] },
        { featureType: "road",                elementType: "labels.text.fill", stylers: [{ color: "#9898b8" }] },
        { featureType: "road.highway",        elementType: "geometry",         stylers: [{ color: "#333344" }] },
        { featureType: "road.highway",        elementType: "labels.text.fill", stylers: [{ color: "#aaaacc" }] },
        { featureType: "water",               elementType: "geometry",         stylers: [{ color: "#0d0d18" }] },
        { featureType: "landscape",           elementType: "geometry",         stylers: [{ color: "#141420" }] },
        { featureType: "poi",                 stylers: [{ visibility: "off" }] },
        { featureType: "transit",             stylers: [{ visibility: "off" }] },
      ],
    });
    mapRef.current = map;
    destRef.current = new window.google.maps.Marker({ position: dest, map, icon: { url: destPinUrl(), scaledSize: new window.google.maps.Size(36, 46), anchor: new window.google.maps.Point(18, 46) }, zIndex: 10 });
    riderRef.current = new window.google.maps.Marker({ position: dest, map, icon: { url: bikeIconUrl(), scaledSize: new window.google.maps.Size(56, 56), anchor: new window.google.maps.Point(28, 28) }, zIndex: 20, optimized: false, visible: false });
    setTimeout(() => {
      if (riderLatLng.current) {
        riderRef.current?.setVisible(true);
        riderRef.current?.setPosition(riderLatLng.current);
        const dest2 = destLatLng.current ?? (data.userLat && data.userLng ? { lat: data.userLat, lng: data.userLng } : null);
        if (dest2) drawRouteOnMap(riderLatLng.current, dest2, map, routePolyRef, onEta);
      }
    }, 500);
  }, [mapsReady]);

  useEffect(() => {
    if (!data.riderLat || !data.riderLng) { riderRef.current?.setVisible(false); return; }
    const newPos = { lat: data.riderLat, lng: data.riderLng };
    riderLatLng.current = newPos;
    if (!riderRef.current || !mapRef.current) return;
    const oldPos = riderRef.current.getPosition();
    riderRef.current.setVisible(true);
    if (oldPos && window.google?.maps?.geometry) {
      const steps = 30, latDiff = newPos.lat - oldPos.lat(), lngDiff = newPos.lng - oldPos.lng();
      let step = 0;
      const animate = () => {
        step++;
        if (step <= steps) {
          const t    = step / steps;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          riderRef.current?.setPosition({ lat: oldPos.lat() + latDiff * ease, lng: oldPos.lng() + lngDiff * ease });
          setTimeout(animate, 50);
        } else { riderRef.current?.setPosition(newPos); }
      };
      animate();
    } else { riderRef.current.setPosition(newPos); }
    const r = RANK[data.status] ?? 0;
    if (r >= 6 && r < 8) { mapRef.current.panTo(newPos); }
    else if (data.userLat && data.userLng) {
      const b = new window.google.maps.LatLngBounds();
      b.extend(newPos); b.extend({ lat: data.userLat, lng: data.userLng });
      mapRef.current.fitBounds(b, { top: 50, bottom: 80, left: 30, right: 30 });
    }
    const customerPos = destLatLng.current ?? (data.userLat && data.userLng ? { lat: data.userLat, lng: data.userLng } : null);
    if (customerPos && mapRef.current) {
      if (etaTimer.current) clearTimeout(etaTimer.current);
      etaTimer.current = setTimeout(() => { drawRouteOnMap(newPos, customerPos, mapRef.current, routePolyRef, onEta); }, 1000);
    } else if (mapRef.current) {
      mapRef.current.panTo(newPos);
      const z = mapRef.current.getZoom() ?? 0;
      if (z < 13) mapRef.current.setZoom(15);
    }
  }, [data.riderLat, data.riderLng, mapsReady]);

  const r           = rank(data.status);
  const showOverlay = r < 3 || (r === 3 && !data.riderAccepted);
  const delivered   = data.status === "delivered";

  return (
    <div style={{ position: "relative", width: "100%", height: 280, background: "#12121a" }}>
      <div ref={divRef} style={{ width: "100%", height: "100%" }} />
      {!mapsReady && (
        <div style={{ position: "absolute", inset: 0, background: "#12121a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, animation: "map-bob 1.4s ease-in-out infinite" }}>🏍️</div>
            <div style={{ fontSize: 13, color: "#44445a", marginTop: 12, fontWeight: 600 }}>Loading map…</div>
          </div>
        </div>
      )}
      {showOverlay && mapsReady && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,13,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          {r <= 2 ? (
            <>
              <div style={{ position: "relative", width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {[0, 0.5, 1].map((delay, i) => <div key={i} style={{ position: "absolute", width: 70, height: 70, borderRadius: "50%", border: `2px solid ${O}`, animation: `map-radar 2s ease-out ${delay}s infinite` }} />)}
                <div style={{ fontSize: 32 }}>🔍</div>
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#eeeef8", textAlign: "center" }}>
                {r === 0 ? "Order placed" : r === 1 ? "Order confirmed" : "Finding your rider…"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 40, animation: "map-bob 1.4s ease-in-out infinite" }}>📦</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#eeeef8", textAlign: "center", padding: "0 24px" }}>Rider assigned — heading to vendor</div>
            </>
          )}
        </div>
      )}
      {(data.status === "processing" || data.status === "ready") && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,13,0.65)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 40, animation: "map-bob 1.4s ease-in-out infinite" }}>{data.status === "ready" ? "✅" : "👨‍🍳"}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#eeeef8", textAlign: "center", padding: "0 24px" }}>
            {data.status === "processing" ? "Vendor is preparing your order" : "Order ready — rider picking up now!"}
          </div>
        </div>
      )}
      {delivered && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,13,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{ fontSize: 72, animation: "map-pop .6s cubic-bezier(.34,1.56,.64,1) both" }}>🎉</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900, color: "#10B981" }}>Delivered!</div>
          <div style={{ fontSize: 14, color: "#66668a", fontWeight: 600 }}>Enjoy your order</div>
        </div>
      )}
      {r >= 6 && r < 8 && data.riderLat && (
        <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(17,17,24,0.9)", border: `1px solid ${O}44`, borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: O }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: O, animation: "map-blink 1s ease-in-out infinite" }} /> LIVE
        </div>
      )}
    </div>
  );
}

function StepRow({ label, state, last }: { label: string; state: StepState; last?: boolean }) {
  const done   = state === "done";
  const active = state === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? O : "transparent", border: done ? "none" : active ? `2.5px solid ${O}` : "2px solid #2a2a3a", boxShadow: done ? `0 2px 14px ${O}66` : "none", transition: "all .4s" }}>
        {done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {active && <div style={{ width: 11, height: 11, borderRadius: "50%", background: O, animation: "step-pulse 1.4s ease-in-out infinite" }} />}
      </div>
      <span style={{ flex: 1, fontSize: 15, fontWeight: done || active ? 800 : 600, color: done ? "#eeeef8" : active ? O : "#33334a", fontFamily: "'Nunito',sans-serif", transition: "color .3s" }}>{label}</span>
      <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? O : active ? "rgba(255,107,0,0.1)" : "#1a1a24", border: done ? "none" : active ? `1.5px solid ${O}44` : "1.5px solid #2a2a3a", boxShadow: done ? `0 2px 10px ${O}44` : "none", transition: "all .4s" }}>
        {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: O, animation: "step-pulse 1.4s ease-in-out infinite" }} />}
      </div>
    </div>
  );
}

function RiderCard({ data }: { data: TrackData }) {
  return (
    <div style={{ background: "#13131a", border: "1.5px solid #1e1e2c", borderRadius: 22, padding: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#44445a", textTransform: "uppercase", letterSpacing: ".9px", marginBottom: 14, fontFamily: "'DM Sans',sans-serif" }}>Your Rider</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0, background: `${O}18`, border: `2.5px solid ${O}44`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {data.riderPhotoURL
            ? <img src={data.riderPhotoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={O} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 900, color: "#eeeef8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.riderName || "Your Rider"}</div>
          {data.riderVehicleId && <div style={{ fontSize: 12, color: "#66668a", fontWeight: 700, marginTop: 3, fontFamily: "'DM Sans',sans-serif" }}>{data.riderVehicleId}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {data.riderPhone && (
            <a href={`tel:${data.riderPhone}`} style={{ width: 46, height: 46, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: "0 4px 16px rgba(37,211,102,0.4)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderSummary({ data }: { data: TrackData }) {
  const items    = data.items ?? [];
  const subtotal = items.reduce((s, i) => s + parseP(i.price) * i.qty, 0);
  const total    = data.total ?? subtotal + (data.deliveryFee ?? 0);
  return (
    <div style={{ background: "#13131a", border: "1.5px solid #1e1e2c", borderRadius: 22, padding: 18 }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#eeeef8", marginBottom: 14 }}>Order Summary</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#16161f", border: "1px solid #1e1e2c", borderRadius: 14, padding: "10px 12px" }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "#1e1e2c", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {item.img ? <img src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#44445a" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#eeeef8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#66668a", marginTop: 2 }}>× {item.qty}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: O, flexShrink: 0 }}>{fmtN(parseP(item.price) * item.qty)}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: "#1e1e2c", margin: "14px 0" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {data.deliveryFee !== undefined && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#66668a" }}>
            <span>Delivery fee</span><span>{fmtN(data.deliveryFee)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#eeeef8" }}>Total</span>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: O }}>{fmtN(total)}</span>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Order Placed", confirmed: "Order Confirmed",
  finding_rider: "Finding Rider…", rider_assigned: "Rider Assigned",
  processing: "Vendor Preparing", ready: "Ready for Pickup",
  picked_up: "Order Picked Up", arriving: "Rider Arriving",
  delivered: "Delivered!", cancelled: "Cancelled",
};

// ── Customer Pickup Code Card ─────────────────────────────────────────────────
function CustomerPickupCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "#13131a", border: "1.5px solid #1e1e2c", borderRadius: 22, padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#44445a", textTransform: "uppercase", letterSpacing: ".9px", marginBottom: 6, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
        🔐 Your Delivery Code
      </div>
      <div style={{ fontSize: 11, color: "#44445a", fontWeight: 600, marginBottom: 14, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>
        Give this code to your rider when they arrive. Do <strong style={{ color: "#eeeef8" }}>not</strong> share it early.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 38, fontWeight: 900, color: O, letterSpacing: 10 }}>
          {code}
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{
            padding: "10px 18px", borderRadius: 12, flexShrink: 0,
            background: copied ? "rgba(16,185,129,0.12)" : "rgba(255,107,0,0.1)",
            border: `1.5px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,107,0,0.25)"}`,
            color: copied ? "#10B981" : O,
            fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800,
            cursor: "pointer", transition: "all .2s",
          }}
        >
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function OrderTrackingPage({ onClose }: { onClose?: () => void }) {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate    = useNavigate();
  const [data, setData] = useState<TrackData>({ status: "confirmed" });
  const [eta,  setEta]  = useState<string>("");

  useEffect(() => {
    if (!orderId) return;
    return onSnapshot(doc(db, "orders", orderId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setData({
        status:             d.status          ?? "confirmed",
        riderAccepted:      d.riderAccepted   ?? false,
        riderName:          d.riderName,
        riderPhone:         d.riderPhone,
        riderPhotoURL:      d.riderPhotoURL,
        riderVehicleId:     d.riderVehicleId,
        items:              d.items           ?? [],
        total:              d.total,
        deliveryFee:        d.deliveryFee,
        vendorName:         d.vendorName,
        userLat:            d.userLat,
        userLng:            d.userLng,
        riderLat:           d.riderLat,
        riderLng:           d.riderLng,
        deliveryAddress:    d.deliveryAddress,
        customerPickupCode: d.customerPickupCode, // ← NEW
      });
    });
  }, [orderId]);

  const r           = rank(data.status);
  const showRider   = r >= 3 && (data.riderName || data.riderVehicleId);
  const isDelivered = data.status === "delivered";
  const isCancelled = data.status === "cancelled";
  const isMoving    = r >= 6 && r < 8;

  const handleBack = () => { if (onClose) onClose(); else navigate(-1); };

  return (
    <>
      <style>{`
        .otp-root { display:flex; flex-direction:column; min-height:100dvh; background:#0a0a0d; color:#e8e8f0; font-family:'Nunito',sans-serif; }
        .otp-hdr { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#111118; border-bottom:1px solid #1e1e2c; position:sticky; top:0; z-index:50; box-shadow:0 2px 20px rgba(0,0,0,0.6); }
        .otp-back { width:38px; height:38px; border-radius:12px; border:none; background:rgba(255,107,0,0.1); color:${O}; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; -webkit-tap-highlight-color:transparent; }
        .otp-scroll { flex:1; overflow-y:auto; padding-bottom:40px; }
        .otp-sbar { padding:16px 18px; display:flex; align-items:center; justify-content:space-between; background:#111118; border-bottom:1px solid #1e1e2c; }
        .otp-content { padding:14px 14px 8px; display:flex; flex-direction:column; gap:12px; }
        .otp-steps { background:#13131a; border:1.5px solid #1e1e2c; border-radius:22px; padding:4px 18px; }

        @keyframes step-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:.6} }
        @keyframes map-bob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes map-pop    { from{opacity:0;transform:scale(.6)} to{opacity:1;transform:scale(1)} }
        @keyframes map-radar  { 0%{transform:scale(.3);opacity:.9} 100%{transform:scale(1.5);opacity:0} }
        @keyframes map-blink  { 0%,100%{opacity:1} 50%{opacity:.2} }
      `}</style>

      <div className="otp-root">
        <div className="otp-hdr">
          <button className="otp-back" onClick={handleBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M5 12l7-7M5 12l7 7" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#eeeef8" }}>Track Order</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#44445a", marginTop: 1 }}>#{(orderId ?? "").slice(-8).toUpperCase()}</div>
          </div>
          {isMoving && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: `${O}18`, border: `1px solid ${O}33`, borderRadius: 20, padding: "4px 10px", fontSize: 10, fontWeight: 800, color: O }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: O, animation: "map-blink 1s ease-in-out infinite" }} /> LIVE
            </div>
          )}
        </div>

        <div className="otp-scroll">
          <LiveMap data={data} onEta={setEta} />

          <div className="otp-sbar">
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#44445a", textTransform: "uppercase", letterSpacing: ".7px", fontFamily: "'DM Sans',sans-serif" }}>Status</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, marginTop: 4, color: isDelivered ? "#10B981" : isCancelled ? "#ef4444" : O }}>
                {STATUS_LABEL[data.status] ?? data.status}
              </div>
              {data.deliveryAddress && (
                <div style={{ fontSize: 11, color: "#44445a", fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={O}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  {data.deliveryAddress}
                </div>
              )}
            </div>
            {isDelivered
              ? <div style={{ fontSize: 52, animation: "map-pop .5s cubic-bezier(.34,1.56,.64,1) both" }}>🎉</div>
              : isCancelled
              ? <div style={{ fontSize: 40 }}>❌</div>
              : (
                <div style={{ textAlign: "right" }}>
                  {eta && r >= 6 && r < 8 ? (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#44445a", textTransform: "uppercase", letterSpacing: ".5px", fontFamily: "'DM Sans',sans-serif" }}>Arriving in</div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: O, lineHeight: 1.1, marginTop: 4 }}>{eta}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#44445a", textTransform: "uppercase", letterSpacing: ".5px", fontFamily: "'DM Sans',sans-serif" }}>
                        {r >= 6 ? "In transit" : r >= 4 ? "Preparing" : r >= 3 ? "Assigned" : "Searching"}
                      </div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 32, fontWeight: 900, color: "#eeeef8", lineHeight: 1.1, marginTop: 4 }}>
                        {r >= 6 ? "🏍️" : r >= 4 ? "👨‍🍳" : "🔍"}
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>

          <div className="otp-content">
            {/* Steps */}
            <div className="otp-steps">
              {STEPS.map((step, i) => (
                <StepRow key={step.label} label={step.label} state={stepState(r, step.doneFrom, step.activeFrom)} last={i === STEPS.length - 1} />
              ))}
            </div>

            {/* ── Customer pickup code — shown until delivered ─────────── */}
            {data.customerPickupCode && !isDelivered && !isCancelled && (
              <CustomerPickupCode code={data.customerPickupCode} />
            )}

            {showRider && <RiderCard data={data} />}
            {(data.items?.length ?? 0) > 0 && <OrderSummary data={data} />}

            {isCancelled && (
              <div style={{ background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.2)", borderRadius: 18, padding: "18px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#ef4444", marginBottom: 6 }}>Order Cancelled</div>
                <div style={{ fontSize: 13, color: "#66668a" }}>Contact support if you need help with a refund.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}