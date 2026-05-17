// src/Pages/MeetTeamPage.tsx
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiCode, FiLayout, FiTruck,
  FiShield, FiHeadphones, FiBarChart2,
} from "react-icons/fi";
import { RiVerifiedBadgeFill } from "react-icons/ri";

const ORANGE = "#FF6B00";

const TEAM = [
  {
    name: "Ocholi Divine",
    role: "Founder & CEO",
    dept: "Leadership",
    Icon: FiBarChart2,
    color: ORANGE,
    bio: "Visionary builder behind SwiftNija. Product design, engineering, and strategy.",
    verified: true,
  },
  {
    name: "Tech Lead",
    role: "Lead Engineer",
    dept: "Engineering",
    Icon: FiCode,
    color: "#3b82f6",
    bio: "Architects the SwiftNija backend and rider tracking infrastructure.",
    verified: false,
  },
  {
    name: "Design Lead",
    role: "UI / UX Designer",
    dept: "Design",
    Icon: FiLayout,
    color: "#8b5cf6",
    bio: "Crafts every screen and interaction across the SwiftNija platform.",
    verified: false,
  },
  {
    name: "Operations Lead",
    role: "Head of Operations",
    dept: "Operations",
    Icon: FiTruck,
    color: "#10B981",
    bio: "Manages rider onboarding, vendor partnerships, and daily logistics.",
    verified: false,
  },
  {
    name: "Trust & Safety",
    role: "Safety Officer",
    dept: "Security",
    Icon: FiShield,
    color: "#f59e0b",
    bio: "Ensures every transaction and user interaction on the platform is safe.",
    verified: false,
  },
  {
    name: "Support Lead",
    role: "Customer Success",
    dept: "Support",
    Icon: FiHeadphones,
    color: "#ec4899",
    bio: "Heads 24/7 support, making sure every customer issue is resolved fast.",
    verified: false,
  },
];

export default function MeetTeamPage() {
  const nav = useNavigate();

  return (
    <div className="mt-root">
      <header className="mt-topbar">
        <button className="mt-back" onClick={() => nav(-1)}>
          <FiArrowLeft size={18} />
        </button>
        <span className="mt-topbar-title">Meet the Team</span>
        <div style={{ width: 40 }} />
      </header>

      <div className="mt-wrap">
        <div className="mt-page-hero">
          <span className="mt-kicker">Our People</span>
          <h1 className="mt-page-h">The Minds Behind <span style={{ color: ORANGE }}>SwiftNija</span></h1>
          <p className="mt-page-sub">
            A small, focused team of builders, designers, and operators working to make
            Lagos delivery faster and smarter every day.
          </p>
        </div>

        <div className="mt-grid">
          {TEAM.map((m, i) => (
            <div key={i} className="mt-card">
              <div className="mt-card-top" style={{ background: `${m.color}12` }}>
                <div className="mt-avatar" style={{ background: `${m.color}18`, border: `1.5px solid ${m.color}40` }}>
                  <m.Icon size={26} color={m.color} />
                </div>
                {m.verified && (
                  <div className="mt-verified"><RiVerifiedBadgeFill size={13} color="#3b82f6" /></div>
                )}
              </div>
              <div className="mt-card-body">
                <div className="mt-dept" style={{ color: m.color }}>{m.dept}</div>
                <div className="mt-name">{m.name}</div>
                <div className="mt-role">{m.role}</div>
                <p className="mt-bio">{m.bio}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-join-banner">
          <div className="mt-join-text">
            <div className="mt-join-h">Want to join the team?</div>
            <div className="mt-join-sub">We're always looking for exceptional people to help build the future of delivery in Nigeria.</div>
          </div>
          <button className="mt-join-btn" onClick={() => nav("/about/company")}>
            Learn More
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
.mt-root { min-height:100vh; background:var(--bg); color:var(--txt); font-family:'Plus Jakarta Sans',sans-serif; padding-bottom:40px; }
.mt-topbar { position:sticky; top:0; z-index:200; display:flex; align-items:center; justify-content:space-between; padding:0 16px; height:56px; background:rgba(10,10,15,.97); border-bottom:1px solid var(--brd); backdrop-filter:blur(20px); }
.mt-back { width:36px; height:36px; border-radius:9px; background:rgba(255,255,255,.05); border:1px solid var(--brd); color:var(--txt2); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .15s; }
.mt-back:hover { border-color:var(--acc); color:var(--acc); }
.mt-topbar-title { font-size:14px; font-weight:700; color:var(--txt); }
.mt-wrap { max-width:760px; margin:0 auto; padding:28px 16px; display:flex; flex-direction:column; gap:24px; }

.mt-page-hero { display:flex; flex-direction:column; gap:10px; }
.mt-kicker { display:inline-flex; background:rgba(255,107,0,.09); border:1px solid rgba(255,107,0,.22); border-radius:20px; padding:5px 14px; font-size:10px; font-weight:800; color:var(--acc); text-transform:uppercase; letter-spacing:.8px; align-self:flex-start; }
.mt-page-h { font-family:'Playfair Display',serif; font-size:clamp(24px,5vw,36px); font-weight:900; color:var(--txt); line-height:1.15; }
.mt-page-sub { font-size:13.5px; color:var(--txt2); line-height:1.8; max-width:480px; }

.mt-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
@media(min-width:600px) { .mt-grid { grid-template-columns:repeat(3,1fr); } }
.mt-card { background:var(--card); border:1px solid var(--brd); border-radius:14px; overflow:hidden; transition:border-color .18s,transform .18s; }
.mt-card:hover { border-color:rgba(255,107,0,.25); transform:translateY(-2px); }
.mt-card-top { position:relative; display:flex; align-items:center; justify-content:center; padding:22px 16px; }
.mt-avatar { width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.mt-verified { position:absolute; top:10px; right:10px; }
.mt-card-body { padding:12px 14px 16px; display:flex; flex-direction:column; gap:3px; }
.mt-dept { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; }
.mt-name { font-size:13.5px; font-weight:700; color:var(--txt); }
.mt-role { font-size:11.5px; color:var(--txt2); font-weight:500; margin-bottom:4px; }
.mt-bio { font-size:11.5px; color:var(--txt3); line-height:1.6; }

.mt-join-banner { background:linear-gradient(135deg,rgba(255,107,0,.12),rgba(255,107,0,.04)); border:1px solid rgba(255,107,0,.2); border-radius:16px; padding:24px 20px; display:flex; flex-direction:column; gap:14px; }
@media(min-width:600px) { .mt-join-banner { flex-direction:row; align-items:center; justify-content:space-between; } }
.mt-join-text { display:flex; flex-direction:column; gap:5px; }
.mt-join-h { font-size:16px; font-weight:700; color:var(--txt); }
.mt-join-sub { font-size:12.5px; color:var(--txt2); line-height:1.6; max-width:380px; }
.mt-join-btn { background:var(--acc); color:#fff; border:none; border-radius:8px; padding:12px 24px; font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; font-weight:700; cursor:pointer; white-space:nowrap; transition:all .18s; }
.mt-join-btn:hover { background:#e05800; transform:translateY(-1px); }
`;