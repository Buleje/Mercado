"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, X, Plus, Minus, ArrowRight } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useFlyToCart } from "@/components/marketplace/FlyToCart";

export default function MarketplaceMiniCart() {
  const { items, updateQuantity, removeItem } = useMarketplaceCart();
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const { registerCartAnchor } = useFlyToCart();

  useEffect(() => {
    registerCartAnchor(anchorRef.current);
    return () => registerCartAnchor(null);
  }, [registerCartAnchor]);

  const { totalItems, subtotal } = useMemo(() => {
    const ti = items.reduce((acc, i) => acc + i.quantity, 0);
    const st = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    return { totalItems: ti, subtotal: st };
  }, [items]);

  // Pulse animation when item count changes
  useEffect(() => {
    if (totalItems === 0) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 400);
    return () => clearTimeout(t);
  }, [totalItems]);

  if (totalItems === 0) return null;

  return (
    <>
      {/* Floating button */}
      <button
        ref={anchorRef}
        type="button"
        aria-label={`Abrir carrito (${totalItems} items)`}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex items-center gap-3 px-5 py-3.5 rounded-full",
          "bg-gray-900 text-white shadow-2xl shadow-gray-900/30",
          "hover:bg-gray-800 active:scale-95 transition-all",
          pulse && "animate-pulse",
        )}
      >
        <div className="relative">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-extrabold flex items-center justify-center">
            <NumberFlow value={totalItems > 99 ? 99 : totalItems} />
            {totalItems > 99 && <span>+</span>}
          </span>
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-300 uppercase tracking-wide">
            Mi carrito
          </span>
          <span className="text-sm font-extrabold tabular-nums">
            <NumberFlow
              value={subtotal}
              format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
              locales="es-PE"
            />
          </span>
        </div>
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <m.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
              role="dialog"
              aria-label="Preview del carrito"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    Tu carrito
                  </h3>
                  <p className="text-xs text-gray-500">
                    {totalItems} producto{totalItems === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.map((item) => (
                  <div
                    key={`${item.storeSlug}-${item.storeProductId}`}
                    className="flex gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="relative h-16 w-16 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-300">
                          <ShoppingBag className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {item.name}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate">
                        {item.storeName}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700">
                          <button
                            type="button"
                            onClick={() =>
                              item.quantity <= 1
                                ? removeItem(item.storeId, item.productId)
                                : updateQuantity(
                                    item.storeId,
                                    item.productId,
                                    item.quantity - 1,
                                  )
                            }
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-lg"
                            aria-label="Restar"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-xs font-bold w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.storeId,
                                item.productId,
                                item.quantity + 1,
                              )
                            }
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-r-lg"
                            aria-label="Sumar"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm font-extrabold text-gray-900 dark:text-white">
                          S/{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    Subtotal
                  </span>
                  <span className="text-lg font-extrabold text-gray-900 dark:text-white tabular-nums">
                    <NumberFlow
                      value={subtotal}
                      format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
                      locales="es-PE"
                    />
                  </span>
                </div>
                <Link
                  href="/marketplace/mi-cuenta"
                  onClick={() => setOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors active:scale-95"
                >
                  Ir al checkout
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-gray-700"
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
