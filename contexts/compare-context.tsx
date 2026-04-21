"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { z } from "zod";
import { useValidatedLocalStorage } from "@/hooks/use-validated-local-storage";

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

/** Filtra entries sin id válido y coerce price string → number. */
const CompareEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  category: z.string().default(""),
  price: z.coerce.number().nonnegative().default(0),
  image: z.string().default(""),
  unit: z.string().default(""),
  badge: z.string().optional(),
  stock: z.number().int().nonnegative().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  description: z.string().optional(),
  storeSlug: z.string().optional(),
  storeName: z.string().optional(),
  productId: z.number().optional(),
});

const CompareArraySchema = z
  .array(z.unknown())
  .transform((arr) =>
    arr
      .map((item) => CompareEntrySchema.safeParse(item))
      .filter((r): r is { success: true; data: CompareProduct } => r.success)
      .map((r) => r.data)
      .slice(0, MAX),
  );

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useValidatedLocalStorage<CompareProduct[]>(
    STORAGE_KEY,
    CompareArraySchema,
    [],
  );
  const [open, setOpen] = useState(false);

  const add = useCallback(
    (p: CompareProduct) => {
      setItems((prev) => {
        if (prev.length >= MAX || prev.some((x) => x.id === p.id)) return prev;
        return [...prev, p];
      });
    },
    [setItems],
  );

  const remove = useCallback(
    (id: number) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    },
    [setItems],
  );

  const isIn = useCallback(
    (id: number) => items.some((x) => x.id === id),
    [items],
  );

  const clear = useCallback(() => {
    setItems([]);
    setOpen(false);
  }, [setItems]);

  return (
    <Ctx.Provider
      value={{ items, add, remove, isIn, has: isIn, clear, open, setOpen, max: MAX }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCompare must be inside CompareProvider");
  return ctx;
}
