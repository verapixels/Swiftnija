import { useState, useRef, useEffect } from "react";
import {
  doc, updateDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db, storage } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import {
  RiCameraLine, RiSaveLine, RiLockLine, RiPhoneLine,
  RiMapPinLine, RiMotorbikeLine, RiUserLine,
  RiEyeLine, RiEyeOffLine, RiCheckLine, RiAlertLine,
  RiTimeLine, RiShieldCheckLine, RiImageLine,
  RiSunLine, RiMoonLine,
} from "react-icons/ri";

const O = "#FF6B00";

type RiderData = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  vehicleType: string;
  selfieUrl: string;
  pendingSelfieUrl?: string;       // waiting for admin approval
  selfieApproved?: boolean;
  status: string;
  approved: boolean;
  isOnline: boolean;
  stats: { acceptanceRate: number; rating: number; totalDeliveries: number };
};

const VEHICLE_LABELS: Record<string, string> = {
  bike: "Motorcycle", bicycle: "Bicycle", car: "Car", van: "Van",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function passStrength(pwd: string) {
  if (!pwd) return { level: 0, label: "", color: "" };
  if (pwd.length < 6) return { level: 1, label: "Weak",   color: "#ef4444" };
  if (pwd.length < 10 || !/[A-Z]/.test(pwd)) return { level: 2, label: "Fair", color: "#f59e0b" };
  if (/[!@#$%^&*]/.test(pwd)) return { level: 4, label: "Strong", color: "#10b981" };
  return { level: 3, label: "Good", color: "#3b82f6" };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function RiderSettingsTab() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // colours
  const bg         = isDark ? "#09090f"                        : "#f4f4f9";
  const card       = isDark ? "#0f0f1a"                        : "#ffffff";
  const border     = isDark ? "#1c1c2e"                        : "#e3e3ef";
  const text       = isDark ? "#eeeef8"                        : "#111118";
  const textSub    = isDark ? "#8888aa"                        : "#44445a";
  const textMuted  = isDark ? "#55556e"                        : "#7777a0";
  const inputBg    = isDark ? "rgba(255,255,255,0.04)"         : "rgba(0,0,0,0.03)";
  const inputBd    = isDark ? "#1c1c2e"                        : "#e3e3ef";

  const [rider,   setRider]   = useState<RiderData | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  // editable fields
  const [phone,   setPhone]   = useState("");
  const [city,    setCity]    = useState("");

  // photo
  const photoRef   = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // password
  const [showPwd,    setShowPwd]    = useState(false);
  const [curPwd,     setCurPwd]     = useState("");
  const [newPwd,     setNewPwd]     = useState("");
  const [confPwd,    setConfPwd]    = useState("");
  const [showCur,    setShowCur]    = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [pwdErr,     setPwdErr]     = useState("");
  const [pwdSaving,  setPwdSaving]  = useState(false);
  const strength = passStrength(newPwd);

  const uid = auth.currentUser?.uid;

  // live rider data
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "riders", uid), snap => {
      if (snap.exists()) {
        const d = snap.data() as RiderData;
        setRider(d);
        setPhone(d.phone ?? "");
        setCity(d.city ?? "");
      }
    });
  }, [uid]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  // ── save basic info ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!uid || !rider) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "riders", uid), {
        phone, city, updatedAt: serverTimestamp(),
      });
      flash(true, "Profile updated successfully ✓");
    } catch (e: any) {
      flash(false, e.message ?? "Save failed");
    }
    setSaving(false);
  };

  // ── photo upload (goes to pendingSelfieUrl, admin approves) ─────────────
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handlePhotoUpload = async () => {
    if (!uid || !photoFile) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `riders/${uid}/pending_selfie_${Date.now()}`);
      await uploadBytes(storageRef, photoFile);
      const url = await getDownloadURL(storageRef);
      // Save as pendingSelfieUrl — admin will approve and copy to selfieUrl
      await updateDoc(doc(db, "riders", uid), {
        pendingSelfieUrl: url,
        selfieApproved: false,
        updatedAt: serverTimestamp(),
      });
      setPhotoFile(null);
      setPhotoPreview(null);
      flash(true, "Photo submitted — pending admin approval");
    } catch (e: any) {
      flash(false, e.message ?? "Upload failed");
    }
    setUploadingPhoto(false);
  };

  // ── password change ──────────────────────────────────────────────────────
  const handlePwdSave = async () => {
    setPwdErr("");
    if (!curPwd)          return setPwdErr("Enter your current password");
    if (newPwd.length < 8) return setPwdErr("New password must be at least 8 characters");
    if (newPwd !== confPwd) return setPwdErr("Passwords don't match");
    if (!rider?.email)    return setPwdErr("No email on record");
    setPwdSaving(true);
    try {
      const cred = EmailAuthProvider.credential(rider.email, curPwd);
      await reauthenticateWithCredential(auth.currentUser!, cred);
      await updatePassword(auth.currentUser!, newPwd);
      setCurPwd(""); setNewPwd(""); setConfPwd("");
      setShowPwd(false);
      flash(true, "Password changed successfully ✓");
    } catch (e: any) {
      setPwdErr(
        e.code === "auth/wrong-password" ? "Current password is incorrect" : e.message,
      );
    }
    setPwdSaving(false);
  };

  if (!rider) return null;

  const displayPhoto = photoPreview ?? rider.selfieUrl;
  const hasPending   = !!rider.pendingSelfieUrl && !rider.selfieApproved;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        .rst-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          background: ${inputBg};
          border: 1.5px solid ${inputBd};
          color: ${text};
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          outline: none;
          transition: border-color 0.18s;
          box-sizing: border-box;
        }
        .rst-input:focus { border-color: ${O}; }
        .rst-input:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .rst-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .6px;
          text-transform: uppercase;
          color: ${textMuted};
          margin-bottom: 6px;
          display: block;
        }
        .rst-field-group { margin-bottom: 16px; }
        .rst-section {
          background: ${card};
          border: 1.5px solid ${border};
          border-radius: 18px;
          padding: 18px 16px;
          margin-bottom: 14px;
        }
        .rst-section-title {
          font-family: 'Syne', sans-serif;
          font-size: 13px;
          font-weight: 900;
          color: ${text};
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .rst-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(135deg, ${O}, #FF9A00);
          border: none;
          color: #fff;
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          transition: opacity 0.18s, transform 0.15s;
          box-shadow: 0 4px 20px rgba(255,107,0,0.3);
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .rst-btn-primary:active:not(:disabled) { transform: scale(0.97); }
        .rst-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        .rst-btn-outline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          background: transparent;
          border: 1.5px solid ${border};
          color: ${textSub};
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.18s;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .rst-btn-outline:active { transform: scale(0.97); }

        .rst-info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid ${border};
        }
        .rst-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .rst-info-row:first-child { padding-top: 0; }

        .rst-pwd-input-wrap {
          position: relative;
        }
        .rst-pwd-input-wrap .rst-input {
          padding-right: 46px;
        }
        .rst-pwd-eye {
          position: absolute;
          right: 13px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: ${textMuted};
          display: flex;
          align-items: center;
          padding: 4px;
        }

        .rst-alert {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 14px;
          border-radius: 12px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 14px;
        }
        .rst-alert-ok  { background: rgba(16,185,129,0.09); border: 1px solid rgba(16,185,129,0.22); color: #10b981; }
        .rst-alert-err { background: rgba(240,88,88,0.09);  border: 1px solid rgba(240,88,88,0.22);  color: #f05858; }

        .rst-pending-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.25);
          color: #f59e0b;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .5px;
          margin-top: 8px;
        }
        .rst-strength-bar { display: flex; gap: 4px; margin-top: 8px; }
        .rst-strength-seg {
          flex: 1;
          height: 3px;
          border-radius: 3px;
          transition: background 0.3s;
        }
        .rst-theme-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      <div style={{
        background: bg,
        minHeight: "100%",
        paddingBottom: 90,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        transition: "background 0.3s",
      }}>
        {/* Header */}
        <div style={{ padding: "24px 18px 20px" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: text, letterSpacing: "-0.5px" }}>
            Settings
          </div>
          <div style={{ fontSize: 13, color: textMuted, marginTop: 3, fontWeight: 500 }}>
            Manage your profile &amp; account
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>

          {/* Flash message */}
          {msg && (
            <div className={`rst-alert ${msg.ok ? "rst-alert-ok" : "rst-alert-err"}`}>
              {msg.ok ? <RiCheckLine size={16} /> : <RiAlertLine size={16} />}
              {msg.text}
            </div>
          )}

          {/* ── Profile photo ── */}
          <div className="rst-section">
            <div className="rst-section-title">
              <RiImageLine size={15} color={O} />
              Profile Photo
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Avatar */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 76, height: 76, borderRadius: 22,
                  border: `2px solid ${hasPending ? "rgba(245,158,11,0.5)" : O + "55"}`,
                  overflow: "hidden",
                  background: inputBg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {displayPhoto ? (
                    <img src={displayPhoto} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <RiUserLine size={32} color={textMuted} />
                  )}
                </div>
                <button
                  onClick={() => photoRef.current?.click()}
                  style={{
                    position: "absolute", bottom: -4, right: -4,
                    width: 26, height: 26, borderRadius: 9,
                    background: O, border: `2px solid ${bg}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#fff",
                  }}
                >
                  <RiCameraLine size={13} />
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handlePhotoSelect}
                />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 3 }}>
                  {rider.firstName} {rider.lastName}
                </div>
                <div style={{ fontSize: 12, color: textMuted, fontWeight: 500 }}>
                  Tap the camera to select a new photo
                </div>
                {hasPending && (
                  <div className="rst-pending-badge">
                    <RiTimeLine size={11} />
                    Pending approval
                  </div>
                )}
                {rider.selfieApproved && !hasPending && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "3px 9px", borderRadius: 20, background: "rgba(16,185,129,0.09)", border: "1px solid rgba(16,185,129,0.22)", color: "#10b981", fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: ".5px" }}>
                    <RiShieldCheckLine size={11} /> Approved
                  </div>
                )}
              </div>
            </div>

            {/* Preview + upload button */}
            {photoFile && (
              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                <button
                  className="rst-btn-primary"
                  onClick={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  style={{ flex: 2 }}
                >
                  {uploadingPhoto ? "Uploading…" : <><RiSaveLine size={15} /> Submit for Approval</>}
                </button>
                <button
                  className="rst-btn-outline"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 11, background: inputBg, border: `1px solid ${border}`, fontSize: 12, color: textMuted, fontWeight: 500, lineHeight: 1.55 }}>
              📋 Your current photo stays visible until admin approves the new one.
            </div>
          </div>

          {/* ── Editable info ── */}
          <div className="rst-section">
            <div className="rst-section-title">
              <RiUserLine size={15} color={O} />
              Contact Details
            </div>

            <div className="rst-field-group">
              <label className="rst-label">
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <RiPhoneLine size={11} color={O} /> Phone Number
                </span>
              </label>
              <input
                className="rst-input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="080xxxxxxxx"
              />
            </div>

            <div className="rst-field-group" style={{ marginBottom: 0 }}>
              <label className="rst-label">
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <RiMapPinLine size={11} color={O} /> City
                </span>
              </label>
              <input
                className="rst-input"
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Lagos"
              />
            </div>
          </div>

          {/* Read-only info */}
          <div className="rst-section">
            <div className="rst-section-title">
              <RiMotorbikeLine size={15} color={O} />
              Account Info
            </div>

            {[
              { label: "Name",    value: `${rider.firstName} ${rider.lastName}` },
              { label: "Email",   value: rider.email },
              { label: "Vehicle", value: VEHICLE_LABELS[rider.vehicleType] ?? rider.vehicleType },
              {
                label: "Status",
                value: rider.approved ? "Approved ✓" : "Under review",
                color: rider.approved ? "#10b981" : "#f59e0b",
              },
            ].map(row => (
              <div key={row.label} className="rst-info-row">
                <span style={{ fontSize: 13, color: textMuted, fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.color ?? text }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Appearance */}
          <div className="rst-section">
            <div className="rst-section-title" style={{ marginBottom: 0 }}>
              {isDark ? <RiMoonLine size={15} color={O} /> : <RiSunLine size={15} color={O} />}
              Appearance
            </div>
            <div className="rst-theme-toggle" onClick={toggleTheme} style={{ marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>
                  {isDark ? "Dark mode" : "Light mode"}
                </div>
                <div style={{ fontSize: 12, color: textMuted, marginTop: 2, fontWeight: 500 }}>
                  Tap to switch theme
                </div>
              </div>
              <div style={{
                width: 48, height: 26, borderRadius: 50,
                background: isDark ? O : "#d1d5db",
                display: "flex", alignItems: "center", padding: "3px",
                transition: "background 0.3s",
                flexShrink: 0,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", background: "#fff",
                  transition: "transform 0.3s",
                  transform: isDark ? "translateX(22px)" : "translateX(0)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                }} />
              </div>
            </div>
          </div>

          {/* ── Save basic info ── */}
          <button
            className="rst-btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ marginBottom: 14 }}
          >
            {saving ? "Saving…" : <><RiSaveLine size={16} /> Save Changes</>}
          </button>

          {/* ── Password change ── */}
          <div className="rst-section">
            <div className="rst-section-title">
              <RiLockLine size={15} color={O} />
              Security
            </div>

            {!showPwd ? (
              <button className="rst-btn-outline" onClick={() => setShowPwd(true)}>
                <RiLockLine size={15} /> Change Password
              </button>
            ) : (
              <div>
                {pwdErr && (
                  <div className="rst-alert rst-alert-err" style={{ marginBottom: 14 }}>
                    <RiAlertLine size={15} /> {pwdErr}
                  </div>
                )}

                <div className="rst-field-group">
                  <label className="rst-label">Current Password</label>
                  <div className="rst-pwd-input-wrap">
                    <input
                      className="rst-input"
                      type={showCur ? "text" : "password"}
                      placeholder="Enter current password"
                      value={curPwd}
                      onChange={e => { setCurPwd(e.target.value); setPwdErr(""); }}
                    />
                    <button className="rst-pwd-eye" onClick={() => setShowCur(v => !v)}>
                      {showCur ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                    </button>
                  </div>
                </div>

                <div className="rst-field-group">
                  <label className="rst-label">New Password</label>
                  <div className="rst-pwd-input-wrap">
                    <input
                      className="rst-input"
                      type={showNew ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      value={newPwd}
                      onChange={e => { setNewPwd(e.target.value); setPwdErr(""); }}
                    />
                    <button className="rst-pwd-eye" onClick={() => setShowNew(v => !v)}>
                      {showNew ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                    </button>
                  </div>
                  {newPwd && (
                    <div className="rst-strength-bar">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="rst-strength-seg" style={{ background: i <= strength.level ? strength.color : border }} />
                      ))}
                      <span style={{ fontSize: 10, fontWeight: 800, color: strength.color, marginLeft: 6, minWidth: 42 }}>
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>

                <div className="rst-field-group">
                  <label className="rst-label">Confirm New Password</label>
                  <input
                    className="rst-input"
                    type="password"
                    placeholder="Repeat new password"
                    value={confPwd}
                    onChange={e => { setConfPwd(e.target.value); setPwdErr(""); }}
                    style={{
                      borderColor: confPwd
                        ? newPwd === confPwd ? "rgba(16,185,129,0.5)" : "rgba(240,88,88,0.5)"
                        : inputBd,
                    }}
                  />
                  {confPwd && newPwd === confPwd && (
                    <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginTop: 5 }}>
                      ✓ Passwords match
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="rst-btn-outline" onClick={() => { setShowPwd(false); setCurPwd(""); setNewPwd(""); setConfPwd(""); setPwdErr(""); }} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button className="rst-btn-primary" onClick={handlePwdSave} disabled={pwdSaving} style={{ flex: 2 }}>
                    {pwdSaving ? "Updating…" : <><RiCheckLine size={15} /> Update Password</>}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}