// pages/ProductsPage.tsx — UPDATED
// Changes:
//  1. Add Product modal follows vendor dashboard color theme (dark/light)
//  2. Delete product uses a styled in-app modal instead of browser confirm()
//  3. New field: "What customers will see" section with description, features, care instructions

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FiPlus, FiSearch, FiFilter, FiEdit2, FiTrash2,
  FiUpload, FiX, FiMinus, FiPackage, FiInfo,
  FiAlertTriangle, FiCheckCircle, FiEye,
} from "react-icons/fi";
import { TbRulerMeasure, TbWeight } from "react-icons/tb";
import { auth, db, storage } from "../firebase.ts";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { StatusBadge, Spinner } from "../components/SharedComponents.tsx";
import type { Product } from "../types";

export const SIZE_PRESETS = {
  small:       { label: "Small",       desc: "Fits in a small bag (e.g. jewellery, phone)"        },
  medium:      { label: "Medium",      desc: "Shoebox-size (e.g. shoes, small electronics)"        },
  large:       { label: "Large",       desc: "Backpack-size (e.g. clothing bundle, mid appliance)" },
  extra_large: { label: "Extra Large", desc: "Requires special handling (e.g. furniture, TV)"      },
} as const;
export type SizeCategory = keyof typeof SIZE_PRESETS;

const CATEGORIES = [
  "Food & Drinks", "Grocery", "Pharmacy", "Fashion",
  "Electronics", "Beauty", "Bakery", "Other",
];

type Props = { products: Product[]; loading: boolean; };

const emptyNewProd = () => ({
  name: "", price: "", stock: "", category: "Food & Drinks",
  description: "",
  highlights: "",      // NEW — bullet points of key features/highlights
  careInfo: "",        // NEW — care instructions / how to use
  img: "", imgFile: null as File | null,
  weightKg: "", sizeCategory: "" as SizeCategory | "",
  lengthCm: "", widthCm: "", heightCm: "",
  showDims: false,
  showCustomerPreview: false,  // toggle preview section
});

// ─── Styled Delete Modal ──────────────────────────────────────────────────────
function DeleteModal({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm();
  };

  return createPortal(
    <div
      className="vd-modal-overlay"
      onClick={onCancel}
      style={{ zIndex: 400 }}
    >
      <div
        className="vd-modal vd-modal-sm"
        onClick={e => e.stopPropagation()}
        style={{ textAlign: "center", padding: "32px 28px" }}
      >
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <FiTrash2 size={26} color="#EF4444" />
        </div>

        <div style={{
          fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900,
          color: "var(--text)", marginBottom: 10,
        }}>
          Delete Product?
        </div>

        <p style={{ color: "var(--text3)", fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
          You're about to permanently delete
        </p>
        <div style={{
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 12, padding: "10px 16px", marginBottom: 24,
        }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)" }}>{product.name}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            ₦{product.price?.toLocaleString()} · {product.category}
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 10, padding: "9px 14px", marginBottom: 24, textAlign: "left",
        }}>
          <FiAlertTriangle size={13} color="#F59E0B" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#F59E0B", fontWeight: 600 }}>
            This action cannot be undone. Any pending orders for this product won't be affected.
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="vd-btn-outline"
            style={{ flex: 1 }}
            onClick={onCancel}
            disabled={confirming}
          >
            Keep it
          </button>
          <button
            className="vd-btn-danger"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={handleConfirm}
            disabled={confirming}
          >
            {confirming
              ? <><Spinner size={14} /> Deleting…</>
              : <><FiTrash2 size={14} /> Delete</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProductsPage({ products, loading }: Props) {
  const [search,        setSearch]        = useState("");
  const [showAdd,       setShowAdd]       = useState(false);
  const [showEdit,      setShowEdit]      = useState(false);
  const [editProduct,   setEditProduct]   = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [addLoading,    setAddLoading]    = useState(false);
  const [saveLoading,   setSaveLoading]   = useState(false);
  const [addError,      setAddError]      = useState("");
  const [addSuccess,    setAddSuccess]    = useState(false);

  const prodImgRef = useRef<HTMLInputElement>(null);
  const editImgRef = useRef<HTMLInputElement>(null);
  const [newProd, setNewProd] = useState(emptyNewProd());

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const uploadImg = async (file: File, path: string) => {
    const r = ref(storage, path);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  };

  const handleImgSelect = (e: React.ChangeEvent<HTMLInputElement>, forNew: boolean) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (forNew) setNewProd(p => ({ ...p, img: ev.target?.result as string, imgFile: f }));
      else setEditProduct(ep => ep ? { ...ep, img: ev.target?.result as string } : ep);
    };
    reader.readAsDataURL(f);
    if (!forNew) (editImgRef.current as any)._file = f;
  };

  const handleAdd = async () => {
    setAddError("");
    if (!newProd.name.trim()) { setAddError("Product name is required"); return; }
    if (!newProd.price)       { setAddError("Price is required"); return; }
    if (!auth.currentUser)    { setAddError("Please log in first"); return; }

    setAddLoading(true);
    try {
      let imgUrl = "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=300&q=80";
      if (newProd.imgFile) {
        imgUrl = await uploadImg(newProd.imgFile, `${auth.currentUser.uid}/products/${Date.now()}`);
      }
      await addDoc(collection(db, "products"), {
        vendorId:    auth.currentUser.uid,
        name:        newProd.name.trim(),
        price:       parseFloat(newProd.price) || 0,
        stock:       parseInt(newProd.stock) || 0,
        description: newProd.description.trim(),
        highlights:  newProd.highlights.trim(),   // NEW
        careInfo:    newProd.careInfo.trim(),      // NEW
        status:      "active",
        sales:       0,
        img:         imgUrl,
        category:    newProd.category,
        createdAt:   serverTimestamp(),
        shipping: {
          weightKg:     newProd.weightKg ? parseFloat(newProd.weightKg) : null,
          sizeCategory: newProd.sizeCategory || null,
          lengthCm:     newProd.lengthCm  ? parseFloat(newProd.lengthCm)  : null,
          widthCm:      newProd.widthCm   ? parseFloat(newProd.widthCm)   : null,
          heightCm:     newProd.heightCm  ? parseFloat(newProd.heightCm)  : null,
        },
      });
      setAddSuccess(true);
      setTimeout(() => {
        setAddSuccess(false);
        setNewProd(emptyNewProd());
        setShowAdd(false);
      }, 1200);
    } catch (err: any) {
      setAddError("Failed to add product: " + (err.message || "Unknown error"));
    } finally {
      setAddLoading(false);
    }
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    setAddError("");
    setAddSuccess(false);
    setNewProd(emptyNewProd());
  };

  const handleSaveEdit = async () => {
    if (!editProduct || !auth.currentUser) return;
    setSaveLoading(true);
    try {
      let imgUrl = editProduct.img;
      const editFile = (editImgRef.current as any)?._file;
      if (editFile) imgUrl = await uploadImg(editFile, `${auth.currentUser.uid}/products/${Date.now()}`);
      await updateDoc(doc(db, "products", editProduct.id), {
        name: editProduct.name, price: editProduct.price,
        stock: editProduct.stock, status: editProduct.status,
        category: editProduct.category, img: imgUrl,
        updatedAt: serverTimestamp(),
      });
      setShowEdit(false);
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteProduct) return;
    await deleteDoc(doc(db, "products", deleteProduct.id)).catch(console.error);
    setDeleteProduct(null);
  };

  const adjustStock = async (id: string, delta: number) => {
    const p = products.find(x => x.id === id); if (!p) return;
    const ns = Math.max(0, p.stock + delta);
    const status = ns <= 0 ? "out_of_stock" : p.status === "out_of_stock" ? "active" : p.status;
    await updateDoc(doc(db, "products", id), { stock: ns, status }).catch(console.error);
  };

  const toggleStatus = async (p: Product) => {
    const s = p.status === "active" ? "paused" : "active";
    await updateDoc(doc(db, "products", p.id), { status: s }).catch(console.error);
  };

  // ── Reusable themed field styles ──────────────────────────────────────────
  const fieldSection = (title: string, icon: React.ReactNode) => (
    <div style={{
      fontSize: 10, fontWeight: 800, color: "var(--text3)",
      textTransform: "uppercase" as const, letterSpacing: 0.8,
      display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
    }}>
      {icon} {title}
    </div>
  );

  return (
    <div className="vd-page vd-fade-up">

      {/* ── Styled Delete Modal ── */}
      {deleteProduct && (
        <DeleteModal
          product={deleteProduct}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteProduct(null)}
        />
      )}

      {/* Header */}
      <div className="vd-page-header">
        <div>
          <h1 className="vd-page-title">Products</h1>
          <p className="vd-page-sub">
            {products.length} total · {products.filter(p => p.status === "active").length} active
          </p>
        </div>
        <button className="vd-btn-primary" onClick={() => setShowAdd(true)}>
          <FiPlus size={15} /> Add Product
        </button>
      </div>

      {/* Search */}
      <div className="vd-search-row">
        <div className="vd-search-wrap">
          <FiSearch size={15} color="var(--text3)" />
          <input className="vd-search-input" placeholder="Search products…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="vd-icon-btn"><FiFilter size={16} /></button>
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="vd-loading">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="vd-empty-big">
          <FiPackage size={40} style={{ opacity: 0.3 }} />
          <div>{search ? "No products match your search" : "No products yet. Add your first one!"}</div>
          {!search && (
            <button className="vd-btn-primary" onClick={() => setShowAdd(true)}>
              <FiPlus size={15} /> Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="vd-products-grid">
          {filtered.map(p => (
            <div key={p.id} className="vd-prod-card">
              <div className="vd-prod-img">
                <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div className="vd-prod-overlay">
                  <button className="vd-prod-action-btn" onClick={() => { setEditProduct(p); setShowEdit(true); }}>
                    <FiEdit2 size={14} />
                  </button>
                  <button
                    className="vd-prod-action-btn danger"
                    onClick={() => setDeleteProduct(p)}   // ← styled modal, not confirm()
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="vd-prod-body">
                <div className="vd-prod-cat">{p.category}</div>
                <div className="vd-prod-name">{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div style={{ color: "#FF6B00", fontWeight: 800, fontSize: 14 }}>₦{p.price.toLocaleString()}</div>
                  <StatusBadge status={p.status} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, background: "var(--bg)", borderRadius: 10, padding: "7px 11px" }}>
                  <span style={{ color: "var(--text3)", fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>STOCK</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => adjustStock(p.id, -1)} style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "none", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FiMinus size={11} />
                    </button>
                    <span style={{ color: p.stock === 0 ? "#EF4444" : "#10B981", fontWeight: 800, fontSize: 15, minWidth: 24, textAlign: "center" }}>{p.stock}</span>
                    <button onClick={() => adjustStock(p.id, 1)} style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "none", color: "#10B981", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FiPlus size={11} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
                  <button onClick={() => toggleStatus(p)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, color: p.status === "active" ? "#EF4444" : "#10B981", fontFamily: "inherit" }}>
                    {p.status === "active" ? "⏸ Pause" : "▶ Activate"}
                  </button>
                  <span style={{ color: "var(--text3)", fontSize: 11 }}>{p.sales} sold</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════
          ADD PRODUCT MODAL — themed, with customer-facing fields
      ════════════════════════════════════════ */}
      {showAdd && createPortal(
        <div className="vd-modal-overlay" onClick={handleCloseAdd}>
          <div
            className="vd-modal vd-modal-lg"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column" }}
          >
            {/* Header */}
            <div className="vd-modal-header" style={{ flexShrink: 0 }}>
              <div>
                <span className="vd-modal-title">Add New Product</span>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, fontWeight: 600 }}>
                  Fill in what customers will see
                </div>
              </div>
              <button className="vd-modal-close" onClick={handleCloseAdd}><FiX size={16} /></button>
            </div>

            {addError && (
              <div className="vd-alert error" style={{ marginBottom: 14, flexShrink: 0 }}>
                <FiInfo size={14} /> {addError}
              </div>
            )}
            {addSuccess && (
              <div className="vd-alert success" style={{ marginBottom: 14, flexShrink: 0 }}>
                <FiCheckCircle size={14} /> Product added successfully!
              </div>
            )}

            {/* ── SECTION 1: Photo ── */}
            <div style={{
              background: "var(--bg)", borderRadius: 16, padding: "14px 16px",
              marginBottom: 16, border: "1px solid var(--border)", flexShrink: 0,
            }}>
              {fieldSection("Product Photo", "📸")}
              {newProd.img && (
                <img src={newProd.img} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12, marginBottom: 10 }} />
              )}
              <div
                className="vd-upload-area"
                onClick={() => prodImgRef.current?.click()}
                style={{ padding: 18 }}
              >
                <FiUpload size={20} color="#FF6B00" />
                <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 6 }}>
                  {newProd.img ? "Change product photo" : "Tap to upload product photo"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 3 }}>
                  JPG, PNG or WEBP · Recommended 800×800px
                </div>
                <input ref={prodImgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImgSelect(e, true)} />
              </div>
            </div>

            {/* ── SECTION 2: Basic Info ── */}
            <div style={{
              background: "var(--bg)", borderRadius: 16, padding: "14px 16px",
              marginBottom: 16, border: "1px solid var(--border)",
            }}>
              {fieldSection("Basic Info", "📋")}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="vd-field-label">Product Name *</label>
                  <input className="vd-field" placeholder="e.g. Jollof Rice, Ankara Fabric" value={newProd.name}
                    onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="vd-form-row" style={{ gap: 10 }}>
                  <div>
                    <label className="vd-field-label">Price (₦) *</label>
                    <input className="vd-field" type="number" placeholder="2500" value={newProd.price}
                      onChange={e => setNewProd(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div>
                    <label className="vd-field-label">Stock Quantity</label>
                    <input className="vd-field" type="number" placeholder="50" value={newProd.stock}
                      onChange={e => setNewProd(p => ({ ...p, stock: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="vd-field-label">Category</label>
                  <select className="vd-field" value={newProd.category}
                    onChange={e => setNewProd(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── SECTION 3: What customers will see ── */}
            <div style={{
              background: "var(--bg)", borderRadius: 16, padding: "14px 16px",
              marginBottom: 16, border: "1.5px solid rgba(255,107,0,0.2)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FiEye size={13} color="#FF6B00" />
                <span style={{ fontSize: 10, fontWeight: 800, color: "#FF6B00", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  What customers will see
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 16 }}>
                These fields appear on the product detail page when customers tap your product.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label className="vd-field-label">Product Description</label>
                  <textarea className="vd-field vd-textarea" rows={3}
                    placeholder="Describe your product — what is it, what makes it great, who is it for?"
                    value={newProd.description}
                    onChange={e => setNewProd(p => ({ ...p, description: e.target.value }))} />
                  <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, fontWeight: 600 }}>
                    💡 Good descriptions increase sales. Be specific and honest.
                  </div>
                </div>

                <div>
                  <label className="vd-field-label">Key Highlights / Features</label>
                  <textarea className="vd-field vd-textarea" rows={3}
                    placeholder={"List key features, one per line. e.g.:\n• 100% natural ingredients\n• Made fresh daily\n• Serves 2–3 people"}
                    value={newProd.highlights}
                    onChange={e => setNewProd(p => ({ ...p, highlights: e.target.value }))} />
                  <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, fontWeight: 600 }}>
                    Customers see this as a bullet list. Use • to separate points.
                  </div>
                </div>

                <div>
                  <label className="vd-field-label">Care / Usage Instructions</label>
                  <textarea className="vd-field vd-textarea" rows={2}
                    placeholder="e.g. Keep refrigerated · Best served hot · Hand wash only"
                    value={newProd.careInfo}
                    onChange={e => setNewProd(p => ({ ...p, careInfo: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* ── SECTION 4: Package / Shipping ── */}
            <div style={{
              background: "var(--bg)", borderRadius: 16, padding: "14px 16px",
              marginBottom: 16, border: "1px solid var(--border)",
            }}>
              {fieldSection("Package Info — helps customers see accurate delivery fees", "📦")}

              {/* Size category */}
              <div style={{ marginBottom: 14 }}>
                <label className="vd-field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FiPackage size={11} /> Package Size
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                  {(Object.entries(SIZE_PRESETS) as [SizeCategory, typeof SIZE_PRESETS[SizeCategory]][]).map(([key, preset]) => (
                    <button
                      type="button" key={key}
                      onClick={() => setNewProd(p => ({ ...p, sizeCategory: p.sizeCategory === key ? "" : key }))}
                      style={{
                        padding: "9px 11px", borderRadius: 11, border: "1.5px solid",
                        borderColor: newProd.sizeCategory === key ? "#FF6B00" : "var(--border)",
                        background: newProd.sizeCategory === key ? "rgba(255,107,0,0.1)" : "var(--inp)",
                        color: newProd.sizeCategory === key ? "#FF6B00" : "var(--text2)",
                        cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: "inherit",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{preset.label}</div>
                      <div style={{ fontSize: 10, color: newProd.sizeCategory === key ? "rgba(255,107,0,0.7)" : "var(--text3)", marginTop: 2, lineHeight: 1.3 }}>
                        {preset.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Weight */}
              <div style={{ marginBottom: 14 }}>
                <label className="vd-field-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TbWeight size={12} /> Weight
                  <span style={{ color: "var(--text3)", fontWeight: 500, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>— optional</span>
                </label>
                <div className="vd-field-wrap">
                  <input className="vd-field" type="number" min="0" step="0.1"
                    value={newProd.weightKg} placeholder="e.g. 1.5" style={{ paddingRight: 46 }}
                    onChange={e => setNewProd(p => ({ ...p, weightKg: e.target.value }))} />
                  <span className="vd-field-icon-right" style={{ pointerEvents: "none", fontSize: 11, fontWeight: 800, right: 12 }}>kg</span>
                </div>
              </div>

              {/* Dimensions — collapsible */}
              <div>
                <button type="button"
                  onClick={() => setNewProd(p => ({ ...p, showDims: !p.showDims }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, background: "none",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    color: newProd.showDims ? "#FF6B00" : "var(--text3)",
                    fontSize: 12, fontWeight: 700, padding: "4px 0",
                    marginBottom: newProd.showDims ? 12 : 0, transition: "color 0.15s",
                  }}
                >
                  <TbRulerMeasure size={14} />
                  {newProd.showDims ? "▲ Hide dimensions" : "▼ Add exact dimensions (L × W × H)"}
                </button>

                {newProd.showDims && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {[
                      { label: "Length (cm)", key: "lengthCm" as const, ph: "30", val: newProd.lengthCm },
                      { label: "Width (cm)",  key: "widthCm"  as const, ph: "20", val: newProd.widthCm  },
                      { label: "Height (cm)", key: "heightCm" as const, ph: "15", val: newProd.heightCm },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="vd-field-label">{f.label}</label>
                        <div className="vd-field-wrap">
                          <input className="vd-field" type="number" min="0" step="0.5"
                            value={f.val} placeholder={f.ph} style={{ paddingRight: 36 }}
                            onChange={e => setNewProd(p => ({ ...p, [f.key]: e.target.value }))} />
                          <span className="vd-field-icon-right" style={{ pointerEvents: "none", fontSize: 10, fontWeight: 800, right: 8 }}>cm</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 4, marginBottom: 8, flexShrink: 0 }}>
              <button className="vd-btn-outline" style={{ flex: 1 }} onClick={handleCloseAdd}>Cancel</button>
              <button
                className="vd-btn-primary"
                style={{ flex: 2, justifyContent: "center" }}
                onClick={handleAdd}
                disabled={addLoading || !newProd.name || !newProd.price}
              >
                {addLoading
                  ? <><Spinner size={15} /> Adding…</>
                  : <><FiPackage size={14} /> Add Product</>
                }
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════════════════════════════════
          EDIT PRODUCT MODAL
      ════════════════════════════════════════ */}
      {showEdit && editProduct && createPortal(
        <div className="vd-modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="vd-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="vd-modal-header">
              <span className="vd-modal-title">Edit Product</span>
              <button className="vd-modal-close" onClick={() => setShowEdit(false)}><FiX size={16} /></button>
            </div>
            {editProduct.img && (
              <img src={editProduct.img} alt="" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 12, marginBottom: 12 }} />
            )}
            <div className="vd-upload-area" onClick={() => editImgRef.current?.click()}>
              <FiUpload size={20} color="#FF6B00" />
              <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 6 }}>Change photo</div>
              <input ref={editImgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImgSelect(e, false)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              <div>
                <label className="vd-field-label">Product Name</label>
                <input className="vd-field" value={editProduct.name}
                  onChange={e => setEditProduct(ep => ep ? { ...ep, name: e.target.value } : ep)} />
              </div>
              <div className="vd-form-row" style={{ gap: 10 }}>
                <div>
                  <label className="vd-field-label">Price (₦)</label>
                  <input className="vd-field" type="number" value={editProduct.price}
                    onChange={e => setEditProduct(ep => ep ? { ...ep, price: +e.target.value } : ep)} />
                </div>
                <div>
                  <label className="vd-field-label">Stock</label>
                  <input className="vd-field" type="number" value={editProduct.stock}
                    onChange={e => setEditProduct(ep => ep ? { ...ep, stock: +e.target.value } : ep)} />
                </div>
              </div>
              <div>
                <label className="vd-field-label">Category</label>
                <select className="vd-field" value={editProduct.category}
                  onChange={e => setEditProduct(ep => ep ? { ...ep, category: e.target.value } : ep)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="vd-field-label">Status</label>
                <select className="vd-field" value={editProduct.status}
                  onChange={e => setEditProduct(ep => ep ? { ...ep, status: e.target.value } : ep)}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="vd-btn-outline" style={{ flex: 1 }} onClick={() => setShowEdit(false)}>Cancel</button>
              <button className="vd-btn-primary" style={{ flex: 1, justifyContent: "center" }}
                onClick={handleSaveEdit} disabled={saveLoading}>
                {saveLoading ? <><Spinner size={15} /> Saving…</> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}