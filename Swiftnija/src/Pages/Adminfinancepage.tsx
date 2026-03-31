// pages/admin/AdminFinancePage.tsx
// Super Admin Finance Dashboard — shows:
//   1. Admin's own wallet balance + link bank account + withdraw
//   2. Platform-wide stats (all users, riders, vendors balances + totals)
//   3. Full transaction history (both Paystack and wallet)
//   4. Paystack platform balance

import { useState, useEffect, useCallback } from "react";
import {
  FiChevronDown, FiChevronUp, FiSearch, FiCheckCircle,
  FiAlertCircle, FiLoader, FiLink, FiScissors, FiArrowDown,
  FiArrowUp, FiShield, FiRefreshCw, FiUsers, FiTrendingUp,
  FiDollarSign, FiFilter,
} from "react-icons/fi";
import { RiBankLine } from "react-icons/ri";
import { MdVerified } from "react-icons/md";
import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc, onSnapshot, collection, query, orderBy,
  limit, getDocs, where, deleteDoc,
} from "firebase/firestore";

type PaystackBank = { id: number; name: string; code: string; slug: string };

const ACCENT = "#FF6B00";

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 900, color: "#e8e8f0" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "rgba(232,232,240,0.5)", marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, emoji }: { label: string; value: string; sub?: string; color: string; emoji: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,232,240,0.5)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(232,232,240,0.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── BANK LINK FORM ───────────────────────────────────────────────────────────
function BankLinkForm({ onLink, loading: savingBank, error, onClearError }: {
  onLink: (params: { bank: PaystackBank; account_number: string; account_name: string }) => Promise<void>;
  loading: boolean; error: string | null; onClearError: () => void;
}) {
  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<PaystackBank | null>(null);
  const [showBankList, setShowBankList] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100", {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_PAYSTACK_PUBLIC_KEY}` },
    })
      .then(r => r.json())
      .then(d => { if (d.data) setBanks(d.data); })
      .catch(console.error)
      .finally(() => setLoadingBanks(false));
  }, []);

  useEffect(() => {
    if (accountNumber.length !== 10 || !selectedBank) { setAccountName(""); return; }
    setVerifyError(null); setAccountName(""); setVerifying(true);
    (async () => {
      try {
        const fn = httpsCallable(getFunctions(), "paystackResolveAccount");
        const result = await fn({ account_number: accountNumber, bank_code: selectedBank.code }) as any;
        if (result.data?.data?.account_name) setAccountName(result.data.data.account_name);
        else setVerifyError("Could not verify account.");
      } catch { setVerifyError("Verification failed."); }
      finally { setVerifying(false); }
    })();
  }, [accountNumber, selectedBank]);

  const filteredBanks = banks.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()));

  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <RiBankLine size={13} /> Link Admin Bank Account
      </div>
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
          <FiAlertCircle size={14} /> {error}
          <button onClick={onClearError} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}
      <div style={{ marginBottom: 14, position: "relative" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(232,232,240,0.5)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Select Bank</div>
        <div onClick={() => { setShowBankList(v => !v); onClearError(); }} 

          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", userSelect: "none", color: selectedBank ? "#e8e8f0" : "rgba(232,232,240,0.4)", fontSize: 13 }}>
          <span>{selectedBank ? selectedBank.name : loadingBanks ? "Loading banks…" : "Choose bank"}</span>
          {showBankList ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </div>
        {showBankList && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#1a1a2e", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden", marginTop: 4, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
              <FiSearch size={13} color="rgba(232,232,240,0.4)" />
              <input autoFocus placeholder="Search…" value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                style={{ background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontSize: 13, flex: 1, fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {filteredBanks.map(b => (
                <div key={b.id} onClick={() => { setSelectedBank(b); setShowBankList(false); setBankSearch(""); }}
                  style={{ padding: "10px 16px", fontSize: 13, cursor: "pointer", color: selectedBank?.id === b.id ? "#FF6B00" : "#e8e8f0", background: selectedBank?.id === b.id ? "rgba(255,107,0,0.07)" : "transparent" }}>
                  {b.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(232,232,240,0.5)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Account Number</div>
        <input placeholder="Enter 10-digit account number" value={accountNumber} maxLength={10} inputMode="numeric"
          onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, "")); onClearError(); }}
          style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#e8e8f0", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
        {verifying && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "rgba(232,232,240,0.5)", fontSize: 11 }}><FiLoader size={11} style={{ animation: "spin 0.7s linear infinite" }} /> Verifying…</div>}
        {verifyError && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 11, fontWeight: 600 }}>{verifyError}</div>}
      </div>
      {accountName && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", marginBottom: 18 }}>
          <FiCheckCircle size={16} color="#10B981" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{accountName}</div>
            <div style={{ fontSize: 11, color: "rgba(232,232,240,0.5)", marginTop: 1 }}>Account verified</div>
          </div>
        </div>
      )}
      <button onClick={() => { if (selectedBank && accountNumber && accountName) onLink({ bank: selectedBank, account_number: accountNumber, account_name: accountName }); }}
        disabled={!accountName || savingBank || verifying}
        style={{ width: "100%", padding: "13px", borderRadius: 14, background: !accountName || savingBank || verifying ? "#1e1e2c" : "linear-gradient(135deg,#FF6B00,#FF9A00)", border: "none", color: !accountName || savingBank || verifying ? "#555" : "white", fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 900, cursor: !accountName || savingBank || verifying ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: !accountName || savingBank || verifying ? "none" : "0 4px 20px rgba(255,107,0,0.4)" }}>
        {savingBank ? <><FiLoader size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Linking…</> : <><FiLink size={14} /> Link Bank Account</>}
      </button>
    </div>
  );
}

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
function WithdrawModal({ balance, bankName, accountLast4, onClose, onWithdraw }: {
  balance: number; bankName: string; accountLast4: string;
  onClose: () => void; onWithdraw: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const num = parseFloat(amount.replace(/,/g, "")) || 0;

  const handleWithdraw = async () => {
    if (!num || num < 100) { setError("Minimum withdrawal is ₦100"); return; }
    if (num > balance) { setError("Amount exceeds balance"); return; }
    setError(""); setLoading(true);
    try { await onWithdraw(num); onClose(); }
    catch (e: any) { setError(e?.message || "Withdrawal failed."); }
    finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#13131a", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#e8e8f0", marginBottom: 8 }}>Admin Withdraw</div>
        <div style={{ fontSize: 12, color: "rgba(232,232,240,0.5)", marginBottom: 22 }}>{bankName} · ****{accountLast4}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, color: ACCENT, fontSize: 20 }}>₦</span>
          <input autoFocus inputMode="numeric" placeholder="0" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ""); setAmount(raw ? Number(raw).toLocaleString("en-NG") : ""); setError(""); }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900 }} />
        </div>
        {error && <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 12, padding: "10px 14px", color: "#ef4444", fontSize: 12, fontWeight: 700, marginBottom: 16 }}><FiAlertCircle size={14} />{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,232,240,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
          <button onClick={handleWithdraw} disabled={loading || !num}
            style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: loading || !num ? "#1e1e2c" : "linear-gradient(135deg,#FF6B00,#FF9A00)", color: loading || !num ? "#555" : "white", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: loading || !num ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? "Sending…" : <><FiArrowUp size={14} /> Withdraw Now</>}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "rgba(232,232,240,0.4)", marginTop: 16 }}>
          <FiShield size={11} color="#10B981" /> Secured via Paystack
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AdminFinancePage() {
  const adminId = auth.currentUser?.uid ?? "";
  const fns = getFunctions();

  // Admin's own wallet
  const [adminBalance, setAdminBalance] = useState(0);
  const [adminBankAccount, setAdminBankAccount] = useState<any>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);

  // Platform stats
  const [paystackBalance, setPaystackBalance] = useState<number | null>(null);
  const [loadingPaystackBal, setLoadingPaystackBal] = useState(false);
  const [platformEarnings, setPlatformEarnings] = useState(0);
  const [totalUserWalletBalance, setTotalUserWalletBalance] = useState(0);
  const [totalRiderWalletBalance, setTotalRiderWalletBalance] = useState(0);
  const [totalVendorWalletBalance, setTotalVendorWalletBalance] = useState(0);
  const [totalPaystackRevenue, setTotalPaystackRevenue] = useState(0);
  const [totalWalletRevenue, setTotalWalletRevenue] = useState(0);

  // Transaction history
  const [txFilter, setTxFilter] = useState<"all" | "paystack" | "wallet">("all");
  const [allTxs, setAllTxs] = useState<any[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(true);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const addToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  // ── Realtime: admin wallet + bank ────────────────────────────────────────
  useEffect(() => {
    if (!adminId) return;
    const u1 = onSnapshot(doc(db, "adminWallets", adminId), snap => setAdminBalance(snap.exists() ? (snap.data()!.balance ?? 0) : 0));
    const u2 = onSnapshot(doc(db, "adminBankAccounts", adminId), snap => setAdminBankAccount(snap.exists() ? snap.data() : null));
    return () => { u1(); u2(); };
  }, [adminId]);

  // ── Realtime: platform earnings ───────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "platformEarnings"), orderBy("createdAt", "desc"), limit(500));
    return onSnapshot(q, snap => {
      const total = snap.docs.reduce((s, d) => s + (d.data().amount ?? 0), 0);
      setPlatformEarnings(total);
    });
  }, []);

  // ── Platform-wide balances (aggregate snapshots) ──────────────────────────
  useEffect(() => {
    // User wallets aggregate
    const uWallets = onSnapshot(collection(db, "wallets"), snap => {
      const total = snap.docs.reduce((s, d) => s + (d.data().balance ?? 0), 0);
      const totalIn = snap.docs.reduce((s, d) => s + (d.data().totalIn ?? 0), 0);
      setTotalUserWalletBalance(total);
      setTotalPaystackRevenue(totalIn); // sum of all topups
    });
    const rWallets = onSnapshot(collection(db, "riderSplitWallets"), snap => {
      setTotalRiderWalletBalance(snap.docs.reduce((s, d) => s + (d.data().balance ?? 0), 0));
    });
    const vWallets = onSnapshot(collection(db, "vendorSplitWallets"), snap => {
      setTotalVendorWalletBalance(snap.docs.reduce((s, d) => s + (d.data().balance ?? 0), 0));
    });
    const wOrders = onSnapshot(query(collection(db, "orders"), where("paymentMethod", "==", "wallet")), snap => {
      setTotalWalletRevenue(snap.docs.reduce((s, d) => s + (d.data().total ?? 0), 0));
    });
    return () => { uWallets(); rWallets(); vWallets(); wOrders(); };
  }, []);

  // ── Platform tx history (union of walletTransactions + walletPendingTx paid) ──
  useEffect(() => {
    setLoadingTxs(true);
    // Listen to recent wallet transactions across all users
    const q = query(collection(db, "walletTransactions"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, snap => {
      setAllTxs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingTxs(false);
    }, () => setLoadingTxs(false));
  }, []);

  // ── Paystack live balance ─────────────────────────────────────────────────
  const fetchPaystackBalance = useCallback(async () => {
    setLoadingPaystackBal(true);
    try {
      const res = await httpsCallable(fns, "getPaystackBalance")({}) as any;
      setPaystackBalance(res.data.balance ?? null);
    } catch (e) { console.error(e); }
    finally { setLoadingPaystackBal(false); }
  }, [fns]);

  useEffect(() => { fetchPaystackBalance(); }, []);

  // ── Admin bank account handlers ───────────────────────────────────────────
  const handleLinkBank = async (params: { bank: PaystackBank; account_number: string; account_name: string }) => {
    setSavingBank(true); setLinkError(null);
    try {
      await httpsCallable(fns, "createAdminPaystackRecipient")({ account_number: params.account_number, bank_code: params.bank.code, account_name: params.account_name, bank_name: params.bank.name });
      addToast("Bank account linked 🎉");
    } catch (e: any) { setLinkError(e?.message || "Failed to link"); }
    finally { setSavingBank(false); }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try { await deleteDoc(doc(db, "adminBankAccounts", adminId)); addToast("Bank account unlinked"); }
    catch { addToast("Failed to unlink", false); }
    finally { setUnlinking(false); }
  };

  const handleWithdraw = async (amount: number) => {
    const res = await httpsCallable(fns, "adminWalletWithdraw")({ amount }) as any;
    addToast(`₦${amount.toLocaleString("en-NG")} sent to bank 🎉`);
    setAdminBalance(res.data.newBalance);
  };

  const fmt = (ts: any) => ts?.toDate?.().toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) || ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString("en-NG") : "—";

  const filteredTxs = txFilter === "all" ? allTxs
    : txFilter === "paystack" ? allTxs.filter(t => t.type === "credit" && !t.orderId)
    : allTxs.filter(t => t.orderId);

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", borderRadius: 14, fontSize: 13, fontWeight: 700, background: toast.ok ? "rgba(16,185,129,.95)" : "rgba(239,68,68,.95)", color: "white", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>{toast.msg}</div>}
      {showWithdraw && adminBankAccount && (
        <WithdrawModal balance={adminBalance} bankName={adminBankAccount.bank_name} accountLast4={adminBankAccount.account_number.slice(-4)} onClose={() => setShowWithdraw(false)} onWithdraw={handleWithdraw} />
      )}

      <div style={{ padding: "24px 24px 120px", maxWidth: 900, margin: "0 auto" }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900, color: "#e8e8f0", letterSpacing: "-0.5px" }}>Finance Dashboard</div>
          <div style={{ fontSize: 13, color: "rgba(232,232,240,0.5)", marginTop: 4 }}>Platform-wide financial overview & admin wallet</div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 1. ADMIN WALLET SECTION                                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <SectionHeader title="Your Admin Wallet" subtitle="Platform earnings credited to your admin wallet" />

        {/* Admin balance card */}
        <div style={{ background: "linear-gradient(135deg,#FF6B00,#FF9A00)", borderRadius: 22, padding: "24px 22px", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 12px 40px rgba(255,107,0,.35)" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -50, left: -20, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,.05)", pointerEvents: "none" }} />
          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.8)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Admin Wallet</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 38, fontWeight: 900, color: "white", letterSpacing: "-1px", lineHeight: 1 }}>
            ₦{adminBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 6, marginBottom: 20 }}>Platform fee earnings available to withdraw</div>
          {adminBankAccount ? (
            <button onClick={() => setShowWithdraw(true)} disabled={adminBalance < 100}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "white", color: ACCENT, border: "none", borderRadius: 14, padding: "13px 24px", width: "100%", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: adminBalance < 100 ? "not-allowed" : "pointer", opacity: adminBalance < 100 ? 0.6 : 1 }}>
              <FiArrowDown size={16} /> Withdraw to Bank
            </button>
          ) : (
            <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>🏦 Link a bank account below to withdraw</div>
          )}
        </div>

        {/* Admin bank account */}
        {adminBankAccount ? (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
              <RiBankLine size={13} /> Admin Bank Account
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RiBankLine size={22} color={ACCENT} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e8e8f0" }}>{adminBankAccount.bank_name}</span>
                  {adminBankAccount.recipient_code && <MdVerified size={14} color="#10B981" />}
                </div>
                <div style={{ fontSize: 13, color: "rgba(232,232,240,0.5)", marginTop: 2 }}>•••• •••• {adminBankAccount.account_number?.slice(-4)}</div>
                <div style={{ fontSize: 11, color: "rgba(232,232,240,0.4)", marginTop: 2 }}>{adminBankAccount.account_name}</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 10, fontWeight: 800, color: "#10B981" }}>LINKED</div>
            </div>
            <button onClick={handleUnlink} disabled={unlinking}
              style={{ width: "100%", padding: "11px", borderRadius: 12, cursor: "pointer", background: "transparent", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {unlinking ? <FiLoader size={13} style={{ animation: "spin 0.7s linear infinite" }} /> : <FiScissors size={14} />}
              {unlinking ? "Unlinking…" : "Unlink Account"}
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 32 }}>
            <BankLinkForm onLink={handleLinkBank} loading={savingBank} error={linkError} onClearError={() => setLinkError(null)} />
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 2. PLATFORM STATS OVERVIEW                                          */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <SectionHeader title="Platform Overview" subtitle="Live balances across all accounts" />

        {/* Paystack balance card */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 22px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 32 }}>💳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,232,240,0.5)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Paystack Account Balance</div>
            {loadingPaystackBal ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,232,240,0.4)", fontSize: 13 }}>
                <FiLoader size={13} style={{ animation: "spin 0.7s linear infinite" }} /> Loading…
              </div>
            ) : paystackBalance !== null ? (
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900, color: ACCENT }}>
                ₦{paystackBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "rgba(232,232,240,0.4)" }}>Unable to fetch — check Paystack API</div>
            )}
          </div>
          <button onClick={fetchPaystackBalance} disabled={loadingPaystackBal}
            style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,232,240,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiRefreshCw size={14} style={loadingPaystackBal ? { animation: "spin 0.7s linear infinite" } : {}} />
          </button>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <StatCard label="Platform Fees" value={`₦${platformEarnings.toLocaleString("en-NG")}`} emoji="⚡" color={ACCENT} sub="All-time" />
          <StatCard label="Paystack Revenue" value={`₦${totalPaystackRevenue.toLocaleString("en-NG")}`} emoji="💳" color="#3b82f6" sub="Total topups" />
          <StatCard label="Wallet Revenue" value={`₦${totalWalletRevenue.toLocaleString("en-NG")}`} emoji="👛" color="#8b5cf6" sub="Wallet-paid orders" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
          <StatCard label="User Wallets" value={`₦${totalUserWalletBalance.toLocaleString("en-NG")}`} emoji="🧑‍💼" color="#06b6d4" sub="Total held" />
          <StatCard label="Rider Wallets" value={`₦${totalRiderWalletBalance.toLocaleString("en-NG")}`} emoji="🏍️" color="#f59e0b" sub="Pending withdrawal" />
          <StatCard label="Vendor Wallets" value={`₦${totalVendorWalletBalance.toLocaleString("en-NG")}`} emoji="🏪" color="#10B981" sub="Pending withdrawal" />
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* 3. FULL TRANSACTION HISTORY                                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontFamily: "'Syne',sans-serif", fontWeight: 900, color: "#e8e8f0" }}>Transaction History</div>
            <div style={{ fontSize: 12, color: "rgba(232,232,240,0.5)", marginTop: 3 }}>All platform transactions across users</div>
          </div>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["all", "paystack", "wallet"] as const).map(f => (
              <button key={f} onClick={() => setTxFilter(f)}
                style={{ padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, background: txFilter === f ? "rgba(255,107,0,0.15)" : "transparent", color: txFilter === f ? ACCENT : "rgba(232,232,240,0.4)", borderWidth: txFilter === f ? 1 : 0, borderStyle: "solid", borderColor: txFilter === f ? "rgba(255,107,0,0.3)" : "transparent" }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loadingTxs ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 12, color: "rgba(232,232,240,0.4)" }}>
            <FiLoader size={18} style={{ animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Loading transactions…</span>
          </div>
        ) : filteredTxs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 20px", background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(255,255,255,0.08)", borderRadius: 18, color: "rgba(232,232,240,0.4)" }}>
            <span style={{ fontSize: 28 }}>📭</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>No transactions yet</span>
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
            {filteredTxs.map((tx, i) => {
              const isCredit = tx.type === "credit";
              const isWallet = !!tx.orderId;
              return (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < filteredTxs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isCredit ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", color: isCredit ? "#10B981" : "#ef4444" }}>
                    {isCredit ? <FiArrowDown size={16} /> : <FiArrowUp size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: isWallet ? "rgba(139,92,246,0.12)" : "rgba(59,130,246,0.12)", color: isWallet ? "#8b5cf6" : "#3b82f6", flexShrink: 0 }}>
                        {isWallet ? "WALLET" : "PAYSTACK"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(232,232,240,0.4)" }}>
                      {fmt(tx.createdAt)}{tx.userId && ` · ${tx.userId.slice(0, 8)}…`}
                    </div>
                    {tx.orderId && <div style={{ fontSize: 10, color: "rgba(232,232,240,0.3)", marginTop: 1 }}>Order #{tx.orderId.slice(-8).toUpperCase()}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: isCredit ? "#10B981" : "#ef4444" }}>
                      {isCredit ? "+" : "−"}₦{tx.amount.toLocaleString("en-NG")}
                    </div>
                    {tx.splits && (
                      <div style={{ fontSize: 9, color: "rgba(232,232,240,0.35)", marginTop: 2 }}>
                        V:₦{tx.splits.vendorAmount?.toLocaleString()} R:₦{tx.splits.riderAmount?.toLocaleString()} P:₦{tx.splits.platformAmount?.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}