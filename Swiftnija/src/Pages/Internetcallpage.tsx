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
  RiStarFill, RiStarLine, RiSettings3Line, RiCloseLine,
  RiVolumeUpLine, RiCheckLine, RiArrowDownSLine,
} from "react-icons/ri";

const ACCENT = "#FF6B00";
const functions = getFunctions(undefined, "us-central1");
const storage = getStorage();

type CallPhase =
  | "init" | "tap_to_start" | "greeting" | "waiting" | "connecting"
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

interface AudioDevice {
  deviceId: string;
  label: string;
}

// ── Remote audio management ──────────────────────────────────────────────────
const remoteAudioElements = new Map<string, HTMLAudioElement>();

function attachRemoteAudio(
  participantId: string,
  track: MediaStreamTrack,
  speakerDeviceId?: string
) {
  let el = remoteAudioElements.get(participantId);
  if (!el) {
    el = document.createElement("audio");
    el.autoplay = true;
    el.setAttribute("playsinline", "true");
    document.body.appendChild(el);
    remoteAudioElements.set(participantId, el);
  }
  el.srcObject = new MediaStream([track]);
  if (speakerDeviceId && typeof (el as any).setSinkId === "function") {
    (el as any).setSinkId(speakerDeviceId).catch(() => {});
  }
  el.play().catch(err => console.warn("[Customer Audio] play failed:", err));
}

function removeRemoteAudio(participantId: string) {
  const el = remoteAudioElements.get(participantId);
  if (el) { el.srcObject = null; el.remove(); remoteAudioElements.delete(participantId); }
}

function removeAllRemoteAudio() {
  remoteAudioElements.forEach((_, id) => removeRemoteAudio(id));
}

function applyNewSpeakerToAll(speakerDeviceId: string) {
  remoteAudioElements.forEach(el => {
    if (typeof (el as any).setSinkId === "function") {
      (el as any).setSinkId(speakerDeviceId).catch(() => {});
    }
  });
}

// ── Play a Firebase Storage audio file ───────────────────────────────────────
async function playStorageAudio(
  path: string,
  cancelledRef: React.MutableRefObject<boolean>
): Promise<void> {
  return new Promise(async resolve => {
    if (cancelledRef.current) { resolve(); return; }
    const timeout = setTimeout(() => resolve(), 7000);
    const done = () => { clearTimeout(timeout); resolve(); };
    try {
      const storageRef = ref(storage, path);
      const url = await getDownloadURL(storageRef);
      if (cancelledRef.current) { done(); return; }
      const audio = new Audio(url);
      audio.onended = done; audio.onerror = done;
      await audio.play();
    } catch { done(); }
  });
}

// ── speak() ──────────────────────────────────────────────────────────────────
function speak(text: string, rate = 0.88, pitch = 1.05): Promise<void> {
  return new Promise(resolve => {
    const hardTimeout = setTimeout(() => resolve(), 8000);
    const done = () => { clearTimeout(hardTimeout); resolve(); };

    if (!window.speechSynthesis) { done(); return; }
    try { window.speechSynthesis.cancel(); } catch { /**/ }

    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = rate; utt.pitch = pitch; utt.volume = 1;
      utt.onend = done;
      utt.onerror = (e) => {
        // "interrupted" fires when cancel() clears the queue — not a real error
        if ((e as any).error === "interrupted" || (e as any).error === "canceled") return;
        done();
      };

      const voice =
        voices.find(v => v.lang === "en-NG") ||
        voices.find(v => v.lang === "en-GH") ||
        voices.find(v => v.lang === "en-ZA" && !v.name.toLowerCase().includes("male")) ||
        voices.find(v => v.name === "Google UK English Female") ||
        voices.find(v => v.name === "Microsoft Zira Desktop - English (United States)") ||
        voices.find(v => v.name === "Samantha") ||
        voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en")) ||
        voices.find(v => v.lang === "en-GB" && !v.name.toLowerCase().includes("male")) ||
        voices.find(v => v.lang.startsWith("en")) ||
        voices[0];

      if (voice) utt.voice = voice;

      try {
        window.speechSynthesis.speak(utt);
        // Android Chrome bug: stalls if page briefly loses focus
        setTimeout(() => {
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        }, 300);
      } catch { done(); }
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      const fallbackTimer = setTimeout(() => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak([]);
      }, 2000);
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(fallbackTimer);
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak(window.speechSynthesis.getVoices());
      };
    }
  });
}

function gap(ms = 350): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function createJingle(): Promise<HTMLAudioElement | null> {
  try {
    const r = ref(storage, "support-audio/hold-jingle.mp3.mp4");
    const url = await getDownloadURL(r);
    const audio = new Audio(url);
    audio.loop = true; audio.volume = 0.45;
    audio.addEventListener("canplay", () => {
      if (audio.currentTime === 0) audio.currentTime = 3;
    }, { once: true });
    return audio;
  } catch { return null; }
}

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

// ── Audio Device Picker Sheet ────────────────────────────────────────────────
function AudioDeviceSheet({
  mics, speakers, activeMicId, activeSpeakerId,
  onMicChange, onSpeakerChange, onClose, c, dark, supportsSpeakerSelection,
}: {
  mics: AudioDevice[];
  speakers: AudioDevice[];
  activeMicId: string;
  activeSpeakerId: string;
  onMicChange: (id: string) => void;
  onSpeakerChange: (id: string) => void;
  onClose: () => void;
  c: Record<string, string>;
  dark: boolean;
  supportsSpeakerSelection: boolean;
}) {
  return (
    <>
      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes sheet-bg { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        animation: "sheet-bg .2s ease",
      }} />

      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10001,
        background: c.surf,
        borderRadius: "24px 24px 0 0",
        padding: "0 0 env(safe-area-inset-bottom,16px)",
        animation: "sheet-up .28s cubic-bezier(0.32,0.72,0,1)",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 4,
          background: c.dim, margin: "12px auto 0",
        }} />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px 12px",
          borderBottom: `1px solid ${c.brd}`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "'Syne',sans-serif", fontWeight: 900,
            fontSize: 16, color: c.txt,
          }}>
            <RiSettings3Line size={18} color={ACCENT} />
            Audio Settings
          </div>
          <button onClick={onClose} style={{
            background: c.brd, border: "none", borderRadius: "50%",
            width: 30, height: 30, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: c.sub, fontSize: 0,
          }}>
            <RiCloseLine size={16} />
          </button>
        </div>

        <div style={{ padding: "16px 20px 24px" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, fontWeight: 800, color: c.sub,
              textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
            }}>
              <RiMicLine size={13} color={c.sub} />
              Microphone
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mics.length === 0 ? (
                <div style={{
                  fontSize: 13, color: c.sub, padding: "12px 14px",
                  background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                  borderRadius: 12, border: `1px solid ${c.brd}`,
                }}>No microphones found</div>
              ) : mics.map(mic => (
                <DeviceOption
                  key={mic.deviceId}
                  label={mic.label || `Microphone ${mic.deviceId.slice(0, 6)}`}
                  active={activeMicId === mic.deviceId}
                  onClick={() => onMicChange(mic.deviceId)}
                  c={c}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, fontWeight: 800, color: c.sub,
              textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
            }}>
              <RiVolumeUpLine size={13} color={c.sub} />
              Speaker / Output
            </div>
            {!supportsSpeakerSelection ? (
              <div style={{
                fontSize: 13, color: c.sub, padding: "12px 14px",
                background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                borderRadius: 12, border: `1px solid ${c.brd}`, lineHeight: 1.6,
              }}>
                Speaker selection works on Chrome and Edge on desktop.<br />
                On mobile, use your device's volume/audio buttons.
              </div>
            ) : speakers.length === 0 ? (
              <div style={{
                fontSize: 13, color: c.sub, padding: "12px 14px",
                background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                borderRadius: 12, border: `1px solid ${c.brd}`,
              }}>No speakers found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {speakers.map(spk => (
                  <DeviceOption
                    key={spk.deviceId}
                    label={spk.label || `Speaker ${spk.deviceId.slice(0, 6)}`}
                    active={activeSpeakerId === spk.deviceId}
                    onClick={() => onSpeakerChange(spk.deviceId)}
                    c={c}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DeviceOption({
  label, active, onClick, c,
}: {
  label: string; active: boolean; onClick: () => void; c: Record<string, string>;
}) {
  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderRadius: 12, cursor: "pointer",
      border: active ? `1.5px solid rgba(255,107,0,0.5)` : `1.5px solid ${c.brd}`,
      background: active ? "rgba(255,107,0,0.07)" : "transparent",
      transition: "all .15s",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <span style={{
        fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? ACCENT : c.txt,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
      }}>
        {label}
      </span>
      {active && <RiCheckLine size={16} color={ACCENT} />}
    </button>
  );
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({
  agentName, callId, onDone, dark, c,
}: {
  agentName: string; callId: string; onDone: () => void;
  dark: boolean; c: Record<string, string>;
}) {
  const [hovered,    setHovered]    = useState(0);
  const [selected,   setSelected]   = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  const submit = async (star: number) => {
    setSelected(star); setSubmitting(true);
    try {
      const rate = httpsCallable(functions, "rateSupportCall");
      await rate({ callId, rating: star });
    } catch { /**/ }
    setSubmitted(true); setSubmitting(false);
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
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, marginBottom: 8 }}>Thank you!</div>
            <div style={{ fontSize: 13, color: c.sub }}>Your feedback helps us serve you better.</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, marginBottom: 8 }}>Rate your experience</div>
            <div style={{ fontSize: 13, color: c.sub, marginBottom: 28 }}>
              How was your call with <strong style={{ color: c.txt }}>{agentName}</strong>?
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star}
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
            <button onClick={onDone} style={{
              marginTop: 20, width: "100%", padding: "11px",
              borderRadius: 12, background: "transparent", border: `1px solid ${c.brd}`,
              color: c.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
            }}>Skip</button>
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

  // ── Audio device state ─────────────────────────────────────────────────────
  const [showDeviceSheet,       setShowDeviceSheet]       = useState(false);
  const [mics,                  setMics]                  = useState<AudioDevice[]>([]);
  const [speakers,              setSpeakers]              = useState<AudioDevice[]>([]);
  const [activeMicId,           setActiveMicId]           = useState<string>("");
  const [activeSpeakerId,       setActiveSpeakerId]       = useState<string>("");
  const [supportsSpeakerSelect, setSupportsSpeakerSelect] = useState(false);

  const callObj         = useRef<DailyCall | null>(null);
  const jingleRef       = useRef<HTMLAudioElement | null>(null);
  const dailyJoined     = useRef(false);
  const phaseRef        = useRef<CallPhase>("init");
  const speechCancelled = useRef(false);
  const callDataRef     = useRef<CallData | null>(null);
  const callTimer       = useCallTimer(phase === "active");

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { callDataRef.current = callData; }, [callData]);

  // ── Pre-warm TTS voices ───────────────────────────────────────────────────
  useEffect(() => {
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  // ── STEP 1: Just validate auth, show tap screen immediately ──────────────
  // Room creation is deferred to handleTapToStart so:
  //   a) Admin isn't notified until the user actually commits to the call
  //   b) AudioContext unlock, room creation, and TTS are all in the same gesture
  useEffect(() => {
    if (!auth.currentUser) {
      setError("You must be signed in to start a call.");
      setPhase("error");
      return;
    }
    setPhase("tap_to_start");
  }, []);

  // ── Enumerate audio devices ───────────────────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const micList = devices
        .filter(d => d.kind === "audioinput")
        .map(d => ({ deviceId: d.deviceId, label: d.label }));
      const spkList = devices
        .filter(d => d.kind === "audiooutput")
        .map(d => ({ deviceId: d.deviceId, label: d.label }));
      setMics(micList);
      setSpeakers(spkList);
      if (micList.length > 0) setActiveMicId(micList[0].deviceId);
      if (spkList.length > 0) setActiveSpeakerId(spkList[0].deviceId);
      const testEl = document.createElement("audio");
      setSupportsSpeakerSelect(typeof (testEl as any).setSinkId === "function");
    } catch (e) {
      console.warn("[Devices] enumeration failed:", e);
    }
  }, []);

  // ── Mic change ────────────────────────────────────────────────────────────
  const handleMicChange = useCallback(async (deviceId: string) => {
    setActiveMicId(deviceId);
    if (!callObj.current) return;
    try {
      await (callObj.current as any).setInputDevicesAsync({ audioDeviceId: deviceId });
    } catch (e) {
      console.warn("[Devices] mic switch failed:", e);
    }
  }, []);

  // ── Speaker change ────────────────────────────────────────────────────────
  const handleSpeakerChange = useCallback((deviceId: string) => {
    setActiveSpeakerId(deviceId);
    applyNewSpeakerToAll(deviceId);
  }, []);

  // ── stopAllSpeech ─────────────────────────────────────────────────────────
  const stopAllSpeech = useCallback(() => {
    speechCancelled.current = true;
    try { window.speechSynthesis?.cancel(); } catch { /**/ }
  }, []);

  // ── Jingle controls ───────────────────────────────────────────────────────
  const startJingle = useCallback(async () => {
    if (jingleRef.current) return;
    const audio = await createJingle();
    if (!audio) return;
    jingleRef.current = audio;
    try { await audio.play(); } catch (e) { console.warn("[Jingle]", e); }
  }, []);

  const stopJingle   = useCallback(() => {
    if (!jingleRef.current) return;
    jingleRef.current.pause(); jingleRef.current.src = ""; jingleRef.current = null;
  }, []);

  const pauseJingle  = useCallback(() => { jingleRef.current?.pause(); }, []);
  const resumeJingle = useCallback(() => { jingleRef.current?.play().catch(() => {}); }, []);

  // ── Queue speech ──────────────────────────────────────────────────────────
  const announceQueue = useCallback(async (pos: number) => {
    const mins = Math.max(1, pos);
    pauseJingle();
    await speak(
      `You are number ${pos} in the queue. ` +
      `Your estimated wait time is approximately ${mins} ${mins === 1 ? "minute" : "minutes"}. ` +
      `Please stay on the line and we will connect you to an agent shortly.`
    );
    resumeJingle();
  }, [pauseJingle, resumeJingle]);

  // ── STEP 2: Tap-to-start ─────────────────────────────────────────────────
  // ALL audio AND room creation happen here, inside the user gesture.
  // iOS Safari requires AudioContext + TTS to be triggered synchronously
  // within the tap. A useEffect detour breaks this.
  const handleTapToStart = useCallback(async () => {
    // 1. Unlock AudioContext synchronously inside the tap gesture
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        await ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
      }
    } catch { /**/ }

    // 2. iOS TTS unlock — MUST be called synchronously (no await before this point
    //    that could break the gesture chain). speak() the primer right now.
    if (window.speechSynthesis) {
      try {
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        primer.rate = 1;
        window.speechSynthesis.speak(primer);
      } catch { /**/ }
    }

    // 3. Request mic permission so device labels are populated (not empty strings)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch { /**/ }

    // Cancel the silent primer now that audio context is unlocked
    try { window.speechSynthesis?.cancel(); } catch { /**/ }

    await enumerateDevices();

    // 4. Create the room NOW (inside the gesture context).
    //    Admin is notified here — not on mount — so they only see the call
    //    after the user actually commits to talking.
    let roomCallId: string | null = null;
    let queuePos = 1;
    try {
      const createRoom = httpsCallable<unknown, {
        success: boolean; callId: string; queuePosition: number;
      }>(functions, "createSupportCallRoom");
      const res = await createRoom({});
      if (!res.data.success) throw new Error("Room creation failed");
      roomCallId = res.data.callId;
      queuePos   = res.data.queuePosition;
      setCallId(roomCallId);
    } catch (err: any) {
      setError(err.message ?? "Could not start call.");
      setPhase("error");
      return;
    }

    speechCancelled.current = false;
    setPhase("greeting");

    // Fire admin notification now that user has committed (fire-and-forget)
    if (roomCallId) {
      const notify = httpsCallable(functions, "notifyAgentOfCall");
      notify({ callId: roomCallId }).catch(() => {});
    }

    const overallCap = setTimeout(() => {
      if (!speechCancelled.current) { setPhase("waiting"); startJingle(); }
    }, 35000);

    try {
      const h = new Date().getHours();
      const tod =
        h >= 5  && h < 12 ? "Good morning" :
        h >= 12 && h < 17 ? "Good afternoon" : "Good evening";

      const pos  = queuePos;
      const mins = Math.max(1, pos);

      // Wait for voices to load — Android often needs this, iOS already unlocked above
      await new Promise<void>(resolve => {
        if (window.speechSynthesis.getVoices().length > 0) { resolve(); return; }
        const t = setTimeout(resolve, 1500);
        window.speechSynthesis.onvoiceschanged = () => {
          clearTimeout(t);
          window.speechSynthesis.onvoiceschanged = null;
          resolve();
        };
      });

      if (speechCancelled.current) throw new Error("cancelled");
      await speak(`${tod}! Welcome to`);
      await gap(800);

      if (speechCancelled.current) throw new Error("cancelled");
      await playStorageAudio("support-audio/swift9javoice.mp4", speechCancelled);
      await gap(400);

      if (speechCancelled.current) throw new Error("cancelled");
      await speak("Please note that this call is being recorded for quality assurance and training purposes.");
      await gap(350);

      if (speechCancelled.current) throw new Error("cancelled");
      await speak(`You are number ${pos} in the queue.`);
      await gap(350);

      if (speechCancelled.current) throw new Error("cancelled");
      await speak(`Your estimated wait time is approximately ${mins} ${mins === 1 ? "minute" : "minutes"}.`);
      await gap(350);

      if (speechCancelled.current) throw new Error("cancelled");
      await speak("Please stay on the line and we will connect you to an agent shortly.");

      if (!speechCancelled.current) setLastQueuePos(pos);
    } catch { /**/ } finally {
      clearTimeout(overallCap);
      if (!speechCancelled.current) { setPhase("waiting"); startJingle(); }
    }
  }, [enumerateDevices, startJingle]);

  // ── STEP 3: Firestore listener ────────────────────────────────────────────
  useEffect(() => {
    if (!callId) return;
    return onSnapshot(doc(db, "supportCalls", callId), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as CallData;
      setCallData(data);
      const cur = phaseRef.current;

      if (data.status === "active" && !dailyJoined.current &&
          (cur === "waiting" || cur === "greeting" || cur === "hold")) {
        stopJingle(); stopAllSpeech(); setPhase("connecting");
      }
      if (data.status === "hold" && cur === "active") {
        setPhase("hold"); startJingle();
        speak("Please hold on, your agent will be back with you shortly.");
      }
      if (data.status === "active" && cur === "hold" && dailyJoined.current) {
        stopJingle(); stopAllSpeech(); speechCancelled.current = false;
        setPhase("active");
        setTimeout(() => speak("Your agent has returned. Thank you for holding."), 500);
      }
      if (data.status === "ended" && cur !== "ended" && cur !== "rating") {
        stopJingle(); stopAllSpeech(); cleanupDaily(); setPhase("rating");
      }
    });
  }, [callId]);

  // ── STEP 4: Re-announce queue position ───────────────────────────────────
  useEffect(() => {
    if (phase !== "waiting" || !callData) return;
    const pos = callData.queuePosition;
    if (lastQueuePos !== null && pos !== lastQueuePos) {
      setLastQueuePos(pos);
      announceQueue(pos);
    }
  }, [callData?.queuePosition, phase]);

  // ── STEP 5: Connect Daily ─────────────────────────────────────────────────
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

        removeAllRemoteAudio();

        const call = DailyIframe.createCallObject({
          audioSource: activeMicId || true,
          videoSource: false,
          subscribeToTracksAutomatically: true,
        });
        callObj.current = call;

        call.on("track-started", (event) => {
          if (!event?.participant || event.participant.local) return;
          if (event.track?.kind !== "audio") return;
          attachRemoteAudio(event.participant.session_id, event.track, activeSpeakerId);
        });

        call.on("track-stopped", (event) => {
          if (!event?.participant || event.participant.local) return;
          if (event.track?.kind !== "audio") return;
          removeRemoteAudio(event.participant.session_id);
        });

        call.on("participant-left", (event) => {
          if (event?.participant) removeRemoteAudio(event.participant.session_id);
        });

        call.on("joined-meeting", () => {
          const participants = call.participants();
          Object.values(participants).forEach((p: any) => {
            if (p.local) return;
            const audioTrack = p.tracks?.audio?.persistentTrack;
            if (audioTrack && audioTrack.readyState === "live") {
              attachRemoteAudio(p.session_id, audioTrack, activeSpeakerId);
            }
          });
          dailyJoined.current     = true;
          speechCancelled.current = false;
          setPhase("active");
          setTimeout(() =>
            speak("You are now connected to a Swift Naija support agent. How can we help you today?"),
          800);
        });

        call.on("left-meeting", () => {
          removeAllRemoteAudio();
          if (phaseRef.current !== "rating" && phaseRef.current !== "ended") {
            dailyJoined.current = false;
            stopJingle(); stopAllSpeech();
            setPhase("rating"); cleanupDaily();
          }
        });

        call.on("error", () => {
          removeAllRemoteAudio();
          setError("Connection error. Please try again.");
          setPhase("error"); cleanupDaily();
        });

        await call.join({
          url:         callData.roomUrl,
          token:       callData.customerToken,
          audioSource: activeMicId || true,
          videoSource: false,
        });
      } catch {
        setError("Could not connect. Please check your microphone.");
        setPhase("error");
      }
    };

    initDaily();
  }, [phase]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanupDaily = useCallback(() => {
    if (callObj.current) { callObj.current.destroy().catch(() => {}); callObj.current = null; }
    dailyJoined.current = false;
    removeAllRemoteAudio();
  }, []);

  useEffect(() => {
    return () => { stopJingle(); stopAllSpeech(); cleanupDaily(); };
  }, []);

  // ── Call actions ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!callObj.current) return;
    const next = !muted;
    callObj.current.setLocalAudio(!next);
    setMuted(next);
  }, [muted]);

  const endCall = useCallback(async () => {
    stopAllSpeech(); stopJingle(); cleanupDaily();
    if (callId) {
      try { const end = httpsCallable(functions, "endSupportCall"); await end({ callId }); }
      catch (e) { console.error(e); }
    }
    if (phase === "active" || phase === "hold") setPhase("rating");
    else setPhase("ended");
  }, [callId, phase, cleanupDaily, stopJingle, stopAllSpeech]);

  // ── Short label helper ────────────────────────────────────────────────────
  const shortLabel = (label?: string) => {
    if (!label) return null;
    return label.replace(/\s*[\(\-–].*/i, "").trim().slice(0, 22);
  };

  const activeMicLabel     = mics.find(m => m.deviceId === activeMicId)?.label;
  const activeSpeakerLabel = speakers.find(s => s.deviceId === activeSpeakerId)?.label;
  const showDeviceButton   = phase === "active" || phase === "hold";

  // ── Rating screen ─────────────────────────────────────────────────────────
  if (phase === "rating") {
    return (
      <StarRating
        agentName={callData?.agentName ?? "our agent"}
        callId={callId ?? ""} onDone={onClose} dark={dark} c={c}
      />
    );
  }

  // ── Tap-to-start screen ───────────────────────────────────────────────────
  if (phase === "tap_to_start") {
    return (
      <>
        <style>{`
          @keyframes ic-in { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          @keyframes tap-pulse {
            0%,100% { transform:scale(1); box-shadow:0 0 0 0 rgba(255,107,0,0.4); }
            50%      { transform:scale(1.04); box-shadow:0 0 0 16px rgba(255,107,0,0); }
          }
        `}</style>
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, background: c.bg,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "ic-in .35s ease", padding: 24,
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, padding: "20px 24px",
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

          <div style={{
            background: c.surf, border: `1.5px solid ${c.brd}`,
            borderRadius: 28, padding: "48px 40px",
            width: "100%", maxWidth: 420, textAlign: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
          }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              background: "rgba(255,107,0,0.08)", border: "2px solid rgba(255,107,0,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}>
              <RiHeadphoneLine size={42} color={ACCENT} />
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: c.txt, marginBottom: 10 }}>
              Ready to connect
            </div>
            <div style={{ fontSize: 14, color: c.sub, marginBottom: 36, lineHeight: 1.6 }}>
              Your call is set up. Tap below to start and hear the welcome message.
            </div>
            <button onClick={handleTapToStart} style={{
              width: "100%", padding: "16px", borderRadius: 16, border: "none",
              background: `linear-gradient(135deg,${ACCENT},#FF8C00)`,
              color: "white", fontWeight: 900, cursor: "pointer",
              fontSize: 16, fontFamily: "'Syne',sans-serif",
              boxShadow: "0 6px 24px rgba(255,107,0,0.4)",
              animation: "tap-pulse 2s ease infinite", letterSpacing: 0.3,
            }}>
              📞 Tap to Start Call
            </button>
            <button onClick={onClose} style={{
              marginTop: 14, width: "100%", padding: "11px",
              borderRadius: 12, background: "transparent", border: `1px solid ${c.brd}`,
              color: c.sub, fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
            }}>Cancel</button>
          </div>

          <div style={{ marginTop: 24, fontSize: 12, color: c.sub, fontWeight: 600 }}>
            Audio only · Secured by Daily.co WebRTC
          </div>
        </div>
      </>
    );
  }

  // ── Phase helpers ─────────────────────────────────────────────────────────
  const PhaseIcon = () => {
    if (phase === "init" || phase === "connecting")
      return <RiLoader4Line size={48} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />;
    if (phase === "greeting" || phase === "waiting") return <RiTimeLine size={48} color={ACCENT} />;
    if (phase === "active")  return <RiHeadphoneLine size={48} color={ACCENT} />;
    if (phase === "hold")    return <RiTimeLine size={48} color="#F59E0B" />;
    if (phase === "ended")   return <RiPhoneFill size={48} color="#10B981" />;
    return <RiUserLine size={48} color={c.sub} />;
  };

  const phaseTitle: Record<CallPhase, string> = {
    init:         "Setting up your call…",
    tap_to_start: "",
    greeting:     "Welcome to Swift9ja Support",
    waiting:      "You are in the queue",
    connecting:   "Connecting to agent…",
    active:       `Connected to ${callData?.agentName ?? "Support"}`,
    hold:         "You are on hold",
    ended:        "Call ended",
    rating:       "",
    error:        "Something went wrong",
  };

  const phaseSubtitle: Record<CallPhase, string> = {
    init:         "Please wait…",
    tap_to_start: "",
    greeting:     "Please listen to the following information…",
    waiting:      callData ? `Position ${callData.queuePosition} in queue` : "Finding the next available agent…",
    connecting:   "Please wait a moment…",
    active:       callTimer,
    hold:         "Your agent will be back shortly…",
    ended:        "Thank you for contacting Swift9ja support.",
    rating:       "",
    error:        error,
  };

  const ringColor = phase === "active" ? ACCENT : phase === "hold" ? "#F59E0B" : null;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes ic-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hold-blink {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.4; }
        }
      `}</style>

      {showDeviceSheet && (
        <AudioDeviceSheet
          mics={mics}
          speakers={speakers}
          activeMicId={activeMicId}
          activeSpeakerId={activeSpeakerId}
          onMicChange={handleMicChange}
          onSpeakerChange={handleSpeakerChange}
          onClose={() => setShowDeviceSheet(false)}
          c={c} dark={dark}
          supportsSpeakerSelection={supportsSpeakerSelect}
        />
      )}

      <div style={{
        position: "fixed", inset: 0, zIndex: 9999, background: c.bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "ic-in .35s ease",
      }}>
        {/* Header */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, padding: "20px 24px",
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
          {/* Icon */}
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
                phase === "ended"  ? "rgba(16,185,129,0.12)" : "rgba(255,107,0,0.08)",
              border: `2px solid ${
                phase === "active" ? "rgba(255,107,0,0.2)" :
                phase === "hold"   ? "rgba(245,158,11,0.3)" :
                phase === "ended"  ? "rgba(16,185,129,0.3)" : "rgba(255,107,0,0.2)"}`,
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
            color: phase === "active" ? ACCENT : phase === "hold" ? "#F59E0B" : c.sub,
            marginBottom: showDeviceButton ? 16 : 32, lineHeight: 1.6,
            animation: phase === "hold" ? "hold-blink 2s ease infinite" : "none",
          }}>
            {phaseSubtitle[phase]}
          </div>

          {/* Audio device selector pill */}
          {showDeviceButton && (
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => setShowDeviceSheet(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 13px 7px 10px",
                  borderRadius: 50,
                  border: `1.5px solid ${c.brd}`,
                  background: "transparent",
                  cursor: "pointer",
                  color: c.sub,
                  fontSize: 12, fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif",
                  maxWidth: "100%",
                  transition: "border-color .15s",
                }}
              >
                <RiSettings3Line size={13} color={c.sub} />
                <RiMicLine size={12} color={c.sub} />
                <span style={{
                  maxWidth: 90, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {shortLabel(activeMicLabel) ?? "Default mic"}
                </span>
                {supportsSpeakerSelect && (
                  <>
                    <span style={{ color: c.dim, margin: "0 1px" }}>·</span>
                    <RiVolumeUpLine size={12} color={c.sub} />
                    <span style={{
                      maxWidth: 80, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {shortLabel(activeSpeakerLabel) ?? "Default"}
                    </span>
                  </>
                )}
                <RiArrowDownSLine size={13} color={c.dim} />
              </button>
            </div>
          )}

          {/* Queue badge */}
          {phase === "waiting" && callData && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, marginBottom: 28,
              background: "rgba(255,107,0,0.06)", border: "1.5px solid rgba(255,107,0,0.15)",
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
              background: "rgba(245,158,11,0.06)", border: "1.5px solid rgba(245,158,11,0.2)",
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
            <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <button onClick={toggleMute} style={{
                width: 64, height: 64, borderRadius: "50%",
                border: `2px solid ${muted ? "rgba(239,68,68,0.4)" : c.brd}`,
                background: muted ? "rgba(239,68,68,0.1)" : c.surf,
                color: muted ? "#EF4444" : c.sub, cursor: "pointer",
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

          {phase === "hold" && (
            <button onClick={endCall} style={{
              width: "100%", padding: "13px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg,#EF4444,#DC2626)",
              color: "white", fontWeight: 800, cursor: "pointer",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              boxShadow: "0 6px 20px rgba(239,68,68,0.3)",
            }}>End Call</button>
          )}

          {(phase === "waiting" || phase === "greeting") && (
            <button onClick={endCall} style={{
              width: "100%", padding: "13px", borderRadius: 14,
              border: `1.5px solid ${c.brd}`, background: "transparent",
              color: c.sub, fontWeight: 700, cursor: "pointer",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
            }}>Cancel</button>
          )}

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