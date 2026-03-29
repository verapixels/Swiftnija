// ─────────────────────────────────────────────────────────────────────────────
// adTypes.ts — place at: src/adTypes.ts
// ─────────────────────────────────────────────────────────────────────────────
import type { Timestamp } from "firebase/firestore";

export type AdType =
  | "trending_homepage"   // ₦25,000 — Homepage Trending section
  | "search_priority"     // ₦15,000 — Top of search results
  | "search_trending"     // ₦20,000 — Search page Trending Now
  | "homepage_banner";    // ₦10,000 — Homepage banner after categories

export type AdStatus = "active" | "expired" | "cancelled" | "expiring_soon";

export interface AdPromotion {
  id?: string;
  vendorId: string;
  vendorName: string;
  vendorLogo?: string;
  type: AdType;
  label: string;
  price: number;
  durationDays: number;
  startDate: string;
  endDate: string;
  paystackRef: string;
  status: AdStatus;
  selectedProducts: string[];
  createdAt?: Timestamp;
  notifiedExpiry?: boolean;
  bannerTemplateId?: string;
  bannerData?: BannerData;
}

export interface BannerData {
  storeName: string;
  tagline: string;
  logoUrl: string;
  customBannerUrl?: string;
  ctaText: string;
  selectedProducts?: string[];
}

export interface AdPlan {
  type: AdType;
  label: string;
  shortLabel: string;
  desc: string;
  price: number;
  duration: string;
  durationDays: number;
  color: string;
  accentColor: string;
  badge: string | null;
  maxProducts: number;
  iconKey: "trending" | "search" | "banner" | "zap";
  perRefreshNote: string;
}

export interface BannerTemplate {
  id: string;
  name: string;
  style: {
    background: string;
    titleColor: string;
    subColor: string;
    ctaBackground: string;
    ctaColor: string;
    layout: "left" | "center" | "split";
  };
}

// ─── Ad Plans ─────────────────────────────────────────────────────────────────
export const AD_PLANS: AdPlan[] = [
  {
    type: "trending_homepage",
    label: "Homepage Trending",
    shortLabel: "Trending",
    desc: "Your products appear in the Trending section when users open the app. 2 of your products rotate randomly with other vendors — reshuffled on every page refresh.",
    price: 25000,
    duration: "7 Days",
    durationDays: 7,
    color: "#FF6B00",
    accentColor: "#FF8C00",
    badge: "Most Popular",
    maxProducts: 11,
    iconKey: "trending",
    perRefreshNote: "2 products per vendor shown per refresh",
  },
  {
    type: "search_priority",
    label: "Search Priority",
    shortLabel: "Search #1",
    desc: "Your selected products appear at the very top of search results when users search for matching keywords — above all other listings.",
    price: 15000,
    duration: "7 Days",
    durationDays: 7,
    color: "#6366F1",
    accentColor: "#4F46E5",
    badge: "High Intent",
    maxProducts: 10,
    iconKey: "search",
    perRefreshNote: "Matching products pinned #1 in results",
  },
  {
    type: "search_trending",
    label: "Search Trending Now",
    shortLabel: "Search Trend",
    desc: "Your products appear in the Trending Now section on the search page. 1 product per vendor shown, rotating randomly each time a user opens search.",
    price: 20000,
    duration: "7 Days",
    durationDays: 7,
    color: "#10B981",
    accentColor: "#059669",
    badge: null,
    maxProducts: 8,
    iconKey: "trending",
    perRefreshNote: "1 product per vendor, reshuffled each refresh",
  },
  {
    type: "homepage_banner",
    label: "Homepage Store Banner",
    shortLabel: "Banner",
    desc: "A full-width branded store banner placed right after the categories section on the homepage. Pick from 15 designer templates or upload your own (1200×400px).",
    price: 10000,
    duration: "7 Days",
    durationDays: 7,
    color: "#F59E0B",
    accentColor: "#D97706",
    badge: "Brand Awareness",
    maxProducts: 3,
    iconKey: "banner",
    perRefreshNote: "Always visible — persistent banner placement",
  },
];

// ─── Banner Templates (15) ────────────────────────────────────────────────────
export const BANNER_TEMPLATES: BannerTemplate[] = [
  {
    id: "flame",
    name: "Flame",
    style: {
      background: "linear-gradient(135deg,#FF6B00 0%,#FF0050 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.82)",
      ctaBackground: "#fff",
      ctaColor: "#FF6B00",
      layout: "left",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    style: {
      background: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.7)",
      ctaBackground: "#FF6B00",
      ctaColor: "#fff",
      layout: "left",
    },
  },
  {
    id: "forest",
    name: "Forest",
    style: {
      background: "linear-gradient(135deg,#134E5E 0%,#71B280 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.8)",
      ctaBackground: "#fff",
      ctaColor: "#134E5E",
      layout: "split",
    },
  },
  {
    id: "gold",
    name: "Gold Rush",
    style: {
      background: "linear-gradient(135deg,#B8860B 0%,#FFD700 50%,#B8860B 100%)",
      titleColor: "#1a0a00",
      subColor: "rgba(26,10,0,0.7)",
      ctaBackground: "#1a0a00",
      ctaColor: "#FFD700",
      layout: "center",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    style: {
      background: "linear-gradient(135deg,#0575E6 0%,#021B79 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.75)",
      ctaBackground: "#00d4ff",
      ctaColor: "#021B79",
      layout: "left",
    },
  },
  {
    id: "rose",
    name: "Rose Gold",
    style: {
      background: "linear-gradient(135deg,#f093fb 0%,#f5576c 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.85)",
      ctaBackground: "#fff",
      ctaColor: "#f5576c",
      layout: "split",
    },
  },
  {
    id: "dark_gold",
    name: "Dark Gold",
    style: {
      background: "linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%)",
      titleColor: "#FFD700",
      subColor: "rgba(255,215,0,0.7)",
      ctaBackground: "#FFD700",
      ctaColor: "#1a1a2e",
      layout: "left",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    style: {
      background: "linear-gradient(135deg,#0f9b58 0%,#00bf8f 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.8)",
      ctaBackground: "#fff",
      ctaColor: "#0f9b58",
      layout: "center",
    },
  },
  {
    id: "cosmic",
    name: "Cosmic",
    style: {
      background: "linear-gradient(135deg,#200122 0%,#6f0000 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,200,200,0.75)",
      ctaBackground: "#ff4b2b",
      ctaColor: "#fff",
      layout: "split",
    },
  },
  {
    id: "arctic",
    name: "Arctic",
    style: {
      background: "linear-gradient(135deg,#e0f7fa 0%,#e0f2f1 100%)",
      titleColor: "#004d60",
      subColor: "rgba(0,77,96,0.7)",
      ctaBackground: "#00838f",
      ctaColor: "#fff",
      layout: "left",
    },
  },
  {
    id: "neon",
    name: "Neon Night",
    style: {
      background: "linear-gradient(135deg,#0d0d0d 0%,#1a1a1a 100%)",
      titleColor: "#00ff88",
      subColor: "rgba(0,255,136,0.6)",
      ctaBackground: "#00ff88",
      ctaColor: "#0d0d0d",
      layout: "center",
    },
  },
  {
    id: "sunset",
    name: "Lagos Sunset",
    style: {
      background: "linear-gradient(135deg,#FF512F 0%,#F09819 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.85)",
      ctaBackground: "#fff",
      ctaColor: "#FF512F",
      layout: "left",
    },
  },
  {
    id: "purple_haze",
    name: "Purple Haze",
    style: {
      background: "linear-gradient(135deg,#4a00e0 0%,#8e2de2 100%)",
      titleColor: "#fff",
      subColor: "rgba(255,255,255,0.78)",
      ctaBackground: "#fff",
      ctaColor: "#4a00e0",
      layout: "split",
    },
  },
  {
    id: "slate",
    name: "Slate Pro",
    style: {
      background: "linear-gradient(135deg,#1c1c1e 0%,#2c2c2e 100%)",
      titleColor: "#f5f5f7",
      subColor: "rgba(245,245,247,0.6)",
      ctaBackground: "#FF6B00",
      ctaColor: "#fff",
      layout: "left",
    },
  },
  {
    id: "mint",
    name: "Fresh Mint",
    style: {
      background: "linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)",
      titleColor: "#0a3622",
      subColor: "rgba(10,54,34,0.7)",
      ctaBackground: "#0a3622",
      ctaColor: "#43e97b",
      layout: "center",
    },
  },
];

// ─── Slot Builders ────────────────────────────────────────────────────────────

/**
 * ₦25k Homepage Trending
 * 2 random products per vendor shown per refresh; if only 1 vendor → up to 6
 */
export function buildHomepageTrendingSlots(promos: AdPromotion[]): string[] {
  const now = new Date().toISOString();
  const active = promos.filter(
    (p) =>
      p.type === "trending_homepage" &&
      (p.status === "active" || p.status === "expiring_soon") &&
      p.endDate > now &&
      p.selectedProducts.length > 0
  );
  if (active.length === 0) return [];
  if (active.length === 1)
    return [...active[0].selectedProducts]
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);
  const result: string[] = [];
  for (const promo of active) {
    const two = [...promo.selectedProducts]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    result.push(...two);
  }
  return result;
}

/**
 * ₦20k Search Trending Now
 * 1 random product per vendor per refresh; if only 1 vendor → all 8 reshuffled
 */
export function buildSearchTrendingSlots(promos: AdPromotion[]): string[] {
  const now = new Date().toISOString();
  const active = promos.filter(
    (p) =>
      p.type === "search_trending" &&
      (p.status === "active" || p.status === "expiring_soon") &&
      p.endDate > now &&
      p.selectedProducts.length > 0
  );
  if (active.length === 0) return [];
  if (active.length === 1)
    return [...active[0].selectedProducts]
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);
  return active
    .map((p) => [...p.selectedProducts].sort(() => Math.random() - 0.5)[0])
    .filter(Boolean);
}

/**
 * ₦15k Search Priority — returns all boosted product IDs
 * Search page checks partial name match before boosting.
 */
export function getSearchPriorityIds(promos: AdPromotion[]): string[] {
  const now = new Date().toISOString();
  return promos
    .filter(
      (p) =>
        p.type === "search_priority" &&
        (p.status === "active" || p.status === "expiring_soon") &&
        p.endDate > now
    )
    .flatMap((p) => p.selectedProducts);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function getDaysLeft(endDate: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
  );
}

export function isExpiringSoon(endDate: string): boolean {
  const d = getDaysLeft(endDate);
  return d <= 2 && d > 0;
}