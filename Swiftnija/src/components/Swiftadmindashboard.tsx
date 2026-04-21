// SwiftAdminDashboard.tsx — REGULAR ADMIN DASHBOARD (Limited Access)
// This is for regular admins - no audit logs, no invite admin, cannot create discounts (view only)
// Refund requests need super admin approval

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, onSnapshot, orderBy, doc, updateDoc, addDoc,
  serverTimestamp, where, getDoc, getDocs, limit, deleteDoc,
  Timestamp,
} from "firebase/firestore";
import {
  signOut, updateProfile, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase";
import { useNavigate } from "react-router-dom";
import AdminLiveCalls from "../components/Adminlivecalls";


// ─── REACT ICONS ──────────────────────────────────────────────────────────────
import {
  RiDashboardLine, RiUserLine, RiStoreLine, RiBikeLine, RiShoppingBagLine,
  RiMessage2Line, RiVerifiedBadgeLine, RiLockPasswordLine, RiShieldUserLine,
  RiFileHistoryLine, RiSettings3Line, RiLogoutBoxLine, RiMenuLine,
  RiSearchLine, RiAlertLine, RiCheckLine, RiCloseLine, RiSendPlaneLine,
  RiDeleteBinLine, RiEditLine, RiEyeLine, RiEyeOffLine, RiDownload2Line,
  RiRefundLine, RiBankLine, RiStarLine, RiAlertFill, RiShieldLine,
  RiArrowUpLine, RiArrowDownLine, RiWalletLine, RiUserStarLine, RiToolsLine,
  RiToggleLine, RiFlashlightLine, RiUploadLine, RiFileListLine,
  RiUserForbidLine, RiUserFollowLine, RiPriceTag3Line, RiInformationLine,
  RiTeamLine, RiNotificationLine, RiSunLine, RiMoonLine, RiAddLine,
  RiTimeLine, RiGlobalLine, RiPhoneLine, RiMailLine, RiBellLine,
  RiArrowRightLine, RiRefreshLine, RiFilterLine, RiEyeCloseLine,
  RiImageLine, RiMegaphoneLine, RiBox3Line,
} from "react-icons/ri";
import AdminSupportPage from "../Pages/Adminsupportpage";
import AdsPage from "../Pages/AdminAdspage";
import SendPickupAdminPage from "../Pages/Sendpickupadminpage";
import { useMaintenanceBanner } from "../hooks/useMaintenanceBanner";

// ─── TYPES ────────────────────────────────────────────────────────────────────
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

interface UserDoc {
  id: string;
  fullName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  status?: string;
  orderCount?: number;
  createdAt?: Timestamp;
  address?: string;
  bio?: string;
  [key: string]: unknown;
}

interface VendorDoc {
  id: string;
  businessName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  category?: string;
  address?: string;
  bio?: string;
  logo?: string;
  coverPhoto?: string;
  status?: string;
  verified?: boolean;
  blueBadge?: boolean;
  bankLinked?: boolean;
  bankName?: string;
  accountNumber?: string;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface RiderDoc {
  id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  vehicleType?: string;
  deliveryCount?: number;
  rating?: number;
  status?: string;
  isOnline?: boolean;
  approved?: boolean;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface OrderDoc {
  id: string;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  vendorName?: string;
  vendorId?: string;
  riderName?: string;
  deliveryAddress?: string;
  total?: number;
  status?: string;
  paymentMethod?: string;
  items?: {
    name: string;
    qty: number;
    price: number;
    image?: string;
    imageUrl?: string;
    imageURL?: string;
    img?: string;
    photo?: string;
    thumbnail?: string;
    itemImage?: string;
    productImage?: string;
    picture?: string;
    photoURL?: string;
    coverImage?: string;
    cover?: string;
    icon?: string;
    [key: string]: unknown;
  }[];
  createdAt?: Timestamp;
  riderId?: string;
  userId?: string;
  customerId?: string;
  disputed?: boolean;
  [key: string]: unknown;
}

interface TicketDoc {
  id: string;
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
  userRole?: string;
  subject?: string;
  lastMessage?: string;
  status?: string;
  adminUnread?: number;
  userUnread?: number;
  updatedAt?: Timestamp;
  [key: string]: unknown;
}

interface MessageDoc {
  id: string;
  text?: string;
  senderRole?: string;
  senderName?: string;
  senderPhoto?: string | null;
  createdAt?: Timestamp;
  [key: string]: unknown;
}

interface BlueBadgeDoc {
  id: string;
  vendorId?: string;
  vendorName?: string;
  vendorEmail?: string;
  documents?: Record<string, string>;
  status?: "pending" | "approved" | "rejected";
  submittedAt?: Timestamp;
  rejectionNote?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  [key: string]: unknown;
}

interface PermissionRequestDoc {
  id: string;
  requesterId?: string;
  requesterName?: string;
  requesterEmail?: string;
  action?: string;
  targetId?: string;
  targetType?: string;
  description?: string;
  reason?: string;
  suggestedDuration?: string;
  status?: "pending" | "approved" | "denied";
  createdAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  expiresAt?: Timestamp;
  [key: string]: unknown;
}

interface DiscountDoc {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perUserLimit?: number;
  applicableTo: "all" | "vendors" | "categories";
  vendorIds?: string[];
  categories?: string[];
  startDate: Timestamp;
  endDate: Timestamp;
  status: "active" | "expired" | "disabled";
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  description?: string;
}

interface RefundRequestDoc {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: Timestamp;
  status: "pending" | "approved" | "denied";
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  rejectionReason?: string;
}

// ─── THEME ────────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";

const DARK = {
  bg: "#08080f",
  bgSecondary: "#0d0d1a",
  surface: "rgba(255,255,255,0.03)",
  surface2: "rgba(255,255,255,0.055)",
  surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#e8e8f5",
  textSub: "#9898b8",
  muted: "#4a4a6a",
  orange: "#FF6B00",
  orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.12)",
  green: "#10B981",
  red: "#EF4444",
  blue: "#3B82F6",
  yellow: "#F59E0B",
  purple: "#8B5CF6",
  cyan: "#06B6D4",
  shadow: "rgba(0,0,0,0.5)",
  modalBg: "#0d0d1a",
  sidebarBg: "rgba(255,255,255,0.015)",
  headerBg: "rgba(8,8,15,0.9)",
  cardGrad: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
};

const LIGHT = {
  bg: "#f0f0f8",
  bgSecondary: "#fafaff",
  surface: "rgba(255,255,255,0.85)",
  surface2: "rgba(255,255,255,0.95)",
  surfaceHover: "rgba(255,107,0,0.04)",
  border: "rgba(0,0,0,0.07)",
  borderStrong: "rgba(0,0,0,0.14)",
  text: "#12121e",
  textSub: "#4a4a6a",
  muted: "#8888aa",
  orange: "#FF6B00",
  orangeD: "#cc5200",
  orangeGlow: "rgba(255,107,0,0.1)",
  green: "#059669",
  red: "#DC2626",
  blue: "#2563EB",
  yellow: "#D97706",
  purple: "#7C3AED",
  cyan: "#0891B2",
  shadow: "rgba(0,0,0,0.1)",
  modalBg: "#ffffff",
  sidebarBg: "rgba(255,255,255,0.7)",
  headerBg: "rgba(240,240,248,0.9)",
  cardGrad: "linear-gradient(135deg, #ffffff 0%, rgba(240,240,248,0.8) 100%)",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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

const getItemImage = (item: NonNullable<OrderDoc["items"]>[0]): string | null => {
  if (!item) return null;
  const knownFields = [
    "image", "imageUrl", "imageURL", "img", "photo", "thumbnail",
    "itemImage", "productImage", "picture", "photoURL", "coverImage", "cover", "icon",
  ];
  for (const f of knownFields) {
    const v = item[f];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  for (const v of Object.values(item)) {
    if (
      typeof v === "string" &&
      (v.startsWith("https://") || v.startsWith("http://")) &&
      (v.includes("firebasestorage") || v.includes("cloudinary") || v.includes("imgur") ||
        v.includes(".jpg") || v.includes(".png") || v.includes(".webp") || v.includes(".jpeg"))
    ) {
      return v;
    }
  }
  return null;
};

// ─── AUDIT LOGGER ─────────────────────────────────────────────────────────────
async function logAudit(admin: AdminUser | null, action: string, targetType: string, targetId: string, targetName: string, details?: string) {
  if (!admin) return;
  try {
    await addDoc(collection(db, "auditLogs"), {
      adminId: admin.uid,
      adminName: admin.displayName || admin.email || "Admin",
      adminRole: admin.role || "admin",
      action,
      targetType,
      targetId,
      targetName,
      details: details || "",
      createdAt: serverTimestamp(),
    });
  } catch (e) { console.error("Audit log failed:", e); }
}

// ─── PERMISSION CHECKER ───────────────────────────────────────────────────────
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

// ─── BADGE ────────────────────────────────────────────────────────────────────
const Badge = ({ status, C }: { status: string; C: typeof DARK }) => {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: `${C.green}18`, color: C.green, label: "Active" },
    inactive: { bg: `${C.muted}22`, color: C.muted, label: "Inactive" },
    banned: { bg: `${C.red}18`, color: C.red, label: "Banned" },
    pending: { bg: `${C.yellow}18`, color: C.yellow, label: "Pending" },
    verified: { bg: `${C.blue}18`, color: C.blue, label: "Verified" },
    delivered: { bg: `${C.green}18`, color: C.green, label: "Delivered" },
    processing: { bg: `${C.yellow}18`, color: C.yellow, label: "Processing" },
    cancelled: { bg: `${C.red}18`, color: C.red, label: "Cancelled" },
    "in-transit": { bg: `${C.blue}18`, color: C.blue, label: "In Transit" },
    "in_transit": { bg: `${C.blue}18`, color: C.blue, label: "In Transit" },
    intransit: { bg: `${C.blue}18`, color: C.blue, label: "In Transit" },
    open: { bg: `${C.yellow}18`, color: C.yellow, label: "Open" },
    resolved: { bg: `${C.green}18`, color: C.green, label: "Resolved" },
    online: { bg: `${C.green}18`, color: C.green, label: "Online" },
    offline: { bg: `${C.muted}22`, color: C.muted, label: "Offline" },
    approved: { bg: `${C.green}18`, color: C.green, label: "Approved" },
    rejected: { bg: `${C.red}18`, color: C.red, label: "Rejected" },
    denied: { bg: `${C.red}18`, color: C.red, label: "Denied" },
    superadmin: { bg: `${C.purple}22`, color: C.purple, label: "Super Admin" },
    admin: { bg: `${C.blue}18`, color: C.blue, label: "Admin" },
    disputed: { bg: `${C.red}22`, color: C.red, label: "Disputed" },
    removed: { bg: `${C.muted}22`, color: C.muted, label: "Removed" },
    unban: { bg: `${C.green}18`, color: C.green, label: "Active" },
    placed: { bg: `${C.yellow}18`, color: C.yellow, label: "Placed" },
    confirmed: { bg: `${C.blue}18`, color: C.blue, label: "Confirmed" },
    ready: { bg: `${C.cyan}18`, color: C.cyan, label: "Ready" },
    picked: { bg: `${C.purple}18`, color: C.purple, label: "Picked Up" },
    failed: { bg: `${C.red}18`, color: C.red, label: "Failed" },
    refunded: { bg: `${C.purple}18`, color: C.purple, label: "Refunded" },
  };
  const key = (status || "").toLowerCase().replace(/\s+/g, "-");
  const s = map[key] ?? { bg: `${C.muted}22`, color: C.muted, label: status || "Unknown" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 40, fontSize: 10, fontWeight: 800, background: s.bg, color: s.color, textTransform: "uppercase", letterSpacing: 0.7, whiteSpace: "nowrap", border: `1px solid ${s.color}28` }}>
      {s.label}
    </span>
  );
};

// ─── AVATAR ───────────────────────────────────────────────────────────────────
const Avatar = ({ src, name, size = 36, C }: { src?: string | null; name?: string | null; size?: number; C: typeof DARK }) => {
  const initials = (name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = [C.orange, C.blue, C.purple, C.green, C.yellow, C.cyan];
  const bg = colors[(name || "").charCodeAt(0) % colors.length];
  if (src) return <img src={src} alt={name ?? ""} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${C.border}` }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: size * 0.36, flexShrink: 0, border: `2px solid ${bg}44` }}>
      {initials}
    </div>
  );
};

// ─── STAT CARD ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color, trend, C: colors }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string; trend?: { val: string; up: boolean }; C: typeof DARK }) => (
  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10, position: "relative", overflow: "hidden", boxShadow: `0 2px 16px ${colors.shadow}`, backdropFilter: "blur(12px)" }}>
    <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at 80% 20%, ${color}18 0%, transparent 70%)`, pointerEvents: "none" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ width: 42, height: 42, borderRadius: 13, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, border: `1px solid ${color}28` }}>{icon}</div>
      {trend && (
        <span style={{ fontSize: 11, fontWeight: 800, color: trend.up ? colors.green : colors.red, background: trend.up ? `${colors.green}18` : `${colors.red}18`, padding: "3px 8px", borderRadius: 8, display: "flex", alignItems: "center", gap: 3 }}>
          {trend.up ? <RiArrowUpLine size={11} /> : <RiArrowDownLine size={11} />}{trend.val}
        </span>
      )}
    </div>
    <div>
      <div style={{ fontSize: 26, fontWeight: 900, color: colors.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{label}</div>
    </div>
    {sub && <div style={{ fontSize: 11, color: colors.muted, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>{sub}</div>}
  </div>
);

// ─── EMPTY ────────────────────────────────────────────────────────────────────
const Empty = ({ text = "No data yet", icon, C }: { text?: string; icon?: React.ReactNode; C: typeof DARK }) => (
  <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted }}>
    <div style={{ fontSize: 36, marginBottom: 10, display: "flex", justifyContent: "center", opacity: 0.25 }}>{icon || <RiFileListLine size={40} />}</div>
    <div style={{ fontWeight: 700, fontSize: 14 }}>{text}</div>
  </div>
);

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
const ConfirmModal = ({ message, sub, onConfirm, onCancel, danger = true, C }: { message: string; sub?: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; C: typeof DARK }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
    <div style={{ background: C.modalBg, border: `1px solid ${danger ? C.red + "44" : C.green + "44"}`, borderRadius: 22, padding: 32, maxWidth: 380, width: "90%", textAlign: "center", boxShadow: `0 20px 60px ${C.shadow}` }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: danger ? `${C.red}15` : `${C.green}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: danger ? C.red : C.green, border: `1px solid ${danger ? C.red : C.green}28` }}>
        {danger ? <RiAlertFill size={24} /> : <RiInformationLine size={24} />}
      </div>
      <div style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: sub ? 8 : 24, lineHeight: 1.5 }}>{message}</div>
      {sub && <div style={{ color: C.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>{sub}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={onCancel} style={{ padding: "10px 22px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.textSub, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Cancel</button>
        <button onClick={onConfirm} style={{ padding: "10px 22px", borderRadius: 12, background: danger ? C.red : C.green, border: "none", color: "white", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, boxShadow: `0 4px 14px ${danger ? C.red : C.green}44` }}>Confirm</button>
      </div>
    </div>
  </div>
);

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose, C }: { msg: string; type: "success" | "error" | "info"; onClose: () => void; C: typeof DARK }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { success: C.green, error: C.red, info: C.blue };
  const icons = { success: <RiCheckLine size={15} />, error: <RiAlertLine size={15} />, info: <RiInformationLine size={15} /> };
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 99999, background: C.modalBg, border: `1px solid ${colors[type]}44`, borderRadius: 14, padding: "14px 18px", maxWidth: 360, boxShadow: `0 8px 32px ${C.shadow}`, display: "flex", alignItems: "center", gap: 10, animation: "slideIn 0.3s ease", backdropFilter: "blur(16px)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${colors[type]}18`, display: "flex", alignItems: "center", justifyContent: "center", color: colors[type], flexShrink: 0 }}>{icons[type]}</div>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", marginLeft: "auto", display: "flex" }}><RiCloseLine size={16} /></button>
    </div>
  );
};

// ─── SHARED INPUT STYLES ─────────────────────────────────────────────────────
const mkInp = (C: typeof DARK): React.CSSProperties => ({
  width: "100%", padding: "11px 14px",
  background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: 12, color: C.text, fontSize: 13,
  fontFamily: "'DM Sans', sans-serif", outline: "none",
});

const lbl: React.CSSProperties = {
  color: "inherit",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  display: "block",
  marginBottom: 7,
  opacity: 0.6,
};

// ─── REQUEST PERMISSION MODAL ─────────────────────────────────────────────────
function RequestPermissionModal({ action, targetId, targetType, description: defaultDesc, adminUser, onClose, showToast, C }: {
  action: string;
  targetId?: string;
  targetType?: string;
  description?: string;
  adminUser: AdminUser | null;
  onClose: () => void;
  showToast: (m: string, t: "success" | "error" | "info") => void;
  C: typeof DARK;
}) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("2 hours");
  const [submitting, setSubmitting] = useState(false);
  const inp = mkInp(C);

  const submit = async () => {
    if (!reason.trim()) { showToast("Please enter a reason", "error"); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "permissionRequests"), {
        requesterId: adminUser?.uid,
        requesterName: adminUser?.displayName || adminUser?.email,
        requesterEmail: adminUser?.email,
        action,
        targetId: targetId || null,
        targetType: targetType || null,
        description: defaultDesc || action,
        reason: reason.trim(),
        suggestedDuration: duration,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      showToast("Permission request sent to Super Admin", "success");
      onClose();
    } catch { showToast("Failed to submit request", "error"); }
    setSubmitting(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ background: C.modalBg, border: `1px solid ${C.yellow}33`, borderRadius: 22, width: "100%", maxWidth: 460, padding: 28, boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: `${C.yellow}18`, display: "flex", alignItems: "center", justifyContent: "center", color: C.yellow, border: `1px solid ${C.yellow}28`, flexShrink: 0 }}>
            <RiLockPasswordLine size={22} />
          </div>
          <div>
            <div style={{ color: C.text, fontWeight: 900, fontSize: 17, fontFamily: "'Space Grotesk', sans-serif" }}>Request Permission</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Super Admin will review your request</div>
          </div>
        </div>
        <div style={{ background: `${C.yellow}0d`, border: `1px solid ${C.yellow}22`, borderRadius: 12, padding: "10px 14px", marginBottom: 18 }}>
          <div style={{ color: C.yellow, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            <RiShieldLine size={13} /> Action: <span style={{ color: C.text }}>{action}</span>
          </div>
          {defaultDesc && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{defaultDesc}</div>}
          {targetId && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Target ID: {targetId.slice(0, 16)}…</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...lbl, color: C.textSub }}>Reason for request *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why do you need this permission?" style={{ ...inp, resize: "vertical" } as React.CSSProperties} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ ...lbl, color: C.textSub }}>How long do you need it?</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["1 hour", "2 hours", "6 hours", "24 hours"].map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{ padding: "6px 14px", borderRadius: 10, border: `1px solid ${duration === d ? C.orange : C.border}`, background: duration === d ? C.orangeGlow : "transparent", color: duration === d ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{d}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          <button disabled={submitting} onClick={submit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: `0 4px 14px ${C.orange}44` }}>
            <RiSendPlaneLine size={14} /> {submitting ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE ADS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
interface ActiveAdItem {
  id: string;
  vendorName: string;
  vendorLogo?: string;
  label: string;
  type: string;
  endDate: string;
  durationDays: number;
  status: string;
}

function getDaysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000));
}

const AD_TYPE_COLOR: Record<string, string> = {
  trending_homepage: "#FF6B00",
  search_priority:   "#3B82F6",
  search_trending:   "#10B981",
  homepage_banner:   "#8B5CF6",
};

function ActiveAdsPanel({ C }: { C: typeof DARK }) {
  const [ads, setAds] = useState<ActiveAdItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const nowIso = new Date().toISOString();
    return onSnapshot(
      query(collection(db, "adPromotions"), orderBy("endDate", "asc")),
      snap => {
        const active = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as ActiveAdItem))
          .filter(a => a.endDate > nowIso && a.status !== "cancelled");
        setAds(active);
        setLoading(false);
      }
    );
  }, []);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: `0 2px 16px ${C.shadow}`, backdropFilter: "blur(12px)" }}>
      <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6", display: "inline-block" }} /> Currently Running Ads
      </h3>
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading…</div>
      ) : ads.length === 0 ? (
        <Empty text="No active ads right now" icon={<RiMegaphoneLine />} C={C} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto", paddingRight: 2 }}>
          {ads.map(ad => {
            const dLeft = getDaysLeft(ad.endDate);
            const pct   = Math.max(0, Math.min(100, ((ad.durationDays - dLeft) / Math.max(ad.durationDays, 1)) * 100));
            const col   = AD_TYPE_COLOR[ad.type] || "#FF6B00";
            const urgent = dLeft <= 1;
            return (
              <div key={ad.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.surface2, border: `1px solid ${urgent ? "#F59E0B44" : C.border}`, borderRadius: 12 }}>
                {/* Logo / initial */}
                <div style={{ width: 32, height: 32, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: `${col}18`, border: `1px solid ${col}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {ad.vendorLogo
                    ? <img src={ad.vendorLogo} alt={ad.vendorName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <RiStoreLine size={14} color={col} />
                  }
                </div>

                {/* Name + plan + bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{ad.vendorName}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: col, background: `${col}14`, border: `1px solid ${col}25`, borderRadius: 6, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{ad.label}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 4, background: C.border, overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: urgent ? "#F59E0B" : col, borderRadius: 4, transition: "width .4s" }} />
                  </div>
                </div>

                {/* Days left */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: urgent ? "#F59E0B" : dLeft <= 2 ? "#F59E0B" : C.text, fontFamily: "'Space Grotesk',sans-serif" }}>{dLeft}d</div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewPage({ adminUser, C }: { adminUser: AdminUser | null; C: typeof DARK }) {
  const [stats, setStats] = useState({ users: 0, vendors: 0, riders: 0, orders: 0, activeAds: 0, tickets: 0, pendingBadges: 0, pendingRequests: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderDoc[]>([]);
  const [recentUsers, setRecentUsers] = useState<UserDoc[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<Record<string, number>>({});

  useEffect(() => {
    const subs: (() => void)[] = [];
    subs.push(onSnapshot(query(collection(db, "users")), s => setStats(p => ({ ...p, users: s.size }))));
    subs.push(onSnapshot(query(collection(db, "vendors")), s => setStats(p => ({ ...p, vendors: s.size }))));
    subs.push(onSnapshot(query(collection(db, "riders")), s => setStats(p => ({ ...p, riders: s.size }))));
    subs.push(onSnapshot(query(collection(db, "orders")), snap => {
      const byStatus: Record<string, number> = {};
      snap.forEach(d => {
        const o = d.data();
        byStatus[o.status || "pending"] = (byStatus[o.status || "pending"] || 0) + 1;
      });
      setStats(p => ({ ...p, orders: snap.size }));
      setOrdersByStatus(byStatus);
    }));
    // Active ads listener
    subs.push(onSnapshot(query(collection(db, "adPromotions")), snap => {
      const nowIso = new Date().toISOString();
      let activeAds = 0;
      snap.forEach(d => {
        const a = d.data();
        if (a.endDate > nowIso && a.status !== "cancelled") activeAds++;
      });
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 800, color: C.text }}>
            Welcome back, {adminUser?.displayName?.split(" ")[0] || "Admin"} 👋
          </h1>
          {adminUser?.role === "superadmin" && (
            <span style={{ padding: "3px 10px", borderRadius: 20, background: `${C.purple}18`, color: C.purple, fontSize: 11, fontWeight: 800, border: `1px solid ${C.purple}28` }}>⚡ Super Admin</span>
          )}
        </div>
        <p style={{ color: C.muted, fontSize: 14 }}>Here's what's happening on SwiftNija right now.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard icon={<RiUserLine size={18} />} label="Total Users" value={stats.users} color={C.blue} C={C} />
        <StatCard icon={<RiStoreLine size={18} />} label="Vendors" value={stats.vendors} color={C.orange} C={C} />
        <StatCard icon={<RiBikeLine size={18} />} label="Riders" value={stats.riders} color={C.green} C={C} />
        <StatCard icon={<RiShoppingBagLine size={18} />} label="Total Orders" value={stats.orders} color={C.yellow} C={C} />
        {/* Active Ads card */}
        <StatCard icon={<RiMegaphoneLine size={18} />} label="Active Ads" value={stats.activeAds} color={C.purple} C={C} />
        <StatCard icon={<RiMessage2Line size={18} />} label="Open Tickets" value={stats.tickets} color={C.red} C={C} />
        <StatCard icon={<RiVerifiedBadgeLine size={18} />} label="Badge Requests" value={stats.pendingBadges} color={C.cyan} sub="Awaiting review" C={C} />
        <StatCard icon={<RiLockPasswordLine size={18} />} label="Perm Requests" value={stats.pendingRequests} color={C.yellow} sub="Needs approval" C={C} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: `0 2px 16px ${C.shadow}`, backdropFilter: "blur(12px)" }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.orange, display: "inline-block" }} /> Orders by Status
          </h3>
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
                    <div style={{ height: 6, borderRadius: 4, background: C.surface2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: statusColors[s] || C.orange, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <ActiveAdsPanel C={C} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: `0 2px 16px ${C.shadow}`, backdropFilter: "blur(12px)" }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Recent Orders</h3>
          {recentOrders.length === 0 ? <Empty text="No orders" icon={<RiShoppingBagLine />} C={C} /> : recentOrders.map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{getOrderDisplay(o)}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{o.customerName || "—"} · {ago(o.createdAt)}</div>
              </div>
              <div style={{ color: C.orange, fontWeight: 800, fontSize: 12 }}>{fmt(o.total || 0)}</div>
              <Badge status={o.status || "pending"} C={C} />
            </div>
          ))}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: `0 2px 16px ${C.shadow}`, backdropFilter: "blur(12px)" }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: 15, marginBottom: 16 }}>New Users</h3>
          {recentUsers.length === 0 ? <Empty text="No users" icon={<RiUserLine />} C={C} /> : recentUsers.map(u => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <Avatar src={u.photoURL} name={u.fullName || u.displayName} size={30} C={C} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{u.fullName || u.displayName || "Unknown"}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{ago(u.createdAt)}</div>
              </div>
              <Badge status={u.status || "active"} C={C} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function UsersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK }) {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserDoc | null>(null);
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", bio: "", address: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const inp = mkInp(C);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "orders")), snap => {
      const counts: Record<string, number> = {};
      snap.forEach(d => {
        const o = d.data();
        const uid = o.userId || o.customerId || o.uid || null;
        if (uid) counts[uid] = (counts[uid] || 0) + 1;
      });
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
    const ms = (u.fullName || u.displayName || "").toLowerCase().includes(search.toLowerCase()) || (u.email || "").toLowerCase().includes(search.toLowerCase());
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
    if (!canDo(adminUser, "canDeleteUsers", uid)) {
      openPermRequest("canDeleteUsers", "Delete this user account permanently", uid);
      return;
    }
    const user = users.find(u => u.id === uid);
    await deleteDoc(doc(db, "users", uid));
    await logAudit(adminUser, "user_deleted", "user", uid, user?.fullName || uid);
    showToast("User deleted", "info");
    setSelected(null); setConfirm(null);
  };

  const resetPassword = (uid: string) => {
    const user = users.find(u => u.id === uid);
    if (!canDo(adminUser, "canResetPasswords", uid)) {
      openPermRequest("canResetPasswords", `Reset password for ${user?.email}`, uid);
      return;
    }
    showToast("Password reset email sent (via Cloud Function)", "info");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Users</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{users.length} registered customers</p>
        </div>
        {canDo(adminUser, "canExportData") && (
          <button onClick={() => showToast("Exporting CSV…", "info")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{f}</button>
        ))}
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading users…</div> : filtered.length === 0 ? <Empty text="No users found" icon={<RiUserLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto", boxShadow: `0 2px 16px ${C.shadow}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["User", "Phone", "Joined", "Orders", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} onClick={() => navigate(`/admin/user/${u.id}`)}>
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
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{orderCounts[u.id] ?? 0}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}><Badge status={u.status || "active"} C={C} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditing(u); setEditForm({ fullName: u.fullName || u.displayName || "", phone: (u.phone as string) || "", bio: (u.bio as string) || "", address: (u.address as string) || "" }); }} style={{ padding: "4px 10px", borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiEditLine size={11} /> Edit</button>
                      {u.status !== "banned" ? (
                        <button onClick={() => setConfirm({ uid: u.id, action: "banned", name: u.fullName || u.email || u.id })} style={{ padding: "4px 10px", borderRadius: 8, background: `${C.red}15`, border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiUserForbidLine size={11} /> Ban</button>
                      ) : (
                        <button onClick={() => updateStatus(u.id, "active")} style={{ padding: "4px 10px", borderRadius: 8, background: `${C.green}15`, border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiUserFollowLine size={11} /> Unban</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <Avatar src={selected.photoURL} name={selected.fullName || selected.displayName} size={56} C={C} />
                <div>
                  <div style={{ color: C.text, fontWeight: 900, fontSize: 20, fontFamily: "'Space Grotesk', sans-serif" }}>{selected.fullName || selected.displayName || "—"}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>{selected.email}</div>
                  <div style={{ marginTop: 6 }}><Badge status={selected.status || "active"} C={C} /></div>
                </div>
              </div>
              {[
                ["Phone", selected.phone],
                ["Address", selected.address],
                ["Joined", fmtDate(selected.createdAt)],
                ["Orders", orderCounts[selected.id] ?? 0],
                ["UID", selected.id],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "10px 0", gap: 16 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13, wordBreak: "break-all" }}>{String(v ?? "—")}</div>
                </div>
              ))}
              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { setEditing(selected); setEditForm({ fullName: selected.fullName || selected.displayName || "", phone: (selected.phone as string) || "", bio: (selected.bio as string) || "", address: (selected.address as string) || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiEditLine size={13} /> Edit Profile</button>
                <button onClick={() => resetPassword(selected.id)} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.blue}15`, border: `1px solid ${C.blue}28`, color: C.blue, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiLockPasswordLine size={13} /> Reset Password</button>
                <button onClick={() => { setSelected(null); setConfirm({ uid: selected.id, action: "delete", name: selected.fullName || selected.email || selected.id }); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.red}10`, border: `1px solid ${C.red}28`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiDeleteBinLine size={13} /> Delete</button>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 460, padding: 28, boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 22 }}>Edit User Profile</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={{ ...lbl, color: C.textSub }}>Full Name</label><input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Address</label><input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Bio</label><textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.action === "delete" ? `Delete user "${confirm.name}" permanently?` : `Ban user "${confirm.name}"?`}
          sub={confirm.action === "delete" ? "This cannot be undone." : "They will lose platform access."}
          onConfirm={() => confirm.action === "delete" ? deleteUser(confirm.uid) : updateStatus(confirm.uid, confirm.action)}
          onCancel={() => setConfirm(null)}
          C={C}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VENDORS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function VendorsPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK }) {
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<VendorDoc | null>(null);
  const [editing, setEditing] = useState<VendorDoc | null>(null);
  const [editForm, setEditForm] = useState({ businessName: "", phone: "", city: "", address: "", bio: "", category: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const inp = mkInp(C);
  const navigate = useNavigate();

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

  const unlinkBank = (uid: string, name: string) => {
    if (!canDo(adminUser, "canUnlinkBankAccount", uid)) { openPermRequest("canUnlinkBankAccount", `Unlink bank account for ${name}`, uid); return; }
    setConfirm({ uid, name, action: "unlinkBank" });
  };

  const deleteVendor = (uid: string, name: string) => {
    if (!canDo(adminUser, "canDeleteUsers", uid)) { openPermRequest("canDeleteUsers", `Delete vendor ${name}`, uid); return; }
    setConfirm({ uid, name, action: "deleteVendor" });
  };

  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.action === "unlinkBank") {
      await updateVendor(confirm.uid, { bankLinked: false, bankName: "", accountNumber: "" }, "vendor_bank_unlinked");
    } else if (confirm.action === "deleteVendor") {
      await deleteDoc(doc(db, "vendors", confirm.uid));
      await logAudit(adminUser, "vendor_deleted", "vendor", confirm.uid, confirm.name);
      showToast("Vendor deleted", "info");
    } else {
      await updateVendor(confirm.uid, { status: confirm.action === "ban" ? "banned" : "active" }, `vendor_${confirm.action}`);
    }
    setConfirm(null); setSelected(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Vendors</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>{vendors.length} stores on platform</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "pending", "verified", "banned", "blue"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
            {f === "blue" ? "Blue Badge" : f}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No vendors" icon={<RiStoreLine />} C={C} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {filtered.map(v => (
            <div key={v.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", boxShadow: `0 2px 12px ${C.shadow}`, transition: "transform 0.15s, box-shadow 0.15s" }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${C.shadow}`; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 12px ${C.shadow}`; }} onClick={() => navigate(`/admin/vendor/${v.id}`)}>
              <div style={{ height: 80, background: v.coverPhoto ? `url(${v.coverPhoto}) center/cover` : `linear-gradient(135deg, ${C.orange}18, ${C.blue}0d)`, borderBottom: `1px solid ${C.border}` }} />
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
                  <Badge status={v.verified ? "verified" : v.status || "pending"} C={C} />
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {!v.verified && (
                      <button onClick={() => updateVendor(v.id, { verified: true, status: "active" }, "vendor_verified")} style={{ padding: "4px 10px", borderRadius: 8, background: `${C.green}15`, border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiCheckLine size={11} /> Verify</button>
                    )}
                    <button onClick={() => setConfirm({ uid: v.id, name: v.businessName || v.id, action: v.status === "banned" ? "unban" : "ban" })} style={{ padding: "4px 10px", borderRadius: 8, background: v.status === "banned" ? `${C.green}15` : `${C.red}15`, border: "none", color: v.status === "banned" ? C.green : C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {v.status === "banned" ? "Unban" : "Ban"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            {selected.coverPhoto && <img src={selected.coverPhoto} alt="" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: "22px 22px 0 0" }} />}
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
                <Avatar src={selected.logo} name={selected.businessName} size={54} C={C} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif" }}>{selected.businessName}</div>
                    {selected.blueBadge && <RiVerifiedBadgeLine size={18} color={C.blue} />}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{selected.category} · {selected.city}</div>
                  <div style={{ marginTop: 6 }}><Badge status={selected.verified ? "verified" : selected.status || "pending"} C={C} /></div>
                </div>
              </div>
              {[["Owner", selected.fullName], ["Email", selected.email], ["Phone", selected.phone], ["Address", selected.address], ["Bank Linked", selected.bankLinked ? `Yes (${selected.bankName} · ${selected.accountNumber})` : "No"], ["Joined", fmtDate(selected.createdAt)]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v) || "—"}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                {!selected.verified && <button onClick={() => { updateVendor(selected.id, { verified: true, status: "active" }, "vendor_verified"); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.green}15`, border: "none", color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiCheckLine size={13} /> Approve</button>}
                <button onClick={() => { setEditing(selected); setEditForm({ businessName: selected.businessName || "", phone: selected.phone || "", city: selected.city || "", address: selected.address || "", bio: selected.bio || "", category: selected.category || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiEditLine size={13} /> Edit</button>
                {selected.bankLinked && <button onClick={() => { unlinkBank(selected.id, selected.businessName || ""); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.red}10`, border: `1px solid ${C.red}28`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiBankLine size={13} /> Unlink Bank</button>}
                <button onClick={() => { deleteVendor(selected.id, selected.businessName || ""); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.red}10`, border: `1px solid ${C.red}28`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiDeleteBinLine size={13} /> Delete</button>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 480, padding: 28, boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 22 }}>Edit Vendor</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={{ ...lbl, color: C.textSub }}>Business Name</label><input value={editForm.businessName} onChange={e => setEditForm(f => ({ ...f, businessName: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Category</label><input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>City</label><input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={{ ...lbl, color: C.textSub }}>Address</label><input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={{ ...lbl, color: C.textSub }}>Bio</label><textarea value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.action === "unlinkBank" ? `Unlink bank for "${confirm.name}"?` : confirm.action === "deleteVendor" ? `Delete vendor "${confirm.name}"?` : `${confirm.action === "ban" ? "Ban" : "Unban"} "${confirm.name}"?`} sub={confirm.action === "deleteVendor" ? "This cannot be undone." : undefined} onConfirm={execConfirm} onCancel={() => setConfirm(null)} danger={confirm.action !== "unban"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIDERS PAGE — fixed delivery count from orders collection
// ═══════════════════════════════════════════════════════════════════════════════
function RidersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK }) {
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RiderDoc | null>(null);
  const [editing, setEditing] = useState<RiderDoc | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", vehicleType: "" });
  const [confirm, setConfirm] = useState<{ uid: string; name: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  // Live delivery counts from orders collection
  const [riderDeliveryCounts, setRiderDeliveryCounts] = useState<Record<string, number>>({});
  const inp = mkInp(C);
  const navigate = useNavigate();

  useEffect(() => {
    // Count delivered orders per rider from the orders collection
    const unsub = onSnapshot(
      query(collection(db, "orders"), where("status", "==", "delivered")),
      snap => {
        const counts: Record<string, number> = {};
        snap.forEach(d => {
          const riderId = d.data().riderId;
          if (riderId) counts[riderId] = (counts[riderId] || 0) + 1;
        });
        setRiderDeliveryCounts(counts);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "riders"), orderBy("createdAt", "desc")), snap => {
      setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderDoc)));
      setLoading(false);
    });
  }, []);

  const filtered = riders.filter(r =>
    (r.fullName || "").toLowerCase().includes(search.toLowerCase()) ||
    (r.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const updateRider = async (uid: string, data: Partial<RiderDoc>) => {
    await updateDoc(doc(db, "riders", uid), data as Record<string, unknown>);
    await logAudit(adminUser, "rider_updated", "rider", uid, riders.find(r => r.id === uid)?.fullName || uid, JSON.stringify(data));
    showToast("Rider updated", "success");
    setConfirm(null);
    if (selected?.id === uid) setSelected(r => r ? { ...r, ...data } : r);
  };

  const resetRating = (uid: string, name: string) => {
    if (!canDo(adminUser, "canResetRiderRating", uid)) { openPermRequest("canResetRiderRating", `Reset rating for rider ${name}`, uid); return; }
    setConfirm({ uid, name, action: "resetRating" });
  };

  const forceOnline = (uid: string, name: string, online: boolean) => {
    if (!canDo(adminUser, "canForceRiderOnline", uid)) { openPermRequest("canForceRiderOnline", `Force ${name} ${online ? "online" : "offline"}`, uid); return; }
    updateRider(uid, { isOnline: online });
    showToast(`Rider forced ${online ? "online" : "offline"}`, "info");
  };

  const deleteRider = (uid: string, name: string) => {
    if (!canDo(adminUser, "canDeleteUsers", uid)) { openPermRequest("canDeleteUsers", `Delete rider ${name}`, uid); return; }
    setConfirm({ uid, name, action: "deleteRider" });
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
    if (confirm.action === "resetRating") { await updateRider(confirm.uid, { rating: 0, deliveryCount: 0 }); }
    else if (confirm.action === "deleteRider") { await deleteDoc(doc(db, "riders", confirm.uid)); await logAudit(adminUser, "rider_deleted", "rider", confirm.uid, confirm.name); showToast("Rider deleted", "info"); }
    else { await updateRider(confirm.uid, { status: confirm.action === "ban" ? "banned" : "active" }); }
    setConfirm(null); setSelected(null);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Riders</h1>
      <p style={{ color: C.muted, marginBottom: 22, fontSize: 13 }}>{riders.length} delivery riders</p>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search riders…" style={{ ...inp, paddingLeft: 38 }} />
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No riders" icon={<RiBikeLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto", boxShadow: `0 2px 16px ${C.shadow}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Rider", "Phone", "Vehicle", "Deliveries", "Rating", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")} onClick={() => navigate(`/admin/rider/${r.id}`)}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar src={r.photoURL} name={r.fullName} size={32} C={C} />
                    <div><div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{r.fullName || "—"}</div><div style={{ color: C.muted, fontSize: 11 }}>{r.email}</div></div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{(r.phone as string) || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{r.vehicleType || "—"}</td>
                {/* Live delivery count from orders */}
                <td style={{ padding: "12px 16px", color: C.text, fontWeight: 700, fontSize: 12 }}>
                  {riderDeliveryCounts[r.id] ?? r.deliveryCount ?? 0}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.yellow }}><RiStarLine size={12} /><span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{r.rating ? r.rating.toFixed(1) : "—"}</span></div>
                </td>
                <td style={{ padding: "12px 16px" }}><Badge status={r.isOnline ? "online" : r.status || "inactive"} C={C} /></td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    {!r.approved && (
                      <button onClick={() => updateRider(r.id, { approved: true, status: "active" })} style={{ padding: "4px 10px", borderRadius: 8, background: `${C.green}15`, border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Approve</button>
                    )}
                    <button onClick={() => setConfirm({ uid: r.id, name: r.fullName || r.id, action: r.status === "banned" ? "unban" : "ban" })} style={{ padding: "4px 10px", borderRadius: 8, background: r.status === "banned" ? `${C.green}15` : `${C.red}15`, border: "none", color: r.status === "banned" ? C.green : C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {r.status === "banned" ? "Unban" : "Ban"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => { setSelected(null); setRejectReason(""); }}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 22 }}>
                <Avatar src={selected.photoURL} name={selected.fullName} size={54} C={C} />
                <div>
                  <div style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif" }}>{selected.fullName}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{selected.email}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <Badge status={selected.isOnline ? "online" : selected.status || "inactive"} C={C} />
                    {selected.approved && <Badge status="approved" C={C} />}
                  </div>
                </div>
              </div>

              {[
                ["Phone", selected.phone],
                ["Vehicle", selected.vehicleType],
                // Live delivery count in modal too
                ["Deliveries", riderDeliveryCounts[selected.id] ?? selected.deliveryCount ?? 0],
                ["Rating", selected.rating ? `${selected.rating.toFixed(1)} ★` : "—"],
                ["Joined", fmtDate(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v || "—")}</div>
                </div>
              ))}

              {((selected as RiderDoc & { selfieUrl?: string }).selfieUrl || (selected as RiderDoc & { idFrontUrl?: string }).idFrontUrl) && (
                <div style={{ marginTop: 16, marginBottom: 4 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Submitted Documents</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(selected as RiderDoc & { selfieUrl?: string }).selfieUrl && (
                      <div style={{ textAlign: "center" }}>
                        <img src={(selected as RiderDoc & { selfieUrl?: string }).selfieUrl} alt="Selfie" style={{ width: 70, height: 70, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.border}` }} />
                        <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Selfie</div>
                      </div>
                    )}
                    {(selected as RiderDoc & { idFrontUrl?: string }).idFrontUrl && (
                      <div style={{ textAlign: "center" }}>
                        <img src={(selected as RiderDoc & { idFrontUrl?: string }).idFrontUrl} alt="ID Front" style={{ width: 100, height: 70, borderRadius: 8, objectFit: "cover", border: `2px solid ${C.border}` }} />
                        <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>ID Front</div>
                      </div>
                    )}
                    {(selected as RiderDoc & { idBackUrl?: string }).idBackUrl && (
                      <div style={{ textAlign: "center" }}>
                        <img src={(selected as RiderDoc & { idBackUrl?: string }).idBackUrl} alt="ID Back" style={{ width: 100, height: 70, borderRadius: 8, objectFit: "cover", border: `2px solid ${C.border}` }} />
                        <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>ID Back</div>
                      </div>
                    )}
                  </div>
                  {(selected as RiderDoc & { idType?: string; idNumber?: string }).idType && (
                    <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
                      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14, flex: 1 }}>
                        <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>ID Type</div>
                        <div style={{ color: C.text, fontSize: 13 }}>{(selected as RiderDoc & { idType?: string }).idType}</div>
                      </div>
                      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14, flex: 1 }}>
                        <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 90, flexShrink: 0, textTransform: "uppercase" }}>ID Number</div>
                        <div style={{ color: C.text, fontSize: 13 }}>{(selected as RiderDoc & { idNumber?: string }).idNumber}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                {!selected.approved && (
                  <button
                    onClick={async () => {
                      await updateDoc(doc(db, "riders", selected.id), { status: "active", approved: true });
                      await logAudit(adminUser, "rider_approved", "rider", selected.id, selected.fullName || "");
                      showToast("Rider approved!", "success");
                      setSelected(null);
                    }}
                    style={{ padding: "9px 16px", borderRadius: 11, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: C.green, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <RiCheckLine size={13} /> Approve Rider
                  </button>
                )}
                <button onClick={() => { setEditing(selected); setEditForm({ fullName: selected.fullName || "", phone: (selected.phone as string) || "", vehicleType: selected.vehicleType || "" }); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiEditLine size={13} /> Edit</button>
                <button onClick={() => { forceOnline(selected.id, selected.fullName || "", !selected.isOnline); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.cyan}12`, border: `1px solid ${C.cyan}28`, color: C.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiToggleLine size={13} /> Force {selected.isOnline ? "Offline" : "Online"}</button>
                <button onClick={() => { resetRating(selected.id, selected.fullName || ""); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.yellow}12`, border: `1px solid ${C.yellow}28`, color: C.yellow, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiStarLine size={13} /> Reset Rating</button>
                <button onClick={() => { deleteRider(selected.id, selected.fullName || ""); setSelected(null); }} style={{ padding: "9px 16px", borderRadius: 11, background: `${C.red}10`, border: `1px solid ${C.red}28`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiDeleteBinLine size={13} /> Delete</button>
              </div>

              {selected.status !== "rejected" && (
                <div style={{ marginTop: 16, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 14, padding: 16 }}>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Reject Application</div>
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (visible to rider)..." style={inp} />
                  <button
                    onClick={async () => {
                      if (!rejectReason.trim()) { showToast("Enter a rejection reason", "error"); return; }
                      await updateDoc(doc(db, "riders", selected.id), { status: "rejected", rejectionReason: rejectReason });
                      await logAudit(adminUser, "rider_rejected", "rider", selected.id, selected.fullName || "", rejectReason);
                      showToast("Rider rejected", "info");
                      setSelected(null); setRejectReason("");
                    }}
                    style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 11, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: C.red, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Reject & Notify Rider
                  </button>
                </div>
              )}

              {selected.status === "rejected" && (selected as RiderDoc & { rejectionReason?: string }).rejectionReason && (
                <div style={{ marginTop: 16, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 14, padding: 16 }}>
                  <div style={{ color: C.red, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Rejection Reason Sent to Rider</div>
                  <p style={{ color: C.text, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{(selected as RiderDoc & { rejectionReason?: string }).rejectionReason}</p>
                </div>
              )}

              <button onClick={() => { setSelected(null); setRejectReason(""); }} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setEditing(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 420, padding: 28, boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: C.text, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 20 }}>Edit Rider</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={{ ...lbl, color: C.textSub }}>Full Name</label><input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Phone</label><input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={{ ...lbl, color: C.textSub }}>Vehicle Type</label><input value={editForm.vehicleType} onChange={e => setEditForm(f => ({ ...f, vehicleType: e.target.value }))} style={inp} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: "11px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.action === "resetRating" ? `Reset rating for "${confirm.name}"?` : confirm.action === "deleteRider" ? `Delete rider "${confirm.name}"?` : `${confirm.action === "ban" ? "Ban" : "Unban"} "${confirm.name}"?`} onConfirm={execConfirm} onCancel={() => setConfirm(null)} danger={confirm.action !== "unban"} C={C} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersPage({ adminUser, showToast, openPermRequest, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; openPermRequest: (a: string, d: string, tid?: string) => void; C: typeof DARK }) {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequestDoc[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<OrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<RiderDoc[]>([]);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inp = mkInp(C);

  useEffect(() => {
    const u1 = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc")),
      async snap => {
        const rawOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as OrderDoc));
        const vendorIds = [...new Set(rawOrders.filter(o => !o.vendorName && o.vendorId).map(o => o.vendorId as string))];
        const vendorNameMap: Record<string, string> = {};
        if (vendorIds.length > 0) {
          await Promise.all(vendorIds.map(async vid => {
            try {
              const vs = await getDoc(doc(db, "vendors", vid));
              if (vs.exists()) {
                const vd = vs.data();
                vendorNameMap[vid] = vd.businessName || vd.storeName || vid.slice(-6);
              }
            } catch {}
          }));
        }
        setOrders(rawOrders.map(o => ({
          ...o,
          vendorName: o.vendorName || (o.vendorId ? vendorNameMap[o.vendorId as string] : undefined) || "—",
        })));
        setLoading(false);
      }
    );

    const u2 = onSnapshot(query(collection(db, "refundRequests"), where("requestedBy", "==", adminUser?.uid)), snap => {
      setRefundRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as RefundRequestDoc)));
    });

    getDocs(collection(db, "riders")).then(snap => setRiders(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderDoc))));
    return () => { u1(); u2(); };
  }, [adminUser]);

  const filtered = orders.filter(o => {
    const ms = o.id.includes(search)
      || (o.orderNumber || "").toLowerCase().includes(search.toLowerCase())
      || (o.customerName || "").toLowerCase().includes(search.toLowerCase())
      || (o.vendorName || "").toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || o.status === filter || (filter === "disputed" && o.disputed);
    return ms && mf;
  });

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
    if (selected?.id === id) setSelected(o => o ? { ...o, status } : o);
    await logAudit(adminUser, "order_status_change", "order", id, id, `→ ${status}`);
    showToast(`Status → ${status}`, "success");
  };

  const requestRefund = async (orderId: string) => {
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    if (!refundReason.trim()) { showToast("Enter a reason for refund", "error"); return; }
    try {
      await addDoc(collection(db, "permissionRequests"), {
        requesterId: adminUser?.uid,
        requesterName: adminUser?.displayName || adminUser?.email,
        requesterEmail: adminUser?.email,
        action: "canIssueRefunds",
        targetId: orderId,
        targetType: "order",
        description: `Issue refund of ₦${amount} on order ${getOrderDisplay({ id: orderId } as OrderDoc)}`,
        reason: refundReason,
        suggestedDuration: "one-time",
        status: "pending",
        refundAmount: amount,
        isRefundRequest: true,
        createdAt: serverTimestamp(),
      });
      await logAudit(adminUser, "refund_requested", "order", orderId, orderId, `₦${amount} — awaiting SA approval`);
      showToast("Refund request sent to Super Admin for approval", "success");
      setRefundAmount(""); setRefundReason("");
    } catch { showToast("Failed to request refund", "error"); }
  };

  const saveAddress = async (orderId: string) => {
    if (!canDo(adminUser, "canEditDeliveryAddress", orderId)) {
      openPermRequest("canEditDeliveryAddress", `Edit delivery address on order ${getOrderDisplay(selected!)}`, orderId);
      return;
    }
    await updateDoc(doc(db, "orders", orderId), { deliveryAddress: editAddress });
    if (selected?.id === orderId) setSelected(o => o ? { ...o, deliveryAddress: editAddress } : o);
    await logAudit(adminUser, "order_address_changed", "order", orderId, orderId, editAddress);
    showToast("Delivery address updated", "success");
    setEditingAddress(false);
  };

  const markDisputed = async (orderId: string) => {
    if (!canDo(adminUser, "canMarkDisputed", orderId)) {
      openPermRequest("canMarkDisputed", `Mark order ${getOrderDisplay(selected!)} as disputed`, orderId);
      return;
    }
    await updateDoc(doc(db, "orders", orderId), { disputed: true, status: "disputed" });
    if (selected?.id === orderId) setSelected(o => o ? { ...o, disputed: true, status: "disputed" } : o);
    await logAudit(adminUser, "order_marked_disputed", "order", orderId, orderId);
    showToast("Order marked as disputed", "info");
  };

  const reassignRider = async (orderId: string, riderId: string, riderName: string) => {
    if (!canDo(adminUser, "canReassignRider", orderId)) {
      openPermRequest("canReassignRider", `Re-assign rider on order ${getOrderDisplay(selected!)}`, orderId);
      return;
    }
    await updateDoc(doc(db, "orders", orderId), { riderId, riderName });
    if (selected?.id === orderId) setSelected(o => o ? { ...o, riderId, riderName } : o);
    await logAudit(adminUser, "order_rider_reassigned", "order", orderId, orderId, `Rider → ${riderName}`);
    showToast("Rider reassigned", "success");
  };

  return (
    <div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Orders</h1>
      <p style={{ color: C.muted, marginBottom: 22, fontSize: 13 }}>{orders.length} total orders · {refundRequests.length} pending refund requests</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" style={{ ...inp, paddingLeft: 38 }} />
        </div>
        {["all", "pending", "processing", "in-transit", "delivered", "cancelled", "disputed"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{f}</button>
        ))}
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : filtered.length === 0 ? <Empty text="No orders" icon={<RiShoppingBagLine />} C={C} /> : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "auto", boxShadow: `0 2px 16px ${C.shadow}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Order", "Customer", "Vendor", "Total", "Date", "Status", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(o => (
              <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: o.disputed ? `${C.red}06` : "transparent", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = C.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = o.disputed ? `${C.red}06` : "transparent")} onClick={() => { setSelected(o); setEditAddress(o.deliveryAddress || ""); setEditingAddress(false); }}>
                <td style={{ padding: "12px 16px", color: C.orange, fontWeight: 800, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}>{getOrderDisplay(o)}</td>
                <td style={{ padding: "12px 16px", color: C.text, fontSize: 13 }}>{o.customerName || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 12 }}>{o.vendorName || "—"}</td>
                <td style={{ padding: "12px 16px", color: C.orange, fontWeight: 800, fontSize: 12 }}>{fmt(o.total || 0)}</td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: 11 }}>{ago(o.createdAt)}</td>
                <td style={{ padding: "12px 16px" }}>{o.disputed ? <Badge status="disputed" C={C} /> : <Badge status={o.status || "pending"} C={C} />}</td>
                <td style={{ padding: "12px 16px" }}><button onClick={e => { e.stopPropagation(); setSelected(o); setEditAddress(o.deliveryAddress || ""); setEditingAddress(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", color: C.muted, cursor: "pointer", fontSize: 11 }}><RiEyeLine size={12} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {imagePreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setImagePreview(null)}>
          <div style={{ position: "relative", maxWidth: 700, width: "100%", maxHeight: "90vh" }}>
            <img src={imagePreview} alt="Item" style={{ width: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: 14 }} />
            <button onClick={() => setImagePreview(null)} style={{ position: "absolute", top: -14, right: -14, width: 32, height: 32, borderRadius: "50%", background: C.red, border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RiCloseLine size={16} />
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ color: C.orange, fontWeight: 900, fontSize: 18, fontFamily: "'Space Grotesk', sans-serif" }}>{getOrderDisplay(selected)}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{fmtDate(selected.createdAt)}</div>
                </div>
                {selected.disputed ? <Badge status="disputed" C={C} /> : <Badge status={selected.status || "pending"} C={C} />}
              </div>

              {[["Customer", selected.customerName], ["Email", selected.customerEmail], ["Phone", selected.customerPhone], ["Vendor", selected.vendorName], ["Rider", selected.riderName || "Not assigned"], ["Total", fmt(selected.total || 0)], ["Payment", selected.paymentMethod || "—"]].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "9px 0", gap: 14 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 110, flexShrink: 0, textTransform: "uppercase" }}>{String(k)}</div>
                  <div style={{ color: C.text, fontSize: 13 }}>{String(v) || "—"}</div>
                </div>
              ))}

              <div style={{ borderBottom: `1px solid ${C.border}`, padding: "9px 0", display: "flex", gap: 14 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, width: 110, flexShrink: 0, textTransform: "uppercase" }}>Delivery Addr</div>
                <div style={{ flex: 1 }}>
                  {editingAddress ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={editAddress} onChange={e => setEditAddress(e.target.value)} style={{ ...inp, flex: 1 }} />
                      <button onClick={() => saveAddress(selected.id)} style={{ padding: "8px 12px", borderRadius: 9, background: C.green, border: "none", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><RiCheckLine size={13} /></button>
                      <button onClick={() => setEditingAddress(false)} style={{ padding: "8px 12px", borderRadius: 9, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}><RiCloseLine size={13} /></button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: C.text, fontSize: 13 }}>{selected.deliveryAddress || "—"}</span>
                      <button onClick={() => setEditingAddress(true)} style={{ padding: "4px 8px", borderRadius: 7, background: "none", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><RiEditLine size={11} /> Edit</button>
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
                          <div
                            style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: imgSrc ? "pointer" : "default", border: `1px solid ${C.border}` }}
                            onClick={() => imgSrc && setImagePreview(imgSrc)}
                          >
                            {imgSrc ? (
                              <img src={imgSrc} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <RiImageLine size={20} color={C.muted} />
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{item.name}</div>
                            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Qty: {item.qty} · {fmt(item.price)} each</div>
                          </div>
                          <div style={{ color: C.orange, fontWeight: 800, fontSize: 13 }}>{fmt(item.price * item.qty)}</div>
                          {imgSrc && (
                            <button onClick={() => setImagePreview(imgSrc)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 8px", color: C.muted, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                              <RiImageLine size={10} /> View
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 12px", marginTop: 4 }}>
                    <span style={{ color: C.muted, fontSize: 12, marginRight: 12 }}>Order Total</span>
                    <span style={{ color: C.orange, fontWeight: 900, fontSize: 16, fontFamily: "'Space Grotesk', sans-serif" }}>{fmt(selected.total || 0)}</span>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>Update Status</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["processing", "in-transit", "delivered", "cancelled"].map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${selected.status === s ? C.orange : C.border}`, background: selected.status === s ? C.orangeGlow : "transparent", color: selected.status === s ? C.orange : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{s}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
                  Re-assign Rider {!canDo(adminUser, "canReassignRider") && <span style={{ color: C.yellow, marginLeft: 6, fontSize: 9 }}>🔒 Needs Permission</span>}
                </div>
                <select onChange={e => { const r = riders.find(r => r.id === e.target.value); if (r) reassignRider(selected.id, r.id, r.fullName || ""); }} defaultValue="" style={{ ...inp, cursor: "pointer" }}>
                  <option value="">Select rider…</option>
                  {riders.filter(r => r.approved && r.status !== "banned").map(r => <option key={r.id} value={r.id}>{r.fullName} ({r.vehicleType})</option>)}
                </select>
              </div>

              <div style={{ marginTop: 16, background: `${C.yellow}0a`, border: `1px solid ${C.yellow}20`, borderRadius: 14, padding: 16 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <RiRefundLine size={12} /> Request Refund {!canDo(adminUser, "canIssueRefunds") && <span style={{ color: C.yellow, fontSize: 9 }}>🔒 Needs Super Admin Approval</span>}
                </div>
                {!canDo(adminUser, "canIssueRefunds") ? (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder="Amount (₦)" type="number" style={{ ...inp, flex: 1 }} />
                      <input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="Reason for refund..." style={{ ...inp, flex: 2 }} />
                    </div>
                    <button onClick={() => requestRefund(selected.id)} style={{ width: "100%", padding: "10px", borderRadius: 11, background: C.yellow, border: "none", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                      Submit Refund Request for Approval
                    </button>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>
                      Super Admin will review and approve this request
                    </div>
                  </>
                ) : (
                  <div style={{ color: C.green, fontSize: 12, textAlign: "center" }}>
                    You have permission to issue refunds directly
                  </div>
                )}
              </div>

              {!selected.disputed && (
                <div style={{ marginTop: 14 }}>
                  <button onClick={() => markDisputed(selected.id)} style={{ width: "100%", padding: "9px", borderRadius: 11, background: `${C.red}10`, border: `1px solid ${C.red}28`, color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><RiAlertFill size={13} /> Mark Disputed</button>
                </div>
              )}

              <button onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLUE BADGE PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function BlueBadgePage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK }) {
  const [apps, setApps] = useState<BlueBadgeDoc[]>([]);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<BlueBadgeDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectionNote, setRejectionNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; label: string } | null>(null);
  const inp = mkInp(C);

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
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <RiVerifiedBadgeLine size={24} color={C.blue} /> Blue Badge Applications
      </h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Review vendor verification documents</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {["pending", "approved", "rejected", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
            {f === "pending" ? `Pending (${apps.filter(a => a.status === "pending").length})` : f}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : apps.length === 0 ? <Empty text="No applications" icon={<RiVerifiedBadgeLine />} C={C} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {apps.map(app => (
            <div key={app.id} style={{ background: C.surface, border: `1px solid ${app.status === "pending" ? C.yellow + "44" : C.border}`, borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16, cursor: "pointer", boxShadow: `0 2px 12px ${C.shadow}`, transition: "transform 0.15s" }} onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = "translateX(4px)"} onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)"} onClick={() => setSelected(app)}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${C.blue}18`, display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0, border: `1px solid ${C.blue}28` }}>
                <RiVerifiedBadgeLine size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>{app.vendorName || "Unknown Vendor"}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{app.vendorEmail} · Submitted {fmtDate(app.submittedAt)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge status={app.status || "pending"} C={C} />
                <span style={{ color: C.muted, fontSize: 11 }}>{Object.keys(app.documents || {}).length} docs</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setPreviewDoc(null)}>
          <div style={{ maxWidth: 800, width: "100%", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ color: "#fff", fontWeight: 700 }}>{previewDoc.label}</div>
              <button onClick={() => setPreviewDoc(null)} style={{ background: "none", border: "1px solid #333", borderRadius: 8, padding: "6px 12px", color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><RiCloseLine size={14} /> Close</button>
            </div>
            <img src={previewDoc.url} alt={previewDoc.label} style={{ width: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12 }} />
          </div>
        </div>
      )}

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)" }} onClick={() => setSelected(null)}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", boxShadow: `0 20px 60px ${C.shadow}` }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 900, color: C.text }}>Blue Badge Review</h2>
                <Badge status={selected.status || "pending"} C={C} />
              </div>
              <div style={{ background: `${C.blue}0d`, border: `1px solid ${C.blue}20`, borderRadius: 14, padding: 16, marginBottom: 22 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 16 }}>{selected.vendorName}</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{selected.vendorEmail}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Submitted: {fmtDate(selected.submittedAt)}</div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 14 }}>Submitted Documents</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {Object.entries(selected.documents || {}).map(([key, url]) => (
                    <div key={key} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", cursor: "pointer" }} onClick={() => setPreviewDoc({ url: url as string, label: DOC_LABELS[key] || key })}>
                      <div style={{ height: 100, overflow: "hidden" }}><img src={url as string} alt={key} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                      <div style={{ padding: "8px 12px" }}>
                        <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>{DOC_LABELS[key] || key}</div>
                        <div style={{ color: C.green, fontSize: 10, fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><RiCheckLine size={10} /> Uploaded</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {selected.status === "pending" && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ ...lbl, color: C.textSub }}>Rejection reason (required to reject)</label>
                    <textarea value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} placeholder="Explain why the application was rejected…" rows={3} style={{ ...inp, resize: "vertical" } as React.CSSProperties} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button disabled={processing} onClick={() => approve(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: `linear-gradient(135deg, #1877F2, #0a5cd8)`, border: "none", color: "white", fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, opacity: processing ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(24,119,242,0.4)" }}>
                      <RiVerifiedBadgeLine size={16} /> {processing ? "Processing…" : "Approve Blue Badge"}
                    </button>
                    <button disabled={processing || !rejectionNote.trim()} onClick={() => reject(selected)} style={{ flex: 1, padding: "12px", borderRadius: 14, background: `${C.red}15`, border: `1px solid ${C.red}28`, color: C.red, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 14, opacity: (processing || !rejectionNote.trim()) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <RiCloseLine size={16} /> Reject
                    </button>
                  </div>
                </>
              )}
              {selected.status !== "pending" && (
                <div style={{ padding: "12px 16px", borderRadius: 12, background: selected.status === "approved" ? `${C.green}12` : `${C.red}12`, border: `1px solid ${selected.status === "approved" ? C.green : C.red}28` }}>
                  <div style={{ color: selected.status === "approved" ? C.green : C.red, fontWeight: 700, fontSize: 14 }}>
                    {selected.status === "approved" ? "✓ Blue badge was granted" : `✗ Rejected${selected.rejectionNote ? `: ${selected.rejectionNote}` : ""}`}
                  </div>
                </div>
              )}
              <button onClick={() => setSelected(null)} style={{ marginTop: 16, width: "100%", padding: 11, borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION REQUESTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function PermissionRequestsPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK }) {
  const [requests, setRequests] = useState<PermissionRequestDoc[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = adminUser?.role === "superadmin";

  useEffect(() => {
    const q = isSuperAdmin
      ? query(collection(db, "permissionRequests"), orderBy("createdAt", "desc"))
      : query(collection(db, "permissionRequests"), where("requesterId", "==", adminUser?.uid), orderBy("createdAt", "desc"));

    return onSnapshot(q,
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PermissionRequestDoc)));
        setLoading(false);
      },
      error => {
        console.error("permissionRequests query error:", error);
        getDocs(collection(db, "permissionRequests")).then(snap => {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as PermissionRequestDoc));
          const mine = isSuperAdmin ? all : all.filter(r => r.requesterId === adminUser?.uid);
          setRequests(mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          setLoading(false);
        });
      }
    );
  }, [adminUser, isSuperAdmin]);

  const displayed = filter === "all" ? requests : requests.filter(r => r.status === filter);

  return (
    <div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <RiLockPasswordLine size={22} color={C.yellow} /> My Permission Requests
      </h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Track your requests for temporary elevated access</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["pending", "approved", "denied", "all"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${filter === f ? C.orange : C.border}`, background: filter === f ? C.orangeGlow : "transparent", color: filter === f ? C.orange : C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
            {f === "pending" ? `Pending (${requests.filter(r => r.status === "pending").length})` : f}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div> : displayed.length === 0 ? <Empty text="No requests" icon={<RiLockPasswordLine />} C={C} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayed.map(r => (
            <div key={r.id} style={{ background: C.surface, border: `1px solid ${r.status === "pending" ? C.yellow + "44" : C.border}`, borderRadius: 16, padding: 18, boxShadow: `0 2px 12px ${C.shadow}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ color: C.text, fontWeight: 800, fontSize: 14 }}>{r.action}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{r.description}</div>
                </div>
                <Badge status={r.status || "pending"} C={C} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: C.muted }}>
                <span>Reason: {r.reason}</span>
                <span>{ago(r.createdAt)}</span>
              </div>
              {r.status === "approved" && r.expiresAt && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.green }}>✓ Approved · Expires {ago(r.expiresAt)}</div>
              )}
              {r.status === "denied" && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>✗ Denied</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOUNTS PAGE (View Only)
// ═══════════════════════════════════════════════════════════════════════════════
function DiscountsPage({ adminUser, showToast, C }: { adminUser: AdminUser | null; showToast: (m: string, t: "success" | "error" | "info") => void; C: typeof DARK }) {
  const [discounts, setDiscounts] = useState<DiscountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const inp = mkInp(C);

  useEffect(() => {
    return onSnapshot(query(collection(db, "discounts"), orderBy("createdAt", "desc")), snap => {
      setDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountDoc)));
      setLoading(false);
    });
  }, []);

  const filtered = discounts.filter(d => {
    const matchesSearch = d.code.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || d.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Active Discounts</h1>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>View available promotions (creation restricted to Super Admin)</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}><RiSearchLine size={14} /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search discounts..." style={{ ...inp, paddingLeft: 38 }} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, width: "auto" }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading discounts...</div>
      ) : filtered.length === 0 ? (
        <Empty text="No discounts available" icon={<RiPriceTag3Line />} C={C} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {filtered.map(d => {
            const now = new Date();
            const end = d.endDate?.toDate();
            const isActive = d.status === "active" && end >= now;
            return (
              <div key={d.id} style={{ background: C.surface, border: `1px solid ${isActive ? C.green + "44" : C.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: C.text }}>{d.code}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: C.orange, marginTop: 4 }}>
                      {d.type === "percentage" ? `${d.value}% OFF` : `₦${d.value.toLocaleString()} OFF`}
                    </div>
                  </div>
                  <Badge status={d.status} C={C} />
                </div>
                {d.description && <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{d.description}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 800 }}>Valid Until</div>
                    <div style={{ fontSize: 12, color: C.text }}>{end?.toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 800 }}>Usage</div>
                    <div style={{ fontSize: 12, color: C.text }}>{d.usedCount}{d.usageLimit ? `/${d.usageLimit}` : ""}</div>
                  </div>
                </div>
                {(d.minOrderAmount ?? 0) > 0 && (
                  <div style={{ fontSize: 11, color: C.muted }}>Min. order: ₦{d.minOrderAmount!.toLocaleString()}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsPage({ adminUser, onProfileUpdate, C }: { adminUser: AdminUser | null; onProfileUpdate: (u: Partial<AdminUser>) => void; C: typeof DARK }) {
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ displayName: (adminUser?.displayName as string) || "", phone: "", bio: "" });
  const [passwords, setPasswords] = useState({ current: "", newPw: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const inp = mkInp(C);

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
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24 }}>Settings</h1>
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: `0 2px 12px ${C.shadow}` }}>
            {[["profile", "Profile", <RiUserLine size={14} />], ["security", "Security", <RiShieldLine size={14} />]].map(([k, l, ic]) => (
              <button key={String(k)} onClick={() => { setTab(String(k)); setError(""); setSaved(false); }} style={{ width: "100%", padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, background: tab === k ? C.orangeGlow : "transparent", border: "none", borderLeft: `3px solid ${tab === k ? C.orange : "transparent"}`, color: tab === k ? C.orange : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textAlign: "left", transition: "all 0.2s" }}>
                {ic} {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 26, boxShadow: `0 2px 16px ${C.shadow}` }}>
          {error && <div style={{ padding: "11px 14px", background: `${C.red}12`, border: `1px solid ${C.red}28`, borderRadius: 10, color: C.red, fontSize: 12, fontWeight: 600, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}><RiAlertLine size={14} />{error}</div>}
          {saved && <div style={{ padding: "11px 14px", background: `${C.green}12`, border: `1px solid ${C.green}28`, borderRadius: 10, color: C.green, fontSize: 12, fontWeight: 600, marginBottom: 18, display: "flex", gap: 8, alignItems: "center" }}><RiCheckLine size={14} /> Saved successfully!</div>}

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
                  <div style={{ marginTop: 6 }}><Badge status={adminUser?.role || "admin"} C={C} /></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={{ ...lbl, color: C.textSub }}>Name</label><input value={profile.displayName} onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))} style={inp} /></div>
                <div><label style={{ ...lbl, color: C.textSub }}>Phone</label><input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ marginBottom: 22 }}><label style={{ ...lbl, color: C.textSub }}>Bio</label><textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" } as React.CSSProperties} /></div>
              <button onClick={saveProfile} disabled={saving} style={{ padding: "11px 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6, boxShadow: `0 4px 14px ${C.orange}44` }}>
                <RiCheckLine size={14} /> {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}

          {tab === "security" && (
            <div>
              <h2 style={{ color: C.text, fontWeight: 800, fontSize: 17, marginBottom: 22 }}>Change Password</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}>
                <div><label style={{ ...lbl, color: C.textSub }}>Current Password</label><input type="password" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} style={inp} /></div>
                <div style={{ position: "relative" }}>
                  <label style={{ ...lbl, color: C.textSub }}>New Password</label>
                  <input type={showPw ? "text" : "password"} value={passwords.newPw} onChange={e => setPasswords(p => ({ ...p, newPw: e.target.value }))} style={{ ...inp, paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, bottom: 10, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
                    {showPw ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
                <div><label style={{ ...lbl, color: C.textSub }}>Confirm Password</label><input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} style={inp} /></div>
                <button onClick={changePassword} disabled={saving || !passwords.current || !passwords.newPw} style={{ padding: "11px 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, border: "none", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: saving || !passwords.current ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <RiShieldLine size={14} /> {saving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD — Regular Admin
// ═══════════════════════════════════════════════════════════════════════════════
export default function SwiftAdminDashboard() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activePage, setActivePage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [permModal, setPermModal] = useState<{ action: string; description: string; targetId?: string } | null>(null);
  const [pendingBadgeCount, setPendingBadgeCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [activeAdsCount, setActiveAdsCount] = useState(0);
  const [waitingCallsCount, setWaitingCallsCount] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("swiftadmin_theme") as Theme) || "dark");
const { banner: maintenanceBanner, dismissed: bannerDismissed, dismiss: dismissBanner } = useMaintenanceBanner("admin");
  const C = theme === "dark" ? DARK : LIGHT;

  const showToast = useCallback((msg: string, type: "success" | "error" | "info") => setToast({ msg, type }), []);
  const openPermRequest = useCallback((action: string, description: string, targetId?: string) => setPermModal({ action, description, targetId }), []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("swiftadmin_theme", next);
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async user => {
      if (!user) { navigate("/admin/login"); return; }
      const snap = await getDoc(doc(db, "admins", user.uid));
      if (!snap.exists()) { await signOut(auth); navigate("/admin/login"); return; }
      const data = snap.data();
      setAdminUser({ uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL, ...data });
      setAuthChecked(true);
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!authChecked) return;
    const nowIso = new Date().toISOString();
    const u1 = onSnapshot(query(collection(db, "blueBadgeApplications"), where("status", "==", "pending")), s => setPendingBadgeCount(s.size));
    const u2 = onSnapshot(query(collection(db, "permissionRequests"), where("status", "==", "pending")), s => setPendingRequestCount(s.size));
    const u3 = onSnapshot(query(collection(db, "adPromotions")), snap => {
      const active = snap.docs.filter(d => {
        const data = d.data();
        return data.endDate > nowIso && data.status !== "cancelled";
      });
      setActiveAdsCount(active.length);
    });
    return () => { u1(); u2(); u3(); };
  }, [authChecked]);

  useEffect(() => {
  if (!authChecked) return;
  return onSnapshot(
    query(collection(db, "supportCalls"), where("status", "==", "waiting")),
    snap => setWaitingCallsCount(snap.size)
  );
}, [authChecked]);

  const handleLogout = async () => { await signOut(auth); navigate("/admin/login"); };

  const NAV = [
    { key: "overview",    icon: <RiDashboardLine size={18} />,     label: "Overview"       },
    { key: "users",       icon: <RiUserLine size={18} />,          label: "Users"          },
    { key: "vendors",     icon: <RiStoreLine size={18} />,         label: "Vendors"        },
    { key: "riders",      icon: <RiBikeLine size={18} />,          label: "Riders"         },
    { key: "orders",      icon: <RiShoppingBagLine size={18} />,   label: "Orders"         },
     { key: "livecalls",   icon: <RiPhoneLine size={18} />,         label: "Live Calls", badge: waitingCallsCount },
    { key: "ads",         icon: <RiMegaphoneLine size={18} />,     label: "Ads", badge: activeAdsCount },
    { key: "sendpickup",  icon: <RiBox3Line size={18} />,          label: "Send & Pickup"  },
    { key: "support",     icon: <RiMessage2Line size={18} />,      label: "Support"        },
    { key: "bluebadge",   icon: <RiVerifiedBadgeLine size={18} />, label: "Blue Badge", badge: pendingBadgeCount },
    { key: "discounts",   icon: <RiPriceTag3Line size={18} />,     label: "Discounts"      },
    { key: "permissions", icon: <RiLockPasswordLine size={18} />,  label: "My Requests", badge: pendingRequestCount },
    { key: "settings",    icon: <RiSettings3Line size={18} />,     label: "Settings"       },
  ];

  const renderPage = () => {
    const props = { adminUser, showToast, openPermRequest, C };
    switch (activePage) {
      case "overview":    return <OverviewPage adminUser={adminUser} C={C} />;
      case "users":       return <UsersPage {...props} />;
      case "vendors":     return <VendorsPage {...props} />;
      case "riders":      return <RidersPage {...props} />;
      case "orders":      return <OrdersPage {...props} />;
      case "livecalls":   return <AdminLiveCalls C={C} />;
      case "ads":         return <AdsPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "sendpickup":  return <SendPickupAdminPage showToast={showToast} C={C} />;
      case "support":     return <AdminSupportPage C={C} />;
      case "bluebadge":   return <BlueBadgePage adminUser={adminUser} showToast={showToast} C={C} />;
      case "discounts":   return <DiscountsPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "permissions": return <PermissionRequestsPage adminUser={adminUser} showToast={showToast} C={C} />;
      case "settings":    return <SettingsPage adminUser={adminUser} onProfileUpdate={u => setAdminUser((a: AdminUser | null) => a ? { ...a, ...u } : a)} C={C} />;
      default:            return <OverviewPage adminUser={adminUser} C={C} />;
    }
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: DARK.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg, ${DARK.orange}, #FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "pulse 2s infinite" }}>
            <RiFlashlightLine size={24} color="white" />
          </div>
          <div style={{ color: DARK.muted, fontSize: 14 }}>Loading Admin Dashboard…</div>
        </div>
      </div>
    );
  }

  return (
  <>
    {/* ── MAINTENANCE BANNER ── */}
    {maintenanceBanner?.active && !bannerDismissed && (
      <div style={{
        background: "linear-gradient(90deg,#7f1d1d,#991b1b)",
        color: "white",
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 700,
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 99999,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        🔧
        <span style={{ flex: 1 }}>{maintenanceBanner.message}</span>
        <button onClick={dismissBanner} style={{
          background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 8, color: "white", cursor: "pointer",
          padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          ✕ Dismiss
        </button>
      </div>
    )}

    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text, transition: "background 0.3s, color 0.3s" }}>


      {/* SIDEBAR */}
      <aside style={{ width: sidebarOpen ? 240 : 70, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", transition: "width 0.25s", overflow: "hidden", position: "sticky", top: 0, height: "100vh", background: C.sidebarBg, backdropFilter: "blur(16px)" }}>
        <div style={{ padding: "20px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>
            <RiFlashlightLine size={20} />
          </div>
          {sidebarOpen && (
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, color: C.text }}>swift<span style={{ color: C.orange }}>nija</span></div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.blue, textTransform: "uppercase", letterSpacing: 1 }}>ADMIN PANEL</div>
            </div>
          )}
        </div>
        <nav style={{ flex: 1, padding: "16px 10px", overflowY: "auto", overflowX: "hidden" }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActivePage(n.key)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 12px", borderRadius: 12, border: "none", background: activePage === n.key ? C.orangeGlow : "transparent", color: activePage === n.key ? C.orange : C.textSub, fontWeight: activePage === n.key ? 800 : 600, fontSize: 13, cursor: "pointer", marginBottom: 4, whiteSpace: "nowrap", borderLeft: `3px solid ${activePage === n.key ? C.orange : "transparent"}` }}>
              <span style={{ flexShrink: 0 }}>{n.icon}</span>
              {sidebarOpen && <span style={{ flex: 1, textAlign: "left" }}>{n.label}</span>}
              {sidebarOpen && (n.badge ?? 0) > 0 && (
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: C.red, color: "white", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, marginBottom: 8, cursor: "pointer" }} onClick={() => setActivePage("settings")}>
            <Avatar src={adminUser?.photoURL} name={adminUser?.displayName} size={36} C={C} />
            {sidebarOpen && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{adminUser?.displayName || "Admin"}</div>
                <div style={{ color: C.blue, fontSize: 10, fontWeight: 700 }}>Admin</div>
              </div>
            )}
          </div>
          <button onClick={handleLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <RiLogoutBoxLine size={16} />{sidebarOpen && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, background: C.headerBg, backdropFilter: "blur(16px)", zIndex: 100 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", cursor: "pointer", color: C.muted }}>
            <RiMenuLine size={16} />
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `${C.green}12`, borderRadius: 20, border: `1px solid ${C.green}28` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
            <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>Live</span>
          </div>
          {pendingBadgeCount > 0 && (
            <button onClick={() => setActivePage("bluebadge")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `${C.blue}12`, border: `1px solid ${C.blue}28`, borderRadius: 20, color: C.blue, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
              <RiVerifiedBadgeLine size={12} /> {pendingBadgeCount} badge{pendingBadgeCount !== 1 ? "s" : ""}
            </button>
          )}
          <button onClick={toggleTheme} style={{ width: 36, height: 36, borderRadius: 10, background: C.surface2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.textSub }}>
            {theme === "dark" ? <RiSunLine size={16} /> : <RiMoonLine size={16} />}
          </button>
          <Avatar src={adminUser?.photoURL} name={adminUser?.displayName} size={36} C={C} />
        </div>
        <div style={{ padding: "28px" }}>
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
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.orange}30; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideIn { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
      </> 
  );
}