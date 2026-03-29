// pages/VerifyAccount.tsx — phone verification is now optional (skippable)
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiMail, FiPhone, FiCheck, FiRefreshCw, FiArrowRight,
  FiShield, FiClock, FiAlertCircle, FiZap, FiChevronDown,
  FiMessageSquare, FiLock,
} from "react-icons/fi";
import { MdDeliveryDining, MdVerified } from "react-icons/md";

import app, { auth, db } from "../firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type VerifyStep  = "email" | "phone" | "done";
type PhoneMethod = "sms" | "email";

// ─────────────────────────────────────────
// OTP INPUT — 6 individual boxes
// ─────────────────────────────────────────
const OtpInput = ({
  value, onChange, disabled, hasError,
}: {
  value: string; onChange: (v: string) => void;
  disabled: boolean; hasError: boolean;
}) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) return;
    const arr = value.padEnd(6, " ").split("");
    arr[i] = char;
    const next = arr.join("").replace(/ /g, "").slice(0, 6);
    onChange(next);
    if (i < 5) setTimeout(() => refs.current[i + 1]?.focus(), 10);
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        onChange(value.slice(0, i - 1) + value.slice(i));
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      setTimeout(() => refs.current[Math.min(pasted.length, 5)]?.focus(), 10);
    }
  };

  const digits = value.padEnd(6, " ").split("").slice(0, 6);

  return (
    <div className="otp-row">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          className={`otp-box${digits[i]?.trim() ? " filled" : ""}${hasError ? " error" : ""}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() || ""}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────
// COUNTDOWN TIMER
// ─────────────────────────────────────────
const Countdown = ({ from, onDone, color = "#FF6B00" }: {
  from: number; onDone: () => void; color?: string;
}) => {
  const [sec, setSec] = useState(from);
  useEffect(() => { setSec(from); }, [from]);
  useEffect(() => {
    if (sec <= 0) { onDone(); return; }
    const t = setTimeout(() => setSec(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sec, onDone]);
  const m = Math.floor(sec / 60), s = sec % 60;
  return (
    <span className="cdw" style={{ color }}>
      <FiClock size={11} />
      {m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`}
    </span>
  );
};

// ─────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────
const Steps = ({ current }: { current: VerifyStep }) => {
  const order: VerifyStep[] = ["email", "phone", "done"];
  const currentIdx = order.indexOf(current);
  const steps = [
    { id: "email" as VerifyStep, label: "Email" },
    { id: "phone" as VerifyStep, label: "Phone" },
  ];
  return (
    <div className="steps-row">
      {steps.map((s, i) => {
        const stepIdx = order.indexOf(s.id);
        const isDone   = currentIdx > stepIdx;
        const isActive = currentIdx === stepIdx;
        return (
          <div key={s.id} className="step-wrap">
            <div className={`step-dot${isDone ? " done" : isActive ? " active" : ""}`}>
              {isDone ? <FiCheck size={12} /> : <span>{i + 1}</span>}
            </div>
            <span className={`step-lbl${isDone ? " done" : isActive ? " active" : ""}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`step-line${isDone ? " done" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function VerifyAccount() {
  const navigate = useNavigate();
  const fns = getFunctions(app);

  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState<VerifyStep>("email");

  // Email OTP
  const [emailCode, setEmailCode]           = useState("");
  const [emailSent, setEmailSent]           = useState(false);
  const [emailSending, setEmailSending]     = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailVerified, setEmailVerified]   = useState(false);
  const [emailError, setEmailError]         = useState("");
  const [emailCooldown, setEmailCooldown]   = useState(0);
  const [emailAttempts, setEmailAttempts]   = useState(3);

  // Phone OTP
  const [phone, setPhone]                     = useState("");
  const [phoneMethod, setPhoneMethod]         = useState<PhoneMethod>("sms");
  const [methodOpen, setMethodOpen]           = useState(false);
  const [phoneSent, setPhoneSent]             = useState(false);
  const [phoneSending, setPhoneSending]       = useState(false);
  const [phoneCode, setPhoneCode]             = useState("");
  const [phoneVerifying, setPhoneVerifying]   = useState(false);
  const [phoneVerified, setPhoneVerified]     = useState(false);
  const [phoneError, setPhoneError]           = useState("");
  const [phoneCooldown, setPhoneCooldown]     = useState(0);
  const [phoneAttempts, setPhoneAttempts]     = useState(3);
  const [smsCountdown, setSmsCountdown]       = useState(0);
  const [showSmsNudge, setShowSmsNudge]       = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMethodOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate("/signup"); return; }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const d = snap.data();
          setPhone(d.phone || "");
          // If both already verified, skip straight to home
          if (d.emailVerified && d.phoneVerified) { navigate("/home"); return; }
          // If only email verified, jump to phone step (skippable)
          if (d.emailVerified) { setEmailVerified(true); setStep("phone"); }
        }
      } catch (err) {
        console.warn("Profile load:", err);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [navigate]);

  // Auto-send email OTP on mount
  useEffect(() => {
    if (!loading && user && step === "email" && !emailSent) {
      user.getIdToken(true).then(() => sendEmailOtp());
    }
  }, [loading, user, step]);

  // Auto-verify when 6 digits entered
  useEffect(() => {
    if (emailCode.length === 6 && !emailVerifying && !emailVerified) verifyEmailOtp();
  }, [emailCode]);

  useEffect(() => {
    if (phoneCode.length === 6 && !phoneVerifying && !phoneVerified) verifyPhoneOtp();
  }, [phoneCode]);

  // Redirect after done
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => navigate("/home"), 2500);
    return () => clearTimeout(t);
  }, [step]);

  // ─────────────────────────────────────────
  // OTP HANDLERS
  // ─────────────────────────────────────────
  const sendEmailOtp = useCallback(async () => {
    if (!user || emailSending) return;
    setEmailSending(true);
    setEmailError("");
    try {
      const f = getFunctions(app);
      await httpsCallable(f, "sendEmailOtp")({});
      setEmailSent(true);
      setEmailCooldown(60);
    } catch (err: any) {
      setEmailError(
        err?.message?.includes("Too many")
          ? err.message
          : "Couldn't send code — try again."
      );
    } finally {
      setEmailSending(false);
    }
  }, [user, emailSending]);

  const verifyEmailOtp = async () => {
    if (!user || emailVerifying || emailCode.length !== 6) return;
    setEmailVerifying(true);
    setEmailError("");
    try {
      await httpsCallable(fns, "verifyEmailOtp")({ code: emailCode });
      setEmailVerified(true);
      setTimeout(() => setStep("phone"), 1400);
    } catch (err: any) {
      const msg: string = err?.message || "";
      setEmailAttempts(a => a - 1);
      if (msg.includes("expired")) {
        setEmailError("Code expired — sending a new one.");
        setEmailSent(false); setEmailCode(""); setEmailCooldown(0);
      } else {
        setEmailError(`Wrong code — ${emailAttempts - 1} attempt${emailAttempts - 1 !== 1 ? "s" : ""} left.`);
        setEmailCode("");
      }
    } finally {
      setEmailVerifying(false);
    }
  };

  const sendPhoneOtp = async () => {
    if (!user || phoneSending) return;
    setPhoneSending(true);
    setPhoneError("");
    setShowSmsNudge(false);

    if (phoneMethod === "sms") {
      // Placeholder — show 20s countdown then nudge to email
      setPhoneSending(false);
      setPhoneSent(true);
      setSmsCountdown(20);
      return;
    }

    try {
      await httpsCallable(fns, "sendPhoneOtp")({ phone });
      setPhoneSent(true);
      setPhoneCooldown(60);
    } catch (err: any) {
      setPhoneError(
        err?.message?.includes("Too many")
          ? err.message
          : "Couldn't send code — try again."
      );
    } finally {
      setPhoneSending(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!user || phoneVerifying || phoneCode.length !== 6) return;
    setPhoneVerifying(true);
    setPhoneError("");
    try {
      await httpsCallable(fns, "verifyPhoneOtp")({ code: phoneCode });
      setPhoneVerified(true);
      setTimeout(() => setStep("done"), 1400);
    } catch (err: any) {
      const msg: string = err?.message || "";
      setPhoneAttempts(a => a - 1);
      if (msg.includes("expired")) {
        setPhoneError("Code expired — request a new one.");
        setPhoneSent(false); setPhoneCode(""); setPhoneCooldown(0);
      } else {
        setPhoneError(`Wrong code — ${phoneAttempts - 1} attempt${phoneAttempts - 1 !== 1 ? "s" : ""} left.`);
        setPhoneCode("");
      }
    } finally {
      setPhoneVerifying(false);
    }
  };

  const maskedPhone = phone
    ? phone.replace(/(\+?\d{1,4})(\d+)(\d{4})$/, (_, a, _b, c) => `${a}••••${c}`)
    : "your number";

  // ─────────────────────────────────────────
  if (loading) return (
    <div className="vp-bg">
      <div className="vp-loader"><div className="vp-spin" /></div>
      <style>{CSS}</style>
    </div>
  );

  // ─── DONE ───
  if (step === "done") return (
    <div className="vp-bg">
      <div className="vp-orb o1" /><div className="vp-orb o2" />
      <div className="done-card">
        <div className="done-conic" />
        <div className="done-icon"><FiZap size={40} color="white" /></div>
        <h2 className="done-title">All verified!</h2>
        <p className="done-sub">
          Email and phone confirmed.<br />
          Welcome to <strong>swift<span>nija</span></strong> 🚀
        </p>
        <div className="done-chips">
          <div className="done-chip"><MdVerified size={13} /> Email verified</div>
          <div className="done-chip"><MdVerified size={13} /> Phone verified</div>
        </div>
        <button className="v-btn" onClick={() => navigate("/home")}>
          Go to Home <FiArrowRight size={15} />
        </button>
        <p className="done-redir">Redirecting automatically...</p>
      </div>
      <style>{CSS}</style>
    </div>
  );

  // ─── MAIN ───
  return (
    <div className="vp-bg" onClick={() => setMethodOpen(false)}>
      <div className="vp-orb o1" /><div className="vp-orb o2" />

      <div className="vp-card" onClick={e => e.stopPropagation()}>

        {/* Brand */}
        <div className="vp-brand">
          <div className="vp-brand-ico"><MdDeliveryDining size={20} /></div>
          <span className="vp-brand-name">swift<span>nija</span></span>
        </div>

        <Steps current={step} />

        {/* ══════ EMAIL STEP ══════ */}
        {step === "email" && (
          <div className="step-body">
            <div className={`v-icon-wrap${emailVerified ? " green" : ""}`}>
              {emailVerified ? <FiCheck size={28} color="white" /> : <FiMail size={28} color="white" />}
            </div>

            {!emailVerified ? (
              <>
                <h2 className="v-title">Verify your email</h2>
                <p className="v-sub">
                  {emailSent
                    ? <>Code sent to <span className="v-hl">{user?.email}</span></>
                    : <>Sending a 6-digit code to <span className="v-hl">{user?.email}</span></>
                  }
                </p>

                {(emailSending && !emailSent) && (
                  <div className="v-row-center">
                    <div className="v-spin-sm" />
                    <span className="v-status-txt">Sending code...</span>
                  </div>
                )}

                {emailSent && (
                  <>
                    <div className="v-info-box">
                      <FiMail size={14} color="#FF6B00" />
                      <div>
                        <div className="v-info-title">Check your inbox</div>
                        <div className="v-info-desc">Each digit is in its own styled box. Check spam if it's not there.</div>
                      </div>
                    </div>

                    <div className="v-otp-label"><FiLock size={11} />Enter the 6-digit code</div>
                    <OtpInput
                      value={emailCode}
                      onChange={v => { setEmailError(""); setEmailCode(v); }}
                      disabled={emailVerifying}
                      hasError={!!emailError}
                    />

                    {emailVerifying && (
                      <div className="v-row-center">
                        <div className="v-spin-sm" />
                        <span className="v-status-txt">Verifying...</span>
                      </div>
                    )}

                    {emailError && (
                      <div className="v-err-box">
                        <FiAlertCircle size={14} /><span>{emailError}</span>
                      </div>
                    )}

                    {emailAttempts < 3 && emailAttempts > 0 && (
                      <div className="v-attempts">
                        {[0, 1, 2].map(i => <div key={i} className={`att-dot${i < emailAttempts ? " on" : ""}`} />)}
                        <span>{emailAttempts} attempt{emailAttempts !== 1 ? "s" : ""} left</span>
                      </div>
                    )}

                    <div className="v-footer-row">
                      <span className="v-sec-note"><FiShield size={10} />SHA-256 · 5 min expiry</span>
                      {emailCooldown > 0
                        ? <span className="v-cdw-txt">Resend in <Countdown from={emailCooldown} onDone={() => setEmailCooldown(0)} /></span>
                        : <button className="v-ghost" onClick={sendEmailOtp} disabled={emailSending}><FiRefreshCw size={12} />Resend</button>
                      }
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 className="v-title" style={{ color: "#10B981" }}>Email verified ✓</h2>
                <p className="v-sub">Moving to phone verification...</p>
                <div className="ring-wrap"><div className="ring" /><div className="ring r2" /></div>
              </>
            )}
          </div>
        )}

        {/* ══════ PHONE STEP ══════ */}
        {step === "phone" && (
          <div className="step-body">
            <div className={`v-icon-wrap purple${phoneVerified ? " green" : ""}`}>
              {phoneVerified ? <FiCheck size={28} color="white" /> : <FiPhone size={28} color="white" />}
            </div>

            {!phoneVerified ? (
              <>
                <h2 className="v-title">Verify your phone</h2>
                <p className="v-sub">
                  {phoneSent && phoneMethod === "email"
                    ? <>Code sent to <span className="v-hl">{user?.email}</span></>
                    : <>We'll send a code to <span className="v-hl">{maskedPhone}</span></>
                  }
                </p>

                {/* Pre-send: method picker + button */}
                {!phoneSent && (
                  <>
                    <div className="method-label">How do you want to receive the code?</div>

                    <div className="method-wrap" ref={dropdownRef}>
                      <button
                        className={`method-trigger${methodOpen ? " open" : ""}`}
                        onClick={() => setMethodOpen(v => !v)}
                        type="button"
                      >
                        <div className="method-left">
                          {phoneMethod === "sms"
                            ? <><FiMessageSquare size={15} color="#FF6B00" /><span>Get code via SMS</span></>
                            : <><FiMail size={15} color="#FF6B00" /><span>Get code via Email</span></>
                          }
                        </div>
                        <FiChevronDown size={14} className={`m-arrow${methodOpen ? " flip" : ""}`} />
                      </button>

                      {methodOpen && (
                        <div className="method-dd">
                          {[
                            { id: "sms" as PhoneMethod, Icon: FiMessageSquare, title: "Get code via SMS", sub: `Text message to ${maskedPhone}` },
                            { id: "email" as PhoneMethod, Icon: FiMail, title: "Get code via Email", sub: `Sent to ${user?.email}` },
                          ].map(opt => (
                            <button
                              key={opt.id}
                              className={`method-opt${phoneMethod === opt.id ? " active" : ""}`}
                              onClick={() => { setPhoneMethod(opt.id); setMethodOpen(false); }}
                              type="button"
                            >
                              <opt.Icon size={15} />
                              <div>
                                <div className="opt-title">{opt.title}</div>
                                <div className="opt-sub">{opt.sub}</div>
                              </div>
                              {phoneMethod === opt.id && <FiCheck size={13} className="opt-check" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button className="v-btn" onClick={sendPhoneOtp} disabled={phoneSending}>
                      {phoneSending
                        ? <><div className="v-spin-sm" />Sending...</>
                        : phoneMethod === "sms"
                          ? <><FiMessageSquare size={15} />Send SMS code</>
                          : <><FiMail size={15} />Send code via Email</>
                      }
                    </button>

                    {/* ── SKIP BUTTON ── */}
                    <button className="v-skip" onClick={() => navigate("/home")}>
                      Skip for now — I'll verify later
                    </button>
                  </>
                )}

                {/* SMS waiting — 20s countdown */}
                {phoneSent && phoneMethod === "sms" && !showSmsNudge && (
                  <div className="sms-wait">
                    <div className="sms-ico-wrap">
                      <FiMessageSquare size={22} color="#FF6B00" />
                      <div className="sms-pulse-ring" />
                    </div>
                    <div className="sms-wait-title">Waiting for SMS...</div>
                    <div className="sms-wait-sub">
                      Checking in <Countdown from={smsCountdown} onDone={() => setShowSmsNudge(true)} color="white" />
                    </div>
                  </div>
                )}

                {/* SMS nudge */}
                {phoneSent && phoneMethod === "sms" && showSmsNudge && (
                  <div className="sms-nudge">
                    <FiAlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div className="nudge-title">Didn't receive the SMS?</div>
                      <div className="nudge-sub">SMS can be delayed in Nigeria. Email is instant.</div>
                      <button
                        className="nudge-btn"
                        onClick={() => {
                          setPhoneMethod("email");
                          setPhoneSent(false);
                          setShowSmsNudge(false);
                          setSmsCountdown(0);
                        }}
                      >
                        <FiMail size={13} />Use email instead
                      </button>
                    </div>
                  </div>
                )}

                {/* Email OTP for phone verification */}
                {phoneSent && phoneMethod === "email" && (
                  <>
                    <div className="v-info-box">
                      <FiMail size={14} color="#FF6B00" />
                      <div>
                        <div className="v-info-title">Check your email</div>
                        <div className="v-info-desc">Your phone verification code was sent to <strong style={{ color: "#e8e8f0" }}>{user?.email}</strong></div>
                      </div>
                    </div>

                    <div className="v-otp-label"><FiLock size={11} />Enter the 6-digit code</div>
                    <OtpInput
                      value={phoneCode}
                      onChange={v => { setPhoneError(""); setPhoneCode(v); }}
                      disabled={phoneVerifying}
                      hasError={!!phoneError}
                    />

                    {phoneVerifying && (
                      <div className="v-row-center">
                        <div className="v-spin-sm" />
                        <span className="v-status-txt">Verifying...</span>
                      </div>
                    )}

                    {phoneError && (
                      <div className="v-err-box">
                        <FiAlertCircle size={14} /><span>{phoneError}</span>
                      </div>
                    )}

                    {phoneAttempts < 3 && phoneAttempts > 0 && (
                      <div className="v-attempts">
                        {[0, 1, 2].map(i => <div key={i} className={`att-dot${i < phoneAttempts ? " on" : ""}`} />)}
                        <span>{phoneAttempts} attempt{phoneAttempts !== 1 ? "s" : ""} left</span>
                      </div>
                    )}

                    <div className="v-footer-row">
                      <span className="v-sec-note"><FiShield size={10} />SHA-256 · 5 min expiry</span>
                      {phoneCooldown > 0
                        ? <span className="v-cdw-txt">Resend in <Countdown from={phoneCooldown} onDone={() => setPhoneCooldown(0)} /></span>
                        : <button className="v-ghost" onClick={() => { setPhoneSent(false); setPhoneCode(""); }}><FiRefreshCw size={12} />Resend</button>
                      }
                    </div>

                    {/* Skip also available after sending */}
                    <button className="v-skip" onClick={() => navigate("/home")}>
                      Skip for now — I'll verify later
                    </button>
                  </>
                )}

                {phoneError?.includes("Try again in") && (
                  <div className="v-blocked">
                    <FiShield size={13} color="#f59e0b" /><span>Temporarily blocked to prevent spam.</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="v-title" style={{ color: "#10B981" }}>Phone verified ✓</h2>
                <p className="v-sub">All done! Taking you in...</p>
                <div className="ring-wrap"><div className="ring" /><div className="ring r2" /></div>
              </>
            )}
          </div>
        )}

        <button className="v-signout" onClick={() => signOut(auth).then(() => navigate("/signup"))}>
          Sign out &amp; start over
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

  .vp-bg {
    min-height:100vh; background:#07070b;
    display:flex; align-items:center; justify-content:center;
    font-family:'Nunito',sans-serif; position:relative; overflow:hidden; padding:20px;
  }
  .vp-orb { position:fixed;border-radius:50%;filter:blur(100px);pointer-events:none;z-index:0; }
  .o1 { width:560px;height:560px;background:radial-gradient(circle,rgba(255,107,0,.13),transparent 70%);top:-220px;left:-200px;animation:drift 20s ease-in-out infinite alternate; }
  .o2 { width:440px;height:440px;background:radial-gradient(circle,rgba(124,58,237,.08),transparent 70%);bottom:-160px;right:-160px;animation:drift 26s ease-in-out infinite alternate-reverse; }
  @keyframes drift { 0%{transform:translate(0,0)}100%{transform:translate(28px,22px)} }

  .vp-loader { display:flex;align-items:center;justify-content:center;width:100%;min-height:100vh; }
  .vp-spin   { width:36px;height:36px;border:3px solid rgba(255,107,0,.2);border-top-color:#FF6B00;border-radius:50%;animation:spin .8s linear infinite; }
  .v-spin-sm { width:14px;height:14px;border:2px solid rgba(255,107,0,.2);border-top-color:#FF6B00;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0; }
  @keyframes spin { to{transform:rotate(360deg)} }

  /* Card */
  .vp-card {
    position:relative;z-index:10;width:100%;max-width:460px;
    background:#0d0d15;border:1px solid #191926;border-radius:28px;
    padding:32px 28px 24px;
    display:flex;flex-direction:column;align-items:center;gap:22px;
    box-shadow:0 40px 80px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.03);
  }

  /* Brand */
  .vp-brand { display:flex;align-items:center;gap:10px; }
  .vp-brand-ico { width:38px;height:38px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 6px 18px rgba(255,107,0,.38); }
  .vp-brand-name { font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:white; }
  .vp-brand-name span { color:#FF6B00; }

  /* Step bar */
  .steps-row { display:flex;align-items:center;width:100%; }
  .step-wrap  { display:flex;align-items:center;gap:8px; }
  .step-dot {
    width:30px;height:30px;border-radius:50%;
    background:#121220;border:1.5px solid #1d1d2e;
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:900;color:#2e2e44;flex-shrink:0;transition:all .3s;
  }
  .step-dot.active { background:rgba(255,107,0,.1);border-color:#FF6B00;color:#FF6B00; }
  .step-dot.done   { background:#10B981;border-color:#10B981;color:white; }
  .step-lbl { font-size:12px;font-weight:700;color:#252538;transition:color .3s;white-space:nowrap; }
  .step-lbl.active { color:#FF6B00; }
  .step-lbl.done   { color:#10B981; }
  .step-line { height:2px;background:#191926;border-radius:1px;width:56px;margin:0 8px;transition:background .4s; }
  .step-line.done { background:#10B981; }

  /* Step body */
  .step-body { width:100%;display:flex;flex-direction:column;align-items:center;gap:16px; }

  /* Icon */
  .v-icon-wrap {
    width:70px;height:70px;border-radius:22px;
    background:linear-gradient(135deg,#FF6B00,#FF8C00);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 10px 28px rgba(255,107,0,.35);
    animation:pop .5s cubic-bezier(.175,.885,.32,1.275) both;
    transition:background .4s,box-shadow .4s;
  }
  .v-icon-wrap.purple { background:linear-gradient(135deg,#7c3aed,#6d28d9);box-shadow:0 10px 28px rgba(124,58,237,.35); }
  .v-icon-wrap.green  { background:linear-gradient(135deg,#10B981,#059669);box-shadow:0 10px 28px rgba(16,185,129,.35); }
  @keyframes pop { 0%{transform:scale(0) rotate(-10deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1} }

  .v-title { font-family:'Syne',sans-serif;font-size:21px;font-weight:900;color:white;text-align:center;letter-spacing:-.35px;transition:color .3s; }
  .v-sub   { font-size:13px;font-weight:600;color:#3e3e56;text-align:center;line-height:1.65; }
  .v-hl    { color:white;font-weight:800; }

  /* Info box */
  .v-info-box {
    display:flex;gap:12px;align-items:flex-start;width:100%;
    background:rgba(255,107,0,.04);border:1px solid rgba(255,107,0,.1);border-radius:14px;padding:13px 15px;
  }
  .v-info-title { font-size:13px;font-weight:800;color:white;margin-bottom:3px; }
  .v-info-desc  { font-size:12px;font-weight:600;color:#3e3e56;line-height:1.5; }

  /* OTP label */
  .v-otp-label { display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#2a2a40;text-transform:uppercase;letter-spacing:.8px;align-self:flex-start; }

  /* OTP boxes */
  .otp-row { display:flex;gap:8px;width:100%;justify-content:center; }
  .otp-box {
    width:52px;height:60px;border-radius:14px;
    background:#121220;border:1.5px solid #1d1d2e;
    text-align:center;font-family:'Syne',sans-serif;
    font-size:24px;font-weight:900;color:white;outline:none;
    transition:border-color .2s,box-shadow .2s,transform .15s;
    caret-color:#FF6B00;
  }
  .otp-box:focus    { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.1);transform:translateY(-2px); }
  .otp-box.filled   { border-color:rgba(255,107,0,.35);color:#FF6B00; }
  .otp-box.error    { border-color:rgba(239,68,68,.45);animation:shake .4s both; }
  .otp-box:disabled { opacity:.5; }
  @keyframes shake {
    10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}
    30%,50%,70%{transform:translateX(-2px)}40%,60%{transform:translateX(2px)}
  }

  /* Status rows */
  .v-row-center   { display:flex;align-items:center;gap:9px; }
  .v-status-txt   { font-size:13px;font-weight:700;color:#FF6B00; }

  /* Error */
  .v-err-box {
    display:flex;align-items:center;gap:8px;width:100%;
    background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);
    border-radius:12px;padding:10px 14px;color:#ef4444;font-size:12px;font-weight:700;
  }

  /* Attempts */
  .v-attempts { display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:#2a2a40; }
  .att-dot { width:7px;height:7px;border-radius:50%;background:#1d1d2e;transition:background .3s; }
  .att-dot.on { background:#FF6B00; }

  /* Footer row */
  .v-footer-row { display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;flex-wrap:wrap; }
  .v-sec-note   { display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#1e1e30; }
  .v-cdw-txt    { display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#2e2e44; }
  .cdw { display:flex;align-items:center;gap:4px;font-family:'Syne',sans-serif;font-size:13px;font-weight:800; }

  /* Ghost button */
  .v-ghost {
    display:flex;align-items:center;gap:6px;
    background:transparent;border:1.5px solid #1d1d2e;border-radius:10px;
    padding:7px 13px;color:#44445e;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;
    cursor:pointer;transition:all .2s;
  }
  .v-ghost:hover:not(:disabled) { border-color:#FF6B00;color:#FF6B00; }
  .v-ghost:disabled { opacity:.5;cursor:not-allowed; }

/* Skip button */
  .v-skip {
    background:transparent;border:none;
    color:#FF6B00;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;
    cursor:pointer;transition:color .2s;
    text-decoration:underline;text-underline-offset:3px;
    padding:4px 0;margin-top:-4px;
  }
  .v-skip:hover { color:#FF8C00; }
  
  /* Blocked */
  .v-blocked { display:flex;align-items:center;gap:8px;width:100%;background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.12);border-radius:12px;padding:10px 14px;color:#f59e0b;font-size:12px;font-weight:700; }

  /* Success rings */
  .ring-wrap { position:relative;width:80px;height:80px;display:flex;align-items:center;justify-content:center; }
  .ring { position:absolute;width:58px;height:58px;border-radius:50%;border:2px solid #10B981;animation:ring-out 1.5s ease-out infinite; }
  .r2  { animation-delay:.75s; }
  @keyframes ring-out { 0%{transform:scale(.7);opacity:.8}100%{transform:scale(2.2);opacity:0} }

  /* Method dropdown */
  .method-label { font-size:10px;font-weight:800;color:#2a2a40;text-transform:uppercase;letter-spacing:.7px;align-self:flex-start; }
  .method-wrap  { position:relative;width:100%; }
  .method-trigger {
    width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;
    background:#121220;border:1.5px solid #1d1d2e;border-radius:14px;
    padding:12px 14px;cursor:pointer;transition:border-color .2s,box-shadow .2s;
  }
  .method-trigger:hover,.method-trigger.open { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.09); }
  .method-left { display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:white; }
  .m-arrow { color:#2e2e44;transition:transform .2s; }
  .m-arrow.flip { transform:rotate(180deg); }
  .method-dd {
    position:absolute;top:calc(100% + 7px);left:0;right:0;z-index:300;
    background:#0d0d15;border:1.5px solid #191926;border-radius:16px;overflow:hidden;
    box-shadow:0 20px 60px rgba(0,0,0,.6);
    animation:dd-in .18s cubic-bezier(.34,1.56,.64,1) both;
  }
  @keyframes dd-in { from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)} }
  .method-opt {
    width:100%;display:flex;align-items:center;gap:12px;
    padding:13px 16px;background:transparent;border:none;
    font-family:'Nunito',sans-serif;font-size:13px;cursor:pointer;text-align:left;
    transition:background .15s;color:#3e3e56;
  }
  .method-opt + .method-opt { border-top:1px solid #191926; }
  .method-opt:hover  { background:rgba(255,107,0,.04); }
  .method-opt.active { background:rgba(255,107,0,.07);color:#FF6B00; }
  .opt-title { font-size:13px;font-weight:700;color:inherit; }
  .opt-sub   { font-size:11px;color:#2a2a40;font-weight:600;margin-top:2px; }
  .opt-check { color:#FF6B00;margin-left:auto;flex-shrink:0; }

  /* SMS waiting */
  .sms-wait {
    display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;
    background:#121220;border:1.5px dashed rgba(255,107,0,.18);border-radius:16px;padding:24px 20px;
  }
  .sms-ico-wrap { position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center; }
  .sms-pulse-ring { position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(255,107,0,.25);animation:sms-pulse 1.5s ease-out infinite; }
  @keyframes sms-pulse { 0%{transform:scale(.85);opacity:.8}100%{transform:scale(1.6);opacity:0} }
  .sms-wait-title { font-size:14px;font-weight:800;color:white; }
  .sms-wait-sub   { font-size:12px;font-weight:700;color:#3e3e56;display:flex;align-items:center;gap:6px; }

  /* SMS nudge */
  .sms-nudge {
    display:flex;gap:12px;align-items:flex-start;width:100%;
    background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.12);border-radius:14px;padding:14px 16px;
  }
  .nudge-title { font-size:13px;font-weight:800;color:white;margin-bottom:5px; }
  .nudge-sub   { font-size:12px;font-weight:600;color:#3e3e56;line-height:1.5;margin-bottom:10px; }
  .nudge-btn {
    display:inline-flex;align-items:center;gap:6px;
    background:rgba(255,107,0,.08);border:1.5px solid rgba(255,107,0,.2);border-radius:10px;
    padding:7px 14px;color:#FF6B00;font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;
    cursor:pointer;transition:all .2s;
  }
  .nudge-btn:hover { background:rgba(255,107,0,.15); }

  /* CTA button */
  .v-btn {
    display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
    background:linear-gradient(135deg,#FF6B00,#FF8C00);color:white;
    border:none;border-radius:14px;padding:13px 20px;
    font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;
    box-shadow:0 8px 24px rgba(255,107,0,.35);transition:transform .2s,box-shadow .2s,opacity .2s;
  }
  .v-btn:hover:not(:disabled) { transform:translateY(-2px);box-shadow:0 12px 32px rgba(255,107,0,.5); }
  .v-btn:disabled { opacity:.65;cursor:not-allowed; }

  /* Sign out */
  .v-signout { background:transparent;border:none;color:#1d1d2e;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:color .2s;margin-top:-8px; }
  .v-signout:hover { color:#ef4444; }

  /* Done card */
  .done-card {
    position:relative;z-index:10;width:100%;max-width:420px;
    background:#0d0d15;border:1px solid #191926;border-radius:28px;
    padding:44px 32px;display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;
    box-shadow:0 40px 80px rgba(0,0,0,.8);
  }
  .done-conic {
    position:absolute;inset:-2px;border-radius:30px;z-index:-1;opacity:.4;
    background:conic-gradient(from 0deg,#FF6B00,#10B981,#7c3aed,#FF6B00);
    animation:conic-spin 5s linear infinite;
  }
  @keyframes conic-spin { to{transform:rotate(360deg)} }
  .done-icon { width:86px;height:86px;border-radius:26px;background:linear-gradient(135deg,#FF6B00,#FF8C00);display:flex;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(255,107,0,.42);animation:pop .6s cubic-bezier(.175,.885,.32,1.275) both; }
  .done-title { font-family:'Syne',sans-serif;font-size:28px;font-weight:900;color:white;letter-spacing:-.5px; }
  .done-sub { color:#3e3e56;font-size:14px;font-weight:600;line-height:1.7; }
  .done-sub strong { color:white; }
  .done-sub strong span { color:#FF6B00; }
  .done-chips { display:flex;gap:10px;flex-wrap:wrap;justify-content:center; }
  .done-chip { display:flex;align-items:center;gap:6px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:20px;padding:6px 14px;color:#10B981;font-size:12px;font-weight:700; }
  .done-redir { color:#1d1d2e;font-size:12px;font-weight:600;margin-top:-4px; }

  @media (max-width:480px) {
    .vp-card { padding:24px 16px 18px;border-radius:22px; }
    .otp-box { width:42px;height:52px;font-size:20px;border-radius:11px; }
    .otp-row { gap:5px; }
    .done-card { padding:36px 20px; }
  }
`;