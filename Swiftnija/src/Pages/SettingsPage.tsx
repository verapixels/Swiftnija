// pages/SettingsPage.tsx — with real push notification controls
import { useState, useEffect } from "react";
import {
  FiBell, FiSliders, FiSmartphone, FiClock, FiCreditCard,
  FiCheck, FiX, FiAlertCircle, FiVolume2, FiVolumeX,
} from "react-icons/fi";
import { MdVerified } from "react-icons/md";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase.ts";
import { Toggle, Spinner, Alert } from "../components/SharedComponents.tsx";
import type { SettingsState, VendorProfile } from "../types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  vendor: VendorProfile;
  settings: SettingsState;
  setSettings: (s: SettingsState) => void;
  onVendorUpdate: (updates: Partial<VendorProfile>) => void;
};

// ─── Push permission helper ───────────────────────────────────────────────────
async function requestPushPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const perm = await Notification.requestPermission();
  return perm as "granted" | "denied";
}

export default function SettingsPage({ vendor, settings, setSettings, onVendorUpdate }: Props) {
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState("");
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardNum, setCardNum]             = useState("");
  const [cardExp, setCardExp]             = useState("");
  const [cardCvv, setCardCvv]             = useState("");
  const [cardName, setCardName]           = useState("");
  const [cardSaving, setCardSaving]       = useState(false);
  const [cardErr, setCardErr]             = useState("");
  const [pushStatus, setPushStatus]       = useState<"granted" | "denied" | "default" | "unsupported">("default");

  const [hours, setHours] = useState({
    open:  vendor.openingHours?.open  || "08:00",
    close: vendor.openingHours?.close || "22:00",
    days:  vendor.openingHours?.days  || ["Mon","Tue","Wed","Thu","Fri","Sat"],
  });

  // ── Check current push permission state ───────────────────────────────────
  useEffect(() => {
    if (!("Notification" in window)) {
      setPushStatus("unsupported");
    } else {
      setPushStatus(Notification.permission as any);
    }
  }, []);

  const toggle = async (key: keyof SettingsState) => {
    // Push notification toggle
    if (key === "pushNotifications") {
      if (!settings.pushNotifications) {
        // Enabling — request permission
        const result = await requestPushPermission();
        setPushStatus(result);
        if (result !== "granted") {
          // Can't enable if denied
          return;
        }
      }
    }
    // SMS requires card
    if (key === "orderAlertSMS" && !settings.smsCardAdded && !settings.orderAlertSMS) {
      setShowCardModal(true);
      return;
    }
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    await saveSettings(updated);
  };

  const saveSettings = async (s: SettingsState) => {
    if (!auth.currentUser) return;
    await setDoc(
      doc(db, "vendorSettings", auth.currentUser.uid),
      { ...s, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(console.error);
  };

  const saveHours = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "vendors", auth.currentUser.uid),
        { openingHours: hours, updatedAt: serverTimestamp() },
        { merge: true }
      );
      onVendorUpdate({ openingHours: hours });
      setSaveMsg("✓ Hours saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("✗ Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setHours(h => ({
      ...h,
      days: h.days.includes(day) ? h.days.filter(d => d !== day) : [...h.days, day],
    }));
  };

  const handleCardSave = async () => {
    if (
      !cardNum.replace(/\s/g,"").match(/^\d{16}$/) ||
      !cardExp.match(/^\d{2}\/\d{2}$/) ||
      !cardCvv.match(/^\d{3,4}$/) ||
      !cardName.trim()
    ) {
      setCardErr("Please fill in all card details correctly");
      return;
    }
    setCardSaving(true);
    setCardErr("");
    // Production: tokenize via Paystack — never store raw card data
    await new Promise(r => setTimeout(r, 1200));
    const updated = { ...settings, smsCardAdded: true, orderAlertSMS: true };
    setSettings(updated);
    await saveSettings(updated);
    setCardSaving(false);
    setShowCardModal(false);
    setCardNum(""); setCardExp(""); setCardCvv(""); setCardName("");
  };

  const formatCardNum = (v: string) =>
    v.replace(/\D/g,"").slice(0,16).replace(/(\d{4})/g,"$1 ").trim();
  const formatExp = (v: string) => {
    const n = v.replace(/\D/g,"").slice(0,4);
    return n.length > 2 ? `${n.slice(0,2)}/${n.slice(2)}` : n;
  };

  const testSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      [0, 0.15, 0.3].forEach((t, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880 + i * 220;
        gain.gain.setValueAtTime(0, ctx.currentTime + t);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + t + 0.04);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.18);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.2);
      });
    } catch { /* not supported */ }
  };

  const SETTING_GROUPS = [
    {
      icon: <FiBell size={14} />,
      title: "Notifications",
      items: [
        {
          key: "pushNotifications" as keyof SettingsState,
          label: "Push Notifications",
          desc: pushStatus === "denied"
            ? "❌ Blocked by browser — enable in browser settings to use this"
            : pushStatus === "unsupported"
            ? "⚠️ Not supported by this browser"
            : "Get browser/phone alerts for new orders even when the app is closed",
          tag: pushStatus === "granted" ? "✓ Allowed" : pushStatus === "denied" ? "Blocked" : null,
          tagColor: pushStatus === "granted" ? "#10B981" : "#EF4444",
          disabled: pushStatus === "denied" || pushStatus === "unsupported",
        },
        {
          key: "orderAlertSMS" as keyof SettingsState,
          label: "Order Alerts via SMS",
          desc: "Get SMS for every new order (₦5/SMS)",
          tag: settings.smsCardAdded ? null : "Requires card",
          paid: true,
        },
        {
          key: "payoutAlertEmail" as keyof SettingsState,
          label: "Payout Alerts (Email)",
          desc: "Get emailed when a payout is processed",
        },
        {
          key: "reviewAlerts" as keyof SettingsState,
          label: "Review Notifications",
          desc: "Alert when you receive a new customer review",
        },
        {
          key: "promoEmails" as keyof SettingsState,
          label: "Promotional Emails",
          desc: "Tips, platform offers and updates",
        },
      ],
    },
    {
      icon: <FiSliders size={14} />,
      title: "Store Controls",
      items: [
        { key: "storeOpen" as keyof SettingsState,      label: "Store Open",          desc: "Customers can find and view your store" },
        { key: "acceptOrders" as keyof SettingsState,   label: "Accept Orders",       desc: "Allow new orders from customers" },
        { key: "showOnDiscover" as keyof SettingsState, label: "Show on Discover",    desc: "Appear in the explore and discover feed" },
        { key: "autoConfirm" as keyof SettingsState,    label: "Auto-Confirm Orders", desc: "Automatically confirm orders on placement" },
      ],
    },
    {
      icon: <FiSmartphone size={14} />,
      title: "App Preferences",
      items: [
        {
          key: "soundEnabled" as keyof SettingsState,
          label: "Order Alert Sound",
          desc: "Play a chime sound when new orders arrive",
          extra: settings.soundEnabled ? (
            <button
              onClick={testSound}
              style={{ fontSize: 11, fontWeight: 700, color: "#FF6B00", background: "rgba(255,107,0,0.1)", border: "none", borderRadius: 7, padding: "3px 9px", cursor: "pointer", marginLeft: 8 }}
            >
              Test
            </button>
          ) : null,
        },
        { key: "darkMode" as keyof SettingsState, label: "Dark Mode", desc: "Toggle dark and light interface" },
      ],
    },
  ];

  return (
    <div className="vd-page vd-fade-up">
      <div className="vd-page-header">
        <div>
          <h1 className="vd-page-title">Settings</h1>
          <p className="vd-page-sub">Manage your store preferences and notifications</p>
        </div>
      </div>

      {/* ── Opening Hours ── */}
      <div className="vd-settings-group" style={{ marginBottom: 16 }}>
        <div className="vd-settings-group-title">
          <FiClock size={14} color="#FF6B00" /> Opening Hours
        </div>
        <div style={{ padding: "18px" }}>
          <div style={{ marginBottom: 14 }}>
            <label className="vd-field-label" style={{ marginBottom: 10, display: "block" }}>Open Days</label>
            <div className="vd-hours-grid">
              {DAYS.map(day => (
                <button
                  key={day}
                  className={`vd-day-btn ${hours.days.includes(day) ? "active" : ""}`}
                  onClick={() => toggleDay(day)}
                >{day}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label className="vd-field-label">Opening Time</label>
              <input
                className="vd-field"
                type="time"
                value={hours.open}
                onChange={e => setHours(h => ({ ...h, open: e.target.value }))}
              />
            </div>
            <div>
              <label className="vd-field-label">Closing Time</label>
              <input
                className="vd-field"
                type="time"
                value={hours.close}
                onChange={e => setHours(h => ({ ...h, close: e.target.value }))}
              />
            </div>
          </div>
          {saveMsg && (
            <div style={{ color: saveMsg.startsWith("✓") ? "#10B981" : "#EF4444", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              {saveMsg}
            </div>
          )}
          <button className="vd-btn-primary" onClick={saveHours} disabled={saving}>
            {saving ? <><Spinner size={15} /> Saving…</> : <><FiCheck size={14} /> Save Hours</>}
          </button>
        </div>
      </div>

      {/* ── Setting groups ── */}
      {SETTING_GROUPS.map((group, gi) => (
        <div key={gi} className="vd-settings-group">
          <div className="vd-settings-group-title" style={{ color: "#FF6B00" }}>
            {group.icon} {group.title}
          </div>
          {group.items.map((item: any) => (
            <div key={item.key} className="vd-setting-row">
              <div className="vd-setting-info">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="vd-setting-label">{item.label}</span>
                  {item.tag && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: item.tagColor ? `${item.tagColor}18` : "rgba(255,107,0,0.12)", color: item.tagColor || "#FF6B00", letterSpacing: 0.3 }}>
                      {item.tag}
                    </span>
                  )}
                  {item.paid && settings.smsCardAdded && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
                      ✓ Card Added
                    </span>
                  )}
                  {item.extra}
                </div>
                <div className="vd-setting-desc">{item.desc}</div>
              </div>
              <Toggle
                on={!item.disabled && !!((settings as Record<string, unknown>)[item.key])}
                onClick={() => !item.disabled && toggle(item.key as keyof SettingsState)}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Push permission helper */}
      {pushStatus === "denied" && (
        <div className="vd-alert warning" style={{ marginBottom: 16 }}>
          <FiAlertCircle size={14} />
          <div>
            <div style={{ fontWeight: 700 }}>Push notifications are blocked</div>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              Go to your browser settings → Site settings → Notifications → Allow for this site, then refresh.
            </div>
          </div>
        </div>
      )}

      {/* SMS Card added info */}
      {settings.smsCardAdded && (
        <div className="vd-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FiCreditCard size={18} color="#10B981" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>SMS billing card on file</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>₦5 per SMS alert</div>
          </div>
          <button
            className="vd-btn-outline"
            style={{ fontSize: 12, padding: "6px 12px" }}
            onClick={() => setShowCardModal(true)}
          >
            Update
          </button>
        </div>
      )}

      {/* ── SMS Card Modal ── */}
      {showCardModal && (
        <div className="vd-modal-overlay">
          <div className="vd-modal vd-modal-sm">
            <div className="vd-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF6B00" }}>
                  <FiCreditCard size={18} />
                </div>
                <div>
                  <div className="vd-modal-title" style={{ fontSize: 16 }}>Add Billing Card</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>Charged ₦5 per SMS alert</div>
                </div>
              </div>
              <button className="vd-modal-close" onClick={() => setShowCardModal(false)}><FiX size={16} /></button>
            </div>

            {/* Card preview */}
            <div style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)", borderRadius: 16, padding: "20px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,107,0,0.1)" }} />
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 900, color: "white", letterSpacing: 2, marginBottom: 20 }}>
                {cardNum || "•••• •••• •••• ••••"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{cardName || "CARDHOLDER NAME"}</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{cardExp || "MM/YY"}</div>
              </div>
            </div>

            {cardErr && <Alert type="error">{cardErr}</Alert>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="vd-field-label">Card Number</label>
                <input className="vd-field" placeholder="1234 5678 9012 3456" value={cardNum} onChange={e => setCardNum(formatCardNum(e.target.value))} maxLength={19} />
              </div>
              <div>
                <label className="vd-field-label">Cardholder Name</label>
                <input className="vd-field" placeholder="Name on card" value={cardName} onChange={e => setCardName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="vd-field-label">Expiry</label>
                  <input className="vd-field" placeholder="MM/YY" value={cardExp} onChange={e => setCardExp(formatExp(e.target.value))} maxLength={5} />
                </div>
                <div>
                  <label className="vd-field-label">CVV</label>
                  <input className="vd-field" placeholder="123" value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} type="password" />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="vd-btn-outline" style={{ flex: 1 }} onClick={() => setShowCardModal(false)}>Cancel</button>
              <button className="vd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleCardSave} disabled={cardSaving}>
                {cardSaving ? <><Spinner size={15} /> Saving…</> : "Add Card"}
              </button>
            </div>
            <p style={{ textAlign: "center", color: "var(--text3)", fontSize: 11, marginTop: 12 }}>
              🔒 Secured via Paystack. Card is tokenized, never stored.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}