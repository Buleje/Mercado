"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, ShoppingCart } from "lucide-react";
import { useQuickAdd } from "@/contexts/quick-add-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { getProductSlug } from "@/data/products";

const MAX_QTY = 20;

/**
 * Meta inyectada por CategoryProductGrid cuando el product viene del
 * marketplace multi-store (y no del catálogo single-tenant). Si está
 * presente, agregamos al carrito marketplace en vez de al carrito tenant.
 */
type WithStoreMeta = {
  _bulejeStoreMeta?: {
    storeId: string;
    storeName: string;
    storeSlug: string;
    storeProductId: string;
  };
};

export default function QuickAddDrawer() {
  const { product, isOpen, close } = useQuickAdd();
  const { addItem } = useCart();
  const { addItem: addMarketplaceItem } = useMarketplaceCart();
  const { showToast } = useToast();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQty(1);
      setAdding(false);
      closeButtonRef.current?.focus();
    }
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const handleAdd = () => {
    if (!product || adding) return;
    setAdding(true);
    const meta = (product as WithStoreMeta)._bulejeStoreMeta;
    if (meta) {
      // Producto viene del marketplace multi-store — agregá al cart global
      // (hooks/use-marketplace-cart) con meta de la tienda.
      addMarketplaceItem({
        storeId: meta.storeId,
        storeName: meta.storeName,
        storeSlug: meta.storeSlug,
        storeProductId: meta.storeProductId,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        image: product.image ?? null,
        unit: product.unit ?? null,
      });
    } else {
      // Catálogo single-tenant — usamos el cart-context.
      for (let i = 0; i < qty; i++) addItem(product);
    }
    showToast(`${qty}× ${product.name}`, product.image);
    setTimeout(() => {
      close();
    }, 350);
  };

  const stock = product?.stock;
  const outOfStock = stock === 0;
  const maxQty = Math.min(MAX_QTY, stock ?? MAX_QTY);

  return (
    <AnimatePresence>
      {isOpen && product && (
        <>
          <motion.div
            key="quickadd-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            key="quickadd-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Agregar ${product.name}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Agregar al carrito
              </h2>
              <button
                ref={closeButtonRef}
                onClick={close}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 448px"
                  className="object-cover"
                />
              </div>

              <div className="mt-4 flex flex-col gap-1">
                <Link
                  href={`/producto/${getProductSlug(product)}`}
                  onClick={close}
                  className="text-base font-semibold text-gray-900 hover:text-[var(--accent)] dark:text-gray-100"
                >
                  {product.name}
                </Link>
                {product.category && (
                  <span className="text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">
                    {product.category}
                    {product.unit ? ` · ${product.unit}` : ""}
                  </span>
                )}
              </div>

              {product.description && (
                <p className="mt-3 text-[length:var(--ts-sm)] leading-relaxed text-gray-600 dark:text-gray-300">
                  {product.description}
                </p>
              )}

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  S/ {product.price.toFixed(2)}
                </span>
                {product.unit && (
                  <span className="text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">
                    / {product.unit}
                  </span>
                )}
              </div>

              {outOfStock && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[length:var(--ts-sm)] text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Producto agotado por ahora.
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1 || outOfStock}
                    aria-label="Disminuir cantidad"
                    className="flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span
                    aria-live="polite"
                    className="min-w-[2.5rem] text-center text-sm font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty || outOfStock}
                    aria-label="Aumentar cantidad"
                    className="flex h-10 w-10 items-center justify-center text-gray-500 transition-colors hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="text-right">
                  <div className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Subtotal
                  </div>
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100">
                    S/ {(product.price * qty).toFixed(2)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={outOfStock || adding}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                {outOfStock
                  ? "Agotado"
                  : adding
                  ? "Agregando…"
                  : `Agregar ${qty > 1 ? `${qty} ` : ""}al carrito`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
