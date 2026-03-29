// pages/ProfilePage.tsx
import { useState, useRef } from "react";
import {
  FiCamera, FiSave, FiLock, FiAlertCircle, FiMail, FiPhone,
  FiEdit2, FiX, FiCheck, FiEye, FiEyeOff,
} from "react-icons/fi";
import { MdVerified } from "react-icons/md";
import {
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import {
  updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, updateEmail,
  sendEmailVerification,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase.ts";
import { getFunctions, httpsCallable } from "firebase/functions";
import OtpModal from "../components/OtpModal.tsx";
import { Spinner, Alert } from "../components/SharedComponents.tsx";
import type { VendorProfile } from "../types";

const functions = getFunctions();
const sendEmailOtp  = httpsCallable(functions, "sendEmailOtp");
const verifyEmailOtp = httpsCallable(functions, "verifyEmailOtp");
const sendPhoneOtp  = httpsCallable(functions, "sendPhoneOtp");
const verifyPhoneOtp = httpsCallable(functions, "verifyPhoneOtp");

type Props = {
  vendor: VendorProfile;
  onUpdate: (updates: Partial<VendorProfile>) => void;
};

type OtpCtx = "email_change" | "phone_change" | "password_change" | null;

export default function ProfilePage({ vendor, onUpdate }: Props) {
  const [form, setForm]           = useState({ name: vendor.name, bio: vendor.bio, address: vendor.address, phone: vendor.phone });
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile]         = useState<File | null>(null);
  const [coverFile, setCoverFile]       = useState<File | null>(null);
  const logoRef  = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  // OTP modal
  const [otpCtx, setOtpCtx]         = useState<OtpCtx>(null);
  const [newEmail, setNewEmail]      = useState("");
  const [newPhone, setNewPhone]      = useState("");
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [showPhoneEdit, setShowPhoneEdit] = useState(false);

  // Password change
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPwd, setCurrentPwd]     = useState("");
  const [newPwd, setNewPwd]             = useState("");
  const [confirmPwd, setConfirmPwd]     = useState("");
  const [showCurr, setShowCurr]         = useState(false);
  const [showNew, setShowNew]           = useState(false);
  const [pwdError, setPwdError]         = useState("");
  const [pwdStep, setPwdStep]           = useState<"form"|"otp">("form");

  const handleImgSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "logo"|"cover") => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      if (type === "logo") { setLogoPreview(ev.target?.result as string); setLogoFile(f); }
      else { setCoverPreview(ev.target?.result as string); setCoverFile(f); }
    };
    r.readAsDataURL(f);
  };

  const uploadFile = async (file: File, path: string) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    setSaveMsg("");
    try {
      let logoUrl = vendor.logo;
      let coverUrl = vendor.coverImage;
      if (logoFile) logoUrl = await uploadFile(logoFile, `vendors/${auth.currentUser.uid}/logo_${Date.now()}`);
      if (coverFile) coverUrl = await uploadFile(coverFile, `vendors/${auth.currentUser.uid}/cover_${Date.now()}`);

      await updateDoc(doc(db, "vendors", auth.currentUser.uid), {
        businessName: form.name, bio: form.bio, address: form.address,
        logo: logoUrl, coverImage: coverUrl, updatedAt: serverTimestamp(),
      });
      onUpdate({ name: form.name, bio: form.bio, address: form.address, logo: logoUrl, coverImage: coverUrl });
      setLogoPreview(null); setCoverPreview(null); setLogoFile(null); setCoverFile(null);
      setSaveMsg("✓ Profile saved successfully");
      setTimeout(() => setSaveMsg(""), 3500);
    } catch (err: any) {
      setSaveMsg("✗ " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Email change: send OTP to current email first ──
  const startEmailChange = async () => {
    if (!newEmail.trim() || !/\S+@\S+\.\S+/.test(newEmail)) return;
    await sendEmailOtp({}).catch(console.error);
    setOtpCtx("email_change");
    setShowEmailEdit(false);
  };

  const verifyEmailChange = async (code: string) => {
    await verifyEmailOtp({ code });
    // After verifying old email OTP, update Firebase Auth email
    if (auth.currentUser) {
      await updateEmail(auth.currentUser, newEmail);
      await updateDoc(doc(db, "vendors", auth.currentUser.uid), { email: newEmail, updatedAt: serverTimestamp() });
      onUpdate({ email: newEmail });
    }
    setOtpCtx(null);
    setNewEmail("");
  };

  // ── Phone change: send OTP via email ──
  const startPhoneChange = async () => {
    if (!newPhone.trim()) return;
    await sendPhoneOtp({ phone: newPhone });
    setOtpCtx("phone_change");
    setShowPhoneEdit(false);
  };

  const verifyPhoneChange = async (code: string) => {
    await verifyPhoneOtp({ code });
    if (auth.currentUser) {
      await updateDoc(doc(db, "vendors", auth.currentUser.uid), { phone: newPhone, updatedAt: serverTimestamp() });
      onUpdate({ phone: newPhone });
      setForm(f => ({ ...f, phone: newPhone }));
    }
    setOtpCtx(null);
    setNewPhone("");
  };

  // ── Password change ──
  const handlePwdSubmit = async () => {
    setPwdError("");
    if (!currentPwd) { setPwdError("Enter your current password"); return; }
    if (newPwd.length < 8) { setPwdError("New password must be at least 8 characters"); return; }
    if (newPwd !== confirmPwd) { setPwdError("Passwords don't match"); return; }
    try {
      const cred = EmailAuthProvider.credential(vendor.email, currentPwd);
      await reauthenticateWithCredential(auth.currentUser!, cred);
      // Send OTP to email to confirm before changing password
      await sendEmailOtp({});
      setPwdStep("otp");
    } catch (err: any) {
      setPwdError(err.code === "auth/wrong-password" ? "Current password is incorrect" : err.message);
    }
  };

  const verifyPasswordChange = async (code: string) => {
    await verifyEmailOtp({ code });
    await updatePassword(auth.currentUser!, newPwd);
    setOtpCtx(null);
    setShowPwdModal(false);
    setPwdStep("form");
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    setSaveMsg("✓ Password changed successfully");
    setTimeout(() => setSaveMsg(""), 3500);
  };

  const displayLogo  = logoPreview  || vendor.logo;
  const displayCover = coverPreview || vendor.coverImage;

  const passStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: "", color: "" };
    if (pwd.length < 6) return { level: 1, label: "Weak", color: "#EF4444" };
    if (pwd.length < 10 || !/[A-Z]/.test(pwd)) return { level: 2, label: "Fair", color: "#F59E0B" };
    if (/[!@#$%^&*]/.test(pwd)) return { level: 4, label: "Strong", color: "#10B981" };
    return { level: 3, label: "Good", color: "#3B82F6" };
  };
  const pwdStrength = passStrength(newPwd);

  return (
    <div className="vd-page vd-fade-up">
      <div className="vd-page-header">
        <div>
          <h1 className="vd-page-title">My Profile</h1>
          <p className="vd-page-sub">Manage your store info and account settings</p>
        </div>
      </div>

      {/* Cover + Logo */}
      <div className="vd-cover-wrap">
        <div className="vd-cover-img" style={{ backgroundImage: displayCover ? `url(${displayCover})` : undefined }}>
          <button className="vd-cover-edit-btn" onClick={() => coverRef.current?.click()}>
            <FiCamera size={13} /> Change Cover
          </button>
          <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImgSelect(e, "cover")} />
        </div>
        <div className="vd-logo-wrap">
          <div className="vd-logo">
            {displayLogo
              ? <img src={displayLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 28, fontWeight: 800, color: "white" }}>{vendor.name[0]}</span>
            }
          </div>
          <button className="vd-logo-edit-btn" onClick={() => logoRef.current?.click()}><FiCamera size={12} /></button>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImgSelect(e, "logo")} />
        </div>
      </div>

      {/* Name + verification */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: "var(--text)" }}>{vendor.name}</span>
          {vendor.verified && <MdVerified size={18} color="#1877F2" />}
        </div>
        <div style={{ color: "var(--text3)", fontSize: 13 }}>{vendor.category} · Member since {vendor.joinDate}</div>
        {!vendor.verified && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "5px 12px", borderRadius: 9, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <FiAlertCircle size={12} color="#F59E0B" />
            <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>Pending admin approval</span>
          </div>
        )}
      </div>

      {saveMsg && (
        <div className={`vd-alert ${saveMsg.startsWith("✓") ? "success" : "error"}`} style={{ marginBottom: 16 }}>
          {saveMsg.startsWith("✓") ? <FiCheck size={16} /> : <FiAlertCircle size={16} />}
          <span>{saveMsg}</span>
        </div>
      )}

      {/* ── Store Info ── */}
      <div className="vd-profile-section">
        <div className="vd-section-title"><FiEdit2 size={12} /> Store Information</div>
        <div className="vd-form-group">
          <label className="vd-field-label">Business Name</label>
          <input className="vd-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="vd-form-group">
          <label className="vd-field-label">Store Bio</label>
          <textarea className="vd-field vd-textarea" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value.slice(0, 160) }))} rows={3} />
          <div style={{ textAlign: "right", fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{form.bio.length}/160</div>
        </div>
        <div className="vd-form-group">
          <label className="vd-field-label">Shop Address</label>
          <input className="vd-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
      </div>

      {/* ── Account (email, phone, password) ── */}
      <div className="vd-profile-section">
        <div className="vd-section-title"><FiLock size={12} /> Account</div>

        {/* Email */}
        <div className="vd-form-group">
          <label className="vd-field-label">Email Address</label>
          {showEmailEdit ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>You'll receive an OTP on your <strong>current email</strong> to confirm the change.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="vd-field" type="email" placeholder="New email address" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={{ flex: 1 }} />
                <button className="vd-btn-primary" onClick={startEmailChange} style={{ padding: "10px 16px" }}><FiCheck size={15} /></button>
                <button className="vd-btn-outline" onClick={() => { setShowEmailEdit(false); setNewEmail(""); }} style={{ padding: "10px 14px" }}><FiX size={15} /></button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div className="vd-locked-field" style={{ flex: 1 }}>
                <FiMail size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
                <span>{vendor.email}</span>
              </div>
              <button className="vd-btn-outline" onClick={() => setShowEmailEdit(true)} style={{ padding: "10px 14px" }}><FiEdit2 size={14} /></button>
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="vd-form-group">
          <label className="vd-field-label">Phone Number</label>
          {showPhoneEdit ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>An OTP will be sent to your email to confirm the new number.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="vd-field" type="tel" placeholder="New phone number" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ flex: 1 }} />
                <button className="vd-btn-primary" onClick={startPhoneChange} style={{ padding: "10px 16px" }}><FiCheck size={15} /></button>
                <button className="vd-btn-outline" onClick={() => { setShowPhoneEdit(false); setNewPhone(""); }} style={{ padding: "10px 14px" }}><FiX size={15} /></button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div className="vd-locked-field" style={{ flex: 1 }}>
                <FiPhone size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
                <span>{vendor.phone || "Not set"}</span>
              </div>
              <button className="vd-btn-outline" onClick={() => setShowPhoneEdit(true)} style={{ padding: "10px 14px" }}><FiEdit2 size={14} /></button>
            </div>
          )}
        </div>

        {/* Password */}
        <div className="vd-form-group" style={{ marginBottom: 0 }}>
          <label className="vd-field-label">Password</label>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="vd-locked-field" style={{ flex: 1 }}>
              <FiLock size={14} style={{ color: "var(--text3)" }} />
              <span>••••••••</span>
            </div>
            <button className="vd-btn-outline" onClick={() => setShowPwdModal(true)} style={{ padding: "10px 14px" }}><FiEdit2 size={14} /></button>
          </div>
        </div>
      </div>

      {/* Read-only info */}
      <div className="vd-profile-section">
        <div className="vd-section-title">Store Status</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Verification", value: vendor.verified ? "Verified" : "Pending", color: vendor.verified ? "#10B981" : "#F59E0B" },
            { label: "Bank Account", value: vendor.bankLinked ? "Linked" : "Not linked", color: vendor.bankLinked ? "#10B981" : "#EF4444" },
            { label: "Category", value: vendor.category, color: "var(--text2)" },
            { label: "Member Since", value: vendor.joinDate, color: "var(--text2)" },
          ].map((item, i) => (
            <div key={i} style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 11 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button className="vd-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "14px", marginTop: 8 }} onClick={handleSave} disabled={saving}>
        {saving ? <><Spinner size={16} /> Uploading & Saving…</> : <><FiSave size={16} /> Save Changes</>}
      </button>

      {/* ── Password Change Modal ── */}
      {showPwdModal && (
        <div className="vd-modal-overlay">
          <div className="vd-modal vd-modal-sm">
            <div className="vd-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(139,92,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8B5CF6" }}>
                  <FiLock size={18} />
                </div>
                <div>
                  <div className="vd-modal-title" style={{ fontSize: 16 }}>Change Password</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>OTP verification required</div>
                </div>
              </div>
              <button className="vd-modal-close" onClick={() => { setShowPwdModal(false); setPwdStep("form"); setPwdError(""); }}><FiX size={16} /></button>
            </div>

            {pwdStep === "form" ? (
              <>
                {pwdError && <Alert type="error">{pwdError}</Alert>}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label className="vd-field-label">Current Password</label>
                    <div className="vd-field-wrap">
                      <input className="vd-field" type={showCurr ? "text" : "password"} placeholder="Enter current password" value={currentPwd} onChange={e => { setCurrentPwd(e.target.value); setPwdError(""); }} />
                      <button type="button" className="vd-field-icon-right" onClick={() => setShowCurr(v => !v)}>
                        {showCurr ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="vd-field-label">New Password</label>
                    <div className="vd-field-wrap">
                      <input className="vd-field" type={showNew ? "text" : "password"} placeholder="Min. 8 characters" value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdError(""); }} />
                      <button type="button" className="vd-field-icon-right" onClick={() => setShowNew(v => !v)}>
                        {showNew ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                      </button>
                    </div>
                    {newPwd && (
                      <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
                        {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= pwdStrength.level ? pwdStrength.color : "var(--border)", transition: "background 0.3s" }} />)}
                        <span style={{ fontSize: 10, fontWeight: 700, color: pwdStrength.color, marginLeft: 6, minWidth: 42 }}>{pwdStrength.label}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="vd-field-label">Confirm New Password</label>
                    <input className="vd-field"
                      type="password" placeholder="Repeat new password"
                      value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setPwdError(""); }}
                      style={{ borderColor: confirmPwd && newPwd === confirmPwd ? "rgba(16,185,129,0.5)" : confirmPwd ? "rgba(239,68,68,0.5)" : undefined }}
                    />
                    {confirmPwd && newPwd === confirmPwd && (
                      <div className="vd-field-hint" style={{ color: "#10B981" }}>✓ Passwords match</div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button className="vd-btn-outline" style={{ flex: 1 }} onClick={() => { setShowPwdModal(false); setPwdStep("form"); }}>Cancel</button>
                  <button className="vd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handlePwdSubmit}>Continue</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p style={{ color: "var(--text3)", fontSize: 13, lineHeight: 1.6, marginBottom: 4 }}>
                  Enter the OTP sent to <strong style={{ color: "var(--text)" }}>{vendor.email}</strong> to confirm your password change.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OTP Modal for password step 2 */}
      {showPwdModal && pwdStep === "otp" && (
        <OtpModal
          title="Confirm Password Change"
          subtitle={`Enter the 6-digit code sent to ${vendor.email}`}
          purpose="password"
          onVerify={verifyPasswordChange}
          onResend={async () => { await sendEmailOtp({}); }}
          onClose={() => { setShowPwdModal(false); setPwdStep("form"); setOtpCtx(null); }}
        />
      )}

      {/* OTP Modal for email change */}
      {otpCtx === "email_change" && (
        <OtpModal
          title="Confirm Email Change"
          subtitle={`Enter the code sent to your current email (${vendor.email}) to authorize this change.`}
          purpose="email"
          onVerify={verifyEmailChange}
          onResend={async () => { await sendEmailOtp({}); }}
          onClose={() => { setOtpCtx(null); setNewEmail(""); }}
        />
      )}

      {/* OTP Modal for phone change */}
      {otpCtx === "phone_change" && (
        <OtpModal
          title="Confirm Phone Change"
          subtitle={`Enter the 6-digit code sent to your email to confirm adding ${newPhone}.`}
          purpose="phone"
          onVerify={verifyPhoneChange}
          onResend={async () => { await sendPhoneOtp({ phone: newPhone }); }}
          onClose={() => { setOtpCtx(null); setNewPhone(""); }}
        />
      )}
    </div>
  );
}