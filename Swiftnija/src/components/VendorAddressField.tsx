/// <reference types="@types/google.maps" />

import { useState, useEffect, useRef, useCallback } from "react";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

interface VendorAddressFieldProps {
  value: string;
  onChange: (address: string, lat: number, lng: number) => void;
  error?: string;
}

function useGoogleMaps() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).google?.maps?.Map) {
      setLoaded(true); return;
    }
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!apiKey) return;
    const existing = document.getElementById("gmaps-vaf");
    if (existing) {
      const poll = setInterval(() => {
        if ((window as any).google?.maps?.Map) { clearInterval(poll); setLoaded(true); }
      }, 100);
      setTimeout(() => clearInterval(poll), 10000);
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-vaf";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&loading=async`;
    s.async = true; s.defer = true;
    s.onload = () => setTimeout(() => setLoaded(true), 120);
    document.head.appendChild(s);
  }, []);
  return loaded;
}

const EPE_AREAS = ["Epe Town", "Ejirin", "Eredo", "Itoikin", "Agbowa", "Mojoda", "Poka", "Abomiti"];

const DARK_STYLE = [
  { elementType: "geometry",           stylers: [{ color: "#111115" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111115" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#44445a" }] },
  { featureType: "road",     elementType: "geometry",         stylers: [{ color: "#1e1e28" }] },
  { featureType: "road.highway", elementType: "geometry",     stylers: [{ color: "#252530" }] },
  { featureType: "road",     elementType: "labels.text.fill", stylers: [{ color: "#8888a0" }] },
  { featureType: "water",    elementType: "geometry",         stylers: [{ color: "#0d0d14" }] },
  { featureType: "poi",      elementType: "geometry",         stylers: [{ color: "#16161b" }] },
];

function placeMarker(map: any, lat: number, lng: number, markerRef: React.MutableRefObject<any>) {
  if (markerRef.current) markerRef.current.setMap(null);
  markerRef.current = new google.maps.Marker({
    position: { lat, lng }, map,
    icon: {
      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
      fillColor: "#FF6B00", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
      scale: 1.8, anchor: new google.maps.Point(12, 22),
    },
    animation: google.maps.Animation.DROP,
  });
  map.panTo({ lat, lng });
  map.setZoom(16);
}

function MapModal({ initialAddress, onConfirm, onClose }: {
  initialAddress: string;
  onConfirm: (address: string, lat: number, lng: number) => void;
  onClose: () => void;
}) {
  const mapsLoaded = useGoogleMaps();
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapInst   = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<any>(null);

  const [searchQuery,      setSearchQuery]      = useState(initialAddress ?? "");
  const [nominatimResults, setNominatimResults] = useState<NominatimResult[]>([]);
  const [searching,        setSearching]        = useState(false);
  const [geocoding,        setGeocoding]        = useState(false);
  const [selected,         setSelected]         = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [pinMode,          setPinMode]          = useState(false);

  async function reverseGeocode(lat: number, lng: number) {
    let addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      if (data.display_name) addr = data.display_name;
    } catch {}
    setSelected({ address: addr, lat, lng });
    setSearchQuery(addr);
  }

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return;
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 6.5833, lng: 3.9833 },
      zoom: 13, styles: DARK_STYLE, disableDefaultUI: true, gestureHandling: "greedy",
    });
    mapInst.current = map;

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      placeMarker(map, e.latLng.lat(), e.latLng.lng(), markerRef);
      reverseGeocode(e.latLng.lat(), e.latLng.lng());
      setPinMode(false);
    });

    if (inputRef.current && (window as any).google?.maps?.places?.SearchBox) {
      const sb = new google.maps.places.SearchBox(inputRef.current);
      map.addListener("bounds_changed", () => { const b = map.getBounds(); if (b) sb.setBounds(b); });
      sb.addListener("places_changed", () => {
        const places = sb.getPlaces();
        if (!places?.length) return;
        const place = places[0];
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        placeMarker(map, lat, lng, markerRef);
        setSelected({ address: place.formatted_address || place.name || "", lat, lng });
        setNominatimResults([]); setPinMode(false);
      });
    }

    if (initialAddress && (window as any).google?.maps?.Geocoder) {
      new google.maps.Geocoder().geocode(
        { address: `${initialAddress}, Epe, Lagos, Nigeria` },
        (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            placeMarker(map, loc.lat(), loc.lng(), markerRef);
            setSelected({ address: initialAddress, lat: loc.lat(), lng: loc.lng() });
          }
        }
      );
    }
    return () => google.maps.event.clearInstanceListeners(map);
  }, [mapsLoaded]);

  const searchNominatim = useCallback(async (q: string) => {
    if (q.length < 3) { setNominatimResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + " Epe Lagos Nigeria")}&countrycodes=ng&limit=6&viewbox=3.85,6.65,4.12,6.45&bounded=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const results: NominatimResult[] = await res.json();
      setNominatimResults(results);
      if (results.length === 0) setPinMode(true);
    } catch { setNominatimResults([]); } finally { setSearching(false); }
  }, []);

  const tryGeocode = useCallback(async (address: string) => {
    if (address.length < 4) return;
    setGeocoding(true); setPinMode(false);
    try {
      if (mapsLoaded && (window as any).google?.maps?.Geocoder) {
        const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
          new google.maps.Geocoder().geocode(
            { address: `${address}, Epe, Lagos, Nigeria` },
            (results: any, status: any) => {
              if (status === "OK" && results?.[0]) {
                const loc = results[0].geometry.location;
                resolve({ lat: loc.lat(), lng: loc.lng() });
              } else resolve(null);
            }
          );
        });
        if (result) {
          setSelected({ address, lat: result.lat, lng: result.lng });
          if (mapInst.current) placeMarker(mapInst.current, result.lat, result.lng, markerRef);
          setNominatimResults([]); setGeocoding(false); return;
        }
      }
      await searchNominatim(address);
    } finally { setGeocoding(false); }
  }, [mapsLoaded, searchNominatim]);

  const handleInput = (val: string) => {
    setSearchQuery(val); setPinMode(false); setNominatimResults([]);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length >= 4) timerRef.current = setTimeout(() => tryGeocode(val), 700);
  };

  const selectNominatim = (r: NominatimResult) => {
    const lat = parseFloat(r.lat); const lng = parseFloat(r.lon);
    setSelected({ address: r.display_name, lat, lng });
    setSearchQuery(r.display_name); setNominatimResults([]); setPinMode(false);
    if (mapInst.current) placeMarker(mapInst.current, lat, lng, markerRef);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480, height: "min(92vh, 680px)", background: "#0f0f17", borderRadius: 22, border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.7)", animation: "vafPop 0.28s cubic-bezier(0.34,1.56,0.64,1)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,107,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📍</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "white" }}>Pick Your Store Location</div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>Epe · Lagos · Nigeria</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "6px 10px", cursor: "pointer", color: "#555", fontSize: 14, fontFamily: "inherit" }}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 14px 6px", position: "relative", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 13, padding: "10px 14px" }}>
            <span style={{ color: "#FF6B00", flexShrink: 0 }}>🔍</span>
            <input ref={inputRef} value={searchQuery} onChange={e => handleInput(e.target.value)} placeholder="Search street or area in Epe…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600, fontFamily: "'Nunito', sans-serif", caretColor: "#FF6B00" }} autoComplete="off" />
            {(searching || geocoding) && <div style={{ width: 14, height: 14, border: "2px solid rgba(255,107,0,0.3)", borderTopColor: "#FF6B00", borderRadius: "50%", animation: "vafSpin .7s linear infinite", flexShrink: 0 }} />}
            {searchQuery && !searching && !geocoding && <button onClick={() => { setSearchQuery(""); setNominatimResults([]); setPinMode(false); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 15 }}>✕</button>}
          </div>
          {nominatimResults.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% - 4px)", left: 14, right: 14, background: "#16161f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, zIndex: 50, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>
              {nominatimResults.map(r => (
                <button key={r.place_id} onClick={() => selectNominatim(r)} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "'Nunito', sans-serif" }}>
                  <span style={{ color: "#FF6B00", flexShrink: 0 }}>📍</span>
                  <span style={{ flex: 1, lineHeight: 1.4 }}>{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Area chips */}
        <div style={{ padding: "0 14px 8px", display: "flex", gap: 7, overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" }}>
          {EPE_AREAS.map(area => (
            <button key={area} onClick={() => { setSearchQuery(area); setNominatimResults([]); tryGeocode(area); }} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.08)", background: "transparent", color: "#666", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", whiteSpace: "nowrap" }}>
              {area}
            </button>
          ))}
        </div>

        {/* Pin mode banner */}
        {pinMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 16px", background: "rgba(255,107,0,0.08)", borderTop: "1px solid rgba(255,107,0,0.12)", borderBottom: "1px solid rgba(255,107,0,0.12)", fontSize: 12, fontWeight: 700, color: "#FF6B00", flexShrink: 0 }}>
            ⚠ Address not found — tap the map to drop a pin on your exact location.
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          {!mapsLoaded && (
            <div style={{ position: "absolute", inset: 0, background: "#0a0a0f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#444", fontSize: 13, fontWeight: 600 }}>
              <span style={{ fontSize: 28 }}>📍</span><span>Loading map…</span>
            </div>
          )}
          {pinMode && !selected && (
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.75)", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20, pointerEvents: "none", whiteSpace: "nowrap" }}>
              📍 Tap map to place pin
            </div>
          )}
        </div>

        {/* Selected preview */}
        {selected && (
          <div style={{ padding: "10px 16px", background: "#0f0f17", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", background: "rgba(255,107,0,0.06)", borderRadius: 11, border: "1px solid rgba(255,107,0,0.15)" }}>
              <span style={{ color: "#FF6B00", flexShrink: 0 }}>📍</span>
              <span style={{ flex: 1, fontSize: 12, color: "#888", lineHeight: 1.4, fontWeight: 600 }}>{selected.address}</span>
            </div>
          </div>
        )}

        {/* Confirm */}
        <div style={{ padding: "10px 16px 16px", background: "#0f0f17", flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button disabled={!selected} onClick={() => selected && onConfirm(selected.address, selected.lat, selected.lng)}
            style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: selected ? "linear-gradient(135deg,#FF6B00,#FF8C00)" : "rgba(255,255,255,0.05)", color: selected ? "white" : "#333", fontSize: 14, fontWeight: 800, cursor: selected ? "pointer" : "not-allowed", fontFamily: "'Nunito', sans-serif", boxShadow: selected ? "0 6px 20px rgba(255,107,0,0.35)" : "none", transition: "all .2s" }}>
            {selected ? "Use This Location" : "Search or tap the map to pick a location"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes vafPop { from{opacity:0;transform:scale(0.93) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes vafSpin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

export default function VendorAddressField({ value, onChange, error }: VendorAddressFieldProps) {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", color: "#555", fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" as const, marginBottom: 8 }}>
          Shop Address
        </label>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: value ? "#FF6B00" : "#444", display: "flex", pointerEvents: "none" as const, zIndex: 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </span>
          <button type="button" onClick={() => setMapOpen(true)} style={{ display: "block", width: "100%", background: "rgba(255,255,255,0.03)", border: `1.5px solid ${error ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "13px 44px 13px 44px", color: value ? "rgba(255,255,255,0.9)" : "#444", fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", cursor: "pointer", textAlign: "left" as const, boxSizing: "border-box" as const, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.08)" : "none" }}>
            {value || "Tap to pick your store location on map"}
          </button>
          {value && (
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#10B981", fontSize: 12, fontWeight: 800, pointerEvents: "none" as const }}>✓</span>
          )}
        </div>
        {error && <div style={{ color: "#EF4444", fontSize: 11, fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>⚠ {error}</div>}
        {!error && value && <div style={{ color: "#10B981", fontSize: 11, marginTop: 5, fontWeight: 600 }}>✓ Location confirmed on map</div>}
      </div>

      {mapOpen && (
        <MapModal
          initialAddress={value}
          onConfirm={(address, lat, lng) => { onChange(address, lat, lng); setMapOpen(false); }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </>
  );
}