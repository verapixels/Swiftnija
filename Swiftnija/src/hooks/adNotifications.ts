// ─────────────────────────────────────────────────────────────────────────────
// adNotifications.ts — place at: src/utils/adNotifications.ts
//
// Call checkExpiringAds() once when the vendor dashboard mounts.
// It finds ads expiring in ≤2 days that haven't been notified yet, then:
//   1. Writes a Firestore notification doc  →  shows in-app bell
//   2. Writes a Firestore "emailQueue" doc  →  your Cloud Function / 
//      Firebase Extension picks it up and sends the email
//   3. Marks the ad as notifiedExpiry:true so it never fires twice
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, getDocs, query, where, doc,
  writeBatch, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import type { AdPromotion } from "../../adTypes";
import { getDaysLeft } from "../../adTypes";

// ─── Check & notify expiring ads for the current vendor ──────────────────────
export async function checkExpiringAds(vendorId: string, vendorEmail: string): Promise<void> {
  if (!vendorId || !vendorEmail) return;

  const now = new Date().toISOString();

  // Fetch active ads that haven't sent an expiry notification yet
  let snap;
  try {
    snap = await getDocs(
      query(
        collection(db, "adPromotions"),
        where("vendorId", "==", vendorId),
        where("status", "in", ["active", "expiring_soon"]),
        where("notifiedExpiry", "==", false)
      )
    );
  } catch (e) {
    console.warn("checkExpiringAds query failed:", e);
    return;
  }

  const toNotify: AdPromotion[] = [];
  snap.forEach(d => {
    const a = { id: d.id, ...d.data() } as AdPromotion;
    if (a.endDate > now && getDaysLeft(a.endDate) <= 2) {
      toNotify.push(a);
    }
  });

  if (toNotify.length === 0) return;

  const batch = writeBatch(db);

  for (const ad of toNotify) {
    const dLeft   = getDaysLeft(ad.endDate);
    const timeStr = dLeft === 1 ? "tomorrow" : `in ${dLeft} days`;

    // ── 1. In-app notification ────────────────────────────────────────────
    const notifRef = doc(collection(db, "notifications"));
    batch.set(notifRef, {
      userId:    vendorId,
      type:      "ad_expiring",
      title:     "Your ad is expiring soon",
      body:      `Your "${ad.label}" ad expires ${timeStr}. Renew now to keep your products visible.`,
      adId:      ad.id,
      adType:    ad.type,
      adLabel:   ad.label,
      daysLeft:  dLeft,
      read:      false,
      createdAt: serverTimestamp(),
    });

    // ── 2. Email queue doc (picked up by Cloud Function / Extension) ──────
    const emailRef = doc(collection(db, "emailQueue"));
    batch.set(emailRef, {
      to:        vendorEmail,
      subject:   `⚡ Your Swift9ja ad expires ${timeStr}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#0a0a10;color:#e8e8f4;border-radius:16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
            <img src="https://yourapp.com/SWIFTNIJAS_LOGO_ICON-removebg-preview.png" width="36" height="36" style="object-fit:contain;" alt="Swift9ja"/>
            <span style="font-size:18px;font-weight:900;color:#FF6B00;">Swift<span style="font-style:italic;">9</span>ja</span>
          </div>
          <h2 style="font-size:20px;font-weight:800;margin-bottom:12px;color:#fff;">Your ad is expiring ${timeStr}</h2>
          <p style="font-size:14px;line-height:1.7;color:#9898b8;margin-bottom:20px;">
            Your <strong style="color:#fff;">${ad.label}</strong> ad will stop showing to customers ${timeStr}.
            Renew now to keep your products at the top and maintain your visibility.
          </p>
          <div style="background:#18181f;border:1px solid #1e1e2e;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
            <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Ad details</div>
            <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;">${ad.label}</div>
            <div style="font-size:12px;color:#9898b8;">
              ${ad.selectedProducts.length} product${ad.selectedProducts.length !== 1 ? "s" : ""} · 
              Expires ${new Date(ad.endDate).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <a href="https://yourapp.com/vendor/promotions" 
            style="display:inline-block;background:linear-gradient(135deg,#FF6B00,#FF8C00);color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:14px;font-weight:800;margin-bottom:24px;">
            Renew My Ad
          </a>
          <p style="font-size:12px;color:#555;line-height:1.6;">
            If you no longer want to advertise, no action is needed — your ad will simply stop showing after it expires.
          </p>
          <hr style="border:none;border-top:1px solid #1e1e2e;margin:20px 0;"/>
          <p style="font-size:11px;color:#444;">Swift9ja · Lagos, Nigeria · <a href="https://yourapp.com" style="color:#FF6B00;">swiftnija.com</a></p>
        </div>
      `,
      vendorId:  vendorId,
      adId:      ad.id,
      sentAt:    null,
      status:    "pending",
      createdAt: serverTimestamp(),
    });

    // ── 3. Mark ad as notified ────────────────────────────────────────────
    batch.update(doc(db, "adPromotions", ad.id!), {
      notifiedExpiry: true,
      status: "expiring_soon",
    });
  }

  try {
    await batch.commit();
    console.log(`[adNotifications] Notified ${toNotify.length} expiring ad(s) for vendor ${vendorId}`);
  } catch (e) {
    console.error("[adNotifications] batch.commit failed:", e);
  }
}

// ─── Subscribe to unread notification count for the vendor ───────────────────
// Usage in component:
//   const [count, setCount] = useState(0);
//   useEffect(() => subscribeToNotifCount(vendorId, setCount), [vendorId]);
export function subscribeToNotifCount(vendorId: string, onChange: (n: number) => void): () => void {
  if (!vendorId) return () => {};
  return onSnapshot(
    query(
      collection(db, "notifications"),
      where("userId", "==", vendorId),
      where("read", "==", false)
    ),
    snap => onChange(snap.size),
    () => {}
  );
}

// ─── Mark all ad notifications as read ───────────────────────────────────────
export async function markAdNotifsRead(vendorId: string): Promise<void> {
  if (!vendorId) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("userId", "==", vendorId),
        where("type", "==", "ad_expiring"),
        where("read", "==", false)
      )
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (e) {
    console.warn("markAdNotifsRead failed:", e);
  }
}