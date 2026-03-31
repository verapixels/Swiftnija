// pages/RiderPayoutsPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  FiArrowDown, FiArrowUp, FiShield, FiLink,
  FiScissors, FiLoader, FiSearch, FiChevronDown,
  FiChevronUp, FiCheckCircle, FiAlertCircle,
  FiTrendingUp, FiInbox, FiCalendar, FiHash,
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

type PaystackBank = { id: number; name: string; code: string; slug: string };
type RiderWalletTx = {
  id: string; type: "credit" | "debit"; amount: number;
  desc: string; createdAt: any; orderId?: string; transferCode?: string;
};
type BankAccount = {
  bank_name: string; account_number: string;
  account_name: string; recipient_code?: string;
};
type C = Record<string, string>;

const ACCENT = "#FF6B00";
const PAGE_SIZE = 15;

function useColors(): C {
  const { theme } = useTheme();
  const d = theme === "dark";
  return {
    bg:    d ? "#0a0a0e"                    : "#f2f2fa",
    surf:  d ? "#13131a"                    : "#ffffff",
    brd:   d ? "#1e1e2c"                    : "#e0e0ee",
    txt:   d ? "#eeeef8"                    : "#111118",
    sub:   d ? "#66668a"                    : "#7777a2",
    dim:   d ? "#30304a"                    : "#c0c0d8",
    inp:   d ? "#16161f"                    : "#f0f0fa",
    inpB:  d ? "#26263a"                    : "#d4d4ee",
    skl:   d ? "rgba(255,255,255,0.05)"     : "rgba(0,0,0,0.06)",
    skl2:  d ? "rgba(255,255,255,0.04)"     : "rgba(0,0,0,0.04)",
    row:   d ? "rgba(255,255,255,0.02)"     : "rgba(0,0,0,0.02)",
    card:  d ? "rgba(255,255,255,0.03)"     : "rgba(0,0,0,0.02)",
    cardB: d ? "rgba(255,255,255,0.08)"     : "rgba(0,0,0,0.08)",
    drop:  d ? "#12121e"                    : "#ffffff",
    dropB: d ? "rgba(255,255,255,0.1)"      : "rgba(0,0,0,0.12)",
    errBg: d ? "rgba(239,68,68,0.08)"       : "rgba(239,68,68,0.06)",
    errB:  d ? "rgba(239,68,68,0.2)"        : "rgba(239,68,68,0.25)",
    okBg:  d ? "rgba(16,185,129,0.07)"      : "rgba(16,185,129,0.08)",
    okB:   d ? "rgba(16,185,129,0.2)"       : "rgba(16,185,129,0.3)",
    dsbBg: d ? "#1a1a2a"                    : "#e8e8f0",
    dsbTx: d ? "#444"                       : "#999",
  };
}

function fmtDate(ts: any): string {
  if (!ts) return "—";
  const dt = ts?.toDate ? ts.toDate() : new Date(ts);
  return dt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtAmt(n: number): string {
  return n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRow({ last, c }: { last: boolean; c: C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: last ? "none" : `1px solid ${c.brd}` }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: c.skl, flexShrink: 0, animation: "rp-pulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 12, width: "55%", borderRadius: 6, background: c.skl, marginBottom: 8, animation: "rp-pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "30%", borderRadius: 6, background: c.skl2, animation: "rp-pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: 70, height: 14, borderRadius: 6, background: c.skl, animation: "rp-pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

// ── Bank Link Form ────────────────────────────────────────────────────────────
function BankLinkForm({ onLink, loading: saving, error, onClearError, c }: {
  onLink: (p: { bank: PaystackBank; account_number: string; account_name: string }) => Promise<void>;
  loading: boolean; error: string | null; onClearError: () => void; c: C;
}) {
  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PaystackBank | null>(null);
  const [open, setOpen] = useState(false);
  const [accNum, setAccNum] = useState("");
  const [accName, setAccName] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100", {
      headers: { Authorization: `Bearer ${import.meta.env.VITE_PAYSTACK_PUBLIC_KEY}` },
    }).then(r => r.json()).then(d => { if (d.data) setBanks(d.data); }).catch(console.error).finally(() => setLoadingBanks(false));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (accNum.length !== 10 || !selected) { setAccName(""); return; }
    setVerifyErr(null); setAccName(""); setVerifying(true);
    (async () => {
      try {
        const fn = httpsCallable(getFunctions(), "paystackResolveAccount");
        const r = await fn({ account_number: accNum, bank_code: selected.code }) as any;
        if (r.data?.data?.account_name) setAccName(r.data.data.account_name);
        else setVerifyErr("Could not verify account.");
      } catch { setVerifyErr("Verification failed. Check your connection."); }
      finally { setVerifying(false); }
    })();
  }, [accNum, selected]);

  const filtered = banks.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  const canSubmit = !!accName && !saving && !verifying;

  return (
    <div style={{ background: c.card, border: `1px solid ${c.cardB}`, borderRadius: 20, padding: 24, marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 20, display: "flex", alignItems: "center", gap: 7 }}>
        <RiBankLine size={13} /> Link Bank Account
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.errBg, border: `1px solid ${c.errB}`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
          <FiAlertCircle size={14} /> {error}
          <button onClick={onClearError} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Bank picker */}
      <div style={{ marginBottom: 16, position: "relative" }} ref={ref}>
        <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>Select Bank</div>
        <div onClick={() => { setOpen(v => !v); onClearError(); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: c.inp, border: `1.5px solid ${open ? ACCENT : c.inpB}`, borderRadius: 12, cursor: "pointer", userSelect: "none", color: selected ? c.txt : c.sub, fontSize: 13, boxShadow: open ? "0 0 0 3px rgba(255,107,0,0.1)" : "none", transition: "border-color .2s,box-shadow .2s" }}>
          <span>{selected ? selected.name : loadingBanks ? "Loading banks…" : "Choose your bank"}</span>
          {open ? <FiChevronUp size={14} color={c.sub} /> : <FiChevronDown size={14} color={c.sub} />}
        </div>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 100, background: c.drop, border: `1.5px solid ${c.dropB}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${c.brd}`, display: "flex", alignItems: "center", gap: 8 }}>
              <FiSearch size={13} color={c.sub} />
              <input autoFocus placeholder="Search bank…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: "transparent", border: "none", outline: "none", color: c.txt, fontSize: 13, flex: 1, fontFamily: "'DM Sans',sans-serif" }} />
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {filtered.length === 0
                ? <div style={{ padding: 16, color: c.sub, fontSize: 13, textAlign: "center" }}>No banks found</div>
                : filtered.map(b => (
                  <div key={b.id} onClick={() => { setSelected(b); setOpen(false); setSearch(""); }}
                    style={{ padding: "11px 16px", fontSize: 13, cursor: "pointer", color: selected?.id === b.id ? ACCENT : c.txt, background: selected?.id === b.id ? "rgba(255,107,0,0.07)" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {b.name}
                    {selected?.id === b.id && <FiCheckCircle size={13} color={ACCENT} />}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Account number */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7 }}>Account Number</div>
        <input placeholder="Enter 10-digit account number" value={accNum} maxLength={10} inputMode="numeric"
          onChange={e => { setAccNum(e.target.value.replace(/\D/g, "")); onClearError(); setVerifyErr(null); }}
          style={{ width: "100%", padding: "12px 14px", background: c.inp, border: `1.5px solid ${verifyErr ? c.errB : accName ? c.okB : c.inpB}`, borderRadius: 12, color: c.txt, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color .2s" }} />
        {verifying && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: c.sub, fontSize: 11 }}>
            <FiLoader size={11} style={{ animation: "rp-spin 0.7s linear infinite" }} /> Verifying account…
          </div>
        )}
        {verifyErr && <div style={{ marginTop: 8, color: "#ef4444", fontSize: 11, fontWeight: 600 }}>{verifyErr}</div>}
      </div>

      {accName && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: c.okBg, border: `1px solid ${c.okB}`, marginBottom: 20 }}>
          <FiCheckCircle size={16} color="#10B981" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{accName}</div>
            <div style={{ fontSize: 11, color: c.sub, marginTop: 1 }}>Account verified</div>
          </div>
        </div>
      )}

      <button onClick={() => { if (canSubmit) onLink({ bank: selected!, account_number: accNum, account_name: accName }); }} disabled={!canSubmit}
        style={{ width: "100%", padding: "14px", borderRadius: 14, background: canSubmit ? `linear-gradient(135deg,${ACCENT},#FF9A00)` : c.dsbBg, border: "none", color: canSubmit ? "white" : c.dsbTx, fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: canSubmit ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: canSubmit ? "0 4px 20px rgba(255,107,0,0.35)" : "none", transition: "all .2s" }}>
        {saving ? <><FiLoader size={14} style={{ animation: "rp-spin 0.7s linear infinite" }} /> Linking…</> : <><FiLink size={14} /> Link Bank Account</>}
      </button>
    </div>
  );
}

// ── Linked Bank Card ──────────────────────────────────────────────────────────
function LinkedBankCard({ bank_name, account_number, account_name, onUnlink, unlinking, c }: {
  bank_name: string; account_number: string; account_name: string;
  onUnlink: () => void; unlinking: boolean; c: C;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background: c.card, border: `1px solid ${c.cardB}`, borderRadius: 20, padding: 22, marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,107,0,0.7)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <RiBankLine size={13} /> Linked Bank Account
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0, background: "rgba(255,107,0,0.1)", border: "1px solid rgba(255,107,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RiBankLine size={22} color={ACCENT} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: c.txt }}>{bank_name}</span>
            <MdVerified size={14} color="#10B981" />
          </div>
          <div style={{ fontSize: 13, color: c.sub }}>{account_name} · •••• {account_number.slice(-4)}</div>
        </div>
        <div style={{ padding: "5px 10px", borderRadius: 8, background: c.okBg, border: `1px solid ${c.okB}`, fontSize: 10, fontWeight: 800, color: "#10B981", flexShrink: 0 }}>ACTIVE</div>
      </div>
      {!confirm ? (
        <button onClick={() => setConfirm(true)}
          style={{ width: "100%", padding: "11px", borderRadius: 12, cursor: "pointer", background: "transparent", border: `1px solid ${c.errB}`, color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'DM Sans',sans-serif", transition: "background .2s" }}
          onMouseEnter={e => (e.currentTarget.style.background = c.errBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <FiScissors size={13} /> Unlink Account
        </button>
      ) : (
        <div style={{ background: c.errBg, border: `1px solid ${c.errB}`, borderRadius: 14, padding: 16 }}>
          <p style={{ fontSize: 13, color: c.txt, marginBottom: 14, lineHeight: 1.6, margin: "0 0 14px" }}>Are you sure? You will need to re-link to receive withdrawals.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: c.inp, border: `1px solid ${c.inpB}`, color: c.sub, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
            <button onClick={onUnlink} disabled={unlinking} style={{ flex: 1, padding: "10px", borderRadius: 10, background: c.errBg, border: `1px solid ${c.errB}`, color: "#EF4444", cursor: "pointer", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {unlinking ? <FiLoader size={13} style={{ animation: "rp-spin 0.7s linear infinite" }} /> : <FiScissors size={13} />}
              {unlinking ? "Unlinking…" : "Yes, Unlink"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Withdraw Modal ────────────────────────────────────────────────────────────
function WithdrawModal({ balance, bankName, accountLast4, onClose, onWithdraw, c }: {
  balance: number; bankName: string; accountLast4: string;
  onClose: () => void; onWithdraw: (amount: number) => Promise<void>; c: C;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const num = parseFloat(amount.replace(/,/g, "")) || 0;
  const quickAmounts = [500, 1000, 2000, 5000].filter(a => a <= balance);

  const handleWithdraw = async () => {
    if (!num || num < 100) { setError("Minimum withdrawal is ₦100"); return; }
    if (num > balance) { setError("Amount exceeds your available balance"); return; }
    setError(""); setLoading(true);
    try { await onWithdraw(num); onClose(); }
    catch (e: any) { setError(e?.message || "Withdrawal failed. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 26, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 40px 80px rgba(0,0,0,0.25)" }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: c.txt, marginBottom: 4 }}>Withdraw Earnings</div>
        <div style={{ fontSize: 12, color: c.sub, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
          <RiBankLine size={12} /> {bankName} · ****{accountLast4}
        </div>
        <div style={{ background: "rgba(255,107,0,0.06)", border: "1px solid rgba(255,107,0,0.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: c.sub, fontWeight: 600 }}>Available balance</span>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900, color: ACCENT }}>₦{fmtAmt(balance)}</span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>Quick select</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {quickAmounts.map(a => (
              <button key={a} onClick={() => { setAmount(a.toLocaleString("en-NG")); setError(""); }}
                style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", border: `1.5px solid ${num === a ? "rgba(255,107,0,0.5)" : c.inpB}`, background: num === a ? "rgba(255,107,0,0.12)" : c.inp, color: num === a ? ACCENT : c.sub, fontSize: 13, fontWeight: 700, transition: "all .15s" }}>
                ₦{a.toLocaleString()}
              </button>
            ))}
            <button onClick={() => { setAmount(balance.toLocaleString("en-NG")); setError(""); }}
              style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", border: `1.5px solid ${c.inpB}`, background: c.inp, color: c.sub, fontSize: 13, fontWeight: 700 }}>All</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: c.inp, border: `1.5px solid ${error ? c.errB : c.inpB}`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, transition: "border-color .2s" }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, color: ACCENT, fontSize: 20 }}>₦</span>
          <input autoFocus inputMode="numeric" placeholder="0" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ""); setAmount(raw ? Number(raw).toLocaleString("en-NG") : ""); setError(""); }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: c.txt, fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900 }} />
        </div>
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.errBg, border: `1px solid ${c.errB}`, borderRadius: 12, padding: "10px 14px", color: "#ef4444", fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
            <FiAlertCircle size={14} /> {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "13px", borderRadius: 13, background: c.inp, border: `1px solid ${c.inpB}`, color: c.sub, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
          <button onClick={handleWithdraw} disabled={loading || !num}
            style={{ flex: 2, padding: "13px", borderRadius: 13, border: "none", background: loading || !num ? c.dsbBg : `linear-gradient(135deg,${ACCENT},#FF9A00)`, color: loading || !num ? c.dsbTx : "white", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: loading || !num ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: loading || !num ? "none" : "0 4px 20px rgba(255,107,0,0.4)", transition: "all .2s" }}>
            {loading ? <><FiLoader size={14} style={{ animation: "rp-spin 0.7s linear infinite" }} /> Sending…</> : <><FiArrowUp size={14} /> Withdraw Now</>}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 600, color: c.sub }}>
          <FiShield size={11} color="#10B981" /> Instant bank transfer via Paystack
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RiderPayoutsPage() {
  const riderId = auth.currentUser?.uid ?? "";
  const fns = getFunctions();
  const c = useColors();

  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [txs, setTxs] = useState<RiderWalletTx[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const addToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    if (!riderId) return;
    const u1 = onSnapshot(doc(db, "riderWallets", riderId), snap => {
      if (snap.exists()) { setBalance(snap.data().balance ?? 0); setTotalEarned(snap.data().totalIn ?? snap.data().balance ?? 0); }
    });
    const u2 = onSnapshot(doc(db, "riderBankAccounts", riderId), snap => {
      setBankAccount(snap.exists() ? snap.data() as BankAccount : null);
    });
    return () => { u1(); u2(); };
  }, [riderId]);

  const loadFirst = useCallback(async () => {
    if (!riderId) return;
    setLoadingInitial(true);
    try {
      const snap = await getDocs(query(collection(db, "riderWalletTransactions"), where("riderId", "==", riderId), orderBy("createdAt", "desc"), limit(PAGE_SIZE)));
      setTxs(snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderWalletTx)));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingInitial(false); }
  }, [riderId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!riderId || !lastDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, "riderWalletTransactions"), where("riderId", "==", riderId), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE)));
      setTxs(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as RiderWalletTx))]);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
    finally { setLoadingMore(false); }
  }, [riderId, lastDoc, loadingMore, hasMore]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial) loadMore(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loadingInitial, loadMore]);

  const handleLinkBank = async (p: { bank: PaystackBank; account_number: string; account_name: string }) => {
    setSavingBank(true); setLinkError(null);
    try {
      await httpsCallable(fns, "createRiderPaystackRecipient")({ account_number: p.account_number, bank_code: p.bank.code, account_name: p.account_name, bank_name: p.bank.name });
      addToast("Bank account linked successfully");
    } catch (e: any) { setLinkError(e?.message || "Failed to link bank account"); }
    finally { setSavingBank(false); }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try { await deleteDoc(doc(db, "riderBankAccounts", riderId)); addToast("Bank account unlinked"); }
    catch { addToast("Failed to unlink", false); }
    finally { setUnlinking(false); }
  };

  const handleWithdraw = async (amount: number) => {
    const res = await httpsCallable(fns, "riderWalletWithdraw")({ amount }) as any;
    addToast(`₦${amount.toLocaleString("en-NG")} sent to your bank`);
    setBalance(res.data.newBalance);
  };

  return (
    <>
      <style>{`
        @keyframes rp-spin { to { transform: rotate(360deg); } }
        @keyframes rp-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px", borderRadius: 14, fontSize: 13, fontWeight: 700, background: toast.ok ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)", color: "white", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
          {toast.msg}
        </div>
      )}

      {showWithdraw && bankAccount && (
        <WithdrawModal balance={balance} bankName={bankAccount.bank_name} accountLast4={bankAccount.account_number.slice(-4)} onClose={() => setShowWithdraw(false)} onWithdraw={handleWithdraw} c={c} />
      )}

      <div style={{ padding: "0 20px 120px", maxWidth: 600, margin: "0 auto", background: c.bg, minHeight: "100vh" }}>

        {/* Balance card */}
        <div style={{ background: `linear-gradient(135deg,${ACCENT} 0%,#FF9A00 100%)`, borderRadius: 24, padding: "28px 24px", marginBottom: 24, position: "relative", overflow: "hidden", boxShadow: "0 16px 48px rgba(255,107,0,0.3)" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -20, left: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <FiTrendingUp size={12} color="rgba(255,255,255,0.8)" />
            <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Delivery Earnings</span>
          </div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 34, fontWeight: 900, color: "white", letterSpacing: "-1.5px", lineHeight: 1, marginBottom: 6 }}>
            ₦{fmtAmt(balance)}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 22, display: "flex", alignItems: "center", gap: 5 }}>
            <FiCheckCircle size={11} /> Total earned: ₦{fmtAmt(totalEarned)}
          </div>
          {bankAccount ? (
            <button onClick={() => setShowWithdraw(true)} disabled={balance < 100}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "white", color: ACCENT, border: "none", borderRadius: 16, padding: "14px 24px", width: "100%", fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, cursor: balance < 100 ? "not-allowed" : "pointer", opacity: balance < 100 ? 0.55 : 1, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", transition: "opacity .2s,transform .2s" }}
              onMouseEnter={e => { if (balance >= 100) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
              <FiArrowDown size={16} /> Withdraw to Bank
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", borderRadius: 13, padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
              <RiBankLine size={14} /> Link a bank account below to withdraw
            </div>
          )}
        </div>

        {/* Bank section */}
        {bankAccount
          ? <LinkedBankCard bank_name={bankAccount.bank_name} account_number={bankAccount.account_number} account_name={bankAccount.account_name} onUnlink={handleUnlink} unlinking={unlinking} c={c} />
          : <BankLinkForm onLink={handleLinkBank} loading={savingBank} error={linkError} onClearError={() => setLinkError(null)} c={c} />
        }

        {/* History header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: "0.8px" }}>Earning History</span>
          {txs.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: c.dim }}>{txs.length} loaded</span>}
        </div>

        {/* Transaction list */}
        {loadingInitial ? (
          <div style={{ background: c.card, border: `1px solid ${c.cardB}`, borderRadius: 18, overflow: "hidden" }}>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} last={i === 4} c={c} />)}
          </div>
        ) : txs.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "52px 20px", background: c.card, border: `1.5px dashed ${c.cardB}`, borderRadius: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FiInbox size={24} color="rgba(255,107,0,0.5)" strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.sub }}>No earnings yet</div>
            <div style={{ fontSize: 12, color: c.dim, textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>Complete deliveries to start earning. Your history will appear here.</div>
          </div>
        ) : (
          <div style={{ background: c.card, border: `1px solid ${c.cardB}`, borderRadius: 18, overflow: "hidden" }}>
            {txs.map((tx, i) => (
              <div key={tx.id}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < txs.length - 1 ? `1px solid ${c.brd}` : "none", transition: "background .15s", cursor: "default" }}
                onMouseEnter={e => (e.currentTarget.style.background = c.row)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tx.type === "credit" ? c.okBg : c.errBg, border: `1px solid ${tx.type === "credit" ? c.okB : c.errB}` }}>
                  {tx.type === "credit" ? <FiArrowDown size={16} color="#10B981" /> : <FiArrowUp size={16} color="#ef4444" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{tx.desc}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {tx.orderId && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: c.dim, fontWeight: 600 }}>
                        <FiHash size={9} /> {tx.orderId.slice(-8).toUpperCase()}
                      </span>
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: c.dim }}>
                      <FiCalendar size={9} /> {fmtDate(tx.createdAt)}
                    </span>
                  </div>
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900, color: tx.type === "credit" ? "#10B981" : "#ef4444", flexShrink: 0 }}>
                  {tx.type === "credit" ? "+" : "−"}₦{fmtAmt(tx.amount)}
                </div>
              </div>
            ))}

            <div ref={loaderRef} style={{ height: 1 }} />

            {loadingMore && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px", borderTop: `1px solid ${c.brd}` }}>
                <FiLoader size={14} color={ACCENT} style={{ animation: "rp-spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 12, color: c.sub, fontWeight: 600 }}>Loading more…</span>
              </div>
            )}

            {!hasMore && txs.length > 0 && (
              <div style={{ padding: "14px", textAlign: "center", borderTop: `1px solid ${c.brd}` }}>
                <span style={{ fontSize: 11, color: c.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>All transactions loaded</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}