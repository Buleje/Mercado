"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

export type CompareItem = {
  productId: number;
  storeSlug: string;
  name: string;
  price: number;
  image?: string | null;
  rating?: number;
  badges?: string[];
  stock?: number;
  /** Alias legacy — espejo de productId (store principal consume `id`). */
  id?: number;
  /** Campos legacy del store principal (CompareBar.tsx, ProductCard.tsx). */
  category?: string;
  unit?: string;
  badge?: string;
  reviewCount?: number;
  description?: string;
};

/** Tipo legacy usado por el store principal (components/ProductCard, CompareBar, ProductDetailClient). */
export type CompareProduct = {
  id: number;
  name: string;
  category?: string;
  price: number;
  image?: string;
  unit?: string;
  badge?: string;
  stock?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
};

type CompareInput = CompareItem | CompareProduct;

type CompareCtx = {
  items: CompareItem[];
  /** Agrega un item. Retorna false si ya hay 3 items. Acepta CompareItem o CompareProduct (legacy). */
  add: (item: CompareInput) => boolean;
  remove: (productId: number) => void;
  clear: () => void;
  has: (productId: number) => boolean;
  /** Alias legacy de `has`. */
  isIn: (productId: number) => boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Mensaje de advertencia cuando se intenta agregar un 4to item */
  limitWarning: string | null;
  clearLimitWarning: () => void;
};

/* ── Constantes ─────────────────────────────────────────────────────────────── */

const MAX = 3;
const STORAGE_KEY = "buleje.compare.v1";

/* ── Contexto ───────────────────────────────────────────────────────────────── */

const Ctx = createContext<CompareCtx | null>(null);

/* ── Provider ───────────────────────────────────────────────────────────────── */

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [open, setOpen] = useState(false);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  // SSR-safe: hidratar desde localStorage solo en cliente
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CompareItem[];
        if (Array.isArray(parsed)) {
          setItems(parsed.slice(0, MAX));
        }
      }
    } catch {
      // localStorage no disponible o JSON inválido — ignorar
    }
  }, []);

  // Persistir en localStorage cuando cambia items
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignorar errores de quota
    }
  }, [items]);

  const add = useCallback((input: CompareInput): boolean => {
    // Normalizar shape legacy (store principal) al shape nuevo (marketplace).
    // Guardamos TODOS los campos para que ambos consumidores funcionen.
    const productId = "productId" in input ? input.productId : input.id;
    const item: CompareItem = {
      productId,
      id: productId,
      storeSlug: "storeSlug" in input && input.storeSlug ? input.storeSlug : "legacy",
      name: input.name,
      price: input.price,
      image: input.image ?? null,
      rating: input.rating,
      stock: input.stock,
      badges:
        "badges" in input && input.badges
          ? input.badges
          : "badge" in input && input.badge
            ? [input.badge]
            : undefined,
      badge: "badge" in input ? input.badge : undefined,
      category: "category" in input ? input.category : undefined,
      unit: "unit" in input ? input.unit : undefined,
      reviewCount: "reviewCount" in input ? input.reviewCount : undefined,
      description: "description" in input ? input.description : undefined,
    };

    let result = false;
    setItems((prev) => {
      if (prev.length >= MAX || prev.some((x) => x.productId === item.productId)) {
        if (prev.length >= MAX) {
          setTimeout(() => {
            setLimitWarning("Maximo 3 productos para comparar. Quita uno para agregar otro.");
          }, 0);
        }
        result = false;
        return prev;
      }
      result = true;
      return [...prev, item];
    });
    return result;
  }, []);

  const remove = useCallback((productId: number) => {
    setItems((prev) => prev.filter((x) => x.productId !== productId));
  }, []);

  const has = useCallback(
    (productId: number) => items.some((x) => x.productId === productId),
    [items]
  );

  const clear = useCallback(() => {
    setItems([]);
    setOpen(false);
  }, []);

  const clearLimitWarning = useCallback(() => setLimitWarning(null), []);

  return (
    <Ctx.Provider
      value={{
        items,
        add,
        remove,
        clear,
        has,
        isIn: has,
        open,
        setOpen,
        limitWarning,
        clearLimitWarning,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useCompare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCompare must be inside CompareProvider");
  return ctx;
}
