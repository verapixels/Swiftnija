// ─────────────────────────────────────────────────────────────────────────────
// Homepage.tsx — replace src/pages/Homepage.tsx
// Changes:
//   1. "Trending Near You" label → "Trending" (₦25k paid ads only)
//   2. HomepageBannerAds (₦10k) injected after Categories
//   3. HomepageTrendingAds (₦25k) replaces organic trending
//   4. On every page refresh, 2-4 products shown from paid ads (slot builder)
//   5. Returns null when no paid ads — invisible to users until vendors pay
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiShoppingCart, FiPackage, FiCoffee, FiStar, FiClock, FiTruck,
  FiChevronRight, FiZap, FiGrid, FiMapPin, FiBox, FiDroplet, FiHeart,
  FiSearch, FiRefreshCw, FiX, FiMinus, FiPlus, FiShield, FiTrendingUp,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike,
} from "react-icons/md";
import {
  RiSendPlaneFill, RiLeafLine, RiDrinks2Line, RiVerifiedBadgeFill, RiStore2Line,
} from "react-icons/ri";
import { useCart } from "../context/Cartcontext";
import { db, auth } from "../firebase";
import {
  collection, getDocs, doc, getDoc, setDoc,
  serverTimestamp, query, where, limit, onSnapshot,
} from "firebase/firestore";
import { MapPinSelector } from "./Mappinselector";
import type { AdPromotion } from "../../adTypes";
import { buildHomepageTrendingSlots, BANNER_TEMPLATES, isExpiringSoon } from "../../adTypes";
import { useMaintenanceBanner } from "../hooks/useMaintenanceBanner";


// ─── Types ────────────────────────────────────────────────────────────────────
type RawProduct = {
  name?: string; price?: number | string; category?: string;
  images?: string[]; image?: string; img?: string;
  description?: string; highlights?: string; careInfo?: string;
  vendorId?: string; vendorName?: string; storeName?: string; businessName?: string;
  rating?: number; inStock?: boolean; available?: boolean; stock?: number;
  shipping?: { weightKg?: number | null; sizeCategory?: string | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; };
};
export type Product = {
  id: string; name: string; store: string; rating: number;
  price: string; img: string | null; category: string;
  vendorId: string; vendorName?: string; vendorVerified?: boolean;
  description?: string; highlights?: string; careInfo?: string;
  stock?: number; shipping?: RawProduct["shipping"];
};
type Trending   = { name: string; rating: number; time: string; tag: string; img: string | null; categoryId: string; vendorId?: string; };
type Address    = { id: string; label: "Home"|"Work"|"Other"; address: string; landmark?: string; extraClue?: string; isDefault: boolean; lat?: number; lng?: number; };
type VendorInfo = { name: string; logo?: string; verified?: boolean; rating?: number; reviewCount?: number; deliveryTime?: string; address?: string; };
type AdProduct  = { id: string; name: string; price?: string | number; img?: string | null; vendorId?: string; vendorName?: string; vendorVerified?: boolean; };

// ─── Constants ────────────────────────────────────────────────────────────────
const LOGO     = "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";
const FALLBACK = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80";
const ACCENT   = "#FF6B00";

const CAT: Record<string, { label: string; icon: React.ReactNode }> = {
  restaurants:  { label: "Restaurants",   icon: <MdRestaurant size={24} /> },
  pharmacy:     { label: "Pharmacy",      icon: <MdLocalPharmacy size={24} /> },
  supermarket:  { label: "Supermarket",   icon: <MdLocalGroceryStore size={24} /> },
  boutique:     { label: "Boutique",      icon: <MdStorefront size={24} /> },
  sendpickup:   { label: "Send & Pickup", icon: <MdDirectionsBike size={24} /> },
  skincare:     { label: "Skincare",      icon: <FiBox size={24} /> },
  perfumes:     { label: "Perfumes",      icon: <FiDroplet size={24} /> },
  drinks:       { label: "Drinks",        icon: <RiDrinks2Line size={24} /> },
  groceries:    { label: "Groceries",     icon: <MdLocalGroceryStore size={24} /> },
  fashion:      { label: "Fashion",       icon: <MdStorefront size={24} /> },
  health:       { label: "Health",        icon: <FiHeart size={24} /> },
  beauty:       { label: "Beauty",        icon: <FiBox size={24} /> },
  electronics:  { label: "Electronics",   icon: <FiBox size={24} /> },
  other:        { label: "Other",         icon: <FiPackage size={24} /> },
};

const FIXED = ["restaurants", "pharmacy", "supermarket", "boutique", "sendpickup"];
const SIZE_LBL: Record<string, string> = { small: "Small pkg", medium: "Medium pkg", large: "Large pkg", extra_large: "Extra large" };
const SVCS = [
  { icon: <FiGrid size={15} />,           label: "All",          path: null as string | null },
  { icon: <FiPackage size={15} />,        label: "Parcels",      path: null },
  { icon: <RiSendPlaneFill size={15} />,  label: "Pick-up/Send", path: "/send-pickup" },
  { icon: <FiCoffee size={15} />,         label: "Drinks",       path: null },
];
const ESS = [
  { label: "Fresh Groceries",      icon: <RiLeafLine size={13} />,   img: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80" },
  { label: "Health & Supplements", icon: <FiHeart size={13} />,      img: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80" },
  { label: "Fresh Drinks",         icon: <FiDroplet size={13} />,    img: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80" },
  { label: "Beauty & Skincare",    icon: <FiBox size={13} />,        img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80" },
  { label: "Quick Bites",          icon: <MdRestaurant size={13} />, img: "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=400&q=80" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
function normCat(raw: string): string {
  if (!raw) return "other";
  const s = raw.toLowerCase().trim();
  const map: [string, string][] = [
    ["restaurant","restaurants"],["fast food","restaurants"],["fastfood","restaurants"],["burger","restaurants"],
    ["pharmacy","pharmacy"],["drug","pharmacy"],["medicine","pharmacy"],
    ["health","health"],["supplement","health"],
    ["supermarket","supermarket"],["grocery","groceries"],["groceries","groceries"],
    ["boutique","boutique"],["fashion","fashion"],["clothing","fashion"],
    ["logistics","sendpickup"],["delivery","sendpickup"],["courier","sendpickup"],
    ["send","sendpickup"],["pickup","sendpickup"],
    ["skincare","skincare"],["beauty","beauty"],["perfume","perfumes"],
    ["drink","drinks"],["beverage","drinks"],
    ["electronics","electronics"],["food","restaurants"],
  ];
  for (const [k, v] of map) if (s.includes(k)) return v;
  return s in CAT ? s : "other";
}
function fmtP(p: number | string): string {
  const n = typeof p === "number" ? p : parseFloat(String(p).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? String(p) : n.toLocaleString("en-NG");
}
function rawN(s: string): number { return parseFloat(s.replace(/[₦,\s]/g, "")) || 0; }
function bestImg(r: RawProduct): string | null {
  return [r.images?.[0], r.image, r.img].find(u => u && !u.includes("supabase.co")) ?? null;
}

// ─── Fetch helpers for ad products ────────────────────────────────────────────
async function fetchAdProductsByIds(ids: string[]): Promise<AdProduct[]> {
  if (ids.length === 0) return [];
  const results: AdProduct[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, "products"), where("__name__", "in", batch)));
      snap.forEach(d => {
        const data = d.data();
        const img = [data.images?.[0], data.image, data.img].find((u: any) => u && !u.includes("supabase")) ?? null;
        results.push({ id: d.id, name: data.name || "Product", price: data.price, img, vendorId: data.vendorId, vendorName: data.vendorName || data.businessName || data.storeName });
      });
    } catch {}
  }
  return ids.map(id => results.find(p => p.id === id)).filter(Boolean) as AdProduct[];
}

// ─── Firestore fetchers ───────────────────────────────────────────────────────
async function fetchProds(): Promise<Product[]> {
  const out: Product[] = [];
  try {
    const snap = await getDocs(collection(db, "products"));
    snap.forEach(d => {
      const r = d.data() as RawProduct;
      if (r.inStock === false || r.available === false) return;
      out.push({ id: d.id, name: r.name || "Product", store: r.businessName || r.storeName || r.vendorName || "Store", vendorName: r.businessName || r.storeName || r.vendorName, rating: typeof r.rating === "number" ? r.rating : +(4 + Math.random()).toFixed(1), price: fmtP(r.price ?? 0), img: bestImg(r), category: normCat(r.category || "other"), vendorId: r.vendorId || "", description: r.description || "", highlights: r.highlights || "", careInfo: r.careInfo || "", stock: r.stock, shipping: r.shipping, vendorVerified: false });
    });
  } catch (e) { console.error("fetchProds:", e); }
  return out;
}
async function fetchVendorMap(): Promise<Record<string, { verified: boolean; name: string }>> {
  const map: Record<string, { verified: boolean; name: string }> = {};
  try {
    const snap = await getDocs(collection(db, "vendors"));
    snap.forEach(d => {
      const v = d.data();
      const name = v.businessName || v.storeName || "";
      map[d.id] = { verified: !!v.blueBadge, name };
      if (v.businessName) map[`name:${v.businessName}`] = { verified: !!v.blueBadge, name };
      if (v.storeName)    map[`name:${v.storeName}`]    = { verified: !!v.blueBadge, name };
    });
  } catch (e) { console.error("fetchVendorMap:", e); }
  return map;
}
async function fetchVends(): Promise<Trending[]> {
  const out: Trending[] = [];
  try {
    const snap = await getDocs(collection(db, "vendors"));
    snap.forEach(d => {
      const v = d.data();
      const name = v.storeName || v.businessName;
      if (!name) return;
      const c = normCat(v.category || v.businessType || "other");
      out.push({ name, rating: typeof v.rating === "number" ? v.rating : +(4.5 + Math.random() * 0.5).toFixed(1), time: v.deliveryTime || `${10 + Math.floor(Math.random() * 20)}-${25 + Math.floor(Math.random() * 20)} mins`, tag: CAT[c]?.label || "Order Now", img: [v.coverImage, v.bannerImage, v.logo].find((u: any) => u && !u.includes("supabase.co")) ?? null, categoryId: c, vendorId: d.id });
    });
  } catch (e) { console.error("fetchVends:", e); }
  return out;
}

// ─── Phone Verify Banner ──────────────────────────────────────────────────────
function PhoneVerifyBanner({ userId, onClose, onNavigate }: { userId: string; onClose: () => void; onNavigate: () => void }) {
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);
  useEffect(() => {
    getDoc(doc(db, "users", userId))
      .then(s => { if (s.exists()) setPhoneVerified(!!s.data().phoneVerified); else setPhoneVerified(false); })
      .catch(() => setPhoneVerified(null));
  }, [userId]);
  if (phoneVerified !== false) return null;
  return (
    <div className="phone-alert-banner">
      <span style={{ fontSize: 16, flexShrink: 0 }}>📱</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ht)" }}>Secure your account — verify your phone number.</span>
      <button className="phone-alert-link" onClick={onNavigate}>Verify now →</button>
      <button className="phone-alert-close" onClick={onClose} aria-label="Dismiss"><FiX size={13} /></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ₦10k HOMEPAGE BANNER ADS — shown after Categories
// Returns null when no active banner ads
// ─────────────────────────────────────────────────────────────────────────────
function HomepageBannerAds({ onVendorClick }: { onVendorClick?: (vendorId: string) => void }) {
  const [bannerAds, setBannerAds] = useState<AdPromotion[]>([]);
  const [bannerProds, setBannerProds] = useState<Record<string, AdProduct[]>>({});
  const [shuffled, setShuffled] = useState<AdPromotion[]>([]);

  useEffect(() => {
    const now = new Date().toISOString();
    return onSnapshot(
      query(collection(db, "adPromotions"), where("type", "==", "homepage_banner"), where("status", "in", ["active", "expiring_soon"])),
      async snap => {
        const ads = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdPromotion)).filter(a => a.endDate > now && a.bannerData);
        // Shuffle on every load/refresh
        const sh = [...ads].sort(() => Math.random() - 0.5);
        setBannerAds(ads);
        setShuffled(sh);
        const map: Record<string, AdProduct[]> = {};
        await Promise.all(ads.map(async a => {
          const pids = a.bannerData?.selectedProducts || [];
          if (pids.length > 0) map[a.id!] = await fetchAdProductsByIds(pids);
        }));
        setBannerProds(map);
      }
    );
  }, []);

  if (bannerAds.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Horizontal scrollable row */}
      <div style={{ display: "flex", gap: 12, padding: "0 18px", overflowX: "auto", scrollbarWidth: "none" }}>
        {shuffled.map(ad => {
          const tmpl = BANNER_TEMPLATES.find(t => t.id === ad.bannerTemplateId) || BANNER_TEMPLATES[0];
          const s = tmpl.style;
          const bd = ad.bannerData!;
          const prods = (bannerProds[ad.id!] || []).slice(0, 3);

          if (bd.customBannerUrl) {
            return (
              <div key={ad.id} onClick={() => ad.vendorId && onVendorClick?.(ad.vendorId)}
                style={{ flexShrink: 0, width: 280, borderRadius: 16, overflow: "hidden", cursor: ad.vendorId ? "pointer" : "default", position: "relative" }}>
                <img src={bd.customBannerUrl} alt={bd.storeName} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", top: 7, right: 8, padding: "2px 9px", borderRadius: 6, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: 0.3 }}>Sponsored</div>
              </div>
            );
          }

          return (
            <div key={ad.id} onClick={() => ad.vendorId && onVendorClick?.(ad.vendorId)}
              style={{ flexShrink: 0, width: 280, borderRadius: 16, overflow: "hidden", background: s.background, cursor: ad.vendorId ? "pointer" : "default", position: "relative", transition: "opacity .2s" }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = "0.92"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = "1"}>
              <div style={{ position: "absolute", top: -40, right: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 7, right: 8, padding: "2px 9px", borderRadius: 6, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: 0.3 }}>Sponsored</div>
              <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(6px)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {bd.logoUrl
                    ? <img src={bd.logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <RiStore2Line size={18} color={s.titleColor} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, color: s.titleColor, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bd.storeName}</div>
                  <div style={{ fontSize: 10, color: s.subColor, marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bd.tagline}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: s.ctaBackground, color: s.ctaColor, fontSize: 10, fontWeight: 800 }}>
                    {bd.ctaText} <FiChevronRight size={9} />
                  </div>
                </div>
                {prods.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    {prods.slice(0, 2).map((p, i) => (
                      <div key={i} style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                        {p.img
                          ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><FiPackage size={12} color={s.titleColor} /></div>
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// ₦25k HOMEPAGE TRENDING ADS — label is "Trending" (not "Trending Near You")
// Shows 2-4 products per refresh from paid vendors
// Returns null when no active ads
// ─────────────────────────────────────────────────────────────────────────────
// ─── Trending Ad Card ─────────────────────────────────────────────────────────
function TrendingAdCard({ p }: { p: AdProduct }) {
  const [added, setAdded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const { addToCart } = useCart();

  return (
    <div className="hp-pc">
      <div className="hp-pi" style={{ position: "relative" }}>
        {p.img && !imgErr
          ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgErr(true)} />
          : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><FiBox size={18} color="#444" /></div>
        }
        <button onClick={e => { e.stopPropagation(); setLiked(v => !v); }}
          style={{ position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <FiHeart size={11} color={liked ? "#ef4444" : "#fff"} fill={liked ? "#ef4444" : "none"} />
        </button>
      </div>
      <div className="hp-pb">
        <div className="hp-pn">{p.name}</div>
        {p.vendorName && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3, minWidth: 0 }}>
            <span className="hp-ps">{p.vendorName}</span>
          </div>
        )}
        <div style={{ marginTop: "auto" }}>
          <span style={{ color: ACCENT, fontWeight: 900, fontSize: 13, fontFamily: "'Syne',sans-serif", display: "block", marginBottom: 7 }}>
            ₦{String(p.price || 0)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="hp-fav" onClick={e => { e.stopPropagation(); setLiked(v => !v); }}>
              <FiHeart size={12} fill={liked ? ACCENT : "none"} color={liked ? ACCENT : "currentColor"} />
            </button>
            <button className="hp-buy" style={{ flex: 1, background: added ? "#22c55e" : ACCENT }}
              onClick={e => {
                e.stopPropagation();
                addToCart({ name: p.name, price: `₦${p.price || 0}`, img: p.img || FALLBACK, vendorName: p.vendorName, vendorId: p.vendorId });
                setAdded(true); setTimeout(() => setAdded(false), 1200);
              }}>
              {added ? "Added!" : "Add to Cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ₦25k HOMEPAGE TRENDING ADS
// ─────────────────────────────────────────────────────────────────────────────
function HomepageTrendingAds({ dark }: { dark: boolean }) {
  const [promos, setPromos]     = useState<AdPromotion[]>([]);
  const [products, setProducts] = useState<AdProduct[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const now = new Date().toISOString();
    return onSnapshot(
      query(collection(db, "adPromotions"), where("type", "==", "trending_homepage"), where("status", "in", ["active", "expiring_soon"])),
      snap => {
        const ads = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdPromotion)).filter(a => a.endDate > now && a.selectedProducts.length > 0);
        setPromos(ads);
      }
    );
  }, []);

  const reshuffle = useCallback(async () => {
    setLoading(true);
    const slots = buildHomepageTrendingSlots(promos);
    if (slots.length > 0) setProducts(await fetchAdProductsByIds(slots));
    else setProducts([]);
    setLoading(false);
  }, [promos]);

  useEffect(() => { reshuffle(); }, [reshuffle]);

  if (!loading && products.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(255,107,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiTrendingUp size={14} color={ACCENT} />
          </div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, color: "var(--ht)" }}>Trending</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--hs)", fontWeight: 600, paddingRight: 18 }}>Sponsored</span>
      </div>

      {loading ? (
        <div style={{ display: "flex", gap: 12, padding: "0 18px", overflow: "hidden" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 162, height: 210, borderRadius: 15, background: "var(--hcard)", position: "relative", overflow: "hidden" }}>
              <div className="sk" style={{ position: "absolute", inset: 0 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="hp-hscr">
          {products.map((p, i) => (
            <TrendingAdCard key={p.id + i} p={p} />  
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Detail Sheet ─────────────────────────────────────────────────────────────
function DetailSheet({ product, onClose, onAdd, dark }: { product: Product | null; onClose: () => void; onAdd: (p: Product, qty: number) => void; dark: boolean }) {
  const navigate = useNavigate();
  const [qty, setQty]       = useState(1);
  const [liked, setLiked]   = useState(false);
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [full, setFull]     = useState<Product | null>(null);
  const [busy, setBusy]     = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [open, setOpen]     = useState(false);
  const D = dark ? { bg: "#13131a", brd: "#1e1e2c", txt: "#eeeef8", sub: "#66668a", card: "#0f0f16" } : { bg: "#ffffff", brd: "#e0e0ee", txt: "#111118", sub: "#7777a2", card: "#f4f4fc" };

  useEffect(() => {
    if (!product) { setOpen(false); return; }
    setQty(1); setImgErr(false); setVendor(null); setFull(null);
    requestAnimationFrame(() => setOpen(true));
    (async () => {
      setBusy(true);
      try {
        const ps = await getDoc(doc(db, "products", product.id));
        if (ps.exists()) { const d = ps.data() as RawProduct; setFull({ ...product, description: d.description || product.description || "", highlights: d.highlights || product.highlights || "", careInfo: d.careInfo || product.careInfo || "", stock: d.stock ?? product.stock, shipping: d.shipping ?? product.shipping }); } else setFull(product);
        let v: VendorInfo | null = null;
        if (product.vendorId) { const vs = await getDoc(doc(db, "vendors", product.vendorId)); if (vs.exists()) { const d = vs.data(); v = { name: d.businessName || d.storeName || product.store, logo: d.logo || d.coverImage, verified: d.verified, rating: d.rating, reviewCount: d.reviewCount, deliveryTime: d.deliveryTime || "15–35 mins", address: d.address || d.city }; } }
        if (!v && product.vendorName) { for (const f of ["businessName", "storeName"]) { const s = await getDocs(query(collection(db, "vendors"), where(f, "==", product.vendorName), limit(1))); if (!s.empty) { const d = s.docs[0].data(); v = { name: d.businessName || d.storeName || product.store, logo: d.logo || d.coverImage, verified: d.verified, rating: d.rating, reviewCount: d.reviewCount, deliveryTime: d.deliveryTime || "15–35 mins", address: d.address || d.city }; break; } } }
        setVendor(v);
      } finally { setBusy(false); }
    })();
  }, [product?.id]);

  const close = () => { setOpen(false); setTimeout(onClose, 300); };
  if (!product) return null;
  const dp = full ?? product;
  const price = rawN(dp.price);
  const inStock = dp.stock === undefined || dp.stock === null || dp.stock > 0;
  const dots = dp.highlights ? dp.highlights.split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean) : [];

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 6000, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", animation: "sn-bk .25s ease" }} />
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 6001, maxHeight: "93vh", overflowY: "auto", scrollbarWidth: "none", borderRadius: "26px 26px 0 0", background: D.bg, animation: open ? "sn-up .35s cubic-bezier(.32,1,.4,1)" : "sn-dn .3s ease forwards", willChange: "transform" }}>
        <div style={{ width: 38, height: 4, borderRadius: 4, background: D.brd, margin: "10px auto 0" }} />
        <div style={{ position: "relative", height: 245, overflow: "hidden" }}>
          <img src={imgErr ? FALLBACK : (dp.img || FALLBACK)} alt={dp.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)" }} />
          <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8 }}>
            <button onClick={() => setLiked(v => !v)} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", background: liked ? "rgba(239,68,68,.85)" : "rgba(0,0,0,.48)", backdropFilter: "blur(8px)" }}><FiHeart size={14} fill={liked ? "white" : "none"} /></button>
            <button onClick={close} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", background: "rgba(0,0,0,.48)", backdropFilter: "blur(8px)" }}><FiX size={14} /></button>
          </div>
          <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: inStock ? "rgba(16,185,129,.85)" : "rgba(239,68,68,.85)", color: "white", fontSize: 11, fontWeight: 800, padding: "4px 11px", borderRadius: 20, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white", display: "inline-block" }} />
              {inStock ? (dp.stock != null && dp.stock <= 10 ? `Only ${dp.stock} left` : "In Stock") : "Out of Stock"}
            </span>
            <span style={{ background: "rgba(0,0,0,.52)", color: "white", fontSize: 11, fontWeight: 800, padding: "4px 11px", borderRadius: 20, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 4 }}>
              <FiStar size={10} fill={ACCENT} color={ACCENT} /> {dp.rating.toFixed(1)}
            </span>
          </div>
        </div>
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, lineHeight: 1.2, flex: 1, color: D.txt, margin: 0 }}>{dp.name}</h2>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900, color: ACCENT, flexShrink: 0 }}>₦{price.toLocaleString()}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2 }}>{[1,2,3,4,5].map(s => <FiStar key={s} size={12} color={ACCENT} fill={s <= Math.round(dp.rating) ? ACCENT : "none"} />)}</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: D.sub }}>{dp.rating.toFixed(1)} · {dp.category}</span>
          </div>
          {busy ? <div style={{ height: 12, borderRadius: 5, background: D.brd, marginBottom: 12, opacity: .5 }} /> : dp.description ? (<><p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".8px", color: D.sub, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><FiBox size={10} /> About this product</p><p style={{ fontSize: 14, lineHeight: 1.75, fontWeight: 500, color: D.txt, marginBottom: 16 }}>{dp.description}</p></>) : null}
          {dots.length > 0 && (<><p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".8px", color: D.sub, marginBottom: 10 }}>Key Highlights</p><div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>{dots.map((h, i) => (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, fontWeight: 600, color: D.txt }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, flexShrink: 0, marginTop: 5 }} />{h}</div>))}</div></>)}
          {dp.careInfo && <div style={{ background: "rgba(255,107,0,.07)", border: "1px solid rgba(255,107,0,.18)", borderRadius: 13, padding: "11px 14px", marginBottom: 16, fontSize: 12, fontWeight: 600, color: D.sub, lineHeight: 1.6 }}>Care Info: {dp.careInfo}</div>}
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".8px", color: D.sub, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><FiTruck size={11} /> Delivery & Package</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[{ icon: <FiClock size={10} />, label: "Delivery", val: vendor?.deliveryTime || "15–35 mins" }, { icon: <FiPackage size={10} />, label: "Package", val: dp.shipping?.sizeCategory ? SIZE_LBL[dp.shipping.sizeCategory] || dp.shipping.sizeCategory : "Standard" }, ...(dp.shipping?.weightKg ? [{ icon: <FiBox size={10} />, label: "Weight", val: `${dp.shipping.weightKg} kg` }] : [])].map((t, i) => (
              <div key={i} style={{ padding: 13, borderRadius: 14, border: `1.5px solid ${D.brd}`, background: D.card }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: D.sub, marginBottom: 5 }}>{t.icon} {t.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: D.txt }}>{t.val}</div>
              </div>
            ))}
          </div>
          {(vendor || dp.store) && (
            <>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".8px", color: D.sub, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}><MdStorefront size={12} /> Sold by</p>
              <div onClick={() => { if (dp.vendorId) { close(); navigate(`/store/${dp.vendorId}`); } }} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: 16, border: `1.5px solid ${D.brd}`, background: D.card, cursor: dp.vendorId ? "pointer" : "default", marginBottom: 8 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "white", background: `linear-gradient(135deg,${ACCENT},#FF8C00)` }}>
                  {vendor?.logo ? <img src={vendor.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (vendor?.name || dp.store)[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: D.txt }}>{vendor?.name || dp.store}</span>
                    {vendor?.verified && <RiVerifiedBadgeFill size={12} color="#3b82f6" />}
                  </div>
                  {vendor?.rating && <span style={{ fontSize: 11, fontWeight: 700, color: D.sub, display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}><FiStar size={9} fill={ACCENT} color={ACCENT} />{vendor.rating.toFixed(1)}</span>}
                </div>
                {dp.vendorId && <FiChevronRight size={13} color={D.sub} />}
              </div>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0 4px", fontSize: 11, fontWeight: 600, color: D.sub }}><FiShield size={10} color={ACCENT} /> Secured checkout · Fast delivery</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "15px 0 10px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: D.txt }}>Quantity</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,107,0,.1)", borderRadius: 13, padding: 4, border: "1.5px solid rgba(255,107,0,.2)" }}>
              <button disabled={qty <= 1} onClick={() => setQty(v => Math.max(1, v - 1))} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: ACCENT, cursor: qty <= 1 ? "not-allowed" : "pointer", opacity: qty <= 1 ? .35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}><FiMinus size={12} /></button>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, color: ACCENT, minWidth: 30, textAlign: "center" }}>{qty}</span>
              <button disabled={dp.stock != null && qty >= dp.stock} onClick={() => setQty(v => v + 1)} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: ACCENT, cursor: (dp.stock != null && qty >= dp.stock) ? "not-allowed" : "pointer", opacity: (dp.stock != null && qty >= dp.stock) ? .35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}><FiPlus size={12} /></button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: D.sub }}>{qty > 1 ? `${qty} × ₦${price.toLocaleString()}` : "Total"}</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: ACCENT }}>₦{(price * qty).toLocaleString()}</span>
          </div>
        </div>
        <div style={{ padding: "0 20px 34px", background: D.bg }}>
          <button disabled={!inStock} onClick={() => { onAdd(dp, qty); close(); }}
            style={{ width: "100%", padding: 16, borderRadius: 17, border: "none", cursor: inStock ? "pointer" : "not-allowed", background: inStock ? `linear-gradient(135deg,${ACCENT},#FF8C00)` : "#444", color: "white", fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: inStock ? "0 8px 28px rgba(255,107,0,.35)" : "none" }}>
            <FiShoppingCart size={16} />{inStock ? `Add ${qty > 1 ? qty + " to" : "to"} Cart` : "Out of Stock"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function PCard({ p, onBuy, onOpen }: { p: Product; onBuy: (p: Product) => void; onOpen: (p: Product) => void }) {
  const [fav, setFav] = useState(false);
  return (
    <div className="hp-pc" onClick={() => onOpen(p)}>
      <div className="hp-pi">{p.img ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><FiBox size={18} color="#444" /></div>}</div>
      <div className="hp-pb">
        <div className="hp-pn">{p.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3, minWidth: 0 }}><span className="hp-ps">{p.store}</span>{p.vendorVerified && <RiVerifiedBadgeFill size={11} color="#3b82f6" style={{ flexShrink: 0 }} />}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: ACCENT, fontWeight: 700, marginBottom: 5 }}><FiStar size={9} fill={ACCENT} color={ACCENT} />{p.rating.toFixed(1)}</div>
        <div style={{ marginTop: "auto" }}>
          <span style={{ color: ACCENT, fontWeight: 900, fontSize: 13, fontFamily: "'Syne',sans-serif", display: "block", marginBottom: 7, wordBreak: "break-word", lineHeight: 1.3 }}>₦{p.price}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="hp-fav" onClick={e => { e.stopPropagation(); setFav(v => !v); }}><FiHeart size={12} fill={fav ? ACCENT : "none"} color={fav ? ACCENT : "currentColor"} /></button>
            <button className="hp-buy" onClick={e => { e.stopPropagation(); onBuy(p); }} style={{ flex: 1 }}>Add to Cart</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Skel() {
  return (
    <div className="hp-pc" style={{ cursor: "default" }}>
      <div className="hp-pi sk" />
      <div className="hp-pb" style={{ gap: 6 }}>
        <div className="sk" style={{ height: 10, borderRadius: 5, width: "72%" }} />
        <div className="sk" style={{ height: 9, borderRadius: 5, width: "55%" }} />
        <div className="sk" style={{ height: 10, borderRadius: 5, width: "48%" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Homepage main component
// ─────────────────────────────────────────────────────────────────────────────
export default function Homepage() {
  const navigate = useNavigate();
  const { addToCart, cartCount } = useCart();

  const [user, setUser]           = useState(auth.currentUser);
  const [userName, setUserName]   = useState("");
  const [dark]                    = useState(() => { try { return localStorage.getItem("theme") !== "light"; } catch { return true; } });
  const [prods, setProds]         = useState<Product[]>([]);
  const [sections, setSections]   = useState<{ id: string; title: string; icon: React.ReactNode; items: Product[] }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [locLabel, setLocLabel]   = useState("Lagos, Nigeria");
  const [locModal, setLocModal]   = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [activeSvc, setActiveSvc] = useState(0);
  const [search, setSearch]       = useState("");
  const [showAllCats, setShowAllCats] = useState(false);
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const [sheetProd, setSheetProd] = useState<Product | null>(null);
  const [showPhoneAlert, setShowPhoneAlert] = useState(true);
  const { banner: maintenanceBanner, dismissed: bannerDismissed, dismiss: dismissBanner } = useMaintenanceBanner("customer");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u);
      if (u) {
        setUserName(u.displayName || u.email?.split("@")[0] || "User");
        getDoc(doc(db, "users", u.uid)).then(s => {
          if (!s.exists()) return;
          const addrs: Address[] = s.data().savedAddresses || [];
          setAddresses(addrs);
          const def = addrs.find(a => a.isDefault);
          if (def) setLocLabel(def.address.slice(0, 42) + (def.address.length > 42 ? "…" : ""));
        }).catch(() => {});
      }
    });
    return () => unsub();
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [raw, vend, vendorMap] = await Promise.all([fetchProds(), fetchVends(), fetchVendorMap()]);
      const hydrated = raw.map(p => {
        let verified = false; let storeName = p.store;
        if (p.vendorId && vendorMap[p.vendorId]) { verified = vendorMap[p.vendorId].verified; if (!storeName || storeName === "Store") storeName = vendorMap[p.vendorId].name; }
        else if (p.vendorName && vendorMap[`name:${p.vendorName}`]) { verified = vendorMap[`name:${p.vendorName}`].verified; if (!storeName || storeName === "Store") storeName = vendorMap[`name:${p.vendorName}`].name; }
        else if (p.store && vendorMap[`name:${p.store}`]) { verified = vendorMap[`name:${p.store}`].verified; }
        return { ...p, store: storeName, vendorVerified: verified };
      });
      const all = shuffle(hydrated);
      const grp: Record<string, Product[]> = {};
      for (const p of all) { grp[p.category] = grp[p.category] || []; grp[p.category].push(p); }
      const keys = Object.keys(grp).sort((a, b) => grp[b].length - grp[a].length);
      setSections(keys.map(k => ({ id: k, title: CAT[k]?.label || k, icon: CAT[k]?.icon || <FiPackage size={18} />, items: grp[k].slice(0, 20) })));
      setProds(all);
      setExtraCats(keys.filter(c => !FIXED.includes(c)).slice(0, 4));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addProd = useCallback(async (p: Product, qty = 1) => {
    let vLat: number | undefined, vLng: number | undefined;
    if (p.vendorId) { try { const s = await getDoc(doc(db, "vendors", p.vendorId)); if (s.exists()) { const d = s.data(); vLat = typeof d.lat === "number" ? d.lat : undefined; vLng = typeof d.lng === "number" ? d.lng : undefined; } } catch {} }
    if ((!vLat || !vLng) && p.vendorName) { try { for (const f of ["businessName", "storeName", "displayName"]) { const s = await getDocs(query(collection(db, "vendors"), where(f, "==", p.vendorName), limit(1))); if (!s.empty) { const d = s.docs[0].data(); vLat = typeof d.lat === "number" ? d.lat : undefined; vLng = typeof d.lng === "number" ? d.lng : undefined; break; } } } catch {} }
    for (let i = 0; i < qty; i++) addToCart({ name: p.name, price: `₦${p.price}`, img: p.img ?? FALLBACK, vendorName: p.vendorName, vendorId: p.vendorId || undefined, vendorLat: vLat, vendorLng: vLng });
  }, [addToCart]);

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();
  const allCats  = [...FIXED, ...extraCats];
  const filtered = search
    ? sections.map(s => ({ ...s, items: s.items.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.store.toLowerCase().includes(search.toLowerCase())) })).filter(s => s.items.length > 0)
    : sections;

  return (
    <div className="hp-root">

    {/* ── MAINTENANCE BANNER ── */}
   {maintenanceBanner?.active && !bannerDismissed && (
  <div style={{
    background: "linear-gradient(90deg,#7f1d1d,#991b1b)",
    color: "white",
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 700,
    position: "sticky", // or "fixed" for vendor/admin/rider
    top: 0,
    zIndex: 9999,
  }}>
    🔧
    <span style={{ flex: 1 }}>{maintenanceBanner.message}</span>
    <button
      onClick={dismissBanner}
      style={{
        background: "rgba(255,255,255,0.15)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: 8,
        color: "white",
        cursor: "pointer",
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      ✕ Dismiss
    </button>
  </div>
)}

      {locModal && (
        <MapPinSelector onClose={() => setLocModal(false)} onConfirm={async (lat, lng, addr, extra) => {
          setLocLabel(addr.slice(0, 45) + (addr.length > 45 ? "…" : ""));
          setLocModal(false);
          if (!auth.currentUser) return;
          const a: Address = { id: Date.now().toString(), label: "Home", address: addr, landmark: extra.landmark, extraClue: extra.extraClue, isDefault: false, lat, lng };
          const nl = [...addresses, a]; setAddresses(nl);
          await setDoc(doc(db, "users", auth.currentUser.uid), { savedAddresses: nl, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
        }} savedAddresses={addresses} />
      )}

      <DetailSheet product={sheetProd} onClose={() => setSheetProd(null)} onAdd={addProd} dark={dark} />

      {user && showPhoneAlert && (
        <PhoneVerifyBanner userId={user.uid} onClose={() => setShowPhoneAlert(false)} onNavigate={() => navigate("/profile")} />
      )}

      <div style={{ display: "flex", minHeight: "100vh" }}>
        <main className="hp-main">
          {/* Mobile top bar */}
          <div className="hp-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <img src={LOGO} alt="Swift9ja" style={{ width: 44, height: 44, objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  <span className="hp-logo">Swift<span className="hp-logo-9">9</span><span className="hp-logo-ja">ja</span></span>
            </div>
            <button className="hp-locpill" onClick={() => setLocModal(true)}>
              <FiMapPin size={11} color={ACCENT} /><span>{locLabel.slice(0, 26)}</span><FiChevronRight size={10} color="#666" />
            </button>
          </div>

          {/* Desktop header */}
          <div className="hp-dhdr">
            <div>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: "var(--ht)", margin: 0 }}>
                {user ? `${greeting}, ${userName.split(" ")[0]} 👋` : `${greeting}!`}
              </h1>
              <p style={{ fontSize: 14, color: "var(--hs)", fontWeight: 600, marginTop: 4 }}>
                {user ? "What are you ordering today?" : "Discover stores and order anything."}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="hp-locpill desk" onClick={() => setLocModal(true)}><FiMapPin size={13} color={ACCENT} /><span>{locLabel}</span></button>
              <button className="hp-cartdesk" onClick={() => navigate("/cart")}><FiShoppingCart size={16} /> Cart{cartCount > 0 && <span className="hp-bdgi">{cartCount}</span>}</button>
            </div>
          </div>

          {/* Search */}
          <div className="hp-srow">
            <div className="hp-sbar">
              <FiSearch size={15} color="#666" />
              <input className="hp-sinp" placeholder="Search products, stores…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", lineHeight: 1 }}>✕</button>}
            </div>
            <button className="hp-iconbtn" onClick={reload} title="Refresh">
              <FiRefreshCw size={14} style={loading ? { animation: "spin .8s linear infinite" } : {}} />
            </button>
          </div>

          {/* Stats */}
          {!search && (
            <div className="hp-stats">
              {[
                { icon: <FiTruck size={19} color="white" />, num: "15 min", lbl: "Avg delivery", hi: true },
                { icon: <MdLocalGroceryStore size={19} color={ACCENT} />, num: prods.length > 0 ? `${prods.length}+` : "500+", lbl: "Products" },
                { icon: <FiStar size={19} color={ACCENT} />, num: "4.9", lbl: "Rating" },
                { icon: <FiZap size={19} color={ACCENT} />, num: "24/7", lbl: "Available" },
              ].map((s, i) => (
                <div key={i} className={`hp-stat${s.hi ? " hi" : ""}`}>
                  {s.icon}
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: s.hi ? "white" : "var(--ht)" }}>{s.num}</span>
                  <span style={{ fontSize: 10, color: s.hi ? "rgba(255,255,255,.7)" : "var(--hdim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" }}>{s.lbl}</span>
                </div>
              ))}
            </div>
          )}

          {/* Service pills */}
          {!search && (
            <div className="hp-svcs">
              {SVCS.map((s, i) => (
                <button key={i} className={`hp-svc${activeSvc === i ? " on" : ""}`} onClick={() => { setActiveSvc(i); if (s.path) navigate(s.path); }}>
                  {s.icon}<span>{s.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Categories */}
          {!search && (
            <>
              <div className="hp-slbl">
                <span>Browse Categories</span>
                <button className="hp-seeall" onClick={() => setShowAllCats(v => !v)}>{showAllCats ? "Show less" : "See all"}</button>
              </div>
              <div className="hp-catgrid">
                {(showAllCats ? allCats : FIXED).map(id => {
                  const info = CAT[id] || CAT.other;
                  return (
                    <button key={id} className="hp-catcard" onClick={() => id === "sendpickup" ? navigate("/send-pickup") : navigate(`/category/${id}`)}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{info.icon}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1.2 }}>{info.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

       

          {/* ₦25k Trending Ads — label "Trending" */}
           {!search && (
  <div style={{ marginTop: 24 }}>
    <HomepageTrendingAds dark={dark} />
  </div>
)}
          {/* Daily Essentials */}
          {!search && (
            <>
              <div className="hp-slbl"><span>Daily Essentials</span></div>
              <div className="hp-essgrid">
                {ESS.map((e, i) => (
                  <div key={i} className={`hp-ess${i === 0 || i === 3 ? " wide" : ""}`}>
                    <img src={e.img} alt={e.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top,rgba(0,0,0,.72) 0%,transparent 100%)", color: "white", fontWeight: 800, fontSize: 11, padding: "14px 9px 7px", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: ACCENT }}>{e.icon}</span>{e.label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

         {loading && !search ? (
  <>
    <div className="hp-slbl"><span>Loading products…</span></div>
    <div className="hp-hscr">{[1, 2, 3, 4].map(i => <Skel key={i} />)}</div>
  </>
) : filtered.length === 0 ? (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 20px", color: "var(--hs)", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
    <FiPackage size={40} color="#444" />
    <p>{search ? "No products match your search" : "Vendors are setting up. Check back soon!"}</p>
  </div>
) : (
  filtered.map((sec, secIdx) => (
    <div key={sec.id}>
      <div className="hp-slbl">
        <span style={{ color: ACCENT, display: "flex", alignItems: "center" }}>{sec.icon}</span>
        <span>{sec.title}</span>
        <button className="hp-seeall" onClick={() => sec.id === "sendpickup" ? navigate("/send-pickup") : navigate(`/category/${sec.id}`)}>See all →</button>
      </div>
      <div className="hp-hscr">
        {sec.items.map((p, i) => <PCard key={p.id || i} p={p} onBuy={p => addProd(p)} onOpen={p => setSheetProd(p)} />)}
      </div>

      {secIdx % 2 === 1 && (
  <div style={{ marginTop: 20, marginBottom: 8 }}>
    <HomepageBannerAds onVendorClick={vid => navigate(`/store/${vid}`)} />
  </div>
)}
    </div>
  ))
)}

          <div style={{ height: 80 }} />
        </main>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
:root{--hbg:#0a0a0d;--hsurf:#111115;--hcard:#16161b;--hbrd:#1e1e26;--ht:#e8e8f0;--hs:#8888a0;--hdim:#44445a;--hinp:#1a1a22;--hinpbd:#252530;}
[data-theme="light"]{--hbg:#f0f0f5;--hsurf:#ffffff;--hcard:#ffffff;--hbrd:#e0e0e8;--ht:#111118;--hs:#555570;--hdim:#aaaabc;--hinp:#f5f5fa;--hinpbd:#dddde8;}
body{background:var(--hbg);color:var(--ht);}
.hp-root{min-height:100vh;background:var(--hbg);font-family:'Nunito',sans-serif;padding-bottom:90px;}
.hp-main{flex:1;min-width:0;width:100%;background:var(--hbg);}
.phone-alert-banner{display:flex;align-items:center;gap:10px;padding:11px 16px;background:rgba(255,107,0,.10);border-bottom:1.5px solid rgba(255,107,0,.25);position:sticky;top:0;z-index:200;backdrop-filter:blur(10px);animation:banner-in .35s ease both;}
@keyframes banner-in{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}
.phone-alert-link{background:none;border:none;color:#FF6B00;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;text-decoration:underline;text-underline-offset:2px;flex-shrink:0;padding:0;white-space:nowrap;}
.phone-alert-close{background:none;border:none;color:var(--hs);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:4px;border-radius:6px;transition:color .2s,background .2s;}
.hp-logo{font-family:'Syne',sans-serif;font-size:20px;font-weight:900;color:var(--ht);letter-spacing:-.3px;display:flex;align-items:flex-end;line-height:1;}
.hp-logo .hp-logo-9{color:#FF6B00;font-style:italic;font-size:28px;line-height:.85;display:inline-block;margin-right:2px;}
.hp-logo .hp-logo-ja{color:var(--ht);font-style:normal;font-size:19px;font-family:'Nunito',sans-serif;font-weight:900;line-height:1;display:inline-block;vertical-align:bottom;margin-bottom:0px;}
.hp-topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:var(--hsurf);border-bottom:1px solid var(--hbrd);gap:12px;}
@media(min-width:768px){.hp-topbar{display:none;}}
.hp-dhdr{display:none;align-items:center;justify-content:space-between;padding:32px 48px 0;gap:24px;}
@media(min-width:768px){.hp-dhdr{display:flex;}}
.hp-locpill{display:flex;align-items:center;gap:6px;background:var(--hcard);border:1px solid var(--hbrd);border-radius:10px;padding:6px 11px;font-size:12px;color:var(--hs);font-weight:600;cursor:pointer;font-family:'Nunito',sans-serif;flex:1;max-width:210px;min-width:0;}
.hp-locpill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;}
.hp-locpill.desk{padding:10px 20px;font-size:13px;border-radius:50px;border:1.5px solid var(--hbrd);transition:border-color .2s;max-width:360px;flex:1;}
.hp-cartdesk{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border:none;border-radius:12px;padding:10px 18px;color:white;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;position:relative;box-shadow:0 4px 16px rgba(255,107,0,.35);transition:transform .2s;}
.hp-bdgi{background:white;color:#FF6B00;border-radius:20px;font-size:10px;font-weight:900;padding:1px 6px;min-width:18px;text-align:center;}
.hp-iconbtn{width:38px;height:38px;background:var(--hcard);border:1px solid var(--hbrd);border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--hs);transition:border-color .2s;}
.hp-srow{display:flex;gap:10px;padding:16px 18px 0;}
@media(min-width:768px){.hp-srow{padding:22px 48px 0;}}
.hp-sbar{flex:1;display:flex;align-items:center;gap:9px;background:var(--hsurf);border:1.5px solid var(--hbrd);border-radius:13px;padding:13px 18px;transition:border-color .2s;}
.hp-sbar:focus-within{border-color:#FF6B00;}
.hp-sinp{flex:1;background:transparent;border:none;outline:none;color:var(--ht);font-family:'Nunito',sans-serif;font-size:14px;font-weight:600;}
.hp-sinp::placeholder{color:var(--hdim);}
@keyframes spin{to{transform:rotate(360deg)}}
.hp-stats{display:none;gap:14px;padding:22px 48px 0;}
@media(min-width:768px){.hp-stats{display:grid;grid-template-columns:repeat(4,1fr);}}
.hp-stat{background:var(--hsurf);border:1px solid var(--hbrd);border-radius:18px;padding:22px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;transition:border-color .2s;}
.hp-stat.hi{background:linear-gradient(135deg,#FF6B00,#FF8C00);border-color:transparent;}
.hp-svcs{display:flex;gap:8px;padding:14px 18px 0;overflow-x:auto;scrollbar-width:none;}
.hp-svcs::-webkit-scrollbar{display:none;}
@media(min-width:768px){.hp-svcs{padding:18px 48px 0;gap:10px;}}
.hp-svc{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:30px;border:1.5px solid var(--hbrd);background:transparent;color:var(--hs);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .2s;font-family:'Nunito',sans-serif;flex-shrink:0;}
.hp-svc.on{background:#FF6B00;border-color:#FF6B00;color:white;}
.hp-slbl{display:flex;align-items:center;gap:8px;padding:18px 18px 10px;font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--ht);}
@media(min-width:768px){.hp-slbl{padding:24px 48px 12px;font-size:22px;}}
.hp-seeall{margin-left:auto;color:#FF6B00;font-size:12px;font-weight:700;background:none;border:none;cursor:pointer;font-family:'Nunito',sans-serif;padding:5px 12px;border-radius:8px;transition:background .15s;flex-shrink:0;}
.hp-catgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 18px;}
@media(min-width:540px){.hp-catgrid{grid-template-columns:repeat(4,1fr);}}
@media(min-width:768px){.hp-catgrid{grid-template-columns:repeat(6,1fr);padding:0 48px;gap:16px;}}
.hp-catcard{background:linear-gradient(135deg,#FF6B00,#FF8C00);border:none;border-radius:15px;padding:16px 8px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s;color:white;text-align:center;}
.hp-catcard:hover{filter:brightness(1.14);transform:translateY(-3px);box-shadow:0 10px 26px rgba(255,107,0,.4);}
.hp-catcard:active{transform:scale(.95);}
.hp-hscr{display:flex;gap:11px;padding:0 18px 4px;overflow-x:auto;scrollbar-width:none;}
.hp-hscr::-webkit-scrollbar{display:none;}
@media(min-width:768px){.hp-hscr{padding:0 48px 8px;gap:18px;}}
.hp-essgrid{display:grid;grid-template-columns:1fr 1fr 64px;grid-template-rows:95px 95px;gap:7px;padding:0 18px;}
@media(min-width:768px){.hp-essgrid{grid-template-columns:repeat(5,1fr);grid-template-rows:170px;padding:0 48px;gap:16px;}.hp-ess.wide{grid-column:span 1!important;}}
.hp-ess{border-radius:13px;overflow:hidden;position:relative;cursor:pointer;}
.hp-ess.wide{grid-column:span 2;}
.hp-pc{flex-shrink:0;width:162px;background:var(--hcard);border:1.5px solid var(--hbrd);border-radius:15px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:border-color .2s,transform .18s;}
@media(min-width:768px){.hp-pc{width:200px;}}
.hp-pc:hover{border-color:rgba(255,107,0,.45);transform:translateY(-2px);}
.hp-pi{height:110px;overflow:hidden;background:var(--hcard);}
@media(min-width:768px){.hp-pi{height:140px;}}
.hp-pb{padding:9px;display:flex;flex-direction:column;gap:3px;flex:1;}
@media(min-width:768px){.hp-pb{padding:12px;}}
.hp-pn{color:var(--ht);font-weight:800;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hp-ps{color:var(--hdim);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}
.hp-buy{padding:6px 0;border-radius:8px;background:#FF6B00;border:none;color:white;font-family:'Nunito',sans-serif;font-size:10px;font-weight:800;cursor:pointer;transition:transform .15s,box-shadow .15s;white-space:nowrap;text-align:center;}
.hp-buy:hover{box-shadow:0 4px 12px rgba(255,107,0,.4);transform:scale(1.04);}
.hp-fav{width:30px;height:30px;border-radius:8px;border:1.5px solid var(--hbrd);background:var(--hsurf);color:var(--hs);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:border-color .2s,color .2s;}
.sk{background:linear-gradient(90deg,var(--hcard) 25%,var(--hbrd) 50%,var(--hcard) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes sn-bk{from{opacity:0}to{opacity:1}}
@keyframes sn-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes sn-dn{from{transform:translateY(0)}to{transform:translateY(100%)}}
`;