"use client";

/**
 * ProductActions — CTAs del PDP: stepper qty, agregar al carrito, comprar ahora, wishlist.
 *
 * Totales: solo preview UI (multiplicación local). El total real lo calcula backend.
 * No toca cart-context.tsx — usa useMarketplaceCart hook.
 */

import { useState, useCallback } from "react";
import { Minus, Plus, ShoppingCart, Zap, Heart } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCurrency } from "@/contexts/currency-context";
import { useLocale } from "@/contexts/locale-context";
import OneClickBuyButton from "./OneClickBuyButton";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ProductActionsProps {
  productId: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeProductId: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  stock?: number | null;
  minOrderQty?: number;
  onBuyNow?: () => void;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function ProductActions({
  productId,
  storeId,
  storeName,
  storeSlug,
  storeProductId,
  name,
  price,
  image,
  unit,
  stock,
  minOrderQty = 1,
  onBuyNow,
}: ProductActionsProps) {
  const { addItem } = useMarketplaceCart();
  const { format } = useCurrency();
  const { t } = useLocale();
  const [quantity, setQuantity] = useState(minOrderQty);
  const [added, setAdded] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  const isOutOfStock = stock !== null && stock !== undefined && stock === 0;

  const maxQty = stock !== null && stock !== undefined ? stock : 99;

  const handleDecrement = useCallback(() => {
    setQuantity((q) => Math.max(minOrderQty, q - 1));
  }, [minOrderQty]);

  const handleIncrement = useCallback(() => {
    setQuantity((q) => Math.min(maxQty, q + 1));
  }, [maxQty]);

  const handleAddToCart = useCallback(() => {
    if (isOutOfStock) return;
    addItem({
      storeId,
      storeName,
      storeSlug,
      storeProductId,
      productId,
      name,
      price,
      image,
      unit,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }, [
    isOutOfStock, addItem, storeId, storeName, storeSlug,
    storeProductId, productId, name, price, image, unit, quantity,
  ]);

  const handleBuyNow = useCallback(() => {
    handleAddToCart();
    onBuyNow?.();
  }, [handleAddToCart, onBuyNow]);

  // Preview price (UI only — backend recalcula el total real).
  // Usa useCurrency() para reflejar PEN/USD toggle activo.
  const previewTotal = format(price * quantity);

  return (
    <div className="space-y-3">
      {/* Stepper */}
      <div className="flex items-center gap-3">
        <span className="text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)]">
          {t("cart.quantity")}
        </span>
        <div className="flex items-center border border-[var(--rule-base)] rounded-lg overflow-hidden bg-[var(--surface-raised)]">
          <button
            onClick={handleDecrement}
            disabled={quantity <= minOrderQty}
            aria-label="Reducir cantidad"
            className="p-2.5 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
          <span
            className="px-4 py-2 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] min-w-[3rem] text-center tabular-nums"
            aria-live="polite"
            aria-label={`Cantidad: ${quantity}`}
          >
            {quantity}
          </span>
          <button
            onClick={handleIncrement}
            disabled={quantity >= maxQty}
            aria-label="Aumentar cantidad"
            className="p-2.5 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </div>
      </div>

      {/* CTA: Agregar al carrito */}
      <button
        onClick={handleAddToCart}
        disabled={isOutOfStock}
        className={cn(
          "w-full py-3.5 rounded-xl font-semibold text-[length:var(--ts-sm)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
          added
            ? "bg-[var(--accent)] text-white"
            : isOutOfStock
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed border border-[var(--rule-base)]"
            : "bg-[var(--accent)] text-white hover:opacity-90"
        )}
        aria-label={isOutOfStock ? "Producto agotado" : "Agregar al carrito"}
      >
        <ShoppingCart className="h-4 w-4" aria-hidden />
        {isOutOfStock
          ? t("product.outOfStock")
          : added
          ? t("cart.added")
          : `${t("cart.add")} · ${previewTotal}`}
      </button>

      {/* CTA: Comprar ahora (existente — fallback si no hay 1-click ready) */}
      {!isOutOfStock && (
        <button
          onClick={handleBuyNow}
          className="w-full py-3.5 rounded-xl font-semibold text-[length:var(--ts-sm)] flex items-center justify-center gap-2 border border-[var(--accent)] text-[var(--accent)] bg-transparent hover:bg-[var(--accent-soft)] active:scale-[0.98] transition-all"
          aria-label={t("product.buyNow")}
        >
          <Zap className="h-4 w-4" aria-hidden />
          {t("product.buyNow")}
        </button>
      )}

      {/* CTA: 1-Click Buy (Amazon-style) — solo si hay dirección + pago guardados */}
      {!isOutOfStock && (
        <OneClickBuyButton
          productId={productId}
          storeId={storeId}
          storeProductId={storeProductId}
          productName={name}
          productImage={image}
          productUnit={unit}
          productPrice={price}
        />
      )}

      {/* Wishlist */}
      <button
        onClick={() => setWishlisted((w) => !w)}
        aria-label={wishlisted ? t("product.inWishlist") : t("product.wishlist")}
        aria-pressed={wishlisted}
        className="w-full py-2.5 rounded-xl font-medium text-[length:var(--ts-sm)] flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            wishlisted
              ? "text-[var(--data-error-600)] fill-[var(--data-error-600)]"
              : "text-[var(--text-tertiary)]"
          )}
          aria-hidden
        />
        {wishlisted ? t("product.inWishlist") : t("product.wishlist")}
      </button>
    </div>
  );
}
