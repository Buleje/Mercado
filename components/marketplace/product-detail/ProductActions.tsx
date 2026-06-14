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
    <div className="space-y-4">
      {/* Trust strip — beneficios clave, bordes rectos, sin tintes neón */}
      <div className="grid grid-cols-3 border border-[var(--rule-base)] divide-x divide-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="flex flex-col items-center text-center gap-1 px-2 py-3">
          <Truck className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight">Delivery</p>
          <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">25 min</p>
        </div>
        <div className="flex flex-col items-center text-center gap-1 px-2 py-3">
          <ShieldCheck className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight">Pago</p>
          <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">Al recibir</p>
        </div>
        <div className="flex flex-col items-center text-center gap-1 px-2 py-3">
          <RotateCcw className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight">Devolución</p>
          <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">Gratis</p>
        </div>
      </div>

      {/* Stepper — bordes rectos, botones grandes (h-12 ergonomía móvil).
          Es un grupo (− N +), no un input único → usamos <span> + role=group
          con aria-label (a11y: evita label sin control asociado). */}
      <div role="group" aria-label="Cantidad">
        <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mb-2">
          Cantidad
        </span>
        <div className="inline-flex items-center border border-[var(--rule-base)] rounded-sm overflow-hidden bg-[var(--surface-raised)]">
          <button
            onClick={handleDecrement}
            disabled={quantity <= minOrderQty}
            aria-label="Reducir cantidad"
            className="h-11 w-11 flex items-center justify-center hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
          </button>
          <span
            className="px-6 h-11 flex items-center text-lg font-semibold text-[var(--text-primary)] min-w-[3.5rem] justify-center tabular-nums border-x border-[var(--rule-base)]"
            aria-live="polite"
            aria-label={`Cantidad: ${quantity}`}
          >
            {quantity}
          </span>
          <button
            onClick={handleIncrement}
            disabled={quantity >= maxQty}
            aria-label="Aumentar cantidad"
            className="h-11 w-11 flex items-center justify-center hover:bg-[var(--surface-sunken)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* CTA: Agregar al carrito — bordes rectos, sin sombras neón */}
      <button
        onClick={handleAddToCart}
        disabled={isOutOfStock}
        className={cn(
          "w-full h-12 rounded-sm font-semibold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.99]",
          added
            ? "bg-[var(--accent-600,var(--accent))] text-white"
            : isOutOfStock
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed border border-[var(--rule-base)]"
            : "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-95"
        )}
        aria-label={isOutOfStock ? "Producto agotado" : "Agregar al carrito"}
      >
        <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
        {isOutOfStock
          ? t("product.outOfStock")
          : added
          ? t("cart.added")
          : `${t("cart.add")} · ${previewTotal}`}
      </button>

      {/* CTA: Comprar ahora — bordes rectos */}
      {!isOutOfStock && (
        <button
          onClick={handleBuyNow}
          className="w-full h-12 rounded-sm font-semibold text-base flex items-center justify-center gap-2 border border-[var(--accent)] text-[var(--accent)] bg-transparent hover:bg-[var(--surface-sunken)] active:scale-[0.99] transition-all"
          aria-label={t("product.buyNow")}
        >
          <Zap className="h-5 w-5" strokeWidth={2} aria-hidden />
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

      {/* Wishlist — bordes rectos, texto legible */}
      <button
        onClick={() => setWishlisted((w) => !w)}
        aria-label={wishlisted ? t("product.inWishlist") : t("product.wishlist")}
        aria-pressed={wishlisted}
        className="w-full h-11 rounded-sm font-medium text-base flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-[0.99] transition-all border border-transparent hover:border-[var(--rule-base)]"
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

      {/* Garantías estilo MercadoLibre (Brandon 2026-06-14) — filas de confianza */}
      <ul className="space-y-3 border-t border-[var(--rule-soft)] pt-4">
        <li className="flex gap-2.5">
          <RotateCcw className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <p className="text-sm text-[var(--text-secondary)] leading-snug">
            <span className="font-medium text-[var(--text-primary)]">Devolución coordinada.</span>{" "}
            Si algo llega mal, lo resolvés con la tienda por WhatsApp.
          </p>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <p className="text-sm text-[var(--text-secondary)] leading-snug">
            <span className="font-medium text-[var(--text-primary)]">Compra protegida.</span>{" "}
            Pagás al recibir — sin adelanto, sin sorpresas.
          </p>
        </li>
      </ul>
    </div>
  );
}
