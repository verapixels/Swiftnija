// ─── hooks/usePaystack.ts ─────────────────────────────────────────────────────
// Wraps all Paystack service calls with loading/error state for use in pages

import { useState, useEffect, useCallback } from "react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  fetchBanks,
  resolveAccountNumber,
  createSubaccount,
  updateSubaccount,
  fetchVendorTransactions,
  groupByDate,
  sumTransactions,
  type PaystackBank,
  type PaystackTransaction,
} from "../services/paystack";

export interface BankAccount {
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  subaccount_code: string;
}

export function usePaystack() {
  const uid = auth.currentUser?.uid;

  const [banks, setBanks]                   = useState<PaystackBank[]>([]);
  const [bankAccount, setBankAccount]       = useState<BankAccount | null>(null);
  const [transactions, setTransactions]     = useState<PaystackTransaction[]>([]);
  const [grouped, setGrouped]               = useState<Record<string, PaystackTransaction[]>>({});
  const [todayTotal, setTodayTotal]         = useState("₦0.00");
  const [loadingBanks, setLoadingBanks]     = useState(false);
  const [loadingTxns, setLoadingTxns]       = useState(false);
  const [savingBank, setSavingBank]         = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // ── Load banks list ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingBanks(true);
    fetchBanks()
      .then(setBanks)
      .catch(() => setError("Could not load banks list."))
      .finally(() => setLoadingBanks(false));
  }, []);

  // ── Load vendor's saved bank account from Firestore ──────────────────────────
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "vendors", uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.bankAccount) setBankAccount(d.bankAccount as BankAccount);
      }
    });
  }, [uid]);

  // ── Load transactions once we have a subaccount ──────────────────────────────
  useEffect(() => {
    if (!bankAccount?.subaccount_code) return;
    setLoadingTxns(true);
    fetchVendorTransactions(bankAccount.subaccount_code)
      .then(txns => {
        setTransactions(txns);
        const g = groupByDate(txns);
        setGrouped(g);

        // Today's total
        const todayKey = new Date().toLocaleDateString("en-NG", {
          year: "numeric", month: "short", day: "numeric",
        });
        setTodayTotal(sumTransactions(g[todayKey] || []));
      })
      .catch(() => setError("Could not load transactions."))
      .finally(() => setLoadingTxns(false));
  }, [bankAccount?.subaccount_code]);

  // ── Verify account number and return account name ────────────────────────────
  const verifyAccount = useCallback(
    async (accountNumber: string, bankCode: string) => {
      setError(null);
      return resolveAccountNumber(accountNumber, bankCode);
    },
    []
  );

  // ── Link bank account (creates or updates subaccount) ────────────────────────
  const linkBankAccount = useCallback(
    async (params: {
      bank: PaystackBank;
      account_number: string;
      account_name: string;
      vendor_name: string;
      vendor_email: string;
    }) => {
      if (!uid) throw new Error("Not logged in");
      setSavingBank(true);
      setError(null);
      try {
        let subaccount_code = bankAccount?.subaccount_code;

        if (subaccount_code) {
          // Already has subaccount → update bank details
          await updateSubaccount({
            subaccount_code,
            bank_code: params.bank.code,
            account_number: params.account_number,
            vendor_uid: uid,
          });
        } else {
          // First time → create subaccount
          const result = await createSubaccount({
            business_name: params.vendor_name,
            bank_code: params.bank.code,
            account_number: params.account_number,
            vendor_email: params.vendor_email,
            vendor_uid: uid,
          });
          subaccount_code = result.subaccount_code;
        }

        const newBankAccount: BankAccount = {
          bank_name: params.bank.name,
          bank_code: params.bank.code,
          account_number: params.account_number,
          account_name: params.account_name,
          subaccount_code: subaccount_code!,
        };

        // Save to Firestore
        await updateDoc(doc(db, "vendors", uid), { bankAccount: newBankAccount });
        setBankAccount(newBankAccount);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to link account";
        setError(msg);
        throw e;
      } finally {
        setSavingBank(false);
      }
    },
    [uid, bankAccount]
  );

  // ── Unlink bank account ───────────────────────────────────────────────────────
  const unlinkBankAccount = useCallback(async () => {
    if (!uid) return;
    // We keep the subaccount_code on Paystack (can't delete subaccounts via API)
    // We just clear it from Firestore so vendor can re-link a different account
    await updateDoc(doc(db, "vendors", uid), { bankAccount: null });
    setBankAccount(null);
  }, [uid]);

  return {
    banks,
    bankAccount,
    transactions,
    grouped,
    todayTotal,
    loadingBanks,
    loadingTxns,
    savingBank,
    error,
    setError,
    verifyAccount,
    linkBankAccount,
    unlinkBankAccount,
  };
}