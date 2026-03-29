/// <reference types="@types/google.maps" />

import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type LatLng = { lat: number; lng: number };

type RiderData = {
  lat: number;
  lng: number;
  heading?: number; // degrees, 0 = north
  name?: string;
  vehicleId?: string;
  photoURL?: string;
};

type OrderStatus =
  | "confirmed"
  | "preparing"
  | "picked_up"
  | "arriving"
  | "delivered";

type TrackDeliveryMapProps = {
  orderId: string;
  storeLat?: number;
  storeLng?: number;
  storeName?: string;
  destLat: number;
  destLng: number;
  destAddress?: string;
  onClose?: () => void;
};

// ─────────────────────────────────────────
// GOOGLE MAPS LOADER
// Reads key from: VITE_GOOGLE_MAPS_API_KEY
// ─────────────────────────────────────────
function useGoogleMaps() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.maps?.Map) {
      setLoaded(true);
      return;
    }

    const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as
      | string
      | undefined;
    if (!apiKey) {
      console.warn("[AddressMap] VITE_GOOGLE_MAPS_API_KEY is not set.");
      return;
    }

    const existing = document.getElementById("gmaps-script");
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setTimeout(() => setLoaded(true), 50);
    };
    document.head.appendChild(script);
  }, []);

  return loaded;
}

// ─────────────────────────────────────────
// SVG BIKE ICON — matches SwiftNija orange style
// heading = rotation in degrees
// ─────────────────────────────────────────
function buildBikeSvgUrl(heading: number): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
      <g transform="rotate(${heading},28,28)">
        <!-- Shadow -->
        <ellipse cx="28" cy="46" rx="14" ry="4" fill="rgba(0,0,0,0.25)" />
        <!-- Body glow -->
        <circle cx="28" cy="26" r="18" fill="rgba(255,107,0,0.18)" />
        <!-- Rider + Bike icon (simplified motorbike top-down) -->
        <!-- Wheels -->
        <circle cx="18" cy="32" r="7" fill="none" stroke="#FF6B00" stroke-width="3"/>
        <circle cx="38" cy="32" r="7" fill="none" stroke="#FF6B00" stroke-width="3"/>
        <!-- Frame -->
        <line x1="18" y1="32" x2="28" y2="22" stroke="#FF6B00" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="28" y1="22" x2="38" y2="32" stroke="#FF6B00" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="28" y1="22" x2="28" y2="30" stroke="#FF6B00" stroke-width="2" stroke-linecap="round"/>
        <!-- Rider head -->
        <circle cx="28" cy="19" r="5" fill="#FF6B00"/>
        <!-- Delivery box -->
        <rect x="22" y="28" width="12" height="8" rx="2" fill="#FF8C00"/>
        <!-- Hub dots -->
        <circle cx="18" cy="32" r="2" fill="#FF6B00"/>
        <circle cx="38" cy="32" r="2" fill="#FF6B00"/>
        <!-- Direction arrow -->
        <polygon points="28,8 24,15 32,15" fill="#FF6B00" opacity="0.9"/>
      </g>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

// ─────────────────────────────────────────
// SMOOTH MARKER ANIMATION
// ─────────────────────────────────────────
function animateMarkerTo(
  marker: google.maps.Marker,
  targetLat: number,
  targetLng: number,
  durationMs: number = 1200,
) {
  const start = marker.getPosition();
  if (!start) {
    marker.setPosition({ lat: targetLat, lng: targetLng });
    return;
  }
  const startLat = start.lat();
  const startLng = start.lng();
  const startTime = performance.now();

  function step(now: number) {
    const t = Math.min((now - startTime) / durationMs, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
    marker.setPosition({
      lat: startLat + (targetLat - startLat) * ease,
      lng: startLng + (targetLng - startLng) * ease,
    });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─────────────────────────────────────────
// COMPUTE HEADING (bearing) between two points
// ─────────────────────────────────────────
function computeHeading(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─────────────────────────────────────────
// FIRESTORE SCHEMA EXPECTED
// Collection: "orders/{orderId}"
// Fields:
//   status: OrderStatus
//   riderLat: number
//   riderLng: number
//   riderHeading?: number
//   riderName?: string
//   riderVehicleId?: string
//   riderPhotoURL?: string
//   eta?: number  (minutes)
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function TrackDeliveryMap({
  orderId,
  storeLat = 6.5833,
  storeLng = 3.3667,
  storeName = "Store",
  destLat,
  destLng,
  destAddress,
  onClose,
}: TrackDeliveryMapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mapsLoaded = useGoogleMaps();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const bikeMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const prevRiderPos = useRef<LatLng | null>(null);

  const [rider, setRider] = useState<RiderData | null>(null);
  const [status, setStatus] = useState<OrderStatus>("confirmed");
  const [eta, setEta] = useState<number | null>(null);
  const [mapsError, setMapsError] = useState(false);

  // ── Dark / light map styles ──
  const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#0f0f13" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0f0f13" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#44445a" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#1e1e28" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#252530" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8888a0" }],
    },
    {
      featureType: "road",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#0d0d14" }],
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#141418" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#141f14" }],
    },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    {
      featureType: "administrative",
      elementType: "geometry.stroke",
      stylers: [{ color: "#1e1e26" }],
    },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#8888a0" }],
    },
  ];

  const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#f0f0f5" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f0f0f5" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#55556a" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#e0e0ea" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#d5d5e5" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#55556a" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#c8d8e8" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#d4ecd4" }],
    },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
  ];

  // ── Init map ──
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;

    const center: LatLng = {
      lat: (storeLat + destLat) / 2,
      lng: (storeLng + destLng) / 2,
    };

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      styles: isDark ? DARK_STYLE : LIGHT_STYLE,
      disableDefaultUI: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;

    // ── Store marker (house icon) ──
    const storeMarker = new google.maps.Marker({
      position: { lat: storeLat, lng: storeLng },
      map,
      icon: {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="rgba(255,107,0,0.15)" stroke="#FF6B00" stroke-width="1.5"/>
            <text x="18" y="24" text-anchor="middle" font-size="18">🏠</text>
          </svg>
        `)}`,
        scaledSize: new google.maps.Size(36, 36),
        anchor: new google.maps.Point(18, 18),
      },
      title: storeName,
      zIndex: 10,
    });

    // ── Destination marker (pin) ──
    const destSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
        <ellipse cx="20" cy="45" rx="10" ry="3" fill="rgba(0,0,0,0.2)"/>
        <path d="M20 2C12.27 2 6 8.27 6 16c0 10.5 14 30 14 30s14-19.5 14-30C34 8.27 27.73 2 20 2z"
              fill="#FF6B00" stroke="#fff" stroke-width="2"/>
        <circle cx="20" cy="16" r="6" fill="white"/>
      </svg>
    `;
    new google.maps.Marker({
      position: { lat: destLat, lng: destLng },
      map,
      icon: {
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(destSvg)}`,
        scaledSize: new google.maps.Size(40, 48),
        anchor: new google.maps.Point(20, 48),
      },
      title: destAddress || "Destination",
      zIndex: 10,
    });

    // ── Route polyline (store → dest) ──
    routePolylineRef.current = new google.maps.Polyline({
      path: [
        { lat: storeLat, lng: storeLng },
        { lat: destLat, lng: destLng },
      ],
      geodesic: true,
      strokeColor: "#FF6B00",
      strokeOpacity: 0,
      strokeWeight: 0,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 0.85,
            strokeColor: "#FF6B00",
            strokeWeight: 3,
            scale: 4,
          },
          offset: "0",
          repeat: "20px",
        },
      ],
      map,
      zIndex: 5,
    });

    // ── Bike marker (will be updated from Firestore) ──
    bikeMarkerRef.current = new google.maps.Marker({
      position: { lat: storeLat, lng: storeLng },
      map,
      icon: {
        url: buildBikeSvgUrl(0),
        scaledSize: new google.maps.Size(56, 56),
        anchor: new google.maps.Point(28, 28),
      },
      title: "Rider",
      zIndex: 20,
      optimized: false,
    });

    // Auto-fit bounds
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: storeLat, lng: storeLng });
    bounds.extend({ lat: destLat, lng: destLng });
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 200, left: 40 });

    return () => {
      google.maps.event.clearInstanceListeners(map);
    };
  }, [mapsLoaded]);

  // ── Update map style on theme change ──
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setOptions({
      styles: isDark ? DARK_STYLE : LIGHT_STYLE,
    });
  }, [isDark]);

  // ── Firebase real-time listener ──
  useEffect(() => {
    if (!orderId) return;

    const unsub = onSnapshot(
      doc(db, "orders", orderId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        const newStatus: OrderStatus = data.status || "confirmed";
        const newEta: number | null = data.eta ?? null;
        const riderLat: number | undefined = data.riderLat;
        const riderLng: number | undefined = data.riderLng;

        setStatus(newStatus);
        setEta(newEta);

        if (riderLat !== undefined && riderLng !== undefined) {
          const prevPos = prevRiderPos.current;
          let heading = data.riderHeading ?? 0;

          // Compute heading from movement if Firestore doesn't provide it
          if (prevPos) {
            const computed = computeHeading(prevPos, {
              lat: riderLat,
              lng: riderLng,
            });
            if (Math.abs(computed) > 0.1) heading = computed;
          }

          const newRider: RiderData = {
            lat: riderLat,
            lng: riderLng,
            heading,
            name: data.riderName,
            vehicleId: data.riderVehicleId,
            photoURL: data.riderPhotoURL,
          };
          setRider(newRider);

          // Animate marker
          if (bikeMarkerRef.current && mapInstanceRef.current) {
            animateMarkerTo(bikeMarkerRef.current, riderLat, riderLng, 1200);

            // Rotate bike icon based on heading
            bikeMarkerRef.current.setIcon({
              url: buildBikeSvgUrl(heading),
              scaledSize: new google.maps.Size(56, 56),
              anchor: new google.maps.Point(28, 28),
            });

            // Pan map to keep rider visible
            if (newStatus === "picked_up" || newStatus === "arriving") {
              const currentCenter = mapInstanceRef.current.getCenter();
              if (currentCenter) {
                const dist =
                  google.maps.geometry.spherical.computeDistanceBetween(
                    currentCenter,
                    new google.maps.LatLng(riderLat, riderLng),
                  );
                // Smoothly pan if rider moves far from center
                if (dist > 300) {
                  mapInstanceRef.current.panTo({
                    lat: riderLat,
                    lng: riderLng,
                  });
                }
              }
            }

            // Update route polyline to rider's current position
            if (routePolylineRef.current) {
              routePolylineRef.current.setPath([
                { lat: riderLat, lng: riderLng },
                { lat: destLat, lng: destLng },
              ]);
            }
          }

          prevRiderPos.current = { lat: riderLat, lng: riderLng };
        }
      },
      (err) => {
        console.error("[TrackDeliveryMap] Firestore error:", err);
        setMapsError(true);
      },
    );

    return () => unsub();
  }, [orderId, destLat, destLng]);

  // ─── Derived UI ───
  const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
    { key: "confirmed", label: "Order Confirmed" },
    { key: "picked_up", label: "Rider Picked Up" },
    { key: "arriving", label: "Arriving Soon" },
  ];

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === status);

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className={`tdm-root ${isDark ? "dark" : "light"}`}>
      {/* Header */}
      <div className="tdm-header">
        {onClose && (
          <button className="tdm-back" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M5 12l7-7M5 12l7 7" />
            </svg>
          </button>
        )}
        <span className="tdm-title">Order Tracking</span>
      </div>

      {/* Map */}
      <div className="tdm-map-wrap">
        <div ref={mapRef} className="tdm-map" />

        {!mapsLoaded && !mapsError && (
          <div className="tdm-map-placeholder">
            <div className="tdm-map-ph-bike">🏍️</div>
            <p>Loading map...</p>
          </div>
        )}

        {mapsError && (
          <div className="tdm-map-placeholder">
            <p style={{ color: "#ef4444" }}>Could not load tracking data.</p>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="tdm-sheet">
        {/* ETA */}
        <div className="tdm-eta-row">
          {eta !== null ? (
            <>
              <span className="tdm-eta-label">Arriving in</span>
              <span className="tdm-eta-value">{eta} mins</span>
            </>
          ) : status === "delivered" ? (
            <span
              className="tdm-eta-value"
              style={{ fontSize: 20, color: "#10B981" }}
            >
              Delivered! 🎉
            </span>
          ) : (
            <span className="tdm-eta-label">Tracking your order...</span>
          )}
        </div>

        {/* Status steps */}
        <div className="tdm-steps">
          {STATUS_STEPS.map((step, i) => {
            const done = i < currentStepIdx || status === "delivered";
            const current = i === currentStepIdx && status !== "delivered";
            return (
              <div key={step.key} className="tdm-step-row">
                <div
                  className={`tdm-step-circle ${done ? "done" : current ? "current" : "pending"}`}
                >
                  {done ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : current ? (
                    <div className="tdm-step-pulse" />
                  ) : null}
                </div>
                <span
                  className={`tdm-step-label ${done ? "done" : current ? "current" : "pending"}`}
                >
                  {step.label}
                </span>
                <div className={`tdm-step-right-circle ${done ? "done" : ""}`}>
                  {done && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rider info */}
        {rider && (
          <div className="tdm-rider">
            <span className="tdm-rider-section">Rider Information</span>
            <div className="tdm-rider-row">
              <div className="tdm-rider-avatar">
                {rider.photoURL ? (
                  <img
                    src={rider.photoURL}
                    alt="Rider"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <span>🏍️</span>
                )}
              </div>
              <div className="tdm-rider-info">
                <span className="tdm-rider-name">
                  {rider.name || "Your Rider"}
                </span>
                {rider.vehicleId && (
                  <span className="tdm-rider-id">{rider.vehicleId}</span>
                )}
              </div>
              <div className="tdm-rider-actions">
                <button className="tdm-rider-btn call" title="Call rider">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                </button>
                <button className="tdm-rider-btn chat" title="Message rider">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// STYLES — matches SwiftNija dark theme exactly
// ─────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');

  .tdm-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    font-family: 'Nunito', sans-serif;
    overflow: hidden;
    position: relative;
  }

  .tdm-root.dark {
    --bg: #0a0a0d;
    --surface: #111115;
    --card: #16161b;
    --border: #1e1e26;
    --text: #e8e8f0;
    --text2: #8888a0;
    --text3: #44445a;
    --accent: #FF6B00;
    --sheet-bg: rgba(16,16,20,0.97);
  }

  .tdm-root.light {
    --bg: #f0f0f5;
    --surface: #ffffff;
    --card: #ffffff;
    --border: #e0e0ea;
    --text: #111118;
    --text2: #55556a;
    --text3: #aaaabc;
    --accent: #FF6B00;
    --sheet-bg: rgba(255,255,255,0.98);
  }

  /* Header */
  .tdm-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 20;
    flex-shrink: 0;
  }

  .tdm-back {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: #FF6B00;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .tdm-title {
    font-family: 'Syne', sans-serif;
    font-size: 17px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.3px;
  }

  /* Map */
  .tdm-map-wrap {
    flex: 1;
    position: relative;
    min-height: 0;
    background: var(--bg);
  }

  .tdm-map {
    width: 100%;
    height: 100%;
    background: var(--bg);
  }

  .tdm-map-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: var(--bg);
    color: var(--text3);
    font-size: 13px;
    font-weight: 700;
  }

  .tdm-map-ph-bike {
    font-size: 40px;
    animation: tdm-bounce 1.2s ease-in-out infinite;
  }

  @keyframes tdm-bounce {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-8px); }
  }

  /* Bottom sheet */
  .tdm-sheet {
    background: var(--sheet-bg);
    border-top: 1.5px solid var(--border);
    padding: 16px 18px 20px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    backdrop-filter: blur(16px);
  }

  /* ETA */
  .tdm-eta-row {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    align-self: flex-end;
    text-align: right;
  }

  .tdm-eta-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text2);
  }

  .tdm-eta-value {
    font-family: 'Syne', sans-serif;
    font-size: 28px;
    font-weight: 900;
    color: var(--text);
    letter-spacing: -1px;
    line-height: 1;
  }

  /* Steps */
  .tdm-steps {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--card);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    padding: 4px 0;
  }

  .tdm-step-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--border);
  }

  .tdm-step-row:last-child { border-bottom: none; }

  .tdm-step-circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.3s;
  }

  .tdm-step-circle.done {
    background: #FF6B00;
    box-shadow: 0 2px 8px rgba(255,107,0,0.4);
  }

  .tdm-step-circle.current {
    background: transparent;
    border: 2.5px solid #FF6B00;
  }

  .tdm-step-circle.pending {
    background: transparent;
    border: 2px solid var(--border);
  }

  .tdm-step-pulse {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #FF6B00;
    animation: tdm-pulse 1.5s ease-in-out infinite;
  }

  @keyframes tdm-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%       { transform: scale(1.3); opacity: 0.7; }
  }

  .tdm-step-label {
    flex: 1;
    font-size: 14px;
    font-weight: 700;
  }

  .tdm-step-label.done    { color: var(--text); }
  .tdm-step-label.current { color: var(--text); }
  .tdm-step-label.pending { color: var(--text3); }

  .tdm-step-right-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text3);
    transition: all 0.3s;
  }

  .tdm-step-right-circle.done {
    background: #FF6B00;
    border-color: #FF6B00;
    color: white;
  }

  /* Rider */
  .tdm-rider {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tdm-rider-section {
    font-size: 12px;
    font-weight: 800;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .tdm-rider-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--card);
    border: 1.5px solid var(--border);
    border-radius: 14px;
    padding: 12px 14px;
  }

  .tdm-rider-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(255,107,0,0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
    border: 2px solid rgba(255,107,0,0.3);
    overflow: hidden;
  }

  .tdm-rider-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tdm-rider-name {
    font-size: 14px;
    font-weight: 800;
    color: var(--text);
  }

  .tdm-rider-id {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text3);
  }

  .tdm-rider-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .tdm-rider-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s, opacity 0.2s;
  }

  .tdm-rider-btn:hover { transform: scale(1.08); }
  .tdm-rider-btn:active { transform: scale(0.95); }

  .tdm-rider-btn.call {
    background: #25D366;
    color: white;
  }

  .tdm-rider-btn.chat {
    background: #FF6B00;
    color: white;
  }
`;
