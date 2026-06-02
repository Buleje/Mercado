"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { DbPromotion } from "@/lib/jsondb";

type PromotionsCtx = {
  promotions: DbPromotion[];
  getBestPromotion: (total: number, phone?: string) => DbPromotion | null;
};

const PromotionsContext = createContext<PromotionsCtx | null>(null);

export function PromotionsProvider({ children }: { children: ReactNode }) {
  const [promotions, setPromotions] = useState<DbPromotion[]>([]);

  useEffect(() => {
    // Perf (2026-06-02): las promociones no se necesitan en el primer pintado
    // (recién en carrito/checkout). Difiere el fetch a idle para no competir con
    // los fetches críticos del home.
    const run = () =>
      fetch("/api/promotions")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: DbPromotion[]) => {
          const now = new Date();
          setPromotions(
            data.filter((p) => p.active && (!p.expiresAt || new Date(p.expiresAt) > now)),
          );
        })
        .catch((err) => {
          // offline/red: reintenta en la próxima carga; no es crítico.
          console.warn("[promotions] reconcile failed", String(err));
        });
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timerId = setTimeout(run, 1200);
    }
    return () => {
      if (idleId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, []);

  const getBestPromotion = useCallback(
    (total: number, phone?: string): DbPromotion | null => {
      const applicable = promotions.filter((p) => {
        if (p.minPurchase && total < p.minPurchase) return false;
        if (p.targetType === "specific") {
          if (!phone) return false;
          const phones = (p.targetPhones ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (!phones.includes(phone)) return false;
        }
        return true;
      });
      if (!applicable.length) return null;
      return applicable.reduce((best, p) =>
        p.discountPercent > best.discountPercent ? p : best
      );
    },
    [promotions]
  );

  return (
    <PromotionsContext.Provider value={{ promotions, getBestPromotion }}>
      {children}
    </PromotionsContext.Provider>
  );
}

export function usePromotions() {
  const ctx = useContext(PromotionsContext);
  if (!ctx) throw new Error("usePromotions must be used within PromotionsProvider");
  return ctx;
}
