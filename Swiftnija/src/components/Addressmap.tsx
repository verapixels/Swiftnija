/// <reference types="@types/google.maps" />

import React, { useState, useEffect, useRef, useCallback } from "react";
import { FiSearch, FiMapPin, FiHome, FiBriefcase, FiX, FiNavigation, FiAlertCircle } from "react-icons/fi";
import { useTheme } from "../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type SavedAddress = {
  id: string;
  label: "Home" | "Work" | "Other";
  address: string;
  lat?: number;
  lng?: number;
  landmark?: string;
  isDefault?: boolean;
};

export type SelectedLocation = {
  address: string;
  lat: number;
  lng: number;
  landmark?: string;
  label?: "Home" | "Work" | "Other" | "New";
  source?: "typed" | "pin" | "saved";
};

interface AddressMapProps {
  savedAddresses?: SavedAddress[];
  onConfirm: (location: SelectedLocation) => void;
  onClose?: () => void;
  defaultAddressId?: string;
}

// ─── Google Maps Loader ───────────────────────────────────────────────────────
function useGoogleMaps() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.google?.maps?.Map === "function") {
      setLoaded(true);
      return;
    }
    const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) return;

    const existing = document.getElementById("gmaps-script-addr");
    if (existing) {
      const poll = setInterval(() => {
        if (typeof window.google?.maps?.Map === "function") { clearInterval(poll); setLoaded(true); }
      }, 100);
      setTimeout(() => clearInterval(poll), 10000);
      return;
    }

    // Use callback pattern (not loading=async) for compatibility
    (window as any).__gmaps_addr_cb = () => setLoaded(true);
    const script = document.createElement("script");
    script.id = "gmaps-script-addr";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=__gmaps_addr_cb`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  return loaded;
}

function makeMarkerIcon(): google.maps.Symbol {
  return {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
    fillColor: "#FF6B00",
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: 1.8,
    anchor: new google.maps.Point(12, 22),
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddressMap({
  savedAddresses = [],
  onConfirm,
  onClose,
  defaultAddressId,
}: AddressMapProps): React.ReactElement {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const mapsLoaded = useGoogleMaps();

  const mapRef      = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef   = useRef<google.maps.Marker | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  // Session token for Places Autocomplete billing grouping
  const acToken = useRef<any>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);

  const getToken = () => {
    if (!acToken.current && window.google?.maps?.places?.AutocompleteSessionToken) {
      acToken.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return acToken.current;
  };
  const rotateToken = () => {
    acToken.current = window.google?.maps?.places?.AutocompleteSessionToken
      ? new window.google.maps.places.AutocompleteSessionToken()
      : null;
  };

  const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string;

  const [searchQuery,     setSearchQuery]     = useState("");
  const [suggestions,     setSuggestions]     = useState<{ placeId: string; text: string }[]>([]);
  const [searching,       setSearching]       = useState(false);
  const [landmark,        setLandmark]        = useState("");
  const [selected,        setSelected]        = useState<SelectedLocation | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [pinMode,         setPinMode]         = useState(false);
  const [pinModeMsg,      setPinModeMsg]      = useState("");

  // ── Init from default address ─────────────────────────────────────────────
  useEffect(() => {
    const defaultAddr = savedAddresses.find((a) => a.id === defaultAddressId || a.isDefault);
    if (defaultAddr?.lat && defaultAddr?.lng) {
      setSelected({
        address: defaultAddr.address,
        lat: defaultAddr.lat,
        lng: defaultAddr.lng,
        landmark: defaultAddr.landmark,
        label: defaultAddr.label,
        source: "saved",
      });
      setSelectedSavedId(defaultAddr.id);
      setSearchQuery(defaultAddr.address);
      setLandmark(defaultAddr.landmark ?? "");
    }
  }, []);

  // ── Map styles ─────────────────────────────────────────────────────────────
  const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#111115" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#111115" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#44445a" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e1e28" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#252530" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8888a0" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d14" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#16161b" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a2a1a" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#8888a0" }] },
  ];

  const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#f0f0f5" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f0f0f5" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#55556a" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#e0e0ea" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#d5d5e5" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8d8e8" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d4ecd4" }] },
  ];

  // ── Place marker helper ───────────────────────────────────────────────────
  function placeMarker(map: google.maps.Map, lat: number, lng: number) {
    if (markerRef.current) markerRef.current.setMap(null);
    markerRef.current = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: makeMarkerIcon(),
      animation: google.maps.Animation.DROP,
    });
    map.panTo({ lat, lng });
  }

  // ── Reverse geocode a pin drop ────────────────────────────────────────────
  async function reverseGeocode(lat: number, lng: number) {
    let addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      if (mapsLoaded && typeof window.google?.maps?.Geocoder === "function") {
        const result = await new Promise<string | null>((resolve) => {
          new window.google.maps.Geocoder().geocode(
            { location: { lat, lng } },
            (results: any, status: string) => {
              resolve(status === "OK" && results?.[0] ? results[0].formatted_address : null);
            }
          );
        });
        if (result) addr = result;
      }
    } catch { /* keep coords */ }
    setSelected({ address: addr, lat, lng, label: "New", source: "pin" });
    setSearchQuery(addr);
    setSelectedSavedId(null);
  }

  // ── Init Google Map ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    if (typeof window.google?.maps?.Map !== "function") return;
    if (mapInstance.current) return; // already initialized

    const center = selected
      ? { lat: selected.lat, lng: selected.lng }
      : { lat: 6.5833, lng: 3.9833 }; // Epe, Lagos

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: selected ? 16 : 13,
      styles: isDark ? DARK_STYLE : LIGHT_STYLE,
      disableDefaultUI: true,
      gestureHandling: "greedy",
    });
    mapInstance.current = map;

    // Initialize AutocompleteService (same engine as Google Maps search bar)
    if (!autocompleteService.current && window.google?.maps?.places?.AutocompleteService) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
    }

    if (selected) placeMarker(map, selected.lat, selected.lng);

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      placeMarker(map, lat, lng);
      reverseGeocode(lat, lng);
      setPinMode(false);
    });

    return () => { google.maps.event.clearInstanceListeners(map); };
  }, [mapsLoaded]);

  // ── Theme change ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.setOptions({ styles: isDark ? DARK_STYLE : LIGHT_STYLE });
  }, [isDark]);

  // ── Search via Geocoding API — finds everything on Google Maps ───────────
  // Uses maps.googleapis.com/maps/api/geocode (always enabled, no extra setup)
  // Finds: hotels, restaurants, clubs, streets, estates, landmarks — all of Lagos
  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 3) return;
    setSearching(true);
    setSuggestions([]);
    setPinMode(false);

    // Init service if user typed before map loaded
    if (!autocompleteService.current && window.google?.maps?.places?.AutocompleteService) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
    }

    if (autocompleteService.current) {
      try {
        const token = getToken();
        const baseOpts = {
          bounds: new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(6.2, 2.7),
            new window.google.maps.LatLng(6.8, 4.4)
          ),
          componentRestrictions: { country: "NG" },
          sessionToken: token,
          location: new window.google.maps.LatLng(6.5833, 3.9833),
          radius: 60000,
        };

        // TWO parallel requests: establishments (hotels/resorts/restaurants) + addresses
        // Cannot mix types in one call — merge results with establishments first
        const [estPreds, addrPreds] = await Promise.all([
          new Promise<any[]>((res) =>
            autocompleteService.current!.getPlacePredictions(
              { ...baseOpts, input, types: ["establishment"] },
              (r: any, s: string) => res(s === window.google.maps.places.PlacesServiceStatus.OK && r ? r : [])
            )
          ),
          new Promise<any[]>((res) =>
            autocompleteService.current!.getPlacePredictions(
              { ...baseOpts, input, types: ["address"] },
              (r: any, s: string) => res(s === window.google.maps.places.PlacesServiceStatus.OK && r ? r : [])
            )
          ),
        ]);

        // Establishments first so hotels/resorts rank above roads
        const seen = new Set<string>();
        const merged = [...estPreds, ...addrPreds].filter(p => {
          if (seen.has(p.place_id)) return false;
          seen.add(p.place_id);
          return true;
        }).slice(0, 8);

        if (merged.length > 0) {
          setSuggestions(merged.map(p => ({ placeId: p.place_id, text: p.description })));
        } else {
          setSuggestions([]);
          setPinModeMsg("Address not found. Drop a pin on your exact location.");
          setPinMode(true);
        }
      } catch (e) {
        console.warn("[AddressMap] autocomplete error:", e);
        setPinMode(true);
        setPinModeMsg("Search error. Drop a pin instead.");
      }
    } else {
      // Geocoding API fallback when Places library not loaded yet
      try {
        const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input + ", Lagos, Nigeria")}&key=${apiKey}&region=ng&bounds=6.2,2.7|6.8,4.4`);
        const data = await res.json();
        const results = (data.results ?? []).slice(0, 8).map((r: any) => ({ placeId: r.place_id, text: r.formatted_address }));
        if (results.length > 0) { setSuggestions(results); }
        else { setPinModeMsg("Address not found. Drop a pin."); setPinMode(true); }
      } catch { setPinMode(true); }
    }
    setSearching(false);
  }, [apiKey]);



  // ── Select suggestion → resolve coordinates ───────────────────────────────
  const selectSuggestion = async (placeId: string, text: string) => {
    if (!placeId) return;
    setSuggestions([]);
    setSearchQuery(text);

    // ── Geocoding API by place_id — always enabled, finds everything ──────────
    resolveByPlaceId(placeId, text);
  };

  const resolveByPlaceId = async (placeId: string, fallbackText: string) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${apiKey}`
      );
      const data = await res.json();
      const r = data.results?.[0];
      if (r) {
        const lat = r.geometry.location.lat;
        const lng = r.geometry.location.lng;
        const addr = r.formatted_address || fallbackText;
        setSearchQuery(addr);
        setSelected({ address: addr, lat, lng, label: "New", source: "typed" });
        setSelectedSavedId(null);
        setPinMode(false);
        if (mapInstance.current) {
          placeMarker(mapInstance.current, lat, lng);
          mapInstance.current.setZoom(16);
        }
        rotateToken(); // rotate session token after completed session
      }
    } catch {
      setSelected({ address: fallbackText, lat: 0, lng: 0, label: "New", source: "typed" });
    }
  };

  // ── Search input handler ──────────────────────────────────────────────────
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    setPinMode(false);
    setSuggestions([]);
    if (val.length >= 3) {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => fetchSuggestions(val), 500);
    }
  };

  // ── Select a saved address ────────────────────────────────────────────────
  const selectSavedAddress = (addr: SavedAddress) => {
    setSelectedSavedId(addr.id);
    setSearchQuery(addr.address);
    setSuggestions([]);
    setPinMode(false);
    setLandmark(addr.landmark ?? "");
    if (addr.lat && addr.lng) {
      setSelected({
        address: addr.address,
        lat: addr.lat,
        lng: addr.lng,
        label: addr.label,
        landmark: addr.landmark,
        source: "saved",
      });
      if (mapInstance.current) {
        placeMarker(mapInstance.current, addr.lat, addr.lng);
        mapInstance.current.setZoom(16);
      }
    }
  };

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!selected) return;
    onConfirm({ ...selected, landmark: landmark.trim() || undefined });
  };

  const canConfirm = !!selected?.lat && !!selected?.lng;

  return (
    <div className={`am-root ${isDark ? "dark" : "light"}`}>

      {/* Header */}
      <div className="am-header">
        {onClose && (
          <button className="am-back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" />
            </svg>
          </button>
        )}
        <span className="am-title">Delivery Location</span>
      </div>

      {/* Search */}
      <div className="am-search-wrap">
        <div className="am-search-row">
          <FiSearch size={16} className="am-search-icon" />
          <input
            ref={inputRef}
            className="am-search-input"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search estate, street, area in Lagos..."
            autoComplete="off"
          />
          {searching && <span className="am-spin" />}
          {searchQuery && !searching && (
            <button
              className="am-clear-btn"
              onClick={() => { setSearchQuery(""); setSuggestions([]); setPinMode(false); }}
            >
              <FiX size={14} />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="am-dropdown">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="am-dropdown-item"
                onClick={() => selectSuggestion(s.placeId, s.text)}
              >
                <FiMapPin size={13} className="am-dropdown-icon" />
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pin mode banner */}
      {pinMode && (
        <div className="am-pin-banner">
          <FiAlertCircle size={15} color="#FF6B00" style={{ flexShrink: 0 }} />
          <span>{pinModeMsg || "Tap the map to drop a pin on your exact location."}</span>
        </div>
      )}

      {/* Map */}
      <div className="am-map-container">
        <div ref={mapRef} className="am-map" />

        {pinMode && (
          <div className="am-pin-hint">
            <div className="am-pin-hint-inner">📍 Tap map to place pin</div>
          </div>
        )}

        {!mapsLoaded && (
          <div className="am-no-maps-notice">
            <FiMapPin size={20} color="#FF6B00" />
            <span>Loading map…</span>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="am-panel">

        {savedAddresses.map((addr) => (
          <button
            key={addr.id}
            className={`am-addr-row ${selectedSavedId === addr.id ? "active" : ""}`}
            onClick={() => selectSavedAddress(addr)}
          >
            <FiMapPin size={16} className="am-addr-pin" />
            <span className="am-addr-label">
              {addr.label === "Home" ? <FiHome size={13} /> : addr.label === "Work" ? <FiBriefcase size={13} /> : <FiNavigation size={13} />}
              {addr.label}
            </span>
            <span className="am-addr-text">{addr.address}</span>
            <div className={`am-radio ${selectedSavedId === addr.id ? "checked" : ""}`}>
              {selectedSavedId === addr.id && <div className="am-radio-dot" />}
            </div>
          </button>
        ))}

        {selected && (
          <div className="am-selected-preview">
            <FiMapPin size={12} color="#FF6B00" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div>{selected.address}</div>
              {selected.source === "pin" && (
                <div style={{ fontSize: 10, color: "#FF6B00", fontWeight: 700, marginTop: 2 }}>
                  📍 Location set by pin · {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="am-landmark-wrap">
          <label className="am-landmark-label">
            Nearest Landmark <span className="am-landmark-opt">(helps rider find you)</span>
          </label>
          <input
            className="am-landmark-input"
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            placeholder="e.g. Opposite Epe General Hospital, beside First Bank"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="am-footer">
        <button className="am-confirm-btn" disabled={!canConfirm} onClick={handleConfirm}>
          {pinMode && !selected ? "Drop a Pin First" : "Confirm Location"}
        </button>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');

  .am-root { display:flex;flex-direction:column;width:100%;height:100%;font-family:'Nunito',sans-serif;position:relative;overflow:hidden; }
  .am-root.dark  { --bg:#0a0a0d;--surface:#111115;--card:#16161b;--border:#1e1e26;--text:#e8e8f0;--text2:#8888a0;--text3:#44445a;--inp:#1a1a22;--inpbd:#252530;--accent:#FF6B00;--panel-bg:rgba(17,17,21,0.97); }
  .am-root.light { --bg:#f0f0f5;--surface:#ffffff;--card:#ffffff;--border:#e0e0ea;--text:#111118;--text2:#55556a;--text3:#aaaabc;--inp:#f4f4fb;--inpbd:#d5d5e5;--accent:#FF6B00;--panel-bg:rgba(255,255,255,0.98); }

  .am-header { display:flex;align-items:center;gap:14px;padding:14px 18px 10px;background:var(--surface);border-bottom:1px solid var(--border);z-index:20;flex-shrink:0; }
  .am-back-btn { width:36px;height:36px;border-radius:10px;border:none;background:transparent;color:#FF6B00;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0; }
  .am-title { font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--text);letter-spacing:-0.3px; }

  .am-search-wrap { padding:10px 14px 6px;background:var(--surface);z-index:20;flex-shrink:0;position:relative; }
  .am-search-row { display:flex;align-items:center;gap:10px;background:var(--inp);border:1.5px solid var(--inpbd);border-radius:14px;padding:11px 14px;transition:border-color .2s,box-shadow .2s; }
  .am-search-row:focus-within { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,0.1); }
  .am-search-icon { color:#FF6B00;flex-shrink:0; }
  .am-search-input { flex:1;background:transparent;border:none;outline:none;font-family:'Nunito',sans-serif;font-size:14px;font-weight:600;color:var(--text);min-width:0; }
  .am-search-input::placeholder { color:var(--text3); }
  .am-clear-btn { background:transparent;border:none;color:var(--text3);cursor:pointer;display:flex;align-items:center;padding:2px;transition:color .2s; }
  .am-clear-btn:hover { color:var(--text); }
  .am-spin { width:14px;height:14px;border:2px solid rgba(255,107,0,0.3);border-top-color:#FF6B00;border-radius:50%;animation:am-spin .7s linear infinite;flex-shrink:0; }
  @keyframes am-spin { to { transform:rotate(360deg); } }

  .am-dropdown { position:absolute;top:calc(100% - 4px);left:14px;right:14px;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;overflow:hidden;z-index:100;box-shadow:0 12px 40px rgba(0,0,0,0.25);animation:am-dd-in .18s cubic-bezier(.34,1.56,.64,1); }
  @keyframes am-dd-in { from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)} }
  .am-dropdown-item { width:100%;display:flex;align-items:flex-start;gap:8px;padding:11px 14px;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text2);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;cursor:pointer;text-align:left;transition:background .15s,color .15s; }
  .am-dropdown-item:last-child { border-bottom:none; }
  .am-dropdown-item:hover { background:rgba(255,107,0,0.06);color:var(--text); }
  .am-dropdown-icon { color:#FF6B00;flex-shrink:0;margin-top:2px; }
  .am-dropdown-item span { flex:1;line-height:1.4; }

  .am-pin-banner { display:flex;align-items:flex-start;gap:9px;padding:10px 16px;background:rgba(255,107,0,0.1);border-bottom:1px solid rgba(255,107,0,0.2);font-size:12px;font-weight:700;color:#FF6B00;flex-shrink:0;line-height:1.5; }

  .am-map-container { flex:1;position:relative;min-height:0;background:var(--bg); }
  .am-map { width:100%;height:100%;background:var(--bg); }

  .am-pin-hint { position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none; }
  .am-pin-hint-inner { background:rgba(0,0,0,0.7);color:white;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;padding:7px 16px;border-radius:20px;white-space:nowrap;backdrop-filter:blur(8px); }

  .am-no-maps-notice { position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--bg);color:var(--text3);font-size:13px;font-weight:600;text-align:center;padding:20px; }

  .am-panel { background:var(--panel-bg);border-top:1.5px solid var(--border);padding:8px 14px 4px;display:flex;flex-direction:column;gap:2px;flex-shrink:0;backdrop-filter:blur(12px);max-height:260px;overflow-y:auto; }

  .am-addr-row { width:100%;display:flex;align-items:center;gap:12px;padding:12px 4px;border:none;border-bottom:1px solid var(--border);background:transparent;cursor:pointer;text-align:left;transition:background .15s; }
  .am-addr-row:last-of-type { border-bottom:none; }
  .am-addr-row:hover { background:rgba(255,107,0,0.04); }
  .am-addr-row.active { background:rgba(255,107,0,0.06); }
  .am-addr-pin { color:#FF6B00;flex-shrink:0; }
  .am-addr-label { display:flex;align-items:center;gap:5px;font-size:13px;font-weight:800;color:var(--text);min-width:52px;flex-shrink:0; }
  .am-addr-text { flex:1;font-size:12px;font-weight:600;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .am-radio { width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .2s; }
  .am-radio.checked { border-color:#FF6B00; }
  .am-radio-dot { width:11px;height:11px;border-radius:50%;background:#FF6B00; }

  .am-selected-preview { display:flex;align-items:flex-start;gap:8px;padding:10px 4px 6px;color:var(--text3);font-size:11.5px;font-weight:600;line-height:1.4;border-top:1px dashed var(--border); }

  .am-landmark-wrap { padding:10px 0 6px;display:flex;flex-direction:column;gap:5px; }
  .am-landmark-label { font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px; }
  .am-landmark-opt { font-size:9px;font-weight:600;color:var(--text3);text-transform:none;letter-spacing:0; }
  .am-landmark-input { background:var(--inp);border:1.5px solid var(--inpbd);border-radius:12px;padding:10px 13px;color:var(--text);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;outline:none;transition:border-color .2s;width:100%;box-sizing:border-box; }
  .am-landmark-input:focus { border-color:#FF6B00; }
  .am-landmark-input::placeholder { color:var(--text3); }

  .am-footer { padding:10px 14px 18px;background:var(--panel-bg);flex-shrink:0;border-top:1px solid var(--border); }
  .am-confirm-btn { width:100%;padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#FF6B00,#FF8C00);color:white;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(255,107,0,0.4);transition:transform .2s,box-shadow .2s,opacity .2s;letter-spacing:.2px; }
  .am-confirm-btn:hover:not(:disabled) { transform:translateY(-2px);box-shadow:0 10px 28px rgba(255,107,0,0.5); }
  .am-confirm-btn:disabled { opacity:.45;cursor:not-allowed; }
`;