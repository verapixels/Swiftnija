/* eslint-disable camelcase */
// functions/src/paystackDVA.ts
// FIX 1: paystackCreateDVA — creates a Paystack Dedicated Virtual Account (DVA)
//         for bank-transfer payments. Called from BankTransferPopup.
// FIX 2: paystackWebhookV2 — replaces old webhook; handles money splitting
//         (vendor via subaccount + rider via riderSplitWallets) on charge.success.

import {onCall, HttpsError, onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: paystackCreateDVA
// Creates (or reuses) a Paystack Dedicated Virtual Account for an order.
// The frontend polls the order doc for paymentStatus === "paid" (set by webhook).
// ─────────────────────────────────────────────────────────────────────────────
export const paystackCreateDVA = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    secrets: ["PAYSTACK_SECRET_KEY"],
    cors: ["http://localhost:5173", "https://swiftnija-c0e04.web.app", "https://swiftnija-c0e04.firebaseapp.com"],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const {orderId, amountKobo} = request.data as {
      orderId: string;
      amountKobo: number;
    };

    if (!orderId) throw new HttpsError("invalid-argument", "orderId required");
    if (!amountKobo || amountKobo < 10000) {
      throw new HttpsError("invalid-argument", "Minimum order is ₦100");
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) throw new HttpsError("internal", "Paystack secret key not configured");

    const uid = request.auth.uid;
    let email = request.auth.token.email ?? "";

    // Fetch email from Firestore if not in token
    if (!email) {
      const userSnap = await db.collection("users").doc(uid).get();
      email = userSnap.data()?.email ?? "";
    }
    if (!email) throw new HttpsError("invalid-argument", "No email on account");

    // Check if a DVA was already created for this order (idempotency)
    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");

    const orderData = orderSnap.data()!;
    if (orderData.dva) {
      // Return cached DVA details
      return {
        success: true,
        account_number: orderData.dva.account_number,
        bank_name: orderData.dva.bank_name,
        account_name: orderData.dva.account_name,
      };
    }

    // Step 1: Create or reuse a Paystack customer for this user
    let customerCode = orderData.paystackCustomerCode as string | undefined;

    if (!customerCode) {
      // Try to find existing customer
      const findRes = await fetch(
        `https://api.paystack.co/customer?email=${encodeURIComponent(email)}`,
        {headers: {Authorization: `Bearer ${PAYSTACK_SECRET}`}}
      );
      const findData = await findRes.json() as { status: boolean; data: Array<{ customer_code: string }> };
      if (findData.status && findData.data?.length > 0) {
        customerCode = findData.data[0].customer_code;
      } else {
        // Create new customer
        const createRes = await fetch("https://api.paystack.co/customer", {
          method: "POST",
          headers: {"Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json"},
          body: JSON.stringify({email, first_name: orderData.customerName?.split(" ")[0] ?? "Customer"}),
        });
        const createData = await createRes.json() as { status: boolean; data: { customer_code: string } };
        if (!createData.status) throw new HttpsError("internal", "Failed to create Paystack customer");
        customerCode = createData.data.customer_code;
      }
      // Cache customer code on the order
      await db.collection("orders").doc(orderId).update({paystackCustomerCode: customerCode});
    }

    // Step 2: Create a DVA for the customer
    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {"Authorization": `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        customer: customerCode,
        preferred_bank: "wema-bank", // Wema Bank (ALAT) — most reliable for DVAs in Nigeria
      }),
    });
    const dvaData = await dvaRes.json() as {
      status: boolean;
      message: string;
      data: {
        account_number: string;
        bank: { name: string };
        account_name: string;
      };
    };

    if (!dvaData.status) {
      // Some Paystack plans don't support DVA — fall back to regular charge
      throw new HttpsError("internal", `DVA creation failed: ${dvaData.message}`);
    }

    const dva = {
      account_number: dvaData.data.account_number,
      bank_name: dvaData.data.bank?.name ?? "Wema Bank",
      account_name: dvaData.data.account_name,
      customer_code: customerCode,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Store DVA on the order so webhook can match inbound transfer to this order
    await db.collection("orders").doc(orderId).update({
      dva,
      dva_amount_kobo: amountKobo,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      account_number: dva.account_number,
      bank_name: dva.bank_name,
      account_name: dva.account_name,
    };
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: paystackWebhookV2
// Handles charge.success from Paystack (both DVA bank transfers and card payments).
// FIX 2: After confirming payment, splits money:
//   - Vendor already receives via Paystack subaccount split (set during init)
//   - Rider split goes into riderSplitWallets (via riderDeliveryPercent of deliveryFee)
//   - Platform keeps the remainder
// ─────────────────────────────────────────────────────────────────────────────
export const paystackWebhookV2 = onRequest(
  {
    region: "us-central1",
    secrets: ["PAYSTACK_SECRET_KEY"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error("[paystackWebhookV2] PAYSTACK_SECRET_KEY not configured");
      res.status(500).send("Server error");
      return;
    }

    // Verify HMAC signature
    const signature = req.headers["x-paystack-signature"] as string;
    const rawBody = JSON.stringify(req.body);
    const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");

    if (hash !== signature) {
      console.warn("[paystackWebhookV2] Invalid signature");
      res.status(400).send("Invalid signature");
      return;
    }

    // Respond immediately to Paystack
    res.status(200).send("OK");

    const event = req.body as {
      event: string;
      data: {
        status: string;
        reference: string;
        amount: number; // in kobo
        customer: { email: string; customer_code?: string };
        metadata?: { orderId?: string; uid?: string };
        dedicated_account?: { account_number: string };
      };
    };

    console.info(`[paystackWebhookV2] Event: ${event.event}`);

    if (event.event !== "charge.success") return;

    const {reference, amount: paidAmountKobo} = event.data;

    try {
      // ── 1. Resolve order ─────────────────────────────────────────────────
      let orderId: string | undefined = event.data.metadata?.orderId;

      // DVA payments may not have metadata — match by customer + amount
      if (!orderId && event.data.dedicated_account?.account_number) {
        const dvaAcctNum = event.data.dedicated_account.account_number;
        const snapshot = await db.collection("orders")
          .where("dva.account_number", "==", dvaAcctNum)
          .where("paymentStatus", "==", "pending")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get();
        if (!snapshot.empty) orderId = snapshot.docs[0].id;
      }

      // Fall back to orderPendingTx (card payments use this)
      if (!orderId) {
        const pendingSnap = await db.collection("orderPendingTx").doc(reference).get();
        if (pendingSnap.exists) orderId = pendingSnap.data()!.orderId;
      }

      if (!orderId) {
        console.warn(`[paystackWebhookV2] Could not resolve orderId for ref ${reference}`);
        return;
      }

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        console.error(`[paystackWebhookV2] Order ${orderId} not found`);
        return;
      }

      const orderData = orderSnap.data()!;

      // Idempotency
      if (orderData.paymentStatus === "paid") {
        console.info(`[paystackWebhookV2] Order ${orderId} already paid`);
        return;
      }

      // ── 2. Read platform split settings ──────────────────────────────────
      const settingsSnap = await db.collection("platformSettings").doc("global").get();
      const settings = settingsSnap.exists ? settingsSnap.data()! : {};
      const riderDeliveryPercent = Number(settings.riderDeliveryPercent ?? 85);

      const deliveryFee: number = orderData.deliveryFee ?? 0;
      const riderAmount = Math.round(deliveryFee * (riderDeliveryPercent / 100) * 100) / 100;

      const now = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();

      // ── 3. Confirm order ──────────────────────────────────────────────────
      batch.update(orderRef, {
        paymentStatus: "paid",
        status: "confirmed",
        paystackReference: reference,
        paidAmountKobo,
        paidAt: now,
        updatedAt: now,
      });

      // Mark pending tx (card flow)
      const pendingRef = db.collection("orderPendingTx").doc(reference);
      batch.set(pendingRef, {status: "success", updatedAt: now}, {merge: true});

      // Log payment
      batch.set(db.collection("payments").doc(reference), {
        reference, orderId,
        uid: orderData.userId,
        amountKobo: paidAmountKobo,
        amountNaira: paidAmountKobo / 100,
        customerEmail: event.data.customer.email,
        source: "paystack_webhook_v2",
        paymentMethod: orderData.paymentMethod,
        createdAt: now,
      });

      await batch.commit();
      console.info(`[paystackWebhookV2] ✅ Order ${orderId} confirmed — ₦${paidAmountKobo / 100}`);

      // ── 4. FIX 2: Rider split (credited when delivery is confirmed)
      //    We don't credit rider yet — updateOrderStatus does that on "delivered"
      //    But we pre-calculate and store the split amounts on the order doc
      //    so updateOrderStatus always uses the right numbers.
      if (riderAmount > 0) {
        await db.collection("orders").doc(orderId).update({
          "splitAmounts.riderAmount": riderAmount,
          "splitAmounts.deliveryFee": deliveryFee,
          "splitAmounts.riderDeliveryPercent": riderDeliveryPercent,
        });
        console.info(`[paystackWebhookV2] Split saved — rider will get ₦${riderAmount} on delivery`);
      }

      // ── 5. Notify rider assignment (trigger assignRider by setting status) ─
      // Status is already set to "confirmed" above; assignRider cloud function
      // watches for confirmed → finding_rider transition. If you want auto-assign,
      // set status to "finding_rider" here instead:
      // await db.collection("orders").doc(orderId).update({ status: "finding_rider" });
    } catch (err) {
      console.error("[paystackWebhookV2] Error:", err);
    }
  }
);