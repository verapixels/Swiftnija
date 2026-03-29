import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import VendorAddressField from "../components/VendorAddressField";

// ─── ICONS ──────────────────────────────────────────────────
const Icon = {
  zap: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  user: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  phone: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  mail: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  lock: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  eye: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  store: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  tag: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  pin: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  camera: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  upload: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
  check: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  arrowR: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  arrowL: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  chevron: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  shield: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  star: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  truck: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  alert: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

// ─── TYPES ──────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;
type FormData = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  businessName: string;
  category: string;
  address: string;
  addressLat: number;
  addressLng: number;
  city: string;
  bio: string;
  logo: string | null;
  coverPhoto: string | null;
};
type Errors = Partial<Record<keyof FormData | "general", string>>;

const CATEGORIES = [
  "🍛 Restaurant / Food",
  "🍔 Fast Food & Snacks",
  "💊 Pharmacy / Health",
  "🛒 Supermarket / Grocery",
  "👗 Boutique / Fashion",
  "💄 Beauty & Skincare",
  "🍹 Drinks & Beverages",
  "📦 Logistics & Delivery",
  "📱 Electronics",
  "🏪 Other",
];
const CITIES = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Kano",
  "Ibadan",
  "Enugu",
  "Benin City",
  "Warri",
  "Owerri",
  "Kaduna",
];

// ─── STYLE TOKENS ─────────────────────────────────────────────
const s = {
  label: {
    display: "block",
    color: "#555",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  input: {
    display: "block",
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1.5px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: "13px 14px 13px 44px",
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "'Nunito', sans-serif",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    caretColor: "#FF6B00",
  } as React.CSSProperties,
  inputIcon: {
    position: "absolute" as const,
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#444",
    display: "flex",
    pointerEvents: "none" as const,
    zIndex: 1,
  },
  errorMsg: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: 700,
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  hint: { color: "#555", fontSize: 11, marginTop: 5, fontWeight: 600 },
  stepTag: {
    color: "#FF6B00",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  stepTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 26,
    fontWeight: 900,
    color: "white",
    letterSpacing: "-0.5px",
    marginBottom: 8,
    lineHeight: 1.1,
  },
  stepSub: { color: "#555", fontSize: 14, lineHeight: 1.6, marginBottom: 28 },
};

// ─── PARTICLE CANVAS ──────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const W = (canvas.width = canvas.offsetWidth);
    const H = (canvas.height = canvas.offsetHeight);
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.5 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
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
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── STAT TICKER ──────────────────────────────────────────────
const TICKER_ITEMS = [
  { val: "2,400+", label: "Active Vendors" },
  { val: "₦2.4B", label: "Total Payouts" },
  { val: "4.9 ★", label: "Avg Rating" },
  { val: "15 min", label: "Avg Delivery" },
  { val: "98%", label: "On-time Rate" },
];
function StatTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % TICKER_ITEMS.length),
      3000,
    );
    return () => clearInterval(t);
  }, []);
  const item = TICKER_ITEMS[idx];
  return (
    <div
      key={idx}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(255,107,0,0.08)",
        border: "1px solid rgba(255,107,0,0.2)",
        borderRadius: 40,
        padding: "8px 18px",
        animation: "tickerFade 0.5s ease",
      }}
    >
      <span
        style={{
          color: "#FF6B00",
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        {item.val}
      </span>
      <span style={{ color: "#666", fontSize: 12, fontWeight: 600 }}>
        {item.label}
      </span>
    </div>
  );
}

// ─── SHARED FIELD COMPONENTS ──────────────────────────────────
type InputFieldProps = {
  label: string;
  placeholder: string;
  type?: string;
  icon: React.ReactNode;
  rightSlot?: React.ReactNode;
  hint?: string;
  autoComplete?: string;
  value: string;
  error?: string;
  onChange: (val: string) => void;
};
function InputField({
  label,
  placeholder,
  type = "text",
  icon,
  rightSlot,
  hint,
  autoComplete,
  value,
  error,
  onChange,
}: InputFieldProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={s.label}>{label}</label>
      <div style={{ position: "relative" }}>
        <span style={s.inputIcon}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{
            ...s.input,
            borderColor: error ? "rgba(239,68,68,0.5)" : undefined,
            boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.08)" : undefined,
          }}
          onFocus={(e) => {
            if (!error) {
              e.target.style.borderColor = "#FF6B00";
              e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)";
            }
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error
              ? "rgba(239,68,68,0.5)"
              : "rgba(255,255,255,0.07)";
            e.target.style.boxShadow = error
              ? "0 0 0 3px rgba(239,68,68,0.08)"
              : "none";
          }}
        />
        {rightSlot && (
          <div
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
            }}
          >
            {rightSlot}
          </div>
        )}
      </div>
      {error && <div style={s.errorMsg}>⚠ {error}</div>}
      {hint && !error && <div style={s.hint}>{hint}</div>}
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  placeholder: string;
  options: string[];
  icon: React.ReactNode;
  value: string;
  error?: string;
  onChange: (val: string) => void;
};
function SelectField({
  label,
  placeholder,
  options,
  icon,
  value,
  error,
  onChange,
}: SelectFieldProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={s.label}>{label}</label>
      <div style={{ position: "relative" }}>
        <span style={s.inputIcon}>{icon}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...s.input,
            paddingRight: 40,
            color: value ? "rgba(255,255,255,0.9)" : "#444",
            borderColor: error ? "rgba(239,68,68,0.5)" : undefined,
            appearance: "none",
          }}
        >
          <option value="" disabled style={{ color: "#444" }}>
            {placeholder}
          </option>
          {options.map((o) => (
            <option
              key={o}
              value={o}
              style={{ background: "#0f0f17", color: "#ddd" }}
            >
              {o}
            </option>
          ))}
        </select>
        <span
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#444",
            pointerEvents: "none",
          }}
        >
          <Icon.chevron />
        </span>
      </div>
      {error && <div style={s.errorMsg}>⚠ {error}</div>}
    </div>
  );
}

// ─── STEP 1: PERSONAL ─────────────────────────────────────────
function StepPersonal({
  form,
  errors,
  showPass,
  setShowPass,
  showConf,
  setShowConf,
  set,
}: any) {
  const passStrength =
    form.password.length === 0
      ? 0
      : form.password.length < 6
        ? 1
        : form.password.length < 10 || !/[A-Z]/.test(form.password)
          ? 2
          : /[!@#$%^&*]/.test(form.password)
            ? 4
            : 3;
  const passLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const passColor = ["", "#EF4444", "#F59E0B", "#3B82F6", "#10B981"];

  return (
    <div className="step-anim">
      <div style={s.stepTag}>Step 1 of 3</div>
      <h2 style={s.stepTitle}>Your Account</h2>
      <p style={s.stepSub}>
        Start with your personal details. You'll use these to log in and receive
        payouts.
      </p>

      <InputField
        label="Full Name"
        placeholder="Theresa Okafor"
        icon={<Icon.user />}
        autoComplete="name"
        value={form.fullName}
        error={errors.fullName}
        onChange={(v) => set("fullName", v)}
      />
      <InputField
        label="Phone Number"
        placeholder="+234 812 345 6789"
        icon={<Icon.phone />}
        autoComplete="tel"
        hint="Used for order alerts via SMS/WhatsApp"
        value={form.phone}
        error={errors.phone}
        onChange={(v) => set("phone", v)}
      />
      <InputField
        label="Email Address"
        placeholder="you@example.com"
        type="email"
        icon={<Icon.mail />}
        autoComplete="email"
        value={form.email}
        error={errors.email}
        onChange={(v) => set("email", v)}
      />

      <div style={{ marginBottom: 20 }}>
        <label style={s.label}>Password</label>
        <div style={{ position: "relative" }}>
          <span style={s.inputIcon}>
            <Icon.lock />
          </span>
          <input
            type={showPass ? "text" : "password"}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            style={{
              ...s.input,
              paddingRight: 44,
              borderColor: errors.password ? "rgba(239,68,68,0.5)" : undefined,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#FF6B00";
              e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.password
                ? "rgba(239,68,68,0.5)"
                : "rgba(255,255,255,0.07)";
              e.target.style.boxShadow = "none";
            }}
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#555",
              display: "flex",
            }}
          >
            {showPass ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        </div>
        {errors.password && <div style={s.errorMsg}>⚠ {errors.password}</div>}
        {form.password.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 3,
                    background:
                      i <= passStrength
                        ? passColor[passStrength]
                        : "rgba(255,255,255,0.06)",
                    transition: "background 0.3s",
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: passColor[passStrength],
              }}
            >
              {passLabel[passStrength]}
            </span>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={s.label}>Confirm Password</label>
        <div style={{ position: "relative" }}>
          <span style={s.inputIcon}>
            <Icon.lock />
          </span>
          <input
            type={showConf ? "text" : "password"}
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
            style={{
              ...s.input,
              paddingRight: 44,
              borderColor: errors.confirmPassword
                ? "rgba(239,68,68,0.5)"
                : form.confirmPassword && form.password === form.confirmPassword
                  ? "rgba(16,185,129,0.4)"
                  : undefined,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#FF6B00";
              e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.confirmPassword
                ? "rgba(239,68,68,0.5)"
                : "rgba(255,255,255,0.07)";
              e.target.style.boxShadow = "none";
            }}
          />
          <button
            type="button"
            onClick={() => setShowConf(!showConf)}
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#555",
              display: "flex",
            }}
          >
            {showConf ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        </div>
        {errors.confirmPassword && (
          <div style={s.errorMsg}>⚠ {errors.confirmPassword}</div>
        )}
        {!errors.confirmPassword &&
          form.confirmPassword &&
          form.password === form.confirmPassword && (
            <div style={{ ...s.hint, color: "#10B981" }}>✓ Passwords match</div>
          )}
      </div>
    </div>
  );
}

// ─── STEP 2: BUSINESS ─────────────────────────────────────────
function StepBusiness({
  form,
  errors,
  agreed,
  setAgreed,
  set,
  clearError,
}: any) {
  return (
    <div className="step-anim">
      <div style={s.stepTag}>Step 2 of 3</div>
      <h2 style={s.stepTitle}>Your Business</h2>
      <p style={s.stepSub}>
        This is what customers see when they discover your store on SwiftNija.
      </p>

      <InputField
        label="Business / Store Name"
        placeholder="e.g. Mama T's Kitchen"
        icon={<Icon.store />}
        value={form.businessName}
        error={errors.businessName}
        onChange={(v) => set("businessName", v)}
      />
      <SelectField
        label="Business Category"
        placeholder="Select your category"
        options={CATEGORIES}
        icon={<Icon.tag />}
        value={form.category}
        error={errors.category}
        onChange={(v) => set("category", v)}
      />
      <VendorAddressField
        value={form.address}
        error={errors.address}
        onChange={(address, lat, lng) => {
          set("address", address);
          set("addressLat", String(lat));
          set("addressLng", String(lng));
        }}
      />
      <SelectField
        label="City"
        placeholder="Select your city"
        options={CITIES}
        icon={<Icon.pin />}
        value={form.city}
        error={errors.city}
        onChange={(v) => set("city", v)}
      />

      <div style={{ marginBottom: 20 }}>
        <label style={s.label}>
          Store Bio{" "}
          <span style={{ color: "#444", fontWeight: 600 }}>— optional</span>
        </label>
        <textarea
          value={form.bio}
          onChange={(e) => set("bio", e.target.value.slice(0, 120))}
          placeholder="Tell customers what makes your store special…"
          rows={3}
          style={
            {
              ...s.input,
              height: "auto",
              resize: "vertical",
              minHeight: 88,
              paddingLeft: 14,
              lineHeight: 1.5,
            } as React.CSSProperties
          }
          onFocus={(e) => {
            e.target.style.borderColor = "#FF6B00";
            e.target.style.boxShadow = "0 0 0 3px rgba(255,107,0,0.1)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(255,255,255,0.07)";
            e.target.style.boxShadow = "none";
          }}
        />
        <div
          style={{
            textAlign: "right",
            color: form.bio.length > 100 ? "#F59E0B" : "#444",
            fontSize: 11,
            marginTop: 4,
          }}
        >
          {form.bio.length}/120
        </div>
      </div>

      <div
        onClick={() => {
          setAgreed(!agreed);
          clearError("bio");
        }}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          cursor: "pointer",
          padding: "14px 16px",
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${errors.bio ? "rgba(239,68,68,0.3)" : agreed ? "rgba(255,107,0,0.25)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14,
          userSelect: "none",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            border: `2px solid ${agreed ? "#FF6B00" : "rgba(255,255,255,0.15)"}`,
            background: agreed ? "#FF6B00" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
            transition: "all 0.2s",
          }}
        >
          {agreed && <Icon.check />}
        </div>
        <span style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
          I agree to SwiftNija's{" "}
          <span style={{ color: "#FF6B00", fontWeight: 700 }}>
            Vendor Terms of Service
          </span>{" "}
          and{" "}
          <span style={{ color: "#FF6B00", fontWeight: 700 }}>
            Privacy Policy
          </span>
        </span>
      </div>
      {errors.bio && (
        <div style={s.errorMsg}>⚠ Please accept the terms to continue</div>
      )}
    </div>
  );
}

// ─── STEP 3: MEDIA ────────────────────────────────────────────
function StepMedia({ form, logoRef, coverRef, onImageChange }: any) {
  const UploadBox = ({ label, sub, fileKey, src, inputRef, height }: any) => (
    <div style={{ marginBottom: 24 }}>
      <label style={s.label}>{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: "100%",
          height,
          borderRadius: 16,
          border: `2px dashed ${src ? "rgba(255,107,0,0.4)" : "rgba(255,255,255,0.08)"}`,
          background: src ? "transparent" : "rgba(255,255,255,0.02)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          overflow: "hidden",
          position: "relative",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "#FF6B00";
          (e.currentTarget as HTMLDivElement).style.background =
            "rgba(255,107,0,0.04)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = src
            ? "rgba(255,107,0,0.4)"
            : "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLDivElement).style.background = src
            ? "transparent"
            : "rgba(255,255,255,0.02)";
        }}
      >
        {src ? (
          <>
            <img
              src={src}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                position: "absolute",
                inset: 0,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span style={{ color: "white" }}>
                <Icon.camera />
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.8)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Change photo
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "rgba(255,107,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FF6B00",
                marginBottom: 10,
              }}
            >
              <Icon.upload />
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Click to upload
            </div>
            <div style={{ color: "#444", fontSize: 11, marginTop: 3 }}>
              {sub}
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onImageChange(e, fileKey)
        }
      />
    </div>
  );

  return (
    <div className="step-anim">
      <div style={s.stepTag}>Step 3 of 3 — Optional</div>
      <h2 style={s.stepTitle}>Brand Your Store</h2>
      <p style={s.stepSub}>
        Stores with photos get{" "}
        <strong style={{ color: "#FF6B00" }}>3× more orders</strong>. You can
        also add these later in Settings.
      </p>
      <UploadBox
        label="Store Logo"
        sub="Square image · PNG or JPG · min 200×200"
        fileKey="logo"
        src={form.logo}
        inputRef={logoRef}
        height={140}
      />
      <UploadBox
        label="Cover / Shop Photo"
        sub="Landscape · 1200×600 recommended"
        fileKey="coverPhoto"
        src={form.coverPhoto}
        inputRef={coverRef}
        height={160}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          {
            icon: <Icon.star />,
            text: "Verified badge unlocks after approval (1-2 business days)",
          },
          {
            icon: <Icon.shield />,
            text: "Bank details collected separately via Paystack — fully encrypted",
          },
          {
            icon: <Icon.truck />,
            text: "You can start listing products immediately after sign-up",
          },
        ].map((tip, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 14px",
              background: "rgba(255,107,0,0.04)",
              borderRadius: 12,
            }}
          >
            <span style={{ color: "#FF6B00", flexShrink: 0, marginTop: 1 }}>
              {tip.icon}
            </span>
            <span style={{ color: "#666", fontSize: 12, lineHeight: 1.5 }}>
              {tip.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STEP 4: SUCCESS ──────────────────────────────────────────
function StepSuccess({ form }: { form: FormData }) {
  return (
    <div
      className="step-anim"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "20px 0 10px",
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            boxShadow:
              "0 0 0 16px rgba(255,107,0,0.08), 0 0 0 32px rgba(255,107,0,0.04)",
            animation: "successPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 30,
          fontWeight: 900,
          color: "white",
          lineHeight: 1.1,
          marginBottom: 12,
          animation: "fadeSlideUp 0.5s 0.3s ease both",
          opacity: 0,
        }}
      >
        Welcome to SwiftNija,
        <br />
        {form.fullName.split(" ")[0]}! 🎉
      </h2>
      <p
        style={{
          color: "#555",
          fontSize: 15,
          lineHeight: 1.6,
          maxWidth: 320,
          animation: "fadeSlideUp 0.5s 0.5s ease both",
          opacity: 0,
        }}
      >
        <strong style={{ color: "#FF6B00" }}>{form.businessName}</strong> is
        being set up. Taking you to your new dashboard now…
      </p>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 32,
          animation: "fadeSlideUp 0.5s 0.7s ease both",
          opacity: 0,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#FF6B00",
              animation: `dotPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function VendorAccount() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const logoRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormData>({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    category: "",
    address: "",
    addressLat: 0,
    addressLng: 0,
    city: "",
    bio: "",
    logo: null,
    coverPhoto: null,
  });

  const set = useCallback((k: keyof FormData, v: string | null) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  }, []);

  const clearError = useCallback((k: keyof FormData) => {
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  }, []);

  const handleImg = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, key: "logo" | "coverPhoto") => {
      const f = e.target.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => set(key, ev.target?.result as string);
      r.readAsDataURL(f);
    },
    [set],
  );

  const validate = (st: Step): boolean => {
    const e: Errors = {};
    if (st === 1) {
      if (!form.fullName.trim()) e.fullName = "Your full name is required";
      if (!form.phone.trim()) e.phone = "Phone number is required";
      else if (!/^[+\d\s\-()]{7,}$/.test(form.phone))
        e.phone = "Enter a valid phone number";
      if (!form.email.trim()) e.email = "Email address is required";
      else if (!/\S+@\S+\.\S+/.test(form.email))
        e.email = "Enter a valid email address";
      if (!form.password) e.password = "Password is required";
      else if (form.password.length < 8)
        e.password = "Minimum 8 characters required";
      if (form.password !== form.confirmPassword)
        e.confirmPassword = "Passwords don't match";
    }
    if (st === 2) {
      if (!form.businessName.trim())
        e.businessName = "Business name is required";
      if (!form.category) e.category = "Please select a category";
      if (!form.address.trim()) e.address = "Shop address is required";
      if (!form.city) e.city = "Please select your city";
      if (!agreed) e.bio = "You must agree to the terms";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (!validate(step)) return;
    setStep((s) => (s + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => (s - 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors({});

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password,
      );
      const user = userCredential.user;

      await updateProfile(user, { displayName: form.fullName.trim() });

      // ── Upload images to Firebase Storage, get back URLs ──
      async function uploadImage(
        base64: string,
        path: string,
      ): Promise<string> {
        const { getStorage, ref, uploadString, getDownloadURL } =
          await import("firebase/storage");
        const storage = getStorage();
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64, "data_url");
        return await getDownloadURL(storageRef);
      }

      let logoUrl: string | null = null;
      let coverUrl: string | null = null;

      if (form.logo) {
        logoUrl = await uploadImage(form.logo, `vendors/${user.uid}/logo`);
      }
      if (form.coverPhoto) {
        coverUrl = await uploadImage(
          form.coverPhoto,
          `vendors/${user.uid}/cover`,
        );
      }

      await setDoc(doc(db, "vendors", user.uid), {
        uid: user.uid,
        email: form.email.trim().toLowerCase(),
        fullName: form.fullName.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        addressLat: form.addressLat ?? 0,
        addressLng: form.addressLng ?? 0,
        city: form.city,
        category: form.category,
        bio: form.bio?.trim() || "",
        logo: logoUrl, // ← just a URL now, not base64
        coverPhoto: coverUrl, // ← just a URL now, not base64
        role: "vendor",
        verified: false,
        bankLinked: false,
        createdAt: new Date().toISOString(),
      });

      setStep(4);
      setTimeout(() => navigate("/vendor"), 2800);
    } catch (error: any) {
      console.error("Signup failed:", error.code, error.message);
      let msg = "Something went wrong — try again";
      if (error.code === "auth/email-already-in-use")
        msg = "This email is already registered. Try signing in instead.";
      else if (error.code === "auth/weak-password")
        msg = "Password too short — use 8+ characters";
      else if (error.code === "auth/invalid-email")
        msg = "Invalid email format";
      else if (error.code === "auth/network-request-failed")
        msg = "Network error. Check your connection and try again.";
      setErrors({ general: msg });
      setSubmitting(false);
    }
  };

  const progress = step <= 3 ? ((step - 1) / 3) * 100 : 100;

  const FEATURES = [
    { icon: <Icon.truck />, text: "Orders delivered in under 15 minutes" },
    { icon: <Icon.shield />, text: "Payouts protected by Paystack encryption" },
    { icon: <Icon.star />, text: "Verified store badge after approval" },
  ];
  const VENDOR_AVATARS = [
    { init: "T", bg: "#FF6B00" },
    { init: "K", bg: "#3B82F6" },
    { init: "F", bg: "#8B5CF6" },
    { init: "E", bg: "#10B981" },
    { init: "N", bg: "#F59E0B" },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#08080f",
        fontFamily: "'Nunito', sans-serif",
        color: "#ddd",
      }}
    >
      {/* ═══ LEFT PANEL ═══ */}
      <div
        style={{
          flex: "0 0 460px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        className="va-left"
      >
        <ParticleCanvas />
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 500,
            height: 500,
            background:
              "radial-gradient(circle, rgba(255,107,0,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,107,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,0,0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 10,
            padding: "44px 48px",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 56,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 28px rgba(255,107,0,0.4)",
                color: "white",
              }}
            >
              <Icon.zap />
            </div>
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 24,
                fontWeight: 900,
                color: "white",
                letterSpacing: "-0.5px",
              }}
            >
              swift<span style={{ color: "#FF6B00" }}>nija</span>
            </span>
          </div>

          {/* Badge + Headline */}
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,107,0,0.1)",
                border: "1px solid rgba(255,107,0,0.2)",
                borderRadius: 40,
                padding: "6px 16px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#FF6B00",
                  animation: "pulse 1.6s infinite",
                }}
              />
              <span
                style={{
                  color: "#FF6B00",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                }}
              >
                Open for new vendors
              </span>
            </div>
            <h1
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 40,
                fontWeight: 900,
                color: "white",
                lineHeight: 1.05,
                letterSpacing: "-1px",
                marginBottom: 16,
              }}
            >
              Sell to
              <br />
              <span style={{ color: "#FF6B00" }}>thousands</span>
              <br />
              across Nigeria.
            </h1>
            <p
              style={{
                color: "#555",
                fontSize: 15,
                lineHeight: 1.65,
                maxWidth: 300,
              }}
            >
              Set up your store in under 3 minutes. No setup fee. No monthly
              subscription.
            </p>
          </div>

          {/* Stat ticker */}
          <div style={{ marginBottom: 40 }}>
            <StatTicker />
          </div>

          {/* Features */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              marginBottom: 44,
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "rgba(255,107,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FF6B00",
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </div>
                <span style={{ color: "#666", fontSize: 13, fontWeight: 600 }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: "auto",
            }}
          >
            <div style={{ display: "flex", position: "relative", height: 38 }}>
              {VENDOR_AVATARS.map((a, i) => (
                <div
                  key={i}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "2.5px solid #08080f",
                    background: a.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: 800,
                    fontSize: 13,
                    position: "absolute",
                    left: i * 24,
                    top: 0,
                    zIndex: 5 - i,
                  }}
                >
                  {a.init}
                </div>
              ))}
            </div>
            <div style={{ marginLeft: 120 }}>
              <div style={{ color: "#555", fontSize: 12 }}>
                Joined this week
              </div>
              <div style={{ color: "#FF6B00", fontWeight: 800, fontSize: 13 }}>
                +128 new vendors
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "40px 24px",
          overflowY: "auto",
          background:
            "radial-gradient(ellipse 600px 400px at 60% 0%, rgba(255,107,0,0.04) 0%, transparent 70%)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 480 }}>
          {/* Step indicators */}
          {step < 4 && (
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                {["Account", "Business", "Branding"].map((label, i) => {
                  const n = i + 1;
                  const done = step > n;
                  const active = step === n;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 13,
                          transition: "all 0.3s",
                          background: done
                            ? "#FF6B00"
                            : active
                              ? "rgba(255,107,0,0.12)"
                              : "rgba(255,255,255,0.04)",
                          border: `2px solid ${done ? "#FF6B00" : active ? "#FF6B00" : "rgba(255,255,255,0.08)"}`,
                          color: done ? "white" : active ? "#FF6B00" : "#444",
                          boxShadow: active
                            ? "0 0 0 4px rgba(255,107,0,0.12)"
                            : "none",
                        }}
                      >
                        {done ? <Icon.check /> : n}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: active ? "#FF6B00" : done ? "#888" : "#444",
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  height: 3,
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "linear-gradient(90deg,#FF6B00,#FF8C00)",
                    borderRadius: 3,
                    transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Form card */}
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 24,
              padding: "36px 36px 28px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
            }}
          >
            {/* General error banner */}
            {errors.general && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 12,
                  marginBottom: 20,
                  animation: "fadeSlideUp 0.3s ease",
                }}
              >
                <span style={{ color: "#EF4444", flexShrink: 0 }}>
                  <Icon.alert />
                </span>
                <span
                  style={{ color: "#EF4444", fontSize: 13, fontWeight: 600 }}
                >
                  {errors.general}
                </span>
              </div>
            )}

            {step === 1 && (
              <StepPersonal
                form={form}
                errors={errors}
                set={set}
                showPass={showPass}
                setShowPass={setShowPass}
                showConf={showConf}
                setShowConf={setShowConf}
              />
            )}
            {step === 2 && (
              <StepBusiness
                form={form}
                errors={errors}
                set={set}
                agreed={agreed}
                setAgreed={setAgreed}
                clearError={clearError}
              />
            )}
            {step === 3 && (
              <StepMedia
                form={form}
                logoRef={logoRef}
                coverRef={coverRef}
                onImageChange={handleImg}
              />
            )}
            {step === 4 && <StepSuccess form={form} />}

            {/* Nav buttons */}
            {step < 4 && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 32,
                  alignItems: "center",
                }}
              >
                {step > 1 && (
                  <button
                    onClick={goBack}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "13px 20px",
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      color: "#666",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'Nunito', sans-serif",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(255,255,255,0.2)";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#aaa";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "rgba(255,255,255,0.09)";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#666";
                    }}
                  >
                    <Icon.arrowL /> Back
                  </button>
                )}
                <div style={{ flex: 1 }} />
                {step < 3 && (
                  <button
                    onClick={goNext}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "14px 30px",
                      borderRadius: 14,
                      background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
                      border: "none",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "'Nunito', sans-serif",
                      boxShadow: "0 6px 20px rgba(255,107,0,0.35)",
                      transition: "transform 0.15s, box-shadow 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform =
                        "translateY(-2px)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        "0 10px 28px rgba(255,107,0,0.5)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.transform =
                        "translateY(0)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow =
                        "0 6px 20px rgba(255,107,0,0.35)";
                    }}
                  >
                    Continue <Icon.arrowR />
                  </button>
                )}
                {step === 3 && (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "14px 28px",
                      borderRadius: 14,
                      background: submitting
                        ? "rgba(255,107,0,0.5)"
                        : "linear-gradient(135deg,#FF6B00,#FF8C00)",
                      border: "none",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: submitting ? "default" : "pointer",
                      fontFamily: "'Nunito', sans-serif",
                      boxShadow: "0 6px 24px rgba(255,107,0,0.4)",
                      transition: "all 0.2s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {submitting ? (
                      <>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            border: "2px solid rgba(255,255,255,0.3)",
                            borderTopColor: "white",
                            borderRadius: "50%",
                            animation: "spin 0.7s linear infinite",
                          }}
                        />{" "}
                        Creating your store…
                      </>
                    ) : (
                      <>
                        Launch My Store <Icon.arrowR />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {step < 4 && (
            <p
              style={{
                textAlign: "center",
                marginTop: 20,
                color: "#444",
                fontSize: 13,
              }}
            >
              Already a vendor?{" "}
              <span
                onClick={() => navigate("/vendor/login")}
                style={{ color: "#FF6B00", fontWeight: 800, cursor: "pointer" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.textDecoration = "underline")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.textDecoration = "none")
                }
              >
                Sign in to your dashboard
              </span>
            </p>
          )}
        </div>
      </div>

      <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #08080f; }

  @media (max-width: 860px) { .va-left { display: none !important; } }

  .step-anim { animation: fadeSlideUp 0.4s ease both; }

  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }
  @keyframes successPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes dotPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes tickerFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
  select option { background: #0f0f17; color: #ddd; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.2); border-radius: 4px; }

  /* ── Right panel responsive ── */
  .va-right {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 24px;
    overflow-y: auto;
    background: radial-gradient(ellipse 600px 400px at 60% 0%, rgba(255,107,0,0.04) 0%, transparent 70%);
    min-width: 0;
  }
  .va-right-inner {
    width: 100%;
    max-width: 480px;
  }

  /* ── Form card responsive padding ── */
  .va-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 24px;
    padding: 36px 36px 28px;
    backdrop-filter: blur(12px);
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  }

  /* ── Nav buttons — wrap on tiny screens ── */
  .va-nav-btns {
    display: flex;
    gap: 10px;
    margin-top: 32px;
    align-items: center;
    flex-wrap: wrap;
  }
  .va-btn-back {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 20px; border-radius: 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    color: #666; font-size: 14px; font-weight: 700;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.2s; white-space: nowrap;
  }
  .va-btn-next {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 30px; border-radius: 14px;
    background: linear-gradient(135deg,#FF6B00,#FF8C00);
    border: none; color: white; font-size: 14px; font-weight: 800;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    box-shadow: 0 6px 20px rgba(255,107,0,0.35);
    transition: transform 0.15s, box-shadow 0.15s;
    white-space: nowrap;
  }
  .va-btn-submit {
    display: flex; align-items: center; gap: 9px;
    padding: 14px 24px; border-radius: 14px;
    background: linear-gradient(135deg,#FF6B00,#FF8C00);
    border: none; color: white; font-size: 14px; font-weight: 800;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    box-shadow: 0 6px 24px rgba(255,107,0,0.4);
    transition: all 0.2s; white-space: nowrap;
  }
  .va-btn-submit:disabled { background: rgba(255,107,0,0.5); cursor: default; }

  @media (max-width: 600px) {
    .va-right { padding: 20px 16px; }
    .va-card { padding: 24px 18px 20px; border-radius: 18px; }
    .va-btn-next, .va-btn-submit { padding: 13px 18px; font-size: 13px; }
    .va-btn-back { padding: 13px 14px; font-size: 13px; }
  }
`}</style>
    </div>
  );
}
