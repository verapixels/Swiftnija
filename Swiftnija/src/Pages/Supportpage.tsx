// pages/SupportPage.tsx
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { auth, db } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, getDoc, updateDoc,
} from "firebase/firestore";
import {
  FiHeadphones, FiPhone, FiMail, FiMapPin, FiCopy,
  FiCheckCircle, FiMessageCircle, FiClock, FiSend,
  FiChevronDown, FiChevronUp, FiExternalLink,
  FiArrowLeft, FiX, FiAlertCircle,
} from "react-icons/fi";
import { RiWhatsappLine } from "react-icons/ri";
import { MdVerified } from "react-icons/md";

const ACCENT = "#FF6B00";

type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved";

type ChatMsg = {
  id: string;
  text: string;
  sender: "user" | "support" | "system";
  senderName?: string;
  timestamp: Date | null;
};

type SupportTicket = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  status: TicketStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
  assignedAdminName?: string;
  lastMessage?: string;
};

type SupportSettings = {
  phone: string; email: string; address: string;
  whatsapp: string; openingHours: string;
  closingHours: string; workDays: string; isOpen: boolean;
};

const DEFAULT_SETTINGS: SupportSettings = {
  phone: "+234 800 SWIFT 00", email: "support@swift9ja.com",
  address: "Plot 14, Lekki Phase 1, Lagos, Nigeria",
  whatsapp: "+2348001234567", openingHours: "8:00 AM",
  closingHours: "8:00 PM", workDays: "Monday – Saturday", isOpen: true,
};

const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string; bdr: string }> = {
  open:        { label: "Open",        color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  bdr: "rgba(59,130,246,0.25)" },
  in_progress: { label: "In Progress", color: ACCENT,    bg: "rgba(255,107,0,0.1)",   bdr: "rgba(255,107,0,0.25)" },
  on_hold:     { label: "On Hold",     color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  bdr: "rgba(245,158,11,0.25)" },
  resolved:    { label: "Resolved",    color: "#10B981", bg: "rgba(16,185,129,0.1)",  bdr: "rgba(16,185,129,0.25)" },
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 2000); }); }}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: ok ? "rgba(16,185,129,0.12)" : "rgba(255,107,0,0.1)", border: `1px solid ${ok ? "rgba(16,185,129,0.3)" : "rgba(255,107,0,0.25)"}`, color: ok ? "#10B981" : ACCENT, cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all .2s", flexShrink: 0 }}>
      {ok ? <FiCheckCircle size={11} /> : <FiCopy size={11} />}
      {ok ? "Copied!" : "Copy"}
    </button>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS_CFG[status];
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: ".5px", background: s.bg, color: s.color, border: `1px solid ${s.bdr}` }}>{s.label}</span>;
}

// ─── CHAT MODAL ───────────────────────────────────────────────────────────────
function ChatModal({ ticket, onClose, c, dark }: { ticket: SupportTicket; onClose: () => void; c: Record<string, string>; dark: boolean }) {
  const [msgs,   setMsgs]   = useState<ChatMsg[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive]     = useState<SupportTicket>(ticket);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "supportTickets", ticket.id, "messages"), orderBy("timestamp", "asc"));
    return onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, text: d.data().text, sender: d.data().sender, senderName: d.data().senderName, timestamp: d.data().timestamp?.toDate?.() ?? null })));
    });
  }, [ticket.id]);

  useEffect(() => {
    return onSnapshot(doc(db, "supportTickets", ticket.id), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setLive(p => ({ ...p, status: d.status ?? p.status, assignedAdminName: d.assignedAdminName ?? p.assignedAdminName }));
    });
  }, [ticket.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!newMsg.trim() || sending) return;
    const text = newMsg.trim(); setNewMsg(""); setSending(true);
    try {
      const name = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Customer";
      await addDoc(collection(db, "supportTickets", ticket.id, "messages"), { text, sender: "user", senderName: name, timestamp: serverTimestamp() });
      await updateDoc(doc(db, "supportTickets", ticket.id), { lastMessage: text, updatedAt: serverTimestamp(), ...(live.status === "resolved" ? { status: "open" } : {}) });
    } catch (e) { console.error(e); } finally { setSending(false); }
  };

  const cfg = STATUS_CFG[live.status];

  return (
    <>
      <style>{`
        @keyframes cm-in      { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:translateY(0)} }
        @keyframes cm-in-desk { from{opacity:0;transform:scale(.94) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes bb-in      { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .cm-overlay { position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center; }
        .cm-box { width:100%;height:100dvh;max-height:100dvh;background:${c.bg};display:flex;flex-direction:column;animation:cm-in .35s cubic-bezier(.32,1,.4,1) both; }
        @media(min-width:600px){ .cm-overlay{align-items:center;} .cm-box{width:440px;height:680px;max-height:90vh;border-radius:24px;animation:cm-in-desk .3s cubic-bezier(.32,1,.4,1) both;} }
        .cm-msgs { flex:1;overflow-y:auto;padding:16px;scroll-behavior:smooth; }
        .cm-msgs::-webkit-scrollbar{width:3px;} .cm-msgs::-webkit-scrollbar-thumb{background:rgba(255,107,0,.2);border-radius:3px;}
      `}</style>
      <div className="cm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cm-box">
          {/* Header */}
          <div style={{ background: c.surf, borderBottom: `1px solid ${c.brd}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, background: "transparent", border: `1px solid ${c.brd}`, color: c.sub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FiArrowLeft size={16} />
            </button>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg,${ACCENT},#FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FiHeadphones size={17} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{live.subject}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                <StatusBadge status={live.status} />
                {live.assignedAdminName && <span style={{ fontSize: 10, color: c.sub, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><MdVerified size={11} color="#3b82f6" /> {live.assignedAdminName}</span>}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.sub, flexShrink: 0 }}>#{live.id.slice(-6).toUpperCase()}</span>
          </div>

          {/* Status banner */}
          {(live.status === "resolved" || live.status === "on_hold") && (
            <div style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.bdr}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {live.status === "resolved" ? <FiCheckCircle size={14} color={cfg.color} /> : <FiAlertCircle size={14} color={cfg.color} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                {live.status === "resolved" ? "This ticket has been marked as resolved by our team." : "Ticket is on hold — we'll follow up shortly."}
              </span>
            </div>
          )}

          {/* Messages */}
          <div className="cm-msgs" style={{ background: dark ? "#0d0d14" : "#f5f5fb" }}>
            {msgs.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,107,0,0.1)", border: "2px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <FiMessageCircle size={22} color={ACCENT} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.txt, marginBottom: 6 }}>Ticket #{live.id.slice(-6).toUpperCase()}</div>
                <div style={{ fontSize: 12, color: c.sub, lineHeight: 1.6 }}>Our team will respond shortly. Avg response time under 2 hours during business hours.</div>
              </div>
            )}
            {msgs.map(msg => {
              if (msg.sender === "system") return (
                <div key={msg.id} style={{ textAlign: "center", margin: "12px 0", animation: "bb-in .25s ease" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.sub, background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", padding: "5px 14px", borderRadius: 20, border: `1px solid ${c.brd}` }}>{msg.text}</span>
                </div>
              );
              const isUser = msg.sender === "user";
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 3, marginBottom: 14, animation: "bb-in .25s ease" }}>
                  {!isUser && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${ACCENT},#FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FiHeadphones size={10} color="white" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.sub }}>{msg.senderName || "Support Team"}</span>
                    </div>
                  )}
                  <div style={{ maxWidth: "78%", background: isUser ? `linear-gradient(135deg,${ACCENT},#FF8C00)` : c.surf, border: isUser ? "none" : `1.5px solid ${c.brd}`, borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "11px 15px", boxShadow: isUser ? "0 4px 16px rgba(255,107,0,.25)" : "none" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.55, color: isUser ? "white" : c.txt }}>{msg.text}</div>
                  </div>
                  {msg.timestamp && <span style={{ fontSize: 10, color: c.sub, fontWeight: 600, paddingLeft: isUser ? 0 : 4 }}>{msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${c.brd}`, background: c.surf, display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
            <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type your message…" disabled={sending} rows={1}
              style={{ flex: 1, background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 14, padding: "10px 14px", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, outline: "none", resize: "none", maxHeight: 100 }} />
            <button onClick={send} disabled={!newMsg.trim() || sending}
              style={{ width: 42, height: 42, borderRadius: 13, border: "none", flexShrink: 0, background: newMsg.trim() ? `linear-gradient(135deg,${ACCENT},#FF8C00)` : c.dim, display: "flex", alignItems: "center", justifyContent: "center", cursor: newMsg.trim() ? "pointer" : "not-allowed", transition: "all .2s", boxShadow: newMsg.trim() ? "0 4px 14px rgba(255,107,0,.3)" : "none" }}>
              <FiSend size={16} color="white" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── NEW TICKET MODAL ─────────────────────────────────────────────────────────
function NewTicketModal({ onClose, onCreated, c }: { onClose: () => void; onCreated: (t: SupportTicket) => void; c: Record<string, string> }) {
  const [subject,  setSubject]  = useState("");
  const [message,  setMessage]  = useState("");
  const [creating, setCreating] = useState(false);
  const [err,      setErr]      = useState("");

  const SUBJECTS = ["My order hasn't arrived","Wrong item delivered","Payment issue","Need to cancel my order","App not working properly","Other"];

  const create = async () => {
    if (!subject.trim()) { setErr("Please select a subject"); return; }
    if (message.trim().length < 10) { setErr("Please describe your issue (at least 10 characters)"); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setErr("Please log in first"); return; }
    setCreating(true); setErr("");
    try {
      const name  = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Customer";
      const email = auth.currentUser?.email || "";
      const ref   = await addDoc(collection(db, "supportTickets"), { userId: uid, userEmail: email, userName: name, subject, status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: message });
      await addDoc(collection(db, "supportTickets", ref.id, "messages"), { text: message, sender: "user", senderName: name, timestamp: serverTimestamp() });
      await addDoc(collection(db, "supportTickets", ref.id, "messages"), { text: `Ticket #${ref.id.slice(-6).toUpperCase()} created. A support agent will join shortly.`, sender: "system", timestamp: serverTimestamp() });
      await addDoc(collection(db, "adminNotifications"), { type: "support_ticket", ticketId: ref.id, userName: name, userEmail: email, subject, message: `New support ticket from ${name}: "${subject}"`, read: false, createdAt: serverTimestamp() });
      onCreated({ id: ref.id, userId: uid, userEmail: email, userName: name, subject, status: "open", createdAt: new Date(), updatedAt: new Date(), lastMessage: message });
    } catch (e) { setErr("Failed to create ticket. Please try again."); console.error(e); }
    finally { setCreating(false); }
  };

  return (
    <>
      <style>{`
        @keyframes ntm { from{opacity:0;transform:scale(.94) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .ntm-o { position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px; }
        .ntm-b { background:${c.surf};border:1.5px solid ${c.brd};border-radius:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;animation:ntm .3s cubic-bezier(.32,1,.4,1); }
      `}</style>
      <div className="ntm-o" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ntm-b">
          <div style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt }}>New Support Ticket</div>
                <div style={{ fontSize: 12, color: c.sub, marginTop: 3, fontWeight: 600 }}>We typically reply within 2 hours</div>
              </div>
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: "transparent", border: `1px solid ${c.brd}`, color: c.sub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><FiX size={15} /></button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>What's the issue?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUBJECTS.map(s => (
                  <button key={s} onClick={() => { setSubject(s); setErr(""); }}
                    style={{ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${subject === s ? ACCENT : c.brd}`, background: subject === s ? "rgba(255,107,0,0.1)" : "transparent", color: subject === s ? ACCENT : c.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>Describe your issue *</div>
              <textarea value={message} onChange={e => { setMessage(e.target.value); setErr(""); }} placeholder="Tell us exactly what happened and we'll fix it fast…" rows={4}
                style={{ width: "100%", background: c.inp, border: `1.5px solid ${c.inpB}`, borderRadius: 14, padding: "12px 14px", color: c.txt, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            {err && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                <FiAlertCircle size={14} /> {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 14, background: "transparent", border: `1.5px solid ${c.brd}`, color: c.sub, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={create} disabled={creating} style={{ flex: 2, padding: 13, borderRadius: 14, background: creating ? c.dim : `linear-gradient(135deg,${ACCENT},#FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: creating ? "not-allowed" : "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: creating ? "none" : "0 6px 20px rgba(255,107,0,.3)" }}>
                {creating ? "Creating…" : <><FiSend size={14} /> Submit Ticket</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function SupportPage() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const c = {
    bg: dark ? "#0a0a0e" : "#f2f2fa", surf: dark ? "#13131a" : "#ffffff",
    brd: dark ? "#1e1e2c" : "#e0e0ee", txt: dark ? "#eeeef8" : "#111118",
    sub: dark ? "#66668a" : "#7777a2", inp: dark ? "#16161f" : "#f7f7ff",
    inpB: dark ? "#26263a" : "#d4d4ee", dim: dark ? "#30304a" : "#c0c0d8",
  };

  const [settings, setSettings]   = useState<SupportSettings>(DEFAULT_SETTINGS);
  const [tickets,  setTickets]    = useState<SupportTicket[]>([]);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);
  const [showNew,  setShowNew]    = useState(false);
  const [faqOpen,  setFaqOpen]    = useState<number | null>(null);
  const [loading,  setLoading]    = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    getDoc(doc(db, "settings", "support")).then(s => { if (s.exists()) setSettings({ ...DEFAULT_SETTINGS, ...s.data() }); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(collection(db, "supportTickets"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, snap => {
      setTickets(snap.docs.filter(d => d.data().userId === uid).map(d => ({ id: d.id, userId: d.data().userId, userEmail: d.data().userEmail, userName: d.data().userName, subject: d.data().subject, status: d.data().status ?? "open", createdAt: d.data().createdAt?.toDate?.() ?? null, updatedAt: d.data().updatedAt?.toDate?.() ?? null, assignedAdminName: d.data().assignedAdminName, lastMessage: d.data().lastMessage })));
      setLoading(false);
    }, () => setLoading(false));
  }, [uid]);

  const FAQs = [
    { q: "How do I track my order?",             a: "Go to Orders tab → tap your order → you'll see a live tracking map with your rider's location and ETA." },
    { q: "What payment methods are accepted?",   a: "We accept card payments, bank transfer, USSD, and wallet balance via Paystack. You can also top up your Swiftnija wallet for faster checkout." },
    { q: "How long does delivery take?",         a: "Most orders are delivered within 15–45 minutes depending on your distance from the vendor." },
    { q: "What if my order is wrong or missing?",a: "Contact us immediately via chat below or WhatsApp. We'll investigate and arrange a replacement or refund within 24 hours." },
    { q: "How do I become a vendor?",            a: "Visit our website and click 'Become a Vendor' or email us at vendor@swiftnija.com. Our team will review your application within 48 hours." },
    { q: "Can I cancel my order?",               a: "Orders can be cancelled before a rider is assigned. Once a rider is on the way, cancellation may not be possible — contact support immediately." },
  ];

  const active   = tickets.filter(t => t.status !== "resolved");
  const resolved = tickets.filter(t => t.status === "resolved");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes sp-in    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sp-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        .sp-page  { min-height:100vh;font-family:'DM Sans',sans-serif;padding:24px 16px 120px; }
        .sp-wrap  { max-width:680px;margin:0 auto; }
        .faq-item { border-radius:14px;overflow:hidden;margin-bottom:8px;transition:box-shadow .2s; }
        .faq-item:hover { box-shadow:0 4px 16px rgba(255,107,0,.08); }
        .tc        { border-radius:18px;border:1.5px solid;padding:16px 18px;cursor:pointer;transition:all .2s;margin-bottom:10px; }
        .tc:hover  { transform:translateY(-2px);box-shadow:0 8px 24px rgba(255,107,0,.1); }
        @media(min-width:600px){ .sp-page{padding:28px 24px 120px;} }
      `}</style>

      {openTicket  && <ChatModal    ticket={openTicket} onClose={() => setOpenTicket(null)} c={c} dark={dark} />}
      {showNew     && <NewTicketModal onClose={() => setShowNew(false)} onCreated={t => { setShowNew(false); setOpenTicket(t); }} c={c} />}

      <div className="sp-page" style={{ background: c.bg, color: c.txt }}>
        <div className="sp-wrap">

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, animation: "sp-in .3s ease" }}>
            <div style={{ width: 5, height: 44, borderRadius: 4, background: `linear-gradient(180deg,${ACCENT},#FF9A00)`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(24px,6vw,32px)", fontWeight: 900, letterSpacing: -1, color: c.txt, margin: 0 }}>Support</h1>
              <p style={{ fontSize: 13, color: c.sub, fontWeight: 600, marginTop: 2 }}>We're here to help you 24/7</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: settings.isOpen ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1.5px solid ${settings.isOpen ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 20, padding: "6px 14px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: settings.isOpen ? "#10B981" : "#ef4444", display: "inline-block", animation: settings.isOpen ? "sp-pulse 2s infinite" : "none" }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: settings.isOpen ? "#10B981" : "#ef4444" }}>{settings.isOpen ? "Online" : "Offline"}</span>
            </div>
          </div>

          {/* Hours */}
          <div style={{ background: "rgba(255,107,0,0.06)", border: "1.5px solid rgba(255,107,0,0.15)", borderRadius: 16, padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", gap: 12, animation: "sp-in .35s ease .04s both" }}>
            <FiClock size={18} color={ACCENT} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: ACCENT }}>Support Hours</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.txt, marginTop: 2 }}>{settings.workDays} · {settings.openingHours} – {settings.closingHours}</div>
            </div>
          </div>

          {/* Start Chat CTA */}
          <button onClick={() => { if (uid) setShowNew(true); }}
            style={{ width: "100%", padding: "16px 20px", borderRadius: 20, background: uid ? `linear-gradient(135deg,${ACCENT},#FF8C00)` : c.dim, border: "none", color: "white", display: "flex", alignItems: "center", gap: 14, cursor: uid ? "pointer" : "not-allowed", marginBottom: 24, boxShadow: uid ? "0 8px 28px rgba(255,107,0,.3)" : "none", transition: "all .2s", animation: "sp-in .35s ease .06s both" }}
            onMouseEnter={e => { if (uid) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FiMessageCircle size={22} /></div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900 }}>{uid ? "Chat with Support" : "Sign in to chat with Support"}</div>
              <div style={{ fontSize: 12, opacity: .85, marginTop: 2, fontWeight: 600 }}>{uid ? "Create a ticket — avg response < 2 hrs" : "Login required to open a support ticket"}</div>
            </div>
            <FiSend size={18} style={{ flexShrink: 0, opacity: .8 }} />
          </button>

          {/* My Tickets */}
          {uid && (
            <div style={{ marginBottom: 28, animation: "sp-in .35s ease .08s both" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: c.txt, margin: 0 }}>My Tickets</h2>
                {tickets.length > 0 && <span style={{ fontSize: 12, color: c.sub, fontWeight: 600 }}>{active.length} active · {resolved.length} resolved</span>}
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 24, color: c.sub, fontSize: 13 }}>Loading tickets…</div>
              ) : tickets.length === 0 ? (
                <div style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 18, padding: "28px 20px", textAlign: "center" }}>
                  <FiHeadphones size={32} style={{ color: c.dim, marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.txt, marginBottom: 6 }}>No tickets yet</div>
                  <div style={{ fontSize: 12, color: c.sub }}>Create a support ticket and we'll get back to you fast.</div>
                </div>
              ) : (
                <>
                  {active.map(t => {
                    const s = STATUS_CFG[t.status];
                    return (
                      <div key={t.id} className="tc" style={{ background: c.surf, borderColor: t.status === "open" ? "rgba(59,130,246,0.3)" : t.status === "in_progress" ? "rgba(255,107,0,0.3)" : c.brd }} onClick={() => setOpenTicket(t)}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: s.bg, border: `1.5px solid ${s.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}><FiMessageCircle size={18} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: c.txt }}>{t.subject}</span>
                              <StatusBadge status={t.status} />
                            </div>
                            {t.lastMessage && <div style={{ fontSize: 12, color: c.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastMessage}</div>}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: c.sub, fontWeight: 600 }}>#{t.id.slice(-6).toUpperCase()}</span>
                              {t.assignedAdminName && <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><MdVerified size={10} /> {t.assignedAdminName} assigned</span>}
                              {t.updatedAt && <span style={{ fontSize: 10, color: c.sub }}>{t.updatedAt.toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <FiChevronDown size={16} color={c.sub} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
                        </div>
                      </div>
                    );
                  })}

                  {resolved.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>Resolved</div>
                      {resolved.slice(0, 3).map(t => (
                        <div key={t.id} className="tc" style={{ background: dark ? "rgba(16,185,129,0.03)" : "rgba(16,185,129,0.02)", borderColor: "rgba(16,185,129,0.15)", opacity: .85 }} onClick={() => setOpenTicket(t)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <FiCheckCircle size={16} color="#10B981" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: c.txt }}>{t.subject}</span>
                              <span style={{ fontSize: 10, color: c.sub, marginLeft: 8 }}>#{t.id.slice(-6).toUpperCase()}</span>
                            </div>
                            <StatusBadge status="resolved" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Contact Cards */}
          <div style={{ marginBottom: 24, animation: "sp-in .35s ease .1s both" }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: c.txt, margin: "0 0 12px" }}>Contact Information</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { icon: <FiPhone size={18} />,  label: "Phone",   value: settings.phone,   href: `tel:${settings.phone}` },
                { icon: <FiMail size={18} />,   label: "Email",   value: settings.email,   href: `mailto:${settings.email}` },
                { icon: <FiMapPin size={18} />, label: "Address", value: settings.address, href: undefined },
              ].map(({ icon, label, value, href }) => (
                <div key={label} style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 18, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ACCENT; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = c.brd; }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(255,107,0,0.1)", border: "1.5px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 3 }}>{label}</div>
                    {href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 700, color: c.txt, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>{value} <FiExternalLink size={11} color={ACCENT} /></a> : <div style={{ fontSize: 14, fontWeight: 700, color: c.txt }}>{value}</div>}
                  </div>
                  <CopyBtn text={value} />
                </div>
              ))}

              {/* WhatsApp */}
              <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(37,211,102,0.08)", border: "1.5px solid rgba(37,211,102,0.3)", borderRadius: 18, padding: "16px 18px", textDecoration: "none", transition: "box-shadow .2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 20px rgba(37,211,102,.15)"}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none"}>
                <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(37,211,102,0.12)", border: "1.5px solid rgba(37,211,102,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#25D366" }}><RiWhatsappLine size={22} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#25D366", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 3 }}>WhatsApp</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.txt }}>{settings.whatsapp}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginTop: 2 }}>Tap to chat directly on WhatsApp</div>
                </div>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center" }}><FiExternalLink size={14} color="white" /></div>
              </a>
            </div>
          </div>

          {/* FAQs */}
          <div style={{ animation: "sp-in .35s ease .14s both" }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: c.txt, margin: "0 0 14px" }}>Frequently Asked Questions</h2>
            {FAQs.map((f, i) => (
              <div key={i} className="faq-item" style={{ background: c.surf, border: `1.5px solid ${faqOpen === i ? ACCENT : c.brd}` }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: faqOpen === i ? ACCENT : c.txt, lineHeight: 1.4 }}>{f.q}</span>
                  <span style={{ color: faqOpen === i ? ACCENT : c.sub, flexShrink: 0 }}>{faqOpen === i ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}</span>
                </button>
                {faqOpen === i && <div style={{ padding: "0 16px 16px", paddingTop: 12, fontSize: 13.5, fontWeight: 500, color: c.sub, lineHeight: 1.7, borderTop: `1px solid ${c.brd}` }}>{f.a}</div>}
              </div>
            ))}
          </div>
          <div style={{ height: 40 }} />
        </div>
      </div>
    </>
  );
}