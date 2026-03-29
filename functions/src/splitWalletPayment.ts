/* eslint-disable camelcase */
// functions/src/splitWalletPayment.ts
// ✅ REPLACE your entire existing splitWalletPayment.ts with this file

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const db = getFirestore();

export const splitWalletPayment = onCall(
  {region: "us-central1", enforceAppCheck: false, secrets: ["PAYSTACK_SECRET_KEY"]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be signed in");

    const {orderId} = request.data as { orderId: string };
    if (!orderId) throw new HttpsError("invalid-argument", "orderId required");

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");

    const order = orderSnap.data()!;
    const orderUserId = order.userId || order.customerId || order.uid;
    if (orderUserId !== uid) throw new HttpsError("permission-denied", "Not your order");
    if (order.paymentStatus === "paid" || order.walletCharged) {
      throw new HttpsError("already-exists", "Order already paid");
    }

    const settingsSnap = await db.collection("platformSettings").doc("global").get();
    const settings = settingsSnap.exists ? settingsSnap.data()! : {};
    const vendorItemPercent = Number(settings.vendorItemPercent ?? 80);
    const riderDeliveryPercent = Number(settings.riderDeliveryPercent ?? 85);

    const subtotal = Math.round((order.subtotal ?? order.total ?? 0) * 100) / 100;
    const deliveryFee = Math.round((order.deliveryFee ?? 0) * 100) / 100;
    const discount = Math.round((order.discount ?? 0) * 100) / 100;
    const totalCharge = Math.round((subtotal + deliveryFee - discount) * 100) / 100;
    if (totalCharge <= 0) throw new HttpsError("invalid-argument", "Order total must be > 0");

    const vendorAmount = Math.round(subtotal * (vendorItemPercent / 100) * 100) / 100;
    const riderAmount = Math.round(deliveryFee * (riderDeliveryPercent / 100) * 100) / 100;
    const platformAmount = Math.round((totalCharge - vendorAmount - riderAmount) * 100) / 100;
    const vendorId = order.vendorId as string | undefined;

    const walletRef = db.collection("wallets").doc(uid);
    const walletSnap = await walletRef.get();
    const currentBalance = walletSnap.exists ? (walletSnap.data()!.balance ?? 0) : 0;
    if (currentBalance < totalCharge) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient wallet balance. Need ₦${totalCharge.toFixed(2)}, have ₦${currentBalance.toFixed(2)}`
      );
    }

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    // Debit user wallet
    batch.update(walletRef, {balance: FieldValue.increment(-totalCharge)});

    // Credit vendor to BOTH vendorWallets (Paystack tab) AND vendorSplitWallets (Wallet tab)
    if (vendorId && vendorAmount > 0) {
      const vendorWalletRef = db.collection("vendorWallets").doc(vendorId);
      batch.set(vendorWalletRef, {balance: FieldValue.increment(vendorAmount)}, {merge: true});
      const vendorTxRef = db.collection("vendorWalletTransactions").doc();
      batch.set(vendorTxRef, {
        vendorId, type: "credit", amount: vendorAmount, orderId,
        desc: `Order payment — ${order.orderNumber ?? orderId.slice(-8).toUpperCase()}`,
        source: "wallet_split", createdAt: now,
      });

      // DELETE these lines from splitWalletPayment.ts — remove the vendorSplitWallets block entirely
const vendorSplitWalletRef = db.collection("vendorSplitWallets").doc(vendorId);
batch.set(vendorSplitWalletRef, {balance: FieldValue.increment(vendorAmount), vendorId}, {merge: true});
const vendorSplitTxRef = db.collection("vendorSplitWalletTransactions").doc();
batch.set(vendorSplitTxRef, {
  vendorId, type: "credit", amount: vendorAmount, orderId,
  desc: `Order split — ${order.orderNumber ?? orderId.slice(-8).toUpperCase()}`,
  source: "wallet_split", createdAt: now,
});
    }

    // Platform fee → adminWallets/platform
    if (platformAmount > 0) {
      const adminWalletRef = db.collection("adminWallets").doc("platform");
      batch.set(adminWalletRef, {
        balance: FieldValue.increment(platformAmount),
        totalEarned: FieldValue.increment(platformAmount),
      }, {merge: true});
      const platformRef = db.collection("platformEarnings").doc();
      batch.set(platformRef, {orderId, amount: platformAmount, source: "wallet_split", createdAt: now});
    }

    // User debit tx log
    const userTxRef = db.collection("walletTransactions").doc();
    batch.set(userTxRef, {
      userId: uid, type: "debit", amount: totalCharge, orderId,
      desc: `Order #${order.orderNumber ?? orderId.slice(-8).toUpperCase()} — ${order.vendorName ?? ""}`,
      splits: {vendorAmount, riderAmount, platformAmount},
      createdAt: now,
    });

    batch.update(orderRef, {
      paymentStatus: "paid", paymentMethod: "wallet",
      walletCharged: true, walletChargedAt: now,
      creditsDistributed: false,
      splitAmounts: {vendorAmount, riderAmount, platformAmount},
    });

    await batch.commit();

    return {
      success: true,
      totalCharged: totalCharge,
      splits: {vendorAmount, riderAmount, platformAmount},
      newBalance: currentBalance - totalCharge,
    };
  }
);
