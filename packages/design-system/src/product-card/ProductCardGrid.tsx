/**
 * ProductCardGrid — Card mediana para grids de catalogo.
 *
 * Uso recomendado:
 * - Grids de catalogo (grid-cols-2 → 5 segun breakpoint)
 * - Resultados de busqueda
 * - Listados por categoria
 *
 * Densidad balanceada: imagen cuadrada + info compacta + hover actions.
 * Altura minima: 340px.
 */
"use client";

import type { ReactNode } from "react";
import { ShoppingCart, Heart, Star, Plus } from "../icons";
import { CardTitle, Caption } from "../typography";
import { ProductBadge, ProductPrice } from "../store";
import { cn } from "../utils";
import { ProductImage } from "./ProductImage";
import { resolveDiscount, resolveHref, isOutOfStock } from "./shared";
import type { ProductCardActions, ProductCardProduct } from "./types";

export interface ProductCardGridProps extends ProductCardActions {
  product: ProductCardProduct;
  /**
   * Override del render de la imagen. Pasar `<Image fill ... />` de Next para
   * obtener optimizacion completa.
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  className?: string;
}

// Mapa badge string → intent del ProductBadge
const BADGE_INTENT: Record<
  Exclude<ProductCardProduct["badge"] & string, undefined>,
  { intent: "offer" | "new" | "premium" | "popular" | "fresh"; label: string }
> = {
  oferta: { intent: "offer", label: "Oferta" },
  nuevo: { intent: "new", label: "Nuevo" },
  agotado: { intent: "new", label: "Agotado" },
  socio: { intent: "premium", label: "Socio" },
  top: { intent: "popular", label: "Top" },
};

export function ProductCardGrid({
  product,
  renderImage,
  onAddToCart,
  onAddToFavorites,
  className,
}: ProductCardGridProps) {
  const discount = resolveDiscount(product);
  const outOfStock = isOutOfStock(product);
  const href = resolveHref(product);
  const alt = product.imageAlt ?? product.name;

  // Si esta agotado, forzar badge agotado por encima del original
  const resolvedBadge = outOfStock ? "agotado" : product.badge;
  const badgeMeta = resolvedBadge ? BADGE_INTENT[resolvedBadge] : null;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl",
        "border border-[var(--rule-base)] bg-[var(--surface-raised)]",
        "min-h-[340px]",
        "transition-all duration-[var(--dur-base)] ease-[var(--ease-soft)]",
        "hover:ring-2 hover:ring-[var(--accent)]/30 hover:border-[var(--rule-strong)]",
        className,
      )}
    >
      {/* Imagen */}
      <a href={href} aria-label={product.name} className="block">
        <ProductImage
          src={product.image}
          alt={alt}
          aspect="aspect-square"
          hoverZoom
          renderImage={renderImage}
        />
      </a>

      {/* Badge (top-left) */}
      {badgeMeta && (
        <div className="pointer-events-none absolute left-2 top-2">
          <ProductBadge intent={badgeMeta.intent}>
            {discount != null && resolvedBadge === "oferta"
              ? `-${discount}%`
              : badgeMeta.label}
          </ProductBadge>
        </div>
      )}

      {/* Favoritos (top-right) */}
      {onAddToFavorites && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddToFavorites(product);
          }}
          aria-label={`Agregar ${product.name} a favoritos`}
          className={cn(
            "absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center",
            "rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)]",
            "border border-[var(--rule-base)] shadow-[var(--shadow-sm)]",
            "opacity-0 transition-opacity duration-[var(--dur-fast)]",
            "hover:text-[var(--text-primary)] focus-visible:opacity-100",
            "group-hover:opacity-100",
          )}
        >
          <Heart className="h-4 w-4" aria-hidden />
        </button>
      )}

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <a href={href} className="block">
          <CardTitle className="line-clamp-2 text-[length:var(--ts-sm)] leading-[var(--lh-snug)]">
            {product.name}
          </CardTitle>
        </a>

        <div className="flex flex-wrap items-center gap-2">
          <ProductPrice
            price={product.price}
            previousPrice={product.originalPrice}
            size="md"
          />
          {discount != null && !badgeMeta && (
            <span className="inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--data-warning-700)]">
              -{discount}%
            </span>
          )}
        </div>

        {/* Rating inline compact */}
        {typeof product.rating === "number" && product.rating > 0 && (
          <div className="flex items-center gap-1">
            <Star
              className="h-3 w-3 fill-[var(--data-warning)] text-[var(--data-warning)]"
              aria-hidden
            />
            <Caption className="text-[var(--text-secondary)]">
              {product.rating.toFixed(1)}
              {product.reviewCount ? ` (${product.reviewCount})` : ""}
            </Caption>
          </div>
        )}

        {/* Store / unit — metadata terciaria */}
        {(product.storeName || product.unit) && (
          <Caption className="truncate text-[var(--text-tertiary)]">
            {product.storeName ?? product.unit}
          </Caption>
        )}

        {/* Spacer + add button en esquina inferior derecha */}
        {onAddToCart && (
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <Caption className="text-[var(--text-tertiary)]">
              {product.unit && product.storeName ? product.unit : ""}
            </Caption>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart(product);
              }}
              disabled={outOfStock}
              aria-label={
                outOfStock
                  ? `${product.name} agotado`
                  : `Agregar ${product.name} al carrito`
              }
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                "border border-[var(--rule-base)]",
                "transition-all duration-[var(--dur-fast)]",
                outOfStock
                  ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
                  : cn(
                      "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
                      "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-[var(--text-primary)] focus-visible:ring-offset-2",
                    ),
              )}
            >
              {outOfStock ? (
                <ShoppingCart className="h-4 w-4" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
