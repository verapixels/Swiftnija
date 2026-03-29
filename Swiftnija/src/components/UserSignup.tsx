import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiUser, FiMail, FiLock, FiPhone, FiEye, FiEyeOff,
  FiArrowRight, FiCheck, FiZap, FiChevronRight,
  FiShield, FiTruck,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { BsApple } from "react-icons/bs";
import {
  MdDeliveryDining, MdLocalPharmacy, MdStorefront, MdFastfood,
} from "react-icons/md";
import { RiSendPlaneFill, RiLeafLine } from "react-icons/ri";

import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword, updateProfile,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type FieldName = "fullName" | "email" | "phone" | "password" | "confirmPassword";
type FormData = Record<FieldName, string>;
type TouchedFields = Partial<Record<FieldName, boolean>>;
type ErrorFields = Partial<Record<FieldName, string>>;

// ─────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────
const validate = (name: FieldName, value: string, all: FormData): string => {
  switch (name) {
    case "fullName":
      if (!value.trim()) return "Full name is required";
      if (value.trim().length < 3) return "Name must be at least 3 characters";
      return "";
    case "email":
      if (!value.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address";
      return "";
    case "phone":
      if (!value.trim()) return "Phone number is required";
      if (!/^(\+?234|0)[789]\d{9}$/.test(value.replace(/\s/g, "")))
        return "Enter a valid Nigerian phone number";
      return "";
    case "password":
      if (!value) return "Password is required";
      if (value.length < 8) return "Password must be at least 8 characters";
      if (!/[A-Z]/.test(value)) return "Must include an uppercase letter";
      if (!/[0-9]/.test(value)) return "Must include a number";
      return "";
    case "confirmPassword":
      if (!value) return "Please confirm your password";
      if (value !== all.password) return "Passwords do not match";
      return "";
    default:
      return "";
  }
};

// ─────────────────────────────────────────
// PASSWORD STRENGTH
// ─────────────────────────────────────────
const getStrength = (pwd: string) => {
  if (!pwd) return { score: 0, label: "", color: "#333" };
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 1) return { score: s, label: "Weak",        color: "#ef4444" };
  if (s <= 3) return { score: s, label: "Fair",        color: "#f59e0b" };
  if (s === 4) return { score: s, label: "Strong",     color: "#22c55e" };
  return       { score: s, label: "Very Strong", color: "#FF6B00" };
};

// ─────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i, size: 2 + (i * 17 % 5), x: (i * 23 % 100), y: (i * 37 % 100),
  delay: (i * 0.45), duration: 12 + (i % 10), opacity: 0.05 + (i % 4) * 0.05,
}));

// ─────────────────────────────────────────
// SAVE USER TO FIRESTORE (with retry)
// ─────────────────────────────────────────
async function saveUserProfile(uid: string, data: {
  fullName: string; email: string; phone: string;
  photoURL?: string | null; provider?: string;
}, retries = 2) {
  const payload = {
    fullName:      data.fullName,
    email:         data.email,
    phone:         data.phone,
    photoURL:      data.photoURL ?? null,
    provider:      data.provider ?? "email",
    address:       "",
    bio:           "",
    darkMode:      true,
    notifications: true,
    orderUpdates:  true,
    promoEmails:   false,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await setDoc(doc(db, "users", uid), payload, { merge: true });
      return; // ✅ success
    } catch (err: any) {
      if (attempt === retries) throw err; // rethrow after final attempt
      console.warn(`saveUserProfile attempt ${attempt + 1} failed, retrying...`, err.message);
      await new Promise(r => setTimeout(r, 800 * (attempt + 1))); // back-off: 800ms, 1600ms
    }
  }
}
// ─────────────────────────────────────────
// LEFT PANEL DATA
// ─────────────────────────────────────────
const STATS = [
  { val: "50K+", label: "Happy users" },
  { val: "15min", label: "Avg delivery" },
  { val: "500+", label: "Partner stores" },
  { val: "4.9", label: "App rating" },
];

const BADGES = [
  { icon: FiZap,    label: "Instant Checkout"  },
  { icon: FiShield, label: "Secure Payments"   },
  { icon: FiTruck,  label: "Real-time Tracking" },
];

const DECO_ICONS = [MdFastfood, MdLocalPharmacy, MdStorefront, RiSendPlaneFill, RiLeafLine];

// ─────────────────────────────────────────
// FIELD COMPONENT — outside UserSignup to prevent focus loss
// ─────────────────────────────────────────
interface FieldProps {
  name: FieldName;
  label: string;
  type?: string;
  placeholder: string;
  icon: React.ElementType;
  rightElement?: React.ReactNode;
  form: FormData;
  touched: TouchedFields;
  errors: ErrorFields;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (name: FieldName) => void;
}

const Field = ({
  name, label, type = "text", placeholder, icon: Icon, rightElement,
  form, touched, errors, handleChange, handleBlur,
}: FieldProps) => {
  const hasError = !!touched[name] && !!errors[name];
  const isValid  = !!touched[name] && !errors[name] && !!form[name];
  return (
    <div className="field-wrap">
      <label className="field-label">{label}</label>
      <div className={`field-box ${hasError ? "err" : ""} ${isValid ? "ok" : ""}`}>
        <Icon size={16} className="field-icon" />
        <input
          name={name} type={type} placeholder={placeholder}
          value={form[name]} onChange={handleChange} onBlur={() => handleBlur(name)}
          autoComplete="off" className="field-input"
        />
        {rightElement}
        {isValid && !rightElement && <span className="field-check"><FiCheck size={13} /></span>}
      </div>
      {hasError && (
        <span className="field-error"><span className="error-dot" />{errors[name]}</span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────
// SOCIAL BUTTONS — outside UserSignup
// ─────────────────────────────────────────
interface SocialButtonsProps {
  submitting: boolean;
  handleGoogle: () => void;
  handleApple: () => void;
}

const SocialButtons = ({ submitting, handleGoogle, handleApple }: SocialButtonsProps) => (
  <div className="social-row">
    <button className="btn-social btn-google" onClick={handleGoogle} disabled={submitting}>
      <FcGoogle size={20} /><span>Continue with Google</span>
    </button>
    <button className="btn-social btn-apple" onClick={handleApple} disabled={submitting}>
      <BsApple size={18} /><span>Continue with Apple</span>
    </button>
  </div>
);

// ─────────────────────────────────────────
// FORM CONTENT — outside UserSignup
// ─────────────────────────────────────────
interface FormContentProps {
  form: FormData;
  touched: TouchedFields;
  errors: ErrorFields;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (name: FieldName) => void;
  showPwd: boolean;
  setShowPwd: React.Dispatch<React.SetStateAction<boolean>>;
  showConf: boolean;
  setShowConf: React.Dispatch<React.SetStateAction<boolean>>;
  agreed: boolean;
  setAgreed: React.Dispatch<React.SetStateAction<boolean>>;
  submitting: boolean;
  firebaseError: string;
  handleSubmit: () => void;
  handleGoogle: () => void;
  handleApple: () => void;
  strength: { score: number; label: string; color: string };
  navigate: (path: string) => void;
}

const FormContent = ({
  form, touched, errors, handleChange, handleBlur,
  showPwd, setShowPwd, showConf, setShowConf,
  agreed, setAgreed, submitting, firebaseError,
  handleSubmit, handleGoogle, handleApple, strength, navigate,
}: FormContentProps) => {
  const fp = { form, touched, errors, handleChange, handleBlur };
  return (
    <>
      <SocialButtons submitting={submitting} handleGoogle={handleGoogle} handleApple={handleApple} />
      <div className="divider"><span>or create an account</span></div>
      <Field {...fp} name="fullName" label="Full Name" placeholder="e.g. Amara Okafor" icon={FiUser} />
      <Field {...fp} name="email" label="Email Address" type="email" placeholder="you@example.com" icon={FiMail} />
      <Field {...fp} name="phone" label="Phone Number" type="tel" placeholder="+234 800 000 0000" icon={FiPhone} />
      <Field
        {...fp}
        name="password" label="Password"
        type={showPwd ? "text" : "password"}
        placeholder="Min. 8 chars, 1 uppercase, 1 number"
        icon={FiLock}
        rightElement={
          <button className="toggle-eye" type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
            {showPwd ? <FiEyeOff size={15} /> : <FiEye size={15} />}
          </button>
        }
      />
      {form.password && (
        <div className="strength-wrap">
          <div className="strength-track">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="strength-seg"
                style={{ background: i <= strength.score ? strength.color : "#2a2a30" }} />
            ))}
          </div>
          {strength.label && <span className="strength-label" style={{ color: strength.color }}>{strength.label}</span>}
        </div>
      )}
      <Field
        {...fp}
        name="confirmPassword" label="Confirm Password"
        type={showConf ? "text" : "password"}
        placeholder="Re-enter your password"
        icon={FiLock}
        rightElement={
          <button className="toggle-eye" type="button" onClick={() => setShowConf(v => !v)} tabIndex={-1}>
            {showConf ? <FiEyeOff size={15} /> : <FiEye size={15} />}
          </button>
        }
      />
      <label className="terms-row" onClick={() => setAgreed(v => !v)}>
        <div className={`checkbox ${agreed ? "checked" : ""}`}>{agreed && <FiCheck size={10} />}</div>
        <span>
          I agree to the <a href="#" className="link" onClick={e => e.stopPropagation()}>Terms of Service</a>
          {" "}and <a href="#" className="link" onClick={e => e.stopPropagation()}>Privacy Policy</a>
        </span>
      </label>
      {!agreed && Object.keys(touched).length > 0 && (
        <span className="field-error" style={{ marginTop: -6 }}>
          <span className="error-dot" />You must agree to continue
        </span>
      )}
      {firebaseError && (
        <div className="firebase-err">
          <span className="error-dot lg" />{firebaseError}
        </div>
      )}
      <button className="btn-cta" onClick={handleSubmit} disabled={submitting}>
        {submitting ? <span className="spinner" /> : <>Create Account <FiArrowRight size={16} /></>}
      </button>
      <p className="signin-prompt">
        Already have an account?{" "}
        <span className="link" onClick={() => navigate("/login")}>
          Sign in <FiChevronRight size={12} style={{ verticalAlign: "middle" }} />
        </span>
      </p>
    </>
  );
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function UserSignup() {
  const navigate = useNavigate();

  const [form, setForm]         = useState<FormData>({ fullName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [touched, setTouched]   = useState<TouchedFields>({});
  const [errors, setErrors]     = useState<ErrorFields>({});
  const [showPwd, setShowPwd]   = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [agreed, setAgreed]         = useState(false);
  const [firebaseError, setFirebaseError] = useState("");

  const formRef = useRef<HTMLDivElement>(null);

  // ✅ FIX: useEffect always at top level, never inside if block
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => navigate("/verify"), 2500);
    return () => clearTimeout(timer);
  }, [submitted]);

  // Re-validate touched fields on every change
  useEffect(() => {
    const newErrors: ErrorFields = {};
    (Object.keys(touched) as FieldName[]).forEach(k => {
      if (touched[k]) {
        const e = validate(k, form[k], form);
        if (e) newErrors[k] = e;
      }
    });
    setErrors(newErrors);
    if (firebaseError) setFirebaseError("");
  }, [form, touched]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleBlur = (name: FieldName) =>
    setTouched(p => ({ ...p, [name]: true }));

  const handleSubmit = async () => {
    const allTouched: TouchedFields = { fullName: true, email: true, phone: true, password: true, confirmPassword: true };
    setTouched(allTouched);
    const allErrors: ErrorFields = {};
    (Object.keys(form) as FieldName[]).forEach(k => {
      const e = validate(k, form[k], form);
      if (e) allErrors[k] = e;
    });
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0 || !agreed) return;

    setSubmitting(true);
    setFirebaseError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.fullName });
      await saveUserProfile(cred.user.uid, {
        fullName: form.fullName, email: form.email, phone: form.phone, provider: "email",
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error("Firebase signup error:", err.code, err.message);
      const c = err?.code || "";
      if (c === "auth/email-already-in-use") setFirebaseError("This email is already registered. Try signing in.");
      else if (c === "auth/weak-password")   setFirebaseError("Password is too weak. Try a stronger one.");
      else setFirebaseError(`Account creation failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setFirebaseError("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const u = result.user;
      await saveUserProfile(u.uid, {
        fullName: u.displayName || "", email: u.email || "",
        phone: u.phoneNumber || "", photoURL: u.photoURL, provider: "google",
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error("Google signin error:", err.code, err.message);
      setFirebaseError("Google sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApple = async () => {
    setSubmitting(true);
    setFirebaseError("");
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      await saveUserProfile(u.uid, {
        fullName: u.displayName || "", email: u.email || "",
        phone: u.phoneNumber || "", photoURL: u.photoURL, provider: "apple",
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error("Apple signin error:", err.code, err.message);
      setFirebaseError("Apple sign-in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const strength = getStrength(form.password);

  const sharedProps: FormContentProps = {
    form, touched, errors, handleChange, handleBlur,
    showPwd, setShowPwd, showConf, setShowConf,
    agreed, setAgreed, submitting, firebaseError,
    handleSubmit, handleGoogle, handleApple, strength, navigate,
  };

  const fieldProps = { form, touched, errors, handleChange, handleBlur };

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="page-bg">
        <div className="success-container">
          <div className="success-glow" />
          <div className="success-icon-wrap"><FiZap size={42} color="white" /></div>
          <h2 className="success-title">You're in!</h2>
         <p className="success-sub">
               Welcome to <strong>swift<span>nija</span></strong>.<br />Let's verify your email and phone.
           </p>
          <button className="btn-cta" onClick={() => navigate("/verify") }>
           Verify Account <FiArrowRight size={18} />
          </button>
          <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
            Redirecting in 3... 2... 1...
          </p>
        </div>
        <style>{STYLES}</style>
      </div>
    );
  }

  return (
    <div className="page-bg">
      {PARTICLES.map(p => (
        <div key={p.id} className="particle" style={{
          width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%`,
          opacity: p.opacity, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      {/* ══ MOBILE SHELL ══ */}
      <div className="phone-shell">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="form-hero">
            <div className="brand-row">
              <div className="brand-icon"><MdDeliveryDining size={22} /></div>
              <span className="brand-name">swift<span>nija</span></span>
            </div>
            <h1 className="form-title">Create your<br /><span>account</span></h1>
            <p className="form-sub">Join 50,000+ users getting fast delivery in Lagos</p>
          </div>
          <div className="form-card" ref={formRef}>
            <FormContent {...sharedProps} />
          </div>
          <div style={{ height: 40 }} />
        </div>
      </div>

      {/* ══ DESKTOP ══ */}
      <div className="desktop-wrap">
        {/* Left */}
        <div className="desktop-left">
          <div className="dl-brand">
            <div className="brand-icon large"><MdDeliveryDining size={32} /></div>
            <span className="brand-name large">swift<span>nija</span></span>
          </div>
          <div className="dl-hero">
            <h1 className="dl-title">Delivered<br />in <span>minutes</span>,<br />not hours.</h1>
            <p className="dl-sub">
              Nigeria's fastest growing delivery platform. Restaurants, pharmacies,
              supermarkets and boutiques — all at your fingertips.
            </p>
          </div>
          <div className="dl-stats">
            {STATS.map(s => (
              <div className="dl-stat" key={s.val}>
                <div className="dl-stat-val">{s.val}</div>
                <div className="dl-stat-lbl">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="dl-badges">
            {BADGES.map((b, i) => (
              <div className="dl-badge" key={i}>
                <b.icon size={13} color="#FF6B00" /><span>{b.label}</span>
              </div>
            ))}
          </div>
          <div className="dl-deco-icons">
            {DECO_ICONS.map((Icon, i) => (
              <div className="deco-chip" key={i} style={{ animationDelay: `${i * 0.3}s` }}>
                <Icon size={18} color="#FF6B00" />
              </div>
            ))}
          </div>
        </div>

        {/* Right — Desktop form */}
        <div className="desktop-right">
          <div className="desktop-form-card">
            <div className="desktop-form-header">
              <h2>Create your account</h2>
              <p>Join swiftnija and start ordering today</p>
            </div>

            {/* ✅ FIX: Google + Apple buttons visible on desktop */}
            <SocialButtons submitting={submitting} handleGoogle={handleGoogle} handleApple={handleApple} />
            <div className="divider"><span>or create an account</span></div>

            <div className="desktop-grid-2">
              <Field {...fieldProps} name="fullName" label="Full Name" placeholder="Amara Okafor" icon={FiUser} />
              <Field {...fieldProps} name="phone" label="Phone Number" type="tel" placeholder="+234 800 000 0000" icon={FiPhone} />
            </div>
            <Field {...fieldProps} name="email" label="Email Address" type="email" placeholder="you@example.com" icon={FiMail} />
            <div className="desktop-grid-2">
              <div>
                <Field
                  {...fieldProps}
                  name="password" label="Password" type={showPwd ? "text" : "password"} placeholder="Min 8 chars"
                  icon={FiLock}
                  rightElement={
                    <button className="toggle-eye" type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                      {showPwd ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                    </button>
                  }
                />
                {form.password && (
                  <div className="strength-wrap">
                    <div className="strength-track">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="strength-seg"
                          style={{ background: i <= strength.score ? strength.color : "#2a2a30" }} />
                      ))}
                    </div>
                    {strength.label && <span className="strength-label" style={{ color: strength.color }}>{strength.label}</span>}
                  </div>
                )}
              </div>
              <Field
                {...fieldProps}
                name="confirmPassword" label="Confirm Password" type={showConf ? "text" : "password"} placeholder="Re-enter password"
                icon={FiLock}
                rightElement={
                  <button className="toggle-eye" type="button" onClick={() => setShowConf(v => !v)} tabIndex={-1}>
                    {showConf ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                }
              />
            </div>
            <label className="terms-row" onClick={() => setAgreed(v => !v)}>
              <div className={`checkbox ${agreed ? "checked" : ""}`}>{agreed && <FiCheck size={10} />}</div>
              <span>
                I agree to the <a href="#" className="link" onClick={e => e.stopPropagation()}>Terms of Service</a>
                {" "}and <a href="#" className="link" onClick={e => e.stopPropagation()}>Privacy Policy</a>
              </span>
            </label>
            {!agreed && Object.keys(touched).length > 0 && (
              <span className="field-error" style={{ marginTop: -6 }}>
                <span className="error-dot" />You must agree to continue
              </span>
            )}
            {firebaseError && <div className="firebase-err"><span className="error-dot lg" />{firebaseError}</div>}
            <button className="btn-cta" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <span className="spinner" /> : <>Create Account <FiArrowRight size={16} /></>}
            </button>
            <p className="signin-prompt">
              Already have an account?{" "}
              <span className="link" onClick={() => navigate("/login")}>
                Sign in <FiChevronRight size={12} style={{ verticalAlign: "middle" }} />
              </span>
            </p>
          </div>
        </div>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// STYLES — at the bottom of the file
// ─────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  .page-bg {
    min-height:100vh; background:#0a0a0a;
    display:flex; align-items:center; justify-content:center;
    font-family:'Nunito',sans-serif; position:relative; overflow:hidden;
  }

  /* Orbs */
  .orb { position:fixed; border-radius:50%; filter:blur(80px); pointer-events:none; z-index:0; }
  .orb1 { width:500px;height:500px;background:radial-gradient(circle,rgba(255,107,0,.18) 0%,transparent 70%);top:-180px;left:-180px;animation:drift 18s ease-in-out infinite alternate; }
  .orb2 { width:380px;height:380px;background:radial-gradient(circle,rgba(255,140,0,.10) 0%,transparent 70%);bottom:-120px;right:-120px;animation:drift 22s ease-in-out infinite alternate-reverse; }
  .orb3 { width:240px;height:240px;background:radial-gradient(circle,rgba(255,107,0,.08) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);animation:pulse-orb 10s ease-in-out infinite; }
  @keyframes drift { 0%{transform:translate(0,0)}100%{transform:translate(30px,30px)} }
  @keyframes pulse-orb { 0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.15)} }

  /* Particles */
  .particle { position:fixed; background:#FF6B00; border-radius:50%; z-index:0; animation:float-up linear infinite; pointer-events:none; }
  @keyframes float-up { 0%{transform:translateY(100vh) scale(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(-10vh) scale(1);opacity:0} }

  /* Phone shell */
  .phone-shell { width:390px;height:844px;background:#141416;border-radius:48px;overflow:hidden;position:relative;box-shadow:0 0 0 2px #2a2a2a,0 40px 100px rgba(0,0,0,.9),inset 0 0 0 1px #333;display:flex;flex-direction:column;z-index:10; }
  .phone-notch { width:126px;height:34px;background:#141416;border-radius:0 0 20px 20px;position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:100; }
  .phone-screen { flex:1;overflow-y:auto;padding-top:50px;scrollbar-width:none;background:#0f0f11; }
  .phone-screen::-webkit-scrollbar { display:none; }

  /* Hero */
  .form-hero { padding:20px 20px 24px; }
  .brand-row { display:flex;align-items:center;gap:9px;margin-bottom:24px; }
  .brand-icon { width:38px;height:38px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 6px 20px rgba(255,107,0,.4);flex-shrink:0; }
  .brand-icon.large { width:52px;height:52px;border-radius:16px; }
  .brand-name { font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:white;letter-spacing:-.5px; }
  .brand-name.large { font-size:30px; }
  .brand-name span { color:#FF6B00; }
  .form-title { font-family:'Syne',sans-serif;font-size:32px;font-weight:900;color:white;line-height:1.1;margin-bottom:8px;letter-spacing:-1px; }
  .form-title span { color:#FF6B00; }
  .form-sub { color:#666;font-size:13px;font-weight:600;line-height:1.5; }

  /* Form card */
  .form-card { background:#1a1a1e;margin:0 12px;border-radius:24px;padding:22px 18px;border:1px solid #252528;display:flex;flex-direction:column;gap:14px;position:relative;z-index:2; }

  /* Social buttons row */
  .social-row { display:flex;flex-direction:column;gap:10px; }

  /* Shared social button base */
  .btn-social { display:flex;align-items:center;justify-content:center;gap:10px;border-radius:14px;padding:13px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:border-color .2s,background .2s,transform .15s;width:100%;border:1.5px solid transparent; }
  .btn-social:disabled { opacity:.6;cursor:not-allowed; }
  .btn-social:hover:not(:disabled) { transform:translateY(-1px); }

  /* Google specific */
  .btn-google { background:#1f1f23;border-color:#2e2e34;color:#ccc; }
  .btn-google:hover:not(:disabled) { border-color:#FF6B00;background:rgba(255,107,0,.05); }

  /* Apple specific */
  .btn-apple { background:#fff;border-color:#e0e0e0;color:#000; }
  .btn-apple:hover:not(:disabled) { background:#f5f5f5;border-color:#ccc; }

  /* Divider */
  .divider { display:flex;align-items:center;gap:10px; }
  .divider::before,.divider::after { content:'';flex:1;height:1px;background:#252528; }
  .divider span { flex-shrink:0;white-space:nowrap;color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px; }

  /* Fields */
  .field-wrap { display:flex;flex-direction:column;gap:6px; }
  .field-label { color:#aaa;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px; }
  .field-box { display:flex;align-items:center;gap:10px;background:#111115;border:1.5px solid #252528;border-radius:13px;padding:11px 13px;transition:border-color .2s,box-shadow .2s; }
  .field-box:focus-within { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.12); }
  .field-box.err { border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.1); }
  .field-box.ok  { border-color:#22c55e; }
  .field-icon { color:#555;flex-shrink:0; }
  .field-box:focus-within .field-icon { color:#FF6B00; }
  .field-input { flex:1;background:transparent;border:none;outline:none;color:white;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;min-width:0; }
  .field-input::placeholder { color:#3a3a40; }
  .toggle-eye { background:transparent;border:none;color:#555;cursor:pointer;display:flex;align-items:center;padding:0;flex-shrink:0;transition:color .2s; }
  .toggle-eye:hover { color:#FF6B00; }
  .field-check { color:#22c55e;display:flex;align-items:center;flex-shrink:0; }
  .field-error { display:flex;align-items:center;gap:5px;color:#ef4444;font-size:10.5px;font-weight:700; }
  .error-dot { width:5px;height:5px;background:#ef4444;border-radius:50%;flex-shrink:0;display:inline-block; }
  .error-dot.lg { width:6px;height:6px; }
  .firebase-err { display:flex;align-items:center;gap:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:10px 13px;color:#ef4444;font-size:12px;font-weight:700; }

  /* Strength */
  .strength-wrap { display:flex;align-items:center;gap:8px;margin-top:-2px; }
  .strength-track { display:flex;gap:3px;flex:1; }
  .strength-seg { height:3px;border-radius:3px;flex:1;transition:background .3s; }
  .strength-label { font-size:10px;font-weight:800;flex-shrink:0;transition:color .3s; }

  /* Terms */
  .terms-row { display:flex;align-items:flex-start;gap:10px;cursor:pointer;user-select:none;color:#777;font-size:11.5px;font-weight:600;line-height:1.5; }
  .checkbox { width:18px;height:18px;border:1.5px solid #333;border-radius:5px;background:#111115;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;transition:all .2s;color:white; }
  .checkbox.checked { background:#FF6B00;border-color:#FF6B00; }
  .link { color:#FF6B00;text-decoration:none;font-weight:700;cursor:pointer; }
  .link:hover { text-decoration:underline; }

  /* CTA */
  .btn-cta { display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#FF6B00,#FF8C00);color:white;border:none;border-radius:14px;padding:14px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(255,107,0,.45);transition:transform .2s,box-shadow .2s,opacity .2s;width:100%; }
  .btn-cta:hover:not(:disabled) { transform:translateY(-2px);box-shadow:0 12px 32px rgba(255,107,0,.55); }
  .btn-cta:disabled { opacity:.7;cursor:not-allowed; }

  /* Spinner */
  .spinner { width:20px;height:20px;border:2.5px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }

  .signin-prompt { text-align:center;color:#555;font-size:12px;font-weight:600; }

  /* Success */
  .success-container { position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;text-align:center;padding:48px 32px;background:#1a1a1e;border-radius:28px;border:1px solid #252528;max-width:380px;width:90%;box-shadow:0 40px 80px rgba(0,0,0,.8);gap:18px; }
  .success-glow { position:absolute;inset:-2px;border-radius:30px;background:linear-gradient(135deg,#FF6B00,#FF8C00,transparent,transparent);z-index:-1;opacity:.6;animation:glow-spin 4s linear infinite; }
  @keyframes glow-spin { to{transform:rotate(360deg)} }
  .success-icon-wrap { width:80px;height:80px;border-radius:24px;background:linear-gradient(135deg,#FF6B00,#FF8C00);display:flex;align-items:center;justify-content:center;box-shadow:0 16px 40px rgba(255,107,0,.5);animation:pop-in .6s cubic-bezier(.175,.885,.32,1.275) both; }
  @keyframes pop-in { 0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1} }
  .success-title { font-family:'Syne',sans-serif;font-size:36px;font-weight:900;color:white;letter-spacing:-1px; }
  .success-sub { color:#666;font-size:14px;font-weight:600;line-height:1.7; }
  .success-sub strong { color:white; }
  .success-sub strong span { color:#FF6B00; }

  /* Deco */
  .dl-deco-icons { display:flex;gap:10px;flex-wrap:wrap; }
  .deco-chip { width:40px;height:40px;background:rgba(255,107,0,.1);border:1px solid rgba(255,107,0,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;animation:bob 3s ease-in-out infinite; }
  @keyframes bob { 0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)} }

  /* Desktop */
  .desktop-wrap { display:none; }

  @media (min-width:768px) {
    .phone-shell { display:none; }
    .desktop-wrap { display:flex;align-items:stretch;width:100%;max-width:1100px;min-height:100vh;position:relative;z-index:10; }

    .desktop-left { flex:1;padding:60px 56px;display:flex;flex-direction:column;justify-content:center;gap:36px;position:relative; }
    .desktop-left::after { content:'';position:absolute;right:0;top:10%;bottom:10%;width:1px;background:linear-gradient(to bottom,transparent,#252528 30%,#252528 70%,transparent); }
    .dl-brand { display:flex;align-items:center;gap:14px; }
    .dl-title { font-family:'Syne',sans-serif;font-size:54px;font-weight:900;color:white;line-height:1.05;letter-spacing:-2px; }
    .dl-title span { color:#FF6B00; }
    .dl-sub { color:#555;font-size:15px;font-weight:600;line-height:1.7;max-width:380px; }

    .dl-stats { display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:360px; }
    .dl-stat { background:#1a1a1e;border:1px solid #252528;border-radius:16px;padding:16px 20px;transition:border-color .2s; }
    .dl-stat:hover { border-color:#FF6B00; }
    .dl-stat-val { font-family:'Syne',sans-serif;font-size:26px;font-weight:900;color:#FF6B00;margin-bottom:2px; }
    .dl-stat-lbl { color:#555;font-size:12px;font-weight:700; }

    .dl-badges { display:flex;flex-direction:column;gap:8px; }
    .dl-badge { display:inline-flex;align-items:center;gap:8px;background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.2);border-radius:30px;padding:7px 16px;color:#FF6B00;font-size:12px;font-weight:700;width:fit-content; }

    .desktop-right { flex:1;display:flex;align-items:center;justify-content:center;padding:48px 36px;overflow-y:auto; }
    .desktop-form-card { width:100%;max-width:560px;background:#141416;border:1px solid #252528;border-radius:28px;padding:36px 32px;display:flex;flex-direction:column;gap:16px; }
    .desktop-form-header h2 { font-family:'Syne',sans-serif;font-size:26px;font-weight:900;color:white;margin-bottom:5px;letter-spacing:-.5px; }
    .desktop-form-header p { color:#555;font-size:13px;font-weight:600; }
    .desktop-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:14px;min-width:0; }
    .desktop-grid-2 > * { min-width:0; }

    /* Side-by-side social buttons on desktop */
    .social-row { flex-direction:row; }
    .btn-social { flex:1; }
  }
`;