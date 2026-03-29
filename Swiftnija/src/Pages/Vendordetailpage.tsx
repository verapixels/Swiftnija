// pages/VendorDetailPage.tsx
// Shown when user clicks a vendor in VendorListPage.
// Route: /vendor/:vendorId
// Shows vendor info + all products organised by category + rating

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiStar, FiClock, FiTruck,
  FiBox, FiShoppingCart, FiMapPin,
} from "react-icons/fi";
import { MdStorefront, MdVerified } from "react-icons/md";
import { db, auth } from "../firebase";
import {
  collection, getDocs, doc, getDoc,
  query, where, setDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { useCart } from "../context/Cartcontext";
import { useInputSecurity, sanitizeInput } from "../hooks/Useinputsecurity";
import SecurityWarningModal from "../components/Securitywarningmodal";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  name: string;
  price: string;
  img: string | null;
  category: string;
  description?: string;
};

type ProductCategory = {
  label: string;
  products: Product[];
};

type VendorInfo = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  img: string | null;
  coverImg: string | null;
  isVerified: boolean;
  isOpen: boolean;
  address?: string;
  description?: string;
  category: string;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatPrice(p: number | string): string {
  if (typeof p === "number") return p.toLocaleString("en-NG");
  const n = parseFloat(String(p).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? String(p) : n.toLocaleString("en-NG");
}

function getProductImg(raw: Record<string, unknown>): string | null {
  const images = raw.images as string[] | undefined;
  const candidates = [images?.[0], raw.image as string, raw.img as string];
  return candidates.find(url => url && !url.includes("supabase.co")) ?? null;
}

function normalizeSubCategory(raw: string): string {
  if (!raw) return "Other";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("appetizer") || lower.includes("starter")) return "Starters";
  if (lower.includes("main") || lower.includes("entree")) return "Main Course";
  if (lower.includes("drink") || lower.includes("beverage") || lower.includes("juice")) return "Drinks";
  if (lower.includes("dessert") || lower.includes("sweet")) return "Desserts";
  if (lower.includes("snack") || lower.includes("side")) return "Snacks & Sides";
  if (lower.includes("breakfast")) return "Breakfast";
  const nice = lower.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return nice || "Other";
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
            transform: !readonly && hovered >= n ? "scale(1.15)" : "scale(1)",
            display: "inline-block",
          }}
        >★</span>
      ))}
    </div>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({
  p, vendorName, vendorId, onAdd,
}: {
  p: Product;
  vendorName: string;
  vendorId: string;
  onAdd: () => void;
}) {
  return (
    <div className="vdp-prod-card">
      <div className="vdp-prod-img">
        {p.img ? (
          <img
            src={p.img} alt={p.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80"; }}
          />
        ) : (
          <div className="vdp-img-placeholder"><FiBox size={20} color="#444" /></div>
        )}
      </div>
      <div className="vdp-prod-body">
        <div className="vdp-prod-name">{p.name}</div>
        {p.description && (
          <div className="vdp-prod-desc">{p.description.slice(0, 60)}{p.description.length > 60 ? "…" : ""}</div>
        )}
        <div className="vdp-prod-footer">
          <span className="vdp-prod-price">₦{p.price}</span>
          <button className="vdp-add-btn" onClick={onAdd}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function ProductSkeleton() {
  return (
    <div className="vdp-prod-card" style={{ cursor: "default" }}>
      <div className="vdp-prod-img sk-img" />
      <div className="vdp-prod-body" style={{ gap: 8 }}>
        <div className="sk-line" style={{ width: "75%", height: 12 }} />
        <div className="sk-line" style={{ width: "50%", height: 10 }} />
        <div className="sk-line" style={{ width: "40%", height: 10 }} />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function VendorDetailPage() {
  const { vendorId = "" } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();
  const { addToCart, cartCount } = useCart();

  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [toast, setToast] = useState("");
  const { sanitize, checkAndLog, showWarning, setShowWarning } = useInputSecurity();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ── Fetch vendor info + products ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Vendor info
      const vendorSnap = await getDoc(doc(db, "vendors", vendorId));
      if (vendorSnap.exists()) {
        const v = vendorSnap.data();
        const name = v.storeName || v.businessName || "Store";
        setVendor({
          id: vendorId,
          name,
          rating: typeof v.rating === "number" ? v.rating : 4.5,
          reviewCount: typeof v.reviewCount === "number" ? v.reviewCount : 0,
          deliveryTime: v.deliveryTime || "15-30 mins",
          img: [v.logo, v.coverImage, v.bannerImage].find(u => u && !u.includes("supabase.co")) ?? null,
          coverImg: [v.coverImage, v.bannerImage].find(u => u && !u.includes("supabase.co")) ?? null,
          isVerified: v.isVerified ?? false,
          isOpen: v.storeOpen !== false && v.isOpen !== false,
          address: v.address || v.location || "",
          description: v.description || v.bio || "",
          category: v.category || "other",
        });
      }

      // Products from this vendor
      const prodsSnap = await getDocs(
        query(collection(db, "products"), where("vendorId", "==", vendorId))
      );

      const grouped: Record<string, Product[]> = {};
      prodsSnap.forEach(d => {
        const raw = d.data();
        if (raw.inStock === false || raw.available === false) return;
        const subCat = normalizeSubCategory(raw.subCategory || raw.category || "Other");
        if (!grouped[subCat]) grouped[subCat] = [];
        grouped[subCat].push({
          id: d.id,
          name: raw.name || "Product",
          price: formatPrice(raw.price ?? 0),
          img: getProductImg(raw as Record<string, unknown>),
          category: subCat,
          description: raw.description,
        });
      });

      const cats: ProductCategory[] = Object.entries(grouped).map(([label, products]) => ({
        label, products,
      }));
      setCategories(cats);
    } catch (err) {
      console.error("VendorDetailPage fetchData error:", err);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

 // ── Load user's existing rating for this vendor ──
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !vendorId) return;
    getDoc(doc(db, "vendorReviews", `${vendorId}_${user.uid}`))
      .then(snap => {
        if (snap.exists()) {
          setUserRating(snap.data().rating || 0);
          setReviewText(snap.data().review || "");
          setRatingDone(true);
        }
      })
      .catch(() => {});
  }, [vendorId]);

  // ── ADD THIS RIGHT HERE — real-time open/close listener ──
  useEffect(() => {
    if (!vendorId) return;
    const unsub = onSnapshot(doc(db, "vendorSettings", vendorId), (snap) => {
      const s = snap.data();
      if (!s) return;
      setVendor(prev => prev
        ? { ...prev, isOpen: s.storeOpen !== false && s.acceptOrders !== false }
        : prev
      );
    });
    return () => unsub();
  }, [vendorId]);

  
  const handleAddToCart = (p: Product) => {
    if (!vendor) return;
    addToCart({
      name: p.name,
      price: `₦${p.price}`,
      img: p.img ?? "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80",
      vendorName: vendor.name,
      vendorId: vendor.id,
    });
    showToast(`${p.name} added to cart!`);
  };

  const handleSubmitRating = async () => {
    const user = auth.currentUser;
    if (!user || !vendor || userRating === 0) return;

    // ── Security check ──
    const safeReview = await checkAndLog(reviewText, "vendorReview", "VendorDetailPage");
    if (!safeReview) return; // attack detected — modal shown automatically

    setRatingSubmitting(true);
    try {
      await setDoc(
        doc(db, "vendorReviews", `${vendorId}_${user.uid}`),
        {
          vendorId,
          userId: user.uid,
          rating: userRating,
          review: safeReview,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Recalculate average
      const reviews = await getDocs(
        query(collection(db, "vendorReviews"), where("vendorId", "==", vendorId))
      );
      const total = reviews.docs.reduce((s, d) => s + (d.data().rating || 0), 0);
      const avg = parseFloat((total / reviews.docs.length).toFixed(1));
      await setDoc(doc(db, "vendors", vendorId), {
        rating: avg,
        reviewCount: reviews.docs.length,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setVendor(prev => prev ? { ...prev, rating: avg, reviewCount: reviews.docs.length } : prev);
      // Check vendorSettings for real-time open/closed status
try {
  const settingsSnap = await getDoc(doc(db, "vendorSettings", vendorId));
  if (settingsSnap.exists()) {
    const s = settingsSnap.data();
    setVendor(prev => prev ? { ...prev, isOpen: s.storeOpen !== false && s.acceptOrders !== false } : prev);
  }
} catch {}
      setRatingDone(true);
      setShowRatingForm(false);
      showToast("Review submitted! Thank you ✓");
    } catch (err) {
      console.error("Rating submit error:", err);
    } finally {
      setRatingSubmitting(false);
    }
  };

  const totalProducts = categories.reduce((s, c) => s + c.products.length, 0);

  return (
    <div className="vdp-root">
      {/* Security warning modal */}
      {showWarning && <SecurityWarningModal onDismiss={() => setShowWarning(false)} />}

      {/* Toast */}
      {toast && <div className="vdp-toast">{toast}</div>}

      {/* Cover */}
      <div className="vdp-cover">
        {vendor?.coverImg ? (
          <img
            src={vendor.coverImg} alt={vendor?.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80"; }}
          />
        ) : (
          <div className="vdp-cover-placeholder">
            <MdStorefront size={48} color="#333" />
          </div>
        )}
        <div className="vdp-cover-overlay" />

        {/* Back button */}
        <button className="vdp-back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft size={20} />
        </button>

        {/* Cart button */}
        <button className="vdp-cart-btn" onClick={() => navigate("/cart")}>
          <FiShoppingCart size={18} />
          {cartCount > 0 && <span className="vdp-cart-badge">{cartCount}</span>}
        </button>
      </div>

      {/* Vendor Info */}
      <div className="vdp-info-card">
        {/* Logo */}
        <div className="vdp-logo">
          {vendor?.img ? (
            <img src={vendor.img} alt={vendor?.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <MdStorefront size={28} color="#FF6B00" />
          )}
        </div>

        <div className="vdp-info-main">
          <div className="vdp-info-name-row">
            <h1 className="vdp-vendor-name">{vendor?.name || "Loading..."}</h1>
            {vendor?.isVerified && <MdVerified size={18} color="#1877F2" />}
            <span className={`vdp-open-badge ${vendor?.isOpen ? "open" : "closed"}`}>
              {vendor?.isOpen ? "Open" : "Closed"}
            </span>
          </div>

          {vendor?.description && (
            <p className="vdp-vendor-desc">{vendor.description}</p>
          )}

          <div className="vdp-info-chips">
            <div className="vdp-chip">
              <FiStar size={13} color="#FF6B00" />
              <span style={{ color: "#FF6B00", fontWeight: 800 }}>{vendor?.rating.toFixed(1)}</span>
              <span style={{ color: "#555" }}>({vendor?.reviewCount} reviews)</span>
            </div>
            <div className="vdp-chip">
              <FiClock size={13} color="#888" />
              <span>{vendor?.deliveryTime}</span>
            </div>
            <div className="vdp-chip">
              <FiTruck size={13} color="#888" />
              <span>Free delivery</span>
            </div>
            {vendor?.address && (
              <div className="vdp-chip">
                <FiMapPin size={13} color="#888" />
                <span>{vendor.address.slice(0, 40)}</span>
              </div>
            )}
          </div>

          <div className="vdp-actions">
            <div className="vdp-stat">
              <span className="vdp-stat-val">{totalProducts}</span>
              <span className="vdp-stat-lbl">Products</span>
            </div>
            <div className="vdp-stat">
              <span className="vdp-stat-val">{categories.length}</span>
              <span className="vdp-stat-lbl">Categories</span>
            </div>

            {/* Rating button */}
            {ratingDone ? (
              <div className="vdp-already-rated">
                <StarRating value={userRating} readonly size={14} />
                <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>Your rating</span>
              </div>
            ) : (
              <button
                className="vdp-rate-vendor-btn"
                onClick={() => setShowRatingForm(v => !v)}
              >
                ★ {showRatingForm ? "Hide" : "Rate Store"}
              </button>
            )}
          </div>

          {/* Rating Form */}
          {showRatingForm && !ratingDone && (
            <div className="vdp-rating-form">
              <div className="vdp-rating-form-header">How was your experience?</div>
              <StarRating value={userRating} onChange={setUserRating} size={28} />
              <textarea
                className="vdp-review-textarea"
                placeholder="Leave a review (optional)..."
                value={reviewText}
                onChange={e => setReviewText(sanitize(e.target.value))}
                rows={3}
              />
              <button
                className="vdp-rating-submit-btn"
                onClick={handleSubmitRating}
                disabled={ratingSubmitting || userRating === 0}
              >
                {ratingSubmitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Products by Category */}
      <div className="vdp-products-section">
        {loading ? (
          <>
            <div className="vdp-cat-label sk-line" style={{ width: 120, height: 16, marginBottom: 12 }} />
            <div className="vdp-prod-grid">
              {Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          </>
        ) : categories.length === 0 ? (
          <div className="vdp-empty">
            <FiBox size={40} color="#333" />
            <p>No products listed yet</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.label} className="vdp-cat-section">
              <div className="vdp-cat-label">{cat.label}</div>
              <div className="vdp-prod-grid">
                {cat.products.map(p => (
                  <ProductCard
                    key={p.id} p={p}
                    vendorName={vendor?.name || ""}
                    vendorId={vendorId}
                    onAdd={() => handleAddToCart(p)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

/* ── Theme variables (inherits from :root set by ThemeProvider) ── */
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

.vdp-root {
  min-height: 100vh;
  background: var(--bg);
  font-family: 'Nunito', sans-serif;
  color: var(--text);
  padding-bottom: 120px;
}

.vdp-toast {
  position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
  background: #FF6B00; color: white;
  padding: 10px 20px; border-radius: 20px;
  font-size: 13px; font-weight: 700;
  z-index: 3000;
  animation: toast-in .3s ease;
  white-space: nowrap;
}
@keyframes toast-in { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

.vdp-cover {
  height: 240px;
  position: relative;
  background: var(--surface);
  overflow: hidden;
}
@media (min-width: 768px) { .vdp-cover { height: 320px; } }
.vdp-cover-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.vdp-cover-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,.3) 0%, rgba(10,10,13,.9) 100%);
}
.vdp-back-btn {
  position: absolute; top: 16px; left: 16px;
  width: 40px; height: 40px; border-radius: 12px;
  background: rgba(10,10,13,.7); backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255,255,255,.1);
  color: #e8e8f0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: border-color .2s;
  z-index: 10;
}
@media (min-width: 768px) { .vdp-back-btn { top: 84px; } }
.vdp-back-btn:hover { border-color: #FF6B00; }
.vdp-cart-btn {
  position: absolute; top: 16px; right: 16px;
  width: 40px; height: 40px; border-radius: 12px;
  background: rgba(10,10,13,.7); backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255,255,255,.1);
  color: #e8e8f0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 10;
}
@media (min-width: 768px) { .vdp-cart-btn { top: 84px; right: 20px; } }
.vdp-cart-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 16px; height: 16px;
  background: #FF6B00; color: white;
  border-radius: 8px; font-size: 9px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
}

.vdp-info-card {
  max-width: 900px;
  margin: -40px auto 0;
  padding: 24px 20px;
  position: relative;
  z-index: 5;
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.vdp-logo {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--card);
  border: 3px solid var(--bg);
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.vdp-info-main { flex: 1; min-width: 0; }
.vdp-info-name-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.vdp-vendor-name {
  font-family: 'Syne', sans-serif;
  font-size: 24px; font-weight: 800; color: var(--text);
}
.vdp-open-badge {
  font-size: 11px; font-weight: 800;
  padding: 3px 10px; border-radius: 20px; border: 1px solid;
}
.vdp-open-badge.open { color: #10B981; border-color: rgba(16,185,129,.3); background: rgba(16,185,129,.1); }
.vdp-open-badge.closed { color: #ef4444; border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.1); }
.vdp-vendor-desc { color: var(--text2); font-size: 13px; font-weight: 600; line-height: 1.5; margin-bottom: 10px; }

.vdp-info-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.vdp-chip {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--text2); font-weight: 600;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 20px; padding: 5px 12px;
}

.vdp-actions {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.vdp-stat { display: flex; flex-direction: column; align-items: center; }
.vdp-stat-val { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 900; color: var(--text); }
.vdp-stat-lbl { font-size: 10px; color: var(--text3); font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }

.vdp-rate-vendor-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 18px;
  border-radius: 20px;
  background: rgba(255,107,0,.1);
  border: 1.5px solid rgba(255,107,0,.3);
  color: #FF6B00;
  font-family: 'Nunito', sans-serif;
  font-size: 13px; font-weight: 800;
  cursor: pointer;
  transition: background .2s;
}
.vdp-rate-vendor-btn:hover { background: rgba(255,107,0,.2); }
.vdp-already-rated {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}

.vdp-rating-form {
  margin-top: 14px;
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.vdp-rating-form-header {
  font-size: 13px; font-weight: 800; color: var(--text);
}
.vdp-review-textarea {
  width: 100%;
  background: var(--inp);
  border: 1.5px solid var(--inpbd);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text);
  font-family: 'Nunito', sans-serif;
  font-size: 13px; font-weight: 600;
  outline: none; resize: vertical;
}
.vdp-review-textarea:focus { border-color: #FF6B00; }
.vdp-review-textarea::placeholder { color: var(--text3); }
.vdp-rating-submit-btn {
  background: linear-gradient(135deg, #FF6B00, #FF8C00);
  color: white; border: none; border-radius: 12px;
  padding: 11px;
  font-family: 'Nunito', sans-serif;
  font-size: 13px; font-weight: 800;
  cursor: pointer;
  transition: opacity .2s, transform .15s;
}
.vdp-rating-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(255,107,0,.4); }
.vdp-rating-submit-btn:disabled { opacity: .5; cursor: not-allowed; }

.vdp-products-section {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;
}
.vdp-cat-section { margin-bottom: 28px; }
.vdp-cat-label {
  font-family: 'Syne', sans-serif;
  font-size: 18px; font-weight: 800;
  color: var(--text);
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.vdp-cat-label::before {
  content: '';
  width: 4px; height: 18px;
  background: #FF6B00;
  border-radius: 2px;
  display: block;
}

.vdp-prod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
@media (max-width: 640px) {
  .vdp-prod-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
}

.vdp-prod-card {
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color .2s, transform .2s;
  cursor: default;
  display: flex; flex-direction: column;
}
.vdp-prod-card:hover { border-color: rgba(255,107,0,.4); transform: translateY(-2px); }
.vdp-prod-img {
  height: 130px; overflow: hidden;
  background: var(--surface);
}
.vdp-img-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.vdp-prod-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.vdp-prod-name {
  font-size: 13px; font-weight: 800; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vdp-prod-desc { font-size: 11px; color: var(--text3); font-weight: 600; line-height: 1.4; }
.vdp-prod-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: auto; padding-top: 6px;
  gap: 8px;
}
.vdp-prod-price {
  color: #FF6B00; font-weight: 800; font-size: 13px;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.vdp-add-btn {
  padding: 6px 12px;
  background: #FF6B00;
  border: none; border-radius: 8px;
  color: white;
  font-family: 'Nunito', sans-serif;
  font-size: 11px; font-weight: 800;
  cursor: pointer;
  transition: background .15s, transform .15s, box-shadow .15s;
  flex-shrink: 0;
  white-space: nowrap;
}
.vdp-add-btn:hover { background: #e55e00; transform: scale(1.06); box-shadow: 0 4px 12px rgba(255,107,0,.4); }
.vdp-add-btn:active { transform: scale(.92); }

.vdp-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 60px 20px;
  color: var(--text3); font-size: 14px; font-weight: 700; text-align: center;
}

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
`;