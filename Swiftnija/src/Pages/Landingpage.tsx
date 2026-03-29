// pages/LandingPage.tsx
// SwiftNija — World-Class Landing Page REDESIGN
// 3D carousel, cinematic hero with speed lines, curved sections
// Become a Rider → /rider/signup  (FIXED)
// No emojis — React icons only

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiMenu, FiX, FiArrowRight, FiMapPin, FiChevronDown,
  FiPackage, FiShoppingBag, FiStar, FiZap,
  FiShield, FiClock, FiPhone, FiMail,
  FiInstagram, FiTwitter, FiFacebook, FiLinkedin,
  FiCheckCircle, FiUsers, FiAward, FiHeadphones,
  FiChevronRight, FiChevronLeft, FiPlus, FiMinus,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdDirectionsBike, MdStorefront, MdDeliveryDining,
  MdSupportAgent,
} from "react-icons/md";
import {
  RiMotorbikeFill, RiVerifiedBadgeFill,
  RiSendPlaneFill, RiStore2Line,
} from "react-icons/ri";
import { BsLightningChargeFill, BsBoxSeam, BsArrowUpRight } from "react-icons/bs";

const ACCENT = "#FF6B00";
const LOGO = "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function useCounter(end: number, duration = 2000, active = false) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      setV(Math.floor(p * end));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, end, duration]);
  return v;
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  const links = [
    { label: "Services", id: "services" },
    { label: "How It Works", id: "how-it-works" },
    { label: "About", id: "about" },
    { label: "FAQ", id: "faq" },
    { label: "Contact", id: "contact" },
  ];
  const go = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  return (
    <nav className={`sn-nav${scrolled ? " sn-nav-glass" : ""}`}>
      <div className="sn-nav-row">
        <div className="sn-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <img src={LOGO} alt="" className="sn-logo-img" onError={e => (e.currentTarget.style.display = "none")} />
          <span>swift<em>nija</em></span>
        </div>
        <div className="sn-nav-links">
          {links.map(l => <button key={l.id} className="sn-nav-link" onClick={() => go(l.id)}>{l.label}</button>)}
        </div>
        <div className="sn-nav-ctas">
          <button className="sn-ghost-btn" onClick={() => navigate("/login")}>Login</button>
          <button className="sn-pill-btn" onClick={() => navigate("/signup")}>Get Started <FiArrowRight size={14} /></button>
        </div>
        <button className="sn-burger" onClick={() => setOpen(v => !v)}>
          {open ? <FiX size={20} /> : <FiMenu size={20} />}
        </button>
      </div>
      {open && (
        <div className="sn-drawer">
          {links.map(l => (
            <button key={l.id} className="sn-drawer-link" onClick={() => go(l.id)}>
              {l.label}<FiChevronRight size={13} />
            </button>
          ))}
          <div className="sn-drawer-ctas">
            <button className="sn-ghost-btn full" onClick={() => { navigate("/login"); setOpen(false); }}>Login</button>
            <button className="sn-pill-btn full" onClick={() => { navigate("/signup"); setOpen(false); }}>Sign Up <FiArrowRight size={14} /></button>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const navigate = useNavigate();
  const [word, setWord] = useState(0);
  const [addr, setAddr] = useState("");
  const words = ["Food", "Medicine", "Groceries", "Parcels", "Anything"];
  useEffect(() => {
    const t = setInterval(() => setWord(w => (w + 1) % words.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="sn-hero">
      <div className="sn-hero-bg">
        <div className="sn-orb sn-orb-a" />
        <div className="sn-orb sn-orb-b" />
        <div className="sn-orb sn-orb-c" />
        <div className="sn-grid" />
        {[...Array(8)].map((_, i) => <div key={i} className="sn-speedline" style={{ "--si": i } as any} />)}
      </div>

      <div className="sn-float sn-f1">
        <div className="sn-fdot" /><div><div className="sn-ft">Order Delivered</div><div className="sn-fs"><FiMapPin size={9} /> 12 min · Lekki</div></div>
        <RiVerifiedBadgeFill size={15} color="#10B981" />
      </div>
      <div className="sn-float sn-f2">
        <BsLightningChargeFill size={14} color={ACCENT} />
        <div><div className="sn-ft">Express Mode</div><div className="sn-fs">500+ Riders online</div></div>
      </div>
      <div className="sn-float sn-f3">
        <div className="sn-stars">{[1,2,3,4,5].map(s=><FiStar key={s} size={9} fill="#f59e0b" color="#f59e0b"/>)}</div>
        <div className="sn-fs">4.9 · 50k reviews</div>
      </div>

      <div className="sn-hero-content">
        <div className="sn-hero-badge"><BsLightningChargeFill size={11} /> Lagos #1 On-Demand Delivery Platform</div>
        <h1 className="sn-hero-h1">
          <span className="sn-h1-line">Deliver</span>
          <span className="sn-h1-word" key={word}>{words[word]}</span>
          <span className="sn-h1-line sn-h1-accent">In Minutes.</span>
        </h1>
        <p className="sn-hero-p">SwiftNija connects you to restaurants, pharmacies, stores and couriers across Lagos. Order anything — track live, receive fast.</p>
        <div className="sn-hero-row">
          <div className="sn-addr-wrap">
            <FiMapPin size={17} color={ACCENT} />
            <input className="sn-addr" placeholder="Enter your delivery address…" value={addr} onChange={e => setAddr(e.target.value)} />
          </div>
          <button className="sn-pill-btn sn-pill-hero" onClick={() => navigate("/signup")}>Order Now <FiArrowRight size={15} /></button>
        </div>
        <div className="sn-hero-hints">
          <span className="sn-hint"><FiShield size={11} color="#10B981" /> Secure checkout</span>
          <span className="sn-hint"><FiClock size={11} color={ACCENT} /> Avg. 15 min delivery</span>
          <button className="sn-hint-link" onClick={() => navigate("/login")}>Already have an account? <strong>Login</strong></button>
        </div>
      </div>

      <div className="sn-scroll-hint"><span>Scroll</span><FiChevronDown size={16} /></div>
      <div className="sn-hero-curve">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none"><path d="M0 80C360 0 1080 0 1440 80H0Z" fill="#08080c" /></svg>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const { ref, inView } = useInView();
  const o = useCounter(50000, 2000, inView);
  const r = useCounter(500, 1600, inView);
  const v = useCounter(800, 1800, inView);
  const m = useCounter(15, 1200, inView);
  const stats = [
    { n: o === 50000 ? "50" : o.toString(), suf: "k+", label: "Orders Delivered", icon: <FiPackage size={20} /> },
    { n: r.toString(), suf: "+", label: "Active Riders", icon: <RiMotorbikeFill size={20} /> },
    { n: v.toString(), suf: "+", label: "Partner Stores", icon: <RiStore2Line size={20} /> },
    { n: m.toString(), suf: " min", label: "Avg Delivery", icon: <FiZap size={20} /> },
  ];
  return (
    <section className="sn-stats" ref={ref}>
      <div className="sn-container">
        <div className="sn-stats-grid">
          {stats.map((s, i) => (
            <div key={i} className={`sn-stat-card${inView?" sn-visible":""}`} style={{ "--d": `${i*0.1}s` } as any}>
              <div className="sn-stat-icon">{s.icon}</div>
              <div className="sn-stat-num">{s.n}{s.suf}</div>
              <div className="sn-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 3D Carousel ───────────────────────────────────────────────────────────────
function Services() {
  const { ref, inView } = useInView();
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

 const svcs = [
  { icon: <MdRestaurant size={34} />,        title: "Food Delivery",      desc: "Hot meals from your favourite restaurants and home cooks — delivered in minutes.", color: "#ef4444", bg: "rgba(239,68,68,.1)", route: "/login" },
  { icon: <MdLocalPharmacy size={34} />,     title: "Pharmacy",           desc: "Medications and health essentials delivered quickly, safely and discreetly.", color: "#3b82f6", bg: "rgba(59,130,246,.1)", route: "/login" },
  { icon: <MdLocalGroceryStore size={34} />, title: "Groceries",          desc: "Fresh produce, supermarket runs and daily essentials. Never run out again.", color: "#10B981", bg: "rgba(16,185,129,.1)", route: "/login" },
  { icon: <RiSendPlaneFill size={34} />,     title: "Send & Pickup",      desc: "Send parcels and packages across Lagos with real-time GPS tracking.", color: "#8b5cf6", bg: "rgba(139,92,246,.1)", route: "/login" },
  { icon: <MdStorefront size={34} />,        title: "Fashion & Boutique", desc: "Shop from local boutiques and designers. Style delivered to your door.", color: "#f59e0b", bg: "rgba(245,158,11,.1)", route: "/login" },
  { icon: <BsBoxSeam size={34} />,           title: "Beauty & Skincare",  desc: "Authentic beauty products from verified premium Lagos stores.", color: "#ec4899", bg: "rgba(236,72,153,.1)", route: "/login" },
];

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % svcs.length), 4000);
    return () => clearInterval(t);
  }, []);

  const prev = () => setActive(a => (a - 1 + svcs.length) % svcs.length);
  const next = () => setActive(a => (a + 1) % svcs.length);

  const getOffset = (i: number) => {
    let d = i - active;
    if (d > svcs.length / 2) d -= svcs.length;
    if (d < -svcs.length / 2) d += svcs.length;
    return d;
  };

  return (
    <section id="services" className="sn-section" ref={ref}>
      <div className="sn-container">
        <div className={`sn-sec-head${inView?" sn-visible":""}`}>
          <div className="sn-tag"><FiZap size={12} /> What We Deliver</div>
          <h2 className="sn-h2">Everything you need,<br /><span className="sn-acc">one tap away</span></h2>
          <p className="sn-lead">From a late-night craving to an urgent prescription — SwiftNija handles it all.</p>
        </div>

        <div className={`sn-carousel${inView?" sn-visible":""}`} style={{ "--d": ".15s" } as any}>
          <button className="sn-c-btn sn-c-prev" onClick={prev}><FiChevronLeft size={20} /></button>
          <div className="sn-c-stage">
            {svcs.map((s, i) => {
              const off = getOffset(i);
              if (Math.abs(off) > 2) return null;
              return (
                <div
                  key={i}
                  className="sn-c-card"
                  data-off={off}
                  style={{ "--cc": s.color, "--cb": s.bg } as any}
                  onClick={() => off === 0 ? navigate(s.route) : setActive(i)}
                >
                  <div className="sn-c-glow" />
                  <div className="sn-c-icon">{s.icon}</div>
                  <h3 className="sn-c-title">{s.title}</h3>
                  <p className="sn-c-desc">{s.desc}</p>
                  {off === 0 && <div className="sn-c-cta">Order Now <BsArrowUpRight size={13} /></div>}
                </div>
              );
            })}
          </div>
          <button className="sn-c-btn sn-c-next" onClick={next}><FiChevronRight size={20} /></button>
          <div className="sn-c-dots">
            {svcs.map((_, i) => (
              <button key={i} className={`sn-dot${i===active?" sn-dot-on":""}`} onClick={() => setActive(i)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const { ref, inView } = useInView();
  const steps = [
    { n: "01", icon: <FiMapPin size={26} />, title: "Set Location", desc: "Enter your address or use GPS to auto-detect where you are." },
    { n: "02", icon: <FiShoppingBag size={26} />, title: "Browse & Order", desc: "Pick from hundreds of verified stores and checkout in seconds." },
    { n: "03", icon: <RiMotorbikeFill size={26} />, title: "Rider Assigned", desc: "A nearby rider is instantly assigned. Watch them move live on the map." },
    { n: "04", icon: <BsLightningChargeFill size={26} />, title: "Delivered Fast", desc: "Your order arrives fresh and fast. Average delivery: 15 minutes." },
  ];
  return (
    <section id="how-it-works" className="sn-section sn-alt" ref={ref}>
      <div className="sn-diag-bg" />
      <div className="sn-container" style={{ position: "relative", zIndex: 2 }}>
        <div className={`sn-sec-head${inView?" sn-visible":""}`}>
          <div className="sn-tag"><FiClock size={12} /> How It Works</div>
          <h2 className="sn-h2">From order to door<br /><span className="sn-acc">in four steps</span></h2>
        </div>
        <div className="sn-steps">
          {steps.map((s, i) => (
            <div key={i} className={`sn-step${inView?" sn-visible":""}`} style={{ "--d": `${i*0.12}s` } as any}>
              <div className="sn-step-n">{s.n}</div>
              <div className="sn-step-icon">{s.icon}</div>
              <h3 className="sn-step-title">{s.title}</h3>
              <p className="sn-step-desc">{s.desc}</p>
              {i < 3 && <div className="sn-step-arr"><FiChevronRight size={18} /></div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── About ─────────────────────────────────────────────────────────────────────
function About() {
  const { ref, inView } = useInView();
  const navigate = useNavigate();
  const feats = [
    { icon: <FiZap size={18} />, title: "Lightning Fast", desc: "Avg 15-min delivery across Lagos." },
    { icon: <FiShield size={18} />, title: "100% Secure", desc: "Encrypted payments & verified vendors." },
    { icon: <MdSupportAgent size={18} />, title: "24/7 Support", desc: "Real humans ready to help anytime." },
    { icon: <RiVerifiedBadgeFill size={18} />, title: "Verified Stores", desc: "Every partner vetted & approved." },
    { icon: <FiUsers size={18} />, title: "Community First", desc: "Supporting local Lagos businesses." },
    { icon: <FiAward size={18} />, title: "Top Rated", desc: "4.9 stars from 50k+ customers." },
  ];
  return (
    <section id="about" className="sn-section" ref={ref}>
      <div className="sn-container">
        <div className="sn-about-grid">
          <div className={`sn-about-l${inView?" sn-visible":""}`}>
            <div className="sn-tag"><RiVerifiedBadgeFill size={12} /> Why SwiftNija</div>
            <h2 className="sn-h2" style={{ textAlign: "left" }}>Built for Lagos.<br /><span className="sn-acc">Powered by speed.</span></h2>
            <p className="sn-lead" style={{ textAlign: "left", margin: 0 }}>We understand Lagos traffic, Lagos needs and Lagos hustle. SwiftNija is engineered from the ground up — fast, reliable, always on.</p>
            <button className="sn-pill-btn" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>
              Explore Services <FiArrowRight size={14} />
            </button>
            <div className="sn-trust">
              {["Safe & Secure","Lagos-based","24/7 Active"].map((t,i)=>(
                <div key={i} className="sn-trust-pill"><FiCheckCircle size={12} color="#10B981"/>{t}</div>
              ))}
            </div>
          </div>
          <div className={`sn-about-r${inView?" sn-visible":""}`} style={{ "--d": ".15s" } as any}>
            <div className="sn-feats">
              {feats.map((f,i)=>(
                <div key={i} className="sn-feat">
                  <div className="sn-feat-icon">{f.icon}</div>
                  <div><div className="sn-feat-title">{f.title}</div><div className="sn-feat-desc">{f.desc}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Rider ─────────────────────────────────────────────────────────────────────
function RiderSection() {
  const navigate = useNavigate();
  const { ref, inView } = useInView();
  return (
    <section className="sn-section sn-alt" ref={ref}>
      <div className="sn-diag-bg sn-diag-r" />
      <div className="sn-container" style={{ position: "relative", zIndex: 2 }}>
        <div className={`sn-banner${inView?" sn-visible":""}`}>
          <div className="sn-banner-glow" />
          <div className="sn-banner-body">
            <div className="sn-tag" style={{ display: "inline-flex" }}><RiMotorbikeFill size={12} /> For Riders</div>
            <h2 className="sn-h2" style={{ textAlign: "left" }}>Ride with SwiftNija.<br /><span className="sn-acc">Earn on your terms.</span></h2>
            <p className="sn-lead" style={{ textAlign: "left", margin: 0 }}>Be your own boss. Choose your hours, ride your route, earn every delivery. Join 500+ riders making money across Lagos.</p>
            <div className="sn-perks">
              {[{icon:<FiZap size={13}/>,t:"Instant payouts"},{icon:<FiClock size={13}/>,t:"Flexible hours"},{icon:<FiShield size={13}/>,t:"Rider insurance"},{icon:<FiHeadphones size={13}/>,t:"24/7 support"}].map((p,i)=>(
                <div key={i} className="sn-perk">{p.icon}{p.t}</div>
              ))}
            </div>
            <div className="sn-banner-ctas">
              <button className="sn-pill-btn" onClick={() => navigate("/rider/signup")}>Become a Rider <RiMotorbikeFill size={15} /></button>
              <button className="sn-ghost-btn" onClick={() => navigate("/rider/login")}>Rider Login</button>
            </div>
          </div>
          <div className="sn-banner-vis">
            <div className="sn-ring sn-ring1" /><div className="sn-ring sn-ring2" /><div className="sn-ring sn-ring3" />
            <div className="sn-center-ico sn-rider-ico"><MdDirectionsBike size={62} color={ACCENT} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Vendor ────────────────────────────────────────────────────────────────────
function VendorSection() {
  const navigate = useNavigate();
  const { ref, inView } = useInView();
  return (
    <section className="sn-section" ref={ref}>
      <div className="sn-container">
        <div className={`sn-banner sn-vendor-ban${inView?" sn-visible":""}`}>
          <div className="sn-banner-glow sn-vglow" />
          <div className="sn-banner-body">
            <div className="sn-tag sn-vtag" style={{ display: "inline-flex" }}><RiStore2Line size={12} /> For Vendors</div>
            <h2 className="sn-h2" style={{ textAlign: "left" }}>Sell more with<br /><span style={{ color: "#10B981" }}>SwiftNija.</span></h2>
            <p className="sn-lead" style={{ textAlign: "left", margin: 0 }}>List your store for free. Reach thousands of daily customers. We handle delivery — you focus on your product.</p>
            <div className="sn-banner-ctas">
              <button className="sn-pill-btn sn-vpill" onClick={() => navigate("/vendor/register")}>Register Your Store <RiStore2Line size={15} /></button>
              <button className="sn-ghost-btn" onClick={() => navigate("/vendor/login")}>Vendor Login</button>
            </div>
          </div>
          <div className="sn-banner-vis">
            <div className="sn-ring sn-vring1" /><div className="sn-ring sn-vring2" />
            <div className="sn-center-ico sn-vendor-ico"><MdStorefront size={56} color="#10B981" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ() {
  const { ref, inView } = useInView();
  const [open, setOpen] = useState<number | null>(0);
  const items = [
    { q: "How fast is SwiftNija delivery?", a: "Our average delivery time is 15 minutes within Lagos. For longer distances it can take 25–45 minutes depending on traffic and vendor preparation time." },
    { q: "What areas do you serve?", a: "We operate across Lagos State including Victoria Island, Lekki, Ikeja, Surulere, Yaba, Ajah, Ikoyi and more — with rapid expansion ongoing." },
    { q: "How do I track my order?", a: "Once confirmed and a rider assigned, you see a live GPS tracking map showing your rider's exact position in real-time." },
    { q: "What payment methods are accepted?", a: "We accept card payments via Paystack (Visa, Mastercard, Verve), bank transfers, USSD, and our in-app wallet for instant checkout." },
    { q: "How do I become a delivery rider?", a: "Click 'Become a Rider', sign up with your details, upload your documents and bike info. Once verified you can start earning immediately." },
    { q: "Can I list my store on SwiftNija?", a: "Yes! Register as a vendor for free. Our team verifies your store and gets you listed within 24 hours. Start receiving orders right away." },
    { q: "What if my order is wrong or missing?", a: "Contact our 24/7 support team via the app or WhatsApp. We resolve disputes within hours and offer full refunds where applicable." },
  ];
  return (
    <section id="faq" className="sn-section sn-alt" ref={ref}>
      <div className="sn-container">
        <div className={`sn-sec-head${inView?" sn-visible":""}`}>
          <div className="sn-tag"><FiHeadphones size={12} /> FAQ</div>
          <h2 className="sn-h2">Got questions?<br /><span className="sn-acc">We've got answers.</span></h2>
        </div>
        <div className={`sn-faq${inView?" sn-visible":""}`} style={{ "--d": ".1s" } as any}>
          {items.map((item, i) => (
            <div key={i} className={`sn-faq-item${open===i?" sn-faq-open":""}`}>
              <button className="sn-faq-q" onClick={() => setOpen(open===i?null:i)}>
                <span>{item.q}</span>
                {open===i?<FiMinus size={15} color={ACCENT}/>:<FiPlus size={15}/>}
              </button>
              {open===i && <div className="sn-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Contact ───────────────────────────────────────────────────────────────────
function Contact() {
  const { ref, inView } = useInView();
  return (
    <section id="contact" className="sn-section" ref={ref}>
      <div className="sn-container">
        <div className={`sn-sec-head${inView?" sn-visible":""}`}>
          <div className="sn-tag"><FiMail size={12} /> Contact</div>
          <h2 className="sn-h2">We're always<br /><span className="sn-acc">here for you.</span></h2>
        </div>
        <div className={`sn-contact-grid${inView?" sn-visible":""}`} style={{ "--d": ".1s" } as any}>
          {[
            { icon:<FiPhone size={22}/>,       label:"Call Us",   val:"+234 800 SWIFT NJ",      col:ACCENT },
            { icon:<FiMail size={22}/>,        label:"Email Us",  val:"info.verapixels@gmail.com", col:"#3b82f6" },
            { icon:<FiMapPin size={22}/>,      label:"Location",  val:"Lagos, Nigeria",          col:"#10B981" },
            { icon:<MdSupportAgent size={22}/>,label:"Support",   val:"24/7 Live Chat",          col:"#8b5cf6" },
          ].map((c,i)=>(
            <div key={i} className="sn-contact-card">
              <div className="sn-contact-ico" style={{ background:`${c.col}14`, color:c.col }}>{c.icon}</div>
              <div className="sn-contact-lbl">{c.label}</div>
              <div className="sn-contact-val">{c.val}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA() {
  const navigate = useNavigate();
  const { ref, inView } = useInView();
  return (
    <section className="sn-final" ref={ref}>
      <div className="sn-final-orb-a" /><div className="sn-final-orb-b" />
      <div className={`sn-container sn-final-inner${inView?" sn-visible":""}`}>
        <h2 className="sn-final-h2">Ready for swift<br /><span className="sn-acc">delivery?</span></h2>
        <p className="sn-final-p">Join thousands of Lagos residents who trust SwiftNija every day.</p>
        <div className="sn-final-ctas">
          <button className="sn-pill-btn sn-pill-xl" onClick={() => navigate("/signup")}>Create Free Account <FiArrowRight size={17} /></button>
          <button className="sn-ghost-btn sn-ghost-xl" onClick={() => navigate("/login")}>Login to Order</button>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const navigate = useNavigate();
  const cols = [
    { title:"Company",  links:[["About Us","#"],["Careers","#"],["Blog","#"],["Press","#"]] },
    { title:"Services", links:[["Food Delivery","#"],["Pharmacy","#"],["Groceries","#"],["Send & Pickup","#"]] },
    { title:"Partners", links:[["Become a Rider","/rider/signup"],["List Your Store","/vendor/register"],["Vendor Login","/vendor/login"],["Rider Login","/rider/login"]] },
    { title:"Support",  links:[["Help Center","#"],["Contact Us","#"],["Privacy Policy","#"],["Terms","#"]] },
  ];
  return (
    <footer className="sn-footer">
      <div className="sn-container">
        <div className="sn-footer-grid">
          <div className="sn-footer-brand">
            <div className="sn-nav-logo">
              <img src={LOGO} alt="" className="sn-logo-img" onError={e=>(e.currentTarget.style.display="none")} />
              <span>swift<em>nija</em></span>
            </div>
            <p className="sn-footer-tag">Lagos's fastest on-demand delivery platform. Order anything, get it fast.</p>
            <div className="sn-social">
              {[FiInstagram,FiTwitter,FiFacebook,FiLinkedin].map((Icon,i)=>(
                <a key={i} href="#" className="sn-social-btn" target="_blank" rel="noreferrer"><Icon size={15}/></a>
              ))}
            </div>
          </div>
          {cols.map((col,ci)=>(
            <div key={ci} className="sn-footer-col">
              <div className="sn-footer-col-ttl">{col.title}</div>
              {col.links.map(([label,href],li)=>(
                <button key={li} className="sn-footer-link"
                  onClick={()=>href.startsWith("/")?navigate(href):href.startsWith("#")&&href.length>1?document.getElementById(href.slice(1))?.scrollIntoView({behavior:"smooth"}):void 0}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sn-footer-bottom">
          <span>© 2026 SwiftNija by <span className="sn-acc">Verapixels</span>. All rights reserved.</span>
          <span>Made with speed in Lagos, Nigeria</span>
        </div>
      </div>
    </footer>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="sn-root">
      <Navbar />
      <Hero />
      <Stats />
      <Services />
      <HowItWorks />
      <About />
      <RiderSection />
      <VendorSection />
      <FAQ />
      <Contact />
      <FinalCTA />
      <Footer />
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
:root{--bg:#08080c;--surf:#0e0e14;--card:#141420;--brd:#1e1e2e;--brd2:#2a2a3e;--txt:#f2f2fc;--txt2:#8888aa;--txt3:#3e3e5a;--acc:#FF6B00;--green:#10B981;}
.sn-root{min-height:100vh;background:var(--bg);color:var(--txt);font-family:'DM Sans',sans-serif;overflow-x:hidden;}
.sn-container{max-width:1240px;margin:0 auto;padding:0 24px;}
.sn-acc{color:var(--acc);}

/* NAV */
.sn-nav{position:fixed;top:0;left:0;right:0;z-index:1000;transition:all .35s;}
.sn-nav-glass{background:rgba(8,8,12,.92);backdrop-filter:blur(22px);border-bottom:1px solid var(--brd);}
.sn-nav-row{max-width:1240px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:20px;}
.sn-nav-logo{display:flex;align-items:center;gap:10px;font-family:'Syne',sans-serif;font-size:21px;font-weight:900;color:var(--txt);cursor:pointer;flex-shrink:0;}
.sn-nav-logo em{color:var(--acc);font-style:normal;}
.sn-logo-img{width:30px;height:30px;object-fit:contain;}
.sn-nav-links{display:none;flex:1;justify-content:center;gap:4px;}
@media(min-width:768px){.sn-nav-links{display:flex;}}
.sn-nav-link{background:transparent;border:none;color:var(--txt2);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;padding:8px 14px;border-radius:10px;transition:color .2s,background .2s;}
.sn-nav-link:hover{color:var(--txt);background:rgba(255,255,255,.06);}
.sn-nav-ctas{display:none;align-items:center;gap:10px;}
@media(min-width:768px){.sn-nav-ctas{display:flex;}}
.sn-burger{display:flex;margin-left:auto;width:40px;height:40px;align-items:center;justify-content:center;background:var(--card);border:1px solid var(--brd);border-radius:10px;color:var(--txt2);cursor:pointer;}
@media(min-width:768px){.sn-burger{display:none;}}
.sn-drawer{background:rgba(8,8,12,.98);backdrop-filter:blur(20px);border-top:1px solid var(--brd);padding:12px 20px 28px;display:flex;flex-direction:column;gap:2px;animation:drIn .2s ease;}
@keyframes drIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
.sn-drawer-link{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-radius:12px;border:none;background:transparent;color:var(--txt2);font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;cursor:pointer;transition:all .15s;}
.sn-drawer-link:hover{background:rgba(255,255,255,.05);color:var(--txt);}
.sn-drawer-ctas{display:flex;flex-direction:column;gap:10px;margin-top:16px;}

/* BUTTONS */
.sn-pill-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#FF6B00,#FF9500);color:white;border:none;border-radius:50px;padding:12px 24px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 28px rgba(255,107,0,.45);transition:transform .2s,box-shadow .2s;}
.sn-pill-btn:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 12px 36px rgba(255,107,0,.55);}
.sn-pill-btn:active{transform:scale(.97);}
.sn-ghost-btn{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--txt2);border:1.5px solid var(--brd2);border-radius:50px;padding:11px 22px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
.sn-ghost-btn:hover{border-color:var(--acc);color:var(--acc);background:rgba(255,107,0,.07);}
.sn-pill-xl{padding:15px 32px;font-size:16px;}
.sn-ghost-xl{padding:14px 30px;font-size:16px;}
.sn-vpill{background:linear-gradient(135deg,#10B981,#059669);box-shadow:0 6px 28px rgba(16,185,129,.4);}
.sn-vpill:hover{box-shadow:0 12px 36px rgba(16,185,129,.5);}
.full{width:100%;justify-content:center;}

/* HERO */
.sn-hero{min-height:100vh;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:130px 24px 100px;overflow:hidden;}
.sn-hero-bg{position:absolute;inset:0;pointer-events:none;}
.sn-orb{position:absolute;border-radius:50%;filter:blur(100px);}
.sn-orb-a{width:700px;height:700px;top:-250px;left:-250px;background:radial-gradient(circle,rgba(255,107,0,.22) 0%,transparent 70%);animation:orbA 22s ease-in-out infinite alternate;}
.sn-orb-b{width:500px;height:500px;bottom:-200px;right:-200px;background:radial-gradient(circle,rgba(255,107,0,.15) 0%,transparent 70%);animation:orbA 28s ease-in-out infinite alternate-reverse;}
.sn-orb-c{width:400px;height:400px;top:40%;left:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,107,0,.07) 0%,transparent 70%);animation:orbC 10s ease-in-out infinite;}
@keyframes orbA{0%{transform:translate(0,0)}100%{transform:translate(50px,60px)}}
@keyframes orbC{0%,100%{opacity:.4;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}}
.sn-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,107,0,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,0,.032) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at center,black 20%,transparent 72%);}
.sn-speedline{position:absolute;height:1px;background:linear-gradient(90deg,transparent,rgba(255,107,0,.35),transparent);}
.sn-speedline:nth-child(1){top:14%;width:55%;animation:spd 2.8s linear .0s infinite;}
.sn-speedline:nth-child(2){top:27%;width:38%;animation:spd 3.4s linear .5s infinite;}
.sn-speedline:nth-child(3){top:41%;width:65%;animation:spd 2.5s linear 1.0s infinite;}
.sn-speedline:nth-child(4){top:58%;width:48%;animation:spd 3.8s linear .3s infinite;}
.sn-speedline:nth-child(5){top:72%;width:42%;animation:spd 2.9s linear .8s infinite;}
.sn-speedline:nth-child(6){top:20%;width:32%;right:0;animation:spdR 3.1s linear .2s infinite;}
.sn-speedline:nth-child(7){top:48%;width:52%;right:0;animation:spdR 2.7s linear .6s infinite;}
.sn-speedline:nth-child(8){top:75%;width:40%;right:0;animation:spdR 3.3s linear .4s infinite;}
@keyframes spd{0%{left:-70%;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:110%;opacity:0}}
@keyframes spdR{0%{right:-70%;opacity:0}15%{opacity:1}85%{opacity:1}100%{right:110%;opacity:0}}

.sn-float{position:absolute;display:flex;align-items:center;gap:10px;background:rgba(14,14,20,.92);border:1px solid var(--brd2);border-radius:16px;padding:12px 18px;backdrop-filter:blur(14px);pointer-events:none;box-shadow:0 8px 32px rgba(0,0,0,.5);}
.sn-f1{top:22%;right:7%;animation:fl1 5.5s ease-in-out infinite;}
.sn-f2{bottom:28%;right:5%;animation:fl2 7s ease-in-out infinite;}
.sn-f3{top:45%;left:3%;animation:fl3 6s ease-in-out infinite;}
@media(max-width:767px){.sn-float{display:none;}}
@keyframes fl1{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes fl2{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes fl3{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.sn-fdot{width:8px;height:8px;border-radius:50%;background:#10B981;box-shadow:0 0 8px rgba(16,185,129,.8);flex-shrink:0;}
.sn-ft{font-size:13px;font-weight:700;color:var(--txt);}
.sn-fs{font-size:11px;font-weight:500;color:var(--txt2);display:flex;align-items:center;gap:3px;margin-top:2px;}
.sn-stars{display:flex;gap:1px;}

.sn-hero-content{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;max-width:800px;}
.sn-hero-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(255,107,0,.1);border:1px solid rgba(255,107,0,.28);border-radius:40px;padding:8px 18px;font-size:12px;font-weight:700;color:var(--acc);margin-bottom:28px;letter-spacing:.5px;text-transform:uppercase;animation:bdgIn .6s ease both;}
@keyframes bdgIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.sn-hero-h1{font-family:'Syne',sans-serif;font-size:clamp(44px,9.5vw,96px);font-weight:900;line-height:.98;letter-spacing:-3px;color:var(--txt);margin-bottom:24px;animation:h1In .7s ease .1s both;}
@keyframes h1In{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
.sn-h1-line{display:block;}
.sn-h1-accent{color:var(--acc);}
.sn-h1-word{display:block;color:var(--acc);animation:wdIn .45s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes wdIn{from{opacity:0;transform:translateY(24px) scale(.88)}to{opacity:1;transform:none}}
.sn-hero-p{font-size:clamp(15px,2.5vw,19px);font-weight:400;color:var(--txt2);line-height:1.75;max-width:560px;margin-bottom:36px;animation:h1In .7s ease .2s both;}
.sn-hero-row{display:flex;gap:10px;width:100%;max-width:600px;flex-direction:column;animation:h1In .7s ease .3s both;}
@media(min-width:520px){.sn-hero-row{flex-direction:row;}}
.sn-addr-wrap{flex:1;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border:1.5px solid var(--brd2);border-radius:50px;padding:14px 20px;transition:border-color .2s,box-shadow .2s;}
.sn-addr-wrap:focus-within{border-color:var(--acc);box-shadow:0 0 0 4px rgba(255,107,0,.15);}
.sn-addr{flex:1;background:transparent;border:none;outline:none;color:var(--txt);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;}
.sn-addr::placeholder{color:var(--txt3);}
.sn-pill-hero{border-radius:50px;padding:14px 26px;white-space:nowrap;}
.sn-hero-hints{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:16px;animation:h1In .7s ease .4s both;}
.sn-hint{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:var(--txt3);}
.sn-hint-link{background:transparent;border:none;color:var(--txt3);font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:color .2s;}
.sn-hint-link:hover{color:var(--acc);}
.sn-hint-link strong{color:var(--txt2);}
.sn-scroll-hint{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--txt3);letter-spacing:.8px;text-transform:uppercase;animation:scrollBob 2.4s ease-in-out infinite;}
@keyframes scrollBob{0%,100%{opacity:.4;transform:translateX(-50%) translateY(0)}50%{opacity:.9;transform:translateX(-50%) translateY(8px)}}
.sn-hero-curve{position:absolute;bottom:-1px;left:0;right:0;pointer-events:none;}
.sn-hero-curve svg{display:block;width:100%;height:80px;}

/* STATS */
.sn-stats{padding:56px 0;background:var(--surf);border-top:1px solid var(--brd);border-bottom:1px solid var(--brd);}
.sn-stats-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
@media(min-width:768px){.sn-stats-grid{grid-template-columns:repeat(4,1fr);}}
.sn-stat-card{background:var(--card);border:1.5px solid var(--brd);border-radius:20px;padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;opacity:0;transform:translateY(24px);transition:border-color .2s,transform .2s;}
.sn-stat-card.sn-visible{animation:visIn .55s ease both;animation-delay:var(--d,0s);}
.sn-stat-card:hover{border-color:rgba(255,107,0,.35);transform:translateY(-3px);}
@keyframes visIn{to{opacity:1;transform:none}}
.sn-stat-icon{width:48px;height:48px;border-radius:14px;background:rgba(255,107,0,.1);display:flex;align-items:center;justify-content:center;color:var(--acc);}
.sn-stat-num{font-family:'Syne',sans-serif;font-size:clamp(28px,4vw,38px);font-weight:900;color:var(--txt);}
.sn-stat-lbl{font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.6px;}

/* SECTIONS */
.sn-section{padding:100px 0;}
.sn-alt{padding:100px 0;background:var(--surf);position:relative;overflow:hidden;}
.sn-diag-bg{position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,107,0,.04) 0%,transparent 50%);pointer-events:none;}
.sn-diag-r{background:linear-gradient(225deg,rgba(255,107,0,.04) 0%,transparent 50%);}
.sn-sec-head{text-align:center;margin-bottom:64px;opacity:0;transform:translateY(24px);}
.sn-sec-head.sn-visible{animation:visIn .6s ease both;}
.sn-tag{display:inline-flex;align-items:center;gap:6px;background:rgba(255,107,0,.1);border:1px solid rgba(255,107,0,.22);border-radius:40px;padding:6px 14px;font-size:11px;font-weight:800;color:var(--acc);text-transform:uppercase;letter-spacing:.6px;margin-bottom:16px;}
.sn-vtag{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.22);color:#10B981;}
.sn-h2{font-family:'Syne',sans-serif;font-size:clamp(28px,5vw,52px);font-weight:900;line-height:1.15;letter-spacing:-1.5px;color:var(--txt);margin-bottom:16px;text-align:center;}
.sn-lead{font-size:clamp(14px,1.8vw,17px);font-weight:400;color:var(--txt2);line-height:1.8;max-width:540px;margin:0 auto;text-align:center;}

/* 3D CAROUSEL */
.sn-carousel{position:relative;display:flex;flex-direction:column;align-items:center;gap:32px;opacity:0;transform:translateY(24px);}
.sn-carousel.sn-visible{animation:visIn .7s ease both;animation-delay:var(--d,0s);}
.sn-c-stage{position:relative;width:100%;height:380px;display:flex;align-items:center;justify-content:center;perspective:1200px;}
.sn-c-card{position:absolute;width:280px;background:var(--card);border:1.5px solid var(--brd);border-radius:24px;padding:30px 26px;display:flex;flex-direction:column;gap:14px;cursor:pointer;transition:all .55s cubic-bezier(.4,0,.2,1);}
.sn-c-card[data-off="-2"]{transform:translateX(-560px) translateZ(-300px) rotateY(42deg);opacity:.15;filter:blur(4px);z-index:1;pointer-events:none;}
.sn-c-card[data-off="-1"]{transform:translateX(-290px) translateZ(-110px) rotateY(20deg) scale(.87);opacity:.5;filter:blur(1.5px);z-index:2;}
.sn-c-card[data-off="0"]{transform:translateX(0) translateZ(0) rotateY(0) scale(1);opacity:1;filter:none;z-index:5;border-color:var(--cc,var(--brd));box-shadow:0 36px 90px rgba(0,0,0,.55),0 0 0 1.5px var(--cc,transparent) inset;}
.sn-c-card[data-off="1"]{transform:translateX(290px) translateZ(-110px) rotateY(-20deg) scale(.87);opacity:.5;filter:blur(1.5px);z-index:2;}
.sn-c-card[data-off="2"]{transform:translateX(560px) translateZ(-300px) rotateY(-42deg);opacity:.15;filter:blur(4px);z-index:1;pointer-events:none;}
@media(max-width:767px){
  .sn-c-stage{height:340px;}
  .sn-c-card[data-off="-2"],.sn-c-card[data-off="2"]{display:none;}
  .sn-c-card[data-off="-1"]{transform:translateX(-200px) translateZ(-80px) rotateY(16deg) scale(.84);opacity:.4;}
  .sn-c-card[data-off="1"]{transform:translateX(200px) translateZ(-80px) rotateY(-16deg) scale(.84);opacity:.4;}
}
.sn-c-glow{position:absolute;inset:-1px;border-radius:25px;background:linear-gradient(135deg,var(--cc,transparent),transparent 60%);opacity:.18;pointer-events:none;}
.sn-c-icon{width:62px;height:62px;border-radius:18px;background:var(--cb,rgba(255,107,0,.1));border:1.5px solid var(--cc,rgba(255,107,0,.2));display:flex;align-items:center;justify-content:center;color:var(--cc,var(--acc));}
.sn-c-title{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;color:var(--txt);}
.sn-c-desc{font-size:13.5px;font-weight:400;color:var(--txt2);line-height:1.65;flex:1;}
.sn-c-cta{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:var(--cc,var(--acc));text-transform:uppercase;letter-spacing:.5px;}
.sn-c-btn{width:48px;height:48px;border-radius:50%;background:var(--card);border:1.5px solid var(--brd2);color:var(--txt2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;z-index:10;position:absolute;top:42%;transform:translateY(-50%);}
.sn-c-prev{left:0;}
.sn-c-next{right:0;}
.sn-c-btn:hover{border-color:var(--acc);color:var(--acc);background:rgba(255,107,0,.08);}
.sn-c-dots{display:flex;gap:8px;align-items:center;}
.sn-dot{width:8px;height:8px;border-radius:50%;background:var(--brd2);border:none;cursor:pointer;transition:all .25s;}
.sn-dot-on{background:var(--acc);transform:scale(1.35);}

/* HOW IT WORKS */
.sn-steps{display:grid;grid-template-columns:1fr;gap:24px;}
@media(min-width:768px){.sn-steps{grid-template-columns:repeat(4,1fr);}}
.sn-step{background:var(--card);border:1.5px solid var(--brd);border-radius:22px;padding:30px 22px;display:flex;flex-direction:column;gap:14px;position:relative;opacity:0;transform:translateY(24px);transition:border-color .2s,transform .2s;}
.sn-step.sn-visible{animation:visIn .6s ease both;animation-delay:var(--d,0s);}
.sn-step:hover{border-color:rgba(255,107,0,.38);transform:translateY(-4px);}
.sn-step-n{font-family:'Syne',sans-serif;font-size:50px;font-weight:900;color:rgba(255,107,0,.12);line-height:1;letter-spacing:-2px;}
.sn-step-icon{width:52px;height:52px;border-radius:14px;background:rgba(255,107,0,.1);border:1.5px solid rgba(255,107,0,.2);display:flex;align-items:center;justify-content:center;color:var(--acc);}
.sn-step-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--txt);}
.sn-step-desc{font-size:13px;font-weight:400;color:var(--txt2);line-height:1.7;}
.sn-step-arr{display:none;position:absolute;right:-18px;top:48%;transform:translateY(-50%);color:var(--txt3);z-index:2;}
@media(min-width:768px){.sn-step-arr{display:flex;}}

/* ABOUT */
.sn-about-grid{display:grid;grid-template-columns:1fr;gap:60px;align-items:center;}
@media(min-width:768px){.sn-about-grid{grid-template-columns:1fr 1fr;}}
.sn-about-l{display:flex;flex-direction:column;gap:20px;opacity:0;transform:translateY(24px);}
.sn-about-l.sn-visible{animation:visIn .6s ease both;}
.sn-about-r{opacity:0;transform:translateY(24px);}
.sn-about-r.sn-visible{animation:visIn .6s ease both;animation-delay:var(--d,0s);}
.sn-feats{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.sn-feat{background:var(--card);border:1.5px solid var(--brd);border-radius:16px;padding:16px;display:flex;align-items:flex-start;gap:12px;transition:border-color .2s;}
.sn-feat:hover{border-color:rgba(255,107,0,.3);}
.sn-feat-icon{width:38px;height:38px;border-radius:10px;background:rgba(255,107,0,.1);color:var(--acc);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.sn-feat-title{font-size:13px;font-weight:700;color:var(--txt);margin-bottom:3px;}
.sn-feat-desc{font-size:11.5px;font-weight:400;color:var(--txt2);line-height:1.5;}
.sn-trust{display:flex;gap:8px;flex-wrap:wrap;}
.sn-trust-pill{display:flex;align-items:center;gap:5px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:20px;padding:6px 12px;font-size:11.5px;font-weight:700;color:var(--green);}

/* BANNERS */
.sn-banner{border-radius:28px;padding:52px 48px;display:grid;gap:40px;align-items:center;grid-template-columns:1fr;position:relative;overflow:hidden;background:var(--card);border:1.5px solid var(--brd);opacity:0;transform:translateY(24px);}
.sn-banner.sn-visible{animation:visIn .6s ease both;}
@media(min-width:768px){.sn-banner{grid-template-columns:1fr auto;}}
.sn-vendor-ban{border-color:rgba(16,185,129,.25);}
.sn-banner-glow{position:absolute;width:400px;height:400px;border-radius:50%;filter:blur(70px);top:-120px;right:-120px;background:radial-gradient(circle,rgba(255,107,0,.16) 0%,transparent 70%);pointer-events:none;}
.sn-vglow{background:radial-gradient(circle,rgba(16,185,129,.14) 0%,transparent 70%);}
.sn-banner-body{display:flex;flex-direction:column;gap:20px;position:relative;z-index:1;}
.sn-perks{display:flex;flex-wrap:wrap;gap:8px;}
.sn-perk{display:flex;align-items:center;gap:6px;background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.2);border-radius:20px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--txt);}
.sn-banner-ctas{display:flex;gap:12px;flex-wrap:wrap;}
.sn-banner-vis{position:relative;display:flex;align-items:center;justify-content:center;width:200px;height:200px;flex-shrink:0;}
.sn-ring{position:absolute;border-radius:50%;border:1.5px solid rgba(255,107,0,.2);animation:ringPulse 3s ease-in-out infinite;}
.sn-ring1{width:130px;height:130px;animation-delay:0s;}
.sn-ring2{width:172px;height:172px;animation-delay:.6s;}
.sn-ring3{width:214px;height:214px;animation-delay:1.2s;}
.sn-vring1{width:125px;height:125px;border-color:rgba(16,185,129,.25);}
.sn-vring2{width:168px;height:168px;border-color:rgba(16,185,129,.15);}
@keyframes ringPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.06)}}
.sn-center-ico{position:absolute;z-index:2;width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;}
.sn-rider-ico{background:rgba(255,107,0,.12);border:2px solid rgba(255,107,0,.3);}
.sn-vendor-ico{background:rgba(16,185,129,.1);border:2px solid rgba(16,185,129,.3);}

/* FAQ */
.sn-faq{max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:8px;opacity:0;transform:translateY(24px);}
.sn-faq.sn-visible{animation:visIn .6s ease both;animation-delay:var(--d,0s);}
.sn-faq-item{background:var(--card);border:1.5px solid var(--brd);border-radius:16px;overflow:hidden;transition:border-color .2s;}
.sn-faq-open{border-color:rgba(255,107,0,.35);}
.sn-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;background:transparent;border:none;color:var(--txt);font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;text-align:left;transition:background .15s;}
.sn-faq-q:hover{background:rgba(255,107,0,.04);}
.sn-faq-a{padding:14px 20px 18px;font-size:14px;font-weight:400;color:var(--txt2);line-height:1.75;border-top:1px solid var(--brd);animation:faqDrop .2s ease;}
@keyframes faqDrop{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}

/* CONTACT */
.sn-contact-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;opacity:0;transform:translateY(24px);}
@media(min-width:768px){.sn-contact-grid{grid-template-columns:repeat(4,1fr);}}
.sn-contact-grid.sn-visible{animation:visIn .6s ease both;animation-delay:var(--d,0s);}
.sn-contact-card{background:var(--card);border:1.5px solid var(--brd);border-radius:20px;padding:28px 18px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;transition:border-color .2s,transform .2s;}
.sn-contact-card:hover{border-color:rgba(255,107,0,.3);transform:translateY(-3px);}
.sn-contact-ico{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;}
.sn-contact-lbl{font-size:10px;font-weight:800;color:var(--txt3);text-transform:uppercase;letter-spacing:.7px;}
.sn-contact-val{font-size:13px;font-weight:600;color:var(--txt);}

/* FINAL CTA */
.sn-final{padding:120px 24px;position:relative;overflow:hidden;background:var(--surf);}
.sn-final-orb-a{position:absolute;width:600px;height:600px;top:-250px;left:-200px;border-radius:50%;background:radial-gradient(circle,rgba(255,107,0,.2) 0%,transparent 70%);filter:blur(80px);animation:orbA 18s ease-in-out infinite alternate;}
.sn-final-orb-b{position:absolute;width:500px;height:500px;bottom:-200px;right:-200px;border-radius:50%;background:radial-gradient(circle,rgba(255,107,0,.14) 0%,transparent 70%);filter:blur(80px);animation:orbA 24s ease-in-out infinite alternate-reverse;}
.sn-final-inner{display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;z-index:2;opacity:0;transform:translateY(24px);}
.sn-final-inner.sn-visible{animation:visIn .6s ease both;}
.sn-final-h2{font-family:'Syne',sans-serif;font-size:clamp(34px,6vw,62px);font-weight:900;line-height:1.1;letter-spacing:-2px;color:var(--txt);margin-bottom:16px;}
.sn-final-p{font-size:17px;font-weight:400;color:var(--txt2);margin-bottom:40px;max-width:440px;}
.sn-final-ctas{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;}

/* FOOTER */
.sn-footer{background:#050508;border-top:1px solid var(--brd);padding:72px 24px 32px;}
.sn-footer-grid{display:grid;grid-template-columns:1fr;gap:40px;margin-bottom:52px;}
@media(min-width:768px){.sn-footer-grid{grid-template-columns:2fr 1fr 1fr 1fr 1fr;}}
.sn-footer-brand{display:flex;flex-direction:column;gap:14px;}
.sn-footer-tag{font-size:13px;font-weight:400;color:var(--txt2);line-height:1.7;max-width:230px;}
.sn-social{display:flex;gap:8px;}
.sn-social-btn{width:36px;height:36px;border-radius:10px;background:var(--card);border:1px solid var(--brd);color:var(--txt2);display:flex;align-items:center;justify-content:center;text-decoration:none;transition:all .2s;}
.sn-social-btn:hover{border-color:var(--acc);color:var(--acc);background:rgba(255,107,0,.08);}
.sn-footer-col{display:flex;flex-direction:column;gap:8px;}
.sn-footer-col-ttl{font-family:'Syne',sans-serif;font-size:12px;font-weight:800;color:var(--txt);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;}
.sn-footer-link{background:transparent;border:none;color:var(--txt2);font-family:'DM Sans',sans-serif;font-size:13.5px;font-weight:400;cursor:pointer;text-align:left;padding:3px 0;transition:color .15s;}
.sn-footer-link:hover{color:var(--acc);}
.sn-footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--brd);padding-top:24px;font-size:12px;font-weight:500;color:var(--txt3);}
`;