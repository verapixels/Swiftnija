// pages/VendorPayoutsPage.tsx
// Vendor payout dashboard with two tabs:
//   1. Paystack — earnings history, auto-settled to bank, no withdraw button
//   2. Wallet   — split-payment wallet balance, tx history, withdraw to linked bank
// No emojis — all React icons

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiChevronDown, FiChevronUp, FiSearch, FiCheckCircle,
  FiAlertCircle, FiLoader, FiLink, FiScissors, FiArrowDown,
  FiArrowUp, FiShield, FiTrendingUp, FiInfo, FiInbox,
  FiCalendar, FiHash, FiArrowDownLeft, FiClock, FiCreditCard,
  FiDollarSign,
} from "react-icons/fi";
import { RiBankLine } from "react-icons/ri";
import { MdVerified } from "react-icons/md";
import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc, onSnapshot, collection, query,
  where, orderBy, limit, deleteDoc,
  getDocs, startAfter,
  type QueryDocumentSnapshot, type DocumentData,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
type PaystackBank = { id: number; name: string; code: string; slug: string };

type VendorWalletTx = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  desc: string;
  createdAt: any;
  orderId?: string;
  orderNumber?: string;
  settlementStatus?: "settled" | "pending";
  source?: string;
};

type BankAccount = {
  bank_name: string;
  account_number: string;
  account_name: string;
  subaccount_code?: string;
  recipient_code?: string;
};

const ACCENT = "#FF6B00";
const WALLET_ACCENT = "#10B981";
const PAGE_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts: any): string {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
}

// ─── Settlement Badge ─────────────────────────────────────────────────────────
function SettlementBadge({ status }: { status?: string }) {
  const ok = status === "settled" || !status;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 6,
      background: ok ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
      border: `1px solid ${ok ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
      fontSize: 10, fontWeight: 700, flexShrink: 0,
      color: ok ? "#10B981" : "#F59E0B",
      letterSpacing: "0.4px", textTransform: "uppercase" as const,
    }}>
      {ok ? <FiCheckCircle size={9} /> : <FiClock size={9} />}
      {ok ? "Settled" : "Pending"}
    </div>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow({ last }: { last: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 18px",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(255,255,255,0.05)", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 12, width: "58%", borderRadius: 6, background: "rgba(255,255,255,0.05)", marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "32%", borderRadius: 6, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: 72, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

// ─── Bank Link Form ───────────────────────────────────────────────────────────
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
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <RiBankLine size={13} /> Link Bank Account
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
          <span>{selectedBank ? selectedBank.name : loadingBanks ? "Loading banks…" : "Choose your bank"}</span>
          {showBankList ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </div>
        {showBankList && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#1a1a2e", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden", marginTop: 4, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
              <FiSearch size={13} color="rgba(232,232,240,0.4)" />
              <input autoFocus placeholder="Search bank…" value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                style={{ background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontSize: 13, flex: 1, fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filteredBanks.length === 0
                ? <div style={{ padding: "14px 16px", color: "rgba(232,232,240,0.4)", fontSize: 13 }}>No banks found</div>
                : filteredBanks.map(b => (
                  <div key={b.id} onClick={() => { setSelectedBank(b); setShowBankList(false); setBankSearch(""); }}
                    style={{ padding: "11px 16px", fontSize: 13, cursor: "pointer", color: selectedBank?.id === b.id ? "#FF6B00" : "#e8e8f0", background: selectedBank?.id === b.id ? "rgba(255,107,0,0.07)" : "transparent" }}>
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

// ─── Linked Bank Card (with unlink — for Wallet tab) ──────────────────────────
function LinkedBankCard({ bank_name, account_number, account_name, onUnlink, unlinking, subaccount_code }: {
  bank_name: string; account_number: string; account_name: string;
  onUnlink: () => void; unlinking: boolean; subaccount_code?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <RiBankLine size={13} /> Bank Account
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <RiBankLine size={22} color={ACCENT} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#e8e8f0" }}>{bank_name}</span>
            {subaccount_code && <MdVerified size={14} color="#10B981" />}
          </div>
          <div style={{ fontSize: 13, color: "rgba(232,232,240,0.5)", marginTop: 2 }}>•••• •••• {account_number.slice(-4)}</div>
          <div style={{ fontSize: 11, color: "rgba(232,232,240,0.4)", marginTop: 2 }}>{account_name}</div>
        </div>
        <div style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 10, fontWeight: 800, color: "#10B981" }}>LINKED</div>
      </div>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} style={{ width: "100%", padding: "11px", borderRadius: 12, cursor: "pointer", background: "transparent", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'DM Sans', sans-serif" }}>
          <FiScissors size={14} /> Unlink Account
        </button>
      ) : (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 13, color: "#e8e8f0", marginBottom: 14, lineHeight: 1.6 }}>Are you sure? You will need to re-link to receive withdrawals.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,232,240,0.6)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
            <button onClick={onUnlink} disabled={unlinking} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444", cursor: "pointer", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {unlinking ? <FiLoader size={13} style={{ animation: "spin 0.7s linear infinite" }} /> : <FiScissors size={13} />}
              {unlinking ? "Unlinking…" : "Yes, Unlink"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Linked Bank Display (read-only — for Paystack tab) ───────────────────────
function LinkedBankDisplay({ bank }: { bank: BankAccount }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <RiBankLine size={20} color={ACCENT} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e8e8f0" }}>{bank.bank_name}</span>
          {bank.subaccount_code && <MdVerified size={14} color="#10B981" />}
        </div>
        <div style={{ fontSize: 12, color: "rgba(232,232,240,0.45)" }}>
          {bank.account_name} · •••• {bank.account_number.slice(-4)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 10, fontWeight: 800, color: "#10B981", letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0 }}>
        <FiShield size={10} /> Linked
      </div>
    </div>
  );
}

// ─── Withdraw Modal ───────────────────────────────────────────────────────────
function WithdrawModal({ balance, bankName, accountLast4, accentColor, onClose, onWithdraw }: {
  balance: number; bankName: string; accountLast4: string; accentColor: string;
  onClose: () => void; onWithdraw: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const num = parseFloat(amount.replace(/,/g, "")) || 0;
  const quickAmounts = [1000, 5000, 10000, 25000].filter(a => a <= balance);

  const handleWithdraw = async () => {
    if (!num || num < 100) { setError("Minimum withdrawal is ₦100"); return; }
    if (num > balance) { setError("Amount exceeds your wallet balance"); return; }
    setError(""); setLoading(true);
    try { await onWithdraw(num); onClose(); }
    catch (e: any) { setError(e?.message || "Withdrawal failed."); }
    finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#13131a", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: "#e8e8f0", marginBottom: 8 }}>Withdraw to Bank</div>
        <div style={{ fontSize: 12, color: "rgba(232,232,240,0.5)", marginBottom: 22 }}>{bankName} · ****{accountLast4}</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(232,232,240,0.4)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Quick amounts</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quickAmounts.map(a => (
              <button key={a} onClick={() => { setAmount(a.toLocaleString("en-NG")); setError(""); }}
                style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", border: `1.5px solid ${num === a ? `${accentColor}80` : "rgba(255,255,255,0.1)"}`, background: num === a ? `${accentColor}18` : "transparent", color: num === a ? accentColor : "rgba(232,232,240,0.5)", fontSize: 13, fontWeight: 700 }}>
                ₦{a.toLocaleString()}
              </button>
            ))}
            <button onClick={() => { setAmount(balance.toLocaleString("en-NG")); setError(""); }}
              style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", border: "1.5px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(232,232,240,0.5)", fontSize: 13, fontWeight: 700 }}>
              All (₦{balance.toLocaleString()})
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, color: accentColor, fontSize: 20 }}>₦</span>
          <input autoFocus inputMode="numeric" placeholder="0" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ""); setAmount(raw ? Number(raw).toLocaleString("en-NG") : ""); setError(""); }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900 }} />
        </div>
        {error && <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 12, padding: "10px 14px", color: "#ef4444", fontSize: 12, fontWeight: 700, marginBottom: 16 }}><FiAlertCircle size={14} />{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,232,240,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
          <button onClick={handleWithdraw} disabled={loading || !num}
            style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: loading || !num ? "#1e1e2c" : `linear-gradient(135deg,${accentColor},${accentColor}cc)`, color: loading || !num ? "#555" : "white", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: loading || !num ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: loading || !num ? "none" : `0 4px 20px ${accentColor}40` }}>
            {loading ? <><FiLoader size={14} style={{ animation: "spin 0.7s linear infinite" }} /> Sending…</> : <><FiArrowUp size={14} /> Withdraw Now</>}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "rgba(232,232,240,0.4)", marginTop: 16 }}>
          <FiShield size={11} color="#10B981" /> Instant transfer via Paystack
        </div>
      </div>
    </div>
  );
}

// ─── PAYSTACK TAB ─────────────────────────────────────────────────────────────
function PaystackTab({ vendorId }: { vendorId: string }) {
  const [totalEarned, setTotalEarned] = useState(0);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [txs, setTxs] = useState<VendorWalletTx[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Live listeners
  useEffect(() => {
    if (!vendorId) return;
    const u1 = onSnapshot(doc(db, "vendors", vendorId), snap => {
      setBankAccount(snap.data()?.bankAccount ?? null);
    });
    const u2 = onSnapshot(doc(db, "vendorWallets", vendorId), snap => {
      if (snap.exists()) setTotalEarned(snap.data()?.totalIn ?? snap.data()?.balance ?? 0);
    });
    return () => { u1(); u2(); };
  }, [vendorId]);

  // Load first page
  const loadFirst = useCallback(async () => {
    if (!vendorId) return;
    setLoadingInitial(true);
    try {
      const q = query(
        collection(db, "vendorWalletTransactions"),
        where("vendorId", "==", vendorId),
        where("type", "==", "credit"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorWalletTx)));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingInitial(false); }
  }, [vendorId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!vendorId || !lastDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "vendorWalletTransactions"),
        where("vendorId", "==", vendorId),
        where("type", "==", "credit"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      setTxs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorWalletTx))]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingMore(false); }
  }, [vendorId, lastDoc, loadingMore, hasMore]);

  // Intersection observer
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial) loadMore();
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingInitial, loadMore]);

  return (
    <>
      {/* Settlement info */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(255,107,0,0.06)", border: "1px solid rgba(255,107,0,0.15)", borderRadius: 14, padding: "13px 16px", marginBottom: 20 }}>
        <FiInfo size={15} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, color: "rgba(232,232,240,0.6)", lineHeight: 1.7, fontWeight: 500 }}>
          Paystack automatically settles your earnings directly to your linked bank account on the next business day. No manual withdrawal needed.
        </p>
      </div>

      {/* Total earned card */}
      <div style={{ background: "linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.04))", border: "1px solid rgba(255,107,0,0.2)", borderRadius: 20, padding: "22px 22px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 130, height: 130, borderRadius: "50%", border: "1px solid rgba(255,107,0,0.1)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <FiTrendingUp size={13} color={ACCENT} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,107,0,0.8)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Total Paystack Earnings</span>
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 900, color: "#e8e8f0", letterSpacing: "-1px", lineHeight: 1, marginBottom: 6 }}>
          ₦{formatAmount(totalEarned)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(232,232,240,0.45)", fontWeight: 500 }}>
          <FiCheckCircle size={12} color="#10B981" />
          Settled automatically to your bank by Paystack
        </div>
      </div>

      {/* Bank display (read-only) */}
      {bankAccount
        ? <LinkedBankDisplay bank={bankAccount} />
        : (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
            <RiBankLine size={16} color="rgba(232,232,240,0.3)" />
            <span style={{ fontSize: 13, color: "rgba(232,232,240,0.35)", fontWeight: 500 }}>No bank account linked yet. Link one in the Wallet tab.</span>
          </div>
        )
      }

      {/* Transaction history header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,232,240,0.45)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Paystack Earning History
        </span>
        {txs.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(232,232,240,0.3)" }}>
            {txs.length} loaded
          </span>
        )}
      </div>

      {/* List */}
      {loadingInitial ? (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} last={i === 3} />)}
        </div>
      ) : txs.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "44px 20px", background: "rgba(255,255,255,0.02)", border: "1.5px dashed rgba(255,255,255,0.07)", borderRadius: 18, color: "rgba(232,232,240,0.3)" }}>
          <FiInbox size={32} strokeWidth={1.2} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(232,232,240,0.35)" }}>No Paystack transactions yet</span>
          <span style={{ fontSize: 12, color: "rgba(232,232,240,0.25)", textAlign: "center" }}>Earnings from card and bank transfer orders will appear here</span>
        </div>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
          {txs.map((tx, i) => (
            <div key={tx.id}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < txs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.15)" }}>
                <FiArrowDownLeft size={16} color={ACCENT} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                  {tx.desc || "Paystack Order Earning"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {tx.orderNumber && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "rgba(232,232,240,0.4)", fontWeight: 600 }}>
                      <FiHash size={10} />{tx.orderNumber}
                    </span>
                  )}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "rgba(232,232,240,0.35)", fontWeight: 500 }}>
                    <FiCalendar size={10} />{formatDate(tx.createdAt)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 900, color: "#10B981" }}>
                  +₦{formatAmount(tx.amount)}
                </span>
                <SettlementBadge status={tx.settlementStatus} />
              </div>
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={loaderRef} style={{ height: 1 }} />

          {loadingMore && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <FiLoader size={14} color={ACCENT} style={{ animation: "spin 0.7s linear infinite" }} />
              <span style={{ fontSize: 12, color: "rgba(232,232,240,0.4)", fontWeight: 600 }}>Loading more transactions…</span>
            </div>
          )}

          {!hasMore && txs.length > 0 && (
            <div style={{ padding: "14px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 11, color: "rgba(232,232,240,0.25)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                All transactions loaded
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── WALLET TAB ───────────────────────────────────────────────────────────────
function WalletTab({ vendorId, fns }: { vendorId: string; fns: ReturnType<typeof getFunctions> }) {
  const [balance, setBalance] = useState(0);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [txs, setTxs] = useState<VendorWalletTx[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const addToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  // Live listeners
  useEffect(() => {
    if (!vendorId) return;
    const u1 = onSnapshot(doc(db, "vendorSplitWallets", vendorId), snap =>
      setBalance(snap.exists() ? (snap.data()!.balance ?? 0) : 0));
    const u2 = onSnapshot(doc(db, "vendors", vendorId), snap => {
      setBankAccount(snap.data()?.bankAccount ?? null);
    });
    return () => { u1(); u2(); };
  }, [vendorId]);

  // Load first page
  const loadFirst = useCallback(async () => {
    if (!vendorId) return;
    setLoadingInitial(true);
    try {
      const q = query(
        collection(db, "vendorSplitWalletTransactions"),
        where("vendorId", "==", vendorId),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorWalletTx)));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingInitial(false); }
  }, [vendorId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!vendorId || !lastDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "vendorSplitWalletTransactions"),
        where("vendorId", "==", vendorId),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      setTxs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as VendorWalletTx))]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingMore(false); }
  }, [vendorId, lastDoc, loadingMore, hasMore]);

  // Intersection observer
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial) loadMore();
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingInitial, loadMore]);

  const handleLinkBank = async (params: { bank: PaystackBank; account_number: string; account_name: string }) => {
    setSavingBank(true); setLinkError(null);
    try {
      await httpsCallable(fns, "createVendorPaystackRecipient")({ account_number: params.account_number, bank_code: params.bank.code, account_name: params.account_name, bank_name: params.bank.name });
      addToast("Bank account linked successfully");
    } catch (e: any) { setLinkError(e?.message || "Failed to link bank account"); }
    finally { setSavingBank(false); }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try { await deleteDoc(doc(db, "vendorBankAccounts", vendorId)); addToast("Bank account unlinked"); }
    catch { addToast("Failed to unlink", false); }
    finally { setUnlinking(false); }
  };

  const handleWithdraw = async (amount: number) => {
    const res = await httpsCallable(fns, "vendorSplitWalletWithdraw")({ amount }) as any;
    addToast(`₦${amount.toLocaleString("en-NG")} sent to your bank`);
    setBalance(res.data.newBalance);
  };

  const totalIn = txs.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);

  return (
    <>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px", borderRadius: 14, fontSize: 13, fontWeight: 700, background: toast.ok ? "rgba(16,185,129,.95)" : "rgba(239,68,68,.95)", color: "white", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
          {toast.msg}
        </div>
      )}
      {showWithdraw && bankAccount && (
        <WithdrawModal balance={balance} bankName={bankAccount.bank_name} accountLast4={bankAccount.account_number.slice(-4)} accentColor={WALLET_ACCENT} onClose={() => setShowWithdraw(false)} onWithdraw={handleWithdraw} />
      )}

      {/* Balance card */}
      <div style={{ background: "linear-gradient(135deg,#059669,#10B981)", borderRadius: 22, padding: "24px 22px", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 12px 40px rgba(16,185,129,.3)" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,.08)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <FiDollarSign size={12} color="rgba(255,255,255,0.8)" />
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.8)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Split Wallet Balance</span>
        </div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: "white", letterSpacing: "-1px", lineHeight: 1 }}>
          ₦{formatAmount(balance)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 4, marginBottom: 6 }}>
          <FiTrendingUp size={12} /> Total earned from wallet orders: ₦{formatAmount(totalIn)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,.6)", marginBottom: 18 }}>
          <FiInfo size={11} /> These are your wallet-order earnings — withdraw anytime
        </div>
        {bankAccount ? (
          <button onClick={() => setShowWithdraw(true)} disabled={balance < 100}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "white", color: "#059669", border: "none", borderRadius: 14, padding: "13px 24px", width: "100%", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: balance < 100 ? "not-allowed" : "pointer", opacity: balance < 100 ? 0.6 : 1 }}>
            <FiArrowDown size={16} /> Withdraw Wallet Earnings
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.15)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>
            <RiBankLine size={14} /> Link a bank account below to withdraw
          </div>
        )}
      </div>

      {/* Bank card / form */}
      {bankAccount
        ? <LinkedBankCard bank_name={bankAccount.bank_name} account_number={bankAccount.account_number} account_name={bankAccount.account_name} subaccount_code={bankAccount.subaccount_code} onUnlink={handleUnlink} unlinking={unlinking} />
        : <BankLinkForm onLink={handleLinkBank} loading={savingBank} error={linkError} onClearError={() => setLinkError(null)} />
      }

      {/* Transaction history header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,232,240,0.45)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Wallet Transaction History
        </span>
        {txs.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(232,232,240,0.3)" }}>
            {txs.length} loaded
          </span>
        )}
      </div>

      {/* List */}
      {loadingInitial ? (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} last={i === 3} />)}
        </div>
      ) : txs.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "44px 20px", background: "rgba(255,255,255,0.02)", border: "1.5px dashed rgba(255,255,255,0.07)", borderRadius: 18 }}>
          <FiInbox size={32} strokeWidth={1.2} color="rgba(232,232,240,0.25)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(232,232,240,0.35)" }}>No wallet transactions yet</span>
          <span style={{ fontSize: 12, color: "rgba(232,232,240,0.25)", textAlign: "center" }}>Wallet-paid orders will appear here</span>
        </div>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
          {txs.map((tx, i) => (
            <div key={tx.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < txs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tx.type === "credit" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", color: tx.type === "credit" ? "#10B981" : "#ef4444" }}>
                {tx.type === "credit" ? <FiArrowDown size={16} /> : <FiArrowUp size={16} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                  {tx.orderId && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "rgba(232,232,240,0.3)", fontWeight: 600 }}>
                      <FiHash size={9} />{tx.orderId.slice(-8).toUpperCase()}
                    </span>
                  )}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "rgba(232,232,240,0.35)" }}>
                    <FiCalendar size={10} />{formatDate(tx.createdAt)}
                  </span>
                </div>
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: tx.type === "credit" ? "#10B981" : "#ef4444", flexShrink: 0 }}>
                {tx.type === "credit" ? "+" : "−"}₦{formatAmount(tx.amount)}
              </div>
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={loaderRef} style={{ height: 1 }} />

          {loadingMore && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <FiLoader size={14} color={WALLET_ACCENT} style={{ animation: "spin 0.7s linear infinite" }} />
              <span style={{ fontSize: 12, color: "rgba(232,232,240,0.4)", fontWeight: 600 }}>Loading more transactions…</span>
            </div>
          )}

          {!hasMore && txs.length > 0 && (
            <div style={{ padding: "14px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 11, color: "rgba(232,232,240,0.25)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                All transactions loaded
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function VendorPayoutsPage() {
  const vendorId = auth.currentUser?.uid ?? "";
  const fns = getFunctions();
  const [activeTab, setActiveTab] = useState<"paystack" | "wallet">("paystack");

  const tabs = [
    { key: "paystack" as const, label: "Paystack", icon: <FiCreditCard size={14} />, grad: "linear-gradient(135deg,#FF6B00,#FF9A00)" },
    { key: "wallet" as const, label: "Wallet", icon: <FiDollarSign size={14} />, grad: "linear-gradient(135deg,#059669,#10B981)" },
  ];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>
      <div style={{ padding: "0 20px 120px" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, transition: "all 0.2s", background: activeTab === tab.key ? tab.grad : "transparent", color: activeTab === tab.key ? "white" : "rgba(232,232,240,0.4)", boxShadow: activeTab === tab.key ? "0 4px 16px rgba(0,0,0,0.3)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "paystack"
          ? <PaystackTab vendorId={vendorId} />
          : <WalletTab vendorId={vendorId} fns={fns} />
        }
      </div>
    </>
  );
}