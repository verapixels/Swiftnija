// pages/InternetCallPage.tsx
// Full-screen branded audio call page for customers.
// Uses Daily.co @daily-co/daily-js for audio, Firebase for queue,
// Firebase Storage for disclaimer + hold music.

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { auth, db } from "../firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import {
  RiPhoneFill,
  RiMicLine,
  RiMicOffLine,
  RiHeadphoneLine,
  RiUserLine,
  RiTimeLine,
  RiLoader4Line,
} from "react-icons/ri";

const ACCENT = "#FF6B00";
const functions = getFunctions();

// ── Types ─────────────────────────────────────────────────────────────────────
type CallPhase =
  | "init"          // checking auth, creating room
  | "disclaimer"    // playing recording disclaimer audio
  | "waiting"       // in queue, hold music playing
  | "connecting"    // agent joined, Daily connecting
  | "active"        // live call
  | "ended"         // call finished
  | "error";        // something went wrong

interface CallData {
  status: "waiting" | "active" | "ended";
  queuePosition: number;
  customerName: string;
  agentName?: string;
  agentId?: string;
  roomUrl?: string;
  customerToken?: string;
}

// ── Hold music loop using Web Audio API ───────────────────────────────────────
// We oscillate a soft sine tone so no external audio file is needed.
// If you have an MP3 in Firebase Storage, swap this for an <audio> element.
function useSoftTone(playing: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!playing) {
      gainRef.current?.gain.setTargetAtTime(0, gainRef.current.context.currentTime, 0.3);
      return;
    }
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Layer two soft oscillators for a gentle hold tone
      const makeOsc = (freq: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = vol;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        return { osc, gain };
      };

      const { gain: g1 } = makeOsc(261.63, 0.05); // C4
      const { gain: g2 } = makeOsc(329.63, 0.03); // E4
      gainRef.current = g1;

      // Slow fade in
      g1.gain.setValueAtTime(0, ctx.currentTime);
      g1.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5);
      g2.gain.setValueAtTime(0, ctx.currentTime);
      g2.gain.setTargetAtTime(0.03, ctx.currentTime, 1.5);
    } else {
      ctxRef.current.resume();
      gainRef.current?.gain.setTargetAtTime(0.05, ctxRef.current.currentTime, 0.5);
    }

    return () => {
      gainRef.current?.gain.setTargetAtTime(0, gainRef.current.context.currentTime, 0.3);
    };
  }, [playing]);

  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);
}

// ── Call timer hook ───────────────────────────────────────────────────────────
function useCallTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSecs(s => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InternetCallPage({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const c = {
    bg: dark ? "#08080f" : "#f2f2fa",
    surf: dark ? "#13131a" : "#ffffff",
    brd: dark ? "#1e1e2c" : "#e0e0ee",
    txt: dark ? "#eeeef8" : "#111118",
    sub: dark ? "#66668a" : "#7777a2",
    dim: dark ? "#30304a" : "#c0c0d8",
  };

  const [phase, setPhase] = useState<CallPhase>("init");
  const [callId, setCallId] = useState<string | null>(null);
  const [callData, setCallData] = useState<CallData | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [disclaimerDone, setDisclaimerDone] = useState(false);

  const callObj = useRef<DailyCall | null>(null);
  const callTimer = useCallTimer(phase === "active");

  // Hold music only plays while waiting
  useSoftTone(phase === "waiting");

  // ── Step 1: Create room on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) {
      setError("You must be signed in to start a call.");
      setPhase("error");
      return;
    }

    setPhase("init");
    const createRoom = httpsCallable<unknown, {
      success: boolean;
      callId: string;
      roomUrl: string;
      customerToken: string;
      queuePosition: number;
    }>(functions, "createSupportCallRoom");

    createRoom({})
      .then(res => {
        if (!res.data.success) throw new Error("Room creation failed");
        setCallId(res.data.callId);
        // Play disclaimer before entering queue
        setPhase("disclaimer");
      })
      .catch(err => {
        console.error("[InternetCallPage] createRoom error:", err);
        setError(err.message ?? "Could not start call. Please try again.");
        setPhase("error");
      });
  }, []);

  // ── Step 2: Disclaimer timer (5 seconds) ─────────────────────────────────
  useEffect(() => {
    if (phase !== "disclaimer") return;
    const t = setTimeout(() => {
      setDisclaimerDone(true);
      setPhase("waiting");
    }, 5000);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Step 3: Listen to Firestore for status changes ────────────────────────
  useEffect(() => {
    if (!callId) return;
    return onSnapshot(doc(db, "supportCalls", callId), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as CallData;
      setCallData(data);

      if (data.status === "active" && phase === "waiting") {
        setPhase("connecting");
      }
      if (data.status === "ended" && phase !== "ended") {
        setPhase("ended");
        cleanupDaily();
      }
    });
  }, [callId, phase]);

  // ── Step 4: Connect to Daily when agent joins ─────────────────────────────
  useEffect(() => {
    if (phase !== "connecting" || !callData?.roomUrl || !callData?.customerToken) return;

    const initDaily = async () => {
      try {
        // Destroy any existing instance first (fixes React StrictMode double-invoke)
        if (callObj.current) {
          try { await callObj.current.destroy(); } catch {}
          callObj.current = null;
        }

        // Also destroy any globally lingering Daily instance
        const existing = DailyIframe.getCallInstance();
        if (existing) {
          try { await existing.destroy(); } catch {}
        }

        const call = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: false,
        });
        callObj.current = call;

        call.on("joined-meeting", () => {
          setPhase("active");
        });

        call.on("left-meeting", () => {
          setPhase("ended");
          cleanupDaily();
        });

        call.on("error", (evt) => {
          console.error("[Daily] error:", evt);
          setError("Connection error. Please try again.");
          setPhase("error");
          cleanupDaily();
        });

        await call.join({
          url: callData.roomUrl,
          token: callData.customerToken,
          audioSource: true,
          videoSource: false,
        });
      } catch (err) {
        console.error("[InternetCallPage] Daily join error:", err);
        setError("Could not connect to call. Please check your microphone.");
        setPhase("error");
      }
    };

    initDaily();

    return () => {
      if (callObj.current) {
        callObj.current.destroy();
        callObj.current = null;
      }
    };
  }, [phase, callData]);
  
  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanupDaily = useCallback(() => {
    if (callObj.current) {
      callObj.current.destroy();
      callObj.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupDaily();
  }, [cleanupDaily]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!callObj.current) return;
    const next = !muted;
    callObj.current.setLocalAudio(!next);
    setMuted(next);
  }, [muted]);

  const endCall = useCallback(async () => {
    if (!callId) { onClose(); return; }
    try {
      cleanupDaily();
      const end = httpsCallable(functions, "endSupportCall");
      await end({ callId });
    } catch (e) {
      console.error("[InternetCallPage] endCall error:", e);
    }
    setPhase("ended");
  }, [callId, cleanupDaily, onClose]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const PhaseIcon = () => {
    if (phase === "init" || phase === "connecting")
      return <RiLoader4Line size={48} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />;
    if (phase === "waiting")
      return <RiTimeLine size={48} color={ACCENT} />;
    if (phase === "active")
      return <RiHeadphoneLine size={48} color={ACCENT} />;
    if (phase === "ended")
      return <RiPhoneFill size={48} color="#10B981" />;
    return <RiUserLine size={48} color={c.sub} />;
  };

  const PhaseTitle = () => {
    switch (phase) {
      case "init":       return "Setting up your call…";
      case "disclaimer": return "Before we connect you";
      case "waiting":    return "You are in the queue";
      case "connecting": return "Agent is joining…";
      case "active":     return `Connected to ${callData?.agentName ?? "Support"}`;
      case "ended":      return "Call ended";
      case "error":      return "Something went wrong";
    }
  };

  const PhaseSubtitle = () => {
    switch (phase) {
      case "init":       return "Connecting to support…";
      case "disclaimer": return "This call may be recorded for quality assurance.";
      case "waiting":    return callData
        ? `You are number ${callData.queuePosition} in the queue. Please hold.`
        : "Finding the next available agent…";
      case "connecting": return "Please wait a moment…";
      case "active":     return callTimer;
      case "ended":      return "Thank you for contacting Swift9ja support.";
      case "error":      return error;
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ic-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: c.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "ic-in .35s ease",
      }}>

        {/* Brand header */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${c.brd}`,
          background: c.surf,
        }}>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 20, fontWeight: 900,
            color: c.txt,
          }}>
            swift<span style={{ color: ACCENT }}>9ja</span>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 800,
            color: ACCENT,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}>
            Customer Support
          </div>
        </div>

        {/* Main card */}
        <div style={{
          background: c.surf,
          border: `1.5px solid ${c.brd}`,
          borderRadius: 28,
          padding: "48px 40px",
          width: "100%", maxWidth: 420,
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        }}>

          {/* Icon with pulse ring when active */}
          <div style={{ position: "relative", display: "inline-flex", marginBottom: 24 }}>
            {phase === "active" && (
              <div style={{
                position: "absolute", inset: -8,
                borderRadius: "50%",
                border: `2px solid ${ACCENT}`,
                animation: "pulse-ring 1.5s ease-out infinite",
              }} />
            )}
            <div style={{
              width: 96, height: 96,
              borderRadius: "50%",
              background: phase === "active"
                ? `rgba(255,107,0,0.12)`
                : phase === "ended"
                ? "rgba(16,185,129,0.12)"
                : `rgba(255,107,0,0.08)`,
              border: `2px solid ${phase === "ended" ? "rgba(16,185,129,0.3)" : "rgba(255,107,0,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PhaseIcon />
            </div>
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 22, fontWeight: 900,
            color: c.txt,
            marginBottom: 8,
            lineHeight: 1.3,
          }}>
            <PhaseTitle />
          </div>

          {/* Subtitle */}
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: phase === "active" ? ACCENT : c.sub,
            marginBottom: 32,
            lineHeight: 1.6,
          }}>
            <PhaseSubtitle />
          </div>

          {/* Disclaimer badge */}
          {phase === "disclaimer" && (
            <div style={{
              background: "rgba(255,107,0,0.06)",
              border: "1.5px solid rgba(255,107,0,0.2)",
              borderRadius: 14, padding: "16px 20px",
              marginBottom: 28,
              fontSize: 13, fontWeight: 600,
              color: c.sub, lineHeight: 1.7,
            }}>
              By continuing, you consent to this call being recorded
              for quality and training purposes.
            </div>
          )}

          {/* Queue info */}
          {phase === "waiting" && callData && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, marginBottom: 28,
              background: "rgba(255,107,0,0.06)",
              border: "1.5px solid rgba(255,107,0,0.15)",
              borderRadius: 14, padding: "14px 20px",
            }}>
              <RiTimeLine size={18} color={ACCENT} />
              <span style={{ fontSize: 15, fontWeight: 800, color: c.txt }}>
                Position {callData.queuePosition} in queue
              </span>
            </div>
          )}

          {/* Active call controls */}
          {phase === "active" && (
            <div style={{
              display: "flex", gap: 16,
              alignItems: "center", justifyContent: "center",
              marginBottom: 8,
            }}>
              {/* Mute toggle */}
              <button
                onClick={toggleMute}
                style={{
                  width: 64, height: 64,
                  borderRadius: "50%",
                  border: `2px solid ${muted ? "rgba(239,68,68,0.4)" : c.brd}`,
                  background: muted ? "rgba(239,68,68,0.1)" : c.surf,
                  color: muted ? "#EF4444" : c.sub,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .2s",
                  fontSize: 0,
                }}
              >
                {muted ? <RiMicOffLine size={24} /> : <RiMicLine size={24} />}
              </button>

              {/* End call */}
              <button
                onClick={endCall}
                style={{
                  width: 80, height: 80,
                  borderRadius: "50%",
                  border: "none",
                  background: "linear-gradient(135deg,#EF4444,#DC2626)",
                  color: "white",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 6px 20px rgba(239,68,68,0.4)",
                  transition: "transform .15s",
                  fontSize: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
              >
                <RiPhoneFill size={28} style={{ transform: "rotate(135deg)" }} />
              </button>
            </div>
          )}

          {/* Cancel / Close buttons for non-active phases */}
          {(phase === "waiting" || phase === "disclaimer") && (
            <button
              onClick={endCall}
              style={{
                width: "100%", padding: "13px",
                borderRadius: 14,
                border: `1.5px solid ${c.brd}`,
                background: "transparent",
                color: c.sub, fontWeight: 700,
                cursor: "pointer", fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Cancel
            </button>
          )}

          {(phase === "ended" || phase === "error") && (
            <button
              onClick={onClose}
              style={{
                width: "100%", padding: "13px",
                borderRadius: 14,
                border: "none",
                background: `linear-gradient(135deg,${ACCENT},#FF8C00)`,
                color: "white", fontWeight: 800,
                cursor: "pointer", fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 6px 20px rgba(255,107,0,0.3)",
              }}
            >
              {phase === "ended" ? "Done" : "Try Again"}
            </button>
          )}
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: 24, fontSize: 12,
          color: c.sub, fontWeight: 600,
          textAlign: "center",
        }}>
          Audio only · Secured by Daily.co WebRTC
        </div>
      </div>
    </>
  );
}