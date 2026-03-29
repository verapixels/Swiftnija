// context/CartContext.tsx
import {
  createContext, useContext, useState, useEffect,
  useRef, useCallback, type ReactNode,
} from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export type CartItem = {
  name: string;
  price: string;
  img: string;
  vendorName?: string;
  vendorVerified?: boolean;
  vendorLat?: number;
  vendorLng?: number;
  vendorId?: string;
  qty: number;
};

type AddPayload = {
  name: string;
  price: string;
  img: string;
  vendorName?: string;
  vendorVerified?: boolean;
  vendorLat?: number;
  vendorLng?: number;
  vendorId?: string;
};

type CartContextType = {
  cart: CartItem[];
  addToCart: (item: AddPayload) => void;
  removeOne: (name: string) => void;
  clearItem: (name: string) => void;
  clearCart: () => void;
  cartCount: number;
  cartLoading: boolean;
};

const STORAGE_KEY   = "swiftnija_cart";
const FIRESTORE_COL = "carts";
const CartContext   = createContext<CartContextType | null>(null);

function readLocal(): CartItem[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as CartItem[]) : [];
  } catch { return []; }
}

function writeLocal(items: CartItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

function clearLocal() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function sanitize(item: CartItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: item.name ?? "",
    price: item.price ?? "",
    img: item.img ?? "",
    qty: item.qty ?? 1,
  };
  if (item.vendorName     && item.vendorName !== "")  out.vendorName     = item.vendorName;
  if (item.vendorId       && item.vendorId   !== "")  out.vendorId       = item.vendorId;
  if (item.vendorVerified === true)                   out.vendorVerified = true;
  if (typeof item.vendorLat === "number")             out.vendorLat      = item.vendorLat;
  if (typeof item.vendorLng === "number")             out.vendorLng      = item.vendorLng;
  return out;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [uid,         setUid]         = useState<string | null>(null);

  const hydrated  = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidRef    = useRef<string | null>(null);

  // ── Persist to Firestore — debounced ─────────────────────────────────────
  const scheduleSave = useCallback((items: CartItem[]) => {
    const currentUid = uidRef.current;
    if (!currentUid) return;
    writeLocal(items);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDoc(
        doc(db, FIRESTORE_COL, currentUid),
        { items: items.map(sanitize), updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(e => console.warn("[Cart] save failed:", e));
    }, 500);
  }, []);

let firstRun = true;
const unsub = onAuthStateChanged(auth, user => {
  uidRef.current = user?.uid ?? null;
  setUid(user?.uid ?? null);

  if (!user && !firstRun) {
    // Only clear on actual logout, not on initial unauthenticated load
    hydrated.current = false;
    clearLocal();
    setCart([]);
  }
  firstRun = false;
});

  // ── Load from Firestore once on login ─────────────────────────────────────
  // Remote Firestore cart is the single source of truth on login.
  // Local storage is only used as a fallback if Firestore has no cart yet.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const load = async () => {
      setCartLoading(true);
      try {
        const snap   = await getDoc(doc(db, FIRESTORE_COL, uid));
        const remote: CartItem[] = snap.exists() ? (snap.data().items ?? []) : [];
        const local  = readLocal();

        // ✅ FIX: Remote is the source of truth.
        // Only fall back to local if Firestore has no cart at all.
        const merged = remote.length > 0 ? remote : local;

        if (cancelled) return;

        hydrated.current = true;
        setCart(merged);
        writeLocal(merged);

        // If we used local items and Firestore was empty, sync them up
        if (remote.length === 0 && local.length > 0) {
          setDoc(
            doc(db, FIRESTORE_COL, uid),
            { items: merged.map(sanitize), updatedAt: serverTimestamp() },
            { merge: true }
          ).catch(e => console.warn("[Cart] initial sync failed:", e));
        }
      } catch (e) {
        console.warn("[Cart] load failed:", e);
        if (!cancelled) {
          hydrated.current = true;
          // Keep whatever is already in state (empty from logout clear)
        }
      } finally {
        if (!cancelled) setCartLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [uid]);

  // ── Auto-save on cart change (only after hydration) ───────────────────────
  useEffect(() => {
    if (!hydrated.current) return;
    scheduleSave(cart);
  }, [cart, scheduleSave]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addToCart = useCallback((p: AddPayload) => {
    setCart(prev => {
      const next = prev.find(c => c.name === p.name)
        ? prev.map(c => c.name === p.name ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, {
            name: p.name, price: p.price, img: p.img ?? "", qty: 1,
            ...(p.vendorName     && p.vendorName !== "" ? { vendorName:     p.vendorName     } : {}),
            ...(p.vendorId       && p.vendorId   !== "" ? { vendorId:       p.vendorId       } : {}),
            ...(p.vendorVerified === true               ? { vendorVerified: true              } : {}),
            ...(typeof p.vendorLat === "number"         ? { vendorLat:      p.vendorLat      } : {}),
            ...(typeof p.vendorLng === "number"         ? { vendorLng:      p.vendorLng      } : {}),
          }];
      writeLocal(next);
      return next;
    });
  }, []);

  const removeOne = useCallback((name: string) => {
    setCart(prev => {
      const next = prev
        .map(c => c.name === name ? { ...c, qty: c.qty - 1 } : c)
        .filter(c => c.qty > 0);
      writeLocal(next);
      return next;
    });
  }, []);

  const clearItem = useCallback((name: string) => {
    setCart(prev => {
      const next = prev.filter(c => c.name !== name);
      writeLocal(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    clearLocal();
    setCart([]);
    const currentUid = uidRef.current;
    if (currentUid) {
      setDoc(
        doc(db, FIRESTORE_COL, currentUid),
        { items: [], updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(console.warn);
    }
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  return (
    <CartContext.Provider value={{
      cart, addToCart, removeOne, clearItem, clearCart, cartCount, cartLoading,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}