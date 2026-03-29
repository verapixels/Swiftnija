// components/OtpModal.tsx
import { useState, useRef, useEffect } from "react";
import { FiX, FiMail, FiPhone, FiLock, FiRefreshCw } from "react-icons/fi";
import { Spinner } from "./SharedComponents";

type OtpModalProps = {
  title: string;
  subtitle: string;
  purpose: "email" | "phone" | "password";
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onClose: () => void;
};

export default function OtpModal({ title, subtitle, purpose, onVerify, onResend, onClose }: OtpModalProps) {
  const [digits, setDigits]     = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);
  const [countdown, setCountdown] = useState(60);
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleChange = (i: number, val: string) => {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError("");
    if (v && i < 5) refs[i + 1].current?.focus();
    if (!v && i > 0) refs[i - 1].current?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
    if (e.key === "Enter") handleSubmit();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      refs[5].current?.focus();
    }
  };

  const handleSubmit = async () => {
    const code = digits.join("");
    if (code.length < 6) { setError("Enter all 6 digits"); return; }
    setLoading(true);
    setError("");
    try {
      await onVerify(code);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Invalid code — try again");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResending(true);
    setError("");
    try {
      await onResend();
      setCountdown(60);
      setDigits(["", "", "", "", "", ""]);
      refs[0].current?.focus();
    } catch (err: any) {
      setError(err.message || "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  const PurposeIcon = purpose === "email" ? FiMail : purpose === "phone" ? FiPhone : FiLock;
  const purposeColor = purpose === "email" ? "#FF6B00" : purpose === "phone" ? "#3B82F6" : "#8B5CF6";

  return (
    <div className="vd-modal-overlay">
      <div className="vd-modal vd-modal-sm">
        {/* Header */}
        <div className="vd-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: `${purposeColor}18`, border: `1px solid ${purposeColor}30`, display: "flex", alignItems: "center", justifyContent: "center", color: purposeColor }}>
              <PurposeIcon size={18} />
            </div>
            <div>
              <div className="vd-modal-title" style={{ fontSize: 16 }}>{title}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Check your {purpose === "password" ? "email" : purpose}</div>
            </div>
          </div>
          <button className="vd-modal-close" onClick={onClose}><FiX size={16} /></button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
            <div style={{ color: "#10B981", fontWeight: 800, fontSize: 16 }}>Verified successfully!</div>
          </div>
        ) : (
          <>
            <p style={{ color: "var(--text3)", fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>{subtitle}</p>

            {/* OTP Digits */}
            <div className="vd-otp-row" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={refs[i]}
                  className="vd-otp-digit"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  autoFocus={i === 0}
                  style={{ borderColor: error ? "rgba(239,68,68,0.5)" : d ? purposeColor : undefined }}
                />
              ))}
            </div>

            {error && (
              <div style={{ color: "#EF4444", fontSize: 12, fontWeight: 600, textAlign: "center", marginBottom: 14 }}>
                ⚠ {error}
              </div>
            )}

            <button
              className="vd-btn-primary"
              onClick={handleSubmit}
              disabled={loading || digits.join("").length < 6}
              style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}
            >
              {loading ? <><Spinner size={16} /> Verifying…</> : "Verify Code"}
            </button>

            {/* Resend */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ color: "var(--text3)", fontSize: 12 }}>Didn't receive it?</span>
              <button
                onClick={handleResend}
                disabled={countdown > 0 || resending}
                style={{ background: "none", border: "none", color: countdown > 0 ? "var(--text3)" : "#FF6B00", fontSize: 12, fontWeight: 700, cursor: countdown > 0 ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
              >
                {resending ? <><FiRefreshCw size={12} className="vd-spin" /> Sending…</> : countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}