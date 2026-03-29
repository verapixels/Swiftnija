import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useTheme } from "../context/ThemeContext";
import {
  RiUserLine, RiMailLine, RiPhoneLine,
  RiMapPinLine, RiCalendarLine, RiMotorbikeLine,
  RiShieldCheckLine, RiFileTextLine, RiCameraLine,
  RiCheckboxCircleLine, RiLockLine, RiLogoutBoxLine,
  RiSunLine, RiMoonLine,
} from "react-icons/ri";

const O = "#FF6B00";

type RiderData = {
  uid: string; firstName: string; lastName: string; fullName: string;
  email: string; phone: string; dob: string; city: string;
  vehicleType: string; selfieUrl: string; idType: string; idNumber: string;
  status: string; approved: boolean;
  stats: { acceptanceRate: number; rating: number; totalDeliveries: number };
  createdAt?: { toDate?: () => Date };
};

const VEHICLE_LABELS: Record<string, string> = {
  bike: "Motorcycle", bicycle: "Bicycle", car: "Car", van: "Van",
};

const T = {
  dark: {
    bg: "#0a0a0a", card: "rgba(255,255,255,0.03)", cardBorder: "rgba(255,255,255,0.08)",
    text: "#e8e8f0", textSub: "rgba(232,232,240,0.5)", textMuted: "rgba(232,232,240,0.28)",
    headerBg: "rgba(10,10,10,0.95)", rowBorder: "rgba(255,255,255,0.05)",
    shieldBg: "rgba(255,255,255,0.04)",
    toggleBg: "rgba(255,255,255,0.07)", toggleBorder: "rgba(255,255,255,0.1)", toggleColor: "rgba(255,255,255,0.6)",
  },
  light: {
    bg: "#f0f0f5", card: "rgba(0,0,0,0.025)", cardBorder: "rgba(0,0,0,0.08)",
    text: "#111118", textSub: "rgba(17,17,24,0.5)", textMuted: "rgba(17,17,24,0.35)",
    headerBg: "rgba(240,240,245,0.95)", rowBorder: "rgba(0,0,0,0.05)",
    shieldBg: "rgba(0,0,0,0.03)",
    toggleBg: "rgba(0,0,0,0.06)", toggleBorder: "rgba(0,0,0,0.1)", toggleColor: "rgba(17,17,24,0.5)",
  },
};

export default function RiderProfile() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();  // shared context — same value as dashboard
  const tk = T[theme];

  const [rider, setRider] = useState<RiderData | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, "riders", uid), snap => {
      if (snap.exists()) setRider(snap.data() as RiderData);
    });
  }, []);

  const handleTabChange = (idx: number) => {
  if (idx !== 3) navigate("/rider", { replace: true });
};

  if (!rider) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: tk.bg }}>
      <style>{BASE_CSS}</style>
      <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija"
        style={{ width: 48, height: 48, objectFit: "contain", opacity: 0.4 }} />
    </div>
  );

  const joinDate = rider.createdAt?.toDate
    ? rider.createdAt.toDate().toLocaleDateString("en-NG", { year: "numeric", month: "long" })
    : "—";
  const dobFormatted = rider.dob
    ? new Date(rider.dob + "T12:00:00").toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${tk.rowBorder}`, gap: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, flexShrink: 0 }}>
        {icon}{label}
      </span>
      {typeof value === "string"
        ? <span style={{ fontSize: 13, fontWeight: 700, color: tk.text, fontFamily: "'DM Sans',sans-serif", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
        : value}
    </div>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <div style={{ padding: "0 20px", marginBottom: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: tk.textMuted, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'DM Sans',sans-serif" }}>{title}</p>
    </div>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, overflow: "hidden", margin: "0 20px 20px" }}>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: tk.bg, fontFamily: "'Syne',sans-serif", paddingBottom: 100, maxWidth: 480, margin: "0 auto", transition: "background 0.3s" }}>
      <style>{BASE_CSS}</style>

      {/* Header */}
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50, background: tk.headerBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${tk.cardBorder}`, transition: "background 0.3s" }}>
        <img src="/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" alt="SwiftNija" style={{ width: 26, height: 26, objectFit: "contain" }} />
        <span style={{ fontSize: 17, fontWeight: 900, color: tk.text, flex: 1 }}>My Profile</span>
        <button onClick={toggleTheme} style={{ width: 36, height: 36, borderRadius: 10, background: tk.toggleBg, border: `1px solid ${tk.toggleBorder}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: tk.toggleColor, WebkitTapHighlightColor: "transparent", transition: "all 0.2s" }}>
          {theme === "dark" ? <RiSunLine size={16} /> : <RiMoonLine size={16} />}
        </button>
      </div>

      {/* Avatar */}
      <div style={{ padding: "28px 20px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "fadeIn 0.4s both" }}>
        <div style={{ position: "relative" }}>
          {rider.selfieUrl
            ? <img src={rider.selfieUrl} alt={rider.firstName} style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: `3px solid ${O}`, boxShadow: `0 0 28px ${O}44` }} />
            : <div style={{ width: 100, height: 100, borderRadius: "50%", background: `${O}18`, border: `2px dashed ${O}44`, display: "flex", alignItems: "center", justifyContent: "center", color: O }}>
                <RiCameraLine size={32} />
              </div>
          }
          {rider.approved && (
            <div style={{ position: "absolute", bottom: 2, right: 2, width: 26, height: 26, borderRadius: "50%", background: O, border: `2px solid ${tk.bg}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RiCheckboxCircleLine size={14} color="#fff" />
            </div>
          )}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: tk.text, letterSpacing: "-0.5px", textAlign: "center" }}>
          {rider.firstName} {rider.lastName}
        </h1>
        <div style={{ fontSize: 13, color: tk.textSub, fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
          <RiMapPinLine size={12} /> {rider.city}
          <span style={{ width: 1, height: 10, background: tk.cardBorder }} />
          <RiMotorbikeLine size={12} /> {VEHICLE_LABELS[rider.vehicleType] || rider.vehicleType}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: rider.approved ? "rgba(16,185,129,0.12)" : `${O}12`, border: `1px solid ${rider.approved ? "rgba(16,185,129,0.3)" : `${O}33`}`, color: rider.approved ? "#10B981" : O }}>
          {rider.approved ? <><RiCheckboxCircleLine size={12} /> Verified Rider</> : <><RiShieldCheckLine size={12} /> Under Review</>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, margin: "0 20px 24px" }}>
        {[
          { val: rider.stats.totalDeliveries, label: "Deliveries" },
          { val: rider.stats.rating > 0 ? rider.stats.rating.toFixed(1) : "—", label: "Rating", color: rider.stats.rating >= 4 ? "#10B981" : undefined },
          { val: `${rider.stats.acceptanceRate}%`, label: "Acceptance" },
        ].map(s => (
          <div key={s.label} style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, borderRadius: 14, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color || tk.text }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: tk.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "'DM Sans',sans-serif", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Personal */}
      <SectionTitle title="Personal Information" />
      <Card>
        <Row icon={<RiUserLine size={14} color={O} />} label="Full Name" value={rider.fullName || `${rider.firstName} ${rider.lastName}`} />
        <Row icon={<RiCalendarLine size={14} color={O} />} label="Date of Birth" value={dobFormatted} />
        <Row icon={<RiMapPinLine size={14} color={O} />} label="City" value={rider.city} />
        <Row icon={<RiMotorbikeLine size={14} color={O} />} label="Vehicle" value={VEHICLE_LABELS[rider.vehicleType] || rider.vehicleType} />
      </Card>

      {/* Contact */}
      <SectionTitle title="Contact Details" />
      <Card>
        <Row icon={<RiMailLine size={14} color={O} />} label="Email" value={rider.email} />
        <Row icon={<RiPhoneLine size={14} color={O} />} label="Phone" value={`+234 ${rider.phone}`} />
        <Row icon={<RiCalendarLine size={14} color={O} />} label="Joined" value={joinDate} />
      </Card>

      {/* Identity */}
      <SectionTitle title="Identity Verification" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: tk.shieldBg, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, padding: "16px 18px", margin: "0 20px 20px" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${O}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <RiLockLine size={20} color={O} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: tk.text }}>
            {rider.idType || "Government ID"} — <span style={{ color: "#10B981" }}>Verified ✓</span>
          </div>
          <div style={{ fontSize: 11, color: tk.textMuted, fontFamily: "'DM Sans',sans-serif", marginTop: 3, lineHeight: 1.5 }}>
            ID documents are encrypted and securely stored. Not shown here to protect your privacy.
          </div>
        </div>
      </div>

      {/* Account */}
      <SectionTitle title="Account" />
      <Card>
        <Row icon={<RiShieldCheckLine size={14} color={O} />} label="Account Status"
          value={<span style={{ fontSize: 13, fontWeight: 700, color: rider.approved ? "#10B981" : O, fontFamily: "'DM Sans',sans-serif" }}>{rider.approved ? "✓ Approved" : "Under Review"}</span>} />
        <Row icon={<RiFileTextLine size={14} color={O} />} label="Rider ID"
          value={<span style={{ fontSize: 11, color: tk.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{rider.uid?.slice(0, 12)}…</span>} />
      </Card>

     {/* Alert Volume */}
<SectionTitle title="Notification Settings" />
<Card>
  <div style={{ padding: "14px 16px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: tk.textSub, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
        🔔 Alert Volume
      </span>
      <span id="volume-label" style={{ fontSize: 13, fontWeight: 700, color: tk.text, fontFamily: "'DM Sans',sans-serif" }}>
        {Math.round(parseFloat(localStorage.getItem("riderAlertVolume") ?? "1.0") * 100)}%
      </span>
    </div>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      defaultValue={localStorage.getItem("riderAlertVolume") ?? "1.0"}
      onChange={(() => {
        // Create audio ONCE using a closure — not on every change
        const audio = new Audio("/alert.mp3");
        audio.preload = "auto";
        let debounceTimer: ReturnType<typeof setTimeout>;

        return (e: React.ChangeEvent<HTMLInputElement>) => {
          const vol = parseFloat(e.target.value);
          localStorage.setItem("riderAlertVolume", String(vol));

          // Update label without re-render
          const label = document.getElementById("volume-label");
          if (label) label.textContent = `${Math.round(vol * 100)}%`;

          // Debounce the preview sound — only plays 300ms after user stops sliding
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            audio.volume = vol;
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }, 300);
        };
      })()}
      style={{ width: "100%", accentColor: O, cursor: "pointer" }}
    />
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
      <span style={{ fontSize: 10, color: tk.textMuted, fontFamily: "'DM Sans',sans-serif" }}>🔇 Quiet</span>
      <span style={{ fontSize: 10, color: tk.textMuted, fontFamily: "'DM Sans',sans-serif" }}>🔊 Max</span>
    </div>
  </div>
</Card>

      {/* Sign out */}
      <div style={{ padding: "4px 20px 0" }}>
        <button onClick={() => signOut(auth)} style={{ width: "100%", padding: 15, borderRadius: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, WebkitTapHighlightColor: "transparent" }}>
          <RiLogoutBoxLine size={16} /> Sign Out
        </button>
      </div>

      {/* BottomNav — profile tab active */}
      <BottomNav activeTab={3} onTabChange={handleTabChange} />
    </div>
  );
}

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
`;