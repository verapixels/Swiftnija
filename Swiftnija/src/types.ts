// ─── SHARED TYPES ─────────────────────────────────────────────────────────────

export type StatusKey = keyof typeof STATUS_CONFIG;

export const STATUS_CONFIG = {
  processing:   { label: "Processing",   color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  shipped:      { label: "Shipped",      color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  delivered:    { label: "Delivered",    color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  cancelled:    { label: "Cancelled",    color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  active:       { label: "Active",       color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  paused:       { label: "Paused",       color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  out_of_stock: { label: "Out of Stock", color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  paid:         { label: "Paid",         color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  pending:      { label: "Pending",      color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
};

export type Product = {
  id: string; name: string; price: number; stock: number;
  status: string; sales: number; img: string; category: string; vendorId: string;
  subCategory?: string;
};

export type Order = {
  id: string; customer: string; item: string; amount: number;
  status: string; time: string; address: string; createdAt?: any;
  pickupCode?: string; riderId?: string; riderName?: string; riderPhone?: string;
};

export type VendorProfile = {
  uid: string;
  name: string;
  owner: string;
  phone: string;
  email: string;
  address: string;
  bio: string;
  logo: string | null;
  coverImage: string | null;
  verified: boolean;
  bankLinked: boolean;
  category: string;
  joinDate: string;
  paystackSubaccountCode?: string;
  openingHours?: { open: string; close: string; days: string[] };
  // ── Blue Badge (separate from basic account verification) ──
  blueBadge?: boolean;
  blueBadgeStatus?: "none" | "pending" | "approved" | "rejected";
};

export type Promotion = {
  id: string;
  type: string;
  label: string;
  price: number;
  duration: string;
  durationDays: number;
  startDate?: string;
  endDate?: string;
  status: "active" | "expired" | "pending";
  paystackRef?: string;
};

export type SettingsState = {
  orderAlertSMS: boolean;
  payoutAlertEmail: boolean;
  reviewAlerts: boolean;
  promoEmails: boolean;
  storeOpen: boolean;
  acceptOrders: boolean;
  showOnDiscover: boolean;
  autoConfirm: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
  smsCardAdded: boolean;
  // ── Notification additions ──
  pushNotifications: boolean;
};

export const PROMO_PLANS = [
  {
    type: "banner_week",
    label: "Homepage Banner",
    desc: "Featured banner on the homepage",
    price: 5000,
    duration: "1 Week",
    durationDays: 7,
    color: "#FF6B00",
    badge: "Popular",
  },
  {
    type: "featured_month",
    label: "Featured Store",
    desc: "Top placement in your category",
    price: 15000,
    duration: "1 Month",
    durationDays: 30,
    color: "#3B82F6",
    badge: "Best Value",
  },
  {
    type: "spotlight_week",
    label: "Discover Spotlight",
    desc: "Highlighted in discover feed",
    price: 8000,
    duration: "1 Week",
    durationDays: 7,
    color: "#8B5CF6",
    badge: null,
  },
  {
    type: "push_month",
    label: "Push Notification Ads",
    desc: "Sent to customers near your area",
    price: 20000,
    duration: "1 Month",
    durationDays: 30,
    color: "#10B981",
    badge: "High ROI",
  },
  {
    type: "search_boost_week",
    label: "Search Boost",
    desc: "Appear first in search results",
    price: 6000,
    duration: "2 Weeks",
    durationDays: 14,
    color: "#F59E0B",
    badge: null,
  },
];

export const NIGERIAN_BANKS = [
  "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank",
  "First Bank of Nigeria", "First City Monument Bank (FCMB)", "Globus Bank",
  "Guaranty Trust Bank (GTBank)", "Heritage Bank", "Keystone Bank",
  "Kuda Bank", "Lotus Bank", "Moniepoint Microfinance Bank", "OPay",
  "Palmpay", "Polaris Bank", "Premium Trust Bank", "Providus Bank",
  "Stanbic IBTC Bank", "Standard Chartered Bank", "Sterling Bank",
  "SunTrust Bank", "Titan Trust Bank", "Union Bank of Nigeria",
  "United Bank for Africa (UBA)", "Unity Bank", "VFD Microfinance Bank",
  "Wema Bank", "Zenith Bank",
];