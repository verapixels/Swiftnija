// src/Pages/AboutFounderPage.tsx
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiAward, FiCode, FiGlobe, FiLinkedin,
  FiTwitter, FiMail, FiStar, FiZap, FiTarget,
} from "react-icons/fi";
import { RiVerifiedBadgeFill } from "react-icons/ri";

const ORANGE = "#FF6B00";
const LOGO = "/SWIFTNIJAS_LOGO_ICON-removebg-preview.png";

export default function AboutFounderPage() {
  const nav = useNavigate();

  return (
    <div className="af-root">
      {/* Topbar */}
      <header className="af-topbar">
        <button className="af-back" onClick={() => nav(-1)}>
          <FiArrowLeft size={18} />
        </button>
        <span className="af-topbar-title">About the Founder</span>
        <div style={{ width: 40 }} />
      </header>

      <div className="af-wrap">
        {/* Hero card */}
        <div className="af-hero-card">
          <div className="af-avatar-wrap">
            <div className="af-avatar">
              <FiStar size={44} color={ORANGE} />
            </div>
            <div className="af-av-ring" />
          </div>
          <div className="af-hero-info">
            <div className="af-verified-row">
              <RiVerifiedBadgeFill size={16} color="#3b82f6" />
              <span className="af-verified-lbl">Verified Founder</span>
            </div>
            <h1 className="af-founder-name">Ocholi Divine</h1>
            <p className="af-founder-title">Founder & CEO — Verapixels</p>
            <div className="af-socials">
              <a href="#" className="af-social-btn"><FiLinkedin size={15} /></a>
              <a href="#" className="af-social-btn"><FiTwitter size={15} /></a>
              <a href="mailto:info.verapixels@gmail.com" className="af-social-btn"><FiMail size={15} /></a>
            </div>
          </div>
        </div>

        {/* Quote */}
        <blockquote className="af-quote">
          "When every pixel is in its perfect place, the experience becomes invisible — it just works."
          <cite>— Ocholi Divine</cite>
        </blockquote>

        {/* Bio */}
        <section className="af-section">
          <h2 className="af-sec-h">Who is Ocholi Divine?</h2>
          <p className="af-sec-p">
            Ocholi Divine is a visionary software engineer and product designer based in Lagos, Nigeria.
            He founded <strong style={{ color: ORANGE }}>Verapixels</strong> in 2025 with a singular mission:
            to build digital products that feel effortless — where every interaction is smooth, every pixel intentional.
          </p>
          <p className="af-sec-p">
            With a deep passion for building products that solve real-world African problems, Ocholi created
            <strong style={{ color: ORANGE }}> SwiftNija</strong> — Lagos's fastest on-demand delivery platform —
            to connect everyday consumers with local vendors and riders in real time.
          </p>
        </section>

        {/* Stats */}
        <div className="af-stats-row">
          {[
            { n: "2025", l: "Founded" },
            { n: "50k+", l: "Orders" },
            { n: "500+", l: "Riders" },
            { n: "4.9★", l: "Rating" },
          ].map((s, i) => (
            <div key={i} className="af-stat">
              <div className="af-stat-n">{s.n}</div>
              <div className="af-stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Values */}
        <section className="af-section">
          <h2 className="af-sec-h">Core Beliefs</h2>
          {[
            { Icon: FiCode,   t: "Build with Precision",  d: "Every line of code, every design choice must serve the user." },
            { Icon: FiGlobe,  t: "Africa-First Thinking", d: "Design for the realities of African infrastructure and users." },
            { Icon: FiZap,    t: "Speed is a Feature",    d: "Slow products fail people. Speed is respect." },
            { Icon: FiTarget, t: "Impact Over Hype",      d: "Real products that solve real problems, not shiny demos." },
          ].map((v, i) => (
            <div key={i} className="af-value">
              <div className="af-value-ico"><v.Icon size={18} color={ORANGE} /></div>
              <div>
                <div className="af-value-t">{v.t}</div>
                <div className="af-value-d">{v.d}</div>
              </div>
            </div>
          ))}
        </section>

        {/* CTA */}
        <div className="af-cta-row">
          <button className="af-btn-primary" onClick={() => nav("/about/team")}>
            Meet the Team <FiAward size={14} />
          </button>
          <button className="af-btn-ghost" onClick={() => nav("/about/company")}>
            About Company
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
:root {
  --bg:#0a0a0f; --bg2:#0f0f18; --card:#12121e; --brd:#1e1e32;
  --txt:#f0f0fa; --txt2:#7878a0; --txt3:#30304a; --acc:#FF6B00;
}
.af-root { min-height:100vh; background:var(--bg); color:var(--txt); font-family:'Plus Jakarta Sans',sans-serif; padding-bottom:40px; }
.af-topbar { position:sticky; top:0; z-index:200; display:flex; align-items:center; justify-content:space-between; padding:0 16px; height:56px; background:rgba(10,10,15,.97); border-bottom:1px solid var(--brd); backdrop-filter:blur(20px); }
.af-back { width:36px; height:36px; border-radius:9px; background:rgba(255,255,255,.05); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; }
.af-back:hover { border-color:var(--acc); color:var(--acc); }
.af-topbar-title { font-size:14px; font-weight:700; color:var(--txt); }
.af-wrap { max-width:640px; margin:0 auto; padding:24px 16px; display:flex; flex-direction:column; gap:20px; }

.af-hero-card { background:var(--card); border:1px solid var(--brd); border-radius:18px; padding:28px 20px; display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; }
.af-avatar-wrap { position:relative; }
.af-avatar { width:88px; height:88px; border-radius:50%; background:rgba(255,107,0,.1); border:2px solid rgba(255,107,0,.3); display:flex; align-items:center; justify-content:center; }
.af-av-ring { position:absolute; inset:-5px; border-radius:50%; border:1.5px dashed rgba(255,107,0,.25); animation:spinRing 12s linear infinite; }
@keyframes spinRing { to { transform:rotate(360deg); } }
.af-hero-info { display:flex; flex-direction:column; align-items:center; gap:4px; }
.af-verified-row { display:flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#3b82f6; text-transform:uppercase; letter-spacing:.5px; }
.af-founder-name { font-family:'Playfair Display',serif; font-size:28px; font-weight:900; color:var(--txt); }
.af-founder-title { font-size:13px; color:var(--txt2); font-weight:500; }
.af-socials { display:flex; gap:8px; margin-top:6px; }
.af-social-btn { width:34px; height:34px; border-radius:9px; background:var(--bg2); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; text-decoration:none; transition:all .15s; }
.af-social-btn:hover { border-color:var(--acc); color:var(--acc); }

.af-quote { border-left:3px solid var(--acc); padding:14px 18px; background:rgba(255,107,0,.05); border-radius:0 12px 12px 0; font-size:14px; color:rgba(255,255,255,.75); font-style:italic; line-height:1.8; }
.af-quote cite { display:block; margin-top:8px; font-style:normal; font-size:12px; font-weight:700; color:var(--acc); }

.af-section { display:flex; flex-direction:column; gap:12px; }
.af-sec-h { font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:var(--txt); }
.af-sec-p { font-size:13.5px; color:var(--txt2); line-height:1.85; }

.af-stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.af-stat { background:var(--card); border:1px solid var(--brd); border-radius:12px; padding:16px 8px; text-align:center; }
.af-stat-n { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:var(--acc); }
.af-stat-l { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; color:var(--txt3); margin-top:2px; }

.af-value { display:flex; align-items:flex-start; gap:14px; background:var(--card); border:1px solid var(--brd); border-radius:12px; padding:16px; transition:border-color .15s; }
.af-value:hover { border-color:rgba(255,107,0,.25); }
.af-value-ico { width:36px; height:36px; border-radius:9px; background:rgba(255,107,0,.1); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.af-value-t { font-size:13px; font-weight:700; color:var(--txt); margin-bottom:3px; }
.af-value-d { font-size:12px; color:var(--txt2); line-height:1.6; }

.af-cta-row { display:flex; gap:10px; flex-wrap:wrap; padding-top:8px; }
.af-btn-primary { display:inline-flex; align-items:center; gap:7px; background:var(--acc); color:#fff; border:none; border-radius:8px; padding:12px 22px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all .18s; }
.af-btn-primary:hover { background:#e05800; transform:translateY(-1px); }
.af-btn-ghost { display:inline-flex; align-items:center; gap:7px; background:transparent; color:var(--txt2); border:1.5px solid var(--brd); border-radius:8px; padding:11px 20px; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:all .18s; }
.af-btn-ghost:hover { border-color:var(--acc); color:var(--acc); }
`;