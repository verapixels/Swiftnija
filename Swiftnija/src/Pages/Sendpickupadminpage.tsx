// Pages/SendPickupAdminPage.tsx
// Admin management page for Send & Pickup — orders, live pricing editor
// Plugs into AdminDashboard.tsx color system via C prop

import { useState, useEffect } from "react";
import {
  collection, query, onSnapshot, orderBy, doc, updateDoc,
  serverTimestamp, getDoc, setDoc, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  RiMotorbikeLine, RiCarLine, RiBusLine, RiSearchLine,
  RiCheckLine, RiEditLine, RiCloseLine, RiSaveLine,
  RiBox3Line, RiRefreshLine, RiTimeLine, RiMapPinLine,
  RiAlertFill, RiInformationLine,
} from "react-icons/ri";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeliveryDoc {
  id: string; orderNumber?: string; type?: "send" | "pickup";
  status?: string; vehicleType?: string; serviceMode?: string;
  customerName?: string; customerPhone?: string;
  recipientName?: string; recipientPhone?: string;
  pickupAddress?: string; dropoffAddress?: string;
  distanceKm?: number; deliveryFee?: number;
  platformFee?: number; commissionPct?: number;
  total?: number; riderEarnings?: number; swiftEarnings?: number;
  paymentMethod?: string; paymentStatus?: string;
  riderName?: string; riderPhone?: string;
  packageDescription?: string; createdAt?: any;
  [key: string]: unknown;
}

interface VehicleTier {
  baseFee: number; perKm: number; platformFee: number; commissionPct: number;
}
interface VehicleConfig {
  officeDrop: VehicleTier;
  doorstep: VehicleTier;
}
interface PricingMatrix {
  bike: VehicleConfig;
  car: VehicleConfig;
  van: VehicleConfig;
}

type VehicleKey = "bike" | "car" | "van";
type ModeKey = "officeDrop" | "doorstep";

const DEFAULTS: PricingMatrix = {
  bike: {
    officeDrop: { baseFee: 500,  perKm: 150, platformFee: 200, commissionPct: 10 },
    doorstep:   { baseFee: 1200, perKm: 150, platformFee: 200, commissionPct: 10 },
  },
  car: {
    officeDrop: { baseFee: 1500, perKm: 350, platformFee: 500, commissionPct: 12 },
    doorstep:   { baseFee: 3500, perKm: 350, platformFee: 500, commissionPct: 12 },
  },
  van: {
    officeDrop: { baseFee: 3500,  perKm: 600, platformFee: 1000, commissionPct: 15 },
    doorstep:   { baseFee: 8000,  perKm: 600, platformFee: 1000, commissionPct: 15 },
  },
};

const VEHICLE_META: Record<VehicleKey, { label: string; icon: React.ReactNode; weight: string; badge: string }> = {
  bike: { label: "Bike / Small Box", icon: <RiMotorbikeLine size={16} />, weight: "Up to 5 kg", badge: "BIKE" },
  car:  { label: "Car / Big Box",    icon: <RiCarLine size={16} />,       weight: "5–50 kg",   badge: "CAR"  },
  van:  { label: "Van / Multiple",   icon: <RiBusLine size={16} />,        weight: "50 kg +",   badge: "VAN"  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:       { bg: "rgba(245,158,11,0.1)",  text: "#F59E0B", label: "Pending"       },
  finding_rider: { bg: "rgba(245,158,11,0.1)",  text: "#F59E0B", label: "Finding Rider" },
  rider_assigned:{ bg: "rgba(59,130,246,0.1)",  text: "#3B82F6", label: "Assigned"      },
  picked_up:     { bg: "rgba(6,182,212,0.1)",   text: "#06B6D4", label: "Picked Up"     },
  arriving:      { bg: "rgba(139,92,246,0.1)",  text: "#8B5CF6", label: "Arriving"      },
  delivered:     { bg: "rgba(16,185,129,0.1)",  text: "#10B981", label: "Delivered"     },
  cancelled:     { bg: "rgba(239,68,68,0.1)",   text: "#EF4444", label: "Cancelled"     },
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcTotal(tier: VehicleTier, km: number) {
  const delivery = tier.baseFee + km * tier.perKm;
  return Math.round(delivery + tier.platformFee);
}

const fmt = (n: number) => `₦${n.toLocaleString()}`;
const ago = (ts: any) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: "rgba(74,74,106,0.2)", text: "#4a4a6a", label: status };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 40, fontSize: 10, fontWeight: 800, background: s.bg, color: s.text, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{s.label}</span>
  );
}

// ─── PricingEditor ────────────────────────────────────────────────────────────
function PricingEditor({ C, showToast }: { C: Record<string, string>; showToast: (m: string, t: "success" | "error" | "info") => void }) {
  const [pricing, setPricing] = useState<PricingMatrix>(DEFAULTS);
  const [edited, setEdited] = useState<PricingMatrix>(JSON.parse(JSON.stringify(DEFAULTS)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<VehicleKey>("bike");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "platformSettings", "global")).then(snap => {
      if (snap.exists() && snap.data().sendPickupPricing) {
        const sp = snap.data().sendPickupPricing as PricingMatrix;
        const merged: PricingMatrix = JSON.parse(JSON.stringify(DEFAULTS));
        (["bike","car","van"] as VehicleKey[]).forEach(vk => {
          if (sp[vk]) merged[vk] = { ...merged[vk], ...sp[vk] };
        });
        setPricing(merged);
        setEdited(JSON.parse(JSON.stringify(merged)));
      }
      setLoading(false);
    });
  }, []);

  const update = (vk: VehicleKey, mk: ModeKey, field: keyof VehicleTier, val: string) => {
    const n = parseFloat(val) || 0;
    setEdited(prev => ({ ...prev, [vk]: { ...prev[vk], [mk]: { ...prev[vk][mk], [field]: n } } }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "platformSettings", "global"), { sendPickupPricing: edited, updatedAt: serverTimestamp() }, { merge: true });
      setPricing(JSON.parse(JSON.stringify(edited)));
      setHasChanges(false);
      showToast("Pricing saved and live", "success");
    } catch { showToast("Failed to save pricing", "error"); }
    setSaving(false);
  };

  const reset = () => { setEdited(JSON.parse(JSON.stringify(pricing))); setHasChanges(false); };

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: C.surface2 || "rgba(255,255,255,0.04)",
    border: `1px solid ${C.border || "rgba(255,255,255,0.07)"}`,
    borderRadius: 10, color: C.text || "#e2e2f0",
    fontSize: 13, fontFamily: "'Nunito', sans-serif", outline: "none",
  };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: C.muted || "#4a4a6a", textTransform: "uppercase" as const, letterSpacing: 0.8, display: "block", marginBottom: 6 };
  const orange = C.orange || "#FF6B00";

  // Live preview for selected vehicle
  const tier = (mk: ModeKey) => edited[activeVehicle][mk];
  const previewKm = 10;
  const previewOffice  = calcTotal(tier("officeDrop"), previewKm);
  const previewDoor    = calcTotal(tier("doorstep"),   previewKm);
  const savings        = previewDoor - previewOffice;

  return (
    <div style={{ background: C.surface || "rgba(255,255,255,0.025)", border: `1px solid ${C.border}`, borderRadius: 20, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 4 }}>Pricing Matrix Editor</h2>
          <p style={{ fontSize: 12, color: C.muted }}>Set base fees, per-km rates, platform fees and commission for each vehicle × service mode</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {hasChanges && (
            <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <RiCloseLine size={13} /> Reset
            </button>
          )}
          <button disabled={saving || !hasChanges} onClick={save} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 10, background: hasChanges ? `linear-gradient(135deg, ${orange}, #FF8C00)` : "transparent", border: `1px solid ${hasChanges ? orange : C.border}`, color: hasChanges ? "white" : C.muted, fontSize: 12, fontWeight: 800, cursor: hasChanges ? "pointer" : "not-allowed", opacity: saving ? 0.7 : 1 }}>
            <RiSaveLine size={13} /> {saving ? "Saving…" : "Save Pricing"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading pricing…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: 400 }}>
          {/* Vehicle nav */}
          <div style={{ borderRight: `1px solid ${C.border}`, padding: "12px 8px" }}>
            {(["bike","car","van"] as VehicleKey[]).map(vk => {
              const meta = VEHICLE_META[vk];
              return (
                <button key={vk} onClick={() => setActiveVehicle(vk)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderRadius: 12, border: "none", background: activeVehicle === vk ? `${orange}18` : "transparent", color: activeVehicle === vk ? orange : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 4, borderLeft: `3px solid ${activeVehicle === vk ? orange : "transparent"}` }}>
                  {meta.icon}
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{meta.badge}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{meta.weight}</div>
                  </div>
                </button>
              );
            })}

            {/* Live preview card */}
            <div style={{ margin: "16px 4px 0", padding: "14px 12px", background: `${orange}10`, border: `1px solid ${orange}28`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: orange, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Preview (10 km)</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Economy Hub</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 10 }}>{fmt(previewOffice)}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Doorstep</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 8 }}>{fmt(previewDoor)}</div>
              <div style={{ height: 1, background: `${orange}20`, marginBottom: 8 }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>Customer saves ₦{savings.toLocaleString()} with Economy Hub</div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ padding: "20px 24px" }}>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4 }}>{VEHICLE_META[activeVehicle].label}</div>
              <div style={{ fontSize: 12, color: C.muted }}>Edit pricing for Economy Hub (customer drops off) and Doorstep (rider collects).</div>
            </div>

            {(["officeDrop", "doorstep"] as ModeKey[]).map(mk => {
              const modeLabel = mk === "officeDrop" ? "Economy Hub (Office Drop-off)" : "Doorstep Pickup (We Come to You)";
              const modeColor = mk === "officeDrop" ? "#10B981" : orange;
              const t = edited[activeVehicle][mk];
              return (
                <div key={mk} style={{ marginTop: 20, background: C.surface2 || "rgba(255,255,255,0.04)", border: `1.5px solid ${mk === "officeDrop" ? "rgba(16,185,129,0.2)" : `${orange}28`}`, borderRadius: 16, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: modeColor }} />
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 900, color: modeColor }}>{modeLabel}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    {([
                      { field: "baseFee"      as keyof VehicleTier, label: "Base Fee (₦)",       placeholder: "e.g. 1200" },
                      { field: "perKm"        as keyof VehicleTier, label: "Per KM Rate (₦)",    placeholder: "e.g. 150"  },
                      { field: "platformFee"  as keyof VehicleTier, label: "Platform Fee (₦)",   placeholder: "e.g. 200"  },
                      { field: "commissionPct"as keyof VehicleTier, label: "Commission (%)",      placeholder: "e.g. 10"   },
                    ]).map(({ field, label, placeholder }) => (
                      <div key={field}>
                        <label style={lbl}>{label}</label>
                        <input
                          type="number" min="0" step={field === "commissionPct" ? "0.5" : "50"}
                          value={t[field]}
                          onChange={e => update(activeVehicle, mk, field, e.target.value)}
                          placeholder={placeholder}
                          style={inp}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, padding: "10px 14px", background: C.surface, borderRadius: 10, display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {[5,10,20,50].map(km => {
                      const del = t.baseFee + km * t.perKm;
                      const total = Math.round(del + t.platformFee);
                      const comm = Math.round(del * t.commissionPct / 100);
                      return (
                        <div key={km} style={{ fontSize: 11 }}>
                          <div style={{ color: C.muted, fontWeight: 700, marginBottom: 3 }}>{km} km</div>
                          <div style={{ color: C.text, fontWeight: 900, fontFamily: "'Syne', sans-serif" }}>{fmt(total)}</div>
                          <div style={{ color: modeColor, fontWeight: 600, fontSize: 10 }}>Swift: {fmt(t.platformFee + comm)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OrdersTable ──────────────────────────────────────────────────────────────
function OrdersTable({ C }: { C: Record<string, string> }) {
  const [orders, setOrders] = useState<DeliveryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [selected, setSelected] = useState<DeliveryDoc | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const orange = C.orange || "#FF6B00";

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px 9px 36px",
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 10, color: C.text, fontSize: 13,
    fontFamily: "'Nunito', sans-serif", outline: "none",
  };

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "deliveryRequests"), orderBy("createdAt", "desc"), limit(200)),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryDoc))); setLoading(false); }
    );
  }, []);

  const filtered = orders.filter(o => {
    const ms = !search || (o.orderNumber||"").toLowerCase().includes(search.toLowerCase()) || (o.customerName||"").toLowerCase().includes(search.toLowerCase()) || (o.pickupAddress||"").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || o.status === filter;
    const mt = typeFilter === "all" || o.type === typeFilter;
    const mv = vehicleFilter === "all" || o.vehicleType === vehicleFilter;
    return ms && mf && mt && mv;
  });

  const stats = {
    total: orders.length,
    active: orders.filter(o => !["delivered","cancelled"].includes(o.status||"")).length,
    delivered: orders.filter(o => o.status === "delivered").length,
    revenue: orders.filter(o => o.paymentStatus === "paid").reduce((a, o) => a + (o.swiftEarnings || 0), 0),
  };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "deliveryRequests", id), { status });
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : o);
    setEditingStatus(false);
  };

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Orders",    value: stats.total,     color: orange },
          { label: "Active",          value: stats.active,    color: "#F59E0B" },
          { label: "Delivered",       value: stats.delivered, color: "#10B981" },
          { label: "Swift9ja Revenue",value: fmt(stats.revenue), color: "#8B5CF6" },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, customers…" style={inp} />
        </div>
        {/* Status */}
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "9px 12px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {/* Type */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "9px 12px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
          <option value="all">All Types</option>
          <option value="send">Send Package</option>
          <option value="pickup">Schedule Pickup</option>
        </select>
        {/* Vehicle */}
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ padding: "9px 12px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
          <option value="all">All Vehicles</option>
          <option value="bike">Bike</option>
          <option value="car">Car</option>
          <option value="van">Van</option>
        </select>
        <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{filtered.length} orders</div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading orders…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
          <RiBox3Line size={36} style={{ opacity: 0.3, display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>No orders found</div>
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Order","Type","Customer","Vehicle","Service Mode","Route","Total","Status","Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setSelected(o)}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ color: orange, fontWeight: 800, fontSize: 12 }}>#{o.orderNumber || o.id.slice(-8).toUpperCase()}</div>
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{ago(o.createdAt)}</div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: o.type === "pickup" ? "#3B82F6" : orange, background: o.type === "pickup" ? "rgba(59,130,246,0.1)" : `${orange}14`, padding: "3px 8px", borderRadius: 8, textTransform: "uppercase" }}>{o.type || "send"}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{o.customerName || "—"}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{o.customerPhone || ""}</div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.text, background: C.surface2, padding: "3px 9px", borderRadius: 8, textTransform: "uppercase" }}>{o.vehicleType || "—"}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: o.serviceMode === "office" ? "#10B981" : C.muted }}>{o.serviceMode === "office" ? "Economy Hub" : o.serviceMode === "doorstep" ? "Doorstep" : "—"}</span>
                  </td>
                  <td style={{ padding: "12px 14px", maxWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <div style={{ width: 6, flexShrink: 0 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: orange, marginBottom: 2 }} />
                        <div style={{ width: 1, height: 16, background: "linear-gradient(to bottom, #FF6B00, #3b82f6)", margin: "0 2.5px" }} />
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: "#3b82f6" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 11, fontWeight: 600, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.pickupAddress || "—"}</div>
                        <div style={{ color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.dropoffAddress || "—"}</div>
                      </div>
                    </div>
                    {o.distanceKm ? <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{o.distanceKm.toFixed(1)} km</div> : null}
                  </td>
                  <td style={{ padding: "12px 14px", color: orange, fontWeight: 900, fontSize: 13 }}>{fmt(o.total || 0)}</td>
                  <td style={{ padding: "12px 14px" }}><StatusBadge status={o.status || "pending"} /></td>
                  <td style={{ padding: "12px 14px" }}>
                    <button onClick={e => { e.stopPropagation(); setSelected(o); setEditingStatus(false); }} style={{ padding: "4px 10px", borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <RiEditLine size={11} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => { setSelected(null); setEditingStatus(false); }}>
          <div style={{ background: C.modalBg || "#0e0e1a", border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
                <div>
                  <div style={{ color: orange, fontWeight: 900, fontSize: 20, fontFamily: "'Syne', sans-serif", marginBottom: 4 }}>#{selected.orderNumber || selected.id.slice(-8).toUpperCase()}</div>
                  <StatusBadge status={selected.status || "pending"} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>Total</div>
                  <div style={{ color: orange, fontWeight: 900, fontSize: 22, fontFamily: "'Syne', sans-serif" }}>{fmt(selected.total || 0)}</div>
                </div>
              </div>

              {/* Pricing breakdown */}
              <div style={{ background: `${orange}10`, border: `1px solid ${orange}28`, borderRadius: 14, padding: 16, marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: orange, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Pricing Breakdown</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { l: "Delivery Fee",     v: fmt(selected.deliveryFee  || 0), c: C.text   },
                    { l: "Platform Fee",     v: fmt(selected.platformFee  || 0), c: C.muted  },
                    { l: "Commission",       v: `${selected.commissionPct || 0}%`, c: C.muted },
                    { l: "Rider Earns",      v: fmt(selected.riderEarnings || 0), c: "#10B981" },
                    { l: "Swift9ja Earns",   v: fmt(selected.swiftEarnings || 0), c: "#8B5CF6" },
                    { l: "Distance",         v: selected.distanceKm ? `${selected.distanceKm.toFixed(1)} km` : "—", c: C.muted },
                  ].map((r, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>{r.l}</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: r.c, fontFamily: "'Syne', sans-serif" }}>{r.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Details rows */}
              {[
                ["Type",         selected.type === "pickup" ? "Schedule Pickup" : "Send Package"],
                ["Vehicle",      (selected.vehicleType || "—").toUpperCase()],
                ["Service Mode", selected.serviceMode === "office" ? "Economy Hub (office drop-off)" : "Doorstep Pickup"],
                ["Customer",     selected.customerName || "—"],
                ["Customer Phone", selected.customerPhone || "—"],
                ["Recipient",    selected.recipientName || "—"],
                ["Recipient Phone", selected.recipientPhone || "—"],
                ["Package",      selected.packageDescription || "—"],
                ["Rider",        selected.riderName || "Not assigned"],
                ["Payment",      `${selected.paymentMethod || "—"} · ${selected.paymentStatus || "—"}`],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 130, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v)}</div>
                </div>
              ))}

              {/* Route */}
              <div style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 0" }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Route</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: orange }} />
                    <div style={{ flex: 1, width: 2, background: `linear-gradient(to bottom, ${orange}, #3b82f6)`, minHeight: 24 }} />
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 13, marginBottom: 16 }}>{selected.pickupAddress || "—"}</div>
                    <div style={{ color: C.text, fontSize: 13 }}>{selected.dropoffAddress || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Status updater */}
              <div style={{ marginTop: 18 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Update Status</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(STATUS_COLORS).map(([k, v]) => (
                    <button key={k} onClick={() => updateStatus(selected.id, k)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${selected.status === k ? v.text : C.border}`, background: selected.status === k ? v.bg : "transparent", color: selected.status === k ? v.text : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {selected.status === k && <RiCheckLine size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />}{v.label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => { setSelected(null); setEditingStatus(false); }} style={{ marginTop: 20, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════
export default function SendPickupAdminPage({
  showToast,
  C,
}: {
  showToast: (m: string, t: "success" | "error" | "info") => void;
  C: Record<string, string>;
}) {
  const [tab, setTab] = useState<"orders" | "pricing">("orders");
  const orange = C.orange || "#FF6B00";

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <RiBox3Line size={24} color={orange} /> Send & Pickup
        </h1>
        <p style={{ color: C.muted, fontSize: 13 }}>Manage delivery orders and edit live pricing for all vehicle types.</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 4, width: "fit-content" }}>
        {([
          { key: "orders",  label: "Orders",         icon: <RiBox3Line size={14} />    },
          { key: "pricing", label: "Pricing Editor",  icon: <RiEditLine size={14} />    },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", background: tab === t.key ? `linear-gradient(135deg, ${orange}, #FF8C00)` : "transparent", color: tab === t.key ? "white" : C.muted, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "orders"  && <OrdersTable C={C} />}
      {tab === "pricing" && <PricingEditor C={C} showToast={showToast} />}
    </div>
  );
}