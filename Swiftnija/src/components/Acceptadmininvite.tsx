// AcceptAdminInvite.tsx
// Standalone page at /admin/accept-invite?token=...&id=...
// No login required — anyone with the link can complete onboarding

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { db, auth } from "../firebase";
import {
  RiFlashlightLine, RiCheckLine, RiAlertLine, RiEyeLine, RiEyeOffLine,
  RiShieldUserLine, RiMailLine, RiLockPasswordLine, RiUserLine,
} from "react-icons/ri";

export default function AcceptAdminInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const inviteId = params.get("id");

  type Step = "loading" | "invalid" | "expired" | "already_used" | "form" | "success";
  const [step, setStep] = useState<Step>("loading");
  const [invite, setInvite] = useState<{
    email: string;
    role: "admin" | "superadmin";
    invitedBy?: string;
    expiresAt?: Timestamp;
  } | null>(null);

  const [form, setForm] = useState({ name: "", password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Verify invite on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !inviteId) { setStep("invalid"); return; }

    getDoc(doc(db, "adminInvites", inviteId)).then(snap => {
      if (!snap.exists()) { setStep("invalid"); return; }
      const data = snap.data();

      if (data.token !== token) { setStep("invalid"); return; }
      if (data.status === "accepted") { setStep("already_used"); return; }

      if (data.expiresAt) {
        const exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (new Date() > exp) { setStep("expired"); return; }
      }

      setInvite({
        email: data.email,
        role: data.role || "admin",
        invitedBy: data.invitedBy,
        expiresAt: data.expiresAt,
      });
      setStep("form");
    }).catch(() => setStep("invalid"));
  }, [token, inviteId]);

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim()) { setError("Please enter your full name"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    if (!invite) return;

    setSubmitting(true);
    try {
      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, invite.email, form.password);

      // 2. Set display name
      await updateProfile(cred.user, { displayName: form.name.trim() });

      // 3. Add to admins collection
      await setDoc(doc(db, "admins", cred.user.uid), {
        uid: cred.user.uid,
        displayName: form.name.trim(),
        email: invite.email,
        role: invite.role,
        permissions: {},
        tempPermissions: {},
        status: "active",
        createdAt: serverTimestamp(),
        invitedBy: invite.invitedBy || null,
        inviteId: inviteId,
      });

      // 4. Mark invite as accepted
      await updateDoc(doc(db, "adminInvites", inviteId!), {
        status: "accepted",
        acceptedBy: cred.user.uid,
        acceptedAt: serverTimestamp(),
      });

      setStep("success");

      // Redirect after 2.5s
      setTimeout(() => navigate("/admin/login"), 2500);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        setError("This email already has an account. Try logging in at /admin/login.");
      } else {
        setError((e as Error).message || "Something went wrong. Please try again.");
      }
    }
    setSubmitting(false);
  };

  // ── Shared styles ───────────────────────────────────────────────────────────
  const C = {
    bg: "#08080f",
    surface: "rgba(255,255,255,0.03)",
    surface2: "rgba(255,255,255,0.055)",
    border: "rgba(255,255,255,0.07)",
    text: "#e8e8f5",
    textSub: "#9898b8",
    muted: "#4a4a6a",
    orange: "#FF6B00",
    green: "#10B981",
    red: "#EF4444",
    purple: "#8B5CF6",
    blue: "#3B82F6",
    shadow: "rgba(0,0,0,0.5)",
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "12px 14px",
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 12, color: C.text, fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  const accentColor = invite?.role === "superadmin" ? C.purple : C.orange;

  // ── Render states ───────────────────────────────────────────────────────────
  const renderState = () => {
    if (step === "loading") return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "spin 1.5s linear infinite" }}>
          <RiFlashlightLine size={24} color="white" />
        </div>
        <div style={{ color: C.muted, fontSize: 14 }}>Verifying your invitation…</div>
      </div>
    );

    if (step === "invalid") return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${C.red}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.red, border: `1px solid ${C.red}28` }}>
          <RiAlertLine size={28} />
        </div>
        <h2 style={{ color: C.text, fontWeight: 900, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10 }}>Invalid Invitation</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>This invitation link is invalid or doesn't exist.<br />Please ask your Super Admin to resend the invite.</p>
      </div>
    );

    if (step === "expired") return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${C.orange}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.orange, border: `1px solid ${C.orange}28` }}>
          <RiAlertLine size={28} />
        </div>
        <h2 style={{ color: C.text, fontWeight: 900, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10 }}>Invitation Expired</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>This invitation link has expired (invites are valid for 7 days).<br />Please ask your Super Admin to send a new invite.</p>
      </div>
    );

    if (step === "already_used") return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${C.green}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.green, border: `1px solid ${C.green}28` }}>
          <RiCheckLine size={28} />
        </div>
        <h2 style={{ color: C.text, fontWeight: 900, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10 }}>Already Accepted</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>This invitation has already been used.<br />Your account is set up — just log in.</p>
        <button onClick={() => navigate("/admin/login")} style={{ padding: "11px 28px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Go to Login
        </button>
      </div>
    );

    if (step === "success") return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `${C.green}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", color: C.green, border: `1px solid ${C.green}28`, animation: "pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)" }}>
          <RiCheckLine size={32} />
        </div>
        <h2 style={{ color: C.text, fontWeight: 900, fontSize: 22, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 10 }}>You're in! 🎉</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>Your admin account has been created.<br />Redirecting you to login…</p>
        <div style={{ marginTop: 20, width: "100%", height: 3, borderRadius: 3, background: C.surface2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.orange})`, animation: "progress 2.5s linear forwards" }} />
        </div>
      </div>
    );

    if (step === "form" && invite) return (
      <div>
        {/* Role badge */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 40, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, color: accentColor, fontSize: 12, fontWeight: 800 }}>
            <RiShieldUserLine size={14} />
            {invite.role === "superadmin" ? "⚡ Super Admin Invite" : "Admin Invite"}
          </div>
        </div>

        {/* Email display */}
        <div style={{ background: `${accentColor}0a`, border: `1px solid ${accentColor}20`, borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
          <RiMailLine size={16} color={accentColor} />
          <div>
            <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>Invited email</div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{invite.email}</div>
          </div>
        </div>

        {error && (
          <div style={{ padding: "11px 14px", background: `${C.red}12`, border: `1px solid ${C.red}28`, borderRadius: 10, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 18, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <RiAlertLine size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ display: "block", color: C.textSub, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Your Full Name</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiUserLine size={15} /></span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Amara Okafor"
                style={{ ...inp, paddingLeft: 40 }}
                autoFocus
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: "block", color: C.textSub, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Set Password</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiLockPasswordLine size={15} /></span>
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 8 characters"
                style={{ ...inp, paddingLeft: 40, paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}
              >
                {showPw ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
              </button>
            </div>
            {/* Strength indicator */}
            {form.password.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                {[1, 2, 3, 4].map(i => {
                  const strength = Math.min(4, Math.floor(form.password.length / 3));
                  const colors = ["", C.red, C.orange, C.orange, C.green];
                  return <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= strength ? colors[strength] : C.surface2, transition: "background 0.3s" }} />;
                })}
              </div>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label style={{ display: "block", color: C.textSub, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Confirm Password</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiLockPasswordLine size={15} /></span>
              <input
                type="password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Re-enter password"
                style={{ ...inp, paddingLeft: 40, borderColor: form.confirm && form.confirm !== form.password ? C.red + "80" : inp.borderColor as string }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              {form.confirm && form.confirm === form.password && (
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.green, display: "flex" }}>
                  <RiCheckLine size={16} />
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          disabled={submitting || !form.name || !form.password || !form.confirm}
          onClick={handleSubmit}
          style={{
            marginTop: 24, width: "100%", padding: "13px",
            borderRadius: 14,
            background: (submitting || !form.name || !form.password || !form.confirm)
              ? C.surface2
              : `linear-gradient(135deg, ${accentColor}, ${accentColor === C.purple ? "#7C3AED" : "#FF8C00"})`,
            border: "none", color: "white", fontWeight: 800,
            fontSize: 15, cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
            opacity: (submitting || !form.name || !form.password || !form.confirm) ? 0.5 : 1,
            transition: "all 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: (submitting || !form.name) ? "none" : `0 4px 20px ${accentColor}44`,
          }}
        >
          {submitting ? (
            <>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Creating your account…
            </>
          ) : (
            <><RiCheckLine size={16} /> Create My Account</>
          )}
        </button>
      </div>
    );

    return null;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Background glow */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${C.orange}08 0%, transparent 70%)` }} />
      </div>

      <div style={{ width: "100%", maxWidth: 440, position: "relative" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: `0 8px 28px ${C.orange}44` }}>
            <RiFlashlightLine size={24} color="white" />
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: C.text }}>
            swift<span style={{ color: C.orange }}>nija</span>
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
            {step === "form" ? "Complete your admin account setup" : "Admin Portal"}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 24,
          padding: "32px 28px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
          {step === "form" && (
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6, textAlign: "center" }}>
              Welcome to SwiftNija
            </h2>
          )}
          {step === "form" && (
            <p style={{ color: C.muted, fontSize: 13, textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
              You've been invited to join the admin team.<br />Set up your account below.
            </p>
          )}
          {renderState()}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, color: C.muted, fontSize: 12 }}>
          Already have an account?{" "}
          <button onClick={() => navigate("/admin/login")} style={{ background: "none", border: "none", color: C.orange, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
            Sign in
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes progress { from { width: 0%; } to { width: 100%; } }
        input:focus { border-color: ${C.orange} !important; box-shadow: 0 0 0 3px ${C.orange}18 !important; }
        button:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}