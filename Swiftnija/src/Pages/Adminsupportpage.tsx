// pages/admin/AdminSupportPage.tsx
// Plug into your admin dashboard — shows all tickets, lets admin join, reply, and update status.
import { useState, useEffect, useRef } from "react";
import {
  collection, query, orderBy, onSnapshot, doc,
  addDoc, updateDoc, serverTimestamp, getDocs, where,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  FiMessageCircle, FiClock, FiCheckCircle, FiAlertCircle,
  FiSearch, FiFilter, FiSend, FiArrowLeft, FiUser,
  FiRefreshCw, FiX,
} from "react-icons/fi";
import { MdVerified } from "react-icons/md";

type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved";

type Ticket = {
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

type Msg = {
  id: string;
  text: string;
  sender: "user" | "support" | "system";
  senderName?: string;
  timestamp: Date | null;
};

const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string; bdr: string }> = {
  open:        { label: "Open",        color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  bdr: "rgba(59,130,246,0.25)" },
  in_progress: { label: "In Progress", color: "#FF6B00", bg: "rgba(255,107,0,0.1)",   bdr: "rgba(255,107,0,0.25)" },
  on_hold:     { label: "On Hold",     color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  bdr: "rgba(245,158,11,0.25)" },
  resolved:    { label: "Resolved",    color: "#10B981", bg: "rgba(16,185,129,0.1)",  bdr: "rgba(16,185,129,0.25)" },
};

function Badge({ status }: { status: TicketStatus }) {
  const s = STATUS_CFG[status];
  return <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: ".5px", background: s.bg, color: s.color, border: `1px solid ${s.bdr}`, whiteSpace: "nowrap" }}>{s.label}</span>;
}

export default function AdminSupportPage({ C }: { C: Record<string, string> }) {
  const [tickets,    setTickets]    = useState<Ticket[]>([]);
  const [selected,   setSelected]   = useState<Ticket | null>(null);
  const [msgs,       setMsgs]       = useState<Msg[]>([]);
  const [reply,      setReply]      = useState("");
  const [sending,    setSending]    = useState(false);
  const [filter,     setFilter]     = useState<"all" | TicketStatus>("all");
  const [search,     setSearch]     = useState("");
  const [unreadMap,  setUnreadMap]  = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const adminName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Support Agent";

  // Load all tickets
  useEffect(() => {
    const q = query(collection(db, "supportTickets"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, snap => {
      setTickets(snap.docs.map(d => ({
        id: d.id, userId: d.data().userId, userEmail: d.data().userEmail,
        userName: d.data().userName, subject: d.data().subject,
        status: d.data().status ?? "open",
        createdAt: d.data().createdAt?.toDate?.() ?? null,
        updatedAt: d.data().updatedAt?.toDate?.() ?? null,
        assignedAdminName: d.data().assignedAdminName, lastMessage: d.data().lastMessage,
      })));
    });
  }, []);

  // Load messages for selected ticket
  useEffect(() => {
    if (!selected) return;
    const q = query(collection(db, "supportTickets", selected.id, "messages"), orderBy("timestamp", "asc"));
    return onSnapshot(q, snap => {
      setMsgs(snap.docs.map(d => ({ id: d.id, text: d.data().text, sender: d.data().sender, senderName: d.data().senderName, timestamp: d.data().timestamp?.toDate?.() ?? null })));
    });
  }, [selected?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // Join ticket — assign admin and send system message
  const joinTicket = async (ticket: Ticket) => {
    setSelected(ticket);
    if (ticket.assignedAdminName) return; // already assigned
    try {
      await updateDoc(doc(db, "supportTickets", ticket.id), { assignedAdminName: adminName, status: "in_progress", updatedAt: serverTimestamp() });
      await addDoc(collection(db, "supportTickets", ticket.id, "messages"), { text: `${adminName} joined the conversation.`, sender: "system", timestamp: serverTimestamp() });
    } catch (e) { console.error(e); }
  };

  // Send reply
  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    const text = reply.trim(); setReply(""); setSending(true);
    try {
      await addDoc(collection(db, "supportTickets", selected.id, "messages"), { text, sender: "support", senderName: adminName, timestamp: serverTimestamp() });
      await updateDoc(doc(db, "supportTickets", selected.id), { lastMessage: text, updatedAt: serverTimestamp() });
    } catch (e) { console.error(e); } finally { setSending(false); }
  };

  // Change status
  const changeStatus = async (status: TicketStatus) => {
    if (!selected) return;
    await updateDoc(doc(db, "supportTickets", selected.id), { status, updatedAt: serverTimestamp() });
    await addDoc(collection(db, "supportTickets", selected.id, "messages"), {
      text: `Ticket marked as ${STATUS_CFG[status].label} by ${adminName}.`,
      sender: "system", timestamp: serverTimestamp(),
    });
    setSelected(p => p ? { ...p, status } : p);
  };

  const filtered = tickets.filter(t => {
    const matchFilter = filter === "all" || t.status === filter;
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || t.userName.toLowerCase().includes(search.toLowerCase()) || t.userEmail.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts: Record<string, number> = { all: tickets.length, open: 0, in_progress: 0, on_hold: 0, resolved: 0 };
  tickets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  const inpStyle = { width: "100%", padding: "10px 12px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 120px)", minHeight: 500, overflow: "hidden" }}>

      {/* ── LEFT: Ticket List ── */}
      <div style={{ width: selected ? 0 : "100%", maxWidth: 420, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, overflow: "hidden", transition: "width .25s" }}>
        {/* Hide list on mobile when ticket open */}
        <div style={{ display: selected ? "none" : "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
          className="ticket-list-panel">

          {/* Header */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 12 }}>Support Tickets</div>
            <div style={{ position: "relative" }}>
              <FiSearch size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…" style={{ ...inpStyle, paddingLeft: 34 }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "10px 18px", borderBottom: `1px solid ${C.border}`, overflowX: "auto", flexShrink: 0 }}>
            {(["all", "open", "in_progress", "on_hold", "resolved"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filter === f ? "#FF6B00" : C.border}`, background: filter === f ? "rgba(255,107,0,0.1)" : "transparent", color: filter === f ? "#FF6B00" : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                {f === "all" ? "All" : STATUS_CFG[f].label} {counts[f] > 0 && `(${counts[f]})`}
              </button>
            ))}
          </div>

          {/* Ticket items */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted, fontSize: 13 }}>No tickets found</div>
            ) : filtered.map(t => {
              const s = STATUS_CFG[t.status];
              const isSelected = selected?.id === t.id;
              return (
                <div key={t.id} onClick={() => joinTicket(t)}
                  style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: isSelected ? "rgba(255,107,0,0.05)" : "transparent", transition: "background .15s" }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,107,0,0.03)"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, border: `1.5px solid ${s.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
                      <FiMessageCircle size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.subject}</span>
                        <Badge status={t.status} />
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                        <FiUser size={10} /> {t.userName} · {t.userEmail}
                      </div>
                      {t.lastMessage && <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastMessage}</div>}
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>#{t.id.slice(-6).toUpperCase()}</span>
                        {t.assignedAdminName && <span style={{ color: "#3b82f6", display: "flex", alignItems: "center", gap: 2 }}><MdVerified size={9} /> {t.assignedAdminName}</span>}
                        {t.updatedAt && <span style={{ marginLeft: "auto" }}>{t.updatedAt.toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Chat Panel ── */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Chat header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: C.surface }}>
            <button onClick={() => setSelected(null)} style={{ width: 34, height: 34, borderRadius: 9, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FiArrowLeft size={15} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.subject}</div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <FiUser size={10} /> {selected.userName} · {selected.userEmail}
                <span>· #{selected.id.slice(-6).toUpperCase()}</span>
              </div>
            </div>
            <Badge status={selected.status} />

            {/* Status actions */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["in_progress", "on_hold", "resolved"] as TicketStatus[]).map(s => {
                if (s === selected.status) return null;
                const cfg = STATUS_CFG[s];
                return (
                  <button key={s} onClick={() => changeStatus(s)}
                    style={{ padding: "6px 12px", borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.bdr}`, color: cfg.color, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {s === "resolved" ? "✓ Resolve" : s === "on_hold" ? "⏸ Hold" : "▶ Progress"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16, background: C.bg ?? C.surface }}>
            {msgs.map(msg => {
              if (msg.sender === "system") return (
                <div key={msg.id} style={{ textAlign: "center", margin: "12px 0" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: "rgba(255,255,255,0.05)", padding: "5px 14px", borderRadius: 20, border: `1px solid ${C.border}` }}>{msg.text}</span>
                </div>
              );
              const isAdmin = msg.sender === "support";
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isAdmin ? "flex-end" : "flex-start", gap: 3, marginBottom: 14 }}>
                  {!isAdmin && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FiUser size={10} color="white" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{msg.senderName || "Customer"}</span>
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{msg.senderName || adminName}</span>
                      <MdVerified size={12} color="#FF6B00" />
                    </div>
                  )}
                  <div style={{ maxWidth: "72%", background: isAdmin ? "linear-gradient(135deg,#FF6B00,#FF8C00)" : C.surface, border: isAdmin ? "none" : `1.5px solid ${C.border}`, borderRadius: isAdmin ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "11px 15px", boxShadow: isAdmin ? "0 4px 16px rgba(255,107,0,.25)" : "none" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.55, color: isAdmin ? "white" : C.text }}>{msg.text}</div>
                  </div>
                  {msg.timestamp && <span style={{ fontSize: 10, color: C.muted }}>{msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Reply input */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.surface, display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }} placeholder="Type your reply…" disabled={sending} rows={1}
              style={{ flex: 1, ...inpStyle, resize: "none", maxHeight: 100, borderRadius: 12 }} />
            <button onClick={sendReply} disabled={!reply.trim() || sending}
              style={{ width: 40, height: 40, borderRadius: 12, border: "none", flexShrink: 0, background: reply.trim() ? "linear-gradient(135deg,#FF6B00,#FF8C00)" : C.border, display: "flex", alignItems: "center", justifyContent: "center", cursor: reply.trim() ? "pointer" : "not-allowed", boxShadow: reply.trim() ? "0 4px 14px rgba(255,107,0,.3)" : "none" }}>
              <FiSend size={15} color="white" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: C.muted, fontSize: 14 }}>
          <FiMessageCircle size={40} style={{ opacity: .3 }} />
          <div style={{ fontWeight: 600 }}>Select a ticket to start responding</div>
        </div>
      )}
    </div>
  );
}