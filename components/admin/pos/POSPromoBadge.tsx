"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

// ── Promo Badge (Mejora 3: precio por cantidad) ──────────────────────────────

export default function PromoBadge({ productId, quantity, unitPrice }: { productId: number; quantity: number; unitPrice: number }) {
  const [promo, setPromo] = useState<{ type: string; buyQty: number; payPrice: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/promotions?productId=${productId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const p = data[0];
          if (p.buyQty && p.payPrice) setPromo({ type: p.type || "NxM", buyQty: p.buyQty, payPrice: p.payPrice });
          else setPromo(null);
        } else {
          setPromo(null);
        }
      })
      .catch((err) => logger.error("[pos-promo] fetch promo failed", { error: String(err) }));
    return () => { cancelled = true; };
  }, [productId]);

  if (!promo) return null;
  const normalPrice = promo.buyQty * unitPrice;
  const saving = normalPrice - promo.payPrice;
  const applied = quantity >= promo.buyQty;
  return (
    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1 py-0.5 rounded", applied ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]")}>
      {promo.buyQty}xS/{Number(promo.payPrice).toFixed(0)}{saving > 0 ? ` (ahorro S/${saving.toFixed(0)})` : ""}
    </span>
  );
}
