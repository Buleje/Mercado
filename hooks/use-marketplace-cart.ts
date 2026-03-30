"use client";

import { useState, useEffect, useCallback } from "react";

// ---------- tipos ----------

export interface CartItem {
  storeId: string;
  storeName: string;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
  unit: string | null;
}

interface CartState {
  items: CartItem[];
}

const STORAGE_KEY = "marketplace-cart";
const EMPTY_STATE: CartState = { items: [] };

// ---------- helpers de storage ----------

function readStorage(): CartState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as CartState;
    return parsed && Array.isArray(parsed.items) ? parsed : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function writeStorage(state: CartState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("marketplace-cart-update", { detail: state }));
  } catch {
    // storage lleno — silent fail
  }
}

// ---------- hook ----------

export function useMarketplaceCart() {
  const [items, setItems] = useState<CartItem[]>(() => readStorage().items);

  // Sincronizar si otra pestaña cambia el carrito
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setItems(readStorage().items);
      }
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<CartState>;
      setItems(ce.detail.items);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("marketplace-cart-update", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("marketplace-cart-update", onCustom);
    };
  }, []);

  // Persistir cuando cambian los items
  useEffect(() => {
    writeStorage({ items });
  }, [items]);

  // ---------- acciones ----------

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      setItems((prev) => {
        const idx = prev.findIndex(
          (i) => i.storeId === item.storeId && i.productId === item.productId
        );
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            quantity: updated[idx].quantity + (item.quantity ?? 1),
          };
          return updated;
        }
        return [...prev, { ...item, quantity: item.quantity ?? 1 }];
      });
    },
    []
  );

  const removeItem = useCallback((storeId: string, productId: number) => {
    setItems((prev) =>
      prev.filter((i) => !(i.storeId === storeId && i.productId === productId))
    );
  }, []);

  const updateQuantity = useCallback(
    (storeId: string, productId: number, quantity: number) => {
      if (quantity <= 0) {
        removeItem(storeId, productId);
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.storeId === storeId && i.productId === productId
            ? { ...i, quantity }
            : i
        )
      );
    },
    [removeItem]
  );

  const clearStore = useCallback((storeId: string) => {
    setItems((prev) => prev.filter((i) => i.storeId !== storeId));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  // ---------- derivados ----------

  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);

  const totalByStore = items.reduce<Record<string, { storeName: string; total: number }>>(
    (acc, i) => {
      if (!acc[i.storeId]) {
        acc[i.storeId] = { storeName: i.storeName, total: 0 };
      }
      acc[i.storeId].total += i.price * i.quantity;
      return acc;
    },
    {}
  );

  const grandTotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // Agrupar items por tienda
  const byStore = items.reduce<Record<string, { storeName: string; items: CartItem[] }>>(
    (acc, i) => {
      if (!acc[i.storeId]) {
        acc[i.storeId] = { storeName: i.storeName, items: [] };
      }
      acc[i.storeId].items.push(i);
      return acc;
    },
    {}
  );

  return {
    items,
    byStore,
    itemCount,
    totalByStore,
    grandTotal,
    addItem,
    removeItem,
    updateQuantity,
    clearStore,
    clearAll,
  };
}
