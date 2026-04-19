"use client";

/**
 * QuickAddContext — drawer lateral para "agregar rapido al carrito"
 *
 * Flujo:
 *   1. User hace click en boton "+" de cualquier ProductCard
 *   2. Se llama openQuickAdd(product) — abre drawer lateral desde la derecha
 *   3. Drawer muestra: imagen(es), nombre, precio, descripcion, variaciones (si hay)
 *      + quantity stepper + boton "Agregar al carrito"
 *   4. Al confirmar, se agrega la cantidad al carrito y se muestra toast
 *   5. Drawer queda abierto para agregar mas o cerrar
 *
 * La alternativa (click en la card entera) sigue llevando a /producto/[slug] — eso
 * NO lo toca este contexto; QuickAdd es solo para el flujo rapido.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Product } from "@/data/products";

interface QuickAddCtx {
  product: Product | null;
  isOpen: boolean;
  openQuickAdd: (p: Product) => void;
  close: () => void;
}

const Ctx = createContext<QuickAddCtx | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openQuickAdd = useCallback((p: Product) => {
    setProduct(p);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Mantengo el producto un momento para que la animacion de salida
    // no quede sin contenido. Se limpia cuando vuelve a abrir.
  }, []);

  return (
    <Ctx.Provider value={{ product, isOpen, openQuickAdd, close }}>
      {children}
    </Ctx.Provider>
  );
}

export function useQuickAdd(): QuickAddCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useQuickAdd debe usarse dentro de <QuickAddProvider>");
  }
  return ctx;
}

/**
 * Hook "safe" — no rompe si el provider no esta montado (SSR, rutas sin el
 * provider). Devuelve null en openQuickAdd, lo que permite callers hacer
 * fallback a addItem directo.
 */
export function useQuickAddSafe(): QuickAddCtx | null {
  return useContext(Ctx);
}
