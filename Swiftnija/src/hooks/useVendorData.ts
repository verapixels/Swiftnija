// src/hooks/useVendorData.ts
import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc,
} from "firebase/firestore";
import type { Product, Order, VendorProfile, SettingsState, Promotion } from "../types";

const DEFAULT_SETTINGS: SettingsState = {
  orderAlertSMS: false, payoutAlertEmail: true, reviewAlerts: false, promoEmails: false,
  storeOpen: true, acceptOrders: true, showOnDiscover: true, autoConfirm: false,
  soundEnabled: true, darkMode: true, smsCardAdded: false,  pushNotifications: false, 
};

export function useVendorData() {
  const [vendor, setVendor]         = useState<VendorProfile | null>(null);
  const [products, setProducts]     = useState<Product[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [settings, setSettings]     = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const unsubAuth = auth.onAuthStateChanged(user => {
      if (!user) { setLoading(false); return; }
      setLoading(true);

      // ── Vendor profile ──
      getDoc(doc(db, "vendors", user.uid)).then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setVendor({
            uid: user.uid,
            name: d.businessName || "Your Store",
            owner: d.fullName || "Vendor",
            phone: d.phone || "",
            email: d.email || user.email || "",
            address: d.address || "",
            bio: d.bio || "",
            logo: d.logo || null,
            coverImage: d.coverImage || null,
            verified: d.verified ?? false,
            bankLinked: d.bankLinked ?? false,
            category: d.category || "",
            joinDate: d.createdAt
              ? new Date(d.createdAt).getFullYear().toString()
              : new Date().getFullYear().toString(),
            paystackSubaccountCode: d.paystackSubaccountCode || "",
            openingHours: d.openingHours || {
              open: "08:00", close: "22:00",
              days: ["Mon","Tue","Wed","Thu","Fri","Sat"],
            },
          });
        }
      }).catch(console.error);

      // ── Settings ──
      getDoc(doc(db, "vendorSettings", user.uid)).then(snap => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snap.data() as SettingsState });
        }
      }).catch(console.error);

      // ── Products ──
      const pq = query(
        collection(db, "products"),
        where("vendorId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const unsubP = onSnapshot(pq, snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
        setLoading(false);
      }, err => { console.error("Products:", err.message); setLoading(false); });
      unsubs.push(unsubP);

      // ── Orders ──
      const oq = query(
        collection(db, "orders"),
        where("vendorId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const unsubO = onSnapshot(oq, snap => {
        setOrders(snap.docs.map(d => ({
          id: d.id,
          customer:   d.data().customerName    || "Customer",
          item:       d.data().items?.[0]?.name || "Order",
          amount:     d.data().totalAmount      || 0,
          status:     d.data().status           || "processing",
          time:       d.data().createdAt?.seconds
                        ? new Date(d.data().createdAt.seconds * 1000).toLocaleTimeString()
                        : "—",
          address:    d.data().deliveryAddress  || "N/A",
          createdAt:  d.data().createdAt,
          pickupCode: d.data().pickupCode       || "",
          riderId:    d.data().riderId          || "",
          riderName:  d.data().riderName        || "",
          riderPhone: d.data().riderPhone       || "",
        })));
      }, err => console.error("Orders:", err.message));
      unsubs.push(unsubO);

      // ── Promotions ──
      const promoQ = query(
  collection(db, "adPromotions"),
        where("vendorId", "==", user.uid),
        orderBy("startDate", "desc")
      );
      const unsubPromo = onSnapshot(promoQ, snap => {
        const now = new Date();
        setPromotions(snap.docs.map(d => {
          const data = d.data();
          const end = data.endDate ? new Date(data.endDate) : null;
          const status: Promotion["status"] = !end
            ? "pending"
            : end > now ? "active" : "expired";
          return { id: d.id, ...data, status } as Promotion;
        }));
      }, err => console.error("Promotions:", err.message));
      unsubs.push(unsubPromo);
    });

    return () => { unsubAuth(); unsubs.forEach(u => u()); };
  }, []);

  return {
    vendor, setVendor,
    products, setProducts,
    orders,
    promotions,
    settings, setSettings,
    loading,
  };
}