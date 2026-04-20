// pages/SearchPage.tsx — UPDATED
// Changes:
//  1. Explore categories use new CATEGORY_TREE (13 real categories)
//  2. Send & Pickup removed from Explore grid — it's a service
//  3. normCat/fuzzy search updated to new keys

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChangeEvent } from "react";
import { collection, getDocs, doc, setDoc, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import { useCart } from "../context/Cartcontext";
import {
  FiSearch, FiX, FiClock, FiStar, FiShoppingCart,
  FiHeart, FiMapPin, FiCheckCircle, FiTrendingUp, FiTrash2,
  FiZap, FiPackage, FiGrid, FiAlertCircle, FiChevronRight,
  FiDroplet,
} from "react-icons/fi";
import { RiStore2Line, RiVerifiedBadgeFill, RiDrinks2Line, RiLeafLine } from "react-icons/ri";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore, MdStorefront, MdDirectionsBike,
} from "react-icons/md";
import type { AdPromotion } from "../../adTypes";
import { buildSearchTrendingSlots } from "../../adTypes";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FirestoreItem {
  id: string; _col: "products" | "vendors"; _score?: number; _boosted?: boolean;
  name?: string; businessName?: string; img?: string; logo?: string; coverImage?: string;
  category?: string; description?: string; location?: string;
  rating?: number | string; price?: number | string;
  vendorId?: string; vendorName?: string;
  approved?: boolean; verified?: boolean;
  [key: string]: unknown;
}
interface SafeQueryResult { safe: boolean; value: string; attempts: number; }
type AdProduct = { id: string; name: string; price?: string | number; img?: string | null; vendorId?: string; vendorName?: string; };

// ─── Security ─────────────────────────────────────────────────────────────────
const INJ: RegExp[] = [
  /<script[\s\S]*?>/gi, /<\/script>/gi, /javascript:/gi, /on\w+\s*=/gi, /eval\s*\(/gi,
  /document\./gi, /window\./gi, /\bSELECT\b.*\bFROM\b/gi, /\bINSERT\s+INTO\b/gi,
  /\bDROP\s+TABLE\b/gi, /\bDELETE\s+FROM\b/gi, /\bUPDATE\b.*\bSET\b/gi,
  /\bUNION\b.*\bSELECT\b/gi, /--\s*$/gm, /;\s*DROP/gi,
  /\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/gi, /\balert\s*\(/gi,
  /\bfetch\s*\(/gi, /\bxmlhttprequest\b/gi, /base64/gi, /atob\s*\(/gi, /fromcharcode/gi,
];
let hackN = 0;
const san = (s: string) =>
  s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
   .replace(/"/g,"&quot;").replace(/'/g,"&#x27;").replace(/\//g,"&#x2F;");
const chkInj = (s: string) => INJ.some(p => { p.lastIndex = 0; return p.test(s); });
const sq = (raw: string): SafeQueryResult => {
  if (chkInj(raw)) { hackN++; return { safe: false, value: "", attempts: hackN }; }
  return { safe: true, value: san(raw).toLowerCase(), attempts: hackN };
};

// ─── Fuzzy search ─────────────────────────────────────────────────────────────
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
function fscore(q: string, item: FirestoreItem): number {
  const words = q.split(" ").filter(Boolean);
  const txt = [item.businessName ?? item.name ?? "", item.category, item.description, item.location]
    .filter(Boolean).join(" ").toLowerCase();
  let s = 0;
  if (txt.includes(q)) s += 100;
  for (const w of words) {
    if (txt.includes(w)) s += 50;
    for (const t of txt.split(/\s+/)) {
      const sim = 1 - lev(w, t) / Math.max(w.length, t.length, 1);
      if (sim > 0.6) s += Math.round(sim * 30);
    }
  }
  return s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeImg = (u?: string): string | null =>
  !u || u.includes("supabase.co") ? null : u;

const catColor = (c?: string): string => {
  const s = (c ?? "").toLowerCase();
  if (s.includes("food") || s.includes("restaurant") || s.includes("fastfood")) return "#FF6B00";
  if (s.includes("grocery") || s.includes("groceries") || s.includes("fresh")) return "#22c55e";
  if (s.includes("pharmacy") || s.includes("health") || s.includes("drug"))    return "#a78bfa";
  if (s.includes("fashion") || s.includes("boutique") || s.includes("cloth"))  return "#ec4899";
  if (s.includes("drink"))    return "#06B6D4";
  if (s.includes("beauty"))   return "#F472B6";
  if (s.includes("skincare")) return "#EC4899";
  if (s.includes("electronics")) return "#6366F1";
  return "#3b82f6";
};
const fmtPrice = (p?: number | string): string | null =>
  p == null ? null : typeof p === "number" ? `₦${p.toLocaleString()}` : String(p);
const isVerified = (item: FirestoreItem) =>
  item.approved === true || item.verified === true;

// ─── Firebase history ─────────────────────────────────────────────────────────
const MAX_H = 10;
const saveH = async (h: string[]) => {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await setDoc(doc(db, "searchHistory", u.uid), { history: h, updatedAt: new Date() }, { merge: true });
  } catch {}
};

// ─── Typed placeholder ────────────────────────────────────────────────────────
const PHS = [
  "Search jollof rice near you…", "Find a pharmacy open now…",
  "Order groceries fast…", "Discover fashion boutiques…",
  "Search cold drinks…", "Find fast food nearby…",
];
function useTyped() {
  const [txt, setTxt] = useState("");
  const [pi,  setPi]  = useState(0);
  const [ci,  setCi]  = useState(0);
  const [fwd, setFwd] = useState(true);
  useEffect(() => {
    const cur = PHS[pi];
    if (fwd) {
      if (ci < cur.length) { const t = setTimeout(() => { setTxt(cur.slice(0, ci + 1)); setCi(c => c + 1); }, 55); return () => clearTimeout(t); }
      else { const t = setTimeout(() => setFwd(false), 2200); return () => clearTimeout(t); }
    } else {
      if (ci > 0) { const t = setTimeout(() => { setTxt(cur.slice(0, ci - 1)); setCi(c => c - 1); }, 28); return () => clearTimeout(t); }
      else { setPi(i => (i + 1) % PHS.length); setFwd(true); }
    }
  }, [fwd, ci, pi]);
  return txt;
}

// ─── Explore categories — 13 real categories, no sendpickup ──────────────────
const EXPLORE_CATS = [
  { label: "Restaurants",      color: "#FF6B00", bg: "rgba(255,107,0,0.1)",   icon: <MdRestaurant size={20} />,       path: "/category/restaurants"  },
  { label: "Fast Food",        color: "#FB923C", bg: "rgba(251,146,60,0.1)",  icon: <MdRestaurant size={20} />,       path: "/category/fastfood"     },
  { label: "Groceries",        color: "#22c55e", bg: "rgba(34,197,94,0.1)",   icon: <RiLeafLine size={20} />,         path: "/category/groceries"    },
  { label: "Pharmacy",         color: "#a78bfa", bg: "rgba(167,139,250,0.1)", icon: <MdLocalPharmacy size={20} />,    path: "/category/pharmacy"     },
  { label: "Fashion",          color: "#ec4899", bg: "rgba(236,72,153,0.1)",  icon: <MdStorefront size={20} />,       path: "/category/fashion"      },
  { label: "Beauty",           color: "#F472B6", bg: "rgba(244,114,182,0.1)", icon: <FiGrid size={20} />,             path: "/category/beauty"       },
  { label: "Skincare",         color: "#EC4899", bg: "rgba(236,72,153,0.08)", icon: <FiDroplet size={20} />,          path: "/category/skincare"     },
  { label: "Drinks",           color: "#06B6D4", bg: "rgba(6,182,212,0.1)",   icon: <RiDrinks2Line size={20} />,      path: "/category/drinks"       },
  { label: "Electronics",      color: "#6366F1", bg: "rgba(99,102,241,0.1)",  icon: <FiZap size={20} />,              path: "/category/electronics"  },
  { label: "Health & Wellness",color: "#14B8A6", bg: "rgba(20,184,166,0.1)",  icon: <FiPackage size={20} />,          path: "/category/health"       },
  { label: "Supermarket",      color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  icon: <MdLocalGroceryStore size={20} />,path: "/category/supermarket"  },
  { label: "Boutique",         color: "#8B5CF6", bg: "rgba(139,92,246,0.1)",  icon: <MdStorefront size={20} />,       path: "/category/boutique"     },
  { label: "Perfumes",         color: "#A78BFA", bg: "rgba(167,139,250,0.08)",icon: <FiDroplet size={20} />,          path: "/category/perfumes"     },
  // Send & Pickup is a SERVICE — shown as a separate shortcut
  { label: "Send & Pickup",    color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  icon: <MdDirectionsBike size={20} />,   path: "/send-pickup"           },
];

// ─── HackWall ─────────────────────────────────────────────────────────────────
function HackWall({ n, onDismiss, dark }: { n: number; onDismiss: () => void; dark: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", background: dark ? "#0f0f0f" : "#fff", border: "1px solid #FF6B00", borderRadius: 24, padding: "36px 24px", textAlign: "center", boxShadow: "0 0 60px rgba(255,107,0,0.18)" }}>
        <FiAlertCircle size={48} color="#FF6B00" style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: "#FF6B00", marginBottom: 12 }}>Attack Blocked #{n}</div>
        <p style={{ fontSize: 13, color: "#888", lineHeight: 1.8, marginBottom: 24 }}>Someone sacrificed to build this platform. Please choose to create, not destroy.</p>
        <button onClick={onDismiss} style={{ background: "#FF6B00", color: "#fff", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%", fontFamily: "'DM Sans',sans-serif" }}>
          I understand — take me back
        </button>
      </div>
    </div>
  );
}

// ─── Ad Trending Card ─────────────────────────────────────────────────────────
function AdTrendCard({ item, dark }: { item: AdProduct; dark: boolean }) {
  const [liked, setLiked]   = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [added, setAdded]   = useState(false);
  const { addToCart } = useCart();
  const A = "#FF6B00";
  return (
    <div style={{ background: dark ? "#13131a" : "#fff", border: `1px solid ${dark ? "#1e1e2c" : "#e8e8f4"}`, borderRadius: 22, overflow: "hidden", cursor: "pointer", flexShrink: 0, width: 172, transition: "transform .22s,box-shadow .22s" }}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(-5px)"; d.style.boxShadow = "0 16px 40px rgba(255,107,0,0.16)"; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(0)"; d.style.boxShadow = "none"; }}>
      <div style={{ height: 128, background: "rgba(255,107,0,0.06)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {item.img && !imgErr ? <img src={item.img} alt={item.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ color: dark ? "#333" : "#ccc" }}><FiPackage size={26} /></div>}
        <div style={{ position: "absolute", top: 7, left: 7, padding: "2px 7px", borderRadius: 6, background: `${A}dd`, fontSize: 9, fontWeight: 800, color: "#fff" }}>AD</div>
        <button onClick={e => { e.stopPropagation(); setLiked(l => !l); }} style={{ position: "absolute", top: 7, right: 7, background: dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <FiHeart size={12} color={liked ? "#ef4444" : "#888"} fill={liked ? "#ef4444" : "none"} />
        </button>
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, color: dark ? "#efeffa" : "#111", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        {item.vendorName && <div style={{ fontSize: 10, color: dark ? "#555" : "#999", marginBottom: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.vendorName}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, color: A }}>₦{String(item.price || 0)}</span>
          <button onClick={e => { e.stopPropagation(); addToCart({ name: item.name, price: `₦${item.price || 0}`, img: item.img || "", vendorName: item.vendorName, vendorId: item.vendorId }); setAdded(true); setTimeout(() => setAdded(false), 1200); }}
            style={{ background: added ? "#22c55e" : A, color: "#fff", border: "none", borderRadius: 9, padding: "6px 10px", fontSize: 10, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "background .2s" }}>
            <FiShoppingCart size={10} /> {added ? "Added!" : "Buy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Search Trending Ads (₦20k) ───────────────────────────────────────────────
function SearchTrendingAds({ dark }: { dark: boolean }) {
  const [promos,   setPromos]   = useState<AdPromotion[]>([]);
  const [products, setProducts] = useState<AdProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const A = "#FF6B00";

  useEffect(() => {
    const now = new Date().toISOString();
    return onSnapshot(
      query(collection(db, "adPromotions"), where("type", "==", "search_trending"), where("status", "in", ["active", "expiring_soon"])),
      snap => {
        const ads = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdPromotion)).filter(a => a.endDate > now && a.selectedProducts.length > 0);
        setPromos(ads);
      }
    );
  }, []);

  const reshuffle = useCallback(async () => {
    setLoading(true);
    const slots = buildSearchTrendingSlots(promos);
    if (slots.length > 0) {
      try {
        const results: AdProduct[] = [];
        for (let i = 0; i < slots.length; i += 30) {
          const batch = slots.slice(i, i + 30);
          const snap = await getDocs(query(collection(db, "products"), where("__name__", "in", batch)));
          snap.forEach(d => {
            const data = d.data();
            const img = [data.images?.[0], data.image, data.img].find((u: any) => u && !u.includes("supabase")) ?? null;
            results.push({ id: d.id, name: data.name || "Product", price: data.price, img, vendorId: data.vendorId, vendorName: data.vendorName || data.businessName || data.storeName });
          });
        }
        setProducts(slots.map(id => results.find(p => p.id === id)).filter(Boolean) as AdProduct[]);
      } catch { setProducts([]); }
    } else { setProducts([]); }
    setLoading(false);
  }, [promos]);

  useEffect(() => { reshuffle(); }, [reshuffle]);

  if (!loading && products.length === 0) return null;

  const col = { txt: dark ? "#eeeef8" : "#111118", sub: dark ? "#66668a" : "#7777a2" };
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: col.txt }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><FiTrendingUp size={13} color={A} /></div>
          Trending Now
        </div>
        <span style={{ fontSize: 12, color: col.sub, fontWeight: 600 }}>Sponsored</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ flexShrink: 0, width: 172, height: 200, borderRadius: 22, background: dark ? "#13131a" : "#f4f4fb", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,transparent,${dark ? "#1a1a24" : "#ebebf8"},transparent)`, animation: "shimmer 1.4s infinite" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="tr-sc">
          {products.map((p, i) => <AdTrendCard key={p.id + i} item={p} dark={dark} />)}
        </div>
      )}
    </div>
  );
}

// ─── Organic Trend Card ───────────────────────────────────────────────────────
function TrendCard({ item, dark }: { item: FirestoreItem; dark: boolean }) {
  const [liked, setLiked] = useState(false);
  const [err, setErr]     = useState(false);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();
  const src   = safeImg(item.img as string | undefined);
  const price = fmtPrice(item.price as number | string | undefined);
  const isV   = isVerified(item);
  const A = "#FF6B00";
  return (
    <div style={{ background: dark ? "#13131a" : "#fff", border: `1px solid ${dark ? "#1e1e2c" : "#e8e8f4"}`, borderRadius: 22, overflow: "hidden", transition: "transform .22s,box-shadow .22s", cursor: "pointer", flexShrink: 0, width: 196 }}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(-5px)"; d.style.boxShadow = "0 20px 44px rgba(255,107,0,0.18)"; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(0)"; d.style.boxShadow = "none"; }}>
      <div style={{ height: 148, background: "rgba(255,107,0,0.07)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src && !err ? <img src={src} alt={item.name ?? "item"} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ color: dark ? "#333" : "#ccc" }}><FiPackage size={30} /></div>}
        <button onClick={e => { e.stopPropagation(); setLiked(l => !l); }} style={{ position: "absolute", top: 10, right: 10, background: dark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <FiHeart size={14} color={liked ? "#ef4444" : "#888"} fill={liked ? "#ef4444" : "none"} />
        </button>
        {item.category && <div style={{ position: "absolute", bottom: 10, left: 10, background: `${A}ee`, borderRadius: 8, padding: "3px 9px", fontSize: 9, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: .4 }}>{item.category}</div>}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: dark ? "#efeffa" : "#111", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name ?? "—"}</div>
        {item.vendorName && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: dark ? "#555" : "#999", fontWeight: 600 }}>{item.vendorName}</span>
            {isV && <RiVerifiedBadgeFill size={12} color="#3b82f6" />}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: A }}>{price ?? "—"}</span>
          <button onClick={e => { e.stopPropagation(); addToCart({ name: item.name ?? "Item", price: price ?? "₦0", img: src ?? "", vendorName: item.vendorName as string | undefined, vendorVerified: isV }); setAdded(true); setTimeout(() => setAdded(false), 1200); }}
            style={{ background: added ? "#22c55e" : A, color: "#fff", border: "none", borderRadius: 10, padding: "7px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "background .2s" }}>
            <FiShoppingCart size={12} /> {added ? "Added!" : "Buy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product result card ──────────────────────────────────────────────────────
function ProductCard({ item, dark, boosted }: { item: FirestoreItem; dark: boolean; boosted?: boolean }) {
  const [liked, setLiked] = useState(false);
  const [err, setErr]     = useState(false);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();
  const color = catColor(item.category);
  const src   = safeImg(item.img as string | undefined);
  const isV   = isVerified(item);
  return (
    <div style={{ background: dark ? "#13131a" : "#fff", borderRadius: 18, border: `1.5px solid ${boosted ? "#FF6B00" : dark ? "#1e1e2c" : "#e8e8f4"}`, overflow: "hidden", display: "flex", alignItems: "stretch", transition: "border-color .2s,transform .15s,box-shadow .2s", cursor: "pointer", position: "relative" }}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = color; d.style.transform = "translateY(-2px)"; d.style.boxShadow = `0 8px 28px ${color}1a`; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = boosted ? "#FF6B00" : dark ? "#1e1e2c" : "#e8e8f4"; d.style.transform = "translateY(0)"; d.style.boxShadow = "none"; }}>
      {boosted && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#FF6B00,#FF8C00)" }} />}
      <div style={{ width: 90, minWidth: 90, flexShrink: 0, background: `${color}10`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {src && !err ? <img src={src} alt={item.name ?? "product"} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ color: dark ? "#333" : "#ccc" }}><FiPackage size={22} /></div>}
      </div>
      <div style={{ flex: 1, padding: "13px 14px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: dark ? "#efeffa" : "#111", lineHeight: 1.25, marginBottom: 2 }}>
              {item.name}
              {boosted && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: "rgba(255,107,0,0.12)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.2)" }}>AD</span>}
            </div>
            {item.vendorName && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: dark ? "#555" : "#999", fontWeight: 600 }}>{item.vendorName}</span>
                {isV && <RiVerifiedBadgeFill size={12} color="#3b82f6" />}
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); setLiked(l => !l); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 2 }}>
            <FiHeart size={14} color={liked ? "#ef4444" : "#555"} fill={liked ? "#ef4444" : "none"} />
          </button>
        </div>
        {item.category && <span style={{ display: "inline-block", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${color}12`, color, border: `1px solid ${color}22`, textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>{item.category}</span>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {item.rating && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><FiStar size={11} />{item.rating as string}</span>}
            {item.location && <span style={{ fontSize: 11, color: dark ? "#555" : "#aaa", display: "flex", alignItems: "center", gap: 3 }}><FiMapPin size={10} />{item.location}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {fmtPrice(item.price as number | string) && <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: dark ? "#fff" : "#111" }}>{fmtPrice(item.price as number | string)}</span>}
            <button onClick={e => { e.stopPropagation(); addToCart({ name: item.name ?? "Item", price: fmtPrice(item.price as number | string) ?? "₦0", img: src ?? "", vendorName: item.vendorName as string | undefined, vendorVerified: isV }); setAdded(true); setTimeout(() => setAdded(false), 1200); }}
              style={{ background: added ? "#22c55e" : "#FF6B00", border: "none", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, transition: "background .2s" }}>
              <FiShoppingCart size={12} /> {added ? "Added!" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vendor Card ──────────────────────────────────────────────────────────────
function VendorCard({ item, dark }: { item: FirestoreItem; dark: boolean }) {
  const [err, setErr] = useState(false);
  const src  = safeImg((item.logo ?? item.coverImage ?? item.img) as string | undefined);
  const name = item.businessName ?? item.name ?? "Unnamed Vendor";
  const isV  = isVerified(item);
  return (
    <div style={{ background: dark ? "#13131a" : "#fff", borderRadius: 18, border: `1px solid ${isV ? "rgba(59,130,246,0.28)" : (dark ? "#1e1e2c" : "#e8e8f4")}`, overflow: "hidden", transition: "border-color .2s,transform .15s,box-shadow .2s", cursor: "pointer" }}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "#3b82f6"; d.style.transform = "translateY(-3px)"; d.style.boxShadow = "0 12px 32px rgba(59,130,246,0.14)"; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = isV ? "rgba(59,130,246,0.28)" : (dark ? "#1e1e2c" : "#e8e8f4"); d.style.transform = "translateY(0)"; d.style.boxShadow = "none"; }}>
      <div style={{ height: 86, background: "rgba(59,130,246,0.06)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6", position: "relative" }}>
        {src && !err ? <img src={src} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <RiStore2Line size={30} />}
        {isV && <div style={{ position: "absolute", top: 8, right: 8, background: "#1d4ed8", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}><FiCheckCircle size={12} color="#fff" /></div>}
      </div>
      <div style={{ padding: "11px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: dark ? "#efeffa" : "#111", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          {isV && <div style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(59,130,246,0.09)", border: "1px solid rgba(59,130,246,0.22)", borderRadius: 20, padding: "2px 6px", flexShrink: 0 }}><RiVerifiedBadgeFill size={10} color="#3b82f6" /><span style={{ fontSize: 8, fontWeight: 800, color: "#3b82f6", letterSpacing: .4 }}>VERIFIED</span></div>}
        </div>
        {item.category && <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600, marginBottom: 3 }}>{item.category}</div>}
        {item.location && <div style={{ fontSize: 11, color: dark ? "#555" : "#aaa", display: "flex", alignItems: "center", gap: 3 }}><FiMapPin size={10} />{item.location}</div>}
        {item.rating && <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, display: "flex", alignItems: "center", gap: 3, marginTop: 4 }}><FiStar size={11} />{item.rating as string}</div>}
      </div>
    </div>
  );
}

function Skeleton({ dark }: { dark: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: dark ? "#13131a" : "#f4f4fb", borderRadius: 18, height: 94, border: `1px solid ${dark ? "#1e1e2c" : "#eee"}`, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,transparent,${dark ? "#1a1a24" : "#ebebf8"},transparent)`, animation: "shimmer 1.4s infinite" }} />
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ label, icon, dark }: { label: string; icon?: React.ReactNode; dark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: dark ? "#efeffa" : "#111118" }}>
      {icon}{label}
    </div>
  );
}

const FTABS = [
  { id: "all",      label: "All",      icon: <FiGrid size={13} /> },
  { id: "products", label: "Products", icon: <FiPackage size={13} /> },
  { id: "vendors",  label: "Vendors",  icon: <RiStore2Line size={13} /> },
];

// ─── Main SearchPage ──────────────────────────────────────────────────────────
export default function SearchPage() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const A = "#FF6B00";
  const c = {
    bg:   dark ? "#0a0a0e" : "#f2f2fa",
    surf: dark ? "#13131a" : "#ffffff",
    brd:  dark ? "#1e1e2c" : "#e0e0ee",
    txt:  dark ? "#eeeef8" : "#111118",
    sub:  dark ? "#66668a" : "#7777a2",
    dim:  dark ? "#30304a" : "#c0c0d8",
    inp:  dark ? "#16161f" : "#f7f7ff",
    inpB: dark ? "#26263a" : "#d4d4ee",
  };

  const [queryStr, setQueryStr]               = useState("");
  const [results, setResults]                 = useState<FirestoreItem[]>([]);
  const [tab, setTab]                         = useState("all");
  const [hist, setHist]                       = useState<string[]>([]);
  const [organicTrending, setOrganicTrending] = useState<FirestoreItem[]>([]);
  const [allData, setAllData]                 = useState<{ products: FirestoreItem[]; vendors: FirestoreItem[] }>({ products: [], vendors: [] });
  const [loading, setLoading]                 = useState(false);
  const [loaded, setLoaded]                   = useState(false);
  const [fetchErr, setFetchErr]               = useState(false);
  const [hackOn, setHackOn]                   = useState(false);
  const [hackCount, setHackCount]             = useState(0);
  const [noRes, setNoRes]                     = useState(false);
  const [focused, setFocused]                 = useState(false);
  const [priorityIds, setPriorityIds]         = useState<Set<string>>(new Set());

  const inRef  = useRef<HTMLInputElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed  = useTyped();
  const navigate = useRef<((path: string) => void) | null>(null);

  // We need useNavigate — import it
  // (keeping it self-contained; parent router provides it via window.history if needed)

  useEffect(() => {
    const now = new Date().toISOString();
    return onSnapshot(
      query(collection(db, "adPromotions"), where("type", "==", "search_priority"), where("status", "in", ["active", "expiring_soon"])),
      snap => {
        const ids = new Set<string>();
        snap.docs.forEach(d => {
          const a = d.data() as AdPromotion;
          if (a.endDate > now && a.selectedProducts?.length > 0) a.selectedProducts.forEach((pid: string) => ids.add(pid));
        });
        setPriorityIds(ids);
      }
    );
  }, []);

  const isBoostMatch = useCallback((productId: string, productName: string, searchQuery: string): boolean => {
    if (!priorityIds.has(productId)) return false;
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase().trim();
    const name = productName.toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(w => name.includes(w));
  }, [priorityIds]);

  useEffect(() => {
    let unsubSnap: () => void = () => {};
    const unsubAuth = auth.onAuthStateChanged(user => {
      unsubSnap();
      if (user) {
        unsubSnap = onSnapshot(
          doc(db, "searchHistory", user.uid),
          snap => { if (snap.exists()) setHist((snap.data().history as string[]) || []); else setHist([]); },
          err  => { if (err.code !== "permission-denied") console.warn("searchHistory:", err.message); }
        );
      } else setHist([]);
    });
    return () => { unsubAuth(); unsubSnap(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [ps, vs] = await Promise.all([getDocs(collection(db, "products")), getDocs(collection(db, "vendors"))]);
        const vmap: Record<string, string> = {};
        const vendors: FirestoreItem[] = vs.docs.map(d => {
          const data = d.data() as Omit<FirestoreItem, "id" | "_col">;
          const v: FirestoreItem = { ...data, id: d.id, _col: "vendors", name: (data.businessName as string | undefined) ?? (data.name as string | undefined) ?? "" };
          vmap[d.id] = (v.businessName ?? v.name ?? "") as string;
          return v;
        });
        const products: FirestoreItem[] = ps.docs.map(d => {
          const data = d.data() as Omit<FirestoreItem, "id" | "_col">;
          const vid = (data.vendorId as string | undefined) ?? "";
          return { ...data, id: d.id, _col: "products", vendorName: vid && vmap[vid] ? vmap[vid] : undefined };
        });
        const withImg = products.filter(p => safeImg(p.img as string | undefined));
        setOrganicTrending([...withImg].sort(() => Math.random() - .5).slice(0, 10));
        setAllData({ products, vendors });
        setLoaded(true);
      } catch (e) { console.error(e); setFetchErr(true); }
    })();
  }, []);

  const addHist    = useCallback(async (term: string) => { const updated = [term, ...hist.filter(h => h !== term)].slice(0, MAX_H); await saveH(updated); }, [hist]);
  const clearHist  = useCallback(async () => { await saveH([]); }, []);
  const removeHist = useCallback(async (term: string) => { await saveH(hist.filter(h => h !== term)); }, [hist]);

  const runSearch = useCallback((safe: string, t?: string) => {
    const tab_ = t ?? tab;
    const all  = [...allData.products, ...allData.vendors];
    const scored = all.map(item => ({ ...item, _score: fscore(safe, item) })).filter(item => (item._score ?? 0) > 0);
    const boosted = scored.filter(item => item._col === "products" && isBoostMatch(item.id, item.name ?? "", safe)).map(item => ({ ...item, _boosted: true })).sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    const normal  = scored.filter(item => !boosted.find(b => b.id === item.id)).sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    const merged  = [...boosted, ...normal];
    const filtered = tab_ === "products" ? merged.filter(i => i._col === "products") : tab_ === "vendors" ? merged.filter(i => i._col === "vendors") : merged;
    setResults(filtered);
    setNoRes(filtered.length === 0);
    setLoading(false);
  }, [allData, tab, isBoostMatch]);

  const handleInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.length > 120) return;
    const { safe, value, attempts } = sq(raw);
    if (!safe) { setHackCount(attempts); setHackOn(true); setQueryStr(""); if (inRef.current) inRef.current.value = ""; return; }
    setQueryStr(raw);
    if (debRef.current) clearTimeout(debRef.current);
    if (!raw.trim()) { setResults([]); setNoRes(false); setLoading(false); return; }
    setLoading(true);
    debRef.current = setTimeout(() => { runSearch(value); if (raw.trim().length > 2) addHist(raw.trim()); }, 300);
  }, [runSearch, addHist]);

  useEffect(() => {
    if (!queryStr.trim()) return;
    const { safe, value } = sq(queryStr);
    if (!safe) return;
    runSearch(value, tab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const clearSearch = () => { setQueryStr(""); setResults([]); setNoRes(false); setLoading(false); if (inRef.current) { inRef.current.value = ""; inRef.current.focus(); } };
  const clickHist   = (term: string) => {
    setQueryStr(term);
    if (inRef.current) inRef.current.value = term;
    const { safe, value } = sq(term);
    if (!safe) return;
    setLoading(true);
    runSearch(value);
  };
  const goTo = (path: string) => { window.location.href = path; };

  const hasQuery = queryStr.trim().length > 0;
  const prodRes  = results.filter(r => r._col === "products");
  const vendRes  = results.filter(r => r._col === "vendors");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        @keyframes blink   { 0%,100%{opacity:1} 49%{opacity:1} 50%,99%{opacity:0} }
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:#2a2a3a; border-radius:4px; }
        .sp      { min-height:100vh; font-family:'DM Sans',sans-serif; padding:24px 16px 320px; transition:background .3s,color .3s; }
        .sp-in   { max-width:960px; margin:0 auto; padding-bottom:40px; }
        .ftabs   { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; margin-bottom:24px; }
        .ftabs::-webkit-scrollbar { display:none; }
        .ftab    { display:flex; align-items:center; gap:6px; padding:9px 20px; border-radius:30px; border:1.5px solid; background:transparent; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; font-family:'DM Sans',sans-serif; transition:all .18s ease; }
        .res-g   { display:grid; grid-template-columns:1fr; gap:10px; }
        .ven-g   { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .cat-g   { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .tr-sc   { display:flex; gap:14px; overflow-x:auto; padding-bottom:10px; scrollbar-width:none; }
        .tr-sc::-webkit-scrollbar { display:none; }
        .hist-r  { display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:14px; cursor:pointer; border:1px solid; transition:background .15s,border-color .15s; }
        .cursor  { display:inline-block; animation:blink 1s step-end infinite; }
        @media(min-width:600px)  { .sp { padding:28px 28px 320px; } }
        @media(min-width:768px)  { .res-g { grid-template-columns:repeat(2,1fr); } .ven-g { grid-template-columns:repeat(3,1fr); } .cat-g { grid-template-columns:repeat(4,1fr); } }
        @media(min-width:1024px) { .sp { padding:36px 48px 320px; } }
        @media(min-width:1280px) { .res-g { grid-template-columns:repeat(3,1fr); } .ven-g { grid-template-columns:repeat(4,1fr); } }
      `}</style>

      {hackOn && <HackWall n={hackCount} onDismiss={() => setHackOn(false)} dark={dark} />}

      <div className="sp" style={{ background: c.bg, color: c.txt }}>
        <div className="sp-in">
          {/* Header */}
          <div style={{ marginBottom: 28, animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 5, height: 40, borderRadius: 4, background: `linear-gradient(180deg,${A},#FF9A00)` }} />
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(26px,6vw,38px)", fontWeight: 900, letterSpacing: -1, color: c.txt }}>Search</h1>
            </div>
            <p style={{ fontSize: 13, color: c.sub, paddingLeft: 15 }}>Discover products &amp; vendors across the platform</p>
          </div>

          {/* Search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.inp, border: `2px solid ${focused || hasQuery ? A : c.inpB}`, borderRadius: 20, padding: "14px 20px", marginBottom: 22, transition: "border-color .2s,box-shadow .2s", boxShadow: focused || hasQuery ? `0 0 0 4px rgba(255,107,0,0.09),0 4px 20px rgba(255,107,0,0.07)` : "none", animation: "slideUp .4s ease" }}>
            <FiSearch size={18} color={hasQuery || focused ? A : c.dim} style={{ flexShrink: 0, transition: "color .2s" }} />
            <div style={{ flex: 1, position: "relative" }}>
              <input ref={inRef} type="text" onChange={handleInput}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={120}
                style={{ width: "100%", background: "none", border: "none", outline: "none", color: c.txt, fontSize: "clamp(14px,2.5vw,15px)", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, caretColor: A }} />
              {!hasQuery && (
                <div style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", color: c.dim, fontSize: "clamp(13px,2.5vw,14px)", fontWeight: 500, display: "flex", alignItems: "center" }}>
                  {typed}<span className="cursor" style={{ color: A }}>|</span>
                </div>
              )}
            </div>
            {loading && <div style={{ width: 18, height: 18, border: `2px solid ${c.brd}`, borderTopColor: A, borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />}
            {hasQuery && !loading && (
              <button onClick={clearSearch} style={{ background: A, border: "none", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <FiX size={14} color="#fff" />
              </button>
            )}
          </div>

          {fetchErr && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, color: "#ef4444", fontSize: 13 }}>
              <FiAlertCircle size={16} /> Unable to connect. Check your connection and try again.
            </div>
          )}

          {/* Filter tabs */}
          <div className="ftabs">
            {FTABS.map(t => (
              <button key={t.id} className="ftab"
                style={{ borderColor: tab === t.id ? A : c.brd, background: tab === t.id ? A : "transparent", color: tab === t.id ? "#fff" : c.sub }}
                onClick={() => setTab(t.id)}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Results */}
          {hasQuery && !loading && results.length > 0 && (
            <div style={{ animation: "slideUp .28s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: c.txt }}>{results.length} result{results.length !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 12, color: c.dim }}>for "{queryStr}"</span>
              </div>
              {(tab === "all" || tab === "products") && prodRes.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  {tab === "all" && <><SectionLabel label="Products" dark={dark} /><div style={{ height: 12 }} /></>}
                  <div className="res-g">{prodRes.map(item => <ProductCard key={item.id} item={item} dark={dark} boosted={!!item._boosted} />)}</div>
                </div>
              )}
              {(tab === "all" || tab === "vendors") && vendRes.length > 0 && (
                <div>
                  {tab === "all" && <><SectionLabel label="Vendors" dark={dark} /><div style={{ height: 12 }} /></>}
                  <div className="ven-g">{vendRes.map(item => <VendorCard key={item.id} item={item} dark={dark} />)}</div>
                </div>
              )}
            </div>
          )}
          {hasQuery && loading && <Skeleton dark={dark} />}
          {hasQuery && !loading && noRes && (
            <div style={{ textAlign: "center", padding: "72px 20px", animation: "fadeIn .3s ease" }}>
              <FiSearch size={48} color={c.dim} style={{ marginBottom: 16 }} />
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(18px,4vw,22px)", fontWeight: 700, color: c.txt, marginBottom: 10 }}>No results for "{queryStr}"</div>
              <p style={{ fontSize: 14, color: c.sub, lineHeight: 1.7 }}>Try a different spelling or a broader term.</p>
            </div>
          )}

          {/* Idle state */}
          {!hasQuery && (
            <div style={{ animation: "fadeIn .4s ease" }}>
              {!loaded && !fetchErr && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 12, color: c.sub }}>
                  <div style={{ width: 18, height: 18, border: `2px solid ${c.brd}`, borderTopColor: A, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                  <span style={{ fontSize: 14 }}>Loading…</span>
                </div>
              )}

              {/* History */}
              {loaded && hist.length > 0 && (
                <div style={{ marginBottom: 36 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <SectionLabel label="Recent Searches" icon={<FiClock size={14} color={A} />} dark={dark} />
                    <button onClick={clearHist} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans',sans-serif" }}>
                      <FiTrash2 size={13} /> Clear all
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {hist.map((term, i) => (
                      <div key={i} className="hist-r" style={{ background: c.surf, borderColor: c.brd }}
                        onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = A; d.style.background = dark ? "#1a1a24" : "#f6f6ff"; }}
                        onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = c.brd; d.style.background = c.surf; }}
                        onClick={() => clickHist(term)}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: A, flexShrink: 0 }}><FiClock size={14} /></div>
                        <span style={{ flex: 1, fontSize: 14, color: c.txt, fontWeight: 600 }}>{term}</span>
                        <button onClick={e => { e.stopPropagation(); removeHist(term); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.dim, padding: 4, display: "flex", borderRadius: 8 }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = c.dim}><FiX size={13} /></button>
                        <FiChevronRight size={14} color={c.dim} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paid trending */}
              {loaded && <SearchTrendingAds dark={dark} />}

              {/* Organic trending */}
              {loaded && organicTrending.length > 0 && (
                <div style={{ marginBottom: 36 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <SectionLabel label="Trending Now" icon={<FiTrendingUp size={14} color={A} />} dark={dark} />
                    <span style={{ fontSize: 12, color: c.sub, fontWeight: 600 }}>Live from stores</span>
                  </div>
                  <div className="tr-sc">{organicTrending.map(item => <TrendCard key={item.id} item={item} dark={dark} />)}</div>
                </div>
              )}

              {/* Explore — 13 categories + Send & Pickup service link */}
              {loaded && (
                <div style={{ marginBottom: 36 }}>
                  <SectionLabel label="Explore" icon={<FiGrid size={14} color={A} />} dark={dark} />
                  <div style={{ height: 12 }} />
                  <div className="cat-g">
                    {EXPLORE_CATS.map((cat, i) => (
                      <div key={i} onClick={() => goTo(cat.path)}
                        style={{ background: cat.bg, border: `1.5px solid ${cat.color}22`, borderRadius: 18, padding: "18px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", transition: "transform .2s,box-shadow .2s" }}
                        onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(-4px)"; d.style.boxShadow = `0 10px 28px ${cat.color}20`; }}
                        onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = "translateY(0)"; d.style.boxShadow = "none"; }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${cat.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: cat.color }}>{cat.icon}</div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: c.txt, textAlign: "center", letterSpacing: .2 }}>{cat.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ height: 100, flexShrink: 0 }} />
        </div>
      </div>
    </>
  );
}