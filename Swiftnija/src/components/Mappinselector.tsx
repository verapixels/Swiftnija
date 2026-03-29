import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiMapPin, FiX, FiCheck, FiSearch, FiNavigation,
  FiHome, FiBriefcase, FiEdit3, FiInfo, FiPhone, FiAlertCircle,
} from "react-icons/fi";
import { MdMyLocation, MdPinDrop } from "react-icons/md";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type Address = {
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

type SearchResult = {
  placeId?: string;
  displayName: string;
  lat: number;
  lng: number;
  source: "google" | "osm";
};

type GeoResult = {
  address: string;
  source: "google" | "osm" | "none";
};

// ─────────────────────────────────────────
// ENV — only used for loading the Maps JS SDK (map tiles/display)
// All API calls (search, geocode) now go through Cloud Functions
// ─────────────────────────────────────────
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// ─────────────────────────────────────────
// DELIVERY FEE CALCULATOR
// ─────────────────────────────────────────
function calcDeliveryFee(distanceKm: number): number {
  return Math.round(800 + distanceKm * 150);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────
// FORWARD SEARCH — Cloud Function proxy + OSM fallback
// ─────────────────────────────────────────
async function searchAddresses(query: string): Promise<SearchResult[]> {
  if (query.trim().length < 2) return [];
  const results: SearchResult[] = [];

  // 1. Cloud Function proxy (no CORS issues)
  try {
    const fn = httpsCallable<
      { query: string },
      { results: Array<{ placeId: string; displayName: string; lat: number; lng: number }> }
    >(functions, "mapsTextSearch");
    const res = await fn({ query });
    for (const r of res.data.results) {
      results.push({ ...r, source: "google" });
    }
  } catch { /* fall through to OSM */ }

  // 2. OSM Nominatim — always works from browser, no CORS
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ng&limit=4&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data: any[] = await res.json();
    for (const r of data) {
      const duplicate = results.some(
        ex => Math.abs(ex.lat - parseFloat(r.lat)) < 0.001 &&
              Math.abs(ex.lng - parseFloat(r.lon)) < 0.001
      );
      if (!duplicate) {
        results.push({
          displayName: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          source: "osm",
        });
      }
    }
  } catch { /* fall through */ }

  return results.slice(0, 6);
}

// ─────────────────────────────────────────
// REVERSE GEOCODE — Cloud Function proxy + OSM fallback
// ─────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  // 1. Cloud Function proxy
  try {
    const fn = httpsCallable<{ lat: number; lng: number }, { address: string }>(
      functions, "mapsReverseGeocode"
    );
    const res = await fn({ lat, lng });
    if (res.data.address) return { address: res.data.address, source: "google" };
  } catch { /* fall through */ }

  // 2. OSM fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data.display_name) return { address: data.display_name, source: "osm" };
  } catch { /* fall through */ }

  return { address: "", source: "none" };
}

// ─────────────────────────────────────────
// FORWARD GEOCODE FROM FREE TEXT — Cloud Function proxy + OSM fallback
// ─────────────────────────────────────────
async function geocodeFromText(text: string): Promise<{ lat: number; lng: number } | null> {
  if (text.trim().length < 4) return null;

  // 1. Cloud Function proxy
  try {
    const fn = httpsCallable<{ address: string }, { lat: number | null; lng: number | null }>(
      functions, "mapsForwardGeocode"
    );
    const res = await fn({ address: text });
    if (res.data.lat !== null && res.data.lng !== null) {
      return { lat: res.data.lat, lng: res.data.lng };
    }
  } catch { /* fall through */ }

  // 2. OSM fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=ng&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data: any[] = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* fall through */ }

  return null;
}

// ─────────────────────────────────────────
// SDK LOADERS
// ─────────────────────────────────────────
function loadGoogleMapsSDK(): Promise<boolean> {
  return new Promise(resolve => {
    if (!GOOGLE_API_KEY) { resolve(false); return; }
    if ((window as any).google?.maps) { resolve(true); return; }
    const existing = document.querySelector("script[data-gmaps]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.setAttribute("data-gmaps", "1");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&language=en`;
    script.async = true;
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function loadLeaflet(): Promise<boolean> {
  return new Promise(resolve => {
    if ((window as any).L) { resolve(true); return; }
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

// ─────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────
type MapPinSelectorProps = {
  onConfirm: (lat: number, lng: number, address: string, extra: Partial<Address>) => void;
  onClose: () => void;
  savedAddresses?: Address[];
  vendorLat?: number;
  vendorLng?: number;
  showAddressFields?: boolean;
  label?: "Home" | "Work" | "Other";
  onLabelChange?: (l: "Home" | "Work" | "Other") => void;
  initialLat?: number;
  initialLng?: number;
  isDark?: boolean;
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export function MapPinSelector({
  onConfirm,
  onClose,
  savedAddresses = [],
  vendorLat,
  vendorLng,
  showAddressFields = false,
  label: externalLabel,
  onLabelChange,
  initialLat,
  initialLng,
  isDark = true,
}: MapPinSelectorProps) {

  const mapRef        = useRef<HTMLDivElement>(null);
  const gMapRef       = useRef<any>(null);
  const gMarkerRef    = useRef<any>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletMarker = useRef<any>(null);
  const mapEngine     = useRef<"google" | "leaflet" | null>(null);

  const DEFAULT_LAT = initialLat ?? 6.5244;
  const DEFAULT_LNG = initialLng ?? 3.3792;

  const [pinLat,        setPinLat]        = useState<number | null>(initialLat ?? null);
  const [pinLng,        setPinLng]        = useState<number | null>(initialLng ?? null);
  const [detectedAddr,  setDetectedAddr]  = useState("");
  const [addrSource,    setAddrSource]    = useState<"google"|"osm"|"none"|null>(null);
  const [searchQ,       setSearchQ]       = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [landmark,      setLandmark]      = useState("");
  const [extraClue,     setExtraClue]     = useState("");
  const [phone,         setPhone]         = useState("");
  const [addrLabel,     setAddrLabel]     = useState<"Home"|"Work"|"Other">(externalLabel ?? "Home");
  const [geocoding,     setGeocoding]     = useState(false);
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [mapReady,      setMapReady]      = useState(false);
  const [deliveryFee,   setDeliveryFee]   = useState<number | null>(null);
  const [distanceKm,    setDistanceKm]    = useState<number | null>(null);
  const [lmGeocoding,   setLmGeocoding]   = useState(false);
  const [lmFound,       setLmFound]       = useState(false);

  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landmarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delivery fee ──
  const updateDelivery = useCallback((lat: number, lng: number) => {
    if (vendorLat !== undefined && vendorLng !== undefined) {
      const km = haversineKm(vendorLat, vendorLng, lat, lng);
      setDistanceKm(parseFloat(km.toFixed(1)));
      setDeliveryFee(calcDeliveryFee(km));
    }
  }, [vendorLat, vendorLng]);

  // ── Place pin on map ──
  const placePin = useCallback(async (lat: number, lng: number, skipReverseGeocode = false) => {
    setPinLat(lat);
    setPinLng(lng);
    updateDelivery(lat, lng);

    // ── Google Maps marker ──
    if (mapEngine.current === "google" && gMapRef.current) {
      const G = (window as any).google.maps;
      const pos = { lat, lng };

      if (!gMarkerRef.current) {
        gMarkerRef.current = new G.Marker({
          position: pos,
          map: gMapRef.current,
          draggable: true,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PIN_SVG)}`,
            scaledSize: new G.Size(44, 44),
            anchor: new G.Point(22, 22),
          },
          animation: G.Animation.DROP,
        });
        gMarkerRef.current.addListener("dragend", async () => {
          const p = gMarkerRef.current.getPosition();
          await placePin(p.lat(), p.lng());
        });
      } else {
        gMarkerRef.current.setPosition(pos);
      }

      gMapRef.current.panTo(pos);
    }

    // ── Leaflet marker ──
    if (mapEngine.current === "leaflet" && leafletMapRef.current) {
      const L = (window as any).L;
      const icon = L.divIcon({ className: "", html: PIN_HTML, iconSize: [0, 0] });
      if (leafletMarker.current) {
        leafletMarker.current.setLatLng([lat, lng]);
      } else {
        leafletMarker.current = L.marker([lat, lng], { icon, draggable: true })
          .addTo(leafletMapRef.current);
        leafletMarker.current.on("dragend", async (e: any) => {
          const p = e.target.getLatLng();
          await placePin(p.lat, p.lng);
        });
      }
      leafletMapRef.current.panTo([lat, lng], { animate: true, duration: 0.4 });
    }

    // ── Reverse geocode ──
    if (!skipReverseGeocode) {
      setGeocoding(true);
      const result = await reverseGeocode(lat, lng);
      setDetectedAddr(result.address);
      setAddrSource(result.source);
      if (result.address) {
        setSearchQ(result.address.split(",").slice(0, 3).join(",").trim());
      }
      setGeocoding(false);
    }
  }, [updateDelivery]);

  // ── Init map ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapRef.current) return;

      const googleOk = await loadGoogleMapsSDK();
      if (cancelled || !mapRef.current) return;

      if (googleOk && (window as any).google?.maps) {
        mapEngine.current = "google";
        const G = (window as any).google.maps;

        gMapRef.current = new G.Map(mapRef.current, {
          center: { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: G.ControlPosition.RIGHT_BOTTOM },
          styles: isDark ? GOOGLE_DARK_STYLE : GOOGLE_LIGHT_STYLE,
          gestureHandling: "greedy",
        });

        gMapRef.current.addListener("click", async (e: any) => {
          await placePin(e.latLng.lat(), e.latLng.lng());
        });

        setMapReady(true);
        if (initialLat && initialLng) {
          setTimeout(() => placePin(initialLat, initialLng), 300);
        }
      } else {
        // Leaflet fallback
        const leafletOk = await loadLeaflet();
        if (!leafletOk || cancelled || !mapRef.current) return;

        mapEngine.current = "leaflet";
        const L = (window as any).L;

        leafletMapRef.current = L.map(mapRef.current, {
          center: [DEFAULT_LAT, DEFAULT_LNG],
          zoom: 14,
          zoomControl: false,
          attributionControl: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 20,
          subdomains: ["a", "b", "c"],
        }).addTo(leafletMapRef.current);

        L.control.zoom({ position: "bottomright" }).addTo(leafletMapRef.current);
        leafletMapRef.current.on("click", async (e: any) => {
          await placePin(e.latlng.lat, e.latlng.lng);
        });

        setMapReady(true);
        if (initialLat && initialLng) {
          setTimeout(() => placePin(initialLat, initialLng), 300);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live search as user types in main input ──
  const handleSearchInput = (val: string) => {
    setSearchQ(val);
    setShowDropdown(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setSearchResults([]); return; }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAddresses(val);
      setSearchResults(results);
      setSearching(false);
      if (results[0]) {
        await placePin(results[0].lat, results[0].lng, true);
      }
    }, 500);
  };

  const selectResult = async (r: SearchResult) => {
    setShowDropdown(false);
    setSearchResults([]);
    setSearchQ(r.displayName.split(",").slice(0, 3).join(",").trim());
    await placePin(r.lat, r.lng);
    if (mapEngine.current === "google"  && gMapRef.current)       gMapRef.current.setZoom(17);
    if (mapEngine.current === "leaflet" && leafletMapRef.current)  leafletMapRef.current.setZoom(17);
  };

  // ── Landmark field — geocodes live and moves pin ──
  const handleLandmarkInput = (val: string) => {
    setLandmark(val);
    setLmFound(false);
    if (landmarkTimer.current) clearTimeout(landmarkTimer.current);
    if (val.trim().length < 4) return;

    landmarkTimer.current = setTimeout(async () => {
      setLmGeocoding(true);
      const combined = [val, extraClue].filter(Boolean).join(", ");
      const coords = await geocodeFromText(combined);
      if (coords) {
        setLmFound(true);
        await placePin(coords.lat, coords.lng);
        if (mapEngine.current === "google"  && gMapRef.current)      gMapRef.current.setZoom(17);
        if (mapEngine.current === "leaflet" && leafletMapRef.current) leafletMapRef.current.setZoom(17);
      }
      setLmGeocoding(false);
    }, 700);
  };

  // ── Extra clue field — also tries to geocode ──
  const handleExtraClueInput = (val: string) => {
    setExtraClue(val);
    if (landmarkTimer.current) clearTimeout(landmarkTimer.current);
    if (val.trim().length < 4 || !landmark) return;

    landmarkTimer.current = setTimeout(async () => {
      setLmGeocoding(true);
      const combined = [landmark, val].filter(Boolean).join(", ");
      const coords = await geocodeFromText(combined);
      if (coords) {
        setLmFound(true);
        await placePin(coords.lat, coords.lng);
      }
      setLmGeocoding(false);
    }, 700);
  };

  // ── GPS ──
  const handleGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await placePin(pos.coords.latitude, pos.coords.longitude);
        if (mapEngine.current === "google"  && gMapRef.current)      gMapRef.current.setZoom(18);
        if (mapEngine.current === "leaflet" && leafletMapRef.current) leafletMapRef.current.setZoom(18);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    if (!pinLat || !pinLng) return;
    onConfirm(pinLat, pinLng, detectedAddr || searchQ, {
      landmark, extraClue, phone,
      label: externalLabel ?? addrLabel,
    });
  };

  const handleLabelChange = (l: "Home" | "Work" | "Other") => {
    setAddrLabel(l);
    onLabelChange?.(l);
  };

  const canConfirm   = !!pinLat && !!pinLng;
  const addrNotFound = addrSource === "none" && pinLat !== null;

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="mps-overlay" onClick={onClose}>
      <div className="mps-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mps-header">
          <div className="mps-header-left">
            <div className="mps-header-icon"><MdPinDrop size={18} /></div>
            <div>
              <div className="mps-title">Set Delivery Location</div>
              <div className="mps-subtitle">
                {mapEngine.current === "google"
                  ? "🗺 Google Maps · Real-time Nigerian addresses"
                  : "🗺 OpenStreetMap · GPS pin always accurate"}
              </div>
            </div>
          </div>
          <button className="mps-close" onClick={onClose}><FiX size={18} /></button>
        </div>

        {/* Saved quick-pick */}
        {savedAddresses.length > 0 && (
          <div className="mps-saved-row">
            {savedAddresses.map(a => (
              <button key={a.id} className="mps-saved-chip"
                onClick={() => a.lat && a.lng && placePin(a.lat, a.lng)}>
                {a.label === "Home" ? <FiHome size={11} />
                  : a.label === "Work" ? <FiBriefcase size={11} />
                  : <FiMapPin size={11} />}
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Main search bar ── */}
        <div className="mps-search-wrap">
          <div className={`mps-search-row${searching ? " mps-searching" : ""}`}>
            <FiSearch size={14} color="#FF6B00" />
            <input
              className="mps-search-input"
              value={searchQ}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 180)}
              placeholder="Type address, street, area or landmark…"
              autoComplete="off"
            />
            {searching && <span className="mps-spin" />}
            {pinLat && !searching && <FiCheck size={14} color="#10B981" />}
          </div>

          {/* Live dropdown results */}
          {showDropdown && searchResults.length > 0 && (
            <div className="mps-results">
              {searchResults.map((r, i) => (
                <button key={i} className="mps-result-item" onMouseDown={() => selectResult(r)}>
                  <div className="mps-result-left">
                    <span className={`mps-result-badge mps-badge-${r.source}`}>
                      {r.source === "google" ? "G" : "OSM"}
                    </span>
                    <span className="mps-result-text">{r.displayName}</span>
                  </div>
                  <FiMapPin size={11} color="#FF6B00" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── MAP ── */}
        <div className={`mps-map-container${
          mapEngine.current === "leaflet" ? (isDark ? " mps-map-dark" : " mps-map-light") : ""
        }`}>
          <div ref={mapRef} className="mps-map" />

          {!mapReady && (
            <div className="mps-map-loading">
              <span className="mps-spin" style={{ width: 24, height: 24, borderWidth: 3 }} />
              <span>Loading map…</span>
            </div>
          )}

          <button className="mps-gps-btn" onClick={handleGPS} disabled={gpsLoading} title="Use my GPS location">
            {gpsLoading ? <span className="mps-spin dark" /> : <MdMyLocation size={20} color="#FF6B00" />}
          </button>

          {!pinLat && mapReady && (
            <div className="mps-tap-hint">
              <MdPinDrop size={16} />
              <span>Tap map to drop pin</span>
            </div>
          )}

          {pinLat && pinLng && (
            <div className="mps-coords-badge">
              <FiNavigation size={10} />
              {pinLat.toFixed(5)}, {pinLng.toFixed(5)}
            </div>
          )}
        </div>

        {/* ── Address result card ── */}
        {pinLat && (
          <div className={`mps-address-card${addrNotFound ? " warn" : ""}`}>
            <div className="mps-address-row">
              <div className={`mps-dot${addrNotFound ? " warn" : ""}`} />
              <span className="mps-addr-tag">
                {geocoding ? "Detecting address…"
                  : addrNotFound    ? "Address not found"
                  : addrSource === "google" ? "Google Maps"
                  : addrSource === "osm"    ? "OpenStreetMap"
                  : "Detected"}
              </span>
              {geocoding && <span className="mps-spin" style={{ width: 12, height: 12 }} />}
              {!geocoding && addrSource && addrSource !== "none" && (
                <span className={`mps-src-badge mps-src-${addrSource}`}>
                  {addrSource === "google" ? "Google" : "OSM"}
                </span>
              )}
            </div>

            {addrNotFound ? (
              <div className="mps-not-found-msg">
                <FiAlertCircle size={13} color="#f59e0b" />
                <span>No address found for this pin. That's okay — your GPS coordinates are saved. Fill in the landmark and clue below so your rider can find you.</span>
              </div>
            ) : (
              <div className="mps-addr-text">{detectedAddr}</div>
            )}

            <div className="mps-addr-hint">
              <FiInfo size={10} /> Drag the pin to fine-tune your exact spot
            </div>
          </div>
        )}

        {/* ── Delivery fee ── */}
        {deliveryFee !== null && distanceKm !== null && (
          <div className="mps-fee-card">
            <div>
              <div className="mps-fee-label">Estimated Delivery Fee</div>
              <div className="mps-fee-calc">₦800 base + {distanceKm}km × ₦150</div>
            </div>
            <div className="mps-fee-amount">₦{deliveryFee.toLocaleString()}</div>
          </div>
        )}

        {/* ── Save as label ── */}
        {showAddressFields && (
          <div className="mps-label-row">
            <span className="mps-field-lbl">Save as</span>
            <div className="mps-label-pills">
              {(["Home", "Work", "Other"] as const).map(l => (
                <button key={l}
                  className={`mps-label-pill${addrLabel === l ? " active" : ""}`}
                  onClick={() => handleLabelChange(l)}>
                  {l === "Home" ? <FiHome size={11} />
                    : l === "Work" ? <FiBriefcase size={11} />
                    : <FiMapPin size={11} />}
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Rider info fields ── */}
        <div className="mps-rider-section">
          <div className="mps-rider-header">
            <FiInfo size={11} color="#FF6B00" />
            <span>Help your rider find you — typing here also moves the pin</span>
          </div>

          <div className="mps-field-row">
            <FiNavigation size={13} color="#FF6B00" />
            <input
              className="mps-field-input"
              value={landmark}
              onChange={e => handleLandmarkInput(e.target.value)}
              placeholder="Nearest landmark (e.g. beside First Bank Epe)"
            />
            {lmGeocoding && <span className="mps-spin" style={{ width: 12, height: 12 }} />}
            {lmFound && !lmGeocoding && <FiCheck size={13} color="#10B981" />}
          </div>

          <div className="mps-field-row">
            <FiEdit3 size={13} color="#FF6B00" />
            <input
              className="mps-field-input"
              value={extraClue}
              onChange={e => handleExtraClueInput(e.target.value)}
              placeholder="Extra clue (e.g. Blue gate, 2nd house after junction)"
            />
          </div>

          {showAddressFields && (
            <div className="mps-field-row">
              <FiPhone size={13} color="#FF6B00" />
              <input
                className="mps-field-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Phone number for this address (optional)"
              />
            </div>
          )}

          {!pinLat && (
            <div className="mps-pre-pin-hint">
              <MdPinDrop size={14} color="#FF6B00" />
              <span>Drop a pin on the map, or type a landmark above — the pin will move automatically</span>
            </div>
          )}
        </div>

        {/* ── Confirm button ── */}
        <button className="mps-confirm-btn" disabled={!canConfirm} onClick={handleConfirm}>
          <FiCheck size={15} />
          {canConfirm ? "Confirm This Location" : "Drop a pin on the map first"}
        </button>

      </div>
      <style>{MPS_CSS}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// PIN ASSETS
// ─────────────────────────────────────────
const PIN_HTML = `
<div style="position:relative;width:44px;height:44px;transform:translate(-50%,-50%)">
  <div style="position:absolute;inset:0;border-radius:50%;background:rgba(255,107,0,0.22);animation:pin-pulse 1.8s ease-out infinite"></div>
  <div style="position:absolute;inset:7px;border-radius:50%;background:#FF6B00;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(255,107,0,0.65)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>
</div>`;

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="rgba(255,107,0,0.22)"/>
  <circle cx="22" cy="22" r="14" fill="#FF6B00" filter="drop-shadow(0 4px 8px rgba(255,107,0,0.6))"/>
  <path d="M22 15a5 5 0 0 1 5 5c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 5-5z" fill="white"/>
  <circle cx="22" cy="20" r="2" fill="#FF6B00"/>
</svg>`;

// ─────────────────────────────────────────
// GOOGLE MAPS STYLES
// ─────────────────────────────────────────
const GOOGLE_DARK_STYLE = [
  { elementType: "geometry",           stylers: [{ color: "#16161f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#16161f" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#7a7a92" }] },
  { featureType: "road",               elementType: "geometry",           stylers: [{ color: "#26263a" }] },
  { featureType: "road",               elementType: "geometry.stroke",    stylers: [{ color: "#16161f" }] },
  { featureType: "road.highway",       elementType: "geometry",           stylers: [{ color: "#3b2a00" }] },
  { featureType: "road.highway",       elementType: "geometry.stroke",    stylers: [{ color: "#1f1600" }] },
  { featureType: "road.highway",       elementType: "labels.text.fill",   stylers: [{ color: "#f3d19c" }] },
  { featureType: "road.arterial",      elementType: "geometry",           stylers: [{ color: "#2a2a3e" }] },
  { featureType: "road.arterial",      elementType: "labels.text.fill",   stylers: [{ color: "#6f6f88" }] },
  { featureType: "road.local",         elementType: "labels.text.fill",   stylers: [{ color: "#585870" }] },
  { featureType: "water",              elementType: "geometry",           stylers: [{ color: "#0c1e30" }] },
  { featureType: "water",              elementType: "labels.text.fill",   stylers: [{ color: "#4a5b6d" }] },
  { featureType: "water",              elementType: "labels.text.stroke", stylers: [{ color: "#16263a" }] },
  { featureType: "landscape.natural",  elementType: "geometry",           stylers: [{ color: "#0d1e12" }] },
  { featureType: "poi.park",           elementType: "geometry",           stylers: [{ color: "#0d1e12" }] },
  { featureType: "poi.park",           elementType: "labels.text.fill",   stylers: [{ color: "#5a8a65" }] },
  { featureType: "poi",                elementType: "geometry",           stylers: [{ color: "#1c1c2c" }] },
  { featureType: "poi",                elementType: "labels.text.fill",   stylers: [{ color: "#6a6a82" }] },
  { featureType: "poi.business",       stylers:                           [{ visibility: "on" }] },
  { featureType: "transit",            elementType: "geometry",           stylers: [{ color: "#2c3848" }] },
  { featureType: "transit.station",    elementType: "labels.text.fill",   stylers: [{ color: "#d59563" }] },
  { featureType: "administrative",     elementType: "geometry.stroke",    stylers: [{ color: "#3a5060" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c0a882" }] },
];

const GOOGLE_LIGHT_STYLE = [
  { featureType: "water",              elementType: "geometry",           stylers: [{ color: "#a8ccdf" }] },
  { featureType: "water",              elementType: "labels.text.fill",   stylers: [{ color: "#3d6e8a" }] },
  { featureType: "landscape.natural",  elementType: "geometry",           stylers: [{ color: "#d8edd8" }] },
  { featureType: "poi.park",           elementType: "geometry",           stylers: [{ color: "#c2e2c2" }] },
  { featureType: "poi.park",           elementType: "labels.text.fill",   stylers: [{ color: "#3a7a3a" }] },
  { featureType: "road.highway",       elementType: "geometry",           stylers: [{ color: "#f5d87a" }] },
  { featureType: "road.highway",       elementType: "geometry.stroke",    stylers: [{ color: "#d4b040" }] },
  { featureType: "road.highway",       elementType: "labels.text.fill",   stylers: [{ color: "#5a4a00" }] },
  { featureType: "road.arterial",      elementType: "geometry",           stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local",         elementType: "geometry",           stylers: [{ color: "#f5f5f5" }] },
  { featureType: "poi.business",       stylers:                           [{ visibility: "on" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#2a2a3a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "administrative",     elementType: "geometry.stroke",    stylers: [{ color: "#b0b0c0" }] },
];

// ─────────────────────────────────────────
// CSS
// ─────────────────────────────────────────
const MPS_CSS = `
@keyframes pin-pulse {
  0%   { transform: scale(1);   opacity: 0.7; }
  100% { transform: scale(2.8); opacity: 0; }
}

.mps-overlay {
  position:fixed; inset:0;
  background:rgba(0,0,0,0.75);
  backdrop-filter:blur(10px);
  z-index:3000;
  display:flex; align-items:flex-end; justify-content:center;
  animation:mps-fade .2s ease;
}
@keyframes mps-fade { from{opacity:0} to{opacity:1} }
@media(min-width:768px){ .mps-overlay{ align-items:center; } }

.mps-modal {
  background:var(--surface,#111115);
  border:1px solid var(--border,#1e1e26);
  border-radius:28px 28px 0 0;
  width:100%; max-width:560px;
  display:flex; flex-direction:column; gap:12px;
  padding:20px 18px 28px;
  max-height:96vh; overflow-y:auto; scrollbar-width:none;
  animation:mps-slide .3s cubic-bezier(.34,1.56,.64,1);
}
.mps-modal::-webkit-scrollbar{display:none;}
@keyframes mps-slide{
  from{transform:translateY(60px);opacity:0}
  to{transform:translateY(0);opacity:1}
}
@media(min-width:768px){ .mps-modal{ border-radius:24px; max-height:92vh; } }

.mps-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.mps-header-left{display:flex;align-items:center;gap:12px;}
.mps-header-icon{
  width:40px;height:40px;border-radius:12px;
  background:rgba(255,107,0,.15);
  display:flex;align-items:center;justify-content:center;
  color:#FF6B00;flex-shrink:0;
}
.mps-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--text,#e8e8f0);}
.mps-subtitle{font-size:11px;font-weight:600;color:var(--text3,#44445a);margin-top:2px;}
.mps-close{
  background:transparent;border:none;color:var(--text3,#44445a);
  cursor:pointer;display:flex;align-items:center;
  padding:6px;border-radius:10px;transition:color .2s,background .2s;flex-shrink:0;
}
.mps-close:hover{color:var(--text,#e8e8f0);background:var(--inp,#1a1a22);}

.mps-saved-row{display:flex;gap:7px;flex-wrap:wrap;}
.mps-saved-chip{
  display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;
  background:var(--inp,#1a1a22);border:1.5px solid var(--border,#1e1e26);
  color:var(--text2,#8888a0);font-family:'Nunito',sans-serif;
  font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;
}
.mps-saved-chip:hover{border-color:rgba(255,107,0,.4);color:#FF6B00;background:rgba(255,107,0,.06);}

.mps-search-wrap{position:relative;display:flex;flex-direction:column;gap:6px;}
.mps-search-row{
  display:flex;align-items:center;gap:9px;
  background:var(--inp,#1a1a22);border:1.5px solid var(--inpbd,#252530);
  border-radius:13px;padding:11px 13px;transition:border-color .2s,box-shadow .2s;
}
.mps-search-row:focus-within,.mps-search-row.mps-searching{
  border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.08);
}
.mps-search-input{
  flex:1;background:transparent;border:none;outline:none;
  color:var(--text,#e8e8f0);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;
}
.mps-search-input::placeholder{color:var(--text3,#44445a);}

.mps-results{
  position:absolute;top:calc(100% + 5px);left:0;right:0;
  background:var(--surface,#111115);border:1.5px solid var(--border,#1e1e26);
  border-radius:14px;overflow:hidden;z-index:400;
  box-shadow:0 14px 40px rgba(0,0,0,.5);
  animation:mps-drop .18s cubic-bezier(.34,1.56,.64,1);
}
@keyframes mps-drop{
  from{opacity:0;transform:translateY(-6px) scale(.97)}
  to{opacity:1;transform:translateY(0) scale(1)}
}
.mps-result-item{
  width:100%;display:flex;align-items:center;justify-content:space-between;
  gap:10px;padding:10px 14px;background:transparent;border:none;
  border-bottom:1px solid var(--border,#1e1e26);
  color:var(--text2,#8888a0);font-family:'Nunito',sans-serif;
  font-size:12.5px;font-weight:600;cursor:pointer;text-align:left;transition:background .15s;
}
.mps-result-item:last-child{border-bottom:none;}
.mps-result-item:hover{background:rgba(255,107,0,.06);color:var(--text,#e8e8f0);}
.mps-result-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0;}
.mps-result-text{flex:1;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mps-result-badge{
  font-size:9px;font-weight:900;padding:2px 6px;border-radius:5px;
  flex-shrink:0;text-transform:uppercase;letter-spacing:.3px;
}
.mps-badge-google{background:rgba(66,133,244,.15);color:#4285F4;border:1px solid rgba(66,133,244,.25);}
.mps-badge-osm   {background:rgba(34,197,94,.12); color:#22c55e;border:1px solid rgba(34,197,94,.2);}

.mps-map-container{
  position:relative;border-radius:18px;overflow:hidden;
  border:1.5px solid var(--border,#1e1e26);height:260px;flex-shrink:0;
}
.mps-map{width:100%;height:100%;background:var(--card,#16161b);}

.mps-map-dark  .mps-map{filter:brightness(0.88) contrast(1.05);}
.mps-map-light .mps-map{filter:brightness(1.03) contrast(1.04) saturate(1.1);}
.mps-map-dark .leaflet-control-zoom a{
  background:var(--surface,#111115)!important;
  color:var(--text,#e8e8f0)!important;
  border-color:var(--border,#1e1e26)!important;
}
.mps-map-dark .leaflet-control-zoom a:hover{
  background:rgba(255,107,0,.15)!important;color:#FF6B00!important;
}

.mps-map-loading{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;
  background:var(--card,#16161b);color:var(--text3,#44445a);
  font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;z-index:10;
}

.mps-gps-btn{
  position:absolute;top:12px;right:12px;z-index:500;
  width:42px;height:42px;border-radius:12px;
  background:var(--surface,#111115);border:1.5px solid var(--border,#1e1e26);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:all .2s;box-shadow:0 4px 14px rgba(0,0,0,.4);
}
.mps-gps-btn:hover:not(:disabled){border-color:#FF6B00;background:rgba(255,107,0,.1);}
.mps-gps-btn:disabled{opacity:.6;cursor:not-allowed;}

.mps-tap-hint{
  position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:500;
  display:flex;align-items:center;gap:6px;
  background:rgba(10,10,13,.82);backdrop-filter:blur(8px);
  border:1px solid rgba(255,107,0,.3);border-radius:20px;
  padding:7px 14px;color:#FF6B00;font-family:'Nunito',sans-serif;
  font-size:12px;font-weight:700;pointer-events:none;
  animation:hint-bob 2s ease-in-out infinite;
}
@keyframes hint-bob{
  0%,100%{transform:translateX(-50%) translateY(0)}
  50%    {transform:translateX(-50%) translateY(-4px)}
}

.mps-coords-badge{
  position:absolute;bottom:12px;left:12px;z-index:500;
  display:flex;align-items:center;gap:5px;
  background:rgba(10,10,13,.82);backdrop-filter:blur(8px);
  border:1px solid var(--border,#1e1e26);border-radius:8px;
  padding:5px 10px;font-size:10px;font-weight:700;
  color:var(--text2,#8888a0);pointer-events:none;
}

.mps-address-card{
  background:var(--card,#16161b);border:1.5px solid var(--border,#1e1e26);
  border-radius:14px;padding:13px 14px;
  display:flex;flex-direction:column;gap:5px;animation:mps-fade .25s ease;
}
.mps-address-card.warn{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.03);}
.mps-address-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.mps-dot{
  width:8px;height:8px;border-radius:50%;background:#FF6B00;flex-shrink:0;
  box-shadow:0 0 0 3px rgba(255,107,0,.2);animation:dot-pulse 2s ease-in-out infinite;
}
.mps-dot.warn{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2);}
@keyframes dot-pulse{
  0%,100%{box-shadow:0 0 0 3px rgba(255,107,0,.2)}
  50%    {box-shadow:0 0 0 6px rgba(255,107,0,.06)}
}
.mps-addr-tag{font-size:10px;font-weight:800;color:var(--text3,#44445a);text-transform:uppercase;letter-spacing:.6px;}
.mps-src-badge{
  font-size:9px;font-weight:900;padding:2px 7px;border-radius:5px;
  text-transform:uppercase;letter-spacing:.3px;
}
.mps-src-google{background:rgba(66,133,244,.12);color:#4285F4;border:1px solid rgba(66,133,244,.2);}
.mps-src-osm   {background:rgba(34,197,94,.1); color:#22c55e;border:1px solid rgba(34,197,94,.2);}
.mps-addr-text{font-size:12.5px;font-weight:600;color:var(--text,#e8e8f0);line-height:1.5;}
.mps-not-found-msg{
  display:flex;align-items:flex-start;gap:8px;
  font-size:12px;font-weight:600;color:#f59e0b;line-height:1.55;
}
.mps-addr-hint{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text3,#44445a);font-weight:600;margin-top:2px;}

.mps-fee-card{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(255,107,0,.06);border:1.5px solid rgba(255,107,0,.2);
  border-radius:14px;padding:13px 16px;animation:mps-fade .25s ease;
}
.mps-fee-label{font-size:12px;font-weight:800;color:var(--text,#e8e8f0);}
.mps-fee-calc {font-size:11px;font-weight:600;color:var(--text3,#44445a);margin-top:3px;}
.mps-fee-amount{font-family:'Syne',sans-serif;font-size:22px;font-weight:900;color:#FF6B00;}

.mps-label-row{display:flex;align-items:center;gap:10px;}
.mps-field-lbl{font-size:10.5px;font-weight:800;color:var(--text3,#44445a);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;}
.mps-label-pills{display:flex;gap:7px;}
.mps-label-pill{
  display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:10px;
  border:1.5px solid var(--border,#1e1e26);background:transparent;
  color:var(--text2,#8888a0);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;
  cursor:pointer;transition:all .2s;
}
.mps-label-pill.active{background:rgba(255,107,0,.12);border-color:rgba(255,107,0,.4);color:#FF6B00;}

.mps-rider-section{display:flex;flex-direction:column;gap:8px;}
.mps-rider-header{
  display:flex;align-items:center;gap:6px;
  font-size:11px;font-weight:700;color:var(--text3,#44445a);
  background:rgba(255,107,0,.05);border:1px solid rgba(255,107,0,.1);
  border-radius:10px;padding:7px 11px;
}
.mps-field-row{
  display:flex;align-items:center;gap:9px;
  background:var(--inp,#1a1a22);border:1.5px solid var(--inpbd,#252530);
  border-radius:12px;padding:10px 12px;transition:border-color .2s;
}
.mps-field-row:focus-within{border-color:#FF6B00;}
.mps-field-input{
  flex:1;background:transparent;border:none;outline:none;
  color:var(--text,#e8e8f0);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;
}
.mps-field-input::placeholder{color:var(--text3,#44445a);}
.mps-pre-pin-hint{
  display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:11px;
  background:rgba(255,107,0,.06);border:1px solid rgba(255,107,0,.15);
  font-size:12px;font-weight:600;color:var(--text2,#8888a0);line-height:1.5;
}

.mps-confirm-btn{
  display:flex;align-items:center;justify-content:center;gap:8px;
  background:linear-gradient(135deg,#FF6B00,#FF8C00);color:white;
  border:none;border-radius:14px;padding:14px 20px;
  font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;
  cursor:pointer;box-shadow:0 6px 20px rgba(255,107,0,.4);
  transition:transform .2s,box-shadow .2s,opacity .2s;width:100%;
}
.mps-confirm-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 28px rgba(255,107,0,.5);}
.mps-confirm-btn:disabled{background:var(--card,#16161b);color:var(--text3,#44445a);box-shadow:none;cursor:not-allowed;}

.mps-spin{
  display:inline-block;width:14px;height:14px;
  border:2px solid rgba(255,107,0,.25);border-top-color:#FF6B00;
  border-radius:50%;animation:mps-rotate .7s linear infinite;flex-shrink:0;
}
.mps-spin.dark{border-color:rgba(30,30,40,.4);border-top-color:#FF6B00;}
@keyframes mps-rotate{to{transform:rotate(360deg)}}
`;

export default MapPinSelector;