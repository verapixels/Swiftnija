// pages/InternetCallPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { auth, db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import {
  RiPhoneFill, RiMicLine, RiMicOffLine,
  RiHeadphoneLine, RiUserLine, RiTimeLine, RiLoader4Line,
  RiStarFill, RiStarLine,
} from "react-icons/ri";

const ACCENT = "#FF6B00";
const functions = getFunctions(undefined, "us-central1");
const storage = getStorage();

type CallPhase =
  | "init" | "greeting" | "waiting" | "connecting"
  | "active" | "hold" | "ended" | "rating" | "error";

interface CallData {
  status: "waiting" | "active" | "ended" | "hold";
  queuePosition: number;
  customerName: string;
  agentName?: string;
  agentId?: string;
  roomUrl?: string;
  customerToken?: string;
}

// ── Brand name fix ─────────────────────────────────────────────────────────────
function fixBrandName(text: string): string {
  return text
    .replace(/swift\s*9ja/gi,  "Swift Naija")
    .replace(/swiftnija/gi,    "Swift Naija")
    .replace(/swift9ja/gi,     "Swift Naija")
    .replace(/swift\s*nija/gi, "Swift Naija");
}

// ── speak() — guaranteed to resolve, never hangs ──────────────────────────────
function speak(text: string, rate = 0.88, pitch = 1.05): Promise<void> {
  return new Promise(resolve => {
    const hardTimeout = setTimeout(() => resolve(), 5000);
    const done = () => { clearTimeout(hardTimeout); resolve(); };

    if (!window.speechSynthesis) { done(); return; }
    try { window.speechSynthesis.cancel(); } catch { /**/ }

    const trySpeak = () => {
      const utt   = new SpeechSynthesisUtterance(fixBrandName(text));
      utt.rate    = rate;
      utt.pitch   = pitch;
      utt.volume  = 1;
      utt.onend   = done;
      utt.onerror = done;

      const voices = window.speechSynthesis.getVoices();
      const voice  =
        voices.find(v => v.lang === "en-NG")                                                  ||
        voices.find(v => v.lang === "en-GH")                                                  ||
        voices.find(v => v.lang === "en-ZA" && !v.name.toLowerCase().includes("male"))        ||
        voices.find(v => v.name === "Google UK English Female")                               ||
        voices.find(v => v.name === "Microsoft Zira Desktop - English (United States)")       ||
        voices.find(v => v.name === "Samantha")                                               ||
        voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en")) ||
        voices.find(v => v.lang === "en-GB" && !v.name.toLowerCase().includes("male"))        ||
        voices.find(v => v.lang.startsWith("en"));

      if (voice) utt.voice = voice;
      try { window.speechSynthesis.speak(utt); } catch { done(); }
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      trySpeak();
    } else {
      const fallback = setTimeout(trySpeak, 800);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(fallback);
        window.speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
    }
  });
}

// ── speakAll() — cancelled immediately when cancelledRef is set ───────────────
// This is the KEY fix: every sentence checks cancelledRef before speaking.
// When user cancels, we set cancelledRef.current = true and call
// speechSynthesis.cancel() — the loop sees the flag and stops immediately.
async function speakAll(lines: string[], cancelledRef: React.MutableRefObject<boolean>): Promise<void> {
  for (const line of lines) {
    if (cancelledRef.current) return; // ← stop immediately if cancelled
    await speak(line);
    if (cancelledRef.current) return; // ← stop immediately after each line too
    await new Promise(r => setTimeout(r, 350));
  }
}

// ── Jingle ────────────────────────────────────────────────────────────────────
async function createJingle(): Promise<HTMLAudioElement | null> {
  try {
    const r     = ref(storage, "support-audio/hold-jingle.mp3.mp4");
    const url   = await getDownloadURL(r);
    const audio = new Audio(url);
    audio.loop   = true;
    audio.volume = 0.45;
    audio.addEventListener("canplay", () => {
      if (audio.currentTime === 0) audio.currentTime = 3;
    }, { once: true });
    return audio;
  } catch {
    return null;
  }
}

// ── Call timer ────────────────────────────────────────────────────────────────
function useCallTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({
  agentName, callId, onDone, dark, c,
}: {
  agentName: string;
  callId: string;
  onDone: () => void;
  dark: boolean;
  c: Record<string, string>;
}) {
  const [hovered,    setHovered]    = useState(0);
  const [selected,   setSelected]   = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  const submit = async (star: number) => {
    setSelected(star);
    setSubmitting(true);
    try {
      const rate = httpsCallable(functions, "rateSupportCall");
      await rate({ callId, rating: star });
    } catch { /* silent fail */ }
    setSubmitted(true);
    setSubmitting(false);
    setTimeout(onDone, 1600);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: dark ? "#08080f" : "#f2f2fa",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      animation: "ic-in .3s ease",
    }}>
      <style>{`@keyframes ic-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{
        background: c.surf, border: `1.5px solid ${c.brd}`,
        borderRadius: 28, padding: "40px 36px",
        width: "100%", maxWidth: 400, textAlign: "center",
        boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "rgba(255,107,0,0.08)", border: "2px solid rgba(255,107,0,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <RiHeadphoneLine size={34} color={ACCENT} />
        </div>

        {submitted ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, marginBottom: 8 }}>
              Thank you!
            </div>
            <div style={{ fontSize: 13, color: c.sub }}>Your feedback helps us serve you better.</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, marginBottom: 8 }}>
              Rate your experience
            </div>
            <div style={{ fontSize: 13, color: c.sub, marginBottom: 28 }}>
              How was your call with <strong style={{ color: c.txt }}>{agentName}</strong>?
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => !submitting && submit(star)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    transform: (hovered || selected) >= star ? "scale(1.25)" : "scale(1)",
                    transition: "transform 0.15s",
                  }}
                >
                  {(hovered || selected) >= star
                    ? <RiStarFill size={36} color={ACCENT} />
                    : <RiStarLine size={36} color={c.dim} />}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, minHeight: 20 }}>
              {labels[hovered || selected] || "Tap a star to rate"}
            </div>
            <button
              onClick={onDone}
              style={{
                marginTop: 20, width: "100%", padding: "11px",
                borderRadius: 12, background: "transparent",
                border: `1px solid ${c.brd}`,
                color: c.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function InternetCallPage({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const c = {
    bg:   dark ? "#08080f" : "#f2f2fa",
    surf: dark ? "#13131a" : "#ffffff",
    brd:  dark ? "#1e1e2c" : "#e0e0ee",
    txt:  dark ? "#eeeef8" : "#111118",
    sub:  dark ? "#66668a" : "#7777a2",
    dim:  dark ? "#30304a" : "#c0c0d8",
  };

  const [phase,        setPhase]        = useState<CallPhase>("init");
  const [callId,       setCallId]       = useState<string | null>(null);
  const [callData,     setCallData]     = useState<CallData | null>(null);
  const [muted,        setMuted]        = useState(false);
  const [error,        setError]        = useState("");
  const [lastQueuePos, setLastQueuePos] = useState<number | null>(null);
  const [greetingStarted, setGreetingStarted] = useState(false);

  const callObj       = useRef<DailyCall | null>(null);
  const jingleRef     = useRef<HTMLAudioElement | null>(null);
  const dailyJoined   = useRef(false);
  const phaseRef      = useRef<CallPhase>("init");
  const callTimer     = useCallTimer(phase === "active");

  // ── THE FIX: this ref is shared between greeting loop and endCall ──────────
  // When user cancels, we set this to true — speakAll() checks it before
  // every sentence and stops immediately. Speech also gets hard-cancelled.
  const speechCancelled = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── stopAllSpeech — call this any time you want silence immediately ─────────
  const stopAllSpeech = useCallback(() => {
    speechCancelled.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /**/ }
  }, []);

  // ── Queue speech ────────────────────────────────────────────────────────────
  const buildQueueSpeech = (pos: number) => {
    const mins = Math.max(1, pos);
    return (
      `You are number ${pos} in the queue. ` +
      `Your estimated wait time is approximately ${mins} ${mins === 1 ? "minute" : "minutes"}. ` +
      `Please stay on the line and we will connect you to an agent shortly.`
    );
  };

  // ── Jingle controls ─────────────────────────────────────────────────────────
  const startJingle = useCallback(async () => {
    if (jingleRef.current) return;
    const audio = await createJingle();
    if (!audio) return;
    jingleRef.current = audio;
    try { await audio.play(); } catch (e) { console.warn("[Jingle]", e); }
  }, []);

  const stopJingle = useCallback(() => {
    if (!jingleRef.current) return;
    jingleRef.current.pause();
    jingleRef.current.src = "";
    jingleRef.current = null;
  }, []);

  const pauseJingle  = useCallback(() => { jingleRef.current?.pause(); }, []);
  const resumeJingle = useCallback(() => { jingleRef.current?.play().catch(() => {}); }, []);

  const announceQueue = useCallback(async (pos: number) => {
    pauseJingle();
    await speak(buildQueueSpeech(pos));
    resumeJingle();
  }, [pauseJingle, resumeJingle]);

  // ── STEP 1: Create room ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) {
      setError("You must be signed in to start a call.");
      setPhase("error");
      return;
    }
    const createRoom = httpsCallable<unknown, {
      success: boolean; callId: string; queuePosition: number;
    }>(functions, "createSupportCallRoom");

    createRoom({})
      .then(res => {
        if (!res.data.success) throw new Error("Room creation failed");
        setCallId(res.data.callId);
        setPhase("greeting");
      })
      .catch(err => {
        setError(err.message ?? "Could not start call.");
        setPhase("error");
      });
  }, []);

  // ── STEP 2: Voice greeting ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "greeting" || greetingStarted) return;
    setGreetingStarted(true);

    // Reset cancel flag for this new greeting session
    speechCancelled.current = false;

    const runGreeting = async () => {
      const overallCap = setTimeout(() => {
        if (!speechCancelled.current) {
          setPhase("waiting");
          startJingle();
        }
      }, 25000);

      try {
        const h   = new Date().getHours();
        const tod =
          h >= 5  && h < 12 ? "Good morning" :
          h >= 12 && h < 17 ? "Good afternoon" :
          "Good evening";

        const pos  = callData?.queuePosition ?? 1;
        const mins = Math.max(1, pos);

        // Pass speechCancelled ref — loop stops the moment user cancels
        await speakAll([
          `${tod}! Welcome to Swift Naija Customer Support.`,
          "Please note that this call is being recorded for quality assurance and training purposes.",
          `You are number ${pos} in the queue.`,
          `Your estimated wait time is approximately ${mins} ${mins === 1 ? "minute" : "minutes"}.`,
          "Please stay on the line and we will connect you to an agent shortly.",
        ], speechCancelled);

        if (!speechCancelled.current) {
          setLastQueuePos(pos);
        }
      } catch (e) {
        console.error("[Greeting]", e);
      } finally {
        clearTimeout(overallCap);
        // Only move to waiting if not cancelled
        if (!speechCancelled.current) {
          setPhase("waiting");
          startJingle();
        }
      }
    };

    runGreeting();
  }, [phase, greetingStarted]);

  // ── STEP 3: Firestore listener ──────────────────────────────────────────────
  useEffect(() => {
    if (!callId) return;

    return onSnapshot(doc(db, "supportCalls", callId), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as CallData;
      setCallData(data);
      const cur = phaseRef.current;

      if (
        data.status === "active" &&
        !dailyJoined.current &&
        (cur === "waiting" || cur === "greeting" || cur === "hold")
      ) {
        stopJingle();
        stopAllSpeech();
        setPhase("connecting");
      }

      if (data.status === "hold" && cur === "active") {
        setPhase("hold");
        startJingle();
        speak("Please hold on, your agent will be back with you shortly.");
      }

      if (data.status === "active" && cur === "hold" && dailyJoined.current) {
        stopJingle();
        stopAllSpeech();
        setPhase("active");
        speechCancelled.current = false;
        setTimeout(() => speak("Your agent has returned. Thank you for holding."), 500);
      }

      if (data.status === "ended" && cur !== "ended" && cur !== "rating") {
        stopJingle();
        stopAllSpeech();
        cleanupDaily();
        setPhase("rating");
      }
    });
  }, [callId]);

  // ── STEP 4: Re-announce queue position ─────────────────────────────────────
  useEffect(() => {
    if (phase !== "waiting" || !callData) return;
    const pos = callData.queuePosition;
    if (lastQueuePos !== null && pos !== lastQueuePos) {
      setLastQueuePos(pos);
      announceQueue(pos);
    }
  }, [callData?.queuePosition, phase]);

  // ── STEP 5: Connect Daily ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "connecting" || !callData?.roomUrl || !callData?.customerToken) return;

    const initDaily = async () => {
      try {
        if (callObj.current) {
          try { await callObj.current.destroy(); } catch { /**/ }
          callObj.current = null;
        }
        try {
          const existing = DailyIframe.getCallInstance();
          if (existing) await existing.destroy();
        } catch { /**/ }

        const call = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: false,
        });
        callObj.current = call;

        call.on("joined-meeting", () => {
          dailyJoined.current = true;
          speechCancelled.current = false;
          setPhase("active");
          setTimeout(() =>
            speak("You are now connected to a Swift Naija support agent. How can we help you today?"),
          800);
        });

        call.on("left-meeting", () => {
          if (phaseRef.current !== "rating" && phaseRef.current !== "ended") {
            dailyJoined.current = false;
            stopJingle();
            stopAllSpeech();
            setPhase("rating");
            cleanupDaily();
          }
        });

        call.on("error", () => {
          setError("Connection error. Please try again.");
          setPhase("error");
          cleanupDaily();
        });

        await call.join({
          url:         callData.roomUrl,
          token:       callData.customerToken,
          audioSource: true,
          videoSource: false,
        });
      } catch {
        setError("Could not connect. Please check your microphone.");
        setPhase("error");
      }
    };

    initDaily();
  }, [phase]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  const cleanupDaily = useCallback(() => {
    if (callObj.current) {
      callObj.current.destroy().catch(() => {});
      callObj.current = null;
    }
    dailyJoined.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopJingle();
      stopAllSpeech();
      cleanupDaily();
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!callObj.current) return;
    const next = !muted;
    callObj.current.setLocalAudio(!next);
    setMuted(next);
  }, [muted]);

  const endCall = useCallback(async () => {
    // Stop ALL speech and jingle immediately — first thing
    stopAllSpeech();
    stopJingle();
    cleanupDaily();

    if (callId) {
      try {
        const end = httpsCallable(functions, "endSupportCall");
        await end({ callId });
      } catch (e) { console.error(e); }
    }

    if (phase === "active" || phase === "hold") {
      setPhase("rating");
    } else {
      setPhase("ended");
    }
  }, [callId, phase, cleanupDaily, stopJingle, stopAllSpeech]);

  // ── Rating screen ───────────────────────────────────────────────────────────
  if (phase === "rating") {
    return (
      <StarRating
        agentName={callData?.agentName ?? "our agent"}
        callId={callId ?? ""}
        onDone={onClose}
        dark={dark}
        c={c}
      />
    );
  }

  // ── Phase helpers ───────────────────────────────────────────────────────────
  const PhaseIcon = () => {
    if (phase === "init" || phase === "connecting")
      return <RiLoader4Line size={48} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />;
    if (phase === "greeting" || phase === "waiting")
      return <RiTimeLine size={48} color={ACCENT} />;
    if (phase === "active")
      return <RiHeadphoneLine size={48} color={ACCENT} />;
    if (phase === "hold")
      return <RiTimeLine size={48} color="#F59E0B" />;
    if (phase === "ended")
      return <RiPhoneFill size={48} color="#10B981" />;
    return <RiUserLine size={48} color={c.sub} />;
  };

  const phaseTitle: Record<CallPhase, string> = {
    init:       "Setting up your call…",
    greeting:   "Welcome to Swift9ja Support",
    waiting:    "You are in the queue",
    connecting: "Connecting to agent…",
    active:     `Connected to ${callData?.agentName ?? "Support"}`,
    hold:       "You are on hold",
    ended:      "Call ended",
    rating:     "",
    error:      "Something went wrong",
  };

  const phaseSubtitle: Record<CallPhase, string> = {
    init:       "Please wait…",
    greeting:   "Please listen to the following information…",
    waiting:    callData
      ? `Position ${callData.queuePosition} in queue`
      : "Finding the next available agent…",
    connecting: "Please wait a moment…",
    active:     callTimer,
    hold:       "Your agent will be back shortly…",
    ended:      "Thank you for contacting Swift9ja support.",
    rating:     "",
    error:      error,
  };

  const ringColor =
    phase === "active" ? ACCENT :
    phase === "hold"   ? "#F59E0B" : null;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        @keyframes ic-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes hold-blink {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.4; }
        }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: c.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "ic-in .35s ease",
      }}>
        {/* Header */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${c.brd}`, background: c.surf,
        }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt }}>
            swift<span style={{ color: ACCENT }}>9ja</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: 1 }}>
            Customer Support
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: c.surf,
          border: `1.5px solid ${phase === "hold" ? "rgba(245,158,11,0.35)" : c.brd}`,
          borderRadius: 28, padding: "48px 40px",
          width: "100%", maxWidth: 420, textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        }}>
          {/* Icon with ring */}
          <div style={{ position: "relative", display: "inline-flex", marginBottom: 24 }}>
            {ringColor && (
              <div style={{
                position: "absolute", inset: -8, borderRadius: "50%",
                border: `2px solid ${ringColor}`,
                animation: "pulse-ring 1.5s ease-out infinite",
              }} />
            )}
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              background:
                phase === "active" ? "rgba(255,107,0,0.12)" :
                phase === "hold"   ? "rgba(245,158,11,0.12)" :
                phase === "ended"  ? "rgba(16,185,129,0.12)" :
                "rgba(255,107,0,0.08)",
              border: `2px solid ${
                phase === "active" ? "rgba(255,107,0,0.2)" :
                phase === "hold"   ? "rgba(245,158,11,0.3)" :
                phase === "ended"  ? "rgba(16,185,129,0.3)" :
                "rgba(255,107,0,0.2)"
              }`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PhaseIcon />
            </div>
          </div>

          <div style={{
            fontFamily: "'Syne',sans-serif", fontSize: 22,
            fontWeight: 900, color: c.txt, marginBottom: 8, lineHeight: 1.3,
          }}>
            {phaseTitle[phase]}
          </div>

          <div style={{
            fontSize: 14, fontWeight: 600,
            color:
              phase === "active" ? ACCENT :
              phase === "hold"   ? "#F59E0B" : c.sub,
            marginBottom: 32, lineHeight: 1.6,
            animation: phase === "hold" ? "hold-blink 2s ease infinite" : "none",
          }}>
            {phaseSubtitle[phase]}
          </div>

          {/* Queue badge */}
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

          {/* Hold badge */}
          {phase === "hold" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, marginBottom: 28,
              background: "rgba(245,158,11,0.06)",
              border: "1.5px solid rgba(245,158,11,0.2)",
              borderRadius: 14, padding: "14px 20px",
            }}>
              <RiTimeLine size={18} color="#F59E0B" />
              <span style={{ fontSize: 14, fontWeight: 700, color: c.txt }}>
                🎵 Hold music is playing…
              </span>
            </div>
          )}

          {/* Active controls */}
          {phase === "active" && (
            <div style={{
              display: "flex", gap: 16,
              alignItems: "center", justifyContent: "center",
              marginBottom: 8,
            }}>
              <button onClick={toggleMute} style={{
                width: 64, height: 64, borderRadius: "50%",
                border: `2px solid ${muted ? "rgba(239,68,68,0.4)" : c.brd}`,
                background: muted ? "rgba(239,68,68,0.1)" : c.surf,
                color: muted ? "#EF4444" : c.sub,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .2s", fontSize: 0,
              }}>
                {muted ? <RiMicOffLine size={24} /> : <RiMicLine size={24} />}
              </button>
              <button onClick={endCall} style={{
                width: 80, height: 80, borderRadius: "50%", border: "none",
                background: "linear-gradient(135deg,#EF4444,#DC2626)",
                color: "white", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 6px 20px rgba(239,68,68,0.4)", fontSize: 0,
              }}>
                <RiPhoneFill size={28} style={{ transform: "rotate(135deg)" }} />
              </button>
            </div>
          )}

          {/* On hold */}
          {phase === "hold" && (
            <button onClick={endCall} style={{
              width: "100%", padding: "13px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#EF4444,#DC2626)",
              color: "white", fontWeight: 800, cursor: "pointer",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 6px 20px rgba(239,68,68,0.3)",
            }}>
              End Call
            </button>
          )}

          {/* Waiting / greeting */}
          {(phase === "waiting" || phase === "greeting") && (
            <button onClick={endCall} style={{
              width: "100%", padding: "13px", borderRadius: 14,
              border: `1.5px solid ${c.brd}`, background: "transparent",
              color: c.sub, fontWeight: 700, cursor: "pointer",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
            }}>
              Cancel
            </button>
          )}

          {/* Ended / error */}
          {(phase === "ended" || phase === "error") && (
            <button onClick={onClose} style={{
              width: "100%", padding: "13px", borderRadius: 14, border: "none",
              background: `linear-gradient(135deg,${ACCENT},#FF8C00)`,
              color: "white", fontWeight: 800, cursor: "pointer",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 6px 20px rgba(255,107,0,0.3)",
            }}>
              {phase === "ended" ? "Done" : "Try Again"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: c.sub, fontWeight: 600, textAlign: "center" }}>
          Audio only · Secured by Daily.co WebRTC
        </div>
      </div>
    </>
  );
}