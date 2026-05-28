"use client";

/**
 * StickyCartBar — Cart strip estilo Rappi/Uber Eats, pegado al BottomNav.
 *
 * Brandon 2026-05-18 (rediseno): antes era un pill flotante a 76px del fondo
 * con badge "3" + texto "3 items" + número (cantidad triplicada). Compitía
 * visualmente con el BottomNav (parecían 2 chromes separados).
 *
 * Ahora: strip full-width 52px pegado directo al BottomNav (sin gap),
 * mismo backdrop-blur. Sin badge — la cantidad va inline en el texto
 * "S/45.50 · 3 productos". Sin botón X visible — se cierra con tap en
 * "Ocultar" del panel expandido o reaparece al cambiar el subtotal.
 *
 * Comportamiento:
 *   - Hidden si items === 0
 *   - Slide-up desde bottom con framer-motion al entrar
 *   - Tap en la barra → expande panel con últimos 3 items + qty steppers
 *   - Botón "Ocultar" en panel expandido = dismiss durante la sesión
 *     (reaparece cuando el subtotal cambia)
 *   - Aria-live polite — anuncia el subtotal cuando cambia
 *
 * Reglas:
 *   - Totales solo preview — el server recalcula en checkout (CLAUDE.md #6)
 *   - No bloquea click outside — tap "Pagar" o cerrar manual
 */

import Link from "next/link";
import Image from "next/image";
import { useMemo, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  EyeOff,
} from "@buleje/design-system/icons";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const SS_KEY = "buleje:sticky-cart:dismissed-subtotal";
const PREVIEW_COUNT = 3;

export default function StickyCartBar() {
  const { items, updateQuantity, removeItem } = useMarketplaceCart();
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  // Brandon, mayo 14 2026: en /marketplace/carrito y /checkout/** el cliente
  // ya esta dentro del flujo de pago. Mostrar el sticky cart bar global ahi
  // duplica el CTA y le quita protagonismo al "Continuar al checkout" del
  // CheckoutSummary. Cada pagina tiene su propio sticky CTA contextual.
  const inCheckoutFlow =
    pathname === "/marketplace/carrito" || pathname?.startsWith("/checkout/") || pathname === "/checkout";

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

  // Brandon 2026-05-27 (FIX "se ocultó y no aparece"): si el usuario tocó el
  // botón ocultar (EyeOff), la barra quedaba oculta hasta que cambiara el
  // subtotal — podía "no volver nunca". Ahora el dismiss es por-pantalla: al
  // navegar a otra ruta la barra REAPARECE (mientras haya productos). El
  // EyeOff sigue funcionando para ocultarla en la vista actual.
  useEffect(() => {
    setDismissedSubtotal(null);
    if (typeof window !== "undefined") sessionStorage.removeItem(SS_KEY);
  }, [pathname]);

  // Auto-cerrar el panel expandido cuando el carrito queda vacío
  useEffect(() => {
    if (totalQty === 0 && expanded) setExpanded(false);
  }, [totalQty, expanded]);

  const isVisible = totalQty > 0 && dismissedSubtotal !== subtotal && !inCheckoutFlow;

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
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          aria-live="polite"
          // Pegado directo encima del BottomNav (60px alto + safe-area).
          // Desktop tablet (sm-lg): flota a 12px del fondo con border-radius.
          className="fixed bottom-[calc(60px+env(safe-area-inset-bottom))] sm:bottom-3 left-0 right-0 sm:left-3 sm:right-3 z-30 lg:hidden"
        >
          {/* ── Panel expandido — miniaturas + qty steppers ─────────────────── */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: 12, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 12, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mb-1 sm:mb-2 overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-[0_-12px_40px_-18px_rgba(0,0,0,0.55)] mx-2 sm:mx-0"
              >
                <div className="px-3 py-3 max-h-[45vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--surface-canvas)]/70">
                      Últimos agregados
                    </span>
                    <div className="flex items-center gap-3">
                      {items.length > PREVIEW_COUNT && (
                        <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--surface-canvas)]/60">
                          +{items.length - PREVIEW_COUNT} más
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleDismiss}
                        aria-label="Ocultar barra del carrito"
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--surface-canvas)]/75 hover:text-white hover:bg-white/10 active:scale-95 transition"
                      >
                        <EyeOff className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        Ocultar
                      </button>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2.5" role="list">
                    {recentItems.map((it) => (
                      <li
                        key={`${it.storeId}-${it.productId}-${it.modifierHash ?? modifierHashOf(it.modifiers)}`}
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

          {/* ── Strip principal — pegado al BottomNav (mobile) / pill (sm-lg)
               Mobile: full-width, sin border-radius bottom, continuo con BottomNav.
               Sm-Lg: pill con border-radius por compatibilidad tablet.
               Bg: accent con backdrop-blur — misma estética que BottomNav.
               Sin badge "3" — cantidad inline en texto "S/45.50 · 3 productos".
               Sin botón X visible — dismiss via "Ocultar" del panel expandido. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Cerrar resumen del carrito" : "Ver resumen del carrito"}
            className={cn(
              "w-full flex items-center justify-between gap-3 text-white text-left",
              // Mobile: strip pegado, sin border-radius (continuo con BottomNav)
              "px-4 py-3 border-t border-white/20",
              // Sm-Lg: pill con border-radius
              "sm:rounded-2xl sm:border sm:border-white/15 sm:px-3.5 sm:py-2.5",
              // Bg: accent + blur (cohesión con BottomNav)
              "bg-[color-mix(in_oklab,var(--accent)_92%,transparent)]",
              "supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--accent)_82%,transparent)]",
              "supports-[backdrop-filter]:backdrop-blur-xl",
              "supports-[backdrop-filter]:backdrop-saturate-150",
              // Shadow accent glow + spring
              "shadow-[0_-8px_24px_-12px_color-mix(in_oklch,var(--accent)_55%,transparent)]",
              "sm:shadow-[0_18px_45px_-12px_color-mix(in_oklch,var(--accent)_45%,transparent)]",
              "active:bg-[color-mix(in_oklab,var(--accent)_95%,black)] transition-colors",
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <ShoppingCart className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-base font-black tabular-nums">
                  {fmt(subtotal)}
                </span>
                <span className="text-[length:var(--ts-2xs)] font-semibold text-white/85 inline-flex items-center gap-1">
                  {totalQty} {totalQty === 1 ? "producto" : "productos"}
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <ChevronUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  )}
                </span>
              </span>
            </span>
            <Link
              href="/marketplace/carrito"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 h-9 text-sm font-extrabold text-[var(--accent)] shrink-0 active:scale-95 transition shadow-sm hover:bg-white/95"
            >
              Pagar
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
            </Link>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
