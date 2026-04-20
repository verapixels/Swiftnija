// pages/VendorListPage.tsx — UPDATED
// Changes:
//  1. Uses new CATEGORY_TREE — 13 real categories
//  2. Send & Pickup removed from category pills (it's a service, not a category)
//  3. normalizeCat updated to match new keys
// Route: /category/:categoryId

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiSearch, FiX, FiShoppingCart,
  FiHeart, FiStar, FiBox, FiPackage, FiDroplet,
  FiGrid, FiSliders,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike,
} from "react-icons/md";
import { RiDrinks2Line, RiVerifiedBadgeFill, RiLeafLine } from "react-icons/ri";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useCart } from "../context/Cartcontext";
import { useInputSecurity } from "../hooks/Useinputsecurity";
import SecurityWarningModal from "../components/Securitywarningmodal";

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
  id: string; name: string; price: string; img: string | null;
  category: string; subCategory?: string;
  rating: number; vendorId?: string; vendorName?: string; vendorVerified?: boolean;
  description?: string; stock?: number; inStock: boolean;
};

// ─── Category config — 13 real categories, NO sendpickup ─────────────────────
const CAT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  restaurants:  { label: "Restaurants",      icon: <MdRestaurant size={16} />,        color: "#FF6B00" },
  fastfood:     { label: "Fast Food",         icon: <MdRestaurant size={16} />,        color: "#FB923C" },
  pharmacy:     { label: "Pharmacy",          icon: <MdLocalPharmacy size={16} />,     color: "#10B981" },
  supermarket:  { label: "Supermarket",       icon: <MdLocalGroceryStore size={16} />, color: "#3B82F6" },
  groceries:    { label: "Groceries",         icon: <RiLeafLine size={16} />,          color: "#22C55E" },
  fashion:      { label: "Fashion",           icon: <MdStorefront size={16} />,        color: "#F43F5E" },
  boutique:     { label: "Boutique",          icon: <MdStorefront size={16} />,        color: "#8B5CF6" },
  beauty:       { label: "Beauty",            icon: <FiBox size={16} />,               color: "#F472B6" },
  skincare:     { label: "Skincare",          icon: <FiDroplet size={16} />,           color: "#EC4899" },
  perfumes:     { label: "Perfumes",          icon: <FiDroplet size={16} />,           color: "#A78BFA" },
  drinks:       { label: "Drinks",            icon: <RiDrinks2Line size={16} />,       color: "#06B6D4" },
  health:       { label: "Health & Wellness", icon: <FiPackage size={16} />,           color: "#14B8A6" },
  electronics:  { label: "Electronics",       icon: <FiBox size={16} />,               color: "#6366F1" },
};

const ALL_CATS = Object.keys(CAT_CONFIG);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeCat(raw: string): string {
  if (!raw) return "restaurants";
  const s = raw.toLowerCase().trim();
  const map: [string, string][] = [
    ["restaurant", "restaurants"], ["fast food", "fastfood"], ["fastfood", "fastfood"],
    ["burger", "fastfood"], ["pizza", "fastfood"], ["shawarma", "fastfood"],
    ["fried chicken", "fastfood"],
    ["pharmacy", "pharmacy"], ["drug", "pharmacy"], ["medicine", "pharmacy"],
    ["health", "health"], ["supplement", "health"], ["wellness", "health"],
    ["supermarket", "supermarket"],
    ["grocery", "groceries"], ["groceries", "groceries"],
    ["vegetable", "groceries"], ["fruit", "groceries"],
    ["boutique", "boutique"],
    ["fashion", "fashion"], ["clothing", "fashion"], ["cloth", "fashion"],
    ["wear", "fashion"], ["apparel", "fashion"], ["dress", "fashion"],
    ["beauty", "beauty"], ["makeup", "beauty"], ["cosmetic", "beauty"], ["hair", "beauty"],
    ["skincare", "skincare"], ["skin", "skincare"], ["lotion", "skincare"],
    ["perfume", "perfumes"], ["fragrance", "perfumes"], ["cologne", "perfumes"],
    ["drink", "drinks"], ["beverage", "drinks"], ["juice", "drinks"], ["water", "drinks"],
    ["electronics", "electronics"], ["gadget", "electronics"],
    ["phone", "electronics"], ["laptop", "electronics"],
    ["food", "restaurants"],
    // sendpickup is a SERVICE — remap stray data
    ["logistics", "restaurants"], ["courier", "restaurants"],
    ["send", "restaurants"], ["pickup", "restaurants"],
  ];
  for (const [k, v] of map) if (s.includes(k)) return v;
  return s in CAT_CONFIG ? s : "restaurants";
}

function formatPrice(p: number | string): string {
  const n = typeof p === "number" ? p : parseFloat(String(p).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? String(p) : n.toLocaleString("en-NG");
}

function getBestImg(raw: Record<string, unknown>): string | null {
  const imgs = raw.images as string[] | undefined;
  return [imgs?.[0], raw.image as string, raw.img as string].find(u => u && !u.includes("supabase.co")) ?? null;
}

const FALLBACK = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80";

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ p, onAdd, onOpen }: { p: Product; onAdd: (p: Product) => void; onOpen: (p: Product) => void; }) {
  const [liked, setLiked]   = useState(false);
  const [added, setAdded]   = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const catCfg = CAT_CONFIG[p.category] || CAT_CONFIG.restaurants;

  return (
    <div className="vlp2-card" onClick={() => onOpen(p)}>
      <div className="vlp2-card-img">
        <img src={imgErr ? FALLBACK : (p.img || FALLBACK)} alt={p.name} onError={() => setImgErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div className="vlp2-img-overlay" />
        {!p.inStock && <div className="vlp2-badge out">Out of Stock</div>}
        {p.stock != null && p.stock <= 5 && p.stock > 0 && <div className="vlp2-badge low">Only {p.stock} left</div>}
        <button className={`vlp2-like-btn${liked ? " liked" : ""}`} onClick={e => { e.stopPropagation(); setLiked(v => !v); }}>
          <FiHeart size={13} fill={liked ? "#ef4444" : "none"} color={liked ? "#ef4444" : "white"} />
        </button>
        <div className="vlp2-cat-tag" style={{ background: catCfg.color + "22", border: `1px solid ${catCfg.color}44`, color: catCfg.color }}>
          {catCfg.icon}<span>{p.subCategory || catCfg.label}</span>
        </div>
      </div>
      <div className="vlp2-card-body">
        <div className="vlp2-card-name">{p.name}</div>
        {p.vendorName && (
          <div className="vlp2-card-store">
            <MdStorefront size={10} color="#888" />
            <span>{p.vendorName}</span>
            {p.vendorVerified && <RiVerifiedBadgeFill size={10} color="#3b82f6" />}
          </div>
        )}
        <div className="vlp2-card-rating">
          <FiStar size={10} fill="#FF6B00" color="#FF6B00" /><span>{p.rating.toFixed(1)}</span>
        </div>
        <div className="vlp2-card-footer">
          <span className="vlp2-card-price">&#8358;{p.price}</span>
          <button className={`vlp2-add-btn${added ? " done" : ""}`} disabled={!p.inStock}
            onClick={e => { e.stopPropagation(); if (!p.inStock) return; onAdd(p); setAdded(true); setTimeout(() => setAdded(false), 1200); }}>
            {added ? "Added" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="vlp2-card" style={{ cursor: "default", pointerEvents: "none" }}>
      <div className="vlp2-card-img sk-block" />
      <div className="vlp2-card-body" style={{ gap: 8 }}>
        <div className="sk-line" style={{ width: "80%", height: 12 }} />
        <div className="sk-line" style={{ width: "55%", height: 10 }} />
        <div className="sk-line" style={{ width: "40%", height: 10 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div className="sk-line" style={{ width: "45%", height: 14 }} />
          <div className="sk-line" style={{ width: "28%", height: 28, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorListPage() {
  const { categoryId = "restaurants" } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { addToCart, cartCount } = useCart();
  const { sanitize, showWarning, setShowWarning } = useInputSecurity();

  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [activeCategory, setActiveCategory] = useState(categoryId);
  const [sortBy, setSortBy]           = useState<"default" | "price_asc" | "price_desc" | "rating">("default");
  const [showSort, setShowSort]       = useState(false);
  const [toast, setToast]             = useState("");
  const pillsRef = useRef<HTMLDivElement>(null);

  // Validate categoryId — if it's sendpickup or unknown, redirect
  useEffect(() => {
    if (categoryId === "sendpickup") {
      navigate("/send-pickup", { replace: true });
      return;
    }
    if (!(categoryId in CAT_CONFIG)) {
      navigate("/category/restaurants", { replace: true });
    }
  }, [categoryId]);

  const catCfg = CAT_CONFIG[activeCategory] || CAT_CONFIG.restaurants;

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "products"));
      const vendorIds = new Set<string>();
      const rawList: Array<{ id: string; data: Record<string, unknown> }> = [];
      snap.forEach(d => {
        const data = d.data() as Record<string, unknown>;
        rawList.push({ id: d.id, data });
        if (data.vendorId) vendorIds.add(data.vendorId as string);
      });
      const vendorMap: Record<string, { verified: boolean; name: string }> = {};
      await Promise.all([...vendorIds].map(async vid => {
        try {
          const vs = await getDoc(doc(db, "vendors", vid));
          if (vs.exists()) {
            const vd = vs.data();
            vendorMap[vid] = { verified: !!(vd.blueBadge || vd.isVerified || vd.verified), name: vd.storeName || vd.businessName || "" };
          }
        } catch {}
      }));
      const list: Product[] = [];
      for (const { id, data: r } of rawList) {
        if (r.inStock === false || r.available === false) continue;
        const name = r.name as string;
        if (!name) continue;
        const cat = normalizeCat((r.category as string) || "restaurants");
        // Skip if this normalizes to sendpickup (shouldn't happen, but safety net)
        if (!(cat in CAT_CONFIG)) continue;
        const vid   = r.vendorId as string | undefined;
        const vInfo = vid ? vendorMap[vid] : undefined;
        list.push({
          id, name,
          price: formatPrice((r.price as number | string) ?? 0),
          img: getBestImg(r),
          category: cat,
          subCategory: r.subCategory as string | undefined,
          rating: typeof r.rating === "number" ? r.rating : parseFloat((4 + Math.random()).toFixed(1)),
          vendorId: vid,
          vendorName: vInfo?.name || (r.vendorName as string) || (r.storeName as string) || (r.businessName as string) || "",
          vendorVerified: vInfo?.verified ?? false,
          description: r.description as string | undefined,
          stock: r.stock as number | undefined,
          inStock: r.inStock !== false && r.available !== false,
        });
      }
      setProducts(list);
    } catch (err) { console.error("VendorListPage fetch error:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    setActiveCategory(categoryId);
    setTimeout(() => {
      const pill = pillsRef.current?.querySelector(".vlp2-pill.active") as HTMLElement | null;
      pill?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 100);
  }, [categoryId]);

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat);
    navigate(`/category/${cat}`, { replace: true });
  };

  const handleAddToCart = (p: Product) => {
    addToCart({ name: p.name, price: `₦${p.price}`, img: p.img ?? FALLBACK, vendorName: p.vendorName, vendorId: p.vendorId });
    showToast(`${p.name} added to cart`);
  };

  const filtered = products
    .filter(p => p.category === activeCategory)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.vendorName || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "price_asc")  return parseFloat(a.price.replace(/,/g, "")) - parseFloat(b.price.replace(/,/g, ""));
      if (sortBy === "price_desc") return parseFloat(b.price.replace(/,/g, "")) - parseFloat(a.price.replace(/,/g, ""));
      if (sortBy === "rating")     return b.rating - a.rating;
      return 0;
    });

  const SORT_OPTIONS = [
    { val: "default",    label: "Default" },
    { val: "price_asc",  label: "Price: Low to High" },
    { val: "price_desc", label: "Price: High to Low" },
    { val: "rating",     label: "Top Rated" },
  ];

  return (
    <div className="vlp2-root">
      {showWarning && <SecurityWarningModal onDismiss={() => setShowWarning(false)} />}
      {toast && <div className="vlp2-toast">{toast}</div>}

      {/* Header */}
      <div className="vlp2-header">
        <button className="vlp2-back" onClick={() => navigate(-1)}><FiArrowLeft size={18} /></button>
        <div className="vlp2-header-title">
          <div className="vlp2-header-icon" style={{ background: catCfg.color + "22", color: catCfg.color }}>{catCfg.icon}</div>
          <div>
            <h1 className="vlp2-title">{catCfg.label}</h1>
            <p className="vlp2-subtitle">{loading ? "Loading..." : `${filtered.length} product${filtered.length !== 1 ? "s" : ""} found`}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button className="vlp2-icon-btn" onClick={() => navigate("/cart")} style={{ position: "relative" }}>
            <FiShoppingCart size={17} />
            {cartCount > 0 && <span className="vlp2-cart-dot">{cartCount}</span>}
          </button>
          <button className="vlp2-icon-btn" onClick={() => setShowSort(v => !v)}><FiSliders size={17} /></button>
        </div>
      </div>

      {/* Sort dropdown */}
      {showSort && (
        <div className="vlp2-sort-drop">
          {SORT_OPTIONS.map(opt => (
            <button key={opt.val} className={`vlp2-sort-opt${sortBy === opt.val ? " active" : ""}`}
              onClick={() => { setSortBy(opt.val as typeof sortBy); setShowSort(false); }}>
              {opt.label}
              {sortBy === opt.val && <span style={{ marginLeft: "auto", color: "#FF6B00" }}>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Category pills — 13 real categories only */}
      <div className="vlp2-pills-wrap" ref={pillsRef}>
        {ALL_CATS.map(cat => {
          const cfg = CAT_CONFIG[cat];
          const isActive = activeCategory === cat;
          return (
            <button key={cat} className={`vlp2-pill${isActive ? " active" : ""}`}
              style={isActive ? { background: cfg.color, borderColor: cfg.color, color: "white" } : {}}
              onClick={() => handleCategoryClick(cat)}>
              <span style={{ color: isActive ? "white" : cfg.color }}>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="vlp2-search-wrap">
        <FiSearch size={15} color="#666" />
        <input className="vlp2-search-input" placeholder={`Search in ${catCfg.label}...`}
          value={search} onChange={e => setSearch(sanitize(e.target.value))} />
        {search && <button onClick={() => setSearch("")} className="vlp2-search-clear"><FiX size={13} /></button>}
      </div>

      {/* Category strip */}
      <div className="vlp2-cat-strip" style={{ borderColor: catCfg.color + "33" }}>
        <div className="vlp2-cat-strip-icon" style={{ background: catCfg.color }}>{catCfg.icon}</div>
        <span className="vlp2-cat-strip-label">{catCfg.label}</span>
        <span className="vlp2-cat-strip-count">{loading ? "..." : `${filtered.length} items`}</span>
      </div>

      {/* Grid */}
      <div className="vlp2-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div className="vlp2-empty">
            <div className="vlp2-empty-icon" style={{ color: catCfg.color }}>{catCfg.icon}</div>
            <p className="vlp2-empty-title">{search ? "No products match your search" : `No ${catCfg.label} products yet`}</p>
            <p className="vlp2-empty-sub">{search ? "Try a different keyword" : "Check back soon or browse another category"}</p>
          </div>
        ) : (
          filtered.map(p => (
            <ProductCard key={p.id} p={p} onAdd={handleAddToCart} onOpen={p => navigate(`/store/${p.vendorId || p.id}`)} />
          ))
        )}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root { --bg:#0a0a0d;--surface:#111115;--card:#16161b;--border:#1e1e26;--text:#e8e8f0;--text2:#8888a0;--text3:#44445a;--inp:#1a1a22;--inpbd:#252530; }
[data-theme="light"] { --bg:#f0f0f5;--surface:#ffffff;--card:#ffffff;--border:#e0e0e8;--text:#111118;--text2:#555570;--text3:#aaaabc;--inp:#f5f5fa;--inpbd:#dddde8; }
.vlp2-root { min-height:100vh;background:var(--bg);font-family:'Nunito',sans-serif;color:var(--text);padding-bottom:120px; }
.vlp2-toast { position:fixed;top:72px;left:50%;transform:translateX(-50%);background:#FF6B00;color:white;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:700;z-index:9999;white-space:nowrap;animation:toast-pop .3s cubic-bezier(.34,1.56,.64,1);box-shadow:0 8px 24px rgba(255,107,0,.4); }
@keyframes toast-pop { from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
.vlp2-header { display:flex;align-items:center;gap:12px;padding:16px 18px;background:var(--bg);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;backdrop-filter:blur(12px); }
@media(max-width:767px){ .vlp2-header{padding-top:52px;} }
.vlp2-back { width:38px;height:38px;border-radius:12px;background:var(--card);border:1.5px solid var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:border-color .2s,color .2s; }
.vlp2-back:hover { border-color:#FF6B00;color:#FF6B00; }
.vlp2-header-title { display:flex;align-items:center;gap:10px;flex:1;min-width:0; }
.vlp2-header-icon { width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.vlp2-title { font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--text);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.vlp2-subtitle { font-size:11px;color:var(--text3);font-weight:600;margin-top:1px; }
.vlp2-icon-btn { width:38px;height:38px;border-radius:12px;background:var(--card);border:1.5px solid var(--border);color:var(--text2);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;flex-shrink:0;transition:border-color .2s; }
.vlp2-icon-btn:hover { border-color:#FF6B00;color:#FF6B00; }
.vlp2-cart-dot { position:absolute;top:-4px;right:-4px;background:#FF6B00;color:white;font-size:9px;font-weight:900;width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center; }
.vlp2-sort-drop { position:sticky;top:68px;z-index:99;background:var(--surface);border-bottom:1px solid var(--border);padding:6px 0;animation:fade-down .2s ease; }
@keyframes fade-down { from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)} }
.vlp2-sort-opt { display:flex;align-items:center;gap:8px;width:100%;padding:12px 20px;background:transparent;border:none;cursor:pointer;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;color:var(--text2);transition:background .15s,color .15s; }
.vlp2-sort-opt:hover { background:var(--card);color:var(--text); }
.vlp2-sort-opt.active { color:#FF6B00;font-weight:800; }
.vlp2-pills-wrap { display:flex;gap:8px;padding:14px 18px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border); }
.vlp2-pills-wrap::-webkit-scrollbar { display:none; }
.vlp2-pill { display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:30px;background:var(--card);border:1.5px solid var(--border);color:var(--text2);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .2s; }
.vlp2-pill:hover { border-color:rgba(255,107,0,.4);color:var(--text); }
.vlp2-pill.active { font-weight:800;box-shadow:0 4px 16px rgba(0,0,0,.25); }
.vlp2-search-wrap { display:flex;align-items:center;gap:10px;margin:14px 18px;background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:12px 16px;transition:border-color .2s; }
.vlp2-search-wrap:focus-within { border-color:#FF6B00; }
.vlp2-search-input { flex:1;background:transparent;border:none;outline:none;color:var(--text);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600; }
.vlp2-search-input::placeholder { color:var(--text3); }
.vlp2-search-clear { background:none;border:none;color:var(--text3);cursor:pointer;display:flex;align-items:center; }
.vlp2-cat-strip { display:flex;align-items:center;gap:10px;margin:0 18px 16px;padding:10px 14px;background:var(--card);border:1.5px solid var(--border);border-radius:14px; }
.vlp2-cat-strip-icon { width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0; }
.vlp2-cat-strip-label { font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--text);flex:1; }
.vlp2-cat-strip-count { font-size:11px;font-weight:700;color:var(--text3);background:var(--surface);padding:3px 10px;border-radius:20px;border:1px solid var(--border); }
.vlp2-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:0 18px; }
@media(min-width:540px){ .vlp2-grid{grid-template-columns:repeat(3,1fr);} }
@media(min-width:768px){ .vlp2-grid{grid-template-columns:repeat(4,1fr);gap:16px;padding:0 24px;} }
@media(min-width:1024px){ .vlp2-grid{grid-template-columns:repeat(5,1fr);} }
.vlp2-card { background:var(--card);border:1.5px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;transition:border-color .2s,transform .2s,box-shadow .2s;animation:card-in .35s ease both; }
.vlp2-card:hover { border-color:rgba(255,107,0,.4);transform:translateY(-3px);box-shadow:0 10px 28px rgba(255,107,0,.12); }
@keyframes card-in { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
.vlp2-card-img { height:140px;overflow:hidden;background:var(--surface);position:relative;flex-shrink:0; }
@media(min-width:768px){ .vlp2-card-img{height:160px;} }
.vlp2-img-overlay { position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,rgba(0,0,0,.45) 100%);pointer-events:none; }
.vlp2-badge { position:absolute;top:8px;left:8px;font-size:9px;font-weight:800;padding:3px 8px;border-radius:20px;backdrop-filter:blur(6px); }
.vlp2-badge.out { background:rgba(239,68,68,.85);color:white; }
.vlp2-badge.low { background:rgba(234,179,8,.85);color:white; }
.vlp2-like-btn { position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .15s; }
.vlp2-like-btn:hover { transform:scale(1.15); }
.vlp2-like-btn.liked { background:rgba(239,68,68,.2); }
.vlp2-cat-tag { position:absolute;bottom:8px;left:8px;display:flex;align-items:center;gap:4px;font-size:9px;font-weight:800;padding:3px 8px;border-radius:20px;backdrop-filter:blur(6px); }
.vlp2-card-body { padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1; }
.vlp2-card-name { font-size:12px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3; }
.vlp2-card-store { display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text3);font-weight:600;white-space:nowrap;overflow:hidden; }
.vlp2-card-store span { overflow:hidden;text-overflow:ellipsis;flex:1; }
.vlp2-card-rating { display:flex;align-items:center;gap:3px;font-size:10px;color:#FF6B00;font-weight:700; }
.vlp2-card-footer { display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:auto;padding-top:6px; }
.vlp2-card-price { color:#FF6B00;font-weight:900;font-family:'Syne',sans-serif;font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.vlp2-add-btn { padding:6px 12px;border-radius:9px;background:#FF6B00;border:none;color:white;font-family:'Nunito',sans-serif;font-size:11px;font-weight:800;cursor:pointer;flex-shrink:0;transition:background .15s,transform .15s,box-shadow .15s; }
.vlp2-add-btn:hover:not(:disabled) { background:#e55e00;transform:scale(1.06);box-shadow:0 4px 12px rgba(255,107,0,.4); }
.vlp2-add-btn:disabled { background:#333;cursor:not-allowed; }
.vlp2-add-btn.done { background:#10B981; }
.vlp2-empty { grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:70px 20px;text-align:center; }
.vlp2-empty-icon { width:64px;height:64px;border-radius:20px;background:var(--card);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px; }
.vlp2-empty-title { font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text); }
.vlp2-empty-sub { font-size:12px;color:var(--text3);font-weight:600; }
.sk-block { background:linear-gradient(90deg,var(--card) 25%,var(--border) 50%,var(--card) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite; }
.sk-line { background:linear-gradient(90deg,var(--card) 25%,var(--border) 50%,var(--card) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:6px;display:block; }
@keyframes shimmer { 0%{background-position:200% 0}100%{background-position:-200% 0} }
`;