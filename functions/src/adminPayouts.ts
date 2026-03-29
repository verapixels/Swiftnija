/* eslint-disable camelcase */
// functions/src/adminPayouts.ts
// ✅ CREATE this as a NEW file — does not exist yet

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

// ─── createAdminPaystackRecipient ─────────────────────────────────────────────
// Super admin links their bank account for withdrawals.
export const createAdminPaystackRecipient = onCall(
  { region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"] },
  async (request) => {
    const adminId = request.auth?.uid;
    if (!adminId) throw new HttpsError("unauthenticated", "Must be signed in");

    const adminSnap = await db.collection("admins").doc(adminId).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "Not an admin");

    const { account_number, bank_code, account_name, bank_name } = request.data as {
      account_number: string; bank_code: string; account_name: string; bank_name: string;
    };
    if (!account_number || !bank_code || !account_name || !bank_name) {
      throw new HttpsError("invalid-argument", "All bank details required");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) throw new HttpsError("internal", "Paystack secret key not configured");

    const recRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "nuban", name: account_name, account_number, bank_code, currency: "NGN" }),
    });
    const recData = await recRes.json() as { status: boolean; message: string; data: { recipient_code: string } };
    if (!recData.status) throw new HttpsError("internal", `Paystack recipient error: ${recData.message}`);

    await db.collection("adminBankAccounts").doc(adminId).set({
      adminId, account_number, bank_code, account_name, bank_name,
      recipient_code: recData.data.recipient_code,
      linkedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, recipient_code: recData.data.recipient_code };
  }
);

// ─── adminWalletWithdraw ──────────────────────────────────────────────────────
// Super admin withdraws platform fee earnings to their linked bank.
export const adminWalletWithdraw = onCall(
  { region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"] },
  async (request) => {
    const adminId = request.auth?.uid;
    if (!adminId) throw new HttpsError("unauthenticated", "Must be signed in");

    const adminSnap = await db.collection("admins").doc(adminId).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "Not an admin");

    const { amount } = request.data as { amount: number };
    if (!amount || amount < 100) throw new HttpsError("invalid-argument", "Minimum withdrawal is ₦100");

    const walletRef = db.collection("adminWallets").doc(adminId);
    const walletSnap = await walletRef.get();
    const balance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;
    if (balance < amount) throw new HttpsError("failed-precondition", `Insufficient balance. Have ₦${balance.toFixed(2)}`);

    const bankSnap = await db.collection("adminBankAccounts").doc(adminId).get();
    if (!bankSnap.exists) throw new HttpsError("failed-precondition", "No bank account linked");
    const bank = bankSnap.data()!;
    if (!bank.recipient_code) throw new HttpsError("failed-precondition", "Bank account not fully set up");

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: bank.recipient_code,
        reason: "SwiftNija admin withdrawal",
      }),
    });
    const transferData = await transferRes.json() as { status: boolean; data: { transfer_code: string; status: string } };
    if (!transferData.status) throw new HttpsError("internal", "Paystack transfer failed");

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.update(walletRef, { balance: FieldValue.increment(-amount) });
    const txRef = db.collection("adminWalletTransactions").doc();
    batch.set(txRef, {
      adminId, type: "debit", amount,
      desc: `Admin withdrawal to ${bank.bank_name}`,
      transferCode: transferData.data.transfer_code, createdAt: now,
    });
    await batch.commit();

    return { success: true, newBalance: balance - amount, transferCode: transferData.data.transfer_code };
  }
);

// ─── getPaystackBalance ───────────────────────────────────────────────────────
// Fetches live NGN balance from Paystack. Admin only.
export const getPaystackBalance = onCall(
  { region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "Admins only");

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) throw new HttpsError("internal", "Paystack secret key not configured");

    const res = await fetch("https://api.paystack.co/balance", {
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await res.json() as { status: boolean; data: Array<{ currency: string; balance: number }> };
    if (!data.status) throw new HttpsError("internal", "Could not fetch Paystack balance");

    const ngn = data.data.find(b => b.currency === "NGN");
    return { success: true, balance: ngn ? ngn.balance / 100 : 0 };
  }
);