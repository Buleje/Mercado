"use client";

/**
 * StoreQuickPreviewDrawer — Drawer lateral que aparece al hacer hover sobre
 * una card en FeaturedStoresNearby. Muestra los productos destacados de la
 * tienda y permite agregarlos al carrito sin salir de /tiendas.
 *
 * Animación: slide-in desde la derecha 280ms ease-out + backdrop fade.
 * Cierre: ESC, click fuera, mouseleave con grace de 250ms (para que el
 * usuario pueda mover el mouse hacia el drawer sin que se cierre).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MapPin, X, ShoppingCart, ArrowRight, Plus } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { FeaturedNearbyStore } from "@/lib/db/marketplace-featured.db";

interface Props {
  store: FeaturedNearbyStore | null;
  open: boolean;
  onClose: () => void;
}

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(n);

export default function StoreQuickPreviewDrawer({ store, open, onClose }: Props) {
  const { addItem } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [addedFlash, setAddedFlash] = useState<string | null>(null);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const products = useMemo(() => store?.productosDestacados ?? [], [store]);

  if (!store) return null;

  const handleAdd = (p: NonNullable<typeof products>[number]) => {
    const price = p.discountPrice ?? p.retailPrice;
    addItem({
      id: p.productId,
      name: p.name,
      price,
      image: p.image,
      category: store.category,
      unit: "unidad",
      stock: 99,
    });
    setAddedFlash(p.id);
    setTimeout(() => setAddedFlash(null), 1200);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]"
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            ref={drawerRef}
            role="dialog"
            aria-label={`Vista rápida de ${store.name}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.34 }}
            className="fixed right-0 top-0 z-[81] h-full w-full max-w-md bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl flex flex-col"
          >
            {/* Header con banner */}
            <div className="relative h-32 shrink-0 overflow-hidden bg-[var(--surface-sunken)]">
              {store.banner ? (
                <Image src={store.banner} alt="" fill sizes="448px" className="object-cover" priority />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/30 to-[var(--brand-secondary)]/20" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>

              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="flex items-center gap-2.5">
                  {store.logo && (
                    <div className="relative h-10 w-10 rounded-xl overflow-hidden bg-white shrink-0 ring-2 ring-white/40">
                      <Image src={store.logo} alt="" fill sizes="40px" className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-extrabold leading-tight truncate">{store.name}</h2>
                    <div className="flex items-center gap-2 text-xs text-white/85 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" strokeWidth={2} />
                        <strong>{Number(store.rating).toFixed(1)}</strong>
                        <span className="text-white/60">({store.reviewCount})</span>
                      </span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                        {Number(store.distanceKm).toFixed(1)} km
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted mb-3">
                Productos destacados
              </p>

              {products.length === 0 ? (
                <div className="text-sm text-muted py-8 text-center">
                  Esta tienda aún no tiene productos destacados.
                </div>
              ) : (
                <ul className="space-y-3">
                  {products.map((p) => {
                    const price = p.discountPrice ?? p.retailPrice;
                    const hasDiscount = p.discountPrice != null;
                    const flashing = addedFlash === p.id;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 p-2 rounded-xl border-2 border-[var(--rule-base)] hover:border-[var(--brand-primary)]/40 transition-colors"
                      >
                        <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
                          {p.image ? (
                            <Image src={p.image} alt="" fill sizes="64px" className="object-cover" />
                          ) : (
                            <div className="h-full w-full" />
                          )}
                          {p.discountLabel && (
                            <span className="absolute top-1 left-1 rounded-md bg-[var(--brand-secondary)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                              {p.discountLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{p.name}</p>
                          <div className="mt-0.5 flex items-baseline gap-2">
                            <span className="text-base font-extrabold text-[var(--brand-primary)]">{fmtPEN(price)}</span>
                            {hasDiscount && (
                              <span className="text-xs text-muted line-through">{fmtPEN(p.retailPrice)}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAdd(p)}
                          aria-label={`Agregar ${p.name} al carrito`}
                          className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95 ${
                            flashing
                              ? "bg-[var(--data-success)] text-white"
                              : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90"
                          }`}
                        >
                          {flashing ? <ShoppingCart className="h-4 w-4" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer CTA */}
            <div className="shrink-0 border-t border-[var(--rule-base)] p-4 bg-[var(--surface-canvas)]">
              <Link
                href={`/marketplace/${store.slug}`}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-extrabold uppercase tracking-[var(--ls-wider)] hover:bg-[var(--brand-primary)]/90 transition-colors"
              >
                Ver toda la tienda
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
