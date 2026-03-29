// AdminDashboard.tsx — SUPER ADMIN DASHBOARD (Full Access)
// All admin + super-admin features, permission system, theme toggle,
// Discount management, Admin Invites, Ads page, Send & Pickup page,
// Enhanced Maintenance Mode with message + dashboard targeting

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, onSnapshot, orderBy, doc, updateDoc, addDoc,
  serverTimestamp, where, getDoc, getDocs, limit, deleteDoc,
  Timestamp, writeBatch,
} from "firebase/firestore";
import {
  signOut, updateProfile, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase";
import { useNavigate } from "react-router-dom";

import {
  RiDashboardLine, RiUserLine, RiStoreLine, RiBikeLine, RiShoppingBagLine,
  RiMessage2Line, RiVerifiedBadgeLine, RiLockPasswordLine, RiShieldUserLine,
  RiFileHistoryLine, RiSettings3Line, RiLogoutBoxLine, RiMenuLine,
  RiSearchLine, RiAlertLine, RiCheckLine, RiCloseLine, RiSendPlaneLine,
  RiAddLine, RiDeleteBinLine, RiEditLine, RiEyeLine, RiEyeOffLine, RiDownload2Line,
  RiRefundLine, RiMotorbikeLine, RiMapPinLine, RiBankLine, RiStarLine,
  RiAlertFill, RiShieldLine, RiTimeLine, RiArrowUpLine, RiArrowDownLine,
  RiWalletLine, RiPhoneLine, RiMailLine, RiUserStarLine, RiToolsLine,
  RiToggleLine, RiFlashlightLine, RiUploadLine, RiFileListLine, RiUserForbidLine,
  RiUserFollowLine, RiPriceTag3Line, RiInformationLine, RiLiveLine,
  RiExchangeFundsLine, RiOrderPlayLine, RiTeamLine, RiPassportLine,
  RiChatPrivateLine, RiBuilding2Line, RiGlobalLine, RiNotificationLine,
  RiSunLine, RiMoonLine, RiPercentLine, RiCouponLine, RiFileCopyLine,
  RiImageLine, RiMegaphoneLine, RiBox3Line, RiBellLine,
} from "react-icons/ri";
import { FiZap, FiTrendingUp, FiImage } from "react-icons/fi";
import AdminSupportPage from "../Pages/Adminsupportpage";
import AdsPage from "../Pages/AdminAdspage";
import SendPickupAdminPage from "../Pages/Sendpickupadminpage";
import PayoutsConfigPage from "../Pages/Payoutsconfigpage";
import AdminFinancePage from "../Pages/Adminfinancepage";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface AdminUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  role?: "admin" | "superadmin";
  permissions?: Record<string, boolean>;
  tempPermissions?: Record<string, { granted: boolean; expiresAt: Timestamp; targetId?: string }>;
  [key: string]: unknown;
}
interface UserDoc { id: string; fullName?: string; displayName?: string; email?: string; phone?: string; photoURL?: string; status?: string; orderCount?: number; createdAt?: Timestamp; address?: string; bio?: string; [key: string]: unknown; }
interface VendorDoc { id: string; businessName?: string; fullName?: string; email?: string; phone?: string; city?: string; category?: string; address?: string; bio?: string; logo?: string; coverPhoto?: string; status?: string; verified?: boolean; blueBadge?: boolean; bankLinked?: boolean; bankName?: string; accountNumber?: string; createdAt?: Timestamp; [key: string]: unknown; }
interface RiderDoc { id: string; fullName?: string; email?: string; phone?: string; photoURL?: string; vehicleType?: string; deliveryCount?: number; rating?: number; status?: string; isOnline?: boolean; approved?: boolean; createdAt?: Timestamp; [key: string]: unknown; }
interface OrderDoc { id: string; orderNumber?: string; customerName?: string; customerEmail?: string; customerPhone?: string; vendorName?: string; riderName?: string; deliveryAddress?: string; total?: number; status?: string; paymentMethod?: string; items?: { name: string; qty: number; price: number; image?: string; imageUrl?: string; photo?: string; thumbnail?: string; img?: string; itemImage?: string; productImage?: string; [key: string]: unknown }[]; createdAt?: Timestamp; riderId?: string; vendorId?: string; userId?: string; customerId?: string; disputed?: boolean; [key: string]: unknown; }
interface BlueBadgeDoc { id: string; vendorId?: string; vendorName?: string; vendorEmail?: string; documents?: Record<string, string>; status?: "pending" | "approved" | "rejected"; submittedAt?: Timestamp; rejectionNote?: string; reviewedBy?: string; reviewedAt?: Timestamp; [key: string]: unknown; }
interface PermissionRequestDoc { id: string; requesterId?: string; requesterName?: string; requesterEmail?: string; action?: string; targetId?: string; targetType?: string; description?: string; reason?: string; suggestedDuration?: string; status?: "pending" | "approved" | "denied"; createdAt?: Timestamp; reviewedAt?: Timestamp; reviewedBy?: string; expiresAt?: Timestamp; [key: string]: unknown; }
interface AuditLogDoc { id: string; adminId?: string; adminName?: string; adminRole?: string; action?: string; targetType?: string; targetId?: string; targetName?: string; details?: string; createdAt?: Timestamp; [key: string]: unknown; }
interface DiscountDoc { id: string; code?: string; type?: "percentage" | "fixed"; value?: number; minOrder?: number; maxUses?: number; usedCount?: number; status?: "active" | "inactive" | "expired"; expiresAt?: Timestamp; createdAt?: Timestamp; createdBy?: string; description?: string; [key: string]: unknown; }
interface AdminInviteDoc { id: string; email?: string; role?: "admin" | "superadmin"; status?: "pending" | "accepted" | "expired"; invitedBy?: string; invitedByName?: string; createdAt?: Timestamp; acceptedAt?: Timestamp; [key: string]: unknown; }

// ─── MAINTENANCE MODE TYPES ──────────────────────────────────────────────────
interface MaintenanceSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceTargets: string[]; // "all" | "customer" | "vendor" | "rider" | "admin"
  allowNewRegistrations: boolean;
  allowVendorSignups: boolean;
  allowRiderSignups: boolean;
  deliveryBaseFee: string;
  platformFeePercent: string;
  minOrderAmount: string;
  supportEmail: string;
  supportPhone: string;
}

// ─── THEME SYSTEM ─────────────────────────────────────────────────────────────
type Theme = "dark" | "light";

const DARK_COLORS = {
  bg: "#07070e", surface: "rgba(255,255,255,0.025)", surface2: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.07)", orange: "#FF6B00", orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.1)", text: "#e2e2f0", muted: "#4a4a6a", dim: "#272738",
  green: "#10B981", red: "#EF4444", blue: "#3B82F6", yellow: "#F59E0B",
  purple: "#8B5CF6", cyan: "#06B6D4", modalBg: "#0e0e1a",
  sidebarBg: "rgba(255,255,255,0.015)", headerBg: "#07070e", surfaceHover: "rgba(255,255,255,0.04)",
};

const LIGHT_COLORS = {
  bg: "#f0f0f8", surface: "rgba(255,255,255,0.85)", surface2: "rgba(255,255,255,0.95)",
  border: "rgba(0,0,0,0.07)", orange: "#FF6B00", orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.1)", text: "#12121e", muted: "#8888aa", dim: "#e0e0f0",
  green: "#059669", red: "#DC2626", blue: "#2563EB", yellow: "#D97706",
  purple: "#7C3AED", cyan: "#0891B2", modalBg: "#ffffff",
  sidebarBg: "rgba(255,255,255,0.7)", headerBg: "#f0f0f8", surfaceHover: "rgba(255,107,0,0.04)",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `₦${(n / 1e3).toFixed(1)}K` : `₦${n.toLocaleString()}`;
const ago = (ts?: Timestamp | null) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtDate = (ts?: Timestamp | null) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
};
const fmtDateTime = (ts?: Timestamp | null) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const getOrderDisplay = (o: OrderDoc): string => {
  if (o.orderNumber) return `#${o.orderNumber}`;
  const numMatch = o.id.match(/(\d+)$/);
  if (numMatch) return `#SWIFT_${numMatch[1]}`;
  return `#${o.id.slice(-8).toUpperCase()}`;
};
function getDaysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000));
}

// ─── AUDIT LOGGER ────────────────────────────────────────────────────────────
async function logAudit(admin: AdminUser | null, action: string, targetType: string, targetId: string, targetName: string, details?: string) {
  if (!admin) return;
  try {
    await addDoc(collection(db, "auditLogs"), {
      adminId: admin.uid, adminName: admin.displayName || admin.email || "Admin",
      adminRole: admin.role || "admin", action, targetType, targetId, targetName,
      details: details || "", createdAt: serverTimestamp(),
    });
  } catch (e) { console.error("Audit log failed:", e); }
}

// ─── PERMISSION CHECKER ──────────────────────────────────────────────────────
function canDo(admin: AdminUser | null, action: string, targetId?: string): boolean {
  if (!admin) return false;
  if (admin.role === "superadmin") return true;
  if (admin.permissions?.[action]) return true;
  const tp = admin.tempPermissions?.[action];
  if (tp && tp.granted) {
    if (tp.expiresAt) {
      const exp = tp.expiresAt.toDate ? tp.expiresAt.toDate() : new Date(tp.expiresAt as unknown as string);
      if (new Date() > exp) return false;
    }
    if (tp.targetId && targetId && tp.targetId !== targetId) return false;
    return true;
  }
  return false;
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const makeInp = (C: typeof DARK_COLORS): React.CSSProperties => ({
  width: "100%", padding: "11px 14px",
  background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: 12, color: C.text, fontSize: 13,
  fontFamily: "'Nunito', sans-serif", outline: "none",
});
const lbl: React.CSSProperties = {
  color: "#4a4a6a", fontSize: 10, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: 0.8,
  display: "block", marginBottom: 7,
};

// ─── BADGE ───────────────────────────────────────────────────────────────────
const Badge = ({ status }: { status: string }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Active" },
    inactive: { bg: "rgba(74,74,106,0.2)", color: "#4a4a6a", label: "Inactive" },
    banned: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Banned" },
    pending: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", label: "Pending" },
    verified: { bg: "rgba(59,130,246,0.1)", color: "#3B82F6", label: "Verified" },
    delivered: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Delivered" },
    processing: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", label: "Processing" },
    cancelled: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Cancelled" },
    "in-transit": { bg: "rgba(59,130,246,0.1)", color: "#3B82F6", label: "In Transit" },
    "in_transit": { bg: "rgba(59,130,246,0.1)", color: "#3B82F6", label: "In Transit" },
    open: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", label: "Open" },
    resolved: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Resolved" },
    online: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Online" },
    offline: { bg: "rgba(74,74,106,0.2)", color: "#4a4a6a", label: "Offline" },
    approved: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Approved" },
    rejected: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Rejected" },
    denied: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Denied" },
    expired: { bg: "rgba(74,74,106,0.2)", color: "#4a4a6a", label: "Expired" },
    superadmin: { bg: "rgba(139,92,246,0.15)", color: "#8B5CF6", label: "Super Admin" },
    admin: { bg: "rgba(59,130,246,0.1)", color: "#3B82F6", label: "Admin" },
    disputed: { bg: "rgba(239,68,68,0.15)", color: "#EF4444", label: "Disputed" },
    removed: { bg: "rgba(74,74,106,0.2)", color: "#4a4a6a", label: "Removed" },
    accepted: { bg: "rgba(16,185,129,0.1)", color: "#10B981", label: "Accepted" },
    placed: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", label: "Placed" },
    confirmed: { bg: "rgba(59,130,246,0.1)", color: "#3B82F6", label: "Confirmed" },
    ready: { bg: "rgba(6,182,212,0.1)", color: "#06B6D4", label: "Ready" },
    picked: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6", label: "Picked Up" },
    failed: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", label: "Failed" },
    refunded: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6", label: "Refunded" },
  };
  const key = (status || "").toLowerCase().replace(/\s+/g, "-");
  const s = map[key] ?? { bg: "rgba(74,74,106,0.2)", color: "#4a4a6a", label: status || "Unknown" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 40, fontSize: 10, fontWeight: 800, background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

// ─── AVATAR ──────────────────────────────────────────────────────────────────
const Avatar = ({ src, name, size = 36, C }: { src?: string | null; name?: string | null; size?: number; C: typeof DARK_COLORS }) => {
  const initials = (name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = [C.orange, C.blue, C.purple, C.green, C.yellow, C.cyan];
  const bg = colors[(name || "").charCodeAt(0) % colors.length];
  if (src) return <img src={src} alt={name ?? ""} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

// ─── STAT CARD ───────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = "#FF6B00", trend, C }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string; trend?: { val: string; up: boolean }; C: typeof DARK_COLORS }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at 80% 20%, ${color}14 0%, transparent 70%)`, pointerEvents: "none" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
      {trend && (
        <span style={{ fontSize: 11, fontWeight: 800, color: trend.up ? C.green : C.red, background: trend.up ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", padding: "3px 8px", borderRadius: 8, display: "flex", alignItems: "center", gap: 3 }}>
          {trend.up ? <RiArrowUpLine size={11} /> : <RiArrowDownLine size={11} />}{trend.val}
        </span>
      )}
    </div>
    <div>
      <div style={{ fontSize: 26, fontWeight: 900, color: C.text, fontFamily: "'Syne', sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{label}</div>
    </div>
    {sub && <div style={{ fontSize: 11, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>{sub}</div>}
  </div>
);

// ─── EMPTY ───────────────────────────────────────────────────────────────────
const Empty = ({ text = "No data yet", icon, C }: { text?: string; icon?: React.ReactNode; C: typeof DARK_COLORS }) => (
  <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted }}>
    <div style={{ fontSize: 36, marginBottom: 10, display: "flex", justifyContent: "center", opacity: 0.3 }}>{icon || <RiFileListLine size={40} />}</div>
    <div style={{ fontWeight: 700, fontSize: 14 }}>{text}</div>
  </div>
);

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
const ConfirmModal = ({ message, sub, onConfirm, onCancel, danger = true, C }: { message: string; sub?: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; C: typeof DARK_COLORS }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
    <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, padding: 32, maxWidth: 380, width: "90%", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: danger ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: danger ? C.red : C.green }}>
        {danger ? <RiAlertFill size={24} /> : <RiInformationLine size={24} />}
      </div>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: sub ? 8 : 24, lineHeight: 1.5 }}>{message}</div>
      {sub && <div style={{ color: C.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>{sub}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={onCancel} style={{ padding: "10px 22px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontSize: 13 }}>Cancel</button>
        <button onClick={onConfirm} style={{ padding: "10px 22px", borderRadius: 12, background: danger ? C.red : C.green, border: "none", color: "white", fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontSize: 13 }}>Confirm</button>
      </div>
    </div>
  </div>
);

// ─── TOAST ───────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose, C }: { msg: string; type: "success" | "error" | "info"; onClose: () => void; C: typeof DARK_COLORS }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { success: C.green, error: C.red, info: C.blue };
  const icons = { success: <RiCheckLine size={14} />, error: <RiAlertLine size={14} />, info: <RiInformationLine size={14} /> };
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 99999, background: C.modalBg, border: `1px solid ${colors[type]}`, borderRadius: 14, padding: "13px 18px", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 10, animation: "slideIn 0.3s ease" }}>
      <div style={{ color: colors[type], flexShrink: 0 }}>{icons[type]}</div>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", marginLeft: "auto", display: "flex" }}><RiCloseLine size={16} /></button>
    </div>
  );
};

// ─── REQUEST PERMISSION MODAL ─────────────────────────────────────────────────
function RequestPermissionModal({ action, targetId, targetType, description: defaultDesc, adminUser, onClose, showToast, C }: {
  action: string; targetId?: string; targetType?: string; description?: string;
  adminUser: AdminUser | null; onClose: () => void; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS;
}) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("2 hours");
  const [submitting, setSubmitting] = useState(false);
  const inp = makeInp(C);
  const submit = async () => {
    if (!reason.trim()) { showToast("Please enter a reason", "error"); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "permissionRequests"), {
        requesterId: adminUser?.uid, requesterName: adminUser?.displayName || adminUser?.email,
        requesterEmail: adminUser?.email, action, targetId: targetId || null, targetType: targetType || null,
        description: defaultDesc || action, reason: reason.trim(), suggestedDuration: duration,
        status: "pending", createdAt: serverTimestamp(),
      });
      showToast("Permission request sent to Super Admin", "success");
      onClose();
    } catch { showToast("Failed to submit request", "error"); }
    setSubmitting(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.modalBg, border: "1px solid rgba(245,158,11,0.3)", borderRadius: 22, width: "100%", maxWidth: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.yellow }}>
            <RiLockPasswordLine size={22} />
          </div>
          <div>
            <div style={{ color: C.text, fontWeight: 900, fontSize: 17, fontFamily: "'Syne', sans-serif" }}>Request Permission</div>
            <div style={{ color: C.muted, fontSize: 12 }}>Super Admin will review your request</div>
          </div>
        </div>
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 12, padding: "10px 14px", marginBottom: 18 }}>
          <div style={{ color: C.yellow, fontSize: 12, fontWeight: 800 }}><RiShieldLine size={13} /> Action: {action}</div>
          {defaultDesc && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{defaultDesc}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Reason *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why do you need this?" style={{ ...inp, resize: "vertical" } as React.CSSProperties} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Duration</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["1 hour", "2 hours", "6 hours", "24 hours"].map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{ padding: "6px 14px", borderRadius: 10, border: `1px solid ${duration === d ? C.orange : C.border}`, background: duration === d ? C.orangeGlow : "transparent", color: duration === d ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{d}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button disabled={submitting} onClick={submit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <RiSendPlaneLine size={14} /> {submitting ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ACTIVE ADS PANEL (for Overview) ─────────────────────────────────────────
interface ActiveAdItem { id: string; vendorName: string; vendorLogo?: string; label: string; type: string; endDate: string; durationDays: number; status: string; }
const AD_TYPE_COLOR: Record<string, string> = { trending_homepage: "#FF6B00", search_priority: "#3B82F6", search_trending: "#10B981", homepage_banner: "#8B5CF6" };

function ActiveAdsPanel({ C }: { C: typeof DARK_COLORS }) {
  const [ads, setAds] = useState<ActiveAdItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const nowIso = new Date().toISOString();
    return onSnapshot(query(collection(db, "adPromotions"), orderBy("endDate", "asc")), snap => {
      setAds(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActiveAdItem)).filter(a => a.endDate > nowIso && a.status !== "cancelled"));
      setLoading(false);
    });
  }, []);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
      <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6", display: "inline-block" }} /> Currently Running Ads
      </h3>
      {loading ? <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading…</div>
        : ads.length === 0 ? <Empty text="No active ads" icon={<RiMegaphoneLine />} C={C} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto" }}>
            {ads.map(ad => {
              const dLeft = getDaysLeft(ad.endDate);
              const pct = Math.max(0, Math.min(100, ((ad.durationDays - dLeft) / Math.max(ad.durationDays, 1)) * 100));
              const col = AD_TYPE_COLOR[ad.type] || "#FF6B00";
              return (
                <div key={ad.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.surface2, border: `1px solid ${dLeft <= 1 ? "#F59E0B44" : C.border}`, borderRadius: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: `${col}18`, border: `1px solid ${col}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {ad.vendorLogo ? <img src={ad.vendorLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <RiStoreLine size={14} color={col} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ color: C.text, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{ad.vendorName}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: col, background: `${col}14`, border: `1px solid ${col}25`, borderRadius: 6, padding: "1px 7px", whiteSpace: "nowrap" }}>{ad.label}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: dLeft <= 1 ? "#F59E0B" : col, borderRadius: 4 }} />
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: dLeft <= 2 ? "#F59E0B" : C.text, fontFamily: "'Syne',sans-serif" }}>{dLeft}d</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>left</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW PAGE
// ═══════════════════════════════════════════════════════════════════════
function OverviewPage({ adminUser, C }: { adminUser: AdminUser | null; C: typeof DARK_COLORS }) {
  const [stats, setStats] = useState({ users: 0, vendors: 0, riders: 0, orders: 0, revenue: 0, tickets: 0, pendingBadges: 0, pendingRequests: 0, activeAds: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderDoc[]>([]);
  const [recentUsers, setRecentUsers] = useState<UserDoc[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<Record<string, number>>({});
  const [revenueToday, setRevenueToday] = useState(0);
  const [revenueWeek, setRevenueWeek] = useState(0);

  useEffect(() => {
    const subs: (() => void)[] = [];
    subs.push(onSnapshot(query(collection(db, "users")), s => setStats(p => ({ ...p, users: s.size }))));
    subs.push(onSnapshot(query(collection(db, "vendors")), s => setStats(p => ({ ...p, vendors: s.size }))));
    subs.push(onSnapshot(query(collection(db, "riders")), s => setStats(p => ({ ...p, riders: s.size }))));
    subs.push(onSnapshot(query(collection(db, "orders")), snap => {
      let rev = 0, today = 0, week = 0;
      const byStatus: Record<string, number> = {};
      const now = new Date();
      snap.forEach(d => {
        const o = d.data();
        rev += o.total || 0;
        byStatus[o.status || "pending"] = (byStatus[o.status || "pending"] || 0) + 1;
        if (o.createdAt) {
          const dt = o.createdAt.toDate();
          const diff = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
          if (diff < 1) today += o.total || 0;
          if (diff < 7) week += o.total || 0;
        }
      });
      setStats(p => ({ ...p, orders: snap.size, revenue: rev }));
      setOrdersByStatus(byStatus); setRevenueToday(today); setRevenueWeek(week);
    }));
    subs.push(onSnapshot(query(collection(db, "adPromotions")), snap => {
      const nowIso = new Date().toISOString();
      let activeAds = 0;
      snap.forEach(d => { const a = d.data(); if (a.endDate > nowIso && a.status !== "cancelled") activeAds++; });
      setStats(p => ({ ...p, activeAds }));
    }));
    subs.push(onSnapshot(query(collection(db, "supportTickets"), where("status", "==", "open")), s => setStats(p => ({ ...p, tickets: s.size }))));
    subs.push(onSnapshot(query(collection(db, "blueBadgeApplications"), where("status", "==", "pending")), s => setStats(p => ({ ...p, pendingBadges: s.size }))));
    subs.push(onSnapshot(query(collection(db, "permissionRequests"), where("status", "==", "pending")), s => setStats(p => ({ ...p, pendingRequests: s.size }))));
    subs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(8)), s => setRecentOrders(s.docs.map(d => ({ id: d.id, ...d.data() } as OrderDoc)))));
    subs.push(onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(6)), s => setRecentUsers(s.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc)))));
    return () => subs.forEach(u => u());
  }, []);

  const statusColors: Record<string, string> = { pending: C.yellow, processing: C.blue, "in-transit": C.cyan, delivered: C.green, cancelled: C.red };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4 }}>
          Welcome back, {adminUser?.displayName?.split(" ")[0] || "Admin"} 👋
        </h1>
        <p style={{ color: C.muted, fontSize: 14 }}>Here's what's happening on SwiftNija right now.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard icon={<RiUserLine size={18} />} label="Total Users" value={stats.users} color={C.blue} C={C} />
        <StatCard icon={<RiStoreLine size={18} />} label="Vendors" value={stats.vendors} color={C.orange} C={C} />
        <StatCard icon={<RiBikeLine size={18} />} label="Riders" value={stats.riders} color={C.green} C={C} />
        <StatCard icon={<RiShoppingBagLine size={18} />} label="Total Orders" value={stats.orders} color={C.yellow} C={C} />
        <StatCard icon={<RiWalletLine size={18} />} label="Total Revenue" value={fmt(stats.revenue)} color={C.purple} sub={`Today: ${fmt(revenueToday)}`} C={C} />
        <StatCard icon={<RiMegaphoneLine size={18} />} label="Active Ads" value={stats.activeAds} color="#8B5CF6" C={C} />
        <StatCard icon={<RiMessage2Line size={18} />} label="Open Tickets" value={stats.tickets} color={C.red} C={C} />
        <StatCard icon={<RiVerifiedBadgeLine size={18} />} label="Badge Requests" value={stats.pendingBadges} color={C.cyan} sub="Awaiting review" C={C} />
        <StatCard icon={<RiLockPasswordLine size={18} />} label="Perm Requests" value={stats.pendingRequests} color={C.yellow} sub="Needs approval" C={C} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 18 }}>Orders by Status</h3>
          {Object.entries(ordersByStatus).length === 0 ? <Empty text="No orders yet" icon={<RiShoppingBagLine />} C={C} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(ordersByStatus).map(([s, count]) => {
                const pct = Math.round((count / stats.orders) * 100);
                return (
                  <div key={s}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: C.text, fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{s}</span>
                      <span style={{ color: C.muted, fontSize: 12 }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: C.dim, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: statusColors[s] || C.orange, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 18 }}>Revenue Summary</h3>
          {[{ label: "Today", value: revenueToday, color: C.green }, { label: "This Week", value: revenueWeek, color: C.blue }, { label: "All Time", value: stats.revenue, color: C.orange }].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted, fontSize: 13 }}>{r.label}</span>
              <span style={{ color: r.color, fontWeight: 900, fontFamily: "'Syne', sans-serif", fontSize: 16 }}>{fmt(r.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Recent Orders</h3>
          {recentOrders.length === 0 ? <Empty text="No orders" icon={<RiShoppingBagLine />} C={C} /> : recentOrders.map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{getOrderDisplay(o)}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{o.customerName || "—"} · {ago(o.createdAt)}</div>
              </div>
              <div style={{ color: C.orange, fontWeight: 800, fontSize: 12 }}>{fmt(o.total || 0)}</div>
              <Badge status={o.status || "pending"} />
            </div>
          ))}
        </div>
        <ActiveAdsPanel C={C} />
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 16 }}>New Users</h3>
        {recentUsers.length === 0 ? <Empty text="No users" icon={<RiUserLine />} C={C} /> : recentUsers.map(u => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <Avatar src={u.photoURL} name={u.fullName || u.displayName} size={30} C={C} />
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{u.fullName || u.displayName || "Unknown"}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{ago(u.createdAt)}</div>
            </div>
            <Badge status={u.status || "active"} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// USERS PAGE
// ═══════════════════════════════════════════════════════════════════════
function UsersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserDoc | null>(null);
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", bio: "", address: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "orders")), snap => {
      const counts: Record<string, number> = {};
      snap.forEach(d => { const o = d.data(); const uid = o.userId || o.customerId || o.uid || null; if (uid) counts[uid] = (counts[uid] || 0) + 1; });
      setOrderCounts(counts);
    });
    return unsub;
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc")), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc)));
      setLoading(false);
    });
  }, []);

  const filtered = users.filter(u => {
    const ms = !search || (u.fullName || u.displayName || "").toLowerCase().includes(search.toLowerCase()) || (u.email || "").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || u.status === filter;
    return ms && mf;
  });

  const updateStatus = async (uid: string, status: string) => {
    const user = users.find(u => u.id === uid);
    await updateDoc(doc(db, "users", uid), { status });
    await logAudit(adminUser, `user_${status}`, "user", uid, user?.fullName || user?.email || uid);
    showToast(`User ${status}`, "success");
    setConfirm(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateDoc(doc(db, "users", editing.id), { fullName: editForm.fullName, phone: editForm.phone, bio: editForm.bio, address: editForm.address });
    await logAudit(adminUser, "user_profile_edited", "user", editing.id, editForm.fullName || editing.id);
    showToast("User profile updated", "success");
    setEditing(null);
  };

  const deleteUser = async (uid: string) => {
    if (!canDo(adminUser, "canDeleteUsers", uid)) { openPermRequest("canDeleteUsers", "Delete this user account permanently", uid); return; }
    const user = users.find(u => u.id === uid);
    await deleteDoc(doc(db, "users", uid));
    await logAudit(adminUser, "user_deleted", "user", uid, user?.fullName || uid);
    showToast("User deleted", "info");
    setSelected(null); setConfirm(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4 }}>Users</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{users.length} registered customers</p>
        </div>
        {canDo(adminUser, "canExportData") && (
          <button onClick={() => showToast("Exporting CSV…", "info")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 11, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <RiDownload2Line size={14} /> Export CSV
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "active", "banned"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading users…</div> : filtered.length === 0 ? <Empty text="No users found" icon={<RiUserLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["User", "Phone", "Joined", "Orders", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setSelected(u)}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar src={u.photoURL} name={u.fullName || u.displayName} size={32} C={C} />
                      <div>
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{u.fullName || u.displayName || "—"}</div>
                        <div style={{ color: C.muted, fontSize: 11 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{(u.phone as string) || "—"}</td>
                  <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ padding: "12px 16px" }}><span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{orderCounts[u.id] ?? 0}</span></td>
                  <td style={{ padding: "12px 16px" }}><Badge status={u.status || "active"} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditing(u); setEditForm({ fullName: u.fullName || u.displayName || "", phone: (u.phone as string) || "", bio: (u.bio as string) || "", address: (u.address as string) || "" }); }} style={{ padding: "4px 10px", borderRadius: 8, background: C.surface2, border: "none", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiEditLine size={11} /> Edit</button>
                      {u.status !== "banned" ? (
                        <button onClick={() => setConfirm({ uid: u.id, action: "banned", name: u.fullName || u.email || u.id })} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiUserForbidLine size={11} /> Ban</button>
                      ) : (
                        <button onClick={() => updateStatus(u.id, "active")} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiUserFollowLine size={11} /> Unban</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <Avatar src={selected.photoURL} name={selected.fullName || selected.displayName} size={56} C={C} />
                <div>
                  <div style={{ color: C.text, fontWeight: 900, fontSize: 20, fontFamily: "'Syne', sans-serif" }}>{selected.fullName || selected.displayName || "—"}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>{selected.email}</div>
                  <div style={{ marginTop: 6 }}><Badge status={selected.status || "active"} /></div>
                </div>
              </div>
              {[["Phone", selected.phone], ["Address", selected.address], ["Joined", fmtDate(selected.createdAt)], ["Orders", orderCounts[selected.id] ?? 0], ["UID", selected.id]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "10px 0", gap: 16 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13, wordBreak: "break-all" }}>{String(v ?? "—")}</div>
                </div>
              ))}
              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setEditing(selected); setEditForm({ fullName: selected.fullName || selected.displayName || "", phone: (selected.phone as string) || "", bio: (selected.bio as string) || "", address: (selected.address as string) || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiEditLine size={13} /> Edit Profile</button>
                <button onClick={() => { setSelected(null); setConfirm({ uid: selected.id, action: "delete", name: selected.fullName || selected.email || selected.id }); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiDeleteBinLine size={13} /> Delete</button>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 460, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif", marginBottom: 22 }}>Edit User Profile</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Full Name</label><input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Address</label><input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Bio</label><textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer" }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal message={confirm.action === "delete" ? `Delete user "${confirm.name}" permanently?` : `Ban user "${confirm.name}"?`} sub={confirm.action === "delete" ? "This cannot be undone." : "They will lose platform access."} onConfirm={() => confirm.action === "delete" ? deleteUser(confirm.uid) : updateStatus(confirm.uid, confirm.action)} onCancel={() => setConfirm(null)} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VENDORS PAGE
// ═══════════════════════════════════════════════════════════════════════
function VendorsPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<VendorDoc | null>(null);
  const [editing, setEditing] = useState<VendorDoc | null>(null);
  const [editForm, setEditForm] = useState({ businessName: "", phone: "", city: "", address: "", bio: "", category: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(query(collection(db, "vendors"), orderBy("createdAt", "desc")), snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorDoc)));
      setLoading(false);
    });
  }, []);

  const filtered = vendors.filter(v => {
    const ms = (v.businessName || "").toLowerCase().includes(search.toLowerCase()) || (v.email || "").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || (filter === "verified" && v.verified) || (filter === "pending" && !v.verified && v.status !== "banned") || (filter === "banned" && v.status === "banned") || (filter === "blue" && v.blueBadge);
    return ms && mf;
  });

  const updateVendor = async (uid: string, data: Partial<VendorDoc>, logAction?: string) => {
    await updateDoc(doc(db, "vendors", uid), data as Record<string, unknown>);
    if (selected?.id === uid) setSelected(v => v ? { ...v, ...data } : v);
    if (logAction) await logAudit(adminUser, logAction, "vendor", uid, vendors.find(v => v.id === uid)?.businessName || uid);
    showToast("Vendor updated", "success");
    setConfirm(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateDoc(doc(db, "vendors", editing.id), { ...editForm });
    await logAudit(adminUser, "vendor_profile_edited", "vendor", editing.id, editForm.businessName || editing.id);
    showToast("Vendor updated", "success");
    setEditing(null);
  };

  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.action === "unlinkBank") { await updateVendor(confirm.uid, { bankLinked: false, bankName: "", accountNumber: "" }, "vendor_bank_unlinked"); }
    else if (confirm.action === "deleteVendor") { await deleteDoc(doc(db, "vendors", confirm.uid)); await logAudit(adminUser, "vendor_deleted", "vendor", confirm.uid, confirm.name); showToast("Vendor deleted", "info"); }
    else { await updateVendor(confirm.uid, { status: confirm.action === "ban" ? "banned" : "active" }, `vendor_${confirm.action}`); }
    setConfirm(null); setSelected(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4 }}>Vendors</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{vendors.length} stores</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "pending", "verified", "banned", "blue"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
            {f === "blue" ? "Blue Badge" : f}
          </button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No vendors" icon={<RiStoreLine />} C={C} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {filtered.map(v => (
            <div key={v.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", cursor: "pointer" }} onClick={() => setSelected(v)}>
              <div style={{ height: 80, background: v.coverPhoto ? `url(${v.coverPhoto}) center/cover` : `linear-gradient(135deg, ${C.orangeGlow}, rgba(59,130,246,0.06))` }} />
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <Avatar src={v.logo} name={v.businessName} size={38} C={C} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ color: C.text, fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.businessName}</div>
                      {v.blueBadge && <RiVerifiedBadgeLine size={14} color={C.blue} />}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{v.category} · {v.city}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge status={v.verified ? "verified" : v.status || "pending"} />
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {!v.verified && <button onClick={() => updateVendor(v.id, { verified: true, status: "active" }, "vendor_verified")} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Verify</button>}
                    <button onClick={() => setConfirm({ uid: v.id, name: v.businessName || v.id, action: v.status === "banned" ? "unban" : "ban" })} style={{ padding: "4px 10px", borderRadius: 8, background: v.status === "banned" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: "none", color: v.status === "banned" ? C.green : C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{v.status === "banned" ? "Unban" : "Ban"}</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            {selected.coverPhoto && <img src={selected.coverPhoto} alt="" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: "22px 22px 0 0" }} />}
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
                <Avatar src={selected.logo} name={selected.businessName} size={54} C={C} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif" }}>{selected.businessName}</div>
                    {selected.blueBadge && <RiVerifiedBadgeLine size={18} color={C.blue} />}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{selected.category} · {selected.city}</div>
                  <div style={{ marginTop: 6 }}><Badge status={selected.verified ? "verified" : selected.status || "pending"} /></div>
                </div>
              </div>
              {[["Owner", selected.fullName], ["Email", selected.email], ["Phone", selected.phone], ["Address", selected.address], ["Bank Linked", selected.bankLinked ? `Yes (${selected.bankName} · ${selected.accountNumber})` : "No"], ["Joined", fmtDate(selected.createdAt)]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v) || "—"}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                {!selected.verified && <button onClick={() => { updateVendor(selected.id, { verified: true, status: "active" }, "vendor_verified"); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(16,185,129,0.1)", border: "none", color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Approve</button>}
                <button onClick={() => { setEditing(selected); setEditForm({ businessName: selected.businessName || "", phone: selected.phone || "", city: selected.city || "", address: selected.address || "", bio: selected.bio || "", category: selected.category || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                {selected.bankLinked && <button onClick={() => { setConfirm({ uid: selected.id, name: selected.businessName || "", action: "unlinkBank" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Unlink Bank</button>}
                <button onClick={() => { setConfirm({ uid: selected.id, name: selected.businessName || "", action: "deleteVendor" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 480, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif", marginBottom: 22 }}>Edit Vendor</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Business Name</label><input value={editForm.businessName} onChange={e => setEditForm(f => ({ ...f, businessName: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Category</label><input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>City</label><input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Address</label><input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Bio</label><textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal message={confirm.action === "unlinkBank" ? `Unlink bank for "${confirm.name}"?` : confirm.action === "deleteVendor" ? `Delete vendor "${confirm.name}"?` : `${confirm.action === "ban" ? "Ban" : "Unban"} "${confirm.name}"?`} sub={confirm.action === "deleteVendor" ? "This cannot be undone." : undefined} onConfirm={execConfirm} onCancel={() => setConfirm(null)} danger={confirm.action !== "unban"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RIDERS PAGE — live delivery count from orders
// ═══════════════════════════════════════════════════════════════════════
function RidersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RiderDoc | null>(null);
  const [editing, setEditing] = useState<RiderDoc | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", vehicleType: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [riderDeliveryCounts, setRiderDeliveryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "orders"), where("status", "==", "delivered")), snap => {
      const counts: Record<string, number> = {};
      snap.forEach(d => { const riderId = d.data().riderId; if (riderId) counts[riderId] = (counts[riderId] || 0) + 1; });
      setRiderDeliveryCounts(counts);
    });
    return unsub;
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "riders"), orderBy("createdAt", "desc")), snap => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderDoc)));
      setLoading(false);
    });
  }, []);

  const filtered = riders.filter(r => (r.fullName || "").toLowerCase().includes(search.toLowerCase()) || (r.email || "").toLowerCase().includes(search.toLowerCase()));

  const updateRider = async (uid: string, data: Partial<RiderDoc>) => {
    await updateDoc(doc(db, "riders", uid), data as Record<string, unknown>);
    const rider = riders.find(r => r.id === uid);
    await logAudit(adminUser, "rider_updated", "rider", uid, rider?.fullName || uid, JSON.stringify(data));
    showToast("Rider updated", "success");
    setConfirm(null);
    if (selected?.id === uid) setSelected(r => r ? { ...r, ...data } : r);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await updateDoc(doc(db, "riders", editing.id), { ...editForm });
    await logAudit(adminUser, "rider_profile_edited", "rider", editing.id, editForm.fullName || editing.id);
    showToast("Rider updated", "success");
    setEditing(null);
  };

  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.action === "resetRating") await updateRider(confirm.uid, { rating: 0, deliveryCount: 0 });
    else if (confirm.action === "deleteRider") { await deleteDoc(doc(db, "riders", confirm.uid)); await logAudit(adminUser, "rider_deleted", "rider", confirm.uid, confirm.name); showToast("Rider deleted", "info"); }
    else await updateRider(confirm.uid, { status: confirm.action === "ban" ? "banned" : "active" });
    setConfirm(null); setSelected(null);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4 }}>Riders</h1>
      <p style={{ color: C.muted, marginBottom: 22, fontSize: 13 }}>{riders.length} delivery riders</p>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search riders…" style={{ ...inp, paddingLeft: 38 }} />
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No riders" icon={<RiBikeLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Rider", "Phone", "Vehicle", "Deliveries", "Rating", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setSelected(r)}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar src={r.photoURL} name={r.fullName} size={32} C={C} />
                    <div><div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{r.fullName || "—"}</div><div style={{ color: C.muted, fontSize: 11 }}>{r.email}</div></div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{(r.phone as string) || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{r.vehicleType || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.text, fontWeight: 700, fontSize: 12 }}>{riderDeliveryCounts[r.id] ?? r.deliveryCount ?? 0}</td>
                <td style={{ padding: "12px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 4, color: C.yellow }}><RiStarLine size={12} /><span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{r.rating ? r.rating.toFixed(1) : "—"}</span></div></td>
                <td style={{ padding: "12px 16px" }}><Badge status={r.isOnline ? "online" : r.status || "inactive"} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {!r.approved && <button onClick={() => updateRider(r.id, { approved: true, status: "active" })} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Approve</button>}
                    <button onClick={() => setConfirm({ uid: r.id, name: r.fullName || r.id, action: r.status === "banned" ? "unban" : "ban" })} style={{ padding: "4px 10px", borderRadius: 8, background: r.status === "banned" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: "none", color: r.status === "banned" ? C.green : C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{r.status === "banned" ? "Unban" : "Ban"}</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 22 }}>
                <Avatar src={selected.photoURL} name={selected.fullName} size={54} C={C} />
                <div>
                  <div style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif" }}>{selected.fullName}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{selected.email}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}><Badge status={selected.isOnline ? "online" : selected.status || "inactive"} />{selected.approved && <Badge status="approved" />}</div>
                </div>
              </div>
              {[["Phone", selected.phone], ["Vehicle", selected.vehicleType], ["Deliveries", riderDeliveryCounts[selected.id] ?? selected.deliveryCount ?? 0], ["Rating", selected.rating ? `${selected.rating.toFixed(1)} ★` : "—"], ["Joined", fmtDate(selected.createdAt)]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v || "—")}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                <button onClick={() => { setEditing(selected); setEditForm({ fullName: selected.fullName || "", phone: (selected.phone as string) || "", vehicleType: selected.vehicleType || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                <button onClick={() => { updateRider(selected.id, { isOnline: !selected.isOnline }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)", color: C.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Force {selected.isOnline ? "Offline" : "Online"}</button>
                <button onClick={() => { setConfirm({ uid: selected.id, name: selected.fullName || "", action: "resetRating" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: C.yellow, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Reset Rating</button>
                <button onClick={() => { setConfirm({ uid: selected.id, name: selected.fullName || "", action: "deleteRider" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif", marginBottom: 20 }}>Edit Rider</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={lbl}>Full Name</label><input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Vehicle Type</label><input value={editForm.vehicleType} onChange={e => setEditForm(f => ({ ...f, vehicleType: e.target.value }))} style={inp} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal message={confirm.action === "resetRating" ? `Reset rating for "${confirm.name}"?` : confirm.action === "deleteRider" ? `Delete rider "${confirm.name}"?` : `${confirm.action === "ban" ? "Ban" : "Unban"} "${confirm.name}"?`} onConfirm={execConfirm} onCancel={() => setConfirm(null)} danger={confirm.action !== "unban"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ORDERS PAGE — item images + proper order number
// ═══════════════════════════════════════════════════════════════════════
function OrdersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<OrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), async snap => {
      const rawOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as OrderDoc));
      const vendorIds = [...new Set(rawOrders.filter(o => !o.vendorName && o.vendorId).map(o => o.vendorId as string))];
      const vendorNameMap: Record<string, string> = {};
      if (vendorIds.length > 0) {
        await Promise.all(vendorIds.map(async vid => {
          try { const vs = await getDoc(doc(db, "vendors", vid)); if (vs.exists()) { const vd = vs.data(); vendorNameMap[vid] = vd.businessName || vd.storeName || vid.slice(-6); } } catch {}
        }));
      }
      setOrders(rawOrders.map(o => ({ ...o, vendorName: o.vendorName || (o.vendorId ? vendorNameMap[o.vendorId as string] : undefined) || "—" })));
      setLoading(false);
    });
    getDocs(collection(db, "riders")).then(snap => setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderDoc))));
    return u1;
  }, []);

  const filtered = orders.filter(o => {
    const ms = o.id.includes(search) || (o.orderNumber || "").toLowerCase().includes(search.toLowerCase()) || (o.customerName || "").toLowerCase().includes(search.toLowerCase()) || (o.vendorName || "").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || o.status === filter || (filter === "disputed" && o.disputed);
    return ms && mf;
  });

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : o);
    await logAudit(adminUser, "order_status_change", "order", id, id, `→ ${status}`);
    showToast(`Status → ${status}`, "success");
  };

  const getItemImage = (item: NonNullable<OrderDoc["items"]>[0]): string | null => {
    if (!item) return null;
    const fields = ["image", "imageUrl", "imageURL", "img", "photo", "thumbnail", "itemImage", "productImage", "picture", "photoURL", "coverImage", "cover", "icon"];
    for (const f of fields) { const v = item[f]; if (typeof v === "string" && v.startsWith("http")) return v; }
    for (const v of Object.values(item)) {
      if (typeof v === "string" && (v.startsWith("https://") || v.startsWith("http://")) &&
        (v.includes("firebasestorage") || v.includes("cloudinary") || v.includes(".jpg") || v.includes(".png") || v.includes(".webp"))) return v;
    }
    return null;
  };

  const issueRefund = async (orderId: string) => {
    if (!canDo(adminUser, "canIssueRefunds", orderId)) { openPermRequest("canIssueRefunds", `Issue refund on order ${getOrderDisplay(selected!)}`, orderId); return; }
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    await addDoc(collection(db, "refunds"), { orderId, amount, note: refundNote, issuedBy: adminUser?.uid, issuedByName: adminUser?.displayName, createdAt: serverTimestamp() });
    await logAudit(adminUser, "refund_issued", "order", orderId, orderId, `₦${amount} — ${refundNote}`);
    showToast(`Refund of ₦${amount} issued`, "success");
    setRefundAmount(""); setRefundNote("");
  };

  const reassignRider = async (orderId: string, riderId: string, riderName: string) => {
    if (!canDo(adminUser, "canReassignRider", orderId)) { openPermRequest("canReassignRider", `Re-assign rider on order ${getOrderDisplay(selected!)}`, orderId); return; }
    await updateDoc(doc(db, "orders", orderId), { riderId, riderName });
    if (selected?.id === orderId) setSelected(o => o ? { ...o, riderId, riderName } : o);
    showToast("Rider reassigned", "success");
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4 }}>Orders</h1>
      <p style={{ color: C.muted, marginBottom: 22, fontSize: 13 }}>{orders.length} total orders</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "pending", "processing", "in-transit", "delivered", "cancelled", "disputed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No orders" icon={<RiShoppingBagLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Order", "Customer", "Vendor", "Total", "Date", "Status", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(o => (
              <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: o.disputed ? "rgba(239,68,68,0.03)" : "transparent" }} onClick={() => { setSelected(o); setEditAddress(o.deliveryAddress || ""); setEditingAddress(false); }}>
                <td style={{ padding: "12px 16px", color: C.orange, fontWeight: 800, fontSize: 12 }}>{getOrderDisplay(o)}</td>
                <td style={{ padding: "12px 16px", color: C.text, fontSize: 13 }}>{o.customerName || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{o.vendorName || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.orange, fontWeight: 800, fontSize: 12 }}>{fmt(o.total || 0)}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 11 }}>{ago(o.createdAt)}</td>
                <td style={{ padding: "12px 16px" }}>{o.disputed ? <Badge status="disputed" /> : <Badge status={o.status || "pending"} />}</td>
                <td style={{ padding: "12px 16px" }}><button onClick={e => { e.stopPropagation(); setSelected(o); setEditAddress(o.deliveryAddress || ""); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", color: C.muted, cursor: "pointer", fontSize: 11 }}><RiEyeLine size={12} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {imagePreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setImagePreview(null)}>
          <div style={{ position: "relative", maxWidth: 700, width: "100%", maxHeight: "90vh" }}>
            <img src={imagePreview} alt="Item" style={{ width: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: 14 }} />
            <button onClick={() => setImagePreview(null)} style={{ position: "absolute", top: -14, right: -14, width: 32, height: 32, borderRadius: "50%", background: C.red, border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><RiCloseLine size={16} /></button>
          </div>
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ color: C.orange, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif" }}>{getOrderDisplay(selected)}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{fmtDate(selected.createdAt)}</div>
                </div>
                {selected.disputed ? <Badge status="disputed" /> : <Badge status={selected.status || "pending"} />}
              </div>
              {[["Customer", selected.customerName], ["Email", selected.customerEmail], ["Phone", selected.customerPhone], ["Vendor", selected.vendorName], ["Rider", selected.riderName || "Not assigned"], ["Total", fmt(selected.total || 0)], ["Payment", selected.paymentMethod || "—"]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 110, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v) || "—"}</div>
                </div>
              ))}
              <div style={{ borderBottom: `1px solid ${C.border}`, padding: "9px 0", display: "flex", gap: 14 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 110, flexShrink: 0, textTransform: "uppercase" }}>Delivery Address</div>
                <div style={{ flex: 1 }}>
                  {editingAddress ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={editAddress} onChange={e => setEditAddress(e.target.value)} style={{ ...inp, flex: 1 }} />
                      <button onClick={async () => { await updateDoc(doc(db, "orders", selected.id), { deliveryAddress: editAddress }); if (selected) setSelected(o => o ? { ...o, deliveryAddress: editAddress } : o); showToast("Address updated", "success"); setEditingAddress(false); }} style={{ padding: "8px 12px", borderRadius: 9, background: C.green, border: "none", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><RiCheckLine size={13} /></button>
                      <button onClick={() => setEditingAddress(false)} style={{ padding: "8px 12px", borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}><RiCloseLine size={13} /></button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: C.text, fontSize: 13 }}>{selected.deliveryAddress || "—"}</span>
                      <button onClick={() => setEditingAddress(true)} style={{ padding: "4px 8px", borderRadius: 7, background: "none", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, cursor: "pointer" }}><RiEditLine size={11} /> Edit</button>
                    </div>
                  )}
                </div>
              </div>
              {selected.items && selected.items.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Order Items</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selected.items.map((item, i) => {
                      const imgSrc = getItemImage(item);
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.dim, display: "flex", alignItems: "center", justifyContent: "center", cursor: imgSrc ? "pointer" : "default", border: `1px solid ${C.border}` }} onClick={() => imgSrc && setImagePreview(imgSrc)}>
                            {imgSrc ? <img src={imgSrc} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <RiImageLine size={20} color={C.muted} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{item.name}</div>
                            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Qty: {item.qty} · {fmt(item.price)} each</div>
                          </div>
                          <div style={{ color: C.orange, fontWeight: 800, fontSize: 13 }}>{fmt(item.price * item.qty)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 12px", marginTop: 4 }}>
                    <span style={{ color: C.muted, fontSize: 12, marginRight: 12 }}>Order Total</span>
                    <span style={{ color: C.orange, fontWeight: 900, fontSize: 16, fontFamily: "'Syne', sans-serif" }}>{fmt(selected.total || 0)}</span>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Update Status</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["processing", "in-transit", "delivered", "cancelled"].map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${selected.status === s ? C.orange : C.border}`, background: selected.status === s ? C.orangeGlow : "transparent", color: selected.status === s ? C.orange : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>Re-assign Rider</div>
                <select onChange={e => { const r = riders.find(r => r.id === e.target.value); if (r) reassignRider(selected.id, r.id, r.fullName || ""); }} defaultValue="" style={inp}>
                  <option value="">Select rider…</option>
                  {riders.filter(r => r.approved && r.status !== "banned").map(r => <option key={r.id} value={r.id}>{r.fullName} ({r.vehicleType})</option>)}
                </select>
              </div>
              <div style={{ marginTop: 16, background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)", borderRadius: 14, padding: 16 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Issue Refund</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder="Amount (₦)" type="number" style={{ ...inp, flex: 1 }} />
                  <input value={refundNote} onChange={e => setRefundNote(e.target.value)} placeholder="Reason…" style={{ ...inp, flex: 2 }} />
                  <button onClick={() => issueRefund(selected.id)} style={{ padding: "0 16px", borderRadius: 11, background: `linear-gradient(135deg, ${C.green}, #059669)`, border: "none", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Issue</button>
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BLUE BADGE PAGE
// ═══════════════════════════════════════════════════════════════════════
function BlueBadgePage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [apps, setApps] = useState<BlueBadgeDoc[]>([]);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<BlueBadgeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectionNote, setRejectionNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    const q = filter === "all" ? query(collection(db, "blueBadgeApplications"), orderBy("submittedAt", "desc")) : query(collection(db, "blueBadgeApplications"), where("status", "==", filter), orderBy("submittedAt", "desc"));
    return onSnapshot(q, snap => { setApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlueBadgeDoc))); setLoading(false); });
  }, [filter]);

  const approve = async (app: BlueBadgeDoc) => {
    setProcessing(true);
    try {
      await updateDoc(doc(db, "blueBadgeApplications", app.id), { status: "approved", reviewedBy: adminUser?.uid, reviewedAt: serverTimestamp() });
      await updateDoc(doc(db, "vendors", app.vendorId!), { blueBadge: true });
      await logAudit(adminUser, "blue_badge_approved", "vendor", app.vendorId!, app.vendorName || "");
      showToast(`Blue badge approved for ${app.vendorName}`, "success");
      setSelected(null);
    } catch { showToast("Failed to approve", "error"); }
    setProcessing(false);
  };

  const reject = async (app: BlueBadgeDoc) => {
    if (!rejectionNote.trim()) { showToast("Enter a rejection reason", "error"); return; }
    setProcessing(true);
    try {
      await updateDoc(doc(db, "blueBadgeApplications", app.id), { status: "rejected", rejectionNote: rejectionNote.trim(), reviewedBy: adminUser?.uid, reviewedAt: serverTimestamp() });
      await logAudit(adminUser, "blue_badge_rejected", "vendor", app.vendorId!, app.vendorName || "", rejectionNote);
      showToast("Application rejected", "info");
      setSelected(null); setRejectionNote("");
    } catch { showToast("Failed to reject", "error"); }
    setProcessing(false);
  };

  const DOC_LABELS: Record<string, string> = { cac: "CAC Certificate", id: "Government ID", memat: "MEMAT/Tax Clearance", selfie: "Selfie with ID" };

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <RiVerifiedBadgeLine size={24} color={C.blue} /> Blue Badge Applications
      </h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Review vendor verification documents</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {["pending", "approved", "rejected", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
            {f === "pending" ? `Pending (${apps.filter(a => a.status === "pending").length})` : f}
          </button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : apps.length === 0 ? <Empty text="No applications" icon={<RiVerifiedBadgeLine />} C={C} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {apps.map(app => (
            <div key={app.id} style={{ background: C.surface, border: `1px solid ${app.status === "pending" ? "rgba(245,158,11,0.3)" : C.border}`, borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }} onClick={() => setSelected(app)}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(59,130,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0 }}><RiVerifiedBadgeLine size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{app.vendorName || "Unknown Vendor"}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{app.vendorEmail} · Submitted {fmtDate(app.submittedAt)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Badge status={app.status || "pending"} /><span style={{ color: C.muted, fontSize: 12 }}>{Object.keys(app.documents || {}).length} docs</span></div>
            </div>
          ))}
        </div>
      )}
      {previewDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setPreviewDoc(null)}>
          <div style={{ maxWidth: 800, width: "100%", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ color: C.text, fontWeight: 700 }}>{previewDoc.label}</div>
              <button onClick={() => setPreviewDoc(null)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", color: C.muted, cursor: "pointer" }}><RiCloseLine size={14} /></button>
            </div>
            <img src={previewDoc.url} alt={previewDoc.label} style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12 }} />
          </div>
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: C.text }}>Blue Badge Review</h2>
                <Badge status={selected.status || "pending"} />
              </div>
              <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 14, padding: 16, marginBottom: 22 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>{selected.vendorName}</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{selected.vendorEmail}</div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 14 }}>Submitted Documents</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {Object.entries(selected.documents || {}).map(([key, url]) => (
                    <div key={key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", cursor: "pointer" }} onClick={() => setPreviewDoc({ url: url as string, label: DOC_LABELS[key] || key })}>
                      <div style={{ height: 100, overflow: "hidden" }}><img src={url as string} alt={key} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                      <div style={{ padding: "8px 12px" }}>
                        <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{DOC_LABELS[key] || key}</div>
                        <div style={{ color: C.green, fontSize: 10, fontWeight: 700, marginTop: 2 }}>✓ Uploaded</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {selected.status === "pending" && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Rejection reason (required to reject)</label>
                    <textarea value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} placeholder="Explain why the application was rejected…" rows={3} style={{ ...inp, resize: "vertical" } as React.CSSProperties} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button disabled={processing} onClick={() => approve(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: "linear-gradient(135deg, #1877F2, #0a5cd8)", border: "none", color: "white", fontWeight: 800, cursor: "pointer", opacity: processing ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <RiVerifiedBadgeLine size={16} /> {processing ? "Processing…" : "Approve Blue Badge"}
                    </button>
                    <button disabled={processing || !rejectionNote.trim()} onClick={() => reject(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontWeight: 800, cursor: "pointer", opacity: (processing || !rejectionNote.trim()) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <RiCloseLine size={16} /> Reject
                    </button>
                  </div>
                </>
              )}
              <button onClick={() => setSelected(null)} style={{ marginTop: 16, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DISCOUNT PAGE
// ═══════════════════════════════════════════════════════════════════════
function DiscountPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [discounts, setDiscounts] = useState<DiscountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: string; code: string } | null>(null);
  const [form, setForm] = useState({ code: "", type: "percentage" as "percentage" | "fixed", value: "", minOrder: "", maxUses: "", expiresAt: "", description: "" });

  useEffect(() => {
    return onSnapshot(query(collection(db, "discounts"), orderBy("createdAt", "desc")), snap => {
      setDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountDoc)));
      setLoading(false);
    });
  }, []);

  const createDiscount = async () => {
    if (!form.code.trim() || !form.value) { showToast("Code and value are required", "error"); return; }
    setCreating(true);
    try {
      const data: Record<string, unknown> = { code: form.code.trim().toUpperCase(), type: form.type, value: parseFloat(form.value), minOrder: form.minOrder ? parseFloat(form.minOrder) : 0, maxUses: form.maxUses ? parseInt(form.maxUses) : null, usedCount: 0, status: "active", description: form.description, createdBy: adminUser?.uid, createdAt: serverTimestamp() };
      if (form.expiresAt) data.expiresAt = Timestamp.fromDate(new Date(form.expiresAt));
      await addDoc(collection(db, "discounts"), data);
      await logAudit(adminUser, "discount_created", "discount", form.code.trim().toUpperCase(), form.code.trim().toUpperCase(), `${form.type}: ${form.value}`);
      showToast(`Discount code ${form.code.toUpperCase()} created`, "success");
      setShowCreate(false);
      setForm({ code: "", type: "percentage", value: "", minOrder: "", maxUses: "", expiresAt: "", description: "" });
    } catch { showToast("Failed to create discount", "error"); }
    setCreating(false);
  };

  const toggleStatus = async (id: string, currentStatus: string, code: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await updateDoc(doc(db, "discounts", id), { status: newStatus });
    showToast(`Discount ${newStatus}`, "success");
    setConfirm(null);
  };

  const deleteDiscount = async (id: string, code: string) => {
    await deleteDoc(doc(db, "discounts", id));
    await logAudit(adminUser, "discount_deleted", "discount", id, code);
    showToast("Discount deleted", "info");
    setConfirm(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiPriceTag3Line size={24} color={C.orange} /> Discounts</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{discounts.length} discount codes</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          <RiAddLine size={16} /> Create Discount
        </button>
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : discounts.length === 0 ? <Empty text="No discount codes" icon={<RiPriceTag3Line />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Code", "Type", "Value", "Min Order", "Uses", "Expires", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{discounts.map(d => (
              <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: C.orangeGlow, display: "flex", alignItems: "center", justifyContent: "center", color: C.orange }}><RiCouponLine size={15} /></div>
                    <div>
                      <div style={{ color: C.text, fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>{d.code}</div>
                      {d.description && <div style={{ color: C.muted, fontSize: 11 }}>{d.description}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}><span style={{ color: d.type === "percentage" ? C.purple : C.cyan, fontWeight: 700, fontSize: 12, textTransform: "capitalize" }}>{d.type}</span></td>
                <td style={{ padding: "12px 16px", color: C.orange, fontWeight: 900, fontSize: 14 }}>{d.type === "percentage" ? `${d.value}%` : fmt(d.value || 0)}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{d.minOrder ? fmt(d.minOrder) : "—"}</td>
                <td style={{ padding: "12px 16px", color: C.text, fontSize: 12, fontWeight: 700 }}>{d.usedCount || 0}{d.maxUses ? ` / ${d.maxUses}` : ""}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{d.expiresAt ? fmtDate(d.expiresAt) : "Never"}</td>
                <td style={{ padding: "12px 16px" }}><Badge status={d.status || "active"} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setConfirm({ id: d.id, action: "toggle", code: d.code || "" })} style={{ padding: "4px 10px", borderRadius: 8, background: d.status === "active" ? "rgba(74,74,106,0.2)" : "rgba(16,185,129,0.1)", border: "none", color: d.status === "active" ? C.muted : C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d.status === "active" ? "Disable" : "Enable"}</button>
                    <button onClick={() => setConfirm({ id: d.id, action: "delete", code: d.code || "" })} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}><RiDeleteBinLine size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowCreate(false)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 500, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Syne', sans-serif", marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}><RiPriceTag3Line size={20} color={C.orange} /> Create Discount Code</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Discount Code *</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20" style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Type</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as "percentage" | "fixed" }))} style={{ ...inp, cursor: "pointer" }}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount (₦)</option></select></div>
                <div><label style={lbl}>Value *</label><input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === "percentage" ? "e.g. 20" : "e.g. 500"} style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Min. Order (₦)</label><input type="number" value={form.minOrder} onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))} placeholder="Optional" style={inp} /></div>
                <div><label style={lbl}>Max Uses</label><input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" style={inp} /></div>
              </div>
              <div><label style={lbl}>Expiry Date</label><input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Description (optional)</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. First order discount" style={inp} /></div>
            </div>
            {form.code && form.value && (
              <div style={{ marginTop: 16, background: C.orangeGlow, border: `1px solid ${C.orange}30`, borderRadius: 12, padding: 14 }}>
                <div style={{ color: C.orange, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>Preview</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 900, fontSize: 18, color: C.text, letterSpacing: 1 }}>{form.code}</span>
                  <span style={{ color: C.orange, fontWeight: 800, fontSize: 16 }}>→ {form.type === "percentage" ? `${form.value}% off` : `₦${form.value} off`}</span>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button disabled={creating} onClick={createDiscount} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", opacity: creating ? 0.7 : 1 }}>{creating ? "Creating…" : "Create Discount"}</button>
            </div>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal message={confirm.action === "delete" ? `Delete discount "${confirm.code}"?` : `Toggle discount "${confirm.code}"?`} sub={confirm.action === "delete" ? "This cannot be undone." : undefined} onConfirm={() => { if (confirm.action === "delete") deleteDiscount(confirm.id, confirm.code); else { const d = discounts.find(x => x.id === confirm.id); if (d) toggleStatus(confirm.id, d.status || "active", confirm.code); } }} onCancel={() => setConfirm(null)} danger={confirm.action === "delete"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PERMISSION REQUESTS PAGE
// ═══════════════════════════════════════════════════════════════════════
function PermissionRequestsPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const [requests, setRequests] = useState<PermissionRequestDoc[]>([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<PermissionRequestDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiryHours, setExpiryHours] = useState("2");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const q = filter === "all" ? query(collection(db, "permissionRequests"), orderBy("createdAt", "desc")) : query(collection(db, "permissionRequests"), where("status", "==", filter), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => { setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PermissionRequestDoc))); setLoading(false); },
      () => getDocs(collection(db, "permissionRequests")).then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as PermissionRequestDoc));
        setRequests(filter === "all" ? all : all.filter(r => r.status === filter));
        setLoading(false);
      })
    );
  }, [filter]);

  const approve = async (req: PermissionRequestDoc) => {
    setProcessing(true);
    try {
      if ((req as any).isRefundRequest && (req as any).refundAmount) {
        await addDoc(collection(db, "refunds"), { orderId: req.targetId, amount: (req as any).refundAmount, note: req.reason, issuedBy: adminUser?.uid, issuedByName: adminUser?.displayName, approvedFromRequest: req.id, createdAt: serverTimestamp() });
        await updateDoc(doc(db, "permissionRequests", req.id), { status: "approved", reviewedBy: adminUser?.uid, reviewedAt: serverTimestamp() });
        showToast(`Refund of ₦${(req as any).refundAmount} approved & issued`, "success");
        setSelected(null); setProcessing(false); return;
      }
      const hours = parseInt(expiryHours) || 2;
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
      await updateDoc(doc(db, "permissionRequests", req.id), { status: "approved", reviewedBy: adminUser?.uid, reviewedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt) });
      await updateDoc(doc(db, "admins", req.requesterId!), { [`tempPermissions.${req.action}`]: { granted: true, expiresAt: Timestamp.fromDate(expiresAt), targetId: req.targetId || null } });
      showToast(`Permission granted for ${hours}h`, "success");
      setSelected(null);
    } catch { showToast("Failed", "error"); }
    setProcessing(false);
  };

  const deny = async (req: PermissionRequestDoc) => {
    await updateDoc(doc(db, "permissionRequests", req.id), { status: "denied", reviewedBy: adminUser?.uid, reviewedAt: serverTimestamp() });
    showToast("Request denied", "info");
    setSelected(null);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiLockPasswordLine size={22} color={C.yellow} /> Permission Requests</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Admins requesting temporary elevated access</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["pending", "approved", "denied", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
            {f === "pending" ? `Pending (${requests.filter(r => r.status === "pending").length})` : f}
          </button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : requests.length === 0 ? <Empty text="No requests" icon={<RiLockPasswordLine />} C={C} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} style={{ background: C.surface, border: `1px solid ${r.status === "pending" ? "rgba(245,158,11,0.3)" : C.border}`, borderRadius: 16, padding: 18, cursor: "pointer" }} onClick={() => setSelected(r)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Avatar name={r.requesterName} size={38} C={C} />
                  <div><div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{r.requesterName || "Unknown Admin"}</div><div style={{ color: C.muted, fontSize: 12 }}>{r.requesterEmail}</div></div>
                </div>
                <Badge status={r.status || "pending"} />
              </div>
              <div style={{ background: "rgba(255,107,0,0.06)", border: "1px solid rgba(255,107,0,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                <div style={{ color: C.orange, fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{r.action}</div>
                <div style={{ color: C.text, fontSize: 13 }}>{r.description}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.muted, fontSize: 12 }}>Reason: {r.reason || "—"}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>{r.suggestedDuration} · {ago(r.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 20 }}>Permission Request</h2>
              {[["Requester", selected.requesterName], ["Email", selected.requesterEmail], ["Action", selected.action], ["Target", `${selected.targetType}: ${selected.targetId?.slice(0, 16) || "any"}`], ["Description", selected.description], ["Reason", selected.reason], ["Duration", selected.suggestedDuration], ["Submitted", fmtDateTime(selected.createdAt)]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 130, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v) || "—"}</div>
                </div>
              ))}
              {selected.status === "pending" && (
                <div style={{ marginTop: 20 }}>
                  <label style={lbl}>Grant duration</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {["1", "2", "6", "12", "24", "72"].map(h => (
                      <button key={h} onClick={() => setExpiryHours(h)} style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${expiryHours === h ? C.orange : C.border}`, background: expiryHours === h ? C.orangeGlow : "transparent", color: expiryHours === h ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{h}h</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button disabled={processing} onClick={() => approve(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: `linear-gradient(135deg, ${C.green}, #059669)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", opacity: processing ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><RiCheckLine size={15} /> Approve ({expiryHours}h)</button>
                    <button disabled={processing} onClick={() => deny(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: C.red, fontWeight: 800, cursor: "pointer", opacity: processing ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><RiCloseLine size={15} /> Deny</button>
                  </div>
                </div>
              )}
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUPER ADMIN PAGE
// ═══════════════════════════════════════════════════════════════════════
function SuperAdminPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string; action: string } | null>(null);

  const ACTIONS = [
    { key: "canDeleteUsers", label: "Delete Users/Vendors/Riders" },
    { key: "canResetPasswords", label: "Reset Passwords" },
    { key: "canIssueRefunds", label: "Issue Refunds" },
    { key: "canReassignRider", label: "Reassign Riders" },
    { key: "canEditDeliveryAddress", label: "Edit Delivery Address" },
    { key: "canUnlinkBankAccount", label: "Unlink Bank Account" },
    { key: "canChangeVerifiedStatus", label: "Revoke Verified Status" },
    { key: "canResetRiderRating", label: "Reset Rider Rating" },
    { key: "canForceRiderOnline", label: "Force Rider Online/Offline" },
    { key: "canAccessAuditLog", label: "Access Audit Log" },
    { key: "canExportData", label: "Export Data (CSV)" },
    { key: "canDeleteTickets", label: "Delete Support Tickets" },
    { key: "canMarkDisputed", label: "Mark Order Disputed" },
    { key: "canChangePlatformSettings", label: "Platform Settings" },
  ];

  useEffect(() => {
    if (adminUser?.role !== "superadmin") return;
    return onSnapshot(query(collection(db, "admins"), orderBy("createdAt", "desc")), snap => {
      setAdmins(snap.docs.map(d => ({ uid: d.id, ...d.data() } as AdminUser)));
      setLoading(false);
    });
  }, [adminUser]);

  const updatePermission = async (adminId: string, key: string, value: boolean) => {
    await updateDoc(doc(db, "admins", adminId), { [`permissions.${key}`]: value });
    setSelected(a => a ? { ...a, permissions: { ...a.permissions, [key]: value } } : a);
    showToast("Permission updated", "success");
  };

  const updateRole = async (adminId: string, role: "admin" | "superadmin") => {
    await updateDoc(doc(db, "admins", adminId), { role });
    showToast("Role updated", "success");
    setConfirm(null);
  };

  const removeAdmin = async (adminId: string) => {
    await updateDoc(doc(db, "admins", adminId), { active: false, status: "removed" });
    showToast("Admin removed", "info");
    setConfirm(null);
  };

  if (adminUser?.role !== "superadmin") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.red }}><RiShieldUserLine size={34} /></div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 12 }}>Super Admin Only</h2>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiFlashlightLine size={22} color={C.purple} /> Admin Management</h1>
      <p style={{ color: C.muted, marginBottom: 28, fontSize: 13 }}>Manage admin accounts, roles, and permissions</p>
      <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 14 }}>All Admins ({admins.length})</h3>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {admins.map(a => (
            <div key={a.uid} style={{ background: C.surface, border: `1px solid ${a.role === "superadmin" ? "rgba(139,92,246,0.3)" : C.border}`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setSelected(a)}>
              <Avatar src={a.photoURL as string | null} name={a.displayName as string | null} size={40} C={C} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{(a.displayName as string) || "—"}</div>
                <div style={{ color: C.muted, fontSize: 12 }}>{(a.email as string)}</div>
              </div>
              <Badge status={a.role || "admin"} />
              {a.uid !== adminUser?.uid && (
                <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setConfirm({ id: a.uid, name: (a.displayName as string) || (a.email as string), action: a.role === "superadmin" ? "demote" : "promote" })} style={{ padding: "5px 12px", borderRadius: 8, background: a.role === "superadmin" ? "rgba(74,74,106,0.2)" : "rgba(139,92,246,0.1)", border: "none", color: a.role === "superadmin" ? C.muted : C.purple, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{a.role === "superadmin" ? "Demote" : "Promote"}</button>
                  <button onClick={() => setConfirm({ id: a.uid, name: (a.displayName as string) || (a.email as string), action: "remove" })} style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 22 }}>
                <Avatar src={selected.photoURL as string | null} name={selected.displayName as string | null} size={48} C={C} />
                <div>
                  <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>{(selected.displayName as string) || "—"}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{(selected.email as string)}</div>
                  <div style={{ marginTop: 6 }}><Badge status={selected.role || "admin"} /></div>
                </div>
              </div>
              {selected.role === "superadmin" ? (
                <div style={{ padding: "14px 18px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 12, color: C.purple, fontSize: 14, fontWeight: 700 }}>⚡ Super Admin — has all permissions by default</div>
              ) : (
                <>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 14 }}>Individual Permissions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {ACTIONS.map(action => {
                      const on = selected.permissions?.[action.key] ?? false;
                      return (
                        <div key={action.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{action.label}</span>
                          <div onClick={() => updatePermission(selected.uid, action.key, !on)} style={{ width: 44, height: 24, borderRadius: 12, background: on ? C.orange : C.dim, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                            <div style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <button onClick={() => setSelected(null)} style={{ marginTop: 18, width: "100%", padding: 11, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal message={confirm.action === "remove" ? `Remove "${confirm.name}" as admin?` : confirm.action === "promote" ? `Promote "${confirm.name}" to Super Admin?` : `Demote "${confirm.name}" to Regular Admin?`} onConfirm={() => { if (confirm.action === "remove") removeAdmin(confirm.id); else if (confirm.action === "promote") updateRole(confirm.id, "superadmin"); else updateRole(confirm.id, "admin"); }} onCancel={() => setConfirm(null)} danger={confirm.action === "remove"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN INVITES PAGE
// ═══════════════════════════════════════════════════════════════════════
function AdminInvitesPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [invites, setInvites] = useState<AdminInviteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "superadmin">("admin");
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; email: string } | null>(null);

  useEffect(() => {
    return onSnapshot(query(collection(db, "adminInvites"), orderBy("createdAt", "desc")), snap => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminInviteDoc)));
      setLoading(false);
    });
  }, []);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) { showToast("Enter an email address", "error"); return; }
    const existing = invites.find(i => i.email === inviteEmail.trim() && i.status === "pending");
    if (existing) { showToast("A pending invite already exists for this email", "error"); return; }
    setInviting(true);
    try {
      const ref2 = await addDoc(collection(db, "adminInvites"), { email: inviteEmail.trim(), role: inviteRole, invitedBy: adminUser?.uid, invitedByName: adminUser?.displayName || adminUser?.email, createdAt: serverTimestamp(), status: "pending" });
      showToast(`Invite sent to ${inviteEmail}`, "success");
      setInviteEmail("");
    } catch { showToast("Failed to send invite", "error"); }
    setInviting(false);
  };

  const revokeInvite = async (id: string, email: string) => {
    await updateDoc(doc(db, "adminInvites", id), { status: "expired" });
    showToast("Invite revoked", "info");
    setConfirm(null);
  };

  const copyInviteLink = (id: string) => {
    const link = `${window.location.origin}/admin-signup?invite=${id}`;
    navigator.clipboard.writeText(link).then(() => showToast("Invite link copied!", "success")).catch(() => showToast("Failed to copy", "error"));
  };

  if (adminUser?.role !== "superadmin") return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.red }}><RiShieldLine size={34} /></div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: C.text }}>Super Admin Only</h2>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiTeamLine size={22} color={C.cyan} /> Admin Invites</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Invite new administrators to the platform</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard icon={<RiTeamLine size={18} />} label="Total Invites" value={invites.length} color={C.blue} C={C} />
        <StatCard icon={<RiTimeLine size={18} />} label="Pending" value={invites.filter(i => i.status === "pending").length} color={C.yellow} C={C} />
        <StatCard icon={<RiCheckLine size={18} />} label="Accepted" value={invites.filter(i => i.status === "accepted").length} color={C.green} C={C} />
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 22, marginBottom: 24 }}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><RiSendPlaneLine size={16} color={C.orange} /> Invite New Admin</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiMailLine size={14} /></span>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && sendInvite()} placeholder="Email address…" style={{ ...inp, paddingLeft: 38 }} />
          </div>
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "admin" | "superadmin")} style={{ padding: "11px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 13, outline: "none", cursor: "pointer" }}>
            <option value="admin">Regular Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
          <button disabled={inviting || !inviteEmail.trim()} onClick={sendInvite} style={{ padding: "11px 20px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", opacity: inviting || !inviteEmail.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
            <RiSendPlaneLine size={14} /> {inviting ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : invites.length === 0 ? <Empty text="No invites sent yet" icon={<RiTeamLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Email", "Role", "Invited By", "Sent", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{invites.map(inv => (
              <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.orangeGlow, display: "flex", alignItems: "center", justifyContent: "center", color: C.orange }}><RiMailLine size={14} /></div>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{inv.email}</div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}><Badge status={inv.role || "admin"} /></td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{inv.invitedByName || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{ago(inv.createdAt)}</td>
                <td style={{ padding: "12px 16px" }}><Badge status={inv.status || "pending"} /></td>
                <td style={{ padding: "12px 16px" }}>
                  {inv.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => copyInviteLink(inv.id)} style={{ padding: "4px 10px", borderRadius: 8, background: `rgba(59,130,246,0.1)`, border: "none", color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiFileCopyLine size={11} /> Copy Link</button>
                      <button onClick={() => setConfirm({ id: inv.id, email: inv.email || "" })} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiCloseLine size={11} /> Revoke</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {confirm && <ConfirmModal message={`Revoke invite for "${confirm.email}"?`} sub="They won't be able to use this invite link." onConfirm={() => revokeInvite(confirm.id, confirm.email)} onCancel={() => setConfirm(null)} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT LOG PAGE
// ═══════════════════════════════════════════════════════════════════════
function AuditLogPage({ adminUser, C }: { adminUser: AdminUser | null; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [logs, setLogs] = useState<AuditLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    return onSnapshot(query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(300)), snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLogDoc)));
      setLoading(false);
    });
  }, []);

  const actionColors: Record<string, string> = { user_banned: C.red, user_active: C.green, vendor_verified: C.blue, vendor_banned: C.red, blue_badge_approved: C.blue, blue_badge_rejected: C.red, permission_request_approved: C.green, admin_removed: C.red, order_status_change: C.yellow, refund_issued: C.purple, rider_updated: C.cyan, discount_created: C.green, discount_deleted: C.red };

  const filtered = logs.filter(l => {
    const mf = filter === "all" || (l.targetType || "").toLowerCase() === filter;
    const ms = !search || (l.adminName || "").toLowerCase().includes(search.toLowerCase()) || (l.action || "").toLowerCase().includes(search.toLowerCase()) || (l.targetName || "").toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiFileHistoryLine size={22} color={C.cyan} /> Audit Log</h1>
      <p style={{ color: C.muted, marginBottom: 22, fontSize: 13 }}>Every admin action recorded ({logs.length} entries)</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "user", "vendor", "rider", "order", "admin", "discount"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{f}</button>
        ))}
      </div>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading logs…</div> : filtered.length === 0 ? <Empty text="No audit logs" icon={<RiFileHistoryLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
          {filtered.map((log, i) => (
            <div key={log.id} style={{ display: "flex", gap: 14, padding: "14px 20px", borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: actionColors[log.action || ""] || C.muted, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{log.adminName}</span>
                  <span style={{ color: C.muted, fontSize: 11 }}>({log.adminRole})</span>
                  <span style={{ color: actionColors[log.action || ""] || C.muted, fontWeight: 700, fontSize: 12, background: "rgba(255,107,0,0.06)", padding: "2px 8px", borderRadius: 6 }}>{log.action}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{log.targetType}: <span style={{ color: C.text }}>{log.targetName || log.targetId}</span>{log.details && <span style={{ marginLeft: 8 }}>· {log.details}</span>}</div>
              </div>
              <div style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{ago(log.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PLATFORM SETTINGS PAGE — ENHANCED MAINTENANCE MODE
// ═══════════════════════════════════════════════════════════════════════
function PlatformSettingsPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [settings, setSettings] = useState<MaintenanceSettings>({
    maintenanceMode: false,
    maintenanceMessage: "",
    maintenanceTargets: ["all"],
    allowNewRegistrations: true,
    allowVendorSignups: true,
    allowRiderSignups: true,
    deliveryBaseFee: "500",
    platformFeePercent: "10",
    minOrderAmount: "1000",
    supportEmail: "",
    supportPhone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "platformSettings", "global")).then(snap => {
      if (snap.exists()) setSettings(s => ({ ...s, ...snap.data() }));
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "platformSettings", "global"), { ...settings, updatedAt: serverTimestamp(), updatedBy: adminUser?.uid }, { merge: true });
      await logAudit(adminUser, "platform_settings_updated", "platform", "global", "Platform Settings");
      showToast("Platform settings saved", "success");
    } catch { showToast("Failed to save settings", "error"); }
    setSaving(false);
  };

  const DASHBOARD_OPTIONS = [
    { key: "all", label: "All Dashboards", color: C.orange, icon: "🌐" },
    { key: "customer", label: "Customer App", color: C.blue, icon: "👤" },
    { key: "vendor", label: "Vendor Dashboard", color: C.green, icon: "🏪" },
    { key: "rider", label: "Rider Dashboard", color: C.yellow, icon: "🏍️" },
    { key: "admin", label: "Admin Panel", color: C.purple, icon: "⚙️" },
  ];

  const toggleTarget = (key: string) => {
    setSettings(s => {
      if (key === "all") return { ...s, maintenanceTargets: ["all"] };
      const current = s.maintenanceTargets.filter(t => t !== "all");
      if (current.includes(key)) {
        const next = current.filter(t => t !== key);
        return { ...s, maintenanceTargets: next.length === 0 ? ["all"] : next };
      } else {
        return { ...s, maintenanceTargets: [...current, key] };
      }
    });
  };

  const Toggle = ({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? C.orange : C.dim, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
      </div>
    </div>
  );

  if (adminUser?.role !== "superadmin") return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.red }}><RiShieldLine size={34} /></div>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: C.text }}>Super Admin Only</h2>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}><RiToolsLine size={22} color={C.orange} /> Platform Settings</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>Global platform configuration</p>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ─── MAINTENANCE MODE CARD ─── */}
          <div style={{ background: C.surface, border: `2px solid ${settings.maintenanceMode ? "rgba(239,68,68,0.4)" : C.border}`, borderRadius: 18, padding: 24, transition: "border-color 0.3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <RiBellLine size={18} color={settings.maintenanceMode ? C.red : C.muted} />
                  Maintenance Mode
                </h3>
                <p style={{ color: C.muted, fontSize: 12 }}>Show a maintenance banner on selected dashboards</p>
              </div>
              <div onClick={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))} style={{ width: 52, height: 28, borderRadius: 14, background: settings.maintenanceMode ? C.red : C.dim, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 4, left: settings.maintenanceMode ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
              </div>
            </div>

            {settings.maintenanceMode && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                {/* Message input */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ ...lbl, color: C.muted }}>Maintenance Message</label>
                  <textarea
                    value={settings.maintenanceMessage}
                    onChange={e => setSettings(s => ({ ...s, maintenanceMessage: e.target.value }))}
                    placeholder="e.g. We're performing scheduled maintenance. We'll be back shortly. 🔧"
                    rows={3}
                    style={{ ...inp, resize: "vertical" } as React.CSSProperties}
                  />
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>This message will be shown as a banner on the selected dashboards</div>
                </div>

                {/* Dashboard target selector */}
                <div>
                  <label style={{ ...lbl, color: C.muted }}>Show On</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {DASHBOARD_OPTIONS.map(opt => {
                      const isSelected = settings.maintenanceTargets.includes(opt.key) || (opt.key !== "all" && settings.maintenanceTargets.includes("all"));
                      const isAll = opt.key === "all";
                      const activeColor = opt.color;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => toggleTarget(opt.key)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12,
                            border: `2px solid ${isSelected ? activeColor : C.border}`,
                            background: isSelected ? `${activeColor}15` : "transparent",
                            color: isSelected ? activeColor : C.muted,
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                          {isSelected && <RiCheckLine size={14} />}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                    Selected: {settings.maintenanceTargets.includes("all") ? "All Dashboards" : settings.maintenanceTargets.map(t => DASHBOARD_OPTIONS.find(o => o.key === t)?.label).filter(Boolean).join(", ") || "None"}
                  </div>
                </div>

                {/* Preview */}
                {settings.maintenanceMessage && (
                  <div style={{ marginTop: 18, padding: "14px 18px", background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.3)", borderRadius: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Banner Preview</div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <RiAlertFill size={16} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ color: C.red, fontWeight: 700, fontSize: 13 }}>Maintenance in Progress</div>
                        <div style={{ color: C.text, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{settings.maintenanceMessage}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                          Showing on: {settings.maintenanceTargets.includes("all") ? "All Dashboards" : settings.maintenanceTargets.map(t => DASHBOARD_OPTIONS.find(o => o.key === t)?.label).join(", ")}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── ACCESS CONTROLS ─── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 }}>
            <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Access Controls</h3>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Control who can register on the platform</p>
            <Toggle value={settings.allowNewRegistrations} onChange={v => setSettings(s => ({ ...s, allowNewRegistrations: v }))} label="Allow New User Registrations" sub="New customers can sign up" />
            <Toggle value={settings.allowVendorSignups} onChange={v => setSettings(s => ({ ...s, allowVendorSignups: v }))} label="Allow Vendor Signups" sub="New vendors can apply to join" />
            <Toggle value={settings.allowRiderSignups} onChange={v => setSettings(s => ({ ...s, allowRiderSignups: v }))} label="Allow Rider Signups" sub="New riders can apply to join" />
          </div>

          {/* ─── FEES ─── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 }}>
            <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Fees & Limits</h3>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Configure platform fees and order constraints</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div><label style={lbl}>Base Delivery Fee (₦)</label><input type="number" value={settings.deliveryBaseFee} onChange={e => setSettings(s => ({ ...s, deliveryBaseFee: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Platform Fee (%)</label><input type="number" value={settings.platformFeePercent} onChange={e => setSettings(s => ({ ...s, platformFeePercent: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Min. Order Amount (₦)</label><input type="number" value={settings.minOrderAmount} onChange={e => setSettings(s => ({ ...s, minOrderAmount: e.target.value }))} style={inp} /></div>
            </div>
          </div>

          {/* ─── SUPPORT ─── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 }}>
            <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Support Contact</h3>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Displayed to users needing help</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={lbl}>Support Email</label><input type="email" value={settings.supportEmail} onChange={e => setSettings(s => ({ ...s, supportEmail: e.target.value }))} placeholder="support@swiftnija.com" style={inp} /></div>
              <div><label style={lbl}>Support Phone</label><input type="tel" value={settings.supportPhone} onChange={e => setSettings(s => ({ ...s, supportPhone: e.target.value }))} placeholder="+234..." style={inp} /></div>
            </div>
          </div>

          {settings.maintenanceMode && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 14, padding: "14px 18px", display: "flex", gap: 10, alignItems: "center" }}>
              <RiAlertFill size={18} color={C.red} />
              <span style={{ color: C.red, fontSize: 13, fontWeight: 700 }}>
                Maintenance mode is ON — banners are showing on: {settings.maintenanceTargets.includes("all") ? "All Dashboards" : settings.maintenanceTargets.map(t => DASHBOARD_OPTIONS.find(o => o.key === t)?.label).join(", ")}
              </span>
            </div>
          )}

          <button disabled={saving} onClick={save} style={{ alignSelf: "flex-start", padding: "12px 28px", borderRadius: 14, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Platform Settings"}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════
function SettingsPage({ adminUser, onProfileUpdate, C }: { adminUser: AdminUser | null; onProfileUpdate: (u: Partial<AdminUser>) => void; C: typeof DARK_COLORS }) {
  const inp = makeInp(C);
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ displayName: (adminUser?.displayName as string) || "", phone: "", bio: "" });
  const [passwords, setPasswords] = useState({ current: "", newPw: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (!adminUser) return;
    getDoc(doc(db, "admins", adminUser.uid)).then(s => {
      if (s.exists()) { const d = s.data(); setProfile(p => ({ ...p, phone: (d.phone as string) || "", bio: (d.bio as string) || "" })); }
    });
  }, [adminUser]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminUser) return;
    setSaving(true);
    const r = ref(storage, `admins/${adminUser.uid}/avatar`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
    await updateDoc(doc(db, "admins", adminUser.uid), { photoURL: url });
    onProfileUpdate({ photoURL: url });
    setSaving(false);
  };

  const saveProfile = async () => {
    if (!adminUser) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: profile.displayName });
      await updateDoc(doc(db, "admins", adminUser.uid), { displayName: profile.displayName, phone: profile.phone, bio: profile.bio, updatedAt: serverTimestamp() });
      onProfileUpdate({ displayName: profile.displayName });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setError((e as Error).message); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!adminUser) return;
    if (passwords.newPw !== passwords.confirm) { setError("Passwords don't match"); return; }
    if (passwords.newPw.length < 8) { setError("Minimum 8 characters"); return; }
    setSaving(true); setError("");
    try {
      const cred = EmailAuthProvider.credential(adminUser.email as string, passwords.current);
      if (auth.currentUser) { await reauthenticateWithCredential(auth.currentUser, cred); await updatePassword(auth.currentUser, passwords.newPw); }
      setPasswords({ current: "", newPw: "", confirm: "" });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setError((e as { code?: string }).code === "auth/wrong-password" ? "Current password is wrong" : (e as Error).message); }
    setSaving(false);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 24 }}>Settings</h1>
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            {[["profile", "Profile", <RiUserLine size={14} />], ["security", "Security", <RiShieldLine size={14} />]].map(([k, l, ic]) => (
              <button key={String(k)} onClick={() => { setTab(String(k)); setError(""); setSaved(false); }} style={{ width: "100%", padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, background: tab === k ? C.orangeGlow : "transparent", border: "none", borderLeft: `3px solid ${tab === k ? C.orange : "transparent"}`, color: tab === k ? C.orange : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
                {ic} {l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 26 }}>
          {error && <div style={{ padding: "11px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, color: C.red, fontSize: 12, fontWeight: 600, marginBottom: 18 }}>{error}</div>}
          {saved && <div style={{ padding: "11px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, color: C.green, fontSize: 12, fontWeight: 600, marginBottom: 18 }}>✓ Saved!</div>}
          {tab === "profile" && (
            <div>
              <h2 style={{ color: C.text, fontWeight: 800, fontSize: 17, marginBottom: 22 }}>Profile</h2>
              <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 26 }}>
                <div style={{ position: "relative" }}>
                  <Avatar src={adminUser?.photoURL as string | null} name={adminUser?.displayName as string | null} size={72} C={C} />
                  <button onClick={() => fileRef.current?.click()} style={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: "50%", background: C.orange, border: `2px solid ${C.bg}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white" }}><RiUploadLine size={12} /></button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
                </div>
                <div>
                  <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{profile.displayName || "Admin"}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{adminUser?.email as string}</div>
                  <div style={{ marginTop: 6 }}><Badge status={adminUser?.role || "admin"} /></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={lbl}>Name</label><input value={profile.displayName} onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))} style={inp} /></div>
                <div><label style={lbl}>Phone</label><input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ marginBottom: 22 }}><label style={lbl}>Bio</label><textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
              <button onClick={saveProfile} disabled={saving} style={{ padding: "11px 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          )}
          {tab === "security" && (
            <div>
              <h2 style={{ color: C.text, fontWeight: 800, fontSize: 17, marginBottom: 22 }}>Change Password</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}>
                <div><label style={lbl}>Current Password</label><input type="password" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} style={inp} /></div>
                <div style={{ position: "relative" }}>
                  <label style={lbl}>New Password</label>
                  <input type={showPw ? "text" : "password"} value={passwords.newPw} onChange={e => setPasswords(p => ({ ...p, newPw: e.target.value }))} style={{ ...inp, paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, bottom: 10, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
                    {showPw ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
                <div><label style={lbl}>Confirm Password</label><input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} style={inp} /></div>
                <button onClick={changePassword} disabled={saving || !passwords.current || !passwords.newPw} style={{ padding: "11px 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: saving || !passwords.current ? 0.6 : 1 }}>
                  {saving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activePage, setActivePage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [permModal, setPermModal] = useState<{ action: string; description: string; targetId?: string } | null>(null);
  const [pendingBadgeCount, setPendingBadgeCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [discountCount, setDiscountCount] = useState(0);
  const [activeAdsCount, setActiveAdsCount] = useState(0);

  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("swiftnija_admin_theme") as Theme) || "dark"; } catch { return "dark"; }
  });
  const C = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("swiftnija_admin_theme", next); } catch { }
  };

  const showToast = useCallback((msg: string, type: "success" | "error" | "info") => setToast({ msg, type }), []);
  const openPermRequest = useCallback((action: string, description: string, targetId?: string) => setPermModal({ action, description, targetId }), []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async user => {
      if (!user) { navigate("/admin/login"); return; }
      const snap = await getDoc(doc(db, "admins", user.uid));
      if (!snap.exists()) { await signOut(auth); navigate("/admin/login"); return; }
      setAdminUser({ uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL, ...snap.data() });
      setAuthChecked(true);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!authChecked) return;
    const nowIso = new Date().toISOString();
    const u1 = onSnapshot(query(collection(db, "blueBadgeApplications"), where("status", "==", "pending")), s => setPendingBadgeCount(s.size));
    const u2 = onSnapshot(query(collection(db, "permissionRequests"), where("status", "==", "pending")), s => setPendingRequestCount(s.size));
    const u3 = onSnapshot(query(collection(db, "discounts"), where("status", "==", "active")), s => setDiscountCount(s.size));
    const u4 = onSnapshot(query(collection(db, "adPromotions")), snap => {
      const active = snap.docs.filter(d => { const a = d.data(); return a.endDate > nowIso && a.status !== "cancelled"; });
      setActiveAdsCount(active.length);
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, [authChecked]);

  const handleLogout = async () => { await signOut(auth); navigate("/admin/login"); };
  const isSuperAdmin = adminUser?.role === "superadmin";

  const NAV = [
    { key: "overview",    icon: <RiDashboardLine size={18} />,     label: "Overview" },
    { key: "users",       icon: <RiUserLine size={18} />,          label: "Users" },
    { key: "vendors",     icon: <RiStoreLine size={18} />,         label: "Vendors" },
    { key: "riders",      icon: <RiBikeLine size={18} />,          label: "Riders" },
    { key: "orders",      icon: <RiShoppingBagLine size={18} />,   label: "Orders" },
    { key: "ads",         icon: <RiMegaphoneLine size={18} />,     label: "Ads", badge: activeAdsCount },
    { key: "sendpickup",  icon: <RiBox3Line size={18} />,          label: "Send & Pickup" },
    { key: "support",     icon: <RiMessage2Line size={18} />,      label: "Support" },
    { key: "bluebadge",   icon: <RiVerifiedBadgeLine size={18} />, label: "Blue Badge", badge: pendingBadgeCount },
    { key: "discounts",   icon: <RiPriceTag3Line size={18} />,     label: "Discounts", badge: discountCount },
    { key: "payoutsconfig", icon: <RiExchangeFundsLine size={18} />, label: "Payouts Config" },
    { key: "finance", icon: <RiWalletLine size={18} />, label: "Finance" },
    { key: "permissions", icon: <RiLockPasswordLine size={18} />,  label: "Permissions", badge: pendingRequestCount },
    { key: "superadmin",  icon: <RiShieldUserLine size={18} />,    label: "Admin Mgmt" },
    { key: "invites",     icon: <RiTeamLine size={18} />,          label: "Invite Admin" },
    { key: "auditlog",    icon: <RiFileHistoryLine size={18} />,   label: "Audit Log" },
    { key: "platform",    icon: <RiToolsLine size={18} />,         label: "Platform" },
    { key: "settings",    icon: <RiSettings3Line size={18} />,     label: "Settings" },
  ];

  const renderPage = () => {
    const props = { adminUser, showToast, openPermRequest, C };
    switch (activePage) {
      case "overview":    return <OverviewPage adminUser={adminUser} C={C} />;
      case "users":       return <UsersPage {...props} />;
      case "vendors":     return <VendorsPage {...props} />;
      case "riders":      return <RidersPage {...props} />;
      case "orders":      return <OrdersPage {...props} />;
      case "ads":         return <AdsPage adminUser={adminUser} showToast={showToast} C={C as Record<string, string>} />;
      case "sendpickup":  return <SendPickupAdminPage showToast={showToast} C={C as Record<string, string>} />;
      case "support":     return <AdminSupportPage C={C as Record<string, string>} />;
      case "bluebadge":   return <BlueBadgePage adminUser={adminUser} showToast={showToast} C={C} />;
      case "discounts":   return <DiscountPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "permissions": return <PermissionRequestsPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "superadmin":  return <SuperAdminPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "invites":     return <AdminInvitesPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "auditlog":    return <AuditLogPage adminUser={adminUser} C={C} />;
      case "payoutsconfig": return <PayoutsConfigPage adminUser={adminUser} showToast={showToast} C={C as Record<string, string>} />;
     case "finance": return <AdminFinancePage />;
      case "platform":    return <PlatformSettingsPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "settings":    return <SettingsPage adminUser={adminUser} onProfileUpdate={u => setAdminUser(a => a ? { ...a, ...u } : a)} C={C} />;
      default:            return <OverviewPage adminUser={adminUser} C={C} />;
    }
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: DARK_COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ animation: "spin 1.2s linear infinite", color: DARK_COLORS.orange }}><RiFlashlightLine size={40} /></div>
          </div>
          <div style={{ color: DARK_COLORS.muted, fontSize: 14 }}>Loading SwiftNija Super Admin…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'Nunito', sans-serif", color: C.text, transition: "background 0.25s, color 0.25s" }}>
      {/* SIDEBAR */}
      <aside style={{ width: sidebarOpen ? 232 : 62, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden", position: "sticky", top: 0, height: "100vh", background: C.sidebarBg, backdropFilter: "blur(16px)" }}>
        <div style={{ padding: "18px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, minHeight: 62 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}><RiFlashlightLine size={18} /></div>
          {sidebarOpen && (
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, color: C.text }}>swift<span style={{ color: C.orange }}>nija</span></div>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.purple, textTransform: "uppercase", letterSpacing: 1 }}>⚡ Super Admin</div>
            </div>
          )}
        </div>
        <nav style={{ flex: 1, padding: "10px 7px", overflowY: "auto" }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActivePage(n.key)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, border: "none", background: activePage === n.key ? C.orangeGlow : "transparent", color: activePage === n.key ? C.orange : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left", marginBottom: 2, whiteSpace: "nowrap", borderLeft: `2px solid ${activePage === n.key ? C.orange : "transparent"}`, transition: "all 0.15s" }}>
              <span style={{ flexShrink: 0 }}>{n.icon}</span>
              {sidebarOpen && <span style={{ flex: 1 }}>{n.label}</span>}
              {sidebarOpen && (n.badge ?? 0) > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: C.red, color: "white", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, marginBottom: 4, cursor: "pointer" }} onClick={() => setActivePage("settings")}>
            <Avatar src={adminUser?.photoURL as string | null} name={adminUser?.displayName as string | null} size={30} C={C} />
            {sidebarOpen && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(adminUser?.displayName as string) || "Admin"}</div>
                <div style={{ color: C.purple, fontSize: 10, fontWeight: 700 }}>⚡ Super Admin</div>
              </div>
            )}
          </div>
          <button onClick={handleLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, border: "none", background: "transparent", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <RiLogoutBoxLine size={16} />{sidebarOpen && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: C.headerBg, zIndex: 100, backdropFilter: "blur(12px)", transition: "background 0.25s" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px", cursor: "pointer", color: C.muted, display: "flex" }}><RiMenuLine size={16} /></button>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `rgba(16,185,129,0.08)`, borderRadius: 20, border: "1px solid rgba(16,185,129,0.15)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
            <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>Live</span>
          </div>
          {pendingBadgeCount > 0 && (
            <button onClick={() => setActivePage("bluebadge")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 20, color: C.blue, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              <RiVerifiedBadgeLine size={12} /> {pendingBadgeCount} badge{pendingBadgeCount !== 1 ? "s" : ""}
            </button>
          )}
          {pendingRequestCount > 0 && (
            <button onClick={() => setActivePage("permissions")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 20, color: C.yellow, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              <RiLockPasswordLine size={12} /> {pendingRequestCount} request{pendingRequestCount !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={toggleTheme} style={{ width: 36, height: 36, borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <RiSunLine size={16} /> : <RiMoonLine size={16} />}
          </button>
          <Avatar src={adminUser?.photoURL as string | null} name={adminUser?.displayName as string | null} size={32} C={C} />
        </div>
        <div style={{ padding: "26px" }}>
          {renderPage()}
        </div>
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} C={C} />}
      {permModal && (
        <RequestPermissionModal
          action={permModal.action}
          targetId={permModal.targetId}
          description={permModal.description}
          adminUser={adminUser}
          onClose={() => setPermModal(null)}
          showToast={showToast}
          C={C}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.18); border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #FF6B00 !important; box-shadow: 0 0 0 3px rgba(255,107,0,0.08) !important; }
        tr:hover { background: rgba(255,255,255,0.015) !important; }
      `}</style>
    </div>
  );
}