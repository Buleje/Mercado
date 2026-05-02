"use client";

/**
 * MarketplaceMiniCart — sistema de carrito flotante premium para el
 * storefront del marketplace. Reemplaza al viejo MarketplaceCart
 * (1270 LOC con WhatsApp/Share/upsells embebidos que confundían al
 * usuario, Brandon mayo 2026).
 *
 * Composición:
 *   - FAB pill flotante bottom-right en desktop (gradient brand).
 *   - Bottom-sheet pegado al pie en mobile (siempre visible cuando hay items).
 *   - Drawer slim 360 px / sheet 80 vh con:
 *       · header store-aware (logo + nombre si hay 1 sola tienda).
 *       · barra de progreso "free shipping" gamificada.
 *       · items con hover + qty controls + price NumberFlow.
 *       · CTA primario "Pagar S/ X" + ghost "Ver carrito completo".
 *
 * Animaciones:
 *   - FAB pulsa al cambiar count (feedback "agregaste algo").
 *   - Total se anima con NumberFlow (sube cuenta).
 *   - FlyToCart hook ya está integrado para el "producto vuela".
 */

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  ArrowRight,
  Truck,
  ChevronUp,
  Trash2,
  MapPin,
} from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useFlyToCart } from "@/components/marketplace/FlyToCart";

/** Umbral para envío gratis — en producción debería venir de config por tenant. */
const FREE_SHIPPING_THRESHOLD = 50;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(n);

export default function MarketplaceMiniCart() {
  const cart = useMarketplaceCart();
  // Defensa contra mocks de tests que no exponen `items` y para evitar
  // crashes si el provider no está montado todavía.
  const items = cart?.items ?? [];
  const updateQuantity = cart?.updateQuantity;
  const removeItem = cart?.removeItem;
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const { registerCartAnchor } = useFlyToCart();

  useEffect(() => {
    registerCartAnchor(anchorRef.current);
    return () => registerCartAnchor(null);
  }, [registerCartAnchor]);

  const { totalItems, subtotal, uniqueStores } = useMemo(() => {
    const ti = items.reduce((acc, i) => acc + i.quantity, 0);
    const st = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const us = new Set(items.map((i) => i.storeSlug));
    return { totalItems: ti, subtotal: st, uniqueStores: us };
  }, [items]);

  const singleStore = items.length > 0 && uniqueStores.size === 1 ? items[0] : null;

  // Pulse al cambiar el count — vía microtask para no caer en
  // react-hooks/set-state-in-effect (cascading renders).
  useEffect(() => {
    if (totalItems === 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPulse(true);
    });
    const t = setTimeout(() => setPulse(false), 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [totalItems]);

  // Lock body scroll cuando el drawer está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (totalItems === 0) return null;

  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const hasFreeShipping = remainingForFree === 0;

  return (
    <>
      {/* ─── FAB / Bottom sheet trigger ─────────────────────────────────── */}
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Abrir carrito (${totalItems} ${totalItems === 1 ? "ítem" : "ítems"})`}
        onClick={() => setOpen(true)}
        className={cn(
          // Mobile = full-width bottom bar pegado al pie
          "fixed left-3 right-3 bottom-3 z-40 sm:left-auto sm:right-5 sm:bottom-5",
          // Layout
          "flex items-center justify-between sm:justify-start gap-3 px-4 sm:px-5 py-3 sm:py-3.5",
          // Brand color + glow gradient
          "rounded-2xl sm:rounded-full text-white shadow-2xl",
          "bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-primary)]/85",
          "shadow-[var(--brand-primary)]/40 ring-1 ring-white/15",
          "hover:shadow-[var(--brand-primary)]/60 hover:scale-[1.02] active:scale-[0.98] transition-all",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("relative shrink-0", pulse && "animate-bounce")}>
            <ShoppingBag className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
            <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-white text-[var(--brand-primary)] text-[10px] font-extrabold flex items-center justify-center shadow-md">
              <NumberFlow value={totalItems > 99 ? 99 : totalItems} />
              {totalItems > 99 && <span>+</span>}
            </span>
          </div>
          <div className="flex flex-col items-start leading-none min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/80">
              Tu carrito
              {uniqueStores.size > 1 && ` · ${uniqueStores.size} tiendas`}
            </span>
            <span className="text-sm sm:text-base font-extrabold tabular-nums mt-0.5">
              <NumberFlow
                value={subtotal}
                format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
                locales="es-PE"
              />
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 pl-3 ml-1 border-l border-white/25 text-xs font-bold uppercase tracking-wider opacity-95">
          <span>Ver</span>
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <ChevronUp className="sm:hidden h-5 w-5 shrink-0" strokeWidth={2.5} />
      </button>

      {/* ─── Drawer / sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-md"
              onClick={() => setOpen(false)}
              aria-hidden
            />

            {/* Desktop drawer / mobile bottom sheet — la misma aside con
                clases responsive. */}
            <m.aside
              key="drawer"
              role="dialog"
              aria-label="Carrito"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.36 }}
              // Mobile: sheet desde abajo, full-width, max-h 88vh.
              // Desktop: drawer derecha, fixed-right, ancho 380.
              className={cn(
                "fixed z-[81] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl flex flex-col",
                // Mobile bottom-sheet
                "left-0 right-0 bottom-0 max-h-[88vh] rounded-t-3xl",
                // Desktop right drawer (override)
                "sm:left-auto sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:h-full sm:w-[380px] sm:rounded-none",
              )}
            >
              {/* Drag handle (solo mobile) */}
              <div className="sm:hidden pt-2.5 pb-1.5 flex items-center justify-center shrink-0">
                <span className="h-1 w-12 rounded-full bg-[var(--rule-strong)]/60" />
              </div>

              {/* ── Header store-aware ─────────────────────────── */}
              <div className="shrink-0 px-4 pt-3 pb-3 sm:pt-5 border-b border-[var(--rule-base)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--brand-primary)]">
                      Tu carrito · {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
                    </p>
                    {singleStore ? (
                      <Link
                        href={`/marketplace/${singleStore.storeSlug}`}
                        onClick={() => setOpen(false)}
                        className="mt-1 inline-flex items-center gap-1.5 text-base font-extrabold leading-tight hover:text-[var(--brand-primary)] transition-colors"
                      >
                        <MapPin className="h-4 w-4 text-[var(--brand-primary)]" strokeWidth={2.5} />
                        <span className="truncate">{singleStore.storeName}</span>
                      </Link>
                    ) : (
                      <h3 className="mt-1 text-base font-extrabold leading-tight">
                        {uniqueStores.size} tiendas en tu pedido
                      </h3>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar carrito"
                    className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>

                {/* ── Free shipping progress (gamification) ─── */}
                <div className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                      <Truck className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {hasFreeShipping ? (
                        <span className="text-[var(--data-success)] font-extrabold uppercase tracking-wider">
                          ✓ Envío gratis
                        </span>
                      ) : (
                        <>
                          Te falta{" "}
                          <strong className="text-[var(--brand-primary)] font-extrabold">
                            {fmt(remainingForFree)}
                          </strong>{" "}
                          para envío gratis
                        </>
                      )}
                    </p>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--rule-base)] overflow-hidden">
                    <m.div
                      className={cn(
                        "h-full rounded-full",
                        hasFreeShipping ? "bg-[var(--data-success)]" : "bg-[var(--brand-primary)]",
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${freeShippingProgress}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 22 }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Items ──────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <m.div
                      key={`${item.storeSlug}-${item.storeProductId}-${item.modifierHash ?? ""}`}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 80, transition: { duration: 0.18 } }}
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                      className="group flex gap-3 p-2 rounded-xl border-2 border-transparent hover:border-[var(--brand-primary)]/30 hover:bg-[var(--surface-sunken)]/40 transition-colors"
                    >
                      <div className="relative h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                            <ShoppingBag className="h-4 w-4" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold leading-tight line-clamp-2">
                          {item.name}
                        </p>
                        {uniqueStores.size > 1 && (
                          <p className="text-[10px] text-muted truncate mt-0.5">
                            {item.storeName}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          {/* Qty stepper */}
                          <div className="inline-flex items-center rounded-lg border-2 border-[var(--rule-base)] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => {
                                if (!removeItem || !updateQuantity) return;
                                if (item.quantity <= 1) {
                                  removeItem(item.storeId, item.productId);
                                } else {
                                  updateQuantity(item.storeId, item.productId, item.quantity - 1);
                                }
                              }}
                              className="px-1.5 py-1 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all"
                              aria-label={item.quantity <= 1 ? "Quitar" : "Restar uno"}
                            >
                              {item.quantity <= 1 ? (
                                <Trash2 className="h-3.5 w-3.5 text-[var(--data-error)]" strokeWidth={2.25} />
                              ) : (
                                <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                              )}
                            </button>
                            <span className="px-2 text-xs font-extrabold tabular-nums min-w-[1.5rem] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity?.(item.storeId, item.productId, item.quantity + 1)}
                              className="px-1.5 py-1 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all"
                              aria-label="Sumar uno"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          </div>
                          <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                            {fmt(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* ── Footer ─────────────────────────────────────── */}
              <div className="shrink-0 border-t border-[var(--rule-base)] px-4 py-3 sm:py-4 space-y-3 bg-[var(--surface-canvas)]">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-muted">
                    Subtotal
                  </span>
                  <span className="text-2xl font-black tabular-nums text-[var(--text-primary)]">
                    <NumberFlow
                      value={subtotal}
                      format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
                      locales="es-PE"
                    />
                  </span>
                </div>

                <Link
                  href="/marketplace/carrito"
                  onClick={() => setOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--brand-primary)] text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] shadow-lg shadow-[var(--brand-primary)]/30 hover:shadow-xl hover:shadow-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary)]/90 active:scale-[0.98] transition-all"
                >
                  Pagar {fmt(subtotal)}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Seguir comprando
                </button>
              </div>
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
