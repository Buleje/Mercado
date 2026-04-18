"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type CompareProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  unit: string;
  badge?: string;
  stock?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
  storeSlug?: string;
  storeName?: string;
  /** @deprecated backward-compat alias for `id`. Use `id`. */
  productId?: number;
};

/** @deprecated backward-compat alias. Use `CompareProduct`. */
export type CompareItem = CompareProduct;

type CompareCtx = {
  items: CompareProduct[];
  add: (p: CompareProduct) => void;
  remove: (id: number) => void;
  isIn: (id: number) => boolean;
  /** @deprecated backward-compat alias for `isIn`. */
  has: (id: number) => boolean;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  max: number;
};

const Ctx = createContext<CompareCtx | null>(null);

const MAX = 4;
const STORAGE_KEY = "marketplace-compare";

function readStorage(): CompareProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompareProduct[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: CompareProduct[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage lleno — silent fail */
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setItems(readStorage());
    setHydrated(true);
  }, []);

  // Persist changes after hydration
  useEffect(() => {
    if (!hydrated) return;
    writeStorage(items);
  }, [items, hydrated]);

  const add = useCallback((p: CompareProduct) => {
    setItems((prev) => {
      if (prev.length >= MAX || prev.some((x) => x.id === p.id)) return prev;
      return [...prev, p];
    });
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const isIn = useCallback((id: number) => items.some((x) => x.id === id), [items]);

  const clear = useCallback(() => {
    setItems([]);
    setOpen(false);
  }, []);

  return (
    <Ctx.Provider value={{ items, add, remove, isIn, has: isIn, clear, open, setOpen, max: MAX }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCompare must be inside CompareProvider");
  return ctx;
}
