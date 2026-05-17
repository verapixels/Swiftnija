/* eslint-disable camelcase */
// functions/src/riderPayouts.ts
// ✅ CREATE this as a NEW file — does not exist yet

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const db = getFirestore();

// ─── riderSplitWalletWithdraw ─────────────────────────────────────────────────
// Rider withdraws from their WALLET tab (riderSplitWallets collection).
// The existing riderWalletWithdraw handles the Paystack tab — keep that as is.
export const riderSplitWalletWithdraw = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const riderId = request.auth?.uid;
    if (!riderId) throw new HttpsError("unauthenticated", "Must be signed in");

    const {amount} = request.data as { amount: number };
    if (!amount || amount < 100) throw new HttpsError("invalid-argument", "Minimum withdrawal is ₦100");

    const walletRef = db.collection("riderSplitWallets").doc(riderId);
    const walletSnap = await walletRef.get();
    const balance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;
    if (balance < amount) throw new HttpsError("failed-precondition", `Insufficient balance. Have ₦${balance.toFixed(2)}`);

    const bankSnap = await db.collection("riderBankAccounts").doc(riderId).get();
    if (!bankSnap.exists) throw new HttpsError("failed-precondition", "No bank account linked");
    const bank = bankSnap.data()!;
    if (!bank.recipient_code) throw new HttpsError("failed-precondition", "Bank account not fully set up");

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {"Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: bank.recipient_code,
        reason: "SwiftNija rider wallet withdrawal",
      }),
    });
    const transferData = await transferRes.json() as { status: boolean; data: { transfer_code: string; status: string } };
    if (!transferData.status) throw new HttpsError("internal", `Paystack transfer failed: ${JSON.stringify(transferData)}`);

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.update(walletRef, {balance: FieldValue.increment(-amount)});
    const txRef = db.collection("riderSplitWalletTransactions").doc();
    batch.set(txRef, {
      riderId, type: "debit", amount,
      desc: `Wallet withdrawal to ${bank.bank_name} (****${bank.account_number?.slice(-4)})`,
      transferCode: transferData.data.transfer_code, createdAt: now,
    });
    await batch.commit();

    return {success: true, newBalance: balance - amount, transferCode: transferData.data.transfer_code};
  }
);
