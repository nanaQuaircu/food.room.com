'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type GuestCartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string | null;
  qty: number;
};

type GuestCartContextValue = {
  items: GuestCartItem[];
  cartCount: number;
  cartTotal: number;
  showCart: boolean;
  openCart: () => void;
  closeCart: () => void;
  setShowCart: (open: boolean) => void;
  addItem: (item: Omit<GuestCartItem, 'qty'>, qty?: number) => void;
  adjustQty: (itemId: number, delta: number) => void;
  clearCart: () => void;
  toast: string | null;
  trackingOrderId: number | null;
  showTracker: boolean;
  openTracker: (orderId: number) => void;
  closeTracker: () => void;
  clearTracking: () => void;
};

const GuestCartContext = createContext<GuestCartContextValue | null>(null);

const STORAGE_KEY = 'guest_food_cart_v1';
const TRACK_KEY = 'guest_food_track_v1';

export function GuestCartProvider({
  children,
  slug,
}: {
  children: ReactNode;
  slug: string;
}) {
  const storageKey = `${STORAGE_KEY}:${slug}`;
  const trackKey = `${TRACK_KEY}:${slug}`;
  const [items, setItems] = useState<GuestCartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [showTracker, setShowTracker] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as GuestCartItem[];
        if (Array.isArray(parsed)) setItems(parsed.filter((i) => i?.id && i.qty > 0));
      }
      const trackRaw = sessionStorage.getItem(trackKey);
      if (trackRaw) {
        const id = Number(trackRaw);
        if (id > 0) setTrackingOrderId(id);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey, trackKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (trackingOrderId) sessionStorage.setItem(trackKey, String(trackingOrderId));
      else sessionStorage.removeItem(trackKey);
    } catch {
      /* ignore */
    }
  }, [trackingOrderId, hydrated, trackKey]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const addItem = useCallback((item: Omit<GuestCartItem, 'qty'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) =>
          p.id === item.id ? { ...p, qty: p.qty + qty, name: item.name, price: item.price, image_url: item.image_url } : p
        );
      }
      return [...prev, { ...item, qty }];
    });
    setToast(`${item.name} added to cart successfully`);
  }, []);

  const adjustQty = useCallback((itemId: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((p) => (p.id === itemId ? { ...p, qty: Math.max(0, p.qty + delta) } : p))
        .filter((p) => p.qty > 0)
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const openTracker = useCallback((orderId: number) => {
    setTrackingOrderId(orderId);
    setShowTracker(true);
    setShowCart(false);
  }, []);

  const closeTracker = useCallback(() => setShowTracker(false), []);

  const clearTracking = useCallback(() => {
    setShowTracker(false);
    setTrackingOrderId(null);
  }, []);

  const value = useMemo<GuestCartContextValue>(() => {
    const cartCount = items.reduce((sum, i) => sum + i.qty, 0);
    const cartTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    return {
      items,
      cartCount,
      cartTotal,
      showCart,
      openCart: () => setShowCart(true),
      closeCart: () => setShowCart(false),
      setShowCart,
      addItem,
      adjustQty,
      clearCart,
      toast,
      trackingOrderId,
      showTracker,
      openTracker,
      closeTracker,
      clearTracking,
    };
  }, [
    items,
    showCart,
    addItem,
    adjustQty,
    clearCart,
    toast,
    trackingOrderId,
    showTracker,
    openTracker,
    closeTracker,
    clearTracking,
  ]);

  return (
    <GuestCartContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {toast ? (
          <motion.div
            className="guest-cart-toast"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            role="status"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <style>{`
        .guest-cart-toast {
          position: fixed;
          top: 88px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2200;
          background: #1e1714;
          color: #fff;
          padding: 12px 22px;
          border-radius: 999px;
          font-size: 0.9rem;
          font-weight: 600;
          box-shadow: 0 10px 28px rgba(0,0,0,0.22);
          max-width: min(92vw, 420px);
          text-align: center;
          border: 1px solid rgba(203,134,112,0.45);
        }
        .guest-nav-cart {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(17, 17, 17, 0.18);
          background: rgba(17, 17, 17, 0.04);
          color: #111111 !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
        }
        .header-area .is-sticky .guest-nav-cart {
          border-color: rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff !important;
        }
        .guest-nav-cart__badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 999px;
          background: #cb8670;
          color: #fff;
          font-size: 0.65rem;
          font-weight: 700;
          display: grid;
          place-items: center;
          line-height: 1;
        }
      `}</style>
    </GuestCartContext.Provider>
  );
}

export function useGuestCart() {
  const ctx = useContext(GuestCartContext);
  if (!ctx) throw new Error('useGuestCart must be used within GuestCartProvider');
  return ctx;
}

/** Safe for header when provider might not yet wrap (returns null). */
export function useGuestCartOptional() {
  return useContext(GuestCartContext);
}
