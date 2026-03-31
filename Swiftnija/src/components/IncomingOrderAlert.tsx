import { useState, useEffect, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useRiderSound } from "../hooks/useRiderSound";

const O = "#FF6B00";
const COUNTDOWN_SECONDS = 60;

type IncomingOrder = {
  orderId: string;
  vendorName: string;
  totalAmount: string;
  title?: string;
  body?: string;
};

type Props = {
  order: IncomingOrder;
  onDismiss: () => void;
};

export default function IncomingOrderAlert({ order, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [result, setResult] = useState<"accepted" | "rejected" | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { soundOn, toggleSound } = useRiderSound();

  // ── Sound: create once, loop until stopped ──────────────────────────────
  useEffect(() => {
    const audio = new Audio("/alert.mp3");
    audio.loop = true;
    audioRef.current = audio;

    if (soundOn) {
      // Resume AudioContext if suspended (browser autoplay policy)
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === "suspended") {
        ctx.resume().then(() => audio.play().catch(() => {}));
      } else {
        audio.play().catch(() => {});
      }
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []); // mount only

  // Toggle sound on/off when soundOn changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundOn) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [soundOn]);

  const stopSound = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  };

  // ── Countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          handleReject();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, []);

  const handleAccept = async () => {
    if (loading) return;
    clearInterval(timerRef.current!);
    stopSound();
    setLoading("accept");
    try {
      const fn = httpsCallable(functions, "acceptOrder");
      await fn({ orderId: order.orderId });
      setResult("accepted");
      setTimeout(onDismiss, 1800);
    } catch (err) {
      console.error("[IncomingOrderAlert] acceptOrder error:", err);
      setLoading(null);
    }
  };

  const handleReject = async () => {
    if (loading) return;
    clearInterval(timerRef.current!);
    stopSound();
    setLoading("reject");
    try {
      const fn = httpsCallable(functions, "rejectOrder");
      await fn({ orderId: order.orderId });
      setResult("rejected");
      setTimeout(onDismiss, 1200);
    } catch (err) {
      console.error("[IncomingOrderAlert] rejectOrder error:", err);
      setLoading(null);
    }
  };

  const RADIUS = 28;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = secondsLeft / COUNTDOWN_SECONDS;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isUrgent = secondsLeft <= 15;

  return (
    <>
      <style>{`
        @keyframes iao-slide-up {
          from { opacity:0; transform:translateY(60px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes iao-pulse-ring {
          0%,100% { transform:scale(1);    opacity:0.6; }
          50%     { transform:scale(1.18); opacity:0.2; }
        }
        @keyframes iao-urgent-flash {
          0%,100% { box-shadow: 0 -8px 60px rgba(255,107,0,0.25); }
          50%     { box-shadow: 0 -8px 80px rgba(239,68,68,0.5); }
        }
        .iao-card { animation: iao-slide-up 0.45s cubic-bezier(.34,1.3,.64,1) both; }
        .iao-urgent { animation: iao-urgent-flash 0.8s ease-in-out infinite; }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 0 24px",
      }}>
        <div
          className={`iao-card ${isUrgent ? "iao-urgent" : ""}`}
          style={{
            width: "100%", maxWidth: 440,
            background: "#111118",
            border: `1.5px solid ${isUrgent ? "rgba(239,68,68,0.4)" : "#1e1e2c"}`,
            borderRadius: 28,
            padding: "28px 24px 24px",
            margin: "0 16px",
            boxShadow: "0 -8px 60px rgba(255,107,0,0.25)",
            display: "flex", flexDirection: "column", gap: 22,
          }}
        >
          {result === "accepted" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: "#10B981" }}>
                Order Accepted!
              </div>
              <div style={{ fontSize: 13, color: "#66668a", marginTop: 6 }}>
                Head to {order.vendorName} to pick up
              </div>
            </div>
          )}

          {result === "rejected" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>❌</div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: "#ef4444" }}>
                {secondsLeft === 0 ? "Time's Up — Reassigning" : "Order Rejected"}
              </div>
            </div>
          )}

          {!result && (
            <>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      background: `${O}22`,
                      animation: "iao-pulse-ring 1.4s ease-in-out infinite",
                    }} />
                    <div style={{
                      position: "absolute", inset: 4, borderRadius: "50%",
                      background: `${O}18`, border: `2px solid ${O}55`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22,
                    }}>🏍️</div>
                  </div>
                  <div>
                    <div style={{
                      fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 800,
                      color: O, textTransform: "uppercase", letterSpacing: ".8px",
                    }}>New Order!</div>
                    <div style={{
                      fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900,
                      color: "#eeeef8", letterSpacing: "-.3px", marginTop: 2,
                    }}>
                      {order.vendorName || "Incoming Delivery"}
                    </div>
                  </div>
                </div>

                {/* Countdown ring */}
                <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
                  <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="34" cy="34" r={RADIUS} fill="none" stroke="#1e1e2c" strokeWidth="4" />
                    <circle
                      cx="34" cy="34" r={RADIUS} fill="none"
                      stroke={isUrgent ? "#ef4444" : O}
                      strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE}
                      strokeDashoffset={dashOffset}
                      style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                    />
                  </svg>
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column",
                  }}>
                    <span style={{
                      fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900,
                      color: isUrgent ? "#ef4444" : "#eeeef8",
                      lineHeight: 1, transition: "color 0.3s",
                    }}>{secondsLeft}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#44445a", letterSpacing: ".5px" }}>SEC</span>
                  </div>
                </div>
              </div>

              {/* Order details */}
              <div style={{
                background: "#16161f", border: "1px solid #1e1e2c",
                borderRadius: 18, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#66668a" }}>
                    <span>🏪</span>Pickup
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#eeeef8" }}>{order.vendorName || "—"}</span>
                </div>
                <div style={{ height: 1, background: "#1e1e2c" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#66668a" }}>
                    <span>💰</span>Earnings
                  </span>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: O }}>
                    {order.totalAmount ? `₦${Number(order.totalAmount).toLocaleString("en-NG")}` : "—"}
                  </span>
                </div>
              </div>

              {/* Sound toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2c",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#66668a" }}>
                  🔔 Alert sound
                </span>
                <button
                  onClick={toggleSound}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: soundOn ? "rgba(255,107,0,0.12)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${soundOn ? "rgba(255,107,0,0.3)" : "#2a2a3a"}`,
                    borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                    fontSize: 12, fontWeight: 700,
                    color: soundOn ? O : "#44445a",
                  }}
                >
                  {soundOn ? "🔊 On" : "🔇 Off"}
                </button>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={handleReject}
                  disabled={!!loading}
                  style={{
                    flex: 1, height: 56, borderRadius: 16,
                    background: "transparent", border: "1.5px solid #2a2a3a",
                    color: "#66668a", fontFamily: "'Syne',sans-serif",
                    fontSize: 15, fontWeight: 800,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    opacity: loading === "accept" ? 0.4 : 1, transition: "all 0.2s",
                  }}
                >
                  {loading === "reject" ? <Spinner color="#66668a" /> : <>❌ Reject</>}
                </button>

                <button
                  onClick={handleAccept}
                  disabled={!!loading}
                  style={{
                    flex: 2, height: 56, borderRadius: 16,
                    background: `linear-gradient(135deg, ${O}, #FF9A00)`,
                    border: "none", color: "#fff",
                    fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: `0 6px 24px rgba(255,107,0,0.45)`,
                    opacity: loading === "reject" ? 0.4 : 1, transition: "all 0.2s",
                  }}
                >
                  {loading === "accept" ? <Spinner color="white" /> : <>✅ Accept Order</>}
                </button>
              </div>

              {isUrgent && (
                <p style={{
                  textAlign: "center", fontSize: 12, fontWeight: 700,
                  color: "#ef4444", margin: "-8px 0 0",
                  animation: "iao-urgent-flash 0.8s ease-in-out infinite",
                }}>
                  ⚠️ Auto-reassigning in {secondsLeft}s
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin 0.7s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="3"
        strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}