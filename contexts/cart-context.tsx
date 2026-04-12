"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";

// Unique identifier for this browser tab — prevents BroadcastChannel self-echo loop
const TAB_ID = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const MAX_QTY = 20;

// ── Shared AudioContext (one single instance, not per-click) ──────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") {
      _audioCtx = new AudioContext();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

function playPopSound() {
  const ac = getAudioCtx();
  if (!ac) return;
  // Resume if suspended (browser autoplay policy)
  if (ac.state === "suspended") ac.resume().catch(() => {});
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.12);
  } catch { /* audio not available */ }
}

// ── Scoped BroadcastChannel (one per tenant slug) ────────────────────────────
let _broadcastChannel: BroadcastChannel | null = null;
let _broadcastSlug: string | null = null;
function getBroadcastChannel(slug: string): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  try {
    if (!_broadcastChannel || _broadcastSlug !== slug) {
      if (_broadcastChannel) try { _broadcastChannel.close(); } catch { /* ok */ }
      _broadcastChannel = new BroadcastChannel(`buleje-cart-sync-${slug}`);
      _broadcastSlug = slug;
    }
    return _broadcastChannel;
  } catch {
    return null;
  }
}

/** Build a tenant-scoped localStorage key: buleje-{slug}-{key} */
function sk(slug: string, key: string): string {
  return slug ? `buleje-${slug}-${key}` : `buleje-${key}`;
}

export type CartItem = Product & { quantity: number; note?: string };

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  hasPendingOrder: boolean;
  confirmModalOpen: boolean;
  confirmFromCheckout: boolean;
  checkoutOpen: boolean;
};

type CartAction =
  | { type: "ADD_ITEM"; payload: Product }
  | { type: "ADD_MULTIPLE"; payload: { product: Product; quantity: number }[] }
  | { type: "REMOVE_ITEM"; payload: number }
  | { type: "UPDATE_QTY"; payload: { id: number; qty: number } }
  | { type: "CLEAR" }
  | { type: "TOGGLE" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "HYDRATE"; payload: CartItem[] }
  | { type: "MARK_ORDER_PENDING" }
  | { type: "CLEAR_PENDING_ORDER" }
  | { type: "OPEN_CONFIRM_MODAL"; fromCheckout?: boolean }
  | { type: "CLOSE_CONFIRM_MODAL" }
  | { type: "OPEN_CHECKOUT" }
  | { type: "CLOSE_CHECKOUT" }
  | { type: "SET_ITEM_NOTE"; payload: { id: number; note: string } };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "MARK_ORDER_PENDING":
      return { ...state, hasPendingOrder: true };
    case "CLEAR_PENDING_ORDER":
      return { ...state, hasPendingOrder: false, confirmModalOpen: false, confirmFromCheckout: false };
    case "OPEN_CONFIRM_MODAL":
      return { ...state, confirmModalOpen: true, confirmFromCheckout: action.fromCheckout ?? false };
    case "CLOSE_CONFIRM_MODAL":
      return { ...state, confirmModalOpen: false, confirmFromCheckout: false };
    case "OPEN_CHECKOUT":
      return { ...state, checkoutOpen: true, isOpen: false };
    case "CLOSE_CHECKOUT":
      return { ...state, checkoutOpen: false };
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        if (existing.quantity >= MAX_QTY) return state;
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.payload.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: 1 }],
      };
    }
    case "ADD_MULTIPLE": {
      const items = [...state.items];
      for (const entry of action.payload) {
        const idx = items.findIndex((i) => i.id === entry.product.id);
        if (idx >= 0) {
          items[idx] = { ...items[idx], quantity: Math.min(items[idx].quantity + entry.quantity, MAX_QTY) };
        } else {
          items.push({ ...entry.product, quantity: Math.min(entry.quantity, MAX_QTY) });
        }
      }
      return { ...state, items };
    }
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((i) => i.id !== action.payload) };
    case "UPDATE_QTY": {
      if (action.payload.qty <= 0) {
        return { ...state, items: state.items.filter((i) => i.id !== action.payload.id) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.payload.id ? { ...i, quantity: Math.min(action.payload.qty, MAX_QTY) } : i
        ),
      };
    }
    case "CLEAR":
      return { ...state, items: [] };
    case "TOGGLE":
      return { ...state, isOpen: !state.isOpen };
    case "OPEN":
      return { ...state, isOpen: true };
    case "CLOSE":
      return { ...state, isOpen: false };
    case "HYDRATE":
      return { ...state, items: action.payload };
    case "SET_ITEM_NOTE":
      return { ...state, items: state.items.map(i => i.id === action.payload.id ? { ...i, note: action.payload.note || undefined } : i) };
    default:
      return state;
  }
}

type CartCtx = {
  items: CartItem[];
  isOpen: boolean;
  count: number;
  total: number;
  hasPendingOrder: boolean;
  confirmModalOpen: boolean;
  confirmFromCheckout: boolean;
  checkoutOpen: boolean;
  markOrderPending: () => void;
  clearPendingOrder: () => void;
  openConfirmModal: (fromCheckout?: boolean) => void;
  closeConfirmModal: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  addItem: (p: Product) => void;
  addMultiple: (items: { product: Product; quantity: number }[]) => void;
  removeItem: (id: number) => void;
  updateQty: (id: number, qty: number) => void;
  setItemNote: (id: number, note: string) => void;
  clear: () => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartCtx | null>(null);

const defaultState: CartState = { items: [], isOpen: false, hasPendingOrder: false, confirmModalOpen: false, confirmFromCheckout: false, checkoutOpen: false };

export function CartProvider({ children, tenantSlug = "main" }: { children: ReactNode; tenantSlug?: string }) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const hydratedRef = useRef(false);
  const slugRef = useRef(tenantSlug);

  // Mantener slugRef sincronizado en un effect (no se puede mutar refs en render — react-hooks/refs)
  useEffect(() => {
    slugRef.current = tenantSlug;
  }, [tenantSlug]);

  // Hydrate from localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    const s = slugRef.current;
    try {
      const saved = localStorage.getItem(sk(s, "cart"));
      const items = saved ? JSON.parse(saved) : [];
      if (Array.isArray(items) && items.length > 0) {
        dispatch({ type: "HYDRATE", payload: items });

        // Validate cart items still exist in DB — remove stale/deleted products
        fetch("/api/products?active=true")
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            const products: { id: number }[] = Array.isArray(data) ? data : [];
            const validIds = new Set(products.map((p: { id: number }) => p.id));
            const validItems = items.filter((item: CartItem) => validIds.has(item.id));
            if (validItems.length !== items.length) {
              // Some items were deleted — update cart
              dispatch({ type: "HYDRATE", payload: validItems });
              localStorage.setItem(sk(s, "cart"), JSON.stringify(validItems));
            }
          })
          .catch(() => { /* silently ignore — cart stays as-is */ });
      }
      if (localStorage.getItem(sk(s, "pending")) === "1") {
        dispatch({ type: "MARK_ORDER_PENDING" });
      }
      // Check for reorder items (set from /cuenta page)
      const reorder = localStorage.getItem(sk(s, "reorder"));
      if (reorder) {
        localStorage.removeItem(sk(s, "reorder"));
        const reorderItems = JSON.parse(reorder);
        if (Array.isArray(reorderItems) && reorderItems.length > 0) {
          dispatch({
            type: "ADD_MULTIPLE",
            payload: reorderItems.map((r: { id: number; name: string; price: number; image: string; unit: string; category: string; quantity: number }) => ({
              product: { id: r.id, name: r.name, price: r.price, image: r.image, unit: r.unit, category: r.category },
              quantity: r.quantity,
            })),
          });
          // Auto-open cart to show the added items
          setTimeout(() => dispatch({ type: "OPEN" }), 300);
        }
      }
    } catch {}
    // Mark hydration complete AFTER all dispatches above
    hydratedRef.current = true;
  }, []);

  // Multi-tab cart sync with BroadcastChannel API
  useEffect(() => {
    const channel = getBroadcastChannel(slugRef.current);
    if (!channel) return;

    // Listen to messages from other tabs (skip own messages to avoid self-echo loop)
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.tabId === TAB_ID) return;

      const { type, payload } = event.data;

      switch (type) {
        case "CART_UPDATE":
          // Sync cart items from another tab
          if (Array.isArray(payload)) {
            dispatch({ type: "HYDRATE", payload });
          }
          break;
        case "CART_CLEAR":
          dispatch({ type: "CLEAR" });
          break;
        case "PENDING_STATUS":
          if (payload === true) {
            dispatch({ type: "MARK_ORDER_PENDING" });
          } else {
            dispatch({ type: "CLEAR_PENDING_ORDER" });
          }
          break;
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
    };
  }, []);

  // Persist to localStorage — only after hydration to prevent overwriting saved cart
  useEffect(() => {
    if (!hydratedRef.current) return;
    const s = slugRef.current;
    localStorage.setItem(sk(s, "cart"), JSON.stringify(state.items));
    // Track last-modified timestamp for abandoned-cart recovery
    if (state.items.length > 0) {
      localStorage.setItem(sk(s, "cart-ts"), Date.now().toString());
    } else {
      localStorage.removeItem(sk(s, "cart-ts"));
      localStorage.removeItem(sk(s, "cart-dismissed"));
    }

    // Broadcast cart changes to other tabs (reuse shared channel)
    const channel = getBroadcastChannel(s);
    if (channel) {
      try {
        channel.postMessage({ type: "CART_UPDATE", payload: state.items, tabId: TAB_ID });
      } catch { /* Silently fail */ }
    }
  }, [state.items]);

  // Sync cart to server when customer is identified (debounced)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const s = slugRef.current;
    const phone = (() => {
      try {
        const c = localStorage.getItem(sk(s, "customer"));
        if (c) { const p = JSON.parse(c); return p?.phone?.replace(/\D/g, ""); }
      } catch { /* ignore */ }
      return null;
    })();
    if (!phone || phone.length < 6 || state.items.length === 0) return;

    const timeout = setTimeout(() => {
      fetch(`/api/cart/${encodeURIComponent(phone)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: state.items }),
      }).catch(() => { /* silent — local cart is primary */ });
    }, 2000); // 2s debounce

    return () => clearTimeout(timeout);
  }, [state.items]);

  // On mount: if customer is identified, try to restore from server if local is empty
  useEffect(() => {
    const s = slugRef.current;
    const phone = (() => {
      try {
        const c = localStorage.getItem(sk(s, "customer"));
        if (c) { const p = JSON.parse(c); return p?.phone?.replace(/\D/g, ""); }
      } catch { /* ignore */ }
      return null;
    })();
    if (!phone || phone.length < 6) return;

    const localCart = localStorage.getItem(sk(s, "cart"));
    const localItems = localCart ? JSON.parse(localCart) : [];
    if (Array.isArray(localItems) && localItems.length > 0) return; // local has items, skip

    fetch(`/api/cart/${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.items) && data.items.length > 0) {
          dispatch({ type: "HYDRATE", payload: data.items });
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    const s = slugRef.current;
    localStorage.setItem(sk(s, "pending"), state.hasPendingOrder ? "1" : "0");

    // Broadcast pending status to other tabs (reuse shared channel)
    const channel = getBroadcastChannel(s);
    if (channel) {
      try {
        channel.postMessage({ type: "PENDING_STATUS", payload: state.hasPendingOrder, tabId: TAB_ID });
      } catch { /* Silently fail */ }
    }
  }, [state.hasPendingOrder]);

  const count = state.items.reduce((acc, i) => acc + i.quantity, 0);
  const total = state.items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const addItem = useCallback((p: Product) => {
    dispatch({ type: "ADD_ITEM", payload: p });
    playPopSound();
  }, []);
  const addMultiple = useCallback((items: { product: Product; quantity: number }[]) => dispatch({ type: "ADD_MULTIPLE", payload: items }), []);
  const removeItem = useCallback((id: number) => dispatch({ type: "REMOVE_ITEM", payload: id }), []);
  const updateQty = useCallback(
    (id: number, qty: number) => dispatch({ type: "UPDATE_QTY", payload: { id, qty } }),
    []
  );
  const setItemNote = useCallback((id: number, note: string) => dispatch({ type: "SET_ITEM_NOTE", payload: { id, note } }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const toggle = useCallback(() => dispatch({ type: "TOGGLE" }), []);
  const openCart = useCallback(() => dispatch({ type: "OPEN" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const markOrderPending = useCallback(() => dispatch({ type: "MARK_ORDER_PENDING" }), []);
  const clearPendingOrder = useCallback(() => dispatch({ type: "CLEAR_PENDING_ORDER" }), []);
  const openConfirmModal = useCallback((fromCheckout = false) => dispatch({ type: "OPEN_CONFIRM_MODAL", fromCheckout }), []);
  const closeConfirmModal = useCallback(() => dispatch({ type: "CLOSE_CONFIRM_MODAL" }), []);
  const openCheckout = useCallback(() => dispatch({ type: "OPEN_CHECKOUT" }), []);
  const closeCheckout = useCallback(() => dispatch({ type: "CLOSE_CHECKOUT" }), []);

  return (
    <CartContext.Provider
      value={{ items: state.items, isOpen: state.isOpen, count, total, hasPendingOrder: state.hasPendingOrder, confirmModalOpen: state.confirmModalOpen, confirmFromCheckout: state.confirmFromCheckout, checkoutOpen: state.checkoutOpen, markOrderPending, clearPendingOrder, openConfirmModal, closeConfirmModal, openCheckout, closeCheckout, addItem, addMultiple, removeItem, updateQty, setItemNote, clear, toggle, open: openCart, close }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
