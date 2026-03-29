// components/ProductDetailSheet.tsx
// Bottom sheet that slides up when user taps a product card on Homepage

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiX, FiStar, FiShoppingCart, FiPackage, FiMapPin,
  FiClock, FiShield, FiChevronRight, FiMinus, FiPlus,
  FiShare2, FiHeart, FiTruck, FiBox,
} from "react-icons/fi";
import { RiVerifiedBadgeFill, RiLeafLine } from "react-icons/ri";
import { MdStorefront } from "react-icons/md";
import { db } from "../firebase";
import { collection, getDocs, query, where, limit, doc, getDoc } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
export type SheetProduct = {
  id: string;
  name: string;
  price: string;
  img: string | null;
  store: string;
  vendorId: string;
  vendorName?: string;
  category: string;
  rating: number;
  // extra fields loaded from Firestore when sheet opens
  description?: string;
  stock?: number;
  shipping?: {
    weightKg?: number | null;
    sizeCategory?: string | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
  };
};

type VendorInfo = {
  name: string;
  logo?: string;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  deliveryTime?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

type Props = {
  product: SheetProduct | null;
  onClose: () => void;
  onAddToCart: (p: SheetProduct, qty: number) => void;
  dark: boolean;
};

const ACCENT = "#FF6B00";
const FALLBACK = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80";

const SIZE_LABELS: Record<string, string> = {
  small: "Small package",
  medium: "Medium package",
  large: "Large package",
  extra_large: "Extra large / special handling",
};

export default function ProductDetailSheet({ product, onClose, onAddToCart, dark }: Props) {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null);
  const [fullProduct, setFullProduct] = useState<SheetProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const c = {
    bg:   dark ? "rgba(10,10,14,0.92)"  : "rgba(240,240,245,0.92)",
    surf: dark ? "#13131a"              : "#ffffff",
    brd:  dark ? "#1e1e2c"              : "#e0e0ee",
    txt:  dark ? "#eeeef8"              : "#111118",
    sub:  dark ? "#66668a"              : "#7777a2",
    inp:  dark ? "#16161f"              : "#f7f7ff",
    card: dark ? "#0f0f16"              : "#f4f4fc",
  };

  // Animate in
  useEffect(() => {
    if (product) {
      setQty(1);
      setImgError(false);
      setVendorInfo(null);
      setFullProduct(null);
      requestAnimationFrame(() => setVisible(true));
      loadDetails(product);
    } else {
      setVisible(false);
    }
  }, [product]);

  const loadDetails = async (p: SheetProduct) => {
    setLoading(true);
    try {
      // Load full product from Firestore
      const pSnap = await getDoc(doc(db, "products", p.id));
      if (pSnap.exists()) {
        const data = pSnap.data();
        setFullProduct({
          ...p,
          description: data.description || "",
          stock: data.stock ?? null,
          shipping: data.shipping ?? null,
        });
      } else {
        setFullProduct(p);
      }

      // Load vendor info
      let vendor: VendorInfo | null = null;

      // Try by vendorId first
      if (p.vendorId) {
        const vSnap = await getDoc(doc(db, "vendors", p.vendorId));
        if (vSnap.exists()) {
          const v = vSnap.data();
          vendor = {
            name: v.businessName || v.storeName || p.store,
            logo: v.logo || v.coverImage,
            verified: v.verified ?? false,
            rating: v.rating ?? 4.5,
            reviewCount: v.reviewCount ?? 0,
            deliveryTime: v.deliveryTime || "15–35 mins",
            address: v.address || v.city || "",
            lat: v.lat,
            lng: v.lng,
          };
        }
      }

      // Fallback: query by businessName
      if (!vendor && p.vendorName) {
        for (const field of ["businessName", "storeName"]) {
          const snap = await getDocs(
            query(collection(db, "vendors"), where(field, "==", p.vendorName), limit(1))
          );
          if (!snap.empty) {
            const v = snap.docs[0].data();
            vendor = {
              name: v.businessName || v.storeName || p.store,
              logo: v.logo || v.coverImage,
              verified: v.verified ?? false,
              rating: v.rating ?? 4.5,
              reviewCount: v.reviewCount ?? 0,
              deliveryTime: v.deliveryTime || "15–35 mins",
              address: v.address || v.city || "",
              lat: v.lat,
              lng: v.lng,
            };
            break;
          }
        }
      }

      setVendorInfo(vendor);
    } catch (e) {
      console.warn("[ProductDetailSheet] load error:", e);
      setFullProduct(p);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 320);
  };

  const handleAddToCart = () => {
    if (!product) return;
    onAddToCart(fullProduct ?? product, qty);
    handleClose();
  };

  if (!product) return null;

  const displayProduct = fullProduct ?? product;
  const imgSrc = imgError ? FALLBACK : (displayProduct.img || FALLBACK);
  const price = parseFloat(displayProduct.price.replace(/[₦,\s]/g, "")) || 0;
  const stockNum = displayProduct.stock;
  const inStock = stockNum === null || stockNum === undefined || stockNum > 0;

  return (
    <>
      <style>{`
        @keyframes pd-backdrop-in { from{opacity:0} to{opacity:1} }
        @keyframes pd-sheet-in    { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes pd-sheet-out   { from{transform:translateY(0)} to{transform:translateY(100%)} }
        @keyframes pd-pop         { 0%{transform:scale(1)} 40%{transform:scale(1.25)} 100%{transform:scale(1)} }
        @keyframes pd-heart       { 0%{transform:scale(1)} 30%{transform:scale(1.4)} 60%{transform:scale(.9)} 100%{transform:scale(1)} }

        .pd-overlay {
          position: fixed; inset: 0; z-index: 5000;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          animation: pd-backdrop-in .25s ease;
        }
        .pd-sheet {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 5001;
          border-radius: 28px 28px 0 0;
          max-height: 92vh;
          overflow-y: auto;
          scrollbar-width: none;
          animation: pd-sheet-in .35s cubic-bezier(.32,1,.4,1);
          will-change: transform;
        }
        .pd-sheet.out { animation: pd-sheet-out .3s cubic-bezier(.4,0,.6,1) forwards; }
        .pd-sheet::-webkit-scrollbar { display: none; }

        @media (min-width: 640px) {
          .pd-sheet {
            max-width: 520px;
            left: 50%; right: auto;
            transform: translateX(-50%);
            border-radius: 28px 28px 0 0;
          }
          .pd-sheet.out { animation: pd-sheet-out .3s cubic-bezier(.4,0,.6,1) forwards; }
        }

        .pd-drag-pill {
          width: 40px; height: 4px; border-radius: 4px;
          margin: 10px auto 0;
        }
        .pd-img-wrap {
          width: 100%; height: 240px; overflow: hidden;
          position: relative; flex-shrink: 0;
        }
        .pd-img-wrap img { width:100%; height:100%; object-fit:cover; display:block; }
        .pd-img-grad {
          position: absolute; bottom: 0; left: 0; right: 0; height: 100px;
          background: linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 100%);
        }
        .pd-badge-row {
          position: absolute; bottom: 14px; left: 14px; right: 14px;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .pd-badge {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 11px; border-radius: 20px;
          font-size: 11px; font-weight: 800;
          backdrop-filter: blur(10px);
        }
        .pd-top-actions {
          position: absolute; top: 14px; right: 14px;
          display: flex; gap: 8px;
        }
        .pd-action-btn {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(8px);
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: white; transition: background .2s;
        }
        .pd-action-btn:hover { background: rgba(0,0,0,0.65); }
        .pd-action-btn.liked { background: rgba(239,68,68,0.8); }

        .pd-body { padding: 20px 20px 0; }
        .pd-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:6px; }
        .pd-name { font-family:'Syne',sans-serif; font-size:22px; font-weight:900; line-height:1.2; flex:1; }
        .pd-price-big { font-family:'Syne',sans-serif; font-size:26px; font-weight:900; color:${ACCENT}; flex-shrink:0; }

        .pd-rating-row { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
        .pd-stars { display:flex; gap:2px; }
        .pd-review-count { font-size:12px; font-weight:600; }
        .pd-stock-pill {
          display:flex; align-items:center; gap:5px;
          padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800;
        }

        .pd-section-title {
          font-size:11px; font-weight:800; text-transform:uppercase;
          letter-spacing:.8px; margin-bottom:10px; margin-top:20px;
          display:flex; align-items:center; gap:6px;
        }
        .pd-description { font-size:14px; line-height:1.7; font-weight:500; }

        .pd-vendor-card {
          display:flex; align-items:center; gap:14px;
          padding:14px 16px; border-radius:18px; border:1.5px solid;
          margin-bottom:4px; cursor:pointer;
          transition:border-color .2s, transform .15s;
        }
        .pd-vendor-card:hover { transform:translateY(-1px); }
        .pd-vendor-logo {
          width:48px; height:48px; border-radius:14px;
          overflow:hidden; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          font-size:20px; font-weight:900; color:white;
          background:linear-gradient(135deg,${ACCENT},#FF8C00);
        }

        .pd-info-grid {
          display:grid; grid-template-columns:1fr 1fr; gap:10px;
        }
        .pd-info-tile {
          padding:14px; border-radius:16px; border:1.5px solid;
          display:flex; flex-direction:column; gap:6px;
        }
        .pd-info-tile-icon { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; }
        .pd-info-tile-val { font-size:14px; font-weight:700; }

        .pd-qty-row {
          display:flex; align-items:center; justify-content:space-between;
          margin:20px 0 16px;
        }
        .pd-qty-label { font-size:13px; font-weight:700; }
        .pd-qty-ctrl {
          display:flex; align-items:center; gap:4px;
          background:rgba(255,107,0,0.1); border-radius:14px;
          padding:4px; border:1.5px solid rgba(255,107,0,0.2);
        }
        .pd-qty-btn {
          width:34px; height:34px; border-radius:10px; border:none;
          background:transparent; color:${ACCENT}; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          transition:background .15s;
          -webkit-tap-highlight-color:transparent;
        }
        .pd-qty-btn:hover { background:rgba(255,107,0,0.2); }
        .pd-qty-btn:disabled { opacity:.35; cursor:not-allowed; }
        .pd-qty-num { font-family:'Syne',sans-serif; font-size:16px; font-weight:900; color:${ACCENT}; min-width:32px; text-align:center; }

        .pd-cta-row {
          display:flex; gap:10px; padding:0 20px 32px;
          position:sticky; bottom:0;
          padding-top:14px;
        }
        .pd-cta-main {
          flex:1; padding:16px; border-radius:18px; border:none;
          background:linear-gradient(135deg,${ACCENT},#FF8C00);
          color:white; font-family:'Syne',sans-serif; font-size:15px; font-weight:900;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 8px 28px rgba(255,107,0,0.35);
          transition:transform .2s, box-shadow .2s;
          -webkit-tap-highlight-color:transparent;
        }
        .pd-cta-main:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(255,107,0,0.45); }
        .pd-cta-main:active { transform:scale(.97); }
        .pd-cta-main:disabled { opacity:.45; cursor:not-allowed; transform:none; box-shadow:none; }
        .pd-total-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .pd-total-label { font-size:12px; font-weight:700; }
        .pd-total-val { font-family:'Syne',sans-serif; font-size:16px; font-weight:900; color:${ACCENT}; }
      `}</style>

      {/* Backdrop */}
      <div className="pd-overlay" onClick={handleClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`pd-sheet${visible ? "" : " out"}`}
        style={{ background: c.surf }}
      >
        <div className="pd-drag-pill" style={{ background: c.brd }} />

        {/* Hero image */}
        <div className="pd-img-wrap">
          <img
            src={imgSrc}
            alt={displayProduct.name}
            onError={() => setImgError(true)}
          />
          <div className="pd-img-grad" />

          {/* Top action buttons */}
          <div className="pd-top-actions">
            <button
              className={`pd-action-btn ${liked ? "liked" : ""}`}
              onClick={() => { setLiked(v => !v); }}
            >
              <FiHeart size={15} fill={liked ? "white" : "none"} />
            </button>
            <button className="pd-action-btn" onClick={handleClose}>
              <FiX size={15} />
            </button>
          </div>

          {/* Bottom badges on image */}
          <div className="pd-badge-row">
            {inStock ? (
              <div className="pd-badge" style={{ background: "rgba(16,185,129,0.85)", color: "white" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />
                In Stock{stockNum != null && stockNum <= 10 ? ` · Only ${stockNum} left` : ""}
              </div>
            ) : (
              <div className="pd-badge" style={{ background: "rgba(239,68,68,0.85)", color: "white" }}>
                Out of Stock
              </div>
            )}
            <div className="pd-badge" style={{ background: "rgba(0,0,0,0.55)", color: "white" }}>
              <FiStar size={10} fill="#FF6B00" color="#FF6B00" />
              {displayProduct.rating.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pd-body">
          {/* Name + Price */}
          <div className="pd-title-row">
            <div className="pd-name" style={{ color: c.txt }}>{displayProduct.name}</div>
            <div className="pd-price-big">₦{price.toLocaleString()}</div>
          </div>

          {/* Rating + stock row */}
          <div className="pd-rating-row">
            <div className="pd-stars">
              {[1,2,3,4,5].map(s => (
                <FiStar
                  key={s} size={13}
                  color="#FF6B00"
                  fill={s <= Math.round(displayProduct.rating) ? "#FF6B00" : "none"}
                />
              ))}
            </div>
            <span className="pd-review-count" style={{ color: c.sub }}>
              {displayProduct.rating.toFixed(1)} rating
            </span>
            <span style={{ color: c.brd }}>·</span>
            <span className="pd-review-count" style={{ color: c.sub }}>
              {displayProduct.category}
            </span>
          </div>

          {/* Description */}
          {loading ? (
            <div style={{ height: 14, borderRadius: 6, background: c.brd, marginBottom: 8, animation: "shimmer 1.4s infinite" }} />
          ) : displayProduct.description ? (
            <>
              <div className="pd-section-title" style={{ color: c.sub }}>
                <FiBox size={11} /> About this product
              </div>
              <p className="pd-description" style={{ color: c.txt }}>{displayProduct.description}</p>
            </>
          ) : null}

          {/* Delivery + shipping info tiles */}
          <div className="pd-section-title" style={{ color: c.sub, marginTop: 20 }}>
            <FiTruck size={11} /> Delivery & Package Info
          </div>
          <div className="pd-info-grid">
            <div className="pd-info-tile" style={{ borderColor: c.brd, background: c.card }}>
              <div className="pd-info-tile-icon" style={{ color: c.sub }}>
                <FiClock size={11} /> Delivery
              </div>
              <div className="pd-info-tile-val" style={{ color: c.txt }}>
                {vendorInfo?.deliveryTime || "15–35 mins"}
              </div>
            </div>
            <div className="pd-info-tile" style={{ borderColor: c.brd, background: c.card }}>
              <div className="pd-info-tile-icon" style={{ color: c.sub }}>
                <FiPackage size={11} /> Package
              </div>
              <div className="pd-info-tile-val" style={{ color: c.txt }}>
                {displayProduct.shipping?.sizeCategory
                  ? SIZE_LABELS[displayProduct.shipping.sizeCategory] || displayProduct.shipping.sizeCategory
                  : "Standard"}
              </div>
            </div>
            {displayProduct.shipping?.weightKg ? (
              <div className="pd-info-tile" style={{ borderColor: c.brd, background: c.card }}>
                <div className="pd-info-tile-icon" style={{ color: c.sub }}>
                  ⚖️ Weight
                </div>
                <div className="pd-info-tile-val" style={{ color: c.txt }}>
                  {displayProduct.shipping.weightKg} kg
                </div>
              </div>
            ) : null}
            {displayProduct.shipping?.lengthCm ? (
              <div className="pd-info-tile" style={{ borderColor: c.brd, background: c.card }}>
                <div className="pd-info-tile-icon" style={{ color: c.sub }}>
                  📐 Dimensions
                </div>
                <div className="pd-info-tile-val" style={{ color: c.txt }}>
                  {displayProduct.shipping.lengthCm}×{displayProduct.shipping.widthCm}×{displayProduct.shipping.heightCm} cm
                </div>
              </div>
            ) : null}
          </div>

          {/* Vendor card */}
          {(vendorInfo || displayProduct.store) && (
            <>
              <div className="pd-section-title" style={{ color: c.sub, marginTop: 20 }}>
                <MdStorefront size={13} /> Sold by
              </div>
              <div
                className="pd-vendor-card"
                style={{ borderColor: c.brd, background: c.card }}
                onClick={() => {
                  if (displayProduct.vendorId) {
                    handleClose();
                    navigate(`/store/${displayProduct.vendorId}`);
                  }
                }}
              >
                <div className="pd-vendor-logo">
                  {vendorInfo?.logo
                    ? <img src={vendorInfo.logo} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                    : (vendorInfo?.name || displayProduct.store)[0].toUpperCase()
                  }
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:800, color:c.txt }}>
                      {vendorInfo?.name || displayProduct.store}
                    </span>
                    {vendorInfo?.verified && <RiVerifiedBadgeFill size={13} color="#3b82f6" />}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3, flexWrap:"wrap" }}>
                    {vendorInfo?.rating && (
                      <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, fontWeight:700, color:c.sub }}>
                        <FiStar size={10} color="#FF6B00" fill="#FF6B00" />
                        {vendorInfo.rating.toFixed(1)}
                        {vendorInfo.reviewCount ? ` (${vendorInfo.reviewCount})` : ""}
                      </span>
                    )}
                    {vendorInfo?.address && (
                      <span style={{ display:"flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, color:c.sub }}>
                        <FiMapPin size={9} color={ACCENT} /> {vendorInfo.address}
                      </span>
                    )}
                  </div>
                </div>
                <FiChevronRight size={14} color={c.sub} />
              </div>
            </>
          )}

          {/* Guarantee row */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"14px 0 6px", fontSize:11, fontWeight:600, color:c.sub }}>
            <FiShield size={11} color={ACCENT} /> Secured checkout · Fast delivery · Fresh products
          </div>

          {/* Qty selector */}
          <div className="pd-qty-row">
            <span className="pd-qty-label" style={{ color: c.txt }}>Quantity</span>
            <div className="pd-qty-ctrl">
              <button
                className="pd-qty-btn"
                disabled={qty <= 1}
                onClick={() => setQty(v => Math.max(1, v - 1))}
              >
                <FiMinus size={13} />
              </button>
              <span className="pd-qty-num">{qty}</span>
              <button
                className="pd-qty-btn"
                disabled={stockNum != null && qty >= stockNum}
                onClick={() => setQty(v => v + 1)}
              >
                <FiPlus size={13} />
              </button>
            </div>
          </div>

          {/* Total */}
          <div className="pd-total-row" style={{ marginBottom: 16 }}>
            <span className="pd-total-label" style={{ color: c.sub }}>
              {qty > 1 ? `${qty} × ₦${price.toLocaleString()}` : "Price"}
            </span>
            <span className="pd-total-val">₦{(price * qty).toLocaleString()}</span>
          </div>
        </div>

        {/* CTA — sticky bottom */}
        <div className="pd-cta-row" style={{ background: c.surf }}>
          <button
            className="pd-cta-main"
            disabled={!inStock}
            onClick={handleAddToCart}
          >
            <FiShoppingCart size={17} />
            {inStock ? `Add ${qty > 1 ? qty + " to" : "to"} Cart` : "Out of Stock"}
          </button>
        </div>
      </div>
    </>
  );
}