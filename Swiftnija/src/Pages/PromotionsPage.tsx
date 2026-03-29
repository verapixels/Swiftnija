// ─────────────────────────────────────────────────────────────────────────────
// PromotionsPage.tsx — place at: src/pages/PromotionsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiZap, FiCheck, FiX, FiAlertCircle, FiClock, FiPackage,
  FiTrendingUp, FiImage, FiUpload, FiChevronRight,
  FiAlertTriangle, FiCheckCircle, FiXCircle, FiEdit2,
  FiRefreshCw, FiArrowRight, FiEye, FiBarChart2,
} from "react-icons/fi";
import { RiStore2Line, RiMegaphoneLine, RiSearchLine } from "react-icons/ri";
import {
  collection, addDoc, serverTimestamp, query,
  where, doc, updateDoc, onSnapshot, getDocs,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../firebase";
import type { AdPromotion, BannerData } from "../../adTypes";
import { AD_PLANS, BANNER_TEMPLATES, getDaysLeft, isExpiringSoon } from "../../adTypes";
import type { VendorProfile } from "../types";

const PAYSTACK_KEY = "pk_live_01f2a7cd8cfeeec9c44e2cad8a6b974c4665a9e5";
const A = "#FF6B00";

interface VendorProduct {
  id: string; name: string; img?: string | null;
  price?: string | number; category?: string;
}
type Props = { vendor: VendorProfile };

// ─── Plan Icon ────────────────────────────────────────────────────────────────
function PlanIcon({ iconKey, color, size = 22 }: { iconKey: string; color: string; size?: number }) {
  if (iconKey === "trending") return <FiTrendingUp size={size} color={color} />;
  if (iconKey === "search")   return <RiSearchLine size={size} color={color} />;
  if (iconKey === "banner")   return <FiImage size={size} color={color} />;
  return <FiZap size={size} color={color} />;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AdPromotion["status"] }) {
  const cfg = {
    active:        { bg: "rgba(16,185,129,0.12)",  color: "#10B981", label: "Active",        Icon: FiCheckCircle   },
    expired:       { bg: "rgba(100,100,120,0.14)", color: "#666",    label: "Expired",       Icon: FiXCircle       },
    cancelled:     { bg: "rgba(239,68,68,0.12)",   color: "#EF4444", label: "Cancelled",     Icon: FiXCircle       },
    expiring_soon: { bg: "rgba(245,158,11,0.14)",  color: "#F59E0B", label: "Expiring Soon", Icon: FiAlertTriangle },
  };
  const s = cfg[status] ?? cfg.expired;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 800, border: `1px solid ${s.color}30`, whiteSpace: "nowrap" }}>
      <s.Icon size={10} /> {s.label}
    </span>
  );
}

// ─── Banner Preview ───────────────────────────────────────────────────────────
function BannerPreview({ templateId, data, previewProducts }: { templateId: string; data: Partial<BannerData>; previewProducts?: VendorProduct[] }) {
  const tmpl = BANNER_TEMPLATES.find((t) => t.id === templateId) || BANNER_TEMPLATES[0];
  const s = tmpl.style;
  const prods = (previewProducts || []).slice(0, 3);
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", background: s.background, position: "relative", border: "1.5px solid rgba(255,255,255,0.1)" }}>
      <div style={{ position: "absolute", top: -40, right: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
      <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
          {data.logoUrl
            ? <img src={data.logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <RiStore2Line size={20} color={s.titleColor} />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: s.titleColor, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.storeName || "Your Store Name"}</div>
          <div style={{ fontSize: 11, color: s.subColor, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.tagline || "Your catchy tagline here"}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 8, background: s.ctaBackground, color: s.ctaColor, fontSize: 11, fontWeight: 800 }}>
            {data.ctaText || "Shop Now"} <FiChevronRight size={10} />
          </div>
        </div>
        {prods.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            {prods.map((p, i) => (
              <div key={i} style={{ width: 38, height: 38, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                {p.img
                  ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><FiPackage size={14} color={s.titleColor} /></div>
                }
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Selector ─────────────────────────────────────────────────────────
function ProductSelector({ products, selected, max, onChange }: { products: VendorProduct[]; selected: string[]; max: number; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--pt3)" }}>Select up to <strong style={{ color: A }}>{max} products</strong></span>
        <span style={{ fontSize: 12, color: A, fontWeight: 700 }}>{selected.length}/{max} selected</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
        {products.map((p) => {
          const sel = selected.includes(p.id);
          const disabled = selected.length >= max && !sel;
          return (
            <div key={p.id} onClick={() => !disabled && toggle(p.id)}
              style={{ background: sel ? `${A}14` : "var(--psurf2)", border: `1.5px solid ${sel ? A : "var(--pbrd)"}`, borderRadius: 11, padding: 9, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, position: "relative", transition: "all .15s" }}>
              {sel && (
                <div style={{ position: "absolute", top: 5, right: 5, width: 16, height: 16, borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FiCheck size={9} color="#fff" />
                </div>
              )}
              <div style={{ width: "100%", height: 56, borderRadius: 7, background: "var(--pbg)", marginBottom: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {p.img ? <img src={p.img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <FiPackage size={16} color="#555" />}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ptxt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              {p.price && <div style={{ fontSize: 10, color: A, fontWeight: 800, marginTop: 2 }}>₦{String(p.price)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Banner Builder Modal ─────────────────────────────────────────────────────
function BannerBuilderModal({ products, onSave, onClose, existingData, existingTemplateId }: {
  products: VendorProduct[];
  onSave: (templateId: string, data: BannerData) => void;
  onClose: () => void;
  existingData?: BannerData;
  existingTemplateId?: string;
}) {
  const [step, setStep] = useState<"template" | "details">("template");
  const [templateId, setTemplateId] = useState(existingTemplateId || "flame");
  const [form, setForm] = useState<BannerData>({
    storeName: existingData?.storeName || "",
    tagline: existingData?.tagline || "",
    logoUrl: existingData?.logoUrl || "",
    ctaText: existingData?.ctaText || "Shop Now",
    customBannerUrl: existingData?.customBannerUrl || "",
    selectedProducts: existingData?.selectedProducts || [],
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const logoRef  = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const previewProds = products.filter((p) => form.selectedProducts?.includes(p.id));

  const uploadFile = async (file: File, path: string, onDone: (url: string) => void, setLoading: (v: boolean) => void) => {
    setLoading(true); setUploadError("");
    try {
      const user = auth.currentUser; if (!user) return;
      const r = storageRef(storage, `${path}_${Date.now()}`);
      await uploadBytes(r, file);
      onDone(await getDownloadURL(r));
    } catch { setUploadError("Upload failed. Please try again."); }
    setLoading(false);
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", background: "var(--psurf2)",
    border: "1.5px solid var(--pbrd)", borderRadius: 11, color: "var(--ptxt)",
    fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", transition: "border-color .2s",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(10px)" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 740, maxHeight: "96vh", overflowY: "auto", scrollbarWidth: "none", background: "var(--pcard)", border: "1px solid var(--pbrd)", borderRadius: "20px 20px 0 0" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--pbrd)", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "var(--ptxt)" }}>Banner Designer</div>
            <div style={{ fontSize: 12, color: "var(--pt3)", marginTop: 2 }}>{step === "template" ? "Step 1 — Choose a template" : "Step 2 — Fill in your details"}</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: "var(--psurf2)", border: "1px solid var(--pbrd)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--pt3)" }}>
            <FiX size={15} />
          </button>
        </div>

        <div style={{ display: "flex", padding: "14px 20px 0", gap: 8 }}>
          {(["template", "details"] as const).map((s, i) => (
            <button key={s} onClick={() => setStep(s)}
              style={{ flex: 1, padding: "9px", background: step === s ? A : "transparent", border: `1.5px solid ${step === s ? A : "var(--pbrd)"}`, borderRadius: 10, color: step === s ? "#fff" : "var(--pt3)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all .18s" }}>
              {i + 1}. {s === "template" ? "Template" : "Your Details"}
            </button>
          ))}
        </div>

        <div style={{ padding: "18px 20px 36px" }}>
          {step === "template" ? (
            <>
              <div style={{ marginBottom: 18, padding: 14, background: "var(--psurf2)", borderRadius: 13, border: "1px solid var(--pbrd)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ptxt)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <FiUpload size={12} color={A} /> Upload Custom Banner
                  <span style={{ fontWeight: 600, color: "var(--pt3)", marginLeft: 4 }}>1200×400px · max 5MB</span>
                </div>
                {form.customBannerUrl ? (
                  <div>
                    <img src={form.customBannerUrl} alt="custom" style={{ width: "100%", height: 72, objectFit: "cover", borderRadius: 9, marginBottom: 8 }} />
                    <button onClick={() => setForm((f) => ({ ...f, customBannerUrl: "" }))} style={{ fontSize: 11, color: "#EF4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}>
                      <FiX size={10} /> Remove image
                    </button>
                  </div>
                ) : (
                  <button onClick={() => bannerRef.current?.click()}
                    style={{ width: "100%", padding: "10px 16px", borderRadius: 10, background: "transparent", border: "1.5px dashed var(--pbrd)", color: "var(--pt3)", fontSize: 12, fontWeight: 700, cursor: bannerUploading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                    <FiUpload size={12} /> {bannerUploading ? "Uploading…" : "Tap to upload your banner image"}
                  </button>
                )}
                <input ref={bannerRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, `banners/${auth.currentUser?.uid}/custom`, (url) => setForm((fv) => ({ ...fv, customBannerUrl: url })), setBannerUploading); }} />
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Or choose a designer template</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                {BANNER_TEMPLATES.map((tmpl) => (
                  <div key={tmpl.id} onClick={() => setTemplateId(tmpl.id)}
                    style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", border: `2.5px solid ${templateId === tmpl.id ? A : "transparent"}`, position: "relative", transition: "all .18s", transform: templateId === tmpl.id ? "scale(1.02)" : "scale(1)" }}>
                    {templateId === tmpl.id && (
                      <div style={{ position: "absolute", top: 7, right: 7, zIndex: 2, width: 20, height: 20, borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FiCheck size={11} color="#fff" />
                      </div>
                    )}
                    <div style={{ background: tmpl.style.background, padding: "13px 12px", minHeight: 64 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 11, fontWeight: 800, color: tmpl.style.titleColor, marginBottom: 2 }}>Sample Store</div>
                      <div style={{ fontSize: 9, color: tmpl.style.subColor, marginBottom: 6 }}>Your tagline</div>
                      <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: tmpl.style.ctaBackground, color: tmpl.style.ctaColor, fontSize: 9, fontWeight: 700 }}>Shop Now</div>
                    </div>
                    <div style={{ padding: "5px 10px", background: "var(--psurf2)", fontSize: 10, fontWeight: 700, color: "var(--ptxt)" }}>{tmpl.name}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={() => setStep("details")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 12, background: A, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  Next <FiChevronRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Live Preview</div>
                {form.customBannerUrl
                  ? <img src={form.customBannerUrl} alt="banner" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 13 }} />
                  : <BannerPreview templateId={templateId} data={form} previewProducts={previewProds} />
                }
              </div>
              {uploadError && (
                <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 10, color: "#EF4444", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <FiAlertCircle size={13} /> {uploadError}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Store Name *</label>
                  <input value={form.storeName} onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} placeholder="SwiftNija Mart" style={inp} onFocus={(e) => (e.target.style.borderColor = A)} onBlur={(e) => (e.target.style.borderColor = "var(--pbrd)")} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Tagline</label>
                  <input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="Best deals in Lagos" style={inp} onFocus={(e) => (e.target.style.borderColor = A)} onBlur={(e) => (e.target.style.borderColor = "var(--pbrd)")} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Button Text</label>
                  <input value={form.ctaText} onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))} placeholder="Shop Now" style={inp} onFocus={(e) => (e.target.style.borderColor = A)} onBlur={(e) => (e.target.style.borderColor = "var(--pbrd)")} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 9 }}>Store Logo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--psurf2)", border: "1.5px solid var(--pbrd)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {form.logoUrl
                      ? <img src={form.logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <RiStore2Line size={20} color="var(--pt3)" />
                    }
                  </div>
                  <button onClick={() => logoRef.current?.click()}
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "transparent", border: "1.5px dashed var(--pbrd)", color: "var(--pt3)", fontSize: 12, fontWeight: 700, cursor: logoUploading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                    <FiUpload size={13} /> {logoUploading ? "Uploading…" : "Upload Logo"}
                  </button>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, `banners/${auth.currentUser?.uid}/logo`, (url) => setForm((fv) => ({ ...fv, logoUrl: url })), setLogoUploading); }} />
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: "var(--pt3)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 10 }}>Product Previews on Banner (up to 3)</label>
                <ProductSelector products={products} selected={form.selectedProducts || []} max={3} onChange={(ids) => setForm((f) => ({ ...f, selectedProducts: ids }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("template")}
                  style={{ padding: "12px 18px", borderRadius: 12, background: "transparent", border: "1.5px solid var(--pbrd)", color: "var(--pt3)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  Back
                </button>
                <button onClick={() => { if (form.storeName.trim()) onSave(templateId, form); }}
                  disabled={!form.storeName.trim()}
                  style={{ flex: 1, padding: "12px 18px", borderRadius: 12, background: A, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: !form.storeName.trim() ? "not-allowed" : "pointer", opacity: !form.storeName.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'DM Sans',sans-serif" }}>
                  <FiCheck size={15} /> Save Banner
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main PromotionsPage
// ─────────────────────────────────────────────────────────────────────────────
export default function PromotionsPage({ vendor }: Props) {
  const [tab, setTab] = useState<"plans" | "my_ads">("plans");
  const [myAds, setMyAds] = useState<AdPromotion[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [managingAd, setManagingAd] = useState<AdPromotion | null>(null);
  const [managingProducts, setManagingProducts] = useState<string[]>([]);
  const [savingProducts, setSavingProducts] = useState(false);
  const [showBannerBuilder, setShowBannerBuilder] = useState(false);
  const [pendingBannerAd, setPendingBannerAd] = useState<AdPromotion | null>(null);

  const vendorId    = auth.currentUser?.uid || "";
  const vendorEmail = vendor.email;
  const vendorName  = vendor.name;
  const vendorLogo  = (vendor as any).logo || "";

  useEffect(() => {
    if (!vendorId) return;
    getDocs(query(collection(db, "products"), where("vendorId", "==", vendorId))).then((snap) => {
      setProducts(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, name: data.name || "Product",
          img: [data.images?.[0], data.image, data.img].find((u: any) => u && !u.includes("supabase")) ?? null,
          price: data.price, category: data.category,
        };
      }));
      setLoadingProds(false);
    }).catch(() => setLoadingProds(false));
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    return onSnapshot(
      query(collection(db, "adPromotions"), where("vendorId", "==", vendorId)),
      (snap) => {
        const now = new Date().toISOString();
        const ads = snap.docs.map((d) => {
          const a = { id: d.id, ...d.data() } as AdPromotion;
          if (a.status === "cancelled") return a;
          if (a.endDate < now) return { ...a, status: "expired" as const };
          if (isExpiringSoon(a.endDate)) return { ...a, status: "expiring_soon" as const };
          return { ...a, status: "active" as const };
        });
        setMyAds(ads.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      }
    );
  }, [vendorId]);

  const handlePay = useCallback((planType: string) => {
  const plan = AD_PLANS.find((p) => p.type === planType);
  if (!plan || !auth.currentUser) return;

  // ─── DEV BYPASS — remove before production ───────────────
  if (import.meta.env.DEV) {
    setPaying(true); setPayError(""); setPaySuccess("");
    const startDate = new Date().toISOString();
    const endDate   = new Date(Date.now() + plan.durationDays * 86_400_000).toISOString();
    addDoc(collection(db, "adPromotions"), {
      vendorId, vendorName, vendorLogo, type: plan.type, label: plan.label,
      price: plan.price, durationDays: plan.durationDays, startDate, endDate,
      paystackRef: `dev_test_${Date.now()}`, status: "active", selectedProducts: [],
      notifiedExpiry: false, createdAt: serverTimestamp(),
    }).then((docRef) => {
      const newAd: AdPromotion = {
        id: docRef.id, vendorId, vendorName, vendorLogo,
        type: plan.type as AdPromotion["type"], label: plan.label, price: plan.price,
        durationDays: plan.durationDays, startDate, endDate,
        paystackRef: `dev_test_${Date.now()}`, status: "active", selectedProducts: [],
      };
      setPaySuccess(plan.label); setSelectedPlan(null); setTab("my_ads"); setPaying(false);
      if (plan.type === "homepage_banner") {
        setPendingBannerAd(newAd); setShowBannerBuilder(true);
      } else {
        setManagingAd(newAd); setManagingProducts([]);
      }
      setTimeout(() => setPaySuccess(""), 6000);
    });
    return;
  }
  // ─────────────────────────────────────────────────────────

  // original Paystack code continues here (no second const handlePay)
  if (!window.PaystackPop) { setPayError("Paystack not loaded. Check your connection."); return; }
  setPaying(true); setPayError(""); setPaySuccess("");
  const handler = window.PaystackPop.setup({
    key: PAYSTACK_KEY, email: vendorEmail, amount: plan.price * 100, currency: "NGN",
    ref: `ad_${vendorId}_${Date.now()}`, metadata: { vendor_id: vendorId, ad_type: plan.type },
    onCancel: () => setPaying(false),
    onSuccess: async (res: { reference: string }) => {
      // ... rest unchanged
    },
  });
  handler.openIframe();
}, [vendorId, vendorEmail, vendorName, vendorLogo]); // ← only ONE closing here

  const saveProducts = async () => {
    if (!managingAd?.id) return;
    setSavingProducts(true);
    await updateDoc(doc(db, "adPromotions", managingAd.id), { selectedProducts: managingProducts });
    setSavingProducts(false); setManagingAd(null);
  };

  const saveBanner = async (templateId: string, bannerData: BannerData) => {
    const ad = pendingBannerAd || managingAd;
    if (!ad?.id) return;
    await updateDoc(doc(db, "adPromotions", ad.id), { bannerTemplateId: templateId, bannerData, selectedProducts: bannerData.selectedProducts || [] });
    setShowBannerBuilder(false); setPendingBannerAd(null); setManagingAd(null);
  };

  const cancelAd = async (adId: string) => {
    if (!window.confirm("Cancel this ad? It will stop showing immediately.")) return;
    await updateDoc(doc(db, "adPromotions", adId), { status: "cancelled" });
  };

  const activeAds   = myAds.filter((a) => a.status === "active" || a.status === "expiring_soon");
  const inactiveAds = myAds.filter((a) => a.status === "expired"  || a.status === "cancelled");

  // Clean vendor-facing descriptions — no internal rotation detail
  const PLAN_DESCS: Record<string, string> = {
    trending_homepage: "Your products appear in the Trending section when customers open the app — premium placement right at the top of the homepage for maximum visibility.",
    search_priority:   "Your products appear at the very top of search results when customers search for matching keywords — above all other listings.",
    search_trending:   "Your products are featured in the Trending Now section on the search page, shown to customers as they browse before typing a search.",
    homepage_banner:   "A full-width branded banner for your store placed right after the categories on the homepage. Choose from 15 designer templates or upload your own image.",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
        :root {
          --pbg:#0a0a10; --psurf:#111118; --psurf2:#18181f; --pcard:#13131b;
          --pbrd:#1e1e2e; --ptxt:#e8e8f4; --pt2:#9898b8; --pt3:#55556a; --paccent:#FF6B00;
        }
        [data-theme="light"] {
          --pbg:#f0f0f8; --psurf:#fff; --psurf2:#f4f4fc; --pcard:#fff;
          --pbrd:#e0e0f0; --ptxt:#111120; --pt2:#55556a; --pt3:#9898b8;
        }
        .promo-root { font-family:'DM Sans',sans-serif; }
        @keyframes p-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .p-fade { animation:p-in .3s ease both; }

        .plan-card {
          background:var(--pcard); border:1.5px solid var(--pbrd); border-radius:18px;
          padding:20px; cursor:pointer; position:relative; overflow:hidden;
          transition:border-color .2s,transform .2s,box-shadow .2s;
        }
        .plan-card:hover { transform:translateY(-3px); }
        .plan-card.sel   { transform:translateY(-3px); }

        .prog-bar  { height:4px; border-radius:4px; background:var(--pbrd); overflow:hidden; }
        .prog-fill { height:100%; border-radius:4px; transition:width .4s ease; }

        .tab-row { display:flex; gap:8px; margin-bottom:26px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .tab-row::-webkit-scrollbar { display:none; }
        .tab-btn {
          padding:9px 18px; border-radius:30px; border:1.5px solid var(--pbrd);
          background:transparent; color:var(--pt2); font-size:13px; font-weight:700;
          cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .18s; white-space:nowrap; flex-shrink:0;
        }
        .tab-btn.active { background:var(--paccent); border-color:var(--paccent); color:#fff; }

        .how-grid {
          display:grid; grid-template-columns:repeat(2,1fr); gap:9px; margin-bottom:24px;
        }
        @media(min-width:680px) { .how-grid { grid-template-columns:repeat(4,1fr); } }

        .how-card {
          padding:13px; background:var(--psurf2); border:1px solid var(--pbrd);
          border-radius:12px; display:flex; align-items:flex-start; gap:10px;
        }

        .plans-grid {
          display:grid; grid-template-columns:1fr; gap:12px; margin-bottom:10px;
        }
        @media(min-width:520px)  { .plans-grid { grid-template-columns:repeat(2,1fr); } }
        @media(min-width:900px)  { .plans-grid { grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); } }

        .p-badge {
          position:absolute; top:12px; right:12px; padding:3px 9px; border-radius:20px;
          font-size:10px; font-weight:800; white-space:nowrap;
        }

        .cta-bar {
          display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;
          gap:12px; padding:16px 18px; background:var(--psurf2); border:1.5px solid var(--pbrd);
          border-radius:16px; margin-top:16px; animation:p-in .25s ease;
        }
        .cta-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        @media(max-width:500px) {
          .cta-bar     { flex-direction:column; align-items:stretch; }
          .cta-actions { flex-direction:column; }
          .cta-actions .p-btn { justify-content:center; }
        }

        .p-btn {
          display:flex; align-items:center; gap:7px; padding:11px 20px;
          border-radius:12px; border:none; cursor:pointer; font-size:14px; font-weight:800;
          font-family:'DM Sans',sans-serif; transition:transform .15s,box-shadow .15s;
        }
        .p-btn:active { transform:scale(.97); }
        .p-btn-outline {
          display:flex; align-items:center; gap:5px; padding:8px 13px;
          border-radius:10px; background:transparent; border:1.5px solid var(--pbrd);
          color:var(--pt2); font-size:12px; font-weight:700; cursor:pointer;
          font-family:'DM Sans',sans-serif; transition:all .18s; white-space:nowrap;
        }
        .p-btn-outline:hover { border-color:var(--paccent); color:var(--paccent); }

        .p-alert {
          display:flex; align-items:flex-start; gap:10px; padding:12px 15px;
          border-radius:12px; border:1px solid; font-size:13px; font-weight:600;
          margin-bottom:13px; animation:p-in .25s ease; line-height:1.5;
        }

        .ad-row {
          background:var(--pcard); border:1.5px solid var(--pbrd);
          border-radius:16px; padding:16px; transition:border-color .2s;
        }
        .ad-row:hover { border-color:rgba(255,107,0,0.25); }
        .ad-actions { display:flex; gap:8px; flex-wrap:wrap; }

        .stat-chip {
          display:flex; align-items:center; gap:5px; padding:5px 11px;
          border-radius:20px; background:var(--psurf2); border:1px solid var(--pbrd);
          font-size:11px; font-weight:700; color:var(--pt2);
        }

        .past-ad-row {
          display:flex; align-items:center; gap:12px; padding:13px 16px; flex-wrap:wrap;
        }
        @media(max-width:440px) {
          .past-ad-row { flex-direction:column; align-items:flex-start; gap:8px; }
        }
      `}</style>

      <script src="https://js.paystack.co/v1/inline.js" async />

      <div className="promo-root">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(255,107,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <RiMegaphoneLine size={18} color={A} />
              </div>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "clamp(20px,5vw,26px)", fontWeight: 900, color: "var(--ptxt)", margin: 0 }}>Promotions & Ads</h1>
            </div>
            <p style={{ fontSize: 13, color: "var(--pt2)", paddingLeft: 46 }}>Boost visibility · Get more orders · Grow faster</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="stat-chip"><FiBarChart2 size={12} color={A} /><span style={{ color: "var(--ptxt)" }}>{activeAds.length}</span> Active</div>
            <div className="stat-chip"><FiClock size={12} />{myAds.length} Total</div>
          </div>
        </div>

        {/* Alerts */}
        {paySuccess && (
          <div className="p-alert" style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)", color: "#10B981" }}>
            <FiCheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong>{paySuccess}</strong> is now live! Select your products below.</span>
          </div>
        )}
        {payError && (
          <div className="p-alert" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)", color: "#EF4444" }}>
            <FiAlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{payError}</span>
          </div>
        )}
        {myAds.some((a) => a.status === "expiring_soon") && (
          <div className="p-alert" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.22)", color: "#F59E0B" }}>
            <FiAlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>You have ads expiring in 1–2 days. Renew now to keep your visibility.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="tab-row">
          <button className={`tab-btn ${tab === "plans" ? "active" : ""}`} onClick={() => setTab("plans")}>Ad Packages</button>
          <button className={`tab-btn ${tab === "my_ads" ? "active" : ""}`} onClick={() => setTab("my_ads")}>
            My Ads {myAds.length > 0 && `(${myAds.length})`}
          </button>
        </div>

        {/* ── TAB: Plans ── */}
        {tab === "plans" && (
          <div className="p-fade">
            <div className="how-grid">
              {[
                { icon: <FiZap size={13} color={A} />,       title: "Pay Weekly",        desc: "Renew each week to stay visible"  },
                { icon: <FiPackage size={13} color={A} />,   title: "Pick Products",     desc: "Choose which products to feature" },
                { icon: <FiEye size={13} color={A} />,       title: "Go Live Instantly", desc: "Your ad starts right away"        },
                { icon: <FiRefreshCw size={13} color={A} />, title: "Cancel Anytime",    desc: "No lock-in, full control"         },
              ].map((item, i) => (
                <div key={i} className="how-card">
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,107,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ptxt)" }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "var(--pt3)", marginTop: 2 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="plans-grid">
              {AD_PLANS.map((plan) => {
                const isSel = selectedPlan === plan.type;
                const activeForType = myAds.find((a) => a.type === plan.type && (a.status === "active" || a.status === "expiring_soon"));
                return (
                  <div key={plan.type} className={`plan-card ${isSel ? "sel" : ""}`}
                    onClick={() => setSelectedPlan(isSel ? null : plan.type)}
                    style={{ borderColor: isSel ? plan.color : activeForType ? `${plan.color}50` : "var(--pbrd)", boxShadow: isSel ? `0 14px 40px ${plan.color}20` : "none" }}>
                    <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at 80% 20%,${plan.color}12,transparent 70%)`, pointerEvents: "none" }} />

                    {plan.badge && (
                      <div className="p-badge" style={{ background: `${plan.color}18`, color: plan.color, border: `1px solid ${plan.color}30` }}>{plan.badge}</div>
                    )}
                    {activeForType && (
                      <div className="p-badge" style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)", right: plan.badge ? 110 : 12 }}>
                        <FiCheckCircle size={9} style={{ display: "inline", marginRight: 3 }} />Running
                      </div>
                    )}

                    <div style={{ width: 44, height: 44, borderRadius: 13, background: `${plan.color}14`, border: `1.5px solid ${plan.color}28`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                      <PlanIcon iconKey={plan.iconKey} color={plan.color} size={20} />
                    </div>

                    <h4 style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, color: "var(--ptxt)", marginBottom: 7 }}>{plan.label}</h4>
                    <p style={{ color: "var(--pt3)", fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>{PLAN_DESCS[plan.type] || plan.desc}</p>

                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      {[
                        { label: "Max Products", val: String(plan.maxProducts) },
                        { label: "Billing",      val: "Weekly"                 },
                      ].map((s) => (
                        <div key={s.label} style={{ flex: 1, padding: "9px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid var(--pbrd)" }}>
                          <div style={{ fontSize: 10, color: "var(--pt3)", fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: plan.color, fontFamily: "'Syne',sans-serif" }}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--pt3)", marginBottom: 2 }}>Per week</div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: isSel ? plan.color : "var(--ptxt)" }}>₦{plan.price.toLocaleString()}</div>
                      </div>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: isSel ? plan.color : "var(--psurf2)", border: `1.5px solid ${isSel ? plan.color : "var(--pbrd)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .18s" }}>
                        {isSel ? <FiCheck size={14} color="#fff" /> : <FiArrowRight size={14} color="var(--pt3)" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedPlan && (() => {
              const plan = AD_PLANS.find((p) => p.type === selectedPlan)!;
              return (
                <div className="cta-bar" style={{ borderColor: `${plan.color}40`, background: `${plan.color}06` }}>
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, color: "var(--ptxt)", marginBottom: 3 }}>{plan.label}</div>
                    <div style={{ color: "var(--pt3)", fontSize: 12 }}>Weekly · starts immediately after payment</div>
                  </div>
                  <div className="cta-actions">
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: plan.color }}>₦{plan.price.toLocaleString()}</div>
                    <button className="p-btn-outline" onClick={() => setSelectedPlan(null)}><FiX size={14} /></button>
                    <button className="p-btn" onClick={() => handlePay(selectedPlan)} disabled={paying}
                      style={{ background: `linear-gradient(135deg,${plan.color},${plan.accentColor})`, color: "#fff", opacity: paying ? 0.7 : 1, boxShadow: `0 6px 22px ${plan.color}30` }}>
                      <FiZap size={14} /> {paying ? "Processing…" : "Pay with Paystack"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB: My Ads ── */}
        {tab === "my_ads" && (
          <div className="p-fade">
            {myAds.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,107,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                  <FiZap size={26} color={A} />
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800, color: "var(--ptxt)", marginBottom: 9 }}>No ads yet</div>
                <p style={{ fontSize: 13, color: "var(--pt2)", marginBottom: 22, lineHeight: 1.7 }}>Run your first ad to reach more customers today.</p>
                <button className="p-btn" onClick={() => setTab("plans")} style={{ background: A, color: "#fff", display: "inline-flex", margin: "0 auto" }}>
                  Browse Ad Packages <FiChevronRight size={14} />
                </button>
              </div>
            ) : (
              <>
                {activeAds.length > 0 && (
                  <div style={{ marginBottom: 30 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "var(--ptxt)", marginBottom: 13, display: "flex", alignItems: "center", gap: 7 }}>
                      <FiCheckCircle size={13} color="#10B981" /> Running Ads
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {activeAds.map((ad) => {
                        const plan    = AD_PLANS.find((p) => p.type === ad.type)!;
                        const dLeft   = getDaysLeft(ad.endDate);
                        const pct     = Math.max(0, Math.min(100, ((ad.durationDays - dLeft) / ad.durationDays) * 100));
                        const noProds = ad.selectedProducts.length === 0;
                        return (
                          <div key={ad.id} className="ad-row" style={{ borderColor: noProds ? `${A}40` : "var(--pbrd)" }}>
                            {noProds && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", background: "rgba(255,107,0,0.08)", borderRadius: 9, marginBottom: 12, fontSize: 12, color: A, fontWeight: 700 }}>
                                <FiAlertCircle size={12} /> No products selected — your ad won't show until you add products.
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 13 }}>
                              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${plan.color}14`, border: `1.5px solid ${plan.color}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <PlanIcon iconKey={plan.iconKey} color={plan.color} size={18} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "var(--ptxt)", marginBottom: 6 }}>{ad.label}</div>
                                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                                  <StatusBadge status={ad.status} />
                                  <span style={{ fontSize: 11, color: "var(--pt3)" }}>{ad.selectedProducts.length}/{plan.maxProducts} products</span>
                                  <span style={{ fontSize: 11, color: dLeft <= 2 ? "#F59E0B" : "var(--pt3)", fontWeight: dLeft <= 2 ? 800 : 400, display: "flex", alignItems: "center", gap: 3 }}>
                                    <FiClock size={10} /> {dLeft} day{dLeft !== 1 ? "s" : ""} left
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="prog-bar" style={{ marginBottom: 13 }}>
                              <div className="prog-fill" style={{ width: `${pct}%`, background: dLeft <= 2 ? "#F59E0B" : plan.color }} />
                            </div>

                            {ad.type === "homepage_banner" && ad.bannerData && (
                              <div style={{ marginBottom: 13 }}>
                                <BannerPreview templateId={ad.bannerTemplateId || "flame"} data={ad.bannerData} />
                              </div>
                            )}

                            <div className="ad-actions">
                              {ad.type === "homepage_banner" ? (
                                <button className="p-btn-outline" onClick={() => { setManagingAd(ad); setShowBannerBuilder(true); }}>
                                  <FiEdit2 size={12} /> {ad.bannerData ? "Edit Banner" : "Design Banner"}
                                </button>
                              ) : (
                                <button className="p-btn-outline" onClick={() => { setManagingAd(ad); setManagingProducts(ad.selectedProducts); }}>
                                  <FiPackage size={12} /> {noProds ? "Add Products" : "Manage Products"}
                                </button>
                              )}
                              <button className="p-btn-outline" onClick={() => { setSelectedPlan(ad.type); setTab("plans"); }}>
                                <FiRefreshCw size={12} /> Renew
                              </button>
                              <button onClick={() => cancelAd(ad.id!)}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                                <FiX size={12} /> Cancel
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inactiveAds.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "var(--ptxt)", marginBottom: 13, display: "flex", alignItems: "center", gap: 7 }}>
                      <FiXCircle size={13} color="var(--pt3)" /> Past Ads
                    </div>
                    <div style={{ background: "var(--pcard)", border: "1px solid var(--pbrd)", borderRadius: 16, overflow: "hidden" }}>
                      {inactiveAds.map((ad, i) => (
                        <div key={ad.id} className="past-ad-row" style={{ borderBottom: i < inactiveAds.length - 1 ? "1px solid var(--pbrd)" : "none" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(100,100,120,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <PlanIcon iconKey={AD_PLANS.find((p) => p.type === ad.type)?.iconKey || "zap"} color="var(--pt3)" size={15} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ptxt)", opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.label}</div>
                            <div style={{ fontSize: 11, color: "var(--pt3)" }}>
                              {new Date(ad.startDate).toLocaleDateString("en-NG")} — {new Date(ad.endDate).toLocaleDateString("en-NG")}
                            </div>
                          </div>
                          <div>
                            <StatusBadge status={ad.status} />
                            <div style={{ fontSize: 11, color: "var(--pt3)", marginTop: 4 }}>₦{ad.price?.toLocaleString()}</div>
                          </div>
                          <button className="p-btn-outline" onClick={() => { setSelectedPlan(ad.type); setTab("plans"); }} style={{ fontSize: 11, flexShrink: 0 }}>
                            <FiRefreshCw size={10} /> Renew
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Product selection bottom sheet */}
        {managingAd && managingAd.type !== "homepage_banner" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(10px)" }}>
            <div style={{ width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", scrollbarWidth: "none", background: "var(--pcard)", border: "1px solid var(--pbrd)", borderRadius: "20px 20px 0 0", paddingBottom: 36 }}>
              <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--pbrd)", margin: "12px auto 0" }} />
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 900, color: "var(--ptxt)" }}>Select Products for Ad</div>
                  <button onClick={() => setManagingAd(null)} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--psurf2)", border: "1px solid var(--pbrd)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--pt3)" }}>
                    <FiX size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "var(--pt3)", marginBottom: 18 }}>
                  {managingAd.label} · max <strong style={{ color: A }}>{AD_PLANS.find((p) => p.type === managingAd.type)?.maxProducts}</strong> products
                </div>
                {loadingProds
                  ? <div style={{ textAlign: "center", padding: 40, color: "var(--pt3)", fontSize: 13 }}>Loading your products…</div>
                  : products.length === 0
                    ? <div style={{ textAlign: "center", padding: 40, color: "var(--pt3)", fontSize: 13 }}>No products found in your store. Add products first.</div>
                    : <ProductSelector products={products} selected={managingProducts} max={AD_PLANS.find((p) => p.type === managingAd.type)?.maxProducts || 10} onChange={setManagingProducts} />
                }
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => setManagingAd(null)} style={{ padding: "12px 18px", borderRadius: 12, background: "transparent", border: "1.5px solid var(--pbrd)", color: "var(--pt3)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
                  <button className="p-btn" onClick={saveProducts} disabled={savingProducts || managingProducts.length === 0}
                    style={{ flex: 2, background: A, color: "#fff", opacity: managingProducts.length === 0 ? 0.5 : 1, justifyContent: "center" }}>
                    <FiCheck size={14} /> {savingProducts ? "Saving…" : `Save ${managingProducts.length} Product${managingProducts.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Banner builder modal */}
        {showBannerBuilder && (
          <BannerBuilderModal
            products={products}
            onSave={saveBanner}
            onClose={() => { setShowBannerBuilder(false); setPendingBannerAd(null); if (managingAd?.type === "homepage_banner") setManagingAd(null); }}
            existingData={managingAd?.bannerData}
            existingTemplateId={managingAd?.bannerTemplateId}
          />
        )}
      </div>
    </>
  );
}