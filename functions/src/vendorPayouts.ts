/* eslint-disable camelcase */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const db = getFirestore();

// ─── createVendorPaystackRecipient ────────────────────────────────────────────
export const createVendorPaystackRecipient = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const vendorId = request.auth?.uid;
    if (!vendorId) throw new HttpsError("unauthenticated", "Must be signed in");

    const {account_number, bank_code, account_name, bank_name} = request.data as {
      account_number: string; bank_code: string; account_name: string; bank_name: string;
    };
    if (!account_number || !bank_code || !account_name || !bank_name) {
      throw new HttpsError("invalid-argument", "All bank details are required");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) throw new HttpsError("internal", "Paystack secret key not configured");

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    if (!vendorSnap.exists) throw new HttpsError("not-found", "Vendor not found");
    const vendor = vendorSnap.data()!;
    const businessName = vendor.businessName ?? vendor.name ?? "SwiftNija Vendor";

    const subRes = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {"Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        business_name: businessName,
        settlement_bank: bank_code,
        account_number,
        percentage_charge: 0,
        primary_contact_email: vendor.email ?? "",
      }),
    });
    const subData = await subRes.json() as { status: boolean; message: string; data: { subaccount_code: string } };
    if (!subData.status) throw new HttpsError("internal", `Paystack subaccount error: ${subData.message}`);

    const recRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {"Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json"},
      body: JSON.stringify({type: "nuban", name: account_name, account_number, bank_code, currency: "NGN"}),
    });
    const recData = await recRes.json() as { status: boolean; message: string; data: { recipient_code: string } };
    if (!recData.status) throw new HttpsError("internal", `Paystack recipient error: ${recData.message}`);

    await db.collection("vendorBankAccounts").doc(vendorId).set({
      vendorId, account_number, bank_code, account_name, bank_name,
      subaccount_code: subData.data.subaccount_code,
      recipient_code: recData.data.recipient_code,
      linkedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      subaccount_code: subData.data.subaccount_code,
      recipient_code: recData.data.recipient_code,
    };
  }
);

// ─── vendorWalletWithdraw ─────────────────────────────────────────────────────
export const vendorWalletWithdraw = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const vendorId = request.auth?.uid;
    if (!vendorId) throw new HttpsError("unauthenticated", "Must be signed in");

    const {amount} = request.data as { amount: number };
    if (!amount || amount < 100) throw new HttpsError("invalid-argument", "Minimum withdrawal is ₦100");

    const walletRef = db.collection("vendorWallets").doc(vendorId);
    const walletSnap = await walletRef.get();
    const balance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;
    if (balance < amount) throw new HttpsError("failed-precondition", `Insufficient balance. Have ₦${balance.toFixed(2)}`);

    const bankSnap = await db.collection("vendorBankAccounts").doc(vendorId).get();
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
        reason: "SwiftNija vendor withdrawal",
      }),
    });
    const transferData = await transferRes.json() as { status: boolean; data: { transfer_code: string; status: string } };
    if (!transferData.status) throw new HttpsError("internal", `Paystack transfer failed: ${JSON.stringify(transferData)}`);

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.update(walletRef, {balance: FieldValue.increment(-amount)});
    const txRef = db.collection("vendorWalletTransactions").doc();
    batch.set(txRef, {
      vendorId, type: "debit", amount,
      desc: `Withdrawal to ${bank.bank_name} (****${bank.account_number?.slice(-4)})`,
      transferCode: transferData.data.transfer_code, createdAt: now,
    });
    await batch.commit();

    return {success: true, newBalance: balance - amount, transferCode: transferData.data.transfer_code};
  }
);

// ─── vendorSplitWalletWithdraw ────────────────────────────────────────────────
export const vendorSplitWalletWithdraw = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const vendorId = request.auth?.uid;
    if (!vendorId) throw new HttpsError("unauthenticated", "Must be signed in");

    const {amount} = request.data as { amount: number };
    if (!amount || amount < 100) throw new HttpsError("invalid-argument", "Minimum withdrawal is ₦100");

    const walletRef = db.collection("vendorSplitWallets").doc(vendorId);
    const walletSnap = await walletRef.get();
    const balance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;
    if (balance < amount) throw new HttpsError("failed-precondition", `Insufficient balance. Have ₦${balance.toFixed(2)}`);

    const bankSnap = await db.collection("vendorBankAccounts").doc(vendorId).get();
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
        reason: "SwiftNija vendor wallet withdrawal",
      }),
    });
    const transferData = await transferRes.json() as { status: boolean; data: { transfer_code: string; status: string } };
    if (!transferData.status) throw new HttpsError("internal", `Paystack transfer failed: ${JSON.stringify(transferData)}`);

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.update(walletRef, {balance: FieldValue.increment(-amount)});
    const txRef = db.collection("vendorSplitWalletTransactions").doc();
    batch.set(txRef, {
      vendorId, type: "debit", amount,
      desc: `Wallet withdrawal to ${bank.bank_name} (****${bank.account_number?.slice(-4)})`,
      transferCode: transferData.data.transfer_code, createdAt: now,
    });
    await batch.commit();

    return {success: true, newBalance: balance - amount, transferCode: transferData.data.transfer_code};
  }
);