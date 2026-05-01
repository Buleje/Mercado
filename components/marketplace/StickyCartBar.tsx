"use client";

/**
 * StickyCartBar — barra inferior flotante que aparece cuando hay items
 * en el carrito de marketplace. Solo mobile/tablet (lg:hidden).
 *
 * Comportamiento:
 *   - Hidden si items === 0
 *   - Slide-up desde bottom con framer-motion al entrar
 *   - Tap en la barra → expande panel con últimos 3 items + qty steppers
 *   - Dismiss button (X) — esconde la barra durante la sesión actual.
 *     Reaparece cuando el subtotal cambia (item agregado/removido)
 *   - Aria-live polite — anuncia el subtotal cuando cambia
 *
 * Reglas:
 *   - Totales solo preview — el server recalcula en checkout (CLAUDE.md #6)
 *   - No bloquea click outside — tap "Ver carrito" o cerrar manual
 */

import Link from "next/link";
import Image from "next/image";
import { useMemo, useEffect, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  ArrowRight,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
} from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const SS_KEY = "buleje:sticky-cart:dismissed-subtotal";
const PREVIEW_COUNT = 3;

export default function StickyCartBar() {
  const { items, updateQuantity, removeItem } = useMarketplaceCart();
  const [expanded, setExpanded] = useState(false);

  const { totalQty, subtotal } = useMemo(() => {
    let q = 0;
    let s = 0;
    for (const it of items) {
      q += it.quantity;
      s += it.price * it.quantity;
    }
    return { totalQty: q, subtotal: s };
  }, [items]);

  // Últimos N items — los más recientes están al final del array (addItem push)
  const recentItems = useMemo(
    () => items.slice(-PREVIEW_COUNT).reverse(),
    [items],
  );

  // Dismiss state — recordamos el último subtotal en que el usuario cerró la
  // barra. Si el subtotal cambia (agregaron o quitaron algo), la barra
  // reaparece automáticamente.
  const [dismissedSubtotal, setDismissedSubtotal] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw != null) {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed)) setDismissedSubtotal(parsed);
    }
  }, []);

  // Auto-cerrar el panel expandido cuando el carrito queda vacío
  useEffect(() => {
    if (totalQty === 0 && expanded) setExpanded(false);
  }, [totalQty, expanded]);

  const isVisible = totalQty > 0 && dismissedSubtotal !== subtotal;

  const handleDismiss = () => {
    setDismissedSubtotal(subtotal);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SS_KEY, String(subtotal));
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          aria-live="polite"
          className="fixed bottom-[76px] sm:bottom-3 left-3 right-3 z-40 lg:hidden"
        >
          {/* ── Panel expandido — miniaturas + qty steppers ─────────────────── */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: 12, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 12, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mb-2 overflow-hidden rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]"
              >
                <div className="px-3 py-3 max-h-[45vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--surface-canvas)]/70">
                      Últimos agregados
                    </span>
                    {items.length > PREVIEW_COUNT && (
                      <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--surface-canvas)]/60">
                        +{items.length - PREVIEW_COUNT} más
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2.5" role="list">
                    {recentItems.map((it) => (
                      <li
                        key={`${it.storeId}-${it.productId}`}
                        className="flex items-center gap-3 rounded-xl bg-white/5 px-2.5 py-2"
                      >
                        <div className="shrink-0 h-12 w-12 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
                          {it.image ? (
                            <Image
                              src={it.image}
                              alt={it.name}
                              width={48}
                              height={48}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <span className="text-[length:var(--ts-2xs)] font-black tracking-wider text-white/60">
                              {it.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight line-clamp-1">
                            {it.name}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--surface-canvas)]/65">
                            {fmt(it.price)} {it.unit ? `· ${it.unit}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(it.storeId, it.productId, it.quantity - 1)
                            }
                            aria-label={`Disminuir ${it.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 active:scale-95 transition"
                          >
                            {it.quantity === 1 ? (
                              <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                            ) : (
                              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            )}
                          </button>
                          <span className="min-w-[1.5rem] text-center text-sm font-black tabular-nums">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(it.storeId, it.productId, it.quantity + 1)
                            }
                            aria-label={`Aumentar ${it.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent)]/90 active:scale-95 transition"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Bar principal ─────────────────────────────────────────────── */}
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Cerrar resumen" : "Ver resumen del carrito"}
              className="flex-1 flex items-center justify-between gap-3 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] active:scale-[0.99] transition-transform text-left"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
                  <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
                  <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--surface-canvas)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--text-primary)] ring-2 ring-[var(--text-primary)]">
                    {totalQty > 99 ? "99+" : totalQty}
                  </span>
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--surface-canvas)]/70 inline-flex items-center gap-1">
                    Tu carrito
                    {expanded ? (
                      <ChevronDown className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    ) : (
                      <ChevronUp className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    )}
                  </span>
                  <span className="text-base font-black tabular-nums leading-tight">
                    {fmt(subtotal)}
                  </span>
                </span>
              </span>
              <Link
                href="/marketplace/carrito"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-bold text-white shrink-0 active:scale-95 transition"
              >
                Ver carrito
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </button>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Ocultar barra del carrito"
              className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-[var(--text-primary)]/85 text-[var(--surface-canvas)] px-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] hover:bg-[var(--text-primary)] active:scale-95 transition-all"
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
