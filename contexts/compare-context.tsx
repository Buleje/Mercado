"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type CompareProduct = { id: number; name: string; category: string; price: number; image: string; unit: string; badge?: string; stock?: number; rating?: number; reviewCount?: number; description?: string };

type CompareCtx = {
  items: CompareProduct[];
  add: (p: CompareProduct) => void;
  remove: (id: number) => void;
  isIn: (id: number) => boolean;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
};

const Ctx = createContext<CompareCtx | null>(null);

const MAX = 3;

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareProduct[]>([]);
  const [open, setOpen] = useState(false);

  const add = useCallback((p: CompareProduct) => {
    setItems(prev => {
      if (prev.length >= MAX || prev.some(x => x.id === p.id)) return prev;
      return [...prev, p];
    });
  }, []);

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(x => x.id !== id));
  }, []);

  const isIn = useCallback((id: number) => items.some(x => x.id === id), [items]);

  const clear = useCallback(() => { setItems([]); setOpen(false); }, []);

  return (
    <Ctx.Provider value={{ items, add, remove, isIn, clear, open, setOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCompare must be inside CompareProvider");
  return ctx;
}
