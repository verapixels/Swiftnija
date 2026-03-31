import {onCall, HttpsError, onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {buildOtpEmail} from "./otpEmailTemplate";
import {onDocumentUpdated, onDocumentCreated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const FROM_ADDRESS = "Swift9ja <noreply@verapixels.com>";
const CORS_ORIGINS = true;

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  // Changed to HttpsError so the client gets a proper error instead of a 500
  if (!apiKey) throw new HttpsError("internal", "RESEND_API_KEY is not configured.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new HttpsError("internal", `Resend API error ${res.status}: ${errText}`);
  }
}

async function checkRateLimit(uid: string, field: string): Promise<void> {
  const ref = db.collection("otpRateLimits").doc(`${uid}_${field}`);
  const snap = await ref.get();
  const data = snap.data() ?? {count: 0, windowStart: 0};
  const now = Date.now();

  if (now - data.windowStart > RATE_WINDOW_MS) {
    await ref.set({count: 1, windowStart: now});
    return;
  }
  if (data.count >= RATE_LIMIT_MAX) {
    const minsLeft = Math.ceil((RATE_WINDOW_MS - (now - data.windowStart)) / 60_000);
    throw new HttpsError(
      "resource-exhausted",
      `Too many attempts. Try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`
    );
  }
  await ref.update({count: admin.firestore.FieldValue.increment(1)});
}

// ─────────────────────────────────────────
// FUNCTION 1: sendEmailOtp
// ─────────────────────────────────────────
// ✅ FIXED: added secrets: ["RESEND_API_KEY"]
export const sendEmailOtp = onCall({
  cors: CORS_ORIGINS,
  secrets: ["RESEND_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) throw new HttpsError("invalid-argument", "No email on account.");

  await checkRateLimit(uid, "email");

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_EXPIRY_MS);

  await db.collection("users").doc(uid).set({
    emailOtpHash: otpHash,
    emailOtpExpiresAt: expiresAt,
    emailVerified: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  const userSnap = await db.collection("users").doc(uid).get();
  const name = userSnap.data()?.fullName ?? "there";

  const {subject, html} = buildOtpEmail({
    code: otp, purpose: "email", recipientName: name, expiryMinutes: 5,
  });

  await sendViaResend({to: email, subject, html});
  console.info(`[sendEmailOtp] Sent to ${email} (uid: ${uid})`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 2: verifyEmailOtp
// ─────────────────────────────────────────
export const verifyEmailOtp = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const enteredCode = ((request.data as {code?: string}).code ?? "").trim();

  if (!/^\d{6}$/.test(enteredCode)) {
    throw new HttpsError("invalid-argument", "Enter a valid 6-digit code.");
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data();

  if (!userData?.emailOtpHash) {
    throw new HttpsError("not-found", "No code found — request a new one.");
  }

  const expiresAt = (userData.emailOtpExpiresAt as admin.firestore.Timestamp).toMillis();
  if (Date.now() > expiresAt) {
    await db.collection("users").doc(uid).update({
      emailOtpHash: admin.firestore.FieldValue.delete(),
      emailOtpExpiresAt: admin.firestore.FieldValue.delete(),
    });
    throw new HttpsError("deadline-exceeded", "Code expired — request a new one.");
  }

  if (hashOtp(enteredCode) !== userData.emailOtpHash) {
    throw new HttpsError("invalid-argument", "Wrong code — try again.");
  }

  await db.collection("users").doc(uid).update({
    emailVerified: true,
    emailOtpHash: admin.firestore.FieldValue.delete(),
    emailOtpExpiresAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info(`[verifyEmailOtp] Email verified for uid: ${uid}`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 3: sendPhoneVerificationOtp
// ─────────────────────────────────────────
// ✅ FIXED: added secrets: ["RESEND_API_KEY"]
export const sendPhoneVerificationOtp = onCall({
  cors: CORS_ORIGINS,
  secrets: ["RESEND_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) throw new HttpsError("invalid-argument", "No email on account.");

  const phone = ((request.data as {phone?: string}).phone ?? "").trim();
  if (!phone) throw new HttpsError("invalid-argument", "Phone number required.");

  await checkRateLimit(uid, "phone");

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_EXPIRY_MS);

  await db.collection("users").doc(uid).set({
    phone,
    phoneOtpHash: otpHash,
    phoneOtpExpiresAt: expiresAt,
    phoneVerified: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  const userSnap = await db.collection("users").doc(uid).get();
  const name = userSnap.data()?.fullName ?? "there";

  const {subject, html} = buildOtpEmail({
    code: otp, purpose: "phone", recipientName: name, expiryMinutes: 5,
  });

  await sendViaResend({to: email, subject, html});
  console.info(`[sendPhoneVerificationOtp] Emailed to ${email} for phone ${phone} (uid: ${uid})`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 4: verifyPhoneOtp
// ─────────────────────────────────────────
export const verifyPhoneOtp = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const enteredCode = ((request.data as {code?: string}).code ?? "").trim();

  if (!/^\d{6}$/.test(enteredCode)) {
    throw new HttpsError("invalid-argument", "Enter a valid 6-digit code.");
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data();

  if (!userData?.phoneOtpHash) {
    throw new HttpsError("not-found", "No code found — request a new one.");
  }

  const expiresAt = (userData.phoneOtpExpiresAt as admin.firestore.Timestamp).toMillis();
  if (Date.now() > expiresAt) {
    await db.collection("users").doc(uid).update({
      phoneOtpHash: admin.firestore.FieldValue.delete(),
      phoneOtpExpiresAt: admin.firestore.FieldValue.delete(),
    });
    throw new HttpsError("deadline-exceeded", "Code expired — request a new one.");
  }

  if (hashOtp(enteredCode) !== userData.phoneOtpHash) {
    throw new HttpsError("invalid-argument", "Wrong code — try again.");
  }

  await db.collection("users").doc(uid).update({
    phoneVerified: true,
    phoneOtpHash: admin.firestore.FieldValue.delete(),
    phoneOtpExpiresAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info(`[verifyPhoneOtp] Phone verified for uid: ${uid}`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 5: sendPasswordResetOtp
// ─────────────────────────────────────────
// ✅ FIXED: added secrets: ["RESEND_API_KEY"]
export const sendPasswordResetOtp = onCall({
  cors: CORS_ORIGINS,
  secrets: ["RESEND_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) throw new HttpsError("invalid-argument", "No email on account.");

  await checkRateLimit(uid, "pwdreset");

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_EXPIRY_MS);

  await db.collection("users").doc(uid).set({
    pwdResetOtpHash: otpHash,
    pwdResetOtpExpiresAt: expiresAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});

  const userSnap = await db.collection("users").doc(uid).get();
  const name = userSnap.data()?.fullName ?? "there";

  const {html} = buildOtpEmail({
    code: otp, purpose: "email", recipientName: name, expiryMinutes: 5,
  });

  await sendViaResend({
    to: email,
    subject: `${otp} — Your Swift9ja password reset code`,
    html,
  });

  console.info(`[sendPasswordResetOtp] Sent to ${email} (uid: ${uid})`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 6: verifyPasswordResetOtp
// ─────────────────────────────────────────
export const verifyPasswordResetOtp = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const enteredCode = ((request.data as {code?: string}).code ?? "").trim();

  if (!/^\d{6}$/.test(enteredCode)) {
    throw new HttpsError("invalid-argument", "Enter a valid 6-digit code.");
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data();

  if (!userData?.pwdResetOtpHash) {
    throw new HttpsError("not-found", "No code found — request a new one.");
  }

  const expiresAt = (userData.pwdResetOtpExpiresAt as admin.firestore.Timestamp).toMillis();
  if (Date.now() > expiresAt) {
    await db.collection("users").doc(uid).update({
      pwdResetOtpHash: admin.firestore.FieldValue.delete(),
      pwdResetOtpExpiresAt: admin.firestore.FieldValue.delete(),
    });
    throw new HttpsError("deadline-exceeded", "Code expired — request a new one.");
  }

  if (hashOtp(enteredCode) !== userData.pwdResetOtpHash) {
    throw new HttpsError("invalid-argument", "Wrong code — try again.");
  }

  await db.collection("users").doc(uid).update({
    pwdResetOtpHash: admin.firestore.FieldValue.delete(),
    pwdResetOtpExpiresAt: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info(`[verifyPasswordResetOtp] Verified for uid: ${uid}`);
  return {success: true};
});

/* eslint-disable camelcase */

// ─────────────────────────────────────────
// FUNCTION 7: paystackResolveAccount
// ─────────────────────────────────────────
export const paystackResolveAccount = onCall({
  cors: CORS_ORIGINS,
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {account_number, bank_code} = request.data as {account_number: string; bank_code: string};
  if (!account_number || !bank_code) throw new HttpsError("invalid-argument", "account_number and bank_code required.");

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new HttpsError("internal", "Paystack secret key not configured.");

  const res = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
    {headers: {Authorization: `Bearer ${secretKey}`}}
  );
  const data = await res.json() as {status: boolean; message: string; data: {account_name: string; account_number: string}};
  if (!data.status) throw new HttpsError("invalid-argument", data.message || "Could not verify account");

  return {success: true, data: data.data};
});

// ─────────────────────────────────────────
// FUNCTION 8: paystackCreateSubaccount
// ─────────────────────────────────────────
export const paystackCreateSubaccount = onCall({
  cors: CORS_ORIGINS,
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {business_name, bank_code, account_number, vendor_email} =
    request.data as {business_name: string; bank_code: string; account_number: string; vendor_email: string};

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new HttpsError("internal", "Paystack secret key not configured.");

  const res = await fetch("https://api.paystack.co/subaccount", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_name,
      bank_code,
      account_number,
      percentage_charge: 0,
      primary_contact_email: vendor_email,
    }),
  });
  const data = await res.json() as {status: boolean; message: string; data: {subaccount_code: string}};
  if (!data.status) throw new HttpsError("internal", data.message || "Failed to create subaccount");

  return {success: true, subaccount_code: data.data.subaccount_code};
});

// ─────────────────────────────────────────
// FUNCTION 9: paystackGetTransactions
// ─────────────────────────────────────────
export const paystackGetTransactions = onCall({
  cors: CORS_ORIGINS,
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {subaccount_code} = request.data as {subaccount_code: string};
  if (!subaccount_code) throw new HttpsError("invalid-argument", "subaccount_code required.");

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new HttpsError("internal", "Paystack secret key not configured.");

  const res = await fetch(
    `https://api.paystack.co/transaction?subaccount=${subaccount_code}&perPage=100`,
    {headers: {Authorization: `Bearer ${secretKey}`}}
  );
  const data = await res.json() as {status: boolean; message: string; data: unknown[]};
  if (!data.status) throw new HttpsError("internal", data.message || "Failed to fetch transactions");

  return {success: true, transactions: data.data};
});

// ─────────────────────────────────────────
// FUNCTION 10: mapsTextSearch
// ─────────────────────────────────────────
export const mapsTextSearch = onCall({
  cors: CORS_ORIGINS,
  secrets: ["GOOGLE_MAPS_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {query} = request.data as { query: string };
  if (!query || query.trim().length < 2) {
    throw new HttpsError("invalid-argument", "Query too short.");
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new HttpsError("internal", "Maps API key not configured.");

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + " Nigeria")}&key=${apiKey}&language=en&region=NG`;
  const res = await fetch(url);
  const data = await res.json() as {
    status: string;
    results: Array<{
      place_id: string;
      formatted_address: string;
      name: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new HttpsError("internal", `Places API error: ${data.status}`);
  }

  return {
    success: true,
    results: (data.results ?? []).slice(0, 4).map((r) => ({
      placeId: r.place_id,
      displayName: r.formatted_address || r.name,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    })),
  };
});

// ─────────────────────────────────────────
// FUNCTION 11: mapsReverseGeocode
// ─────────────────────────────────────────
export const mapsReverseGeocode = onCall({
  cors: CORS_ORIGINS,
  secrets: ["GOOGLE_MAPS_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {lat, lng} = request.data as { lat: number; lng: number };
  if (lat === undefined || lng === undefined) {
    throw new HttpsError("invalid-argument", "lat and lng required.");
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new HttpsError("internal", "Maps API key not configured.");

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=en&region=NG`;
  const res = await fetch(url);
  const data = await res.json() as {
    status: string;
    results: Array<{ formatted_address: string }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new HttpsError("internal", `Geocode API error: ${data.status}`);
  }

  return {
    success: true,
    address: data.results?.[0]?.formatted_address ?? "",
  };
});

// ─────────────────────────────────────────
// FUNCTION 12: mapsForwardGeocode
// ─────────────────────────────────────────
export const mapsForwardGeocode = onCall({
  cors: CORS_ORIGINS,
  secrets: ["GOOGLE_MAPS_API_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const {address} = request.data as { address: string };
  if (!address || address.trim().length < 4) {
    throw new HttpsError("invalid-argument", "Address too short.");
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new HttpsError("internal", "Maps API key not configured.");

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + " Nigeria")}&key=${apiKey}&language=en&region=NG`;
  const res = await fetch(url);
  const data = await res.json() as {
    status: string;
    results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new HttpsError("internal", `Geocode API error: ${data.status}`);
  }

  const loc = data.results?.[0]?.geometry?.location;
  return {
    success: true,
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
  };
});

// ─────────────────────────────────────────
// FUNCTION 13: paystackInitializePayment
// ─────────────────────────────────────────
export const paystackInitializePayment = onCall({
  cors: CORS_ORIGINS,
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) throw new HttpsError("invalid-argument", "No email on account.");

  const {amountKobo} = request.data as {amountKobo: number};

  if (!amountKobo || typeof amountKobo !== "number" || amountKobo < 10000) {
    throw new HttpsError("invalid-argument", "Minimum top-up is ₦100.");
  }
  if (amountKobo > 100_000_000) {
    throw new HttpsError("invalid-argument", "Maximum top-up is ₦1,000,000 per transaction.");
  }

  const reference = `swift9ja_wallet_${uid}_${Date.now()}`;

  await db.collection("walletPendingTx").doc(reference).set({
    uid,
    email,
    amountKobo,
    amountNaira: amountKobo / 100,
    reference,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new HttpsError("internal", "Paystack secret key not configured.");

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      currency: "NGN",
      callback_url: `${process.env.APP_URL || "http://localhost:5173"}/profile?tab=wallet`,
      channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
      metadata: {
        uid,
        purpose: "wallet_topup",
        custom_fields: [
          {display_name: "User ID", variable_name: "uid", value: uid},
          {display_name: "Purpose", variable_name: "purpose", value: "Swiftnija Wallet Top-up"},
        ],
      },
    }),
  });

  const data = await res.json() as {
    status: boolean;
    message: string;
    data: {authorization_url: string; access_code: string; reference: string};
  };

  if (!data.status) {
    throw new HttpsError("internal", `Paystack error: ${data.message}`);
  }

  console.info(`[paystackInitializePayment] uid=${uid} ref=${reference} amount=₦${amountKobo / 100}`);

  return {
    success: true,
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
});


// ─────────────────────────────────────────
// FUNCTION 13 (NEW): paystackInitializeOrderPayment
// Called from CartPage when user clicks Pay Now.
// Creates the Paystack transaction with the vendor split baked in.
// Order stays "pending" until the webhook below confirms it.
// ─────────────────────────────────────────
export const paystackInitializeOrderPayment = onCall({
  cors: CORS_ORIGINS,
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) throw new HttpsError("invalid-argument", "No email on account.");

  const {orderId, amountKobo, vendorSubaccountCode} = request.data as {
    orderId: string;
    amountKobo: number;
    vendorSubaccountCode?: string;
  };

  if (!orderId) throw new HttpsError("invalid-argument", "orderId required.");
  if (!amountKobo || amountKobo < 10000) {
    throw new HttpsError("invalid-argument", "Minimum order is ₦100.");
  }

  // Read split percentage from Firestore so admin can change it any time
  const settingsSnap = await db.collection("platformSettings").doc("global").get();
  const settings = settingsSnap.exists ? settingsSnap.data()! : {};
  const vendorItemPercent = Number(settings.vendorItemPercent ?? 80);

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new HttpsError("internal", "Paystack secret key not configured.");

  // Reference ties this Paystack transaction to your order document
  const reference = `swift9ja_order_${orderId}_${Date.now()}`;

  // Save a pending record so the webhook can look it up by reference
  await db.collection("orderPendingTx").doc(reference).set({
    uid,
    email,
    orderId,
    amountKobo,
    reference,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Build the Paystack request body
  const body: Record<string, unknown> = {
    email,
    amount: amountKobo,
    reference,
    currency: "NGN",
    // All channels — card, bank transfer, USSD, QR, mobile money
    channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
    metadata: {
      uid,
      orderId,
      purpose: "order_payment",
    },
  };

  // Wire in the split only if the vendor has a linked subaccount
  if (vendorSubaccountCode) {
    body.split = {
      type: "percentage",
      bearer_type: "account", // platform bears Paystack fees
      subaccounts: [
        {
          subaccount: vendorSubaccountCode,
          share: vendorItemPercent, // e.g. 80 = vendor gets 80%
        },
      ],
    };
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as {
    status: boolean;
    message: string;
    data: {
      authorization_url: string;
      access_code: string;
      reference: string;
    };
  };

  if (!data.status) {
    throw new HttpsError("internal", `Paystack error: ${data.message}`);
  }

  console.info(`[paystackInitializeOrderPayment] uid=${uid} orderId=${orderId} ref=${reference} amount=₦${amountKobo / 100}`);

  return {
    success: true,
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
});


// ─────────────────────────────────────────
// FUNCTION 14 (NEW): paystackWebhook
export const paystackWebhook = onRequest({
  region: "us-central1",
  secrets: ["PAYSTACK_SECRET_KEY"],
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // Verify the request actually came from Paystack using HMAC signature
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    console.error("[paystackWebhook] PAYSTACK_SECRET_KEY not configured");
    res.status(500).send("Server error");
    return;
  }

  const signature = req.headers["x-paystack-signature"] as string;
  const rawBody = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest("hex");

  if (hash !== signature) {
    console.warn("[paystackWebhook] Invalid signature — request ignored");
    res.status(400).send("Invalid signature");
    return;
  }

  // Acknowledge receipt immediately — Paystack expects 200 within 5 seconds
  res.status(200).send("OK");

  const event = req.body as {
    event: string;
    data: {
      status: string;
      reference: string;
      amount: number;
      customer: { email: string };
    };
  };

  // We only care about successful charge events
  if (event.event !== "charge.success") {
    console.info(`[paystackWebhook] Ignored event: ${event.event}`);
    return;
  }

  const {reference, amount: paidAmountKobo} = event.data;

  try {
    // Look up the pending transaction record we created during initialization
    const pendingSnap = await db.collection("orderPendingTx").doc(reference).get();
    if (!pendingSnap.exists) {
      console.warn(`[paystackWebhook] No pending tx found for ref: ${reference}`);
      return;
    }

    const pending = pendingSnap.data()!;

    // Idempotency — don't process the same payment twice
    if (pending.status === "success") {
      console.info(`[paystackWebhook] Already processed ref: ${reference}`);
      return;
    }

    // Verify the amount matches what we expected
    if (paidAmountKobo !== pending.amountKobo) {
      console.error(`[paystackWebhook] Amount mismatch! expected=${pending.amountKobo} got=${paidAmountKobo} ref=${reference}`);
      return;
    }

    const {orderId, uid} = pending;

    // Verify the order actually exists
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      console.error(`[paystackWebhook] Order not found: ${orderId}`);
      return;
    }

    const orderData = orderSnap.data()!;

    // Don't double-confirm
    if (orderData.paymentStatus === "paid") {
      console.info(`[paystackWebhook] Order already confirmed: ${orderId}`);
      await db.collection("orderPendingTx").doc(reference).update({status: "success"});
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    // Mark the order as paid and move it to confirmed so rider assignment kicks in
    batch.update(orderRef, {
      paymentStatus: "paid",
      status: "confirmed",
      paystackReference: reference,
      paidAmountKobo,
      paidAt: now,
      updatedAt: now,
    });

    // Mark the pending tx as processed
    batch.update(db.collection("orderPendingTx").doc(reference), {
      status: "success",
      updatedAt: now,
    });

    // Log the payment in a payments collection for your records
    const paymentRef = db.collection("payments").doc(reference);
    batch.set(paymentRef, {
      reference,
      orderId,
      uid,
      amountKobo: paidAmountKobo,
      amountNaira: paidAmountKobo / 100,
      channel: event.data.status,
      customerEmail: event.data.customer.email,
      source: "paystack_webhook",
      createdAt: now,
    });

    await batch.commit();

    console.info(`[paystackWebhook] Order ${orderId} confirmed. ₦${paidAmountKobo / 100} paid. ref=${reference}`);
  } catch (err) {
    console.error("[paystackWebhook] Error processing webhook:", err);
  }
});

/* eslint-enable camelcase */

// ─── FUNCTION 16: sendAdminInvite ─────────────────────────────────────────────
export const sendAdminInvite = onCall(
  {secrets: ["RESEND_API_KEY"]},
  async (request) => {
    // 1. Auth check — caller must be logged in
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const callerId = request.auth.uid;

    // 2. Verify caller is a superadmin
    const callerSnap = await db.collection("admins").doc(callerId).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== "superadmin") {
      throw new HttpsError("permission-denied", "Only Super Admins can invite admins.");
    }

    const {email, role = "admin"} = request.data as { email: string; role?: string };

    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "A valid email is required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 3. Check if email is already an admin
    const existingAdmin = await db.collection("admins")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!existingAdmin.empty) {
      throw new HttpsError("already-exists", "This email already has an admin account.");
    }

    // 4. Check if there's already a pending invite
    const existingInvite = await db.collection("adminInvites")
      .where("email", "==", normalizedEmail)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingInvite.empty) {
      throw new HttpsError("already-exists", "A pending invite already exists for this email.");
    }

    // 5. Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 6. Save invite to Firestore
    const inviteRef = await db.collection("adminInvites").add({
      email: normalizedEmail,
      role,
      token,
      status: "pending",
      invitedBy: callerId,
      invitedByName: callerSnap.data()?.displayName || callerSnap.data()?.email || "Super Admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });

    // 7. Build invite link
    const baseUrl = process.env.APP_URL || "https://swiftnija.com";
    const inviteLink = `${baseUrl}/admin/accept-invite?token=${token}&id=${inviteRef.id}`;

    const inviterName = callerSnap.data()?.displayName || "The SwiftNija team";
    const roleLabel = role === "superadmin" ? "Super Admin" : "Admin";

    // 8. Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set — email will not be sent.");
      return {success: true, inviteId: inviteRef.id, warning: "Email not sent — API key missing"};
    }

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SwiftNija Admin Invitation</title>
  <style>
    body { margin: 0; padding: 0; background-color: #08080f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #0d0d1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); padding: 32px; text-align: center; }
    .logo { font-size: 28px; font-weight: 900; color: white; letter-spacing: -0.5px; }
    .logo span { opacity: 0.7; }
    .tagline { color: rgba(255,255,255,0.7); font-size: 13px; margin-top: 6px; }
    .body { padding: 36px 32px; }
    .greeting { font-size: 22px; font-weight: 800; color: #e8e8f5; margin-bottom: 16px; }
    .text { font-size: 15px; color: #9898b8; line-height: 1.7; margin-bottom: 16px; }
    .role-badge { display: inline-block; padding: 6px 14px; border-radius: 40px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 24px; }
    .role-admin { background: rgba(59,130,246,0.15); color: #3B82F6; border: 1px solid rgba(59,130,246,0.25); }
    .role-superadmin { background: rgba(139,92,246,0.15); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.25); }
    .btn-wrapper { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; padding: 15px 36px; background: linear-gradient(135deg, #FF6B00, #FF8C00); color: white !important; text-decoration: none; border-radius: 14px; font-size: 16px; font-weight: 800; letter-spacing: 0.3px; }
    .divider { height: 1px; background: rgba(255,255,255,0.06); margin: 24px 0; }
    .link-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 16px; }
    .link-label { font-size: 11px; font-weight: 800; color: #4a4a6a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
    .link-text { font-size: 11px; color: #9898b8; word-break: break-all; }
    .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
    .footer-text { font-size: 12px; color: #4a4a6a; line-height: 1.7; }
    .expiry { font-size: 12px; color: #4a4a6a; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">swift<span>9ja</span></div>
        <div class="tagline">Admin Portal Invitation</div>
      </div>
      <div class="body">
        <div class="greeting">You've been invited! 🎉</div>
        <p class="text">
          <strong style="color:#e8e8f5;">${inviterName}</strong> has invited you to join the
           Swift9ja admin team as a <strong style="color:#e8e8f5;">${roleLabel}</strong>.
        </p>
        <div class="role-badge ${role === "superadmin" ? "role-superadmin" : "role-admin"}">
          ${roleLabel}
        </div>
        <p class="text">
          Click the button below to set up your account. You'll be asked to create a password and complete your profile.
        </p>
        <div class="btn-wrapper">
          <a href="${inviteLink}" class="btn">Accept Invitation →</a>
        </div>
        <div class="divider"></div>
        <div class="link-box">
          <div class="link-label">Or copy this link</div>
          <div class="link-text">${inviteLink}</div>
        </div>
        <p class="expiry">⏰ This invitation expires in 7 days.</p>
      </div>
      <div class="footer">
        <div class="footer-text">
          This email was sent to <strong>${normalizedEmail}</strong>.<br />
          If you weren't expecting this, you can safely ignore it.
        </div>
        <div class="footer-text" style="margin-top:8px;">
          © Swift9ja · Nigeria's delivery platform
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [normalizedEmail],
        subject: `You've been invited to join Swift9ja as ${roleLabel}`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend API error:", emailRes.status, errBody);
      return {
        success: false,
        inviteId: inviteRef.id,
        error: `Email send failed (${emailRes.status}): ${errBody}`,
      };
    }

    const emailData = await emailRes.json() as { id?: string };
    console.log("Invite email sent. Resend ID:", emailData.id, "→", normalizedEmail);

    return {success: true, inviteId: inviteRef.id};
  }
);

// ─────────────────────────────────────────
// FUNCTION 17: assignRider
// ─────────────────────────────────────────
export const assignRider = onDocumentUpdated(
  "orders/{orderId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const orderId = event.params.orderId;

    const justBecameFinding =
      before.status !== "finding_rider" &&
      after.status === "finding_rider";

    if (!justBecameFinding) return;
    if (after.riderId) return;

    console.info(`[assignRider] Order ${orderId} → finding_rider`);

    const city: string = after.city ?? after.vendorCity ?? "Lagos";

    let ridersQuery = db.collection("riders")
      .where("isOnline", "==", true)
      .where("approved", "==", true)
      .where("status", "==", "active");

    if (city) {
      ridersQuery = ridersQuery.where("city", "==", city) as typeof ridersQuery;
    }

    const ridersSnap = await ridersQuery.limit(20).get();

    if (ridersSnap.empty) {
      await event.data!.after.ref.update({status: "no_rider_found"});
      return;
    }

    const available = ridersSnap.docs.filter((d) => !d.data().currentOrderId);

    if (available.length === 0) {
      await event.data!.after.ref.update({status: "no_rider_found"});
      return;
    }

    const best = available.sort(
      (a, b) => (b.data().stats?.rating ?? 0) - (a.data().stats?.rating ?? 0)
    )[0];

    const riderData = best.data();
    const riderId = best.id;

    const riderPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    await event.data!.after.ref.update({
      status: "rider_assigned",
      riderId,
      riderName: riderData.fullName ?? `${riderData.firstName} ${riderData.lastName}`,
      riderPhone: riderData.phone ?? "",
      riderPhotoURL: riderData.selfieUrl ?? "",
      riderVehicleId: riderData.vehicleId ?? riderData.vehicleType ?? "",
      riderAccepted: false,
      riderPickupCode,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("riders").doc(riderId).update({
      currentOrderId: orderId,
    });

    const fcmToken: string | undefined = riderData.fcmToken;
    if (fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          data: {
            type: "new_order",
            orderId,
            vendorName: after.vendorName ?? "",
            totalAmount: String(after.deliveryFee ?? after.total ?? ""),
            title: "🏍️ New Order!",
            body: `New delivery from ${after.vendorName ?? "a vendor"}. Tap to view.`,
          },
          android: {
            priority: "high",
          },
          apns: {
            payload: {
              aps: {
                contentAvailable: true,
                sound: "default",
                badge: 1,
              },
            },
          },
        });
      } catch (fcmErr) {
        console.error("[assignRider] FCM error:", fcmErr);
      }
    }

    console.info(`[assignRider] ✅ Assigned to rider ${riderId}`);
  }
);

// ─────────────────────────────────────────
// FUNCTION 18: acceptOrder
// ─────────────────────────────────────────
export const acceptOrder = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const riderId = request.auth.uid;
  const {orderId} = request.data as { orderId: string };
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  let orderRef = db.collection("orders").doc(orderId);
  let orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    orderRef = db.collection("deliveryRequests").doc(orderId);
    orderSnap = await orderRef.get();
  }

  if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

  const order = orderSnap.data()!;

  if (order.riderId !== riderId) {
    throw new HttpsError("permission-denied", "This order was not assigned to you.");
  }

  if (order.riderAccepted) {
    return {success: true, alreadyAccepted: true};
  }

  if (order.status === "delivered" || order.status === "cancelled") {
    throw new HttpsError("failed-precondition", "This order is no longer active.");
  }

  await orderRef.update({
    riderAccepted: true,
    riderAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.info(`[acceptOrder] ✅ Rider ${riderId} accepted order ${orderId}`);
  return {success: true};
});

// ─────────────────────────────────────────
// FUNCTION 19: rejectOrder
// ─────────────────────────────────────────
export const rejectOrder = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const riderId = request.auth.uid;
  const {orderId} = request.data as { orderId: string };
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  let orderRef = db.collection("orders").doc(orderId);
  let orderSnap = await orderRef.get();
  let isDeliveryRequest = false;

  if (!orderSnap.exists) {
    orderRef = db.collection("deliveryRequests").doc(orderId);
    orderSnap = await orderRef.get();
    isDeliveryRequest = true;
  }

  if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found in any collection.");

  const order = orderSnap.data()!;

  if (order.riderId !== riderId) {
    throw new HttpsError("permission-denied", "This order was not assigned to you.");
  }

  if (order.status === "delivered" || order.status === "cancelled") {
    throw new HttpsError("failed-precondition", "This order is no longer active.");
  }

  const rejectedBy: string[] = order.rejectedBy ?? [];
  rejectedBy.push(riderId);

  await db.collection("riders").doc(riderId).update({
    currentOrderId: admin.firestore.FieldValue.delete(),
    currentOrderCollection: admin.firestore.FieldValue.delete(),
    currentDeliveryId: admin.firestore.FieldValue.delete(),
  });

  await orderRef.update({
    status: "finding_rider",
    riderId: admin.firestore.FieldValue.delete(),
    riderName: admin.firestore.FieldValue.delete(),
    riderPhone: admin.firestore.FieldValue.delete(),
    riderPhotoURL: admin.firestore.FieldValue.delete(),
    riderVehicleId: admin.firestore.FieldValue.delete(),
    riderAccepted: false,
    rejectedBy,
  });

  const city: string = order.city ?? order.vendorCity ?? "";
  let ridersQuery = db.collection("riders")
    .where("isOnline", "==", true)
    .where("approved", "==", true)
    .where("status", "==", "active");

  if (city) {
    ridersQuery = ridersQuery.where("city", "==", city) as typeof ridersQuery;
  }

  const ridersSnap = await ridersQuery.limit(30).get();

  const availableRiders = ridersSnap.docs.filter((doc) => {
    const data = doc.data();
    if (rejectedBy.includes(doc.id)) return false;
    if (isDeliveryRequest) return !data.currentDeliveryId;
    return !data.currentOrderId;
  });

  if (availableRiders.length === 0) {
    console.warn(`[rejectOrder] No more riders available for ${orderId}`);
    await orderRef.update({status: "no_rider_found"});
    return {success: true, nextRiderFound: false};
  }

  const nextRider = availableRiders.sort((a, b) =>
    (b.data().stats?.rating ?? 0) - (a.data().stats?.rating ?? 0)
  )[0];

  const nextRiderData = nextRider.data();
  const nextRiderId = nextRider.id;
  const newRiderPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  await orderRef.update({
    status: "rider_assigned",
    riderId: nextRiderId,
    riderName: nextRiderData.fullName ?? `${nextRiderData.firstName} ${nextRiderData.lastName}`,
    riderPhone: nextRiderData.phone ?? "",
    riderPhotoURL: nextRiderData.selfieUrl ?? "",
    riderVehicleId: nextRiderData.vehicleId ?? nextRiderData.vehicleType ?? "",
    riderAccepted: false,
    riderPickupCode: newRiderPickupCode,
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("riders").doc(nextRiderId).update({
    currentOrderId: orderId,
    currentOrderCollection: isDeliveryRequest ? "deliveryRequests" : "orders",
    ...(isDeliveryRequest ? {currentDeliveryId: orderId} : {}),
  });

  const fcmToken: string | undefined = nextRiderData.fcmToken;
  if (fcmToken) {
    try {
      await admin.messaging().send({
        token: fcmToken,
        data: {
          type: "new_order",
          orderId,
          vendorName: order.vendorName ?? "",
          totalAmount: String(order.deliveryFee ?? order.total ?? ""),
          title: "🏍️ New Order!",
          body: `New delivery from ${order.vendorName ?? "a vendor"}. Tap to view.`,
        },
        android: {priority: "high"},
        apns: {payload: {aps: {contentAvailable: true, sound: "default", badge: 1}}},
      });
    } catch (fcmErr) {
      console.error("[rejectOrder] FCM error for next rider:", fcmErr);
    }
  }

  console.info(`[rejectOrder] ✅ Rider ${riderId} rejected. Re-assigned to ${nextRiderId}`);
  return {success: true, nextRiderFound: true};
});

// ─────────────────────────────────────────
// FUNCTION 20: updateOrderStatus
// ─────────────────────────────────────────

export const updateOrderStatus = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const riderId = request.auth.uid;
  const {orderId, newStatus, orderCollection = "orders"} = request.data as {
    orderId: string;
    newStatus: "picked_up" | "arriving" | "delivered";
    orderCollection?: string;
  };

  const ALLOWED_STATUSES = ["picked_up", "arriving", "delivered"];
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new HttpsError("invalid-argument", `Invalid status: ${newStatus}`);
  }

  // Try the provided collection first, then fall back to the other one
  let orderRef = db.collection(orderCollection).doc(orderId);
  let orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    const fallback = orderCollection === "orders" ? "deliveryRequests" : "orders";
    orderRef = db.collection(fallback).doc(orderId);
    orderSnap = await orderRef.get();
  }

  if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

  const order = orderSnap.data()!;

  if (order.riderId !== riderId) {
    throw new HttpsError("permission-denied", "This order was not assigned to you.");
  }

  if (!order.riderAccepted) {
    throw new HttpsError("failed-precondition", "You must accept the order first.");
  }

  const STATUS_ORDER = ["rider_assigned", "picked_up", "arriving", "delivered"];
  const currentIdx = STATUS_ORDER.indexOf(order.status);
  const newIdx = STATUS_ORDER.indexOf(newStatus);

  if (newIdx <= currentIdx) {
    throw new HttpsError(
      "failed-precondition",
      `Cannot transition from ${order.status} to ${newStatus}`
    );
  }

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    [`${newStatus}At`]: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (newStatus === "delivered") {
    updatePayload.deliveredAt = admin.firestore.FieldValue.serverTimestamp();

    const riderRef = db.collection("riders").doc(riderId);
    await db.runTransaction(async (tx) => {
      const riderSnap = await tx.get(riderRef);
      const riderData = riderSnap.data() ?? {};
      const currentDeliveries: number = riderData.stats?.totalDeliveries ?? 0;

      tx.update(riderRef, {
        "currentOrderId": admin.firestore.FieldValue.delete(),
        "currentOrderCollection": admin.firestore.FieldValue.delete(),
        "currentDeliveryId": admin.firestore.FieldValue.delete(),
        "stats.totalDeliveries": currentDeliveries + 1,
      });
      tx.update(orderRef, updatePayload);
    });

    // ── AUTO SPLIT on delivery ──────────────────────────────────────────
    try {
      const orderSnap2 = await orderRef.get();
      const orderData2 = orderSnap2.data()!;

      const alreadyDistributed = orderData2.creditsDistributed === true;

      if (!alreadyDistributed) {
        const storedSplits = orderData2.splitAmounts as {
      vendorAmount: number;
      riderAmount: number;
      platformAmount: number;
    } | undefined;

        const settingsSnap = await db.collection("platformSettings").doc("global").get();
        const settings = settingsSnap.exists ? settingsSnap.data()! : {};
        const riderDeliveryPercent = Number(settings.riderDeliveryPercent ?? 85); // ← keep only this one

        const deliveryFee2 = Math.round((orderData2.deliveryFee ?? 0) * 100) / 100;

        const riderAmount2 = storedSplits?.riderAmount ??
      Math.round(deliveryFee2 * (riderDeliveryPercent / 100) * 100) / 100;

        const now2 = admin.firestore.FieldValue.serverTimestamp();
        const batch2 = db.batch();


        if (riderId && riderAmount2 > 0) {
          // ── Credit riderSplitWallets (new Wallet tab) ──
          const riderSplitWalletRef = db.collection("riderSplitWallets").doc(riderId);
          batch2.set(riderSplitWalletRef, {
            balance: admin.firestore.FieldValue.increment(riderAmount2),
            riderId,
          }, {merge: true});

          const riderSplitTxRef = db.collection("riderSplitWalletTransactions").doc();
          batch2.set(riderSplitTxRef, {
            riderId,
            type: "credit",
            amount: riderAmount2,
            orderId,
            desc: `Delivery split — ${orderData2.orderNumber ?? orderId.slice(-8).toUpperCase()}`,
            source: "wallet_split",
            createdAt: now2,
          });

          // ── Also credit riderWallets (existing Paystack tab — keep this) ──
          const riderWalletRef2 = db.collection("riderWallets").doc(riderId);
          batch2.set(riderWalletRef2, {
            balance: admin.firestore.FieldValue.increment(riderAmount2),
          }, {merge: true});

          const riderTxRef = db.collection("riderWalletTransactions").doc();
          batch2.set(riderTxRef, {
            riderId,
            type: "credit",
            amount: riderAmount2,
            orderId,
            desc: `Delivery fee — ${orderData2.orderNumber ?? orderId.slice(-8).toUpperCase()}`,
            createdAt: now2,
          });
        }


        batch2.update(orderRef, {
          creditsDistributed: true,
          creditsDistributedAt: now2,
        });

        await batch2.commit();
        console.info(`[updateOrderStatus] ✅ Rider credited ₦${riderAmount2} for order ${orderId}`);
      }
    } catch (splitErr) {
      console.error("[updateOrderStatus] Rider credit error (non-fatal):", splitErr);
    }
    await orderRef.update(updatePayload);
  }

  console.info(`[updateOrderStatus] ✅ Order ${orderId} → ${newStatus} by rider ${riderId}`);
  return {success: true, newStatus};
});

// ─────────────────────────────────────────
// FUNCTION 21: assignDeliveryRider
// ─────────────────────────────────────────
export const assignDeliveryRider = onDocumentUpdated(
  "deliveryRequests/{requestId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const requestId = event.params.requestId;

    const justBecameFinding =
      before.status !== "finding_rider" &&
      after.status === "finding_rider";

    if (!justBecameFinding) return;
    if (after.riderId) return;

    console.info(`[assignDeliveryRider] Request ${requestId} → finding_rider`);

    const ridersSnap = await db.collection("riders")
      .where("isOnline", "==", true)
      .where("approved", "==", true)
      .where("status", "==", "active")
      .limit(50)
      .get();

    if (ridersSnap.empty) {
      await event.data!.after.ref.update({status: "no_rider_found"});
      console.warn(`[assignDeliveryRider] No online riders for ${requestId}`);
      return;
    }

    const pickupLat: number = after.pickupLat ?? 6.5244;
    const pickupLng: number = after.pickupLng ?? 3.3792;

    const scored = ridersSnap.docs.map((d) => {
      const rd = d.data();
      const rLat = rd.lastLat ?? rd.lat ?? pickupLat;
      const rLng = rd.lastLng ?? rd.lng ?? pickupLng;
      const dLat = ((rLat - pickupLat) * Math.PI) / 180;
      const dLng = ((rLng - pickupLng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((pickupLat * Math.PI) / 180) *
        Math.cos((rLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return {doc: d, rating: rd.stats?.rating ?? 0, distKm};
    });

    scored.sort((a, b) => {
      if (a.distKm < 15 && b.distKm < 15) return b.rating - a.rating;
      return a.distKm - b.distKm;
    });

    const best = scored.find((s) => !s.doc.data().currentDeliveryId);

    if (!best) {
      await event.data!.after.ref.update({status: "no_rider_found"});
      console.warn(`[assignDeliveryRider] All riders busy for ${requestId}`);
      return;
    }

    const riderData = best.doc.data();
    const riderId = best.doc.id;
    const etaMinutes = Math.round((best.distKm / 30) * 60) + 3;
    const riderPickupCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    await event.data!.after.ref.update({
      status: "rider_assigned",
      riderId,
      riderName: riderData.fullName ?? `${riderData.firstName ?? ""} ${riderData.lastName ?? ""}`.trim(),
      riderPhone: riderData.phone ?? "",
      riderPhotoURL: riderData.selfieUrl ?? "",
      riderPickupCode,
      estimatedMinutes: etaMinutes,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection("riders").doc(riderId).update({
      currentDeliveryId: requestId,
      currentOrderId: requestId,
      currentOrderCollection: "deliveryRequests",
    });

    const fcmToken: string | undefined = riderData.fcmToken;
    if (fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: "📦 New Delivery Request!",
            body: `Pickup at ${after.pickupAddress ?? "your area"}. ₦${(after.deliveryFee ?? 0).toLocaleString("en-NG")} delivery fee.`,
          },
          data: {
            type: "new_delivery_request",
            requestId,
            pickupAddress: after.pickupAddress ?? "",
            deliveryFee: String(after.deliveryFee ?? 0),
          },
          android: {priority: "high"},
          apns: {payload: {aps: {contentAvailable: true, sound: "default", badge: 1}}},
        });
      } catch (e) {
        console.error("[assignDeliveryRider] Rider FCM error:", e);
      }
    }

    if (after.userId) {
      try {
        const userSnap = await db.collection("users").doc(after.userId).get();
        const userToken: string | undefined = userSnap.data()?.fcmToken;
        if (userToken) {
          await admin.messaging().send({
            token: userToken,
            notification: {
              title: "🏍️ Rider Assigned!",
              body: `${riderData.fullName ?? "Your rider"} is on the way. ETA ~${etaMinutes} minutes.`,
            },
            data: {type: "delivery_rider_assigned", requestId},
            android: {priority: "high"},
            apns: {payload: {aps: {contentAvailable: true, sound: "default"}}},
          });
        }
      } catch (e) {
        console.warn("[assignDeliveryRider] Customer FCM error:", e);
      }
    }

    console.info(`[assignDeliveryRider] ✅ Assigned rider ${riderId} to ${requestId}`);
  }
);

// ─────────────────────────────────────────
// FUNCTION 22: onDeliveryRequestCreated
// ─────────────────────────────────────────
export const onDeliveryRequestCreated = onDocumentCreated(
  {
    document: "deliveryRequests/{requestId}",
    secrets: ["RESEND_API_KEY"],
  },
  async (event) => {
    const data = event.data?.data();
    const requestId = event.params.requestId;
    if (!data) return;

    console.info(`[onDeliveryRequestCreated] New request ${requestId} — type: ${data.type}`);

    const customerEmail: string | undefined = data.customerEmail;
    if (customerEmail) {
      try {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey) {
          const isPickup = data.type === "pickup";
          const orderNum = data.orderNumber ?? requestId.slice(-8).toUpperCase();
          const total = (data.total ?? 0).toLocaleString("en-NG");
          const name = data.customerName ?? "there";

          // ── UPDATED email HTML (Edit 1) ────────────────────────────────
          const emailHtml = buildDeliveryConfirmationEmail({
            name,
            orderNum,
            isPickup,
            total,
            customerEmail,
            data,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {"Content-Type": "application/json", "Authorization": `Bearer ${resendApiKey}`},
            body: JSON.stringify({
              from: "Swift9ja <noreply@verapixels.com>",
              to: [customerEmail],
              subject: `✅ Order Confirmed — #${orderNum} | Swift9ja`,
              html: emailHtml,
            }),
          });
          console.info(`[onDeliveryRequestCreated] Email sent to ${customerEmail}`);
        }
      } catch (emailErr) {
        console.error("[onDeliveryRequestCreated] Email error:", emailErr);
      }
    }

    if (data.userId) {
      try {
        const userSnap = await db.collection("users").doc(data.userId).get();
        const userToken: string | undefined = userSnap.data()?.fcmToken;
        if (userToken) {
          await admin.messaging().send({
            token: userToken,
            notification: {
              title: "🎉 Order Confirmed!",
              body: `Order #${data.orderNumber ?? requestId.slice(-8)} placed. Finding your rider now…`,
            },
            data: {type: "delivery_confirmed", requestId},
            android: {priority: "high"},
            apns: {payload: {aps: {contentAvailable: true, sound: "default"}}},
          });
        }
      } catch (e) {
        console.warn("[onDeliveryRequestCreated] Customer FCM error:", e);
      }
    }

    if (data.status === "finding_rider") {
      const ridersSnap = await db.collection("riders")
        .where("isOnline", "==", true)
        .where("approved", "==", true)
        .where("status", "==", "active")
        .limit(50)
        .get();

      if (ridersSnap.empty) {
        await event.data!.ref.update({status: "no_rider_found"});
        return;
      }

      const pickupLat: number = data.pickupLat ?? 6.5244;
      const pickupLng: number = data.pickupLng ?? 3.3792;

      const scored = ridersSnap.docs.map((d) => {
        const rd = d.data();
        const rLat = rd.lastLat ?? rd.lat ?? pickupLat;
        const rLng = rd.lastLng ?? rd.lng ?? pickupLng;
        const dLat = ((rLat - pickupLat) * Math.PI) / 180;
        const dLng = ((rLng - pickupLng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((pickupLat * Math.PI) / 180) *
          Math.cos((rLat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return {doc: d, rating: rd.stats?.rating ?? 0, distKm};
      });

      scored.sort((a, b) => {
        if (a.distKm < 15 && b.distKm < 15) return b.rating - a.rating;
        return a.distKm - b.distKm;
      });

      const best = scored.find((s) => !s.doc.data().currentDeliveryId);

      if (!best) {
        await event.data!.ref.update({status: "no_rider_found"});
        return;
      }

      const riderData = best.doc.data();
      const riderId = best.doc.id;
      const etaMins = Math.round((best.distKm / 30) * 60) + 3;
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();

      await event.data!.ref.update({
        status: "rider_assigned",
        riderId,
        riderName: riderData.fullName ?? `${riderData.firstName ?? ""} ${riderData.lastName ?? ""}`.trim(),
        riderPhone: riderData.phone ?? "",
        riderPhotoURL: riderData.selfieUrl ?? "",
        riderPickupCode: code,
        estimatedMinutes: etaMins,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("riders").doc(riderId).update({
        currentDeliveryId: requestId,
        currentOrderId: requestId,
        currentOrderCollection: "deliveryRequests",
      });

      const fcmToken: string | undefined = riderData.fcmToken;
      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: "📦 New Delivery Request!",
              body: `Pickup at ${data.pickupAddress ?? "your area"}. ₦${(data.deliveryFee ?? 0).toLocaleString("en-NG")} delivery fee.`,
            },
            data: {
              type: "new_delivery_request",
              requestId,
              pickupAddress: data.pickupAddress ?? "",
              deliveryFee: String(data.deliveryFee ?? 0),
            },
            android: {priority: "high"},
            apns: {payload: {aps: {contentAvailable: true, sound: "default", badge: 1}}},
          });
        } catch (e) {
          console.error("[onDeliveryRequestCreated] Rider FCM error:", e);
        }
      }

      console.info(`[onDeliveryRequestCreated] ✅ Rider ${riderId} assigned to ${requestId}`);
    }
  }
);

// ─────────────────────────────────────────
// FUNCTION 23: updateDeliveryStatus
// ─────────────────────────────────────────
export const updateDeliveryStatus = onCall({cors: CORS_ORIGINS}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

  const riderId = request.auth.uid;
  const {requestId, newStatus} = request.data as {
    requestId: string;
    newStatus: "picked_up" | "arriving" | "delivered";
  };

  const ALLOWED = ["picked_up", "arriving", "delivered"];
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
  if (!ALLOWED.includes(newStatus)) throw new HttpsError("invalid-argument", `Invalid status: ${newStatus}`);

  const ref = db.collection("deliveryRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Delivery request not found.");

  const data = snap.data()!;
  if (data.riderId !== riderId) throw new HttpsError("permission-denied", "Not assigned to you.");

  const ORDER = ["rider_assigned", "picked_up", "arriving", "delivered"];
  const curIdx = ORDER.indexOf(data.status);
  const newIdx = ORDER.indexOf(newStatus);
  if (newIdx <= curIdx) throw new HttpsError("failed-precondition", `Cannot go from ${data.status} to ${newStatus}`);

  const update: Record<string, unknown> = {
    status: newStatus,
    [`${newStatus}At`]: admin.firestore.FieldValue.serverTimestamp(),
  };

  // ── EDIT 2: also clear currentOrderId and currentOrderCollection ──────
  if (newStatus === "delivered") {
    await db.collection("riders").doc(riderId).update({
      "currentDeliveryId": admin.firestore.FieldValue.delete(),
      "currentOrderId": admin.firestore.FieldValue.delete(),
      "currentOrderCollection": admin.firestore.FieldValue.delete(),
      "stats.totalDeliveries": admin.firestore.FieldValue.increment(1),
    });
  }

  await ref.update(update);

  if (data.userId) {
    try {
      const userSnap = await db.collection("users").doc(data.userId).get();
      const userToken: string | undefined = userSnap.data()?.fcmToken;
      if (userToken) {
        const msgs: Record<string, {title: string; body: string}> = {
          picked_up: {title: "📦 Package Picked Up!", body: `${data.riderName ?? "Your rider"} has collected your package and is heading to the destination.`},
          arriving: {title: "🏍️ Almost There!", body: "Your rider is arriving at the destination now. Please be ready."},
          delivered: {title: "✅ Delivered!", body: "Your package has been delivered successfully! Thank you for using Swift9ja."},
        };
        const msg = msgs[newStatus];
        if (msg) {
          await admin.messaging().send({
            token: userToken,
            notification: msg,
            data: {type: `delivery_${newStatus}`, requestId},
            android: {priority: "high"},
            apns: {payload: {aps: {contentAvailable: true, sound: "default"}}},
          });
        }
      }
    } catch (e) {
      console.warn("[updateDeliveryStatus] Customer FCM error:", e);
    }
  }

  console.info(`[updateDeliveryStatus] ✅ Request ${requestId} → ${newStatus} by rider ${riderId}`);
  return {success: true, newStatus};
});

// ─── Email builder helpers ─────────────────────────────────────────────────
const BRAND_COLOR = "#FF6B00";
const APP_URL = process.env.APP_URL || "https://swift9ja.com";

const SOCIAL_ICONS = `
<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr>
    <td style="padding:0 6px;">
      <a href="https://instagram.com/swiftnija" style="text-decoration:none;">
        <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="28" height="28" alt="Instagram" style="border-radius:6px;display:block;" />
      </a>
    </td>
    <td style="padding:0 6px;">
      <a href="https://tiktok.com/@swiftnija" style="text-decoration:none;">
        <img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" width="28" height="28" alt="TikTok" style="border-radius:6px;display:block;" />
      </a>
    </td>
    <td style="padding:0 6px;">
      <a href="https://x.com/swiftnija" style="text-decoration:none;">
        <img src="https://cdn-icons-png.flaticon.com/512/5968/5968830.png" width="28" height="28" alt="X (Twitter)" style="border-radius:6px;display:block;" />
      </a>
    </td>
    <td style="padding:0 6px;">
      <a href="https://wa.me/2348000000000" style="text-decoration:none;">
        <img src="https://cdn-icons-png.flaticon.com/512/220/220236.png" width="28" height="28" alt="WhatsApp" style="border-radius:6px;display:block;" />
      </a>
    </td>
  </tr>
</table>`;

function emailWrapper(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>SwiftNija</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body,html{margin:0;padding:0;width:100%;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
    img{border:0;outline:none;text-decoration:none;display:block;}
    a{color:${BRAND_COLOR};text-decoration:none;}
    @media only screen and (max-width:600px){
      .email-container{width:100%!important;}
      .stack-col{display:block!important;width:100%!important;}
      .hide-mobile{display:none!important;}
      .pad-mobile{padding:24px 16px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f0f5;">
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</span>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table class="email-container" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailHeader(subtitle: string): string {
  return `
  <tr>
    <td style="background:linear-gradient(135deg,#FF6B00 0%,#FF8C00 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td>
            <p style="margin:0;font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              Swift<span style="opacity:0.75;">Nija</span>
            </p>
            <p style="margin:8px 0 0;font-size:12px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase;">${subtitle}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function emailFooter(): string {
  return `
  <tr>
    <td style="background:#ffffff;border-top:1px solid #e8e8f0;padding:28px 40px;border-radius:0 0 16px 16px;text-align:center;">
      <p style="margin:0 0 16px;font-size:13px;color:#9898b8;font-weight:500;">Follow us</p>
      ${SOCIAL_ICONS}
      <p style="margin:20px 0 6px;font-size:12px;color:#b0b0c8;line-height:1.7;">
        © ${new Date().getFullYear()} Swift9ja · Nigeria's Fast Delivery Platform
      </p>
      <p style="margin:0;font-size:12px;color:#c8c8d8;">
        Questions? <a href="mailto:support@swift9ja.com
" style="color:${BRAND_COLOR};font-weight:600;">support@swift9ja.com</a>
      </p>
    </td>
  </tr>`;
}

function receiptRow(label: string, value: string, highlight = false): string {
  return `
  <tr>
    <td style="padding:11px 0;border-bottom:1px solid #f0f0f5;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#888899;font-weight:500;">${label}</td>
          <td style="font-size:${highlight ? "16" : "13"}px;color:${highlight ? BRAND_COLOR : "#111118"};font-weight:${highlight ? "800" : "600"};text-align:right;">${value}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────
// NEW: buildDeliveryConfirmationEmail
// Used by onDeliveryRequestCreated (Edit 1)
// ─────────────────────────────────────────
function buildDeliveryConfirmationEmail(opts: {
  name: string;
  orderNum: string;
  isPickup: boolean;
  total: string;
  customerEmail: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}): string {
  const {name, orderNum, isPickup, total, customerEmail, data} = opts;
  const steps = [
    "We're finding you the best available rider right now.",
    "You'll receive a notification when a rider is assigned (usually 2–10 minutes).",
    isPickup ?
      "Your rider will come to your location to collect the package." :
      "Your rider will pick up the package and head to the drop-off address.",
    "You'll receive live updates at every stage of your delivery.",
  ];

  const bodyContent = `
  ${emailHeader(isPickup ? "Pickup Scheduled" : "Delivery Confirmed")}
  <tr>
    <td style="padding:32px 40px 0;text-align:center;" class="pad-mobile">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr>
          <td style="width:64px;height:64px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:50%;text-align:center;vertical-align:middle;">
            <p style="margin:0;font-size:28px;line-height:64px;">✅</p>
          </td>
        </tr>
      </table>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#111118;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Order Placed Successfully!</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#666680;line-height:1.7;">
        Hi <strong style="color:#111118;">${name}</strong>, your payment has been received and we're finding you a rider.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px 28px;" class="pad-mobile">

      <!-- Order reference card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1.5px solid #ebebf8;border-radius:12px;padding:4px 20px;margin-bottom:24px;">
        <tbody>
          <tr>
            <td style="padding:14px 0 10px;border-bottom:1px solid #f0f0f5;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">Order Reference</p>
              <p style="margin:6px 0 0;font-size:24px;font-weight:900;color:${BRAND_COLOR};letter-spacing:-0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">#${orderNum}</p>
            </td>
          </tr>
          ${receiptRow("Service Type", isPickup ? "Schedule Pickup" : `Send Package (${data.packageSize === "small" ? "Bike" : "Car/Van"})`)}
          ${receiptRow("Pickup Address", data.pickupAddress ?? "—")}
          ${!isPickup ? receiptRow("Drop-off Address", data.dropoffAddress ?? "—") : ""}
          ${!isPickup ? receiptRow("Distance", `${(data.distanceKm ?? 0).toFixed(1)} km`) : ""}
          ${receiptRow("Payment Method", data.paymentMethod ?? "—")}
          ${receiptRow("Total Paid", `₦${total}`, true)}
        </tbody>
      </table>

           ${data.customerPickupCode ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="background:rgba(139,92,246,0.08);border:1.5px solid rgba(139,92,246,0.3);border-radius:12px;padding:20px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#8B5CF6;text-transform:uppercase;letter-spacing:1.5px;">Your Delivery Code</p>
            <p style="margin:0;font-size:36px;font-weight:900;color:#8B5CF6;letter-spacing:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${data.customerPickupCode}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#888899;font-weight:500;">Show this to your rider on arrival to confirm delivery</p>
          </td>
        </tr>
      </table>` : ""}

      <!-- What happens next -->
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">What Happens Next</p>
        ${steps.map((step, i) => `
        <tr>
          <td style="padding:8px 0;vertical-align:top;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="width:28px;height:28px;background:${BRAND_COLOR};border-radius:50%;text-align:center;vertical-align:middle;font-size:12px;font-weight:800;color:#ffffff;min-width:28px;">${i + 1}</td>
              <td style="padding-left:12px;font-size:14px;color:#374151;line-height:1.6;">${step}</td>
            </tr></table>
          </td>
        </tr>`).join("")}
      </table>

      <!-- Support line -->
      <p style="margin:0;font-size:13px;color:#9898b8;text-align:center;">
        Need help? <a href="mailto:support@swift9ja.com" style="color:${BRAND_COLOR};font-weight:600;text-decoration:none;">support@swift9ja.com</a>
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:#b0b0c8;text-align:center;">This email was sent to <strong>${customerEmail}</strong></p>
    </td>
  </tr>
  ${emailFooter()}`;

  return emailWrapper(bodyContent, `Order #${orderNum} confirmed! Finding your rider now.`);
}

// ─────────────────────────────────────────
// FUNCTION 24: sendStatusEmail (internal helper)
// ─────────────────────────────────────────
async function sendStatusEmail(opts: {
  to: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  type: "rider_assigned" | "picked_up" | "delivered";
  riderName?: string;
  riderPhone?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  total?: number;
  isDeliveryRequest?: boolean;
  customerPickupCode?: string;
}): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const trackingUrl = `${APP_URL}/orders/${opts.orderId}/track`;
  const name = opts.customerName || "there";
  const orderRef = `#${opts.orderNumber}`;

  let subject = "";
  let previewText = "";
  let bodyContent = "";

  if (opts.type === "rider_assigned") {
    subject = `Rider Found — Order ${orderRef} | Swift9ja`;
    previewText = `Great news! Your rider ${opts.riderName ?? ""} has been assigned to your order.`;

    bodyContent = `
    ${emailHeader("Rider Assigned")}
    <tr>
      <td style="background:#ffffff;padding:40px 40px 28px;" class="pad-mobile">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;border-bottom:2px solid #f0f0f5;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#9898b8;text-transform:uppercase;letter-spacing:1px;">Order</p>
              <p style="margin:0;font-size:28px;font-weight:900;color:${BRAND_COLOR};letter-spacing:-0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${orderRef}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 20px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111118;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Your rider is on the way</p>
              <p style="margin:0;font-size:15px;color:#666680;line-height:1.7;">Hi <strong style="color:#111118;">${name}</strong>, we have assigned a rider to your order and they are heading to the pickup location now.</p>
            </td>
          </tr>
        </table>

        <!-- Rider card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1.5px solid #ebebf8;border-radius:12px;overflow:hidden;margin-bottom:28px;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">Your Rider</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:48px;vertical-align:middle;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:48px;height:48px;background:linear-gradient(135deg,${BRAND_COLOR},#FF9A00);border-radius:12px;text-align:center;vertical-align:middle;">
                          <p style="margin:0;font-size:22px;color:white;">🏍</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <p style="margin:0;font-size:16px;font-weight:800;color:#111118;">${opts.riderName ?? "Your Rider"}</p>
                    ${opts.riderPhone ? `<p style="margin:4px 0 0;font-size:13px;color:#9898b8;font-weight:500;">${opts.riderPhone}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Receipt -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td>
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">Order Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1.5px solid #ebebf8;border-radius:12px;padding:4px 20px;">
              <tbody>
                ${opts.pickupAddress ? receiptRow("Pickup", opts.pickupAddress) : ""}
                ${opts.dropoffAddress && !opts.isDeliveryRequest ? receiptRow("Delivery Address", opts.dropoffAddress) : ""}
                ${opts.total ? receiptRow("Total Paid", `₦${opts.total.toLocaleString("en-NG")}`, true) : ""}
              </tbody>
            </table>
          </td></tr>
        </table>

   <!-- Track button -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_COLOR},#FF9A00);color:#ffffff;font-size:15px;font-weight:800;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Track Your Order
              </a>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:8px 0 0;font-size:12px;color:#b0b0c8;">Or copy this link: <a href="${trackingUrl}" style="color:${BRAND_COLOR};font-weight:600;">${trackingUrl}</a></p>
            </td>
          </tr>
        </table>

        ${opts.customerPickupCode ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          <tr>
            <td style="background:rgba(139,92,246,0.08);border:1.5px solid rgba(139,92,246,0.3);border-radius:12px;padding:20px;text-align:center;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#8B5CF6;text-transform:uppercase;letter-spacing:1.5px;">Your Delivery Code</p>
              <p style="margin:0;font-size:36px;font-weight:900;color:#8B5CF6;letter-spacing:10px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${opts.customerPickupCode}</p>
              <p style="margin:8px 0 0;font-size:12px;color:#888899;font-weight:500;">Show this to your rider on arrival to confirm delivery</p>
            </td>
          </tr>
        </table>` : ""}

      </td>
    </tr>
    ${emailFooter()}`;
  } else if (opts.type === "picked_up") {
    subject = `Package Picked Up — Order ${orderRef} | Swift9ja`;
    previewText = `Your package is on its way! ${opts.riderName ?? "Your rider"} has collected it.`;

    bodyContent = `
    ${emailHeader("Package Picked Up")}
    <tr>
      <td style="background:#ffffff;padding:40px 40px 28px;" class="pad-mobile">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;border-bottom:2px solid #f0f0f5;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#9898b8;text-transform:uppercase;letter-spacing:1px;">Order</p>
              <p style="margin:0;font-size:28px;font-weight:900;color:${BRAND_COLOR};letter-spacing:-0.5px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${orderRef}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 20px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111118;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Package is on its way</p>
              <p style="margin:0;font-size:15px;color:#666680;line-height:1.7;">Hi <strong style="color:#111118;">${name}</strong>, your package has been collected and your rider is heading to the delivery address.</p>
            </td>
          </tr>
        </table>

        <!-- Progress bar -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1.5px solid #ebebf8;border-radius:12px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">Delivery Progress</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${["Order Confirmed", "Rider Assigned", "Package Picked Up", "Out for Delivery", "Delivered"].map((step, i) => {
    const done = i < 3;
    const current = i === 2;
    return `
                        <tr>
                          <td style="padding:6px 0;vertical-align:middle;">
                            <table cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="width:28px;height:28px;border-radius:50%;background:${done || current ? BRAND_COLOR : "#e8e8f0"};text-align:center;vertical-align:middle;font-size:${done ? "14" : "12"}px;color:white;font-weight:800;">${done && !current ? "✓" : String(i + 1)}</td>
                                <td style="padding-left:12px;font-size:14px;font-weight:${current ? "800" : "500"};color:${current ? "#111118" : done ? "#666680" : "#b0b0c8"};">${step}${current ? " — In Progress" : ""}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>`;
  }).join("")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Track button -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_COLOR},#FF9A00);color:#ffffff;font-size:15px;font-weight:800;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Track Live
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${emailFooter()}`;
  } else if (opts.type === "delivered") {
    subject = `Delivered! Order ${orderRef} | Swift9ja`;
    previewText = "Your order has been delivered successfully. Thank you for using Swift9ja!";

    bodyContent = `
    ${emailHeader("Delivered")}
    <tr>
      <td style="background:#ffffff;padding:40px 40px 28px;" class="pad-mobile">
        <!-- Delivery confirmation hero -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td align="center" style="padding:32px 0;background:linear-gradient(135deg,#f0fdf8,#e8faf2);border-radius:12px;border:1.5px solid #d0f0e0;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="width:72px;height:72px;border-radius:50%;background:#10B981;text-align:center;vertical-align:middle;">
                    <p style="margin:0;font-size:36px;color:white;line-height:72px;">✓</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:24px;font-weight:900;color:#059669;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Delivered!</p>
              <p style="margin:0;font-size:14px;color:#6b9080;font-weight:500;">Order ${orderRef} completed successfully</p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;font-size:15px;color:#666680;line-height:1.7;">Hi <strong style="color:#111118;">${name}</strong>, your order has been delivered. We hope everything arrived in perfect condition!</p>

        <!-- Receipt -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf9ff;border:1.5px solid #ebebf8;border-radius:12px;padding:4px 20px;margin-bottom:28px;">
          <tbody>
            <tr>
              <td style="padding:14px 0 10px;border-bottom:1px solid #f0f0f5;">
                <p style="margin:0;font-size:11px;font-weight:700;color:#9898b8;text-transform:uppercase;letter-spacing:1.5px;">Receipt Summary</p>
              </td>
            </tr>
            ${opts.pickupAddress ? receiptRow("From", opts.pickupAddress) : ""}
            ${opts.dropoffAddress ? receiptRow("To", opts.dropoffAddress) : ""}
            ${opts.riderName ? receiptRow("Rider", opts.riderName) : ""}
            ${opts.total ? receiptRow("Total Paid", `₦${opts.total.toLocaleString("en-NG")}`, true) : ""}
          </tbody>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
          <tr>
            <td align="center">
              <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_COLOR},#FF9A00);color:#ffffff;font-size:15px;font-weight:800;padding:16px 48px;border-radius:12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Order Again
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#b0b0c8;text-align:center;">Thank you for using SwiftNija!</p>
      </td>
    </tr>
    ${emailFooter()}`;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "SwiftNija <noreply@verapixels.com>",
      to: [opts.to],
      subject,
      html: emailWrapper(bodyContent, previewText),
    }),
  });
}

// ─────────────────────────────────────────
// FUNCTION 25: onOrderStatusChanged
// ─────────────────────────────────────────
export const onOrderStatusChanged = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    secrets: ["RESEND_API_KEY"],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const orderId = event.params.orderId;
    const customerEmail: string | undefined = after.customerEmail;
    if (!customerEmail) return;

    const orderNumber = (after.orderId ?? orderId).slice(-8).toUpperCase();
    const customerName = after.customerName ?? "there";

    if (before.status !== "rider_assigned" && after.status === "rider_assigned") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId: orderId, // ← CORRECT
          orderNumber,
          type: "rider_assigned",
          riderName: after.riderName,
          riderPhone: after.riderPhone,
          pickupAddress: after.vendorName ?? after.deliveryAddress, // marketplace order uses vendorName
          dropoffAddress: after.deliveryAddress,
          total: after.total,
          // no customerPickupCode here — marketplace orders don't use it
        });
        console.info(`[onOrderStatusChanged] rider_assigned email sent for ${orderId}`);
      } catch (e) {
        console.error("[onOrderStatusChanged] rider_assigned email error:", e);
      }
    }

    // Picked up
    if (before.status !== "picked_up" && after.status === "picked_up") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId,
          orderNumber,
          type: "picked_up",
          riderName: after.riderName,
          pickupAddress: after.vendorName,
          dropoffAddress: after.deliveryAddress,
          total: after.total,
        });
        console.info(`[onOrderStatusChanged] picked_up email sent for ${orderId}`);
      } catch (e) {
        console.error("[onOrderStatusChanged] picked_up email error:", e);
      }
    }

    // Delivered
    if (before.status !== "delivered" && after.status === "delivered") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId,
          orderNumber,
          type: "delivered",
          riderName: after.riderName,
          pickupAddress: after.vendorName ?? after.pickupAddress,
          dropoffAddress: after.deliveryAddress,
          total: after.total,
        });
        console.info(`[onOrderStatusChanged] delivered email sent for ${orderId}`);
      } catch (e) {
        console.error("[onOrderStatusChanged] delivered email error:", e);
      }
    }
  }
);

// ─────────────────────────────────────────
// FUNCTION 26: onDeliveryStatusChanged
// Same trigger for deliveryRequests collection
// ─────────────────────────────────────────
export const onDeliveryStatusChanged = onDocumentUpdated(
  {
    document: "deliveryRequests/{requestId}",
    secrets: ["RESEND_API_KEY"],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const requestId = event.params.requestId;
    const customerEmail: string | undefined = after.customerEmail;
    if (!customerEmail) return;

    const orderNumber = (after.orderNumber ?? requestId).slice(-8).toUpperCase();
    const customerName = after.customerName ?? "there";

    if (before.status !== "rider_assigned" && after.status === "rider_assigned") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId: requestId,
          orderNumber,
          type: "rider_assigned",
          riderName: after.riderName,
          riderPhone: after.riderPhone,
          pickupAddress: after.pickupAddress,
          dropoffAddress: after.dropoffAddress,
          total: after.total,
          isDeliveryRequest: true,
        });
      } catch (e) {
        console.error("[onDeliveryStatusChanged] rider_assigned email error:", e);
      }
    }

    if (before.status !== "picked_up" && after.status === "picked_up") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId: requestId,
          orderNumber,
          type: "picked_up",
          riderName: after.riderName,
          pickupAddress: after.pickupAddress,
          dropoffAddress: after.dropoffAddress,
          total: after.total,
          isDeliveryRequest: true,
        });
      } catch (e) {
        console.error("[onDeliveryStatusChanged] picked_up email error:", e);
      }
    }

    if (before.status !== "delivered" && after.status === "delivered") {
      try {
        await sendStatusEmail({
          to: customerEmail,
          customerName,
          orderId: requestId,
          orderNumber,
          type: "delivered",
          riderName: after.riderName,
          pickupAddress: after.pickupAddress,
          dropoffAddress: after.dropoffAddress,
          total: after.total,
          isDeliveryRequest: true,
        });
      } catch (e) {
        console.error("[onDeliveryStatusChanged] delivered email error:", e);
      }
    }
  }
);

// ─────────────────────────────────────────
// FUNCTION 27: reassignStuckOrders
// Runs every 2 minutes — finds orders stuck in "rider_assigned" with
// riderAccepted: false for >2 minutes, frees the stuck rider, and
// assigns the next best available rider.
// ─────────────────────────────────────────
export const reassignStuckOrders = onSchedule("every 2 minutes", async () => {
  const now = admin.firestore.Timestamp.now();
  const twoMinsAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 2 * 60 * 1000);

  for (const collectionName of ["orders", "deliveryRequests"]) {
    const stuckSnap = await db.collection(collectionName)
      .where("status", "==", "rider_assigned")
      .where("riderAccepted", "==", false)
      .where("assignedAt", "<", twoMinsAgo)
      .limit(10)
      .get();

    for (const stuckDoc of stuckSnap.docs) {
      const data = stuckDoc.data();
      const riderId = data.riderId;

      console.info(`[reassignStuckOrders] Stuck order ${stuckDoc.id} in ${collectionName} — reassigning`);

      // Free the stuck rider
      if (riderId) {
        try {
          await db.collection("riders").doc(riderId).update({
            currentOrderId: admin.firestore.FieldValue.delete(),
            currentOrderCollection: admin.firestore.FieldValue.delete(),
            currentDeliveryId: admin.firestore.FieldValue.delete(),
          });
        } catch (e) {
          console.warn(`[reassignStuckOrders] Could not free rider ${riderId}:`, e);
        }
      }

      const rejectedBy: string[] = data.rejectedBy ?? [];
      if (riderId && !rejectedBy.includes(riderId)) rejectedBy.push(riderId);

      // Find next available rider
      const ridersSnap = await db.collection("riders")
        .where("isOnline", "==", true)
        .where("approved", "==", true)
        .where("status", "==", "active")
        .limit(30)
        .get();

      const available = ridersSnap.docs.filter((d) =>
        !rejectedBy.includes(d.id) &&
        !d.data().currentOrderId &&
        !d.data().currentDeliveryId
      );

      if (available.length === 0) {
        await stuckDoc.ref.update({status: "no_rider_found", rejectedBy});
        continue;
      }

      const next = available.sort((a, b) =>
        (b.data().stats?.rating ?? 0) - (a.data().stats?.rating ?? 0)
      )[0];

      const nextData = next.data();
      const nextId = next.id;
      const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();

      await stuckDoc.ref.update({
        status: "rider_assigned",
        riderId: nextId,
        riderName: nextData.fullName ?? `${nextData.firstName ?? ""} ${nextData.lastName ?? ""}`.trim(),
        riderPhone: nextData.phone ?? "",
        riderPhotoURL: nextData.selfieUrl ?? "",
        riderAccepted: false,
        riderPickupCode: newCode,
        rejectedBy,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("riders").doc(nextId).update({
        currentOrderId: stuckDoc.id,
        currentOrderCollection: collectionName,
        ...(collectionName === "deliveryRequests" ? {currentDeliveryId: stuckDoc.id} : {}),
      });

      // Notify next rider via FCM
      const fcmToken: string | undefined = nextData.fcmToken;
      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            data: {
              type: "new_order",
              orderId: stuckDoc.id,
              vendorName: data.vendorName ?? data.pickupAddress ?? "",
              totalAmount: String(data.deliveryFee ?? data.total ?? ""),
              title: "🏍️ New Order!",
              body: "New delivery available. Tap to view.",
            },
            android: {priority: "high"},
            apns: {payload: {aps: {contentAvailable: true, sound: "default", badge: 1}}},
          });
        } catch (e) {
          console.warn("[reassignStuckOrders] FCM error:", e);
        }
      }

      console.info(`[reassignStuckOrders] ✅ Reassigned ${stuckDoc.id} to ${nextId}`);
    }
  }
});

export * from "./vendorPayouts";
export * from "./riderPayouts";
export * from "./adminPayouts";
export * from "./paystackDVA";
