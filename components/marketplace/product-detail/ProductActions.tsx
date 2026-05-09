"use client";

/**
 * ProductActions — CTAs del PDP: stepper qty, agregar al carrito, comprar ahora, wishlist.
 *
 * Totales: solo preview UI (multiplicación local). El total real lo calcula backend.
 * No toca cart-context.tsx — usa useMarketplaceCart hook.
 */

import { useState, useCallback } from "react";
import {
  Minus,
  Plus,
  ShoppingCart,
  Zap,
  Heart,
  Truck,
  ShieldCheck,
  RotateCcw,
} from "@buleje/design-system/icons";
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
    <div className="space-y-5">
      {/* Trust strip — beneficios clave arriba de las acciones, tipografía legible */}
      <div className="grid grid-cols-3 gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10">
            <Truck className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
            Delivery
          </p>
          <p className="text-base font-bold text-[var(--text-primary)] leading-tight">
            25 min
          </p>
        </div>
        <div className="flex flex-col items-center text-center gap-1.5 border-x-2 border-[var(--rule-base)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10">
            <ShieldCheck className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
            Pago
          </p>
          <p className="text-base font-bold text-[var(--text-primary)] leading-tight">
            Al recibir
          </p>
        </div>
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10">
            <RotateCcw className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
            Devolución
          </p>
          <p className="text-base font-bold text-[var(--text-primary)] leading-tight">
            Gratis
          </p>
        </div>
      </div>

      {/* Stepper — label legible, botones grandes (h-12 mín por ergonomía móvil) */}
      <div>
        <label className="block text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
          Cantidad
        </label>
        <div className="inline-flex items-center border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden bg-[var(--surface-raised)]">
          <button
            onClick={handleDecrement}
            disabled={quantity <= minOrderQty}
            aria-label="Reducir cantidad"
            className="h-12 w-12 flex items-center justify-center hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={2.5} />
          </button>
          <span
            className="px-6 h-12 flex items-center text-xl font-black text-[var(--text-primary)] min-w-[4rem] justify-center tabular-nums border-x-2 border-[var(--rule-base)]"
            aria-live="polite"
            aria-label={`Cantidad: ${quantity}`}
          >
            {quantity}
          </span>
          <button
            onClick={handleIncrement}
            disabled={quantity >= maxQty}
            aria-label="Aumentar cantidad"
            className="h-12 w-12 flex items-center justify-center hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5 text-[var(--text-secondary)]" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* CTA: Agregar al carrito — botón grande (h-14), text-base font-bold */}
      <button
        onClick={handleAddToCart}
        disabled={isOutOfStock}
        className={cn(
          "w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] shadow-md hover:shadow-lg",
          added
            ? "bg-[var(--accent-600,var(--accent))] text-white"
            : isOutOfStock
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed border-2 border-[var(--rule-base)] shadow-none hover:shadow-none"
            : "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-95"
        )}
        aria-label={isOutOfStock ? "Producto agotado" : "Agregar al carrito"}
      >
        <ShoppingCart className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        {isOutOfStock
          ? t("product.outOfStock")
          : added
          ? t("cart.added")
          : `${t("cart.add")} · ${previewTotal}`}
      </button>

      {/* CTA: Comprar ahora — h-14, border-2, text-base */}
      {!isOutOfStock && (
        <button
          onClick={handleBuyNow}
          className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 border-2 border-[var(--accent)] text-[var(--accent)] bg-transparent hover:bg-[var(--accent)]/5 active:scale-[0.98] transition-all"
          aria-label={t("product.buyNow")}
        >
          <Zap className="h-5 w-5" strokeWidth={2.5} aria-hidden />
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

      {/* Wishlist — h-12 con texto legible */}
      <button
        onClick={() => setWishlisted((w) => !w)}
        aria-label={wishlisted ? t("product.inWishlist") : t("product.wishlist")}
        aria-pressed={wishlisted}
        className="w-full h-12 rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all border-2 border-transparent hover:border-[var(--rule-base)]"
      >
        <Heart
          className={cn(
            "h-5 w-5 transition-colors",
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
