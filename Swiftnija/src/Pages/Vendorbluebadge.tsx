// Pages/VendorBlueBadge.tsx
// Vendors apply for the blue verification badge by submitting CAC / identity docs.
// Admin reviews and approves — separate from basic account verification.

import { useState, useRef, useEffect } from "react";
import { MdVerified } from "react-icons/md";
import {
  FiUpload, FiCheck, FiClock, FiAlertCircle, FiFileText,
  FiX, FiShield, FiInfo, FiChevronDown, FiChevronUp,
} from "react-icons/fi";
import { auth, db } from "../firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import type { VendorProfile } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────
type BadgeStatus = "none" | "pending" | "approved" | "rejected";

type DocSlot = {
  key: string;
  label: string;
  desc: string;
  required: boolean;
  accept: string;
};

const DOC_SLOTS: DocSlot[] = [
  {
    key: "cac",
    label: "CAC Certificate / Business Registration",
    desc: "Certificate of Incorporation or Business Name registration from CAC Nigeria",
    required: true,
    accept: "image/*,application/pdf",
  },
  {
    key: "id",
    label: "Government-Issued ID",
    desc: "National ID, Driver's License, Voter's Card or International Passport of the business owner",
    required: true,
    accept: "image/*,application/pdf",
  },
  {
    key: "memat",
    label: "MEMAT / Tax Clearance (optional)",
    desc: "Memorandum & Articles of Association or TIN certificate — strengthens your application",
    required: false,
    accept: "image/*,application/pdf",
  },
  {
    key: "selfie",
    label: "Selfie with ID",
    desc: "A clear photo of you holding your government-issued ID open",
    required: true,
    accept: "image/*",
  },
];

const BENEFITS = [
  { icon: "🔵", text: "Blue tick badge displayed on your store and products" },
  { icon: "⬆️", text: "Higher ranking in SwiftNija search results" },
  { icon: "✅", text: "\"Verified Business\" trust label for customers" },
  { icon: "📊", text: "Access to advanced analytics and priority support" },
  { icon: "💰", text: "Eligible for promotional placement campaigns" },
];

const REQUIREMENTS = [
  "Your store must be approved by admin first",
  "Valid CAC registration document",
  "Government-issued ID of the owner",
  "A clear selfie holding your ID",
  "Store must have at least 1 active product",
  "No policy violations in the last 30 days",
];

type Props = { vendor: VendorProfile };

export default function VendorBlueBadge({ vendor }: Props) {
  const [status, setStatus]         = useState<BadgeStatus>("none");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [showReqs, setShowReqs]     = useState(false);

  // File state per slot
  const [files, setFiles]   = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Load existing application ─────────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "blueBadgeApplications", uid));
        if (snap.exists()) {
          const data = snap.data();
          setStatus(data.status ?? "none");
          setSubmittedAt(
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toDate().toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })
              : null
          );
          setRejectionNote(data.rejectionNote ?? "");
        } else if (vendor.blueBadge) {
          setStatus("approved");
        }
      } catch { /* silently ignore */ }
      finally { setLoadingStatus(false); }
    })();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Max 10MB
    if (f.size > 10 * 1024 * 1024) {
      setError(`${key.toUpperCase()} file is too large. Max 10MB.`);
      return;
    }
    setFiles(prev => ({ ...prev, [key]: f }));
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreviews(prev => ({ ...prev, [key]: ev.target?.result as string }));
      reader.readAsDataURL(f);
    } else {
      // PDF — show filename
      setPreviews(prev => ({ ...prev, [key]: "__pdf__" }));
    }
    setError("");
  };

  const removeFile = (key: string) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    setPreviews(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const uploadDoc = async (file: File, key: string): Promise<string> => {
    const uid = auth.currentUser!.uid;
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      const storageRef = ref(storage, `blueBadge/${uid}/${key}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return url;
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSubmit = async () => {
    setError("");

    // Validate required docs
    const missing = DOC_SLOTS.filter(s => s.required && !files[s.key]);
    if (missing.length > 0) {
      setError(`Please upload: ${missing.map(s => s.label).join(", ")}`);
      return;
    }

    if (!vendor.verified) {
      setError("Your store must be approved by admin before applying for the blue badge.");
      return;
    }

    setSubmitting(true);
    try {
      const uid = auth.currentUser!.uid;
      const urls: Record<string, string> = {};

      // Upload all docs
      for (const slot of DOC_SLOTS) {
        const file = files[slot.key];
        if (file) {
          urls[slot.key] = await uploadDoc(file, slot.key);
        }
      }

      // Save application to Firestore
      await setDoc(doc(db, "blueBadgeApplications", uid), {
        vendorId:     uid,
        vendorName:   vendor.name,
        vendorEmail:  vendor.email,
        documents:    urls,
        status:       "pending",
        submittedAt:  serverTimestamp(),
        updatedAt:    serverTimestamp(),
      });

      setStatus("pending");
      setSubmittedAt("Today");
      setSuccess(true);
    } catch (err: any) {
      setError("Submission failed: " + (err.message || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="vd-page vd-fade-up">
        <div className="vd-loading">Loading badge status…</div>
      </div>
    );
  }

  return (
    <div className="vd-page vd-fade-up">

      {/* ── Page header ── */}
      <div className="vd-page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(24,119,242,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MdVerified size={20} color="#1877F2" />
            </div>
            <h1 className="vd-page-title">Blue Badge</h1>
          </div>
          <p className="vd-page-sub">Apply for verified business status on SwiftNija</p>
        </div>
      </div>

      {/* ── Status banner ── */}
      {status === "approved" && (
        <div className="vd-alert success" style={{ marginBottom: 20 }}>
          <MdVerified size={18} color="#1877F2" />
          <div>
            <div style={{ fontWeight: 800 }}>Blue Badge Approved! 🎉</div>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>Your store now displays the blue verification tick.</div>
          </div>
        </div>
      )}

      {status === "pending" && (
        <div className="vd-alert warning" style={{ marginBottom: 20 }}>
          <FiClock size={16} />
          <div>
            <div style={{ fontWeight: 800 }}>Application Under Review</div>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              Submitted {submittedAt ?? ""}. Our team reviews applications within 3–5 business days.
            </div>
          </div>
        </div>
      )}

      {status === "rejected" && (
        <div className="vd-alert error" style={{ marginBottom: 20 }}>
          <FiAlertCircle size={16} />
          <div>
            <div style={{ fontWeight: 800 }}>Application Not Approved</div>
            {rejectionNote && <div style={{ fontSize: 12, marginTop: 2 }}>Reason: {rejectionNote}</div>}
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>You can update your documents and reapply.</div>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="vd-bb-hero">
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(24,119,242,0.1)", border: "2px solid rgba(24,119,242,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <MdVerified size={36} color="#1877F2" />
        </div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 8 }}>
          Become a Verified Business
        </h2>
        <p style={{ color: "var(--text3)", fontSize: 13, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 16px" }}>
          The blue badge signals to customers that your business is real, registered, and trustworthy.
          Submit your CAC documents to apply.
        </p>
        {status === "approved"
          ? <div className="vd-bb-status" style={{ background: "rgba(24,119,242,0.1)", color: "#1877F2" }}>
              <MdVerified size={14} /> Blue Badge Active
            </div>
          : status === "pending"
          ? <div className="vd-bb-status" style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
              <FiClock size={14} /> Under Review
            </div>
          : <div className="vd-bb-status" style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>
              <FiShield size={14} /> Not Applied
            </div>
        }
      </div>

      {/* ── Benefits ── */}
      <div className="vd-card" style={{ marginBottom: 16 }}>
        <div className="vd-card-title" style={{ marginBottom: 14 }}>Benefits of the Blue Badge</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BENEFITS.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 13, color: "var(--text2)" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{b.icon}</span>
              <span style={{ lineHeight: 1.5 }}>{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Requirements collapsible ── */}
      <div className="vd-card" style={{ marginBottom: 20 }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setShowReqs(v => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
            <FiInfo size={15} color="#FF6B00" /> Requirements Checklist
          </div>
          {showReqs ? <FiChevronUp size={16} color="var(--text3)" /> : <FiChevronDown size={16} color="var(--text3)" />}
        </div>
        {showReqs && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {REQUIREMENTS.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--text2)" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <FiCheck size={10} color="#10B981" />
                </div>
                {r}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Application form — only if not approved / not pending ── */}
      {(status === "none" || status === "rejected") && !success && (
        <>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 900, color: "var(--text)", marginBottom: 16 }}>
            Upload Your Documents
          </div>

          {error && (
            <div className="vd-alert error" style={{ marginBottom: 16 }}>
              <FiAlertCircle size={14} /> {error}
            </div>
          )}

          {!vendor.verified && (
            <div className="vd-alert warning" style={{ marginBottom: 16 }}>
              <FiAlertCircle size={14} />
              <span>Your store must be <strong>approved by admin</strong> before applying for the blue badge.</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
            {DOC_SLOTS.map(slot => {
              const hasFile = !!previews[slot.key];
              const isPdf = previews[slot.key] === "__pdf__";
              const isUploading = uploading[slot.key];

              return (
                <div key={slot.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <label className="vd-field-label" style={{ margin: 0 }}>{slot.label}</label>
                    {slot.required
                      ? <span style={{ fontSize: 9, color: "#EF4444", fontWeight: 800, background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 6 }}>Required</span>
                      : <span style={{ fontSize: 9, color: "var(--text3)", fontWeight: 700, background: "var(--border)", padding: "1px 6px", borderRadius: 6 }}>Optional</span>
                    }
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8, lineHeight: 1.5 }}>{slot.desc}</p>

                  {hasFile ? (
                    <div className="vd-doc-upload uploaded" style={{ flexDirection: "row", justifyContent: "space-between", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {isPdf ? (
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <FiFileText size={18} color="#EF4444" />
                          </div>
                        ) : (
                          <img src={previews[slot.key]} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                        )}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                            {files[slot.key]?.name ?? "Document"}
                          </div>
                          <div style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>✓ Ready to submit</div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(slot.key)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}
                      >
                        <FiX size={16} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="vd-doc-upload"
                      onClick={() => fileRefs.current[slot.key]?.click()}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(24,119,242,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FiUpload size={20} color="#1877F2" />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Click to upload</div>
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>PDF, JPG or PNG · max 10MB</div>
                    </div>
                  )}
                  <input
                    ref={el => { fileRefs.current[slot.key] = el; }}
                    type="file"
                    accept={slot.accept}
                    style={{ display: "none" }}
                    onChange={e => handleFileSelect(e, slot.key)}
                  />
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <button
            className="vd-btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "15px", fontSize: 14, opacity: (!vendor.verified || submitting) ? 0.6 : 1 }}
            onClick={handleSubmit}
            disabled={submitting || !vendor.verified}
          >
            {submitting ? (
              <>
                <span style={{ display: "inline-block", animation: "spin 0.7s linear infinite" }}>⟳</span>
                Uploading & Submitting…
              </>
            ) : (
              <><MdVerified size={16} /> Submit Blue Badge Application</>
            )}
          </button>

          <p style={{ textAlign: "center", color: "var(--text3)", fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
            By submitting, you confirm all documents are authentic. False documents will result in permanent ban.
          </p>
        </>
      )}

      {/* ── Success state ── */}
      {success && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(24,119,242,0.1)", border: "2px solid rgba(24,119,242,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>
            ✅
          </div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 10 }}>Application Submitted!</h3>
          <p style={{ color: "var(--text3)", fontSize: 14, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
            Our team will review your documents within <strong style={{ color: "var(--text)" }}>3–5 business days</strong>.
            You'll receive an email at <strong style={{ color: "#FF6B00" }}>{vendor.email}</strong> with the outcome.
          </p>
        </div>
      )}

      {/* ── Already approved ── */}
      {status === "approved" && (
        <div style={{ textAlign: "center", padding: "32px 20px" }}>
          <MdVerified size={64} color="#1877F2" style={{ marginBottom: 16 }} />
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 10 }}>
            You're Verified! 🎉
          </h3>
          <p style={{ color: "var(--text3)", fontSize: 14, lineHeight: 1.7 }}>
            Your blue badge is active and visible to all customers on your store page and products.
          </p>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}