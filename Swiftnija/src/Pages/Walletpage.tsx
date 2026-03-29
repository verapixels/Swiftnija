// pages/WalletPage.tsx
// Drop-in wallet page. UserProfile renders this inside its Wallet tab.
// FIXED: totalIn/totalOut now reactive via onSnapshot; auth timing fixed.

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext";
import { auth, db } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  doc, onSnapshot, collection, query,
  where, orderBy, limit,
} from "firebase/firestore";
import {
  FiArrowDown, FiArrowUp, FiPlus, FiShield,
  FiInfo, FiCreditCard, FiX, FiAlertCircle,
  FiCheck, FiRefreshCw, FiPackage, FiMapPin,
  FiTruck, FiChevronRight,
} from "react-icons/fi";
import { RiWalletLine } from "react-icons/ri";
import { MdOutlineStorefront } from "react-icons/md";
import { onAuthStateChanged } from "firebase/auth";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WalletTx = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  desc: string;
  createdAt: any;
  orderId?: string;
  role?: string;
  splits?: { vendorAmount: number; riderAmount: number; platformAmount: number };
};

type OrderDetail = {
  id: string;
  vendorName?: string;
  vendorId?: string;
  deliveryAddress?: string;
  deliveryLabel?: string;
  items?: Array<{ name: string; qty: number; price: number; img?: string }>;
  subtotal?: number;
  deliveryFee?: number;
  discount?: number;
  total?: number;
  status?: string;
  paymentMethod?: string;
  createdAt?: any;
};

const ACCENT = "#FF6B00";
const QUICK_AMOUNTS = [500, 1_000, 2_000, 5_000, 10_000];

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function TxDetailModal({
  tx, onClose, dark,
}: {
  tx: WalletTx; onClose: () => void; dark: boolean;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const c = dark
    ? { bg: "#13131a", brd: "#1e1e2c", txt: "#eeeef8", sub: "#66668a", card: "#0f0f16", inp: "#16161f" }
    : { bg: "#ffffff", brd: "#e0e0ee", txt: "#111118", sub: "#7777a2", card: "#f4f4fc", inp: "#f7f7ff" };

  const isCredit = tx.type === "credit";
  const amtColor = isCredit ? "#10B981" : "#ef4444";
  const fmt = (ts: any) => ts?.toDate?.().toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) || "—";

  useEffect(() => {
    if (!tx.orderId || isCredit) return;
    setOrderLoading(true);
    const unsub = onSnapshot(doc(db, "orders", tx.orderId), snap => {
      if (snap.exists()) setOrder({ id: snap.id, ...snap.data() } as OrderDetail);
      setOrderLoading(false);
    }, () => setOrderLoading(false));
    return unsub;
  }, [tx.orderId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)", zIndex: 4000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "wp-fade .2s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.bg, borderRadius: "26px 26px 0 0",
          width: "100%", maxWidth: 520, maxHeight: "88vh",
          overflowY: "auto", scrollbarWidth: "none",
          animation: "wp-sheet-up .35s cubic-bezier(.32,1,.4,1)",
          boxShadow: "0 -20px 60px rgba(0,0,0,.4)",
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 4, background: c.brd, margin: "12px auto 0" }} />
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "20px 22px 18px", borderBottom: `1px solid ${c.brd}`,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 15, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCredit ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.1)",
            color: amtColor,
          }}>
            {isCredit ? <FiArrowDown size={22} /> : <FiArrowUp size={22} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 900,
              color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {tx.desc}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginTop: 2 }}>
              {fmt(tx.createdAt)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: `1px solid ${c.brd}`, background: c.inp,
              color: c.sub, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FiX size={15} />
          </button>
        </div>

        <div style={{ padding: "20px 22px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: isCredit ? "rgba(16,185,129,.07)" : "rgba(239,68,68,.06)",
            border: `1.5px solid ${isCredit ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.15)"}`,
            borderRadius: 16, padding: "16px 20px",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px" }}>
                {isCredit ? "Amount Added" : "Amount Deducted"}
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 900, color: amtColor, marginTop: 4 }}>
                {isCredit ? "+" : "−"}₦{tx.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: isCredit ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>
              {isCredit ? "💰" : "🛒"}
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", background: c.card,
            border: `1px solid ${c.brd}`, borderRadius: 12,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isCredit ? "#10B981" : "#ef4444", flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: c.txt }}>
              {isCredit ? "Wallet Top-up" : "Payment for Order"}
            </span>
            {tx.orderId && (
              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 700,
                color: c.sub, fontFamily: "monospace",
              }}>
                #{tx.orderId.slice(-8).toUpperCase()}
              </span>
            )}
          </div>

          {!isCredit && (
            <>
              {orderLoading ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "20px", background: c.card,
                  border: `1px solid ${c.brd}`, borderRadius: 16,
                  color: c.sub, fontSize: 13, fontWeight: 600,
                }}>
                  <div style={{ width: 16, height: 16, border: "2px solid rgba(255,107,0,.2)", borderTopColor: ACCENT, borderRadius: "50%", animation: "wp-spin .8s linear infinite" }} />
                  Loading order details…
                </div>
              ) : order ? (
                <>
                  {order.vendorName && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "13px 16px", background: c.card,
                      border: `1px solid ${c.brd}`, borderRadius: 16,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: "rgba(255,107,0,.1)", border: "1px solid rgba(255,107,0,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: ACCENT,
                      }}>
                        <MdOutlineStorefront size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".5px" }}>Vendor / Store</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: c.txt, marginTop: 2 }}>{order.vendorName}</div>
                      </div>
                    </div>
                  )}

                  {order.deliveryAddress && (
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "13px 16px", background: c.card,
                      border: `1px solid ${c.brd}`, borderRadius: 16,
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#10B981",
                      }}>
                        <FiMapPin size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".5px" }}>
                          Delivered to {order.deliveryLabel ? `· ${order.deliveryLabel}` : ""}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: c.txt, marginTop: 2, lineHeight: 1.5 }}>{order.deliveryAddress}</div>
                      </div>
                    </div>
                  )}

                  {order.items && order.items.length > 0 && (
                    <div style={{ background: c.card, border: `1px solid ${c.brd}`, borderRadius: 16, overflow: "hidden" }}>
                      <div style={{
                        padding: "10px 16px", borderBottom: `1px solid ${c.brd}`,
                        fontSize: 10, fontWeight: 800, color: c.sub,
                        textTransform: "uppercase", letterSpacing: ".6px",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <FiPackage size={11} color={ACCENT} />
                        Items Ordered ({order.items.reduce((s, i) => s + i.qty, 0)})
                      </div>
                      {order.items.map((item, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 16px",
                          borderBottom: i < order.items!.length - 1 ? `1px solid ${c.brd}` : "none",
                        }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: "rgba(255,107,0,.08)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            overflow: "hidden",
                          }}>
                            {item.img
                              ? <img src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <FiPackage size={14} color={ACCENT} />
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: c.sub, marginTop: 1 }}>
                              {item.qty} × ₦{item.price.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 900, color: c.txt, flexShrink: 0 }}>
                            ₦{(item.price * item.qty).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{
                    background: c.card, border: `1px solid ${c.brd}`,
                    borderRadius: 16, padding: "14px 16px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: c.sub, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>
                      Price Breakdown
                    </div>
                    {order.subtotal !== undefined && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: c.sub }}>
                        <span>Subtotal</span>
                        <span style={{ color: c.txt }}>₦{order.subtotal.toLocaleString()}</span>
                      </div>
                    )}
                    {order.deliveryFee !== undefined && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: c.sub }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <FiTruck size={11} /> Delivery fee
                        </span>
                        <span style={{ color: c.txt }}>₦{order.deliveryFee.toLocaleString()}</span>
                      </div>
                    )}
                    {order.discount !== undefined && order.discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
                        <span>Discount</span>
                        <span>−₦{order.discount.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ height: 1, background: c.brd, margin: "4px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: c.txt }}>Total Paid</span>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 900, color: ACCENT }}>
                        ₦{(order.total ?? tx.amount).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  padding: "16px", background: c.card,
                  border: `1px solid ${c.brd}`, borderRadius: 16,
                  fontSize: 13, fontWeight: 600, color: c.sub, lineHeight: 1.6,
                }}>
                  📦 Order details are not available for this transaction.
                </div>
              )}
            </>
          )}

          {isCredit && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "14px 16px", background: c.card,
              border: `1px solid ${c.brd}`, borderRadius: 16,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>
                ⚡
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: c.txt }}>Wallet Top-up via Paystack</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.sub, marginTop: 4, lineHeight: 1.6 }}>
                  ₦{tx.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} was added to your Swiftnija wallet balance.
                </div>
              </div>
            </div>
          )}

          {tx.splits && !isCredit && (
            <div style={{ background: c.card, border: `1px solid ${c.brd}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{
                padding: "10px 16px", borderBottom: `1px solid ${c.brd}`,
                fontSize: 10, fontWeight: 800, color: c.sub,
                textTransform: "uppercase", letterSpacing: ".6px",
              }}>
                Payment Split
              </div>
              {[
                { label: "Vendor", amt: tx.splits.vendorAmount, color: "#3b82f6", emoji: "🏪" },
                { label: "Delivery Rider", amt: tx.splits.riderAmount, color: "#8b5cf6", emoji: "🏍️" },
                { label: "Platform Fee", amt: tx.splits.platformAmount, color: "#f59e0b", emoji: "⚡" },
              ].filter(x => x.amt > 0).map((x, i, arr) => (
                <div key={x.label} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 16px",
                  borderBottom: i < arr.length - 1 ? `1px solid ${c.brd}` : "none",
                }}>
                  <span style={{ fontSize: 16 }}>{x.emoji}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: c.txt }}>{x.label}</span>
                  <span style={{
                    fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 900,
                    color: x.color,
                  }}>
                    ₦{x.amt.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, fontSize: 11, fontWeight: 600, color: c.sub,
            paddingTop: 4,
          }}>
            <FiShield size={11} color="#10B981" /> Transaction secured by Swiftnija
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FUND WALLET MODAL
// ─────────────────────────────────────────────────────────────────────────────
function FundModal({
  onClose, userEmail, fns, onSuccess, addToast, dark,
}: {
  onClose: () => void;
  userEmail: string;
  fns: ReturnType<typeof getFunctions>;
  onSuccess: (newBalance: number, credited: number) => void;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
  dark: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"enter" | "verifying">("enter");

  const num = parseFloat(amount.replace(/,/g, "")) || 0;

  const validate = () => {
    if (!num || num < 100) return "Minimum top-up is ₦100";
    if (num > 1_000_000) return "Maximum top-up is ₦1,000,000";
    return "";
  };

  const verifyRef = async (reference: string) => {
  setStep("verifying");
  try {
    const fn = httpsCallable(fns, "paystackVerifyPayment");
    const res = await fn({ reference }) as { data: { newBalance: number; amountCredited: number } };
    onSuccess(res.data.newBalance, res.data.amountCredited);
    addToast(`₦${res.data.amountCredited.toLocaleString("en-NG")} added! 🎉`, "success");
    // Close Paystack iframe if still open
    const paystackIframe = document.querySelector('iframe[name="paystack-checkout"]') as HTMLIFrameElement;
    if (paystackIframe) paystackIframe.remove();
    // Remove Paystack overlay if still showing
    const overlay = document.querySelector('.paystack-close') as HTMLElement;
    if (overlay) overlay.click();
    onClose();
  } catch (e: any) {
    setError(e?.message || "Verification failed. Contact support if charged.");
    setStep("enter");
  } finally {
    setLoading(false);
  }
};

  const handlePopup = async () => {
    const err = validate(); if (err) { setError(err); return; }
    setError(""); setLoading(true);
    try {
      const init = httpsCallable(fns, "paystackInitializePayment");
      const res = await init({ amountKobo: Math.round(num * 100) }) as {
        data: { accessCode: string; reference: string; authorizationUrl: string }
      };
      const PS = (window as any).PaystackPop;
      if (!PS) {
  sessionStorage.setItem("swiftnija_pending_ref", res.data.reference);
  window.location.href = res.data.authorizationUrl;
  return;
}
      PS.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: userEmail,
        amount: Math.round(num * 100),
        currency: "NGN",
        ref: res.data.reference,
        accessCode: res.data.accessCode,
        channels: ["card", "bank", "ussd", "qr", "bank_transfer"],
       onSuccess: (t: { reference: string }) => {
  // Paystack closes its own iframe on success — just verify
  verifyRef(t.reference);
},
onCancel: () => { 
  setLoading(false); 
  addToast("Payment cancelled", "info"); 
},
      }).openIframe();
    } catch (e: any) {
      setError(e?.message || "Could not initialise payment.");
      setLoading(false);
    }
  };

  const s = dark
    ? { surf: "#13131a", brd: "#1e1e2c", txt: "#eeeef8", sub: "#66668a", inp: "#16161f", inpB: "#26263a" }
    : { surf: "#ffffff", brd: "#e0e0ee", txt: "#111118", sub: "#7777a2", inp: "#f7f7ff", inpB: "#d4d4ee" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)", zIndex: 3000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "wp-fade .2s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: s.surf, border: `1.5px solid ${s.brd}`, borderRadius: 28,
          padding: 28, width: "100%", maxWidth: 420, display: "flex",
          flexDirection: "column", gap: 18, maxHeight: "90vh", overflowY: "auto",
          animation: "wp-up .3s cubic-bezier(.34,1.56,.64,1)",
          boxShadow: "0 32px 80px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, borderBottom: `1px solid ${s.brd}` }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(255,107,0,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: s.txt }}>Fund Your Wallet</div>
            <div style={{ fontSize: 12, color: s.sub, fontWeight: 600, marginTop: 2 }}>Secured by Paystack · 256-bit SSL</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${s.brd}`, background: s.inp, color: s.sub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiX size={16} />
          </button>
        </div>

        {step === "verifying" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "36px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid rgba(255,107,0,.2)", borderTopColor: ACCENT, borderRadius: "50%", animation: "wp-spin .8s linear infinite" }} />
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, color: s.txt }}>Verifying payment…</div>
            <div style={{ fontSize: 12, color: s.sub, fontWeight: 600 }}>Do not close this window</div>
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: s.sub, textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 10 }}>Quick Select</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {QUICK_AMOUNTS.map(a => (
                  <button key={a} onClick={() => { setAmount(a.toLocaleString("en-NG")); setError(""); }}
                    style={{
                      padding: "7px 14px", borderRadius: 20, cursor: "pointer", transition: "all .2s",
                      border: `1.5px solid ${num === a ? "rgba(255,107,0,.5)" : s.brd}`,
                      background: num === a ? "rgba(255,107,0,.12)" : s.inp,
                      color: num === a ? ACCENT : s.sub,
                      fontFamily: "'Nunito',sans-serif", fontSize: 13, fontWeight: num === a ? 800 : 700,
                    }}
                  >₦{a.toLocaleString()}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: s.sub, textTransform: "uppercase", letterSpacing: ".7px" }}>Custom Amount</div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, background: s.inp, border: `1.5px solid ${s.inpB}`, borderRadius: 14, padding: "12px 16px" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, color: ACCENT, fontSize: 20 }}>₦</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  placeholder="0"
                  value={amount}
                  onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ""); setAmount(raw ? Number(raw).toLocaleString("en-NG") : ""); setError(""); }}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: s.txt, fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 900 }}
                />
              </div>
              {num >= 100 && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>₦{num.toLocaleString("en-NG", { minimumFractionDigits: 2 })} will be added</span>}
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 12, padding: "10px 14px", color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
                <FiAlertCircle size={14} />{error}
              </div>
            )}

            <button
              onClick={handlePopup}
              disabled={loading || !num}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: loading || !num ? (dark ? "#2a2a3a" : "#ddd") : "linear-gradient(135deg,#00b09b,#2eb87e)",
                color: "white", border: "none", borderRadius: 14, padding: "14px 20px",
                fontFamily: "'Nunito',sans-serif", fontSize: 14, fontWeight: 800,
                cursor: loading || !num ? "not-allowed" : "pointer",
                opacity: loading || !num ? 0.6 : 1, transition: "all .2s",
                boxShadow: loading || !num ? "none" : "0 6px 20px rgba(0,176,155,.35)",
              }}
            >
              {loading
                ? <><span style={{ display: "inline-block", animation: "wp-spin .7s linear infinite" }}>⟳</span> Processing…</>
                : <><span>⚡</span> Pay Now — Instant Popup</>
              }
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 600, color: s.sub }}>
              <FiShield size={11} color="#10B981" /> Secured by <strong style={{ color: s.txt }}>Paystack</strong> · Card details never stored
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET PAGE — main export
// FIXED: uses onSnapshot for real-time balance + tx updates; auth timing fixed
// ─────────────────────────────────────────────────────────────────────────────
export default function WalletPage() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [balance, setBalance] = useState<number | null>(null);
  const [totalIn, setTotalIn] = useState<number>(0);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFund, setShowFund] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | "credit" | "debit">("all");
  const [selTx, setSelTx] = useState<WalletTx | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const fns = getFunctions();

  const c = {
    bg: dark ? "#0a0a0e" : "#f2f2fa",
    surf: dark ? "#13131a" : "#ffffff",
    brd: dark ? "#1e1e2c" : "#e0e0ee",
    txt: dark ? "#eeeef8" : "#111118",
    sub: dark ? "#66668a" : "#7777a2",
    inp: dark ? "#16161f" : "#f7f7ff",
    inpB: dark ? "#26263a" : "#d4d4ee",
  };

  const addToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── FIXED: Use onSnapshot so balance + totalIn update in real-time
  // ── Also handle Paystack redirect return here
  useEffect(() => {
  // Wait for Firebase Auth to restore session before subscribing
  const unsubAuth = onAuthStateChanged(auth, (user) => {
    setUid(user?.uid ?? null);
  });
  return unsubAuth;
}, []);
 
useEffect(() => {
  if (!uid) {
    setLoading(false);
    return;
  }
 
  // Real-time wallet balance
  const unsubWallet = onSnapshot(doc(db, "wallets", uid), snap => {
  setBalance(snap.exists() ? (snap.data()!.balance ?? 0) : 0);
  setTotalIn(snap.exists() ? (snap.data()!.totalIn ?? 0) : 0);
});
 
  // Real-time transaction history
  // Both top-ups (type:"credit") and order payments (type:"debit") live here.
  // totalIn filters for "credit" — these are Paystack top-ups written by paystackVerifyPayment.
  const unsubTxs = onSnapshot(
    query(
      collection(db, "walletTransactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(50),
    ),
    (snap) => {
      setTxs(snap.docs.map((d) => ({id: d.id, ...d.data()})) as WalletTx[]);
      setLoading(false);
    },
    (err) => {
      console.error("[WalletPage] txs:", err);
      setLoading(false);
    }
  );
 
  // Handle Paystack redirect return (unchanged from original)
  const params   = new URLSearchParams(window.location.search);
  const fromUrl  = params.get("reference") || params.get("trxref");
  const stored   = sessionStorage.getItem("swiftnija_pending_ref");
  const ref      = fromUrl || stored;
  if (ref) {
    sessionStorage.removeItem("swiftnija_pending_ref");
    window.history.replaceState({}, "", window.location.pathname);
    (async () => {
      try {
        const fn  = httpsCallable(getFunctions(), "paystackVerifyPayment");
        const res = await fn({reference: ref}) as {
          data: {newBalance: number; amountCredited: number; alreadyProcessed?: boolean};
        };
        if (!res.data.alreadyProcessed) {
          addToast(`₦${res.data.amountCredited.toLocaleString("en-NG")} added! 🎉`, "success");
        }
      } catch (e: any) {
        addToast(e?.message || "Verification failed", "error");
      }
    })();
  }
 
  return () => {
    unsubWallet();
    unsubTxs();
  };
}, [uid]);

  // FIXED: computed from live txs state — no stale closure issues
  const filtered = txFilter === "all" ? txs : txs.filter(t => t.type === txFilter);
const totalOut = txs.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);

  const fmt = (ts: any) => ts?.toDate?.().toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) || "—";

  return (
    <>
      <style>{`
        @keyframes wp-fade      { from{opacity:0} to{opacity:1} }
        @keyframes wp-up        { from{opacity:0;transform:scale(.92) translateY(20px)} to{opacity:1;transform:none} }
        @keyframes wp-in        { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes wp-spin      { to{transform:rotate(360deg)} }
        @keyframes wp-pulse     { 0%,100%{box-shadow:0 0 0 0 rgba(255,107,0,.35)} 50%{box-shadow:0 0 0 10px rgba(255,107,0,0)} }
        @keyframes wp-toast     { from{opacity:0;transform:translateX(40px) scale(.9)} to{opacity:1;transform:none} }
        @keyframes wp-sheet-up  { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          display: "flex", alignItems: "center", gap: 10, padding: "12px 18px",
          borderRadius: 14, fontSize: 13, fontWeight: 700, fontFamily: "'Nunito',sans-serif",
          boxShadow: "0 8px 32px rgba(0,0,0,.3)", backdropFilter: "blur(12px)",
          animation: "wp-toast .35s cubic-bezier(.34,1.56,.64,1) both",
          background: toast.type === "success" ? "rgba(16,185,129,.95)" : toast.type === "error" ? "rgba(239,68,68,.95)" : "rgba(59,130,246,.95)",
          color: "white",
        }}>
          {toast.type === "success" ? <FiCheck size={14} /> : toast.type === "error" ? <FiAlertCircle size={14} /> : <FiInfo size={14} />}
          {toast.msg}
        </div>
      )}

      {showFund && (
        <FundModal
          onClose={() => setShowFund(false)}
          userEmail={auth.currentUser?.email ?? ""}
          fns={fns}
          addToast={addToast}
          dark={dark}
          onSuccess={(newBal, _credited) => {
            setBalance(newBal);
            // onSnapshot will auto-refresh txs
          }}
        />
      )}

      {selTx && (
        <TxDetailModal
          tx={selTx}
          onClose={() => setSelTx(null)}
          dark={dark}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "wp-in .3s ease both" }}>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "60px 0", color: c.sub }}>
            <div style={{ width: 36, height: 36, border: "3px solid rgba(255,107,0,.2)", borderTopColor: ACCENT, borderRadius: "50%", animation: "wp-spin .8s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Loading wallet…</span>
          </div>
        ) : (
          <>
            {/* ─── Hero balance card ─── */}
            <div style={{
              background: "linear-gradient(135deg,#FF6B00,#FF8C00)",
              borderRadius: 24, padding: "28px 24px",
              display: "flex", flexDirection: "column", gap: 8,
              position: "relative", overflow: "hidden",
              boxShadow: "0 16px 48px rgba(255,107,0,.4)",
            }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.1)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: -60, left: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,.06)", pointerEvents: "none" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.8)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 4, position: "relative" }}>
                <RiWalletLine size={13} /> Swiftnija Wallet
              </div>

              <div style={{
                fontFamily: "'Syne',sans-serif",
                fontSize: "clamp(20px, 7vw, 38px)",
                fontWeight: 900, color: "white",
                letterSpacing: "-1px", lineHeight: 1,
                position: "relative", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "100%",
              }}>
                ₦{(balance ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.7)", position: "relative" }}>
                Available balance · funds never expire
              </div>

              {/* Stats row — FIXED: now shows live totalIn/totalOut */}
              <div style={{ display: "flex", gap: 12, marginTop: 14, position: "relative" }}>
                {[{ label: "Total In", val: totalIn }, { label: "Total Spent", val: totalOut }].map(s => (
                  <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,.15)", borderRadius: 14, padding: "12px 14px", backdropFilter: "blur(8px)" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.7)", textTransform: "uppercase", letterSpacing: ".5px" }}>{s.label}</div>
                    <div style={{
                      fontFamily: "'Syne',sans-serif",
                      fontSize: 13,
                      fontWeight: 900, color: "white", marginTop: 4,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      ₦{s.val.toLocaleString("en-NG")}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowFund(true)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  marginTop: 12, background: "white", color: ACCENT, border: "none",
                  borderRadius: 16, padding: "14px 24px",
                  fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900,
                  cursor: "pointer", position: "relative",
                  boxShadow: "0 4px 20px rgba(0,0,0,.15)",
                  transition: "transform .2s,box-shadow .2s",
                  animation: "wp-pulse 2.5s infinite",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 28px rgba(0,0,0,.22)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,0,0,.15)"; }}
              >
                <FiPlus size={18} /> Fund Wallet
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>via Paystack</span>
              </button>
            </div>

            {/* Spend-only notice */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 16, padding: 16 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🛒</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: c.txt }}>Wallet funds are spend-only</div>
                <div style={{ fontSize: 12, color: c.sub, marginTop: 4, lineHeight: 1.6 }}>
                  Pay at checkout with your balance. Funds <strong style={{ color: c.txt }}>cannot</strong> be withdrawn to a bank account.
                </div>
              </div>
            </div>

            {/* ─── Transaction history ─── */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: c.txt, textTransform: "uppercase", letterSpacing: ".6px" }}>
                  <FiCreditCard size={14} color={ACCENT} /> History
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["all", "credit", "debit"] as const).map(f => (
                    <button key={f} onClick={() => setTxFilter(f)} style={{
                      padding: "5px 12px", borderRadius: 20, cursor: "pointer", transition: "all .2s",
                      border: `1.5px solid ${txFilter === f ? "rgba(255,107,0,.4)" : c.brd}`,
                      background: txFilter === f ? "rgba(255,107,0,.1)" : "transparent",
                      color: txFilter === f ? ACCENT : c.sub,
                      fontFamily: "'Nunito',sans-serif", fontSize: 11, fontWeight: 700,
                    }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 20px", background: c.inp, border: `1.5px dashed ${c.inpB}`, borderRadius: 18, color: c.sub }}>
                  <FiCreditCard size={28} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{txFilter === "all" ? "No transactions yet" : `No ${txFilter} transactions`}</span>
                  {txFilter === "all" && (
                    <button onClick={() => setShowFund(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 10, background: "rgba(255,107,0,.1)", border: "1.5px solid rgba(255,107,0,.3)", color: ACCENT, fontFamily: "'Nunito',sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      <FiPlus size={12} /> Add Funds to Get Started
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ background: c.surf, border: `1.5px solid ${c.brd}`, borderRadius: 20, overflow: "hidden" }}>
                  {filtered.map((tx, i) => (
                    <div
                      key={tx.id}
                      onClick={() => setSelTx(tx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                        borderBottom: i < filtered.length - 1 ? `1px solid ${c.brd}` : "none",
                        transition: "background .15s",
                        animation: `wp-in .3s ease ${Math.min(i * 0.04, 0.3)}s both`,
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,107,0,.025)"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: tx.type === "credit" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
                        color: tx.type === "credit" ? "#10B981" : "#ef4444",
                      }}>
                        {tx.type === "credit" ? <FiArrowDown size={17} /> : <FiArrowUp size={17} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.desc}
                        </div>
                        <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, marginTop: 2 }}>
                          {fmt(tx.createdAt)}
                        </div>
                        {tx.type === "debit" && tx.splits && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                            {[
                              { label: "Vendor", amt: tx.splits.vendorAmount, color: "#3b82f6" },
                              { label: "Rider", amt: tx.splits.riderAmount, color: "#8b5cf6" },
                              { label: "Platform", amt: tx.splits.platformAmount, color: "#f59e0b" },
                            ].filter(x => x.amt > 0).map(x => (
                              <span key={x.label} style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: `${x.color}18`, border: `1px solid ${x.color}30`, color: x.color }}>
                                {x.label}: ₦{x.amt.toLocaleString()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 900, color: tx.type === "credit" ? "#10B981" : "#ef4444", textAlign: "right" }}>
                          {tx.type === "credit" ? "+" : "−"}₦{tx.amount.toLocaleString("en-NG")}
                        </div>
                        <FiChevronRight size={13} color={c.sub} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How it works */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "rgba(59,130,246,.05)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 16, padding: 16 }}>
              <FiInfo size={15} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: c.txt }}>How does the wallet work?</div>
                <div style={{ fontSize: 12, color: c.sub, marginTop: 4, lineHeight: 1.6 }}>
                  Fund via Paystack (card, bank transfer, USSD). At checkout select <strong style={{ color: c.txt }}>Pay with Wallet</strong>. Your payment is instantly split between vendor, rider, and Swiftnija platform fee.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}