// src/Pages/Landingpage.tsx  —  SwiftNija · ULTIMATE 3D LIVE EDITION
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  FiShoppingBag, FiLogIn, FiUserPlus, FiX, FiChevronRight,
  FiMapPin, FiStar, FiShield, FiZap, FiClock, FiPackage,
  FiInstagram, FiTwitter, FiFacebook, FiLinkedin, FiPhone, FiMail,
  FiUsers, FiAward, FiHeart, FiArrowRight, FiGrid, FiRefreshCw,
  FiChevronLeft, FiShoppingCart, FiChevronDown, FiChevronUp,
  FiHome, FiInfo, FiSettings,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike, MdDeliveryDining,
} from "react-icons/md";
import {
  RiMotorbikeFill, RiStore2Line, RiVerifiedBadgeFill,
} from "react-icons/ri";
import { BsLightningChargeFill, BsBoxSeam } from "react-icons/bs";

const ORANGE = "#FF6B00";

// ─── INLINE SVG LOGO ──────────────────────────────────────────────────────────
const LogoSVG = ({ size = 48 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
    viewBox="62 180 280 270" style={{ display: "block", flexShrink: 0 }}>
    <g fill="#eb3e05">
      <path d="M62.92 437.56 c0 -0.44 14.90 -14.55 33.92 -32 19.61 -18.04 45.42 -42.03 63.41 -58.99 9.05 -8.55 20.45 -19.27 25.32 -23.89 8.46 -7.91 67.94 -63.86 78.90 -74.18 2.85 -2.70 14.70 -13.86 26.30 -24.83 47.68 -45.03 47.93 -45.23 49.45 -45.23 1.08 0 1.08 0.10 -0.59 1.87 -2.56 2.70 -14.45 16.86 -18.58 22.12 -18.14 23.10 -26.79 47.59 -24.58 69.51 0.93 9 0.84 10.47 -0.74 14.40 -6.44 15.83 -13.08 25.07 -24.78 34.41 -4.23 3.39 -5.51 4.18 -6.88 4.18 l-1.67 0 0.34 -2.51 c0.20 -1.43 0.34 -5.36 0.34 -8.75 -0.05 -9.09 -2.06 -15.88 -6.05 -20.45 -1.23 -1.43 -1.87 -1.72 -3.39 -1.72 -1.08 0 -2.06 0.20 -2.21 0.49 -0.15 0.25 -0.98 0.79 -1.87 1.23 -0.88 0.44 -3.34 2.31 -5.51 4.18 -2.16 1.92 -4.57 3.83 -5.36 4.33 -0.84 0.44 -2.46 1.72 -3.69 2.80 -3.83 3.34 -7.13 5.95 -8.01 6.29 -1.13 0.39 -6.24 4.38 -9.49 7.37 -1.43 1.28 -2.75 2.31 -3.05 2.31 -0.25 0 -1.87 1.23 -3.59 2.70 -1.72 1.47 -3.29 2.70 -3.54 2.70 -0.25 0 -1.47 0.98 -2.75 2.11 -2.80 2.56 -8.85 7.23 -9.39 7.23 -0.25 0 -2.41 1.77 -4.77 3.93 -2.41 2.16 -4.67 3.93 -5.06 3.93 -0.39 0 -1.97 1.13 -3.54 2.46 -1.57 1.38 -3 2.46 -3.24 2.46 -0.20 0.05 -2.06 1.47 -4.08 3.20 -4.08 3.54 -10.96 9.05 -12.24 9.83 -0.44 0.29 -1.67 1.28 -2.80 2.21 -3 2.56 -7.82 6.29 -9.88 7.72 -2.11 1.38 -5.60 4.08 -10.13 7.77 -1.67 1.38 -3.93 3.15 -5.01 3.93 -1.08 0.84 -4.18 3.24 -6.83 5.41 -2.70 2.11 -5.51 4.33 -6.24 4.92 -0.79 0.54 -3.10 2.31 -5.16 3.93 -2.06 1.62 -4.38 3.39 -5.11 3.93 -2.06 1.52 -5.31 4.08 -10.37 8.11 -4.87 3.93 -5.31 4.23 -12.73 10.03 -2.56 2.02 -6.19 4.92 -8.11 6.39 -1.87 1.52 -4.42 3.49 -5.60 4.38 -1.23 0.84 -3 2.26 -3.93 3.10 -2.75 2.36 -6.49 5.11 -6.98 5.11 -0.25 0 -0.44 -0.20 -0.44 -0.44z"/>
    </g>
    <g fill="#fd961b">
      <path d="M127.67 356.79 c-5.21 -6.98 -11.99 -22.51 -14.35 -32.99 -2.46 -10.77 -3 -26.74 -1.23 -37.07 4.52 -26.40 18.29 -48.81 38.84 -63.17 6.88 -4.77 16.57 -9.73 24.14 -12.24 14.65 -4.92 28.71 -6.34 44.59 -4.52 4.52 0.49 11.16 0.79 17.80 0.79 9.05 0.05 11.80 -0.15 19.17 -1.28 10.57 -1.67 17.16 -3.10 24.83 -5.46 8.06 -2.51 11.01 -3.74 20.25 -8.21 5.80 -2.80 8.46 -3.88 9.83 -3.88 l1.87 0.05 -3.39 3.20 c-5.26 5.06 -18.68 13.37 -29.35 18.14 -19.32 8.75 -33.67 12.68 -55.01 15.24 -20.94 2.46 -32.59 5.46 -44.10 11.36 -28.22 14.50 -46.50 40.51 -52.01 74.13 -1.23 7.23 -2.36 23.25 -1.72 24.33 0.25 0.54 0.49 2.06 0.49 3.39 0 1.33 0.44 5.70 0.98 9.68 0.54 3.98 0.98 7.47 0.98 7.67 0 0.25 0.34 0.44 0.84 0.44 0.69 0 0.69 0.10 -0.10 0.98 -1.23 1.38 -1.97 1.23 -3.34 -0.59z"/>
    </g>
    <g fill="#f87915">
      <path d="M94.88 433.58 c0 -1.62 7.37 -8.50 13.72 -12.73 9.59 -6.49 14.06 -8.90 16.32 -8.90 1.28 0 2.26 -0.34 2.90 -0.98 3.29 -3.29 8.21 -2.16 7.77 1.77 -0.15 1.38 -0.05 1.67 0.69 1.67 0.49 0 0.88 0.29 0.88 0.64 0 0.34 -1.97 1.23 -4.52 2.02 -4.33 1.38 -5.65 1.87 -10.91 4.18 -1.18 0.54 -3 1.13 -4.03 1.33 -2.36 0.44 -11.11 4.77 -17.75 8.85 -4.08 2.46 -5.06 2.90 -5.06 2.16z"/>
    </g>
    <g fill="#ef7218">
      <path d="M132.29 414.80 c-0.34 -0.88 -0.20 -1.23 0.44 -1.47 0.49 -0.20 1.03 -0.59 1.28 -0.93 0.20 -0.34 0.15 -0.49 -0.20 -0.25 -0.29 0.15 -0.64 -0.15 -0.84 -0.69 -0.20 -0.59 -0.54 -0.84 -0.88 -0.64 -0.34 0.20 -0.84 0.39 -1.13 0.44 -0.29 0.05 -1.13 0.64 -1.87 1.33 -0.98 0.88 -1.82 1.23 -3.15 1.18 -1.03 -0.05 -2.11 0.10 -2.46 0.34 -0.39 0.25 -0.59 -0.05 -0.59 -0.88 0 -1.13 0.64 -1.57 5.31 -3.93 7.13 -3.59 19.86 -8.55 28.86 -11.31 12.49 -3.79 22.12 -5.85 38.34 -8.16 18.68 -2.65 30.13 -5.90 42.28 -11.80 24.92 -12.14 42.37 -31.90 51.57 -58.35 3.44 -9.93 5.80 -21.78 6.49 -32.44 0.34 -4.82 0.39 -5.06 1.43 -5.06 0.98 0 1.28 0.59 2.36 4.57 3.24 11.40 4.72 24.92 3.83 35 -1.43 16.32 -5.95 30.72 -13.76 43.70 -8.01 13.22 -21.92 26.99 -32.69 32.25 -2.21 1.08 -4.72 2.51 -5.60 3.15 -1.82 1.38 -3.34 1.92 -11.16 4.23 -2.95 0.88 -5.65 1.82 -5.90 2.02 -0.64 0.49 -6.10 1.67 -11.45 2.46 -3.29 0.49 -6.24 0.49 -15.98 -0.10 -13.52 -0.79 -32.74 -0.74 -39.67 0.10 -6.73 0.84 -19.07 3.24 -25.02 4.92 -6.44 1.77 -9.24 1.87 -9.83 0.34z"/>
    </g>
    <g fill="#de3404">
      <path d="M257.79 338.21 c2.11 -4.47 4.72 -12.39 4.72 -14.31 0 -1.08 0.84 -1.67 1.13 -0.84 0.10 0.39 1.57 -0.44 3.98 -2.26 8.16 -6.24 14.40 -12.98 19.22 -20.65 2.75 -4.42 7.18 -14.11 8.65 -19.02 0.59 -1.92 1.23 -3.29 1.43 -3.05 0.64 0.74 1.52 5.21 1.08 5.51 -0.25 0.15 -0.59 2.51 -0.79 5.21 -0.49 7.08 -1.62 14.35 -3.29 21.33 -1.67 6.69 -5.36 17.65 -6.64 19.61 -0.69 1.08 -0.88 1.13 -1.38 0.49 -0.54 -0.74 -0.88 -0.74 -3.24 -0.15 -0.69 0.20 -1.43 0.29 -1.72 0.29 -0.25 -0.05 -2.06 -0.10 -3.98 -0.20 -1.87 -0.10 -3.74 -0.34 -4.13 -0.59 -0.39 -0.25 -0.54 -0.20 -0.34 0.10 0.20 0.29 -1.23 0.49 -3.88 0.54 -3.98 0 -4.18 -0.05 -4.87 -1.28 -0.39 -0.74 -0.69 -1.03 -0.74 -0.69 0 0.84 -5.60 12.39 -6.59 13.62 -0.44 0.54 0.20 -1.13 1.38 -3.69z"/>
    </g>
  </svg>
);

// ─── TYPES & HELPERS ──────────────────────────────────────────────────────────
type Prod = {
  id: string; name: string; price: string; img: string | null;
  cat: string; store: string; rating: number; vendorId?: string; desc?: string;
};

function normCat(r = "") {
  const s = r.toLowerCase();
  if (s.includes("restaurant") || s.includes("food") || s.includes("fast")) return "food";
  if (s.includes("pharma") || s.includes("drug") || s.includes("medicine")) return "pharmacy";
  if (s.includes("grocer") || s.includes("supermarket")) return "groceries";
  if (s.includes("fashion") || s.includes("cloth") || s.includes("boutique")) return "fashion";
  if (s.includes("beauty") || s.includes("skin") || s.includes("makeup")) return "beauty";
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
    snap.forEach((d) => {
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
  return out.sort(() => Math.random() - 0.5);
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
  { id: "all", label: "All", Icon: FiGrid },
  { id: "food", label: "Food", Icon: MdRestaurant },
  { id: "pharmacy", label: "Pharmacy", Icon: MdLocalPharmacy },
  { id: "groceries", label: "Groceries", Icon: MdLocalGroceryStore },
  { id: "fashion", label: "Fashion", Icon: MdStorefront },
  { id: "beauty", label: "Beauty", Icon: FiHeart },
  { id: "electronics", label: "Electronics", Icon: BsLightningChargeFill },
];

const DEFAULT_SLIDES = [
  { headline: "Your Swift Door\nto Everything.", sub: "Eat. Shop. Send.", bg: "#e76610", accent: ORANGE, imgs: ["/chicken001.jpg","/egusi001.jpg","/friedrice001.jpg","/jpllof001.jpg"] },
  { headline: "Your Swift Door\nto Everything.", sub: "Eat. Shop. Send.", bg: "#1938e6", accent: ORANGE, imgs: ["/fas001.jpg","/fas002.jpg","/fas003.jpg","/fas004.jpg"] },
  { headline: "Your Swift Door\nto Everything.", sub: "Eat. Shop. Send.", bg: "#e61919", accent: ORANGE, imgs: ["/sm001.jpg","/sm002.jpg","/sm003.jpg","/sm004.jpg"] },
  { headline: "Your Swift Door\nto Everything.", sub: "Eat. Shop. Send.", bg: "#e61919", accent: ORANGE, imgs: ["/tv001.jpg","/tv002.jpg","/tv003.jpg","/tv004.jpg"] },
  { headline: "Your Swift Door\nto Everything.", sub: "Eat. Shop. Send.", bg: "#1a0a00", accent: ORANGE, imgs: ["/icecream001.jpg","/icecream002.jpg","/choko002.jpg","/choco001.jpg"] },
  { headline: "Fast Delivery\nAcross Lagos.", sub: "Order in seconds. Delivered in minutes.", bg: "#001a0a", accent: "#10B981", imgs: ["/nivia001.jpg","/nevia002.jpg","/peff001.jpg","/peff002.jpg"] },
  { headline: "500+ Riders\nReady Now.", sub: "Track your order live, every step.", bg: "#0a0010", accent: "#8b5cf6", imgs: ["/domi001.jpg","/rice001.jpg","https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80","/yam.jpg"] },
];

// ═══════════════════════════════════════════════════════════════════════════
//  FLOATING 3D ORBS — decorative background depth layers
// ═══════════════════════════════════════════════════════════════════════════
function FloatingOrbs() {
  return (
    <div className="sn-orbs" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <div key={i} className={`sn-orb sn-orb-${i}`} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DELIVERY PATH ANIMATION — scroll storytelling dots
// ═══════════════════════════════════════════════════════════════════════════
function DeliveryPath() {
  const steps = [
    { emoji: "🛒", label: "Order Placed" },
    { emoji: "📦", label: "Packed" },
    { emoji: "🏍️", label: "Dispatched" },
    { emoji: "📍", label: "Nearby" },
    { emoji: "🎉", label: "Delivered!" },
  ];
  return (
    <div className="sn-path-section">
      <div className="sn-path-track">
        <div className="sn-path-line" />
        <div className="sn-path-rider">🏍️</div>
        {steps.map((s, i) => (
          <div key={i} className="sn-path-stop" style={{ left: `${i * 25}%` }}>
            <div className="sn-path-node">{s.emoji}</div>
            <div className="sn-path-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAVBAR
// ═══════════════════════════════════════════════════════════════════════════
function Navbar() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [aboutOpen, setAbout] = useState(false);

  useEffect(() => {
    const fn = () => setStuck(window.scrollY > 60);
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
        {/* Animated border beam */}
        <div className="sn-nav-beam" />

        <div className="sn-nav-left">
          <button className={`sn-ham${open ? " sn-ham-open" : ""}`} onClick={() => setOpen(v => !v)} aria-label="Menu">
            <span className="sn-line" /><span className="sn-line" /><span className="sn-line" />
          </button>
          <div className="sn-logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <LogoSVG size={44} />
            <span className="sn-logo-text-desktop">Swift<em>9ja</em></span>
          </div>
        </div>

        <nav className="sn-nav-links">
          <button className="sn-nav-link" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Home</button>
          <div className="sn-nav-dropdown-wrap">
            <button className="sn-nav-link sn-nav-link-drop" onClick={() => scroll("sn-about")}>
              About <FiChevronDown size={11} />
            </button>
            <div className="sn-nav-dropdown">
              <button className="sn-nav-dditem" onClick={() => go("/about/founder")}>About Founder</button>
              <button className="sn-nav-dditem" onClick={() => go("/about/team")}>Meet the Team</button>
              <button className="sn-nav-dditem" onClick={() => go("/about/company")}>About Company</button>
            </div>
          </div>
          <button className="sn-nav-link" onClick={() => go("/services")}>Services</button>
          <button className="sn-nav-link sn-nav-link-hot" onClick={() => go("/vendor/register")}>Vendor</button>
          <button className="sn-nav-link sn-nav-link-hot" onClick={() => go("/rider/signup")}>Rider</button>
        </nav>

        <div className="sn-auth">
          <button className="sn-auth-login" onClick={() => nav("/login")}>Login</button>
          <button className="sn-auth-signup" onClick={() => nav("/signup")}>Sign Up</button>
        </div>
      </header>

      <div className={`sn-backdrop${open ? " sn-back-on" : ""}`} onClick={() => setOpen(false)} />

      <nav className={`sn-drawer${open ? " sn-drawer-on" : ""}`}>
        <div className="sn-drawer-head">
          <div className="sn-logo">
            <LogoSVG size={40} />
            <span style={{ display:"inline",fontSize:20,fontFamily:"'Playfair Display',serif",fontWeight:900,color:"#f0f0fa" }}>
              Swift<em style={{ color:ORANGE,fontStyle:"italic" }}>9ja</em>
            </span>
          </div>
          <button className="sn-drawer-x" onClick={() => setOpen(false)}><FiX size={18} /></button>
        </div>
        <div className="sn-drawer-body">
          <button className="sn-ditem sn-ditem-accent" onClick={() => { window.scrollTo({ top:0,behavior:"smooth" }); setOpen(false); }}>
            <FiHome size={15} className="sn-dico" /><span className="sn-dlabel">HOME</span>
          </button>
          <div className="sn-dsub-wrap">
            <button className="sn-ditem sn-ditem-accent" onClick={() => setAbout(v => !v)}>
              <FiInfo size={15} className="sn-dico" /><span className="sn-dlabel">ABOUT</span>
              <span className="sn-darrow">{aboutOpen ? <FiChevronUp size={13}/> : <FiChevronDown size={13}/>}</span>
            </button>
            {aboutOpen && (
              <div className="sn-submenu">
                <button className="sn-dsubitem" onClick={() => go("/about/founder")}><FiChevronRight size={10} color={ORANGE}/> About Founder</button>
                <button className="sn-dsubitem" onClick={() => go("/about/team")}><FiChevronRight size={10} color={ORANGE}/> Meet the Team</button>
                <button className="sn-dsubitem" onClick={() => go("/about/company")}><FiChevronRight size={10} color={ORANGE}/> About Company</button>
              </div>
            )}
          </div>
          <button className="sn-ditem sn-ditem-accent" onClick={() => go("/services")}>
            <FiSettings size={15} className="sn-dico"/><span className="sn-dlabel">OUR SERVICES</span>
          </button>
          <div className="sn-divider"/>
          <button className="sn-ditem sn-ditem-special" onClick={() => go("/vendor/register")}>
            <RiStore2Line size={16} className="sn-dico" style={{ color:ORANGE }}/><span className="sn-dlabel" style={{ color:ORANGE }}>BECOME A VENDOR</span>
          </button>
          <button className="sn-ditem sn-ditem-special" onClick={() => go("/rider/signup")}>
            <RiMotorbikeFill size={16} className="sn-dico" style={{ color:ORANGE }}/><span className="sn-dlabel" style={{ color:ORANGE }}>BECOME A RIDER</span>
          </button>
        </div>
        <div className="sn-drawer-foot">
          <button className="sn-auth-login sn-d100" onClick={() => go("/login")}><FiLogIn size={14}/> Login</button>
          <button className="sn-auth-signup sn-d100" onClick={() => go("/signup")}><FiUserPlus size={14}/> Create Account</button>
        </div>
      </nav>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HERO CAROUSEL
// ═══════════════════════════════════════════════════════════════════════════
function Hero() {
  const nav = useNavigate();
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [dir, setDir] = useState<"next"|"prev">("next");
  const [animating, setAnim] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const SLIDES = DEFAULT_SLIDES;

  const go = useCallback((next: number, direction: "next"|"prev" = "next") => {
    if (animating) return;
    setDir(direction); setPrev(cur); setCur(next); setAnim(true);
    setTimeout(() => { setPrev(null); setAnim(false); }, 700);
  }, [cur, animating]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCur(c => {
        const next = (c + 1) % SLIDES.length;
        setDir("next"); setPrev(c); setAnim(true);
        setTimeout(() => { setPrev(null); setAnim(false); }, 700);
        return next;
      });
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [SLIDES.length]);

  const slide = SLIDES[cur];

  return (
    <section className="sn-hero" style={{ background: slide.bg }}>
      {/* 3D tilt overlay grid */}
      <div className="sn-hero-3d-wrap">
        {prev !== null && (
          <div className={`sn-hero-collage sn-collage-exit${dir==="next"?"-next":"-prev"}`}>
            {SLIDES[prev].imgs.map((src, i) => (
              <div key={`prev-${i}`} className={`sn-collage-img sn-ci${i}`}>
                <img src={src} alt="" onError={e=>(e.currentTarget.src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80")}/>
              </div>
            ))}
            <div className="sn-hero-collage-overlay"/>
          </div>
        )}
        <div className={`sn-hero-collage${animating?(dir==="next"?" sn-collage-enter-next":" sn-collage-enter-prev"):""}`}>
          {slide.imgs.map((src, i) => (
            <div key={`${cur}-${i}`} className={`sn-collage-img sn-ci${i}`}>
              <img src={src} alt="" onError={e=>(e.currentTarget.src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80")}/>
            </div>
          ))}
          <div className="sn-hero-collage-overlay"/>
          <div className="sn-hero-strip" style={{ background: slide.accent }}/>
        </div>
      </div>

      {/* Kinetic floating shapes */}
      <div className="sn-hero-shapes" aria-hidden="true">
        <div className="sn-shape sn-shape-0"/>
        <div className="sn-shape sn-shape-1"/>
        <div className="sn-shape sn-shape-2"/>
      </div>

      <div className="sn-hero-text" key={cur}>
        <div className="sn-hero-badge">
          <span className="sn-badge-dot"/>
          <span>Live Delivery • Lagos</span>
        </div>
        <h1 className="sn-h1">
          {slide.headline.split("\n").map((line, i) => (
            <span key={i} className="sn-h1-line">{line}<br/></span>
          ))}
        </h1>
        <p className="sn-hero-sub">{slide.sub}</p>
        <div className="sn-hero-ctas">
          <button className="sn-btn-primary sn-btn-3d" onClick={() => nav("/signup")}>
            Order Now <FiArrowRight size={14}/>
          </button>
          <button className="sn-btn-ghost" onClick={() => document.getElementById("sn-products")?.scrollIntoView({ behavior:"smooth" })}>
            Browse All Categories
          </button>
        </div>
        {/* Stats row */}
        <div className="sn-hero-stats">
          {[["50k+","Orders"],["500+","Riders"],["4.9★","Rating"],["15m","Delivery"]].map(([n,l],i)=>(
            <div key={i} className="sn-hero-stat">
              <span className="sn-hs-n">{n}</span>
              <span className="sn-hs-l">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="sn-car-btn sn-car-l" onClick={()=>go((cur-1+SLIDES.length)%SLIDES.length,"prev")}><FiChevronLeft size={20}/></button>
      <button className="sn-car-btn sn-car-r" onClick={()=>go((cur+1)%SLIDES.length,"next")}><FiChevronRight size={20}/></button>

      <div className="sn-car-dots">
        {SLIDES.map((_,i)=>(
          <button key={i} className={`sn-dot${i===cur?" sn-dot-on":""}`} onClick={()=>go(i,i>cur?"next":"prev")}/>
        ))}
      </div>

      <div className="sn-particles">
        {[...Array(10)].map((_,i)=>(<div key={i} className={`sn-particle sn-p${i}`}/>))}
      </div>

      {/* THE WAVE — transitions hero into products section */}
      <div className="sn-hero-wave">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path fill="#0f0f18" fillOpacity="1"
            d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,64C960,75,1056,85,1152,80C1248,75,1344,53,1392,42.7L1440,32L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z"/>
        </svg>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BUY POPUP
// ═══════════════════════════════════════════════════════════════════════════
function BuyPopup({ p, onClose }: { p: Prod; onClose: () => void }) {
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setShow(true), 20);
    return () => { clearTimeout(t); document.body.style.overflow = ""; };
  }, []);
  const close = () => { setShow(false); setTimeout(onClose, 300); };

  const modal = (
    <div onClick={close} style={{ position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",opacity:show?1:0,transition:"opacity 0.25s ease" }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:"relative",background:"linear-gradient(135deg,#12121e,#140c05)",border:"1px solid rgba(255,107,0,0.25)",borderRadius:24,padding:"32px 26px 24px",maxWidth:420,width:"100%",boxShadow:"0 24px 80px rgba(0,0,0,0.8),0 0 0 1px rgba(255,107,0,0.08) inset",transform:show?"translateY(0) scale(1)":"translateY(40px) scale(0.93)",opacity:show?1:0,transition:"transform 0.3s cubic-bezier(.32,1,.4,1),opacity 0.3s ease" }}>
        <button onClick={close} style={{ position:"absolute",top:12,right:12,width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid #1e1e32",color:"#7878a0",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .18s" }} onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(239,68,68,0.15)";(e.currentTarget as HTMLButtonElement).style.color="#ef4444"}} onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,0.05)";(e.currentTarget as HTMLButtonElement).style.color="#7878a0"}}>
          <FiX size={15}/>
        </button>
        <div style={{ display:"flex",gap:12,background:"#141420",border:"1px solid #1e1e32",borderRadius:14,padding:12,marginBottom:16 }}>
          <div style={{ width:64,height:64,borderRadius:10,overflow:"hidden",flexShrink:0,background:"#0f0f18" }}>
            {p.img ? <img src={p.img} alt={p.name} style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }}/> : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}><FiPackage size={28} color="#666"/></div>}
          </div>
          <div>
            <div style={{ fontSize:13.5,fontWeight:700,color:"#f0f0fa",marginBottom:3 }}>{p.name}</div>
            <div style={{ fontSize:10.5,color:"#7878a0",display:"flex",alignItems:"center",gap:3,marginBottom:4 }}><RiVerifiedBadgeFill size={11} color="#3b82f6"/> {p.store}</div>
            <div style={{ fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:ORANGE }}>₦{p.price}</div>
            <div style={{ display:"flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600,color:"#f59e0b",marginTop:3 }}><FiStar size={11} fill="#f59e0b" color="#f59e0b"/> {p.rating.toFixed(1)}</div>
          </div>
        </div>
        <div style={{ height:1,background:"rgba(255,107,0,0.1)",marginBottom:18 }}/>
        <div style={{ textAlign:"center",marginBottom:18 }}>
          <div style={{ display:"flex",justifyContent:"center",marginBottom:10 }}><FiShoppingBag size={32} color={ORANGE}/></div>
          <h2 style={{ fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:"#f0f0fa",marginBottom:8 }}>Ready to order?</h2>
          <p style={{ fontSize:13,color:"#7878a0",lineHeight:1.7,maxWidth:300,margin:"0 auto" }}>Create a free SwiftNija account to place orders and track deliveries in real time.</p>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:14 }}>
          <button onClick={()=>nav("/signup")} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:7,background:"linear-gradient(135deg,#FF6B00,#FF8C33)",color:"#fff",border:"none",borderRadius:12,padding:"13px 18px",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(255,107,0,0.35)",transition:"all .18s" }} onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLButtonElement).style.boxShadow="0 8px 24px rgba(255,107,0,0.5)"}} onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.transform="";(e.currentTarget as HTMLButtonElement).style.boxShadow="0 4px 16px rgba(255,107,0,0.35)"}}>
            <FiUserPlus size={16}/> Create Free Account
          </button>
          <button onClick={()=>nav("/login")} style={{ background:"rgba(255,255,255,0.04)",border:"1px solid #2a2a44",color:"#7878a0",borderRadius:12,padding:"12px 18px",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:"pointer",transition:"all .15s" }} onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#FF6B00";(e.currentTarget as HTMLButtonElement).style.color="#FF6B00"}} onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#2a2a44";(e.currentTarget as HTMLButtonElement).style.color="#7878a0"}}>
            <FiLogIn size={15} style={{ marginRight:6,verticalAlign:"middle" }}/> Already have an account? Login
          </button>
        </div>
        <div style={{ display:"flex",justifyContent:"center",gap:14,flexWrap:"wrap",fontSize:10.5,fontWeight:600,color:"#30304a" }}>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><FiShield size={11} color="#10B981"/> Free to join</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><FiZap size={11} color={ORANGE}/> Instant checkout</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><FiClock size={11} color={ORANGE}/> 15 min avg</span>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCT CARD with 3D tilt
// ═══════════════════════════════════════════════════════════════════════════
function ProductCard({ p, onBuy, index }: { p: Prod; onBuy: (p: Prod) => void; index: number }) {
  const [liked, setLiked] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const FALLBACK = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80";

  // 3D tilt on mousemove
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotX = (-y / rect.height) * 12;
    const rotY = (x / rect.width) * 12;
    card.style.transform = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px) scale(1.03)`;
  };
  const handleMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = "";
  };

  return (
    <div ref={cardRef} className="sn-pcard" style={{ "--ci": index } as any}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="sn-pimg-wrap">
        <img src={p.img && !imgErr ? p.img : FALLBACK} alt={p.name} className="sn-pimg" onError={()=>setImgErr(true)}/>
        <button className="sn-plove" onClick={e=>{e.stopPropagation();setLiked(v=>!v)}}>
          <FiHeart size={13} fill={liked?"#ef4444":"none"} color={liked?"#ef4444":"#aaa"}/>
        </button>
        <div className="sn-pcard-shine"/>
      </div>
      <div className="sn-pbody">
        <div className="sn-pname">{p.name}</div>
        {p.desc && <div className="sn-pdesc">{p.desc.slice(0,60)}{p.desc.length>60?"...":""}</div>}
        <div className="sn-pprice">₦{p.price}</div>
        <button className="sn-pbuy" onClick={()=>onBuy(p)}>
          <FiShoppingCart size={13}/> Add to Cart
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTS SECTION
//  • Wave SVG from hero flows INTO this section
//  • "Shop Popular Categories" heading sits ON TOP of the wave
//  • "Browse All →" link → /login
// ═══════════════════════════════════════════════════════════════════════════
function Products() {
  const nav = useNavigate();
  const [prods, setProds] = useState<Prod[]>([]);
  const [loading, setLoad] = useState(true);
  const [cat, setCat] = useState("all");
  const [popup, setPopup] = useState<Prod | null>(null);
  const { ref, v } = use3DInView();

  const load = useCallback(async () => {
    setLoad(true); setProds(await fetchProds()); setLoad(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = cat === "all" ? prods : prods.filter(p => p.cat === cat);

  return (
    <section id="sn-products" className="sn-section sn-3d-section sn-sec-products" ref={ref as any}>
      {/* Floating background orbs for depth */}
      <FloatingOrbs/>

      <div className="sn-wrap">
        {/* Header — this is the heading that now "sits on the wave" from above */}
        <div className={`sn-prod-header-clean${v ? " sn-3d-visible" : ""}`}>
          <span className="sn-kicker"><FiGrid size={11}/> Featured Products</span>
          <h2 className="sn-prod-h3d">Shop Popular Categories</h2>
          {/* Browse All → redirects to /login */}
          <button className="sn-prod-browse-link" onClick={() => nav("/login")}>
            Browse All →
          </button>
        </div>

        {/* Bento-style category tabs (morphing dots aesthetic) */}
        <div className={`sn-cat-row${v ? " sn-visible" : ""}`}>
          {CATS.map(c => (
            <button key={c.id} className={`sn-cat${cat === c.id ? " sn-cat-on" : ""}`} onClick={() => setCat(c.id)}>
              <c.Icon size={13}/> {c.label}
            </button>
          ))}
          {/* Bento dots grid icon */}
          <div className="sn-bento-icon">
            {[...Array(9)].map((_,i)=>(<div key={i} className="sn-bento-dot"/>))}
          </div>
          <button className="sn-cat sn-cat-refresh" onClick={load} title="Refresh">
            <FiRefreshCw size={13} style={loading?{animation:"snSpin .8s linear infinite"}:{}}/>
          </button>
        </div>

        {loading ? (
          <div className="sn-pgrid">
            {[...Array(6)].map((_,i)=>(
              <div key={i} className="sn-pcard sn-pcard-sk">
                <div className="sn-pimg-wrap sn-sk" style={{ height:180 }}/>
                <div className="sn-pbody">
                  <div className="sn-sk" style={{ height:11,width:"72%",borderRadius:4,marginBottom:6 }}/>
                  <div className="sn-sk" style={{ height:9,width:"55%",borderRadius:4,marginBottom:8 }}/>
                  <div className="sn-sk" style={{ height:15,width:"45%",borderRadius:4,marginBottom:10 }}/>
                  <div className="sn-sk" style={{ height:36,width:"100%",borderRadius:8 }}/>
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="sn-empty"><FiPackage size={40} color="#333"/><p>No products in this category yet.</p></div>
        ) : (
          <div className="sn-pgrid">
            {shown.map((p,i)=>(<ProductCard key={p.id} p={p} onBuy={setPopup} index={i}/>))}
          </div>
        )}
      </div>
      {popup && <BuyPopup p={popup} onClose={()=>setPopup(null)}/>}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HOW IT WORKS — with delivery path animation
// ═══════════════════════════════════════════════════════════════════════════
function HowItWorks() {
  const { ref, v } = use3DInView();
  const steps = [
    { Icon: FiShoppingCart, n: "1. Order", desc: "Browse products and place your order with one tap." },
    { Icon: FiMapPin, n: "2. Track", desc: "Track your rider live on the map in real-time." },
    { Icon: BsBoxSeam, n: "3. Receive", desc: "Your order arrives fast — right at your door." },
  ];
  return (
    <section id="sn-how" className="sn-section sn-sec-dark sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v?" sn-3d-visible":""}`}>How it Works</h2>
        <DeliveryPath/>
        <div className="sn-steps-row">
          {steps.map((s,i)=>(
            <div key={i} className={`sn-step${v?" sn-visible":""}`} style={{ "--vd":`${i*0.15}s` } as any}>
              <div className="sn-step-ico"><s.Icon size={30} color={ORANGE}/></div>
              <div className="sn-step-n">{s.n}</div>
              <div className="sn-step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="sn-browse-btn-wrap">
          <button className="sn-btn-browse" onClick={()=>document.getElementById("sn-products")?.scrollIntoView({behavior:"smooth"})}>
            Browse All Categories
          </button>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BECOME A VENDOR
// ═══════════════════════════════════════════════════════════════════════════
function BecomeVendor() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section className="sn-vendor-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className={`sn-vendor-card${v?" sn-visible":""}`}>
          <div className="sn-vendor-text">
            <h2 className="sn-vendor-h">Become a<br/><span style={{ color:ORANGE }}>Swift9ja</span> Vendor</h2>
            <p className="sn-vendor-p">Reach millions of customers, manage your store with ease, and scale your business.</p>
            <div className="sn-vendor-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={()=>nav("/vendor/register")}>Sign Up as a Vendor</button>
              <button className="sn-btn-ghost" onClick={()=>nav("/about/company")}>Learn More</button>
            </div>
            <div className="sn-vendor-features">
              {[{Icon:FiGrid,t:"Order Management Dashboard"},{Icon:FiZap,t:"Easy Payments"},{Icon:FiAward,t:"Promotional Tools"}].map((f,i)=>(
                <div key={i} className="sn-vf"><f.Icon size={14} color={ORANGE}/><div><div className="sn-vft">{f.t}</div></div></div>
              ))}
            </div>
          </div>
          <div className="sn-vendor-art">
            <div className="sn-vendor-art-inner">
              <div className="sn-vendor-art-badge">VENDOR</div>
              <RiStore2Line size={90} color={ORANGE} className="sn-vendor-icon"/>
              <div className="sn-vendor-tagline">Join 10,000+ vendors</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BECOME A RIDER
// ═══════════════════════════════════════════════════════════════════════════
function BecomeRider() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section className="sn-rider-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className={`sn-rider-card${v?" sn-visible":""}`}>
          <div className="sn-rider-art">
            <div className="sn-rider-art-inner">
              <div className="sn-rider-art-badge">RIDER</div>
              <RiMotorbikeFill size={90} color={ORANGE} className="sn-rider-icon"/>
              <div className="sn-rider-tagline">500+ active riders</div>
            </div>
          </div>
          <div className="sn-rider-text">
            <h2 className="sn-rider-h">Ride with<br/><span style={{ color:ORANGE }}>Swift9ja</span></h2>
            <p className="sn-rider-p">Join 500+ riders making real money across Lagos every day.</p>
            <div className="sn-rider-perks">
              {[{Icon:FiZap,t:"Instant payouts"},{Icon:FiClock,t:"Flexible hours"},{Icon:FiShield,t:"Rider insurance"},{Icon:FiUsers,t:"24/7 support"}].map((p,i)=>(
                <div key={i} className="sn-rperk"><p.Icon size={13} color={ORANGE}/> {p.t}</div>
              ))}
            </div>
            <div className="sn-rider-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={()=>nav("/rider/signup")}>Become a Rider <RiMotorbikeFill size={14}/></button>
              <button className="sn-btn-ghost" onClick={()=>nav("/rider/login")}>Already a rider? Login</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVICES
// ═══════════════════════════════════════════════════════════════════════════
function Services() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  const svcs = [
    { Icon:MdRestaurant, title:"Food Delivery", color:"#ef4444" },
    { Icon:MdLocalPharmacy, title:"Pharmacy", color:"#3b82f6" },
    { Icon:MdLocalGroceryStore, title:"Groceries", color:"#10B981" },
    { Icon:MdDirectionsBike, title:"Send & Pickup", color:"#8b5cf6" },
    { Icon:MdStorefront, title:"Fashion", color:"#f59e0b" },
    { Icon:BsBoxSeam, title:"Beauty & Skincare", color:"#ec4899" },
  ];
  return (
    <section id="sn-services" className="sn-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v?" sn-3d-visible":""}`}>What We Deliver</h2>
        <div className="sn-svc-grid">
          {svcs.map((s,i)=>(
            <div key={i} className={`sn-svc${v?" sn-visible":""}`} style={{ "--vd":`${i*0.07}s`,"--sc":s.color } as any} onClick={()=>nav("/services")}>
              <div className="sn-svc-ico" style={{ background:`${s.color}18` }}><s.Icon size={32} color={s.color}/></div>
              <div className="sn-svc-title">{s.title}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ABOUT
// ═══════════════════════════════════════════════════════════════════════════
function About() {
  const nav = useNavigate();
  const { ref, v } = use3DInView();
  return (
    <section id="sn-about" className="sn-section sn-sec-dark sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <div className="sn-about-grid">
          <div className={`sn-about-l${v?" sn-visible":""}`}>
            <span className="sn-kicker">About SwiftNija</span>
            <h2 className="sn-sec-h2" style={{ textAlign:"left" }}>Built for Lagos.<br/><span style={{ color:ORANGE }}>Powered by Speed.</span></h2>
            <p className="sn-about-p">SwiftNija is a flagship product of <strong style={{ color:ORANGE }}>Verapixels</strong> — a digital innovation company founded by <strong>Ocholi Divine</strong> in 2025.</p>
            <blockquote className="sn-quote">
              "When every pixel is in its perfect place, the experience becomes invisible — it just works."
              <cite>— Ocholi Divine, Founder & CEO, Verapixels</cite>
            </blockquote>
            <div className="sn-about-btns">
              <button className="sn-btn-primary sn-btn-3d" onClick={()=>nav("/about/founder")}>Meet the Founder <FiArrowRight size={14}/></button>
              <button className="sn-btn-ghost" onClick={()=>nav("/about/company")}>Our Full Story</button>
            </div>
          </div>
          <div className={`sn-about-r${v?" sn-visible":""}`} style={{ "--vd":".13s" } as any}>
            <div className="sn-about-visual">
              <div className="sn-av-top"><LogoSVG size={32}/><div><div className="sn-av-name">SwiftNija</div><div className="sn-av-sub">by Verapixels</div></div></div>
              <div className="sn-av-art">
                <MdDeliveryDining size={80} color={ORANGE} style={{ filter:`drop-shadow(0 4px 16px ${ORANGE}66)`,animation:"riderBob 3s ease-in-out infinite" }}/>
                <div style={{ fontSize:11,color:ORANGE,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:8 }}>Delivering across Lagos</div>
              </div>
              <div className="sn-av-stats">
                {[["50k+","Orders"],["500+","Riders"],["4.9★","Rating"],["15m","Avg"]].map(([n,l],i)=>(
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

// ═══════════════════════════════════════════════════════════════════════════
//  CONTACT
// ═══════════════════════════════════════════════════════════════════════════
function Contact() {
  const { ref, v } = use3DInView();
  return (
    <section id="sn-contact" className="sn-section sn-3d-section" ref={ref as any}>
      <div className="sn-wrap">
        <h2 className={`sn-sec-h2 sn-center sn-3d-title${v?" sn-3d-visible":""}`}>We're Always Here for You.</h2>
        <div className="sn-contact-grid">
          {[
            { Icon:FiPhone, label:"Call Us", val:"+234 800 SWIFT NJ", color:ORANGE },
            { Icon:FiMail, label:"Email", val:"info.verapixels@gmail.com", color:"#3b82f6" },
            { Icon:FiMapPin, label:"Location", val:"Lagos, Nigeria", color:"#10B981" },
            { Icon:FiUsers, label:"Support", val:"24/7 Live Chat", color:"#8b5cf6" },
          ].map((c,i)=>(
            <div key={i} className={`sn-ccard${v?" sn-visible":""}`} style={{ "--vd":`${i*0.07}s` } as any}>
              <div className="sn-cico" style={{ background:`${c.color}15`,color:c.color }}><c.Icon size={22}/></div>
              <div className="sn-clbl">{c.label}</div>
              <div className="sn-cval">{c.val}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FOOTER
// ═══════════════════════════════════════════════════════════════════════════
function Footer() {
  const nav = useNavigate();
  return (
    <footer className="sn-footer">
      <div className="sn-wrap">
        <div className="sn-footer-top">
          <div className="sn-footer-brand">
            <div className="sn-logo" style={{ marginBottom:10 }}><LogoSVG size={36}/><span className="sn-logo-text">Swift<em>9ja</em></span></div>
            <p className="sn-ftag">Lagos's fastest on-demand delivery platform. A product of Verapixels by Ocholi Divine.</p>
            <div className="sn-social">
              {[FiInstagram,FiTwitter,FiFacebook,FiLinkedin].map((Icon,i)=>(
                <a key={i} href="#" className="sn-social-btn"><Icon size={15}/></a>
              ))}
            </div>
          </div>
          {[
            { t:"Company", links:[["About Founder","/about/founder"],["Meet the Team","/about/team"],["About Company","/about/company"]] },
            { t:"Services", links:[["Food Delivery","/services"],["Pharmacy","/services"],["Groceries","/services"]] },
            { t:"Partners", links:[["Become a Rider","/rider/signup"],["Become a Vendor","/vendor/register"],["Rider Login","/rider/login"],["Vendor Login","/vendor/login"]] },
            { t:"Support", links:[["Help Center","#sn-contact"],["Contact Us","#sn-contact"],["Privacy Policy","#"],["Terms","#"]] },
          ].map((col,ci)=>(
            <div key={ci} className="sn-fcol">
              <div className="sn-fttl">{col.t}</div>
              {col.links.map(([lb,hr],li)=>(
                <button key={li} className="sn-flink" onClick={()=>{
                  if(hr.startsWith("/")) nav(hr);
                  else document.getElementById(hr.slice(1))?.scrollIntoView({behavior:"smooth"});
                }}>{lb}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="sn-footer-btm">
          <span>© 2026 SwiftNija by <span style={{ color:ORANGE }}>Verapixels</span>. All rights reserved.</span>
          <span>Crafted with precision in Lagos, Nigeria</span>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  return (
    <div className="sn-root">
      <Navbar/>
      <Hero/>
      <Products/>
      <HowItWorks/>
      <BecomeVendor/>
      <BecomeRider/>
      <Services/>
      <About/>
      <Contact/>
      <Footer/>
      <style>{CSS}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Black+Han+Sans&display=swap');

*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#0a0a0f;--bg2:#0f0f18;--bg3:#141420;--card:#12121e;
  --brd:#1e1e32;--brd2:#2a2a44;--txt:#f0f0fa;--txt2:#7878a0;--txt3:#30304a;
  --acc:#FF6B00;--grn:#10B981;
  --shadow-orange:0 0 40px rgba(255,107,0,0.25);
  --shadow-deep:0 20px 60px rgba(0,0,0,0.6);
}

/* ── ROOT ── */
.sn-root{min-height:100vh;background:var(--bg);color:var(--txt);font-family:'Plus Jakarta Sans',sans-serif;overflow-x:hidden;padding-top:64px;}
.sn-wrap{max-width:1280px;margin:0 auto;padding:0 20px;}

/* ── KEYFRAMES ── */
@keyframes snSpin{to{transform:rotate(360deg);}}
@keyframes riderBob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-12px) rotate(-3deg)}}
@keyframes fadeUpBig{from{opacity:0;transform:translateY(40px) rotateX(12deg)}to{opacity:1;transform:none}}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes badgePulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,0,0);transform:translateZ(0)}50%{box-shadow:0 0 20px 4px rgba(255,107,0,0.3);transform:translateZ(6px)}}
@keyframes glowPulse{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.8;transform:scale(1.1)}}
@keyframes particleFloat{0%{transform:translateY(0) translateX(0) scale(1);opacity:0.6}50%{transform:translateY(-40px) translateX(20px) scale(1.2);opacity:0.3}100%{transform:translateY(-80px) translateX(-10px) scale(0.8);opacity:0}}
@keyframes flip3DNext{from{transform:perspective(1200px) rotateY(-90deg) scale(0.9);opacity:0}to{transform:perspective(1200px) rotateY(0deg) scale(1);opacity:1}}
@keyframes flip3DPrev{from{transform:perspective(1200px) rotateY(90deg) scale(0.9);opacity:0}to{transform:perspective(1200px) rotateY(0deg) scale(1);opacity:1}}
@keyframes flip3DExitNext{from{transform:perspective(1200px) rotateY(0deg) scale(1);opacity:1}to{transform:perspective(1200px) rotateY(90deg) scale(0.9);opacity:0}}
@keyframes flip3DExitPrev{from{transform:perspective(1200px) rotateY(0deg) scale(1);opacity:1}to{transform:perspective(1200px) rotateY(-90deg) scale(0.9);opacity:0}}
@keyframes slideInBottom{from{opacity:0;transform:translateY(24px) rotateX(8deg) scale(0.97)}to{opacity:1;transform:translateY(0) rotateX(0) scale(1)}}
@keyframes hamGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,107,0,0)}50%{box-shadow:0 0 12px 3px rgba(255,107,0,0.35)}}
@keyframes logoGlow{0%,100%{filter:drop-shadow(0 0 8px rgba(255,107,0,0.5))}50%{filter:drop-shadow(0 0 18px rgba(255,107,0,0.9))}}
@keyframes orbFloat{0%,100%{transform:translateY(0) translateX(0) scale(1);opacity:0.06}33%{transform:translateY(-40px) translateX(30px) scale(1.1);opacity:0.1}66%{transform:translateY(-20px) translateX(-20px) scale(0.9);opacity:0.04}}
@keyframes navBeam{0%{transform:translateX(-100%)}100%{transform:translateX(100vw)}}
@keyframes badgeDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.5)}}
@keyframes pathRider{0%{left:-60px}100%{left:calc(100% + 40px)}}
@keyframes shineSwipe{0%{transform:translateX(-100%) skewX(-10deg)}100%{transform:translateX(300%) skewX(-10deg)}}
@keyframes bentoMorph{0%,100%{border-radius:2px;transform:scale(1)}50%{border-radius:50%;transform:scale(1.2)}}
@keyframes heroStatCount{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* ── FLOATING ORBS ── */
.sn-orbs{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
.sn-orb{position:absolute;border-radius:50%;filter:blur(60px);animation:orbFloat ease-in-out infinite;}
.sn-orb-0{width:300px;height:300px;background:rgba(255,107,0,0.15);top:-80px;right:10%;animation-duration:8s;}
.sn-orb-1{width:200px;height:200px;background:rgba(255,107,0,0.08);bottom:20%;left:5%;animation-duration:11s;animation-delay:2s;}
.sn-orb-2{width:150px;height:150px;background:rgba(16,185,129,0.07);top:40%;left:50%;animation-duration:9s;animation-delay:4s;}
.sn-orb-3{width:250px;height:250px;background:rgba(139,92,246,0.06);bottom:10%;right:20%;animation-duration:13s;animation-delay:1s;}
.sn-orb-4{width:180px;height:180px;background:rgba(255,107,0,0.05);top:60%;right:5%;animation-duration:10s;animation-delay:3s;}
.sn-orb-5{width:120px;height:120px;background:rgba(59,130,246,0.07);top:20%;left:20%;animation-duration:7s;animation-delay:5s;}

/* ── NAVBAR ── */
.sn-nav{position:fixed;top:0;left:0;right:0;z-index:700;display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:64px;background:linear-gradient(135deg,rgba(10,10,15,0.98) 0%,rgba(20,10,0,0.98) 100%);border-bottom:1px solid rgba(255,107,0,0.15);backdrop-filter:blur(24px);transition:all 0.3s ease;overflow:hidden;}
.sn-nav-glass{box-shadow:0 4px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(255,107,0,0.1) inset;background:linear-gradient(135deg,rgba(10,10,15,0.99) 0%,rgba(25,12,0,0.99) 100%);}

/* Animated beam on navbar */
.sn-nav-beam{position:absolute;top:0;left:0;height:1px;width:80px;background:linear-gradient(90deg,transparent,rgba(255,107,0,0.8),transparent);animation:navBeam 4s ease-in-out infinite;pointer-events:none;}

.sn-nav-left{display:flex;align-items:center;gap:14px;}
.sn-nav-links{display:none;align-items:center;gap:4px;}
@media(min-width:860px){.sn-nav-links{display:flex;}}

.sn-nav-link{padding:8px 14px;background:transparent;border:none;color:var(--txt2);font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;border-radius:8px;transition:all 0.2s;position:relative;text-transform:uppercase;}
.sn-nav-link::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%) scaleX(0);width:70%;height:2px;background:var(--acc);border-radius:2px;transition:transform 0.2s;}
.sn-nav-link:hover{color:var(--txt);}
.sn-nav-link:hover::after{transform:translateX(-50%) scaleX(1);}
.sn-nav-link-hot{color:var(--acc)!important;}
.sn-nav-link-hot:hover{text-shadow:0 0 12px rgba(255,107,0,0.5);}
.sn-nav-link-drop{display:inline-flex;align-items:center;gap:4px;}
.sn-nav-dropdown-wrap{position:relative;}
.sn-nav-dropdown{display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:linear-gradient(135deg,rgba(14,14,22,0.99),rgba(22,12,4,0.99));border:1px solid rgba(255,107,0,0.2);border-radius:12px;padding:6px;min-width:180px;box-shadow:0 12px 40px rgba(0,0,0,0.7);z-index:800;backdrop-filter:blur(20px);flex-direction:column;gap:2px;}
.sn-nav-dropdown-wrap:hover .sn-nav-dropdown{display:flex;}
.sn-nav-dditem{background:transparent;border:none;color:var(--txt2);font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:600;padding:10px 14px;border-radius:8px;cursor:pointer;text-align:left;width:100%;transition:all 0.15s;}
.sn-nav-dditem:hover{background:rgba(255,107,0,0.08);color:var(--acc);padding-left:18px;}

/* LOGO */
.sn-logo{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;}
.sn-logo svg{animation:logoGlow 3s ease-in-out infinite;transition:transform 0.2s;}
.sn-logo:hover svg{transform:scale(1.1) rotate(-3deg);}
.sn-logo-text-desktop{display:none;}
@media(min-width:860px){
  .sn-logo-text-desktop{display:inline;font-family:'Playfair Display',serif;font-size:26px;font-weight:900;color:var(--txt);letter-spacing:-0.5px;text-shadow:0 2px 8px rgba(0,0,0,0.5);}
  .sn-logo-text-desktop em{color:var(--acc);font-style:italic;text-shadow:0 0 24px rgba(255,107,0,0.5);}
}

/* HAMBURGER */
.sn-ham{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;width:42px;height:38px;background:linear-gradient(135deg,rgba(255,107,0,0.08),rgba(255,107,0,0.04));border:1.5px solid rgba(255,107,0,0.4);border-radius:9px;cursor:pointer;padding:0;transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);animation:hamGlow 3s ease-in-out infinite;}
@media(min-width:860px){.sn-ham{display:none!important;}}
.sn-ham:hover{background:rgba(255,107,0,0.12);border-color:var(--acc);transform:translateY(-2px) scale(1.05);box-shadow:0 8px 20px rgba(255,107,0,0.3);}
.sn-line{display:block;width:18px;height:2px;background:var(--txt2);border-radius:2px;transition:all .3s cubic-bezier(.4,0,.2,1);}
.sn-ham:hover .sn-line{background:var(--acc);}
.sn-ham-open .sn-line:nth-child(1){transform:translateY(7px) rotate(45deg);background:var(--acc);}
.sn-ham-open .sn-line:nth-child(2){width:0;opacity:0;}
.sn-ham-open .sn-line:nth-child(3){transform:translateY(-7px) rotate(-45deg);background:var(--acc);}
.sn-ham-open{background:rgba(255,107,0,0.15);border-color:var(--acc);box-shadow:0 0 20px rgba(255,107,0,0.3);}

/* AUTH */
.sn-auth{display:flex;gap:8px;}
.sn-auth-login{background:transparent;border:1.5px solid rgba(255,107,0,0.45);color:var(--txt2);border-radius:8px;padding:8px 18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;}
.sn-auth-login:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);box-shadow:0 4px 12px rgba(255,107,0,0.2);}
.sn-auth-signup{background:linear-gradient(135deg,#FF6B00,#FF8C33);border:none;color:#fff;border-radius:8px;padding:9px 18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(255,107,0,0.3);}
.sn-auth-signup:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 8px 24px rgba(255,107,0,0.4);}

/* DRAWER */
.sn-backdrop{position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .3s;}
.sn-back-on{opacity:1;pointer-events:all;}
.sn-drawer{position:fixed;top:0;left:0;bottom:0;width:300px;max-width:88vw;z-index:801;background:linear-gradient(180deg,#0d0d18 0%,#0a0a12 100%);border-right:1px solid rgba(255,107,0,0.15);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .38s cubic-bezier(.32,1,.4,1);box-shadow:8px 0 40px rgba(0,0,0,0.5);}
.sn-drawer-on{transform:translateX(0);}
.sn-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,107,0,0.1);background:linear-gradient(135deg,rgba(255,107,0,0.05),transparent);}
.sn-drawer-x{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid var(--brd);color:var(--txt2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .18s;}
.sn-drawer-x:hover{background:rgba(239,68,68,.15);color:#ef4444;transform:rotate(90deg);}
.sn-drawer-body{flex:1;overflow-y:auto;padding:8px 0;scrollbar-width:none;}
.sn-drawer-body::-webkit-scrollbar{display:none;}
.sn-ditem{display:flex;align-items:center;gap:10px;width:100%;padding:15px 20px;background:transparent;border:none;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;text-align:left;transition:all .18s;color:var(--txt2);border-left:3px solid transparent;}
.sn-ditem:hover{color:var(--acc);background:rgba(255,107,0,0.05);border-left-color:var(--acc);padding-left:24px;}
.sn-ditem-accent{color:var(--txt);}
.sn-ditem-special{color:var(--acc)!important;}
.sn-dico{color:var(--acc);flex-shrink:0;}
.sn-dlabel{flex:1;}
.sn-darrow{color:var(--txt2);margin-left:auto;}
.sn-dsub-wrap{display:flex;flex-direction:column;}
.sn-submenu{display:flex;flex-direction:column;padding:4px 0 4px 44px;}
.sn-dsubitem{display:flex;align-items:center;gap:7px;padding:10px 16px 10px 0;background:transparent;border:none;color:var(--txt2);font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;text-align:left;transition:color .13s;}
.sn-dsubitem:hover{color:var(--acc);}
.sn-divider{height:1px;background:rgba(255,107,0,0.1);margin:8px 20px;}
.sn-drawer-foot{padding:16px 20px;border-top:1px solid rgba(255,107,0,0.1);display:flex;flex-direction:column;gap:8px;background:linear-gradient(0deg,rgba(255,107,0,0.05),transparent);}
.sn-d100{width:100%;justify-content:center;}

/* ── HERO ── */
.sn-hero{position:relative;min-height:380px;overflow:hidden;display:flex;align-items:flex-end;transition:background .6s ease;perspective:1200px;}
@media(min-width:600px){.sn-hero{min-height:460px;}}
.sn-hero-3d-wrap{position:absolute;inset:0;perspective:1200px;transform-style:preserve-3d;}
.sn-hero-collage{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;overflow:hidden;}
.sn-collage-enter-next{animation:flip3DNext 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards;}
.sn-collage-enter-prev{animation:flip3DPrev 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards;}
.sn-collage-exit-next{animation:flip3DExitNext 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards;}
.sn-collage-exit-prev{animation:flip3DExitPrev 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards;}
.sn-collage-img{overflow:hidden;position:relative;}
.sn-collage-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 5s ease;}
.sn-collage-img:hover img{transform:scale(1.08);}
.sn-ci0{grid-column:1;grid-row:1/3;}
.sn-ci1{grid-column:2;grid-row:1;}
.sn-ci2{grid-column:2/4;grid-row:2;}
.sn-hero-collage-overlay{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.8) 100%);pointer-events:none;z-index:1;}
.sn-hero-strip{position:absolute;left:0;top:0;bottom:0;width:5px;z-index:2;opacity:.9;box-shadow:2px 0 20px currentColor;}

/* Floating shapes */
.sn-hero-shapes{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden;}
.sn-shape{position:absolute;border-radius:50%;border:1px solid rgba(255,107,0,0.15);}
.sn-shape-0{width:300px;height:300px;top:-100px;right:-50px;animation:orbFloat 12s ease-in-out infinite;}
.sn-shape-1{width:200px;height:200px;bottom:50px;left:-60px;animation:orbFloat 9s ease-in-out infinite;animation-delay:3s;border-color:rgba(255,255,255,0.05);}
.sn-shape-2{width:100px;height:100px;top:40%;right:15%;animation:orbFloat 7s ease-in-out infinite;animation-delay:6s;border-color:rgba(255,107,0,0.1);}

.sn-hero-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(255,107,0,0.12);border:1px solid rgba(255,107,0,0.3);border-radius:20px;padding:5px 12px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.5px;margin-bottom:12px;}
.sn-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--acc);animation:badgeDot 1.5s ease-in-out infinite;}

.sn-hero-text{position:relative;z-index:3;padding:24px 20px 20px;animation:fadeUpBig .55s ease both;}
.sn-h1{font-family:'Playfair Display',serif;font-size:clamp(28px,7.5vw,64px);font-weight:900;line-height:1.08;color:#fff;margin-bottom:10px;text-shadow:0 4px 24px rgba(0,0,0,0.7),0 0 80px rgba(255,107,0,0.1);}
.sn-h1-line{display:inline-block;animation:fadeUpBig 0.5s ease both;}
.sn-h1-line:nth-child(2){animation-delay:0.08s;}
.sn-hero-sub{font-size:clamp(14px,3vw,20px);font-weight:700;color:rgba(255,255,255,0.9);margin-bottom:18px;text-shadow:0 1px 8px rgba(0,0,0,0.5);}
.sn-hero-ctas{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;}

/* Hero stats row */
.sn-hero-stats{display:flex;gap:20px;flex-wrap:wrap;}
.sn-hero-stat{display:flex;flex-direction:column;gap:1px;animation:heroStatCount 0.6s ease both;}
.sn-hero-stat:nth-child(1){animation-delay:0.2s;}
.sn-hero-stat:nth-child(2){animation-delay:0.3s;}
.sn-hero-stat:nth-child(3){animation-delay:0.4s;}
.sn-hero-stat:nth-child(4){animation-delay:0.5s;}
.sn-hs-n{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;color:var(--acc);text-shadow:0 0 16px rgba(255,107,0,0.4);}
.sn-hs-l{font-size:9px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;}

.sn-car-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,rgba(0,0,0,0.7),rgba(30,10,0,0.7));border:1.5px solid rgba(255,107,0,0.3);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .22s;box-shadow:0 4px 16px rgba(0,0,0,0.4);}
.sn-car-btn:hover{background:var(--acc);border-color:var(--acc);transform:translateY(-50%) scale(1.1);box-shadow:0 6px 20px rgba(255,107,0,0.4);}
.sn-car-l{left:10px;}
.sn-car-r{right:10px;}
.sn-car-dots{position:absolute;bottom:130px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:4;}
.sn-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3);border:none;cursor:pointer;transition:all .25s;}
.sn-dot-on{background:var(--acc);width:22px;border-radius:4px;box-shadow:0 0 8px rgba(255,107,0,0.5);}

.sn-particles{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden;}
.sn-particle{position:absolute;border-radius:50%;background:rgba(255,107,0,0.4);animation:particleFloat linear infinite;}
.sn-p0{width:4px;height:4px;left:15%;bottom:25%;animation-duration:3.5s;}
.sn-p1{width:6px;height:6px;left:30%;bottom:35%;animation-duration:4.2s;animation-delay:0.5s;}
.sn-p2{width:3px;height:3px;left:50%;bottom:20%;animation-duration:3.8s;animation-delay:1s;}
.sn-p3{width:5px;height:5px;left:70%;bottom:30%;animation-duration:4.5s;animation-delay:1.5s;}
.sn-p4{width:4px;height:4px;left:85%;bottom:40%;animation-duration:3.2s;animation-delay:0.3s;}
.sn-p5{width:7px;height:7px;left:20%;bottom:45%;animation-duration:5s;animation-delay:2s;background:rgba(255,140,0,0.3);}
.sn-p6{width:3px;height:3px;left:60%;bottom:55%;animation-duration:4s;animation-delay:0.8s;}
.sn-p7{width:5px;height:5px;left:40%;bottom:65%;animation-duration:3.6s;animation-delay:1.8s;}
.sn-p8{width:4px;height:4px;left:10%;bottom:50%;animation-duration:4.8s;animation-delay:2.5s;}
.sn-p9{width:6px;height:6px;left:90%;bottom:60%;animation-duration:3.3s;animation-delay:0.7s;}

/* ── THE WAVE SVG ──
   Sits at the very bottom of the hero, overlapping into the Products section.
   The Products section has no top padding so the heading floats ON the wave. */
.sn-hero-wave{
  position:absolute;
  bottom:0; left:0; right:0;
  z-index:5;
  line-height:0;
  /* push up so wave overlaps products header */
  margin-bottom:-2px;
}
.sn-hero-wave svg{
  display:block;
  width:100%;
  height:120px;
}

/* ── PRODUCTS SECTION ── */
.sn-sec-products{
  background:var(--bg2);
  position:relative;
  /* No top padding — heading flows directly under the wave */
  padding-top: 0 !important;
  padding-bottom: 56px;
}
/* The header sits right at the top, which visually lands on the wave */
.sn-prod-header-clean{
  margin-bottom:20px;
  opacity:0;
  transform:perspective(800px) rotateX(20deg) translateY(20px);
  transition:opacity 0.6s ease,transform 0.6s ease;
  display:flex;
  flex-direction:column;
  gap:4px;
  padding-top:32px;
  position:relative;
  z-index:2;
}
.sn-prod-header-clean.sn-3d-visible{opacity:1;transform:none;}
.sn-prod-h3d{font-family:'Playfair Display',serif;font-size:clamp(26px,6vw,48px);font-weight:900;color:var(--acc);line-height:1.1;text-shadow:0 0 40px rgba(255,107,0,0.3);margin-bottom:2px;}

/* Browse All link — clickable, goes to /login */
.sn-prod-browse-link{
  display:inline-flex;
  align-items:center;
  background:transparent;
  border:none;
  font-size:13px;
  font-weight:700;
  color:var(--acc);
  opacity:0.8;
  letter-spacing:0.3px;
  cursor:pointer;
  padding:0;
  font-family:'Plus Jakarta Sans',sans-serif;
  transition:opacity 0.2s,letter-spacing 0.2s;
}
.sn-prod-browse-link:hover{opacity:1;letter-spacing:1px;}

/* ── BENTO DOTS (morphing category icon) ── */
.sn-bento-icon{
  display:grid;
  grid-template-columns:repeat(3,6px);
  grid-template-rows:repeat(3,6px);
  gap:3px;
  padding:10px 10px;
  align-self:center;
  cursor:default;
}
.sn-bento-dot{
  width:6px;height:6px;
  background:rgba(255,107,0,0.4);
  border-radius:2px;
  animation:bentoMorph 2.4s ease-in-out infinite;
}
.sn-bento-dot:nth-child(1){animation-delay:0s;}
.sn-bento-dot:nth-child(2){animation-delay:0.15s;}
.sn-bento-dot:nth-child(3){animation-delay:0.3s;}
.sn-bento-dot:nth-child(4){animation-delay:0.45s;}
.sn-bento-dot:nth-child(5){animation-delay:0.6s;background:rgba(255,107,0,0.7);}
.sn-bento-dot:nth-child(6){animation-delay:0.75s;}
.sn-bento-dot:nth-child(7){animation-delay:0.9s;}
.sn-bento-dot:nth-child(8){animation-delay:1.05s;}
.sn-bento-dot:nth-child(9){animation-delay:1.2s;}

/* ── DELIVERY PATH ── */
.sn-path-section{margin-bottom:28px;padding:16px 0;}
.sn-path-track{position:relative;height:80px;width:100%;}
.sn-path-line{position:absolute;top:24px;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(255,107,0,0.4),rgba(255,107,0,0.8),rgba(255,107,0,0.4),transparent);border-radius:2px;}
.sn-path-rider{position:absolute;top:6px;font-size:22px;animation:pathRider 6s linear infinite;z-index:2;filter:drop-shadow(0 0 8px rgba(255,107,0,0.6));}
.sn-path-stop{position:absolute;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;transform:translateX(-50%);}
.sn-path-node{font-size:18px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}
.sn-path-label{font-size:9px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;}

/* ── CATEGORY TABS ── */
.sn-cat-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:24px;align-items:center;opacity:0;transform:translateY(10px);transition:opacity .5s,transform .5s;}
.sn-cat-row.sn-visible{opacity:1;transform:none;}
.sn-cat{display:inline-flex;align-items:center;gap:5px;padding:8px 15px;border-radius:22px;background:var(--card);border:1px solid var(--brd);color:var(--txt2);font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;}
.sn-cat:hover{border-color:var(--brd2);color:var(--txt);transform:translateY(-2px);}
.sn-cat-on{background:rgba(255,107,0,0.12)!important;border-color:rgba(255,107,0,0.4)!important;color:var(--acc)!important;box-shadow:0 2px 12px rgba(255,107,0,0.2);}
.sn-cat-refresh{padding:8px 13px;}

/* ── PRODUCT GRID ── */
.sn-pgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
@media(min-width:540px){.sn-pgrid{grid-template-columns:repeat(3,1fr);}}
@media(min-width:900px){.sn-pgrid{grid-template-columns:repeat(4,1fr);gap:16px;}}
@media(min-width:1200px){.sn-pgrid{grid-template-columns:repeat(5,1fr);}}

.sn-pcard{background:var(--card);border:1px solid var(--brd);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:all .28s cubic-bezier(0.34,1.56,0.64,1);opacity:0;transform:translateY(24px) rotateX(8deg) scale(0.97);animation:slideInBottom 0.5s ease forwards;animation-delay:calc(var(--ci,0)*0.04s);transform-origin:center bottom;transform-style:preserve-3d;}
.sn-pcard:hover{border-color:rgba(255,107,0,0.35);box-shadow:0 16px 48px rgba(0,0,0,0.6),0 0 0 1px rgba(255,107,0,0.1),var(--shadow-orange);}
.sn-pimg-wrap{position:relative;overflow:hidden;background:var(--bg3);aspect-ratio:1/1;}
.sn-pimg{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s ease;}
.sn-pcard:hover .sn-pimg{transform:scale(1.08) rotate(1deg);}

/* Shine effect on hover */
.sn-pcard-shine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.08) 50%,transparent 60%);transform:translateX(-100%) skewX(-10deg);pointer-events:none;}
.sn-pcard:hover .sn-pcard-shine{animation:shineSwipe 0.6s ease forwards;}

.sn-plove{position:absolute;top:7px;right:7px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.55);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;}
.sn-plove:hover{background:rgba(239,68,68,.3);transform:scale(1.15);}
.sn-pbody{padding:10px;display:flex;flex-direction:column;gap:3px;flex:1;}
.sn-pname{font-size:12.5px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sn-pdesc{font-size:10.5px;color:var(--txt2);line-height:1.4;}
.sn-pprice{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--acc);margin:4px 0 6px;}
.sn-pbuy{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;padding:10px 0;background:linear-gradient(135deg,var(--acc),#FF8C33);border:none;border-radius:8px;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;transition:all .18s;box-shadow:0 3px 10px rgba(255,107,0,0.25);}
.sn-pbuy:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(255,107,0,0.4);}
.sn-pcard-sk{pointer-events:none;opacity:1;transform:none;animation:none;}
.sn-sk{background:linear-gradient(90deg,var(--card) 25%,var(--brd) 50%,var(--card) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;}
.sn-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 20px;color:var(--txt2);font-size:14px;text-align:center;}

/* ── SECTIONS ── */
.sn-section{padding:56px 0;}
.sn-sec-dark{background:var(--bg2);}
.sn-3d-section{perspective:1000px;}
.sn-sec-h2{font-family:'Playfair Display',serif;font-size:clamp(24px,4.5vw,44px);font-weight:900;color:var(--txt);margin-bottom:32px;}
.sn-sec-h2.sn-center{text-align:center;}
.sn-kicker{display:inline-flex;align-items:center;gap:5px;background:rgba(255,107,0,0.09);border:1px solid rgba(255,107,0,0.22);border-radius:20px;padding:5px 14px;font-size:10px;font-weight:800;color:var(--acc);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;}
.sn-visible{opacity:1!important;transform:none!important;}
.sn-3d-title{opacity:0;transform:perspective(800px) rotateX(30deg) translateY(30px);transition:opacity 0.7s ease,transform 0.7s ease;}
.sn-3d-visible{opacity:1!important;transform:perspective(800px) rotateX(0deg) translateY(0)!important;}

/* ── HOW IT WORKS ── */
.sn-steps-row{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-bottom:32px;}
.sn-step{flex:1;min-width:140px;max-width:220px;background:linear-gradient(135deg,var(--card),rgba(255,107,0,0.05));border:1px solid rgba(255,107,0,0.12);border-radius:16px;padding:28px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;opacity:0;transform:translateY(20px) rotateX(15deg) scale(0.95);transition:opacity .6s,transform .6s;transition-delay:var(--vd,0s);}
.sn-step.sn-visible{opacity:1;transform:none;}
.sn-step:hover{transform:translateY(-6px) rotateX(-3deg);box-shadow:0 12px 36px rgba(255,107,0,0.15),0 0 0 1px rgba(255,107,0,0.15);border-color:rgba(255,107,0,0.3);}
.sn-step-ico{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,rgba(255,107,0,0.15),rgba(255,107,0,0.05));display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(255,107,0,0.2);}
.sn-step-n{font-size:15px;font-weight:800;color:var(--txt);}
.sn-step-desc{font-size:12px;color:var(--txt2);line-height:1.6;}
.sn-browse-btn-wrap{display:flex;justify-content:center;margin-top:8px;}

/* ── BUTTONS ── */
.sn-btn-primary{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#FF6B00,#FF8C33);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s;box-shadow:0 4px 16px rgba(255,107,0,0.3),0 2px 0 rgba(0,0,0,0.2);}
.sn-btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(255,107,0,0.5);}
.sn-btn-3d{transform-style:preserve-3d;position:relative;}
.sn-btn-3d::after{content:'';position:absolute;inset:0;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.15) 0%,transparent 100%);pointer-events:none;}
.sn-btn-ghost{display:inline-flex;align-items:center;gap:7px;background:transparent;color:var(--txt2);border:1.5px solid var(--brd2);border-radius:10px;padding:11px 22px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
.sn-btn-ghost:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);}
.sn-btn-browse{display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--txt2);border:1.5px solid var(--brd2);border-radius:40px;padding:12px 44px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;margin:0 auto;}
.sn-btn-browse:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);}

/* ── VENDOR ── */
.sn-vendor-section{padding:56px 0;background:var(--bg);}
.sn-vendor-card{background:linear-gradient(135deg,var(--bg2) 0%,rgba(30,15,0,0.8) 100%);border:1px solid rgba(255,107,0,0.2);border-radius:24px;overflow:hidden;display:grid;grid-template-columns:1fr;opacity:0;transform:translateY(24px) perspective(800px) rotateX(8deg);transition:opacity .6s,transform .6s;box-shadow:0 8px 48px rgba(0,0,0,0.4);}
@media(min-width:700px){.sn-vendor-card{grid-template-columns:1fr 1fr;}}
.sn-vendor-card.sn-visible{opacity:1;transform:none;}
.sn-vendor-text{padding:44px 40px;display:flex;flex-direction:column;gap:16px;}
.sn-vendor-h{font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,42px);font-weight:900;color:var(--txt);line-height:1.12;}
.sn-vendor-p{font-size:14px;color:var(--txt2);line-height:1.85;max-width:380px;}
.sn-vendor-btns{display:flex;gap:10px;flex-wrap:wrap;}
.sn-vendor-features{display:flex;flex-direction:column;gap:10px;margin-top:4px;}
.sn-vf{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--txt2);font-weight:500;}
.sn-vft{font-weight:700;color:var(--txt);font-size:12.5px;}
.sn-vendor-art{background:linear-gradient(135deg,rgba(255,107,0,0.14),rgba(255,107,0,0.04));display:flex;align-items:center;justify-content:center;min-height:240px;border-left:1px solid rgba(255,107,0,0.12);}
.sn-vendor-art-inner{display:flex;flex-direction:column;align-items:center;gap:12px;}
.sn-vendor-art-badge{background:linear-gradient(135deg,var(--acc),#FF8C33);color:#fff;font-size:11px;font-weight:800;letter-spacing:3px;padding:6px 20px;border-radius:20px;box-shadow:0 4px 16px rgba(255,107,0,0.4);animation:badgePulse 3s ease-in-out infinite;}
.sn-vendor-icon{filter:drop-shadow(0 8px 32px rgba(255,107,0,0.5));animation:riderBob 3.5s ease-in-out infinite;}
.sn-vendor-tagline{font-size:11px;color:var(--acc);font-weight:600;opacity:0.7;}

/* ── RIDER ── */
.sn-rider-section{padding:56px 0;background:var(--bg2);}
.sn-rider-card{background:linear-gradient(135deg,var(--bg3) 0%,rgba(20,10,0,0.8) 100%);border:1px solid rgba(255,107,0,0.15);border-radius:24px;overflow:hidden;display:grid;grid-template-columns:1fr;opacity:0;transform:translateY(24px) perspective(800px) rotateX(8deg);transition:opacity .6s,transform .6s;box-shadow:0 8px 48px rgba(0,0,0,0.4);}
@media(min-width:700px){.sn-rider-card{grid-template-columns:1fr 1fr;}}
.sn-rider-card.sn-visible{opacity:1;transform:none;}
.sn-rider-art{background:linear-gradient(135deg,rgba(255,107,0,0.1),rgba(0,0,0,0.2));display:flex;align-items:center;justify-content:center;min-height:240px;border-right:1px solid rgba(255,107,0,0.1);}
.sn-rider-art-inner{display:flex;flex-direction:column;align-items:center;gap:12px;}
.sn-rider-art-badge{background:linear-gradient(135deg,var(--acc),#FF8C33);color:#fff;font-size:11px;font-weight:800;letter-spacing:3px;padding:6px 20px;border-radius:20px;box-shadow:0 4px 16px rgba(255,107,0,0.4);animation:badgePulse 3s ease-in-out infinite;}
.sn-rider-icon{filter:drop-shadow(0 8px 32px rgba(255,107,0,0.4));animation:riderBob 3s ease-in-out infinite;}
.sn-rider-tagline{font-size:11px;color:var(--acc);font-weight:600;opacity:0.7;}
.sn-rider-text{padding:44px 40px;display:flex;flex-direction:column;gap:16px;}
.sn-rider-h{font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,40px);font-weight:900;color:var(--txt);line-height:1.12;}
.sn-rider-p{font-size:14px;color:var(--txt2);line-height:1.85;max-width:380px;}
.sn-rider-perks{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.sn-rperk{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--txt2);font-weight:500;}
.sn-rider-btns{display:flex;gap:10px;flex-wrap:wrap;}

/* ── SERVICES ── */
.sn-svc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
@media(min-width:600px){.sn-svc-grid{grid-template-columns:repeat(3,1fr);}}
@media(min-width:900px){.sn-svc-grid{grid-template-columns:repeat(6,1fr);}}
.sn-svc{background:var(--card);border:1px solid var(--brd);border-radius:16px;padding:22px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;cursor:pointer;opacity:0;transform:translateY(18px) rotateX(12deg) scale(0.95);transition:opacity .5s,transform .5s,border-color .2s;transition-delay:var(--vd,0s);}
.sn-svc.sn-visible{opacity:1;transform:none;}
.sn-svc:hover{border-color:var(--sc,rgba(255,107,0,0.3));transform:translateY(-5px) rotateX(-3deg) scale(1.03);box-shadow:0 12px 32px rgba(0,0,0,0.4);}
.sn-svc-ico{width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;transition:transform 0.3s ease;}
.sn-svc:hover .sn-svc-ico{transform:rotateY(15deg) scale(1.1);}
.sn-svc-title{font-size:12px;font-weight:700;color:var(--txt);line-height:1.3;}

/* ── ABOUT ── */
.sn-about-grid{display:grid;grid-template-columns:1fr;gap:40px;}
@media(min-width:860px){.sn-about-grid{grid-template-columns:1fr 1fr;}}
.sn-about-l{display:flex;flex-direction:column;gap:16px;opacity:0;transform:translateX(-40px) rotateY(-8deg);transition:opacity .7s,transform .7s;}
.sn-about-l.sn-visible{opacity:1;transform:none;}
.sn-about-r{opacity:0;transform:translateX(40px) rotateY(8deg);transition:opacity .7s,transform .7s;transition-delay:var(--vd,.13s);}
.sn-about-r.sn-visible{opacity:1;transform:none;}
.sn-about-p{font-size:14px;color:var(--txt2);line-height:1.85;}
.sn-quote{border-left:3px solid var(--acc);padding:14px 16px;font-size:13.5px;color:rgba(255,255,255,.75);line-height:1.8;font-style:italic;background:linear-gradient(90deg,rgba(255,107,0,0.05),transparent);border-radius:0 8px 8px 0;}
.sn-quote cite{display:block;margin-top:8px;font-style:normal;font-size:11.5px;font-weight:700;color:var(--acc);}
.sn-about-btns{display:flex;gap:10px;flex-wrap:wrap;}
.sn-about-visual{background:var(--card);border:1px solid var(--brd);border-radius:20px;overflow:hidden;box-shadow:var(--shadow-deep);}
.sn-av-top{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--brd);}
.sn-av-name{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--txt);}
.sn-av-sub{font-size:11px;color:var(--txt2);}
.sn-av-art{padding:32px;display:flex;align-items:center;justify-content:center;flex-direction:column;background:linear-gradient(135deg,rgba(255,107,0,0.06),transparent);}
.sn-av-stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--brd);}
.sn-av-stat{padding:14px 8px;text-align:center;border-right:1px solid var(--brd);transition:background 0.2s;}
.sn-av-stat:last-child{border-right:none;}
.sn-av-stat:hover{background:rgba(255,107,0,0.05);}
.sn-av-sn{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--acc);}
.sn-av-sl{font-size:9px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}

/* ── CONTACT ── */
.sn-contact-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
@media(min-width:700px){.sn-contact-grid{grid-template-columns:repeat(4,1fr);}}
.sn-ccard{background:var(--card);border:1px solid var(--brd);border-radius:16px;padding:24px 14px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;opacity:0;transform:translateY(20px) rotateX(10deg);transition:opacity .5s,transform .5s,border-color .18s;transition-delay:var(--vd,0s);}
.sn-ccard.sn-visible{opacity:1;transform:none;}
.sn-ccard:hover{border-color:rgba(255,107,0,0.3);transform:translateY(-4px) rotateX(-2deg);box-shadow:0 8px 28px rgba(0,0,0,0.4);}
.sn-cico{width:48px;height:48px;border-radius:13px;display:flex;align-items:center;justify-content:center;}
.sn-clbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--txt3);}
.sn-cval{font-size:12px;font-weight:600;color:var(--txt);}

/* ── FOOTER ── */
.sn-footer{background:#040407;border-top:1px solid rgba(255,107,0,0.08);padding:56px 20px 44px;}
.sn-footer-top{display:grid;grid-template-columns:1fr;gap:28px;margin-bottom:32px;}
@media(min-width:700px){.sn-footer-top{grid-template-columns:2fr 1fr 1fr 1fr 1fr;}}
.sn-footer-brand{display:flex;flex-direction:column;gap:10px;}
.sn-logo-text{font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:var(--txt);letter-spacing:-0.5px;}
.sn-logo-text em{color:var(--acc);font-style:italic;}
.sn-ftag{font-size:12.5px;color:var(--txt3);line-height:1.75;max-width:220px;}
.sn-social{display:flex;gap:7px;margin-top:4px;}
.sn-social-btn{width:34px;height:34px;border-radius:10px;background:var(--card);border:1px solid var(--brd);color:var(--txt2);display:flex;align-items:center;justify-content:center;text-decoration:none;transition:all .18s;}
.sn-social-btn:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,107,0,0.2);}
.sn-fcol{display:flex;flex-direction:column;gap:6px;}
.sn-fttl{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--txt2);margin-bottom:6px;}
.sn-flink{background:transparent;border:none;color:var(--txt3);font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;cursor:pointer;text-align:left;padding:3px 0;transition:all .15s;}
.sn-flink:hover{color:var(--acc);padding-left:4px;}
.sn-footer-btm{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-top:1px solid rgba(255,107,0,0.08);padding-top:18px;font-size:11px;color:var(--txt3);}

/* ── MOBILE ── */
@media(max-width:480px){
  .sn-section{padding:40px 0;}
  .sn-vendor-text,.sn-rider-text{padding:28px 20px;}
  .sn-hero-text{padding:20px 16px 20px;}
  .sn-car-dots{bottom:100px;}
  .sn-path-label{display:none;}
}
`;