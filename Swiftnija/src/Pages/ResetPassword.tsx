// pages/ResetPassword.tsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import {
  FiLock, FiEye, FiEyeOff, FiArrowRight,
  FiAlertCircle, FiCheckCircle, FiShield,
} from "react-icons/fi";

// ─────────────────────────────────────────
// PASSWORD VALIDATION
// ─────────────────────────────────────────
const validatePassword = (pwd: string): string => {
  if (!pwd) return "Password is required";
  if (pwd.length < 8) return "Minimum 8 characters";
  if (!/[A-Z]/.test(pwd)) return "Must include an uppercase letter";
  if (!/[0-9]/.test(pwd)) return "Must include a number";
  if (/^(.)\1+$/.test(pwd)) return "Password is too simple";
  return "";
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = getAuth();

  const oobCode = searchParams.get("oobCode") ?? "";
  const from    = searchParams.get("from")    ?? "user";

  // ── Determine where to redirect after reset ──
  const getRedirectPath = () => {
    switch (from) {
      case "vendor": return "/vendor/login";
      case "admin":  return "/admin/login";
      case "rider":  return "/rider/login";
      default:       return "/login";
    }
  };

  // ── Label for the back to login button ──
  const getLoginLabel = () => {
    switch (from) {
      case "vendor": return "Back to Vendor Login";
      case "admin":  return "Back to Admin Login";
      case "rider":  return "Back to Rider Login";
      default:       return "Back to Login";
    }
  };

  const [email,     setEmail]     = useState("");
  const [newPwd,    setNewPwd]    = useState("");
  const [confPwd,   setConfPwd]   = useState("");
  const [showPwd,   setShowPwd]   = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [pwdError,  setPwdError]  = useState("");
  const [confError, setConfError] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [verified,  setVerified]  = useState(false);
  const [done,      setDone]      = useState(false);
  const [invalid,   setInvalid]   = useState(false);

  // Verify the oobCode is valid on mount
  useEffect(() => {
    if (!oobCode) { setInvalid(true); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then(email => { setEmail(email); setVerified(true); })
      .catch(() => setInvalid(true));
  }, [oobCode]);

  // Redirect after success
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate(getRedirectPath()), 3000);
    return () => clearTimeout(t);
  }, [done]);

  const handleReset = async () => {
    const pErr = validatePassword(newPwd);
    const cErr = newPwd !== confPwd ? "Passwords do not match" : "";
    setPwdError(pErr);
    setConfError(cErr);
    if (pErr || cErr) return;

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPwd);
      setDone(true);
    } catch (e: any) {
      setPwdError(
        e.code === "auth/expired-action-code"
          ? "This reset link has expired. Please request a new one."
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const strength = [
    { rule: newPwd.length >= 8,   label: "At least 8 characters" },
    { rule: /[A-Z]/.test(newPwd), label: "One uppercase letter"  },
    { rule: /[0-9]/.test(newPwd), label: "One number"            },
  ];

  // ── Invalid / expired link ──
  if (invalid) return (
    <div className="rp-bg">
      <div className="rp-orb o1" /><div className="rp-orb o2" />
      <div className="rp-card">
        <div className="rp-brand">
          <img
            src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png"
            alt="Swift9ja"
            className="rp-logo-img"
          />
          <span className="rp-brand-name">Swift<span>9ja</span></span>
        </div>
        <div className="rp-status-icon red">
          <FiAlertCircle size={36} color="white" />
        </div>
        <h2 className="rp-title">Invalid or expired link</h2>
        <p className="rp-sub">
          This password reset link is no longer valid.<br />
          Please go back and request a new one.
        </p>
        <button className="rp-btn" onClick={() => navigate(getRedirectPath())}>
          {getLoginLabel()} <FiArrowRight size={15} />
        </button>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // ── Verifying oobCode ──
  if (!verified) return (
    <div className="rp-bg">
      <div className="rp-orb o1" /><div className="rp-orb o2" />
      <div className="rp-card">
        <div className="rp-brand">
          <img
            src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png"
            alt="Swift9ja"
            className="rp-logo-img"
          />
          <span className="rp-brand-name">Swift<span>9ja</span></span>
        </div>
        <div className="rp-spin" />
        <p className="rp-sub">Verifying reset link...</p>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // ── Success ──
  if (done) return (
    <div className="rp-bg">
      <div className="rp-orb o1" /><div className="rp-orb o2" />
      <div className="rp-card">
        <div className="rp-brand">
          <img
            src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png"
            alt="Swift9ja"
            className="rp-logo-img"
          />
          <span className="rp-brand-name">Swift<span>9ja</span></span>
        </div>
        <div className="rp-status-icon green">
          <FiCheckCircle size={36} color="white" />
        </div>
        <h2 className="rp-title">Password updated!</h2>
        <p className="rp-sub">
          Your password has been reset successfully.<br />
          You can now sign in with your new password.
        </p>
        <p className="rp-redir">Redirecting you to login in 3 seconds...</p>
        <button className="rp-btn" onClick={() => navigate(getRedirectPath())}>
          {getLoginLabel()} <FiArrowRight size={15} />
        </button>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // ── Main form ──
  return (
    <div className="rp-bg">
      <div className="rp-orb o1" /><div className="rp-orb o2" />

      <div className="rp-card">

        {/* Brand */}
        <div className="rp-brand">
          <img
            src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png"
            alt="Swift9ja"
            className="rp-logo-img"
          />
          <span className="rp-brand-name">Swift<span>9ja</span></span>
        </div>

        {/* User type badge — only shows for non-regular users */}
        {from !== "user" && (
          <div className="rp-type-badge">
            {from === "vendor" && "🏪 Vendor Account"}
            {from === "admin"  && "🛡️ Admin Account"}
            {from === "rider"  && "🏍️ Rider Account"}
          </div>
        )}

        {/* Icon */}
        <div className="rp-icon-wrap">
          <FiShield size={28} color="white" />
        </div>

        <h2 className="rp-title">Set new password</h2>
        <p className="rp-sub">
          Resetting password for{" "}
          <strong style={{ color: "white" }}>{email}</strong>
        </p>

        {/* New password */}
        <div className="rp-field-wrap">
          <label className="rp-label">New Password</label>
          <div className={`rp-field-box${pwdError ? " err" : ""}`}>
            <FiLock size={15} color="#555" />
            <input
              className="rp-input"
              type={showPwd ? "text" : "password"}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              value={newPwd}
              onChange={e => { setNewPwd(e.target.value); setPwdError(""); }}
            />
            <button
              className="rp-eye"
              type="button"
              onClick={() => setShowPwd(v => !v)}
            >
              {showPwd ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            </button>
          </div>
          {pwdError && <span className="rp-error">{pwdError}</span>}
        </div>

        {/* Confirm password */}
        <div className="rp-field-wrap">
          <label className="rp-label">Confirm Password</label>
          <div className={`rp-field-box${confError ? " err" : ""}`}>
            <FiLock size={15} color="#555" />
            <input
              className="rp-input"
              type={showConf ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confPwd}
              onChange={e => { setConfPwd(e.target.value); setConfError(""); }}
            />
            <button
              className="rp-eye"
              type="button"
              onClick={() => setShowConf(v => !v)}
            >
              {showConf ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            </button>
          </div>
          {confError && <span className="rp-error">{confError}</span>}
        </div>

        {/* Strength hints */}
        {newPwd && (
          <div className="rp-hints">
            {strength.map((h, i) => (
              <div key={i} className={`rp-hint${h.rule ? " pass" : ""}`}>
                <div className="rp-hint-dot" />
                {h.label}
              </div>
            ))}
          </div>
        )}

        {/* Submit */}
        <button
          className="rp-btn"
          onClick={handleReset}
          disabled={loading}
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading
            ? <><div className="rp-spin-sm" />Updating...</>
            : <>Update Password <FiArrowRight size={15} /></>
          }
        </button>

        {/* Back link */}
        <button
          className="rp-back"
          onClick={() => navigate(getRedirectPath())}
        >
          {getLoginLabel()}
        </button>

      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  .rp-bg {
    min-height:100vh; background:#07070b;
    display:flex; align-items:center; justify-content:center;
    font-family:'Nunito',sans-serif; position:relative;
    overflow:hidden; padding:20px;
  }

  .rp-orb {
    position:fixed; border-radius:50%; filter:blur(100px);
    pointer-events:none; z-index:0;
  }
  .o1 {
    width:560px; height:560px;
    background:radial-gradient(circle,rgba(255,107,0,.13),transparent 70%);
    top:-220px; left:-200px;
    animation:rp-drift 20s ease-in-out infinite alternate;
  }
  .o2 {
    width:440px; height:440px;
    background:radial-gradient(circle,rgba(124,58,237,.08),transparent 70%);
    bottom:-160px; right:-160px;
    animation:rp-drift 26s ease-in-out infinite alternate-reverse;
  }
  @keyframes rp-drift {
    0%{transform:translate(0,0)}
    100%{transform:translate(28px,22px)}
  }

  /* Card */
  .rp-card {
    position:relative; z-index:10;
    width:100%; max-width:440px;
    background:#0d0d15; border:1px solid #191926; border-radius:28px;
    padding:36px 28px 28px;
    display:flex; flex-direction:column; align-items:center; gap:18px;
    box-shadow:0 40px 80px rgba(0,0,0,.75),
               inset 0 1px 0 rgba(255,255,255,.03);
  }

  /* Brand */
  .rp-brand { display:flex; align-items:center; gap:10px; }
  .rp-logo-img { width:38px; height:38px; object-fit:contain; }
  .rp-brand-name {
    font-family:'Syne',sans-serif; font-size:22px;
    font-weight:900; color:white; letter-spacing:-.5px;
  }
  .rp-brand-name span { color:#FF6B00; }

  /* User type badge */
  .rp-type-badge {
    background:rgba(255,107,0,.08);
    border:1.5px solid rgba(255,107,0,.2);
    border-radius:20px; padding:5px 14px;
    font-size:12px; font-weight:800; color:#FF6B00;
  }

  /* Icon wrap */
  .rp-icon-wrap {
    width:68px; height:68px; border-radius:20px;
    background:linear-gradient(135deg,#FF6B00,#FF8C00);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 10px 28px rgba(255,107,0,.35);
    animation:rp-pop .5s cubic-bezier(.175,.885,.32,1.275) both;
  }
  @keyframes rp-pop {
    0%{transform:scale(0);opacity:0}
    100%{transform:scale(1);opacity:1}
  }

  /* Status icons */
  .rp-status-icon {
    width:80px; height:80px; border-radius:24px;
    display:flex; align-items:center; justify-content:center;
    animation:rp-pop .5s cubic-bezier(.175,.885,.32,1.275) both;
  }
  .rp-status-icon.green {
    background:linear-gradient(135deg,#10B981,#059669);
    box-shadow:0 10px 28px rgba(16,185,129,.35);
  }
  .rp-status-icon.red {
    background:linear-gradient(135deg,#ef4444,#dc2626);
    box-shadow:0 10px 28px rgba(239,68,68,.35);
  }

  /* Text */
  .rp-title {
    font-family:'Syne',sans-serif; font-size:22px;
    font-weight:900; color:white; text-align:center; letter-spacing:-.4px;
  }
  .rp-sub {
    font-size:13px; font-weight:600; color:#3e3e56;
    text-align:center; line-height:1.65;
  }
  .rp-redir {
    font-size:12px; font-weight:600; color:#2a2a40; text-align:center;
  }

  /* Fields */
  .rp-field-wrap { display:flex; flex-direction:column; gap:6px; width:100%; }
  .rp-label {
    font-size:10.5px; font-weight:800; color:#aaa;
    text-transform:uppercase; letter-spacing:.7px;
  }
  .rp-field-box {
    display:flex; align-items:center; gap:10px;
    background:#111115; border:1.5px solid #252528;
    border-radius:13px; padding:11px 13px;
    transition:border-color .2s, box-shadow .2s;
  }
  .rp-field-box:focus-within {
    border-color:#FF6B00;
    box-shadow:0 0 0 3px rgba(255,107,0,.12);
  }
  .rp-field-box.err {
    border-color:#ef4444;
    box-shadow:0 0 0 3px rgba(239,68,68,.1);
  }
  .rp-input {
    flex:1; background:transparent; border:none; outline:none;
    color:white; font-family:'Nunito',sans-serif;
    font-size:13px; font-weight:600; min-width:0;
  }
  .rp-input::placeholder { color:#3a3a40; }
  .rp-eye {
    background:transparent; border:none; color:#555;
    cursor:pointer; display:flex; align-items:center;
    padding:0; transition:color .2s;
  }
  .rp-eye:hover { color:#FF6B00; }
  .rp-error {
    font-size:11px; font-weight:700; color:#ef4444;
    display:flex; align-items:center; gap:5px;
  }

  /* Strength hints */
  .rp-hints { display:flex; flex-direction:column; gap:7px; width:100%; padding:2px 0; }
  .rp-hint {
    display:flex; align-items:center; gap:8px;
    font-size:11.5px; font-weight:700; color:#2a2a40;
    transition:color .2s;
  }
  .rp-hint.pass { color:#10B981; }
  .rp-hint-dot {
    width:6px; height:6px; border-radius:50%;
    background:#252528; flex-shrink:0; transition:background .2s;
  }
  .rp-hint.pass .rp-hint-dot { background:#10B981; }

  /* Button */
  .rp-btn {
    display:flex; align-items:center; justify-content:center;
    gap:8px; width:100%;
    background:linear-gradient(135deg,#FF6B00,#FF8C00);
    color:white; border:none; border-radius:14px; padding:13px 20px;
    font-family:'Nunito',sans-serif; font-size:14px; font-weight:800;
    cursor:pointer; box-shadow:0 8px 24px rgba(255,107,0,.35);
    transition:transform .2s, box-shadow .2s, opacity .2s;
  }
  .rp-btn:hover:not(:disabled) {
    transform:translateY(-2px);
    box-shadow:0 12px 32px rgba(255,107,0,.5);
  }
  .rp-btn:disabled { cursor:not-allowed; }

  /* Back link */
  .rp-back {
    background:transparent; border:none; color:#2a2a40;
    font-family:'Nunito',sans-serif; font-size:12px; font-weight:700;
    cursor:pointer; transition:color .2s;
    text-decoration:underline; text-underline-offset:3px;
  }
  .rp-back:hover { color:#FF6B00; }

  /* Spinners */
  .rp-spin {
    width:36px; height:36px;
    border:3px solid rgba(255,107,0,.2);
    border-top-color:#FF6B00; border-radius:50%;
    animation:rp-spin .8s linear infinite;
  }
  .rp-spin-sm {
    width:14px; height:14px;
    border:2px solid rgba(255,255,255,.3);
    border-top-color:white; border-radius:50%;
    animation:rp-spin .8s linear infinite; flex-shrink:0;
  }
  @keyframes rp-spin { to { transform:rotate(360deg); } }

  @media (max-width:480px) {
    .rp-card { padding:28px 18px 22px; border-radius:22px; }
  }
`;