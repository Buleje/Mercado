"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  ShoppingCart,
  Store as StoreIcon,
  Star,
  Package,
  Check,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";

interface QuickViewProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
}

interface ProductQuickViewProps {
  product: QuickViewProduct | null;
  onClose: () => void;
}

const fmt = (n: unknown) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n));

export default function ProductQuickView({ product, onClose }: ProductQuickViewProps) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItemWithUndo } = useCartWithUndo();

  if (!product) return null;

  const isOutOfStock = product.stock === 0;

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItemWithUndo({
      storeId: product.storeId,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      storeProductId: product.storeProductId,
      productId: product.productId,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
      quantity: qty,
    });
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
      setQty(1);
    }, 800);
  };

  return (
    <AnimatePresence>
      {product && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-[var(--surface-raised)] rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto sm:mb-8 sm:rounded-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-[var(--rule-base)]" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-[var(--rule-base)] transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>

            {/* Product image */}
            <div className="relative aspect-square max-h-72 bg-[var(--surface-sunken)] overflow-hidden sm:rounded-t-2xl">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 500px"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Package className="h-16 w-16 text-gray-300" />
                </div>
              )}

              {isOutOfStock && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-full">
                    Agotado
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Store */}
              <Link
                href={`/marketplace/${product.storeSlug}`}
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors"
                onClick={onClose}
              >
                {product.storeLogo ? (
                  <div className="relative h-5 w-5 rounded-full overflow-hidden ring-1 ring-gray-200">
                    <Image src={product.storeLogo} alt="" fill className="object-cover" sizes="20px" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <StoreIcon className="h-3 w-3 text-primary" />
                  </div>
                )}
                {product.storeName}
              </Link>

              {/* Name + price */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                  {product.name}
                </h2>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl font-black text-primary">
                    {fmt(product.price)}
                  </span>
                  {product.unit && (
                    <span className="text-sm text-gray-400">/ {product.unit}</span>
                  )}
                </div>
              </div>

              {/* Stock info */}
              {product.stock > 0 && product.stock <= 10 && (
                <p className="text-xs font-semibold text-[var(--data-warning-600)] bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-lg inline-block">
                  Solo quedan {product.stock} unidades
                </p>
              )}

              {/* Quantity selector + Add button */}
              {!isOutOfStock && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center rounded-xl ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden">
                    <button
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="h-11 w-11 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Minus className="h-4 w-4 text-gray-600" />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-gray-900 dark:text-white">
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty(Math.min(product.stock || 99, qty + 1))}
                      className="h-11 w-11 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Plus className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>

                  <button
                    onClick={handleAdd}
                    disabled={added}
                    className={cn(
                      "flex-1 h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                      added
                        ? "bg-[var(--data-success-500)] text-white"
                        : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/25"
                    )}
                  >
                    {added ? (
                      <>
                        <Check className="h-4 w-4" />
                        Agregado
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4" />
                        Agregar {fmt(product.price * qty)}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
