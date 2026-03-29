import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiMail, FiLock, FiEye, FiEyeOff,
  FiArrowRight, FiZap, FiChevronRight,
  FiShield, FiClock, FiMapPin, FiArrowLeft,
  FiCheckCircle, FiAlertTriangle, FiAlertOctagon,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import {
  MdDeliveryDining, MdLocalPharmacy,
  MdStorefront, MdFastfood,
} from "react-icons/md";
import { RiSendPlaneFill } from "react-icons/ri";

import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  deleteUser,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";

const provider = new GoogleAuthProvider();

// ─────────────────────────────────────────
// RECAPTCHA — replace with your real site key
// Get it from: https://www.google.com/recaptcha/admin
// Use reCAPTCHA v3 (invisible)
// ─────────────────────────────────────────
const RECAPTCHA_SITE_KEY = "6LdviZIsAAAAADqlRO-9CSfx5fjz8ZzMSrORlskL";

// Loads reCAPTCHA script once and returns the token
async function getRecaptchaToken(action: string): Promise<string | null> {
  try {
    // Load script if not already loaded
    if (!window.grecaptcha) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("recaptcha-script");
        if (existing) { resolve(); return; }
        const script = document.createElement("script");
        script.id = "recaptcha-script";
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
    }
    await new Promise<void>(r => window.grecaptcha.ready(() => r()));
    const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
    return token;
  } catch {
    return null; // Don't block login if reCAPTCHA fails to load
  }
}

// ─────────────────────────────────────────
// LOCKOUT CONFIG
// ─────────────────────────────────────────
const LOCKOUT = {
  MAX_ATTEMPTS_BEFORE_FIRST_BLOCK : 5,   // block after 5 wrong attempts
  FIRST_BLOCK_MINUTES             : 10,  // 10 min block
  MAX_ATTEMPTS_IN_SECOND_STAGE    : 2,   // 2 more wrong attempts after 10min block
  SECOND_BLOCK_MINUTES            : 60,  // 60 min block
  // Any failure after 60min block → account frozen permanently
} as const;

// Shape of a loginAttempts Firestore document
interface AttemptDoc {
  email         : string;
  attempts      : number;        // total failed attempts
  stage         : 1 | 2 | 3;    // 1=normal, 2=post-10min-block, 3=frozen
  blockedUntil  : Timestamp | null;
  frozen        : boolean;
  updatedAt     : Timestamp;
}

// What checkLoginAllowed returns
type LoginAllowedResult =
  | { allowed: true }
  | { allowed: false; reason: "blocked"; minutesLeft: number; stage: 1 | 2 }
  | { allowed: false; reason: "frozen" };

// ─────────────────────────────────────────
// LOCKOUT HELPERS
// ─────────────────────────────────────────

// Sanitise email so it's a safe Firestore doc ID
const emailToDocId = (email: string) =>
  email.toLowerCase().trim().replace(/[.#$[\]]/g, "_");

async function checkLoginAllowed(email: string): Promise<LoginAllowedResult> {
  const ref  = doc(db, "loginAttempts", emailToDocId(email));
  const snap = await getDoc(ref);
  if (!snap.exists()) return { allowed: true };

  const data = snap.data() as AttemptDoc;

  // Frozen — must contact admin
  if (data.frozen) return { allowed: false, reason: "frozen" };

  // Currently blocked — check if block has expired
  if (data.blockedUntil) {
    const now          = Date.now();
    const blockedUntil = data.blockedUntil.toMillis();
    if (now < blockedUntil) {
      const minutesLeft = Math.ceil((blockedUntil - now) / 60_000);
      return {
        allowed: false,
        reason: "blocked",
        minutesLeft,
        stage: data.stage as 1 | 2,
      };
    }
    // Block expired — allow attempt but keep stage
  }

  return { allowed: true };
}

async function recordFailedAttempt(email: string): Promise<LoginAllowedResult> {
  const id   = emailToDocId(email);
  const ref  = doc(db, "loginAttempts", id);
  const snap = await getDoc(ref);

  const now  = Timestamp.now();
  const data: AttemptDoc = snap.exists()
    ? (snap.data() as AttemptDoc)
    : { email, attempts: 0, stage: 1, blockedUntil: null, frozen: false, updatedAt: now };

  const newAttempts = data.attempts + 1;

  // ── Stage 1: First 5 attempts → 10min block ──
  if (data.stage === 1) {
    if (newAttempts >= LOCKOUT.MAX_ATTEMPTS_BEFORE_FIRST_BLOCK) {
      const blockedUntil = Timestamp.fromMillis(
        Date.now() + LOCKOUT.FIRST_BLOCK_MINUTES * 60_000
      );
      await setDoc(ref, {
        ...data,
        attempts: newAttempts,
        stage: 2,                // move to stage 2
        blockedUntil,
        updatedAt: now,
      });
      return {
        allowed: false,
        reason: "blocked",
        minutesLeft: LOCKOUT.FIRST_BLOCK_MINUTES,
        stage: 1,
      };
    }
    // Not yet at limit
    await setDoc(ref, { ...data, attempts: newAttempts, updatedAt: now });
    return { allowed: true };
  }

  // ── Stage 2: 2 more attempts after 10min block → 60min block ──
  if (data.stage === 2) {
    // Count attempts SINCE the block expired (reset sub-counter via attempts field in stage)
    // We track stage-2 attempts separately using a secondStageAttempts field
    const s2attempts = (data as any).secondStageAttempts ?? 0;
    const newS2      = s2attempts + 1;

    if (newS2 >= LOCKOUT.MAX_ATTEMPTS_IN_SECOND_STAGE) {
      const blockedUntil = Timestamp.fromMillis(
        Date.now() + LOCKOUT.SECOND_BLOCK_MINUTES * 60_000
      );
      await setDoc(ref, {
        ...data,
        attempts: newAttempts,
        secondStageAttempts: newS2,
        stage: 3,
        blockedUntil,
        updatedAt: now,
      });
      return {
        allowed: false,
        reason: "blocked",
        minutesLeft: LOCKOUT.SECOND_BLOCK_MINUTES,
        stage: 2,
      };
    }
    await setDoc(ref, {
      ...data,
      attempts: newAttempts,
      secondStageAttempts: newS2,
      updatedAt: now,
    });
    return { allowed: true };
  }

  // ── Stage 3: Any failure after 60min block → FREEZE ──
  await setDoc(ref, {
    ...data,
    attempts: newAttempts,
    frozen: true,
    blockedUntil: null,
    updatedAt: now,
  });
  return { allowed: false, reason: "frozen" };
}

async function clearAttempts(email: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "loginAttempts", emailToDocId(email)));
  } catch {
    // Non-critical — don't block login if this fails
  }
}

// ─────────────────────────────────────────
// FIREBASE ERROR MESSAGES
// ─────────────────────────────────────────
const firebaseErrorMessage = (code: string): string => {
  switch (code) {
    case "auth/user-not-found":          return "No account found with this email address.";
    case "auth/wrong-password":          return "Incorrect password. Please try again.";
    case "auth/invalid-email":           return "That email address doesn't look right.";
    case "auth/user-disabled":           return "This account has been disabled. Contact support.";
    case "auth/too-many-requests":       return "Too many failed attempts. Try again later.";
    case "auth/invalid-credential":      return "Incorrect email or password. Please try again.";
    case "auth/network-request-failed":  return "Network error. Check your connection and try again.";
    case "auth/popup-closed-by-user":    return "Google sign-in was cancelled.";
    case "auth/cancelled-popup-request": return "Only one sign-in window can be open at a time.";
    case "auth/popup-blocked":           return "Popup was blocked. Please allow popups for this site.";
    default:                             return "Something went wrong. Please try again.";
  }
};

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type FieldName     = "email" | "password";
type FormData      = Record<FieldName, string>;
type TouchedFields = Partial<Record<FieldName, boolean>>;
type ErrorFields   = Partial<Record<FieldName, string>>;
type Screen        = "login" | "forgot";
type LockState     =
  | null
  | { type: "blocked"; minutesLeft: number; secondsLeft: number; stage: 1 | 2 }
  | { type: "frozen" };

// ─────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────
const validate = (name: FieldName, value: string): string => {
  switch (name) {
    case "email":
      if (!value.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address";
      return "";
    case "password":
      if (!value) return "Password is required";
      if (value.length < 8) return "Password must be at least 8 characters";
      return "";
    default: return "";
  }
};

const validateEmail = (value: string): string => {
  if (!value.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address";
  return "";
};

// ─────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────
const particles = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  size: Math.random() * 5 + 2,
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 8,
  duration: Math.random() * 10 + 12,
  opacity: Math.random() * 0.2 + 0.04,
}));

const SERVICE_CARDS = [
  { icon: MdFastfood,      label: "Food",      time: "12 min"  },
  { icon: MdLocalPharmacy, label: "Pharmacy",  time: "18 min"  },
  { icon: MdStorefront,    label: "Boutique",  time: "30 min"  },
  { icon: RiSendPlaneFill, label: "Logistics", time: "Instant" },
];

const DECO_ICONS  = [MdFastfood, MdLocalPharmacy, MdStorefront, RiSendPlaneFill, MdDeliveryDining];
const TRUST_ITEMS = [
  { icon: FiShield, label: "256-bit SSL Encryption" },
  { icon: FiZap,    label: "Instant Access"         },
  { icon: FiMapPin, label: "Available in Lagos"     },
];

// ─────────────────────────────────────────
// COUNTDOWN HOOK
// Ticks every second, used for block timers
// ─────────────────────────────────────────
function useCountdown(targetMs: number | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!targetMs) { setSecondsLeft(0); return; }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return secondsLeft;
}

// ─────────────────────────────────────────
// LOCKOUT BANNER COMPONENT
// ─────────────────────────────────────────
const LockoutBanner = ({
  lockState,
  targetMs,
  onUnlocked,
}: {
  lockState: LockState;
  targetMs: number | null;
  onUnlocked: () => void;
}) => {
  const secondsLeft = useCountdown(targetMs);

  useEffect(() => {
    if (lockState?.type === "blocked" && secondsLeft === 0 && targetMs) {
      onUnlocked();
    }
  }, [secondsLeft, lockState, targetMs, onUnlocked]);

  if (!lockState) return null;

  if (lockState.type === "frozen") {
    return (
      <div className="lockout-banner frozen">
        <FiAlertOctagon size={20} color="#ef4444" />
        <div>
          <div className="lockout-title">Account Temporarily Frozen</div>
          <div className="lockout-msg">
            Too many failed login attempts. Your account has been frozen for security.
            Please contact our support team to unlock it.
          </div>
          <a href="mailto:support@swiftnija.com" className="lockout-link">
            support@swiftnija.com
          </a>
        </div>
      </div>
    );
  }

  if (lockState.type === "blocked") {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timeStr = secondsLeft > 60
      ? `${mins}m ${secs.toString().padStart(2, "0")}s`
      : `${secondsLeft}s`;

    return (
      <div className="lockout-banner blocked">
        <FiAlertTriangle size={20} color="#f97316" />
        <div>
          <div className="lockout-title">
            {lockState.stage === 1
              ? "Too Many Attempts — 10 Minute Block"
              : "Account Locked — 60 Minute Block"}
          </div>
          <div className="lockout-msg">
            {lockState.stage === 1
              ? "You've entered the wrong password 5 times."
              : "You've continued to enter wrong passwords after a previous block."}
            {" "}Please try again in:
          </div>
          <div className="lockout-countdown">{timeStr}</div>
        </div>
      </div>
    );
  }

  return null;
};

// ─────────────────────────────────────────
// FIELD COMPONENT
// ─────────────────────────────────────────
const Field = ({
  name, label, type = "text", placeholder, icon: Icon, rightElement,
  form, touched, errors, handleChange, handleBlur, disabled,
}: {
  name: FieldName; label: string; type?: string; placeholder: string;
  icon: React.ElementType; rightElement?: React.ReactNode;
  form: FormData; touched: TouchedFields; errors: ErrorFields;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (name: FieldName) => void;
  disabled?: boolean;
}) => {
  const hasError = !!touched[name] && !!errors[name];
  const isValid  = !!touched[name] && !errors[name] && !!form[name];
  return (
    <div className="field-wrap">
      <label className="field-label">{label}</label>
      <div className={`field-box ${hasError ? "err" : ""} ${isValid ? "ok" : ""} ${disabled ? "disabled" : ""}`}>
        <Icon size={16} className="field-icon" />
        <input
          name={name} type={type} placeholder={placeholder}
          value={form[name]} onChange={handleChange}
          onBlur={() => handleBlur(name)}
          autoComplete={name === "email" ? "email" : "current-password"}
          className="field-input"
          disabled={disabled}
        />
        {rightElement}
      </div>
      {hasError && (
        <span className="field-error"><span className="error-dot" />{errors[name]}</span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────
// FORGOT PASSWORD SCREEN
// ─────────────────────────────────────────
const ForgotScreen = ({ onBack }: { onBack: () => void }) => {
  const [email,      setEmail]      = useState("");
  const [emailError, setEmailError] = useState("");
  const [touched,    setTouched]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [sent,       setSent]       = useState(false);

  const handleSend = async () => {
    setTouched(true);
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;
    setLoading(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e: any) {
      if (e.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setSent(true); // Security: don't reveal if email exists
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) return (
    <div className="forgot-sent">
      <div className="sent-icon-wrap"><FiCheckCircle size={36} color="#FF6B00" /></div>
      <h3 className="forgot-title">Check your inbox</h3>
      <p className="forgot-sub">
        If <strong>{email}</strong> is linked to a Swiftnija account, you'll receive a reset link shortly.
      </p>
      <p className="forgot-note">Don't see it? Check your spam folder.</p>
      <button className="btn-cta" onClick={onBack}>Back to Sign In <FiArrowRight size={16} /></button>
    </div>
  );

  return (
    <div className="forgot-form">
      <button className="back-btn" onClick={onBack}><FiArrowLeft size={15} /> Back to sign in</button>
      <div className="forgot-header">
        <h3 className="forgot-title">Reset your password</h3>
        <p className="forgot-sub">Enter your email and we'll send you a reset link.</p>
      </div>
      <div className="field-wrap">
        <label className="field-label">Email Address</label>
        <div className={`field-box ${touched && emailError ? "err" : ""} ${touched && !emailError && email ? "ok" : ""}`}>
          <FiMail size={16} className="field-icon" />
          <input
            type="email" placeholder="you@example.com" value={email}
            onChange={e => { setEmail(e.target.value); if (error) setError(""); if (touched) setEmailError(validateEmail(e.target.value)); }}
            onBlur={() => { setTouched(true); setEmailError(validateEmail(email)); }}
            autoComplete="email" className="field-input"
          />
        </div>
        {touched && emailError && <span className="field-error"><span className="error-dot" />{emailError}</span>}
      </div>
      {error && <div className="login-error-banner"><span className="error-dot lg" />{error}</div>}
      <button className={`btn-cta ${loading ? "loading" : ""}`} onClick={handleSend} disabled={loading}>
        {loading ? <span className="spinner" /> : <>Send Reset Link <FiArrowRight size={16} /></>}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────
// FORM BODY
// ─────────────────────────────────────────
const FormBody = ({
  form, touched, errors, handleChange, handleBlur,
  showPwd, setShowPwd, rememberMe, setRememberMe,
  loginError, submitting, googleLoading, isLocked,
  handleSubmit, handleGoogleSignIn, navigate, onForgot,
  lockState, blockTargetMs, onUnlocked,
}: {
  form: FormData; touched: TouchedFields; errors: ErrorFields;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (name: FieldName) => void;
  showPwd: boolean; setShowPwd: React.Dispatch<React.SetStateAction<boolean>>;
  rememberMe: boolean; setRememberMe: React.Dispatch<React.SetStateAction<boolean>>;
  loginError: string; submitting: boolean; googleLoading: boolean;
  isLocked: boolean;
  handleSubmit: () => void; handleGoogleSignIn: () => void;
  navigate: (path: string) => void; onForgot: () => void;
  lockState: LockState; blockTargetMs: number | null; onUnlocked: () => void;
}) => (
  <>
    {/* Google Sign-In — never locked */}
    <button
      className={`btn-google ${googleLoading ? "loading" : ""}`}
      onClick={handleGoogleSignIn}
      disabled={googleLoading || submitting}
    >
      {googleLoading
        ? <span className="spinner dark" />
        : <><FcGoogle size={20} /><span>Continue with Google</span></>
      }
    </button>

    <div className="divider"><span>or sign in with email</span></div>

    {/* Lockout banner — shown above fields when locked */}
    <LockoutBanner
      lockState={lockState}
      targetMs={blockTargetMs}
      onUnlocked={onUnlocked}
    />

    <Field name="email" label="Email Address" type="email" placeholder="you@example.com" icon={FiMail}
      form={form} touched={touched} errors={errors} handleChange={handleChange} handleBlur={handleBlur}
      disabled={isLocked}
    />

    <Field name="password" label="Password" type={showPwd ? "text" : "password"}
      placeholder="Enter your password" icon={FiLock}
      form={form} touched={touched} errors={errors} handleChange={handleChange} handleBlur={handleBlur}
      disabled={isLocked}
      rightElement={
        <button className="toggle-eye" type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1} disabled={isLocked}>
          {showPwd ? <FiEyeOff size={15} /> : <FiEye size={15} />}
        </button>
      }
    />

    <div className="row-between">
      <label className="remember-row" onClick={() => !isLocked && setRememberMe(v => !v)}>
        <div className={`checkbox ${rememberMe ? "checked" : ""}`}>
          {rememberMe && <FiZap size={9} color="white" />}
        </div>
        <span>Remember me</span>
      </label>
      <span className="link" onClick={onForgot}>Forgot password?</span>
    </div>

    {loginError && (
      <div className="login-error-banner">
        <span className="error-dot lg" />{loginError}
      </div>
    )}

    <button
      className={`btn-cta ${submitting ? "loading" : ""} ${isLocked ? "locked" : ""}`}
      onClick={handleSubmit}
      disabled={submitting || googleLoading || isLocked}
    >
      {submitting ? <span className="spinner" /> : isLocked ? "Account Locked" : <>Sign In <FiArrowRight size={16} /></>}
    </button>

    <p className="signin-prompt">
      Don't have an account?{" "}
      <span className="link" onClick={() => navigate("/signup")}>
        Create one <FiChevronRight size={12} style={{ verticalAlign: "middle" }} />
      </span>
    </p>
  </>
);

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function UserLogin() {
  const navigate = useNavigate();

  const [form,          setForm]          = useState<FormData>({ email: "", password: "" });
  const [touched,       setTouched]       = useState<TouchedFields>({});
  const [errors,        setErrors]        = useState<ErrorFields>({});
  const [showPwd,       setShowPwd]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe,    setRememberMe]    = useState(true);
  const [loginError,    setLoginError]    = useState("");
  const [authReady,     setAuthReady]     = useState(false);
  const [screen,        setScreen]        = useState<Screen>("login");

  // Lockout state
  const [lockState,     setLockState]     = useState<LockState>(null);
  const [blockTargetMs, setBlockTargetMs] = useState<number | null>(null);

  const isLocked = lockState !== null;

  // Called by countdown when timer hits zero
  const handleUnlocked = useCallback(() => {
    setLockState(null);
    setBlockTargetMs(null);
    setLoginError("");
  }, []);

  // Apply lockout result to state
  const applyLockResult = useCallback((result: LoginAllowedResult) => {
    if (result.allowed) return;
    if (result.reason === "frozen") {
      setLockState({ type: "frozen" });
      setBlockTargetMs(null);
    } else {
      const targetMs = Date.now() + result.minutesLeft * 60_000;
      setLockState({ type: "blocked", minutesLeft: result.minutesLeft, secondsLeft: result.minutesLeft * 60, stage: result.stage });
      setBlockTargetMs(targetMs);
    }
  }, []);

  // ─────────────────────────────────────────
  // AUTH STATE
  // ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/home", { replace: true });
      } else {
        setAuthReady(true);
      }
    });
    return unsub;
  }, [navigate]);

  // Check lockout status on mount (in case user refreshes during a block)
  useEffect(() => {
    const savedEmail = localStorage.getItem("sn_lock_email");
    if (!savedEmail) return;
    checkLoginAllowed(savedEmail).then(result => {
      if (!result.allowed) applyLockResult(result);
    });
  }, [applyLockResult]);

  // ─────────────────────────────────────────
  // FIELD HANDLERS
  // ─────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (loginError) setLoginError("");
    if (touched[name as FieldName])
      setErrors(prev => ({ ...prev, [name]: validate(name as FieldName, value) }));
  };

  const handleBlur = (name: FieldName) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    setErrors(prev => ({ ...prev, [name]: validate(name, form[name]) }));
  };

  // ─────────────────────────────────────────
  // EMAIL / PASSWORD LOGIN
  // ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (isLocked) return;

    setTouched({ email: true, password: true });
    const allErrors: ErrorFields = {};
    (Object.keys(form) as FieldName[]).forEach(k => {
      const e = validate(k, form[k]); if (e) allErrors[k] = e;
    });
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) return;

    setSubmitting(true);
    setLoginError("");

    try {
      // 1. reCAPTCHA check (invisible)
      const token = await getRecaptchaToken("login");
      if (token) {
        // NOTE: To validate the score server-side, send `token` to a
        // Firebase Cloud Function that calls Google's reCAPTCHA verify API.
      }

      // 2. Check lockout BEFORE hitting Firebase
      const preCheck = await checkLoginAllowed(form.email);
      if (!preCheck.allowed) {
        applyLockResult(preCheck);
        localStorage.setItem("sn_lock_email", form.email);
        return;
      }

      // 3. Attempt Firebase sign-in
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      let firebaseUser;
      try {
        const result = await signInWithEmailAndPassword(auth, form.email, form.password);
        firebaseUser = result.user;
      } catch (authErr: any) {
        if (
          authErr.code === "auth/wrong-password" ||
          authErr.code === "auth/invalid-credential" ||
          authErr.code === "auth/user-not-found"
        ) {
          const lockResult = await recordFailedAttempt(form.email);
          localStorage.setItem("sn_lock_email", form.email);

          if (!lockResult.allowed) {
            applyLockResult(lockResult);
            return;
          }

          // Still allowed — show remaining attempts warning
          const snap = await getDoc(doc(db, "loginAttempts", emailToDocId(form.email)));
          const attempts = snap.exists() ? (snap.data() as AttemptDoc).attempts : 1;
          const remaining = LOCKOUT.MAX_ATTEMPTS_BEFORE_FIRST_BLOCK - attempts;
          if (remaining > 0) {
            setLoginError(
              `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before a 10-minute block.`
            );
          } else {
            setLoginError("Incorrect password.");
          }
        } else {
          setLoginError(firebaseErrorMessage(authErr.code));
        }
        return;
      }

      // 4. Firestore existence check
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!userDoc.exists()) {
        await auth.signOut();
        setLoginError("No account found. Please sign up first.");
        return;
      }

      // 5. Success — clear lockout record
      await clearAttempts(form.email);
      localStorage.removeItem("sn_lock_email");
      // onAuthStateChanged navigates to /home ✅

    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────
  // GOOGLE LOGIN
  // ─────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setLoginError("");
    try {
      const result = await signInWithPopup(auth, provider);

      const userDoc = await getDoc(doc(db, "users", result.user.uid));

      if (!userDoc.exists()) {
        await auth.signOut();
        try { await deleteUser(result.user); } catch {}
        setLoginError("No account found for this Google email. Please sign up first.");
        return;
      }
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setLoginError(firebaseErrorMessage(err.code));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─────────────────────────────────────────
  // LOADING SCREEN
  // ─────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0a",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <div style={{
          width: 36, height: 36,
          border: "3px solid rgba(255,107,0,0.2)",
          borderTopColor: "#FF6B00", borderRadius: "50%",
          animation: "sn-spin 0.75s linear infinite",
        }} />
        <span style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: 13, color: "#FF6B00" }}>
          swiftnija
        </span>
        <style>{`@keyframes sn-spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  const formProps = {
    form, touched, errors, handleChange, handleBlur,
    showPwd, setShowPwd, rememberMe, setRememberMe,
    loginError, submitting, googleLoading, isLocked,
    handleSubmit, handleGoogleSignIn, navigate,
    onForgot: () => setScreen("forgot"),
    lockState, blockTargetMs,
    onUnlocked: handleUnlocked,
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="page-bg">
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%`,
          opacity: p.opacity, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      {/* ══ MOBILE ══ */}
      <div className="phone-shell">
        <div className="phone-notch" />
        <div className="phone-screen">
          {screen === "login" ? (
            <>
              <div className="form-hero">
                <div className="brand-row">
                  <div className="brand-icon"><MdDeliveryDining size={22} /></div>
                  <span className="brand-name">swift<span>nija</span></span>
                </div>
                <h1 className="form-title">Welcome<br /><span>back</span></h1>
                <p className="form-sub">Sign in to continue your swift deliveries</p>
              </div>
              <div className="form-card"><FormBody {...formProps} /></div>
              <div className="mobile-deco">
                {DECO_ICONS.map((Icon, i) => (
                  <div className="deco-bubble" key={i} style={{ animationDelay: `${i * 0.4}s` }}>
                    <Icon size={22} color="#FF6B00" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="form-hero">
              <div className="brand-row">
                <div className="brand-icon"><MdDeliveryDining size={22} /></div>
                <span className="brand-name">swift<span>nija</span></span>
              </div>
              <div className="form-card" style={{ marginTop: 12 }}>
                <ForgotScreen onBack={() => setScreen("login")} />
              </div>
            </div>
          )}
          <div style={{ height: 40 }} />
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="desktop-wrap">
        <div className="desktop-left">
          <div className="dl-brand">
            <div className="brand-icon large"><MdDeliveryDining size={32} /></div>
            <span className="brand-name large">swift<span>nija</span></span>
          </div>
          <div className="dl-content">
            <h1 className="dl-title">Good to<br />have you<br /><span>back.</span></h1>
            <p className="dl-sub">
              Your favourite restaurants, pharmacies, and stores are ready to deliver.
              Sign in and pick up where you left off.
            </p>
          </div>
          <div className="dl-service-grid">
            {SERVICE_CARDS.map((svc, i) => (
              <div className="service-card" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="service-card-icon"><svc.icon size={22} color="#FF6B00" /></div>
                <div>
                  <div className="service-card-label">{svc.label}</div>
                  <div className="service-card-time">
                    <FiClock size={10} color="#FF6B00" style={{ marginRight: 3, verticalAlign: "middle" }} />
                    {svc.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="dl-trust">
            {TRUST_ITEMS.map((t, i) => (
              <div className="trust-chip" key={i}><t.icon size={13} color="#FF6B00" /><span>{t.label}</span></div>
            ))}
          </div>
        </div>

        <div className="desktop-right">
          <div className="desktop-form-card">
            {screen === "login" ? (
              <>
                <div className="desktop-form-header">
                  <h2>Sign in</h2>
                  <p>Welcome back! Enter your credentials to continue.</p>
                </div>
                <FormBody {...formProps} />
              </>
            ) : (
              <ForgotScreen onBack={() => setScreen("login")} />
            )}
          </div>
        </div>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// TYPE AUGMENTATION for reCAPTCHA
// ─────────────────────────────────────────
declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  .page-bg { min-height:100vh; background:#0a0a0a; display:flex; align-items:center; justify-content:center; font-family:'Nunito',sans-serif; position:relative; overflow:hidden; }
  .orb { position:fixed; border-radius:50%; filter:blur(80px); pointer-events:none; z-index:0; }
  .orb1 { width:500px; height:500px; background:radial-gradient(circle,rgba(255,107,0,0.16) 0%,transparent 70%); top:-180px; left:-180px; animation:drift 18s ease-in-out infinite alternate; }
  .orb2 { width:380px; height:380px; background:radial-gradient(circle,rgba(255,140,0,0.1) 0%,transparent 70%); bottom:-120px; right:-120px; animation:drift 22s ease-in-out infinite alternate-reverse; }
  .orb3 { width:260px; height:260px; background:radial-gradient(circle,rgba(255,107,0,0.07) 0%,transparent 70%); top:50%; left:50%; transform:translate(-50%,-50%); animation:pulse-orb 10s ease-in-out infinite; }
  @keyframes drift { 0%{transform:translate(0,0)} 100%{transform:translate(30px,30px)} }
  @keyframes pulse-orb { 0%,100%{opacity:0.5;transform:translate(-50%,-50%) scale(1)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.15)} }
  .particle { position:fixed; background:#FF6B00; border-radius:50%; z-index:0; animation:float-up linear infinite; pointer-events:none; }
  @keyframes float-up { 0%{transform:translateY(100vh) scale(0);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-10vh) scale(1);opacity:0} }
  .phone-shell { width:390px; height:844px; background:#141416; border-radius:48px; overflow:hidden; position:relative; box-shadow:0 0 0 2px #2a2a2a,0 40px 100px rgba(0,0,0,0.9),inset 0 0 0 1px #333; display:flex; flex-direction:column; z-index:10; }
  .phone-notch { width:126px; height:34px; background:#141416; border-radius:0 0 20px 20px; position:absolute; top:0; left:50%; transform:translateX(-50%); z-index:100; }
  .phone-screen { flex:1; overflow-y:auto; padding-top:50px; scrollbar-width:none; background:#0f0f11; }
  .phone-screen::-webkit-scrollbar { display:none; }
  .form-hero { padding:20px 20px 24px; }
  .brand-row { display:flex; align-items:center; gap:9px; margin-bottom:28px; }
  .brand-icon { width:38px; height:38px; background:linear-gradient(135deg,#FF6B00,#FF8C00); border-radius:12px; display:flex; align-items:center; justify-content:center; color:white; box-shadow:0 6px 20px rgba(255,107,0,0.4); flex-shrink:0; }
  .brand-icon.large { width:52px; height:52px; border-radius:16px; }
  .brand-name { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:white; letter-spacing:-0.5px; }
  .brand-name.large { font-size:30px; }
  .brand-name span { color:#FF6B00; }
  .form-title { font-family:'Syne',sans-serif; font-size:36px; font-weight:900; color:white; line-height:1.1; margin-bottom:8px; letter-spacing:-1px; }
  .form-title span { color:#FF6B00; }
  .form-sub { color:#666; font-size:13px; font-weight:600; }
  .form-card { background:#1a1a1e; margin:0 12px; border-radius:24px; padding:22px 18px; border:1px solid #252528; display:flex; flex-direction:column; gap:14px; position:relative; z-index:2; }
  .btn-google { display:flex; align-items:center; justify-content:center; gap:10px; background:#1f1f23; border:1.5px solid #2e2e34; border-radius:14px; padding:13px; color:#ccc; font-family:'Nunito',sans-serif; font-size:13px; font-weight:700; cursor:pointer; transition:border-color 0.2s,background 0.2s; width:100%; }
  .btn-google:hover:not(:disabled) { border-color:#FF6B00; background:rgba(255,107,0,0.05); }
  .btn-google:disabled { opacity:0.6; cursor:not-allowed; }
  .divider { display:flex; align-items:center; gap:10px; }
  .divider::before,.divider::after { content:''; flex:1; height:1px; background:#252528; }
  .divider span { flex-shrink:0; white-space:nowrap; color:#444; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; }
  .field-wrap { display:flex; flex-direction:column; gap:6px; }
  .field-label { color:#aaa; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; }
  .field-box { display:flex; align-items:center; gap:10px; background:#111115; border:1.5px solid #252528; border-radius:13px; padding:11px 13px; transition:border-color 0.2s,box-shadow 0.2s; }
  .field-box:focus-within { border-color:#FF6B00; box-shadow:0 0 0 3px rgba(255,107,0,0.12); }
  .field-box.err { border-color:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,0.1); }
  .field-box.ok { border-color:#22c55e; }
  .field-box.disabled { opacity:0.45; pointer-events:none; }
  .field-icon { color:#555; flex-shrink:0; }
  .field-box:focus-within .field-icon { color:#FF6B00; }
  .field-input { flex:1; background:transparent; border:none; outline:none; color:white; font-family:'Nunito',sans-serif; font-size:13px; font-weight:600; min-width:0; }
  .field-input::placeholder { color:#3a3a40; }
  .toggle-eye { background:transparent; border:none; color:#555; cursor:pointer; display:flex; align-items:center; padding:0; flex-shrink:0; transition:color 0.2s; }
  .toggle-eye:hover { color:#FF6B00; }
  .field-error { display:flex; align-items:center; gap:5px; color:#ef4444; font-size:10.5px; font-weight:700; }
  .error-dot { width:5px; height:5px; background:#ef4444; border-radius:50%; flex-shrink:0; display:inline-block; }
  .error-dot.lg { width:6px; height:6px; }
  .row-between { display:flex; align-items:center; justify-content:space-between; }
  .remember-row { display:flex; align-items:center; gap:8px; cursor:pointer; color:#777; font-size:12px; font-weight:600; user-select:none; }
  .checkbox { width:18px; height:18px; border:1.5px solid #333; border-radius:5px; background:#111115; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; }
  .checkbox.checked { background:#FF6B00; border-color:#FF6B00; }
  .link { color:#FF6B00; font-size:12px; font-weight:700; cursor:pointer; }
  .link:hover { text-decoration:underline; }
  .login-error-banner { display:flex; align-items:center; gap:8px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:10px; padding:10px 13px; color:#ef4444; font-size:12px; font-weight:700; }
  .btn-cta { display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#FF6B00,#FF8C00); color:white; border:none; border-radius:14px; padding:14px; font-family:'Nunito',sans-serif; font-size:14px; font-weight:800; cursor:pointer; box-shadow:0 8px 24px rgba(255,107,0,0.45); transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s; width:100%; }
  .btn-cta:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 12px 32px rgba(255,107,0,0.55); }
  .btn-cta:disabled { opacity:0.7; cursor:not-allowed; }
  .btn-cta.locked { background:linear-gradient(135deg,#333,#444); box-shadow:none; }
  .spinner { width:20px; height:20px; border:2.5px solid rgba(255,255,255,0.3); border-top-color:white; border-radius:50%; animation:spin 0.7s linear infinite; display:inline-block; }
  .spinner.dark { border-color:rgba(0,0,0,0.15); border-top-color:#555; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .signin-prompt { text-align:center; color:#555; font-size:12px; font-weight:600; }
  .mobile-deco { display:flex; justify-content:center; gap:12px; padding:24px 14px 0; }
  .deco-bubble { width:48px; height:48px; background:#1a1a1e; border:1px solid #252528; border-radius:14px; display:flex; align-items:center; justify-content:center; animation:bob 3s ease-in-out infinite; }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  .forgot-form,.forgot-sent { display:flex; flex-direction:column; gap:16px; }
  .back-btn { display:flex; align-items:center; gap:6px; background:transparent; border:none; color:#666; font-family:'Nunito',sans-serif; font-size:12px; font-weight:700; cursor:pointer; padding:0; transition:color 0.2s; width:fit-content; }
  .back-btn:hover { color:#FF6B00; }
  .forgot-header { display:flex; flex-direction:column; gap:6px; }
  .forgot-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:900; color:white; letter-spacing:-0.5px; }
  .forgot-sub { color:#666; font-size:12px; font-weight:600; line-height:1.6; }
  .forgot-note { color:#444; font-size:11px; font-weight:600; text-align:center; }
  .sent-icon-wrap { display:flex; justify-content:center; padding:8px 0; }

  /* ── Lockout Banners ── */
  .lockout-banner { display:flex; align-items:flex-start; gap:12px; border-radius:14px; padding:14px 16px; }
  .lockout-banner.blocked { background:rgba(249,115,22,0.1); border:1.5px solid rgba(249,115,22,0.3); }
  .lockout-banner.frozen  { background:rgba(239,68,68,0.1);  border:1.5px solid rgba(239,68,68,0.3);  }
  .lockout-title { color:white; font-size:12px; font-weight:800; margin-bottom:4px; }
  .lockout-msg   { color:#888; font-size:11px; font-weight:600; line-height:1.5; }
  .lockout-countdown { font-family:'Syne',sans-serif; font-size:22px; font-weight:900; color:#f97316; margin-top:6px; letter-spacing:-0.5px; }
  .lockout-link  { display:inline-block; margin-top:6px; color:#FF6B00; font-size:11px; font-weight:700; text-decoration:underline; }

  .desktop-wrap { display:none; }
  @media (min-width:768px) {
    .phone-shell { display:none; }
    .desktop-wrap { display:flex; align-items:stretch; width:100%; max-width:1100px; min-height:100vh; position:relative; z-index:10; }
    .desktop-left { flex:1; padding:60px 56px; display:flex; flex-direction:column; justify-content:center; gap:40px; position:relative; }
    .desktop-left::after { content:''; position:absolute; right:0; top:10%; bottom:10%; width:1px; background:linear-gradient(to bottom,transparent,#252528 30%,#252528 70%,transparent); }
    .dl-brand { display:flex; align-items:center; gap:14px; }
    .dl-content { display:flex; flex-direction:column; gap:16px; }
    .dl-title { font-family:'Syne',sans-serif; font-size:58px; font-weight:900; color:white; line-height:1.0; letter-spacing:-2.5px; }
    .dl-title span { color:#FF6B00; }
    .dl-sub { color:#555; font-size:15px; font-weight:600; line-height:1.7; max-width:380px; }
    .dl-service-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; max-width:360px; }
    .service-card { background:#1a1a1e; border:1px solid #252528; border-radius:16px; padding:14px 16px; display:flex; align-items:center; gap:12px; transition:border-color 0.2s,transform 0.2s; animation:slide-in 0.5s ease both; cursor:default; }
    .service-card:hover { border-color:#FF6B00; transform:translateY(-2px); }
    @keyframes slide-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    .service-card-icon { width:44px; height:44px; background:rgba(255,107,0,0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .service-card-label { color:white; font-size:13px; font-weight:800; margin-bottom:2px; }
    .service-card-time { color:#FF6B00; font-size:11px; font-weight:700; display:flex; align-items:center; }
    .dl-trust { display:flex; flex-direction:column; gap:8px; }
    .trust-chip { display:inline-flex; align-items:center; gap:7px; background:rgba(255,107,0,0.08); border:1px solid rgba(255,107,0,0.2); border-radius:30px; padding:7px 16px; color:#FF6B00; font-size:12px; font-weight:700; width:fit-content; }
    .desktop-right { flex:1; display:flex; align-items:center; justify-content:center; padding:48px 36px; }
    .desktop-form-card { width:100%; max-width:440px; background:#141416; border:1px solid #252528; border-radius:28px; padding:36px 32px; display:flex; flex-direction:column; gap:16px; }
    .desktop-form-header h2 { font-family:'Syne',sans-serif; font-size:28px; font-weight:900; color:white; margin-bottom:5px; letter-spacing:-0.5px; }
    .desktop-form-header p { color:#555; font-size:13px; font-weight:600; }
  }
`;