/// <reference types="@types/google.maps" />
// components/RiderNavigationMap.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../firebase";
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, deleteField, increment } from "firebase/firestore";
import { auth } from "../firebase";
import {
  MdDeliveryDining, MdLocationOn, MdArrowBack,
  MdVolumeUp, MdVolumeOff, MdMyLocation, MdStorefront,
  MdPhone, MdExpandMore, MdExpandLess, MdTraffic,
} from "react-icons/md";
import { FiPackage, FiCheckCircle, FiNavigation } from "react-icons/fi";
import { RiMotorbikeLine } from "react-icons/ri";

const O = "#FF6B00";

type LatLng = { lat: number; lng: number };
type NavStep = {
  instruction: string;
  distanceMeters: number;
  distanceText: string;
  lat: number;
  lng: number;
};

type Props = {
  orderId: string;
  orderStatus: string;
  orderCollection?: string; // "orders" or "deliveryRequests"
  vendorLat?: number;
  vendorLng?: number;
  vendorName?: string;
  destLat: number;
  destLng: number;
  destAddress?: string;
  onClose: () => void;
  onStatusUpdate: (status: "picked_up" | "arriving" | "delivered") => void;
};

// ─── Maps loader ──────────────────────────────────────────────────────────────
function useGoogleMaps(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (typeof window.google?.maps?.Map === "function") { setLoaded(true); return; }
    const key = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;
    if (!key) return;
    (window as any).__gmaps_cb = () => setLoaded(true);
    if (!document.getElementById("gmaps-script")) {
      const s = document.createElement("script");
      s.id = "gmaps-script";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&callback=__gmaps_cb`;
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    } else {
      const p = setInterval(() => {
        if (typeof window.google?.maps?.Map === "function") { clearInterval(p); setLoaded(true); }
      }, 150);
      setTimeout(() => clearInterval(p), 20000);
    }
  }, []);
  return loaded;
}

// ─── Routes API REST ──────────────────────────────────────────────────────────
async function fetchRoutesAPI(
  origin: LatLng,
  destination: LatLng,
  apiKey: string
): Promise<{
  steps: NavStep[];
  durationText: string;
  durationSecs: number;
  staticSecs: number;
  distanceText: string;
  polyline: string;
} | null> {
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "routes.duration",
          "routes.staticDuration",
          "routes.distanceMeters",
          "routes.polyline.encodedPolyline",
          "routes.legs.steps",
        ].join(","),
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: origin.lat,      longitude: origin.lng      } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        computeAlternativeRoutes: false,
        languageCode: "en",
        regionCode: "NG",
        routeModifiers: { avoidTolls: false, avoidHighways: false, avoidFerries: true },
      }),
    });

    if (!res.ok) { console.warn("[Nav] Routes API:", res.status, await res.text()); return null; }
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const secs       = parseInt((route.duration       ?? "0s").replace("s", ""), 10);
    const staticSecs = parseInt((route.staticDuration ?? "0s").replace("s", ""), 10);

    const toTimeStr = (s: number) => {
      const m = Math.round(s / 60);
      return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
    };

    const steps: NavStep[] = (route.legs?.[0]?.steps ?? []).map((s: any) => {
      let instr = stripHtml(s.navigationInstruction?.instructions ?? "Continue");
      instr = instr
        .replace(/Restricted usage road/gi, "")
        .replace(/\s*[-–]\s*Restricted usage road/gi, "")
        .replace(/Pass by .+?\(on the (left|right)\)/gi, "")
        .replace(/\s*\(Restricted usage road\)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!instr || instr.length < 3) instr = "Continue straight";
      return {
        instruction:    instr,
        distanceMeters: s.distanceMeters ?? 0,
        distanceText:   s.distanceMeters
          ? s.distanceMeters < 1000
            ? `${s.distanceMeters} m`
            : `${(s.distanceMeters / 1000).toFixed(1)} km`
          : "",
        lat: s.startLocation?.latLng?.latitude  ?? origin.lat,
        lng: s.startLocation?.latLng?.longitude ?? origin.lng,
      };
    });

    return {
      steps,
      durationSecs: secs,
      staticSecs,
      durationText: toTimeStr(secs),
      distanceText: `${((route.distanceMeters ?? 0) / 1000).toFixed(1)} km`,
      polyline:     route.polyline?.encodedPolyline ?? "",
    };
  } catch (e) { console.warn("[Nav] Routes API failed:", e); return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function decodePolyline(encoded: string): LatLng[] {
  const pts: LatLng[] = []; let i = 0, lat = 0, lng = 0;
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

function stripHtml(h: string) {
  return h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

function cleanInstruction(raw: string): string {
  return raw
    .replace(/Restricted usage road/gi, "")
    .replace(/\s*[-–]\s*Restricted usage road/gi, "")
    .replace(/Pass by .+?\(on the (left|right)\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Continue straight";
}

function distBetween(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<
  string,
  { label: string; next: "picked_up" | "arriving" | "delivered"; icon: React.ReactNode } | null
> = {
  rider_assigned: { label: "Arrived at Vendor — Mark Picked Up", next: "picked_up",  icon: <FiPackage size={16} /> },
  picked_up:      { label: "Mark as Arriving",                   next: "arriving",   icon: <RiMotorbikeLine size={16} /> },
  arriving:       null, // handled by customer code input or direct confirm
  delivered:      null,
};

function TurnIcon({ instruction }: { instruction: string }) {
  const l = instruction.toLowerCase();
  if (l.includes("destination") || l.includes("arrive")) return <MdLocationOn size={20} color={O} />;
  const rot =
    l.includes("turn left")    ? -90 :
    l.includes("slight left")  ? -45 :
    l.includes("turn right")   ?  90 :
    l.includes("slight right") ?  45 :
    l.includes("u-turn")       ? 180 : 0;
  return <FiNavigation size={20} color={O} style={{ transform: `rotate(${rot}deg)` }} />;
}

function riderSvgUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill="white" stroke="${O}" stroke-width="2.5"/>
    <g transform="translate(8,10)">
      <circle cx="5"  cy="22" r="3.8" fill="none" stroke="${O}" stroke-width="2.2"/>
      <circle cx="27" cy="22" r="3.8" fill="none" stroke="${O}" stroke-width="2.2"/>
      <path d="M9 22 L16 12 L27 12" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 12 L18 6 L26 6 L27 12" fill="${O}88" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="5" y1="22" x2="16" y2="12" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>
      <polygon points="16,1 13,7 19,7" fill="${O}"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function RiderNavigationMap({
  orderId,
  orderStatus: initialStatus,
  orderCollection = "orders",
  vendorLat,
  vendorLng,
  vendorName: vendorNameProp,
  destLat,
  destLng,
  destAddress,
  onClose,
  onStatusUpdate,
}: Props) {
  const mapsLoaded = useGoogleMaps();
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;

  // ── Live data from Firestore ──────────────────────────────────────────────
  const [liveStatus,         setLiveStatus]         = useState(initialStatus);
  const [vendorName,         setVendorName]         = useState(vendorNameProp?.trim() || "");
  const [vendorAddr,         setVendorAddr]         = useState("");
  const [vendorPhone,        setVendorPhone]        = useState("");
  const [customerName,       setCustomerName]       = useState("");
  const [customerPhone,      setCustomerPhone]      = useState("");
  const [destOpen,           setDestOpen]           = useState(false);
  const [trafficDelay,       setTrafficDelay]       = useState(0);
  // ── NEW: order type read from Firestore ("send" | "pickup") ──────────────
  const [firestoreOrderType, setFirestoreOrderType] = useState<string>("send");

  // ── Customer code verification ────────────────────────────────────────────
  const [customerCode,    setCustomerCode]    = useState("");
  const [codeError,       setCodeError]       = useState("");
  const [codeSuccess,     setCodeSuccess]     = useState(false);
  const [checkingCode,    setCheckingCode]    = useState(false);
  const [orderPickupCode, setOrderPickupCode] = useState("");

  // ── Firestore snapshot ────────────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(doc(db, orderCollection, orderId), async snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.status)        setLiveStatus(d.status);
      if (d.customerName)  setCustomerName(d.customerName);
      if (d.customerPhone) setCustomerPhone(d.customerPhone);

      // ── NEW: read order type from Firestore ───────────────────────────────
      if (d.type) setFirestoreOrderType(d.type);

      // Only marketplace orders use a pickup code — deliveryRequests skip this
      if (orderCollection === "orders" && d.customerPickupCode) {
        setOrderPickupCode(d.customerPickupCode);
      }

      if (d.vendorId) {
        try {
          const vSnap = await getDoc(doc(db, "vendors", d.vendorId));
          if (vSnap.exists()) {
            const v = vSnap.data();
            const name  = v.businessName || v.storeName || v.name || v.shopName || vendorNameProp || "";
            const addr  = v.address || v.location || (v.city ? `${v.city}, Nigeria` : "");
            const phone = v.phone || v.contactPhone || v.phoneNumber || "";
            if (name)  { setVendorName(name); vendorNameRef.current = name; }
            if (addr)  setVendorAddr(addr);
            if (phone) setVendorPhone(phone);
          }
        } catch (e) { console.warn("[Nav] vendor fetch failed:", e); }
      } else if (d.vendorName?.trim()) {
        setVendorName(d.vendorName.trim());
        vendorNameRef.current = d.vendorName.trim();
      }
    });
  }, [orderId, orderCollection]);

  const handleVerifyCustomerCode = useCallback(async () => {
    if (!customerCode.trim()) { setCodeError("Enter the code"); return; }
    if (customerCode.trim().toUpperCase() !== orderPickupCode) {
      setCodeError("Wrong code — ask the customer to check again");
      return;
    }
    setCheckingCode(true);
    setCodeError("");
    try {
      await updateDoc(doc(db, orderCollection, orderId), {
        status: "delivered",
        deliveredAt: serverTimestamp(),
      });
      if (auth.currentUser?.uid) {
        const riderRef = doc(db, "riders", auth.currentUser.uid);
        const riderSnap = await getDoc(riderRef);
        const currentDeliveries: number = riderSnap.exists()
          ? (riderSnap.data().stats?.totalDeliveries ?? 0) : 0;
        await updateDoc(riderRef, {
          currentOrderId: deleteField(),
          currentOrderCollection: deleteField(),
          currentDeliveryId: deleteField(),
          "stats.totalDeliveries": currentDeliveries + 1,
        });
      }
      onStatusUpdate("delivered");
      setCodeSuccess(true);
      speak("Order delivered! Great work today.", true);
      setTimeout(onClose, 2500);
    } catch {
      setCodeError("Failed to confirm — try again");
    }
    setCheckingCode(false);
  }, [customerCode, orderPickupCode, orderId, orderCollection, onClose, onStatusUpdate]);

  // ── Map refs ──────────────────────────────────────────────────────────────
  const vendorNameRef = useRef(vendorNameProp?.trim() || "");
  const mapRef        = useRef<HTMLDivElement>(null);
  const mapInst       = useRef<google.maps.Map | null>(null);
  const riderMk       = useRef<google.maps.Marker | null>(null);
  const destMk        = useRef<google.maps.Marker | null>(null);
  const routePoly     = useRef<google.maps.Polyline | null>(null);
  const trafficLyr    = useRef<google.maps.TrafficLayer | null>(null);
  const watchId       = useRef<number | null>(null);
  const gpsInt        = useRef<ReturnType<typeof setInterval> | null>(null);
  const rerouteTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPos       = useRef<LatLng | null>(null);
  const lastSpoken    = useRef("");
  const voiceRef      = useRef(true);
  const mapInited     = useRef(false);

  // ── State ─────────────────────────────────────────────────────────────────
  const [riderPos,  setRiderPos]  = useState<LatLng | null>(null);
  const [steps,     setSteps]     = useState<NavStep[]>([]);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [eta,       setEta]       = useState("");
  const [totalDist, setTotalDist] = useState("");
  const [voiceOn,   setVoiceOn]   = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [updating,  setUpdating]  = useState(false);
  const [mapReady,  setMapReady]  = useState(false);
  const [gpsReady,  setGpsReady]  = useState(false);
  const [routeErr,  setRouteErr]  = useState<string | null>(null);
  const [trafficOn, setTrafficOn] = useState(true);
  const [offRoute,  setOffRoute]  = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isPickedUp  = liveStatus === "picked_up" || liveStatus === "arriving";
  const isArriving  = liveStatus === "arriving";
  const isDelivered = liveStatus === "delivered";

  // ── NEW: smart navDest based on collection + order type ───────────────────
  const isDeliveryRequest = orderCollection === "deliveryRequests";

  const navDest: LatLng = (() => {
    if (isDeliveryRequest) {
      if (firestoreOrderType === "send") {
        // Send package: rider always goes straight to dropoff (no vendor stop)
        return { lat: destLat, lng: destLng };
      } else {
        // Pickup type: go to pickup location first, then dropoff after picked_up
        return isPickedUp
          ? { lat: destLat, lng: destLng }
          : (vendorLat && vendorLng ? { lat: vendorLat, lng: vendorLng } : { lat: destLat, lng: destLng });
      }
    } else {
      // Marketplace order: vendor first, then customer address
      return isPickedUp
        ? { lat: destLat, lng: destLng }
        : (vendorLat && vendorLng ? { lat: vendorLat, lng: vendorLng } : { lat: destLat, lng: destLng });
    }
  })();

  const destTitle   = isPickedUp ? customerName  || "Customer"         : vendorName  || "Vendor";
  const destSubline = isPickedUp ? destAddress   || "Delivery address" : vendorAddr  || "";
  const destPhone   = isPickedUp ? customerPhone                        : vendorPhone;

  // ── Voice ─────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string, force = false) => {
    if (!voiceRef.current || !("speechSynthesis" in window)) return;
    if (!force && text === lastSpoken.current) return;
    lastSpoken.current = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-NG"; u.rate = 0.92; u.volume = 1;
    window.speechSynthesis.speak(u);
  }, []);

  useEffect(() => { voiceRef.current = voiceOn; }, [voiceOn]);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInited.current) return;
    if (typeof window.google?.maps?.Map !== "function") return;
    mapInited.current = true;

    const map = new window.google.maps.Map(mapRef.current, {
      center: navDest, zoom: 16,
      styles: [
        { elementType: "geometry",            stylers: [{ color: "#1a1a24" }] },
        { elementType: "labels.text.stroke",  stylers: [{ color: "#1a1a24" }] },
        { elementType: "labels.text.fill",    stylers: [{ color: "#6666aa" }] },
        { featureType: "road",                elementType: "geometry",         stylers: [{ color: "#2a2a3a" }] },
        { featureType: "road",                elementType: "geometry.stroke",  stylers: [{ color: "#111118" }] },
        { featureType: "road",                elementType: "labels.text.fill", stylers: [{ color: "#9898b8" }] },
        { featureType: "road.highway",        elementType: "geometry",         stylers: [{ color: "#333344" }] },
        { featureType: "road.highway",        elementType: "geometry.stroke",  stylers: [{ color: "#111118" }] },
        { featureType: "road.highway",        elementType: "labels.text.fill", stylers: [{ color: "#aaaacc" }] },
        { featureType: "road.arterial",       elementType: "geometry",         stylers: [{ color: "#252535" }] },
        { featureType: "water",               elementType: "geometry",         stylers: [{ color: "#0d0d18" }] },
        { featureType: "water",               elementType: "labels.text.fill", stylers: [{ color: "#334455" }] },
        { featureType: "landscape",           elementType: "geometry",         stylers: [{ color: "#141420" }] },
        { featureType: "landscape.natural",   elementType: "geometry",         stylers: [{ color: "#0f0f1a" }] },
        { featureType: "poi.park",            elementType: "geometry",         stylers: [{ color: "#131a1a" }] },
        { featureType: "poi.park",            elementType: "labels.text.fill", stylers: [{ color: "#3a5a3a" }] },
        { featureType: "poi",                 stylers: [{ visibility: "off" }] },
        { featureType: "transit",             stylers: [{ visibility: "off" }] },
        { featureType: "administrative",      elementType: "geometry",         stylers: [{ color: "#333344" }] },
        { featureType: "administrative",      elementType: "labels.text.fill", stylers: [{ color: "#888899" }] },
      ],
      disableDefaultUI: true,
      gestureHandling: "greedy",
    });
    mapInst.current = map;

    trafficLyr.current = new window.google.maps.TrafficLayer();
    trafficLyr.current?.setMap(map);

    destMk.current = new window.google.maps.Marker({
      position: navDest, map,
      icon: {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">` +
          `<path d="M18 2C10.3 2 4 8.3 4 16c0 10.5 14 26 14 26s14-15.5 14-26C32 8.3 25.7 2 18 2z" fill="${O}" stroke="white" stroke-width="2.5"/>` +
          `<circle cx="18" cy="16" r="5.5" fill="white"/>` +
          `</svg>`
        )}`,
        scaledSize: new window.google.maps.Size(36, 44),
        anchor:     new window.google.maps.Point(18, 44),
      },
      zIndex: 10,
    });

    riderMk.current = new window.google.maps.Marker({
      position: navDest, map,
      icon: { url: riderSvgUrl(), scaledSize: new window.google.maps.Size(48, 48), anchor: new window.google.maps.Point(24, 24) },
      zIndex: 20, optimized: false, visible: false,
    });

    setMapReady(true);
  }, [mapsLoaded]);

  // ── Draw helpers ──────────────────────────────────────────────────────────
  const drawRoute = useCallback((pts: LatLng[], pos?: LatLng | null) => {
    if (!mapInst.current) return;
    routePoly.current?.setMap(null);
    routePoly.current = new window.google.maps.Polyline({
      path: pts, geodesic: true, strokeColor: O, strokeWeight: 6, strokeOpacity: 0.9, map: mapInst.current,
    });
    if (pos) { mapInst.current.setCenter(pos); mapInst.current.setZoom(16); }
    else if (pts.length > 0) { mapInst.current.setCenter(pts[0]); mapInst.current.setZoom(16); }
  }, []);

  const drawStraight = useCallback((from: LatLng, to: LatLng) => {
    if (!mapInst.current) return;
    routePoly.current?.setMap(null);
    routePoly.current = new window.google.maps.Polyline({
      path: [from, to], geodesic: true, strokeColor: O, strokeWeight: 4, strokeOpacity: 0.5,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 }, offset: "0", repeat: "20px" }],
      map: mapInst.current,
    });
    mapInst.current.setCenter(from); mapInst.current.setZoom(15);
  }, []);

  // ── Fetch route ───────────────────────────────────────────────────────────
  const fetchRoute = useCallback(async (from: LatLng) => {
    if (!mapReady || !apiKey) return;
    setLoading(true); setRouteErr(null); setOffRoute(false);

    const r = await fetchRoutesAPI(from, navDest, apiKey);
    if (r) {
      setEta(r.durationText); setTotalDist(r.distanceText); setSteps(r.steps); setStepIdx(0);
      setTrafficDelay(Math.max(0, Math.round((r.durationSecs - r.staticSecs) / 60)));
      if (r.polyline) drawRoute(decodePolyline(r.polyline), from);
      const liveVN     = vendorNameRef.current || vendorName || "";
      const targetName = isPickedUp ? (customerName || "the customer") : (liveVN || "the vendor");
      const addrPart   = isPickedUp ? (destSubline ? ` at ${destSubline}` : "") : (vendorAddr ? ` at ${vendorAddr}` : "");
      let msg = `Navigating to ${targetName}${addrPart}. ${r.durationText} away.`;
      if (r.steps[0]) msg += ` ${cleanInstruction(r.steps[0].instruction)}`;
      speak(msg);
    } else {
      setRouteErr("Showing approximate route — enable Routes API for full navigation");
      drawStraight(from, navDest);
      const d = distBetween(from, navDest);
      setTotalDist(`~${(d / 1000).toFixed(1)} km`);
      setEta(`~${Math.round((d / 1000 / 30) * 60)} min`);
      speak(`Head towards ${isPickedUp ? destTitle : (vendorName || "the vendor")}.`);
    }
    setLoading(false);
  }, [navDest, mapReady, apiKey, drawRoute, drawStraight, speak, destTitle, vendorName, vendorAddr, destSubline, isPickedUp]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const onPos = (pos: GeolocationPosition) => {
      const np: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      prevPos.current = np; setRiderPos(np); setGpsReady(true);
      if (riderMk.current && mapInst.current) {
        riderMk.current.setVisible(true); riderMk.current.setPosition(np);
        const z = mapInst.current.getZoom() ?? 0;
        z < 13 ? (mapInst.current.setCenter(np), mapInst.current.setZoom(16)) : mapInst.current.panTo(np);
      }
      setSteps(prev => {
        if (!prev.length) return prev;
        setStepIdx(idx => {
          const next = idx + 1;
          if (next < prev.length) {
            const d = distBetween(np, { lat: prev[next].lat, lng: prev[next].lng });
            if (d < 60) { speak(prev[next].instruction); return next; }
            if (d < 200 && prev[next].instruction !== lastSpoken.current)
              speak(`In ${prev[next].distanceText}, ${prev[next].instruction}`);
          }
          if (prev[idx]) {
            const dStep = distBetween(np, { lat: prev[idx].lat, lng: prev[idx].lng });
            if (dStep > 150) {
              setOffRoute(true);
              if (rerouteTimer.current) clearTimeout(rerouteTimer.current);
              rerouteTimer.current = setTimeout(() => { speak("Recalculating route.", true); fetchRoute(np); }, 4000);
            }
          }
          return idx;
        });
        return prev;
      });
    };
    const onErr = () => { if (!prevPos.current) fetchRoute({ lat: 6.5244, lng: 3.3792 }); };
    if (!("geolocation" in navigator)) { fetchRoute({ lat: 6.5244, lng: 3.3792 }); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      prevPos.current = from; setRiderPos(from); setGpsReady(true);
      if (mapInst.current) mapInst.current.panTo(from);
      if (riderMk.current) { riderMk.current.setVisible(true); riderMk.current.setPosition(from); }
      fetchRoute(from);
    }, onErr, { enableHighAccuracy: true, timeout: 8000 });
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 });
    gpsInt.current = setInterval(async () => {
      if (!prevPos.current || !auth.currentUser) return;
      try {
        await updateDoc(doc(db, orderCollection, orderId), {
          riderLat: prevPos.current.lat,
          riderLng: prevPos.current.lng,
        });
      } catch {}
    }, 5000);
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (gpsInt.current) clearInterval(gpsInt.current);
      if (rerouteTimer.current) clearTimeout(rerouteTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, [mapReady]);

  const announcedRef = useRef(false);
  useEffect(() => {
    if (!vendorName || isPickedUp || announcedRef.current || !eta) return;
    announcedRef.current = true;
    speak(`Navigating to ${vendorName}${vendorAddr ? ` at ${vendorAddr}` : ""}. ${eta} away.`, true);
  }, [vendorName, eta, isPickedUp]);

  const prevDestRef = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!mapReady) return;
    const p = prevDestRef.current;
    if (p && (p.lat !== navDest.lat || p.lng !== navDest.lng)) {
      destMk.current?.setPosition(navDest);
      if (riderPos) fetchRoute(riderPos);
    }
    prevDestRef.current = navDest;
  }, [navDest.lat, navDest.lng, mapReady]);

  useEffect(() => {
    if (!trafficLyr.current || !mapInst.current) return;
    trafficLyr.current.setMap(trafficOn ? mapInst.current : null);
  }, [trafficOn]);

  // ── Status update ─────────────────────────────────────────────────────────
  const handleStatus = async (next: "picked_up" | "arriving" | "delivered") => {
    if (updating || liveStatus === next) return;
    setUpdating(true);
    setLiveStatus(next);
    onStatusUpdate(next);
    if (next === "picked_up") speak(`Order picked up. Navigating to ${customerName || "customer"}.`, true);
    else if (next === "arriving") speak("Arriving at destination. Ask the customer for their delivery code.", true);
    setUpdating(false);
  };

  const recenter = () => {
    if (riderPos && mapInst.current) { mapInst.current.panTo(riderPos); mapInst.current.setZoom(17); }
  };

  const cur  = steps[stepIdx];
  const nxt  = steps[stepIdx + 1];
  const sCfg = STATUS_CFG[liveStatus] ?? null;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=Syne:wght@700;800;900&display=swap');
        .rnm{position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;background:#0a0a0f;}
        .rnm-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#111118;border-bottom:1px solid #1e1e2c;flex-shrink:0;box-shadow:0 1px 12px rgba(0,0,0,0.5);}
        .rnm-back{width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,107,0,0.15);color:${O};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
        .rnm-hdr-mid{flex:1;min-width:0;}
        .rnm-hdr-phase{font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:.8px;}
        .rnm-hdr-name{font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:#eeeef8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rnm-eta-box{background:rgba(255,107,0,0.12);border:1.5px solid ${O}44;border-radius:14px;padding:5px 12px;flex-shrink:0;text-align:center;min-width:70px;}
        .rnm-eta-num{font-family:'Syne',sans-serif;font-size:16px;font-weight:900;color:${O};line-height:1;}
        .rnm-eta-lbl{font-size:9px;font-weight:700;color:rgba(255,107,0,0.5);text-transform:uppercase;letter-spacing:.5px;}
        .rnm-dest{background:#111118;border-bottom:1px solid #1e1e2c;flex-shrink:0;}
        .rnm-dest-row{display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;user-select:none;}
        .rnm-dest-icon{width:36px;height:36px;border-radius:10px;background:rgba(255,107,0,0.12);border:1px solid ${O}33;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .rnm-dest-info{flex:1;min-width:0;}
        .rnm-dest-name{font-size:13px;font-weight:700;color:#eeeef8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rnm-dest-sub{font-size:11px;color:#66668a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .rnm-dest-chevron{color:#44445a;flex-shrink:0;transition:transform .25s;}
        .rnm-dest-chevron.open{transform:rotate(180deg);}
        .rnm-dest-body{padding:0 14px 12px;display:flex;flex-direction:column;gap:7px;background:#111118;}
        @keyframes rnm-slide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        .rnm-dest-detail{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#8888aa;font-weight:600;padding:2px 0;}
        .rnm-divider{height:1px;background:#1e1e2c;margin:2px 0;}
        .rnm-delay{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:12px;font-weight:700;background:rgba(255,107,0,0.08);border-bottom:1px solid rgba(255,107,0,0.2);color:#FF9A00;flex-shrink:0;}
        .rnm-turn{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#111118;border-bottom:1px solid #1e1e2c;flex-shrink:0;}
        .rnm-turn-icon{width:42px;height:42px;border-radius:11px;background:rgba(255,107,0,0.12);border:1.5px solid ${O}33;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .rnm-turn-body{flex:1;min-width:0;}
        .rnm-turn-instr{font-size:13px;font-weight:700;color:#eeeef8;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
        .rnm-turn-dist{font-size:12px;font-weight:600;color:${O};margin-top:2px;}
        .rnm-voice{width:38px;height:38px;border-radius:50%;border:1.5px solid;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        .rnm-offrte{background:rgba(255,193,7,0.08);border-bottom:2px solid rgba(255,193,7,0.3);padding:7px 14px;font-size:12px;font-weight:700;color:#FFC107;display:flex;align-items:center;gap:7px;flex-shrink:0;}
        .rnm-map{flex:1;position:relative;min-height:0;}
        .rnm-map-el{width:100%;height:100%;}
        .rnm-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(10,10,13,0.92);}
        .rnm-spinner{width:34px;height:34px;border:3px solid ${O}33;border-top-color:${O};border-radius:50%;animation:rnm-spin .7s linear infinite;}
        .rnm-spin-lbl{font-size:13px;font-weight:600;color:#66668a;}
        @keyframes rnm-spin{to{transform:rotate(360deg);}}
        @keyframes rnm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes rnm-pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes rnm-code-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .rnm-fab{position:absolute;right:14px;width:44px;height:44px;border-radius:50%;border:none;box-shadow:0 3px 12px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;}
        .rnm-fab:hover{transform:scale(1.06);}
        .rnm-sheet{background:#111118;border-top:1.5px solid #1e1e2c;padding:10px 14px calc(12px + env(safe-area-inset-bottom,0px)) 14px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;box-shadow:0 -4px 24px rgba(0,0,0,0.5);}
        .rnm-stats{display:flex;gap:8px;}
        .rnm-stat{flex:1;background:rgba(255,255,255,0.04);border:1px solid #1e1e2c;border-radius:10px;padding:6px 8px;text-align:center;}
        .rnm-stat-val{font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:#eeeef8;}
        .rnm-stat-lbl{font-size:10px;font-weight:700;color:#44445a;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;}
        .rnm-next{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid #1e1e2c;font-size:12px;}
        .rnm-sbtn{width:100%;height:54px;border-radius:16px;border:none;background:linear-gradient(135deg,${O},#FF9A00);color:white;font-family:'Syne',sans-serif;font-size:15px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px ${O}44;transition:all .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        .rnm-sbtn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;background:#1e1e2c;color:#555;}
        .rnm-sbtn:not(:disabled):active{transform:scale(.97);}
        .rnm-rerr{padding:7px 10px;border-radius:8px;background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);font-size:11px;font-weight:700;color:#FFC107;}
        .rnm-code-box{animation:rnm-code-in .3s ease;display:flex;flex-direction:column;gap:8px;}
        .rnm-code-label{font-size:11px;font-weight:800;color:#8888aa;text-transform:uppercase;letter-spacing:.6px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px;}
        .rnm-code-row{display:flex;gap:8px;}
        .rnm-code-inp{flex:1;padding:13px 16px;border-radius:13px;background:rgba(255,255,255,0.06);color:white;font-size:24px;font-weight:900;font-family:'Syne',sans-serif;letter-spacing:8px;text-align:center;outline:none;transition:border-color .2s,box-shadow .2s;}
        .rnm-code-inp:focus{border-color:${O} !important;box-shadow:0 0 0 3px rgba(255,107,0,0.15);}
        .rnm-code-err{font-size:12px;font-weight:700;color:#ef4444;display:flex;align-items:center;gap:5px;}
        .rnm-code-success{text-align:center;padding:18px;background:rgba(16,185,129,0.08);border-radius:16px;border:1.5px solid rgba(16,185,129,0.25);animation:rnm-pop .4s cubic-bezier(.34,1.56,.64,1);}
        .rnm-delivered{position:absolute;inset:0;background:rgba(10,10,13,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:30;animation:rnm-pop .5s cubic-bezier(.34,1.56,.64,1) both;}
      `}</style>

      <div className="rnm">

        {/* ── Header ── */}
        <div className="rnm-hdr">
          <button className="rnm-back" onClick={onClose}><MdArrowBack size={20} /></button>
          <div className="rnm-hdr-mid">
            <div className="rnm-hdr-phase">{isPickedUp ? "Delivering to" : "Navigating to"}</div>
            <div className="rnm-hdr-name">{isPickedUp ? destTitle : (vendorName || "Vendor")}</div>
          </div>
          {eta && (
            <div className="rnm-eta-box">
              <div className="rnm-eta-num">{eta}</div>
              <div className="rnm-eta-lbl">ETA</div>
            </div>
          )}
        </div>

        {/* ── Destination card ── */}
        <div className="rnm-dest">
          <div className="rnm-dest-row" onClick={() => setDestOpen(v => !v)}>
            <div className="rnm-dest-icon">
              {isPickedUp ? <MdLocationOn size={18} color={O} /> : <MdStorefront size={18} color={O} />}
            </div>
            <div className="rnm-dest-info">
              <div className="rnm-dest-name">{isPickedUp ? destTitle : (vendorName || "Vendor")}</div>
              <div className="rnm-dest-sub">
                {isPickedUp ? (destSubline || "Tap for delivery address") : (vendorAddr || "Tap to see details")}
              </div>
            </div>
            <div className={`rnm-dest-chevron${destOpen ? " open" : ""}`}>
              {destOpen ? <MdExpandLess size={20} /> : <MdExpandMore size={20} />}
            </div>
          </div>
          {destOpen && (
            <div className="rnm-dest-body" style={{ animation: "rnm-slide .2s ease" }}>
              <div className="rnm-divider" />
              {destSubline && (
                <div className="rnm-dest-detail">
                  <MdLocationOn size={15} color={O} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{destSubline}</span>
                </div>
              )}
              {destPhone && (
                <div className="rnm-dest-detail">
                  <MdPhone size={15} color={O} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{destPhone}</span>
                </div>
              )}
              {(totalDist || eta) && (
                <div className="rnm-dest-detail">
                  <FiNavigation size={13} color={O} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{[totalDist, eta && `${eta} ETA`].filter(Boolean).join(" · ")}</span>
                </div>
              )}
              {!destSubline && !destPhone && (
                <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", paddingBottom: 4 }}>No extra details available</div>
              )}
            </div>
          )}
        </div>

        {/* ── Traffic delay ── */}
        {trafficDelay > 2 && (
          <div className="rnm-delay"><MdTraffic size={16} />Traffic is adding ~{trafficDelay} min to your journey</div>
        )}

        {/* ── Turn banner ── */}
        {cur && (
          <div className="rnm-turn">
            <div className="rnm-turn-icon"><TurnIcon instruction={cur.instruction} /></div>
            <div className="rnm-turn-body">
              <div className="rnm-turn-instr">{cleanInstruction(cur.instruction)}</div>
              {cur.distanceText && <div className="rnm-turn-dist">in {cur.distanceText}</div>}
            </div>
            <button
              className="rnm-voice"
              onClick={() => {
                const next = !voiceRef.current;
                voiceRef.current = next;
                setVoiceOn(next);
                if (next && cur) speak(cur.instruction, true);
                else window.speechSynthesis?.cancel();
              }}
              style={{
                background:  voiceOn ? "rgba(255,107,0,0.15)" : "rgba(255,255,255,0.06)",
                borderColor: voiceOn ? `${O}66`               : "#2a2a3a",
                color:       voiceOn ? O                       : "#44445a",
              }}
            >
              {voiceOn ? <MdVolumeUp size={20} /> : <MdVolumeOff size={20} />}
            </button>
          </div>
        )}

        {/* ── Off-route warning ── */}
        {offRoute && (
          <div className="rnm-offrte"><FiNavigation size={13} /> Recalculating route…</div>
        )}

        {/* ── Map ── */}
        <div className="rnm-map">
          <div ref={mapRef} className="rnm-map-el" />

          {(!mapsLoaded || !mapReady || (loading && !gpsReady)) && (
            <div className="rnm-overlay">
              <MdDeliveryDining size={52} color={O} style={{ animation: "rnm-bob 1.4s ease-in-out infinite" }} />
              <div className="rnm-spinner" />
              <span className="rnm-spin-lbl">
                {!mapsLoaded ? "Loading map…" : !gpsReady ? "Getting your location…" : "Calculating route…"}
              </span>
            </div>
          )}

          {isDelivered && (
            <div className="rnm-delivered">
              <FiCheckCircle size={72} color="#10B981" />
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: "#10B981" }}>Delivered!</div>
              <div style={{ fontSize: 14, color: "#66668a", fontWeight: 600 }}>Excellent work today 🎉</div>
            </div>
          )}

          {gpsReady && (
            <button className="rnm-fab" onClick={recenter} style={{ bottom: 70, background: "#1e1e2c", color: O }} title="Re-centre on me">
              <MdMyLocation size={22} />
            </button>
          )}
          {mapReady && (
            <button className="rnm-fab" onClick={() => setTrafficOn(v => !v)} style={{ bottom: 18, background: trafficOn ? O : "#1e1e2c", color: trafficOn ? "white" : "#66668a" }} title={trafficOn ? "Hide traffic" : "Show traffic"}>
              <MdTraffic size={20} />
            </button>
          )}
        </div>

        {/* ── Bottom sheet ── */}
        <div className="rnm-sheet">

          {routeErr && <div className="rnm-rerr">⚠️ {routeErr}</div>}

          {(totalDist || eta) && (
            <div className="rnm-stats">
              {totalDist && <div className="rnm-stat"><div className="rnm-stat-val">{totalDist}</div><div className="rnm-stat-lbl">Distance</div></div>}
              {eta        && <div className="rnm-stat"><div className="rnm-stat-val">{eta}</div><div className="rnm-stat-lbl">ETA</div></div>}
              {steps.length > 0 && <div className="rnm-stat"><div className="rnm-stat-val">{stepIdx + 1}/{steps.length}</div><div className="rnm-stat-lbl">Steps</div></div>}
            </div>
          )}

          {nxt && (
            <div className="rnm-next">
              <FiNavigation size={13} color={O} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#66668a", fontWeight: 600 }}>then {cleanInstruction(nxt.instruction)}</span>
              <span style={{ color: O, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{nxt.distanceText}</span>
            </div>
          )}

          {/* ── ACTION AREA ── */}
          {isArriving ? (
            orderCollection === "orders" ? (
              // Marketplace order — needs customer code verification
              codeSuccess ? (
                <div className="rnm-code-success">
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#10B981" }}>
                    Order Delivered! Great work 🎉
                  </div>
                  <div style={{ fontSize: 13, color: "#66668a", marginTop: 6, fontWeight: 600 }}>
                    Closing navigation…
                  </div>
                </div>
              ) : (
                <div className="rnm-code-box">
                  <div className="rnm-code-label">
                    Ask customer for their delivery code
                  </div>
                  <div className="rnm-code-row">
                    <input
                      className="rnm-code-inp"
                      value={customerCode}
                      onChange={e => { setCustomerCode(e.target.value.toUpperCase().slice(0, 8)); setCodeError(""); }}
                      onKeyDown={e => { if (e.key === "Enter") handleVerifyCustomerCode(); }}
                      placeholder="ABC123"
                      style={{ border: `1.5px solid ${codeError ? "#ef4444" : "rgba(255,255,255,0.12)"}` }}
                    />
                    <button
                      className="rnm-sbtn"
                      onClick={handleVerifyCustomerCode}
                      disabled={checkingCode || !customerCode.trim()}
                      style={{ width: 90, flexShrink: 0 }}
                    >
                      {checkingCode
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "rnm-spin .7s linear infinite" }}>
                            <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
                          </svg>
                        : "Verify"
                      }
                    </button>
                  </div>
                  {codeError && <div className="rnm-code-err">⚠ {codeError}</div>}
                </div>
              )
            ) : (
              // deliveryRequests — direct confirm, no code needed
              codeSuccess ? (
                <div className="rnm-code-success">
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#10B981" }}>
                    Delivered! Great work 🎉
                  </div>
                </div>
              ) : (
                <button
                  className="rnm-sbtn"
                  onClick={async () => {
                    setUpdating(true);
                    try {
                      await updateDoc(doc(db, orderCollection, orderId), {
                        status: "delivered",
                        deliveredAt: serverTimestamp(),
                      });
                      if (auth.currentUser?.uid) {
                        await updateDoc(doc(db, "riders", auth.currentUser.uid), {
                          currentOrderId: deleteField(),
                          currentOrderCollection: deleteField(),
                          currentDeliveryId: deleteField(),
                          "stats.totalDeliveries": increment(1),
                        });
                      }
                      onStatusUpdate("delivered");
                      setCodeSuccess(true);
                      speak("Package delivered! Great work today.", true);
                      setTimeout(onClose, 2500);
                    } catch (e) {
                      console.error(e);
                    }
                    setUpdating(false);
                  }}
                  disabled={updating}
                >
                  {updating
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "rnm-spin .7s linear infinite" }}>
                        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
                      </svg>
                    : <><FiCheckCircle size={16} /> Confirm Delivery</>
                  }
                </button>
              )
            )
          ) : sCfg && liveStatus !== "delivered" ? (
            <button className="rnm-sbtn" onClick={() => handleStatus(sCfg.next)} disabled={updating}>
              {updating
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "rnm-spin .7s linear infinite" }}>
                    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
                  </svg>
                : <>{sCfg.icon} {sCfg.label}</>
              }
            </button>
          ) : null}

        </div>
      </div>
    </>
  );
}