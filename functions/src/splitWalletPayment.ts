/* eslint-disable camelcase */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const db = getFirestore();

/**
 * splitWalletPayment — called at CHECKOUT
 *
 * What it does:
 *   1. Deducts the full order total from the user's wallet
 *   2. Credits the VENDOR their share immediately
 *   3. Logs platform earnings
 *   4. Does NOT credit the rider — no riderId exists at checkout yet.
 *      Rider gets credited inside updateOrderStatus when status → "delivered".
 *      The reserved riderAmount is stored in splitAmounts so delivery knows
 *      exactly how much to pay without recalculating.
 *
 * Flags written to the order doc:
 *   walletCharged: true       → user has been debited, vendor has been paid
 *   creditsDistributed: false → rider credit is still pending (set true at delivery)
 */
export const splitWalletPayment = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

    const {orderId} = request.data as { orderId: string };
    if (!orderId) throw new HttpsError("invalid-argument", "orderId required");

    // ── 1. Load order ──────────────────────────────────────────────────────
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");

    const order = orderSnap.data()!;

    const orderUserId = order.userId || order.customerId || order.uid;
    if (orderUserId !== uid) throw new HttpsError("permission-denied", "Not your order");

    if (order.paymentStatus === "paid" || order.walletCharged) {
      throw new HttpsError("already-exists", "Order already paid");
    }

    // ── 2. Load split config ───────────────────────────────────────────────
    const settingsSnap = await db.collection("platformSettings").doc("global").get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : {};

    const vendorItemPercent = Number(settings.vendorItemPercent ?? 80);
    const riderDeliveryPercent = Number(settings.riderDeliveryPercent ?? 85);

    // ── 3. Calculate amounts ───────────────────────────────────────────────
    const subtotal = Math.round((order.subtotal ?? order.total ?? 0) * 100) / 100;
    const deliveryFee = Math.round((order.deliveryFee ?? 0) * 100) / 100;
    const discount = Math.round((order.discount ?? 0) * 100) / 100;
    const totalCharge = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

    if (totalCharge <= 0) throw new HttpsError("invalid-argument", "Order total must be > 0");

    const vendorAmount = Math.round(subtotal * (vendorItemPercent / 100) * 100) / 100;
    const riderAmount = Math.round(deliveryFee * (riderDeliveryPercent / 100) * 100) / 100;
    const platformAmount = Math.round((totalCharge - vendorAmount - riderAmount) * 100) / 100;

    const vendorId = order.vendorId as string | undefined;
    // order.riderId is intentionally NOT read here — rider isn't assigned yet

    // ── 4. Check user wallet balance ───────────────────────────────────────
    const walletRef = db.collection("wallets").doc(uid);
    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;

    if (currentBalance < totalCharge) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient wallet balance. Need ₦${totalCharge.toFixed(2)}, have ₦${currentBalance.toFixed(2)}`
      );
    }

    // ── 5. Atomic batch write ──────────────────────────────────────────────
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    // 5a. Debit user wallet (full amount including reserved rider fee)
    batch.update(walletRef, {balance: FieldValue.increment(-totalCharge)});

    // 5b. Credit vendor immediately (vendor is known at checkout)
    if (vendorId && vendorAmount > 0) {
      const vendorWalletRef = db.collection("vendorWallets").doc(vendorId);
      batch.set(vendorWalletRef, {balance: FieldValue.increment(vendorAmount)}, {merge: true});

      const vendorTxRef = db.collection("vendorWalletTransactions").doc();
      batch.set(vendorTxRef, {
        vendorId,
        type: "credit",
        amount: vendorAmount,
        orderId,
        desc: `Order payment — ${order.orderNumber ?? orderId.slice(-8).toUpperCase()}`,
        createdAt: now,
      });
    }

    // 5c. Rider is NOT credited here.
    //     updateOrderStatus credits the rider when status → "delivered"
    //     using splitAmounts.riderAmount stored below.

    // 5d. Log user wallet debit with full split breakdown (for WalletPage history)
    const userTxRef = db.collection("walletTransactions").doc();
    batch.set(userTxRef, {
      userId: uid,
      type: "debit",
      amount: totalCharge,
      orderId,
      desc: `Order #${order.orderNumber ?? orderId.slice(-8).toUpperCase()} — ${order.vendorName ?? ""}`,
      splits: {vendorAmount, riderAmount, platformAmount},
      createdAt: now,
    });

    // 5e. Mark order: wallet charged, rider credit still pending
    batch.update(orderRef, {
      paymentStatus: "paid",
      paymentMethod: "wallet",
      walletCharged: true,
      walletChargedAt: now,
      creditsDistributed: false, // ← rider not yet paid
      splitAmounts: {vendorAmount, riderAmount, platformAmount},
    });

    // 5f. Platform earnings
    if (platformAmount > 0) {
      const platformRef = db.collection("platformEarnings").doc();
      batch.set(platformRef, {
        orderId,
        amount: platformAmount,
        source: "wallet_split",
        createdAt: now,
      });
    }

    await batch.commit();

    return {
      success: true,
      totalCharged: totalCharge,
      splits: {vendorAmount, riderAmount, platformAmount},
      newBalance: currentBalance - totalCharge,
    };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// RIDER WALLET WITHDRAW
// ─────────────────────────────────────────────────────────────────────────────
export const riderWalletWithdraw = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const riderId = request.auth?.uid;
    if (!riderId) throw new HttpsError("unauthenticated", "Must be signed in");

    const {amount} = request.data as { amount: number };
    if (!amount || amount < 100) throw new HttpsError("invalid-argument", "Minimum withdrawal is ₦100");

    const walletRef = db.collection("riderWallets").doc(riderId);
    const walletSnap = await walletRef.get();
    const balance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;

    if (balance < amount) {
      throw new HttpsError("failed-precondition", `Insufficient balance. Have ₦${balance.toFixed(2)}`);
    }

    const bankSnap = await db.collection("riderBankAccounts").doc(riderId).get();
    if (!bankSnap.exists) throw new HttpsError("failed-precondition", "No bank account linked");

    const bank = bankSnap.data()!;
    const recipientCode = bank.recipient_code as string;
    if (!recipientCode) {
      throw new HttpsError("failed-precondition", "Bank account not fully set up — missing recipient code");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: "SwiftNija rider withdrawal",
      }),
    });

    const transferData = await transferRes.json() as {
      status: boolean;
      data: {transfer_code: string; status: string};
    };
    if (!transferData.status) {
      throw new HttpsError("internal", `Paystack transfer failed: ${JSON.stringify(transferData)}`);
    }

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    batch.update(walletRef, {balance: FieldValue.increment(-amount)});

    const txRef = db.collection("riderWalletTransactions").doc();
    batch.set(txRef, {
      riderId,
      type: "debit",
      amount,
      desc: `Withdrawal to ${bank.bank_name} (****${bank.account_number?.slice(-4)})`,
      transferCode: transferData.data.transfer_code,
      transferStatus: transferData.data.status,
      createdAt: now,
    });

    await batch.commit();

    return {
      success: true,
      newBalance: balance - amount,
      transferCode: transferData.data.transfer_code,
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE RIDER PAYSTACK SUBACCOUNT + RECIPIENT
// ─────────────────────────────────────────────────────────────────────────────
export const createRiderPaystackRecipient = onCall(
  { region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"] },
  async (request) => {
    const riderId = request.auth?.uid;
    if (!riderId) throw new HttpsError("unauthenticated", "Must be signed in");

    const { account_number, bank_code, account_name, bank_name } = request.data as {
      account_number: string;
      bank_code: string;
      account_name: string;
      bank_name: string;
    };

    if (!account_number || !bank_code || !account_name || !bank_name) {
      throw new HttpsError("invalid-argument", "account_number, bank_code, account_name, bank_name all required");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) throw new HttpsError("internal", "Paystack secret key not configured");

    // ── Load rider name for subaccount business_name ───────────────────────
    const riderSnap = await db.collection("riders").doc(riderId).get();
    if (!riderSnap.exists) throw new HttpsError("not-found", "Rider not found");
    const rider = riderSnap.data()!;
    const fullName = rider.fullName ?? `${rider.firstName ?? ""} ${rider.lastName ?? ""}`.trim();

    // ── 1. Create Paystack subaccount ──────────────────────────────────────
    // Stored for future Paystack card-payment splits
    const subRes = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name: `${fullName} (SwiftNija Rider)`,
        settlement_bank: bank_code,
        account_number,
        percentage_charge: 0,
        primary_contact_name: fullName,
        primary_contact_phone: rider.phone ?? "",
      }),
    });

    const subData = await subRes.json() as {
      status: boolean;
      message: string;
      data: { subaccount_code: string };
    };

    if (!subData.status) {
      throw new HttpsError("internal", `Paystack subaccount error: ${subData.message}`);
    }

    // ── 2. Create transfer recipient ───────────────────────────────────────
    // Used by riderWalletWithdraw for manual bank transfers
    const recRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: account_name,
        account_number,
        bank_code,
        currency: "NGN",
      }),
    });

    const recData = await recRes.json() as {
      status: boolean;
      message: string;
      data: { recipient_code: string };
    };

    if (!recData.status) {
      throw new HttpsError("internal", `Paystack recipient error: ${recData.message}`);
    }

    // ── 3. Save both codes — full overwrite ────────────────────────────────
    await db.collection("riderBankAccounts").doc(riderId).set({
      riderId,
      account_number,
      bank_code,
      account_name,
      bank_name,
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