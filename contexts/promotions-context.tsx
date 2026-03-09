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
    fetch("/api/promotions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DbPromotion[]) => {
        const now = new Date();
        setPromotions(
          data.filter(
            (p) => p.active && (!p.expiresAt || new Date(p.expiresAt) > now)
          )
        );
      })
      .catch(() => {});
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
