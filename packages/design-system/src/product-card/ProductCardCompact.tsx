/**
 * ProductCardCompact — Card pequena para carousels horizontales.
 *
 * Uso recomendado:
 * - Carousels "Para vos"
 * - "Top hoy" scroll horizontal
 * - Cross-sell minimal en PDP
 *
 * Tamano: ~180px ancho desktop, 160px mobile. Altura minima 260px.
 * Info reducida: nombre, precio, discount chip. Sin rating, sin store.
 */
"use client";

import type { ReactNode } from "react";
import { CardTitle } from "../typography";
import { ProductPrice } from "../store";
import { cn } from "../utils";
import { ProductImage } from "./ProductImage";
import { resolveDiscount, resolveHref, isOutOfStock } from "./shared";
import type { ProductCardActions, ProductCardProduct } from "./types";

export interface ProductCardCompactProps
  extends Pick<ProductCardActions, "onAddToCart"> {
  product: ProductCardProduct;
  /**
   * Override del render de la imagen. Pasar `<Image fill ... />` de Next para
   * obtener optimizacion completa.
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  /**
   * Callback para "agregar rapido" — abre drawer con variaciones y cantidad.
   * Si se pasa, reemplaza al boton inline "Agregar" por uno circular "+".
   * Es el flujo recomendado en catalogos grandes (marketplace).
   */
  onQuickAdd?: (product: ProductCardProduct) => void;
  className?: string;
}

export function ProductCardCompact({
  product,
  renderImage,
  onAddToCart,
  onQuickAdd,
  className,
}: ProductCardCompactProps) {
  const discount = resolveDiscount(product);
  const outOfStock = isOutOfStock(product);
  const href = resolveHref(product);
  const alt = product.imageAlt ?? product.name;

  const Content = (
    <>
      <ProductImage
        src={product.image}
        alt={alt}
        aspect="aspect-square"
        hoverZoom
        rounded="rounded-lg"
        renderImage={renderImage}
      />
      <div className="flex flex-1 flex-col gap-1 px-2 pt-2">
        <CardTitle className="line-clamp-1 text-[length:var(--ts-sm)] font-semibold leading-[var(--lh-snug)]">
          {product.name}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <ProductPrice
            price={product.price}
            previousPrice={product.originalPrice}
            size="sm"
          />
          {discount != null && (
            <span className="inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
              -{discount}%
            </span>
          )}
        </div>
        {outOfStock && (
          <span className="mt-1 inline-flex w-max items-center rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-semibold uppercase text-[var(--text-tertiary)]">
            Agotado
          </span>
        )}
      </div>
    </>
  );

  const baseClass = cn(
    "group relative flex w-[160px] sm:w-[180px] shrink-0 flex-col overflow-hidden rounded-xl",
    "border border-[var(--rule-base)] bg-[var(--surface-raised)]",
    "min-h-[260px]",
    "transition-all duration-[var(--dur-base)] ease-[var(--ease-soft)]",
    "hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-sm)]",
    outOfStock && "opacity-75",
    className,
  );

  // Modo "quick add": boton circular "+" flotante sobre la imagen.
  // La card entera es un link al detalle. El click del "+" NO navega.
  if (onQuickAdd) {
    return (
      <div className={cn(baseClass, "relative")}>
        <a
          href={href}
          aria-label={product.name}
          className="flex flex-1 flex-col"
        >
          {Content}
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!outOfStock) onQuickAdd(product);
          }}
          disabled={outOfStock}
          aria-label={
            outOfStock
              ? `${product.name} agotado`
              : `Elegir opciones de ${product.name}`
          }
          className={cn(
            "absolute bottom-2 right-2 h-9 w-9 rounded-full flex items-center justify-center",
            "shadow-[var(--shadow-sm)] transition-all duration-[var(--dur-fast)]",
            outOfStock
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
              : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:scale-105 active:scale-95",
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  // Si hay onAddToCart (con click afterwards), render como button wrapper para
  // touch targets limpios. Default: link al detalle.
  if (onAddToCart) {
    return (
      <div className={baseClass}>
        <a
          href={href}
          aria-label={product.name}
          className="flex flex-1 flex-col"
        >
          {Content}
        </a>
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          disabled={outOfStock}
          aria-label={
            outOfStock
              ? `${product.name} agotado`
              : `Agregar ${product.name} al carrito`
          }
          className={cn(
            "mx-2 mb-2 mt-1 inline-flex items-center justify-center rounded-lg py-1.5 text-[length:var(--ts-xs)] font-semibold",
            "transition-opacity duration-[var(--dur-fast)]",
            outOfStock
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
              : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
          )}
        >
          {outOfStock ? "Agotado" : "Agregar"}
        </button>
      </div>
    );
  }

  return (
    <a
      href={href}
      aria-label={product.name}
      className={cn(baseClass, "block")}
    >
      {Content}
    </a>
  );
}
