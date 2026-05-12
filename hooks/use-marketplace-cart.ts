"use client";

import { useState, useEffect, useCallback } from "react";

// ---------- tipos ----------

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartItem {
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeProductId: string;
  productId: number;
  name: string;
  /** Precio total = basePrice + sum(priceDelta). Lo que ve el cliente y va a checkout (server re-valida). */
  price: number;
  quantity: number;
  image: string | null;
  unit: string | null;
  category?: string | null;
  storeZone?: string | null;
  /** Precio del producto sin modifiers; sirve para mostrar breakdown. */
  basePrice?: number;
  /** Opciones de variaciones elegidas por el cliente. */
  modifiers?: SelectedModifier[];
  /** Hash de modifier ids para deduplicar cart entries. */
  modifierHash?: string;
  /**
   * Stock disponible al momento de agregar al carrito. null = sin límite
   * (restaurante / no controla). El front bloquea el inc si quantity >= stock
   * para evitar el 409 del checkout. Snapshot — no refresca al cambiar DB.
   */
  stock?: number | null;
}

/** Crea un hash determinístico a partir de los optionIds elegidos. */
export function modifierHashOf(modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return "";
  return modifiers
    .map((m) => m.optionId)
    .sort()
    .join("|");
}

/** Compara dos items para decidir si son la misma "linea" del carrito. */
export function sameCartLine(a: CartItem, b: CartItem): boolean {
  if (a.storeId !== b.storeId) return false;
  if (a.productId !== b.productId) return false;
  return (a.modifierHash ?? "") === (b.modifierHash ?? "");
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
  // Mayo 2026 (designer audit P0 — cart no persiste entre rutas):
  // arrancamos SIEMPRE vacío para evitar hydration mismatch (en SSR
  // readStorage() retorna []), pero el effect de abajo hidrata desde
  // localStorage en mount y un guard `hydrated` evita pisar storage
  // con [] antes de leer el valor real.
  const [items, setItems] = useState<CartItem[]>(EMPTY_STATE.items);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage en mount (solo cliente)
  useEffect(() => {
    setItems(readStorage().items);
    setHydrated(true);
  }, []);

  // On mount: validate cart items still exist — remove stale/deleted products.
  //
  // Endpoint: /api/marketplace/products/check-exists cruza stores (marketplace
  // multi-tenant). El endpoint legacy /api/products?active=true solo devuelve
  // productos del tenant "main" → borraba el carrito al abrir el sidebar si los
  // items venian de otros stores (mismo bug del cart-context.tsx, fix 2026-04-19).
  //
  // Guard: si por alguna razon la respuesta no es confiable (empty, error,
  // cleaned.length === 0), NUNCA borrar el carrito entero. Preservamos como-esta.
  useEffect(() => {
    const stored = readStorage().items;
    if (stored.length === 0) return;
    const idsQuery = stored.map(i => i.productId).join(",");
    const controller = new AbortController();
    fetch(`/api/marketplace/products/check-exists?ids=${idsQuery}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: { existingIds?: number[]; missingIds?: number[] } | null) => {
        if (!data || !Array.isArray(data.existingIds)) return;
        const existing = new Set<number>(data.existingIds);
        const cleaned = stored.filter(i => existing.has(i.productId));
        // Guard: preservar carrito si TODOS "desaparecerian" (senal dudosa).
        if (cleaned.length === 0 && stored.length > 0) return;
        if (cleaned.length !== stored.length) {
          setItems(cleaned);
          writeStorage({ items: cleaned });
        }
      })
      .catch(() => { /* silently ignore — cart stays as-is or aborted */ });
    return () => { controller.abort(); };
  }, []);

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

  // Persistir cuando cambian los items — pero NO antes de hidratar
  // (si no, el primer mount con items=[] pisaría el localStorage y
  // borraría el carrito de otras instancias del hook).
  useEffect(() => {
    if (!hydrated) return;
    writeStorage({ items });
  }, [items, hydrated]);

  // ---------- acciones ----------

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      const incomingHash = item.modifierHash ?? modifierHashOf(item.modifiers);
      const normalized: CartItem = {
        ...item,
        quantity: item.quantity ?? 1,
        modifierHash: incomingHash,
      };

      setItems((prev) => {
        // Unicidad por (storeId, productId, modifierHash) — mismo producto con
        // modifiers distintos = lineas distintas en el carrito.
        const idx = prev.findIndex(
          (i) =>
            i.storeId === normalized.storeId &&
            i.productId === normalized.productId &&
            (i.modifierHash ?? "") === incomingHash,
        );
        if (idx !== -1) {
          const updated = [...prev];
          const existing = updated[idx];
          const requested = existing.quantity + (item.quantity ?? 1);
          // Stock guard: si el producto controla stock (no es null), tope a
          // ese máximo para evitar 409 al checkout. null = sin límite.
          const cap = item.stock ?? existing.stock;
          const finalQty = cap != null && cap > 0 ? Math.min(requested, cap) : requested;
          updated[idx] = {
            ...existing,
            quantity: finalQty,
            // Refrescar stock snapshot si vino actualizado.
            stock: item.stock !== undefined ? item.stock : existing.stock,
          };
          return updated;
        }
        return [...prev, normalized];
      });
    },
    []
  );

  const removeItem = useCallback(
    (storeId: string, productId: number, modifierHash?: string) => {
      setItems((prev) =>
        prev.filter((i) => {
          if (i.storeId !== storeId || i.productId !== productId) return true;
          // Si se pasa modifierHash, solo borra esa linea especifica.
          if (modifierHash !== undefined) {
            return (i.modifierHash ?? "") !== modifierHash;
          }
          // Sin modifierHash: borra TODAS las lineas de ese producto (compat).
          return false;
        }),
      );
    },
    [],
  );

  const updateQuantity = useCallback(
    (storeId: string, productId: number, quantity: number, modifierHash?: string) => {
      if (quantity <= 0) {
        removeItem(storeId, productId, modifierHash);
        return;
      }
      setItems((prev) =>
        prev.map((i) => {
          if (i.storeId !== storeId || i.productId !== productId) return i;
          if (modifierHash !== undefined && (i.modifierHash ?? "") !== modifierHash) {
            return i;
          }
          // Stock guard: si el producto controla stock, capamos a ese máximo
          // para evitar enviar quantities imposibles al backend (409).
          const cap = i.stock;
          const final = cap != null && cap > 0 ? Math.min(quantity, cap) : quantity;
          return { ...i, quantity: final };
        }),
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

  const totalByStore = items.reduce<Record<string, { storeName: string; storeSlug: string; total: number }>>(
    (acc, i) => {
      if (!acc[i.storeId]) {
        acc[i.storeId] = { storeName: i.storeName, storeSlug: i.storeSlug, total: 0 };
      }
      acc[i.storeId].total += i.price * i.quantity;
      return acc;
    },
    {}
  );

  const grandTotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  // Agrupar items por tienda
  const byStore = items.reduce<Record<string, { storeName: string; storeSlug: string; items: CartItem[] }>>(
    (acc, i) => {
      if (!acc[i.storeId]) {
        acc[i.storeId] = { storeName: i.storeName, storeSlug: i.storeSlug, items: [] };
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
