// categoryConfig.ts — single source of truth for all category data
// Import this in Homepage, SearchPage, and VendorListPage
// Send & Pickup is a SERVICE (navigation link), NOT a category

import {
  FiBox, FiDroplet, FiHeart, FiPackage,
} from "react-icons/fi";
import {
  MdRestaurant, MdLocalPharmacy, MdLocalGroceryStore, MdStorefront,
} from "react-icons/md";
import { RiDrinks2Line } from "react-icons/ri";
import React from "react";

// ─── Full category tree (matches ProductsPage CATEGORY_TREE) ──────────────────
export const CATEGORY_TREE: Record<string, { label: string; subcategories: string[] }> = {
  restaurants: {
    label: "Restaurants",
    subcategories: ["Main Course", "Starters", "Soups & Stews", "Rice & Pasta", "Grills", "Local Dishes", "Continental", "Salads", "Desserts"],
  },
  fastfood: {
    label: "Fast Food",
    subcategories: ["Burgers", "Pizza", "Shawarma", "Fried Chicken", "Hot Dogs", "Wraps", "Fries & Sides", "Snacks"],
  },
  pharmacy: {
    label: "Pharmacy",
    subcategories: ["Prescription Drugs", "OTC Medications", "Vitamins", "First Aid", "Baby Health", "Medical Devices", "Sanitizers & PPE"],
  },
  supermarket: {
    label: "Supermarket",
    subcategories: ["Canned Foods", "Dairy Products", "Frozen Foods", "Condiments", "Cooking Oil", "Flour & Grains", "Snacks & Biscuits", "Baby Products", "Household Items"],
  },
  groceries: {
    label: "Groceries",
    subcategories: ["Vegetables", "Fruits", "Tubers", "Grains & Legumes", "Meat & Fish", "Eggs & Dairy", "Spices & Seasoning", "Palm Oil & Produce"],
  },
  fashion: {
    label: "Fashion",
    subcategories: ["Men Clothing", "Women Clothing", "Kids Clothing", "Shoes & Footwear", "Bags & Purses", "Accessories", "Traditional Wear", "Sportswear", "Underwear & Lingerie", "Jewelry"],
  },
  boutique: {
    label: "Boutique",
    subcategories: ["Designer Wear", "Evening Gowns", "Casual Wear", "Office Wear", "Wedding & Bridal", "Ankara & Prints", "Luxury Handbags", "Vintage"],
  },
  beauty: {
    label: "Beauty",
    subcategories: ["Hair Products", "Hair Extensions & Wigs", "Makeup & Cosmetics", "Nail Care", "Eyelashes", "Lipstick & Lip Gloss", "Foundation & Concealer", "Eyeshadow & Eyeliner", "Beauty Tools"],
  },
  skincare: {
    label: "Skincare",
    subcategories: ["Moisturizers", "Sunscreen", "Toners & Serums", "Face Wash", "Body Lotion", "Brightening & Bleaching", "Anti-Aging", "Oils & Butters", "Natural & Organic"],
  },
  perfumes: {
    label: "Perfumes",
    subcategories: ["Men Perfumes", "Women Perfumes", "Unisex Perfumes", "Body Spray", "Roll-On & Deodorant", "Arabian Oud", "Mini & Travel Size"],
  },
  drinks: {
    label: "Drinks",
    subcategories: ["Water & Soft Drinks", "Juices", "Energy Drinks", "Alcoholic Beverages", "Wine", "Beer", "Smoothies & Shakes", "Tea & Coffee", "Zobo & Local Drinks"],
  },
  health: {
    label: "Health & Wellness",
    subcategories: ["Supplements & Vitamins", "Protein & Fitness", "Herbal & Natural", "Weight Loss", "Sexual Health", "Eye & Ear Care", "Dental Care", "Mental Wellness"],
  },
  electronics: {
    label: "Electronics",
    subcategories: ["Phones & Accessories", "Laptops & Computers", "TVs & Screens", "Audio & Speakers", "Cameras", "Cables & Chargers", "Smart Gadgets", "Gaming", "Home Appliances"],
  },
};

// ─── Category IDs list (no sendpickup — that's a service) ─────────────────────
export const CATEGORY_IDS = Object.keys(CATEGORY_TREE);

// ─── Category UI config (icons + accent colors) ───────────────────────────────
export const CAT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  restaurants:  { label: "Restaurants",      icon: React.createElement(MdRestaurant, { size: 20 }),        color: "#FF6B00" },
  fastfood:     { label: "Fast Food",         icon: React.createElement(MdRestaurant, { size: 20 }),        color: "#FB923C" },
  pharmacy:     { label: "Pharmacy",          icon: React.createElement(MdLocalPharmacy, { size: 20 }),     color: "#10B981" },
  supermarket:  { label: "Supermarket",       icon: React.createElement(MdLocalGroceryStore, { size: 20 }), color: "#3B82F6" },
  groceries:    { label: "Groceries",         icon: React.createElement(MdLocalGroceryStore, { size: 20 }), color: "#22C55E" },
  fashion:      { label: "Fashion",           icon: React.createElement(MdStorefront, { size: 20 }),        color: "#F43F5E" },
  boutique:     { label: "Boutique",          icon: React.createElement(MdStorefront, { size: 20 }),        color: "#8B5CF6" },
  beauty:       { label: "Beauty",            icon: React.createElement(FiBox, { size: 20 }),               color: "#F472B6" },
  skincare:     { label: "Skincare",          icon: React.createElement(FiDroplet, { size: 20 }),           color: "#EC4899" },
  perfumes:     { label: "Perfumes",          icon: React.createElement(FiDroplet, { size: 20 }),           color: "#A78BFA" },
  drinks:       { label: "Drinks",            icon: React.createElement(RiDrinks2Line, { size: 20 }),       color: "#06B6D4" },
  health:       { label: "Health & Wellness", icon: React.createElement(FiHeart, { size: 20 }),             color: "#14B8A6" },
  electronics:  { label: "Electronics",       icon: React.createElement(FiBox, { size: 20 }),               color: "#6366F1" },
};

// ─── Normalize any raw category string to a valid CATEGORY_TREE key ───────────
export function normalizeCat(raw: string): string {
  if (!raw) return "restaurants";
  const s = raw.toLowerCase().trim();
  const map: [string, string][] = [
    ["restaurant", "restaurants"],
    ["fast food",  "fastfood"],
    ["fastfood",   "fastfood"],
    ["burger",     "fastfood"],
    ["pizza",      "fastfood"],
    ["shawarma",   "fastfood"],
    ["fried chicken", "fastfood"],
    ["pharmacy",   "pharmacy"],
    ["drug",       "pharmacy"],
    ["medicine",   "pharmacy"],
    ["health",     "health"],
    ["supplement", "health"],
    ["wellness",   "health"],
    ["supermarket","supermarket"],
    ["grocery",    "groceries"],
    ["groceries",  "groceries"],
    ["vegetable",  "groceries"],
    ["fruit",      "groceries"],
    ["boutique",   "boutique"],
    ["fashion",    "fashion"],
    ["clothing",   "fashion"],
    ["cloth",      "fashion"],
    ["wear",       "fashion"],
    ["apparel",    "fashion"],
    ["dress",      "fashion"],
    ["beauty",     "beauty"],
    ["makeup",     "beauty"],
    ["cosmetic",   "beauty"],
    ["hair",       "beauty"],
    ["skincare",   "skincare"],
    ["skin",       "skincare"],
    ["lotion",     "skincare"],
    ["perfume",    "perfumes"],
    ["fragrance",  "perfumes"],
    ["cologne",    "perfumes"],
    ["drink",      "drinks"],
    ["beverage",   "drinks"],
    ["juice",      "drinks"],
    ["water",      "drinks"],
    ["electronics","electronics"],
    ["gadget",     "electronics"],
    ["phone",      "electronics"],
    ["laptop",     "electronics"],
    ["food",       "restaurants"],
  ];
  for (const [k, v] of map) if (s.includes(k)) return v;
  return s in CATEGORY_TREE ? s : "restaurants";
}