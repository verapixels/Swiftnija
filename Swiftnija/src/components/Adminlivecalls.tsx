// components/AdminLiveCalls.tsx
// Live Support Calls panel — slots into SwiftAdminDashboard.tsx renderPage().
// Shows waiting + active calls in real time via Firestore.
// Agent clicks "Join Call" → Cloud Function returns owner token → Daily audio.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, onSnapshot, orderBy, where, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../firebase";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import {
  RiPhoneLine,
  RiPhoneFill,
  RiMicLine,
  RiMicOffLine,
  RiHeadphoneLine,
  RiUserLine,
  RiTimeLine,
  RiLoader4Line,
  RiCheckLine,
  RiCloseLine,
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
  status: "waiting" | "active" | "ended";
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
  seconds: number;
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

// ── In-call overlay ───────────────────────────────────────────────────────────
function ActiveCallOverlay({
  state,
  onMuteToggle,
  onEnd,
  C,
}: {
  state: ActiveCallState;
  onMuteToggle: () => void;
  onEnd: () => void;
  C: Record<string, string>;
}) {
  const timer = useTimer(true);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99000,
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.modalBg,
        border: `1.5px solid rgba(255,107,0,0.3)`,
        borderRadius: 28, padding: "40px 36px",
        width: "100%", maxWidth: 400,
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Animated ring */}
        <div style={{ position: "relative", display: "inline-flex", marginBottom: 24 }}>
          <div style={{
            position: "absolute", inset: -8, borderRadius: "50%",
            border: `2px solid ${ACCENT}`,
            animation: "pulse-ring-admin 1.5s ease-out infinite",
          }} />
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            background: "rgba(255,107,0,0.12)",
            border: "2px solid rgba(255,107,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <RiHeadphoneLine size={40} color={ACCENT} />
          </div>
        </div>

        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 20, fontWeight: 800,
          color: C.text, marginBottom: 6,
        }}>
          {state.customerName}
        </div>

        <div style={{ fontSize: 22, fontWeight: 900, color: ACCENT, marginBottom: 24, fontFamily: "'Space Grotesk', sans-serif" }}>
          {timer}
        </div>

        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          {/* Mute */}
          <button
            onClick={onMuteToggle}
            style={{
              width: 60, height: 60, borderRadius: "50%",
              border: `2px solid ${state.muted ? "rgba(239,68,68,0.4)" : C.border}`,
              background: state.muted ? "rgba(239,68,68,0.1)" : C.surface2,
              color: state.muted ? "#EF4444" : C.textSub,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .2s", fontSize: 0,
            }}
          >
            {state.muted ? <RiMicOffLine size={22} /> : <RiMicLine size={22} />}
          </button>

          {/* End */}
          <button
            onClick={onEnd}
            style={{
              width: 72, height: 72, borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg,#EF4444,#DC2626)",
              color: "white", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 20px rgba(239,68,68,0.4)",
              fontSize: 0,
            }}
          >
            <RiPhoneFill size={26} style={{ transform: "rotate(135deg)" }} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse-ring-admin {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminLiveCalls({ C }: { C: Record<string, string> }) {
  const [calls, setCalls] = useState<SupportCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const callObj = useRef<DailyCall | null>(null);

  // ── Load calls ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "supportCalls"),
      where("status", "in", ["waiting", "active"]),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, snap => {
      setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportCall)));
      setLoading(false);
    });
  }, []);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ── Join a call ────────────────────────────────────────────────────────────
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

      // Create Daily call object
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      callObj.current = call;

      call.on("left-meeting", () => {
        endActiveCall(callId);
      });

      call.on("error", (evt) => {
        console.error("[Admin Daily] error:", evt);
        toast("Connection error during call.");
        endActiveCall(callId);
      });

      await call.join({
        url: res.data.roomUrl,
        token: res.data.agentToken,
        audioSource: true,
        videoSource: false,
      });

      setActiveCall({
        callId,
        customerName: res.data.customerName,
        roomUrl: res.data.roomUrl,
        agentToken: res.data.agentToken,
        muted: false,
        seconds: 0,
      });
    } catch (err) {
      console.error("[AdminLiveCalls] joinCall error:", err);
      toast("Could not join call. Check your microphone permissions.");
    } finally {
      setJoiningId(null);
    }
  }, [joiningId, activeCall]);

  // ── End active call ────────────────────────────────────────────────────────
  const endActiveCall = useCallback(async (callIdOverride?: string) => {
    const id = callIdOverride ?? activeCall?.callId;
    if (!id) return;

    // Destroy Daily
    if (callObj.current) {
      try { await callObj.current.destroy(); } catch {}
      callObj.current = null;
    }

    // Call Cloud Function to end room
    try {
      const end = httpsCallable(functions, "endSupportCall");
      await end({ callId: id });
    } catch (e) {
      console.error("[AdminLiveCalls] endCall error:", e);
    }

    setActiveCall(null);
    toast("Call ended.");
  }, [activeCall]);

  // ── Mute toggle ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!callObj.current || !activeCall) return;
    const next = !activeCall.muted;
    callObj.current.setLocalAudio(!next);
    setActiveCall(a => a ? { ...a, muted: next } : a);
  }, [activeCall]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (callObj.current) {
        callObj.current.destroy();
        callObj.current = null;
      }
    };
  }, []);

  const waiting = calls.filter(c => c.status === "waiting");
  const active  = calls.filter(c => c.status === "active");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Active call overlay */}
      {activeCall && (
        <ActiveCallOverlay
          state={activeCall}
          onMuteToggle={toggleMute}
          onEnd={() => endActiveCall()}
          C={C}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 99999,
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
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
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
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Waiting calls */}
          {waiting.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 800,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 12,
              }}>
                Waiting — {waiting.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {waiting.map(call => (
                  <div
                    key={call.id}
                    style={{
                      background: C.surface,
                      border: `1.5px solid rgba(255,107,0,0.25)`,
                      borderRadius: 18,
                      padding: "18px 20px",
                      display: "flex", alignItems: "center", gap: 14,
                      boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: "rgba(255,107,0,0.1)",
                      border: "1.5px solid rgba(255,107,0,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <RiUserLine size={20} color={ACCENT} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 15, fontWeight: 800,
                        color: C.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {call.customerName}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {call.customerEmail}
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginTop: 6,
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          color: ACCENT,
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

                    {/* Join button */}
                    <button
                      onClick={() => joinCall(call.id)}
                      disabled={!!joiningId || !!activeCall}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "11px 20px",
                        borderRadius: 12,
                        border: "none",
                        background: joiningId === call.id
                          ? "rgba(255,107,0,0.3)"
                          : `linear-gradient(135deg,${ACCENT},#FF8C00)`,
                        color: "white",
                        fontWeight: 800, fontSize: 13,
                        cursor: (!!joiningId || !!activeCall) ? "not-allowed" : "pointer",
                        opacity: (!!activeCall && activeCall.callId !== call.id) ? 0.4 : 1,
                        boxShadow: "0 4px 14px rgba(255,107,0,0.3)",
                        flexShrink: 0,
                        fontFamily: "'DM Sans', sans-serif",
                        transition: "all .2s",
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

          {/* Active calls */}
          {active.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 800,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 12,
              }}>
                Active — {active.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {active.map(call => (
                  <div
                    key={call.id}
                    style={{
                      background: C.surface,
                      border: `1.5px solid rgba(16,185,129,0.25)`,
                      borderRadius: 18,
                      padding: "18px 20px",
                      display: "flex", alignItems: "center", gap: 14,
                    }}
                  >
                    {/* Live dot */}
                    <div style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: "rgba(16,185,129,0.1)",
                      border: "1.5px solid rgba(16,185,129,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                      position: "relative",
                    }}>
                      <RiHeadphoneLine size={20} color="#10B981" />
                      <span style={{
                        position: "absolute", top: 0, right: 0,
                        width: 12, height: 12, borderRadius: "50%",
                        background: "#10B981",
                        border: `2px solid ${C.surface}`,
                      }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 15, fontWeight: 800,
                        color: C.text,
                      }}>
                        {call.customerName}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        {call.agentName
                          ? `With ${call.agentName}`
                          : "In progress"}
                        {" · "}Connected {ago(call.joinedAt)}
                      </div>
                    </div>

                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      color: "#10B981",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.2)",
                      borderRadius: 20, padding: "4px 12px",
                    }}>
                      Live
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}