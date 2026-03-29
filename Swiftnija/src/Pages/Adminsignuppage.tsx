import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  doc, getDoc, updateDoc, setDoc, serverTimestamp, collection,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { db, auth } from "../firebase"; // adjust path as needed

// ─── COLORS (mirrors AdminDashboard) ─────────────────────────────────────────
const C = {
  bg: "#07070e",
  surface: "rgba(255,255,255,0.025)",
  surface2: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)",
  orange: "#FF6B00",
  orangeGlow: "rgba(255,107,0,0.1)",
  text: "#e2e2f0",
  muted: "#4a4a6a",
  green: "#10B981",
  red: "#EF4444",
  blue: "#3B82F6",
};

// ─── TYPES ────────────────────────────────────────────────────────────────────
type InviteStatus = "loading" | "valid" | "invalid" | "expired" | "used";
type FormStep = "details" | "password" | "done";

interface InviteDoc {
  id: string;
  email?: string;
  role?: "admin" | "superadmin";
  status?: "pending" | "accepted" | "expired";
  invitedByName?: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

const CheckCircle = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
    <circle cx="28" cy="28" r="28" fill="rgba(16,185,129,0.1)" />
    <circle cx="28" cy="28" r="20" fill="rgba(16,185,129,0.15)" />
    <path d="M18 28l7 7 13-13" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShieldX = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
    <circle cx="28" cy="28" r="28" fill="rgba(239,68,68,0.08)" />
    <path d="M28 14l12 5v10c0 7-5 13-12 15-7-2-12-8-12-15V19z" stroke="#EF4444" strokeWidth="1.5" fill="none" />
    <line x1="22" y1="22" x2="34" y2="34" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
    <line x1="34" y1="22" x2="22" y2="34" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const LogoMark = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="10" fill="#FF6B00" />
    <path d="M8 22l8-14 8 14" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 18h10" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

// ─── PASSWORD STRENGTH ────────────────────────────────────────────────────────
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: C.red };
  if (score <= 3) return { score, label: "Fair", color: C.orange };
  if (score === 4) return { score, label: "Good", color: C.blue };
  return { score, label: "Strong", color: C.green };
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminSignupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = searchParams.get("invite") ?? "";

  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("loading");
  const [invite, setInvite] = useState<InviteDoc | null>(null);
  const [step, setStep] = useState<FormStep>("details");

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Load & validate invite ──────────────────────────────────────────────────
  useEffect(() => {
    if (!inviteId) { setInviteStatus("invalid"); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "adminInvites", inviteId));
        if (!snap.exists()) { setInviteStatus("invalid"); return; }
        const data = { id: snap.id, ...snap.data() } as InviteDoc;
        if (data.status === "accepted") { setInviteStatus("used"); return; }
        if (data.status === "expired") { setInviteStatus("expired"); return; }
        setInvite(data);
        setEmail(data.email ?? "");
        setInviteStatus("valid");
      } catch {
        setInviteStatus("invalid");
      }
    })();
  }, [inviteId]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!displayName.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: displayName.trim() });

      // 2. Create admin record in Firestore (doc ID = uid so login can find it)
      await setDoc(doc(db, "admins", cred.user.uid), {
        uid: cred.user.uid,
        email: email.trim(),
        displayName: displayName.trim(),
        role: invite?.role ?? "admin",
        permissions: {},
        inviteId,
        createdAt: serverTimestamp(),
        status: "active",
      });

      // 3. Mark invite as accepted
      await updateDoc(doc(db, "adminInvites", inviteId), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        acceptedByUid: cred.user.uid,
      });

      // 4. Small delay so Firestore writes settle before auth listener
      //    in AdminDashboard tries to fetch the admin doc
      await new Promise(r => setTimeout(r, 800));
      setStep("done");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message ?? "";
      console.error("Signup error:", code, message);
      if (code === "auth/email-already-in-use") {
        setError("This email is already registered. If a previous signup attempt got stuck, delete the account in Firebase Auth console and try again — or contact a Super Admin.");
      }
      else if (code === "auth/weak-password") setError("Password is too weak. Try something stronger.");
      else if (code === "auth/invalid-email") setError("That email address doesn't look right.");
      else if (code === "permission-denied" || message.includes("permission")) {
        // Auth created but Firestore write failed — still proceed, admin record can be fixed manually
        setError("Account created but profile setup failed. A Super Admin may need to fix your access.");
        await new Promise(r => setTimeout(r, 2500));
        setStep("done");
        setSubmitting(false);
        return;
      } else {
        setError("Something went wrong: " + (message || code || "unknown error"));
      }
    }
    setSubmitting(false);
  };

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (inviteStatus === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={styles.spinner} />
            <p style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>Validating invite…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: error states ────────────────────────────────────────────────────
  if (inviteStatus !== "valid") {
    const msgs = {
      invalid: { title: "Invalid Invite", sub: "This invite link is not valid. Please ask a Super Admin to send a new one." },
      expired: { title: "Invite Expired", sub: "This invite has been revoked or expired. Please request a fresh one." },
      used: { title: "Already Used", sub: "This invite has already been accepted. Try logging in instead." },
    };
    const { title, sub } = msgs[inviteStatus];
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><ShieldX /></div>
          <h2 style={styles.heading}>{title}</h2>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 28 }}>{sub}</p>
          <button onClick={() => navigate("/admin")} style={styles.btnPrimary}>Go to Login</button>
        </div>
      </div>
    );
  }

  // ── Render: success ─────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><CheckCircle /></div>
          <h2 style={styles.heading}>You're in! 🎉</h2>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>
            Your <strong style={{ color: C.text }}>{invite?.role === "superadmin" ? "Super Admin" : "Admin"}</strong> account has been created.
          </p>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 28 }}>
            Head to the dashboard to get started.
          </p>
          <button onClick={() => window.location.href = "/admin"} style={styles.btnPrimary}>Open Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Render: form ────────────────────────────────────────────────────────────
  const strength = passwordStrength(password);

  return (
    <div style={styles.page}>
      {/* Ambient glow */}
      <div style={styles.glowA} />
      <div style={styles.glowB} />

      <div style={styles.card}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <LogoMark />
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 900, fontSize: 16, color: C.text, letterSpacing: "-0.3px" }}>
              SwiftNija
            </div>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              Admin Portal
            </div>
          </div>
        </div>

        {/* Invite badge */}
        <div style={styles.inviteBadge}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: C.orange }}>
            Invited by {invite?.invitedByName ?? "Super Admin"}
          </span>
          <span style={{
            marginLeft: "auto", padding: "2px 8px", borderRadius: 6,
            background: invite?.role === "superadmin" ? "rgba(139,92,246,0.15)" : C.orangeGlow,
            color: invite?.role === "superadmin" ? "#8B5CF6" : C.orange,
            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5
          }}>
            {invite?.role === "superadmin" ? "Super Admin" : "Admin"}
          </span>
        </div>

        <h1 style={{ ...styles.heading, marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>
          Set up your credentials to access the admin dashboard.
        </p>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Full name */}
          <div>
            <label style={styles.label}>Full Name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Tunde Adeyemi"
              style={styles.input}
              autoFocus
            />
          </div>

          {/* Email */}
          <div>
            <label style={styles.label}>Email Address</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@swiftnija.com"
              type="email"
              style={{
                ...styles.input,
                background: invite?.email ? "rgba(255,107,0,0.04)" : undefined,
                color: invite?.email ? C.muted : C.text,
              }}
              readOnly={!!invite?.email}
            />
            {invite?.email && (
              <p style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>
                This invite is tied to this email and cannot be changed.
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label style={styles.label}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                type={showPw ? "text" : "password"}
                style={{ ...styles.input, paddingRight: 44 }}
              />
              <button
                onClick={() => setShowPw(v => !v)}
                style={styles.eyeBtn}
                type="button"
                tabIndex={-1}
              >
                <EyeIcon open={showPw} />
              </button>
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: `${(strength.score / 5) * 100}%`,
                    background: strength.color,
                    transition: "width 0.3s ease, background 0.3s ease",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: strength.color, minWidth: 40 }}>{strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label style={styles.label}>Confirm Password</label>
            <div style={{ position: "relative" }}>
              <input
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Repeat password"
                type={showConfirm ? "text" : "password"}
                style={{
                  ...styles.input,
                  paddingRight: 44,
                  borderColor: confirmPw && confirmPw !== password ? "rgba(239,68,68,0.4)" : undefined,
                }}
              />
              <button
                onClick={() => setShowConfirm(v => !v)}
                style={styles.eyeBtn}
                type="button"
                tabIndex={-1}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
            {confirmPw && confirmPw !== password && (
              <p style={{ color: C.red, fontSize: 11, marginTop: 5 }}>Passwords don't match</p>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !displayName || !email || !password || password !== confirmPw}
          style={{
            ...styles.btnPrimary,
            marginTop: 24,
            opacity: submitting || !displayName || !email || !password || password !== confirmPw ? 0.5 : 1,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ ...styles.spinner, width: 14, height: 14, borderWidth: 2 }} /> Creating account…
            </span>
          ) : "Create Admin Account →"}
        </button>

        <p style={{ textAlign: "center", color: C.muted, fontSize: 11, marginTop: 18 }}>
          Already have an account?{" "}
          <span
            onClick={() => navigate("/admin")}
            style={{ color: C.orange, cursor: "pointer", fontWeight: 700 }}
          >
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#07070e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'Nunito', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  glowA: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,107,0,0.06) 0%, transparent 70%)",
    top: -100,
    left: -100,
    pointerEvents: "none",
  },
  glowB: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)",
    bottom: -80,
    right: -80,
    pointerEvents: "none",
  },
  card: {
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 24,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 420,
    position: "relative",
    zIndex: 1,
    backdropFilter: "blur(12px)",
  },
  heading: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 22,
    fontWeight: 900,
    color: "#e2e2f0",
    letterSpacing: "-0.4px",
    margin: 0,
  },
  label: {
    display: "block",
    color: "#4a4a6a",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 7,
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12,
    color: "#e2e2f0",
    fontSize: 13,
    fontFamily: "'Nunito', sans-serif",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.2s",
  },
  eyeBtn: {
    position: "absolute",
    right: 13,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#4a4a6a",
    display: "flex",
    alignItems: "center",
    padding: 0,
  },
  inviteBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 13px",
    background: "rgba(255,107,0,0.06)",
    border: "1px solid rgba(255,107,0,0.12)",
    borderRadius: 10,
    marginBottom: 20,
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: "10px 14px",
    background: "rgba(239,68,68,0.07)",
    border: "1px solid rgba(239,68,68,0.15)",
    borderRadius: 10,
    color: "#EF4444",
    fontSize: 12,
    fontWeight: 600,
  },
  btnPrimary: {
    width: "100%",
    padding: "13px",
    borderRadius: 14,
    background: "linear-gradient(135deg, #FF6B00, #FF8C00)",
    border: "none",
    color: "white",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "'Nunito', sans-serif",
    letterSpacing: "0.2px",
    transition: "opacity 0.2s",
    display: "block",
  },
  spinner: {
    width: 20,
    height: 20,
    border: "2px solid rgba(255,255,255,0.1)",
    borderTopColor: "#FF6B00",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
};

// inject keyframe for spinner
const styleTag = document.createElement("style");
styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);