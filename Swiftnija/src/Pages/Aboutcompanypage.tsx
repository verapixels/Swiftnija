// src/Pages/AboutCompanyPage.tsx
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiZap, FiGlobe, FiTrendingUp,
  FiShield, FiUsers, FiPackage, FiArrowRight,
} from "react-icons/fi";
import { MdDeliveryDining } from "react-icons/md";

const ORANGE = "#FF6B00";
const LOGO = "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";

const MILESTONES = [
  { year: "2025 Q1", event: "Verapixels founded by Ocholi Divine in Lagos" },
  { year: "2025 Q2", event: "SwiftNija concept launched — first 10 vendors onboarded" },
  { year: "2025 Q3", event: "Rider network grows to 100+ active riders across Lagos" },
  { year: "2025 Q4", event: "10,000 orders milestone reached" },
  { year: "2026",    event: "50,000+ orders, 500+ riders, expanding across Nigeria" },
];

export default function AboutCompanyPage() {
  const nav = useNavigate();

  return (
    <div className="ac-root">
      <header className="ac-topbar">
        <button className="ac-back" onClick={() => nav(-1)}>
          <FiArrowLeft size={18} />
        </button>
        <span className="ac-topbar-title">About Company</span>
        <div style={{ width: 40 }} />
      </header>

      <div className="ac-wrap">
        {/* Hero */}
        <div className="ac-hero">
          <div className="ac-logo-row">
            <img src={LOGO} className="ac-logo" alt="SwiftNija" onError={e => (e.currentTarget.style.display = "none")} />
            <div>
              <div className="ac-brand-name">SwiftNija</div>
              <div className="ac-brand-by">by Verapixels</div>
            </div>
          </div>
          <h1 className="ac-hero-h">
            Built for Lagos.<br /><span style={{ color: ORANGE }}>Powered by Speed.</span>
          </h1>
          <p className="ac-hero-p">
            SwiftNija is a flagship product of Verapixels — a digital innovation company dedicated to
            building fast, reliable, and beautiful technology for everyday Nigerians.
          </p>
          <div className="ac-hero-art">
            <MdDeliveryDining size={70} color={ORANGE} style={{ filter: `drop-shadow(0 4px 20px ${ORANGE}55)`, animation: "delivBob 3s ease-in-out infinite" }} />
          </div>
        </div>

        {/* Mission */}
        <div className="ac-mission-card">
          <div className="ac-mission-icon"><FiZap size={20} color={ORANGE} /></div>
          <div>
            <div className="ac-mission-lbl">Our Mission</div>
            <p className="ac-mission-txt">
              To make on-demand delivery so fast and reliable that it becomes an invisible part of daily life in Lagos and beyond.
            </p>
          </div>
        </div>

        {/* Values */}
        <section className="ac-section">
          <h2 className="ac-sec-h">What We Stand For</h2>
          <div className="ac-values-grid">
            {[
              { Icon: FiZap,        t: "Speed",       d: "Every second matters. We optimize for the fastest possible experience.", color: ORANGE },
              { Icon: FiShield,     t: "Trust",       d: "Riders, vendors and customers trust us with their money and time.", color: "#10B981" },
              { Icon: FiGlobe,      t: "Local-First", d: "Built in Lagos, designed for Nigerian realities.", color: "#3b82f6" },
              { Icon: FiTrendingUp, t: "Growth",      d: "We grow when our vendors, riders, and users grow.", color: "#8b5cf6" },
            ].map((v, i) => (
              <div key={i} className="ac-vcard" style={{ "--vc": v.color } as any}>
                <div className="ac-vico" style={{ background: `${v.color}12` }}><v.Icon size={18} color={v.color} /></div>
                <div className="ac-vt">{v.t}</div>
                <div className="ac-vd">{v.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <div className="ac-stats">
          {[
            { Icon: FiPackage, n: "50k+",  l: "Orders Delivered", color: ORANGE },
            { Icon: FiUsers,   n: "500+",  l: "Active Riders",    color: "#10B981" },
            { Icon: FiGlobe,   n: "Lagos", l: "& Expanding",      color: "#3b82f6" },
            { Icon: FiZap,     n: "15 min",l: "Avg Delivery",      color: "#8b5cf6" },
          ].map((s, i) => (
            <div key={i} className="ac-stat">
              <div className="ac-stat-ico" style={{ background: `${s.color}12` }}><s.Icon size={16} color={s.color} /></div>
              <div className="ac-stat-n" style={{ color: s.color }}>{s.n}</div>
              <div className="ac-stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <section className="ac-section">
          <h2 className="ac-sec-h">Our Journey</h2>
          <div className="ac-timeline">
            {MILESTONES.map((m, i) => (
              <div key={i} className="ac-titem">
                <div className="ac-tline">
                  <div className="ac-tdot" />
                  {i < MILESTONES.length - 1 && <div className="ac-tbar" />}
                </div>
                <div className="ac-tcontent">
                  <div className="ac-tyear">{m.year}</div>
                  <div className="ac-tevent">{m.event}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="ac-cta-row">
          <button className="ac-btn-primary" onClick={() => nav("/about/founder")}>
            Meet the Founder <FiArrowRight size={14} />
          </button>
          <button className="ac-btn-ghost" onClick={() => nav("/about/team")}>
            Meet the Team
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
.ac-root { min-height:100vh; background:var(--bg); color:var(--txt); font-family:'Plus Jakarta Sans',sans-serif; padding-bottom:40px; }
.ac-topbar { position:sticky; top:0; z-index:200; display:flex; align-items:center; justify-content:space-between; padding:0 16px; height:56px; background:rgba(10,10,15,.97); border-bottom:1px solid var(--brd); backdrop-filter:blur(20px); }
.ac-back { width:36px; height:36px; border-radius:9px; background:rgba(255,255,255,.05); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; }
.ac-back:hover { border-color:var(--acc); color:var(--acc); }
.ac-topbar-title { font-size:14px; font-weight:700; color:var(--txt); }
.ac-wrap { max-width:680px; margin:0 auto; padding:24px 16px; display:flex; flex-direction:column; gap:24px; }

@keyframes delivBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }

.ac-hero { background:var(--card); border:1px solid var(--brd); border-radius:18px; padding:28px 22px; display:flex; flex-direction:column; gap:12px; overflow:hidden; position:relative; }
.ac-logo-row { display:flex; align-items:center; gap:10px; }
.ac-logo { width:32px; height:32px; object-fit:contain; }
.ac-brand-name { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:var(--txt); }
.ac-brand-by { font-size:11px; color:var(--txt2); }
.ac-hero-h { font-family:'Playfair Display',serif; font-size:clamp(22px,5vw,34px); font-weight:900; color:var(--txt); line-height:1.2; }
.ac-hero-p { font-size:13.5px; color:var(--txt2); line-height:1.8; }
.ac-hero-art { display:flex; justify-content:center; padding:12px 0 0; }

.ac-mission-card { display:flex; gap:14px; background:rgba(255,107,0,.06); border:1px solid rgba(255,107,0,.2); border-radius:14px; padding:18px 16px; align-items:flex-start; }
.ac-mission-icon { width:40px; height:40px; border-radius:10px; background:rgba(255,107,0,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ac-mission-lbl { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--acc); margin-bottom:5px; }
.ac-mission-txt { font-size:13.5px; color:var(--txt2); line-height:1.75; }

.ac-section { display:flex; flex-direction:column; gap:14px; }
.ac-sec-h { font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:var(--txt); }

.ac-values-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.ac-vcard { background:var(--card); border:1px solid var(--brd); border-radius:12px; padding:16px 14px; display:flex; flex-direction:column; gap:7px; transition:border-color .15s; }
.ac-vcard:hover { border-color:color-mix(in srgb,var(--vc) 40%,transparent); }
.ac-vico { width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center; }
.ac-vt { font-size:13px; font-weight:700; color:var(--txt); }
.ac-vd { font-size:11.5px; color:var(--txt2); line-height:1.55; }

.ac-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
@media(min-width:500px) { .ac-stats { grid-template-columns:repeat(4,1fr); } }
.ac-stat { background:var(--card); border:1px solid var(--brd); border-radius:12px; padding:16px 10px; display:flex; flex-direction:column; align-items:center; gap:7px; text-align:center; }
.ac-stat-ico { width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; }
.ac-stat-n { font-family:'Playfair Display',serif; font-size:17px; font-weight:700; }
.ac-stat-l { font-size:10px; font-weight:600; color:var(--txt2); }

.ac-timeline { display:flex; flex-direction:column; gap:0; }
.ac-titem { display:flex; gap:14px; }
.ac-tline { display:flex; flex-direction:column; align-items:center; flex-shrink:0; width:18px; }
.ac-tdot { width:10px; height:10px; border-radius:50%; background:var(--acc); border:2px solid rgba(255,107,0,.3); flex-shrink:0; margin-top:4px; }
.ac-tbar { flex:1; width:2px; background:var(--brd); min-height:36px; margin:4px 0; }
.ac-tcontent { padding:0 0 20px; }
.ac-tyear { font-size:10px; font-weight:800; color:var(--acc); text-transform:uppercase; letter-spacing:.8px; margin-bottom:3px; }
.ac-tevent { font-size:13px; color:var(--txt2); line-height:1.6; }

.ac-cta-row { display:flex; gap:10px; flex-wrap:wrap; }
.ac-btn-primary { display:inline-flex; align-items:center; gap:7px; background:var(--acc); color:#fff; border:none; border-radius:8px; padding:12px 22px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all .18s; }
.ac-btn-primary:hover { background:#e05800; transform:translateY(-1px); }
.ac-btn-ghost { display:inline-flex; align-items:center; gap:7px; background:transparent; color:var(--txt2); border:1.5px solid var(--brd); border-radius:8px; padding:11px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:all .18s; }
.ac-btn-ghost:hover { border-color:var(--acc); color:var(--acc); }
`;