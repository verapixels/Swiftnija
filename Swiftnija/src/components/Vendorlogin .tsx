import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
  deleteUser,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { auth, db } from "../firebase";

// ─── ICONS ──────────────────────────────────────────────────
const Icon = {
  zap:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  mail:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  lock:   () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  eye:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  arrowR: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  arrowL: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  shield: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  star:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  truck:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  alert:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  check:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  store:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  checkCircle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
};

const provider = new GoogleAuthProvider();

// ─── PARTICLE CANVAS ──────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const W = canvas.width, H = canvas.height;
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.5 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,107,0,${p.alpha})`;
        ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255,107,0,${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

// ─── STAT TICKER ──────────────────────────────────────────────
const TICKER_ITEMS = [
  { val: "2,400+", label: "Active Vendors" },
  { val: "₦2.4B",  label: "Total Payouts"  },
  { val: "4.9 ★",  label: "Avg Rating"     },
  { val: "15 min", label: "Avg Delivery"   },
  { val: "98%",    label: "On-time Rate"   },
];
function StatTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % TICKER_ITEMS.length), 3000);
    return () => clearInterval(t);
  }, []);
  const item = TICKER_ITEMS[idx];
  return (
    <div key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.2)", borderRadius: 40, padding: "8px 18px", animation: "tickerFade 0.5s ease" }}>
      <span style={{ color: "#FF6B00", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18 }}>{item.val}</span>
      <span style={{ color: "#666", fontSize: 12, fontWeight: 600 }}>{item.label}</span>
    </div>
  );
}

// ─── FORGOT PASSWORD SCREEN ───────────────────────────────────
function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail]       = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [touched, setTouched]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [netErr, setNetErr]     = useState("");
  const [sent, setSent]         = useState(false);

  const validateEmail = (v: string) => {
    if (!v.trim()) return "Email is required";
    if (!/\S+@\S+\.\S+/.test(v)) return "Enter a valid email address";
    return "";
  };

  const handleSend = async () => {
    setTouched(true);
    const err = validateEmail(email);
    setEmailErr(err);
    if (err) return;
    setLoading(true);
    setNetErr("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e: any) {
      if (e.code === "auth/network-request-failed") {
        setNetErr("Network error. Check your connection and try again.");
      } else {
        setSent(true); // Security: don't reveal if email exists
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF6B00" }}>
            <Icon.checkCircle />
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: "white", marginBottom: 10 }}>Check your inbox</h3>
          <p style={{ color: "#555", fontSize: 13, lineHeight: 1.6 }}>
            If <strong style={{ color: "#aaa" }}>{email}</strong> is linked to a vendor account, you'll receive a reset link shortly.
          </p>
          <p style={{ color: "#444", fontSize: 11, marginTop: 8, fontWeight: 600 }}>Don't see it? Check your spam folder.</p>
        </div>
        <button onClick={onBack} style={btnCta}>
          Back to Sign In <Icon.arrowR />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "#555", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", padding: 0, width: "fit-content" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#FF6B00")}
        onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
        <Icon.arrowL /> Back to sign in
      </button>
      <div>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: "white", marginBottom: 8 }}>Reset your password</h3>
        <p style={{ color: "#555", fontSize: 13, lineHeight: 1.6 }}>Enter your vendor email and we'll send you a reset link.</p>
      </div>
      <div>
        <label style={labelStyle}>Email Address</label>
        <div style={{ position: "relative" }}>
          <span style={iconStyle}><Icon.mail /></span>
          <input
            type="email" value={email} placeholder="you@example.com" autoComplete="email"
            onChange={e => { setEmail(e.target.value); if (touched) setEmailErr(validateEmail(e.target.value)); setNetErr(""); }}
            onBlur={() => { setTouched(true); setEmailErr(validateEmail(email)); }}
            style={{ ...inputBase, borderColor: touched && emailErr ? "rgba(239,68,68,0.5)" : undefined }}
            onFocus={e => { e.target.style.borderColor = "#FF6B00"; e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)"; }}
          />
        </div>
        {touched && emailErr && <div style={errorStyle}>⚠ {emailErr}</div>}
      </div>
      {netErr && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12 }}>
          <span style={{ color: "#EF4444" }}><Icon.alert /></span>
          <span style={{ color: "#EF4444", fontSize: 13, fontWeight: 600 }}>{netErr}</span>
        </div>
      )}
      <button onClick={handleSend} disabled={loading} style={{ ...btnCta, opacity: loading ? 0.7 : 1 }}>
        {loading ? <><div style={spinner} /> Sending…</> : <>Send Reset Link <Icon.arrowR /></>}
      </button>
    </div>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  display: "block", width: "100%",
  background: "rgba(255,255,255,0.03)",
  border: "1.5px solid rgba(255,255,255,0.07)",
  borderRadius: 14, padding: "13px 14px 13px 44px",
  color: "rgba(255,255,255,0.9)", fontSize: 14,
  fontFamily: "'Nunito', sans-serif", outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  caretColor: "#FF6B00",
};
const labelStyle: React.CSSProperties = {
  display: "block", color: "#555", fontSize: 11, fontWeight: 800,
  letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8,
};
const iconStyle: React.CSSProperties = {
  position: "absolute", left: 14, top: "50%",
  transform: "translateY(-50%)", color: "#444",
  display: "flex", pointerEvents: "none", zIndex: 1,
};
const errorStyle: React.CSSProperties = {
  color: "#EF4444", fontSize: 11, fontWeight: 700, marginTop: 6,
};
const btnCta: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  width: "100%", padding: "15px 28px", borderRadius: 14,
  background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
  border: "none", color: "white", fontSize: 15, fontWeight: 800,
  cursor: "pointer", boxShadow: "0 6px 24px rgba(255,107,0,0.4)",
  transition: "all 0.2s", fontFamily: "'Nunito', sans-serif",
};
const spinner: React.CSSProperties = {
  width: 17, height: 17,
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "white", borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
  display: "inline-block",
};

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function VendorLogin() {
  const navigate = useNavigate();
  const [screen, setScreen]     = useState<"login" | "forgot">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [errors, setErrors]     = useState<{ email?: string; password?: string; general?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email address is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email address";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Password must be at least 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const checkVendorRole = async (uid: string): Promise<boolean> => {
    const q = await getDocs(
      query(
        collection(db, "vendors"),
        where("uid", "==", uid),
        where("role", "==", "vendor"),
        where("status", "==", "active"),
        limit(1)
      )
    );
    return !q.empty;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const isVendor = await checkVendorRole(result.user.uid);
      if (!isVendor) {
        await auth.signOut();
        setErrors({ general: "This account is not a vendor account." });
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/vendor"), 1600);
    } catch (err: any) {
      let msg = "Login failed — try again";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") msg = "Incorrect email or password";
      else if (err.code === "auth/invalid-email") msg = "Invalid email format";
      else if (err.code === "auth/too-many-requests") msg = "Too many attempts — wait a minute and try again";
      else if (err.code === "auth/network-request-failed") msg = "Network error. Check your connection.";
      setErrors({ general: msg });
      setLoading(false);
    }
  };

  // ── Google sign-in — vendor only ──
  const handleGoogle = async () => {
    setGLoading(true);
    setErrors({});
    try {
      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);

      // Block brand-new Google accounts
      if (info?.isNewUser) {
        await deleteUser(result.user);
        setErrors({ general: "No vendor account found for this Google email. Please register first." });
        setGLoading(false);
        return;
      }

      // Check vendor role
      const isVendor = await checkVendorRole(result.user.uid);
      if (!isVendor) {
        await auth.signOut();
        setErrors({ general: "This account is not a vendor account." });
        setGLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate("/vendor"), 1600);
    } catch (err: any) {
      if (auth.currentUser) await auth.signOut().catch(() => {});
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setErrors({ general: "Google sign-in failed. Please try again." });
      }
      setGLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleLogin(); };

  const FEATURES = [
    { icon: <Icon.truck />,  text: "Real-time order tracking & alerts" },
    { icon: <Icon.shield />, text: "Payouts secured by Paystack encryption" },
    { icon: <Icon.star />,   text: "Dashboard analytics for your store" },
    { icon: <Icon.store />,  text: "Manage products, stock & promos" },
  ];
  const VENDOR_AVATARS = [
    { init: "T", bg: "#FF6B00" }, { init: "K", bg: "#3B82F6" },
    { init: "F", bg: "#8B5CF6" }, { init: "E", bg: "#10B981" },
    { init: "N", bg: "#F59E0B" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#08080f", fontFamily: "'Nunito', sans-serif", color: "#ddd" }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ flex: "0 0 460px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }} className="vl-left">
        <ParticleCanvas />

        {/* Radial glow */}
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 500, background: "radial-gradient(circle, rgba(255,107,0,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Grid overlay */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,107,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,0,0.04) 1px, transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 10, padding: "44px 48px", display: "flex", flexDirection: "column", height: "100%" }}>

          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 56 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(135deg,#FF6B00,#FF8C00)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 28px rgba(255,107,0,0.4)", color: "white" }}>
              <Icon.zap />
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 900, color: "white", letterSpacing: "-0.5px" }}>
              swift<span style={{ color: "#FF6B00" }}>nija</span>
            </span>
          </div>

          {/* Badge + Headline */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)", borderRadius: 40, padding: "6px 16px", marginBottom: 20 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6B00", animation: "pulse 1.6s infinite" }} />
              <span style={{ color: "#FF6B00", fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>Vendor Dashboard</span>
            </div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 40, fontWeight: 900, color: "white", lineHeight: 1.05, letterSpacing: "-1px", marginBottom: 16 }}>
              Welcome<br />back,<br /><span style={{ color: "#FF6B00" }}>vendor.</span>
            </h1>
            <p style={{ color: "#555", fontSize: 15, lineHeight: 1.65, maxWidth: 300 }}>
              Your store, orders, and earnings are waiting for you.
            </p>
          </div>

          {/* Stat ticker */}
          <div style={{ marginBottom: 40 }}><StatTicker /></div>

          {/* Feature bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 44 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF6B00", flexShrink: 0 }}>{f.icon}</div>
                <span style={{ color: "#666", fontSize: 13, fontWeight: 600 }}>{f.text}</span>
              </div>
            ))}
          </div>

          {/* Social proof avatars */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto" }}>
            <div style={{ display: "flex", position: "relative", height: 38 }}>
              {VENDOR_AVATARS.map((a, i) => (
                <div key={i} style={{ width: 36, height: 36, borderRadius: "50%", border: "2.5px solid #08080f", background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 13, position: "absolute", left: i * 24, top: 0, zIndex: 5 - i }}>{a.init}</div>
              ))}
            </div>
            <div style={{ marginLeft: 120 }}>
              <div style={{ color: "#555", fontSize: 12 }}>Joined this week</div>
              <div style={{ color: "#FF6B00", fontWeight: 800, fontSize: 13 }}>+128 new vendors</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", overflowY: "auto", background: "radial-gradient(ellipse 600px 400px at 60% 0%, rgba(255,107,0,0.04) 0%, transparent 70%)" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: "40px 36px 32px", backdropFilter: "blur(12px)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", animation: "fadeSlideUp 0.4s ease both" }}>

            {/* ── Forgot Password Screen ── */}
            {screen === "forgot" && !success && (
              <ForgotScreen onBack={() => setScreen("login")} />
            )}

            {/* ── Success Screen ── */}
            {success && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "16px 0 8px" }}>
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: "linear-gradient(135deg,#FF6B00,#FF8C00)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 14px rgba(255,107,0,0.08)", animation: "successPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both", marginBottom: 28, color: "white" }}>
                  <Icon.check />
                </div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "white", marginBottom: 10 }}>You're in! 🎉</h2>
                <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6 }}>Taking you to your dashboard…</p>
                <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6B00", animation: `dotPulse 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Login Form ── */}
            {screen === "login" && !success && (
              <>
                {/* Header */}
                <div style={{ marginBottom: 32 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, rgba(255,107,0,0.15), rgba(255,107,0,0.05))", border: "1px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, color: "#FF6B00" }}>
                    <Icon.zap />
                  </div>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: "white", letterSpacing: "-0.5px", marginBottom: 6, lineHeight: 1.1 }}>
                    Sign in to your store
                  </h2>
                  <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6 }}>
                    Enter your vendor credentials to access your dashboard.
                  </p>
                </div>

                {/* General error banner */}
                {errors.general && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, marginBottom: 20, animation: "fadeSlideUp 0.3s ease" }}>
                    <span style={{ color: "#EF4444", flexShrink: 0 }}><Icon.alert /></span>
                    <span style={{ color: "#EF4444", fontSize: 13, fontWeight: 600 }}>{errors.general}</span>
                  </div>
                )}

                {/* Email */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Email Address</label>
                  <div style={{ position: "relative" }}>
                    <span style={iconStyle}><Icon.mail /></span>
                    <input
                      type="email" value={email} placeholder="you@example.com" autoComplete="email"
                      onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined, general: undefined })); }}
                      onKeyDown={handleKey}
                      style={{ ...inputBase, borderColor: errors.email ? "rgba(239,68,68,0.5)" : undefined, boxShadow: errors.email ? "0 0 0 3px rgba(239,68,68,0.08)" : undefined }}
                      onFocus={e => { if (!errors.email) { e.target.style.borderColor = "#FF6B00"; e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)"; } }}
                      onBlur={e => { e.target.style.borderColor = errors.email ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.07)"; e.target.style.boxShadow = errors.email ? "0 0 0 3px rgba(239,68,68,0.08)" : "none"; }}
                    />
                  </div>
                  {errors.email && <div style={errorStyle}>⚠ {errors.email}</div>}
                </div>

                {/* Password */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                    <span
                      onClick={() => setScreen("forgot")}
                      style={{ color: "#FF6B00", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                    >
                      Forgot password?
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <span style={iconStyle}><Icon.lock /></span>
                    <input
                      type={showPass ? "text" : "password"} value={password}
                      placeholder="Your password" autoComplete="current-password"
                      onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined, general: undefined })); }}
                      onKeyDown={handleKey}
                      style={{ ...inputBase, paddingRight: 44, borderColor: errors.password ? "rgba(239,68,68,0.5)" : undefined, boxShadow: errors.password ? "0 0 0 3px rgba(239,68,68,0.08)" : undefined }}
                      onFocus={e => { if (!errors.password) { e.target.style.borderColor = "#FF6B00"; e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)"; } }}
                      onBlur={e => { e.target.style.borderColor = errors.password ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.07)"; e.target.style.boxShadow = errors.password ? "0 0 0 3px rgba(239,68,68,0.08)" : "none"; }}
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#555", display: "flex" }}>
                      {showPass ? <Icon.eyeOff /> : <Icon.eye />}
                    </button>
                  </div>
                  {errors.password && <div style={errorStyle}>⚠ {errors.password}</div>}
                </div>

                {/* Remember me */}
                <div style={{ marginBottom: 28 }}>
                  <div onClick={() => setRemember(r => !r)} style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", padding: "6px 0" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${remember ? "#FF6B00" : "rgba(255,255,255,0.15)"}`, background: remember ? "#FF6B00" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      {remember && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ color: "#555", fontSize: 13, fontWeight: 600 }}>Keep me signed in</span>
                  </div>
                </div>

                {/* Sign In button */}
                <button onClick={handleLogin} disabled={loading || gLoading}
                  style={{ ...btnCta, opacity: loading || gLoading ? 0.7 : 1, cursor: loading || gLoading ? "default" : "pointer", boxShadow: loading ? "none" : "0 6px 24px rgba(255,107,0,0.4)", marginBottom: 0 }}
                  onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 30px rgba(255,107,0,0.5)"; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(255,107,0,0.4)"; }}>
                  {loading ? (<><div style={spinner} /> Verifying…</>) : (<>Sign In <Icon.arrowR /></>)}
                </button>

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                  <span style={{ color: "#333", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                </div>

                {/* Google */}
                <button onClick={handleGoogle} disabled={loading || gLoading}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "13px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", color: gLoading ? "#444" : "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, cursor: loading || gLoading ? "default" : "pointer", transition: "all 0.2s", fontFamily: "'Nunito', sans-serif" }}
                  onMouseEnter={e => { if (!gLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,107,0,0.3)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,107,0,0.04)"; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}>
                  {gLoading ? (
                    <><div style={{ ...spinner, width: 16, height: 16 }} /> Checking…</>
                  ) : (
                    <>
                      <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                      Continue with Google
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Sign up link */}
          {screen === "login" && !success && (
            <p style={{ textAlign: "center", marginTop: 20, color: "#444", fontSize: 13 }}>
              New to SwiftNija?{" "}
              <span onClick={() => navigate("/vendor/register")} style={{ color: "#FF6B00", fontWeight: 800, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                Create a vendor account
              </span>
            </p>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #08080f; }
        @media (max-width: 860px) { .vl-left { display: none !important; } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }
        @keyframes successPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes dotPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tickerFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.2); border-radius: 4px; }
      `}</style>
    </div>
  );
}