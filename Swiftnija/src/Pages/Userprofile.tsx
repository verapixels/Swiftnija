// pages/UserProfile.tsx
// Fixes applied:
//  • No full-page loading spinner — page renders instantly
//  • Theme reads from localStorage synchronously (no flash)
//  • History tab: vendor name, rider name, delivery address, rich order card
//  • Reorder button is fully functional (re-adds items to cart)

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiUser, FiMail, FiPhone, FiMapPin, FiLock, FiSave,
  FiCamera, FiCheck, FiSun, FiMoon,
  FiShield, FiAlertCircle, FiInfo, FiLogOut, FiTrash2,
  FiEye, FiEyeOff, FiEdit3, FiPackage, FiStar,
  FiHeart, FiGlobe, FiChevronRight, FiChevronDown,
  FiPlus, FiX, FiHome, FiBriefcase, FiClock,
  FiSmartphone, FiDollarSign, FiRefreshCw, FiSearch, FiNavigation,
  FiTruck, FiShoppingCart,
} from "react-icons/fi";
import {
  MdDeliveryDining, MdVerified, MdNotifications,
  MdOutlineStorefront, MdHistory, MdPerson,
} from "react-icons/md";
import { RiUserSettingsLine, RiWalletLine } from "react-icons/ri";

import app, { auth, db } from "../firebase";
import { signOut, updateProfile, updatePassword } from "firebase/auth";
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, orderBy, limit, getDocs,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { useTheme } from "../context/ThemeContext";
import { MapPinSelector } from "../components/Mappinselector";
import { isInLagos, OUTSIDE_LAGOS_MSG } from "../services/lagosValidation";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/Cartcontext";

import WalletPage from "./Walletpage";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type Address = {
  id: string;
  label: "Home" | "Work" | "Other";
  address: string;
  landmark?: string;
  extraClue?: string;
  phone?: string;
  isDefault: boolean;
  lat?: number;
  lng?: number;
};

type UserData = {
  fullName: string; email: string; phone: string; address: string; bio: string;
  photoURL: string | null; provider: string; darkMode: boolean;
  notifications: boolean; orderUpdates: boolean; promoEmails: boolean;
  avoidSpicy: boolean; vegetarianOnly: boolean; noOnions: boolean;
  allergiesNote: string; language: string; currency: string;
  savedAddresses: Address[]; emailVerified: boolean; phoneVerified: boolean;
};

type OrderItem = { name: string; qty: number; price: number; img?: string; vendorName?: string; vendorId?: string; };

type Order = {
  id: string;
  createdAt: any;
  status: "delivered" | "cancelled" | "pending" | "processing" | "confirmed" | "finding_rider" | "rider_assigned" | "picked_up" | "arriving";
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  items: OrderItem[];
  store: string;
  vendorName?: string;
  vendorId?: string;
  deliveryAddress?: string;
  deliveryLabel?: string;
  riderName?: string;
  riderPhone?: string;
  riderId?: string;
  paymentMethod?: string;
  paystackReference?: string;
  customerName?: string;
};

type Toast = { id: number; message: string; type: "success" | "error" | "info" };
type NominatimResult = { place_id: number; display_name: string; lat: string; lon: string; };
type SelectOption = { value: string; label: string };

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function uploadAvatarToFirebase(dataUrl: string, uid: string): Promise<string> {
  const storage = getStorage();
  const blob    = await fetch(dataUrl).then(r => r.blob());
  const ref     = storageRef(storage, `avatars/${uid}/profile_${Date.now()}.jpg`);
  await uploadBytes(ref, blob, { contentType: "image/jpeg" });
  return getDownloadURL(ref);
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };
  return { toasts, addToast };
}

const STATUS_COLOR: Record<string, string> = {
  delivered: "#10B981", cancelled: "#ef4444", pending: "#f59e0b",
  processing: "#3b82f6", confirmed: "#3b82f6", finding_rider: "#f59e0b",
  rider_assigned: "#8b5cf6", picked_up: "#FF6B00", arriving: "#10B981",
};
const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered", cancelled: "Cancelled", pending: "Pending",
  processing: "Processing", confirmed: "Confirmed", finding_rider: "Finding Rider",
  rider_assigned: "Rider Assigned", picked_up: "Picked Up", arriving: "Arriving",
};
const STATUS_ICON: Record<string, string> = {
  delivered: "✅", cancelled: "❌", pending: "🕐", processing: "⚙️",
  confirmed: "✅", finding_rider: "🔍", rider_assigned: "🏍️",
  picked_up: "📦", arriving: "🚀",
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const OtpInput = ({ value, onChange, disabled, hasError }: {
  value: string; onChange: (v: string) => void; disabled: boolean; hasError: boolean;
}) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current.forEach((el, i) => { if (el && el !== document.activeElement) el.value = value[i] || ""; });
  }, [value]);
  const readAll = () => refs.current.map(el => el?.value || "").join("").replace(/[^\d]/g, "");
  const moveTo  = (idx: number) => {
    const el = refs.current[Math.max(0, Math.min(5, idx))];
    if (!el) return; el.focus(); requestAnimationFrame(() => el.setSelectionRange(0, el.value.length));
  };
  const onInput = (i: number, e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget, raw = el.value.replace(/\D/g, "");
    if (!raw) { el.value = ""; onChange(readAll()); return; }
    el.value = raw.slice(-1); onChange(readAll()); if (i < 5) moveTo(i + 1);
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const el = refs.current[i];
      if (el?.value) { el.value = ""; onChange(readAll()); }
      else if (i > 0) { const p = refs.current[i - 1]; if (p) p.value = ""; onChange(readAll()); moveTo(i - 1); }
    } else if (e.key === "ArrowLeft")  { e.preventDefault(); moveTo(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveTo(i + 1); }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    digits.split("").forEach((d, i) => { if (refs.current[i]) refs.current[i]!.value = d; });
    onChange(readAll()); moveTo(Math.min(digits.length, 5));
  };
  return (
    <div className="otp-row">
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }}
          className={`otp-box${hasError ? " error" : ""}`}
          type="text" inputMode="numeric" maxLength={2} placeholder=" "
          defaultValue={value[i] || ""}
          onInput={e => onInput(i, e)} onKeyDown={e => onKey(i, e)}
          onPaste={onPaste} onFocus={e => e.currentTarget.select()}
          disabled={disabled} autoComplete="one-time-code" />
      ))}
    </div>
  );
};

const CustomSelect = ({ value, onChange, options, icon: Icon }: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; icon?: React.ElementType;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="csel-wrap" ref={ref}>
      <button className={`csel-trigger ${open ? "open" : ""}`} type="button" onClick={() => setOpen(v => !v)}>
        {Icon && <Icon size={14} className="csel-icon" />}
        <span className="csel-value">{selected?.label || "Select..."}</span>
        <FiChevronDown size={14} className={`csel-arrow ${open ? "flipped" : ""}`} />
      </button>
      {open && (
        <div className="csel-dropdown">
          {options.map(o => (
            <button key={o.value} className={`csel-opt ${o.value === value ? "active" : ""}`} type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}{o.value === value && <FiCheck size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
  <button onClick={onChange} className={`toggle-sw ${on ? "on" : ""}`} type="button" aria-checked={on} role="switch">
    <span className="toggle-knob" />
  </button>
);

const PhoneEditModal = ({ currentPhone, userEmail, onSave, onClose, fns, addToast }: {
  currentPhone: string; userEmail: string; onSave: (p: string) => void; onClose: () => void;
  fns: ReturnType<typeof getFunctions>; addToast: (m: string, t?: "success"|"error"|"info") => void;
}) => {
  const [step, setStep]       = useState<"enter"|"verify">("enter");
  const [phone, setPhone]     = useState(currentPhone);
  const [code, setCode]       = useState(""); const [codeErr, setCodeErr] = useState("");
  const [sending, setSending] = useState(false); const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const sendOtp = async () => {
    if (!phone.trim()) { addToast("Enter a phone number first", "error"); return; }
    setSending(true);
    try { await httpsCallable(fns, "sendPhoneVerificationOtp")({ phone }); setStep("verify"); setCooldown(60); addToast(`Code sent to ${userEmail}`, "info"); }
    catch (e: any) { addToast(e?.message || "Could not send code", "error"); }
    finally { setSending(false); }
  };
  const verify = async (override?: string) => {
    const c = override ?? code; if (c.length !== 6) return;
    setVerifying(true); setCodeErr("");
    try { await httpsCallable(fns, "verifyPhoneOtp")({ code: c, phone }); onSave(phone); addToast("Phone number verified & saved ✓", "success"); onClose(); }
    catch (e: any) { setCodeErr(e?.message || "Wrong code — try again"); setCode(""); }
    finally { setVerifying(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><FiPhone size={16} color="#FF6B00"/><span>{step==="enter"?"Change Phone Number":"Verify Your Identity"}</span><button className="modal-close" onClick={onClose}><FiX size={18}/></button></div>
        {step === "enter" && (<>
          <div className="field-group"><label className="up-label">New Phone Number</label><div className="up-input-row"><FiPhone size={14} className="up-inp-icon"/><input className="up-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" type="tel" autoFocus/></div></div>
          <div className="otp-method-label">Verification method</div>
          <div className="otp-method-grid">
            <div className="otp-method-card active"><FiMail size={20} color="#FF6B00"/><span className="otp-method-name">Email OTP</span><span className="otp-method-sub">Sent to {userEmail}</span></div>
            <div className="otp-method-card disabled"><FiPhone size={20}/><span className="otp-method-name">SMS</span><span className="otp-method-soon">Coming soon</span></div>
            <div className="otp-method-card disabled"><span style={{fontSize:20}}>💬</span><span className="otp-method-name">WhatsApp</span><span className="otp-method-soon">Coming soon</span></div>
          </div>
          <button className="save-btn" onClick={sendOtp} disabled={sending||!phone.trim()}>{sending?<><span className="mini-spin"/>Sending...</>:<><FiShield size={15}/> Send Verification Code</>}</button>
        </>)}
        {step === "verify" && (<>
          <div className="v-info-box"><FiMail size={14} color="#FF6B00"/><div><div className="v-info-title">Check your email</div><div className="v-info-desc">A 6-digit code was sent to <strong>{userEmail}</strong></div></div></div>
          <div className="v-otp-label"><FiLock size={11}/>Enter the 6-digit code</div>
          <OtpInput value={code} onChange={v => { setCodeErr(""); setCode(v); if (v.length===6) verify(v); }} disabled={verifying} hasError={!!codeErr}/>
          {codeErr && <div className="v-err-box"><FiAlertCircle size={14}/><span>{codeErr}</span></div>}
          <div className="v-footer-row">
            <span className="v-sec-note"><FiShield size={10}/>SHA-256 · 5 min expiry</span>
            {cooldown > 0 ? <span className="v-cdw-txt">Resend in {cooldown}s</span> : <button className="v-ghost" onClick={sendOtp} disabled={sending}><FiRefreshCw size={12}/>Resend</button>}
          </div>
        </>)}
      </div>
    </div>
  );
};

const DeleteModal = ({ onClose, onConfirm }: { onClose:()=>void; onConfirm:()=>void }) => {
  const [typed, setTyped] = useState("");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card delete-modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header delete"><FiTrash2 size={18} color="#ef4444"/><span>Delete Account</span><button className="modal-close" onClick={onClose}><FiX size={18}/></button></div>
        <div className="delete-warning"><FiAlertCircle size={28} color="#ef4444"/><p>This permanently deletes your account, addresses, order history, and favourites. <strong>Cannot be undone.</strong></p></div>
        <div className="field-group"><label className="up-label">Type <strong style={{color:"#ef4444"}}>delete</strong> to confirm</label><div className="up-input-row" style={{borderColor:typed==="delete"?"#ef4444":undefined}}><input className="up-input" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="delete"/></div></div>
        <button className="danger-confirm-btn" disabled={typed!=="delete"} onClick={onConfirm}>Yes, Delete My Account</button>
      </div>
    </div>
  );
};

// ─── Enhanced Order Modal ─────────────────────────────────────────────────────
const OrderModal = ({ order, onClose, onReorder }: {
  order: Order; onClose: ()=>void; onReorder: (order: Order) => void;
}) => {
  const sc = STATUS_COLOR[order.status] || "#888";
  const navigate = useNavigate();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card order-modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <FiPackage size={16} color="#FF6B00"/>
          <span>Order #{order.id.slice(-8).toUpperCase()}</span>
          <button className="modal-close" onClick={onClose}><FiX size={18}/></button>
        </div>

        {/* Status + date */}
        <div className="order-modal-meta">
          <div className="order-status-pill" style={{background:`${sc}18`,color:sc,border:`1.5px solid ${sc}33`}}>
            <span>{STATUS_ICON[order.status] ?? "📦"}</span>
            {STATUS_LABEL[order.status] ?? order.status}
          </div>
          <span className="order-modal-date">
            {order.createdAt?.toDate?.().toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})||"—"}
          </span>
        </div>

        {/* Vendor */}
        {(order.vendorName || order.store) && (
          <div className="order-detail-row">
            <div className="order-detail-icon"><MdOutlineStorefront size={14} color="#FF6B00"/></div>
            <div>
              <div className="order-detail-label">Vendor / Store</div>
              <div className="order-detail-value">{order.vendorName || order.store}</div>
            </div>
            {order.vendorId && (
              <button className="order-detail-link" onClick={() => { onClose(); navigate(`/store/${order.vendorId}`); }}>
                View store <FiChevronRight size={11}/>
              </button>
            )}
          </div>
        )}

        {/* Rider */}
        {(order.riderName || order.riderId) && (
          <div className="order-detail-row">
            <div className="order-detail-icon"><MdDeliveryDining size={14} color="#8b5cf6"/></div>
            <div>
              <div className="order-detail-label">Delivery Rider</div>
              <div className="order-detail-value">{order.riderName || "Rider assigned"}</div>
              {order.riderPhone && <div className="order-detail-sub">📞 {order.riderPhone}</div>}
            </div>
          </div>
        )}
        {!order.riderName && !order.riderId && order.status !== "delivered" && order.status !== "cancelled" && (
          <div className="order-detail-row" style={{opacity:.55}}>
            <div className="order-detail-icon"><MdDeliveryDining size={14} color="#888"/></div>
            <div>
              <div className="order-detail-label">Delivery Rider</div>
              <div className="order-detail-value" style={{fontStyle:"italic",color:"var(--text3)"}}>Not yet assigned</div>
            </div>
          </div>
        )}

        {/* Delivery address */}
        {order.deliveryAddress && (
          <div className="order-detail-row">
            <div className="order-detail-icon"><FiMapPin size={14} color="#10B981"/></div>
            <div style={{flex:1,minWidth:0}}>
              <div className="order-detail-label">Delivered to</div>
              <div className="order-detail-value" style={{whiteSpace:"normal",lineHeight:1.4}}>{order.deliveryAddress}</div>
            </div>
          </div>
        )}

        {/* Payment */}
        {order.paymentMethod && (
          <div className="order-detail-row">
            <div className="order-detail-icon"><FiShield size={14} color="#3b82f6"/></div>
            <div>
              <div className="order-detail-label">Payment</div>
              <div className="order-detail-value" style={{textTransform:"capitalize"}}>{order.paymentMethod}</div>
              {order.paystackReference && <div className="order-detail-sub">Ref: {order.paystackReference.slice(-12).toUpperCase()}</div>}
            </div>
          </div>
        )}

        {/* Items */}
        <div style={{background:"var(--inp)",borderRadius:14,overflow:"hidden",border:"1px solid var(--border)"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:10,fontWeight:800,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".6px"}}>
            Items ordered ({order.items.reduce((s,i)=>s+i.qty,0)})
          </div>
          {order.items.map((item, i) => (
            <div key={i} className="order-item-row" style={{borderBottom:i<order.items.length-1?"1px solid var(--border)":undefined}}>
              <div style={{width:32,height:32,borderRadius:8,background:"rgba(255,107,0,.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {item.img
                  ? <img src={item.img} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:8}}/>
                  : <FiPackage size={14} color="#FF6B00"/>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                {item.vendorName && <div style={{fontSize:10,color:"var(--text3)",fontWeight:600}}>{item.vendorName}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:12,fontWeight:800,color:"var(--text)"}}>₦{item.price.toLocaleString()}</div>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:600}}>×{item.qty}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Price breakdown */}
        <div style={{display:"flex",flexDirection:"column",gap:6,background:"var(--inp)",borderRadius:14,padding:"12px 14px",border:"1px solid var(--border)"}}>
          {order.subtotal !== undefined && (
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"var(--text2)"}}>
              <span>Subtotal</span><span>₦{order.subtotal.toLocaleString()}</span>
            </div>
          )}
          {order.deliveryFee !== undefined && (
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"var(--text2)"}}>
              <span>Delivery fee</span><span>₦{order.deliveryFee.toLocaleString()}</span>
            </div>
          )}
          {order.discount !== undefined && order.discount > 0 && (
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"#22c55e"}}>
              <span>Discount</span><span>−₦{order.discount.toLocaleString()}</span>
            </div>
          )}
          <div style={{height:1,background:"var(--border)",margin:"4px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:14,fontWeight:800,color:"var(--text)"}}>Total</span>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900,color:"#FF6B00"}}>₦{order.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          {order.status !== "cancelled" && (
            <button
              className="order-track-btn"
              onClick={() => { onClose(); navigate(`/orders/${order.id}/track`); }}
            >
              <FiTruck size={14}/> Track Order
            </button>
          )}
          <button
            className="reorder-btn"
            onClick={() => { onReorder(order); onClose(); }}
          >
            <FiShoppingCart size={14}/> Reorder
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserProfile() {
  const [user, setUser] = useState(auth.currentUser);
  const navigate = useNavigate();
  const { addToCart } = useCart();
  useEffect(() => { const u = auth.onAuthStateChanged(u => setUser(u)); return () => u(); }, []);

  const { theme, toggleTheme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { toasts, addToast } = useToasts();
  const fns = getFunctions(app);

  type Tab = "profile" | "settings" | "security" | "wallet" | "history";
  const [tab, setTab] = useState<Tab>("profile");

  // ── NO loading state — render immediately ──
  const BLANK: UserData = {
    fullName:"", email:"", phone:"", address:"", bio:"", photoURL:null,
    provider:"email", darkMode:true, notifications:true, orderUpdates:true,
    promoEmails:false, avoidSpicy:false, vegetarianOnly:false, noOnions:false,
    allergiesNote:"", language:"en-NG", currency:"NGN",
    savedAddresses:[], emailVerified:false, phoneVerified:false,
  };

  // Seed from Firebase Auth immediately — no wait
  const [userData, setUserData] = useState<UserData>(() => ({
    ...BLANK,
    fullName: auth.currentUser?.displayName || "",
    email:    auth.currentUser?.email       || "",
    phone:    auth.currentUser?.phoneNumber || "",
    photoURL: auth.currentUser?.photoURL    || null,
  }));
  const [editData, setEditData] = useState<UserData>(() => ({
    ...BLANK,
    fullName: auth.currentUser?.displayName || "",
    email:    auth.currentUser?.email       || "",
    phone:    auth.currentUser?.phoneNumber || "",
    photoURL: auth.currentUser?.photoURL    || null,
  }));
  const [profileLoading, setProfileLoading] = useState(true); // only for "fields still loading" indicator

  const [avatarPreview, setAvatarPreview] = useState<string|null>(null);
  const [uploading,     setUploading]     = useState(false);
  const [saving,        setSaving]        = useState(false);

  // password
  const [newPwd,        setNewPwd]        = useState("");
  const [confPwd,       setConfPwd]       = useState("");
  const [showPwd,       setShowPwd]       = useState(false);
  const [pwdSaving,     setPwdSaving]     = useState(false);
  const [pwdOtpSent,    setPwdOtpSent]    = useState(false);
  const [pwdOtpSending, setPwdOtpSending] = useState(false);
  const [pwdCode,       setPwdCode]       = useState("");
  const [pwdVerified,   setPwdVerified]   = useState(false);
  const [pwdCodeErr,    setPwdCodeErr]    = useState("");
  const [pwdCooldown,   setPwdCooldown]   = useState(0);
  useEffect(() => { if (pwdCooldown<=0) return; const t=setTimeout(()=>setPwdCooldown(c=>c-1),1000); return ()=>clearTimeout(t); }, [pwdCooldown]);

  // history
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded,  setHistLoaded]  = useState(false);
  const [selOrder,    setSelOrder]    = useState<Order|null>(null);
  const [histFilter,  setHistFilter]  = useState<"all"|"delivered"|"cancelled"|"pending">("all");
  const [orderCount,     setOrderCount]     = useState<number | null>(null);
  const [sidebarWallet,  setSidebarWallet]  = useState<number | null>(null);

  // modals
  const [addrModal,   setAddrModal]   = useState<{ open:boolean; editing?:Address }>({ open:false });
  const [deleteModal, setDeleteModal] = useState(false);
  const [phoneModal,  setPhoneModal]  = useState(false);

  const avatarRef = useRef<HTMLInputElement>(null);

  // ── Load profile from Firestore in background ─────────────────────────────
  useEffect(() => {
    if (!user) { setProfileLoading(false); return; }
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const d = snap.exists() ? (snap.data() as Partial<UserData>) : {};
      const merged: UserData = {
        fullName:       d.fullName       || user.displayName || "",
        email:          d.email          || user.email        || "",
        phone:          d.phone          || user.phoneNumber  || "",
        address:        d.address        || "",
        bio:            d.bio            || "",
        photoURL:       d.photoURL       ?? user.photoURL     ?? null,
        provider:       d.provider       || "email",
        darkMode:       d.darkMode       !== undefined ? d.darkMode!       : true,
        notifications:  d.notifications  !== undefined ? d.notifications!  : true,
        orderUpdates:   d.orderUpdates   !== undefined ? d.orderUpdates!   : true,
        promoEmails:    d.promoEmails    !== undefined ? d.promoEmails!    : false,
        avoidSpicy:     d.avoidSpicy     !== undefined ? d.avoidSpicy!     : false,
        vegetarianOnly: d.vegetarianOnly !== undefined ? d.vegetarianOnly! : false,
        noOnions:       d.noOnions       !== undefined ? d.noOnions!       : false,
        allergiesNote:  d.allergiesNote  || "",
        language:       d.language       || "en-NG",
        currency:       d.currency       || "NGN",
        savedAddresses: d.savedAddresses || [],
        emailVerified:  d.emailVerified  ?? false,
        phoneVerified:  d.phoneVerified  ?? false,
      };
      if (!snap.exists()) {
        setDoc(doc(db,"users",user.uid), { ...merged, createdAt:serverTimestamp(), updatedAt:serverTimestamp() }, { merge:true }).catch(console.warn);
      }
      setUserData(merged); setEditData(merged);
      // Sync theme only if Firestore differs from current localStorage value
      const fsTheme = merged.darkMode ? "dark" : "light";
      if (fsTheme !== theme) setTheme(fsTheme);
    }).catch(err => {
      console.error("Profile load:", err.message);
    }).finally(() => setProfileLoading(false));
  }, [user]);

  // ── Load sidebar stats (order count + wallet) on mount ──
useEffect(() => {
  if (!user) return;
  // Order count
  getDocs(query(
    collection(db, "orders"),
    where("userId", "==", user.uid),
    limit(50)
  )).then(snap => setOrderCount(snap.size)).catch(() => setOrderCount(0));
  // Wallet balance
  getDoc(doc(db, "wallets", user.uid))
    .then(snap => setSidebarWallet(snap.exists() ? (snap.data().balance ?? 0) : 0))
    .catch(() => setSidebarWallet(0));
}, [user]);

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "history" || histLoaded || !user) return;
    setHistLoading(true);
    getDocs(query(
      collection(db,"orders"),
      where("userId","==",user.uid),
      orderBy("createdAt","desc"),
      limit(50)
    )).then(snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
      setHistLoaded(true);
    }).catch(err => {
      console.error("Orders:", err);
      addToast("Could not load order history","error");
    }).finally(() => setHistLoading(false));
  }, [tab, histLoaded, user]);

  // ── Reorder ───────────────────────────────────────────────────────────────
  const handleReorder = useCallback((order: Order) => {
    let count = 0;
    for (const item of order.items) {
      for (let i = 0; i < item.qty; i++) {
        addToCart({
          name:       item.name,
          price:      `₦${item.price.toLocaleString()}`,
          img:        item.img || "",
          vendorName: item.vendorName || order.vendorName || order.store,
          vendorId:   item.vendorId   || order.vendorId,
        });
        count++;
      }
    }
    addToast(`${count} item${count !== 1 ? "s" : ""} added to cart 🛒`, "success");
    navigate("/cart");
  }, [addToCart, navigate]);

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) { addToast("Must be logged in","error"); return; }
    setSaving(true);
    try {
      let photoURL = editData.photoURL;
      if (avatarPreview?.startsWith("data:")) {
        setUploading(true);
        try { photoURL = await uploadAvatarToFirebase(avatarPreview, user.uid); setAvatarPreview(null); await updateProfile(user, { displayName:editData.fullName, photoURL }); }
        catch { addToast("Photo upload failed, other changes saved","error"); }
        finally { setUploading(false); }
      } else { await updateProfile(user, { displayName:editData.fullName }).catch(console.error); }
      await setDoc(doc(db,"users",user.uid), {
        fullName:editData.fullName, phone:editData.phone, email:editData.email,
        address:editData.address, bio:editData.bio, photoURL: photoURL??null,
        provider:editData.provider, darkMode:isDark,
        notifications:editData.notifications, orderUpdates:editData.orderUpdates,
        promoEmails:editData.promoEmails, avoidSpicy:editData.avoidSpicy,
        vegetarianOnly:editData.vegetarianOnly, noOnions:editData.noOnions,
        allergiesNote:editData.allergiesNote, language:editData.language,
        currency:editData.currency, savedAddresses:editData.savedAddresses,
        updatedAt:serverTimestamp(),
      }, { merge:true });
      const updated = { ...editData, photoURL:photoURL??null, darkMode:isDark };
      setUserData(updated); setEditData(updated);
      addToast("Profile saved! 🎉","success");
    } catch (e: any) { addToast(`Save failed: ${e.message||"Unknown error"}`, "error"); }
    finally { setSaving(false); }
  };

  const toggleSetting = async (key: keyof UserData) => {
    const val = !editData[key];
    setEditData(p => ({ ...p, [key]:val }));
    if (user) setDoc(doc(db,"users",user.uid), { [key]:val, updatedAt:serverTimestamp() }, { merge:true }).catch(e=>addToast(`Could not save: ${e.message}`,"error"));
    addToast("Preference updated","info");
  };

  const handleThemeToggle = async () => {
    toggleTheme();
    const newDark = !isDark;
    setEditData(p => ({ ...p, darkMode:newDark }));
    if (user) setDoc(doc(db,"users",user.uid), { darkMode:newDark, updatedAt:serverTimestamp() }, { merge:true }).catch(console.error);
  };

  const saveAddress = (addr: Address) => {
    let list = editData.savedAddresses.filter(a => a.id !== addr.id);
    if (addr.isDefault) list = list.map(a => ({ ...a, isDefault:false }));
    list = addr.isDefault ? [addr, ...list] : [...list, addr];
    setEditData(p => ({ ...p, savedAddresses:list }));
    if (user) setDoc(doc(db,"users",user.uid), { savedAddresses:list, updatedAt:serverTimestamp() }, { merge:true }).catch(e=>addToast("Could not save address","error"));
    addToast(addrModal.editing ? "Address updated" : "Address added","success");
  };

  const deleteAddress = (id: string) => {
    const list = editData.savedAddresses.filter(a => a.id !== id);
    setEditData(p => ({ ...p, savedAddresses:list }));
    if (user) setDoc(doc(db,"users",user.uid), { savedAddresses:list, updatedAt:serverTimestamp() }, { merge:true }).catch(console.error);
    addToast("Address removed","info");
  };

  const setDefaultAddress = (id: string) => {
    const list = editData.savedAddresses.map(a => ({ ...a, isDefault: a.id===id }));
    setEditData(p => ({ ...p, savedAddresses:list }));
    if (user) setDoc(doc(db,"users",user.uid), { savedAddresses:list, updatedAt:serverTimestamp() }, { merge:true }).catch(console.error);
    addToast("Default address updated","success");
  };

  const handlePhoneSave = (phone: string) => {
    const updated = { ...editData, phone, phoneVerified:true };
    setEditData(updated); setUserData({ ...userData, phone, phoneVerified:true });
    if (user) setDoc(doc(db,"users",user.uid), { phone, phoneVerified:true, updatedAt:serverTimestamp() }, { merge:true }).catch(console.error);
  };

  const handleLogout = async () => {
    try { await signOut(auth); addToast("Signed out","info"); navigate("/login"); }
    catch (e: any) { addToast("Could not sign out: "+e.message,"error"); }
  };

  const sendPwdOtp = async () => {
    if (!user || pwdOtpSending) return; setPwdOtpSending(true); setPwdCodeErr("");
    try { await httpsCallable(fns,"sendPasswordResetOtp")({}); setPwdOtpSent(true); setPwdCooldown(60); addToast("Code sent to your email","info"); }
    catch (e: any) { setPwdCodeErr(e?.message||"Could not send code."); }
    finally { setPwdOtpSending(false); }
  };
  const verifyPwdOtp = async (override?: string) => {
    const code = override ?? pwdCode; if (!user || code.length!==6) return; setPwdCodeErr("");
    try { await httpsCallable(fns,"verifyPasswordResetOtp")({ code }); setPwdVerified(true); addToast("Identity confirmed ✓","success"); }
    catch (e: any) { setPwdCodeErr(e?.message||"Wrong code."); setPwdCode(""); }
  };
  const handlePwdChange = async () => {
    if (!user) return;
    if (newPwd !== confPwd) { addToast("Passwords do not match","error"); return; }
    if (newPwd.length < 8)  { addToast("Minimum 8 characters","error"); return; }
    setPwdSaving(true);
    try {
      await user.reload(); await updatePassword(user, newPwd);
      addToast("Password updated! 🎉","success");
      setNewPwd(""); setConfPwd(""); setPwdOtpSent(false); setPwdCode(""); setPwdVerified(false);
    } catch (e: any) {
      addToast(e.code==="auth/requires-recent-login"?"Session expired — sign out and back in, then retry.":"Failed: "+e.message,"error");
    } finally { setPwdSaving(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const displayPhoto = avatarPreview || editData.photoURL;
  const initials     = (editData.fullName || "U").split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
  const filtOrders   = histFilter==="all" ? orders : orders.filter(o=>{
    if (histFilter==="pending") return ["pending","processing","confirmed","finding_rider","rider_assigned","picked_up","arriving"].includes(o.status);
    return o.status === histFilter;
  });

  const LANG_OPTS: SelectOption[] = [
    { value:"en-NG", label:"🇳🇬 English (Nigeria)" },
    { value:"yo",    label:"🗣️ Yoruba" },
    { value:"ha",    label:"🗣️ Hausa" },
    { value:"pcm",   label:"🗣️ Naija Pidgin" },
  ];
  const CURR_OPTS: SelectOption[] = [
    { value:"NGN", label:"₦ NGN — Naira" },
    { value:"USD", label:"$ USD — Dollar" },
    { value:"GBP", label:"£ GBP — Pound" },
  ];
  const PROV_OPTS: SelectOption[] = [
    { value:"email",  label:"📧 Email & Password" },
    { value:"google", label:"🌐 Google Account" },
  ];

  const TABS = [
    { id:"profile"  as Tab, label:"Profile",  Icon:FiUser },
    { id:"settings" as Tab, label:"Settings", Icon:RiUserSettingsLine },
    { id:"security" as Tab, label:"Security", Icon:FiShield },
    { id:"wallet"   as Tab, label:"Wallet",   Icon:RiWalletLine },
    { id:"history"  as Tab, label:"History",  Icon:MdHistory },
  ];

  const recentLogins = [
    { device:"Chrome on Android", location:"Lagos, NG", time:"Just now",    current:true },
    { device:"Chrome on Windows",  location:"Lagos, NG", time:"Feb 20, 2026" },
    { device:"Safari on iPhone",   location:"Ibadan, NG",time:"Feb 15, 2026" },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // TAB RENDERERS
  // ─────────────────────────────────────────────────────────────────────────

  const ProfileTab = () => (
    <div className="tab-content">
      {profileLoading && (
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",color:"var(--text3)",fontSize:12,fontWeight:600}}>
          <span className="mini-spin" style={{borderTopColor:"#FF6B00",borderColor:"rgba(255,107,0,.2)"}}/>
          Loading your profile details…
        </div>
      )}
      {avatarPreview && <div className="photo-save-banner"><FiCamera size={13}/><span>New photo selected — tap <strong>Save Changes</strong> to apply</span></div>}
      <div className="tab-section">
        <div className="section-eyebrow"><FiEdit3 size={13}/>Personal Information</div>
        <div className="field-group"><label className="up-label">Full Name</label><div className="up-input-row"><FiUser size={14} className="up-inp-icon"/><input className="up-input" value={editData.fullName} onChange={e=>setEditData(p=>({...p,fullName:e.target.value}))} placeholder="Your full name"/></div></div>
        <div className="field-group">
          <label className="up-label">Phone Number</label>
          <div className="up-input-row"><FiPhone size={14} className="up-inp-icon"/><input className="up-input" value={editData.phone} readOnly placeholder="+234 800 000 0000" style={{cursor:"default"}}/>{userData.phoneVerified&&<span className="verified-tick"><FiCheck size={12}/></span>}<button className="field-edit-btn" style={{opacity:1}} onClick={()=>setPhoneModal(true)}><FiEdit3 size={13}/></button></div>
          {!userData.phoneVerified && editData.phone && <span className="field-hint" style={{color:"#f59e0b"}}>⚠ Phone not verified — <button className="inline-link-btn" onClick={()=>setPhoneModal(true)}>verify now</button></span>}
          {!editData.phone && <span className="field-hint" style={{color:"#f59e0b"}}>⚠ No phone — <button className="inline-link-btn" onClick={()=>setPhoneModal(true)}>add one</button></span>}
        </div>
        <div className="field-group"><label className="up-label">Email Address</label><div className="up-input-row" style={{opacity:.7}}><FiMail size={14} className="up-inp-icon"/><input className="up-input" value={editData.email} readOnly style={{cursor:"default"}}/>{userData.emailVerified&&<span className="verified-tick"><FiCheck size={12}/></span>}<span className="field-locked-badge">🔒</span></div><span className="field-hint">Email cannot be changed here</span></div>
        <div className="field-group"><label className="up-label">Sign-in Method</label><CustomSelect value={editData.provider} onChange={v=>setEditData(p=>({...p,provider:v}))} options={PROV_OPTS} icon={FiGlobe}/></div>
        <div className="field-group"><label className="up-label">Bio</label><textarea className="up-textarea" value={editData.bio} onChange={e=>setEditData(p=>({...p,bio:e.target.value}))} placeholder="A short note about yourself..." rows={3}/></div>
      </div>
      <div className="addresses-section">
        <div className="addresses-header"><div className="section-eyebrow"><FiMapPin size={13}/>Saved Addresses</div><button className="add-addr-btn" onClick={()=>setAddrModal({open:true})}><FiPlus size={13}/> Add</button></div>
        {editData.savedAddresses.length===0 ? (
          <div className="addr-empty"><FiMapPin size={24} color="var(--text3)"/><span>No saved addresses yet</span><button className="addr-empty-btn" onClick={()=>setAddrModal({open:true})}><FiPlus size={12}/> Add Your First Address</button></div>
        ) : (
          <div className="addr-list">
            {editData.savedAddresses.map(addr=>(
              <div className={`addr-card ${addr.isDefault?"addr-default":""}`} key={addr.id}>
                <div className="addr-icon">{addr.label==="Home"?<FiHome size={16}/>:addr.label==="Work"?<FiBriefcase size={16}/>:<FiMapPin size={16}/>}</div>
                <div className="addr-body"><div className="addr-label-row"><span className="addr-label">{addr.label}</span>{addr.isDefault&&<span className="addr-default-badge">Default</span>}</div><div className="addr-text">{addr.address}</div>{addr.landmark&&<div className="addr-phone">📍 {addr.landmark}</div>}{addr.extraClue&&<div className="addr-phone">💡 {addr.extraClue}</div>}{addr.phone&&<div className="addr-phone">📞 {addr.phone}</div>}</div>
                <div className="addr-actions">{!addr.isDefault&&<button className="addr-action-btn" title="Set default" onClick={()=>setDefaultAddress(addr.id)}><FiCheck size={13}/></button>}<button className="addr-action-btn" title="Edit" onClick={()=>setAddrModal({open:true,editing:addr})}><FiEdit3 size={13}/></button><button className="addr-action-btn red" title="Delete" onClick={()=>deleteAddress(addr.id)}><FiTrash2 size={13}/></button></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sticky-save-bar">
        <button className="save-btn" onClick={handleSave} disabled={saving||uploading}>{saving||uploading?<><span className="mini-spin"/>{uploading?"Uploading...":"Saving..."}</>:<><FiSave size={15}/> Save Changes</>}</button>
        <button className="logout-btn-sm" onClick={handleLogout}><FiLogOut size={14}/></button>
      </div>
    </div>
  );

  const SettingsTab = () => (
    <div className="tab-content">
      <div className={`theme-hero ${isDark?"theme-dark":"theme-light"}`}>
        <div className="theme-hero-left"><div className="theme-hero-orb">{isDark?<FiMoon size={28} color="white"/>:<FiSun size={28} color="#FF6B00"/>}</div><div><div className="theme-hero-title">{isDark?"Dark Mode":"Light Mode"}</div><div className="theme-hero-sub">{isDark?"Easy on the eyes at night":"Bright and clear interface"}</div></div></div>
        <div className="theme-icon-row"><FiSun size={14} style={{color:isDark?"rgba(255,255,255,.3)":"#FF6B00"}}/><Toggle on={isDark} onChange={handleThemeToggle}/><FiMoon size={14} style={{color:isDark?"white":"rgba(0,0,0,.3)"}}/></div>
      </div>
      <div className="settings-section-label"><MdNotifications size={15} color="#FF6B00"/><span>Notifications</span></div>
      <div className="settings-cards">
        {([
          { key:"notifications" as keyof UserData, Icon:MdNotifications, label:"Push Notifications",   desc:"Alerts for orders and activity" },
          { key:"orderUpdates"  as keyof UserData, Icon:FiPackage,       label:"Order Status Updates", desc:"SMS + in-app delivery tracking" },
          { key:"promoEmails"   as keyof UserData, Icon:FiMail,          label:"Promotional Emails",   desc:"Offers and deals from Swiftnija" },
        ]).map(item=>(
          <div className={`settings-card ${editData[item.key]?"card-on":""}`} key={item.key}>
            <div className="settings-card-left"><div className={`settings-card-icon ${editData[item.key]?"icon-on":""}`}><item.Icon size={18}/></div><div><div className="settings-card-label">{item.label}</div><div className="settings-card-desc">{item.desc}</div></div></div>
            <Toggle on={!!editData[item.key]} onChange={()=>toggleSetting(item.key)}/>
          </div>
        ))}
      </div>
      <div className="settings-section-label"><FiPackage size={15} color="#FF6B00"/><span>Order Preferences</span></div>
      <div className="settings-cards">
        {([
          { key:"avoidSpicy"      as keyof UserData, emoji:"🌶️", label:"Avoid Spicy Food",  desc:"Request mild/no-spice options" },
          { key:"vegetarianOnly"  as keyof UserData, emoji:"🥦", label:"Vegetarian Only",    desc:"Show only vegetarian items" },
          { key:"noOnions"        as keyof UserData, emoji:"🧅", label:"No Onions / Garlic", desc:"Mention in every order note" },
        ]).map(item=>(
          <div className={`settings-card ${editData[item.key]?"card-on":""}`} key={item.key}>
            <div className="settings-card-left"><div className={`settings-card-icon ${editData[item.key]?"icon-on":""}`} style={{fontSize:20}}>{item.emoji}</div><div><div className="settings-card-label">{item.label}</div><div className="settings-card-desc">{item.desc}</div></div></div>
            <Toggle on={!!editData[item.key]} onChange={()=>toggleSetting(item.key)}/>
          </div>
        ))}
      </div>
      <div className="field-group" style={{marginTop:-4}}><label className="up-label">Allergies / Special Notes</label><textarea className="up-textarea" value={editData.allergiesNote} onChange={e=>setEditData(p=>({...p,allergiesNote:e.target.value}))} placeholder="e.g. nut allergy, lactose intolerant..." rows={2}/></div>
      <div className="settings-section-label"><FiGlobe size={15} color="#FF6B00"/><span>Language & Currency</span></div>
      <div className="selectors-row">
        <div className="field-group" style={{flex:1}}><label className="up-label">Language</label><CustomSelect value={editData.language} onChange={v=>setEditData(p=>({...p,language:v}))} options={LANG_OPTS} icon={FiGlobe}/></div>
        <div className="field-group" style={{flex:1}}><label className="up-label">Currency</label><CustomSelect value={editData.currency} onChange={v=>setEditData(p=>({...p,currency:v}))} options={CURR_OPTS} icon={FiDollarSign}/></div>
      </div>
      <button className="save-btn" onClick={handleSave} disabled={saving}>{saving?<><span className="mini-spin"/>Saving...</>:<><FiSave size={15}/> Save Preferences</>}</button>
      <div className="settings-section-label"><FiInfo size={15} color="#FF6B00"/><span>About</span></div>
      <div className="info-grid">
        {[{Icon:MdDeliveryDining,label:"Version",val:"v2.4.1"},{Icon:FiGlobe,label:"Region",val:"Lagos, NG"},{Icon:FiHeart,label:"Made by",val:"Verapixels"},{Icon:MdOutlineStorefront,label:"Partners",val:"500+ Stores"}].map((s,i)=>(
          <div className="info-card" key={i}><div className="info-card-icon"><s.Icon size={20}/></div><div className="info-card-value">{s.val}</div><div className="info-card-label">{s.label}</div></div>
        ))}
      </div>
      <div className="danger-card">
        <div className="danger-header"><FiTrash2 size={14}/>Danger Zone</div>
        <p className="danger-desc">Permanently delete your account, saved addresses, order history, and favourites.</p>
        <button className="danger-btn" onClick={()=>setDeleteModal(true)}>Delete My Account</button>
      </div>
    </div>
  );

  const SecurityTab = () => (
    <div className="tab-content">
      {userData.provider !== "google" ? (
        <div className="security-card">
          <div className="security-card-header"><FiLock size={18} color="#FF6B00"/><span>Change Password</span></div>
          {!pwdOtpSent && !pwdVerified && (<><p style={{fontSize:13,color:"var(--text2)",fontWeight:600,lineHeight:1.65}}>We'll send a one-time code to <strong style={{color:"var(--text)"}}>{userData.email}</strong> before you can set a new password.</p><button className="save-btn" onClick={sendPwdOtp} disabled={pwdOtpSending}>{pwdOtpSending?<><span className="mini-spin"/>Sending...</>:<><FiShield size={15}/> Send Verification Code</>}</button></>)}
          {pwdOtpSent && !pwdVerified && (<>
            <div className="v-info-box"><FiMail size={14} color="#FF6B00"/><div><div className="v-info-title">Check your inbox</div><div className="v-info-desc">A 6-digit code was sent to <strong>{userData.email}</strong></div></div></div>
            <div className="v-otp-label"><FiLock size={11}/>Enter the 6-digit code</div>
            <OtpInput value={pwdCode} onChange={v=>{setPwdCodeErr("");setPwdCode(v);if(v.length===6)verifyPwdOtp(v);}} disabled={false} hasError={!!pwdCodeErr}/>
            {pwdCodeErr && <div className="v-err-box"><FiAlertCircle size={14}/><span>{pwdCodeErr}</span></div>}
            <div className="v-footer-row">
              <span className="v-sec-note"><FiShield size={10}/>SHA-256 · 5 min expiry</span>
              {pwdCooldown>0?<span className="v-cdw-txt">Resend in {pwdCooldown}s</span>:<button className="v-ghost" onClick={sendPwdOtp} disabled={pwdOtpSending}><FiRefreshCw size={12}/>Resend</button>}
            </div>
          </>)}
          {pwdVerified && (<>
            <div className="pwd-verified-banner"><FiCheck size={15} color="#10B981"/><span>Identity confirmed — set your new password</span></div>
            <div className="field-group"><label className="up-label">New Password</label><div className="up-input-row"><FiLock size={14} className="up-inp-icon"/><input className="up-input" type={showPwd?"text":"password"} value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="Min. 8 characters"/><button className="eye-btn" onClick={()=>setShowPwd(v=>!v)} type="button">{showPwd?<FiEyeOff size={14}/>:<FiEye size={14}/>}</button></div></div>
            <div className="field-group"><label className="up-label">Confirm New Password</label><div className="up-input-row"><FiLock size={14} className="up-inp-icon"/><input className="up-input" type="password" value={confPwd} onChange={e=>setConfPwd(e.target.value)} placeholder="Repeat new password"/></div></div>
            {newPwd&&confPwd&&newPwd!==confPwd&&<div className="v-err-box"><FiAlertCircle size={14}/><span>Passwords do not match</span></div>}
            <button className="save-btn" onClick={handlePwdChange} disabled={pwdSaving||!newPwd||!confPwd||newPwd!==confPwd||newPwd.length<8}>{pwdSaving?<><span className="mini-spin"/>Updating...</>:<><FiShield size={15}/> Update Password</>}</button>
          </>)}
        </div>
      ) : (
        <div className="google-security"><FiGlobe size={32} color="#FF6B00"/><div className="google-security-title">Google Account</div><p>Your account is secured by Google. Manage your password through Google account settings.</p><div className="verified-chip"><MdVerified size={14} color="#1877F2"/> Google Sign-in Active</div></div>
      )}
      <div className="tfa-card">
        <div className="tfa-left"><div className="tfa-icon"><FiSmartphone size={20} color="#FF6B00"/></div><div><div className="tfa-title">Two-Factor Authentication</div><div className="tfa-desc">Add an extra layer of security</div></div></div>
        <div className="tfa-right"><span className="coming-soon-badge">Coming Soon</span><button className="tfa-btn" disabled>Enable 2FA</button></div>
      </div>
      <div className="logins-card">
        <div className="logins-header"><FiClock size={14} color="#FF6B00"/> Recent Login Activity</div>
        {recentLogins.map((l,i)=>(
          <div className="login-row" key={i}><div className="login-dot" style={{background:l.current?"#10B981":"var(--text3)"}}/><div className="login-info"><div className="login-device">{l.device}{l.current&&<span className="current-badge">This device</span>}</div><div className="login-meta">{l.location} · {l.time}</div></div></div>
        ))}
      </div>
      <div className="tips-card">
        <div className="tips-header"><FiShield size={14} color="#FF6B00"/> Security Tips</div>
        {["Use a strong, unique password","Never share your login details","Enable 2FA for extra protection","Log out on shared devices","Contact support for suspicious activity"].map((tip,i)=>(
          <div className="tip-row" key={i}><div className="tip-dot"/><span>{tip}</span></div>
        ))}
      </div>
    </div>
  );

  const WalletTab = () => (
    <div className="tab-content"><WalletPage /></div>
  );

  const HistoryTab = () => (
    <div className="tab-content">
      {histLoading ? (
        <div className="tab-loading"><div className="mini-spin" style={{width:24,height:24,borderWidth:3,borderTopColor:"#FF6B00",borderColor:"rgba(255,107,0,.2)"}}/><span>Loading order history...</span></div>
      ) : (<>
        <div className="hist-filter-row">
          {(["all","delivered","pending","cancelled"] as const).map(f=>(
            <button key={f} className={`hist-filter-btn ${histFilter===f?"active":""}`} onClick={()=>setHistFilter(f)}>
              {f==="all"?"All":f==="pending"?"Active":f.charAt(0).toUpperCase()+f.slice(1)}
              {f==="all" && orders.length > 0 && <span className="hist-count">{orders.length}</span>}
            </button>
          ))}
        </div>

        {filtOrders.length===0 ? (
          <div className="addr-empty" style={{marginTop:8}}>
            <FiPackage size={28} color="var(--text3)"/>
            <span>{histFilter==="all"?"No orders yet":histFilter==="pending"?"No active orders":`No ${histFilter} orders`}</span>
          </div>
        ) : (
          <div className="order-list">
            {filtOrders.map(order => {
              const sc = STATUS_COLOR[order.status] || "#888";
              const totalItems = order.items.reduce((s,i)=>s+i.qty, 0);
              return (
                <div
                  className="order-card"
                  key={order.id}
                  onClick={()=>setSelOrder(order)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e=>{ if(e.key==="Enter"||e.key===" ") setSelOrder(order); }}
                >
                  {/* Top row: store + status */}
                  <div className="order-card-top">
                    <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                      <div style={{width:32,height:32,borderRadius:9,background:`${sc}15`,border:`1.5px solid ${sc}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>
                        {STATUS_ICON[order.status] ?? "📦"}
                      </div>
                      <div style={{minWidth:0}}>
                        <div className="order-store" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{order.vendorName || order.store}</div>
                        <div style={{fontSize:10,fontWeight:600,color:"var(--text3)",marginTop:1}}>
                          {totalItems} item{totalItems!==1?"s":""} · #{order.id.slice(-6).toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="order-status-pill" style={{background:`${sc}18`,color:sc,border:`1px solid ${sc}30`,flexShrink:0}}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </div>
                  </div>

                  {/* Items preview */}
                  <div className="order-items-preview">
                    {order.items.slice(0,3).map((it,i)=>(
                      <span key={i} className="order-item-chip">{it.qty}× {it.name}</span>
                    ))}
                    {order.items.length>3 && <span className="order-item-chip more">+{order.items.length-3} more</span>}
                  </div>

                  {/* Meta row: rider, address */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:2}}>
                    {order.riderName && (
                      <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#8b5cf6",background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.2)",borderRadius:6,padding:"2px 7px"}}>
                        <MdDeliveryDining size={10}/> {order.riderName}
                      </div>
                    )}
                    {order.deliveryAddress && (
                      <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:600,color:"var(--text3)",background:"var(--inp)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 7px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>
                        <FiMapPin size={9}/> {order.deliveryLabel || "Delivery"}
                      </div>
                    )}
                    {order.paymentMethod && (
                      <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:600,color:"var(--text3)",background:"var(--inp)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 7px",textTransform:"capitalize"}}>
                        💳 {order.paymentMethod}
                      </div>
                    )}
                  </div>

                  {/* Bottom: date + total + reorder */}
                  <div className="order-card-bottom">
                    <span className="order-date">
                      {order.createdAt?.toDate?.().toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})||"—"}
                    </span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span className="order-total">₦{order.total.toLocaleString()}</span>
                      <button
                        className="order-reorder-inline"
                        onClick={e => { e.stopPropagation(); handleReorder(order); }}
                      >
                        <FiShoppingCart size={10}/> Reorder
                      </button>
                    </div>
                  </div>
                  <div className="order-card-chevron"><FiChevronRight size={14}/></div>
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`up-root ${isDark?"dark":"light"}`}>
      <div className="up-orb1"/><div className="up-orb2"/>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t=>(
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type==="success"?<FiCheck size={14}/>:t.type==="error"?<FiAlertCircle size={14}/>:<FiInfo size={14}/>}
            {t.message}
          </div>
        ))}
      </div>

      {/* Address modal */}
      {addrModal.open && (
        <MapPinSelector
          onClose={()=>setAddrModal({open:false})}
          showAddressFields label={addrModal.editing?.label??"Home"}
          initialLat={addrModal.editing?.lat} initialLng={addrModal.editing?.lng}
          onConfirm={(lat,lng,address,extra)=>{
            if (!isInLagos(lat,lng)) { addToast("Delivery only available within Lagos. Pick a Lagos address.","error"); return; }
            saveAddress({ id:addrModal.editing?.id??Date.now().toString(), label:extra.label??"Home", address, landmark:extra.landmark, extraClue:extra.extraClue, phone:extra.phone, isDefault:addrModal.editing?.isDefault??false, lat, lng });
            setAddrModal({open:false});
          }}
        />
      )}
      {deleteModal && <DeleteModal onClose={()=>setDeleteModal(false)} onConfirm={()=>{ addToast("Account deletion requested. Check your email.","info"); setDeleteModal(false); }}/>}
      {phoneModal  && <PhoneEditModal currentPhone={editData.phone} userEmail={userData.email} onSave={handlePhoneSave} onClose={()=>setPhoneModal(false)} fns={fns} addToast={addToast}/>}
      {selOrder    && <OrderModal order={selOrder} onClose={()=>setSelOrder(null)} onReorder={handleReorder}/>}

      {/* MOBILE */}
      <div className="up-mobile">
        <div className="up-header">
          <div className="avatar-wrap">
            <div className="avatar">
              {displayPhoto ? <img src={displayPhoto} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/> : <span className="avatar-initials">{initials}</span>}
              {uploading && <div className="avatar-upload-overlay"><span className="mini-spin"/></div>}
            </div>
            <button className="avatar-edit-btn" onClick={()=>avatarRef.current?.click()}><FiCamera size={12}/></button>
            <input ref={avatarRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setAvatarPreview(ev.target?.result as string);r.readAsDataURL(f);}}/>
          </div>
          <h2 className="up-display-name">{editData.fullName||user?.displayName||"Your Name"}</h2>
          <p className="up-display-email">{editData.email||user?.email}</p>
          <div className="verify-chips">
            <div className={`verify-chip ${userData.emailVerified?"verified":"unverified"}`}>{userData.emailVerified?<FiCheck size={11}/>:<FiAlertCircle size={11}/>} Email {userData.emailVerified?"verified":"unverified"}</div>
            <div className={`verify-chip ${userData.phoneVerified?"verified":"unverified"}`}>{userData.phoneVerified?<FiCheck size={11}/>:<FiAlertCircle size={11}/>} Phone {userData.phoneVerified?"verified":"unverified"}</div>
          </div>
        </div>
        <div className="up-tabs">
          {TABS.map(t=>(
            <button key={t.id} className={`up-tab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              <t.Icon size={13}/>{t.label}
            </button>
          ))}
        </div>
        {tab==="profile"  && <ProfileTab/>}
        {tab==="settings" && <SettingsTab/>}
        {tab==="security" && <SecurityTab/>}
        {tab==="wallet"   && <WalletTab/>}
        {tab==="history"  && <HistoryTab/>}
      </div>

      {/* DESKTOP */}
      <div className="up-desktop">
        <aside className="up-sidebar">
          <div className="sidebar-avatar-section">
            <div className="sidebar-avatar">
              {displayPhoto ? <img src={displayPhoto} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/> : <span className="avatar-initials lg">{initials}</span>}
              {uploading && <div className="avatar-upload-overlay"><span className="mini-spin"/></div>}
              <button className="avatar-edit-btn sidebar" onClick={()=>avatarRef.current?.click()}><FiCamera size={12}/></button>
              <input ref={avatarRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setAvatarPreview(ev.target?.result as string);r.readAsDataURL(f);}}/>
            </div>
            <div className="sidebar-name">{editData.fullName||user?.displayName||"Your Name"}</div>
            <div className="sidebar-email">{editData.email||user?.email}</div>
            <div className="verify-chips">
              <div className={`verify-chip ${userData.emailVerified?"verified":"unverified"}`}>{userData.emailVerified?<FiCheck size={11}/>:<FiAlertCircle size={11}/>} Email {userData.emailVerified?"verified":"unverified"}</div>
              <div className={`verify-chip ${userData.phoneVerified?"verified":"unverified"}`}>{userData.phoneVerified?<FiCheck size={11}/>:<FiAlertCircle size={11}/>} Phone {userData.phoneVerified?"verified":"unverified"}</div>
            </div>
            {avatarPreview && <div className="photo-banner sm"><FiCamera size={10}/> New photo — save to apply</div>}
          </div>
          <div className="sidebar-stats">
                  {[
  {
    Icon: FiPackage,
    val: orderCount === null ? "…" : String(orderCount),
    label: "Orders"
  },
  {
    Icon: RiWalletLine,
    val: sidebarWallet === null ? "…" : `₦${sidebarWallet.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`,
    label: "Wallet"
  },
].map((s,i)=>(
  <div className="sidebar-stat" key={i}>
    <s.Icon size={16} color="#FF6B00"/>
    <span className="sidebar-stat-val">{s.val}</span>
    <span className="sidebar-stat-lbl">{s.label}</span>
  </div>
))}
          </div>
          <nav className="sidebar-nav">
            {TABS.map(t=>(
              <button key={t.id} className={`sidebar-nav-item ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
                <t.Icon size={17}/><span>{t.label}</span>
                {tab===t.id && <FiChevronRight size={14} style={{marginLeft:"auto"}}/>}
              </button>
            ))}
          </nav>
          <button className="sidebar-logout" onClick={handleLogout}><FiLogOut size={16}/> Sign Out</button>
        </aside>

        <main className="up-main-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">{tab==="profile"?"My Profile":tab==="settings"?"Preferences":tab==="security"?"Security":tab==="wallet"?"My Wallet":"Order History"}</div>
              <div className="panel-sub">{tab==="profile"?"Manage your personal information & addresses":tab==="settings"?"Customise your Swiftnija experience":tab==="security"?"Manage your account security":tab==="wallet"?"Your balance and transactions":"Track and review your past orders"}</div>
            </div>
            {tab==="profile" && (
              <button className="save-btn inline" onClick={handleSave} disabled={saving||uploading}>
                {saving||uploading?<><span className="mini-spin"/>{uploading?"Uploading...":"Saving..."}</>:<><FiSave size={14}/> Save Changes</>}
              </button>
            )}
          </div>

          <div className="panel-body">
            {tab==="profile" && (<>
              {profileLoading && (
                <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--text3)",fontSize:12,fontWeight:600}}>
                  <span className="mini-spin" style={{borderTopColor:"#FF6B00",borderColor:"rgba(255,107,0,.2)"}}/>
                  Loading profile details…
                </div>
              )}
              {avatarPreview && <div className="photo-save-banner"><FiCamera size={13}/><span>New photo selected — click <strong>Save Changes</strong> to apply</span></div>}
              <div className="desktop-two-col">
                <div className="field-group"><label className="up-label">Full Name</label><div className="up-input-row"><FiUser size={14} className="up-inp-icon"/><input className="up-input" value={editData.fullName} onChange={e=>setEditData(p=>({...p,fullName:e.target.value}))} placeholder="Your full name"/></div></div>
                <div className="field-group"><label className="up-label">Phone Number</label><div className="up-input-row"><FiPhone size={14} className="up-inp-icon"/><input className="up-input" value={editData.phone} readOnly placeholder="+234 800 000 0000" style={{cursor:"default"}}/>{userData.phoneVerified&&<span className="verified-tick"><FiCheck size={12}/></span>}<button className="field-edit-btn" style={{opacity:1}} onClick={()=>setPhoneModal(true)}><FiEdit3 size={13}/></button></div></div>
                <div className="field-group"><label className="up-label">Email Address</label><div className="up-input-row" style={{opacity:.7}}><FiMail size={14} className="up-inp-icon"/><input className="up-input" value={editData.email} readOnly disabled style={{cursor:"default"}}/>{userData.emailVerified&&<span className="verified-tick"><FiCheck size={12}/></span>}<span className="field-locked-badge">🔒</span></div><span className="field-hint">Email cannot be changed here</span></div>
                <div className="field-group"><label className="up-label">Sign-in Method</label><CustomSelect value={editData.provider} onChange={v=>setEditData(p=>({...p,provider:v}))} options={PROV_OPTS} icon={FiGlobe}/><span className="field-hint">Requires re-authentication to change</span></div>
              </div>
              <div className="field-group"><label className="up-label">Bio</label><textarea className="up-textarea" value={editData.bio} onChange={e=>setEditData(p=>({...p,bio:e.target.value}))} placeholder="A short note about yourself..." rows={3}/></div>
              <div className="addresses-section">
                <div className="addresses-header"><div className="section-eyebrow"><FiMapPin size={13}/>Saved Addresses</div><button className="add-addr-btn" onClick={()=>setAddrModal({open:true})}><FiPlus size={13}/> Add Address</button></div>
                {editData.savedAddresses.length===0 ? (
                  <div className="addr-empty"><FiMapPin size={28} color="var(--text3)"/><span>No saved addresses yet</span><button className="addr-empty-btn" onClick={()=>setAddrModal({open:true})}><FiPlus size={12}/> Add Your First Address</button></div>
                ) : (
                  <div className="addr-list desktop">
                    {editData.savedAddresses.map(addr=>(
                      <div className={`addr-card ${addr.isDefault?"addr-default":""}`} key={addr.id}>
                        <div className="addr-icon">{addr.label==="Home"?<FiHome size={16}/>:addr.label==="Work"?<FiBriefcase size={16}/>:<FiMapPin size={16}/>}</div>
                        <div className="addr-body"><div className="addr-label-row"><span className="addr-label">{addr.label}</span>{addr.isDefault&&<span className="addr-default-badge">Default</span>}</div><div className="addr-text">{addr.address}</div>{addr.landmark&&<div className="addr-phone">📍 {addr.landmark}</div>}{addr.extraClue&&<div className="addr-phone">💡 {addr.extraClue}</div>}{addr.phone&&<div className="addr-phone">📞 {addr.phone}</div>}</div>
                        <div className="addr-actions">{!addr.isDefault&&<button className="addr-action-btn" onClick={()=>setDefaultAddress(addr.id)}><FiCheck size={13}/></button>}<button className="addr-action-btn" onClick={()=>setAddrModal({open:true,editing:addr})}><FiEdit3 size={13}/></button><button className="addr-action-btn red" onClick={()=>deleteAddress(addr.id)}><FiTrash2 size={13}/></button></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}
            {tab==="settings" && <SettingsTab/>}
            {tab==="security" && <SecurityTab/>}
            {tab==="wallet"   && <WalletPage/>}
            {tab==="history"  && <HistoryTab/>}
          </div>
        </main>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800;900&display=swap');
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}

  .up-root.dark  { --bg:#0a0a0d;--surface:#111115;--card:#16161b;--border:#1e1e26;--text:#e8e8f0;--text2:#8888a0;--text3:#44445a;--inp:#1a1a22;--inpbd:#252530;--accent:#FF6B00 }
  .up-root.light { --bg:#f0f0f5;--surface:#ffffff;--card:#ffffff;--border:#e0e0ea;--text:#111118;--text2:#55556a;--text3:#aaaabc;--inp:#f4f4fb;--inpbd:#d5d5e5;--accent:#FF6B00 }

  .up-root { min-height:100vh;background:var(--bg);font-family:'Nunito',sans-serif;color:var(--text);display:flex;align-items:flex-start;justify-content:flex-start;position:relative;overflow-x:hidden;transition:background .3s,color .3s }
  .up-orb1,.up-orb2 { position:fixed;border-radius:50%;filter:blur(90px);pointer-events:none;z-index:0 }
  .up-orb1 { width:500px;height:500px;background:radial-gradient(circle,rgba(255,107,0,.12) 0%,transparent 70%);top:-200px;left:-200px;animation:orb-drift 20s ease-in-out infinite alternate }
  .up-orb2 { width:400px;height:400px;background:radial-gradient(circle,rgba(255,107,0,.07) 0%,transparent 70%);bottom:-150px;right:-150px;animation:orb-drift 25s ease-in-out infinite alternate-reverse }
  @keyframes orb-drift { 0%{transform:translate(0,0)}100%{transform:translate(40px,40px)} }
  @keyframes spin { to{transform:rotate(360deg)} }

  .verify-chips { display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:6px }
  .verify-chip { display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid }
  .verify-chip.verified   { background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3);color:#10B981 }
  .verify-chip.unverified { background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.25);color:#f59e0b }

  .toast-container { position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none }
  .toast { display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:14px;font-size:13px;font-weight:700;font-family:'Nunito',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.3);animation:toast-in .35s cubic-bezier(.34,1.56,.64,1) both;backdrop-filter:blur(12px);pointer-events:all }
  .toast-success { background:rgba(16,185,129,.9);color:white }
  .toast-error   { background:rgba(239,68,68,.9);color:white }
  .toast-info    { background:rgba(59,130,246,.9);color:white }
  @keyframes toast-in { from{opacity:0;transform:translateX(40px) scale(.9)}to{opacity:1;transform:none} }

  .modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fade-in .2s ease }
  @keyframes fade-in { from{opacity:0}to{opacity:1} }
  .modal-card { background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:24px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:16px;animation:modal-in .3s cubic-bezier(.34,1.56,.64,1);max-height:90vh;overflow-y:auto;scrollbar-width:none }
  .modal-card::-webkit-scrollbar{display:none}
  .order-modal { max-width:460px }
  @keyframes modal-in { from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:none} }
  .modal-header { display:flex;align-items:center;gap:10px;font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--text);padding-bottom:12px;border-bottom:1px solid var(--border) }
  .modal-header span { flex:1 }
  .modal-header.delete { color:#ef4444 }
  .modal-close { background:transparent;border:none;color:var(--text3);cursor:pointer;display:flex;align-items:center;padding:4px;border-radius:8px;transition:color .2s,background .2s }
  .modal-close:hover { color:var(--text);background:var(--inp) }

  /* Order modal details */
  .order-modal-meta { display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap }
  .order-modal-date { font-size:11px;color:var(--text3);font-weight:600 }
  .order-detail-row { display:flex;align-items:flex-start;gap:10px;padding:10px 13px;background:var(--inp);border:1px solid var(--border);border-radius:13px }
  .order-detail-icon { width:28px;height:28px;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px }
  .order-detail-label { font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px }
  .order-detail-value { font-size:13px;font-weight:700;color:var(--text) }
  .order-detail-sub { font-size:11px;font-weight:600;color:var(--text3);margin-top:2px }
  .order-detail-link { margin-left:auto;display:flex;align-items:center;gap:3px;font-size:11px;font-weight:700;color:#FF6B00;background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.2);border-radius:8px;padding:4px 8px;cursor:pointer;flex-shrink:0;transition:background .15s }
  .order-detail-link:hover { background:rgba(255,107,0,.15) }
  .order-item-row { display:flex;align-items:center;gap:10px;padding:10px 14px }
  .order-track-btn { flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border-radius:12px;background:rgba(255,107,0,.08);border:1.5px solid rgba(255,107,0,.2);color:#FF6B00;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s }
  .order-track-btn:hover { background:rgba(255,107,0,.15) }
  .reorder-btn { flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border-radius:12px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border:none;color:white;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(255,107,0,.35);transition:all .2s }
  .reorder-btn:hover { transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,107,0,.45) }

  /* Inline reorder on card */
  .order-reorder-inline { display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:linear-gradient(135deg,#FF6B00,#FF8C00);border:none;color:white;font-family:'Nunito',sans-serif;font-size:10px;font-weight:800;cursor:pointer;transition:transform .15s,box-shadow .15s;white-space:nowrap }
  .order-reorder-inline:hover { transform:scale(1.04);box-shadow:0 3px 10px rgba(255,107,0,.4) }

  .label-pills { display:flex;gap:8px }
  .label-pill { display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:10px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s }
  .label-pill.active { background:rgba(255,107,0,.12);border-color:rgba(255,107,0,.4);color:#FF6B00 }
  .default-check { display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:700;color:var(--text2) }
  .default-check input { accent-color:#FF6B00;width:16px;height:16px;cursor:pointer }
  .up-label-opt { font-size:9.5px;font-weight:600;color:var(--text3);text-transform:none;letter-spacing:0 }

  .otp-row { display:flex;gap:6px;width:100%;justify-content:center;padding:0 2px }
  .otp-box { flex:1;min-width:0;max-width:52px;height:54px;border-radius:13px;background:var(--inp);border:1.5px solid var(--inpbd);text-align:center;font-family:'Syne',sans-serif;font-size:20px;font-weight:900;color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s,transform .15s;caret-color:#FF6B00 }
  .otp-box:focus { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.1);transform:translateY(-2px) }
  .otp-box:not(:placeholder-shown) { border-color:rgba(255,107,0,.35);color:#FF6B00 }
  .otp-box.error { border-color:rgba(239,68,68,.45)!important;animation:shake .4s both }
  @keyframes shake { 10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-2px)}40%,60%{transform:translateX(2px)} }
  .otp-method-label { font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.7px }
  .otp-method-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px }
  .otp-method-card { display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 10px;border-radius:14px;background:var(--inp);border:1.5px solid var(--inpbd);text-align:center }
  .otp-method-card.active   { background:rgba(255,107,0,.08);border-color:rgba(255,107,0,.4) }
  .otp-method-card.disabled { opacity:.45;cursor:not-allowed;filter:grayscale(.5) }
  .otp-method-name { font-size:12px;font-weight:800;color:var(--text) }
  .otp-method-sub  { font-size:10px;font-weight:600;color:var(--text3) }
  .otp-method-soon { font-size:10px;font-weight:700;color:#8b5cf6;background:rgba(139,92,246,.1);border-radius:6px;padding:1px 6px }
  .v-info-box { display:flex;gap:12px;align-items:flex-start;width:100%;background:rgba(255,107,0,.04);border:1px solid rgba(255,107,0,.1);border-radius:14px;padding:13px 15px }
  .v-info-title { font-size:13px;font-weight:800;color:var(--text);margin-bottom:3px }
  .v-info-desc  { font-size:12px;font-weight:600;color:var(--text3);line-height:1.5 }
  .v-otp-label { display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;align-self:flex-start }
  .v-err-box { display:flex;align-items:center;gap:8px;width:100%;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:12px;padding:10px 14px;color:#ef4444;font-size:12px;font-weight:700 }
  .v-footer-row { display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;flex-wrap:wrap }
  .v-sec-note { display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:var(--text3) }
  .v-cdw-txt  { font-size:12px;font-weight:700;color:var(--text3) }
  .v-ghost { display:flex;align-items:center;gap:6px;background:transparent;border:1.5px solid var(--border);border-radius:10px;padding:7px 13px;color:var(--text3);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s }
  .v-ghost:hover:not(:disabled) { border-color:#FF6B00;color:#FF6B00 }
  .v-ghost:disabled { opacity:.5;cursor:not-allowed }
  .pwd-verified-banner { display:flex;align-items:center;gap:9px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:12px;padding:11px 14px;color:#10B981;font-size:13px;font-weight:700 }
  .field-edit-btn { background:transparent;border:none;color:var(--text3);cursor:pointer;display:flex;align-items:center;padding:4px;border-radius:7px;transition:all .2s;flex-shrink:0 }
  .field-edit-btn:hover { color:#FF6B00;background:rgba(255,107,0,.1) }
  .verified-tick { display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:white;flex-shrink:0 }
  .field-hint { font-size:11px;color:var(--text3);font-weight:600;margin-top:3px }
  .field-locked-badge { font-size:12px;font-weight:800;padding:2px 8px;border-radius:20px;background:rgba(100,100,120,.1);color:var(--text3);border:1px solid var(--border);flex-shrink:0 }
  .photo-save-banner { display:flex;align-items:center;gap:8px;background:rgba(255,107,0,.1);border:1.5px solid rgba(255,107,0,.3);border-radius:12px;padding:10px 14px;color:#FF6B00;font-size:12px;font-weight:700 }
  .inline-link-btn { background:none;border:none;color:#FF6B00;font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;text-decoration:underline;padding:0 3px }

  .delete-modal { max-width:380px }
  .delete-warning { display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:16px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:14px }
  .delete-warning p { color:var(--text2);font-size:13px;font-weight:600;line-height:1.6 }
  .danger-confirm-btn { background:linear-gradient(135deg,#dc2626,#ef4444);color:white;border:none;border-radius:13px;padding:13px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;width:100%;transition:opacity .2s }
  .danger-confirm-btn:disabled { opacity:.4;cursor:not-allowed }

  .csel-wrap { position:relative;width:100% }
  .csel-trigger { width:100%;display:flex;align-items:center;gap:9px;background:var(--inp);border:1.5px solid var(--inpbd);border-radius:12px;padding:10px 12px;color:var(--text);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s }
  .csel-trigger:hover,.csel-trigger.open { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.1) }
  .csel-icon  { color:var(--text3);flex-shrink:0 }
  .csel-value { flex:1 }
  .csel-arrow { color:var(--text3);flex-shrink:0;transition:transform .2s }
  .csel-arrow.flipped { transform:rotate(180deg) }
  .csel-dropdown { position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;overflow:hidden;z-index:200;box-shadow:0 12px 40px rgba(0,0,0,.25) }
  .csel-opt { width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:transparent;border:none;color:var(--text2);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;cursor:pointer;text-align:left;transition:background .15s,color .15s }
  .csel-opt:hover  { background:rgba(255,107,0,.06);color:var(--text) }
  .csel-opt.active { background:rgba(255,107,0,.1);color:#FF6B00;font-weight:800 }
  .csel-opt+.csel-opt { border-top:1px solid var(--border) }

  .toggle-sw { width:52px;height:30px;border-radius:15px;background:var(--border);position:relative;cursor:pointer;border:none;transition:background .25s;flex-shrink:0 }
  .toggle-sw.on { background:#FF6B00 }
  .toggle-knob { position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;background:white;transition:left .25s;box-shadow:0 1px 4px rgba(0,0,0,.3) }
  .toggle-sw.on .toggle-knob { left:26px }

  .sticky-save-bar { position:sticky;bottom:0;left:0;right:0;display:flex;gap:8px;align-items:center;background:linear-gradient(to top,var(--bg) 70%,transparent);padding:10px 14px 12px;margin-top:8px;z-index:10 }
  .sticky-save-bar .save-btn { flex:1 }
  .logout-btn-sm { width:46px;height:46px;border-radius:13px;background:transparent;border:1.5px solid rgba(239,68,68,.25);color:#ef4444;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .2s }
  .logout-btn-sm:hover { background:rgba(239,68,68,.08) }

  .tab-content { padding:10px 14px 20px;display:flex;flex-direction:column;gap:14px }
  .tab-section  { display:flex;flex-direction:column;gap:12px }
  .section-eyebrow { display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px }
  .tab-loading { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 20px;color:var(--text3);font-size:13px;font-weight:700 }

  .field-group { display:flex;flex-direction:column;gap:6px }
  .up-label { font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.7px }
  .up-input-row { display:flex;align-items:center;gap:9px;background:var(--inp);border:1.5px solid var(--inpbd);border-radius:12px;padding:10px 12px;transition:border-color .2s,box-shadow .2s }
  .up-input-row:focus-within { border-color:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.1) }
  .up-inp-icon { color:var(--text3);flex-shrink:0 }
  .up-input-row:focus-within .up-inp-icon { color:#FF6B00 }
  .up-input { flex:1;background:transparent;border:none;outline:none;color:var(--text);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;min-width:0 }
  .up-input::placeholder { color:var(--text3) }
  .up-textarea { width:100%;background:var(--inp);border:1.5px solid var(--inpbd);border-radius:12px;padding:10px 12px;color:var(--text);font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;outline:none;resize:vertical;transition:border-color .2s }
  .up-textarea:focus { border-color:#FF6B00 }
  .up-textarea::placeholder { color:var(--text3) }
  .eye-btn { background:transparent;border:none;color:var(--text3);cursor:pointer;display:flex;align-items:center;padding:0;transition:color .2s }
  .eye-btn:hover { color:#FF6B00 }

  .save-btn { display:flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#FF6B00,#FF8C00);color:white;border:none;border-radius:13px;padding:13px 20px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 20px rgba(255,107,0,.4);transition:transform .2s,box-shadow .2s,opacity .2s;width:100% }
  .save-btn:hover:not(:disabled) { transform:translateY(-2px);box-shadow:0 10px 28px rgba(255,107,0,.5) }
  .save-btn:disabled { opacity:.65;cursor:not-allowed }
  .save-btn.inline { width:auto;padding:10px 24px;font-size:13px }
  .mini-spin { width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;display:inline-block }

  .addresses-section { display:flex;flex-direction:column;gap:12px }
  .addresses-header { display:flex;align-items:center;justify-content:space-between }
  .add-addr-btn { display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:10px;background:rgba(255,107,0,.1);border:1.5px solid rgba(255,107,0,.3);color:#FF6B00;font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s }
  .add-addr-btn:hover { background:rgba(255,107,0,.2) }
  .addr-empty { display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 16px;background:var(--inp);border:1.5px dashed var(--inpbd);border-radius:16px;color:var(--text3) }
  .addr-empty span { font-size:13px;font-weight:700 }
  .addr-empty-btn { display:flex;align-items:center;gap:5px;padding:8px 16px;border-radius:10px;background:rgba(255,107,0,.1);border:1.5px solid rgba(255,107,0,.3);color:#FF6B00;font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;cursor:pointer;margin-top:4px }
  .addr-list { display:flex;flex-direction:column;gap:8px }
  .addr-list.desktop { display:grid;grid-template-columns:1fr 1fr;gap:10px }
  .addr-card { display:flex;align-items:flex-start;gap:12px;background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:13px 14px;transition:border-color .2s }
  .addr-card.addr-default { border-color:rgba(255,107,0,.35);background:rgba(255,107,0,.03) }
  .addr-icon { width:38px;height:38px;border-radius:11px;background:rgba(255,107,0,.1);display:flex;align-items:center;justify-content:center;color:#FF6B00;flex-shrink:0;margin-top:2px }
  .addr-body { flex:1;min-width:0 }
  .addr-label-row { display:flex;align-items:center;gap:7px;margin-bottom:3px }
  .addr-label { font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.4px }
  .addr-default-badge { font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;background:rgba(255,107,0,.15);color:#FF6B00;border:1px solid rgba(255,107,0,.3) }
  .addr-text { font-size:12.5px;color:var(--text2);font-weight:600;line-height:1.4;word-break:break-word }
  .addr-phone { font-size:11px;color:var(--text3);font-weight:600;margin-top:3px }
  .addr-actions { display:flex;gap:4px;flex-shrink:0;flex-direction:column }
  .addr-action-btn { width:30px;height:30px;border-radius:9px;background:var(--inp);border:1px solid var(--border);color:var(--text3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s }
  .addr-action-btn:hover { background:rgba(255,107,0,.1);border-color:rgba(255,107,0,.3);color:#FF6B00 }
  .addr-action-btn.red:hover { background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);color:#ef4444 }

  .selectors-row { display:flex;gap:12px }
  .settings-section-label { display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.6px;margin-top:4px;margin-bottom:8px }
  .settings-cards { display:flex;flex-direction:column;gap:8px }
  .settings-card { display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--card);border:1.5px solid var(--border);border-radius:16px;padding:14px 16px;transition:border-color .2s,background .2s }
  .settings-card.card-on { border-color:rgba(255,107,0,.3);background:rgba(255,107,0,.03) }
  .settings-card-left { display:flex;align-items:center;gap:12px;flex:1 }
  .settings-card-icon { width:38px;height:38px;border-radius:11px;background:var(--inp);display:flex;align-items:center;justify-content:center;color:var(--text3);flex-shrink:0;transition:background .2s,color .2s;font-size:20px }
  .settings-card-icon.icon-on { background:rgba(255,107,0,.15);color:#FF6B00 }
  .settings-card-label { font-size:13px;font-weight:700;color:var(--text) }
  .settings-card-desc  { font-size:11px;color:var(--text3);margin-top:2px }
  .info-grid { display:grid;grid-template-columns:1fr 1fr;gap:10px }
  .info-card { background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:16px 14px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;transition:border-color .2s,transform .2s }
  .info-card:hover { border-color:rgba(255,107,0,.3);transform:translateY(-2px) }
  .info-card-icon { color:#FF6B00;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:rgba(255,107,0,.1) }
  .info-card-value { font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:var(--text) }
  .info-card-label { font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.4px }
  .danger-card { background:rgba(239,68,68,.05);border:1.5px solid rgba(239,68,68,.15);border-radius:16px;padding:16px }
  .danger-header { display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#ef4444;margin-bottom:8px }
  .danger-desc { color:var(--text3);font-size:12px;font-weight:600;line-height:1.5;margin-bottom:12px }
  .danger-btn { background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);border-radius:10px;color:#ef4444;padding:8px 18px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:background .2s }
  .danger-btn:hover { background:rgba(239,68,68,.2) }

  .security-card { background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px }
  .security-card-header { display:flex;align-items:center;gap:10px;font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--text);padding-bottom:10px;border-bottom:1px solid var(--border) }
  .google-security { background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px 20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center }
  .google-security-title { font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--text) }
  .google-security p { color:var(--text3);font-size:13px;font-weight:600;line-height:1.6;max-width:280px }
  .verified-chip { display:flex;align-items:center;gap:6px;background:rgba(24,119,242,.1);border:1px solid rgba(24,119,242,.25);border-radius:20px;padding:6px 14px;color:#1877F2;font-size:12px;font-weight:700 }
  .tfa-card { display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--card);border:1.5px solid var(--border);border-radius:16px;padding:16px }
  .tfa-left { display:flex;align-items:center;gap:12px }
  .tfa-icon { width:40px;height:40px;border-radius:11px;background:rgba(255,107,0,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0 }
  .tfa-title { font-size:13.5px;font-weight:800;color:var(--text) }
  .tfa-desc  { font-size:11px;color:var(--text3);font-weight:600;margin-top:2px }
  .tfa-right { display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0 }
  .coming-soon-badge { font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;background:rgba(139,92,246,.12);color:#8b5cf6;border:1px solid rgba(139,92,246,.25) }
  .tfa-btn { padding:7px 14px;border-radius:10px;background:var(--inp);border:1.5px solid var(--inpbd);color:var(--text3);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:not-allowed;opacity:.5 }
  .logins-card { background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden }
  .logins-header { display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:var(--text);padding:12px 16px;border-bottom:1px solid var(--border) }
  .login-row { display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border) }
  .login-row:last-child { border-bottom:none }
  .login-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0 }
  .login-info { flex:1 }
  .login-device { font-size:12.5px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:7px }
  .login-meta   { font-size:11px;color:var(--text3);font-weight:600;margin-top:2px }
  .current-badge { font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(16,185,129,.12);color:#10B981;border:1px solid rgba(16,185,129,.25);font-weight:800 }
  .tips-card { background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden }
  .tips-header { display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:var(--text);padding:12px 16px;border-bottom:1px solid var(--border) }
  .tip-row { display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text2);font-weight:600 }
  .tip-row:last-child { border-bottom:none }
  .tip-dot { width:6px;height:6px;border-radius:50%;background:#FF6B00;flex-shrink:0;margin-top:5px }

  .theme-hero { border-radius:20px;padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:14px;transition:all .4s;border:1.5px solid transparent }
  .theme-hero.theme-dark  { background:linear-gradient(135deg,rgba(30,30,50,.95),rgba(20,20,35,.9));border-color:rgba(255,107,0,.3) }
  .theme-hero.theme-light { background:linear-gradient(135deg,rgba(255,200,100,.2),rgba(255,255,255,.8));border-color:rgba(255,150,0,.3) }
  .theme-hero-left { display:flex;align-items:center;gap:16px }
  .theme-hero-orb { width:52px;height:52px;border-radius:16px;background:rgba(255,107,0,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0 }
  .theme-dark .theme-hero-orb { background:rgba(255,255,255,.08) }
  .theme-hero-title { font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text) }
  .theme-hero-sub { color:var(--text3);font-size:12px;font-weight:600;margin-top:3px }
  .theme-icon-row { display:flex;align-items:center;gap:10px }

  /* History */
  .hist-filter-row { display:flex;gap:6px;flex-wrap:wrap }
  .hist-filter-btn { display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-family:'Nunito',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s }
  .hist-filter-btn.active { background:rgba(255,107,0,.1);border-color:rgba(255,107,0,.4);color:#FF6B00 }
  .hist-count { background:rgba(255,107,0,.15);color:#FF6B00;border-radius:20px;padding:0 6px;font-size:10px;font-weight:800 }
  .order-list { display:flex;flex-direction:column;gap:10px }
  .order-card { width:100%;background:var(--card);border:1.5px solid var(--border);border-radius:18px;padding:14px 16px;cursor:pointer;text-align:left;transition:border-color .2s,transform .2s;position:relative;display:flex;flex-direction:column;gap:9px }
  .order-card:hover { border-color:rgba(255,107,0,.3);transform:translateY(-1px) }
  .order-card-top { display:flex;align-items:center;justify-content:space-between;gap:8px }
  .order-store { font-size:13.5px;font-weight:800;color:var(--text) }
  .order-status-pill { font-size:10.5px;font-weight:800;padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:4px }
  .order-items-preview { display:flex;flex-wrap:wrap;gap:5px }
  .order-item-chip { font-size:11.5px;font-weight:600;color:var(--text2);background:var(--inp);border:1px solid var(--border);border-radius:8px;padding:3px 9px }
  .order-item-chip.more { color:var(--text3) }
  .order-card-bottom { display:flex;align-items:center;justify-content:space-between }
  .order-date  { font-size:11px;color:var(--text3);font-weight:600 }
  .order-total { font-family:'Syne',sans-serif;font-size:15px;font-weight:900;color:var(--text) }
  .order-card-chevron { position:absolute;right:16px;top:18px;color:var(--text3) }

  /* MOBILE */
  .up-mobile { display:flex;flex-direction:column;width:100%;min-height:100vh;background:var(--bg);z-index:10;position:relative }
  .up-mobile .up-header { padding:32px 20px 0;display:flex;flex-direction:column;align-items:center;gap:8px }
  .up-mobile .up-tabs { display:flex;gap:6px;padding:14px 14px 6px;overflow-x:auto;scrollbar-width:none }
  .up-mobile .up-tabs::-webkit-scrollbar { display:none }
  .up-desktop { display:none }

  .up-display-name  { font-family:'Syne',sans-serif;font-size:18px;font-weight:900;color:var(--text);letter-spacing:-.3px }
  .up-display-email { color:var(--text3);font-size:12px;font-weight:600 }
  .photo-banner { display:flex;align-items:center;gap:6px;background:rgba(255,107,0,.12);border:1px solid rgba(255,107,0,.3);border-radius:20px;padding:5px 12px;color:#FF6B00;font-size:11px;font-weight:700 }
  .photo-banner.sm { font-size:10px;padding:4px 10px }
  .up-tab { flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:5px;padding:8px 12px;border-radius:12px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap }
  .up-tab.active { background:rgba(255,107,0,.12);border-color:rgba(255,107,0,.4);color:#FF6B00 }
  .up-tab:hover:not(.active) { border-color:var(--text3);color:var(--text) }

  .avatar-wrap { position:relative }
  .avatar { width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#FF8C00);display:flex;align-items:center;justify-content:center;border:3px solid var(--surface);box-shadow:0 8px 24px rgba(255,107,0,.4);overflow:hidden;position:relative }
  .avatar-initials { font-family:'Syne',sans-serif;font-size:24px;font-weight:900;color:white }
  .avatar-initials.lg { font-size:30px }
  .avatar-edit-btn { position:absolute;bottom:2px;right:2px;width:26px;height:26px;border-radius:50%;background:#FF6B00;border:2px solid var(--surface);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s }
  .avatar-edit-btn:hover { transform:scale(1.1) }
  .avatar-edit-btn.sidebar { width:28px;height:28px;bottom:3px;right:3px }
  .avatar-upload-overlay { position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center }

  /* DESKTOP */
  @media (min-width:768px) {
    .up-mobile  { display:none }
    .up-root    { padding-top:0 }
    .up-desktop { display:flex;width:100%;min-height:100vh;max-width:1200px;margin:0 auto;padding:40px 40px 80px;gap:28px;position:relative;z-index:10 }
    .up-sidebar { width:272px;flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:28px 20px;display:flex;flex-direction:column;gap:20px;height:fit-content;position:sticky;top:108px }
    .sidebar-avatar-section { display:flex;flex-direction:column;align-items:center;gap:10px;padding-bottom:20px;border-bottom:1px solid var(--border) }
    .sidebar-avatar { width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#FF6B00,#FF8C00);display:flex;align-items:center;justify-content:center;border:3px solid var(--surface);box-shadow:0 8px 28px rgba(255,107,0,.4);overflow:hidden;position:relative }
    .sidebar-name  { font-family:'Syne',sans-serif;font-size:17px;font-weight:900;color:var(--text);text-align:center;letter-spacing:-.3px }
    .sidebar-email { color:var(--text3);font-size:12px;font-weight:600;text-align:center }
     .sidebar-stats { display:grid;grid-template-columns:1fr 1fr;gap:8px }
    .sidebar-stat  { display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,107,0,.06);border:1px solid rgba(255,107,0,.12);border-radius:12px;padding:10px 6px }
    .sidebar-stat-lbl { font-size:10px;font-weight:700;color:var(--text3) }
      .sidebar-stat-val { font-family:'Syne',sans-serif;font-size:9px;font-weight:900;color:var(--text);word-break:break-all;text-align:center;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100% }
    .sidebar-nav { display:flex;flex-direction:column;gap:4px }
    .sidebar-nav-item { display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;background:transparent;border:none;color:var(--text2);font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;width:100% }
    .sidebar-nav-item:hover  { background:rgba(255,107,0,.06);color:var(--text) }
    .sidebar-nav-item.active { background:rgba(255,107,0,.12);color:#FF6B00;border:1px solid rgba(255,107,0,.2) }
    .sidebar-logout { display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;border:1.5px solid rgba(239,68,68,.2);border-radius:12px;padding:10px 16px;color:#ef4444;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;margin-top:auto;transition:background .2s;width:100% }
    .sidebar-logout:hover { background:rgba(239,68,68,.08) }
    .up-main-panel { flex:1;display:flex;flex-direction:column;gap:0 }
    .panel-header  { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:0 0 24px }
    .panel-title   { font-family:'Syne',sans-serif;font-size:22px;font-weight:900;color:var(--text);letter-spacing:-.5px }
    .panel-sub     { color:var(--text3);font-size:13px;font-weight:600;margin-top:4px }
    .panel-body    { background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:20px }
    .desktop-two-col { display:grid;grid-template-columns:1fr 1fr;gap:20px }
    .sticky-save-bar { display:none }
  }
`;