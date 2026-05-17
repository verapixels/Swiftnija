// src/Pages/OurServicesPage.tsx
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiArrowRight, FiClock, FiMapPin,
  FiShield, FiStar, FiTruck,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore,
  MdStorefront, MdDirectionsBike, MdDeliveryDining,
} from "react-icons/md";
import { BsBoxSeam, BsLightningChargeFill } from "react-icons/bs";
import { RiMotorbikeFill } from "react-icons/ri";

const ORANGE = "#FF6B00";

const SERVICES = [
  {
    Icon: MdRestaurant,
    title: "Food Delivery",
    color: "#ef4444",
    desc: "From your favourite local restaurant to your door in under 20 minutes. Hot, fresh, fast.",
    features: ["Live order tracking", "500+ restaurants", "15-min avg delivery"],
  },
  {
    Icon: MdLocalPharmacy,
    title: "Pharmacy",
    color: "#3b82f6",
    desc: "Order medications and health products from certified pharmacies near you.",
    features: ["Verified pharmacies", "Discreet packaging", "Prescription handling"],
  },
  {
    Icon: MdLocalGroceryStore,
    title: "Groceries",
    color: "#10B981",
    desc: "Fresh produce, household essentials, and bulk groceries delivered same day.",
    features: ["Fresh produce", "Bulk orders", "Same-day delivery"],
  },
  {
    Icon: MdDirectionsBike,
    title: "Send & Pickup",
    color: "#8b5cf6",
    desc: "Send packages across Lagos with our trusted rider network. Real-time tracking included.",
    features: ["Cross-Lagos delivery", "Real-time tracking", "Proof of delivery"],
  },
  {
    Icon: MdStorefront,
    title: "Fashion",
    color: "#f59e0b",
    desc: "Shop the best fashion vendors in Lagos. Clothes, shoes, accessories delivered fast.",
    features: ["Curated vendors", "Easy returns", "Trend-first selection"],
  },
  {
    Icon: BsBoxSeam,
    title: "Beauty & Skincare",
    color: "#ec4899",
    desc: "Authentic beauty products from verified vendors. No fakes, no delays.",
    features: ["Verified authentic", "Wide selection", "Same-day delivery"],
  },
  {
    Icon: BsLightningChargeFill,
    title: "Electronics",
    color: "#06b6d4",
    desc: "Gadgets, phones, accessories and electronics from trusted Lagos stores.",
    features: ["Warranty assurance", "Secure packaging", "Quality guaranteed"],
  },
];

export default function OurServicesPage() {
  const nav = useNavigate();

  return (
    <div className="os-root">
      <header className="os-topbar">
        <button className="os-back" onClick={() => nav(-1)}>
          <FiArrowLeft size={18} />
        </button>
        <span className="os-topbar-title">Our Services</span>
        <div style={{ width: 40 }} />
      </header>

      <div className="os-wrap">
        {/* Hero */}
        <div className="os-hero">
          <span className="os-kicker">What We Deliver</span>
          <h1 className="os-hero-h">
            Everything You Need,<br /><span style={{ color: ORANGE }}>Delivered Swift.</span>
          </h1>
          <p className="os-hero-p">
            SwiftNija connects Lagos to food, medicines, groceries, fashion and more — all in one app.
          </p>
          {/* Quick stats */}
          <div className="os-quick-stats">
            {[
              { Icon: FiClock, label: "15 min avg", color: ORANGE },
              { Icon: FiStar,  label: "4.9 rating", color: "#f59e0b" },
              { Icon: FiShield,label: "100% secure", color: "#10B981" },
              { Icon: FiMapPin,label: "All Lagos",   color: "#3b82f6" },
            ].map((s, i) => (
              <div key={i} className="os-qstat">
                <s.Icon size={13} color={s.color} />
                <span style={{ color: s.color }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Service cards */}
        <div className="os-services-list">
          {SERVICES.map((s, i) => (
            <div key={i} className="os-scard">
              <div className="os-scard-top">
                <div className="os-sico" style={{ background: `${s.color}12`, border: `1px solid ${s.color}25` }}>
                  <s.Icon size={28} color={s.color} />
                </div>
                <div className="os-scard-info">
                  <h2 className="os-stitle">{s.title}</h2>
                  <p className="os-sdesc">{s.desc}</p>
                </div>
              </div>
              <div className="os-sfeatures">
                {s.features.map((f, fi) => (
                  <span key={fi} className="os-sfeat" style={{ borderColor: `${s.color}30`, color: s.color }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* How delivery works */}
        <div className="os-how-card">
          <h2 className="os-how-h">How Delivery Works</h2>
          <div className="os-how-steps">
            {[
              { n: "1", Icon: MdStorefront,    t: "Choose a vendor", color: ORANGE },
              { n: "2", Icon: FiTruck,         t: "We assign a rider", color: "#10B981" },
              { n: "3", Icon: FiMapPin,        t: "Track it live",     color: "#3b82f6" },
              { n: "4", Icon: MdDeliveryDining,t: "Delivered to you",  color: "#8b5cf6" },
            ].map((s, i) => (
              <div key={i} className="os-hstep">
                <div className="os-hico" style={{ background: `${s.color}12` }}><s.Icon size={18} color={s.color} /></div>
                <div className="os-htxt">{s.t}</div>
                {i < 3 && <div className="os-harrow"><FiArrowRight size={12} color="#2a2a44" /></div>}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="os-cta-row">
          <button className="os-btn-primary" onClick={() => nav("/signup")}>
            Start Ordering <FiArrowRight size={14} />
          </button>
          <button className="os-btn-ghost" onClick={() => nav("/vendor/register")}>
            Become a Vendor
          </button>
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
:root { --bg:#0a0a0f; --bg2:#0f0f18; --card:#12121e; --brd:#1e1e32; --txt:#f0f0fa; --txt2:#7878a0; --txt3:#30304a; --acc:#FF6B00; }
.os-root { min-height:100vh; background:var(--bg); color:var(--txt); font-family:'Plus Jakarta Sans',sans-serif; padding-bottom:40px; }
.os-topbar { position:sticky; top:0; z-index:200; display:flex; align-items:center; justify-content:space-between; padding:0 16px; height:56px; background:rgba(10,10,15,.97); border-bottom:1px solid var(--brd); backdrop-filter:blur(20px); }
.os-back { width:36px; height:36px; border-radius:9px; background:rgba(255,255,255,.05); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; }
.os-back:hover { border-color:var(--acc); color:var(--acc); }
.os-topbar-title { font-size:14px; font-weight:700; color:var(--txt); }
.os-wrap { max-width:680px; margin:0 auto; padding:24px 16px; display:flex; flex-direction:column; gap:20px; }

.os-hero { display:flex; flex-direction:column; gap:10px; }
.os-kicker { display:inline-flex; background:rgba(255,107,0,.09); border:1px solid rgba(255,107,0,.22); border-radius:20px; padding:5px 14px; font-size:10px; font-weight:800; color:var(--acc); text-transform:uppercase; letter-spacing:.8px; align-self:flex-start; }
.os-hero-h { font-family:'Playfair Display',serif; font-size:clamp(24px,5vw,36px); font-weight:900; color:var(--txt); line-height:1.15; }
.os-hero-p { font-size:13.5px; color:var(--txt2); line-height:1.8; max-width:480px; }
.os-quick-stats { display:flex; gap:8px; flex-wrap:wrap; margin-top:4px; }
.os-qstat { display:flex; align-items:center; gap:5px; background:var(--card); border:1px solid var(--brd); border-radius:20px; padding:6px 12px; font-size:11px; font-weight:700; }

.os-services-list { display:flex; flex-direction:column; gap:12px; }
.os-scard { background:var(--card); border:1px solid var(--brd); border-radius:14px; padding:18px 16px; display:flex; flex-direction:column; gap:12px; transition:border-color .15s,transform .15s; }
.os-scard:hover { border-color:rgba(255,107,0,.2); transform:translateY(-1px); }
.os-scard-top { display:flex; gap:14px; align-items:flex-start; }
.os-sico { width:52px; height:52px; border-radius:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.os-scard-info { display:flex; flex-direction:column; gap:5px; }
.os-stitle { font-size:15px; font-weight:700; color:var(--txt); }
.os-sdesc { font-size:12.5px; color:var(--txt2); line-height:1.6; }
.os-sfeatures { display:flex; gap:7px; flex-wrap:wrap; }
.os-sfeat { font-size:10.5px; font-weight:700; border:1px solid; border-radius:20px; padding:4px 10px; background:transparent; }

.os-how-card { background:var(--bg2); border:1px solid var(--brd); border-radius:16px; padding:20px 18px; }
.os-how-h { font-size:15px; font-weight:700; color:var(--txt); margin-bottom:16px; }
.os-how-steps { display:flex; align-items:flex-start; gap:0; flex-wrap:wrap; }
.os-hstep { display:flex; flex-direction:column; align-items:center; gap:7px; flex:1; min-width:70px; position:relative; }
.os-hico { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; }
.os-htxt { font-size:10.5px; font-weight:700; color:var(--txt2); text-align:center; line-height:1.4; max-width:70px; }
.os-harrow { position:absolute; right:-6px; top:14px; z-index:1; }

.os-cta-row { display:flex; gap:10px; flex-wrap:wrap; }
.os-btn-primary { display:inline-flex; align-items:center; gap:7px; background:var(--acc); color:#fff; border:none; border-radius:8px; padding:12px 22px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all .18s; }
.os-btn-primary:hover { background:#e05800; transform:translateY(-1px); }
.os-btn-ghost { display:inline-flex; align-items:center; gap:7px; background:transparent; color:var(--txt2); border:1.5px solid var(--brd); border-radius:8px; padding:11px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:all .18s; }
.os-btn-ghost:hover { border-color:var(--acc); color:var(--acc); }
`;