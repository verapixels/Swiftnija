// AdsPage.tsx — Admin view of all vendor ads/promotions
// Place at: src/Pages/AdsPage.tsx

import { useState, useEffect } from "react";
import {
  collection, query, onSnapshot, doc, updateDoc, deleteDoc,
  orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  RiMegaphoneLine, RiSearchLine, RiCloseLine, RiMailLine,
  RiTimeLine, RiCheckLine, RiAlertLine, RiImageLine,
  RiStore2Line, RiDeleteBinLine, RiEyeLine, RiPauseCircleLine,
  RiPlayCircleLine, RiRefreshLine,
} from "react-icons/ri";
import { FiZap, FiTrendingUp, FiImage } from "react-icons/fi";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdPromotion {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorLogo?: string;
  vendorEmail?: string;
  type: string;
  label: string;
  price: number;
  durationDays: number;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "cancelled" | "expiring_soon";
  selectedProducts?: string[];
  bannerTemplateId?: string;
  bannerData?: {
    storeName?: string;
    tagline?: string;
    logoUrl?: string;
    ctaText?: string;
    customBannerUrl?: string;
    selectedProducts?: string[];
  };
  paystackRef?: string;
  createdAt?: { seconds: number };
}

interface Product {
  id: string;
  name: string;
  img?: string | null;
  price?: string | number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDaysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function ago(secs?: number): string {
  if (!secs) return "—";
  const diff = Date.now() - secs * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PLAN_ICON: Record<string, React.ReactNode> = {
  trending_homepage: <FiTrendingUp size={14} />,
  search_priority: <RiSearchLine size={14} />,
  search_trending: <FiTrendingUp size={14} />,
  homepage_banner: <FiImage size={14} />,
};

const PLAN_COLOR: Record<string, string> = {
  trending_homepage: "#FF6B00",
  search_priority: "#3B82F6",
  search_trending: "#10B981",
  homepage_banner: "#8B5CF6",
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function AdStatusBadge({ status, daysLeft }: { status: string; daysLeft: number }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: "rgba(16,185,129,0.12)", color: "#10B981", label: "Active" },
    expiring_soon: { bg: "rgba(245,158,11,0.12)", color: "#F59E0B", label: "Expiring Soon" },
    expired: { bg: "rgba(100,100,120,0.14)", color: "#666", label: "Expired" },
    cancelled: { bg: "rgba(239,68,68,0.12)", color: "#EF4444", label: "Cancelled" },
  };
  const s = cfg[status] ?? cfg.expired;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 10, fontWeight: 800, border: `1px solid ${s.color}30`, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Copy Email Button ────────────────────────────────────────────────────────
function CopyEmailBtn({ email, C }: { email: string; C: typeof import("../components/Swiftadmindashboard").default }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy email"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 8, cursor: "pointer",
        background: copied ? "rgba(16,185,129,0.12)" : "rgba(255,107,0,0.08)",
        border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,107,0,0.25)"}`,
        color: copied ? "#10B981" : "#FF6B00",
        fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
        transition: "all .2s",
      }}
    >
      {copied ? <RiCheckLine size={11} /> : <RiMailLine size={11} />}
      {copied ? "Copied!" : email}
    </button>
  );
}

// ─── Ad Detail Modal ──────────────────────────────────────────────────────────
function AdDetailModal({
  ad,
  products,
  onClose,
  onStop,
  onDelete,
  C,
}: {
  ad: AdPromotion;
  products: Record<string, Product[]>;
  onClose: () => void;
  onStop: (id: string, status: "cancelled") => void;
  onDelete: (id: string) => void;
  C: Record<string, string>;
}) {
  const daysLeft = getDaysLeft(ad.endDate);
  const planColor = PLAN_COLOR[ad.type] || "#FF6B00";
  const adProds = (products[ad.vendorId] || []).filter(p => (ad.selectedProducts || []).includes(p.id));

  const pct = Math.max(0, Math.min(100, ((ad.durationDays - daysLeft) / ad.durationDays) * 100));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: 28 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${planColor}18`, border: `1.5px solid ${planColor}30`, display: "flex", alignItems: "center", justifyContent: "center", color: planColor, flexShrink: 0 }}>
                {PLAN_ICON[ad.type] || <FiZap size={18} />}
              </div>
              <div>
                <div style={{ color: C.text, fontWeight: 900, fontSize: 17, fontFamily: "'Syne',sans-serif" }}>{ad.label}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{ad.vendorName}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <AdStatusBadge status={ad.status} daysLeft={daysLeft} />
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RiCloseLine size={15} />
              </button>
            </div>
          </div>

          {/* Vendor Info */}
          <div style={{ padding: "14px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Vendor</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {ad.vendorLogo ? (
                <img src={ad.vendorLogo} alt={ad.vendorName} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <RiStore2Line size={18} color="#FF6B00" />
                </div>
              )}
              <div>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{ad.vendorName}</div>
                {ad.vendorEmail && <CopyEmailBtn email={ad.vendorEmail} C={C as any} />}
              </div>
            </div>
          </div>

          {/* Time & Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
            {[
              { label: "Price", val: `₦${ad.price?.toLocaleString()}`, color: planColor },
              { label: "Days Left", val: `${daysLeft}d`, color: daysLeft <= 2 ? "#F59E0B" : C.green },
              { label: "Duration", val: `${ad.durationDays}d`, color: C.text },
            ].map(s => (
              <div key={s.label} style={{ padding: "12px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: "'Syne',sans-serif" }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 6 }}>
              <span>Start: {fmtDate(ad.startDate)}</span>
              <span>End: {fmtDate(ad.endDate)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: daysLeft <= 2 ? "#F59E0B" : planColor, borderRadius: 4, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textAlign: "right" }}>{Math.round(pct)}% elapsed</div>
          </div>

          {/* Banner Preview */}
          {ad.type === "homepage_banner" && ad.bannerData && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Banner Content</div>
              {ad.bannerData.customBannerUrl ? (
                <img src={ad.bannerData.customBannerUrl} alt="Banner" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
              ) : (
                <div style={{ padding: "12px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                  {[
                    ["Store Name", ad.bannerData.storeName],
                    ["Tagline", ad.bannerData.tagline],
                    ["CTA Button", ad.bannerData.ctaText],
                    ["Template", ad.bannerTemplateId],
                  ].map(([k, v]) => v ? (
                    <div key={String(k)} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ color: C.text, fontSize: 12 }}>{String(v)}</div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          )}

          {/* Featured Products */}
          {adProds.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Featured Products ({adProds.length})
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {adProds.map(p => (
                  <div key={p.id} style={{ padding: "8px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", background: C.border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.img ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <RiImageLine size={14} color={C.muted} />}
                    </div>
                    <div>
                      <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{p.name}</div>
                      {p.price && <div style={{ color: "#FF6B00", fontSize: 10, fontWeight: 800 }}>₦{p.price}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paystack Ref */}
          {ad.paystackRef && (
            <div style={{ padding: "10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 18, fontSize: 11, color: C.muted }}>
              <span style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: .6 }}>Paystack Ref: </span>
              <span style={{ fontFamily: "monospace" }}>{ad.paystackRef}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            {(ad.status === "active" || ad.status === "expiring_soon") && (
              <button
                onClick={() => { onStop(ad.id, "cancelled"); onClose(); }}
                style={{ flex: 1, padding: "11px", borderRadius: 12, background: "rgba(245,158,11,0.1)", border: "1.5px solid rgba(245,158,11,0.3)", color: "#F59E0B", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'DM Sans',sans-serif" }}
              >
                <RiPauseCircleLine size={15} /> Stop Ad
              </button>
            )}
            <button
              onClick={() => { onDelete(ad.id); onClose(); }}
              style={{ flex: 1, padding: "11px", borderRadius: 12, background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.25)", color: "#EF4444", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'DM Sans',sans-serif" }}
            >
              <RiDeleteBinLine size={15} /> Remove Ad
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main AdsPage ─────────────────────────────────────────────────────────────
export default function AdsPage({ adminUser, showToast, C }: {
  adminUser: { uid: string; displayName?: string | null } | null;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
  C: Record<string, string>;
}) {
  const [ads, setAds] = useState<AdPromotion[]>([]);
  const [products, setProducts] = useState<Record<string, Product[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<AdPromotion | null>(null);

  // Load all ads
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "adPromotions"), orderBy("createdAt", "desc")),
      snap => {
        const now = new Date().toISOString();
        const list: AdPromotion[] = snap.docs.map(d => {
          const a = { id: d.id, ...d.data() } as AdPromotion;
          if (a.status === "cancelled") return a;
          if (a.endDate < now) return { ...a, status: "expired" as const };
          const dLeft = getDaysLeft(a.endDate);
          if (dLeft <= 2) return { ...a, status: "expiring_soon" as const };
          return { ...a, status: "active" as const };
        });
        setAds(list);
        setLoading(false);

        // Load products for each unique vendorId
        const vendorIds = [...new Set(list.map(a => a.vendorId))];
        vendorIds.forEach(async vid => {
          if (products[vid]) return;
          const { getDocs, collection: col, query: q, where } = await import("firebase/firestore");
          const snap2 = await getDocs(q(col(db, "products"), where("vendorId", "==", vid)));
          const prods: Product[] = snap2.docs.map(p => {
            const d2 = p.data();
            return {
              id: p.id,
              name: d2.name || "Product",
              img: [d2.images?.[0], d2.image, d2.img].find((u: unknown) => typeof u === "string" && !(u as string).includes("supabase")) ?? null,
              price: d2.price,
            };
          });
          setProducts(prev => ({ ...prev, [vid]: prods }));
        });
      }
    );
  }, []);

  const stopAd = async (id: string, status: "cancelled") => {
    await updateDoc(doc(db, "adPromotions", id), { status });
    showToast("Ad stopped successfully", "info");
  };

  const deleteAd = async (id: string) => {
    await deleteDoc(doc(db, "adPromotions", id));
    showToast("Ad removed", "info");
  };

  const filtered = ads.filter(a => {
    const ms = (a.vendorName || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.vendorEmail || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.label || "").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || a.status === filter;
    const mt = typeFilter === "all" || a.type === typeFilter;
    return ms && mf && mt;
  });

  const stats = {
    total: ads.length,
    active: ads.filter(a => a.status === "active" || a.status === "expiring_soon").length,
    expiring: ads.filter(a => a.status === "expiring_soon").length,
    revenue: ads.reduce((sum, a) => sum + (a.price || 0), 0),
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 12, color: C.text, fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&display=swap');
        .ads-row:hover { background: ${C.surfaceHover} !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <RiMegaphoneLine size={22} color="#FF6B00" /> Promotions & Ads
        </h1>
        <p style={{ color: C.muted, fontSize: 13 }}>All vendor ads running on the platform</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginBottom: 26 }}>
        {[
          { label: "Total Ads", val: stats.total, color: "#FF6B00" },
          { label: "Currently Active", val: stats.active, color: "#10B981" },
          { label: "Expiring Soon", val: stats.expiring, color: "#F59E0B" },
          { label: "Ad Revenue", val: `₦${stats.revenue.toLocaleString()}`, color: "#8B5CF6" },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'Syne',sans-serif" }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .8, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}>
            <RiSearchLine size={14} />
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, plan…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "active", "expiring_soon", "expired", "cancelled"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${filter === f ? "#FF6B00" : C.border}`, background: filter === f ? "rgba(255,107,0,0.1)" : "transparent", color: filter === f ? "#FF6B00" : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {f.replace("_", " ")}
          </button>
        ))}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
          <option value="all">All Types</option>
          <option value="trending_homepage">Trending Homepage</option>
          <option value="search_priority">Search Priority</option>
          <option value="search_trending">Search Trending</option>
          <option value="homepage_banner">Homepage Banner</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted, fontSize: 14 }}>Loading ads…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
          <RiMegaphoneLine size={36} style={{ opacity: .2, marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>No ads found</div>
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Vendor", "Plan", "Price", "Products", "Remaining", "Expires", "Status", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(ad => {
                const daysLeft = getDaysLeft(ad.endDate);
                const planColor = PLAN_COLOR[ad.type] || "#FF6B00";
                const pct = Math.max(0, Math.min(100, ((ad.durationDays - daysLeft) / ad.durationDays) * 100));
                const adProds = (products[ad.vendorId] || []).filter(p => (ad.selectedProducts || []).includes(p.id));

                return (
                  <tr
                    key={ad.id}
                    className="ads-row"
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background .15s" }}
                    onClick={() => setSelected(ad)}
                  >
                    {/* Vendor */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {ad.vendorLogo ? (
                          <img src={ad.vendorLogo} alt={ad.vendorName} style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover", border: `1px solid ${C.border}`, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <RiStore2Line size={15} color="#FF6B00" />
                          </div>
                        )}
                        <div>
                          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{ad.vendorName}</div>
                          {ad.vendorEmail && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                              <CopyEmailBtn email={ad.vendorEmail} C={C as any} />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 8, background: `${planColor}14`, border: `1px solid ${planColor}25`, width: "fit-content" }}>
                        <span style={{ color: planColor }}>{PLAN_ICON[ad.type] || <FiZap size={12} />}</span>
                        <span style={{ color: planColor, fontSize: 11, fontWeight: 800 }}>{ad.label}</span>
                      </div>
                    </td>

                    {/* Price */}
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ color: "#FF6B00", fontWeight: 900, fontSize: 13, fontFamily: "'Syne',sans-serif" }}>₦{ad.price?.toLocaleString()}</span>
                    </td>

                    {/* Products */}
                    <td style={{ padding: "14px 16px" }}>
                      {ad.type === "homepage_banner" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted, fontSize: 12 }}>
                          <FiImage size={12} color="#8B5CF6" />
                          <span style={{ color: "#8B5CF6", fontWeight: 700 }}>Banner Ad</span>
                        </div>
                      ) : adProds.length > 0 ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          {adProds.slice(0, 3).map(p => (
                            <div key={p.id} title={p.name} style={{ width: 28, height: 28, borderRadius: 7, overflow: "hidden", border: `1px solid ${C.border}`, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {p.img ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <RiImageLine size={12} color={C.muted} />}
                            </div>
                          ))}
                          {adProds.length > 3 && <div style={{ width: 28, height: 28, borderRadius: 7, background: C.surface2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: C.muted }}>+{adProds.length - 3}</div>}
                        </div>
                      ) : (
                        <span style={{ color: C.muted, fontSize: 11 }}>No products</span>
                      )}
                    </td>

                    {/* Remaining */}
                    <td style={{ padding: "14px 16px", minWidth: 120 }}>
                      <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: daysLeft <= 2 ? "#F59E0B" : daysLeft === 0 ? "#EF4444" : C.text }}>
                          {daysLeft === 0 ? "Expired" : `${daysLeft}d left`}
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: daysLeft <= 2 ? "#F59E0B" : planColor, borderRadius: 4 }} />
                      </div>
                    </td>

                    {/* Expires */}
                    <td style={{ padding: "14px 16px", color: C.muted, fontSize: 12 }}>{fmtDate(ad.endDate)}</td>

                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <AdStatusBadge status={ad.status} daysLeft={daysLeft} />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "14px 16px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setSelected(ad)}
                          title="View details"
                          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <RiEyeLine size={13} />
                        </button>
                        {(ad.status === "active" || ad.status === "expiring_soon") && (
                          <button
                            onClick={() => stopAd(ad.id, "cancelled")}
                            title="Stop ad"
                            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#F59E0B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <RiPauseCircleLine size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteAd(ad.id)}
                          title="Delete ad"
                          style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <RiDeleteBinLine size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <AdDetailModal
          ad={selected}
          products={products}
          onClose={() => setSelected(null)}
          onStop={stopAd}
          onDelete={deleteAd}
          C={C}
        />
      )}
    </div>
  );
}