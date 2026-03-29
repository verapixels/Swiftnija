// ─── services/paystack.ts ─────────────────────────────────────────────────────

import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../firebase";
const functions = getFunctions(app);

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface PaystackBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  country: string;
  currency: string;
}

export interface PaystackTransaction {
  id: number;
  reference: string;
  amount: number;          // in kobo
  status: "success" | "failed" | "pending";
  paid_at: string;         // ISO string
  customer: { email: string };
  metadata?: Record<string, unknown>;
}

export interface PaystackSubaccount {
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  bank_name: string;
}

// ─── BANKS ────────────────────────────────────────────────────────────────────

export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string;

export async function fetchBanks(): Promise<PaystackBank[]> {
  const res = await fetch("https://api.paystack.co/bank?currency=NGN&country=nigeria", {
    headers: { Authorization: `Bearer ${PAYSTACK_PUBLIC_KEY}` },
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.message || "Failed to fetch banks");
  return data.data as PaystackBank[];
}

// ─── RESOLVE ACCOUNT (via Cloud Function) ────────────────────────────────────

export async function resolveAccountNumber(
  accountNumber: string,
  bankCode: string
): Promise<{ account_name: string; account_number: string }> {
  const fn = httpsCallable(functions, "paystackResolveAccount");
  const result = await fn({ account_number: accountNumber, bank_code: bankCode });
  return (result.data as { success: boolean; data: { account_name: string; account_number: string } }).data;
}

// ─── CREATE SUBACCOUNT (via Cloud Function) ───────────────────────────────────

export async function createSubaccount(payload: {
  business_name: string;
  bank_code: string;
  account_number: string;
  vendor_email: string;
  vendor_uid: string;
}): Promise<{ subaccount_code: string }> {
  const fn = httpsCallable(functions, "paystackCreateSubaccount");
  const result = await fn(payload);
  return result.data as { subaccount_code: string };
}

// ─── UPDATE SUBACCOUNT (via Cloud Function) ───────────────────────────────────

export async function updateSubaccount(payload: {
  subaccount_code: string;
  bank_code: string;
  account_number: string;
  vendor_uid: string;
}): Promise<void> {
  const fn = httpsCallable(functions, "paystackUpdateSubaccount");
  await fn(payload);
}

// ─── FETCH TRANSACTIONS (via Cloud Function) ──────────────────────────────────

export async function fetchVendorTransactions(
  subaccount_code: string
): Promise<PaystackTransaction[]> {
  const fn = httpsCallable(functions, "paystackGetTransactions");
  const result = await fn({ subaccount_code });
  return (result.data as { success: boolean; transactions: PaystackTransaction[] }).transactions;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

export function groupByDate(
  transactions: PaystackTransaction[]
): Record<string, PaystackTransaction[]> {
  return transactions.reduce((acc, tx) => {
    const date = new Date(tx.paid_at).toLocaleDateString("en-NG", {
      year: "numeric", month: "short", day: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(tx);
    return acc;
  }, {} as Record<string, PaystackTransaction[]>);
}

export function sumTransactions(txs: PaystackTransaction[]): string {
  const totalKobo = txs
    .filter(tx => tx.status === "success")
    .reduce((sum, tx) => sum + tx.amount, 0);
  return formatNaira(totalKobo);
}