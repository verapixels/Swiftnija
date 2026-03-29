// pages/admin/Discount.tsx
import { useState, useEffect } from "react";
import {
  collection, query, onSnapshot, orderBy, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, where, Timestamp, getDocs, writeBatch, getDoc,  // ← add getDoc here
} from "firebase/firestore"; 
import { db } from "../firebase";
import {
  RiPriceTag3Line, RiAddLine, RiDeleteBinLine, RiEditLine,
  RiCheckLine, RiCloseLine, RiTimeLine, RiUserLine,
  RiStoreLine, RiShoppingBagLine, RiInformationLine,
  RiSearchLine, RiFilterLine, RiDownload2Line,
} from "react-icons/ri";

interface DiscountDoc {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perUserLimit?: number;
  applicableTo: "all" | "vendors" | "categories";
  vendorIds?: string[];
  categories?: string[];
  startDate: Timestamp;
  endDate: Timestamp;
  status: "active" | "expired" | "disabled";
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  description?: string;
}

export default function DiscountPage({ adminUser, showToast, C }: any) {
  const [discounts, setDiscounts] = useState<DiscountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DiscountDoc | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  const isSuperAdmin = adminUser?.role === "superadmin";

  // Form state
  const [form, setForm] = useState({
    code: "",
    type: "percentage" as "percentage" | "fixed",
    value: 0,
    minOrderAmount: 0,
    maxDiscount: 0,
    usageLimit: 0,
    perUserLimit: 1,
    applicableTo: "all" as "all" | "vendors" | "categories",
    vendorIds: [] as string[],
    categories: [] as string[],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    description: "",
  });

  useEffect(() => {
    // Load discounts
    const q = query(collection(db, "discounts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountDoc)));
      setLoading(false);
    });

    // Load vendors for filtering
    getDocs(collection(db, "vendors")).then(snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, name: d.data().businessName || d.data().name || "Unknown" })));
    });

    // Load categories from settings
    getDoc(doc(db, "settings", "platform")).then(snap => {
      if (snap.exists()) {
        const cats = snap.data().categories?.split(",").map((c: string) => c.trim()) || [];
        setCategories(cats);
      }
    });

    return () => unsub();
  }, []);

  const generateCode = () => {
    const prefix = "SWIFT";
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    setForm(f => ({ ...f, code: `${prefix}${random}` }));
  };

  const validateForm = () => {
    if (!form.code.trim()) { showToast("Enter a discount code", "error"); return false; }
    if (form.value <= 0) { showToast("Enter a valid discount value", "error"); return false; }
    if (form.type === "percentage" && form.value > 100) { showToast("Percentage cannot exceed 100%", "error"); return false; }
    if (new Date(form.endDate) <= new Date(form.startDate)) { showToast("End date must be after start date", "error"); return false; }
    if (form.applicableTo === "vendors" && form.vendorIds.length === 0) { showToast("Select at least one vendor", "error"); return false; }
    if (form.applicableTo === "categories" && form.categories.length === 0) { showToast("Select at least one category", "error"); return false; }
    return true;
  };

  const saveDiscount = async () => {
    if (!validateForm()) return;

    const discountData = {
      code: form.code.toUpperCase(),
      type: form.type,
      value: form.value,
      minOrderAmount: form.minOrderAmount || null,
      maxDiscount: form.maxDiscount || null,
      usageLimit: form.usageLimit || null,
      usedCount: editing ? editing.usedCount : 0,
      perUserLimit: form.perUserLimit || 1,
      applicableTo: form.applicableTo,
      vendorIds: form.applicableTo === "vendors" ? form.vendorIds : [],
      categories: form.applicableTo === "categories" ? form.categories : [],
      startDate: Timestamp.fromDate(new Date(form.startDate)),
      endDate: Timestamp.fromDate(new Date(form.endDate)),
      status: new Date(form.startDate) > new Date() ? "active" : 
              new Date(form.endDate) < new Date() ? "expired" : "active",
      createdBy: adminUser?.uid,
      createdByName: adminUser?.displayName || adminUser?.email,
      createdAt: editing ? editing.createdAt : serverTimestamp(),
      description: form.description || null,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editing) {
        await updateDoc(doc(db, "discounts", editing.id), discountData);
        showToast("Discount updated successfully", "success");
      } else {
        // Check if code exists
        const existing = await getDocs(
          query(collection(db, "discounts"), where("code", "==", form.code.toUpperCase()))
        );
        if (!existing.empty) {
          showToast("Discount code already exists", "error");
          return;
        }
        await addDoc(collection(db, "discounts"), discountData);
        showToast("Discount created successfully", "success");
      }
      setShowModal(false);
      setEditing(null);
      resetForm();
    } catch (error) {
      showToast("Failed to save discount", "error");
    }
  };

  const deleteDiscount = async (id: string) => {
    if (!isSuperAdmin) { showToast("Only Super Admin can delete discounts", "error"); return; }
    if (!confirm("Are you sure you want to delete this discount?")) return;
    await deleteDoc(doc(db, "discounts", id));
    showToast("Discount deleted", "info");
  };

  const toggleStatus = async (discount: DiscountDoc) => {
    if (!isSuperAdmin) { showToast("Only Super Admin can change status", "error"); return; }
    const newStatus = discount.status === "active" ? "disabled" : "active";
    await updateDoc(doc(db, "discounts", discount.id), { status: newStatus });
    showToast(`Discount ${newStatus}`, "success");
  };

  const resetForm = () => {
    setForm({
      code: "",
      type: "percentage",
      value: 0,
      minOrderAmount: 0,
      maxDiscount: 0,
      usageLimit: 0,
      perUserLimit: 1,
      applicableTo: "all",
      vendorIds: [],
      categories: [],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      description: "",
    });
  };

  const filtered = discounts.filter(d => {
    const matchesSearch = d.code.toLowerCase().includes(search.toLowerCase()) || 
                         (d.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || d.status === filter;
    return matchesSearch && matchesFilter;
  });

  const inpStyle = {
    width: "100%", padding: "10px 12px",
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 10, color: C.text, fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", outline: "none",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            Discounts & Promotions
          </h1>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {discounts.length} active discount codes · {discounts.filter(d => d.status === "active").length} active
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 12,
              background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`,
              border: "none", color: "white", fontWeight: 700,
              cursor: "pointer", fontSize: 13,
            }}
          >
            <RiAddLine size={16} /> Create Discount
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted }}>
            <RiSearchLine size={14} />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search discounts..."
            style={{ ...inpStyle, paddingLeft: 38 }}
          />
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ ...inpStyle, width: "auto", minWidth: 120 }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>Loading discounts...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.muted }}>
          <RiPriceTag3Line size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>No discounts found</div>
          {isSuperAdmin && <div style={{ fontSize: 13, marginTop: 8 }}>Create your first promotion to start offering deals!</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map(d => {
            const now = new Date();
            const start = d.startDate?.toDate();
            const end = d.endDate?.toDate();
            const isActive = d.status === "active" && start <= now && end >= now;
            const isExpired = end < now;
            const usage = d.usageLimit ? `${d.usedCount}/${d.usageLimit}` : `${d.usedCount} used`;

            return (
              <div
                key={d.id}
                style={{
                  background: C.surface, border: `1px solid ${isActive ? C.green + "44" : C.border}`,
                  borderRadius: 16, overflow: "hidden", position: "relative",
                  boxShadow: isActive ? `0 4px 16px ${C.green}22` : "none",
                }}
              >
                {isActive && (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    background: C.green, color: "white", fontSize: 10,
                    fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                  }}>
                    ACTIVE
                  </div>
                )}
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: isActive ? `${C.green}18` : C.surface2,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: isActive ? C.green : C.muted,
                    }}>
                      <RiPriceTag3Line size={20} />
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, color: C.text }}>
                        {d.code}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        Created by {d.createdByName || "Admin"} · {d.createdAt?.toDate?.().toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: C.orange, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {d.type === "percentage" ? `${d.value}% OFF` : `₦${d.value.toLocaleString()} OFF`}
                    </div>
                    {(d.minOrderAmount ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Min. order: ₦{d.minOrderAmount!.toLocaleString()}
                 </div>
                )}
                  </div>

                  <div style={{ fontSize: 13, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>
                    {d.description || `Get ${d.type === "percentage" ? d.value + "%" : "₦" + d.value} off your order`}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Valid From</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                        {start?.toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Valid Until</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isExpired ? C.red : C.text }}>
                        {end?.toLocaleDateString()}
                        {isExpired && " (Expired)"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>
                      Applicable to
                    </div>
                    <div style={{ fontSize: 12, color: C.text }}>
                      {d.applicableTo === "all" && "All products"}
                      {d.applicableTo === "vendors" && `Selected vendors (${d.vendorIds?.length || 0})`}
                      {d.applicableTo === "categories" && `Selected categories (${d.categories?.length || 0})`}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted }}>Usage</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{usage}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {isSuperAdmin && (
                        <>
                          <button
                            onClick={() => toggleStatus(d)}
                            style={{
                              padding: "6px 12px", borderRadius: 8,
                              background: d.status === "active" ? `${C.yellow}15` : `${C.green}15`,
                              border: "none", color: d.status === "active" ? C.yellow : C.green,
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {d.status === "active" ? "Disable" : "Enable"}
                          </button>
                          <button
                            onClick={() => { setEditing(d); setShowModal(true); }}
                            style={{
                              padding: "6px", borderRadius: 8,
                              background: C.surface2, border: `1px solid ${C.border}`,
                              color: C.muted, cursor: "pointer", display: "flex",
                            }}
                          >
                            <RiEditLine size={14} />
                          </button>
                          <button
                            onClick={() => deleteDiscount(d.id)}
                            style={{
                              padding: "6px", borderRadius: 8,
                              background: `${C.red}12`, border: `1px solid ${C.red}28`,
                              color: C.red, cursor: "pointer", display: "flex",
                            }}
                          >
                            <RiDeleteBinLine size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          backdropFilter: "blur(8px)",
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 24,
            width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 28 }}>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 20 }}>
                {editing ? "Edit Discount" : "Create New Discount"}
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Code */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                    Discount Code *
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g., SWIFT20"
                      style={{ ...inpStyle, flex: 1, textTransform: "uppercase" }}
                      maxLength={20}
                    />
                    <button
                      onClick={generateCode}
                      style={{
                        padding: "0 16px", borderRadius: 10, background: C.surface2,
                        border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer",
                        fontWeight: 700, fontSize: 12,
                      }}
                    >
                      Generate
                    </button>
                  </div>
                </div>

                {/* Type & Value */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Discount Type *
                    </label>
                    <select
                      value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value as "percentage" | "fixed" }))}
                      style={inpStyle}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (₦)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Value *
                    </label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: parseFloat(e.target.value) || 0 }))}
                      placeholder={form.type === "percentage" ? "10" : "1000"}
                      style={inpStyle}
                      min="0"
                      step={form.type === "percentage" ? "1" : "100"}
                    />
                  </div>
                </div>

                {/* Dates */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      style={inpStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      End Date *
                    </label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      style={inpStyle}
                    />
                  </div>
                </div>

                {/* Min Order & Max Discount */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Min. Order (₦)
                    </label>
                    <input
                      type="number"
                      value={form.minOrderAmount}
                      onChange={e => setForm(f => ({ ...f, minOrderAmount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0 = no minimum"
                      style={inpStyle}
                      min="0"
                      step="100"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Max Discount (₦)
                    </label>
                    <input
                      type="number"
                      value={form.maxDiscount}
                      onChange={e => setForm(f => ({ ...f, maxDiscount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0 = no limit"
                      style={inpStyle}
                      min="0"
                      step="100"
                    />
                  </div>
                </div>

                {/* Usage Limits */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Total Usage Limit
                    </label>
                    <input
                      type="number"
                      value={form.usageLimit}
                      onChange={e => setForm(f => ({ ...f, usageLimit: parseInt(e.target.value) || 0 }))}
                      placeholder="0 = unlimited"
                      style={inpStyle}
                      min="0"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Per User Limit
                    </label>
                    <input
                      type="number"
                      value={form.perUserLimit}
                      onChange={e => setForm(f => ({ ...f, perUserLimit: parseInt(e.target.value) || 1 }))}
                      style={inpStyle}
                      min="1"
                    />
                  </div>
                </div>

                {/* Applicable To */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                    Applicable To *
                  </label>
                  <select
                    value={form.applicableTo}
                    onChange={e => setForm(f => ({ ...f, applicableTo: e.target.value as any }))}
                    style={inpStyle}
                  >
                    <option value="all">All Products</option>
                    <option value="vendors">Specific Vendors</option>
                    <option value="categories">Specific Categories</option>
                  </select>
                </div>

                {/* Vendor Selection */}
                {form.applicableTo === "vendors" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Select Vendors *
                    </label>
                    <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: 8 }}>
                      {vendors.map(v => (
                        <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={form.vendorIds.includes(v.id)}
                            onChange={e => {
                              const newIds = e.target.checked
                                ? [...form.vendorIds, v.id]
                                : form.vendorIds.filter(id => id !== v.id);
                              setForm(f => ({ ...f, vendorIds: newIds }));
                            }}
                          />
                          <span style={{ fontSize: 13, color: C.text }}>{v.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category Selection */}
                {form.applicableTo === "categories" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                      Select Categories *
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {categories.map(cat => (
                        <label key={cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: C.surface2, borderRadius: 20, border: `1px solid ${form.categories.includes(cat) ? C.orange : C.border}`, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={form.categories.includes(cat)}
                            onChange={e => {
                              const newCats = e.target.checked
                                ? [...form.categories, cat]
                                : form.categories.filter(c => c !== cat);
                              setForm(f => ({ ...f, categories: newCats }));
                            }}
                            style={{ display: "none" }}
                          />
                          <span style={{ fontSize: 12, color: form.categories.includes(cat) ? C.orange : C.text }}>{cat}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What's this discount for? Internal note only"
                    rows={2}
                    style={{ ...inpStyle, resize: "vertical" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => { setShowModal(false); setEditing(null); }}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 12,
                    background: C.surface2, border: `1px solid ${C.border}`,
                    color: C.muted, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveDiscount}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 12,
                    background: `linear-gradient(135deg, ${C.orange}, #FF8C00)`,
                    border: "none", color: "white", fontWeight: 800, cursor: "pointer",
                  }}
                >
                  {editing ? "Update Discount" : "Create Discount"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}