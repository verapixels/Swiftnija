// AdminEntityDetailPage.tsx
// Full-page detail view for User / Vendor / Rider
// Route: /admin/user/:id  /admin/vendor/:id  /admin/rider/:id
//
// HOW TO ADD ROUTES (in your router file):
//   import AdminEntityDetailPage from "./Pages/AdminEntityDetailPage";
//   <Route path="/admin/user/:id"   element={<AdminEntityDetailPage entityType="user"   />} />
//   <Route path="/admin/vendor/:id" element={<AdminEntityDetailPage entityType="vendor" />} />
//   <Route path="/admin/rider/:id"  element={<AdminEntityDetailPage entityType="rider"  />} />
//
// HOW TO OPEN FROM TABLE ROWS (in UsersPage / VendorsPage / RidersPage):
//   import { useNavigate } from "react-router-dom";
//   const navigate = useNavigate();
//   // on row click:
//   navigate(`/admin/user/${u.id}`);
//   navigate(`/admin/vendor/${v.id}`);
//   navigate(`/admin/rider/${r.id}`);

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, onSnapshot, updateDoc, deleteDoc,
  addDoc, serverTimestamp, limit, Timestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  RiArrowLeftLine, RiUserLine, RiStoreLine, RiBikeLine,
  RiShoppingBagLine, RiTimeLine, RiCodeLine, RiWalletLine,
  RiCheckLine, RiCloseLine, RiDeleteBinLine, RiEditLine,
   RiFileCopyLine, RiDownload2Line, RiAlertLine, RiAlertFill,
  RiVerifiedBadgeLine, RiStarLine, RiBankLine, RiShieldLine,
  RiLockPasswordLine, RiUserForbidLine, RiUserFollowLine,
  RiToggleLine, RiPhoneLine, RiMailLine, RiMapPinLine,
  RiCalendarLine, RiRefreshLine, RiExternalLinkLine,
  RiImageLine, RiInformationLine, RiFlashlightLine,
  RiFileListLine, RiMessageLine, RiGlobalLine,
  RiSendPlaneLine, RiNotificationLine, RiLoader4Line,
} from "react-icons/ri";

// ─── Re-use your existing theme constants ──────────────────────────────────────
// (copy DARK / LIGHT from SwiftAdminDashboard or import them)
const DARK = {
  bg: "#08080f", bgSecondary: "#0d0d1a",
  surface: "rgba(255,255,255,0.03)", surface2: "rgba(255,255,255,0.055)",
  surfaceHover: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.12)", text: "#e8e8f5", textSub: "#9898b8",
  muted: "#4a4a6a", orange: "#FF6B00", orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.12)", green: "#10B981", red: "#EF4444",
  blue: "#3B82F6", yellow: "#F59E0B", purple: "#8B5CF6", cyan: "#06B6D4",
  shadow: "rgba(0,0,0,0.5)", modalBg: "#0d0d1a",
  sidebarBg: "rgba(255,255,255,0.015)", headerBg: "rgba(8,8,15,0.9)",
};
const LIGHT = {
  bg: "#f0f0f8", bgSecondary: "#fafaff",
  surface: "rgba(255,255,255,0.85)", surface2: "rgba(255,255,255,0.95)",
  surfaceHover: "rgba(255,107,0,0.04)", border: "rgba(0,0,0,0.07)",
  borderStrong: "rgba(0,0,0,0.14)", text: "#12121e", textSub: "#4a4a6a",
  muted: "#8888aa", orange: "#FF6B00", orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.1)", green: "#059669", red: "#DC2626",
  blue: "#2563EB", yellow: "#D97706", purple: "#7C3AED", cyan: "#0891B2",
  shadow: "rgba(0,0,0,0.1)", modalBg: "#ffffff",
  sidebarBg: "rgba(255,255,255,0.7)", headerBg: "rgba(240,240,248,0.9)",
};

type C = typeof DARK;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` :
  n >= 1e3 ? `₦${(n / 1e3).toFixed(1)}K` :
  `₦${n.toLocaleString()}`;

const ago = (ts: any) => {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const fmtDate = (ts: any) => {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDateTime = (ts: any) => {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const isTs = (v: any) => v && typeof v === "object" && typeof v.toDate === "function";

const isImg = (v: any) =>
  typeof v === "string" && v.startsWith("http") &&
  (/\.(jpg|jpeg|png|webp|gif)/i.test(v) ||
    v.includes("firebasestorage") || v.includes("cloudinary"));

const serializeVal = (v: any): any => {
  if (isTs(v)) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serializeVal);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, serializeVal(val)]));
  }
  return v;
};

const renderVal = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓ Yes" : "✗ No";
  if (isTs(v)) return fmtDateTime(v);
  if (typeof v === "number") return v.toLocaleString();
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v) || "—";
};

// Status colours
const SC: Record<string, [string, string]> = {
  active:      ["rgba(16,185,129,0.15)",  "#10B981"],
  online:      ["rgba(16,185,129,0.15)",  "#10B981"],
  verified:    ["rgba(59,130,246,0.15)",  "#3B82F6"],
  approved:    ["rgba(16,185,129,0.15)",  "#10B981"],
  banned:      ["rgba(239,68,68,0.15)",   "#EF4444"],
  rejected:    ["rgba(239,68,68,0.15)",   "#EF4444"],
  inactive:    ["rgba(100,100,130,0.15)", "#8888aa"],
  offline:     ["rgba(100,100,130,0.15)", "#8888aa"],
  pending:     ["rgba(245,158,11,0.15)",  "#F59E0B"],
  delivered:   ["rgba(16,185,129,0.15)",  "#10B981"],
  cancelled:   ["rgba(239,68,68,0.15)",   "#EF4444"],
  "in-transit":["rgba(59,130,246,0.15)",  "#3B82F6"],
  processing:  ["rgba(245,158,11,0.15)",  "#F59E0B"],
  disputed:    ["rgba(239,68,68,0.2)",    "#EF4444"],
  refunded:    ["rgba(139,92,246,0.15)",  "#8B5CF6"],
};

function Pill({ status, size = 11 }: { status: string; size?: number }) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "-");
  const [bg, color] = SC[key] ?? ["rgba(100,100,130,0.15)", "#8888aa"];
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 40,
      fontSize: size, fontWeight: 800, background: bg, color,
      textTransform: "uppercase", letterSpacing: 0.6,
      border: `1px solid ${color}30`, whiteSpace: "nowrap",
    }}>
      {status || "unknown"}
    </span>
  );
}

function Av({ src, name, size = 60, C }: { src?: string | null; name?: string | null; size?: number; C: C }) {
  const letters = (name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const palette = [C.orange, C.blue, C.purple, C.green, C.yellow, C.cyan];
  const bg = palette[(name || "?").charCodeAt(0) % palette.length];
  if (src?.startsWith("http")) {
    return (
      <img src={src} alt={name ?? ""} style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", border: `3px solid ${bg}55`, flexShrink: 0,
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 900, fontSize: size * 0.34,
      border: `3px solid ${bg}55`, flexShrink: 0,
    }}>
      {letters}
    </div>
  );
}

// ─── Reusable section wrapper ─────────────────────────────────────────────────
function Section({ title, icon, children, C: colors, accent }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode;
  C: C; accent?: string;
}) {
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 18, overflow: "hidden",
      boxShadow: `0 2px 16px ${colors.shadow}`,
    }}>
      <div style={{
        padding: "14px 20px", borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "center", gap: 8,
        background: colors.surface2,
      }}>
        {icon && <span style={{ color: accent || colors.orange }}>{icon}</span>}
        <span style={{
          color: colors.text, fontWeight: 800, fontSize: 13,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{title}</span>
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({ label, value, C: colors, highlight, mono, img }: {
  label: string; value: any; C: C;
  highlight?: boolean; mono?: boolean; img?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const str = renderVal(value);

  const copy = () => {
    navigator.clipboard.writeText(str === "—" ? "" : str);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div style={{
      display: "flex", gap: 14, padding: "10px 0",
      borderBottom: `1px solid ${colors.border}`,
      alignItems: img && isImg(value) ? "flex-start" : "center",
    }}>
      <div style={{
        width: 140, flexShrink: 0,
        color: colors.muted, fontSize: 11, fontWeight: 800,
        textTransform: "uppercase", letterSpacing: 0.6,
      }}>
        {label.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
      </div>
      <div style={{ flex: 1 }}>
        {isImg(value) ? (
          <img src={value} alt={label} style={{
            maxWidth: 130, height: 80, borderRadius: 10,
            objectFit: "cover", border: `1px solid ${colors.border}`,
            cursor: "pointer",
          }} onClick={() => window.open(value, "_blank")} />
        ) : (
          <span style={{
            color: highlight ? colors.orange : colors.text,
            fontSize: 13,
            fontFamily: mono ? "monospace" : "'DM Sans', sans-serif",
            fontWeight: highlight ? 800 : 400,
            wordBreak: "break-all",
          }}>
            {str}
          </span>
        )}
      </div>
      {str !== "—" && (
        <button onClick={copy} style={{
          background: "none", border: "none", cursor: "pointer",
          color: copied ? colors.green : colors.muted,
          flexShrink: 0, padding: 4,
        }}>
          {copied ? <RiCheckLine size={13} /> : <RiFileCopyLine size={13} />}
        </button>
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon, C: colors }: {
  label: string; value: string | number; color: string;
  icon: React.ReactNode; C: C;
}) {
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 16, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: `0 2px 12px ${colors.shadow}`,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${color}18`, display: "flex",
        alignItems: "center", justifyContent: "center",
        color, border: `1px solid ${color}28`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: 22, fontWeight: 900, color,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{value}</div>
        <div style={{
          fontSize: 10, fontWeight: 800, color: colors.muted,
          textTransform: "uppercase", letterSpacing: 0.6,
        }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose, C: colors }: {
  msg: string; type: "success" | "error" | "info"; onClose: () => void; C: C;
}) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const col = { success: colors.green, error: colors.red, info: colors.blue }[type];
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 99999,
      background: colors.modalBg, border: `1px solid ${col}44`,
      borderRadius: 14, padding: "13px 18px", maxWidth: 340,
      boxShadow: `0 8px 28px ${colors.shadow}`,
      display: "flex", alignItems: "center", gap: 10,
      backdropFilter: "blur(16px)",
    }}>
      <span style={{ color: col }}>{type === "success" ? <RiCheckLine size={16} /> : <RiAlertLine size={16} />}</span>
      <span style={{ color: colors.text, fontSize: 13 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: colors.muted, cursor: "pointer", marginLeft: "auto" }}>
        <RiCloseLine size={15} />
      </button>
    </div>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function Confirm({ message, sub, onConfirm, onCancel, danger = true, C: colors }: {
  message: string; sub?: string;
  onConfirm: () => void; onCancel: () => void;
  danger?: boolean; C: C;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      zIndex: 99990, display: "flex", alignItems: "center",
      justifyContent: "center", backdropFilter: "blur(8px)",
    }}>
      <div style={{
        background: colors.modalBg,
        border: `1px solid ${danger ? colors.red : colors.green}44`,
        borderRadius: 22, padding: 32, maxWidth: 380,
        width: "90%", textAlign: "center",
        boxShadow: `0 20px 60px ${colors.shadow}`,
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: "50%",
          background: `${danger ? colors.red : colors.green}15`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", color: danger ? colors.red : colors.green,
        }}>
          <RiAlertFill size={24} />
        </div>
        <div style={{ color: colors.text, fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{message}</div>
        {sub && <div style={{ color: colors.muted, fontSize: 13, marginBottom: 22 }}>{sub}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: sub ? 0 : 22 }}>
          <button onClick={onCancel} style={{
            padding: "10px 22px", borderRadius: 12,
            background: colors.surface2, border: `1px solid ${colors.border}`,
            color: colors.muted, fontWeight: 700, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: "10px 22px", borderRadius: 12,
            background: danger ? colors.red : colors.green,
            border: "none", color: "#fff", fontWeight: 700, cursor: "pointer",
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ─── Order mini-card ──────────────────────────────────────────────────────────
function OrderCard({ order, C: colors }: { order: any; C: C }) {
  const display = order.orderNumber
    ? `#${order.orderNumber}`
    : `#${(order.id || "").slice(-8).toUpperCase()}`;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: colors.surface2,
      border: `1px solid ${order.disputed ? colors.red + "44" : colors.border}`,
      borderRadius: 13, marginBottom: 8,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: `${colors.orange}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: colors.orange, flexShrink: 0,
      }}>
        <RiShoppingBagLine size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: colors.orange, fontWeight: 800, fontSize: 13,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{display}</div>
        <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
          {order.vendorName || order.customerName || "—"} · {ago(order.createdAt)}
        </div>
        {order.deliveryAddress && (
          <div style={{ color: colors.muted, fontSize: 11, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
            <RiMapPinLine size={10} />
            {String(order.deliveryAddress).slice(0, 55)}{order.deliveryAddress.length > 55 ? "…" : ""}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ color: colors.orange, fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
          {fmt(order.total || 0)}
        </div>
        <Pill status={order.disputed ? "disputed" : order.status || "pending"} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
interface Props {
  entityType: "user" | "vendor" | "rider";
}

type Tab = "overview" | "orders" | "activity" | "raw" | "support";

export default function AdminEntityDetailPage({ entityType }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = (localStorage.getItem("swiftadmin_theme") || "dark") as "dark" | "light";
  const C = theme === "dark" ? DARK : LIGHT;

  const [entity, setEntity]         = useState<Record<string, any> | null>(null);
  const [adminUser, setAdminUser]   = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>("overview");
  const [orders, setOrders]         = useState<any[]>([]);
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs]   = useState<any[]>([]);
  const [tickets, setTickets]       = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingLogs, setLoadingLogs]     = useState(false);
  const [toast, setToast]           = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [confirm, setConfirm]       = useState<{ msg: string; sub?: string; fn: () => void } | null>(null);
  const [editField, setEditField]   = useState<{ key: string; val: string } | null>(null);
  const [statusEdit, setStatusEdit] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info") =>
    setToast({ msg, type }), []);

  const collectionName = entityType === "user" ? "users" : entityType === "vendor" ? "vendors" : "riders";

  // ── Auth
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async u => {
      if (!u) { navigate("/admin/login"); return; }
      const snap = await getDoc(doc(db, "admins", u.uid));
      if (snap.exists()) setAdminUser({ uid: u.uid, ...snap.data() });
    });
    return unsub;
  }, [navigate]);

  // ── Load entity
  const loadEntity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const snap = await getDoc(doc(db, collectionName, id));
    if (snap.exists()) setEntity({ id: snap.id, ...snap.data() });
    setLoading(false);
  }, [id, collectionName]);

  useEffect(() => { loadEntity(); }, [loadEntity]);

  const refresh = async () => {
    setRefreshing(true);
    await loadEntity();
    setRefreshing(false);
    showToast("Refreshed", "info");
  };

  // ── Live active orders (for the "on the phone" use-case)
  useEffect(() => {
    if (!id) return;
    const activeStatuses = ["pending", "processing", "in-transit", "confirmed", "picked", "ready"];
    const fields =
      entityType === "user"   ? ["userId", "customerId"] :
      entityType === "vendor" ? ["vendorId"] :
      ["riderId"];

    const unsubs = fields.map(field =>
      onSnapshot(
        query(
          collection(db, "orders"),
          where(field, "==", id),
          where("status", "in", activeStatuses),
          orderBy("createdAt", "desc"),
          limit(10)
        ),
        snap => setLiveOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        () => {}
      )
    );
    return () => unsubs.forEach(u => u());
  }, [id, entityType]);

  // ── All orders
  useEffect(() => {
    if (tab !== "orders" || !id) return;
    setLoadingOrders(true);
    const fields =
      entityType === "user"   ? ["userId", "customerId", "uid"] :
      entityType === "vendor" ? ["vendorId"] :
      ["riderId"];

    Promise.all(
      fields.map(field =>
        getDocs(
          query(collection(db, "orders"), where(field, "==", id),
            orderBy("createdAt", "desc"), limit(100))
        ).catch(() => null)
      )
    ).then(results => {
      const seen = new Set<string>();
      const all: any[] = [];
      results.forEach(snap => {
        snap?.forEach(d => {
          if (!seen.has(d.id)) { seen.add(d.id); all.push({ id: d.id, ...d.data() }); }
        });
      });
      all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(all);
      setLoadingOrders(false);
    });
  }, [tab, id, entityType]);

  // ── Audit logs
  useEffect(() => {
    if (tab !== "activity" || !id) return;
    setLoadingLogs(true);
    getDocs(query(
      collection(db, "auditLogs"),
      where("targetId", "==", id),
      orderBy("createdAt", "desc"),
      limit(200)
    )).then(snap => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingLogs(false);
    }).catch(() => setLoadingLogs(false));
  }, [tab, id]);

  // ── Support tickets
  useEffect(() => {
    if (tab !== "support" || !id) return;
    getDocs(query(
      collection(db, "supportTickets"),
      where("userId", "==", id),
      orderBy("updatedAt", "desc"),
      limit(30)
    )).then(snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    .catch(() => {});
  }, [tab, id]);

  // ── Audit logger
  const logAudit = async (action: string, details?: string) => {
    if (!adminUser || !entity) return;
    const name = entity.fullName || entity.displayName || entity.businessName || id;
    try {
      await addDoc(collection(db, "auditLogs"), {
        adminId: adminUser.uid,
        adminName: adminUser.displayName || adminUser.email || "Admin",
        adminRole: adminUser.role || "admin",
        action, targetType: entityType,
        targetId: id, targetName: name,
        details: details || "",
        createdAt: serverTimestamp(),
      });
    } catch {}
  };

  // ── Permissions
  const canDo = (action: string) => {
    if (!adminUser) return false;
    if (adminUser.role === "superadmin") return true;
    if (adminUser.permissions?.[action]) return true;
    const tp = adminUser.tempPermissions?.[action];
    if (tp?.granted) {
      if (tp.expiresAt) {
        const exp = tp.expiresAt.toDate ? tp.expiresAt.toDate() : new Date(tp.expiresAt);
        if (new Date() > exp) return false;
      }
      return true;
    }
    return false;
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const updateStatus = async (status: string) => {
    if (!id) return;
    await updateDoc(doc(db, collectionName, id), { status });
    await logAudit(`${entityType}_status_changed`, `→ ${status}`);
    setEntity(e => e ? { ...e, status } : e);
    showToast(`Status updated to ${status}`, "success");
    setStatusEdit(false);
  };

  const handleBan = () => {
    setConfirm({
      msg: `Ban this ${entityType}?`,
      sub: "They will lose all platform access immediately.",
      fn: () => updateStatus("banned"),
    });
  };

  const handleUnban = () => updateStatus("active");

  const handleDelete = () => {
    if (!canDo("canDeleteUsers")) {
      showToast("You need Super Admin permission to delete", "error");
      return;
    }
    setConfirm({
      msg: `Permanently delete this ${entityType}?`,
      sub: "This cannot be undone. All data will be removed.",
      fn: async () => {
        await deleteDoc(doc(db, collectionName, id!));
        await logAudit(`${entityType}_deleted`);
        showToast(`${entityType} deleted`, "info");
        navigate(-1);
      },
    });
  };

  const handleVerify = async () => {
    await updateDoc(doc(db, "vendors", id!), { verified: true, status: "active" });
    await logAudit("vendor_verified");
    setEntity(e => e ? { ...e, verified: true, status: "active" } : e);
    showToast("Vendor verified & approved", "success");
  };

  const handleApproveRider = async () => {
    await updateDoc(doc(db, "riders", id!), { approved: true, status: "active" });
    await logAudit("rider_approved");
    setEntity(e => e ? { ...e, approved: true, status: "active" } : e);
    showToast("Rider approved", "success");
  };

  const handleUnlinkBank = () => {
    if (!canDo("canUnlinkBankAccount")) { showToast("Permission required", "error"); return; }
    setConfirm({
      msg: "Unlink bank account?",
      sub: "Vendor will need to re-link their bank before withdrawals.",
      fn: async () => {
        await updateDoc(doc(db, "vendors", id!), {
          bankLinked: false, bankName: "", accountNumber: "",
        });
        await logAudit("vendor_bank_unlinked");
        setEntity(e => e ? { ...e, bankLinked: false } : e);
        showToast("Bank unlinked", "success");
      },
    });
  };

  const handleForceOnline = async (online: boolean) => {
    if (!canDo("canForceRiderOnline")) { showToast("Permission required", "error"); return; }
    await updateDoc(doc(db, "riders", id!), { isOnline: online });
    await logAudit("rider_force_online", `Forced ${online ? "online" : "offline"}`);
    setEntity(e => e ? { ...e, isOnline: online } : e);
    showToast(`Rider forced ${online ? "online" : "offline"}`, "info");
  };

  const handleSaveField = async () => {
    if (!editField || !id) return;
    await updateDoc(doc(db, collectionName, id), { [editField.key]: editField.val });
    await logAudit("field_edited", `${editField.key} updated`);
    setEntity(e => e ? { ...e, [editField.key]: editField.val } : e);
    showToast("Field updated", "success");
    setEditField(null);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "info");
  };

  const exportJSON = () => {
    if (!entity) return;
    const blob = new Blob(
      [JSON.stringify(Object.fromEntries(
        Object.entries(entity).map(([k, v]) => [k, serializeVal(v)])
      ), null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityType}_${id?.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  if (loading || !entity) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16, fontFamily: "'DM Sans', sans-serif",
      }}>
        <RiLoader4Line size={36} color={C.orange} style={{ animation: "spin 1s linear infinite" }} />
        <div style={{ color: C.muted, fontSize: 14 }}>Loading {entityType} details…</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  const name = entity.fullName || entity.displayName || entity.businessName || "Unknown";
  const email = entity.email || "";
  const phone = entity.phone || "";
  const photo = entity.photoURL || entity.logo || entity.profileImage || null;
  const mainStatus =
    entityType === "rider" && entity.isOnline ? "online" :
    entityType === "vendor" && entity.verified ? "verified" :
    entity.status || "active";

  // All field keys in display order
  const SKIP = new Set(["id"]);
  const PRIORITY: Record<string, string[]> = {
    user: ["fullName","displayName","email","phone","status","address","bio","orderCount","createdAt","updatedAt"],
    vendor: ["businessName","fullName","email","phone","status","verified","blueBadge","category","city","address","bio","bankLinked","bankName","accountNumber","createdAt"],
    rider: ["fullName","email","phone","status","approved","isOnline","vehicleType","rating","deliveryCount","idType","idNumber","createdAt"],
  };
  const pKeys = PRIORITY[entityType] || [];
  const allKeys = Object.keys(entity).filter(k => !SKIP.has(k));
  const extraKeys = allKeys.filter(k => !pKeys.includes(k));
  const orderedKeys = [...pKeys.filter(k => entity[k] !== undefined), ...extraKeys];
  const imageKeys = allKeys.filter(k => isImg(entity[k]));

  // Order stats
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === "delivered").length;
  const cancelledOrders = orders.filter(o => o.status === "cancelled").length;
  const orderRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview",  label: "Overview",  icon: <RiUserLine size={14} /> },
    { key: "orders",    label: entityType === "rider" ? "Deliveries" : "Orders", icon: <RiShoppingBagLine size={14} /> },
    { key: "activity",  label: "Activity",  icon: <RiTimeLine size={14} /> },
    { key: "support",   label: "Support Tickets", icon: <RiMessageLine size={14} /> },
    { key: "raw",       label: "Raw Data",  icon: <RiCodeLine size={14} /> },
  ];

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 13px",
    background: C.surface2, border: `1px solid ${C.borderStrong}`,
    borderRadius: 10, color: C.text, fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'DM Sans', sans-serif", color: C.text,
    }}>
      {/* ── Top nav bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 28px",
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(16px)",
      }}>
        <button onClick={() => navigate(-1)} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "8px 14px", borderRadius: 10,
          background: C.surface2, border: `1px solid ${C.border}`,
          color: C.muted, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          <RiArrowLeftLine size={15} /> Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.muted, fontSize: 13 }}>
            {entityType === "user" ? "Users" : entityType === "vendor" ? "Vendors" : "Riders"}
          </span>
          <span style={{ color: C.muted }}>/</span>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{name}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Live orders badge */}
        {liveOrders.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 14px",
            background: `${C.orange}18`,
            border: `1px solid ${C.orange}44`,
            borderRadius: 20,
            animation: "pulse 2s infinite",
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: C.orange,
            }} />
            <span style={{ color: C.orange, fontSize: 12, fontWeight: 800 }}>
              {liveOrders.length} ACTIVE ORDER{liveOrders.length > 1 ? "S" : ""}
            </span>
          </div>
        )}

        <button onClick={refresh} style={{
          width: 36, height: 36, borderRadius: 10,
          background: C.surface2, border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: C.muted, cursor: "pointer",
        }}>
          <RiRefreshLine size={16} style={refreshing ? { animation: "spin 1s linear infinite" } : {}} />
        </button>

        <button onClick={exportJSON} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10,
          background: C.surface2, border: `1px solid ${C.border}`,
          color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          <RiDownload2Line size={14} /> Export JSON
        </button>
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Hero card ── */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22, overflow: "hidden",
          marginBottom: 24,
          boxShadow: `0 4px 24px ${C.shadow}`,
        }}>
          {/* Cover photo for vendors */}
          {entityType === "vendor" && entity.coverPhoto && (
            <div style={{
              height: 120,
              backgroundImage: `url(${entity.coverPhoto})`,
              backgroundSize: "cover", backgroundPosition: "center",
              borderBottom: `1px solid ${C.border}`,
            }} />
          )}

          <div style={{ padding: "24px 28px" }}>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Av src={photo} name={name} size={72} C={C} />

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <h1 style={{
                    color: C.text, fontWeight: 900, fontSize: 26,
                    fontFamily: "'Space Grotesk', sans-serif", margin: 0,
                  }}>{name}</h1>
                  {entityType === "vendor" && entity.blueBadge && (
                    <RiVerifiedBadgeLine size={22} color={C.blue} />
                  )}
                  <Pill status={mainStatus} size={12} />
                  {entityType === "rider" && (
                    <Pill status={entity.approved ? "approved" : "pending"} size={11} />
                  )}
                </div>

                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {email && (
                    <span style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                      <RiMailLine size={13} color={C.orange} /> {email}
                      <button onClick={() => copyText(email)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0 }}>
                        <RiFileCopyLine size={12} />
                      </button>
                    </span>
                  )}
                  {phone && (
                    <span style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                      <RiPhoneLine size={13} color={C.blue} /> {phone}
                      <button onClick={() => copyText(phone)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0 }}>
                        <RiFileCopyLine size={12} />
                      </button>
                    </span>
                  )}
                  {(entity.address || entity.city) && (
                    <span style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                      <RiMapPinLine size={13} color={C.green} />
                      {entity.address || entity.city}
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <RiCalendarLine size={12} color={C.muted} />
                  <span style={{ color: C.muted, fontSize: 12 }}>
                    Joined {fmtDate(entity.createdAt)}
                  </span>
                  <span style={{ color: C.muted, fontSize: 12, marginLeft: 8,
                    padding: "1px 8px", background: C.surface2,
                    borderRadius: 6, border: `1px solid ${C.border}`,
                    cursor: "pointer",
                  }} onClick={() => copyText(id!)}>
                    UID: {id?.slice(0, 14)}…
                  </span>
                </div>

                {entity.bio && (
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                    {entity.bio}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {entity.status !== "banned" ? (
                  <button onClick={handleBan} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.red}15`, border: `1px solid ${C.red}28`,
                    color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiUserForbidLine size={14} /> Ban Account
                  </button>
                ) : (
                  <button onClick={handleUnban} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.green}15`, border: `1px solid ${C.green}28`,
                    color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiUserFollowLine size={14} /> Unban Account
                  </button>
                )}

                {entityType === "vendor" && !entity.verified && (
                  <button onClick={handleVerify} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.green}15`, border: `1px solid ${C.green}28`,
                    color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiCheckLine size={14} /> Verify Vendor
                  </button>
                )}

                {entityType === "vendor" && entity.bankLinked && (
                  <button onClick={handleUnlinkBank} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.yellow}15`, border: `1px solid ${C.yellow}28`,
                    color: C.yellow, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiBankLine size={14} /> Unlink Bank
                  </button>
                )}

                {entityType === "rider" && !entity.approved && (
                  <button onClick={handleApproveRider} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.green}15`, border: `1px solid ${C.green}28`,
                    color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiCheckLine size={14} /> Approve Rider
                  </button>
                )}

                {entityType === "rider" && (
                  <button onClick={() => handleForceOnline(!entity.isOnline)} style={{
                    padding: "9px 18px", borderRadius: 11,
                    background: `${C.cyan}15`, border: `1px solid ${C.cyan}28`,
                    color: C.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <RiToggleLine size={14} />
                    Force {entity.isOnline ? "Offline" : "Online"}
                  </button>
                )}

                <button onClick={handleDelete} style={{
                  padding: "9px 18px", borderRadius: 11,
                  background: `${C.red}10`, border: `1px solid ${C.red}22`,
                  color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <RiDeleteBinLine size={14} /> Delete {entityType}
                </button>
              </div>
            </div>

            {/* ── LIVE ORDERS ALERT STRIP ── */}
            {liveOrders.length > 0 && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: `${C.orange}0e`,
                border: `1px solid ${C.orange}44`,
                borderRadius: 14,
              }}>
                <div style={{
                  color: C.orange, fontWeight: 800, fontSize: 13,
                  marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <RiAlertFill size={15} />
                  Active Orders Right Now — use this when they call in
                </div>
                {liveOrders.map(o => <OrderCard key={o.id} order={o} C={C} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12, marginBottom: 24,
        }}>
          {entityType !== "vendor" && (
            <StatCard
              label={entityType === "rider" ? "Deliveries" : "Total Orders"}
              value={orders.length > 0 ? orders.length : "—"}
              color={C.blue} icon={<RiShoppingBagLine size={18} />} C={C}
            />
          )}
          <StatCard
            label="Completed"
            value={orders.length > 0 ? deliveredOrders : "—"}
            color={C.green} icon={<RiCheckLine size={18} />} C={C}
          />
          <StatCard
            label="Cancelled"
            value={orders.length > 0 ? cancelledOrders : "—"}
            color={C.red} icon={<RiCloseLine size={18} />} C={C}
          />
          <StatCard
            label={entityType === "rider" ? "Earnings Handled" : "Total Spent"}
            value={orders.length > 0 ? fmt(orderRevenue) : "—"}
            color={C.orange} icon={<RiWalletLine size={18} />} C={C}
          />
          {entityType === "rider" && (
            <StatCard
              label="Rating"
              value={entity.rating ? `${Number(entity.rating).toFixed(1)}★` : "—"}
              color={C.yellow} icon={<RiStarLine size={18} />} C={C}
            />
          )}
          {entityType === "vendor" && (
            <StatCard
              label="Blue Badge"
              value={entity.blueBadge ? "Yes" : "No"}
              color={entity.blueBadge ? C.blue : C.muted}
              icon={<RiVerifiedBadgeLine size={18} />} C={C}
            />
          )}
          <StatCard
            label="Joined"
            value={fmtDate(entity.createdAt)}
            color={C.purple} icon={<RiCalendarLine size={18} />} C={C}
          />
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 20,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: 4,
          overflowX: "auto",
        }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 18px", borderRadius: 11,
              background: tab === t.key ? C.orangeGlow : "transparent",
              border: tab === t.key ? `1px solid ${C.orange}44` : "1px solid transparent",
              color: tab === t.key ? C.orange : C.muted,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: "nowrap", transition: "all 0.2s",
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ════ OVERVIEW TAB ════ */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Left col */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Photos */}
              {imageKeys.length > 0 && (
                <Section title="Photos & Documents" icon={<RiImageLine size={16} />} C={C}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {imageKeys.map(k => (
                      <div key={k} style={{ textAlign: "center" }}>
                        <img
                          src={entity[k]} alt={k}
                          style={{
                            width: k === "coverPhoto" || k === "logo" ? 120 : 90,
                            height: 80, borderRadius: 10, objectFit: "cover",
                            border: `1px solid ${C.border}`, cursor: "pointer",
                            display: "block",
                          }}
                          onClick={() => window.open(entity[k], "_blank")}
                        />
                        <div style={{ color: C.muted, fontSize: 10, marginTop: 5, textTransform: "capitalize" }}>
                          {k.replace(/([A-Z])/g, " $1").trim()}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Core info */}
              <Section title="Profile Information" icon={<RiUserLine size={16} />} C={C}>
                {/* Status editor */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 4,
                }}>
                  <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                    Status
                  </span>
                  {statusEdit ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["active", "inactive", "banned", "suspended"].map(s => (
                        <button key={s} onClick={() => updateStatus(s)} style={{
                          padding: "4px 12px", borderRadius: 8,
                          background: C.surface2, border: `1px solid ${C.border}`,
                          color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}>{s}</button>
                      ))}
                      <button onClick={() => setStatusEdit(false)} style={{
                        padding: "4px 8px", borderRadius: 8,
                        background: "none", border: `1px solid ${C.border}`,
                        color: C.muted, cursor: "pointer",
                      }}><RiCloseLine size={13} /></button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Pill status={entity.status || "active"} />
                      <button onClick={() => setStatusEdit(true)} style={{
                        padding: "3px 10px", borderRadius: 7,
                        background: "none", border: `1px solid ${C.border}`,
                        color: C.muted, fontSize: 11, cursor: "pointer",
                      }}>Edit</button>
                    </div>
                  )}
                </div>

                {orderedKeys
                  .filter(k => !imageKeys.includes(k))
                  .map(k => {
                    const val = entity[k];
                    const isEditable = ["fullName","displayName","businessName","phone","city","address","bio","category","vehicleType"].includes(k);
                    return (
                      <div key={k} style={{ position: "relative" }}>
                        {editField?.key === k ? (
                          <div style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
                              {k}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                value={editField.val}
                                onChange={e => setEditField(f => f ? { ...f, val: e.target.value } : f)}
                                style={{ ...inp, flex: 1 }}
                                autoFocus
                              />
                              <button onClick={handleSaveField} style={{
                                padding: "8px 14px", borderRadius: 9,
                                background: C.green, border: "none",
                                color: "#fff", fontWeight: 700, cursor: "pointer",
                              }}><RiCheckLine size={14} /></button>
                              <button onClick={() => setEditField(null)} style={{
                                padding: "8px 12px", borderRadius: 9,
                                background: C.surface2, border: `1px solid ${C.border}`,
                                color: C.muted, cursor: "pointer",
                              }}><RiCloseLine size={14} /></button>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            display: "flex", alignItems: "center",
                            padding: "9px 0", borderBottom: `1px solid ${C.border}`,
                            gap: 10,
                          }}>
                            <div style={{ width: 130, flexShrink: 0, color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                            </div>
                            <div style={{ flex: 1, color: C.text, fontSize: 13, wordBreak: "break-all" }}>
                              {renderVal(val)}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              {isEditable && (
                                <button onClick={() => setEditField({ key: k, val: String(val ?? "") })} style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: C.muted, padding: 3,
                                }}>
                                  <RiEditLine size={12} />
                                </button>
                              )}
                              {val !== undefined && val !== null && val !== "" && (
                                <button onClick={() => copyText(renderVal(val))} style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: C.muted, padding: 3,
                                }}>
                                  <RiFileCopyLine size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </Section>
            </div>

            {/* Right col */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Recent live orders */}
              {liveOrders.length > 0 && (
                <Section
                  title={`🔴 Live — ${liveOrders.length} Active Order${liveOrders.length > 1 ? "s" : ""}`}
                  icon={<RiAlertFill size={15} />} C={C} accent={C.orange}
                >
                  {liveOrders.map(o => <OrderCard key={o.id} order={o} C={C} />)}
                </Section>
              )}

              {/* Vendor-specific */}
              {entityType === "vendor" && (
                <Section title="Store Details" icon={<RiStoreLine size={16} />} C={C} accent={C.blue}>
                  <Field label="Category" value={entity.category} C={C} />
                  <Field label="City" value={entity.city} C={C} />
                  <Field label="Verified" value={entity.verified} C={C} highlight={entity.verified} />
                  <Field label="Blue Badge" value={entity.blueBadge} C={C} highlight={entity.blueBadge} />
                  <Field label="Bank Linked" value={entity.bankLinked} C={C} highlight={entity.bankLinked} />
                  {entity.bankLinked && (
                    <>
                      <Field label="Bank Name" value={entity.bankName} C={C} />
                      <Field label="Account No." value={entity.accountNumber} C={C} mono />
                    </>
                  )}
                  {entity.bankLinked && (
                    <div style={{ marginTop: 10 }}>
                      <button onClick={handleUnlinkBank} style={{
                        padding: "8px 16px", borderRadius: 10,
                        background: `${C.red}10`, border: `1px solid ${C.red}22`,
                        color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <RiBankLine size={13} /> Unlink Bank Account
                      </button>
                    </div>
                  )}
                </Section>
              )}

              {/* Rider-specific */}
              {entityType === "rider" && (
                <Section title="Rider Info" icon={<RiBikeLine size={16} />} C={C} accent={C.green}>
                  <Field label="Vehicle" value={entity.vehicleType} C={C} />
                  <Field label="Rating" value={entity.rating ? `${Number(entity.rating).toFixed(1)} ★` : "—"} C={C} highlight />
                  <Field label="Deliveries" value={entity.deliveryCount} C={C} />
                  <Field label="Online Now" value={entity.isOnline} C={C} highlight={entity.isOnline} />
                  <Field label="Approved" value={entity.approved} C={C} highlight={entity.approved} />
                  {entity.idType && (
                    <>
                      <Field label="ID Type" value={entity.idType} C={C} />
                      <Field label="ID Number" value={entity.idNumber} C={C} mono />
                    </>
                  )}
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button onClick={() => handleForceOnline(!entity.isOnline)} style={{
                      padding: "8px 14px", borderRadius: 10,
                      background: `${C.cyan}12`, border: `1px solid ${C.cyan}28`,
                      color: C.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <RiToggleLine size={13} /> Force {entity.isOnline ? "Offline" : "Online"}
                    </button>
                  </div>
                </Section>
              )}

              {/* Extra unknown fields */}
              {extraKeys.filter(k => !imageKeys.includes(k) && !["idType","idNumber","vehicleType","rating","deliveryCount","isOnline","approved","bankLinked","bankName","accountNumber","category","city","verified","blueBadge"].includes(k)).length > 0 && (
                <Section title="Additional Fields" icon={<RiInformationLine size={16} />} C={C} accent={C.purple}>
                  {extraKeys
                    .filter(k => !imageKeys.includes(k))
                    .filter(k => !["idType","idNumber","vehicleType","rating","deliveryCount","isOnline","approved","bankLinked","bankName","accountNumber","category","city","verified","blueBadge"].includes(k))
                    .map(k => (
                      <Field key={k} label={k} value={entity[k]} C={C} />
                    ))}
                </Section>
              )}
            </div>
          </div>
        )}

        {/* ════ ORDERS TAB ════ */}
        {tab === "orders" && (
          <div>
            {loadingOrders ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
                <RiLoader4Line size={32} color={C.orange} style={{ animation: "spin 1s linear infinite" }} />
                <div style={{ marginTop: 14 }}>Loading orders…</div>
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
                <RiShoppingBagLine size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontWeight: 700 }}>No orders found</div>
              </div>
            ) : (
              <div>
                {/* Summary */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: 12, marginBottom: 22,
                }}>
                  {[
                    { label: "Total", val: totalOrders, color: C.blue },
                    { label: "Delivered", val: deliveredOrders, color: C.green },
                    { label: "Cancelled", val: cancelledOrders, color: C.red },
                    { label: "Pending", val: orders.filter(o => o.status === "pending").length, color: C.yellow },
                    { label: "Disputed", val: orders.filter(o => o.disputed).length, color: C.purple },
                    { label: "Revenue", val: fmt(orderRevenue), color: C.orange },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 14, padding: "14px 16px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'Space Grotesk',sans-serif" }}>{s.val}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {orders.map(o => <OrderCard key={o.id} order={o} C={C} />)}
              </div>
            )}
          </div>
        )}

        {/* ════ ACTIVITY TAB ════ */}
        {tab === "activity" && (
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: 18 }}>
              Admin Action History ({auditLogs.length})
            </div>
            {loadingLogs ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Loading…</div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
                <RiTimeLine size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontWeight: 700 }}>No admin actions recorded yet</div>
              </div>
            ) : (
              <div>
                {auditLogs.map((log, i) => (
                  <div key={log.id} style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: `${C.orange}15`,
                        border: `1px solid ${C.orange}28`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: C.orange,
                      }}>
                        <RiShieldLine size={14} />
                      </div>
                      {i < auditLogs.length - 1 && (
                        <div style={{ width: 1, flex: 1, minHeight: 20, background: C.border }} />
                      )}
                    </div>
                    <div style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 13, padding: "12px 16px", flex: 1,
                      marginBottom: 10,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>
                          {(log.action || "").replace(/_/g, " ")}
                        </div>
                        <div style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>
                          {fmtDateTime(log.createdAt)}
                        </div>
                      </div>
                      <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
                        By <strong style={{ color: C.text }}>{log.adminName}</strong> · {log.adminRole}
                      </div>
                      {log.details && (
                        <div style={{
                          color: C.text, fontSize: 12, marginTop: 8,
                          padding: "7px 10px",
                          background: C.surface2, borderRadius: 8,
                          border: `1px solid ${C.border}`,
                        }}>
                          {log.details}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ SUPPORT TICKETS TAB ════ */}
        {tab === "support" && (
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: 18 }}>
              Support Ticket History
            </div>
            {tickets.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
                <RiMessageLine size={42} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontWeight: 700 }}>No support tickets</div>
              </div>
            ) : (
              tickets.map(t => (
                <div key={t.id} style={{
                  background: C.surface, border: `1px solid ${t.status === "open" ? C.yellow + "44" : C.border}`,
                  borderRadius: 14, padding: "16px 20px", marginBottom: 10,
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${C.blue}15`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: C.blue, flexShrink: 0,
                  }}>
                    <RiMessageLine size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                      {t.subject || "Support Request"}
                    </div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                      {t.lastMessage?.slice(0, 80)}{t.lastMessage?.length > 80 ? "…" : ""}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                      {ago(t.updatedAt)}
                    </div>
                  </div>
                  <Pill status={t.status || "open"} />
                </div>
              ))
            )}
          </div>
        )}

        {/* ════ RAW DATA TAB ════ */}
        {tab === "raw" && (
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 16,
            }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>
                Raw Firestore Document
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => copyText(JSON.stringify(
                  Object.fromEntries(Object.entries(entity).map(([k, v]) => [k, serializeVal(v)])), null, 2
                ))} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10,
                  background: C.surface2, border: `1px solid ${C.border}`,
                  color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  <RiFileCopyLine size={13} /> Copy
                </button>
                <button onClick={exportJSON} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10,
                  background: C.surface2, border: `1px solid ${C.border}`,
                  color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                  <RiDownload2Line size={13} /> Download
                </button>
              </div>
            </div>
            <pre style={{
              background: C.bgSecondary, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 22, color: C.text,
              fontSize: 12, fontFamily: "monospace", lineHeight: 1.8,
              overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(entity).map(([k, v]) => [k, serializeVal(v)])
                ),
                null, 2
              )}
            </pre>
          </div>
        )}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} C={C} />}
      {confirm && (
        <Confirm
          message={confirm.msg} sub={confirm.sub}
          onConfirm={() => { confirm.fn(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
          C={C}
        />
      )}

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.25); border-radius: 4px; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}