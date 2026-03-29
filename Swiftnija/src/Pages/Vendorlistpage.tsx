// pages/VendorListPage.tsx
// Shown when user clicks a category card.
// Route: /category/:categoryId
// Uses a SINGLE page for ALL categories — no separate page per category needed.

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiStar, FiClock, FiSearch,
  FiFilter, FiMapPin, FiTruck, FiBox,
  FiX, FiChevronRight,
} from "react-icons/fi";
import { MdStorefront, MdVerified } from "react-icons/md";
import { db, auth } from "../firebase";
import {
  collection, getDocs, doc, getDoc,
  setDoc, serverTimestamp, query, where, onSnapshot,
} from "firebase/firestore";
import { useInputSecurity, sanitizeInput } from "../hooks/Useinputsecurity";
import SecurityWarningModal from "../components/Securitywarningmodal";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Vendor = {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  img: string | null;
  isVerified: boolean;
  isOpen: boolean;
  address?: string;
};

// ─── CATEGORY MAP (same as homepage) ─────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  restaurants: "Restaurants",
  pharmacy: "Pharmacy",
  supermarket: "Supermarket",
  boutique: "Boutique",
  logistics: "Logistics",
  fastfood: "Fast Food",
  skincare: "Skincare",
  perfumes: "Perfumes",
  drinks: "Drinks",
  groceries: "Groceries",
  fashion: "Fashion",
  health: "Health",
  beauty: "Beauty",
  electronics: "Electronics",
  other: "Other",
};

function normalizeCategory(raw: string): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  const checks: [string, string][] = [
    ["restaurant", "restaurants"], ["food", "restaurants"],
    ["fast food", "fastfood"], ["fastfood", "fastfood"],
    ["pharmacy", "pharmacy"], ["drug", "pharmacy"],
    ["supermarket", "supermarket"], ["grocery", "groceries"],
    ["boutique", "boutique"], ["fashion", "fashion"],
    ["logistics", "logistics"], ["delivery", "logistics"],
    ["skincare", "skincare"], ["beauty", "beauty"],
    ["perfume", "perfumes"], ["drink", "drinks"],
    ["electronics", "electronics"],
  ];
  for (const [key, val] of checks) {
    if (lower.includes(key)) return val;
  }
  return "other";
}

// ─── STAR RATING COMPONENT ────────────────────────────────────────────────────
function StarRating({
  value, onChange, readonly = false, size = 20,
}: {
  value: number; onChange?: (v: number) => void; readonly?: boolean; size?: number;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHovered(n)}
          onMouseLeave={() => !readonly && setHovered(0)}
          style={{
            fontSize: size,
            color: n <= (hovered || value) ? "#FF6B00" : "#333",
            cursor: readonly ? "default" : "pointer",
            transition: "color .15s, transform .15s",
            transform: !readonly && hovered >= n ? "scale(1.2)" : "scale(1)",
            display: "inline-block",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ─── RATING MODAL ─────────────────────────────────────────────────────────────
function RatingModal({
  vendor, onClose, onSubmit,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSubmit: (rating: number, review: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    await onSubmit(rating, review);
    setDone(true);
    setSubmitting(false);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="vlp-modal-overlay" onClick={onClose}>
      <div className="vlp-modal-card" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="vlp-modal-done">
            <span style={{ fontSize: 48 }}>🎉</span>
            <h3>Thanks for your review!</h3>
          </div>
        ) : (
          <>
            <div className="vlp-modal-header">
              <span>Rate {vendor.name}</span>
              <button onClick={onClose} className="vlp-modal-close"><FiX size={18} /></button>
            </div>
            <div className="vlp-modal-body">
              <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 16px" }}>
                <StarRating value={rating} onChange={setRating} size={36} />
              </div>
              <textarea
                className="vlp-review-input"
                placeholder="Share your experience (optional)..."
                value={review}
                onChange={e => setReview(e.target.value)}
                rows={3}
              />
              <button
                className="vlp-submit-btn"
                onClick={handleSubmit}
                disabled={rating === 0 || submitting}
              >
                {submitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── VENDOR CARD ──────────────────────────────────────────────────────────────
function VendorCard({
  vendor, onRate, onClick,
}: {
  vendor: Vendor;
  onRate: (v: Vendor) => void;
  onClick: (v: Vendor) => void;
}) {
  return (
    <div className="vlp-vendor-card" onClick={() => onClick(vendor)}>
      <div className="vlp-vendor-img">
        {vendor.img ? (
          <img
            src={vendor.img}
            alt={vendor.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80"; }}
          />
        ) : (
          <div className="vlp-img-placeholder">
            <MdStorefront size={32} color="#444" />
          </div>
        )}
        {!vendor.isOpen && (
          <div className="vlp-closed-badge">Closed</div>
        )}
        {vendor.isVerified && (
          <div className="vlp-verified-badge"><MdVerified size={14} color="#1877F2" /></div>
        )}
      </div>

      <div className="vlp-vendor-body">
        <div className="vlp-vendor-name-row">
          <h3 className="vlp-vendor-name">{vendor.name}</h3>
          <FiChevronRight size={14} color="#555" />
        </div>

        <div className="vlp-vendor-meta">
          <div className="vlp-meta-chip">
            <FiStar size={12} color="#FF6B00" />
            <span style={{ color: "#FF6B00", fontWeight: 800 }}>{vendor.rating.toFixed(1)}</span>
            <span style={{ color: "#555" }}>({vendor.reviewCount})</span>
          </div>
          <div className="vlp-meta-chip">
            <FiClock size={12} color="#888" />
            <span style={{ color: "#888" }}>{vendor.deliveryTime}</span>
          </div>
          {vendor.address && (
            <div className="vlp-meta-chip">
              <FiMapPin size={12} color="#888" />
              <span style={{ color: "#888", fontSize: 11 }}>{vendor.address.slice(0, 28)}</span>
            </div>
          )}
        </div>

        <div className="vlp-vendor-footer">
          <span className={`vlp-status ${vendor.isOpen ? "open" : "closed"}`}>
            {vendor.isOpen ? "● Open" : "● Closed"}
          </span>
          <button
            className="vlp-rate-btn"
            onClick={e => { e.stopPropagation(); onRate(vendor); }}
          >
            ★ Rate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function VendorSkeleton() {
  return (
    <div className="vlp-vendor-card" style={{ cursor: "default" }}>
      <div className="vlp-vendor-img sk-img" />
      <div className="vlp-vendor-body" style={{ gap: 8 }}>
        <div className="sk-line" style={{ width: "70%", height: 14 }} />
        <div className="sk-line" style={{ width: "50%", height: 11 }} />
        <div className="sk-line" style={{ width: "40%", height: 11 }} />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function VendorListPage() {
  const { categoryId = "restaurants" } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ratingModal, setRatingModal] = useState<Vendor | null>(null);
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const { sanitize, checkAndLog, showWarning, setShowWarning } = useInputSecurity();

  const categoryLabel = CATEGORY_LABELS[categoryId] || categoryId;

  // ── Fetch vendors for this category ──
  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "vendors"));
      const list: Vendor[] = [];
      snap.forEach(d => {
        const v = d.data();
        const cat = normalizeCategory(v.category || v.businessType || "other");
        if (cat !== categoryId) return;

        const name = v.storeName || v.businessName;
        if (!name) return;

        list.push({
          id: d.id,
          name,
          category: cat,
          rating: typeof v.rating === "number" ? v.rating : parseFloat((4 + Math.random()).toFixed(1)),
          reviewCount: typeof v.reviewCount === "number" ? v.reviewCount : Math.floor(Math.random() * 200 + 10),
          deliveryTime: v.deliveryTime || `${10 + Math.floor(Math.random() * 20)}-${25 + Math.floor(Math.random() * 20)} mins`,
          img: [v.coverImage, v.bannerImage, v.logo].find(u => u && !u.includes("supabase.co")) ?? null,
          isVerified: v.isVerified ?? false,
          isOpen: v.storeOpen !== false && v.isOpen !== false,
          address: v.address || v.location || "",
        });
      });
      setVendors(list);
      // Overlay vendorSettings.storeOpen for accurate open/closed status
try {
  const settingsSnaps = await Promise.all(
    list.map(v => getDoc(doc(db, "vendorSettings", v.id)))
  );
  setVendors(list.map((v, i) => {
    const s = settingsSnaps[i].data();
    if (!s) return v;
    return { ...v, isOpen: s.storeOpen !== false && s.acceptOrders !== false };
  }));
} catch {}
    } catch (err) {
      console.error("VendorListPage fetchVendors error:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  // ── Load user's existing ratings ──
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, "userRatings", user.uid)).then(snap => {
      if (snap.exists()) setUserRatings(snap.data() as Record<string, number>);
    }).catch(() => {});
  }, []);

  // After fetchVendors useEffect, add this real-time listener:
useEffect(() => {
  if (vendors.length === 0) return;
  
  const unsubscribers = vendors.map(v => {
    return onSnapshot(doc(db, "vendorSettings", v.id), (snap) => {
      const s = snap.data();
      if (!s) return;
      setVendors(prev => prev.map(vendor =>
        vendor.id === v.id
          ? { ...vendor, isOpen: s.storeOpen !== false && s.acceptOrders !== false }
          : vendor
      ));
    });
  });

  return () => unsubscribers.forEach(u => u());
}, [vendors.length]);

  const handleSubmitRating = async (vendor: Vendor, rating: number, review: string) => {
    const user = auth.currentUser;
    if (!user) return;

    // ── Security check ──
    const safeReview = await checkAndLog(review, "vendorReview", "VendorListPage");
    if (!safeReview) return; // attack detected — modal shown automatically

    try {
      await setDoc(
        doc(db, "vendorReviews", `${vendor.id}_${user.uid}`),
        {
          vendorId: vendor.id,
          userId: user.uid,
          rating,
          review: safeReview,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Update user's ratings map
      const newRatings = { ...userRatings, [vendor.id]: rating };
      setUserRatings(newRatings);
      await setDoc(doc(db, "userRatings", user.uid), newRatings, { merge: true });

      // Recalculate vendor average (simple approach: update vendor doc)
      const reviews = await getDocs(
        query(collection(db, "vendorReviews"), where("vendorId", "==", vendor.id))
      );
      const total = reviews.docs.reduce((sum, d) => sum + (d.data().rating || 0), 0);
      const avg = total / reviews.docs.length;
      await setDoc(
        doc(db, "vendors", vendor.id),
        { rating: parseFloat(avg.toFixed(1)), reviewCount: reviews.docs.length, updatedAt: serverTimestamp() },
        { merge: true }
      );

      // Update local state
      setVendors(prev => prev.map(v =>
        v.id === vendor.id
          ? { ...v, rating: parseFloat(avg.toFixed(1)), reviewCount: reviews.docs.length }
          : v
      ));
    } catch (err) {
      console.error("Rating submit error:", err);
    }
  };

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="vlp-root">
      {/* Security warning modal */}
      {showWarning && <SecurityWarningModal onDismiss={() => setShowWarning(false)} />}

      {/* Header */}
      <div className="vlp-header">
        <button className="vlp-back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft size={20} />
        </button>
        <div>
          <h1 className="vlp-title">{categoryLabel}</h1>
          <p className="vlp-subtitle">
            {loading ? "Loading..." : `${vendors.length} store${vendors.length !== 1 ? "s" : ""} near you`}
          </p>
        </div>
        <button className="vlp-filter-btn"><FiFilter size={18} /></button>
      </div>

      {/* Search */}
      <div className="vlp-search-wrap">
        <FiSearch size={16} color="#888" />
        <input
          className="vlp-search-input"
          placeholder={`Search ${categoryLabel.toLowerCase()}...`}
          value={search}
          onChange={e => setSearch(sanitize(e.target.value))}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>
            <FiX size={14} />
          </button>
        )}
      </div>

      {/* Vendor Grid */}
      <div className="vlp-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <VendorSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div className="vlp-empty">
            <MdStorefront size={48} color="#333" />
            <p>{search ? "No stores match your search" : `No ${categoryLabel} stores yet`}</p>
          </div>
        ) : (
          filtered.map(vendor => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              onRate={v => setRatingModal(v)}
              onClick={v => navigate(`/store/${v.id}`)}
            />
          ))
        )}
      </div>

      {/* Rating Modal */}
      {ratingModal && (
        <RatingModal
          vendor={ratingModal}
          onClose={() => setRatingModal(null)}
          onSubmit={(rating, review) => handleSubmitRating(ratingModal, rating, review)}
        />
      )}

      <style>{CSS}</style>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

:root {
  --bg:#0a0a0d; --surface:#111115; --card:#16161b; --border:#1e1e26;
  --text:#e8e8f0; --text2:#8888a0; --text3:#44445a;
  --inp:#1a1a22; --inpbd:#252530;
}
[data-theme="light"] {
  --bg:#f0f0f5; --surface:#ffffff; --card:#ffffff; --border:#e0e0e8;
  --text:#111118; --text2:#555570; --text3:#aaaabc;
  --inp:#f5f5fa; --inpbd:#dddde8;
}

.vlp-root {
  min-height: 100vh;
  background: var(--bg);
  font-family: 'Nunito', sans-serif;
  color: var(--text);
  padding-bottom: 120px;
}

.vlp-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 20px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 68px;
  z-index: 10;
}
@media (max-width: 767px) {
  .vlp-header { top: 0; padding-top: 56px; }
}

.vlp-back-btn {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: var(--card);
  border: 1.5px solid var(--border);
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color .2s;
}
.vlp-back-btn:hover { border-color: #FF6B00; color: #FF6B00; }

.vlp-title {
  font-family: 'Syne', sans-serif;
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  line-height: 1.1;
}
.vlp-subtitle { font-size: 12px; color: var(--text3); font-weight: 600; margin-top: 2px; }

.vlp-filter-btn {
  margin-left: auto;
  width: 40px; height: 40px;
  border-radius: 12px;
  background: var(--card);
  border: 1.5px solid var(--border);
  color: var(--text2);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.vlp-search-wrap {
  display: flex; align-items: center; gap: 10px;
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
  margin: 16px 20px;
  transition: border-color .2s;
}
.vlp-search-wrap:focus-within { border-color: #FF6B00; }
.vlp-search-input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text); font-family: 'Nunito', sans-serif;
  font-size: 14px; font-weight: 600;
}
.vlp-search-input::placeholder { color: var(--text3); }

.vlp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding: 0 20px;
}
@media (max-width: 640px) {
  .vlp-grid { grid-template-columns: 1fr; }
}

.vlp-vendor-card {
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .2s, transform .2s, box-shadow .2s;
  display: flex;
  flex-direction: column;
}
.vlp-vendor-card:hover {
  border-color: #FF6B00;
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(255,107,0,.15);
}

.vlp-vendor-img {
  height: 160px;
  overflow: hidden;
  position: relative;
  background: var(--surface);
  flex-shrink: 0;
}
.vlp-img-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.vlp-closed-badge {
  position: absolute; top: 10px; left: 10px;
  background: rgba(0,0,0,.75);
  color: #ef4444;
  font-size: 11px; font-weight: 800;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(239,68,68,.3);
}
.vlp-verified-badge {
  position: absolute; top: 10px; right: 10px;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(6px);
  border-radius: 50%;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
}

.vlp-vendor-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.vlp-vendor-name-row {
  display: flex; align-items: center; justify-content: space-between;
}
.vlp-vendor-name {
  font-family: 'Syne', sans-serif;
  font-size: 16px; font-weight: 800;
  color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1;
}
.vlp-vendor-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.vlp-meta-chip {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--text2); font-weight: 600;
}
.vlp-vendor-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
}
.vlp-status { font-size: 12px; font-weight: 700; }
.vlp-status.open { color: #10B981; }
.vlp-status.closed { color: #ef4444; }

.vlp-rate-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255,107,0,.1);
  border: 1.5px solid rgba(255,107,0,.3);
  color: #FF6B00;
  font-family: 'Nunito', sans-serif;
  font-size: 12px; font-weight: 800;
  cursor: pointer;
  transition: background .2s;
}
.vlp-rate-btn:hover { background: rgba(255,107,0,.2); }

/* Skeleton */
.sk-img {
  background: linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  width: 100%; height: 100%;
}
.sk-line {
  background: linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 6px;
  display: block;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.vlp-empty {
  grid-column: 1/-1;
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 60px 20px;
  color: var(--text3); font-size: 14px; font-weight: 700; text-align: center;
}

/* Modal */
.vlp-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.7);
  backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.vlp-modal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 24px;
  width: 100%; max-width: 380px;
  overflow: hidden;
  animation: modal-pop .3s cubic-bezier(.34,1.56,.64,1);
}
@keyframes modal-pop { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
.vlp-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  font-family: 'Syne', sans-serif;
  font-size: 16px; font-weight: 800; color: var(--text);
}
.vlp-modal-close {
  background: transparent; border: none;
  color: var(--text3); cursor: pointer;
  display: flex; align-items: center;
  transition: color .2s;
}
.vlp-modal-close:hover { color: var(--text); }
.vlp-modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.vlp-review-input {
  width: 100%;
  background: var(--inp);
  border: 1.5px solid var(--inpbd);
  border-radius: 12px;
  padding: 11px 13px;
  color: var(--text);
  font-family: 'Nunito', sans-serif;
  font-size: 13px; font-weight: 600;
  outline: none; resize: vertical;
  transition: border-color .2s;
}
.vlp-review-input:focus { border-color: #FF6B00; }
.vlp-review-input::placeholder { color: var(--text3); }
.vlp-submit-btn {
  background: linear-gradient(135deg, #FF6B00, #FF8C00);
  color: white; border: none; border-radius: 12px;
  padding: 13px;
  font-family: 'Nunito', sans-serif;
  font-size: 14px; font-weight: 800;
  cursor: pointer;
  transition: opacity .2s, transform .2s;
}
.vlp-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(255,107,0,.4); }
.vlp-submit-btn:disabled { opacity: .5; cursor: not-allowed; }
.vlp-modal-done {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 40px 20px;
  font-family: 'Syne', sans-serif;
  font-size: 18px; font-weight: 800; color: var(--text);
  text-align: center;
}
`;