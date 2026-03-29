import { useState } from "react";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import { RiGoogleFill, RiMailLine, RiLockLine, RiEyeLine, RiEyeOffLine, RiArrowRightLine } from "react-icons/ri";

export default function RidersLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "riders", cred.user.uid));
      if (!snap.exists()) { setError("No rider account found. Please sign up."); setLoading(false); return; }
      navigate("/rider");
    } catch {
      setError("Invalid email or password.");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const snap = await getDoc(doc(db, "riders", cred.user.uid));
      if (!snap.exists()) {
        navigate("/rider/signup");
        return;
      }
      navigate("/rider");
    } catch {
      setError("Google sign-in failed. Try again.");
    }
    setGoogleLoading(false);
  };

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* Left panel — video/brand */}
      <div style={S.left}>
        <div style={S.leftOverlay} />
        <div style={S.leftContent}>
          <div style={S.brand}>
            <div style={S.brandDot} />
            <span style={S.brandText}>SwiftNija</span>
          </div>
          <div style={S.heroText}>
            <h1 style={S.heroH1}>Deliver.<br />Earn.<br />Thrive.</h1>
            <p style={S.heroSub}>Join thousands of riders making money on their own schedule across Nigeria.</p>
          </div>
          <div style={S.statsRow}>
            {[["5,000+", "Active Riders"], ["₦50K+", "Avg. Monthly"], ["24/7", "Support"]].map(([v, l]) => (
              <div key={l} style={S.stat}>
                <div style={S.statVal}>{v}</div>
                <div style={S.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Animated bike silhouettes */}
        <div style={S.bikeAnim} className="bike-ride" />
      </div>

      {/* Right panel — form */}
      <div style={S.right}>
        <div style={S.formWrap}>
          <div style={S.formHeader}>
            <h2 style={S.formTitle}>Welcome back</h2>
            <p style={S.formSub}>Sign in to your rider account</p>
          </div>

          {error && (
            <div style={S.errorBox}>
              <span>⚠</span> {error}
            </div>
          )}

          {/* Google */}
          <button onClick={handleGoogle} disabled={googleLoading} style={S.googleBtn} className="hover-lift">
            <RiGoogleFill size={18} color="#EA4335" />
            <span>{googleLoading ? "Signing in…" : "Continue with Google"}</span>
          </button>

          <div style={S.divider}>
            <div style={S.divLine} />
            <span style={S.divText}>or sign in with email</span>
            <div style={S.divLine} />
          </div>

          <form onSubmit={handleLogin} style={S.form}>
            <div style={S.fieldWrap}>
              <label style={S.label}>Email address</label>
              <div style={S.inputWrap}>
                <RiMailLine size={16} style={S.inputIcon} />
                <input
                  type="email" value={email} required
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={S.input}
                  className="sn-input"
                />
              </div>
            </div>

            <div style={S.fieldWrap}>
              <label style={S.label}>Password</label>
              <div style={S.inputWrap}>
                <RiLockLine size={16} style={S.inputIcon} />
                <input
                  type={showPw ? "text" : "password"}
                  value={password} required
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...S.input, paddingRight: 44 }}
                  className="sn-input"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={S.eyeBtn}>
                  {showPw ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={S.submitBtn} className="hover-lift">
              {loading ? "Signing in…" : (
                <><span>Sign In</span><RiArrowRightLine size={18} /></>
              )}
            </button>
          </form>

          <p style={S.switchText}>
            New rider?{" "}
            <Link to="/rider/signup" style={S.switchLink}>Create your account →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const ORANGE = "#FF6B00";
const DARK = "#0a0a0e";

const S: Record<string, React.CSSProperties> = {
  page: { display: "flex", minHeight: "100vh", fontFamily: "'Syne', sans-serif", background: DARK },
  left: { flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "stretch", minHeight: "100vh", background: `linear-gradient(160deg, #0f0f15 0%, #1a1008 50%, #0a0a0e 100%)` },
  leftOverlay: { position: "absolute", inset: 0, background: `radial-gradient(ellipse at 30% 60%, ${ORANGE}22 0%, transparent 60%)`, zIndex: 1, pointerEvents: "none" },
  leftContent: { position: "relative", zIndex: 2, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px 52px", width: "100%" },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandDot: { width: 10, height: 10, borderRadius: "50%", background: ORANGE, boxShadow: `0 0 12px ${ORANGE}` },
  brandText: { fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" },
  heroText: { marginTop: "auto" },
  heroH1: { fontSize: "clamp(42px, 5vw, 68px)", fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-2px", marginBottom: 20 },
  heroSub: { fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 340, fontFamily: "'DM Sans', sans-serif", fontWeight: 400 },
  statsRow: { display: "flex", gap: 32, marginTop: 48, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.08)" },
  stat: { display: "flex", flexDirection: "column", gap: 4 },
  statVal: { fontSize: 22, fontWeight: 900, color: ORANGE },
  statLabel: { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, fontFamily: "'DM Sans', sans-serif" },
  bikeAnim: { position: "absolute", bottom: 80, left: -60, width: 200, height: 80, opacity: 0.06, background: "white", clipPath: "polygon(10% 80%, 40% 20%, 60% 20%, 90% 80%)", zIndex: 1 },

  right: { width: "100%", maxWidth: 520, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", background: "#0d0d14", borderLeft: "1px solid rgba(255,255,255,0.06)" },
  formWrap: { width: "100%", maxWidth: 400 },
  formHeader: { marginBottom: 36 },
  formTitle: { fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-1px", marginBottom: 8 },
  formSub: { fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans', sans-serif" },

  errorBox: { display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 20 },

  googleBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 20px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif", marginBottom: 24 },
  divider: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  divLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" },
  divText: { fontSize: 12, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" },

  form: { display: "flex", flexDirection: "column", gap: 18 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'DM Sans', sans-serif" },
  inputWrap: { position: "relative", display: "flex", alignItems: "center" },
  inputIcon: { position: "absolute", left: 14, color: "rgba(255,255,255,0.3)", pointerEvents: "none" } as React.CSSProperties,
  input: { width: "100%", padding: "14px 16px 14px 42px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", transition: "border-color 0.2s" },
  eyeBtn: { position: "absolute", right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", display: "flex", padding: 4 },
  submitBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px 24px", background: `linear-gradient(135deg, ${ORANGE}, #FF9A00)`, border: "none", borderRadius: 14, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 4, boxShadow: `0 8px 28px ${ORANGE}44`, transition: "all 0.2s", fontFamily: "'Syne', sans-serif" },
  switchText: { textAlign: "center" as const, fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 28, fontFamily: "'DM Sans', sans-serif" },
  switchLink: { color: ORANGE, fontWeight: 700, textDecoration: "none" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
  .sn-input:focus { border-color: ${ORANGE} !important; background: rgba(255,107,0,0.06) !important; }
  .sn-input::placeholder { color: rgba(255,255,255,0.2); }
  .hover-lift:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 36px ${ORANGE}55 !important; }
  .hover-lift:active:not(:disabled) { transform: translateY(0); }
  @keyframes bike-move { from { transform: translateX(-100px); } to { transform: translateX(calc(100vw + 200px)); } }
  @media (max-width: 768px) { .left-panel { display: none !important; } }
`;