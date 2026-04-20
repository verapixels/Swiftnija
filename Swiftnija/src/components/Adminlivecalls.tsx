// components/AdminLiveCalls.tsx
// Live Support Calls panel

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, onSnapshot, orderBy, where, doc, updateDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import {
  RiPhoneLine, RiPhoneFill, RiMicLine, RiMicOffLine,
  RiHeadphoneLine, RiUserLine, RiTimeLine, RiLoader4Line,
  RiCheckLine, RiPauseLine, RiPlayLine,
} from "react-icons/ri";

const ACCENT = "#FF6B00";
const functions = getFunctions();

// ── Types ─────────────────────────────────────────────────────────────────────
interface SupportCall {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  roomName: string;
  roomUrl: string;
  customerToken: string;
  status: "waiting" | "active" | "ended" | "hold";
  queuePosition: number;
  agentId?: string;
  agentName?: string;
  createdAt?: { seconds: number };
  joinedAt?: { seconds: number };
}

interface ActiveCallState {
  callId: string;
  customerName: string;
  roomUrl: string;
  agentToken: string;
  muted: boolean;
  onHold: boolean;
}

// Global Daily ref — persists across navigation
let globalCallObj: DailyCall | null = null;
let globalActiveCallId: string | null = null;

// ── FIX: Track remote audio elements (agent side mirrors customer side fix) ───
// Same root cause: Daily.co does not auto-play remote audio on mobile.
// The agent's browser must also manually subscribe and play remote tracks.
const remoteAudioElements = new Map<string, HTMLAudioElement>();

function attachRemoteAudio(participantId: string, track: MediaStreamTrack) {
  let audioEl = remoteAudioElements.get(participantId);
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "true");
    document.body.appendChild(audioEl);
    remoteAudioElements.set(participantId, audioEl);
  }
  const stream = new MediaStream([track]);
  audioEl.srcObject = stream;
  audioEl.play().catch(err => console.warn("[Admin Audio] play failed:", err));
}

function removeRemoteAudio(participantId: string) {
  const audioEl = remoteAudioElements.get(participantId);
  if (audioEl) {
    audioEl.srcObject = null;
    audioEl.remove();
    remoteAudioElements.delete(participantId);
  }
}

function removeAllRemoteAudio() {
  remoteAudioElements.forEach((_, id) => removeRemoteAudio(id));
}

// ── Timer hook ────────────────────────────────────────────────────────────────
function useTimer(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── Ago helper ────────────────────────────────────────────────────────────────
function ago(ts?: { seconds: number } | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts.seconds * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── In-call floating bar ──────────────────────────────────────────────────────
function ActiveCallBar({
  state,
  onMuteToggle,
  onHoldToggle,
  onEnd,
  C,
}: {
  state: ActiveCallState;
  onMuteToggle: () => void;
  onHoldToggle: () => void;
  onEnd: () => void;
  C: Record<string, string>;
}) {
  const timer = useTimer(true);

  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 99000,
      background: C.modalBg,
      border: `1.5px solid rgba(255,107,0,0.4)`,
      borderRadius: 22, padding: "14px 20px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      backdropFilter: "blur(16px)",
      minWidth: 320,
    }}>
      {/* Pulse dot */}
      <div style={{
        width: 10, height: 10, borderRadius: "50%",
        background: state.onHold ? "#F59E0B" : ACCENT,
        animation: "pulse-bar 1.5s ease infinite",
        flexShrink: 0,
      }} />

      <div style={{ flex: 1 }}>
        <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>
          {state.onHold ? "On Hold — " : ""}{state.customerName}
        </div>
        <div style={{ color: C.textSub, fontSize: 12 }}>{timer}</div>
      </div>

      {/* Hold */}
      <button
        onClick={onHoldToggle}
        title={state.onHold ? "Resume call" : "Put on hold"}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          border: `1.5px solid ${state.onHold ? "rgba(245,158,11,0.5)" : C.border}`,
          background: state.onHold ? "rgba(245,158,11,0.15)" : C.surface2,
          color: state.onHold ? "#F59E0B" : C.textSub,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .2s", fontSize: 0,
        }}
      >
        {state.onHold ? <RiPlayLine size={18} /> : <RiPauseLine size={18} />}
      </button>

      {/* Mute */}
      <button
        onClick={onMuteToggle}
        title={state.muted ? "Unmute" : "Mute"}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          border: `1.5px solid ${state.muted ? "rgba(239,68,68,0.4)" : C.border}`,
          background: state.muted ? "rgba(239,68,68,0.1)" : C.surface2,
          color: state.muted ? "#EF4444" : C.textSub,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .2s", fontSize: 0,
        }}
      >
        {state.muted ? <RiMicOffLine size={18} /> : <RiMicLine size={18} />}
      </button>

      {/* End */}
      <button
        onClick={onEnd}
        style={{
          width: 48, height: 48, borderRadius: "50%", border: "none",
          background: "linear-gradient(135deg,#EF4444,#DC2626)",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(239,68,68,0.4)", fontSize: 0,
        }}
      >
        <RiPhoneFill size={20} style={{ transform: "rotate(135deg)" }} />
      </button>

      <style>{`
        @keyframes pulse-bar {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminLiveCalls({ C }: { C: Record<string, string> }) {
  const [calls, setCalls]           = useState<SupportCall[]>([]);
  const [loading, setLoading]       = useState(true);
  const [joiningId, setJoiningId]   = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [toastMsg, setToastMsg]     = useState<string | null>(null);

  const notifiedCallIds = useRef<Set<string>>(new Set());

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ── Load calls ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "supportCalls"),
      where("status", "in", ["waiting", "active", "hold"]),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(q, snap => {
      const newCalls = snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportCall));

      newCalls.forEach(call => {
        if (
          call.status === "waiting" &&
          !notifiedCallIds.current.has(call.id)
        ) {
          notifiedCallIds.current.add(call.id);
          toast(`New call from ${call.customerName}`);
        }
      });

      setCalls(newCalls);
      setLoading(false);
    });
  }, []);

  // ── Restore active call on remount ─────────────────────────────────────────
  useEffect(() => {
    if (globalCallObj && globalActiveCallId) {
      const call = calls.find(c => c.id === globalActiveCallId);
      if (call && !activeCall) {
        setActiveCall({
          callId:       globalActiveCallId,
          customerName: call.customerName,
          roomUrl:      call.roomUrl,
          agentToken:   "",
          muted:        false,
          onHold:       call.status === "hold",
        });
      }
    }
  }, [calls]);

  // ── Join call ──────────────────────────────────────────────────────────────
  const joinCall = useCallback(async (callId: string) => {
    if (joiningId || activeCall) return;
    setJoiningId(callId);

    try {
      const getToken = httpsCallable<{ callId: string }, {
        success: boolean;
        agentToken: string;
        roomUrl: string;
        customerName: string;
      }>(functions, "generateAgentCallToken");

      const res = await getToken({ callId });
      if (!res.data.success) throw new Error("Token generation failed");

      if (globalCallObj) {
        try { await globalCallObj.destroy(); } catch {}
        globalCallObj = null;
      }
      removeAllRemoteAudio();

      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
        // FIX: same subscription fix as customer side
        subscribeToTracksAutomatically: true,
      });
      globalCallObj      = call;
      globalActiveCallId = callId;

      // FIX: attach remote audio tracks as they arrive
      call.on("track-started", (event) => {
        if (!event?.participant || event.participant.local) return;
        if (event.track?.kind !== "audio") return;
        console.log("[Admin Daily] Remote audio track started:", event.participant.session_id);
        attachRemoteAudio(event.participant.session_id, event.track);
      });

      call.on("track-stopped", (event) => {
        if (!event?.participant || event.participant.local) return;
        if (event.track?.kind !== "audio") return;
        removeRemoteAudio(event.participant.session_id);
      });

      call.on("participant-left", (event) => {
        if (event?.participant) {
          removeRemoteAudio(event.participant.session_id);
        }
      });

      call.on("joined-meeting", () => {
        // Also catch tracks already present when we join
        const participants = call.participants();
        Object.values(participants).forEach((p) => {
          if (p.local) return;
          const audioTrack = p.tracks?.audio?.persistentTrack;
          if (audioTrack && audioTrack.readyState === "live") {
            attachRemoteAudio(p.session_id, audioTrack);
          }
        });
      });

      call.on("left-meeting", () => {
        endActiveCall(callId);
      });

      call.on("error", () => {
        toast("Connection error during call.");
        endActiveCall(callId);
      });

      await call.join({
        url:         res.data.roomUrl,
        token:       res.data.agentToken,
        audioSource: true,
        videoSource: false,
      });

      setActiveCall({
        callId,
        customerName: res.data.customerName,
        roomUrl:      res.data.roomUrl,
        agentToken:   res.data.agentToken,
        muted:        false,
        onHold:       false,
      });
    } catch (err) {
      console.error("[AdminLiveCalls] joinCall:", err);
      toast("Could not join call. Check microphone permissions.");
    } finally {
      setJoiningId(null);
    }
  }, [joiningId, activeCall]);

  // ── End call ───────────────────────────────────────────────────────────────
  const endActiveCall = useCallback(async (callIdOverride?: string) => {
    const id = callIdOverride ?? activeCall?.callId;
    if (!id) return;

    if (globalCallObj) {
      try { await globalCallObj.destroy(); } catch {}
      globalCallObj      = null;
      globalActiveCallId = null;
    }
    removeAllRemoteAudio();

    try {
      const end = httpsCallable(functions, "endSupportCall");
      await end({ callId: id });
    } catch (e) { console.error("[AdminLiveCalls] endCall:", e); }

    setActiveCall(null);
    toast("Call ended.");
  }, [activeCall]);

  // ── Hold toggle ────────────────────────────────────────────────────────────
  const toggleHold = useCallback(async () => {
    if (!activeCall) return;
    const newHold = !activeCall.onHold;

    try {
      await updateDoc(doc(db, "supportCalls", activeCall.callId), {
        status: newHold ? "hold" : "active",
      });
      setActiveCall(a => a ? { ...a, onHold: newHold } : a);
      toast(newHold ? "Call put on hold" : "Call resumed");
    } catch (e) {
      console.error("[AdminLiveCalls] toggleHold:", e);
    }
  }, [activeCall]);

  // ── Mute toggle ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!globalCallObj || !activeCall) return;
    const next = !activeCall.muted;
    globalCallObj.setLocalAudio(!next);
    setActiveCall(a => a ? { ...a, muted: next } : a);
  }, [activeCall]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Intentionally not destroying globalCallObj — call persists on navigation
    };
  }, []);

  const waiting = calls.filter(c => c.status === "waiting");
  const active  = calls.filter(c => c.status === "active" || c.status === "hold");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {activeCall && (
        <ActiveCallBar
          state={activeCall}
          onMuteToggle={toggleMute}
          onHoldToggle={toggleHold}
          onEnd={() => endActiveCall()}
          C={C}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: activeCall ? 88 : 28, right: 28, zIndex: 99999,
          background: C.modalBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "12px 18px",
          color: C.text, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <RiCheckLine size={14} color={C.green} />
          {toastMsg}
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 24, fontWeight: 800,
          color: C.text, marginBottom: 4,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <RiHeadphoneLine size={24} color={ACCENT} />
          Live Support Calls
        </h1>
        <p style={{ color: C.muted, fontSize: 13 }}>
          {waiting.length} waiting · {active.length} active
          {activeCall && (
            <span style={{
              marginLeft: 12, color: ACCENT, fontWeight: 700,
              background: "rgba(255,107,0,0.1)",
              border: "1px solid rgba(255,107,0,0.2)",
              borderRadius: 8, padding: "2px 10px", fontSize: 11,
            }}>
              You are on a call
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          color: C.muted, padding: 40, justifyContent: "center",
        }}>
          <RiLoader4Line size={18} style={{ animation: "spin 1s linear infinite" }} />
          Loading calls…
        </div>
      ) : calls.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20,
        }}>
          <RiPhoneLine size={36} style={{ color: C.muted, marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 6 }}>
            No active calls right now
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            Customers requesting internet calls will appear here in real time.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: activeCall ? 80 : 0 }}>

          {/* Waiting calls */}
          {waiting.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 800, color: C.muted,
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12,
              }}>
                Waiting — {waiting.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {waiting.map(call => (
                  <div key={call.id} style={{
                    background: C.surface,
                    border: `1.5px solid rgba(255,107,0,0.25)`,
                    borderRadius: 18, padding: "18px 20px",
                    display: "flex", alignItems: "center", gap: 14,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                  }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: "rgba(255,107,0,0.1)",
                      border: "1.5px solid rgba(255,107,0,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <RiUserLine size={20} color={ACCENT} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 15, fontWeight: 800, color: C.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {call.customerName}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {call.customerEmail}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: ACCENT,
                          background: "rgba(255,107,0,0.1)",
                          border: "1px solid rgba(255,107,0,0.2)",
                          borderRadius: 20, padding: "2px 8px",
                        }}>
                          Queue #{call.queuePosition}
                        </span>
                        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
                          Waiting {ago(call.createdAt)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => joinCall(call.id)}
                      disabled={!!joiningId || !!activeCall}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "11px 20px", borderRadius: 12, border: "none",
                        background: joiningId === call.id
                          ? "rgba(255,107,0,0.3)"
                          : `linear-gradient(135deg,${ACCENT},#FF8C00)`,
                        color: "white", fontWeight: 800, fontSize: 13,
                        cursor: (!!joiningId || !!activeCall) ? "not-allowed" : "pointer",
                        opacity: (!!activeCall && activeCall.callId !== call.id) ? 0.4 : 1,
                        boxShadow: "0 4px 14px rgba(255,107,0,0.3)",
                        flexShrink: 0, fontFamily: "'DM Sans', sans-serif", transition: "all .2s",
                      }}
                    >
                      {joiningId === call.id
                        ? <RiLoader4Line size={14} style={{ animation: "spin 1s linear infinite" }} />
                        : <RiPhoneLine size={14} />
                      }
                      {joiningId === call.id ? "Joining…" : "Join Call"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active / hold calls */}
          {active.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 800, color: C.muted,
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12,
              }}>
                Active — {active.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {active.map(call => {
                  const isHold = call.status === "hold";
                  const borderColor = isHold ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.25)";
                  const dotColor    = isHold ? "#F59E0B" : "#10B981";
                  const iconColor   = isHold ? "#F59E0B" : "#10B981";

                  return (
                    <div key={call.id} style={{
                      background: C.surface,
                      border: `1.5px solid ${borderColor}`,
                      borderRadius: 18, padding: "18px 20px",
                      display: "flex", alignItems: "center", gap: 14,
                    }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: "50%",
                        background: isHold ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                        border: `1.5px solid ${borderColor}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, position: "relative",
                      }}>
                        <RiHeadphoneLine size={20} color={iconColor} />
                        <span style={{
                          position: "absolute", top: 0, right: 0,
                          width: 12, height: 12, borderRadius: "50%",
                          background: dotColor,
                          border: `2px solid ${C.surface}`,
                        }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: 15, fontWeight: 800, color: C.text,
                        }}>
                          {call.customerName}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                          {call.agentName ? `With ${call.agentName}` : "In progress"}
                          {" · "}{isHold ? "On Hold" : `Connected ${ago(call.joinedAt)}`}
                        </div>
                      </div>

                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        color: isHold ? "#F59E0B" : "#10B981",
                        background: isHold ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                        border: `1px solid ${isHold ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)"}`,
                        borderRadius: 20, padding: "4px 12px",
                      }}>
                        {isHold ? "On Hold" : "Live"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}