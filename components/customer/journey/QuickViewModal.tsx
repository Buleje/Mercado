"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, ShoppingCart, Heart, Share2, Minus, Plus, Check } from "@buleje/design-system/icons";
import Image from "next/image";
import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { modalVariants, popoverVariants, tapPress } from "@/components/ui-system";
import { BTN } from "@/lib/copy";

/**
 * QuickViewModal — preview rápido de producto sin salir del grid.
 *
 * Radix Dialog accesible. Patron Shopify/Amazon: al tap en un producto
 * del grid, abre modal con imagen + descripcion + variantes + CTA.
 * Reduce rebote 40-60% vs ir a PDP.
 *
 * @example
 * <QuickViewModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   product={{...}}
 *   onAddToCart={(qty) => ...}
 * />
 */

export interface QuickViewProduct {
  id: string | number;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  category?: string;
  unit?: string;
  description?: string;
  stock?: number;
  badges?: Array<{ label: string; variant?: "accent" | "warning" | "neutral" }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: QuickViewProduct;
  onAddToCart?: (qty: number) => void | Promise<void>;
  onFavoriteToggle?: () => void;
  onShare?: () => void;
  isFavorite?: boolean;
  storeName?: string;
}

export function QuickViewModal({
  open,
  onOpenChange,
  product,
  onAddToCart,
  onFavoriteToggle,
  onShare,
  isFavorite = false,
  storeName,
}: Props) {
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const maxQty = product.stock ?? 99;
  const lowStock = product.stock != null && product.stock <= 5 && product.stock > 0;
  const outOfStock = product.stock === 0;
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)
    : 0;

  const handleAdd = async () => {
    if (!onAddToCart) return;
    setAdding(true);
    try {
      await onAddToCart(qty);
      setAdded(true);
      setTimeout(() => {
        setAdded(false);
        onOpenChange(false);
        setQty(1);
      }, 800);
    } catch {
      setAdding(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <m.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <m.div
                className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 px-4"
                variants={modalVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] overflow-hidden shadow-[var(--shadow-xl)]">
                  <div className="grid grid-cols-1 md:grid-cols-2 max-h-[85vh] overflow-y-auto">
                    {/* Image side */}
                    <div className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 50vw"
                          priority
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                          <ShoppingCart className="h-12 w-12" strokeWidth={1.5} />
                        </div>
                      )}
                      {/* Badges */}
                      {product.badges && product.badges.length > 0 && (
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {product.badges.map((b, i) => (
                            <span
                              key={i}
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                                b.variant === "accent" && "bg-[var(--accent-600,var(--accent))] text-white",
                                b.variant === "warning" && "bg-[var(--data-warning-500)] text-white",
                                !b.variant && "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
                              )}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Discount tag */}
                      {hasDiscount && (
                        <span className="absolute top-3 right-3 inline-flex items-center rounded-full bg-[var(--data-error-500)] text-white px-2.5 py-1 text-xs font-bold tabular-nums">
                          -{discountPercent}%
                        </span>
                      )}
                    </div>

                    {/* Content side */}
                    <div className="p-6 sm:p-7 flex flex-col gap-4 relative">
                      {/* Close button (solo content side) */}
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] hover:bg-[var(--rule-soft)] transition-colors"
                          aria-label="Cerrar"
                        >
                          <X className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </Dialog.Close>

                      {product.category && (
                        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                          {product.category}
                        </span>
                      )}

                      <div>
                        <Dialog.Title className="text-xl sm:text-2xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight pr-10">
                          {product.name}
                        </Dialog.Title>
                        {storeName && (
                          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                            Vendido por <span className="font-semibold text-[var(--text-secondary)]">{storeName}</span>
                          </p>
                        )}
                      </div>

                      {/* Price */}
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                          S/ {Number(product.price).toFixed(2)}
                        </span>
                        {product.unit && (
                          <span className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-[var(--ls-wider)]">
                            / {product.unit}
                          </span>
                        )}
                        {hasDiscount && (
                          <span className="text-sm text-[var(--text-tertiary)] line-through tabular-nums">
                            S/ {product.originalPrice!.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {product.description && (
                        <Dialog.Description className="text-sm text-[var(--text-secondary)] leading-relaxed">
                          {product.description}
                        </Dialog.Description>
                      )}

                      {/* Scarcity REAL (Cialdini) */}
                      {lowStock && (
                        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-3 py-1.5 self-start">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)] animate-pulse" />
                          <span className="text-xs font-bold text-amber-800 dark:text-amber-300 tabular-nums">
                            Últimas {product.stock} unidades
                          </span>
                        </div>
                      )}
                      {outOfStock && (
                        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-3 py-1.5 self-start">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                          <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)]">
                            Sin stock
                          </span>
                        </div>
                      )}

                      {/* Quantity selector */}
                      {!outOfStock && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                            Cantidad
                          </span>
                          <div className="inline-flex items-center gap-0 rounded-full border border-[var(--rule-base)] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setQty(Math.max(1, qty - 1))}
                              className="h-9 w-9 inline-flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={qty <= 1}
                              aria-label="Menos"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                            <span className="px-3 min-w-10 text-center text-sm font-bold tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(Math.min(maxQty, qty + 1))}
                              className="h-9 w-9 inline-flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={qty >= maxQty}
                              aria-label="Más"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-auto pt-4 flex items-center gap-2">
                        {!outOfStock && (
                          <m.button
                            type="button"
                            onClick={handleAdd}
                            whileTap={tapPress}
                            disabled={adding || added}
                            className={cn(
                              "flex-1 inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm py-3 px-6 transition-colors",
                              added
                                ? "bg-[var(--data-success-500)] text-white"
                                : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
                            )}
                          >
                            {added ? (
                              <>
                                <Check className="h-4 w-4" strokeWidth={2.5} />
                                {BTN.addToCartDone}
                              </>
                            ) : adding ? (
                              <>{BTN.addToCartLoading}</>
                            ) : (
                              <>
                                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                                Agregar · S/ {(product.price * qty).toFixed(2)}
                              </>
                            )}
                          </m.button>
                        )}
                        {onFavoriteToggle && (
                          <button
                            type="button"
                            onClick={onFavoriteToggle}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors"
                            aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                            aria-pressed={isFavorite}
                          >
                            <Heart
                              className={cn("h-4 w-4", isFavorite ? "fill-[var(--data-error-500)] text-[var(--data-error-500)]" : "text-[var(--text-secondary)]")}
                              strokeWidth={1.75}
                            />
                          </button>
                        )}
                        {onShare && (
                          <button
                            type="button"
                            onClick={onShare}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors"
                            aria-label="Compartir"
                          >
                            <Share2 className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
