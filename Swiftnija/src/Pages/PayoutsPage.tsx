// pages/VendorPayoutsPage.tsx
// Vendor payout dashboard — Paystack only.
// Balance is fetched live from the vendor's Paystack subaccount.
// Earning history comes from vendorWalletTransactions (type: "credit")
// written by the updateOrderStatus cloud function on delivery.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiCheckCircle, FiAlertCircle, FiLoader, FiLink, FiScissors,
  FiShield, FiTrendingUp, FiInfo, FiInbox, FiCalendar, FiHash,
  FiArrowDownLeft, FiClock, FiSearch, FiChevronDown, FiChevronUp,
  FiRefreshCw,
} from "react-icons/fi";
import { RiBankLine } from "react-icons/ri";
import { MdVerified } from "react-icons/md";
import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc, onSnapshot, collection, query, where, orderBy,
  limit, getDocs, startAfter, deleteDoc,
  type QueryDocumentSnapshot, type DocumentData,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
type PaystackBank = { id: number; name: string; code: string; slug: string };

type VendorWalletTx = {
  id: string; type: "credit" | "debit"; amount: number; desc: string;
  createdAt: any; orderId?: string; orderNumber?: string;
  settlementStatus?: "settled" | "pending";
};

type BankAccount = {
  bank_name: string; account_number: string; account_name: string;
  subaccount_code?: string; recipient_code?: string;
};

const ACCENT = "#FF6B00";
const PAGE_SIZE = 15;

function fmt(n: number) {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ status }: { status?: string }) {
  const ok = status === "settled" || !status;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px",
      borderRadius: 5, fontSize: 9, fontWeight: 700, letterSpacing: "0.4px",
      textTransform: "uppercase", whiteSpace: "nowrap",
      background: ok ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
      border: `1px solid ${ok ? "rgba(16,185,129,0.22)" : "rgba(245,158,11,0.22)"}`,
      color: ok ? "#10B981" : "#F59E0B",
    }}>
      {ok ? <FiCheckCircle size={8} /> : <FiClock size={8} />}
      {ok ? "Settled" : "Pending"}
    </span>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function Skel({ last }: { last: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", flexShrink: 0, animation: "pulse 1.4s infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 11, width: "50%", borderRadius: 5, background: "rgba(255,255,255,0.06)", marginBottom: 7, animation: "pulse 1.4s infinite" }} />
        <div style={{ height: 9, width: "26%", borderRadius: 5, background: "rgba(255,255,255,0.04)", animation: "pulse 1.4s infinite" }} />
      </div>
      <div style={{ width: 72, height: 12, borderRadius: 5, background: "rgba(255,255,255,0.06)", animation: "pulse 1.4s infinite" }} />
    </div>
  );
}

// ─── Bank Link Form ───────────────────────────────────────────────────────────
function BankLinkForm({ onLink, loading, error, onClearError }: {
  onLink: (p: { bank: PaystackBank; account_number: string; account_name: string }) => Promise<void>;
  loading: boolean; error: string | null; onClearError: () => void;
}) {
  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PaystackBank | null>(null);
  const [open, setOpen] = useState(false);
  const [acct, setAcct] = useState("");
  const [acctName, setAcctName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100", {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_PAYSTACK_PUBLIC_KEY}` },
    }).then(r => r.json()).then(d => { if (d.data) setBanks(d.data); })
      .catch(console.error).finally(() => setLoadingBanks(false));
  }, []);

  useEffect(() => {
    if (acct.length !== 10 || !selected) { setAcctName(""); return; }
    setVerifyErr(null); setAcctName(""); setVerifying(true);
    (async () => {
      try {
        const fn = httpsCallable(getFunctions(), "paystackResolveAccount");
        const r = await fn({ account_number: acct, bank_code: selected.code }) as any;
        if (r.data?.data?.account_name) setAcctName(r.data.data.account_name);
        else setVerifyErr("Could not verify account.");
      } catch { setVerifyErr("Verification failed."); }
      finally { setVerifying(false); }
    })();
  }, [acct, selected]);

  const filtered = banks.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  const disabled = !acctName || loading || verifying;

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.75)", textTransform: "uppercase", letterSpacing: "0.8px", display: "flex", alignItems: "center", gap: 6 }}>
        <RiBankLine size={12} /> Link Bank Account
      </p>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 9, padding: "8px 11px", marginBottom: 12, color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
          <FiAlertCircle size={12} /> {error}
          <button onClick={onClearError} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      )}

      <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,232,240,0.4)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 5 }}>Select Bank</label>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div onClick={() => { setOpen(v => !v); onClearError(); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.09)", borderRadius: 10, cursor: "pointer", userSelect: "none", color: selected ? "#e8e8f0" : "rgba(232,232,240,0.35)", fontSize: 13 }}>
          <span>{selected ? selected.name : loadingBanks ? "Loading…" : "Choose your bank"}</span>
          {open ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
        </div>
        {open && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, background: "#14142a", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden", marginTop: 3, boxShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "8px 11px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 7 }}>
              <FiSearch size={12} color="rgba(232,232,240,0.3)" />
              <input autoFocus placeholder="Search bank…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: "transparent", border: "none", outline: "none", color: "#e8e8f0", fontSize: 13, flex: 1, fontFamily: "'DM Sans',sans-serif" }} />
            </div>
            <div style={{ maxHeight: 190, overflowY: "auto" }}>
              {filtered.length === 0
                ? <div style={{ padding: "12px 14px", color: "rgba(232,232,240,0.3)", fontSize: 13 }}>No banks found</div>
                : filtered.map(b => (
                  <div key={b.id} onClick={() => { setSelected(b); setOpen(false); setSearch(""); }}
                    style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", color: selected?.id === b.id ? ACCENT : "#e8e8f0", background: selected?.id === b.id ? "rgba(255,107,0,0.07)" : "transparent" }}>
                    {b.name}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(232,232,240,0.4)", textTransform: "uppercase", letterSpacing: "0.6px", display: "block", marginBottom: 5 }}>Account Number</label>
      <input placeholder="10-digit account number" value={acct} maxLength={10} inputMode="numeric"
        onChange={e => { setAcct(e.target.value.replace(/\D/g, "")); onClearError(); }}
        style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.09)", borderRadius: 10, color: "#e8e8f0", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box", marginBottom: 6 }} />

      {verifying && <p style={{ margin: "0 0 7px", display: "flex", alignItems: "center", gap: 5, color: "rgba(232,232,240,0.4)", fontSize: 11 }}><FiLoader size={10} style={{ animation: "spin 0.7s linear infinite" }} /> Verifying…</p>}
      {verifyErr && <p style={{ margin: "0 0 7px", color: "#ef4444", fontSize: 11, fontWeight: 600 }}>{verifyErr}</p>}

      {acctName && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", marginBottom: 12 }}>
          <FiCheckCircle size={14} color="#10B981" />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#10B981" }}>{acctName}</p>
            <p style={{ margin: 0, fontSize: 10, color: "rgba(232,232,240,0.38)" }}>Account verified</p>
          </div>
        </div>
      )}

      <button onClick={() => { if (selected && acct && acctName) onLink({ bank: selected, account_number: acct, account_name: acctName }); }}
        disabled={disabled}
        style={{ width: "100%", padding: "11px", borderRadius: 11, background: disabled ? "#18182a" : `linear-gradient(135deg,${ACCENT},#FF9A00)`, border: "none", color: disabled ? "#444" : "white", fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: disabled ? "none" : "0 4px 16px rgba(255,107,0,0.3)", transition: "all 0.2s" }}>
        {loading ? <><FiLoader size={13} style={{ animation: "spin 0.7s linear infinite" }} /> Linking…</> : <><FiLink size={13} /> Link Bank Account</>}
      </button>
    </div>
  );
}

// ─── Linked Bank Card ─────────────────────────────────────────────────────────
function LinkedBankCard({ bank_name, account_number, account_name, subaccount_code, onUnlink, unlinking }: {
  bank_name: string; account_number: string; account_name: string;
  subaccount_code?: string; onUnlink: () => void; unlinking: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.75)", textTransform: "uppercase", letterSpacing: "0.8px", display: "flex", alignItems: "center", gap: 6 }}>
        <RiBankLine size={12} /> Linked Bank Account
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <RiBankLine size={19} color={ACCENT} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0" }}>{bank_name}</span>
            {subaccount_code && <MdVerified size={13} color="#10B981" />}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(232,232,240,0.42)" }}>•••• •••• {account_number.slice(-4)}</p>
          <p style={{ margin: "1px 0 0", fontSize: 11, color: "rgba(232,232,240,0.32)" }}>{account_name}</p>
        </div>
        <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 9, fontWeight: 800, color: "#10B981", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>LINKED</span>
      </div>
      {!confirm ? (
        <button onClick={() => setConfirm(true)} style={{ width: "100%", padding: "9px", borderRadius: 10, cursor: "pointer", background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
          <FiScissors size={12} /> Unlink Account
        </button>
      ) : (
        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.16)", borderRadius: 10, padding: 12 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#e8e8f0", lineHeight: 1.6 }}>Paystack won't settle earnings without a linked account. Are you sure?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "9px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(232,232,240,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
            <button onClick={onUnlink} disabled={unlinking} style={{ flex: 1, padding: "9px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444", cursor: "pointer", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              {unlinking ? <FiLoader size={12} style={{ animation: "spin 0.7s linear infinite" }} /> : <FiScissors size={12} />}
              {unlinking ? "Unlinking…" : "Yes, Unlink"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function VendorPayoutsPage() {
  const vendorId = auth.currentUser?.uid ?? "";
  const fns = getFunctions();

  const [paystackTotal, setPaystackTotal] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [txs, setTxs] = useState<VendorWalletTx[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const addToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Live: bank account from vendor doc
  useEffect(() => {
    if (!vendorId) return;
    return onSnapshot(doc(db, "vendors", vendorId), snap => {
      setBankAccount(snap.data()?.bankAccount ?? null);
    });
  }, [vendorId]);

  const fetchPaystackTotal = useCallback(async () => {
  if (!vendorId) return;
  setBalanceLoading(true);
  try {
    // ✅ Read subaccount_code directly from vendors doc, not vendorBankAccounts
    const vendorSnap = await getDocs(
      query(collection(db, "vendors"), where("uid", "==", vendorId), limit(1))
    );
    const subaccount_code = vendorSnap.docs[0]?.data()?.bankAccount?.subaccount_code;

    if (!subaccount_code) {
      setPaystackTotal(null);
      setBalanceLoading(false);
      return;
    }

    const fn = httpsCallable(fns, "paystackGetTransactions");
    const result = await fn({ subaccount_code }) as any;
    const txData: any[] = result.data?.transactions ?? [];
    const total = txData
      .filter((t: any) => t.status === "success")
      .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 100;
    setPaystackTotal(total);
  } catch (err) {
    console.error("Paystack total fetch failed:", err);
    setPaystackTotal(null);
  } finally {
    setBalanceLoading(false);
  }
}, [vendorId, fns]);

  useEffect(() => { fetchPaystackTotal(); }, [fetchPaystackTotal]);

  // Transaction history (written by updateOrderStatus on delivery)
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

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && hasMore && !loadingMore && !loadingInitial) loadMore();
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loadingInitial, loadMore]);

  const handleLinkBank = async (params: { bank: PaystackBank; account_number: string; account_name: string }) => {
    setSavingBank(true); setLinkError(null);
    try {
      await httpsCallable(fns, "createVendorPaystackRecipient")({
        account_number: params.account_number,
        bank_code: params.bank.code,
        account_name: params.account_name,
        bank_name: params.bank.name,
      });
      addToast("Bank account linked successfully");
      fetchPaystackTotal();
    } catch (e: any) { setLinkError(e?.message || "Failed to link bank account"); }
    finally { setSavingBank(false); }
  };

  const handleUnlink = async () => {
  setUnlinking(true);
  try {
    // ✅ Remove bankAccount field from vendors doc instead
    const { updateDoc, doc: firestoreDoc } = await import("firebase/firestore");
    const { deleteField } = await import("firebase/firestore");
    await updateDoc(firestoreDoc(db, "vendors", vendorId), {
      bankAccount: deleteField(),
      bankLinked: deleteField(),
    });
    addToast("Bank account unlinked");
    setPaystackTotal(null);
  } catch {
    addToast("Failed to unlink", false);
  } finally {
    setUnlinking(false);
  }
};

  const settledCount = txs.filter(t => !t.settlementStatus || t.settlementStatus === "settled").length;
  const pendingCount = txs.filter(t => t.settlementStatus === "pending").length;

  return (
    <>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:.7} }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 16, left: 16, right: 16, zIndex: 9999, padding: "11px 15px", borderRadius: 11, fontSize: 13, fontWeight: 700, background: toast.ok ? "rgba(16,185,129,.96)" : "rgba(239,68,68,.96)", color: "white", boxShadow: "0 6px 24px rgba(0,0,0,.4)", textAlign: "center" }}>
          {toast.msg}
        </div>
      )}

      {/* Full width wrapper — no artificial constraints */}
      <div style={{ width: "100%", boxSizing: "border-box", padding: "0 16px 100px" }}>

        {/* ── Hero card ─────────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg,rgba(255,107,0,0.13),rgba(255,107,0,0.04))",
          border: "1px solid rgba(255,107,0,0.19)", borderRadius: 16,
          padding: "18px 16px 16px", marginBottom: 14,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -35, right: -35, width: 120, height: 120, borderRadius: "50%", border: "1px solid rgba(255,107,0,0.09)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <FiTrendingUp size={11} color={ACCENT} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,107,0,0.75)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Total Paystack Earnings</span>
          </div>

          {/* Balance — correct source */}
          {balanceLoading ? (
            <div style={{ height: 30, width: "55%", borderRadius: 7, background: "rgba(255,255,255,0.06)", animation: "pulse 1.4s infinite", marginBottom: 6 }} />
          ) : paystackTotal !== null ? (
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: "#e8e8f0", letterSpacing: "-0.8px", lineHeight: 1, marginBottom: 6 }}>
              &#8358;{fmt(paystackTotal)}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(232,232,240,0.35)", marginBottom: 6, fontStyle: "italic" }}>
              Link a bank account to view earnings
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(232,232,240,0.38)", fontWeight: 500, marginBottom: 14 }}>
            <FiCheckCircle size={10} color="#10B981" />
            Settled automatically to your bank by Paystack
          </div>

          {/* 3 stat chips */}
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { label: "Settled", value: settledCount, accent: "#10B981" },
              { label: "Pending", value: pendingCount, accent: pendingCount > 0 ? "#F59E0B" : "rgba(232,232,240,0.55)" },
              { label: "Total Loaded", value: txs.length, accent: "rgba(232,232,240,0.55)" },
            ] as const).map(s => (
              <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 10px" }}>
                <p style={{ margin: "0 0 2px", fontSize: 9, fontWeight: 800, color: "rgba(232,232,240,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</p>
                <p style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 900, color: s.accent, lineHeight: 1 }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Info banner ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: "rgba(255,107,0,0.05)", border: "1px solid rgba(255,107,0,0.1)", borderRadius: 11, padding: "10px 13px", marginBottom: 16 }}>
          <FiInfo size={13} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: "rgba(232,232,240,0.52)", lineHeight: 1.65, fontWeight: 500 }}>
            Paystack automatically settles your earnings to your linked bank account on the next business day. No manual withdrawal needed — just link your account below and keep selling on Swift9ja.
          </p>
        </div>

        {/* ── Bank section ──────────────────────────────────────────────────── */}
        {bankAccount ? (
          <LinkedBankCard
            bank_name={bankAccount.bank_name}
            account_number={bankAccount.account_number}
            account_name={bankAccount.account_name}
            subaccount_code={bankAccount.subaccount_code}
            onUnlink={handleUnlink}
            unlinking={unlinking}
          />
        ) : (
          <BankLinkForm onLink={handleLinkBank} loading={savingBank} error={linkError} onClearError={() => setLinkError(null)} />
        )}

        {/* ── History header ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,232,240,0.38)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Earning History
          </span>
          <button onClick={() => { loadFirst(); fetchPaystackTotal(); }}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "rgba(232,232,240,0.32)", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>
            <FiRefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* ── Transaction list ──────────────────────────────────────────────── */}
        {loadingInitial ? (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {Array.from({ length: 5 }).map((_, i) => <Skel key={i} last={i === 4} />)}
          </div>
        ) : txs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9, padding: "40px 16px", background: "rgba(255,255,255,0.02)", border: "1.5px dashed rgba(255,255,255,0.07)", borderRadius: 14 }}>
            <FiInbox size={32} strokeWidth={1.2} color="rgba(232,232,240,0.2)" />
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "rgba(232,232,240,0.3)" }}>No earnings yet</p>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(232,232,240,0.2)", textAlign: "center", maxWidth: 230, lineHeight: 1.55 }}>
              Earnings appear here after customers pay and delivery is confirmed on Swift9ja.
            </p>
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {txs.map((tx, i) => (
              <div key={tx.id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: i < txs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.13)" }}>
                  <FiArrowDownLeft size={14} color={ACCENT} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#e8e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.desc || "Swift9ja Order Earning"}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {tx.orderNumber && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "rgba(232,232,240,0.36)", fontWeight: 600 }}>
                        <FiHash size={9} />{tx.orderNumber}
                      </span>
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "rgba(232,232,240,0.3)" }}>
                      <FiCalendar size={9} />{fmtDate(tx.createdAt)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, color: "#10B981", whiteSpace: "nowrap" }}>
                    +&#8358;{fmt(tx.amount)}
                  </span>
                  <Badge status={tx.settlementStatus} />
                </div>
              </div>
            ))}

            <div ref={loaderRef} style={{ height: 1 }} />

            {loadingMore && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <FiLoader size={13} color={ACCENT} style={{ animation: "spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 11, color: "rgba(232,232,240,0.35)", fontWeight: 600 }}>Loading more…</span>
              </div>
            )}

            {!hasMore && txs.length > 0 && (
              <div style={{ padding: "11px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: 10, color: "rgba(232,232,240,0.2)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  All transactions loaded
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 10, fontWeight: 600, color: "rgba(232,232,240,0.22)", marginTop: 16 }}>
          <FiShield size={10} color="#10B981" />
          Settlements powered by Paystack — Swift9ja
        </div>
      </div>
    </>
  );
}