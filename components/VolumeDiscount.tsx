"use client";

import { useState, useEffect, startTransition } from "react";
import { Percent, X, ShoppingCart } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useHasCompletedFirstOrder } from "@/hooks/use-first-order";
import { cn } from "@/lib/utils";

const TIERS = [
  { min: 5,  discount: 3,  label: "3% OFF" },
  { min: 10, discount: 5,  label: "5% OFF" },
  { min: 15, discount: 8,  label: "8% OFF" },
  { min: 20, discount: 10, label: "10% OFF" },
];

export default function VolumeDiscount() {
  const { items } = useCart();
  const hasFirstOrder = useHasCompletedFirstOrder();
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("buleje-vd-dismissed") === "1";
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    startTransition(() => setMounted(true));
  }, []);

  // Solo mostrar después de la primera compra
  if (!mounted || dismissed || totalQty < 3 || hasFirstOrder !== true) return null;

  // Current tier
  const currentTier = [...TIERS].reverse().find((t) => totalQty >= t.min);
  // Next tier
  const nextTier = TIERS.find((t) => totalQty < t.min);

  return (
    <>
      {/* ── Mobile: compact dismissible pill ─────────────────────────────── */}
      <div className="sm:hidden fixed bottom-24 left-4 z-40 animate-[fadeUp_0.4s_ease-out] max-w-[calc(100vw-7rem)]">
        <div className="flex items-center gap-2 bg-[var(--surface-raised)] rounded-full shadow-[var(--shadow-lg)] border border-[var(--rule-base)] pl-2.5 pr-1.5 py-1.5">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 shrink-0">
            <Percent className="h-3.5 w-3.5 text-primary" />
          </span>
          <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">
            {currentTier ? (
              <><span className="text-primary">{currentTier.label}</span> por volumen{nextTier ? ` · +${nextTier.min - totalQty} para ${nextTier.label}` : "✓"}</>
            ) : (
              <>Agrega {(nextTier?.min ?? 5) - totalQty} para {nextTier?.label ?? "3% OFF"}</>
            )}
          </p>
          <button
            onClick={() => { setDismissed(true); sessionStorage.setItem("buleje-vd-dismissed", "1"); }}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface transition-colors text-muted shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Desktop: full card ────────────────────────────────────────────── */}
      <div className="hidden sm:block fixed bottom-24 right-4 w-80 z-40 animate-[fadeUp_0.4s_ease-out]">
        <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] p-4 relative">
          <button
            onClick={() => { setDismissed(true); sessionStorage.setItem("buleje-vd-dismissed", "1"); }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface transition-colors text-muted"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              {currentTier ? (
                <>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    ¡Tienes <span className="text-primary">{currentTier.label}</span> por volumen!
                  </p>
                  <p className="text-xs text-muted">
                    {totalQty} productos en tu carrito
                    {nextTier && (
                      <> · Agrega {nextTier.min - totalQty} más para {nextTier.label}</>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    ¡Casi llegas al descuento!
                  </p>
                  <p className="text-xs text-muted">
                    Agrega {(nextTier?.min ?? 5) - totalQty} productos más para {nextTier?.label ?? "3% OFF"}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-1">
            {TIERS.map((tier, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-surface overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-[var(--dur-slow)]",
                      totalQty >= tier.min ? "bg-primary" : "bg-gray-200 dark:bg-surface"
                    )}
                    style={{ width: totalQty >= tier.min ? "100%" : `${Math.min(100, (totalQty / tier.min) * 100)}%` }}
                  />
                </div>
                <span className={cn(
                  "text-[length:var(--ts-2xs)] font-bold",
                  totalQty >= tier.min ? "text-primary" : "text-muted"
                )}>
                  {tier.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1 text-[length:var(--ts-2xs)] text-muted">
            <ShoppingCart className="h-3 w-3" />
            <span>{totalQty} / {TIERS[TIERS.length - 1].min}+ productos</span>
          </div>
        </div>
      </div>
    </>
  );
}
