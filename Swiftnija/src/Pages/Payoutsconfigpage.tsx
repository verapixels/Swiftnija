// Pages/PayoutsConfigPage.tsx
// Super-admin page for managing split percentages and viewing all wallet balances.
// Import this into AdminDashboard.tsx and add it to the NAV array.
//
// HOW TO ADD TO AdminDashboard.tsx:
//   1. import PayoutsConfigPage from "./PayoutsConfigPage";
//   2. Add to NAV array:
//      { key: "payoutsconfig", icon: <RiExchangeFundsLine size={18} />, label: "Payouts Config" }
//   3. Add to renderPage() switch:
//      case "payoutsconfig": return <PayoutsConfigPage adminUser={adminUser} showToast={showToast} C={C} />;

import { useState, useEffect } from "react";
import {
  collection, query, onSnapshot, orderBy, doc,
  getDoc, getDocs, setDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  RiExchangeFundsLine, RiStoreLine, RiBikeLine,
  RiWalletLine, RiPercentLine, RiSaveLine,
  RiArrowUpLine, RiArrowDownLine,
} from "react-icons/ri";

// ─── Types ─────────────────────────────────────────────────────────────────
interface AdminUser { uid: string; role?: string; displayName?: string | null; [k: string]: unknown; }

type VendorRow = { id: string; businessName?: string; email?: string; logo?: string; balance: number };
type RiderRow  = { id: string; fullName?: string; email?: string; photoURL?: string; balance: number };

const fmt = (n: number) =>
  n >= 1e6 ? `₦${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `₦${(n / 1e3).toFixed(1)}K`
  : `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

// ─── AVATAR ─────────────────────────────────────────────────────────────────
function Av({ src, name, size = 34, C }: { src?: string | null; name?: string | null; size?: number; C: Record<string, string> }) {
  const initials = (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: C.orange + "33", display: "flex", alignItems: "center", justifyContent: "center", color: C.orange, fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── SPLIT SLIDER ────────────────────────────────────────────────────────────
function SplitSlider({
  label, emoji, value, onChange, platformCut, C,
}: {
  label: string; emoji: string; value: number;
  onChange: (v: number) => void; platformCut: number; C: Record<string, string>;
}) {
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{emoji}</span> {label}
        </span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900, color: C.orange }}>{value}%</span>
      </div>
      <input
        type="range" min={50} max={95} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.orange, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: C.muted }}>Gets: {value}%</span>
        <span style={{ fontSize: 11, color: C.muted }}>Platform takes: {platformCut}%</span>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function PayoutsConfigPage({
  adminUser, showToast, C,
}: {
  adminUser: AdminUser | null;
  showToast: (m: string, t: "success" | "error" | "info") => void;
  C: Record<string, string>;
}) {
  const [vendorItemPercent, setVendorItemPercent] = useState(80);
  const [riderDeliveryPercent, setRiderDeliveryPercent] = useState(85);
  const [saving, setSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingRiders, setLoadingRiders] = useState(true);

  const [vendorSearch, setVendorSearch] = useState("");
  const [riderSearch, setRiderSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"vendors" | "riders">("vendors");

  // Load split config
  useEffect(() => {
    getDoc(doc(db, "platformSettings", "global")).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.vendorItemPercent)    setVendorItemPercent(Number(d.vendorItemPercent));
        if (d.riderDeliveryPercent) setRiderDeliveryPercent(Number(d.riderDeliveryPercent));
      }
      setSettingsLoaded(true);
    });
  }, []);

  // Load vendors with their wallet balances
  useEffect(() => {
    let vendors_: VendorRow[] = [];

    const unsubVendors = onSnapshot(
      query(collection(db, "vendors"), orderBy("createdAt", "desc")),
      async snap => {
        vendors_ = snap.docs.map(d => ({
          id: d.id,
          businessName: d.data().businessName,
          email: d.data().email,
          logo: d.data().logo,
          balance: 0,
        }));

        // Fetch wallet balances in parallel
        const walletSnaps = await Promise.all(
          vendors_.map(v => getDoc(doc(db, "vendorWallets", v.id)))
        );
        walletSnaps.forEach((ws, i) => {
          if (ws.exists()) vendors_[i].balance = ws.data()!.balance ?? 0;
        });

        setVendors([...vendors_].sort((a, b) => b.balance - a.balance));
        setLoadingVendors(false);
      }
    );

    return unsubVendors;
  }, []);

  // Load riders with their wallet balances
  useEffect(() => {
    const unsubRiders = onSnapshot(
      query(collection(db, "riders"), orderBy("createdAt", "desc")),
      async snap => {
        const riders_: RiderRow[] = snap.docs.map(d => ({
          id: d.id,
          fullName: d.data().fullName || `${d.data().firstName ?? ""} ${d.data().lastName ?? ""}`.trim(),
          email: d.data().email,
          photoURL: d.data().selfieUrl || d.data().photoURL,
          balance: 0,
        }));

        const walletSnaps = await Promise.all(
          riders_.map(r => getDoc(doc(db, "riderWallets", r.id)))
        );
        walletSnaps.forEach((ws, i) => {
          if (ws.exists()) riders_[i].balance = ws.data()!.balance ?? 0;
        });

        setRiders([...riders_].sort((a, b) => b.balance - a.balance));
        setLoadingRiders(false);
      }
    );

    return unsubRiders;
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, "platformSettings", "global"),
        {
          vendorItemPercent,
          riderDeliveryPercent,
          updatedAt: serverTimestamp(),
          updatedBy: adminUser?.uid,
        },
        { merge: true }
      );
      showToast("Split config saved", "success");
    } catch {
      showToast("Failed to save config", "error");
    } finally {
      setSaving(false);
    }
  };

  const platformItemCut = 100 - vendorItemPercent;
  const platformDeliveryCut = 100 - riderDeliveryPercent;

  const filteredVendors = vendors.filter(v =>
    (v.businessName || "").toLowerCase().includes(vendorSearch.toLowerCase()) ||
    (v.email || "").toLowerCase().includes(vendorSearch.toLowerCase())
  );
  const filteredRiders = riders.filter(r =>
    (r.fullName || "").toLowerCase().includes(riderSearch.toLowerCase()) ||
    (r.email || "").toLowerCase().includes(riderSearch.toLowerCase())
  );

  const totalVendorWallet = vendors.reduce((s, v) => s + v.balance, 0);
  const totalRiderWallet  = riders.reduce((s, r) => s + r.balance, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <RiExchangeFundsLine size={24} color={C.orange} /> Payouts Config
        </h1>
        <p style={{ color: C.muted, fontSize: 13 }}>
          Configure split percentages and view all wallet balances
        </p>
      </div>

      {/* ── Overview stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { icon: <RiStoreLine size={18} />, label: "Total in Vendor Wallets", value: fmt(totalVendorWallet), color: C.blue },
          { icon: <RiBikeLine size={18} />, label: "Total in Rider Wallets", value: fmt(totalRiderWallet), color: C.green },
          { icon: <RiWalletLine size={18} />, label: "Combined Outstanding", value: fmt(totalVendorWallet + totalRiderWallet), color: C.orange },
          { icon: <RiPercentLine size={18} />, label: "Platform Item Cut", value: `${platformItemCut}%`, color: C.purple },
        ].map(card => (
          <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: "18px 20px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: card.color + "18", display: "flex", alignItems: "center", justifyContent: "center", color: card.color, marginBottom: 12 }}>
              {card.icon}
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 900, color: C.text }}>{card.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* ── Split percentage config ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 26, marginBottom: 24 }}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: 16, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <RiPercentLine size={18} color={C.orange} /> Payment Split Configuration
        </h3>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 22, lineHeight: 1.6 }}>
          When a customer pays with their wallet, the payment is split based on these percentages.
          Vendor % applies to item subtotal. Rider % applies to delivery fee. Platform keeps the rest.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <SplitSlider
            label="Vendor share (items)"
            emoji="🏪"
            value={vendorItemPercent}
            onChange={setVendorItemPercent}
            platformCut={platformItemCut}
            C={C}
          />
          <SplitSlider
            label="Rider share (delivery)"
            emoji="🏍️"
            value={riderDeliveryPercent}
            onChange={setRiderDeliveryPercent}
            platformCut={platformDeliveryCut}
            C={C}
          />
        </div>

        {/* Example calculation */}
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
            Example: ₦5,000 order (₦4,500 items + ₦500 delivery)
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "Vendor gets", val: Math.round(4500 * vendorItemPercent / 100), color: C.blue, emoji: "🏪" },
              { label: "Rider gets", val: Math.round(500 * riderDeliveryPercent / 100), color: C.green, emoji: "🏍️" },
              { label: "Platform keeps", val: 5000 - Math.round(4500 * vendorItemPercent / 100) - Math.round(500 * riderDeliveryPercent / 100), color: C.orange, emoji: "⚡" },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{x.emoji}</span>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{x.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: x.color }}>
                    ₦{x.val.toLocaleString("en-NG")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={saveConfig}
          disabled={saving || !settingsLoaded}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "11px 24px",
            borderRadius: 12, border: "none",
            background: saving ? C.dim : `linear-gradient(135deg, ${C.orange}, #FF8C00)`,
            color: "white", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          <RiSaveLine size={15} /> {saving ? "Saving…" : "Save Split Config"}
        </button>
      </div>

      {/* ── Wallet balances tabs ── */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["vendors", "riders"] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 18px", borderRadius: 10, border: `1px solid ${activeTab === t ? C.orange : C.border}`,
                background: activeTab === t ? C.orangeGlow : "transparent",
                color: activeTab === t ? C.orange : C.muted,
                fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
                display: "flex", alignItems: "center", gap: 7,
              }}
            >
              {t === "vendors" ? <RiStoreLine size={14} /> : <RiBikeLine size={14} />}
              {t} ({t === "vendors" ? vendors.length : riders.length})
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 18 }}>
          <input
            placeholder={`Search ${activeTab}…`}
            value={activeTab === "vendors" ? vendorSearch : riderSearch}
            onChange={e => activeTab === "vendors" ? setVendorSearch(e.target.value) : setRiderSearch(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px 10px 38px",
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 12, color: C.text, fontSize: 13,
              fontFamily: "'Nunito', sans-serif", outline: "none",
              boxSizing: "border-box",
            }}
          />
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 14 }}>🔍</span>
        </div>

        {/* Table */}
        {activeTab === "vendors" ? (
          loadingVendors ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Vendor", "Email", "Wallet Balance", "Trend"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map(v => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Av src={v.logo} name={v.businessName} C={C} />
                          <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{v.businessName || "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.muted, fontSize: 12 }}>{v.email || "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 900, color: v.balance > 0 ? C.green : C.muted }}>
                          {fmt(v.balance)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, color: v.balance > 0 ? C.green : C.muted, fontSize: 11, fontWeight: 700 }}>
                          {v.balance > 0 ? <RiArrowUpLine size={12} /> : <RiArrowDownLine size={12} />}
                          {v.balance > 0 ? "Has balance" : "Empty"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredVendors.length === 0 && (
                <div style={{ textAlign: "center", padding: "36px 20px", color: C.muted, fontSize: 13 }}>No vendors found</div>
              )}
            </div>
          )
        ) : (
          loadingRiders ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Loading…</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Rider", "Email", "Wallet Balance", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Av src={r.photoURL} name={r.fullName} C={C} />
                          <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{r.fullName || "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.muted, fontSize: 12 }}>{r.email || "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 900, color: r.balance > 0 ? C.green : C.muted }}>
                          {fmt(r.balance)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800,
                          background: r.balance > 0 ? "rgba(16,185,129,0.1)" : "rgba(74,74,106,0.2)",
                          color: r.balance > 0 ? C.green : C.muted,
                          textTransform: "uppercase",
                        }}>
                          {r.balance > 0 ? "Has funds" : "Empty"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRiders.length === 0 && (
                <div style={{ textAlign: "center", padding: "36px 20px", color: C.muted, fontSize: 13 }}>No riders found</div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}