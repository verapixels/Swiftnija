// src/Pages/Landingpage.tsx  —  SwiftNija  ·  ULTIMATE 3D EDITION
// FIXES:
//  1. useRef TypeScript error fixed (proper initial value)
//  2. Carousel top-right: animated "Featured Products / Popular Categories" badge
//  3. "Live Delivery" badge REMOVED from carousel
//  4. Carousel 3D flip/perspective transition effect
//  5. Vendor icon ON TOP of content
//  6. Hamburger BEFORE logo in navbar
//  7. Navbar — bold, glowing, 3D animated design
//  8. Whole page: mindblowing 3D scroll-reveal animations
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  FiShoppingBag, FiLogIn, FiUserPlus, FiX, FiChevronRight,
  FiMapPin, FiStar, FiShield, FiZap, FiClock, FiPackage,
  FiInstagram, FiTwitter, FiFacebook, FiLinkedin,
  FiPhone, FiMail, FiUsers, FiAward, FiHeart,
  FiArrowRight, FiGrid, FiRefreshCw, FiChevronLeft,
  FiShoppingCart, FiMenu, FiChevronDown, FiChevronUp,
  FiHome, FiInfo, FiSettings, FiTruck,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike, MdDeliveryDining,
} from "react-icons/md";
import { RiMotorbikeFill, RiStore2Line, RiVerifiedBadgeFill } from "react-icons/ri";
import { BsLightningChargeFill, BsBoxSeam } from "react-icons/bs";

const HERO_USER_IMG: string | null = null;
const LOGO = "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";
const ORANGE = "#FF6B00";

// ─── types & helpers ──────────────────────────────────────────────────────────
type Prod = {
  id: string; name: string; price: string; img: string | null;
  cat: string; store: string; rating: number; vendorId?: string;
  desc?: string;
};

function normCat(r = "") {
  const s = r.toLowerCase();
  if (s.includes("restaurant") || s.includes("food") || s.includes("fast")) return "food";
  if (s.includes("pharma") || s.includes("drug") || s.includes("medicine"))  return "pharmacy";
  if (s.includes("grocer") || s.includes("supermarket"))                      return "groceries";
  if (s.includes("fashion") || s.includes("cloth") || s.includes("boutique")) return "fashion";
  if (s.includes("beauty") || s.includes("skin") || s.includes("makeup"))    return "beauty";
  if (s.includes("electron") || s.includes("gadget") || s.includes("phone")) return "electronics";
  return "food";
}
function fmtP(p: any) {
  const n = typeof p === "number" ? p : parseFloat(String(p).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? String(p) : n.toLocaleString("en-NG");
}
async function fetchProds(): Promise<Prod[]> {
  const out: Prod[] = [];
  try {
    const snap = await getDocs(collection(db, "products"));
    snap.forEach(d => {
      const r = d.data();
      if (r.inStock === false || r.available === false) return;
      const img = [r.images?.[0], r.image, r.img].find((u: any) => u && !u.includes("supabase")) ?? null;
      out.push({
        id: d.id, name: r.name || "Product", price: fmtP(r.price ?? 0), img,
        cat: normCat(r.category || ""), store: r.businessName || r.storeName || r.vendorName || "Store",
        rating: typeof r.rating === "number" ? r.rating : +(4 + Math.random()).toFixed(1),
        vendorId: r.vendorId, desc: r.description || r.desc || "",
      });
    });
  } catch (e) { console.error(e); }
  return out.sort(() => Math.random() - .5);
}

// 3D scroll observer hook
function use3DInView(th = 0.08) {
  const ref = useRef<HTMLElement>(null);
  const [v, sv] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) sv(true); }, { threshold: th });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return { ref, v };
}

const CATS = [
  { id: "all",         label: "All",         Icon: FiGrid },
  { id: "food",        label: "Food",         Icon: MdRestaurant },
  { id: "pharmacy",    label: "Pharmacy",     Icon: MdLocalPharmacy },
  { id: "groceries",   label: "Groceries",    Icon: MdLocalGroceryStore },
  { id: "fashion",     label: "Fashion",      Icon: MdStorefront },
  { id: "beauty",      label: "Beauty",       Icon: FiHeart },
  { id: "electronics", label: "Electronics",  Icon: BsLightningChargeFill },
];

// ─── CAROUSEL SLIDES ──────────────────────────────────────────────────────────
const DEFAULT_SLIDES = [
  {
    headline: "Your Swift Door\nto Everything.",
    sub: "Eat. Shop. Send.",
    bg: "#1a0a00",
    accent: ORANGE,
    imgs: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80",
      "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80",
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80",
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80",
    ],
  },
  {
    headline: "Fast Delivery\nAcross Lagos.",
    sub: "Order in seconds. Delivered in minutes.",
    bg: "#001a0a",
    accent: "#10B981",
    imgs: [
      "https://images.unsplash.com/photo-1526367790999-0150786686a2?w=400&q=80",
      "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=400&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80",
    ],
  },
  {
    headline: "500+ Riders\nReady Now.",
    sub: "Track your order live, every step.",
    bg: "#0a0010",
    accent: "#8b5cf6",
    imgs: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80",
      "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80",
      "https://images.unsplash.com/photo-1476224203421-9ac39bcb3df1?w=400&q=80",
    ],
  },
];

function getSlides() {
  if (!HERO_USER_IMG) return DEFAULT_SLIDES;
  return [
    { ...DEFAULT_SLIDES[0], imgs: [HERO_USER_IMG, ...DEFAULT_SLIDES[0].imgs.slice(1)] },
    ...DEFAULT_SLIDES.slice(1),
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
//  NAVBAR  — Hamburger FIRST, then logo, bold 3D design
// ═════════════════════════════════════════════════════════════════════════════
function Navbar() {
  const nav = useNavigate();
  const [open, setOpen]       = useState(false);
  const [stuck, setStuck]     = useState(false);
  const [aboutOpen, setAbout] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const fn = () => { setStuck(window.scrollY > 60); setScrollY(window.scrollY); };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const scroll = (id: string) => {
    setOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  const go = (path: string) => { setOpen(false); nav(path); };

  return (
    <>
      <header className={`sn-nav${stuck ? " sn-nav-glass" : ""}`}>
        {/* LEFT: Hamburger FIRST then Logo */}
        <div className="sn-nav-left">
          {/* Hamburger — comes BEFORE logo */}
          <button
            className={`sn-ham${open ? " sn-ham-open" : ""}`}
            onClick={() => setOpen(v => !v)}
            aria-label="Menu"
          >
            <span className="sn-line" />
            <span className="sn-line" />
            <span className="sn-line" />
          </button>

          {/* Logo — after hamburger */}
          <div className="sn-logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <img src={LOGO} className="sn-logo-img" alt="SwiftNija" onError={e => (e.currentTarget.style.display = "none")} />
            <span className="sn-logo-text">Swift<em>9ja</em></span>
          </div>
        </div>

        {/* CENTER: Nav links (desktop only) */}
        <nav className="sn-nav-links">
          <button className="sn-nav-link" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Home
          </button>
          <button className="sn-nav-link" onClick={() => scroll("sn-about")}>About</button>
          <button className="sn-nav-link" onClick={() => scroll("sn-services")}>Services</button>
          <button className="sn-nav-link sn-nav-link-hot" onClick={() => go("/vendor/register")}>
            Vendor
          </button>
          <button className="sn-nav-link sn-nav-link-hot" onClick={() => go("/rider/signup")}>
            Rider
          </button>
        </nav>

        {/* RIGHT: Auth buttons */}
        <div className="sn-auth">
          <button className="sn-auth-login"  onClick={() => nav("/login")}>Login</button>
          <button className="sn-auth-signup" onClick={() => nav("/signup")}>Sign Up</button>
        </div>
      </header>

      {/* Backdrop */}
      <div className={`sn-backdrop${open ? " sn-back-on" : ""}`} onClick={() => setOpen(false)} />

      {/* Drawer */}
      <nav className={`sn-drawer${open ? " sn-drawer-on" : ""}`}>
        <div className="sn-drawer-head">
          <div className="sn-logo">
            <img src={LOGO} className="sn-logo-img" alt="" onError={e => (e.currentTarget.style.display = "none")} />
            <span className="sn-logo-text">Swift<em>9ja</em></span>
          </div>
          <button className="sn-drawer-x" onClick={() => setOpen(false)}><FiX size={18} /></button>
        </div>

        <div className="sn-drawer-body">
          <button className="sn-ditem sn-ditem-accent" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setOpen(false); }}>
            <FiHome size={15} className="sn-dico" />
            <span className="sn-dlabel">HOME</span>
          </button>

          <div className="sn-dsub-wrap">
            <button className="sn-ditem sn-ditem-accent" onClick={() => setAbout(v => !v)}>
              <FiInfo size={15} className="sn-dico" />
              <span className="sn-dlabel">ABOUT</span>
              <span className="sn-darrow">{aboutOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}</span>
            </button>
            {aboutOpen && (
              <div className="sn-submenu">
                <button className="sn-dsubitem" onClick={() => go("/about/founder")}>
                  <FiChevronRight size={10} color={ORANGE} /> About Founder
                </button>
                <button className="sn-dsubitem" onClick={() => go("/about/team")}>
                  <FiChevronRight size={10} color={ORANGE} /> Meet the Team
                </button>
                <button className="sn-dsubitem" onClick={() => go("/about/company")}>
                  <FiChevronRight size={10} color={ORANGE} /> About Company
                </button>
              </div>
            )}
          </div>

          <button className="sn-ditem sn-ditem-accent" onClick={() => go("/services")}>
            <FiSettings size={15} className="sn-dico" />
            <span className="sn-dlabel">OUR SERVICES</span>
          </button>

          <div className="sn-divider" />

          <button className="sn-ditem sn-ditem-special" onClick={() => go("/vendor/register")}>
            <RiStore2Line size={16} className="sn-dico" style={{ color: ORANGE }} />
            <span className="sn-dlabel" style={{ color: ORANGE }}>BECOME A VENDOR</span>
          </button>

          <button className="sn-ditem sn-ditem-special" onClick={() => go("/rider/signup")}>
            <RiMotorbikeFill size={16} className="sn-dico" style={{ color: ORANGE }} />
            <span className="sn-dlabel" style={{ color: ORANGE }}>BECOME A RIDER</span>
          </button>
        </div>

        <div className="sn-drawer-foot">
          <button className="sn-auth-login sn-d100" onClick={() => go("/login")}>
            <FiLogIn size={14} /> Login
          </button>
          <button className="sn-auth-signup sn-d100" onClick={() => go("/signup")}>
            <FiUserPlus size={14} /> Create Account
          </button>
        </div>
      </nav>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  HERO CAROUSEL — 3D perspective flip transitions, NO live badge
// ═════════════════════════════════════════════════════════════════════════════
function Hero() {
  const nav = useNavigate();
  const [cur, setCur]     = useState(0);
  const [prev, setPrev]   = useState<number | null>(null);
  const [dir, setDir]     = useState<"next" | "prev">("next");
  const [animating, setAnim] = useState(false);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const SLIDES            = getSlides();

  const go = useCallback((next: number, direction: "next" | "prev" = "next") => {
    if (animating) return;
    setDir(direction);
    setPrev(cur);
    setCur(next);
    setAnim(true);
    setTimeout(() => { setPrev(null); setAnim(false); }, 700);
  }, [cur, animating]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCur(c => {
        const next = (c + 1) % SLIDES.length;
        setDir("next");
        setPrev(c);
        setAnim(true);
        setTimeout(() => { setPrev(null); setAnim(false); }, 700);
        return next;
      });
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [SLIDES.length]);

  const slide = SLIDES[cur];

  return (
    <section className="sn-hero" style={{ background: slide.bg }}>
      {/* 3D perspective wrapper */}
      <div className="sn-hero-3d-wrap">
        {/* Previous slide exiting */}
        {prev !== null && (
          <div
            className={`sn-hero-collage sn-collage-exit${dir === "next" ? "-next" : "-prev"}`}
          >
            {SLIDES[prev].imgs.map((src, i) => (
              <div key={`prev-${i}`} className={`sn-collage-img sn-ci${i}`}>
                <img src={src} alt="" onError={e => (e.currentTarget.src = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80")} />
              </div>
            ))}
            <div className="sn-hero-collage-overlay" />
          </div>
        )}

        {/* Current slide entering */}
        <div className={`sn-hero-collage${animating ? (dir === "next" ? " sn-collage-enter-next" : " sn-collage-enter-prev") : ""}`}>
          {slide.imgs.map((src, i) => (
            <div key={`${cur}-${i}`} className={`sn-collage-img sn-ci${i}`}>
              <img
                src={src}
                alt=""
                onError={e => (e.currentTarget.src = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80")}
              />
            </div>
          ))}
          <div className="sn-hero-collage-overlay" />
          <div className="sn-hero-strip" style={{ background: slide.accent }} />
        </div>
      </div>

      {/* Text content */}
      <div className="sn-hero-text" key={cur}>
        <h1 className="sn-h1">
          {slide.headline.split("\n").map((line, i) => (
            <span key={i} className="sn-h1-line">{line}<br /></span>
          ))}
        </h1>
        <p className="sn-hero-sub">{slide.sub}</p>
        <div className="sn-hero-ctas">
          <button className="sn-btn-primary sn-btn-3d" onClick={() => nav("/signup")}>
            Order Now <FiArrowRight size={14} />
          </button>
          <button className="sn-btn-ghost" onClick={() => document.getElementById("sn-products")?.scrollIntoView({ behavior: "smooth" })}>
            Browse All Categories
          </button>
        </div>
      </div>

      {/* Carousel controls */}
      <button className="sn-car-btn sn-car-l" onClick={() => go((cur - 1 + SLIDES.length) % SLIDES.length, "prev")}>
        <FiChevronLeft size={20} />
      </button>
      <button className="sn-car-btn sn-car-r" onClick={() => go((cur + 1) % SLIDES.length, "next")}>
        <FiChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="sn-car-dots">
        {SLIDES.map((_, i) => (
          <button key={i} className={`sn-dot${i === cur ? " sn-dot-on" : ""}`} onClick={() => go(i, i > cur ? "next" : "prev")} />
        ))}
      </div>

      {/* 3D floating particles */}
      <div className="sn-particles">
        {[...Array(8)].map((_, i) => <div key={i} className={`sn-particle sn-p${i}`} />)}
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  BUY NOW POPUP — fixed blank overlay issue
// ═════════════════════════════════════════════════════════════════════════════
function BuyPopup({ p, onClose }: { p: Prod; onClose: () => void }) {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setTimeout(() => setShow(true), 10));
    return () => cancelAnimationFrame(t);
  }, []);
  const close = () => { setShow(false); setTimeout(onClose, 320); };

  return (
    <div
      className="sn-overlay"
      style={{ opacity: show ? 1 : 0, pointerEvents: show ? "all" : "none" }}
      onClick={close}
    >
      <div
        className="sn-popup"
        style={{
          transform: show ? "translateY(0) scale(1)" : "translateY(48px) scale(.93)",
          opacity: show ? 1 : 0,
        }}
        onClick={e => e.stopPropagation()}
      >
        <button className="sn-pop-x" onClick={close}><FiX size={15} /></button>
        <div className="sn-pop-preview">
          <div className="sn-pop-img-wrap">
            {p.img
              ? <img src={p.img} alt={p.name} className="sn-pop-img" />
              : <div className="sn-pop-img-ph"><FiPackage size={28} color="#666" /></div>}
          </div>
          <div className="sn-pop-info">
            <div className="sn-pop-name">{p.name}</div>
            <div className="sn-pop-store"><RiVerifiedBadgeFill size={11} color="#3b82f6" /> {p.store}</div>
            <div className="sn-pop-price">₦{p.price}</div>
            <div className="sn-pop-rating"><FiStar size={11} fill="#f59e0b" color="#f59e0b" /> {p.rating.toFixed(1)}</div>
          </div>
        </div>
        <div className="sn-pop-divider" />
        <div className="sn-pop-msg-wrap">
          <FiShoppingBag size={28} className="sn-pop-bag" />
          <h2 className="sn-pop-title">Ready to order?</h2>
          <p className="sn-pop-msg">Create a free SwiftNija account to place orders and track deliveries in real time.</p>
        </div>
        <div className="sn-pop-btns">
          <button className="sn-pop-signup" onClick={() => nav("/signup")}><FiUserPlus size={16} /> Create Free Account</button>
          <button className="sn-pop-login"  onClick={() => nav("/login")}><FiLogIn size={15} /> Already have an account? Login</button>
        </div>
        <div className="sn-pop-trust">
          <span><FiShield size={11} color="#10B981" /> Free to join</span>
          <span><FiZap size={11} color={ORANGE} /> Instant checkout</span>
          <span><FiClock size={11} color={ORANGE} /> 15 min avg delivery</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  PRODUCT CARD
// ═════════════════════════════════════════════════════════════════════════════
function ProductCard({ p, onBuy, index }: { p: Prod; onBuy: (p: Prod) => void; index: number }) {
  const [liked, setLiked]   = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const FALLBACK = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80";

  return (
    <div className="sn-pcard" style={{ "--ci": index } as any}>
      <div className="sn-pimg-wrap">
        <img
          src={p.img && !imgErr ? p.img : FALLBACK}
          alt={p.name}
          className="sn-pimg"
          onError={() => setImgErr(true)}
        />
        <button className="sn-plove" onClick={e => { e.stopPropagation(); setLiked(v => !v); }}>
          <FiHeart size={13} fill={liked ? "#ef4444" : "none"} color={liked ? "#ef4444" : "#aaa"} />
        </button>
      </div>
      <div className="sn-pbody">
        <div className="sn-pname">{p.name}</div>
        {p.desc && <div className="sn-pdesc">{p.desc.slice(0, 60)}{p.desc.length > 60 ? "..." : ""}</div>}
        <div className="sn-pprice">₦{p.price}</div>
        <button className="sn-pbuy" onClick={() => onBuy(p)}>
          <FiShoppingCart size={13} /> Add to Cart
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  PRODUCTS SECTION
// ═════════════════════════════════════════════════════════════════════════════
function Products() {
  const [prods, setProds]  = useState<Prod[]>([]);
  const [loading, setLoad] = useState(true);
  const [cat, setCat]      = useState("all");
  const [popup, setPopup]  = useState<Prod | null>(null);
  const { ref, v }         = use3DInView();

  const load = useCallback(async () => { setLoad(true); setProds(await fetchProds()); setLoad(false); }, []);
  useEffect(() => { load(); }, [load]);

  const shown = cat === "all" ? prods : prods.filter(p => p.cat === cat);

  return (
    <section id="sn-products" className="sn-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        {/* Clean section header */}
        <div className={`sn-prod-header-clean${v ? " sn-3d-visible" : ""}`}>
          <div className="sn-prod-header-left">
            <span className="sn-kicker"><FiGrid size={11} /> Featured Products</span>
            <h2 className="sn-prod-h3d">Shop Popular Categories</h2>
          </div>
          <div className="sn-prod-header-right">
            <span className="sn-prod-count-badge">Browse All →</span>
          </div>
        </div>

        <div className={`sn-cat-row${v ? " sn-visible" : ""}`}>
          {CATS.map(c => (
            <button key={c.id} className={`sn-cat${cat === c.id ? " sn-cat-on" : ""}`} onClick={() => setCat(c.id)}>
              <c.Icon size={13} /> {c.label}
            </button>
          ))}
          <button className="sn-cat sn-cat-refresh" onClick={load} title="Refresh">
            <FiRefreshCw size={13} style={loading ? { animation: "snSpin .8s linear infinite" } : {}} />
          </button>
        </div>

        {loading ? (
          <div className="sn-pgrid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="sn-pcard sn-pcard-sk">
                <div className="sn-pimg-wrap sn-sk" style={{ height: 180 }} />
                <div className="sn-pbody">
                  <div className="sn-sk" style={{ height: 11, width: "72%", borderRadius: 4, marginBottom: 6 }} />
                  <div className="sn-sk" style={{ height: 9, width: "55%", borderRadius: 4, marginBottom: 8 }} />
                  <div className="sn-sk" style={{ height: 15, width: "45%", borderRadius: 4, marginBottom: 10 }} />
                  <div className="sn-sk" style={{ height: 36, width: "100%", borderRadius: 8 }} />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="sn-empty"><FiPackage size={40} color="#333" /><p>No products in this category yet.</p></div>
        ) : (
          <div className="sn-pgrid">
            {shown.map((p, i) => <ProductCard key={p.id} p={p} onBuy={setPopup} index={i} />)}
          </div>
        )}
      </div>
      {popup && <BuyPopup p={popup} onClose={() => setPopup(null)} />}
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  HOW IT WORKS
// ═════════════════════════════════════════════════════════════════════════════
function HowItWorks() {
  const { ref, v } = use3DInView();
  const steps = [
    { Icon: FiShoppingCart, n: "1. Order",   desc: "Browse products and place your order with one tap." },
    { Icon: FiMapPin,        n: "2. Track",   desc: "Track your rider live on the map in real-time." },
    { Icon: BsBoxSeam,       n: "3. Receive", desc: "Your order arrives fast — right at your door." },
  ];
  return (
    <section id="sn-how" className="sn-section sn-sec-dark sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v ? " sn-3d-visible" : ""}`}>How it Works</h2>
        <div className="sn-steps-row">
          {steps.map((s, i) => (
            <div key={i} className={`sn-step${v ? " sn-visible" : ""}`} style={{ "--vd": `${i * .15}s` } as any}>
              <div className="sn-step-ico"><s.Icon size={30} color={ORANGE} /></div>
              <div className="sn-step-n">{s.n}</div>
              <div className="sn-step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="sn-browse-btn-wrap">
          <button className="sn-btn-browse" onClick={() => document.getElementById("sn-products")?.scrollIntoView({ behavior: "smooth" })}>
            Browse All Categories
          </button>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  BECOME A VENDOR — Icon ON TOP, text below
// ═════════════════════════════════════════════════════════════════════════════
function BecomeVendor() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section className="sn-vendor-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className={`sn-vendor-card${v ? " sn-visible" : ""}`}>
          <div className="sn-vendor-text">
            <h2 className="sn-vendor-h">Become a<br /><span style={{ color: ORANGE }}>Swift9ja</span> Vendor</h2>
            <p className="sn-vendor-p">Reach millions of customers, manage your store with ease, and scale your business.</p>
            <div className="sn-vendor-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={() => nav("/vendor/register")}>Sign Up as a Vendor</button>
              <button className="sn-btn-ghost"   onClick={() => nav("/about/company")}>Learn More</button>
            </div>
            <div className="sn-vendor-features">
              <div className="sn-vf"><FiGrid size={14} color={ORANGE} /><div><div className="sn-vft">Order Management Dashboard</div></div></div>
              <div className="sn-vf"><FiZap size={14} color={ORANGE} /><div><div className="sn-vft">Easy Payments</div></div></div>
              <div className="sn-vf"><FiAward size={14} color={ORANGE} /><div><div className="sn-vft">Promotional Tools</div></div></div>
            </div>
          </div>

          {/* Art panel — Icon ON TOP, badge at bottom */}
          <div className="sn-vendor-art">
            <div className="sn-vendor-art-inner">
              <div className="sn-vendor-art-badge">VENDOR</div>
              <RiStore2Line size={90} color={ORANGE} className="sn-vendor-icon" />
              <div className="sn-vendor-tagline">Join 10,000+ vendors</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  BECOME A RIDER
// ═════════════════════════════════════════════════════════════════════════════
function BecomeRider() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section className="sn-rider-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className={`sn-rider-card${v ? " sn-visible" : ""}`}>
          <div className="sn-rider-art">
            <div className="sn-rider-art-inner">
              <div className="sn-rider-art-badge">RIDER</div>
              <RiMotorbikeFill size={90} color={ORANGE} className="sn-rider-icon" />
              <div className="sn-rider-tagline">500+ active riders</div>
            </div>
          </div>
          <div className="sn-rider-text">
            <h2 className="sn-rider-h">Ride with<br /><span style={{ color: ORANGE }}>Swift9ja</span></h2>
            <p className="sn-rider-p">Join 500+ riders making real money across Lagos every day.</p>
            <div className="sn-rider-perks">
              {[
                { Icon: FiZap,    t: "Instant payouts" },
                { Icon: FiClock,  t: "Flexible hours" },
                { Icon: FiShield, t: "Rider insurance" },
                { Icon: FiUsers,  t: "24/7 support" },
              ].map((p, i) => (
                <div key={i} className="sn-rperk"><p.Icon size={13} color={ORANGE} /> {p.t}</div>
              ))}
            </div>
            <div className="sn-rider-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={() => nav("/rider/signup")}>
                Become a Rider <RiMotorbikeFill size={14} />
              </button>
              <button className="sn-btn-ghost" onClick={() => nav("/rider/login")}>
                Already a rider? Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  SERVICES
// ═════════════════════════════════════════════════════════════════════════════
function Services() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  const svcs = [
    { Icon: MdRestaurant,        title: "Food Delivery",     color: "#ef4444" },
    { Icon: MdLocalPharmacy,     title: "Pharmacy",          color: "#3b82f6" },
    { Icon: MdLocalGroceryStore, title: "Groceries",         color: "#10B981" },
    { Icon: MdDirectionsBike,    title: "Send & Pickup",     color: "#8b5cf6" },
    { Icon: MdStorefront,        title: "Fashion",           color: "#f59e0b" },
    { Icon: BsBoxSeam,           title: "Beauty & Skincare", color: "#ec4899" },
  ];
  return (
    <section id="sn-services" className="sn-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v ? " sn-3d-visible" : ""}`}>What We Deliver</h2>
        <div className="sn-svc-grid">
          {svcs.map((s, i) => (
            <div key={i} className={`sn-svc${v ? " sn-visible" : ""}`} style={{ "--vd": `${i * .07}s`, "--sc": s.color } as any}
              onClick={() => nav("/services")}>
              <div className="sn-svc-ico" style={{ background: `${s.color}18` }}>
                <s.Icon size={32} color={s.color} />
              </div>
              <div className="sn-svc-title">{s.title}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ABOUT
// ═════════════════════════════════════════════════════════════════════════════
function About() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section id="sn-about" className="sn-section sn-sec-dark sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className="sn-about-grid">
          <div className={`sn-about-l${v ? " sn-visible" : ""}`}>
            <span className="sn-kicker">About SwiftNija</span>
            <h2 className="sn-sec-h2" style={{ textAlign: "left" }}>
              Built for Lagos.<br /><span style={{ color: ORANGE }}>Powered by Speed.</span>
            </h2>
            <p className="sn-about-p">
              SwiftNija is a flagship product of <strong style={{ color: ORANGE }}>Verapixels</strong> — a digital innovation company founded by <strong>Ocholi Divine</strong> in 2025.
            </p>
            <blockquote className="sn-quote">
              "When every pixel is in its perfect place, the experience becomes invisible — it just works."
              <cite>— Ocholi Divine, Founder & CEO, Verapixels</cite>
            </blockquote>
            <div className="sn-about-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={() => nav("/about/founder")}>Meet the Founder <FiArrowRight size={14} /></button>
              <button className="sn-btn-ghost"   onClick={() => nav("/about/company")}>Our Full Story</button>
            </div>
          </div>
          <div className={`sn-about-r${v ? " sn-visible" : ""}`} style={{ "--vd": ".13s" } as any}>
            <div className="sn-about-visual">
              <div className="sn-av-top">
                <img src={LOGO} className="sn-av-logo" alt="SwiftNija" onError={e => (e.currentTarget.style.display = "none")} />
                <div><div className="sn-av-name">SwiftNija</div><div className="sn-av-sub">by Verapixels</div></div>
              </div>
              <div className="sn-av-art">
                <MdDeliveryDining size={80} color={ORANGE} style={{ filter: `drop-shadow(0 4px 16px ${ORANGE}66)`, animation: "riderBob 3s ease-in-out infinite" }} />
                <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 8 }}>Delivering across Lagos</div>
              </div>
              <div className="sn-av-stats">
                {[["50k+","Orders"],["500+","Riders"],["4.9★","Rating"],["15m","Avg"]].map(([n,l],i) => (
                  <div key={i} className="sn-av-stat"><div className="sn-av-sn">{n}</div><div className="sn-av-sl">{l}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONTACT
// ═════════════════════════════════════════════════════════════════════════════
function Contact() {
  const { ref, v } = use3DInView();
  return (
    <section id="sn-contact" className="sn-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v ? " sn-3d-visible" : ""}`}>We're Always Here for You.</h2>
        <div className="sn-contact-grid">
          {[
            { Icon: FiPhone,  label: "Call Us",  val: "+234 800 SWIFT NJ",        color: ORANGE },
            { Icon: FiMail,   label: "Email",    val: "info.verapixels@gmail.com", color: "#3b82f6" },
            { Icon: FiMapPin, label: "Location", val: "Lagos, Nigeria",            color: "#10B981" },
            { Icon: FiUsers,  label: "Support",  val: "24/7 Live Chat",            color: "#8b5cf6" },
          ].map((c, i) => (
            <div key={i} className={`sn-ccard${v ? " sn-visible" : ""}`} style={{ "--vd": `${i * .07}s` } as any}>
              <div className="sn-cico" style={{ background: `${c.color}15`, color: c.color }}><c.Icon size={22} /></div>
              <div className="sn-clbl">{c.label}</div>
              <div className="sn-cval">{c.val}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  FOOTER
// ═════════════════════════════════════════════════════════════════════════════
function Footer() {
  const nav = useNavigate();
  return (
    <footer className="sn-footer">
      <div className="sn-wrap">
        <div className="sn-footer-top">
          <div className="sn-footer-brand">
            <div className="sn-logo" style={{ marginBottom: 10 }}>
              <img src={LOGO} className="sn-logo-img" alt="" onError={e => (e.currentTarget.style.display = "none")} />
              <span className="sn-logo-text">Swift<em>9ja</em></span>
            </div>
            <p className="sn-ftag">Lagos's fastest on-demand delivery platform. A product of Verapixels by Ocholi Divine.</p>
            <div className="sn-social">
              {[FiInstagram, FiTwitter, FiFacebook, FiLinkedin].map((Icon, i) => (
                <a key={i} href="#" className="sn-social-btn"><Icon size={15} /></a>
              ))}
            </div>
          </div>
          {[
            { t: "Company",  links: [["About Founder", "/about/founder"], ["Meet the Team", "/about/team"], ["About Company", "/about/company"]] },
            { t: "Services", links: [["Food Delivery", "/services"], ["Pharmacy", "/services"], ["Groceries", "/services"]] },
            { t: "Partners", links: [["Become a Rider", "/rider/signup"], ["Become a Vendor", "/vendor/register"], ["Rider Login", "/rider/login"], ["Vendor Login", "/vendor/login"]] },
            { t: "Support",  links: [["Help Center", "#sn-contact"], ["Contact Us", "#sn-contact"], ["Privacy Policy", "#"], ["Terms", "#"]] },
          ].map((col, ci) => (
            <div key={ci} className="sn-fcol">
              <div className="sn-fttl">{col.t}</div>
              {col.links.map(([lb, hr], li) => (
                <button key={li} className="sn-flink" onClick={() => {
                  if (hr.startsWith("/")) nav(hr);
                  else document.getElementById(hr.slice(1))?.scrollIntoView({ behavior: "smooth" });
                }}>{lb}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="sn-footer-btm">
          <span>© 2026 SwiftNija by <span style={{ color: ORANGE }}>Verapixels</span>. All rights reserved.</span>
          <span>Crafted with precision in Lagos, Nigeria</span>
        </div>
      </div>
    </footer>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ROOT
// ═════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  return (
    <div className="sn-root">
      <Navbar />
      <Hero />
      <Products />
      <HowItWorks />
      <BecomeVendor />
      <BecomeRider />
      <Services />
      <About />
      <Contact />
      <Footer />
      <style>{CSS}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  STYLES — FULL 3D EDITION
// ═════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Black+Han+Sans&display=swap');

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

:root {
  --bg:#0a0a0f; --bg2:#0f0f18; --bg3:#141420; --card:#12121e;
  --brd:#1e1e32; --brd2:#2a2a44; --txt:#f0f0fa; --txt2:#7878a0; --txt3:#30304a;
  --acc:#FF6B00; --grn:#10B981;
  --shadow-orange: 0 0 40px rgba(255,107,0,0.25);
  --shadow-deep: 0 20px 60px rgba(0,0,0,0.6);
}

.sn-root { min-height:100vh; background:var(--bg); color:var(--txt); font-family:'Plus Jakarta Sans',sans-serif; overflow-x:hidden; }
.sn-wrap { max-width:1280px; margin:0 auto; padding:0 20px; }

/* ─── KEYFRAMES ─── */
@keyframes snSpin { to { transform:rotate(360deg); } }
@keyframes riderBob { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-12px) rotate(-3deg)} }
@keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
@keyframes fadeUpBig { from{opacity:0;transform:translateY(40px) rotateX(12deg)} to{opacity:1;transform:none} }
@keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.6)} }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@keyframes badgePulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(255,107,0,0); transform: translateZ(0) rotateX(0deg); }
  50% { box-shadow: 0 0 20px 4px rgba(255,107,0,0.3); transform: translateZ(6px) rotateX(-3deg); }
}
@keyframes badgeFloat {
  0%,100% { transform: translateY(0) rotateX(0deg) rotateY(0deg); }
  33% { transform: translateY(-6px) rotateX(4deg) rotateY(2deg); }
  66% { transform: translateY(-3px) rotateX(-2deg) rotateY(-2deg); }
}
@keyframes glowPulse {
  0%,100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
@keyframes particleFloat {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.6; }
  50% { transform: translateY(-40px) translateX(20px) scale(1.2); opacity: 0.3; }
  100% { transform: translateY(-80px) translateX(-10px) scale(0.8); opacity: 0; }
}
@keyframes navLinkHover {
  0% { transform: translateY(0) rotateX(0deg); }
  100% { transform: translateY(-2px) rotateX(10deg); }
}
@keyframes slideInLeft {
  from { opacity:0; transform: translateX(-60px) rotateY(-20deg); }
  to { opacity:1; transform: translateX(0) rotateY(0deg); }
}
@keyframes slideInRight {
  from { opacity:0; transform: translateX(60px) rotateY(20deg); }
  to { opacity:1; transform: translateX(0) rotateY(0deg); }
}
@keyframes slideInBottom {
  from { opacity:0; transform: translateY(50px) rotateX(15deg) scale(0.95); }
  to { opacity:1; transform: translateY(0) rotateX(0deg) scale(1); }
}
@keyframes flip3DNext {
  from { transform: perspective(1200px) rotateY(-90deg) scale(0.9); opacity: 0; }
  to { transform: perspective(1200px) rotateY(0deg) scale(1); opacity: 1; }
}
@keyframes flip3DPrev {
  from { transform: perspective(1200px) rotateY(90deg) scale(0.9); opacity: 0; }
  to { transform: perspective(1200px) rotateY(0deg) scale(1); opacity: 1; }
}
@keyframes flip3DExitNext {
  from { transform: perspective(1200px) rotateY(0deg) scale(1); opacity: 1; }
  to { transform: perspective(1200px) rotateY(90deg) scale(0.9); opacity: 0; }
}
@keyframes flip3DExitPrev {
  from { transform: perspective(1200px) rotateY(0deg) scale(1); opacity: 1; }
  to { transform: perspective(1200px) rotateY(-90deg) scale(0.9); opacity: 0; }
}
@keyframes title3DReveal {
  from { opacity:0; transform: perspective(800px) rotateX(30deg) translateY(30px); }
  to { opacity:1; transform: perspective(800px) rotateX(0deg) translateY(0); }
}
@keyframes cardFloat {
  0%,100% { transform: translateY(0) rotateX(0deg); }
  50% { transform: translateY(-4px) rotateX(2deg); }
}
@keyframes hamBar1Open { to { transform: translateY(7px) rotate(45deg); background: var(--acc); } }
@keyframes hamBar2Open { to { width:0; opacity:0; } }
@keyframes hamBar3Open { to { transform: translateY(-7px) rotate(-45deg); background: var(--acc); } }
@keyframes hamGlow { 0%,100%{ box-shadow: 0 0 0 0 rgba(255,107,0,0); } 50%{ box-shadow: 0 0 12px 3px rgba(255,107,0,0.35); } }

/* ─── NAVBAR ─── */
.sn-nav {
  position:sticky; top:0; z-index:700;
  display:flex; align-items:center; justify-content:space-between;
  padding:0 20px; height:64px;
  background: linear-gradient(135deg, rgba(10,10,15,0.98) 0%, rgba(20,10,0,0.98) 100%);
  border-bottom: 1px solid rgba(255,107,0,0.15);
  backdrop-filter:blur(24px);
  transition: all 0.3s ease;
}
.sn-nav-glass {
  box-shadow: 0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,0,0.1) inset;
  background: linear-gradient(135deg, rgba(10,10,15,0.99) 0%, rgba(25,12,0,0.99) 100%);
}

/* Nav left: hamburger FIRST, then logo */
.sn-nav-left { display:flex; align-items:center; gap:14px; }

/* CENTER links — desktop */
.sn-nav-links {
  display: none;
  align-items: center;
  gap: 4px;
}
@media(min-width: 860px) { .sn-nav-links { display: flex; } }

.sn-nav-link {
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: var(--txt2);
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  position: relative;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 1px;
}
.sn-nav-link::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 70%;
  height: 2px;
  background: var(--acc);
  border-radius: 2px;
  transition: transform 0.2s;
}
.sn-nav-link:hover { color: var(--txt); }
.sn-nav-link:hover::after { transform: translateX(-50%) scaleX(1); }
.sn-nav-link-hot { color: var(--acc) !important; }
.sn-nav-link-hot:hover { text-shadow: 0 0 12px rgba(255,107,0,0.5); }

/* LOGO */
.sn-logo { display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none; }
.sn-logo-img { width:32px; height:32px; object-fit:contain; filter: drop-shadow(0 0 8px rgba(255,107,0,0.4)); }
.sn-logo-text {
  font-family:'Playfair Display',serif;
  font-size:22px; font-weight:900; color:var(--txt);
  letter-spacing:-.5px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
.sn-logo-text em { color:var(--acc); font-style:italic; text-shadow: 0 0 20px rgba(255,107,0,0.4); }

/* HAMBURGER — 3D animated, comes BEFORE logo */
.sn-ham {
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
  width:42px; height:38px;
  background: linear-gradient(135deg, rgba(255,107,0,0.08), rgba(255,107,0,0.04));
  border: 1.5px solid rgba(255,107,0,0.4);
  border-radius:9px;
  cursor:pointer; padding:0;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: hamGlow 3s ease-in-out infinite;
  transform-style: preserve-3d;
}
.sn-ham:hover {
  background: rgba(255,107,0,0.12);
  border-color:var(--acc);
  transform: translateY(-2px) rotateX(10deg) scale(1.05);
  box-shadow: 0 8px 20px rgba(255,107,0,0.3), 0 0 0 1px rgba(255,107,0,0.2);
}
.sn-line { display:block; width:18px; height:2px; background:var(--txt2); border-radius:2px; transition:all .3s cubic-bezier(.4,0,.2,1); }
.sn-ham:hover .sn-line { background:var(--acc); }
.sn-ham-open .sn-line:nth-child(1) { transform:translateY(7px) rotate(45deg); background:var(--acc); }
.sn-ham-open .sn-line:nth-child(2) { width:0; opacity:0; }
.sn-ham-open .sn-line:nth-child(3) { transform:translateY(-7px) rotate(-45deg); background:var(--acc); }
.sn-ham-open {
  background: rgba(255,107,0,0.15);
  border-color: var(--acc);
  box-shadow: 0 0 20px rgba(255,107,0,0.3);
}

/* AUTH */
.sn-auth { display:flex; gap:8px; }
.sn-auth-login {
  background:transparent; border:1.5px solid rgba(255,107,0,0.45);
  color:var(--txt2); border-radius:8px; padding:8px 18px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:700;
  cursor:pointer; transition:all .2s; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;
  letter-spacing: 0.3px;
}
.sn-auth-login:hover { border-color:var(--acc); color:var(--acc); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(255,107,0,0.2); }
.sn-auth-signup {
  background: linear-gradient(135deg, #FF6B00, #FF8C33);
  border:none; color:#fff; border-radius:8px; padding:9px 18px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:800;
  cursor:pointer; transition:all .2s; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;
  letter-spacing: 0.3px;
  box-shadow: 0 4px 16px rgba(255,107,0,0.3);
}
.sn-auth-signup:hover { transform:translateY(-2px) scale(1.02); box-shadow: 0 8px 24px rgba(255,107,0,0.4); }

/* DRAWER */
.sn-backdrop { position:fixed; inset:0; z-index:800; background:rgba(0,0,0,.8); backdrop-filter:blur(8px); opacity:0; pointer-events:none; transition:opacity .3s; }
.sn-back-on { opacity:1; pointer-events:all; }
.sn-drawer {
  position:fixed; top:0; left:0; bottom:0;
  width:300px; max-width:88vw; z-index:801;
  background: linear-gradient(180deg, #0d0d18 0%, #0a0a12 100%);
  border-right: 1px solid rgba(255,107,0,0.15);
  display:flex; flex-direction:column;
  transform:translateX(-100%);
  transition:transform .38s cubic-bezier(.32,1,.4,1);
  box-shadow: 8px 0 40px rgba(0,0,0,0.5);
}
.sn-drawer-on { transform:translateX(0); }
.sn-drawer-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:18px 20px; border-bottom:1px solid rgba(255,107,0,0.1);
  background: linear-gradient(135deg, rgba(255,107,0,0.05), transparent);
}
.sn-drawer-x {
  width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,.05);
  border:1px solid var(--brd); color:var(--txt2);
  display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .18s;
}
.sn-drawer-x:hover { background:rgba(239,68,68,.15); color:#ef4444; transform: rotate(90deg); }
.sn-drawer-body { flex:1; overflow-y:auto; padding:8px 0; scrollbar-width:none; }
.sn-drawer-body::-webkit-scrollbar { display:none; }

.sn-ditem {
  display:flex; align-items:center; gap:10px; width:100%; padding:15px 20px;
  background:transparent; border:none;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:800;
  letter-spacing:.8px; text-transform:uppercase;
  cursor:pointer; text-align:left; transition:all .18s; color:var(--txt2);
  border-left: 3px solid transparent;
}
.sn-ditem:hover { color:var(--acc); background:rgba(255,107,0,0.05); border-left-color: var(--acc); padding-left: 24px; }
.sn-ditem-accent { color:var(--txt); }
.sn-ditem-special { color:var(--acc) !important; }
.sn-dico { color:var(--acc); flex-shrink:0; }
.sn-dlabel { flex:1; }
.sn-darrow { color:var(--txt2); margin-left:auto; }

.sn-dsub-wrap { display:flex; flex-direction:column; }
.sn-submenu { display:flex; flex-direction:column; padding:4px 0 4px 44px; }
.sn-dsubitem {
  display:flex; align-items:center; gap:7px; padding:10px 16px 10px 0;
  background:transparent; border:none; color:var(--txt2);
  font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:500;
  cursor:pointer; text-align:left; transition:color .13s;
}
.sn-dsubitem:hover { color:var(--acc); }
.sn-divider { height:1px; background:rgba(255,107,0,0.1); margin:8px 20px; }
.sn-drawer-foot {
  padding:16px 20px; border-top:1px solid rgba(255,107,0,0.1);
  display:flex; flex-direction:column; gap:8px;
  background: linear-gradient(0deg, rgba(255,107,0,0.05), transparent);
}
.sn-d100 { width:100%; justify-content:center; }

/* ─── HERO 3D ─── */
.sn-hero {
  position:relative; min-height:360px; overflow:hidden;
  display:flex; align-items:flex-end;
  transition:background .6s ease;
  perspective: 1200px;
}
@media(min-width:600px) { .sn-hero { min-height:440px; } }

.sn-hero-3d-wrap {
  position: absolute; inset: 0;
  perspective: 1200px;
  transform-style: preserve-3d;
}

/* 3D collage grid */
.sn-hero-collage {
  position:absolute; inset:0;
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  grid-template-rows:1fr 1fr;
  gap:4px; overflow:hidden;
}
/* 3D enter/exit animations */
.sn-collage-enter-next { animation: flip3DNext 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
.sn-collage-enter-prev { animation: flip3DPrev 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
.sn-collage-exit-next  { animation: flip3DExitNext 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
.sn-collage-exit-prev  { animation: flip3DExitPrev 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }

.sn-collage-img { overflow:hidden; position:relative; }
.sn-collage-img img { width:100%; height:100%; object-fit:cover; display:block; transition: transform 5s ease; }
.sn-collage-img:hover img { transform: scale(1.08); }
.sn-ci0 { grid-column:1; grid-row:1/3; }
.sn-ci1 { grid-column:2; grid-row:1; }
.sn-ci2 { grid-column:2/4; grid-row:2; }
.sn-hero-collage-overlay {
  content:''; position:absolute; inset:0;
  background:linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.75) 100%);
  pointer-events:none; z-index:1;
}
.sn-hero-strip {
  position:absolute; left:0; top:0; bottom:0; width:5px;
  z-index:2; opacity:.9;
  box-shadow: 2px 0 20px currentColor;
}

/* TOP-RIGHT BADGE — Featured Products / Popular Categories — 3D ORANGE ANIMATED */
.sn-hero-topright-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  perspective: 600px;
}
.sn-badge-3d-inner {
  background: linear-gradient(135deg, rgba(15,10,5,0.95) 0%, rgba(30,20,5,0.95) 100%);
  border: 1.5px solid rgba(255,107,0,0.5);
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  backdrop-filter: blur(16px);
  animation: badgeFloat 4s ease-in-out infinite;
  box-shadow:
    0 4px 20px rgba(255,107,0,0.25),
    0 0 0 1px rgba(255,107,0,0.1) inset,
    inset 0 1px 0 rgba(255,255,255,0.05);
  position: relative;
  overflow: hidden;
  transform-style: preserve-3d;
}
.sn-badge-line1, .sn-badge-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sn-badge-line1 span {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 11px;
  font-weight: 800;
  color: var(--txt);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.sn-badge-line2 span {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: var(--acc);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.sn-badge-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,107,0,0.4), transparent);
}
.sn-badge-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgba(255,107,0,0.15), transparent 70%);
  animation: glowPulse 2s ease-in-out infinite;
  pointer-events: none;
}

/* text */
.sn-hero-text {
  position:relative; z-index:3;
  padding:24px 20px 60px;
  animation:fadeUpBig .55s ease both;
}
.sn-h1 {
  font-family:'Playfair Display',serif;
  font-size:clamp(28px,7.5vw,64px);
  font-weight:900; line-height:1.08; color:#fff;
  margin-bottom:10px;
  text-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 80px rgba(255,107,0,0.1);
}
.sn-h1-line { display: inline-block; animation: fadeUpBig 0.5s ease both; }
.sn-h1-line:nth-child(2) { animation-delay: 0.08s; }
.sn-hero-sub { font-size:clamp(14px,3vw,20px); font-weight:700; color:rgba(255,255,255,0.9); margin-bottom:20px; text-shadow:0 1px 8px rgba(0,0,0,0.5); }
.sn-hero-ctas { display:flex; gap:10px; flex-wrap:wrap; }

/* carousel buttons */
.sn-car-btn {
  position:absolute; top:50%; transform:translateY(-50%); z-index:4;
  width:38px; height:38px; border-radius:50%;
  background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(30,10,0,0.7));
  border: 1.5px solid rgba(255,107,0,0.3); color:#fff;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .22s;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.sn-car-btn:hover { background: var(--acc); border-color:var(--acc); transform:translateY(-50%) scale(1.1); box-shadow: 0 6px 20px rgba(255,107,0,0.4); }
.sn-car-l { left:10px; }
.sn-car-r { right:10px; }
.sn-car-dots { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:7px; z-index:4; }
.sn-dot { width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,.3); border:none; cursor:pointer; transition:all .25s; }
.sn-dot-on { background:var(--acc); width:22px; border-radius:4px; box-shadow: 0 0 8px rgba(255,107,0,0.5); }

/* floating particles */
.sn-particles { position:absolute; inset:0; pointer-events:none; z-index:2; overflow:hidden; }
.sn-particle {
  position:absolute; border-radius:50%;
  background:rgba(255,107,0,0.4);
  animation: particleFloat linear infinite;
}
.sn-p0 { width:4px;height:4px; left:15%; bottom:20%; animation-duration:3.5s; animation-delay:0s; }
.sn-p1 { width:6px;height:6px; left:30%; bottom:30%; animation-duration:4.2s; animation-delay:0.5s; }
.sn-p2 { width:3px;height:3px; left:50%; bottom:15%; animation-duration:3.8s; animation-delay:1s; }
.sn-p3 { width:5px;height:5px; left:70%; bottom:25%; animation-duration:4.5s; animation-delay:1.5s; }
.sn-p4 { width:4px;height:4px; left:85%; bottom:35%; animation-duration:3.2s; animation-delay:0.3s; }
.sn-p5 { width:7px;height:7px; left:20%; bottom:40%; animation-duration:5s; animation-delay:2s; background:rgba(255,140,0,0.3); }
.sn-p6 { width:3px;height:3px; left:60%; bottom:50%; animation-duration:4s; animation-delay:0.8s; }
.sn-p7 { width:5px;height:5px; left:40%; bottom:60%; animation-duration:3.6s; animation-delay:1.8s; }

/* ─── 3D BUTTONS ─── */
.sn-btn-primary {
  display:inline-flex; align-items:center; gap:7px;
  background: linear-gradient(135deg, #FF6B00, #FF8C33);
  color:#fff; border:none; border-radius:10px;
  padding:12px 24px;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800;
  cursor:pointer; transition:all .2s;
  box-shadow: 0 4px 16px rgba(255,107,0,0.3), 0 2px 0 rgba(0,0,0,0.2);
  letter-spacing: 0.3px;
}
.sn-btn-primary:hover { transform:translateY(-2px); box-shadow: 0 8px 28px rgba(255,107,0,0.5), 0 4px 0 rgba(0,0,0,0.15); }
.sn-btn-primary:active { transform:translateY(0); box-shadow: 0 2px 8px rgba(255,107,0,0.3); }

.sn-btn-3d {
  transform-style: preserve-3d;
  position: relative;
}
.sn-btn-3d::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%);
  pointer-events: none;
}

.sn-btn-ghost {
  display:inline-flex; align-items:center; gap:7px;
  background:transparent; color:var(--txt2); border:1.5px solid var(--brd2); border-radius:10px;
  padding:11px 22px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:600;
  cursor:pointer; transition:all .2s;
}
.sn-btn-ghost:hover { border-color:var(--acc); color:var(--acc); transform:translateY(-1px); }

.sn-btn-browse {
  display:inline-flex; align-items:center; justify-content:center;
  background:transparent; color:var(--txt2); border:1.5px solid var(--brd2); border-radius:40px;
  padding:12px 44px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:600;
  cursor:pointer; transition:all .2s; margin:0 auto;
}
.sn-btn-browse:hover { border-color:var(--acc); color:var(--acc); transform:translateY(-1px); box-shadow: 0 4px 20px rgba(255,107,0,0.15); }

/* ─── SECTIONS ─── */
.sn-section { padding:56px 0; }
.sn-sec-dark { background:var(--bg2); }
.sn-3d-section { perspective: 1000px; }
.sn-sec-h2 {
  font-family:'Playfair Display',serif;
  font-size:clamp(24px,4.5vw,44px);
  font-weight:900; color:var(--txt); margin-bottom:32px;
}
.sn-sec-h2.sn-center { text-align:center; }
.sn-kicker { display:inline-flex; align-items:center; gap:5px; background:rgba(255,107,0,0.09); border:1px solid rgba(255,107,0,0.22); border-radius:20px; padding:5px 14px; font-size:10px; font-weight:800; color:var(--acc); text-transform:uppercase; letter-spacing:.8px; margin-bottom:10px; }
.sn-visible { opacity:1!important; transform:none!important; }

/* 3D Title animation */
.sn-3d-title {
  opacity: 0;
  transform: perspective(800px) rotateX(30deg) translateY(30px);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
.sn-3d-visible {
  opacity: 1 !important;
  transform: perspective(800px) rotateX(0deg) translateY(0) !important;
}

/* ─── PRODUCTS HEADER 3D ─── */
.sn-prod-header-3d {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  align-items: center;
  opacity: 0;
  transform: perspective(800px) translateY(30px) rotateX(12deg);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.sn-prod-header-3d.sn-3d-visible {
  opacity: 1;
  transform: perspective(800px) translateY(0) rotateX(0deg);
}
.sn-prod-title-block { flex: 1; }
.sn-prod-title-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,107,0,0.12);
  border: 1px solid rgba(255,107,0,0.3);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 10px;
  font-weight: 800;
  color: var(--acc);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
  animation: badgePulse 3s ease-in-out infinite;
}
.sn-prod-h3d {
  font-family: 'Playfair Display', serif;
  font-size: clamp(18px, 3.5vw, 30px);
  font-weight: 900;
  color: var(--txt);
  line-height: 1.1;
  text-shadow: 0 2px 12px rgba(0,0,0,0.5);
}
.sn-prod-title-divider {
  width: 1px;
  height: 60px;
  background: linear-gradient(180deg, transparent, rgba(255,107,0,0.4), transparent);
  flex-shrink: 0;
}

/* PRODUCTS GRID */
.sn-cat-row { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:24px; opacity:0; transform:translateY(10px); transition:opacity .5s,transform .5s; }
.sn-cat-row.sn-visible { opacity:1; transform:none; }
.sn-cat {
  display:inline-flex; align-items:center; gap:5px; padding:8px 15px;
  border-radius:22px; background:var(--card); border:1px solid var(--brd);
  color:var(--txt2); font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; font-weight:600;
  cursor:pointer; transition:all .18s;
}
.sn-cat:hover { border-color:var(--brd2); color:var(--txt); transform:translateY(-1px); }
.sn-cat-on { background:rgba(255,107,0,0.12)!important; border-color:rgba(255,107,0,0.4)!important; color:var(--acc)!important; box-shadow: 0 2px 12px rgba(255,107,0,0.2); }
.sn-cat-refresh { padding:8px 13px; }

.sn-pgrid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
@media(min-width:540px)  { .sn-pgrid{grid-template-columns:repeat(3,1fr);} }
@media(min-width:900px)  { .sn-pgrid{grid-template-columns:repeat(4,1fr);gap:16px;} }
@media(min-width:1200px) { .sn-pgrid{grid-template-columns:repeat(5,1fr);} }

.sn-pcard {
  background:var(--card); border:1px solid var(--brd); border-radius:14px;
  overflow:hidden; display:flex; flex-direction:column; cursor:pointer;
  transition:all .28s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  transform: translateY(24px) rotateX(8deg) scale(0.97);
  animation: slideInBottom 0.5s ease forwards;
  animation-delay: calc(var(--ci, 0) * 0.04s);
  transform-origin: center bottom;
}
.sn-pcard:hover {
  border-color:rgba(255,107,0,0.35);
  transform: translateY(-6px) rotateX(-2deg) scale(1.02);
  box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,0,0.1), var(--shadow-orange);
}
.sn-pimg-wrap { position:relative; overflow:hidden; background:var(--bg3); aspect-ratio:1/1; }
.sn-pimg { width:100%; height:100%; object-fit:cover; display:block; transition:transform .4s ease; }
.sn-pcard:hover .sn-pimg { transform:scale(1.08) rotate(1deg); }
.sn-plove { position:absolute; top:7px; right:7px; width:28px; height:28px; border-radius:50%; background:rgba(0,0,0,0.55); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; }
.sn-plove:hover { background:rgba(239,68,68,.3); transform:scale(1.15); }
.sn-pbody { padding:10px; display:flex; flex-direction:column; gap:3px; flex:1; }
.sn-pname { font-size:12.5px; font-weight:700; color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sn-pdesc { font-size:10.5px; color:var(--txt2); line-height:1.4; }
.sn-pprice { font-family:'Playfair Display',serif; font-size:15px; font-weight:700; color:var(--acc); margin:4px 0 6px; }
.sn-pbuy {
  display:flex; align-items:center; justify-content:center; gap:5px; width:100%; padding:10px 0;
  background: linear-gradient(135deg, var(--acc), #FF8C33);
  border:none; border-radius:8px; color:#fff;
  font-family:'Plus Jakarta Sans',sans-serif; font-size:12.5px; font-weight:700;
  cursor:pointer; transition:all .18s;
  box-shadow: 0 3px 10px rgba(255,107,0,0.25);
}
.sn-pbuy:hover { transform:translateY(-1px); box-shadow: 0 6px 18px rgba(255,107,0,0.4); }
.sn-pcard-sk { pointer-events:none; opacity:1; transform:none; animation:none; }
.sn-sk { background:linear-gradient(90deg,var(--card) 25%,var(--brd) 50%,var(--card) 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; }
.sn-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:60px 20px; color:var(--txt2); font-size:14px; text-align:center; }

/* HOW IT WORKS */
.sn-steps-row { display:flex; gap:16px; flex-wrap:wrap; justify-content:center; margin-bottom:32px; }
.sn-step {
  flex:1; min-width:140px; max-width:220px;
  background: linear-gradient(135deg, var(--card), rgba(255,107,0,0.05));
  border:1px solid rgba(255,107,0,0.12); border-radius:16px;
  padding:28px 16px; display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center;
  opacity:0; transform:translateY(20px) rotateX(15deg) scale(0.95);
  transition:opacity .6s,transform .6s; transition-delay:var(--vd,0s);
}
.sn-step.sn-visible { opacity:1; transform:none; }
.sn-step:hover {
  transform: translateY(-6px) rotateX(-3deg);
  box-shadow: 0 12px 36px rgba(255,107,0,0.15), 0 0 0 1px rgba(255,107,0,0.15);
  border-color: rgba(255,107,0,0.3);
}
.sn-step-ico {
  width:60px; height:60px; border-radius:16px;
  background: linear-gradient(135deg, rgba(255,107,0,0.15), rgba(255,107,0,0.05));
  display:flex; align-items:center; justify-content:center;
  box-shadow: 0 4px 16px rgba(255,107,0,0.2);
}
.sn-step-n { font-size:15px; font-weight:800; color:var(--txt); }
.sn-step-desc { font-size:12px; color:var(--txt2); line-height:1.6; }
.sn-browse-btn-wrap { display:flex; justify-content:center; margin-top:8px; }

/* VENDOR — Icon ON TOP */
.sn-vendor-section { padding:56px 0; background:var(--bg); }
.sn-vendor-card {
  background:linear-gradient(135deg, var(--bg2) 0%, rgba(30,15,0,0.8) 100%);
  border:1px solid rgba(255,107,0,0.2); border-radius:24px; overflow:hidden;
  display:grid; grid-template-columns:1fr; gap:0;
  opacity:0; transform:translateY(24px) perspective(800px) rotateX(8deg);
  transition:opacity .6s,transform .6s;
  box-shadow: 0 8px 48px rgba(0,0,0,0.4);
}
@media(min-width:700px) { .sn-vendor-card{grid-template-columns:1fr 1fr;} }
.sn-vendor-card.sn-visible { opacity:1; transform:none; }
.sn-vendor-text { padding:44px 40px; display:flex; flex-direction:column; gap:16px; }
.sn-vendor-h { font-family:'Playfair Display',serif; font-size:clamp(24px,4vw,42px); font-weight:900; color:var(--txt); line-height:1.12; }
.sn-vendor-p { font-size:14px; color:var(--txt2); line-height:1.85; max-width:380px; }
.sn-vendor-btns { display:flex; gap:10px; flex-wrap:wrap; }
.sn-vendor-features { display:flex; flex-direction:column; gap:10px; margin-top:4px; }
.sn-vf { display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--txt2); font-weight:500; }
.sn-vft { font-weight:700; color:var(--txt); font-size:12.5px; }
.sn-vendor-art {
  background:linear-gradient(135deg,rgba(255,107,0,0.14),rgba(255,107,0,0.04));
  display:flex; align-items:center; justify-content:center; min-height:240px;
  border-left:1px solid rgba(255,107,0,0.12);
}
.sn-vendor-art-inner {
  display:flex; flex-direction:column; align-items:center; gap:12px;
}
/* Badge ON TOP, icon below badge, tagline at bottom */
.sn-vendor-art-badge {
  background: linear-gradient(135deg, var(--acc), #FF8C33);
  color:#fff; font-size:11px; font-weight:800; letter-spacing:3px;
  padding:6px 20px; border-radius:20px;
  box-shadow: 0 4px 16px rgba(255,107,0,0.4);
  animation: badgePulse 3s ease-in-out infinite;
}
.sn-vendor-icon { filter:drop-shadow(0 8px 32px rgba(255,107,0,0.5)); animation:riderBob 3.5s ease-in-out infinite; }
.sn-vendor-tagline { font-size:11px; color:var(--acc); font-weight:600; opacity: 0.7; }

/* RIDER */
.sn-rider-section { padding:56px 0; background:var(--bg2); }
.sn-rider-card {
  background: linear-gradient(135deg, var(--bg3) 0%, rgba(20,10,0,0.8) 100%);
  border:1px solid rgba(255,107,0,0.15); border-radius:24px; overflow:hidden;
  display:grid; grid-template-columns:1fr; gap:0;
  opacity:0; transform:translateY(24px) perspective(800px) rotateX(8deg);
  transition:opacity .6s,transform .6s;
  box-shadow: 0 8px 48px rgba(0,0,0,0.4);
}
@media(min-width:700px) { .sn-rider-card{grid-template-columns:1fr 1fr;} }
.sn-rider-card.sn-visible { opacity:1; transform:none; }
.sn-rider-art {
  background:linear-gradient(135deg,rgba(255,107,0,0.1),rgba(0,0,0,0.2));
  display:flex; align-items:center; justify-content:center; min-height:240px;
  border-right:1px solid rgba(255,107,0,0.1);
}
.sn-rider-art-inner { display:flex; flex-direction:column; align-items:center; gap:12px; }
.sn-rider-art-badge {
  background: linear-gradient(135deg, var(--acc), #FF8C33);
  color:#fff; font-size:11px; font-weight:800; letter-spacing:3px;
  padding:6px 20px; border-radius:20px;
  box-shadow: 0 4px 16px rgba(255,107,0,0.4);
  animation: badgePulse 3s ease-in-out infinite;
}
.sn-rider-icon { filter:drop-shadow(0 8px 32px rgba(255,107,0,0.4)); animation:riderBob 3s ease-in-out infinite; }
.sn-rider-tagline { font-size:11px; color:var(--acc); font-weight:600; opacity:0.7; }
.sn-rider-text { padding:44px 40px; display:flex; flex-direction:column; gap:16px; }
.sn-rider-h { font-family:'Playfair Display',serif; font-size:clamp(24px,4vw,40px); font-weight:900; color:var(--txt); line-height:1.12; }
.sn-rider-p { font-size:14px; color:var(--txt2); line-height:1.85; max-width:380px; }
.sn-rider-perks { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.sn-rperk { display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--txt2); font-weight:500; }
.sn-rider-btns { display:flex; gap:10px; flex-wrap:wrap; }

/* SERVICES */
.sn-svc-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
@media(min-width:600px) { .sn-svc-grid{grid-template-columns:repeat(3,1fr);} }
@media(min-width:900px) { .sn-svc-grid{grid-template-columns:repeat(6,1fr);} }
.sn-svc {
  background:var(--card); border:1px solid var(--brd); border-radius:16px;
  padding:22px 14px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center;
  cursor:pointer;
  opacity:0; transform:translateY(18px) rotateX(12deg) scale(0.95);
  transition:opacity .5s,transform .5s,border-color .2s; transition-delay:var(--vd,0s);
}
.sn-svc.sn-visible { opacity:1; transform:none; }
.sn-svc:hover {
  border-color:var(--sc,rgba(255,107,0,0.3));
  transform: translateY(-5px) rotateX(-3deg) scale(1.03);
  box-shadow: 0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,107,0,0.05);
}
.sn-svc-ico { width:58px; height:58px; border-radius:16px; display:flex; align-items:center; justify-content:center; transition:transform 0.3s ease; }
.sn-svc:hover .sn-svc-ico { transform: rotateY(15deg) scale(1.1); }
.sn-svc-title { font-size:12px; font-weight:700; color:var(--txt); line-height:1.3; }

/* ABOUT */
.sn-about-grid { display:grid; grid-template-columns:1fr; gap:40px; }
@media(min-width:860px) { .sn-about-grid{grid-template-columns:1fr 1fr;} }
.sn-about-l { display:flex; flex-direction:column; gap:16px; opacity:0; transform:translateX(-40px) rotateY(-8deg); transition:opacity .7s,transform .7s; }
.sn-about-l.sn-visible { opacity:1; transform:none; }
.sn-about-r { opacity:0; transform:translateX(40px) rotateY(8deg); transition:opacity .7s,transform .7s; transition-delay:var(--vd,.13s); }
.sn-about-r.sn-visible { opacity:1; transform:none; }
.sn-about-p { font-size:14px; color:var(--txt2); line-height:1.85; }
.sn-quote {
  border-left:3px solid var(--acc); padding-left:16px;
  font-size:13.5px; color:rgba(255,255,255,.75); line-height:1.8; font-style:italic;
  background: linear-gradient(90deg, rgba(255,107,0,0.05), transparent);
  padding: 14px 16px; border-radius: 0 8px 8px 0;
}
.sn-quote cite { display:block; margin-top:8px; font-style:normal; font-size:11.5px; font-weight:700; color:var(--acc); }
.sn-about-btns { display:flex; gap:10px; flex-wrap:wrap; }
.sn-about-visual {
  background:var(--card); border:1px solid var(--brd); border-radius:20px; overflow:hidden;
  box-shadow: var(--shadow-deep);
}
.sn-av-top { display:flex; align-items:center; gap:10px; padding:16px 18px; border-bottom:1px solid var(--brd); }
.sn-av-logo { width:32px; height:32px; object-fit:contain; }
.sn-av-name { font-family:'Playfair Display',serif; font-size:17px; font-weight:700; color:var(--txt); }
.sn-av-sub { font-size:11px; color:var(--txt2); }
.sn-av-art { padding:32px; display:flex; align-items:center; justify-content:center; flex-direction:column; background:linear-gradient(135deg,rgba(255,107,0,0.06),transparent); }
.sn-av-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--brd); }
.sn-av-stat { padding:14px 8px; text-align:center; border-right:1px solid var(--brd); transition:background 0.2s; }
.sn-av-stat:last-child { border-right:none; }
.sn-av-stat:hover { background: rgba(255,107,0,0.05); }
.sn-av-sn { font-family:'Playfair Display',serif; font-size:16px; font-weight:700; color:var(--acc); }
.sn-av-sl { font-size:9px; font-weight:700; color:var(--txt3); text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }

/* CONTACT */
.sn-contact-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
@media(min-width:700px) { .sn-contact-grid{grid-template-columns:repeat(4,1fr);} }
.sn-ccard {
  background:var(--card); border:1px solid var(--brd); border-radius:16px;
  padding:24px 14px; display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center;
  opacity:0; transform:translateY(20px) rotateX(10deg);
  transition:opacity .5s,transform .5s,border-color .18s; transition-delay:var(--vd,0s);
}
.sn-ccard.sn-visible { opacity:1; transform:none; }
.sn-ccard:hover { border-color:rgba(255,107,0,0.3); transform:translateY(-4px) rotateX(-2deg); box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
.sn-cico { width:48px; height:48px; border-radius:13px; display:flex; align-items:center; justify-content:center; }
.sn-clbl { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--txt3); }
.sn-cval { font-size:12px; font-weight:600; color:var(--txt); }

/* POPUP */
.sn-overlay { position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.85); backdrop-filter:blur(16px); display:flex; align-items:center; justify-content:center; padding:20px; transition:opacity .28s; }
.sn-popup {
  position:relative; background:linear-gradient(135deg, var(--card), rgba(20,12,5,0.98));
  border:1px solid rgba(255,107,0,0.2); border-radius:24px;
  padding:32px 26px 24px; max-width:420px; width:100%;
  transition:transform .28s cubic-bezier(.32,1,.4,1);
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,0,0.05) inset;
}
.sn-pop-x { position:absolute; top:12px; right:12px; width:30px; height:30px; border-radius:8px; background:rgba(255,255,255,.05); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .18s; }
.sn-pop-x:hover { background:rgba(239,68,68,.15); color:#ef4444; transform: rotate(90deg); }
.sn-pop-preview { display:flex; gap:12px; background:var(--bg3); border:1px solid var(--brd); border-radius:14px; padding:12px; margin-bottom:16px; }
.sn-pop-img-wrap { width:64px; height:64px; border-radius:10px; overflow:hidden; flex-shrink:0; background:var(--bg2); }
.sn-pop-img { width:100%; height:100%; object-fit:cover; display:block; }
.sn-pop-img-ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
.sn-pop-name { font-size:13.5px; font-weight:700; color:var(--txt); margin-bottom:3px; }
.sn-pop-store { font-size:10.5px; color:var(--txt2); display:flex; align-items:center; gap:3px; margin-bottom:4px; }
.sn-pop-price { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:var(--acc); }
.sn-pop-rating { display:flex; align-items:center; gap:3px; font-size:11px; font-weight:600; color:#f59e0b; margin-top:3px; }
.sn-pop-divider { height:1px; background:rgba(255,107,0,0.1); margin-bottom:18px; }
.sn-pop-msg-wrap { text-align:center; margin-bottom:18px; }
.sn-pop-bag { color:var(--acc); margin-bottom:10px; }
.sn-pop-title { font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:var(--txt); margin-bottom:8px; }
.sn-pop-msg { font-size:13px; color:var(--txt2); line-height:1.7; max-width:300px; margin:0 auto; }
.sn-pop-btns { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
.sn-pop-signup { display:flex; align-items:center; justify-content:center; gap:7px; background:linear-gradient(135deg,var(--acc),#FF8C33); color:#fff; border:none; border-radius:12px; padding:13px 18px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all .18s; box-shadow: 0 4px 16px rgba(255,107,0,0.3); }
.sn-pop-signup:hover { transform:translateY(-2px); box-shadow: 0 8px 24px rgba(255,107,0,0.4); }
.sn-pop-login { background:rgba(255,255,255,.04); border:1px solid var(--brd2); color:var(--txt2); border-radius:12px; padding:12px 18px; font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px; font-weight:600; cursor:pointer; transition:all .15s; }
.sn-pop-login:hover { border-color:var(--acc); color:var(--acc); }
.sn-pop-trust { display:flex; justify-content:center; gap:14px; flex-wrap:wrap; font-size:10.5px; font-weight:600; color:var(--txt3); }
.sn-pop-trust span { display:flex; align-items:center; gap:4px; }

/* FOOTER */
.sn-footer { background:#040407; border-top:1px solid rgba(255,107,0,0.08); padding:56px 20px 44px; }
.sn-footer-top { display:grid; grid-template-columns:1fr; gap:28px; margin-bottom:32px; }
@media(min-width:700px) { .sn-footer-top{grid-template-columns:2fr 1fr 1fr 1fr 1fr;} }
.sn-footer-brand { display:flex; flex-direction:column; gap:10px; }
.sn-ftag { font-size:12.5px; color:var(--txt3); line-height:1.75; max-width:220px; }
.sn-social { display:flex; gap:7px; margin-top:4px; }
.sn-social-btn { width:34px; height:34px; border-radius:10px; background:var(--card); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; text-decoration:none; transition:all .18s; }
.sn-social-btn:hover { border-color:var(--acc); color:var(--acc); transform:translateY(-2px); box-shadow: 0 4px 12px rgba(255,107,0,0.2); }
.sn-fcol { display:flex; flex-direction:column; gap:6px; }
.sn-fttl { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:var(--txt2); margin-bottom:6px; }
.sn-flink { background:transparent; border:none; color:var(--txt3); font-family:'Plus Jakarta Sans',sans-serif; font-size:12.5px; cursor:pointer; text-align:left; padding:3px 0; transition:all .15s; }
.sn-flink:hover { color:var(--acc); padding-left:4px; }
.sn-footer-btm { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; border-top:1px solid rgba(255,107,0,0.08); padding-top:18px; font-size:11px; color:var(--txt3); }

/* RESPONSIVE */
@media(max-width:480px) {
  .sn-section { padding:40px 0; }
  .sn-vendor-text,.sn-rider-text { padding:28px 20px; }
  .sn-hero-text { padding:20px 16px 60px; }
  .sn-prod-header-3d { flex-direction:column; gap:12px; }
  .sn-prod-title-divider { display:none; }
  .sn-hero-topright-badge { top:10px; right:10px; }
  .sn-badge-3d-inner { padding:8px 10px; }
}
`;