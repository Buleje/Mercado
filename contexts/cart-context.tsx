"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";

export type CartItem = Product & { quantity: number };

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
  | { type: "CLOSE_CHECKOUT" };

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
          items[idx] = { ...items[idx], quantity: items[idx].quantity + entry.quantity };
        } else {
          items.push({ ...entry.product, quantity: entry.quantity });
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
          i.id === action.payload.id ? { ...i, quantity: action.payload.qty } : i
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
  clear: () => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartCtx | null>(null);

const defaultState: CartState = { items: [], isOpen: false, hasPendingOrder: false, confirmModalOpen: false, confirmFromCheckout: false, checkoutOpen: false };

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, defaultState);

  // Hydrate from localStorage after mount to avoid SSR/client mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bsm-cart");
      const items = saved ? JSON.parse(saved) : [];
      if (Array.isArray(items) && items.length > 0) {
        dispatch({ type: "HYDRATE", payload: items });
      }
      if (localStorage.getItem("bsm-pending") === "1") {
        dispatch({ type: "MARK_ORDER_PENDING" });
      }
      // Check for reorder items (set from /cuenta page)
      const reorder = localStorage.getItem("bsm-reorder");
      if (reorder) {
        localStorage.removeItem("bsm-reorder");
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
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("bsm-cart", JSON.stringify(state.items));
    // Track last-modified timestamp for abandoned-cart recovery
    if (state.items.length > 0) {
      localStorage.setItem("bsm-cart-ts", Date.now().toString());
    } else {
      localStorage.removeItem("bsm-cart-ts");
      localStorage.removeItem("bsm-cart-dismissed");
    }
  }, [state.items]);

  useEffect(() => {
    localStorage.setItem("bsm-pending", state.hasPendingOrder ? "1" : "0");
  }, [state.hasPendingOrder]);

  const count = state.items.reduce((acc, i) => acc + i.quantity, 0);
  const total = state.items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const addItem = useCallback((p: Product) => dispatch({ type: "ADD_ITEM", payload: p }), []);
  const addMultiple = useCallback((items: { product: Product; quantity: number }[]) => dispatch({ type: "ADD_MULTIPLE", payload: items }), []);
  const removeItem = useCallback((id: number) => dispatch({ type: "REMOVE_ITEM", payload: id }), []);
  const updateQty = useCallback(
    (id: number, qty: number) => dispatch({ type: "UPDATE_QTY", payload: { id, qty } }),
    []
  );
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
      value={{ items: state.items, isOpen: state.isOpen, count, total, hasPendingOrder: state.hasPendingOrder, confirmModalOpen: state.confirmModalOpen, confirmFromCheckout: state.confirmFromCheckout, checkoutOpen: state.checkoutOpen, markOrderPending, clearPendingOrder, openConfirmModal, closeConfirmModal, openCheckout, closeCheckout, addItem, addMultiple, removeItem, updateQty, clear, toggle, open: openCart, close }}
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
